import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAgent, requirePermission, agentLabel } from "./rbac";
import { writeAudit } from "./lib/audit";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";

async function citizenName(ctx: QueryCtx, id: Id<"citizens"> | undefined | null) {
  if (!id) return null;
  const c = await ctx.db.get(id);
  return c ? `${c.prenom} ${c.nom}` : null;
}

async function shape(ctx: QueryCtx, c: import("./_generated/dataModel").Doc<"complaints">) {
  const agents = [];
  for (const aid of c.agentIds) agents.push(await agentLabel(ctx, aid));
  return {
    _id: c._id,
    at: c.at,
    plaignantId: c.plaignantId,
    plaignant: await citizenName(ctx, c.plaignantId),
    defendantCitizenId: c.defendantCitizenId ?? null,
    defendant: c.defendantCitizenId ? await citizenName(ctx, c.defendantCitizenId) : c.defendantName ?? "Non recensé",
    motif: c.motif,
    status: c.status,
    avocat: c.avocat ?? null,
    body: c.body,
    agents,
    agentIds: c.agentIds,
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "plaintes.view");
    const rows = await ctx.db.query("complaints").order("desc").take(80);
    const out = [];
    for (const c of rows) {
      if (c.deletedAt) continue;
      out.push(await shape(ctx, c));
    }
    return out;
  },
});

// Plaintes déposées PAR et CONTRE un citoyen (onglet dossier, item 2).
export const byCitizen = query({
  args: { citizenId: v.id("citizens") },
  handler: async (ctx, { citizenId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "plaintes.view");
    const filed = await ctx.db
      .query("complaints")
      .withIndex("by_plaignant", (q) => q.eq("plaignantId", citizenId))
      .collect();
    const against = await ctx.db
      .query("complaints")
      .withIndex("by_defendant", (q) => q.eq("defendantCitizenId", citizenId))
      .collect();
    const filedOut = [];
    for (const c of filed) if (!c.deletedAt) filedOut.push(await shape(ctx, c));
    const againstOut = [];
    for (const c of against) if (!c.deletedAt) againstOut.push(await shape(ctx, c));
    return { filed: filedOut, against: againstOut };
  },
});

export const get = query({
  args: { id: v.id("complaints") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "plaintes.view");
    const c = await ctx.db.get(id);
    if (!c || c.deletedAt) return null;
    return shape(ctx, c);
  },
});

export const create = mutation({
  args: {
    plaignantId: v.id("citizens"),
    defendantCitizenId: v.optional(v.id("citizens")),
    defendantName: v.optional(v.string()),
    agentIds: v.array(v.id("agents")),
    motif: v.string(),
    status: v.string(),
    avocat: v.optional(v.string()),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "plaintes.create");
    const id = await ctx.db.insert("complaints", { ...args, at: Date.now(), createdBy: agent._id });
    await writeAudit(ctx, agent, { action: "complaint.create", resourceType: "complaint", resourceId: id, resourceLabel: args.motif });
    await notify(ctx, "plainte.create", {
      title: "Plainte déposée",
      description: `**${args.motif}**`,
      color: NOTIFY_COLOR.info,
      fields: [{ name: "Statut", value: args.status, inline: true }],
      url: await deepLink(ctx, "/plaintes"),
      footer: `Enregistrée par ${agent.prenomRP} ${agent.nomRP}`,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("complaints"),
    defendantCitizenId: v.optional(v.id("citizens")),
    defendantName: v.optional(v.string()),
    agentIds: v.array(v.id("agents")),
    motif: v.string(),
    status: v.string(),
    avocat: v.optional(v.string()),
    body: v.string(),
  },
  handler: async (ctx, { id, ...f }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "plaintes.edit");
    await ctx.db.patch(id, f);
    await writeAudit(ctx, agent, { action: "complaint.update", resourceType: "complaint", resourceId: id, resourceLabel: f.motif });
  },
});

export const remove = mutation({
  args: { id: v.id("complaints") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "plaintes.delete");
    await ctx.db.patch(id, { deletedAt: Date.now(), deletedBy: agent._id });
    await writeAudit(ctx, agent, { action: "complaint.delete", resourceType: "complaint", resourceId: id });
  },
});
