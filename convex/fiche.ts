import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";

// Fiche de renseignement individuelle de l'agent (item 11).

// Fiche de l'agent courant + indicateur "à remplir".
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    const sheet = await ctx.db
      .query("agentSheets")
      .withIndex("by_agent", (q) => q.eq("agentId", agent._id))
      .first();
    return {
      submitted: !!sheet?.submittedAt,
      submittedAt: sheet?.submittedAt ?? null,
      data: sheet?.data ?? null,
    };
  },
});

export const save = mutation({
  args: { data: v.any() },
  handler: async (ctx, { data }) => {
    const agent = await requireAgent(ctx);
    const existing = await ctx.db
      .query("agentSheets")
      .withIndex("by_agent", (q) => q.eq("agentId", agent._id))
      .first();
    if (existing) await ctx.db.patch(existing._id, { data, submittedAt: Date.now() });
    else await ctx.db.insert("agentSheets", { agentId: agent._id, data, submittedAt: Date.now() });
    await writeAudit(ctx, agent, { action: "fiche.save", resourceType: "agent", resourceId: agent._id });
  },
});

// Consultation de la fiche d'un agent depuis l'Effectif.
export const byAgent = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const viewer = await requireAgent(ctx);
    await requirePermission(ctx, viewer, "effectif.view");
    const sheet = await ctx.db
      .query("agentSheets")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .first();
    if (!sheet?.submittedAt) return null;
    return { submittedAt: sheet.submittedAt, data: sheet.data };
  },
});
