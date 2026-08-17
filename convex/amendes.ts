import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";

// ============================================================================
// AMENDES — entité « pénalité financière » (miroir de l'objet NexusMDT
// /api/amendes). Une amende est AUTO-CRÉÉE (jamais à la main) lors de la
// création d'une entrée de casier ou d'une contravention : pré-remplie depuis
// la source, liée à celle-ci, poussée vers le Nexus (write-through), et les
// agents ne peuvent en changer QUE le statut.
// ============================================================================

// Statuts autorisés (alignés sur les libellés Nexus observés).
export const STATUTS = ["Notifiée", "Payée", "En attente", "Contestée", "Annulée"];

export const statuts = query({
  args: {},
  handler: async () => STATUTS,
});

// Amendes (non archivées) d'un citoyen, avec le lien vers la source (casier /
// contravention). Triées par date d'infraction décroissante.
export const byCitizen = query({
  args: { citizenId: v.id("citizens") },
  handler: async (ctx, { citizenId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "citoyens.view");
    const rows = await ctx.db
      .query("amendes")
      .withIndex("by_citizen", (q) => q.eq("citizenId", citizenId))
      .collect();
    const out = rows
      .filter((a) => !a.deletedAt)
      .map((a) => ({
        _id: a._id,
        numero: a.numero ?? null,
        typeAmende: a.typeAmende ?? null,
        objet: a.objet ?? null,
        montant: a.montant,
        statut: a.statut,
        at: a.at,
        source: a.casierEntryId
          ? { kind: "CASIER" as const, id: a.casierEntryId as string }
          : a.citationId
            ? { kind: "CONTRAVENTION" as const, id: a.citationId as string }
            : a.sourceType === "IMPORT"
              ? { kind: "IMPORT" as const, id: null }
              : null,
      }));
    out.sort((x, y) => y.at - x.at);
    return out;
  },
});

// Seul le statut est modifiable par un agent (finances.manage). Si l'amende est
// liée au Nexus, on répercute le nouveau statut en asynchrone (write-through).
export const setStatus = mutation({
  args: { amendeId: v.id("amendes"), statut: v.string() },
  handler: async (ctx, { amendeId, statut }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "finances.manage");
    if (!STATUTS.includes(statut)) throw new ConvexError("Statut d'amende invalide.");
    const a = await ctx.db.get(amendeId);
    if (!a) throw new ConvexError("Amende introuvable.");
    if (a.deletedAt) throw new ConvexError("Amende archivée.");
    if (a.statut === statut) return;
    await ctx.db.patch(amendeId, { statut });
    if (a.nexusId) {
      await ctx.scheduler.runAfter(0, internal.nexusSync.patchAmendeStatus, { amendeId, agentId: agent._id });
    }
    // Suivi Discord : le statut d'amende apparaît dans l'embed du dossier/de la
    // contravention lié — on le marque « sale » pour que le bot ré-édite l'embed.
    if (a.casierEntryId) {
      const ce = await ctx.db.get(a.casierEntryId);
      if (ce && !ce.deletedAt) {
        await ctx.db.patch(a.casierEntryId, { trackingDirty: true });
        await ctx.scheduler.runAfter(0, internal.push.notify, {});
      }
    } else if (a.citationId) {
      const ci = await ctx.db.get(a.citationId);
      if (ci && !ci.deletedAt) {
        await ctx.db.patch(a.citationId, { trackingDirty: true });
        await ctx.scheduler.runAfter(0, internal.push.notify, {});
      }
    }
    const citizen = await ctx.db.get(a.citizenId);
    await writeAudit(ctx, agent, {
      action: "amende.status",
      resourceType: "amende",
      resourceId: amendeId,
      resourceLabel: citizen ? `${citizen.prenom} ${citizen.nom}` : "",
      metadata: { statut, montant: a.montant },
    });
    await notify(ctx, "amende.status", {
      title: "Statut d'amende modifié",
      description: citizen ? `**${citizen.prenom} ${citizen.nom}**` : undefined,
      color: NOTIFY_COLOR.info,
      fields: [
        { name: "Montant", value: `$${a.montant.toLocaleString("fr-FR")}`, inline: true },
        { name: "Statut", value: statut, inline: true },
      ],
      url: await deepLink(ctx, `/citoyen/${a.citizenId}`),
      footer: `Modifié par ${agent.prenomRP} ${agent.nomRP}`,
    });
  },
});

// ---------------------- internes (pour les actions write-through) ------------
export const _get = internalQuery({
  args: { amendeId: v.id("amendes") },
  handler: async (ctx, { amendeId }) => await ctx.db.get(amendeId),
});

export const _setNexus = internalMutation({
  args: { amendeId: v.id("amendes"), nexusId: v.string(), numero: v.optional(v.string()) },
  handler: async (ctx, { amendeId, nexusId, numero }) => {
    const patch: Record<string, unknown> = { nexusId, nexusError: undefined };
    if (numero != null) patch.numero = numero;
    await ctx.db.patch(amendeId, patch);
  },
});

export const _setNexusError = internalMutation({
  args: { amendeId: v.id("amendes"), error: v.string() },
  handler: async (ctx, { amendeId, error }) => {
    await ctx.db.patch(amendeId, { nexusError: error });
  },
});
