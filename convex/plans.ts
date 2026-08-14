import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAgent } from "./rbac";

// Plans de carte personnels. Chaque agent gère les siens ; aucun droit spécial
// requis (juste être un agent). Partage en lecture seule via un code unique.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode(): string {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
  return `${part()}-${part()}`;
}

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    return (await ctx.db.query("mapPlans").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).collect())
      .filter((p) => !p.deletedAt)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((p) => ({ _id: p._id, name: p.name, shareCode: p.shareCode, updatedAt: p.updatedAt }));
  },
});

export const get = query({
  args: { planId: v.id("mapPlans") },
  handler: async (ctx, { planId }) => {
    const agent = await requireAgent(ctx);
    const p = await ctx.db.get(planId);
    if (!p || p.deletedAt || p.agentId !== agent._id) return null;
    return { _id: p._id, name: p.name, shapes: p.shapes, shareCode: p.shareCode, updatedAt: p.updatedAt };
  },
});

// Ouvre un plan partagé en lecture seule via son code (n'importe quel agent).
export const byCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const agent = await requireAgent(ctx);
    void agent;
    const p = await ctx.db.query("mapPlans").withIndex("by_code", (q) => q.eq("shareCode", code.trim().toUpperCase())).first();
    if (!p || p.deletedAt) return null;
    const owner = await ctx.db.get(p.agentId);
    return { name: p.name, shapes: p.shapes, owner: owner ? `${owner.prenomRP} ${owner.nomRP}` : "Agent", updatedAt: p.updatedAt };
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const agent = await requireAgent(ctx);
    let code = genCode();
    while (await ctx.db.query("mapPlans").withIndex("by_code", (q) => q.eq("shareCode", code)).first()) code = genCode();
    const now = Date.now();
    return await ctx.db.insert("mapPlans", { agentId: agent._id, name: name.trim() || "Plan sans nom", shapes: "[]", shareCode: code, createdAt: now, updatedAt: now });
  },
});

export const save = mutation({
  args: { planId: v.id("mapPlans"), name: v.optional(v.string()), shapes: v.string() },
  handler: async (ctx, { planId, name, shapes }) => {
    const agent = await requireAgent(ctx);
    const p = await ctx.db.get(planId);
    if (!p || p.deletedAt || p.agentId !== agent._id) throw new ConvexError("Plan introuvable.");
    await ctx.db.patch(planId, { shapes, updatedAt: Date.now(), ...(name !== undefined ? { name: name.trim() || p.name } : {}) });
  },
});

export const remove = mutation({
  args: { planId: v.id("mapPlans") },
  handler: async (ctx, { planId }) => {
    const agent = await requireAgent(ctx);
    const p = await ctx.db.get(planId);
    if (!p || p.agentId !== agent._id) return;
    await ctx.db.patch(planId, { deletedAt: Date.now() });
  },
});
