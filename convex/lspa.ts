import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";

// Portail de la Police Academy.

// Chiffres d'accueil : effectif de la promotion et encadrement.
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.view");

    const grades = await ctx.db.query("grades").collect();
    const cadetGradeIds = new Set(grades.filter((g) => g.academyOnly).map((g) => g._id as string));

    const actifs = await ctx.db
      .query("agents")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .collect();

    const cadets = actifs.filter((a) => a.gradeId && cadetGradeIds.has(a.gradeId as string)).length;
    const encadrants = actifs.filter((a) => a.academyRankId).length;
    const enAttente = (await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "PENDING")).collect()).length;

    return { cadets, encadrants, enAttente };
  },
});

// Tableau de bord de l'encadrement : chiffres clés + ce qui demande une action.
export const staffHome = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.view");

    const grades = await ctx.db.query("grades").collect();
    const cadetGradeIds = new Set(grades.filter((g) => g.academyOnly).map((g) => g._id as string));
    const entryGrade = grades.filter((g) => !g.academyOnly && !g.external).sort((a, b) => a.position - b.position)[0];

    const actifs = await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "ACTIVE")).collect();
    const cadets = actifs.filter((a) => a.gradeId && cadetGradeIds.has(a.gradeId as string)).length;
    const encadrants = actifs.filter((a) => a.academyRankId).length;
    const enAttente = (await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "PENDING")).collect()).length;
    const offi1 = entryGrade ? actifs.filter((a) => a.gradeId === entryGrade._id && !a.isOwner).length : 0;

    const promos = await ctx.db.query("promotions").collect();
    const promosOuvertes = promos.filter((p) => p.status === "OPEN");
    const memberCount = new Map<string, number>();
    for (const m of await ctx.db.query("promotionMembers").collect()) {
      if (m.status === "ACTIVE") memberCount.set(m.promotionId as string, (memberCount.get(m.promotionId as string) ?? 0) + 1);
    }

    // Sessions ouvertes + copies à corriger (sessions terminées non publiées).
    const sessions = await ctx.db.query("quizSessions").collect();
    const openSessions = sessions.filter((s) => s.status === "LOBBY" || s.status === "RUNNING");
    const closedSessions = sessions.filter((s) => s.status === "CLOSED");
    let copiesACorriger = 0;
    for (const s of closedSessions) {
      const parts = await ctx.db.query("quizParticipants").withIndex("by_session", (q) => q.eq("sessionId", s._id)).collect();
      copiesACorriger += parts.filter((p) => p.needsGrading).length;
    }

    return {
      cadets, encadrants, enAttente, offi1,
      promosOuvertes: promosOuvertes.length,
      sessionsEnCours: openSessions.length,
      copiesACorriger,
      openSessions: openSessions.sort((a, b) => b.openedAt - a.openedAt).map((s) => ({ _id: s._id, title: s.title, status: s.status })),
      promotions: promosOuvertes.sort((a, b) => b.startAt - a.startAt).map((p) => ({ _id: p._id, name: p.name, cadets: memberCount.get(p._id as string) ?? 0 })),
    };
  },
});

// Accueil du cadet : uniquement ses données (aucune information confidentielle
// sur la promo, les autres cadets ou l'encadrement).
export const cadetHome = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.view");

    // Promo active du cadet.
    const memberships = await ctx.db.query("promotionMembers").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).collect();
    const active = memberships.find((m) => m.status === "ACTIVE");
    const promo = active ? await ctx.db.get(active.promotionId) : null;

    // Ses résultats de quiz publiés.
    const parts = await ctx.db.query("quizParticipants").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).collect();
    const results = [];
    let sumPct = 0, passed = 0;
    for (const p of parts) {
      const s = await ctx.db.get(p.sessionId);
      if (!s || s.status !== "PUBLISHED") continue;
      const quiz = await ctx.db.get(s.quizId);
      const max = (await ctx.db.query("quizQuestions").withIndex("by_quiz", (q) => q.eq("quizId", s.quizId)).collect()).reduce((a, q) => a + q.points, 0);
      const score = p.autoScore + (p.manualScore ?? 0);
      const pct = max > 0 ? Math.round((score / max) * 100) : 0;
      const ok = typeof quiz?.passPercent === "number" ? pct >= quiz.passPercent : null;
      if (ok) passed++;
      sumPct += pct;
      results.push({ sessionId: s._id, title: s.title, score, max, pct, passed: ok, publishedAt: s.publishedAt ?? 0 });
    }
    results.sort((a, b) => b.publishedAt - a.publishedAt);

    // Sessions ouvertes qu'il peut rejoindre / reprendre.
    const lobby = await ctx.db.query("quizSessions").withIndex("by_status", (q) => q.eq("status", "LOBBY")).collect();
    const running = await ctx.db.query("quizSessions").withIndex("by_status", (q) => q.eq("status", "RUNNING")).collect();
    const bySession = new Map(parts.map((p) => [p.sessionId as string, p]));
    const openSessions = [...lobby, ...running].map((s) => ({
      _id: s._id, title: s.title, status: s.status,
      joined: bySession.has(s._id as string), submitted: !!bySession.get(s._id as string)?.submittedAt,
    }));

    // Ses collègues cadets : les participants actuels de l'académie (noms +
    // groupe seulement, aucune note).
    const grades = await ctx.db.query("grades").collect();
    const cadetGradeIds = new Set(grades.filter((g) => g.academyOnly).map((g) => g._id as string));
    const groupByAgent = new Map<string, string>();
    for (const m of await ctx.db.query("promotionMembers").collect()) {
      if (m.status === "ACTIVE" && m.group) groupByAgent.set(m.agentId as string, m.group);
    }
    const actifs = await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "ACTIVE")).collect();
    const colleagues = actifs
      .filter((a) => a.gradeId && cadetGradeIds.has(a.gradeId as string) && !a.isOwner)
      .map((a) => ({ _id: a._id, name: `${a.prenomRP} ${a.nomRP}`, avatarUrl: a.avatarUrl ?? null, group: groupByAgent.get(a._id as string) ?? null, isMe: a._id === agent._id }))
      .sort((x, y) => (x.group ?? "~").localeCompare(y.group ?? "~") || x.name.localeCompare(y.name));

    return {
      prenomRP: agent.prenomRP,
      promo: promo ? promo.name : null,
      group: active?.group ?? null,
      quizzesTaken: results.length,
      averagePct: results.length ? Math.round(sumPct / results.length) : null,
      passedCount: passed,
      recent: results.slice(0, 5),
      openSessions,
      colleagues,
    };
  },
});

// Effectif de l'académie : la promotion (les cadets) d'un côté, l'encadrement
// de l'autre. Un encadrant reste un agent LSPD ; son grade d'académie se
// superpose à son grade opérationnel, il ne le remplace pas.
export const effectif = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAgent(ctx);
    await requirePermission(ctx, viewer, "lspa.effectif.view");

    const grades = await ctx.db.query("grades").collect();
    const gradeById = new Map(grades.map((g) => [g._id as string, g]));
    const ranks = (await ctx.db.query("academyRanks").withIndex("by_position").collect())
      .filter((r) => r.active !== false)
      .sort((a, b) => b.position - a.position);
    const rankById = new Map(ranks.map((r) => [r._id as string, r]));

    const actifs = await ctx.db
      .query("agents")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .collect();
    const onDutyIds = new Set(
      (await ctx.db.query("serviceSessions").withIndex("by_open", (q) => q.eq("endedAt", undefined)).collect())
        .map((x) => x.agentId as string),
    );
    // Groupe (A/B) du cadet dans sa promo active, pour l'afficher dans l'effectif.
    const groupByAgent = new Map<string, string>();
    for (const m of await ctx.db.query("promotionMembers").collect()) {
      if (m.status === "ACTIVE" && m.group) groupByAgent.set(m.agentId as string, m.group);
    }

    const cadets = [];
    const encadrants = [];
    const assignables = [];
    for (const a of actifs) {
      if (a.isOwner) continue;
      const grade = a.gradeId ? gradeById.get(a.gradeId as string) ?? null : null;
      const base = {
        _id: a._id,
        prenomRP: a.prenomRP,
        nomRP: a.nomRP,
        matricule: a.matricule,
        avatarUrl: a.avatarUrl ?? null,
        dateEntree: a.dateEntree ?? null,
        onDuty: onDutyIds.has(a._id as string),
        grade: grade?.name ?? null,
      };
      if (grade?.academyOnly) {
        cadets.push({ ...base, group: groupByAgent.get(a._id as string) ?? null });
        continue;
      }
      if (grade?.external) continue; // un grade extérieur n'encadre pas l'académie
      const rank = a.academyRankId ? rankById.get(a.academyRankId as string) ?? null : null;
      if (rank) {
        encadrants.push({
          ...base,
          rank: { _id: rank._id, name: rank.name, abbrev: rank.abbrev, color: rank.color, position: rank.position },
        });
      } else {
        assignables.push(base);
      }
    }

    cadets.sort((a, b) => (a.dateEntree ?? 0) - (b.dateEntree ?? 0));
    encadrants.sort((a, b) => b.rank.position - a.rank.position);
    assignables.sort((a, b) => `${a.nomRP}${a.prenomRP}`.localeCompare(`${b.nomRP}${b.prenomRP}`));

    return {
      cadets,
      encadrants,
      assignables,
      ranks: ranks.map((r) => ({ _id: r._id, name: r.name, abbrev: r.abbrev, color: r.color, position: r.position })),
    };
  },
});

// Attribution ou retrait d'un grade d'académie. Volontairement sans contrôle
// hiérarchique LSPD : l'encadrement de l'académie ne suit pas la hiérarchie
// opérationnelle, un Academy Director peut être Officier au commissariat.
export const setAcademyRank = mutation({
  args: { agentId: v.id("agents"), rankId: v.optional(v.id("academyRanks")) },
  handler: async (ctx, { agentId, rankId }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "lspa.rank.manage");

    const target = await ctx.db.get(agentId);
    if (!target) throw new ConvexError("Agent introuvable.");
    if (target.isOwner) throw new ConvexError("Le compte propriétaire est intouchable.");

    const grade = target.gradeId ? await ctx.db.get(target.gradeId) : null;
    if (grade?.academyOnly) throw new ConvexError("Un cadet ne peut pas encadrer l'académie.");
    if (grade?.external) throw new ConvexError("Un grade extérieur ne peut pas encadrer l'académie.");

    const before = target.academyRankId ? await ctx.db.get(target.academyRankId) : null;
    const after = rankId ? await ctx.db.get(rankId) : null;
    if (rankId && !after) throw new ConvexError("Grade d'académie introuvable.");

    await ctx.db.patch(agentId, { academyRankId: rankId });
    await writeAudit(ctx, actor, {
      action: "lspa.rank_change",
      resourceType: "agent",
      resourceId: agentId,
      resourceLabel: `${target.prenomRP} ${target.nomRP}`,
      before: { rank: before?.name },
      after: { rank: after?.name },
    });
  },
});
