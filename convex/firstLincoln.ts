import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAgent, can } from "./rbac";
import { traineeGrade, isEligibleTutor } from "./fto";

// First Lincoln : évaluation de la première patrouille encadrée d'un rookie
// (Officier 1 Probatoire) qui prend le lead de la patrouille sous supervision.
// Chaque rookie a un dossier avec une ou plusieurs évaluations notées + verdict.
// Section de la Police Academy : accessible via permission configurée ; les
// membres de l'académie y accèdent quel que soit leur grade.

const DEFAULT_PASS = 80;
const DEFAULT_POTENTIAL = 60;

function isAcademy(viewer: Doc<"agents">): boolean {
  return !!viewer.academyRankId;
}

async function thresholds(ctx: QueryCtx | MutationCtx): Promise<{ pass: number; potential: number }> {
  const cfg = await ctx.db.query("flConfig").first();
  return { pass: cfg?.passThreshold ?? DEFAULT_PASS, potential: cfg?.potentialThreshold ?? DEFAULT_POTENTIAL };
}

// Score d'aptitude (%) d'une évaluation = moyenne pondérée des critères réellement
// appréciés. SCALE : niveau/4 (Exécrable = 0, Très Bien = 1), compté seulement s'il
// est noté. CHECK : toujours compté (validé = 1, sinon 0). null si rien d'apprécié.
function evalScorePct(scores: Doc<"flScores">[], criteria: Doc<"flCriteria">[]): number | null {
  const byCrit = new Map(scores.map((s) => [s.criterionId as string, s]));
  let sum = 0, denom = 0;
  for (const c of criteria) {
    const s = byCrit.get(c._id as string);
    if (c.kind === "SCALE") {
      if (s && typeof s.level === "number") { sum += s.level / 4; denom += 1; }
    } else {
      sum += s?.checked ? 1 : 0; denom += 1;
    }
  }
  return denom === 0 ? null : Math.round((sum / denom) * 100);
}

// Accéder à la section / consulter les évaluations. Les FTO éligibles (académie
// OU grade « tuteur » configuré dans la Formation Terrain) y accèdent aussi :
// ce sont eux qui encadrent les First Lincoln.
async function canView(ctx: QueryCtx | MutationCtx, viewer: Doc<"agents">): Promise<boolean> {
  return viewer.isOwner || isAcademy(viewer) || (await can(ctx, viewer, "firstlincoln.view")) || (await isEligibleTutor(ctx, viewer));
}
// Créer / remplir une évaluation.
async function canEvaluate(ctx: QueryCtx | MutationCtx, viewer: Doc<"agents">): Promise<boolean> {
  return viewer.isOwner || isAcademy(viewer) || (await can(ctx, viewer, "firstlincoln.evaluate")) || (await isEligibleTutor(ctx, viewer));
}
// Configurer la grille de critères.
async function canManage(ctx: QueryCtx | MutationCtx, viewer: Doc<"agents">): Promise<boolean> {
  return viewer.isOwner || isAcademy(viewer) || (await can(ctx, viewer, "firstlincoln.manage"));
}

async function assertView(ctx: QueryCtx | MutationCtx, viewer: Doc<"agents">) {
  if (!(await canView(ctx, viewer))) throw new ConvexError("Accès réservé à First Lincoln.");
}
async function assertEvaluate(ctx: MutationCtx, viewer: Doc<"agents">) {
  if (!(await canEvaluate(ctx, viewer))) throw new ConvexError("Vous n'êtes pas autorisé à évaluer un First Lincoln.");
}
async function assertManage(ctx: MutationCtx, viewer: Doc<"agents">) {
  if (!(await canManage(ctx, viewer))) throw new ConvexError("Réservé à l'encadrement de l'académie.");
}

// Verdict le plus récent d'un rookie (pour la vignette de liste).
function latestVerdict(evals: Doc<"flEvaluations">[]): string | null {
  if (evals.length === 0) return null;
  return [...evals].sort((a, b) => b.at - a.at)[0].verdict;
}

// ---------- Accès (nav + garde de page) ----------
export const access = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAgent(ctx);
    const trainee = await traineeGrade(ctx);
    return {
      view: await canView(ctx, viewer),
      evaluate: await canEvaluate(ctx, viewer),
      manage: await canManage(ctx, viewer),
      traineeGradeName: trainee?.name ?? "Officier 1 Probatoire",
      thresholds: await thresholds(ctx),
    };
  },
});

// ---------- Liste (actifs + historique) ----------
// Dernier score (%) d'un agent = score de son évaluation la plus récente.
async function rookieRow(ctx: QueryCtx, a: Doc<"agents">, criteria: Doc<"flCriteria">[]) {
  const evals = await ctx.db.query("flEvaluations").withIndex("by_agent", (q) => q.eq("agentId", a._id)).collect();
  let lastScorePct: number | null = null;
  if (evals.length) {
    const last = [...evals].sort((x, y) => y.at - x.at)[0];
    const scores = await ctx.db.query("flScores").withIndex("by_evaluation", (q) => q.eq("evaluationId", last._id)).collect();
    lastScorePct = evalScorePct(scores, criteria);
  }
  return {
    _id: a._id,
    name: `${a.prenomRP} ${a.nomRP}`,
    matricule: a.matricule ?? null,
    avatarUrl: a.avatarUrl ?? null,
    count: evals.length,
    lastVerdict: latestVerdict(evals),
    lastScorePct,
    lastAt: evals.length ? Math.max(...evals.map((e) => e.at)) : null,
  };
}

export const listRookies = query({
  args: { history: v.optional(v.boolean()) },
  handler: async (ctx, { history }) => {
    const viewer = await requireAgent(ctx);
    await assertView(ctx, viewer);
    const trainee = await traineeGrade(ctx);
    const criteria = (await ctx.db.query("flCriteria").withIndex("by_position").collect()).filter((c) => c.active !== false);

    if (!history) {
      if (!trainee) return [];
      const agents = (await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "ACTIVE")).collect())
        .filter((a) => a.gradeId === trainee._id && !a.isOwner);
      const out = [];
      for (const a of agents) out.push({ ...(await rookieRow(ctx, a, criteria)), gradeName: null as string | null });
      return out.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Historique : agents ayant au moins une évaluation mais qui ne sont plus au
    // grade en formation (promus). Dédupliqué par agent.
    const evals = await ctx.db.query("flEvaluations").collect();
    const agentIds = [...new Set(evals.map((e) => e.agentId as string))] as Id<"agents">[];
    const out = [];
    for (const id of agentIds) {
      const a = await ctx.db.get(id);
      if (!a || a.isOwner || a.status !== "ACTIVE") continue;
      if (trainee && a.gradeId === trainee._id) continue; // encore en formation
      const g = a.gradeId ? await ctx.db.get(a.gradeId) : null;
      out.push({ ...(await rookieRow(ctx, a, criteria)), gradeName: g?.name ?? null });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ---------- Dossier d'un rookie ----------
export const dossier = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const viewer = await requireAgent(ctx);
    const agent = await ctx.db.get(agentId);
    if (!agent) return null;
    if (!(await canView(ctx, viewer))) return { denied: true as const };

    const criteria = (await ctx.db.query("flCriteria").withIndex("by_position").collect()).filter((c) => c.active !== false);
    const grade = agent.gradeId ? await ctx.db.get(agent.gradeId) : null;

    const rows = (await ctx.db.query("flEvaluations").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect())
      .sort((a, b) => b.at - a.at);
    const evaluations = [];
    for (const e of rows) {
      const scores = await ctx.db.query("flScores").withIndex("by_evaluation", (q) => q.eq("evaluationId", e._id)).collect();
      const byCrit = new Map(scores.map((s) => [s.criterionId as string, s]));
      evaluations.push({
        _id: e._id,
        evaluatorName: e.evaluatorName,
        at: e.at,
        sector: e.sector ?? "",
        vehicle: e.vehicle ?? "",
        verdict: e.verdict,
        scorePct: evalScorePct(scores, criteria),
        pointsForts: e.pointsForts ?? "",
        axes: e.axes ?? "",
        conclusion: e.conclusion ?? "",
        mine: e.evaluatorId === viewer._id,
        scores: criteria.map((c) => {
          const s = byCrit.get(c._id as string);
          return { criterionId: c._id, level: s?.level ?? null, checked: s?.checked ?? false };
        }),
      });
    }

    return {
      agent: { _id: agent._id, prenomRP: agent.prenomRP, nomRP: agent.nomRP, matricule: agent.matricule ?? null, avatarUrl: agent.avatarUrl ?? null, gradeName: grade?.name ?? null },
      criteria: criteria.map((c) => ({ _id: c._id, section: c.section, label: c.label, kind: c.kind })),
      evaluations,
      thresholds: await thresholds(ctx),
      canEvaluate: await canEvaluate(ctx, viewer),
      canManage: await canManage(ctx, viewer),
    };
  },
});

// Seuils d'appréciation (lecture pour le formulaire de configuration).
export const getConfig = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAgent(ctx);
    await assertView(ctx, viewer);
    return await thresholds(ctx);
  },
});

export const setConfig = mutation({
  args: { passThreshold: v.number(), potentialThreshold: v.number() },
  handler: async (ctx, { passThreshold, potentialThreshold }) => {
    const viewer = await requireAgent(ctx);
    await assertManage(ctx, viewer);
    const pass = Math.max(0, Math.min(100, Math.round(passThreshold)));
    const potential = Math.max(0, Math.min(pass, Math.round(potentialThreshold)));
    const cfg = await ctx.db.query("flConfig").first();
    const patch = { passThreshold: pass, potentialThreshold: potential, updatedBy: viewer._id, updatedAt: Date.now() };
    if (cfg) await ctx.db.patch(cfg._id, patch);
    else await ctx.db.insert("flConfig", patch);
  },
});

const scoreArg = v.object({ criterionId: v.id("flCriteria"), level: v.optional(v.union(v.number(), v.null())), checked: v.optional(v.boolean()) });

export const saveEvaluation = mutation({
  args: {
    evaluationId: v.optional(v.id("flEvaluations")),
    agentId: v.id("agents"),
    at: v.number(),
    sector: v.optional(v.string()),
    vehicle: v.optional(v.string()),
    verdict: v.union(v.literal("EN_COURS"), v.literal("VALIDE"), v.literal("A_REVOIR"), v.literal("ECHEC")),
    pointsForts: v.optional(v.string()),
    axes: v.optional(v.string()),
    conclusion: v.optional(v.string()),
    scores: v.array(scoreArg),
  },
  handler: async (ctx, a) => {
    const viewer = await requireAgent(ctx);
    await assertEvaluate(ctx, viewer);

    const base = {
      agentId: a.agentId,
      at: a.at,
      sector: a.sector?.trim() || undefined,
      vehicle: a.vehicle?.trim() || undefined,
      verdict: a.verdict,
      pointsForts: a.pointsForts?.trim() || undefined,
      axes: a.axes?.trim() || undefined,
      conclusion: a.conclusion?.trim() || undefined,
    };

    let evaluationId: Id<"flEvaluations">;
    if (a.evaluationId) {
      const ex = await ctx.db.get(a.evaluationId);
      if (!ex) throw new ConvexError("Évaluation introuvable.");
      // Modifier une évaluation d'autrui exige la gestion (encadrement).
      if (ex.evaluatorId !== viewer._id && !(await canManage(ctx, viewer))) throw new ConvexError("Seul l'auteur ou l'encadrement peut modifier cette évaluation.");
      await ctx.db.patch(a.evaluationId, base);
      evaluationId = a.evaluationId;
      // On repart d'un état propre pour les scores.
      for (const s of await ctx.db.query("flScores").withIndex("by_evaluation", (q) => q.eq("evaluationId", evaluationId)).collect()) await ctx.db.delete(s._id);
    } else {
      evaluationId = await ctx.db.insert("flEvaluations", {
        ...base,
        evaluatorId: viewer._id,
        evaluatorName: `${viewer.prenomRP} ${viewer.nomRP}`,
        createdAt: Date.now(),
      });
    }

    for (const s of a.scores) {
      const level = s.level === null || s.level === undefined ? undefined : s.level;
      const checked = s.checked || undefined;
      if (level === undefined && !checked) continue; // rien à stocker
      await ctx.db.insert("flScores", { evaluationId, criterionId: s.criterionId, level, checked });
    }
    return evaluationId;
  },
});

export const removeEvaluation = mutation({
  args: { evaluationId: v.id("flEvaluations") },
  handler: async (ctx, { evaluationId }) => {
    const viewer = await requireAgent(ctx);
    const e = await ctx.db.get(evaluationId);
    if (!e) return;
    if (e.evaluatorId !== viewer._id) await assertManage(ctx, viewer);
    for (const s of await ctx.db.query("flScores").withIndex("by_evaluation", (q) => q.eq("evaluationId", evaluationId)).collect()) await ctx.db.delete(s._id);
    await ctx.db.delete(evaluationId);
  },
});

// ---------- Configuration de la grille ----------
export const listCriteria = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAgent(ctx);
    if (!(await canView(ctx, viewer))) return [];
    return (await ctx.db.query("flCriteria").withIndex("by_position").collect()).map((c) => ({
      _id: c._id, section: c.section, label: c.label, kind: c.kind, active: c.active !== false, position: c.position,
    }));
  },
});

export const saveCriterion = mutation({
  args: {
    criterionId: v.optional(v.id("flCriteria")),
    section: v.string(),
    label: v.string(),
    kind: v.union(v.literal("SCALE"), v.literal("CHECK")),
  },
  handler: async (ctx, a) => {
    const viewer = await requireAgent(ctx);
    await assertManage(ctx, viewer);
    if (!a.section.trim() || !a.label.trim()) throw new ConvexError("Section et libellé obligatoires.");
    const base = { section: a.section.trim(), label: a.label.trim(), kind: a.kind };
    if (a.criterionId) { await ctx.db.patch(a.criterionId, base); return a.criterionId; }
    const all = await ctx.db.query("flCriteria").collect();
    const position = all.reduce((m, i) => Math.max(m, i.position), -1) + 1;
    return await ctx.db.insert("flCriteria", { ...base, position, active: true });
  },
});

export const removeCriterion = mutation({
  args: { criterionId: v.id("flCriteria") },
  handler: async (ctx, { criterionId }) => {
    const viewer = await requireAgent(ctx);
    await assertManage(ctx, viewer);
    for (const s of await ctx.db.query("flScores").collect()) if (s.criterionId === criterionId) await ctx.db.delete(s._id);
    await ctx.db.delete(criterionId);
  },
});

export const moveCriterion = mutation({
  args: { criterionId: v.id("flCriteria"), direction: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, { criterionId, direction }) => {
    const viewer = await requireAgent(ctx);
    await assertManage(ctx, viewer);
    const all = await ctx.db.query("flCriteria").withIndex("by_position").collect();
    const i = all.findIndex((x) => x._id === criterionId);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= all.length) return;
    await ctx.db.patch(all[i]._id, { position: all[j].position });
    await ctx.db.patch(all[j]._id, { position: all[i].position });
  },
});

export const seedDefault = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAgent(ctx);
    await assertManage(ctx, viewer);
    if (await ctx.db.query("flCriteria").first()) return "exists" as const;
    const items: Array<{ section: string; label: string; kind: "SCALE" | "CHECK" }> = [
      ...["Prise en main de la patrouille", "Communication radio (lead)", "Gestion du binôme", "Prise de décision", "Gestion du stress"].map((label) => ({ section: "Posture de lead", label, kind: "SCALE" as const })),
      ...["Conduite en intervention", "Positionnement véhicule", "Codes gyrophares / signal"].map((label) => ({ section: "Conduite", label, kind: "SCALE" as const })),
      ...["Approche et sécurisation", "Contrôle d'identité", "Palpation / fouille", "Lecture des droits (Miranda)", "Mise en garde à vue"].map((label) => ({ section: "Interventions", label, kind: "SCALE" as const })),
      ...["Début et fin de patrouille annoncés au dispatch", "Respect des procédures", "Rédaction du rapport / casier"].map((label) => ({ section: "Validations", label, kind: "CHECK" as const })),
    ];
    let position = 0;
    for (const it of items) await ctx.db.insert("flCriteria", { ...it, position: position++, active: true });
    return "seeded" as const;
  },
});
