import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent } from "./rbac";
import type { Doc, Id } from "./_generated/dataModel";

const DAY = 86_400_000;
// Cache de la page profil : le calcul lit toutes les sessions + casiers +
// contraventions de l'agent. On le met en cache 90 s (recalcul à l'ouverture si
// périmé) : l'agent voit ses chiffres quasi temps réel, sans relire ces tables à
// chaque render réactif.
const PROFILE_TTL = 90 * 1000;

// Calcul brut des données de « Mon profil » (mis en cache par `me`/`refreshMe`).
async function computeMe(ctx: QueryCtx | MutationCtx, agent: Doc<"agents">) {
    const now = Date.now();
    const weekAgo = now - 7 * DAY;

    const grade = agent.gradeId ? await ctx.db.get(agent.gradeId) : null;
    const divLinks = await ctx.db.query("agentDivisions").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).collect();
    const divisions = [];
    for (const l of divLinks) { const d = await ctx.db.get(l.divisionId); if (d) divisions.push(d.name); }
    const qualLinks = await ctx.db
      .query("agentQualifications")
      .withIndex("by_agent", (q) => q.eq("agentId", agent._id))
      .collect();
    const qualifications = [];
    for (const l of qualLinks) {
      const q = await ctx.db.get(l.qualificationId);
      if (q) qualifications.push({ code: q.code, name: q.name, kind: q.kind, color: q.color ?? null, at: l.at });
    }

    // ---- Service / heures ----
    const sessions = await ctx.db.query("serviceSessions").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).collect();
    let totalMs = 0, weekMs = 0, openSince: number | null = null;
    for (const s of sessions) {
      const end = s.endedAt ?? now;
      const dur = Math.max(0, end - s.startedAt);
      totalMs += dur;
      const overlapStart = Math.max(s.startedAt, weekAgo);
      if (end > overlapStart) weekMs += end - overlapStart;
      if (!s.endedAt) openSince = s.startedAt;
    }

    // ---- Activité (arrestations + contraventions par moi) ----
    // Lu via les index PAR AGENT (casierOfficers.by_officer / citations.by_officer) :
    // on ne lit que MES lignes et on ne re-souscrit qu'à MES écritures - au lieu de
    // scanner (et de s'abonner à) toute la table à chaque écriture d'un autre agent.
    // « Mes arrestations » = les casiers où je suis un agent IMPLIQUÉ (créateur
    // inclus), via la jointure casierOfficers. On relit l'entrée pour écarter les
    // archivées / annulées. Pas de scan de tableau (officerIds n'est pas indexable).
    let myArrests = 0, myArrestsMonth = 0;
    const monthAgo = now - 30 * DAY;
    for (const jr of await ctx.db.query("casierOfficers").withIndex("by_officer", (q) => q.eq("officerId", agent._id)).collect()) {
      const e = await ctx.db.get(jr.entryId);
      if (!e || e.deletedAt || e.status === "ANNULEE") continue;
      myArrests++;
      if (e.at >= monthAgo) myArrestsMonth++;
    }
    let myCitations = 0, myCitationsMonth = 0;
    for (const c of await ctx.db.query("citations").withIndex("by_officer", (q) => q.eq("officerId", agent._id)).collect()) {
      if (c.deletedAt || c.status === "ANNULEE") continue;
      myCitations++;
      if (c.at >= monthAgo) myCitationsMonth++;
    }

    // ---- Mes rapports (lead + contributions) ----
    const reportMap = new Map<string, { _id: Id<"reports">; title: string; status: string; at: number; role: string }>();
    for (const r of await ctx.db.query("reports").withIndex("by_lead", (q) => q.eq("leadId", agent._id)).order("desc").take(30)) {
      if (r.deletedAt) continue;
      reportMap.set(r._id, { _id: r._id, title: r.title, status: r.status, at: r._creationTime, role: "Lead" });
    }
    const contribLinks = await ctx.db.query("reportContributors").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).order("desc").take(40);
    for (const l of contribLinks) {
      if (reportMap.has(l.reportId)) continue;
      const r = await ctx.db.get(l.reportId);
      if (!r || r.deletedAt) continue;
      reportMap.set(r._id, { _id: r._id, title: r.title, status: r.status, at: r._creationTime, role: "Contributeur" });
    }
    const reports = [...reportMap.values()].sort((a, b) => b.at - a.at).slice(0, 12);

    return {
      agent: {
        prenomRP: agent.prenomRP,
        nomRP: agent.nomRP,
        login: agent.login,
        matricule: agent.matricule ?? (agent.isOwner ? 0 : null),
        isOwner: agent.isOwner,
        avatarUrl: agent.avatarUrl ?? null,
        gradeName: agent.isOwner ? "Owner" : grade?.name ?? "-",
        divisions,
        qualifications,
        dateEntree: agent.dateEntree ?? null,
        status: agent.status,
      },
      service: { totalMs, weekMs, sessionCount: sessions.length, openSince },
      activity: { myArrests, myArrestsMonth, myCitations, myCitationsMonth },
      reports,
    };
}

// Lecture (page Mon profil) : sert le cache. `null` = pas encore calculé.
export const me = query({
  args: {},
  handler: async (ctx): Promise<(Awaited<ReturnType<typeof computeMe>> & { computedAt: number; stale: boolean }) | null> => {
    const agent = await requireAgent(ctx);
    const row = await ctx.db.query("statsRangeCache").withIndex("by_key", (q) => q.eq("key", `p:${agent._id}`)).unique();
    if (!row) return null;
    return { ...(JSON.parse(row.data) as Awaited<ReturnType<typeof computeMe>>), computedAt: row.computedAt, stale: Date.now() - row.computedAt > PROFILE_TTL };
  },
});

// Recalcul du profil (à l'ouverture si périmé/absent, ou `force`). Ne recalcule
// pas si le cache a moins de 90 s.
export const refreshMe = mutation({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, { force }) => {
    const agent = await requireAgent(ctx);
    const key = `p:${agent._id}`;
    const row = await ctx.db.query("statsRangeCache").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (row && force !== true && Date.now() - row.computedAt < PROFILE_TTL) return { cached: true as const };
    const data = JSON.stringify(await computeMe(ctx, agent));
    if (row) await ctx.db.patch(row._id, { data, computedAt: Date.now() });
    else await ctx.db.insert("statsRangeCache", { key, data, computedAt: Date.now() });
    return { cached: false as const };
  },
});
