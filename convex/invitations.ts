import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export const create = mutation({
  args: {
    type: v.union(v.literal("SINGLE"), v.literal("MULTI")),
    maxUses: v.optional(v.number()),
    expiresInHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "invites.manage");
    let code = genCode();
    while (
      await ctx.db
        .query("invitations")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique()
    ) {
      code = genCode();
    }
    const maxUses = args.type === "SINGLE" ? 1 : (args.maxUses ?? 10);
    const expiresAt = args.expiresInHours ? Date.now() + args.expiresInHours * 3600_000 : undefined;
    const id = await ctx.db.insert("invitations", {
      code,
      type: args.type,
      maxUses,
      usesCount: 0,
      expiresAt,
      createdBy: agent._id,
      revoked: false,
    });
    await writeAudit(ctx, agent, {
      action: "invite.create",
      resourceType: "invitation",
      resourceId: id,
      resourceLabel: code,
    });
    return code;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "invites.manage");
    const rows = await ctx.db.query("invitations").order("desc").take(50);
    const out = [];
    for (const r of rows) {
      const creator = await ctx.db.get(r.createdBy);
      const expired = r.expiresAt != null && r.expiresAt < Date.now();
      const usable = !r.revoked && !expired && r.usesCount < r.maxUses;
      out.push({
        _id: r._id,
        code: r.code,
        type: r.type,
        maxUses: r.maxUses,
        usesCount: r.usesCount,
        expiresAt: r.expiresAt ?? null,
        revoked: r.revoked,
        usable,
        creator: creator ? `${creator.prenomRP} ${creator.nomRP}` : "-",
        createdAt: r._creationTime,
      });
    }
    return out;
  },
});

export const revoke = mutation({
  args: { id: v.id("invitations") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "invites.manage");
    await ctx.db.patch(id, { revoked: true });
    await writeAudit(ctx, agent, { action: "invite.revoke", resourceType: "invitation", resourceId: id });
  },
});
