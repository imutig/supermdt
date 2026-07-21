import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission, can } from "./rbac";
import { writeAudit } from "./lib/audit";
import { notify, NOTIFY_COLOR } from "./lib/notify";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAgent(ctx);
    const isManager = await can(ctx, viewer, "absences.manage");
    const rows = isManager
      ? await ctx.db.query("absences").order("desc").take(60)
      : await ctx.db
          .query("absences")
          .withIndex("by_agent", (q) => q.eq("agentId", viewer._id))
          .order("desc")
          .collect();
    const out = [];
    for (const a of rows) {
      const ag = await ctx.db.get(a.agentId);
      out.push({
        _id: a._id,
        agentName: ag ? `${ag.prenomRP} ${ag.nomRP}` : "-",
        reason: a.reason,
        from: a.from,
        to: a.to,
        status: a.status,
        canDecide: isManager && a.status === "EN_ATTENTE",
      });
    }
    return out;
  },
});

export const request = mutation({
  args: { reason: v.string(), from: v.number(), to: v.number() },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "absences.request");
    const id = await ctx.db.insert("absences", {
      agentId: agent._id,
      reason: args.reason,
      from: args.from,
      to: args.to,
      status: "EN_ATTENTE",
      at: Date.now(),
    });
    await writeAudit(ctx, agent, { action: "absence.request", resourceType: "absence", resourceId: id });
    await notify(ctx, "absence.request", {
      title: "Demande d'absence",
      description: `**${agent.prenomRP} ${agent.nomRP}**`,
      color: NOTIFY_COLOR.info,
      fields: [
        { name: "Période", value: `${new Date(args.from).toLocaleDateString("fr-FR")} au ${new Date(args.to).toLocaleDateString("fr-FR")}` },
        { name: "Motif", value: args.reason },
      ],
    });
    return id;
  },
});

export const decide = mutation({
  args: { id: v.id("absences"), approve: v.boolean() },
  handler: async (ctx, { id, approve }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "absences.manage");
    await ctx.db.patch(id, { status: approve ? "APPROUVEE" : "REFUSEE", decidedBy: actor._id });
    await writeAudit(ctx, actor, {
      action: approve ? "absence.approve" : "absence.reject",
      resourceType: "absence",
      resourceId: id,
    });
  },
});
