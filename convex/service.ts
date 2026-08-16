import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";
import { notify, NOTIFY_COLOR } from "./lib/notify";
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
    await notify(ctx, "service.start", {
      title: "Prise de service",
      description: `**${agent.prenomRP} ${agent.nomRP}**${agent.matricule != null ? ` · ${String(agent.matricule).padStart(5, "0")}` : ""}`,
      color: NOTIFY_COLOR.accent,
      footer: `${agent.prenomRP} ${agent.nomRP}`,
    });
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
    await notify(ctx, "service.end", {
      title: "Fin de service",
      description: `**${agent.prenomRP} ${agent.nomRP}**${agent.matricule != null ? ` · ${String(agent.matricule).padStart(5, "0")}` : ""}`,
      color: NOTIFY_COLOR.muted,
      fields: [{ name: "Durée", value: `${Math.max(1, Math.round((Date.now() - existing.startedAt) / 60000))} min`, inline: true }],
      footer: `${agent.prenomRP} ${agent.nomRP}`,
    });
  },
});
