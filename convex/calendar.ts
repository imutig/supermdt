import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission, agentLabel } from "./rbac";
import { writeAudit } from "./lib/audit";

// Évènements d'un mois donné (item 1). `year` + `month` (0-11).
export const month = query({
  args: { year: v.number(), month: v.number() },
  handler: async (ctx, { year, month }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "calendrier.view");
    const start = new Date(Date.UTC(year, month, 1)).getTime();
    const end = new Date(Date.UTC(year, month + 1, 1)).getTime();
    const rows = await ctx.db
      .query("calendarEvents")
      .withIndex("by_at", (q) => q.gte("at", start).lt("at", end))
      .collect();
    const out = [];
    for (const e of rows) {
      out.push({
        _id: e._id,
        at: e.at,
        title: e.title,
        lieu: e.lieu ?? null,
        startTime: e.startTime ?? null,
        endTime: e.endTime ?? null,
        notes: e.notes ?? null,
        by: await agentLabel(ctx, e.createdBy),
      });
    }
    return out.sort((a, b) => a.at - b.at);
  },
});

// Évènements à venir (accueil).
export const upcoming = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "calendrier.view");
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const rows = await ctx.db
      .query("calendarEvents")
      .withIndex("by_at", (q) => q.gte("at", todayStart.getTime()))
      .take(6);
    return rows
      .sort((a, b) => a.at - b.at)
      .map((e) => ({
        _id: e._id,
        at: e.at,
        title: e.title,
        lieu: e.lieu ?? null,
        startTime: e.startTime ?? null,
        endTime: e.endTime ?? null,
      }));
  },
});

export const create = mutation({
  args: {
    at: v.number(),
    title: v.string(),
    lieu: v.optional(v.string()),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "calendrier.create");
    const id = await ctx.db.insert("calendarEvents", { ...args, createdBy: agent._id });
    await writeAudit(ctx, agent, { action: "calendar.create", resourceType: "calendarEvent", resourceId: id, resourceLabel: args.title });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("calendarEvents") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "calendrier.delete");
    const e = await ctx.db.get(id);
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, { action: "calendar.remove", resourceType: "calendarEvent", resourceId: id, resourceLabel: e?.title });
  },
});
