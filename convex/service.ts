import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";
import { releaseAgentFromPatrol } from "./dispatch";

async function openSession(ctx: import("./_generated/server").QueryCtx, agentId: import("./_generated/dataModel").Id<"agents">) {
  return ctx.db
    .query("serviceSessions")
    .withIndex("by_agent", (q) => q.eq("agentId", agentId))
    .filter((q) => q.eq(q.field("endedAt"), undefined))
    .first();
}

export const start = mutation({
  args: { callsignType: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "service.self");
    const existing = await openSession(ctx, agent._id);
    if (existing) return existing._id;
    const id = await ctx.db.insert("serviceSessions", {
      agentId: agent._id,
      source: "MANUAL",
      callsignType: args.callsignType,
      startedAt: Date.now(),
    });
    await writeAudit(ctx, agent, { action: "service.start", resourceType: "serviceSession", resourceId: id });
    return id;
  },
});

export const end = mutation({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "service.self");
    const existing = await openSession(ctx, agent._id);
    if (!existing) return;
    await ctx.db.patch(existing._id, { endedAt: Date.now() });
    // Hors service => l'agent quitte automatiquement sa patrouille.
    await releaseAgentFromPatrol(ctx, agent._id);
    await writeAudit(ctx, agent, {
      action: "service.end",
      resourceType: "serviceSession",
      resourceId: existing._id,
    });
  },
});
