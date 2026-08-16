import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireAgent, requirePermission, can } from "./rbac";
import { writeAudit } from "./lib/audit";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";

// Section Saisies (item 10) — synchronisée write-through avec le NexusMDT
// (/api/saisies). Les écritures passent par les actions nexusSync.createSaisie /
// updateSaisie / deleteRecord ; les mutations ci-dessous font l'application locale.

// Type d'objet saisi (liste fixe imposée par Nexus).
const SAISIE_TYPES = ["Véhicule", "Arme", "Argent", "Stupéfiants", "Objet"] as const;

// Libellé lisible de l'objet, tolérant aux anciennes lignes (objectType/otherLabel).
function objetLabel(s: {
  objet?: string;
  objectType?: string;
  otherLabel?: string;
}): string {
  if (s.objet) return s.objet;
  if (s.objectType === "Autre") return `${s.otherLabel ?? ""}`.trim();
  return s.objectType ?? "";
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "saisies.view");
    const rows = (await ctx.db.query("saisies").withIndex("by_at").order("desc").collect()).filter((s) => !s.deletedAt);
    return rows.map((s) => ({
      _id: s._id,
      at: s.at,
      agentId: s.agentId ?? null,
      matricule: s.matricule ?? null,
      agentName: s.agentName ?? "",
      type: s.type ?? null,
      objet: objetLabel(s),
      // Anciennes lignes : quantité numérique → « xN » ; nouvelles : texte libre.
      quantite: s.quantite ?? (s.quantity != null ? `x${s.quantity}` : null),
      montant: s.montant ?? null,
      statut: s.statut ?? null,
      misEnCause: s.misEnCause ?? null,
      date: s.date ?? null,
      lieu: s.lieu ?? null,
      notes: s.notes ?? null,
      // L'agent qui a encodé la saisie peut la modifier / retirer.
      mine: !!s.agentId && s.agentId === agent._id,
    }));
  },
});

// Types d'objets configurables (obsolète — Nexus impose une liste fixe) + "Autre"
// immuable. Conservé inerte pour compat ; la liste fixe Nexus est renvoyée.
export const objectTypes = query({
  args: {},
  handler: async (ctx) => {
    await requireAgent(ctx);
    return [...SAISIE_TYPES];
  },
});

const CREATE_ARGS = {
  type: v.string(),
  objet: v.string(),
  quantite: v.optional(v.string()),
  montant: v.optional(v.number()),
  statut: v.string(),
  misEnCause: v.optional(v.string()),
  date: v.optional(v.string()),
  lieu: v.optional(v.string()),
  notes: v.optional(v.string()),
};

export const create = mutation({
  args: CREATE_ARGS,
  handler: async (ctx, a) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "saisies.create");
    if (!a.objet.trim()) throw new ConvexError("L'objet saisi est requis.");
    const id = await ctx.db.insert("saisies", {
      at: Date.now(),
      agentId: agent._id,
      matricule: agent.matricule,
      agentName: `${agent.prenomRP} ${agent.nomRP}`,
      type: a.type,
      objet: a.objet.trim(),
      quantite: a.quantite?.trim() || undefined,
      montant: a.montant,
      statut: a.statut,
      misEnCause: a.misEnCause?.trim() || undefined,
      date: a.date?.trim() || undefined,
      lieu: a.lieu?.trim() || undefined,
      notes: a.notes?.trim() || undefined,
    });
    await writeAudit(ctx, agent, { action: "saisie.create", resourceType: "saisie", resourceId: id, resourceLabel: a.objet.trim() });
    await notify(ctx, "saisie.create", {
      title: "Saisie enregistrée",
      description: `**${a.objet.trim()}**${a.quantite?.trim() ? ` · ${a.quantite.trim()}` : ""}`,
      color: NOTIFY_COLOR.warning,
      fields: [
        { name: "Type", value: a.type },
        { name: "Statut", value: a.statut },
        ...(a.misEnCause?.trim() ? [{ name: "Mis en cause", value: a.misEnCause.trim() }] : []),
      ],
      url: await deepLink(ctx, "/saisies"),
      footer: `Saisi par ${agent.prenomRP} ${agent.nomRP}`,
    });
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("saisies"), ...CREATE_ARGS },
  handler: async (ctx, { id, ...a }) => {
    const agent = await requireAgent(ctx);
    const s = await ctx.db.get(id);
    if (!s || s.deletedAt) throw new ConvexError("Saisie introuvable.");
    // Le créateur modifie la sienne ; sinon il faut la permission de création.
    if (s.agentId !== agent._id && !(await can(ctx, agent, "saisies.create")))
      throw new ConvexError("Modification non autorisée.");
    if (!a.objet.trim()) throw new ConvexError("L'objet saisi est requis.");
    await ctx.db.patch(id, {
      type: a.type,
      objet: a.objet.trim(),
      quantite: a.quantite?.trim() || undefined,
      montant: a.montant,
      statut: a.statut,
      misEnCause: a.misEnCause?.trim() || undefined,
      date: a.date?.trim() || undefined,
      lieu: a.lieu?.trim() || undefined,
      notes: a.notes?.trim() || undefined,
    });
    await writeAudit(ctx, agent, { action: "saisie.update", resourceType: "saisie", resourceId: id, resourceLabel: a.objet.trim() });
  },
});

export const remove = mutation({
  args: { id: v.id("saisies") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    const s = await ctx.db.get(id);
    if (!s || s.deletedAt) return;
    // Le créateur peut supprimer sa propre saisie ; sinon il faut la permission dédiée.
    if (s.agentId !== agent._id && !(await can(ctx, agent, "saisies.delete")))
      throw new ConvexError("Suppression non autorisée.");
    await ctx.db.patch(id, { deletedAt: Date.now(), deletedBy: agent._id });
    await writeAudit(ctx, agent, { action: "saisie.delete", resourceType: "saisie", resourceId: id });
  },
});
