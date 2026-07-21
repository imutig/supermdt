import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";

// Carte de Los Santos (§19). Lieux/secteurs configurables, fond d'image paramétrable.

export const get = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "carte.view");
    const config = await ctx.db.query("mapConfig").first();
    const locations = await ctx.db.query("mapLocations").collect();
    return {
      imageUrl: config?.imageUrl ?? null,
      locations: locations.map((l) => ({
        _id: l._id,
        name: l.name,
        kind: l.kind,
        x: l.x,
        y: l.y,
        color: l.color ?? null,
        points: l.points ?? null,
        note: l.note ?? null,
      })),
    };
  },
});

export const setImage = mutation({
  args: { imageUrl: v.optional(v.string()) },
  handler: async (ctx, { imageUrl }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "carte.edit");
    const existing = await ctx.db.query("mapConfig").first();
    if (existing) await ctx.db.patch(existing._id, { imageUrl, updatedBy: agent._id, updatedAt: Date.now() });
    else await ctx.db.insert("mapConfig", { imageUrl, updatedBy: agent._id, updatedAt: Date.now() });
    await writeAudit(ctx, agent, { action: "carte.set_image", resourceType: "config", resourceLabel: "carte" });
  },
});

export const addLocation = mutation({
  args: {
    name: v.string(),
    kind: v.union(v.literal("LIEU"), v.literal("SECTEUR")),
    x: v.number(),
    y: v.number(),
    color: v.optional(v.string()),
    points: v.optional(v.array(v.object({ x: v.number(), y: v.number() }))),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "carte.create");
    const id = await ctx.db.insert("mapLocations", { ...args, createdBy: agent._id });
    await writeAudit(ctx, agent, { action: "carte.add_location", resourceType: "config", resourceLabel: args.name });
    return id;
  },
});

export const removeLocation = mutation({
  args: { id: v.id("mapLocations") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "carte.delete");
    const l = await ctx.db.get(id);
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, { action: "carte.remove_location", resourceType: "config", resourceLabel: l?.name ?? "" });
  },
});
