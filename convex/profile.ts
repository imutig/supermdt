import { query } from "./_generated/server";
import { requireAgent } from "./rbac";
import type { Id } from "./_generated/dataModel";

const DAY = 86_400_000;

// Données de la page "Mon profil" : infos, service/heures, rapports, activité.
export const me = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
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
    let myArrests = 0, myArrestsMonth = 0;
    const monthAgo = now - 30 * DAY;
    for (const e of await ctx.db.query("casierEntries").order("desc").take(2000)) {
      if (e.deletedAt || e.status === "ANNULEE") continue;
      if (e.officerIds.includes(agent._id) || e.createdBy === agent._id) {
        myArrests++;
        if (e.at >= monthAgo) myArrestsMonth++;
      }
    }
    let myCitations = 0, myCitationsMonth = 0;
    for (const c of await ctx.db.query("citations").order("desc").take(2000)) {
      if (c.deletedAt || c.status === "ANNULEE") continue;
      if (c.officerId === agent._id) {
        myCitations++;
        if (c.at >= monthAgo) myCitationsMonth++;
      }
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
  },
});
