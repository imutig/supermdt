import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireDivView, requireDivPerm, requireCaseRead, requireCaseWrite, agentName } from "./lib/detectiveAccess";
import { hasPerm } from "./lib/divisionAccess";
import { writeAudit } from "./lib/audit";

// Gangs / organisations (GND) : fiche, organigramme configurable, membres,
// rivalités / alliances, territoires + QG (carte globale agrégée). Plus la
// section stupéfiants (points de vente, labos, affiliés ou non).

const ORG_TYPE = v.union(
  v.literal("GANG"), v.literal("MC"), v.literal("ORGANISATION"), v.literal("PF"), v.literal("AUTRE"),
);
const SUBDIV = v.union(v.literal("GND"), v.literal("HRD"));
const REL_KIND = v.union(v.literal("RIVAL"), v.literal("ALLY"));

// ============ GANGS / ORGANISATIONS ============

export const listGangs = query({
  args: { divisionId: v.id("divisions"), q: v.optional(v.string()), orgType: v.optional(ORG_TYPE) },
  handler: async (ctx, { divisionId, q, orgType }) => {
    await requireDivView(ctx, divisionId);
    const query = (q ?? "").trim().toLowerCase();
    let rows = (await ctx.db.query("dbGangs").withIndex("by_division", (x) => x.eq("divisionId", divisionId)).take(1000))
      .filter((g) => !g.deletedAt);
    if (orgType) rows = rows.filter((g) => g.orgType === orgType);
    if (query) rows = rows.filter((g) => g.name.toLowerCase().includes(query));
    rows.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    // Comptage des membres en une seule lecture de la division (évite le N+1
    // qui interrogeait dbPersons une fois par gang).
    const memberCount = new Map<string, number>();
    for (const p of await ctx.db.query("dbPersons").withIndex("by_division", (x) => x.eq("divisionId", divisionId)).take(5000)) {
      if (p.deletedAt || !p.gangId) continue;
      memberCount.set(p.gangId as string, (memberCount.get(p.gangId as string) ?? 0) + 1);
    }
    return rows.map((g) => ({
      _id: g._id, name: g.name, orgType: g.orgType, subDivision: g.subDivision ?? null,
      color: g.color ?? null, logoUrl: g.logoUrl ?? null, territoryText: g.territoryText ?? "",
      membersCount: memberCount.get(g._id as string) ?? 0,
    }));
  },
});

export const getGang = query({
  args: { gangId: v.id("dbGangs") },
  handler: async (ctx, { gangId }) => {
    const g = await ctx.db.get(gangId);
    if (!g || g.deletedAt) throw new ConvexError("Organisation introuvable.");
    const { agent, division } = await requireDivView(ctx, g.divisionId);
    const ranks = (await ctx.db.query("dbGangRanks").withIndex("by_gang", (x) => x.eq("gangId", gangId)).collect())
      .sort((a, b) => a.position - b.position);
    const members = (await ctx.db.query("dbPersons").withIndex("by_gang", (x) => x.eq("gangId", gangId)).collect())
      .filter((p) => !p.deletedAt)
      .map((p) => ({ _id: p._id, name: p.name, alias: p.alias ?? "", gangRankId: p.gangRankId ?? null, gangRoleLabel: p.gangRoleLabel ?? "", photoUrl: p.photoUrl ?? null }));
    const relRows = await ctx.db.query("dbGangRelations").withIndex("by_gang", (x) => x.eq("gangId", gangId)).collect();
    const relations = [];
    for (const r of relRows) {
      const other = await ctx.db.get(r.otherGangId);
      if (other && !other.deletedAt) relations.push({ _id: r._id, kind: r.kind, gangId: other._id, name: other.name, color: other.color ?? null });
    }
    const territories = (await ctx.db.query("dbGangTerritories").withIndex("by_gang", (x) => x.eq("gangId", gangId)).collect())
      .map((t) => ({ _id: t._id, name: t.name ?? "", points: t.points, color: t.color ?? null }));
    return {
      _id: g._id, divisionId: g.divisionId, name: g.name, orgType: g.orgType, subDivision: g.subDivision ?? null,
      color: g.color ?? null, logoUrl: g.logoUrl ?? null, description: g.description ?? "",
      territoryText: g.territoryText ?? "", hqX: g.hqX ?? null, hqY: g.hqY ?? null,
      ranks: ranks.map((r) => ({ _id: r._id, name: r.name, position: r.position })),
      members, relations, territories,
      canWrite: await hasPerm(ctx, agent, division, "db.gangs"),
      canDelete: await hasPerm(ctx, agent, division, "db.delete"),
    };
  },
});

export const createGang = mutation({
  args: {
    divisionId: v.id("divisions"), name: v.string(), orgType: ORG_TYPE,
    subDivision: v.optional(v.union(SUBDIV, v.null())), color: v.optional(v.union(v.string(), v.null())), logoUrl: v.optional(v.union(v.string(), v.null())),
    description: v.optional(v.string()), territoryText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { agent } = await requireDivPerm(ctx, args.divisionId, "db.gangs");
    if (!args.name.trim()) throw new ConvexError("Nom requis.");
    const id = await ctx.db.insert("dbGangs", {
      divisionId: args.divisionId, name: args.name.trim(), orgType: args.orgType,
      subDivision: args.subDivision ?? undefined, color: args.color ?? undefined, logoUrl: args.logoUrl ?? undefined,
      description: args.description, territoryText: args.territoryText?.trim() || undefined,
      createdBy: agent._id, authorName: agentName(agent), at: Date.now(),
    });
    await writeAudit(ctx, agent, { action: "detective.gang_create", resourceType: "dbGang", resourceId: id, resourceLabel: args.name.trim() });
    return id;
  },
});

export const updateGang = mutation({
  args: {
    gangId: v.id("dbGangs"), name: v.optional(v.string()), orgType: v.optional(ORG_TYPE),
    subDivision: v.optional(v.union(SUBDIV, v.null())), color: v.optional(v.union(v.string(), v.null())),
    logoUrl: v.optional(v.union(v.string(), v.null())), description: v.optional(v.string()),
    territoryText: v.optional(v.string()),
    hqX: v.optional(v.union(v.number(), v.null())), hqY: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, { gangId, ...patch }) => {
    const g = await ctx.db.get(gangId);
    if (!g || g.deletedAt) return;
    const { agent } = await requireDivPerm(ctx, g.divisionId, "db.gangs");
    const up: Record<string, unknown> = {};
    if (patch.name !== undefined) { if (!patch.name.trim()) throw new ConvexError("Nom requis."); up.name = patch.name.trim(); }
    if (patch.orgType !== undefined) up.orgType = patch.orgType;
    if (patch.subDivision !== undefined) up.subDivision = patch.subDivision ?? undefined;
    if (patch.color !== undefined) up.color = patch.color ?? undefined;
    if (patch.logoUrl !== undefined) up.logoUrl = patch.logoUrl ?? undefined;
    if (patch.description !== undefined) up.description = patch.description;
    if (patch.territoryText !== undefined) up.territoryText = patch.territoryText.trim() || undefined;
    if (patch.hqX !== undefined) up.hqX = patch.hqX ?? undefined;
    if (patch.hqY !== undefined) up.hqY = patch.hqY ?? undefined;
    await ctx.db.patch(gangId, up);
    await writeAudit(ctx, agent, { action: "detective.gang_update", resourceType: "dbGang", resourceId: gangId, resourceLabel: g.name });
  },
});

export const removeGang = mutation({
  args: { gangId: v.id("dbGangs") },
  handler: async (ctx, { gangId }) => {
    const g = await ctx.db.get(gangId);
    if (!g) return;
    const { agent } = await requireDivPerm(ctx, g.divisionId, "db.delete");
    // Détache les membres (ne supprime pas les personnes du registre).
    const members = (await ctx.db.query("dbPersons").withIndex("by_gang", (x) => x.eq("gangId", gangId)).collect());
    for (const m of members) await ctx.db.patch(m._id, { gangId: undefined, gangRankId: undefined, gangRoleLabel: undefined });
    // Supprime relations (des deux côtés) et territoires.
    const rels = await ctx.db.query("dbGangRelations").withIndex("by_gang", (x) => x.eq("gangId", gangId)).collect();
    for (const r of rels) await ctx.db.delete(r._id);
    const inbound = (await ctx.db.query("dbGangRelations").collect()).filter((r) => r.otherGangId === gangId);
    for (const r of inbound) await ctx.db.delete(r._id);
    const terrs = await ctx.db.query("dbGangTerritories").withIndex("by_gang", (x) => x.eq("gangId", gangId)).collect();
    for (const t of terrs) await ctx.db.delete(t._id);
    await ctx.db.patch(gangId, { deletedAt: Date.now(), deletedBy: agent._id });
    await writeAudit(ctx, agent, { action: "detective.gang_delete", resourceType: "dbGang", resourceId: gangId, resourceLabel: g.name });
  },
});

// ---------- Organigramme (grades du gang) ----------

async function gangByRank(ctx: MutationCtx, rankId: Id<"dbGangRanks">) {
  const r = await ctx.db.get(rankId);
  if (!r) throw new ConvexError("Grade introuvable.");
  const g = await ctx.db.get(r.gangId);
  if (!g || g.deletedAt) throw new ConvexError("Organisation introuvable.");
  return { rank: r, gang: g };
}

export const gangRankCreate = mutation({
  args: { gangId: v.id("dbGangs"), name: v.string() },
  handler: async (ctx, { gangId, name }) => {
    const g = await ctx.db.get(gangId);
    if (!g || g.deletedAt) throw new ConvexError("Organisation introuvable.");
    const { agent } = await requireDivPerm(ctx, g.divisionId, "db.gangs");
    if (!name.trim()) throw new ConvexError("Nom requis.");
    const all = await ctx.db.query("dbGangRanks").withIndex("by_gang", (x) => x.eq("gangId", gangId)).collect();
    const position = all.reduce((m, r) => Math.max(m, r.position), -1) + 1;
    const id = await ctx.db.insert("dbGangRanks", { gangId, name: name.trim(), position });
    await writeAudit(ctx, agent, { action: "detective.gang_rank_create", resourceType: "dbGangRank", resourceId: id, resourceLabel: name.trim(), metadata: { gang: g.name } });
    return id;
  },
});

export const gangRankRename = mutation({
  args: { rankId: v.id("dbGangRanks"), name: v.string() },
  handler: async (ctx, { rankId, name }) => {
    const { rank, gang } = await gangByRank(ctx, rankId);
    const { agent } = await requireDivPerm(ctx, gang.divisionId, "db.gangs");
    if (!name.trim()) throw new ConvexError("Nom requis.");
    await ctx.db.patch(rankId, { name: name.trim() });
    await writeAudit(ctx, agent, { action: "detective.gang_rank_rename", resourceType: "dbGangRank", resourceId: rankId, resourceLabel: name.trim(), before: { name: rank.name }, after: { name: name.trim() } });
  },
});

export const gangRankMove = mutation({
  args: { rankId: v.id("dbGangRanks"), dir: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, { rankId, dir }) => {
    const { rank, gang } = await gangByRank(ctx, rankId);
    const { agent } = await requireDivPerm(ctx, gang.divisionId, "db.gangs");
    const all = (await ctx.db.query("dbGangRanks").withIndex("by_gang", (x) => x.eq("gangId", rank.gangId)).collect())
      .sort((a, b) => a.position - b.position);
    const i = all.findIndex((r) => r._id === rankId);
    const j = dir === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= all.length) return;
    await ctx.db.patch(all[i]._id, { position: all[j].position });
    await ctx.db.patch(all[j]._id, { position: all[i].position });
    await writeAudit(ctx, agent, { action: "detective.gang_rank_move", resourceType: "dbGangRank", resourceId: rankId, resourceLabel: rank.name, metadata: { dir } });
  },
});

export const gangRankRemove = mutation({
  args: { rankId: v.id("dbGangRanks") },
  handler: async (ctx, { rankId }) => {
    const { rank, gang } = await gangByRank(ctx, rankId);
    const { agent } = await requireDivPerm(ctx, gang.divisionId, "db.gangs");
    const members = (await ctx.db.query("dbPersons").withIndex("by_gang", (x) => x.eq("gangId", rank.gangId)).collect())
      .filter((p) => p.gangRankId === rankId);
    for (const m of members) await ctx.db.patch(m._id, { gangRankId: undefined });
    await ctx.db.delete(rankId);
    await writeAudit(ctx, agent, { action: "detective.gang_rank_delete", resourceType: "dbGangRank", resourceId: rankId, resourceLabel: rank.name });
  },
});

// Affecter un membre du registre à ce gang + grade interne.
export const setMemberGang = mutation({
  args: {
    personId: v.id("dbPersons"),
    gangId: v.union(v.id("dbGangs"), v.null()),
    gangRankId: v.optional(v.union(v.id("dbGangRanks"), v.null())),
    gangRoleLabel: v.optional(v.string()),
  },
  handler: async (ctx, { personId, gangId, gangRankId, gangRoleLabel }) => {
    const p = await ctx.db.get(personId);
    if (!p || p.deletedAt) return;
    const { agent } = await requireDivPerm(ctx, p.divisionId, "db.gangs");
    await ctx.db.patch(personId, {
      gangId: gangId ?? undefined,
      gangRankId: gangId ? (gangRankId ?? undefined) : undefined,
      gangRoleLabel: gangId ? (gangRoleLabel?.trim() || undefined) : undefined,
    });
    await writeAudit(ctx, agent, { action: "detective.gang_member_set", resourceType: "dbPerson", resourceId: personId, resourceLabel: p.name, metadata: { gangId: gangId ?? null } });
  },
});

// ---------- Rivalités / alliances (bidirectionnel) ----------

export const setGangRelation = mutation({
  args: { gangId: v.id("dbGangs"), otherGangId: v.id("dbGangs"), kind: REL_KIND },
  handler: async (ctx, { gangId, otherGangId, kind }) => {
    const g = await ctx.db.get(gangId);
    if (!g || g.deletedAt) throw new ConvexError("Organisation introuvable.");
    const { agent } = await requireDivPerm(ctx, g.divisionId, "db.gangs");
    if (gangId === otherGangId) throw new ConvexError("Une organisation ne peut se relier à elle-même.");
    const other = await ctx.db.get(otherGangId);
    if (!other || other.deletedAt) throw new ConvexError("Organisation cible introuvable.");
    // Nettoie une éventuelle relation existante dans les deux sens, puis réécrit.
    for (const [a, b] of [[gangId, otherGangId], [otherGangId, gangId]] as const) {
      const rows = (await ctx.db.query("dbGangRelations").withIndex("by_gang", (x) => x.eq("gangId", a)).collect()).filter((r) => r.otherGangId === b);
      for (const r of rows) await ctx.db.delete(r._id);
    }
    await ctx.db.insert("dbGangRelations", { gangId, otherGangId, kind });
    await ctx.db.insert("dbGangRelations", { gangId: otherGangId, otherGangId: gangId, kind });
    await writeAudit(ctx, agent, { action: "detective.gang_relation_set", resourceType: "dbGang", resourceId: gangId, resourceLabel: g.name, metadata: { otherGang: other.name, kind } });
  },
});

export const removeGangRelation = mutation({
  args: { gangId: v.id("dbGangs"), otherGangId: v.id("dbGangs") },
  handler: async (ctx, { gangId, otherGangId }) => {
    const g = await ctx.db.get(gangId);
    if (!g || g.deletedAt) return;
    const { agent } = await requireDivPerm(ctx, g.divisionId, "db.gangs");
    for (const [a, b] of [[gangId, otherGangId], [otherGangId, gangId]] as const) {
      const rows = (await ctx.db.query("dbGangRelations").withIndex("by_gang", (x) => x.eq("gangId", a)).collect()).filter((r) => r.otherGangId === b);
      for (const r of rows) await ctx.db.delete(r._id);
    }
    await writeAudit(ctx, agent, { action: "detective.gang_relation_remove", resourceType: "dbGang", resourceId: gangId, resourceLabel: g.name, metadata: { otherGangId } });
  },
});

// ---------- Territoires + carte globale ----------

export const setGangHq = mutation({
  args: { gangId: v.id("dbGangs"), x: v.union(v.number(), v.null()), y: v.union(v.number(), v.null()) },
  handler: async (ctx, { gangId, x, y }) => {
    const g = await ctx.db.get(gangId);
    if (!g || g.deletedAt) return;
    const { agent } = await requireDivPerm(ctx, g.divisionId, "db.gangs");
    await ctx.db.patch(gangId, { hqX: x ?? undefined, hqY: y ?? undefined });
    await writeAudit(ctx, agent, { action: "detective.gang_hq_set", resourceType: "dbGang", resourceId: gangId, resourceLabel: g.name, metadata: { x, y } });
  },
});

export const territoryAdd = mutation({
  args: { gangId: v.id("dbGangs"), name: v.optional(v.string()), points: v.array(v.object({ x: v.number(), y: v.number() })), color: v.optional(v.string()) },
  handler: async (ctx, { gangId, name, points, color }) => {
    const g = await ctx.db.get(gangId);
    if (!g || g.deletedAt) throw new ConvexError("Organisation introuvable.");
    const { agent } = await requireDivPerm(ctx, g.divisionId, "db.gangs");
    if (points.length < 3) throw new ConvexError("Un territoire nécessite au moins 3 points.");
    const id = await ctx.db.insert("dbGangTerritories", { gangId, name: name?.trim() || undefined, points, color: color ?? g.color });
    await writeAudit(ctx, agent, { action: "detective.territory_add", resourceType: "dbGangTerritory", resourceId: id, resourceLabel: name?.trim() || g.name, metadata: { gang: g.name } });
    return id;
  },
});

export const territoryRemove = mutation({
  args: { id: v.id("dbGangTerritories") },
  handler: async (ctx, { id }) => {
    const t = await ctx.db.get(id);
    if (!t) return;
    const g = await ctx.db.get(t.gangId);
    if (!g) return;
    const { agent } = await requireDivPerm(ctx, g.divisionId, "db.gangs");
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, { action: "detective.territory_remove", resourceType: "dbGangTerritory", resourceId: id, resourceLabel: t.name ?? g.name });
  },
});

// Carte globale : tous les territoires + QG de tous les gangs de la division.
export const globalMap = query({
  args: { divisionId: v.id("divisions") },
  handler: async (ctx, { divisionId }) => {
    await requireDivView(ctx, divisionId);
    const gangs = (await ctx.db.query("dbGangs").withIndex("by_division", (x) => x.eq("divisionId", divisionId)).collect())
      .filter((g) => !g.deletedAt);
    const territories = [];
    const hqs = [];
    for (const g of gangs) {
      const terrs = await ctx.db.query("dbGangTerritories").withIndex("by_gang", (x) => x.eq("gangId", g._id)).collect();
      for (const t of terrs) territories.push({ _id: t._id, gangId: g._id, gangName: g.name, name: t.name ?? g.name, points: t.points, color: t.color ?? g.color ?? null });
      if (g.hqX != null && g.hqY != null) hqs.push({ gangId: g._id, gangName: g.name, x: g.hqX, y: g.hqY, color: g.color ?? null });
    }
    return { territories, hqs };
  },
});

export const gangOptions = query({
  args: { divisionId: v.id("divisions"), q: v.optional(v.string()) },
  handler: async (ctx, { divisionId, q }) => {
    await requireDivView(ctx, divisionId);
    const query = (q ?? "").trim().toLowerCase();
    let rows = (await ctx.db.query("dbGangs").withIndex("by_division", (x) => x.eq("divisionId", divisionId)).collect()).filter((g) => !g.deletedAt);
    if (query) rows = rows.filter((g) => g.name.toLowerCase().includes(query));
    return rows.sort((a, b) => a.name.localeCompare(b.name, "fr")).slice(0, 20).map((g) => ({ _id: g._id, name: g.name, orgType: g.orgType, color: g.color ?? null }));
  },
});

// ============ AFFILIATIONS GANG D'UNE ENQUÊTE ============

export const caseGangs = query({
  args: { caseId: v.id("dbCases") },
  handler: async (ctx, { caseId }) => {
    await requireCaseRead(ctx, caseId);
    const links = await ctx.db.query("dbCaseGangs").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect();
    const out = [];
    for (const l of links) {
      const g = await ctx.db.get(l.gangId);
      if (g && !g.deletedAt) out.push({ _id: l._id, gangId: g._id, name: g.name, orgType: g.orgType, color: g.color ?? null, note: l.note ?? "" });
    }
    return out;
  },
});

export const addCaseGang = mutation({
  args: { caseId: v.id("dbCases"), gangId: v.id("dbGangs"), note: v.optional(v.string()) },
  handler: async (ctx, { caseId, gangId, note }) => {
    const { agent } = await requireCaseWrite(ctx, caseId);
    const existing = await ctx.db.query("dbCaseGangs").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect();
    if (existing.some((l) => l.gangId === gangId)) throw new ConvexError("Affiliation déjà présente.");
    const g = await ctx.db.get(gangId);
    if (!g || g.deletedAt) throw new ConvexError("Organisation introuvable.");
    const id = await ctx.db.insert("dbCaseGangs", { caseId, gangId, note: note?.trim() || undefined });
    await ctx.db.insert("dbTimeline", { caseId, at: Date.now(), type: "auto", label: `Affiliation : ${g.name}`, authorId: agent._id, authorName: agentName(agent) });
    await writeAudit(ctx, agent, { action: "detective.case_gang_add", resourceType: "dbCaseGang", resourceId: id, resourceLabel: g.name, metadata: { caseId, gangId } });
    return id;
  },
});

export const removeCaseGang = mutation({
  args: { id: v.id("dbCaseGangs") },
  handler: async (ctx, { id }) => {
    const l = await ctx.db.get(id);
    if (!l) return;
    const { agent } = await requireCaseWrite(ctx, l.caseId);
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, { action: "detective.case_gang_remove", resourceType: "dbCaseGang", resourceId: id, metadata: { caseId: l.caseId, gangId: l.gangId } });
  },
});

// ============ STUPÉFIANTS ============

const DRUG_KIND = v.union(v.literal("POINT_VENTE"), v.literal("LABO"), v.literal("CARAVANE"));

export const listDrugSites = query({
  args: { divisionId: v.id("divisions"), kind: v.optional(DRUG_KIND), gangId: v.optional(v.id("dbGangs")), q: v.optional(v.string()) },
  handler: async (ctx, { divisionId, kind, gangId, q }) => {
    await requireDivView(ctx, divisionId);
    const query = (q ?? "").trim().toLowerCase();
    let rows = (await ctx.db.query("dbDrugSites").withIndex("by_division", (x) => x.eq("divisionId", divisionId)).take(2000)).filter((d) => !d.deletedAt);
    if (kind) rows = rows.filter((d) => d.kind === kind);
    if (gangId) rows = rows.filter((d) => d.gangId === gangId);
    if (query) rows = rows.filter((d) => `${d.name} ${d.drugTypes ?? ""}`.toLowerCase().includes(query));
    rows.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    const gangs = new Map<string, string>();
    for (const d of rows) if (d.gangId && !gangs.has(d.gangId as string)) { const g = await ctx.db.get(d.gangId); if (g) gangs.set(d.gangId as string, g.name); }
    return rows.map((d) => ({
      _id: d._id, name: d.name, kind: d.kind, drugTypes: d.drugTypes ?? "", note: d.note ?? "",
      x: d.x ?? null, y: d.y ?? null, mediaUrls: d.mediaUrls ?? [], at: d.at,
      gangId: d.gangId ?? null, gangName: d.gangId ? (gangs.get(d.gangId as string) ?? null) : null,
    }));
  },
});

export const createDrugSite = mutation({
  args: {
    divisionId: v.id("divisions"), name: v.string(), kind: DRUG_KIND,
    gangId: v.optional(v.id("dbGangs")), drugTypes: v.optional(v.string()), note: v.optional(v.string()),
    x: v.optional(v.number()), y: v.optional(v.number()), mediaUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { agent } = await requireDivPerm(ctx, args.divisionId, "db.drugs");
    if (!args.name.trim()) throw new ConvexError("Nom requis.");
    const id = await ctx.db.insert("dbDrugSites", {
      divisionId: args.divisionId, name: args.name.trim(), kind: args.kind, gangId: args.gangId,
      drugTypes: args.drugTypes?.trim() || undefined, note: args.note, x: args.x, y: args.y, mediaUrls: args.mediaUrls,
      createdBy: agent._id, authorName: agentName(agent), at: Date.now(),
    });
    await writeAudit(ctx, agent, { action: "detective.drugsite_create", resourceType: "dbDrugSite", resourceId: id, resourceLabel: args.name.trim() });
    return id;
  },
});

export const updateDrugSite = mutation({
  args: {
    id: v.id("dbDrugSites"), name: v.optional(v.string()), kind: v.optional(DRUG_KIND),
    gangId: v.optional(v.union(v.id("dbGangs"), v.null())), drugTypes: v.optional(v.string()), note: v.optional(v.string()),
    x: v.optional(v.union(v.number(), v.null())), y: v.optional(v.union(v.number(), v.null())), mediaUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { id, ...patch }) => {
    const d = await ctx.db.get(id);
    if (!d || d.deletedAt) return;
    const { agent } = await requireDivPerm(ctx, d.divisionId, "db.drugs");
    const up: Record<string, unknown> = {};
    if (patch.name !== undefined) { if (!patch.name.trim()) throw new ConvexError("Nom requis."); up.name = patch.name.trim(); }
    if (patch.kind !== undefined) up.kind = patch.kind;
    if (patch.gangId !== undefined) up.gangId = patch.gangId ?? undefined;
    if (patch.drugTypes !== undefined) up.drugTypes = patch.drugTypes.trim() || undefined;
    if (patch.note !== undefined) up.note = patch.note;
    if (patch.x !== undefined) up.x = patch.x ?? undefined;
    if (patch.y !== undefined) up.y = patch.y ?? undefined;
    if (patch.mediaUrls !== undefined) up.mediaUrls = patch.mediaUrls;
    await ctx.db.patch(id, up);
    await writeAudit(ctx, agent, { action: "detective.drugsite_update", resourceType: "dbDrugSite", resourceId: id, resourceLabel: d.name });
  },
});

export const removeDrugSite = mutation({
  args: { id: v.id("dbDrugSites") },
  handler: async (ctx, { id }) => {
    const d = await ctx.db.get(id);
    if (!d) return;
    const { agent } = await requireDivPerm(ctx, d.divisionId, "db.delete");
    await ctx.db.patch(id, { deletedAt: Date.now(), deletedBy: agent._id });
    await writeAudit(ctx, agent, { action: "detective.drugsite_delete", resourceType: "dbDrugSite", resourceId: id, resourceLabel: d.name });
  },
});
