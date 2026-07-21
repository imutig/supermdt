import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";

export const byCitizen = query({
  args: { citizenId: v.id("citizens") },
  handler: async (ctx, { citizenId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "citoyens.view");
    const rows = await ctx.db
      .query("citizenNotes")
      .withIndex("by_citizen", (q) => q.eq("citizenId", citizenId))
      .order("desc")
      .collect();
    const out = [];
    for (const n of rows) {
      const a = n.byAgentId ? await ctx.db.get(n.byAgentId) : null;
      out.push({
        _id: n._id,
        text: n.text,
        tone: n.tone ?? "neutral",
        author: a ? `${a.prenomRP} ${a.nomRP}` : "-",
        mine: n.byAgentId === agent._id,
        at: n.at,
      });
    }
    return out;
  },
});

export const add = mutation({
  args: { citizenId: v.id("citizens"), text: v.string(), tone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "citoyens.flag");
    const id = await ctx.db.insert("citizenNotes", {
      citizenId: args.citizenId,
      text: args.text,
      tone: args.tone,
      byAgentId: agent._id,
      at: Date.now(),
    });
    await writeAudit(ctx, agent, { action: "citizen.note_add", resourceType: "citizen", resourceId: args.citizenId });
    return id;
  },
});

// Suppression d'une note. L'auteur peut retirer la sienne ; au-delà, il faut
// le droit d'éditer les dossiers citoyens.
export const remove = mutation({
  args: { id: v.id("citizenNotes") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    const note = await ctx.db.get(id);
    if (!note) return;
    if (note.byAgentId !== agent._id) {
      await requirePermission(ctx, agent, "citoyens.edit");
    }
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, {
      action: "citizen.note_remove",
      resourceType: "citizen",
      resourceId: note.citizenId,
    });
  },
});
