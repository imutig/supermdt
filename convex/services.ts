import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireAgent, requirePermission, can, agentLabel } from "./rbac";
import { writeAudit } from "./lib/audit";
import { releaseAgentFromPatrol } from "./dispatch";

function weekStart(now: number): number {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7; // 0 = lundi
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - day * 24 * 3600 * 1000;
}

// Mes services : total de la semaine + liste (§10).
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "service.self");
    const now = Date.now();
    const ws = weekStart(now);
    const sessions = await ctx.db
      .query("serviceSessions")
      .withIndex("by_agent", (q) => q.eq("agentId", agent._id))
      .order("desc")
      .take(60);
    let weekSeconds = 0;
    const list = sessions.map((s) => {
      const end = s.endedAt ?? now;
      const seconds = Math.max(0, Math.floor((end - s.startedAt) / 1000));
      const overlapStart = Math.max(s.startedAt, ws);
      if (end > overlapStart) weekSeconds += Math.floor((end - overlapStart) / 1000);
      return {
        _id: s._id,
        startedAt: s.startedAt,
        endedAt: s.endedAt ?? null,
        seconds,
        callsign: s.callsignType ?? null,
        open: s.endedAt == null,
      };
    });
    return { weekSeconds, sessions: list };
  },
});

// Gestion globale des services (§10) - permission services.manage. Paginé, avec
// filtre serveur optionnel par agent (index by_agent) plutôt qu'un chargement
// intégral filtré côté client.
export const all = query({
  args: { paginationOpts: paginationOptsValidator, agentId: v.optional(v.id("agents")) },
  handler: async (ctx, { paginationOpts, agentId }) => {
    const viewer = await requireAgent(ctx);
    await requirePermission(ctx, viewer, "services.manage");
    const now = Date.now();
    const res = agentId
      ? await ctx.db.query("serviceSessions").withIndex("by_agent", (q) => q.eq("agentId", agentId)).order("desc").paginate(paginationOpts)
      : await ctx.db.query("serviceSessions").order("desc").paginate(paginationOpts);
    const page = [];
    for (const s of res.page) {
      page.push({
        _id: s._id,
        agent: await agentLabel(ctx, s.agentId),
        startedAt: s.startedAt,
        endedAt: s.endedAt ?? null,
        seconds: Math.max(0, Math.floor(((s.endedAt ?? now) - s.startedAt) / 1000)),
        callsign: s.callsignType ?? null,
        open: s.endedAt == null,
      });
    }
    return { ...res, page };
  },
});

// Annuaire (borné) pour le filtre par agent de la gestion globale.
export const manageableAgents = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAgent(ctx);
    await requirePermission(ctx, viewer, "services.manage");
    const rows = await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "ACTIVE")).take(500);
    return rows
      .map((a) => ({ _id: a._id, matricule: a.matricule ?? (a.isOwner ? 0 : null), name: `${a.prenomRP} ${a.nomRP}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

async function loadOwnable(
  ctx: Parameters<typeof requireAgent>[0],
  sessionId: import("./_generated/dataModel").Id<"serviceSessions">,
) {
  const agent = await requireAgent(ctx);
  const s = await ctx.db.get(sessionId);
  if (!s) throw new ConvexError("Service introuvable.");
  const isMine = s.agentId === agent._id;
  const canManage = await can(ctx, agent, "services.manage");
  if (!isMine && !canManage) throw new ConvexError("Permission refusée.");
  if (isMine && !canManage) await requirePermission(ctx, agent, "service.self");
  return { agent, s };
}

export const update = mutation({
  args: { id: v.id("serviceSessions"), startedAt: v.number(), endedAt: v.optional(v.number()) },
  handler: async (ctx, { id, startedAt, endedAt }) => {
    const { agent, s } = await loadOwnable(ctx, id);
    if (endedAt != null && endedAt < startedAt) throw new ConvexError("Fin avant le début.");
    await ctx.db.patch(id, { startedAt, endedAt });
    await writeAudit(ctx, agent, {
      action: "service.edit",
      resourceType: "serviceSession",
      resourceId: id,
      before: { startedAt: s.startedAt, endedAt: s.endedAt },
      after: { startedAt, endedAt },
    });
  },
});

export const remove = mutation({
  args: { id: v.id("serviceSessions") },
  handler: async (ctx, { id }) => {
    const { agent } = await loadOwnable(ctx, id);
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, { action: "service.remove", resourceType: "serviceSession", resourceId: id });
  },
});

// Arrêter un service en cours (soi-même ou gestion globale).
export const cut = mutation({
  args: { id: v.id("serviceSessions") },
  handler: async (ctx, { id }) => {
    const { agent, s } = await loadOwnable(ctx, id);
    if (s.endedAt != null) return;
    await ctx.db.patch(id, { endedAt: Date.now() });
    // Hors service => l'agent quitte automatiquement sa patrouille.
    await releaseAgentFromPatrol(ctx, s.agentId);
    await writeAudit(ctx, agent, { action: "service.cut", resourceType: "serviceSession", resourceId: id });
  },
});
