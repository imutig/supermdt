import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
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

// Texte indexé pour la recherche : objet, mis en cause, type, agent, lieu, notes.
function saisieSearchText(s: {
  objet?: string; objectType?: string; otherLabel?: string; misEnCause?: string;
  type?: string; agentName?: string; matricule?: number; lieu?: string; notes?: string; statut?: string;
}): string {
  return [objetLabel(s), s.misEnCause, s.type, s.agentName, s.matricule != null ? String(s.matricule) : "", s.lieu, s.notes, s.statut]
    .filter(Boolean).join(" ");
}

// Forme d'une ligne de saisie renvoyée à l'UI (mutualisée liste/pagination).
function shapeSaisie(s: any, agentId: string) {
  return {
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
    mine: !!s.agentId && s.agentId === agentId,
  };
}

// Pagination serveur (curseur Convex) : borne la lecture au lieu de tout charger.
// Avec `q`, recherche plein-texte (index de recherche) ; sinon liste antéchrono.
export const page = query({
  args: { paginationOpts: paginationOptsValidator, q: v.optional(v.string()) },
  handler: async (ctx, { paginationOpts, q }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "saisies.view");
    const query = (q ?? "").trim();
    const res = query
      ? await ctx.db.query("saisies").withSearchIndex("search", (s) => s.search("searchText", query)).paginate(paginationOpts)
      : await ctx.db.query("saisies").withIndex("by_at").order("desc").paginate(paginationOpts);
    return { ...res, page: res.page.filter((s) => !s.deletedAt).map((s) => shapeSaisie(s, agent._id)) };
  },
});

// Alias de compatibilité (déprécié) : un onglet ouvert AVANT le passage à la
// pagination appelle encore `saisies:list`. On renvoie une première page bornée
// pour éviter un crash « Could not find public function » ; les onglets à jour
// utilisent `page`. À retirer une fois tous les clients rafraîchis.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "saisies.view");
    const rows = (await ctx.db.query("saisies").withIndex("by_at").order("desc").take(200)).filter((s) => !s.deletedAt);
    return rows.map((s) => shapeSaisie(s, agent._id));
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
    const agentName = `${agent.prenomRP} ${agent.nomRP}`;
    const fields = {
      type: a.type,
      objet: a.objet.trim(),
      quantite: a.quantite?.trim() || undefined,
      montant: a.montant,
      statut: a.statut,
      misEnCause: a.misEnCause?.trim() || undefined,
      date: a.date?.trim() || undefined,
      lieu: a.lieu?.trim() || undefined,
      notes: a.notes?.trim() || undefined,
    };
    const id = await ctx.db.insert("saisies", {
      at: Date.now(),
      agentId: agent._id,
      matricule: agent.matricule,
      agentName,
      ...fields,
      searchText: saisieSearchText({ ...fields, agentName, matricule: agent.matricule }),
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
    const fields = {
      type: a.type,
      objet: a.objet.trim(),
      quantite: a.quantite?.trim() || undefined,
      montant: a.montant,
      statut: a.statut,
      misEnCause: a.misEnCause?.trim() || undefined,
      date: a.date?.trim() || undefined,
      lieu: a.lieu?.trim() || undefined,
      notes: a.notes?.trim() || undefined,
    };
    await ctx.db.patch(id, {
      ...fields,
      searchText: saisieSearchText({ ...fields, agentName: s.agentName, matricule: s.matricule }),
    });
    await writeAudit(ctx, agent, { action: "saisie.update", resourceType: "saisie", resourceId: id, resourceLabel: a.objet.trim() });
    await notify(ctx, "saisie.update", {
      title: "Saisie modifiée",
      description: `**${a.objet.trim()}**${a.quantite?.trim() ? ` · ${a.quantite.trim()}` : ""}`,
      color: NOTIFY_COLOR.muted,
      fields: [
        { name: "Type", value: a.type, inline: true },
        { name: "Statut", value: a.statut, inline: true },
      ],
      url: await deepLink(ctx, "/saisies"),
      footer: `Modifiée par ${agent.prenomRP} ${agent.nomRP}`,
    });
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
    await notify(ctx, "saisie.delete", {
      title: "Saisie supprimée",
      description: `**${objetLabel(s)}**`,
      color: NOTIFY_COLOR.danger,
      url: await deepLink(ctx, "/saisies"),
      footer: `Supprimée par ${agent.prenomRP} ${agent.nomRP}`,
    });
  },
});
