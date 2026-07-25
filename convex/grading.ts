import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireAgent, requirePermission } from "./rbac";

// Fiche de notation des cadets. Modèle entièrement configurable : sections,
// critères (points saisis, temps chronométré, ou catégorie de quiz notée
// automatiquement), barèmes et paliers de temps. Le remplissage est concurrent
// (un critère = un document indépendant).

const bracketValidator = v.object({
  maxSeconds: v.optional(v.number()),
  points: v.number(),
  eliminate: v.optional(v.boolean()),
});

// ---------- Calcul (pur, testable) ----------

type Bracket = { maxSeconds?: number; points: number; eliminate?: boolean };

// Points d'un temps selon les paliers : premier palier dont le temps reste sous
// le plafond ; le palier sans plafond (au-delà) attrape le reste.
export function timeToPoints(brackets: Bracket[], seconds: number): { points: number; eliminate: boolean } {
  const ordered = [...brackets].sort((a, b) => (a.maxSeconds ?? Infinity) - (b.maxSeconds ?? Infinity));
  for (const b of ordered) {
    if (b.maxSeconds === undefined || seconds < b.maxSeconds) {
      return { points: b.eliminate ? 0 : b.points, eliminate: !!b.eliminate };
    }
  }
  return { points: 0, eliminate: false };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Points d'un critère pour un cadet, forme pure.
export function scoreItem(
  item: { kind: string; maxPoints: number; timeBrackets?: Bracket[] },
  entry: { points?: number; seconds?: number; eliminated?: boolean } | null,
  quizAvgPct: number | null,
): { points: number; eliminated: boolean; filled: boolean } {
  if (item.kind === "QUIZ_CATEGORY") {
    if (quizAvgPct === null) return { points: 0, eliminated: false, filled: false };
    return { points: round1((item.maxPoints * quizAvgPct) / 100), eliminated: false, filled: true };
  }
  if (item.kind === "TIME") {
    if (entry?.eliminated) return { points: 0, eliminated: true, filled: true };
    if (entry?.seconds === undefined || entry.seconds === null) return { points: 0, eliminated: false, filled: false };
    const r = timeToPoints(item.timeBrackets ?? [], entry.seconds);
    return { points: r.points, eliminated: r.eliminate, filled: true };
  }
  // MANUAL
  if (entry?.eliminated) return { points: 0, eliminated: true, filled: true };
  if (entry?.points === undefined || entry.points === null) return { points: 0, eliminated: false, filled: false };
  return { points: Math.max(0, Math.min(item.maxPoints, entry.points)), eliminated: false, filled: true };
}

// ---------- Moyenne quiz par catégorie pour un cadet ----------

async function quizAveragesByCategory(ctx: QueryCtx, agentId: Id<"agents">) {
  const parts = await ctx.db.query("quizParticipants").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect();
  const agg = new Map<string, { got: number; max: number }>();
  for (const p of parts) {
    const s = await ctx.db.get(p.sessionId);
    if (!s || s.status !== "PUBLISHED") continue;
    const quiz = await ctx.db.get(s.quizId);
    if (!quiz?.categoryId) continue;
    const max = (await ctx.db.query("quizQuestions").withIndex("by_quiz", (q) => q.eq("quizId", s.quizId)).collect())
      .reduce((sum, q) => sum + q.points, 0);
    const got = p.autoScore + (p.manualScore ?? 0);
    const cur = agg.get(quiz.categoryId as string) ?? { got: 0, max: 0 };
    cur.got += got; cur.max += max;
    agg.set(quiz.categoryId as string, cur);
  }
  const out = new Map<string, number | null>();
  for (const [k, a] of agg) out.set(k, a.max > 0 ? (a.got / a.max) * 100 : null);
  return out;
}

// Score total d'un cadet (utilisé pour le classement). Renvoie null si aucun
// critère rempli.
export async function totalScoreFor(ctx: QueryCtx, agentId: Id<"agents">, items: Doc<"gradingItems">[]) {
  const entries = await ctx.db.query("gradingEntries").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect();
  const byItem = new Map(entries.map((e) => [e.itemId as string, e]));
  const quizAvg = await quizAveragesByCategory(ctx, agentId);
  let total = 0;
  let eliminated = false;
  let anyFilled = false;
  for (const it of items) {
    if (it.active === false) continue;
    const avg = it.kind === "QUIZ_CATEGORY" && it.categoryId ? quizAvg.get(it.categoryId as string) ?? null : null;
    const r = scoreItem(it, byItem.get(it._id as string) ?? null, avg);
    total += r.points;
    if (r.eliminated) eliminated = true;
    if (r.filled) anyFilled = true;
  }
  return { total: round1(total), eliminated, hasScore: anyFilled };
}

// ---------- Configuration du modèle ----------

export const listItems = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.effectif.view");
    const items = (await ctx.db.query("gradingItems").withIndex("by_position").collect());
    const cats = new Map((await ctx.db.query("quizCategories").collect()).map((c) => [c._id as string, c]));
    return items.map((it) => ({
      _id: it._id,
      section: it.section,
      label: it.label,
      kind: it.kind,
      maxPoints: it.maxPoints,
      position: it.position,
      active: it.active !== false,
      allowEliminate: it.allowEliminate ?? false,
      timeBrackets: it.timeBrackets ?? [],
      categoryId: it.categoryId ?? null,
      categoryName: it.categoryId ? cats.get(it.categoryId as string)?.name ?? null : null,
    }));
  },
});

export const saveItem = mutation({
  args: {
    itemId: v.optional(v.id("gradingItems")),
    section: v.string(),
    label: v.string(),
    kind: v.union(v.literal("MANUAL"), v.literal("TIME"), v.literal("QUIZ_CATEGORY")),
    maxPoints: v.number(),
    allowEliminate: v.optional(v.boolean()),
    timeBrackets: v.optional(v.array(bracketValidator)),
    categoryId: v.optional(v.id("quizCategories")),
  },
  handler: async (ctx, a) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "effectif.validate");
    if (!a.label.trim() || !a.section.trim()) throw new Error("Section et libellé sont obligatoires.");
    const base = {
      section: a.section.trim(),
      label: a.label.trim(),
      kind: a.kind,
      maxPoints: Math.max(0, a.maxPoints),
      allowEliminate: a.allowEliminate || undefined,
      timeBrackets: a.kind === "TIME" ? a.timeBrackets ?? [] : undefined,
      categoryId: a.kind === "QUIZ_CATEGORY" ? a.categoryId : undefined,
    };
    if (a.itemId) {
      await ctx.db.patch(a.itemId, base);
      return a.itemId;
    }
    const all = await ctx.db.query("gradingItems").collect();
    const position = all.reduce((m, i) => Math.max(m, i.position), -1) + 1;
    return await ctx.db.insert("gradingItems", { ...base, position, active: true });
  },
});

export const removeItem = mutation({
  args: { itemId: v.id("gradingItems") },
  handler: async (ctx, { itemId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "effectif.validate");
    for (const e of await ctx.db.query("gradingEntries").collect()) {
      if (e.itemId === itemId) await ctx.db.delete(e._id);
    }
    await ctx.db.delete(itemId);
  },
});

export const moveItem = mutation({
  args: { itemId: v.id("gradingItems"), direction: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, { itemId, direction }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "effectif.validate");
    const all = (await ctx.db.query("gradingItems").withIndex("by_position").collect());
    const i = all.findIndex((x) => x._id === itemId);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= all.length) return;
    await ctx.db.patch(all[i]._id, { position: all[j].position });
    await ctx.db.patch(all[j]._id, { position: all[i].position });
  },
});

// Crée la fiche par défaut de la Police Academy si elle est vide.
export const seedDefault = mutation({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "effectif.validate");
    const existing = await ctx.db.query("gradingItems").first();
    if (existing) return "exists" as const;

    const items: Array<Omit<Doc<"gradingItems">, "_id" | "_creationTime" | "position">> = [
      { section: "Oral", label: "Oral (avant académie)", kind: "MANUAL", maxPoints: 10, active: true },
      { section: "Tir", label: "Circuit court 1", kind: "MANUAL", maxPoints: 2, active: true, allowEliminate: true },
      { section: "Tir", label: "Circuit court 2", kind: "MANUAL", maxPoints: 2, active: true, allowEliminate: true },
      { section: "Tir", label: "Circuit long", kind: "MANUAL", maxPoints: 4, active: true, allowEliminate: true },
      { section: "Tir", label: "Comportement avec l'arme", kind: "MANUAL", maxPoints: 2, active: true },
      { section: "Conduite", label: "Épreuve de conduite", kind: "TIME", maxPoints: 10, active: true, timeBrackets: [
        { maxSeconds: 30, points: 10 }, { maxSeconds: 35, points: 8 }, { maxSeconds: 40, points: 6 }, { maxSeconds: 60, points: 4 }, { eliminate: true, points: 0 },
      ] },
      { section: "Sport", label: "Épreuve sportive", kind: "TIME", maxPoints: 10, active: true, timeBrackets: [
        { maxSeconds: 80, points: 10 }, { maxSeconds: 100, points: 8 }, { maxSeconds: 110, points: 6 }, { maxSeconds: 120, points: 4 }, { eliminate: true, points: 0 },
      ] },
      { section: "Comportement", label: "Comportement général", kind: "MANUAL", maxPoints: 5, active: true },
      { section: "Comportement", label: "Cohésion & communication", kind: "MANUAL", maxPoints: 3, active: true },
      { section: "Comportement", label: "Leadership", kind: "MANUAL", maxPoints: 2, active: true },
    ];
    let position = 0;
    for (const it of items) await ctx.db.insert("gradingItems", { ...it, position: position++ });
    return "seeded" as const;
  },
});

// ---------- Remplissage (concurrent) ----------

export const setEntry = mutation({
  args: {
    agentId: v.id("agents"),
    itemId: v.id("gradingItems"),
    points: v.optional(v.union(v.number(), v.null())),
    seconds: v.optional(v.union(v.number(), v.null())),
    eliminated: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.effectif.view");
    const existing = await ctx.db
      .query("gradingEntries")
      .withIndex("by_agent_item", (q) => q.eq("agentId", a.agentId).eq("itemId", a.itemId))
      .unique();
    const patch = {
      ...(a.points !== undefined ? { points: a.points === null ? undefined : a.points } : {}),
      ...(a.seconds !== undefined ? { seconds: a.seconds === null ? undefined : a.seconds } : {}),
      ...(a.eliminated !== undefined ? { eliminated: a.eliminated || undefined } : {}),
      updatedBy: agent._id,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("gradingEntries", { agentId: a.agentId, itemId: a.itemId, ...patch });
    }
  },
});

// ---------- Notes des instructeurs + conclusion (en direct pour tous) ----------

export const addNote = mutation({
  args: { agentId: v.id("agents"), text: v.string() },
  handler: async (ctx, { agentId, text }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.effectif.view");
    const clean = text.trim();
    if (!clean) return;
    await ctx.db.insert("cadetNotes", {
      agentId,
      authorId: agent._id,
      authorName: `${agent.prenomRP} ${agent.nomRP}`,
      text: clean,
      at: Date.now(),
    });
  },
});

export const removeNote = mutation({
  args: { noteId: v.id("cadetNotes") },
  handler: async (ctx, { noteId }) => {
    const agent = await requireAgent(ctx);
    const note = await ctx.db.get(noteId);
    if (!note) return;
    // On ne supprime que ses propres notes (sauf validation d'État-Major).
    if (note.authorId !== agent._id) await requirePermission(ctx, agent, "effectif.validate");
    await ctx.db.delete(noteId);
  },
});

export const setConclusion = mutation({
  args: { agentId: v.id("agents"), text: v.string() },
  handler: async (ctx, { agentId, text }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.effectif.view");
    const existing = await ctx.db.query("cadetConclusions").withIndex("by_agent", (q) => q.eq("agentId", agentId)).unique();
    const data = { text, updatedBy: agent._id, updatedByName: `${agent.prenomRP} ${agent.nomRP}`, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, data);
    else await ctx.db.insert("cadetConclusions", { agentId, ...data });
  },
});

// ---------- Fiche complète d'un cadet ----------

export const cadetSheet = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const viewer = await requireAgent(ctx);
    await requirePermission(ctx, viewer, "lspa.effectif.view");
    const agent = await ctx.db.get(agentId);
    if (!agent) return null;
    const grade = agent.gradeId ? await ctx.db.get(agent.gradeId) : null;

    const items = (await ctx.db.query("gradingItems").withIndex("by_position").collect()).filter((i) => i.active !== false);
    const cats = new Map((await ctx.db.query("quizCategories").collect()).map((c) => [c._id as string, c]));
    const entries = await ctx.db.query("gradingEntries").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect();
    const byItem = new Map(entries.map((e) => [e.itemId as string, e]));
    const quizAvg = await quizAveragesByCategory(ctx, agentId);

    let total = 0;
    let eliminated = false;
    const scored = items.map((it) => {
      const avg = it.kind === "QUIZ_CATEGORY" && it.categoryId ? quizAvg.get(it.categoryId as string) ?? null : null;
      const entry = byItem.get(it._id as string) ?? null;
      const r = scoreItem(it, entry, avg);
      total += r.points;
      if (r.eliminated) eliminated = true;
      return {
        _id: it._id,
        section: it.section,
        label: it.label,
        kind: it.kind,
        maxPoints: it.maxPoints,
        allowEliminate: it.allowEliminate ?? false,
        timeBrackets: it.timeBrackets ?? [],
        categoryName: it.categoryId ? cats.get(it.categoryId as string)?.name ?? null : null,
        quizAvgPct: avg !== null ? Math.round(avg) : null,
        points: r.points,
        eliminated: r.eliminated,
        entryPoints: entry?.points ?? null,
        entrySeconds: entry?.seconds ?? null,
        entryEliminated: entry?.eliminated ?? false,
      };
    });
    const maxTotal = items.reduce((s, i) => s + i.maxPoints, 0);

    const notes = (await ctx.db.query("cadetNotes").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect())
      .sort((a, b) => b.at - a.at)
      .map((n) => ({ _id: n._id, authorId: n.authorId, authorName: n.authorName, text: n.text, at: n.at, mine: n.authorId === viewer._id }));
    const conclusion = await ctx.db.query("cadetConclusions").withIndex("by_agent", (q) => q.eq("agentId", agentId)).unique();

    return {
      agent: { _id: agent._id, prenomRP: agent.prenomRP, nomRP: agent.nomRP, avatarUrl: agent.avatarUrl ?? null, grade: grade?.name ?? null },
      items: scored,
      total: round1(total),
      maxTotal,
      eliminated,
      notes,
      conclusion: conclusion ? { text: conclusion.text, byName: conclusion.updatedByName, at: conclusion.updatedAt } : null,
    };
  },
});
