import { v } from "convex/values";
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
        cadets.push(base);
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

// Fiche d'un cadet : identité, moyenne par catégorie de quiz, et l'historique
// de ses épreuves publiées. Base volontairement sobre ; le contenu détaillé
// (évaluations, notes d'encadrant) viendra s'y greffer.
export const cadetSheet = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const viewer = await requireAgent(ctx);
    await requirePermission(ctx, viewer, "lspa.effectif.view");
    const agent = await ctx.db.get(agentId);
    if (!agent) return null;
    const grade = agent.gradeId ? await ctx.db.get(agent.gradeId) : null;

    const categories = (await ctx.db.query("quizCategories").withIndex("by_position").collect());
    const catById = new Map(categories.map((c) => [c._id as string, c]));

    const participations = await ctx.db
      .query("quizParticipants")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .collect();

    // Par catégorie : cumul des points obtenus / possibles, pour une moyenne.
    const catAgg = new Map<string, { got: number; max: number; count: number }>();
    const history = [];
    for (const p of participations) {
      const session = await ctx.db.get(p.sessionId);
      if (!session || session.status !== "PUBLISHED") continue;
      const quiz = await ctx.db.get(session.quizId);
      const maxPoints = (await ctx.db.query("quizQuestions").withIndex("by_quiz", (q) => q.eq("quizId", session.quizId)).collect())
        .reduce((s, q) => s + q.points, 0);
      const score = p.autoScore + (p.manualScore ?? 0);
      const pct = maxPoints > 0 ? Math.round((score / maxPoints) * 100) : 0;
      const catKey = (quiz?.categoryId as string) ?? "__none__";
      const agg = catAgg.get(catKey) ?? { got: 0, max: 0, count: 0 };
      agg.got += score; agg.max += maxPoints; agg.count += 1;
      catAgg.set(catKey, agg);
      history.push({
        sessionId: session._id,
        title: session.title,
        category: quiz?.categoryId ? catById.get(quiz.categoryId as string)?.name ?? null : null,
        score, maxPoints, pct,
        passed: typeof quiz?.passPercent === "number" ? pct >= quiz.passPercent : null,
        publishedAt: session.publishedAt ?? 0,
      });
    }
    history.sort((a, b) => b.publishedAt - a.publishedAt);

    const byCategory = [...catAgg.entries()].map(([key, agg]) => {
      const cat = key === "__none__" ? null : catById.get(key);
      return {
        categoryId: key === "__none__" ? null : key,
        name: cat?.name ?? "Sans catégorie",
        color: cat?.color ?? null,
        average: agg.max > 0 ? Math.round((agg.got / agg.max) * 100) : 0,
        quizzes: agg.count,
      };
    }).sort((a, b) => (a.categoryId === null ? 1 : b.categoryId === null ? -1 : 0));

    return {
      agent: {
        _id: agent._id,
        prenomRP: agent.prenomRP,
        nomRP: agent.nomRP,
        avatarUrl: agent.avatarUrl ?? null,
        grade: grade?.name ?? null,
        dateEntree: agent.dateEntree ?? null,
      },
      byCategory,
      history,
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
    if (!target) throw new Error("Agent introuvable.");
    if (target.isOwner) throw new Error("Le compte propriétaire est intouchable.");

    const grade = target.gradeId ? await ctx.db.get(target.gradeId) : null;
    if (grade?.academyOnly) throw new Error("Un cadet ne peut pas encadrer l'académie.");
    if (grade?.external) throw new Error("Un grade extérieur ne peut pas encadrer l'académie.");

    const before = target.academyRankId ? await ctx.db.get(target.academyRankId) : null;
    const after = rankId ? await ctx.db.get(rankId) : null;
    if (rankId && !after) throw new Error("Grade d'académie introuvable.");

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
