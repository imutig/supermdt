import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";

// Passage des quiz : ouverture d'une session, salle d'attente, épreuve en
// direct, correction et publication. Le modèle de quiz (questions, barème) vit
// dans quiz.ts ; ici on gère le déroulé et les copies.

// ---------- Correction automatique ----------

function isManualQuestion(q: Doc<"quizQuestions">): boolean {
  return q.kind === "TEXT" || q.requireJustification === true;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

// Note d'une réponse fermée, forme pure (testable) : réponse unique = plein
// tarif si l'unique choix est le bon ; réponses multiples = tout ou rien sur
// l'ensemble exact des bonnes réponses.
export function scoreClosed(kind: string, points: number, picked: string[], correct: string[]): number {
  if (kind === "SINGLE") return picked.length === 1 && correct.includes(picked[0]) ? points : 0;
  return sameSet(picked, correct) ? points : 0;
}

// Points attribués automatiquement à une réponse fermée. Les questions à
// correction manuelle renvoient undefined : elles attendent l'instructeur.
function autoAward(
  q: Doc<"quizQuestions">,
  choiceIds: Id<"quizChoices">[] | undefined,
  correctIds: string[],
): number | undefined {
  if (isManualQuestion(q)) return undefined;
  return scoreClosed(q.kind, q.points, (choiceIds ?? []).map((c) => c as string), correctIds);
}

// Coeur du calcul d'une copie, isolé et pur pour être vérifiable : à partir des
// questions et des réponses, il produit les compteurs stockés sur la copie.
type TallyQuestion = { id: string; manual: boolean };
type TallyAnswer = { hasContent: boolean; awarded: number | undefined };
export function tallyCopy(questions: TallyQuestion[], answers: Map<string, TallyAnswer>) {
  let answeredCount = 0;
  let autoScore = 0;
  let manualScore = 0;
  for (const a of answers.values()) if (a.hasContent) answeredCount += 1;
  for (const q of questions) {
    const a = answers.get(q.id);
    if (!a || typeof a.awarded !== "number") continue;
    if (q.manual) manualScore += a.awarded;
    else autoScore += a.awarded;
  }
  // Reste-t-il une question manuelle sans note ? (non répondue = à noter aussi)
  const needsGrading = questions.some((q) => {
    if (!q.manual) return false;
    const a = answers.get(q.id);
    return !a || typeof a.awarded !== "number";
  });
  return { answeredCount, autoScore, manualScore, needsGrading };
}

// Recalcule l'état chiffré d'une copie à partir de ses réponses enregistrées.
// Appelé à chaque changement : la supervision en direct lit ces champs.
async function recomputeParticipant(ctx: MutationCtx, participant: Doc<"quizParticipants">) {
  const session = await ctx.db.get(participant.sessionId);
  if (!session) return;
  const questions = await ctx.db
    .query("quizQuestions")
    .withIndex("by_quiz", (q) => q.eq("quizId", session.quizId))
    .collect();
  const answers = await ctx.db
    .query("quizAnswers")
    .withIndex("by_participant", (q) => q.eq("participantId", participant._id))
    .collect();

  const answerMap = new Map<string, TallyAnswer>(
    answers.map((a) => [a.questionId as string, {
      hasContent: (a.choiceIds != null && a.choiceIds.length > 0) || (a.text != null && a.text.trim().length > 0),
      awarded: a.awarded,
    }]),
  );
  const tally = tallyCopy(
    questions.map((q) => ({ id: q._id as string, manual: isManualQuestion(q) })),
    answerMap,
  );
  await ctx.db.patch(participant._id, tally);
}

// Bonnes réponses d'un quiz, groupées par question.
async function correctByQuestion(ctx: QueryCtx | MutationCtx, quizId: Id<"quizzes">) {
  const choices = await ctx.db
    .query("quizChoices")
    .withIndex("by_quiz", (q) => q.eq("quizId", quizId))
    .collect();
  const map = new Map<string, string[]>();
  for (const c of choices) {
    if (c.correct) {
      const arr = map.get(c.questionId as string) ?? [];
      arr.push(c._id as string);
      map.set(c.questionId as string, arr);
    }
  }
  return map;
}

// Mélange stable, propre à une copie : l'ordre ne bouge pas si le cadet
// actualise la page (sinon il repartirait dans le désordre).
function seededOrder<T extends { _id: string }>(items: T[], seed: string): T[] {
  const scored = items.map((it) => {
    let h = 0;
    const key = seed + it._id;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return { it, h };
  });
  scored.sort((a, b) => a.h - b.h);
  return scored.map((s) => s.it);
}

// ---------- Côté instructeur : pilotage ----------

// Session non close (LOBBY/RUNNING) ou terminée non publiée d'un quiz : sert à
// l'éditeur pour proposer d'ouvrir ou de reprendre le pilotage.
export const currentForQuiz = query({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, { quizId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.session.manage");
    const sessions = await ctx.db
      .query("quizSessions")
      .withIndex("by_quiz", (q) => q.eq("quizId", quizId))
      .collect();
    const active = sessions
      .filter((s) => s.status !== "PUBLISHED")
      .sort((a, b) => b.openedAt - a.openedAt)[0];
    if (!active) return null;
    return { _id: active._id, status: active.status };
  },
});

export const open = mutation({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, { quizId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.session.manage");
    const quiz = await ctx.db.get(quizId);
    if (!quiz) throw new Error("Quiz introuvable.");

    const firstQuestion = await ctx.db
      .query("quizQuestions")
      .withIndex("by_quiz", (q) => q.eq("quizId", quizId))
      .first();
    if (!firstQuestion) throw new Error("Ce quiz n'a aucune question : ajoutez-en avant d'ouvrir une session.");

    // Une seule session ouverte (salle d'attente ou en cours) par quiz.
    const existing = await ctx.db
      .query("quizSessions")
      .withIndex("by_quiz", (q) => q.eq("quizId", quizId))
      .collect();
    const live = existing.find((s) => s.status === "LOBBY" || s.status === "RUNNING");
    if (live) throw new Error("Une session est déjà ouverte pour ce quiz.");

    const sessionId = await ctx.db.insert("quizSessions", {
      quizId,
      title: quiz.title,
      status: "LOBBY",
      openedBy: agent._id,
      openedAt: Date.now(),
    });
    await writeAudit(ctx, agent, { action: "lspa.session_open", resourceType: "quizSession", resourceId: sessionId, resourceLabel: quiz.title });
    return sessionId;
  },
});

export const start = mutation({
  args: { sessionId: v.id("quizSessions") },
  handler: async (ctx, { sessionId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.session.manage");
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session introuvable.");
    if (session.status !== "LOBBY") throw new Error("La session n'est plus en salle d'attente.");

    const quiz = await ctx.db.get(session.quizId);
    const now = Date.now();
    // Petit sursis pour le décompte 3-2-1 côté cadets avant le vrai départ.
    const startedAt = now + 3000;
    const endsAt = quiz?.durationSeconds ? startedAt + quiz.durationSeconds * 1000 : undefined;
    await ctx.db.patch(sessionId, { status: "RUNNING", startedAt, endsAt });
    return { startedAt, endsAt: endsAt ?? null };
  },
});

export const close = mutation({
  args: { sessionId: v.id("quizSessions") },
  handler: async (ctx, { sessionId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.session.manage");
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session introuvable.");
    if (session.status !== "RUNNING" && session.status !== "LOBBY") {
      throw new Error("La session est déjà terminée.");
    }
    // Les copies non rendues sont figées en l'état (les réponses saisies sont
    // déjà enregistrées) et notées automatiquement pour ce qui peut l'être.
    const participants = await ctx.db
      .query("quizParticipants")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();
    for (const p of participants) {
      if (!p.submittedAt) await ctx.db.patch(p._id, { submittedAt: Date.now() });
      await recomputeParticipant(ctx, (await ctx.db.get(p._id))!);
    }
    await ctx.db.patch(sessionId, { status: "CLOSED", closedAt: Date.now() });
  },
});

export const publish = mutation({
  args: { sessionId: v.id("quizSessions") },
  handler: async (ctx, { sessionId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.grade");
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session introuvable.");
    if (session.status !== "CLOSED") throw new Error("Terminez la session avant de publier les résultats.");

    const participants = await ctx.db
      .query("quizParticipants")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();
    const pending = participants.filter((p) => p.needsGrading).length;
    if (pending > 0) {
      throw new Error(`${pending} copie(s) restent à corriger avant publication.`);
    }
    await ctx.db.patch(sessionId, { status: "PUBLISHED", publishedAt: Date.now() });
    await writeAudit(ctx, agent, { action: "lspa.session_publish", resourceType: "quizSession", resourceId: sessionId, resourceLabel: session.title });
  },
});

export const cancel = mutation({
  args: { sessionId: v.id("quizSessions") },
  handler: async (ctx, { sessionId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.session.manage");
    const session = await ctx.db.get(sessionId);
    if (!session) return;
    // On ne supprime une session que tant qu'elle n'a rien produit d'utile
    // (salle d'attente). Une session jouée se termine et s'archive avec ses
    // copies plutôt que de disparaître.
    if (session.status !== "LOBBY") throw new Error("Une session lancée ne peut plus être annulée : terminez-la.");
    const participants = await ctx.db
      .query("quizParticipants")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();
    for (const p of participants) await ctx.db.delete(p._id);
    await ctx.db.delete(sessionId);
  },
});

// Vue de supervision : salle d'attente et suivi en direct. Réactive.
export const supervise = query({
  args: { sessionId: v.id("quizSessions") },
  handler: async (ctx, { sessionId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.session.manage");
    const session = await ctx.db.get(sessionId);
    if (!session) return null;

    const questions = await ctx.db
      .query("quizQuestions")
      .withIndex("by_quiz", (q) => q.eq("quizId", session.quizId))
      .collect();
    const totalQuestions = questions.length;
    const totalPoints = questions.reduce((s, q) => s + q.points, 0);

    const participants = await ctx.db
      .query("quizParticipants")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    return {
      session: {
        _id: session._id,
        quizId: session.quizId,
        title: session.title,
        status: session.status,
        startedAt: session.startedAt ?? null,
        endsAt: session.endsAt ?? null,
      },
      totalQuestions,
      totalPoints,
      participants: participants
        .map((p) => ({
          _id: p._id,
          name: p.name,
          joinedAt: p.joinedAt,
          submittedAt: p.submittedAt ?? null,
          answeredCount: p.answeredCount,
          score: p.autoScore + (p.manualScore ?? 0),
          needsGrading: p.needsGrading,
        }))
        .sort((a, b) => a.joinedAt - b.joinedAt),
    };
  },
});

// ---------- Correction manuelle ----------

// Copies à corriger + réponses libres avec le repère de correction.
export const gradingQueue = query({
  args: { sessionId: v.id("quizSessions") },
  handler: async (ctx, { sessionId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.grade");
    const session = await ctx.db.get(sessionId);
    if (!session) return null;

    const questions = (await ctx.db
      .query("quizQuestions")
      .withIndex("by_quiz", (q) => q.eq("quizId", session.quizId))
      .collect())
      .sort((a, b) => a.position - b.position);
    const manualQ = questions.filter(isManualQuestion);

    const participants = await ctx.db
      .query("quizParticipants")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    const rows = [];
    for (const p of participants) {
      const answers = await ctx.db
        .query("quizAnswers")
        .withIndex("by_participant", (q) => q.eq("participantId", p._id))
        .collect();
      const byQ = new Map(answers.map((a) => [a.questionId as string, a]));
      rows.push({
        participantId: p._id,
        name: p.name,
        needsGrading: p.needsGrading,
        answers: manualQ.map((q) => {
          const a = byQ.get(q._id as string);
          return {
            questionId: q._id,
            prompt: q.prompt,
            points: q.points,
            expectedAnswer: q.expectedAnswer ?? null,
            text: a?.text ?? "",
            awarded: typeof a?.awarded === "number" ? a.awarded : null,
            comment: a?.comment ?? "",
          };
        }),
      });
    }
    return {
      status: session.status,
      questions: manualQ.map((q) => ({ _id: q._id, prompt: q.prompt, points: q.points })),
      rows: rows.sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});

export const gradeParticipant = mutation({
  args: {
    participantId: v.id("quizParticipants"),
    awards: v.array(v.object({
      questionId: v.id("quizQuestions"),
      awarded: v.number(),
      comment: v.optional(v.string()),
    })),
  },
  handler: async (ctx, { participantId, awards }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.grade");
    const participant = await ctx.db.get(participantId);
    if (!participant) throw new Error("Copie introuvable.");

    for (const a of awards) {
      const question = await ctx.db.get(a.questionId);
      if (!question) continue;
      const capped = Math.max(0, Math.min(question.points, a.awarded));
      const existing = await ctx.db
        .query("quizAnswers")
        .withIndex("by_participant_question", (q) => q.eq("participantId", participantId).eq("questionId", a.questionId))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { awarded: capped, comment: a.comment?.trim() || undefined, gradedBy: agent._id, gradedAt: Date.now() });
      } else {
        // Question non répondue : on crée la ligne pour porter la note (0 le
        // plus souvent), sinon la copie resterait « à corriger » indéfiniment.
        await ctx.db.insert("quizAnswers", {
          participantId,
          sessionId: participant.sessionId,
          questionId: a.questionId,
          answeredAt: Date.now(),
          awarded: capped,
          comment: a.comment?.trim() || undefined,
          gradedBy: agent._id,
          gradedAt: Date.now(),
        });
      }
    }
    const fresh = await ctx.db.get(participantId);
    if (fresh) {
      await recomputeParticipant(ctx, fresh);
      await ctx.db.patch(participantId, { gradedAt: Date.now() });
    }
  },
});

// ---------- Côté cadet : passage ----------

// Ce que voit le cadet sur la page Quiz : la session active (à rejoindre ou en
// cours) et ses résultats publiés. Rien tant qu'aucune session n'est ouverte.
export const forMe = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.view");

    const myParticipations = await ctx.db
      .query("quizParticipants")
      .withIndex("by_agent", (q) => q.eq("agentId", agent._id))
      .collect();
    const myBySession = new Map(myParticipations.map((p) => [p.sessionId as string, p]));

    const lobby = await ctx.db.query("quizSessions").withIndex("by_status", (q) => q.eq("status", "LOBBY")).collect();
    const running = await ctx.db.query("quizSessions").withIndex("by_status", (q) => q.eq("status", "RUNNING")).collect();
    const openSessions = [...lobby, ...running]
      .sort((a, b) => b.openedAt - a.openedAt)
      .map((s) => ({
        _id: s._id,
        title: s.title,
        status: s.status,
        joined: myBySession.has(s._id as string),
        submitted: !!myBySession.get(s._id as string)?.submittedAt,
      }));

    // Résultats publiés des sessions auxquelles le cadet a participé.
    const results = [];
    for (const p of myParticipations) {
      const s = await ctx.db.get(p.sessionId);
      if (s && s.status === "PUBLISHED") {
        const quiz = await ctx.db.get(s.quizId);
        const total = p.autoScore + (p.manualScore ?? 0);
        const maxPoints = (await ctx.db.query("quizQuestions").withIndex("by_quiz", (q) => q.eq("quizId", s.quizId)).collect())
          .reduce((sum, q) => sum + q.points, 0);
        const passed = maxPoints > 0 && (total / maxPoints) * 100 >= (quiz?.passPercent ?? 100);
        results.push({
          sessionId: s._id,
          title: s.title,
          publishedAt: s.publishedAt ?? 0,
          score: total,
          maxPoints,
          passed,
        });
      }
    }
    results.sort((a, b) => b.publishedAt - a.publishedAt);

    return { openSessions, results };
  },
});

export const join = mutation({
  args: { sessionId: v.id("quizSessions") },
  handler: async (ctx, { sessionId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.view");
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session introuvable.");
    if (session.status !== "LOBBY" && session.status !== "RUNNING") {
      throw new Error("Cette session n'accepte plus de participants.");
    }
    const existing = await ctx.db
      .query("quizParticipants")
      .withIndex("by_session_agent", (q) => q.eq("sessionId", sessionId).eq("agentId", agent._id))
      .unique();
    if (existing) return existing._id;
    // On ne rejoint une session déjà lancée que si on en était : sinon un
    // retardataire démarrerait avec moins de temps. En salle d'attente, ouvert.
    if (session.status === "RUNNING") throw new Error("La session est déjà lancée.");
    return await ctx.db.insert("quizParticipants", {
      sessionId,
      agentId: agent._id,
      name: `${agent.prenomRP} ${agent.nomRP}`,
      joinedAt: Date.now(),
      answeredCount: 0,
      autoScore: 0,
      manualScore: 0,
      needsGrading: false,
    });
  },
});

// État de jeu d'un cadet pour une session : statut, questions expurgées de
// leurs réponses, et ses propres réponses déjà saisies (reprise après reload).
export const play = query({
  args: { sessionId: v.id("quizSessions") },
  handler: async (ctx, { sessionId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.view");
    const session = await ctx.db.get(sessionId);
    if (!session) return null;

    const participant = await ctx.db
      .query("quizParticipants")
      .withIndex("by_session_agent", (q) => q.eq("sessionId", sessionId).eq("agentId", agent._id))
      .unique();

    const quiz = await ctx.db.get(session.quizId);
    const base = {
      session: {
        _id: session._id,
        title: session.title,
        status: session.status,
        startedAt: session.startedAt ?? null,
        endsAt: session.endsAt ?? null,
      },
      joined: !!participant,
      submitted: !!participant?.submittedAt,
    };

    // Les questions ne sortent qu'une fois l'épreuve lancée, jamais en salle
    // d'attente, et toujours sans les bonnes réponses.
    if (session.status !== "RUNNING" || !participant) {
      return { ...base, questions: null as null, answers: {} as Record<string, { choiceIds: string[]; text: string }> };
    }

    const questions = await ctx.db
      .query("quizQuestions")
      .withIndex("by_quiz", (q) => q.eq("quizId", session.quizId))
      .collect();
    const choices = await ctx.db
      .query("quizChoices")
      .withIndex("by_quiz", (q) => q.eq("quizId", session.quizId))
      .collect();
    const choicesByQ = new Map<string, Doc<"quizChoices">[]>();
    for (const c of choices) {
      const arr = choicesByQ.get(c.questionId as string) ?? [];
      arr.push(c);
      choicesByQ.set(c.questionId as string, arr);
    }

    const ordered = quiz?.shuffleQuestions ? seededOrder(questions.map((q) => ({ ...q, _id: q._id as string })), participant._id as string) : questions.sort((a, b) => a.position - b.position);

    const answers = await ctx.db
      .query("quizAnswers")
      .withIndex("by_participant", (q) => q.eq("participantId", participant._id))
      .collect();
    const myAnswers: Record<string, { choiceIds: string[]; text: string }> = {};
    for (const a of answers) {
      myAnswers[a.questionId as string] = {
        choiceIds: (a.choiceIds ?? []).map((c) => c as string),
        text: a.text ?? "",
      };
    }

    return {
      ...base,
      questions: ordered.map((q) => ({
        _id: q._id as string,
        kind: q.kind,
        prompt: q.prompt,
        mediaUrls: q.mediaUrls ?? [],
        points: q.points,
        timeLimitSeconds: q.timeLimitSeconds ?? null,
        requireJustification: q.requireJustification ?? false,
        multiple: q.kind === "MULTI",
        choices: (choicesByQ.get(q._id as string) ?? [])
          .sort((a, b) => a.position - b.position)
          .map((c) => ({ _id: c._id as string, label: c.label, imageUrl: c.imageUrl ?? null })),
      })),
      answers: myAnswers,
    };
  },
});

export const saveAnswer = mutation({
  args: {
    sessionId: v.id("quizSessions"),
    questionId: v.id("quizQuestions"),
    choiceIds: v.optional(v.array(v.id("quizChoices"))),
    text: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, questionId, choiceIds, text }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.view");
    const session = await ctx.db.get(sessionId);
    if (!session || session.status !== "RUNNING") throw new Error("La session n'est pas en cours.");
    if (session.endsAt && Date.now() > session.endsAt) throw new Error("Le temps est écoulé.");

    const participant = await ctx.db
      .query("quizParticipants")
      .withIndex("by_session_agent", (q) => q.eq("sessionId", sessionId).eq("agentId", agent._id))
      .unique();
    if (!participant) throw new Error("Vous ne participez pas à cette session.");
    if (participant.submittedAt) throw new Error("Votre copie est déjà rendue.");

    const question = await ctx.db.get(questionId);
    if (!question || question.quizId !== session.quizId) throw new Error("Question introuvable.");

    const correct = (await correctByQuestion(ctx, session.quizId)).get(questionId as string) ?? [];
    const awarded = autoAward(question, choiceIds, correct);

    const existing = await ctx.db
      .query("quizAnswers")
      .withIndex("by_participant_question", (q) => q.eq("participantId", participant._id).eq("questionId", questionId))
      .unique();
    const patch = {
      choiceIds: choiceIds && choiceIds.length ? choiceIds : undefined,
      text: text && text.trim() ? text : undefined,
      answeredAt: Date.now(),
      awarded,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("quizAnswers", { participantId: participant._id, sessionId, questionId, ...patch });
    }
    await recomputeParticipant(ctx, (await ctx.db.get(participant._id))!);
  },
});

export const submit = mutation({
  args: { sessionId: v.id("quizSessions") },
  handler: async (ctx, { sessionId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.view");
    const participant = await ctx.db
      .query("quizParticipants")
      .withIndex("by_session_agent", (q) => q.eq("sessionId", sessionId).eq("agentId", agent._id))
      .unique();
    if (!participant) throw new Error("Vous ne participez pas à cette session.");
    if (participant.submittedAt) return;
    await ctx.db.patch(participant._id, { submittedAt: Date.now() });
    await recomputeParticipant(ctx, (await ctx.db.get(participant._id))!);
  },
});

// Copie corrigée d'un cadet, une fois les résultats publiés : score, réussite,
// et le détail question par question avec les bonnes réponses et l'explication.
export const myResult = query({
  args: { sessionId: v.id("quizSessions") },
  handler: async (ctx, { sessionId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.view");
    const session = await ctx.db.get(sessionId);
    if (!session || session.status !== "PUBLISHED") return null;
    const participant = await ctx.db
      .query("quizParticipants")
      .withIndex("by_session_agent", (q) => q.eq("sessionId", sessionId).eq("agentId", agent._id))
      .unique();
    if (!participant) return null;

    const quiz = await ctx.db.get(session.quizId);
    const questions = (await ctx.db
      .query("quizQuestions")
      .withIndex("by_quiz", (q) => q.eq("quizId", session.quizId))
      .collect())
      .sort((a, b) => a.position - b.position);
    const choices = await ctx.db
      .query("quizChoices")
      .withIndex("by_quiz", (q) => q.eq("quizId", session.quizId))
      .collect();
    const choicesByQ = new Map<string, Doc<"quizChoices">[]>();
    for (const c of choices) {
      const arr = choicesByQ.get(c.questionId as string) ?? [];
      arr.push(c);
      choicesByQ.set(c.questionId as string, arr);
    }
    const answers = await ctx.db
      .query("quizAnswers")
      .withIndex("by_participant", (q) => q.eq("participantId", participant._id))
      .collect();
    const byQ = new Map(answers.map((a) => [a.questionId as string, a]));

    const total = participant.autoScore + (participant.manualScore ?? 0);
    const maxPoints = questions.reduce((s, q) => s + q.points, 0);
    const passed = maxPoints > 0 && (total / maxPoints) * 100 >= (quiz?.passPercent ?? 100);

    return {
      title: session.title,
      score: total,
      maxPoints,
      passPercent: quiz?.passPercent ?? 0,
      passed,
      questions: questions.map((q) => {
        const a = byQ.get(q._id as string);
        const myChoices = new Set((a?.choiceIds ?? []).map((c) => c as string));
        return {
          _id: q._id as string,
          kind: q.kind,
          prompt: q.prompt,
          mediaUrls: q.mediaUrls ?? [],
          points: q.points,
          manual: isManualQuestion(q),
          awarded: typeof a?.awarded === "number" ? a.awarded : null,
          comment: a?.comment ?? null,
          explanation: q.explanation ?? null,
          myText: a?.text ?? null,
          expectedAnswer: isManualQuestion(q) ? q.expectedAnswer ?? null : null,
          choices: (choicesByQ.get(q._id as string) ?? [])
            .sort((x, y) => x.position - y.position)
            .map((c) => ({ label: c.label, correct: c.correct, picked: myChoices.has(c._id as string) })),
        };
      }),
    };
  },
});
