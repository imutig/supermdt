import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";

// Ressources = livret d'apprentissage des cadets (§9). Remplace Formations.
// Permissions réutilisées : formations.view / formations.manage.

export const list = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "formations.view");
    const categories = (await ctx.db.query("resourceCategories").collect()).sort(
      (a, b) => a.position - b.position,
    );
    const articles = await ctx.db.query("resources").collect();
    return categories.map((c) => ({
      _id: c._id,
      name: c.name,
      articles: articles
        .filter((a) => a.categoryId === c._id)
        .sort((a, b) => a.position - b.position)
        .map((a) => ({ _id: a._id, title: a.title, content: a.content, imageUrls: a.imageUrls ?? [], categoryId: a.categoryId })),
    }));
  },
});

export const upsert = mutation({
  args: {
    id: v.optional(v.id("resources")),
    categoryId: v.id("resourceCategories"),
    title: v.string(),
    content: v.string(),
    imageUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, args.id ? "formations.edit" : "formations.create");
    if (args.id) {
      await ctx.db.patch(args.id, {
        categoryId: args.categoryId,
        title: args.title,
        content: args.content,
        imageUrls: args.imageUrls,
        updatedBy: agent._id,
        updatedAt: Date.now(),
      });
      await writeAudit(ctx, agent, { action: "resource.edit", resourceType: "resource", resourceId: args.id, resourceLabel: args.title });
      return args.id;
    }
    const count = (await ctx.db.query("resources").collect()).length;
    const id = await ctx.db.insert("resources", {
      categoryId: args.categoryId,
      title: args.title,
      content: args.content,
      imageUrls: args.imageUrls,
      position: count,
      updatedBy: agent._id,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, agent, { action: "resource.create", resourceType: "resource", resourceId: id, resourceLabel: args.title });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("resources") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "formations.delete");
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, { action: "resource.delete", resourceType: "resource", resourceId: id });
  },
});
