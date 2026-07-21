import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertOutranks, requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "discipline.view");
    const rows = await ctx.db.query("disciplines").order("desc").take(60);
    const out = [];
    for (const d of rows) {
      const ag = await ctx.db.get(d.agentId);
      const by = d.byAgentId ? await ctx.db.get(d.byAgentId) : null;
      out.push({
        _id: d._id,
        agentName: ag ? `${ag.prenomRP} ${ag.nomRP}` : "-",
        motif: d.motif,
        sanction: d.sanction,
        status: d.status,
        by: by ? `${by.prenomRP} ${by.nomRP}` : "-",
        at: d.at,
        evidence: d.imageUrls ?? [],
      });
    }
    return out;
  },
});

// Types de sanction disciplinaire prédéfinis (§12).
export const sanctionTypes = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "discipline.view");
    return (await ctx.db.query("disciplineSanctionTypes").collect())
      .filter((t) => t.active)
      .sort((a, b) => a.position - b.position)
      .map((t) => ({ _id: t._id, name: t.name }));
  },
});

// Sanctions d'un agent (affichées sur sa fiche, §11/§12).
export const byAgent = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const viewer = await requireAgent(ctx);
    await requirePermission(ctx, viewer, "discipline.view");
    const rows = await ctx.db
      .query("disciplines")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .order("desc")
      .collect();
    const out = [];
    for (const d of rows) {
      const by = d.byAgentId ? await ctx.db.get(d.byAgentId) : null;
      out.push({
        _id: d._id,
        motif: d.motif,
        sanction: d.sanction,
        by: by ? `${by.prenomRP} ${by.nomRP}` : "-",
        at: d.at,
        evidence: d.imageUrls ?? [],
      });
    }
    return out;
  },
});

// Preuves attachées à une sanction (captures, enregistrements...).
export const setEvidence = mutation({
  args: { id: v.id("disciplines"), imageUrls: v.array(v.string()) },
  handler: async (ctx, { id, imageUrls }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "discipline.edit");
    await ctx.db.patch(id, { imageUrls });
  },
});

export const remove = mutation({
  args: { id: v.id("disciplines") },
  handler: async (ctx, { id }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "discipline.delete");
    await ctx.db.delete(id);
    await writeAudit(ctx, actor, { action: "discipline.remove", resourceType: "discipline", resourceId: id });
  },
});

export const create = mutation({
  args: { agentId: v.id("agents"), motif: v.string(), sanction: v.string(), imageUrls: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "discipline.create");
    const targetAgent = await ctx.db.get(args.agentId);
    if (!targetAgent) throw new Error("Agent introuvable.");
    await assertOutranks(ctx, actor, targetAgent);
    const id = await ctx.db.insert("disciplines", {
      agentId: args.agentId,
      motif: args.motif,
      sanction: args.sanction,
      imageUrls: args.imageUrls,
      status: "OUVERTE",
      byAgentId: actor._id,
      at: Date.now(),
    });
    await writeAudit(ctx, actor, { action: "discipline.create", resourceType: "discipline", resourceId: id });
    await notify(ctx, "discipline.create", {
      title: "Sanction disciplinaire ouverte",
      description: `**${targetAgent.prenomRP} ${targetAgent.nomRP}**`,
      color: NOTIFY_COLOR.danger,
      fields: [
        { name: "Motif", value: args.motif },
        { name: "Sanction", value: args.sanction, inline: true },
      ],
      url: await deepLink(ctx, "/discipline"),
      footer: `Ouverte par ${actor.prenomRP} ${actor.nomRP}`,
    });
    return id;
  },
});

export const close = mutation({
  args: { id: v.id("disciplines") },
  handler: async (ctx, { id }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "discipline.edit");
    await ctx.db.patch(id, { status: "CLOSE" });
    await writeAudit(ctx, actor, { action: "discipline.close", resourceType: "discipline", resourceId: id });
  },
});
