import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";

// Quiz de l'académie : conception et catalogue. Le passage (sessions live) est
// traité à part ; ici on ne manipule que le modèle.

const kindValidator = v.union(v.literal("SINGLE"), v.literal("MULTI"), v.literal("TEXT"));
const choiceValidator = v.object({
  label: v.string(),
  imageUrl: v.optional(v.string()),
  correct: v.boolean(),
});

type ChoiceInput = { label: string; imageUrl?: string; correct: boolean };

// Une question est corrigée à la main dès qu'elle comporte du texte libre :
// question ouverte, ou question à choix assortie d'une justification.
function isManual(q: { kind: string; requireJustification?: boolean }): boolean {
  return q.kind === "TEXT" || q.requireJustification === true;
}

// ---------- Catalogue ----------

export const list = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.quiz.view");

    const quizzes = await ctx.db.query("quizzes").collect();
    // Toutes les questions d'un coup : une requête par quiz faisait croître les
    // lectures avec le catalogue pour un simple compteur.
    const byQuiz = new Map<string, { count: number; points: number; manual: boolean }>();
    for (const q of await ctx.db.query("quizQuestions").collect()) {
      const cur = byQuiz.get(q.quizId as string) ?? { count: 0, points: 0, manual: false };
      cur.count += 1;
      cur.points += q.points;
      cur.manual = cur.manual || isManual(q);
      byQuiz.set(q.quizId as string, cur);
    }
    const openSessions = new Map<string, number>();
    for (const s of await ctx.db.query("quizSessions").collect()) {
      if (s.status === "LOBBY" || s.status === "RUNNING") {
        openSessions.set(s.quizId as string, (openSessions.get(s.quizId as string) ?? 0) + 1);
      }
    }
    const catById = new Map((await ctx.db.query("quizCategories").collect()).map((c) => [c._id as string, c]));

    return quizzes
      .map((q) => {
        const agg = byQuiz.get(q._id as string) ?? { count: 0, points: 0, manual: false };
        const cat = q.categoryId ? catById.get(q.categoryId as string) : null;
        return {
          _id: q._id,
          title: q.title,
          description: q.description ?? null,
          status: q.status,
          category: cat ? { _id: cat._id, name: cat.name, color: cat.color ?? null } : null,
          passPercent: q.passPercent ?? null,
          durationSeconds: q.durationSeconds ?? null,
          questionCount: agg.count,
          totalPoints: agg.points,
          manualGrading: agg.manual,
          openSessions: openSessions.get(q._id as string) ?? 0,
          updatedAt: q.updatedAt,
        };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

// ---------- Catégories ----------

export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.quiz.view");
    return (await ctx.db.query("quizCategories").withIndex("by_position").collect())
      .filter((c) => c.active !== false)
      .map((c) => ({ _id: c._id, name: c.name, color: c.color ?? null, position: c.position }));
  },
});

export const saveCategory = mutation({
  args: { categoryId: v.optional(v.id("quizCategories")), name: v.string(), color: v.optional(v.string()) },
  handler: async (ctx, { categoryId, name, color }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.quiz.edit");
    const clean = name.trim();
    if (!clean) throw new ConvexError("Le nom de la catégorie est obligatoire.");
    if (categoryId) {
      await ctx.db.patch(categoryId, { name: clean, color: color || undefined });
      return categoryId;
    }
    const last = await ctx.db.query("quizCategories").withIndex("by_position").collect();
    const position = last.reduce((m, c) => Math.max(m, c.position), -1) + 1;
    return await ctx.db.insert("quizCategories", { name: clean, color: color || undefined, position, active: true });
  },
});

export const removeCategory = mutation({
  args: { categoryId: v.id("quizCategories") },
  handler: async (ctx, { categoryId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.quiz.edit");
    // Les quiz rattachés perdent simplement leur catégorie, ils ne sont pas supprimés.
    for (const q of await ctx.db.query("quizzes").collect()) {
      if (q.categoryId === categoryId) await ctx.db.patch(q._id, { categoryId: undefined });
    }
    await ctx.db.delete(categoryId);
  },
});

// Vue de conception : contient les bonnes réponses, donc réservée à
// lspa.quiz.view (les cadets ne l'appellent jamais).
export const get = query({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, { quizId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.quiz.view");

    const quiz = await ctx.db.get(quizId);
    if (!quiz) return null;

    const questions = await ctx.db
      .query("quizQuestions")
      .withIndex("by_quiz", (q) => q.eq("quizId", quizId))
      .collect();
    const choices = await ctx.db
      .query("quizChoices")
      .withIndex("by_quiz", (q) => q.eq("quizId", quizId))
      .collect();
    const byQuestion = new Map<string, Doc<"quizChoices">[]>();
    for (const c of choices) {
      const arr = byQuestion.get(c.questionId as string) ?? [];
      arr.push(c);
      byQuestion.set(c.questionId as string, arr);
    }

    return {
      quiz: {
        _id: quiz._id,
        title: quiz.title,
        description: quiz.description ?? null,
        categoryId: quiz.categoryId ?? null,
        passPercent: quiz.passPercent ?? null,
        durationSeconds: quiz.durationSeconds ?? null,
        shuffleQuestions: quiz.shuffleQuestions ?? false,
        status: quiz.status,
      },
      questions: questions
        .sort((a, b) => a.position - b.position)
        .map((q) => ({
          _id: q._id,
          position: q.position,
          kind: q.kind,
          prompt: q.prompt,
          mediaUrls: q.mediaUrls ?? [],
          points: q.points,
          timeLimitSeconds: q.timeLimitSeconds ?? null,
          requireJustification: q.requireJustification ?? false,
          expectedAnswer: q.expectedAnswer ?? null,
          explanation: q.explanation ?? null,
          manual: isManual(q),
          choices: (byQuestion.get(q._id as string) ?? [])
            .sort((a, b) => a.position - b.position)
            .map((c) => ({ _id: c._id, label: c.label, imageUrl: c.imageUrl ?? null, correct: c.correct })),
        })),
    };
  },
});

// ---------- Édition du quiz ----------

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    categoryId: v.optional(v.id("quizCategories")),
    passPercent: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
  },
  handler: async (ctx, { title, description, categoryId, passPercent, durationSeconds }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.quiz.create");
    const clean = title.trim();
    if (!clean) throw new ConvexError("Le titre est obligatoire.");

    const quizId = await ctx.db.insert("quizzes", {
      title: clean,
      description: description?.trim() || undefined,
      categoryId: categoryId ?? undefined,
      // Seuil de réussite facultatif : absent = on affiche le score sans verdict.
      passPercent: passPercent !== undefined ? clampPercent(passPercent) : undefined,
      durationSeconds: positiveOrUndefined(durationSeconds),
      status: "DRAFT",
      createdBy: agent._id,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, agent, {
      action: "lspa.quiz_create",
      resourceType: "quiz",
      resourceId: quizId,
      resourceLabel: clean,
    });
    return quizId;
  },
});

// Duplique un quiz : nouveau brouillon avec toutes les questions et leurs choix.
// Un modèle éprouvé se réutilise sans tout ressaisir.
export const duplicate = mutation({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, { quizId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.quiz.create");
    const src = await ctx.db.get(quizId);
    if (!src) throw new ConvexError("Quiz introuvable.");

    const copyId = await ctx.db.insert("quizzes", {
      title: `${src.title} (copie)`,
      description: src.description,
      categoryId: src.categoryId,
      passPercent: src.passPercent,
      durationSeconds: src.durationSeconds,
      shuffleQuestions: src.shuffleQuestions,
      status: "DRAFT", // toujours en brouillon : on relit avant de réutiliser
      createdBy: agent._id,
      updatedAt: Date.now(),
    });

    const questions = await ctx.db
      .query("quizQuestions")
      .withIndex("by_quiz", (q) => q.eq("quizId", quizId))
      .collect();
    const choices = await ctx.db
      .query("quizChoices")
      .withIndex("by_quiz", (q) => q.eq("quizId", quizId))
      .collect();
    const choicesByQ = new Map<string, Doc<"quizChoices">[]>();
    for (const c of choices) {
      const arr = choicesByQ.get(c.questionId as string) ?? [];
      arr.push(c);
      choicesByQ.set(c.questionId as string, arr);
    }

    for (const q of questions.sort((a, b) => a.position - b.position)) {
      const newQid = await ctx.db.insert("quizQuestions", {
        quizId: copyId,
        position: q.position,
        kind: q.kind,
        prompt: q.prompt,
        mediaUrls: q.mediaUrls,
        points: q.points,
        timeLimitSeconds: q.timeLimitSeconds,
        requireJustification: q.requireJustification,
        expectedAnswer: q.expectedAnswer,
        explanation: q.explanation,
      });
      for (const c of (choicesByQ.get(q._id as string) ?? []).sort((a, b) => a.position - b.position)) {
        await ctx.db.insert("quizChoices", {
          questionId: newQid,
          quizId: copyId,
          position: c.position,
          label: c.label,
          imageUrl: c.imageUrl,
          correct: c.correct,
        });
      }
    }
    return copyId;
  },
});

export const update = mutation({
  args: {
    quizId: v.id("quizzes"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    // id = fixe la catégorie ; null = retire ; absent = inchangé.
    categoryId: v.optional(v.union(v.id("quizCategories"), v.null())),
    // number = fixe le seuil ; null = retire le seuil ; absent = inchangé.
    passPercent: v.optional(v.union(v.number(), v.null())),
    durationSeconds: v.optional(v.number()),
    shuffleQuestions: v.optional(v.boolean()),
    status: v.optional(v.union(v.literal("DRAFT"), v.literal("PUBLISHED"), v.literal("ARCHIVED"))),
  },
  handler: async (ctx, { quizId, ...patch }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.quiz.edit");
    const quiz = await ctx.db.get(quizId);
    if (!quiz) throw new ConvexError("Quiz introuvable.");

    // Un quiz ne devient utilisable qu'avec au moins une question : sinon on
    // ouvre une session vide et la promotion attend pour rien.
    if (patch.status === "PUBLISHED") {
      const first = await ctx.db
        .query("quizQuestions")
        .withIndex("by_quiz", (q) => q.eq("quizId", quizId))
        .first();
      if (!first) throw new ConvexError("Ajoutez au moins une question avant de publier le quiz.");
    }

    await ctx.db.patch(quizId, {
      ...(patch.title !== undefined ? { title: patch.title.trim() || quiz.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description.trim() || undefined } : {}),
      ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId ?? undefined } : {}),
      ...(patch.passPercent !== undefined ? { passPercent: patch.passPercent === null ? undefined : clampPercent(patch.passPercent) } : {}),
      ...(patch.durationSeconds !== undefined ? { durationSeconds: positiveOrUndefined(patch.durationSeconds) } : {}),
      ...(patch.shuffleQuestions !== undefined ? { shuffleQuestions: patch.shuffleQuestions } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, { quizId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.quiz.delete");
    const quiz = await ctx.db.get(quizId);
    if (!quiz) return;

    // Un quiz déjà passé porte des résultats : on l'archive au lieu de le
    // supprimer, sinon les copies des cadets perdent leur énoncé.
    const session = await ctx.db
      .query("quizSessions")
      .withIndex("by_quiz", (q) => q.eq("quizId", quizId))
      .first();
    if (session) {
      await ctx.db.patch(quizId, { status: "ARCHIVED", updatedAt: Date.now() });
      return "archived" as const;
    }

    for (const c of await ctx.db.query("quizChoices").withIndex("by_quiz", (q) => q.eq("quizId", quizId)).collect()) {
      await ctx.db.delete(c._id);
    }
    for (const q of await ctx.db.query("quizQuestions").withIndex("by_quiz", (q) => q.eq("quizId", quizId)).collect()) {
      await ctx.db.delete(q._id);
    }
    await ctx.db.delete(quizId);
    await writeAudit(ctx, agent, {
      action: "lspa.quiz_delete",
      resourceType: "quiz",
      resourceId: quizId,
      resourceLabel: quiz.title,
    });
    return "deleted" as const;
  },
});

// ---------- Questions ----------

// Enregistrement en bloc : la question et ses options partent ensemble, ce qui
// évite les états intermédiaires invalides (une question à choix sans option).
export const saveQuestion = mutation({
  args: {
    quizId: v.id("quizzes"),
    questionId: v.optional(v.id("quizQuestions")),
    kind: kindValidator,
    prompt: v.string(),
    mediaUrls: v.optional(v.array(v.string())),
    points: v.number(),
    timeLimitSeconds: v.optional(v.number()),
    requireJustification: v.optional(v.boolean()),
    expectedAnswer: v.optional(v.string()),
    explanation: v.optional(v.string()),
    choices: v.array(choiceValidator),
  },
  handler: async (ctx, a) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, a.questionId ? "lspa.quiz.edit" : "lspa.quiz.create");
    const quiz = await ctx.db.get(a.quizId);
    if (!quiz) throw new ConvexError("Quiz introuvable.");

    validateQuestion(a.kind, a.points, a.choices);

    const base = {
      quizId: a.quizId,
      kind: a.kind,
      prompt: a.prompt,
      mediaUrls: a.mediaUrls?.length ? a.mediaUrls : undefined,
      points: Math.round(a.points * 100) / 100,
      timeLimitSeconds: positiveOrUndefined(a.timeLimitSeconds),
      requireJustification: a.kind === "TEXT" ? undefined : a.requireJustification || undefined,
      expectedAnswer: a.expectedAnswer?.trim() || undefined,
      explanation: a.explanation?.trim() || undefined,
    };

    let questionId: Id<"quizQuestions">;
    if (a.questionId) {
      const existing = await ctx.db.get(a.questionId);
      if (!existing || existing.quizId !== a.quizId) throw new ConvexError("Question introuvable.");
      await ctx.db.patch(a.questionId, base);
      questionId = a.questionId;
      for (const c of await ctx.db.query("quizChoices").withIndex("by_question", (q) => q.eq("questionId", questionId)).collect()) {
        await ctx.db.delete(c._id);
      }
    } else {
      const last = await ctx.db
        .query("quizQuestions")
        .withIndex("by_quiz", (q) => q.eq("quizId", a.quizId))
        .collect();
      const position = last.reduce((m, q) => Math.max(m, q.position), -1) + 1;
      questionId = await ctx.db.insert("quizQuestions", { ...base, position });
    }

    if (a.kind !== "TEXT") {
      let i = 0;
      for (const c of a.choices) {
        await ctx.db.insert("quizChoices", {
          questionId,
          quizId: a.quizId,
          position: i++,
          label: c.label.trim(),
          imageUrl: c.imageUrl?.trim() || undefined,
          correct: c.correct,
        });
      }
    }

    await ctx.db.patch(a.quizId, { updatedAt: Date.now() });
    return questionId;
  },
});

export const removeQuestion = mutation({
  args: { questionId: v.id("quizQuestions") },
  handler: async (ctx, { questionId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.quiz.edit");
    const question = await ctx.db.get(questionId);
    if (!question) return;

    for (const c of await ctx.db.query("quizChoices").withIndex("by_question", (q) => q.eq("questionId", questionId)).collect()) {
      await ctx.db.delete(c._id);
    }
    await ctx.db.delete(questionId);

    // Renumérotation : les positions doivent rester contiguës, sinon un
    // déplacement ultérieur échange deux rangs qui ne se suivent plus.
    const rest = (await ctx.db.query("quizQuestions").withIndex("by_quiz", (q) => q.eq("quizId", question.quizId)).collect())
      .sort((a, b) => a.position - b.position);
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].position !== i) await ctx.db.patch(rest[i]._id, { position: i });
    }
    await ctx.db.patch(question.quizId, { updatedAt: Date.now() });
  },
});

export const moveQuestion = mutation({
  args: { questionId: v.id("quizQuestions"), direction: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, { questionId, direction }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.quiz.edit");
    const question = await ctx.db.get(questionId);
    if (!question) throw new ConvexError("Question introuvable.");

    const all = (await ctx.db.query("quizQuestions").withIndex("by_quiz", (q) => q.eq("quizId", question.quizId)).collect())
      .sort((a, b) => a.position - b.position);
    const i = all.findIndex((q) => q._id === questionId);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= all.length) return;

    await ctx.db.patch(all[i]._id, { position: all[j].position });
    await ctx.db.patch(all[j]._id, { position: all[i].position });
    await ctx.db.patch(question.quizId, { updatedAt: Date.now() });
  },
});

// ---------- Utilitaires ----------

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 70;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function positiveOrUndefined(n: number | undefined): number | undefined {
  return n !== undefined && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

function validateQuestion(kind: string, points: number, choices: ChoiceInput[]) {
  if (!Number.isFinite(points) || points <= 0) throw new ConvexError("Le barème doit être supérieur à zéro.");
  if (kind === "TEXT") return;

  const filled = choices.filter((c) => c.label.trim().length > 0);
  if (filled.length < 2) throw new ConvexError("Une question à choix demande au moins deux réponses.");
  const correct = filled.filter((c) => c.correct).length;
  if (correct === 0) throw new ConvexError("Indiquez au moins une bonne réponse.");
  if (kind === "SINGLE" && correct > 1) {
    throw new ConvexError("Une question à réponse unique ne peut avoir qu'une bonne réponse.");
  }
}
