import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id, TableNames } from "./_generated/dataModel";
import { requireAgent, requirePermission, agentLabel, assertOutranks } from "./rbac";
import { writeAudit } from "./lib/audit";

// Archives = tout ce qui a été supprimé (soft-delete via `deletedAt`) plus les
// dossiers citoyens archivés et les comptes agents désactivés. Restauration
// ouverte à `archive.restore` ; suppression DÉFINITIVE réservée au compte owner.

const KIND = v.union(
  v.literal("casier"),
  v.literal("citation"),
  v.literal("mandat"),
  v.literal("report"),
  v.literal("complaint"),
  v.literal("vehicle"),
  v.literal("weapon"),
  v.literal("saisie"),
  v.literal("discipline"),
  v.literal("deposition"),
  v.literal("note"),
  v.literal("relation"),
  v.literal("fleetVehicle"),
  v.literal("interview"),
  v.literal("amende"),
  v.literal("convocation"),
  v.literal("investigation"),
  v.literal("serviceWeapon"),
  v.literal("ceremony"),
  v.literal("protocol"),
  v.literal("resource"),
  v.literal("divisionAnnouncement"),
  v.literal("cadetNote"),
  v.literal("flEvaluation"),
  v.literal("ftoPatrol"),
  v.literal("salaryBonus"),
  v.literal("citizenLicense"),
  v.literal("citizen"),
  v.literal("agent"),
);
type Kind =
  | "casier" | "citation" | "mandat" | "report" | "complaint" | "vehicle" | "weapon"
  | "saisie" | "discipline" | "deposition" | "note" | "relation" | "fleetVehicle" | "interview"
  | "amende" | "convocation" | "investigation" | "serviceWeapon" | "ceremony" | "protocol" | "resource"
  | "divisionAnnouncement" | "cadetNote" | "flEvaluation" | "ftoPatrol" | "salaryBonus" | "citizenLicense"
  | "citizen" | "agent";

async function citizenName(ctx: QueryCtx, id: Id<"citizens"> | undefined | null) {
  if (!id) return "-";
  const c = await ctx.db.get(id);
  return c ? `${c.prenom} ${c.nom}` : "-";
}
async function agentName(ctx: QueryCtx, id: Id<"agents"> | undefined | null) {
  if (!id) return "-";
  const a = await ctx.db.get(id);
  return a ? `${a.prenomRP} ${a.nomRP}` : "-";
}

const REL_LABEL: Record<string, string> = { PARENT: "Parenté", SPOUSE: "Conjoint", SIBLING: "Fratrie" };

// Configuration des types soft-delete (champ `deletedAt`). Chaque entrée sait
// décrire une ligne archivée et lister ses enfants à purger.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any;
type SoftConfig = {
  table: TableNames;
  describe: (ctx: QueryCtx, d: Doc) => Promise<{ label: string; summary: string }>;
  children?: (ctx: MutationCtx, d: Doc) => Promise<void>;
};

const SOFT: Record<Exclude<Kind, "citizen" | "agent">, SoftConfig> = {
  casier: {
    table: "casierEntries",
    describe: async (ctx, e) => ({ label: await citizenName(ctx, e.citizenId), summary: `Entrée de casier - $${(e.totalFine ?? 0).toLocaleString("fr-FR")}` }),
    children: async (ctx, e) => { for (const c of await ctx.db.query("casierCharges").withIndex("by_entry", (q) => q.eq("entryId", e._id)).collect()) await ctx.db.delete(c._id); },
  },
  citation: {
    table: "citations",
    describe: async (ctx, c) => ({ label: await citizenName(ctx, c.citizenId), summary: `Contravention - $${(c.totalFine ?? 0).toLocaleString("fr-FR")}` }),
    children: async (ctx, c) => { for (const ch of await ctx.db.query("citationCharges").withIndex("by_citation", (q) => q.eq("citationId", c._id)).collect()) await ctx.db.delete(ch._id); },
  },
  mandat: {
    table: "mandats",
    describe: async (ctx, m) => ({ label: await citizenName(ctx, m.citizenId), summary: `Mandat - ${m.motif}` }),
  },
  report: {
    table: "reports",
    describe: async (_ctx, r) => ({ label: r.title, summary: "Rapport" }),
    children: async (ctx, r) => { for (const c of await ctx.db.query("reportContributors").withIndex("by_report", (q) => q.eq("reportId", r._id)).collect()) await ctx.db.delete(c._id); },
  },
  complaint: {
    table: "complaints",
    describe: async (ctx, c) => ({ label: await citizenName(ctx, c.plaignantId), summary: `Plainte - ${c.motif}` }),
  },
  vehicle: {
    table: "vehicles",
    describe: async (_ctx, v2) => ({ label: v2.plaque, summary: `Véhicule - ${v2.modele ?? "-"}` }),
    children: async (ctx, v2) => { for (const f of await ctx.db.query("vehicleFlags").withIndex("by_vehicle", (q) => q.eq("vehicleId", v2._id)).collect()) await ctx.db.delete(f._id); },
  },
  weapon: {
    table: "weapons",
    describe: async (_ctx, w) => ({ label: `${w.modele} · ${w.serial}`, summary: `Arme - ${w.typeName ?? "-"}` }),
  },
  saisie: {
    table: "saisies",
    describe: async (_ctx, s) => ({ label: s.objectType === "Autre" ? (s.otherLabel ?? "Autre") : s.objectType, summary: `Saisie x${s.quantity}` }),
  },
  discipline: {
    table: "disciplines",
    describe: async (ctx, d) => ({ label: await agentName(ctx, d.agentId), summary: `Sanction - ${d.motif}` }),
  },
  deposition: {
    table: "depositions",
    describe: async (ctx, d) => ({ label: await citizenName(ctx, d.citizenId), summary: `Déposition${d.title ? ` - ${d.title}` : ""}` }),
  },
  note: {
    table: "citizenNotes",
    describe: async (ctx, n) => ({ label: await citizenName(ctx, n.citizenId), summary: `Note - ${(n.text ?? "").slice(0, 60)}` }),
  },
  relation: {
    table: "citizenRelations",
    describe: async (ctx, r) => ({ label: `${await citizenName(ctx, r.fromId)} / ${await citizenName(ctx, r.toId)}`, summary: `Lien - ${REL_LABEL[r.kind] ?? r.kind}` }),
  },
  fleetVehicle: {
    table: "fleetVehicles",
    describe: async (_ctx, v2) => ({ label: `${v2.roofNumber} · ${v2.plaque}`, summary: `Véhicule LSPD - ${v2.modele}` }),
  },
  interview: {
    table: "interviews",
    describe: async (_ctx, i) => ({ label: `${i.prenom} ${i.nom}`, summary: `Entretien${i.score != null ? ` - ${i.score}%` : ""}` }),
  },
  amende: {
    table: "amendes",
    describe: async (ctx, a) => ({ label: await citizenName(ctx, a.citizenId), summary: `Amende - $${(a.montant ?? 0).toLocaleString("fr-FR")}` }),
  },
  convocation: {
    table: "convocations",
    describe: async (ctx, c) => ({ label: c.agentLabel ?? (c.agentId ? await agentName(ctx, c.agentId) : "-"), summary: `Convocation - ${c.motif}` }),
  },
  investigation: {
    table: "internalInvestigations",
    describe: async (_ctx, i) => ({ label: i.title, summary: `Enquête interne #${i.reference}` }),
    children: async (ctx, i) => {
      for (const t of await ctx.db.query("investigationTargets").withIndex("by_investigation", (q) => q.eq("investigationId", i._id)).collect()) await ctx.db.delete(t._id);
      for (const n of await ctx.db.query("investigationNotes").withIndex("by_investigation", (q) => q.eq("investigationId", i._id)).collect()) await ctx.db.delete(n._id);
    },
  },
  serviceWeapon: {
    table: "serviceWeapons",
    describe: async (ctx, w) => ({ label: await agentName(ctx, w.agentId), summary: `Arme de service - ${w.model} · ${w.serial}` }),
  },
  ceremony: {
    table: "ceremonies",
    describe: async (_ctx, c) => ({ label: c.title, summary: `Cérémonie - ${new Date(c.at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}` }),
    children: async (ctx, c) => {
      for (const r of await ctx.db.query("ceremonyReminders").withIndex("by_ceremony", (q) => q.eq("ceremonyId", c._id)).collect()) await ctx.db.delete(r._id);
      for (const p of await ctx.db.query("ceremonyPromotions").withIndex("by_ceremony", (q) => q.eq("ceremonyId", c._id)).collect()) await ctx.db.delete(p._id);
      for (const d of await ctx.db.query("ceremonyDismissals").withIndex("by_ceremony", (q) => q.eq("ceremonyId", c._id)).collect()) await ctx.db.delete(d._id);
    },
  },
  protocol: {
    table: "protocols",
    describe: async (_ctx, p) => ({ label: p.title, summary: `Protocole${p.category ? ` - ${p.category}` : ""}` }),
  },
  resource: {
    table: "resources",
    describe: async (_ctx, r) => ({ label: r.title, summary: "Ressource de formation" }),
  },
  divisionAnnouncement: {
    table: "divisionAnnouncements",
    describe: async (_ctx, a) => ({ label: a.title, summary: "Annonce de division" }),
  },
  cadetNote: {
    table: "cadetNotes",
    describe: async (ctx, n) => ({ label: await agentName(ctx, n.agentId), summary: `Note de cadet - ${(n.text ?? "").slice(0, 60)}` }),
  },
  flEvaluation: {
    table: "flEvaluations",
    describe: async (ctx, e) => ({ label: await agentName(ctx, e.agentId), summary: `Évaluation First Lincoln - ${e.verdict}` }),
    children: async (ctx, e) => {
      for (const s of await ctx.db.query("flScores").withIndex("by_evaluation", (q) => q.eq("evaluationId", e._id)).collect()) await ctx.db.delete(s._id);
    },
  },
  ftoPatrol: {
    table: "ftoPatrols",
    describe: async (ctx, p) => ({ label: await agentName(ctx, p.agentId), summary: "Rapport de patrouille FTO" }),
  },
  salaryBonus: {
    table: "salaryBonuses",
    describe: async (ctx, b) => ({ label: b.agentId ? await agentName(ctx, b.agentId) : "Prime globale", summary: `Prime - $${(b.amount ?? 0).toLocaleString("fr-FR")} · ${b.motif}` }),
  },
  citizenLicense: {
    table: "citizenLicenses",
    describe: async (ctx, l) => ({ label: await citizenName(ctx, l.citizenId), summary: "Licence citoyen" }),
  },
};

const SOFT_KINDS = Object.keys(SOFT) as Exclude<Kind, "citizen" | "agent">[];

async function deletedRows(ctx: QueryCtx, table: TableNames): Promise<Doc[]> {
  // Requête générique sur une table à `deletedAt` : typée librement (le type
  // exact dépend de la table, garanti par la config SOFT).
  // On lit UNIQUEMENT les lignes archivées via une borne d'index : `deletedAt`
  // est un timestamp (> 0) quand la ligne est supprimée, `undefined` sinon.
  // `undefined` triant sous toute valeur numérique dans un index Convex, la
  // borne `gt("deletedAt", 0)` saute d'emblée toutes les lignes VIVANTES au lieu
  // de scanner la table entière puis de filtrer (l'ancien `.filter(neq undefined)`
  // lisait TOUTE la table - c'était le poste d'I/O dominant d'`archive.*`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (ctx.db.query(table) as any).withIndex("by_deleted", (q: any) => q.gt("deletedAt", 0)).collect();
}

export const list = query({
  args: { kind: v.optional(KIND) },
  handler: async (ctx, { kind }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "archive.view");
    const out: { _id: string; kind: Kind; at: number; label: string; summary: string; deletedBy: { matricule: number | null; name: string } }[] = [];
    const want = (k: Kind) => !kind || kind === k;

    for (const k of SOFT_KINDS) {
      if (!want(k)) continue;
      const cfg = SOFT[k];
      for (const d of await deletedRows(ctx, cfg.table)) {
        const { label, summary } = await cfg.describe(ctx, d);
        out.push({ _id: d._id, kind: k, at: d.deletedAt as number, label, summary, deletedBy: await agentLabel(ctx, d.deletedBy) });
      }
    }

    if (want("citizen")) {
      // Pas d'index by_status sur `citizens` : on borne le scan aux 5000 premiers
      // (comme les compteurs de stats.overview) pour ne pas relire indéfiniment une
      // table qui grossit. Au-delà, les dossiers archivés surnuméraires ne seraient
      // pas listés (cas non atteint aux volumes actuels).
      const rows = (await ctx.db.query("citizens").take(5000)).filter((c) => c.status === "ARCHIVED" && !c.deletedAt);
      for (const c of rows) out.push({ _id: c._id, kind: "citizen", at: c._creationTime, label: `${c.prenom} ${c.nom}`, summary: "Dossier citoyen archivé", deletedBy: await agentLabel(ctx, c.createdBy) });
    }
    if (want("agent")) {
      // Lecture indexée par statut (au lieu de scanner toute la table agents).
      const disabled = [
        ...(await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "INACTIVE")).collect()),
        ...(await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "SUSPENDED")).collect()),
      ];
      for (const a of disabled) out.push({ _id: a._id, kind: "agent", at: a._creationTime, label: `${a.prenomRP} ${a.nomRP}`, summary: a.status === "SUSPENDED" ? "Compte suspendu" : "Compte désactivé (viré)", deletedBy: { matricule: a.matricule ?? null, name: `Matricule ${a.matricule ?? "-"}` } });
    }

    return out.sort((a, b) => b.at - a.at);
  },
});

export const counts = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "archive.view");
    const res: Record<string, number> = {};
    // deletedRows ne lit désormais QUE les lignes archivées (borne d'index), donc
    // `.length` ne coûte plus un scan de table complet par type.
    for (const k of SOFT_KINDS) res[k] = (await deletedRows(ctx, SOFT[k].table)).length;
    // Citoyens : pas d'index by_status -> scan borné à 5000 (voir archive.list).
    res.citizen = (await ctx.db.query("citizens").take(5000)).filter((c) => c.status === "ARCHIVED" && !c.deletedAt).length;
    // Agents désactivés/suspendus : lecture indexée par statut.
    res.agent =
      (await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "INACTIVE")).collect()).length +
      (await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "SUSPENDED")).collect()).length;
    return res;
  },
});

export const restore = mutation({
  args: { kind: KIND, id: v.string() },
  handler: async (ctx, { kind, id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "archive.restore");
    if (kind === "agent") {
      const aid = ctx.db.normalizeId("agents", id);
      const a = aid ? await ctx.db.get(aid) : null;
      if (!a) throw new ConvexError("Compte introuvable.");
      // Une mise à pied disciplinaire (SUSPENDED) NE se lève PAS depuis les
      // archives : elle passe par la Discipline (séparation des pouvoirs).
      if (a.status === "SUSPENDED") throw new ConvexError("Cet agent est sous mise à pied : levez-la depuis la Discipline.");
      // Réactiver un agent est une action hiérarchique : on ne réactive qu'un
      // subordonné (l'owner est intouchable, cf. assertOutranks).
      await assertOutranks(ctx, agent, a);
      await ctx.db.patch(a._id, { status: "ACTIVE" });
      await writeAudit(ctx, agent, { action: "agent.reactivate", resourceType: "agent", resourceId: id, resourceLabel: `${a.prenomRP} ${a.nomRP}` });
      return;
    }
    if (kind === "citizen") {
      const cid = ctx.db.normalizeId("citizens", id);
      const c = cid ? await ctx.db.get(cid) : null;
      if (!c) throw new ConvexError("Dossier introuvable.");
      await ctx.db.patch(c._id, { status: "ACTIVE" });
      await writeAudit(ctx, agent, { action: "citizen.restore", resourceType: "citizen", resourceId: id, resourceLabel: `${c.prenom} ${c.nom}` });
      return;
    }
    // On valide que l'id appartient bien à la table du `kind` (pas de
    // type-confusion / écriture sur une table arbitraire) et qu'il était supprimé.
    const nid = ctx.db.normalizeId(SOFT[kind].table, id);
    const doc = nid ? await ctx.db.get(nid) : null;
    if (!doc) throw new ConvexError("Élément introuvable.");
    if (!(doc as Doc).deletedAt) throw new ConvexError("Seul un élément archivé peut être restauré.");
    await ctx.db.patch(nid!, { deletedAt: undefined, deletedBy: undefined } as Partial<Doc>);
    await writeAudit(ctx, agent, { action: "archive.restore", resourceType: kind, resourceId: id, metadata: { kind } });
  },
});

export const purge = mutation({
  args: { kind: KIND, id: v.string() },
  handler: async (ctx, { kind, id }) => {
    const agent = await requireAgent(ctx);
    // Suppression définitive : réservée au compte propriétaire (owner).
    if (!agent.isOwner) throw new ConvexError("Seul le compte propriétaire peut supprimer définitivement un élément.");
    if (kind === "agent" || kind === "citizen") throw new ConvexError("Ce type ne peut pas être purgé depuis les archives.");
    const cfg = SOFT[kind];
    // On valide l'appartenance à la table du `kind` : sinon `cfg.children`
    // nettoierait la mauvaise table (enfants orphelins).
    const nid = ctx.db.normalizeId(cfg.table, id);
    const doc = nid ? await ctx.db.get(nid) : null;
    if (!doc || !(doc as Doc).deletedAt) throw new ConvexError("Seul un élément archivé peut être purgé.");
    if (cfg.children) await cfg.children(ctx, doc);
    await ctx.db.delete(nid!);
    await writeAudit(ctx, agent, { action: "archive.purge", resourceType: kind, resourceId: id, metadata: { kind } });
  },
});
