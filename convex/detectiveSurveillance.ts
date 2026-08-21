import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireDivView, requireDivPerm, agentName } from "./lib/detectiveAccess";
import { writeAudit } from "./lib/audit";

// Journal de surveillance du bureau : membres présents, lieu, date/heure, durée,
// éléments observés (texte riche + médias). Reliable optionnellement à une enquête.

export const listSurveillance = query({
  args: { divisionId: v.id("divisions"), caseId: v.optional(v.id("dbCases")) },
  handler: async (ctx, { divisionId, caseId }) => {
    await requireDivView(ctx, divisionId);
    let rows = (await ctx.db.query("dbSurveillance").withIndex("by_division", (x) => x.eq("divisionId", divisionId)).collect())
      .filter((s) => !s.deletedAt);
    if (caseId) rows = rows.filter((s) => s.caseId === caseId);
    rows.sort((a, b) => b.date - a.date);
    const out = [];
    for (const s of rows) {
      const members = [];
      for (const m of s.members) { const a = await ctx.db.get(m); if (a) members.push({ agentId: a._id, name: agentName(a), matricule: a.matricule ?? null }); }
      let caseLabel: string | null = null;
      if (s.caseId) { const c = await ctx.db.get(s.caseId); if (c && !c.deletedAt) caseLabel = `#${c.number} - ${c.title}`; }
      out.push({
        _id: s._id, title: s.title ?? "", locationText: s.locationText ?? "", x: s.x ?? null, y: s.y ?? null,
        date: s.date, durationMin: s.durationMin ?? null, observations: s.observations ?? "",
        mediaUrls: s.mediaUrls ?? [], authorName: s.authorName, at: s.at,
        members, caseId: s.caseId ?? null, caseLabel,
      });
    }
    return out;
  },
});

export const createSurveillance = mutation({
  args: {
    divisionId: v.id("divisions"),
    caseId: v.optional(v.id("dbCases")),
    title: v.optional(v.string()),
    members: v.array(v.id("agents")),
    locationText: v.optional(v.string()),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    date: v.number(),
    durationMin: v.optional(v.number()),
    observations: v.optional(v.string()),
    mediaUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { agent } = await requireDivPerm(ctx, args.divisionId, "db.surveillance");
    const id = await ctx.db.insert("dbSurveillance", {
      divisionId: args.divisionId, caseId: args.caseId, title: args.title?.trim() || undefined,
      members: args.members, locationText: args.locationText?.trim() || undefined,
      x: args.x, y: args.y, date: args.date, durationMin: args.durationMin,
      observations: args.observations, mediaUrls: args.mediaUrls,
      createdBy: agent._id, authorName: agentName(agent), at: Date.now(),
    });
    await writeAudit(ctx, agent, { action: "detective.surveillance_create", resourceType: "dbSurveillance", resourceId: id, resourceLabel: args.title?.trim() || undefined });
    return id;
  },
});

export const updateSurveillance = mutation({
  args: {
    id: v.id("dbSurveillance"),
    caseId: v.optional(v.union(v.id("dbCases"), v.null())),
    title: v.optional(v.string()),
    members: v.optional(v.array(v.id("agents"))),
    locationText: v.optional(v.string()),
    x: v.optional(v.union(v.number(), v.null())),
    y: v.optional(v.union(v.number(), v.null())),
    date: v.optional(v.number()),
    durationMin: v.optional(v.union(v.number(), v.null())),
    observations: v.optional(v.string()),
    mediaUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { id, ...patch }) => {
    const s = await ctx.db.get(id);
    if (!s || s.deletedAt) return;
    const { agent } = await requireDivPerm(ctx, s.divisionId, "db.surveillance");
    const up: Record<string, unknown> = {};
    if (patch.caseId !== undefined) up.caseId = patch.caseId ?? undefined;
    if (patch.title !== undefined) up.title = patch.title.trim() || undefined;
    if (patch.members !== undefined) up.members = patch.members;
    if (patch.locationText !== undefined) up.locationText = patch.locationText.trim() || undefined;
    if (patch.x !== undefined) up.x = patch.x ?? undefined;
    if (patch.y !== undefined) up.y = patch.y ?? undefined;
    if (patch.date !== undefined) up.date = patch.date;
    if (patch.durationMin !== undefined) up.durationMin = patch.durationMin ?? undefined;
    if (patch.observations !== undefined) up.observations = patch.observations;
    if (patch.mediaUrls !== undefined) up.mediaUrls = patch.mediaUrls;
    await ctx.db.patch(id, up);
    await writeAudit(ctx, agent, { action: "detective.surveillance_update", resourceType: "dbSurveillance", resourceId: id, resourceLabel: s.title ?? undefined });
  },
});

export const removeSurveillance = mutation({
  args: { id: v.id("dbSurveillance") },
  handler: async (ctx, { id }) => {
    const s = await ctx.db.get(id);
    if (!s) return;
    const { agent } = await requireDivPerm(ctx, s.divisionId, "db.delete");
    await ctx.db.patch(id, { deletedAt: Date.now(), deletedBy: agent._id });
    await writeAudit(ctx, agent, { action: "detective.surveillance_delete", resourceType: "dbSurveillance", resourceId: id, resourceLabel: s.title ?? undefined });
  },
});
