import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireDivView } from "./lib/detectiveAccess";
import { requireAgent } from "./rbac";

// Notifications intra-bureau (assignation à une enquête, nouvelle piste…).
// Chaque agent ne voit que les siennes.

export const myNotifications = query({
  args: { divisionId: v.id("divisions") },
  handler: async (ctx, { divisionId }) => {
    const { agent } = await requireDivView(ctx, divisionId);
    const rows = (await ctx.db.query("dbNotifications").withIndex("by_agent", (x) => x.eq("agentId", agent._id)).collect())
      .filter((n) => n.divisionId === divisionId)
      .sort((a, b) => b.at - a.at)
      .slice(0, 40);
    return rows.map((n) => ({ _id: n._id, type: n.type, text: n.text, caseId: n.caseId ?? null, read: !!n.read, at: n.at }));
  },
});

export const unreadCount = query({
  args: { divisionId: v.id("divisions") },
  handler: async (ctx, { divisionId }) => {
    const agent = await requireAgent(ctx);
    const rows = (await ctx.db.query("dbNotifications").withIndex("by_agent", (x) => x.eq("agentId", agent._id)).collect())
      .filter((n) => n.divisionId === divisionId && !n.read);
    return rows.length;
  },
});

export const markRead = mutation({
  args: { id: v.id("dbNotifications") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    const n = await ctx.db.get(id);
    if (!n || n.agentId !== agent._id) return;
    await ctx.db.patch(id, { read: true });
  },
});

export const markAllRead = mutation({
  args: { divisionId: v.id("divisions") },
  handler: async (ctx, { divisionId }) => {
    const agent = await requireAgent(ctx);
    const rows = (await ctx.db.query("dbNotifications").withIndex("by_agent", (x) => x.eq("agentId", agent._id)).collect())
      .filter((n) => n.divisionId === divisionId && !n.read);
    for (const n of rows) await ctx.db.patch(n._id, { read: true });
  },
});
