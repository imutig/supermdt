import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id, TableNames } from "./_generated/dataModel";
import { requireAgent, requirePermission, agentLabel } from "./rbac";
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
  v.literal("citizen"),
  v.literal("agent"),
);
type Kind =
  | "casier" | "citation" | "mandat" | "report" | "complaint" | "vehicle" | "weapon"
  | "saisie" | "discipline" | "deposition" | "note" | "relation" | "fleetVehicle" | "interview"
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
};

const SOFT_KINDS = Object.keys(SOFT) as Exclude<Kind, "citizen" | "agent">[];

async function deletedRows(ctx: QueryCtx, table: TableNames): Promise<Doc[]> {
  // Requête générique sur une table à `deletedAt` : typée librement (le type
  // exact dépend de la table, garanti par la config SOFT).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (ctx.db.query(table) as any).withIndex("by_deleted", (q: any) => q.neq("deletedAt", undefined)).collect();
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
      const rows = (await ctx.db.query("citizens").collect()).filter((c) => c.status === "ARCHIVED" && !c.deletedAt);
      for (const c of rows) out.push({ _id: c._id, kind: "citizen", at: c._creationTime, label: `${c.prenom} ${c.nom}`, summary: "Dossier citoyen archivé", deletedBy: await agentLabel(ctx, c.createdBy) });
    }
    if (want("agent")) {
      const disabled = (await ctx.db.query("agents").collect()).filter((a) => a.status === "INACTIVE" || a.status === "SUSPENDED");
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
    for (const k of SOFT_KINDS) res[k] = (await deletedRows(ctx, SOFT[k].table)).length;
    res.citizen = (await ctx.db.query("citizens").collect()).filter((c) => c.status === "ARCHIVED" && !c.deletedAt).length;
    res.agent = (await ctx.db.query("agents").collect()).filter((a) => a.status === "INACTIVE" || a.status === "SUSPENDED").length;
    return res;
  },
});

export const restore = mutation({
  args: { kind: KIND, id: v.string() },
  handler: async (ctx, { kind, id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "archive.restore");
    if (kind === "agent") {
      const a = await ctx.db.get(id as Id<"agents">);
      if (!a) throw new Error("Compte introuvable.");
      await ctx.db.patch(a._id, { status: "ACTIVE" });
      await writeAudit(ctx, agent, { action: "agent.reactivate", resourceType: "agent", resourceId: id, resourceLabel: `${a.prenomRP} ${a.nomRP}` });
      return;
    }
    if (kind === "citizen") {
      const c = await ctx.db.get(id as Id<"citizens">);
      if (!c) throw new Error("Dossier introuvable.");
      await ctx.db.patch(c._id, { status: "ACTIVE" });
      await writeAudit(ctx, agent, { action: "citizen.restore", resourceType: "citizen", resourceId: id, resourceLabel: `${c.prenom} ${c.nom}` });
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await ctx.db.get(id as Id<any>);
    if (!doc) throw new Error("Élément introuvable.");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.db.patch(doc._id as any, { deletedAt: undefined, deletedBy: undefined });
    await writeAudit(ctx, agent, { action: "archive.restore", resourceType: kind, resourceId: id, metadata: { kind } });
  },
});

export const purge = mutation({
  args: { kind: KIND, id: v.string() },
  handler: async (ctx, { kind, id }) => {
    const agent = await requireAgent(ctx);
    // Suppression définitive : réservée au compte propriétaire (owner).
    if (!agent.isOwner) throw new Error("Seul le compte propriétaire peut supprimer définitivement un élément.");
    if (kind === "agent" || kind === "citizen") throw new Error("Ce type ne peut pas être purgé depuis les archives.");
    const cfg = SOFT[kind];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await ctx.db.get(id as Id<any>);
    if (!doc || !doc.deletedAt) throw new Error("Seul un élément archivé peut être purgé.");
    if (cfg.children) await cfg.children(ctx, doc);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.db.delete(doc._id as any);
    await writeAudit(ctx, agent, { action: "archive.purge", resourceType: kind, resourceId: id, metadata: { kind } });
  },
});
