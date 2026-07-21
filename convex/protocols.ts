import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "protocoles.view");
    return ctx.db.query("protocols").withIndex("by_position").collect();
  },
});

export const upsert = mutation({
  args: {
    id: v.optional(v.id("protocols")),
    title: v.string(),
    category: v.optional(v.string()),
    content: v.string(),
    imageUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, args.id ? "protocoles.edit" : "protocoles.create");
    if (args.id) {
      await ctx.db.patch(args.id, {
        title: args.title,
        category: args.category,
        content: args.content,
        imageUrls: args.imageUrls,
        updatedBy: agent._id,
        updatedAt: Date.now(),
      });
      await writeAudit(ctx, agent, { action: "protocole.edit", resourceType: "protocol", resourceId: args.id, resourceLabel: args.title });
      return args.id;
    }
    const count = (await ctx.db.query("protocols").collect()).length;
    const id = await ctx.db.insert("protocols", {
      title: args.title,
      category: args.category,
      content: args.content,
      imageUrls: args.imageUrls,
      position: count,
      updatedBy: agent._id,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, agent, { action: "protocole.create", resourceType: "protocol", resourceId: id, resourceLabel: args.title });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("protocols") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "protocoles.delete");
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, { action: "protocole.delete", resourceType: "protocol", resourceId: id });
  },
});
