import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";
import { parisWallToEpoch } from "./lib/paris";

function wallToEpoch(s?: string): number | undefined {
  if (!s) return undefined;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return undefined;
  return parisWallToEpoch(+m[1], +m[2], +m[3], +m[4], +m[5]);
}

async function nextReference(ctx: MutationCtx): Promise<number> {
  let max = 0;
  for (const c of await ctx.db.query("convocations").collect()) if ((c.reference ?? 0) > max) max = c.reference ?? 0;
  return max + 1;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "discipline.view");
    const rows = (await ctx.db.query("convocations").order("desc").take(60)).filter((c) => !c.deletedAt);
    const out = [];
    for (const c of rows) {
      const ag = c.agentId ? await ctx.db.get(c.agentId) : null;
      const by = c.byAgentId ? await ctx.db.get(c.byAgentId) : null;
      out.push({
        _id: c._id,
        agentId: c.agentId ?? null,
        agentName: ag ? `${ag.prenomRP} ${ag.nomRP}` : c.agentLabel ?? (c.discordId ? `Discord ${c.discordId}` : "-"),
        linked: !!(ag && ag.discordId),
        motif: c.motif,
        convokedAt: c.convokedAt ?? null,
        lieu: c.lieu ?? null,
        reference: c.reference ?? null,
        by: by ? `${by.prenomRP} ${by.nomRP}` : "-",
        at: c.at,
      });
    }
    return out;
  },
});

export const byAgent = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const viewer = await requireAgent(ctx);
    await requirePermission(ctx, viewer, "discipline.view");
    const rows = (await ctx.db.query("convocations").withIndex("by_agent", (q) => q.eq("agentId", agentId)).order("desc").collect()).filter((c) => !c.deletedAt);
    const out = [];
    for (const c of rows) {
      const by = c.byAgentId ? await ctx.db.get(c.byAgentId) : null;
      out.push({ _id: c._id, motif: c.motif, convokedAt: c.convokedAt ?? null, lieu: c.lieu ?? null, reference: c.reference ?? null, by: by ? `${by.prenomRP} ${by.nomRP}` : "-", at: c.at });
    }
    return out;
  },
});

export const create = mutation({
  args: {
    agentId: v.optional(v.id("agents")), // agent recensé (ping via son Discord lié)
    discordId: v.optional(v.string()), // OU ID Discord saisi à la main
    motif: v.string(),
    convokedAtWall: v.optional(v.string()), // "YYYY-MM-DDTHH:MM" (heure de Paris)
    lieu: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "convocations.create");
    if (!args.agentId && !(args.discordId && args.discordId.trim())) {
      throw new ConvexError("Choisis un agent recensé ou saisis un ID Discord.");
    }
    let agentLabel: string | undefined;
    if (args.agentId) {
      const ag = await ctx.db.get(args.agentId);
      if (!ag) throw new ConvexError("Agent introuvable.");
      agentLabel = `${ag.prenomRP} ${ag.nomRP}`;
    }
    const reference = await nextReference(ctx);
    const id = await ctx.db.insert("convocations", {
      agentId: args.agentId,
      discordId: args.agentId ? undefined : args.discordId?.trim(),
      agentLabel,
      motif: args.motif,
      convokedAt: wallToEpoch(args.convokedAtWall),
      lieu: args.lieu?.trim() || undefined,
      byAgentId: actor._id,
      at: Date.now(),
      reference,
      discordAnnounced: false, // le bot dépilera via convocationsToAnnounce
    });
    await writeAudit(ctx, actor, { action: "convocation.create", resourceType: "convocation", resourceId: id });
    await ctx.scheduler.runAfter(0, internal.push.notify, {}); // prévient le bot (embed + ping agent)
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("convocations") },
  handler: async (ctx, { id }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "discipline.delete");
    const c = await ctx.db.get(id);
    if (!c || c.deletedAt) return;
    await ctx.db.patch(id, { deletedAt: Date.now(), deletedBy: actor._id });
    await writeAudit(ctx, actor, { action: "convocation.remove", resourceType: "convocation", resourceId: id });
  },
});
