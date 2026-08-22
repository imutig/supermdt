import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";

// Référentiel des tenues : nom + catégorie + tags + photo + code à copier. Saisie
// manuelle. Lecture réservée à `tenues.view`, gestion à `tenues.manage`.

// Normalise/dédoublonne une liste de tags (minuscule, trim, sans vide).
function cleanTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((t) => t.trim()).filter(Boolean))].slice(0, 20);
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "tenues.view");
    return (await ctx.db.query("tenues").withIndex("by_position").collect())
      .filter((t) => !t.deletedAt)
      .map((t) => ({
        _id: t._id,
        name: t.name,
        category: t.category ?? null,
        tags: t.tags ?? [],
        photoUrl: t.photoUrl ?? null,
        code: t.code,
        position: t.position,
      }));
  },
});

export const upsert = mutation({
  args: {
    id: v.optional(v.id("tenues")),
    name: v.string(),
    category: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    photoUrl: v.optional(v.union(v.string(), v.null())),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "tenues.manage");
    const name = args.name.trim();
    const code = args.code.trim();
    if (!name) throw new ConvexError("Le nom de la tenue est requis.");
    if (!code) throw new ConvexError("Le code de la tenue est requis.");
    const base = {
      name,
      category: args.category?.trim() || undefined,
      tags: cleanTags(args.tags),
      photoUrl: args.photoUrl ?? undefined,
      code,
      updatedBy: agent._id,
      updatedAt: Date.now(),
    };
    if (args.id) {
      await ctx.db.patch(args.id, base);
      await writeAudit(ctx, agent, { action: "tenue.save", resourceType: "tenue", resourceId: args.id, resourceLabel: name });
      return args.id;
    }
    const count = (await ctx.db.query("tenues").collect()).filter((t) => !t.deletedAt).length;
    const id = await ctx.db.insert("tenues", { ...base, position: count });
    await writeAudit(ctx, agent, { action: "tenue.save", resourceType: "tenue", resourceId: id, resourceLabel: name });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("tenues") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "tenues.manage");
    const before = await ctx.db.get(id);
    if (!before || before.deletedAt) return;
    await ctx.db.patch(id, { deletedAt: Date.now(), deletedBy: agent._id });
    await writeAudit(ctx, agent, { action: "tenue.delete", resourceType: "tenue", resourceId: id, resourceLabel: before.name });
  },
});
