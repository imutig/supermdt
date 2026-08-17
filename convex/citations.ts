import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAgent, requirePermission, requireOwnOrPermission, agentLabel } from "./rbac";
import { writeAudit } from "./lib/audit";
import { touchStats } from "./stats";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";
import { computeCharge } from "./lib/calc";
import { chargeDisplayName } from "./lib/charges";
import { parisParts } from "./lib/paris";

// Date / heure d'infraction (heure de Paris) au format Nexus (JJ/MM/AAAA, HH:MM).
export function parisInfractionStamp(): { date: string; heure: string } {
  const p = parisParts(Date.now());
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${pad(p.d)}/${pad(p.mo)}/${p.y}`, heure: `${pad(p.h)}:00` };
}

async function currentDefcon(ctx: QueryCtx) {
  const levels = await ctx.db.query("defconLevels").withIndex("by_position").collect();
  if (levels.length === 0) return null;
  const def = levels.find((l) => l.isDefault) ?? levels[0];
  const last = await ctx.db.query("defconChanges").withIndex("by_at").order("desc").first();
  if (!last) return def;
  if (last.until != null && last.until < Date.now()) return def;
  return (await ctx.db.get(last.levelId)) ?? def;
}

type CitationChargeInput = {
  penalChargeId: import("./_generated/dataModel").Id<"penalCharges">;
  param?: number;
  isRecidive: boolean;
  attemptType?: "TENTATIVE" | "COMPLICITE";
};

// Construit les snapshots + total d'une contravention. Partagé par create et
// updateCharges. Refuse toute infraction non "Contravention" (§4). Calcul
// INCHANGÉ (tentative / complicité = label seul).
async function buildCitationCharges(
  ctx: QueryCtx,
  defcon: { name: string; fineMultiplier: number; sensitiveFineMultiplier: number },
  charges: CitationChargeInput[],
) {
  let totalFine = 0;
  const snaps = [];
  for (const c of charges) {
    const pc = await ctx.db.get(c.penalChargeId);
    if (!pc) continue;
    const cat = await ctx.db.get(pc.categoryId);
    const sev = pc.severityId ? await ctx.db.get(pc.severityId) : null;
    // Une contravention ne peut retenir que des infractions de sévérité "Contravention" (§4).
    if (sev?.name !== "Contravention") {
      throw new ConvexError(`« ${pc.name} » n'est pas une contravention.`);
    }
    const sanctionNames: string[] = [];
    for (const sid of pc.sanctionIds) {
      const s = await ctx.db.get(sid);
      if (s) sanctionNames.push(s.name);
    }
    const res = computeCharge({
      fine: pc.fine,
      sensitive: cat?.sensitive ?? false,
      defcon,
      param: c.param,
      isRecidive: c.isRecidive,
    });
    totalFine += res.fine;
    snaps.push({
      penalChargeId: pc._id,
      snapshot: {
        name: pc.name,
        category: cat?.name ?? "",
        severity: sev?.name ?? "",
        sensitive: cat?.sensitive ?? false,
        fineRaw: pc.fine.raw,
        dojRequest: pc.dojRequest,
        sanctions: sanctionNames,
      },
      formulaParam: c.param,
      isRecidive: c.isRecidive,
      attemptType: c.attemptType,
      computedFine: res.fine,
      onDecision: res.onDecision,
    });
  }
  return { snaps, totalFine };
}

// Officier verbalisateur avec état de rattachement. Contravention importée du
// Nexus dont l'agent n'a pas de compte : officerId retombe sur l'owner -> on
// affiche le nom brut (officerName), non relié.
async function citationOfficer(
  ctx: QueryCtx,
  c: { officerId: import("./_generated/dataModel").Id<"agents">; officerName?: string },
): Promise<{ matricule: number | null; name: string; linked: boolean }> {
  if (c.officerName) {
    const a = await ctx.db.get(c.officerId);
    if (a?.isOwner) return { matricule: null, name: c.officerName, linked: false };
  }
  const l = await agentLabel(ctx, c.officerId);
  return { ...l, linked: true };
}

export const byCitizen = query({
  args: { citizenId: v.id("citizens") },
  handler: async (ctx, { citizenId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "contraventions.view");
    const rows = await ctx.db
      .query("citations")
      .withIndex("by_citizen", (q) => q.eq("citizenId", citizenId))
      .order("desc")
      .collect();
    const out = [];
    for (const c of rows) {
      if (c.deletedAt) continue;
      const charges = await ctx.db
        .query("citationCharges")
        .withIndex("by_citation", (q) => q.eq("citationId", c._id))
        .collect();
      out.push({
        _id: c._id,
        at: c.at,
        status: c.status,
        totalFine: c.totalFine,
        officer: await citationOfficer(ctx, c),
        motif: charges.map((x) => chargeDisplayName(x.snapshot.name, x.attemptType)).join(", ") || "-",
      });
    }
    return out;
  },
});

// Détail complet d'une contravention (modal, §6).
export const getEntry = query({
  args: { citationId: v.id("citations") },
  handler: async (ctx, { citationId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "contraventions.view");
    const c = await ctx.db.get(citationId);
    if (!c) return null;
    const citizen = await ctx.db.get(c.citizenId);
    const charges = await ctx.db
      .query("citationCharges")
      .withIndex("by_citation", (q) => q.eq("citationId", c._id))
      .collect();
    return {
      _id: c._id,
      at: c.at,
      status: c.status,
      annulReason: c.annulReason,
      citizenId: c.citizenId,
      citizenName: citizen ? `${citizen.prenom} ${citizen.nom}` : "-",
      mine: c.createdBy === agent._id,
      officer: await citationOfficer(ctx, c),
      defcon: c.defconSnapshot,
      totalFine: c.totalFine,
      montantMajore: c.montantMajore ?? null,
      articleLoi: c.articleLoi ?? null,
      referenceJuridique: c.referenceJuridique ?? null,
      notes: c.notes,
      charges: charges.map((ch) => ({
        name: ch.snapshot.name,
        attemptType: ch.attemptType ?? null,
        displayName: chargeDisplayName(ch.snapshot.name, ch.attemptType),
        category: ch.snapshot.category,
        severity: ch.snapshot.severity,
        sensitive: ch.snapshot.sensitive,
        fineRaw: ch.snapshot.fineRaw,
        computedFine: ch.computedFine,
        isRecidive: ch.isRecidive,
        onDecision: ch.onDecision,
        formulaParam: ch.formulaParam,
        penalChargeId: ch.penalChargeId ?? null,
      })),
    };
  },
});

// Suppression douce d'une contravention (§18 : Archive, restaurable).
export const remove = mutation({
  args: { citationId: v.id("citations") },
  handler: async (ctx, { citationId }) => {
    const agent = await requireAgent(ctx);
    const c = await ctx.db.get(citationId);
    if (!c) throw new ConvexError("Contravention introuvable.");
    if (c.deletedAt) return;
    // L'agent qui a établi l'acte peut l'annuler ; au-delà, la permission.
    await requireOwnOrPermission(ctx, agent, c.createdBy, "contraventions.annul");
    const citizen = await ctx.db.get(c.citizenId);
    await ctx.db.patch(citationId, { deletedAt: Date.now(), deletedBy: agent._id });
    await writeAudit(ctx, agent, {
      action: "citation.delete",
      resourceType: "citation",
      resourceId: citationId,
      resourceLabel: citizen ? `${citizen.prenom} ${citizen.nom}` : "",
      metadata: { soft: true, totalFine: c.totalFine },
    });
    await touchStats(ctx);
    await notify(ctx, "contravention.annul", {
      title: "Contravention annulée",
      description: citizen ? `**${citizen.prenom} ${citizen.nom}**` : undefined,
      color: NOTIFY_COLOR.muted,
      fields: [{ name: "Montant", value: `$${c.totalFine.toLocaleString("fr-FR")}`, inline: true }],
      url: await deepLink(ctx, `/citoyen/${c.citizenId}`),
      footer: `Annulée par ${agent.prenomRP} ${agent.nomRP}`,
    });
  },
});

export const recent = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "contraventions.view");
    // Tri par date d'infraction (by_at) : les contraventions importées du Nexus
    // sont toutes créées au même instant, _creationTime ne les classe pas.
    const rows = (await ctx.db.query("citations").withIndex("by_at").order("desc").take(120)).filter((c) => !c.deletedAt).slice(0, 80);
    const out = [];
    for (const c of rows) {
      const citizen = await ctx.db.get(c.citizenId);
      const charges = await ctx.db
        .query("citationCharges")
        .withIndex("by_citation", (q) => q.eq("citationId", c._id))
        .collect();
      out.push({
        _id: c._id,
        citizenId: c.citizenId,
        citizenName: citizen ? `${citizen.prenom} ${citizen.nom}` : "-",
        motif: charges.map((x) => chargeDisplayName(x.snapshot.name, x.attemptType)).join(", ") || "-",
        totalFine: c.totalFine,
        officer: await citationOfficer(ctx, c),
        status: c.status,
        at: c.at,
      });
    }
    return out;
  },
});

export const create = mutation({
  args: {
    citizenId: v.id("citizens"),
    vehicleId: v.optional(v.id("vehicles")),
    charges: v.array(
      v.object({
        penalChargeId: v.id("penalCharges"),
        param: v.optional(v.number()),
        isRecidive: v.boolean(),
        // Tentative / complicité (label seul ; n'affecte ni calcul ni Nexus).
        attemptType: v.optional(v.union(v.literal("TENTATIVE"), v.literal("COMPLICITE"))),
      }),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "contraventions.create");
    const defcon = await currentDefcon(ctx);
    if (!defcon) throw new ConvexError("DEFCON non configuré.");

    const { snaps, totalFine } = await buildCitationCharges(ctx, defcon, args.charges);

    const id = await ctx.db.insert("citations", {
      citizenId: args.citizenId,
      vehicleId: args.vehicleId,
      at: Date.now(),
      officerId: agent._id,
      defconSnapshot: {
        name: defcon.name,
        fineMultiplier: defcon.fineMultiplier,
        sensitiveFineMultiplier: defcon.sensitiveFineMultiplier,
      },
      totalFine,
      notes: args.notes,
      status: "EMISE",
      createdBy: agent._id,
    });
    for (const s of snaps) await ctx.db.insert("citationCharges", { citationId: id, ...s });

    const citizen = await ctx.db.get(args.citizenId);
    await writeAudit(ctx, agent, {
      action: "citation.create",
      resourceType: "citation",
      resourceId: id,
      resourceLabel: citizen ? `${citizen.prenom} ${citizen.nom}` : "",
      metadata: { totalFine, charges: snaps.length },
    });

    // Amende (entité pénalité financière) auto-créée depuis la contravention,
    // pré-remplie et poussée vers le Nexus (write-through asynchrone). Les agents
    // n'en modifieront ensuite que le statut. Pas d'amende si aucun montant dû.
    if (totalFine > 0) {
      const { date, heure } = parisInfractionStamp();
      const amendeId = await ctx.db.insert("amendes", {
        citizenId: args.citizenId,
        sourceType: "CONTRAVENTION",
        citationId: id,
        typeAmende: "Amende de police",
        statut: "Notifiée",
        objet: snaps.map((s) => s.snapshot.name).join(" + ") || undefined,
        montant: totalFine,
        dateInfraction: date,
        heureInfraction: heure,
        autoriteCompetente: "LSPD - Los Santos Police Department",
        verbalisateurNom: `${agent.prenomRP} ${agent.nomRP}`,
        matriculeAgent: agent.matricule ?? undefined,
        description: args.notes || undefined,
        at: Date.now(),
        createdBy: agent._id,
      });
      await ctx.scheduler.runAfter(0, internal.nexusSync.pushAmende, { amendeId, agentId: agent._id });
      await notify(ctx, "amende.create", {
        title: "Amende émise",
        description: citizen ? `**${citizen.prenom} ${citizen.nom}**` : undefined,
        color: NOTIFY_COLOR.warning,
        fields: [
          { name: "Montant", value: `$${totalFine.toLocaleString("fr-FR")}`, inline: true },
          { name: "Statut", value: "Notifiée", inline: true },
        ],
        url: await deepLink(ctx, `/citoyen/${args.citizenId}`),
        footer: `Émise par ${agent.prenomRP} ${agent.nomRP}`,
      });
    }

    await touchStats(ctx);
    return id;
  },
});

// Édition des chefs d'une contravention non annulée (item 2). Recalcule le total
// (calcul INCHANGÉ), remplace les snapshots, met à jour l'amende liée (montant +
// objet) localement + répercussion Nexus. Pas de notion de « clôture » ici.
export const updateCharges = mutation({
  args: {
    citationId: v.id("citations"),
    charges: v.array(
      v.object({
        penalChargeId: v.id("penalCharges"),
        param: v.optional(v.number()),
        isRecidive: v.boolean(),
        attemptType: v.optional(v.union(v.literal("TENTATIVE"), v.literal("COMPLICITE"))),
      }),
    ),
  },
  handler: async (ctx, { citationId, charges }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "contraventions.create");
    const c = await ctx.db.get(citationId);
    if (!c) throw new ConvexError("Contravention introuvable.");
    if (c.deletedAt) throw new ConvexError("Contravention archivée.");
    const defcon = await currentDefcon(ctx);
    if (!defcon) throw new ConvexError("DEFCON non configuré.");

    const { snaps, totalFine } = await buildCitationCharges(ctx, defcon, charges);

    const old = await ctx.db.query("citationCharges").withIndex("by_citation", (q) => q.eq("citationId", citationId)).collect();
    for (const ch of old) await ctx.db.delete(ch._id);
    for (const s of snaps) await ctx.db.insert("citationCharges", { citationId, ...s });

    await ctx.db.patch(citationId, { totalFine });

    const citizen = await ctx.db.get(c.citizenId);
    const objet = snaps.map((s) => s.snapshot.name).join(" + ") || undefined; // noms bruts (jamais préfixés, va vers Nexus)

    const amende = (await ctx.db.query("amendes").withIndex("by_citation", (q) => q.eq("citationId", citationId)).collect())
      .find((a) => !a.deletedAt);
    if (amende) {
      await ctx.db.patch(amende._id, { montant: totalFine, objet });
      if (amende.nexusId) {
        await ctx.scheduler.runAfter(0, internal.nexusSync.patchAmende, { amendeId: amende._id, agentId: agent._id });
      }
    } else if (totalFine > 0) {
      const { date, heure } = parisInfractionStamp();
      const amendeId = await ctx.db.insert("amendes", {
        citizenId: c.citizenId,
        sourceType: "CONTRAVENTION",
        citationId,
        typeAmende: "Amende de police",
        statut: "Notifiée",
        objet,
        montant: totalFine,
        dateInfraction: date,
        heureInfraction: heure,
        autoriteCompetente: "LSPD - Los Santos Police Department",
        verbalisateurNom: `${agent.prenomRP} ${agent.nomRP}`,
        matriculeAgent: agent.matricule ?? undefined,
        description: c.notes || undefined,
        at: Date.now(),
        createdBy: agent._id,
      });
      await ctx.scheduler.runAfter(0, internal.nexusSync.pushAmende, { amendeId, agentId: agent._id });
    }

    await writeAudit(ctx, agent, {
      action: "citation.charges_update",
      resourceType: "citation",
      resourceId: citationId,
      resourceLabel: citizen ? `${citizen.prenom} ${citizen.nom}` : "",
      metadata: { totalFine, charges: snaps.length },
    });
    await touchStats(ctx);
    return citationId;
  },
});
