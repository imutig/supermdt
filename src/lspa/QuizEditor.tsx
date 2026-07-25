import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Plus, ChevronUp, ChevronDown, Trash2, Pencil, X, CheckCircle2, Circle,
  Type, ListChecks, CircleDot, PenLine, Clock,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { RichTextEditor, richTextToPlain } from "@/components/common/RichTextEditor";
import { ImageGallery } from "@/components/common/ImageGallery";
import { StatusChip } from "./LspaQuiz";

type Kind = "SINGLE" | "MULTI" | "TEXT";
type ChoiceDraft = { label: string; imageUrl?: string; correct: boolean };
type QuestionDraft = {
  questionId?: Id<"quizQuestions">;
  kind: Kind;
  prompt: string;
  mediaUrls: string[];
  points: number;
  timeLimitSeconds: number | null;
  requireJustification: boolean;
  expectedAnswer: string;
  explanation: string;
  choices: ChoiceDraft[];
};

const KINDS: { value: Kind; label: string; hint: string; icon: typeof Type }[] = [
  { value: "SINGLE", label: "Réponse unique", hint: "Une seule bonne réponse, corrigée automatiquement.", icon: CircleDot },
  { value: "MULTI", label: "Réponses multiples", hint: "Plusieurs bonnes réponses, corrigées automatiquement.", icon: ListChecks },
  { value: "TEXT", label: "Réponse libre", hint: "Champ de saisie, corrigé à la main par un instructeur.", icon: Type },
];

const F = "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";

function emptyDraft(): QuestionDraft {
  return {
    kind: "SINGLE",
    prompt: "",
    mediaUrls: [],
    points: 1,
    timeLimitSeconds: null,
    requireJustification: false,
    expectedAnswer: "",
    explanation: "",
    choices: [
      { label: "", correct: true },
      { label: "", correct: false },
    ],
  };
}

export function QuizEditor() {
  const { id } = useParams<{ id: string }>();
  const quizId = id as Id<"quizzes">;
  const data = useQuery(api.quiz.get, { quizId });
  const update = useMutation(api.quiz.update);
  const remove = useMutation(api.quiz.remove);
  const removeQuestion = useMutation(api.quiz.removeQuestion);
  const moveQuestion = useMutation(api.quiz.moveQuestion);
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useCan();
  const canEdit = can("lspa.quiz.edit");

  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (data === undefined) return <div className="p-[22px_26px]"><SkeletonRows rows={5} /></div>;
  if (data === null) {
    return (
      <div className="p-[22px_26px]">
        <EmptyState title="Quiz introuvable" message="Il a peut-être été supprimé." action={<Button onClick={() => navigate("/lspa/quiz")}>Retour</Button>} />
      </div>
    );
  }

  const { quiz, questions } = data;
  const total = questions.reduce((s, q) => s + q.points, 0);
  const manual = questions.some((q) => q.manual);

  async function patch(p: Record<string, unknown>) {
    await toast.guard(update({ quizId, ...p }), "Enregistrement impossible");
  }

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <button
        onClick={() => navigate("/lspa/quiz")}
        className="mb-[14px] flex items-center gap-[6px] text-[12.5px] font-semibold text-muted hover:text-text"
      >
        <ArrowLeft className="h-[14px] w-[14px]" />
        Tous les quiz
      </button>

      {/* Réglages du quiz */}
      <section className="mb-[16px] rounded-card border border-border bg-surface p-[16px_18px]">
        <div className="mb-[13px] flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <input
              defaultValue={quiz.title}
              disabled={!canEdit}
              onBlur={(e) => { if (e.target.value.trim() && e.target.value !== quiz.title) void patch({ title: e.target.value }); }}
              className="m-0 w-full border-none bg-transparent text-[20px] font-bold tracking-tight text-text outline-none"
            />
            <input
              defaultValue={quiz.description ?? ""}
              disabled={!canEdit}
              placeholder="Description (facultative)"
              onBlur={(e) => { if (e.target.value !== (quiz.description ?? "")) void patch({ description: e.target.value }); }}
              className="mt-[2px] w-full border-none bg-transparent text-[13px] text-muted outline-none"
            />
          </div>
          <StatusChip status={quiz.status} />
        </div>

        <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-3">
          <Field label="Seuil de réussite" hint="En pourcentage du total des points.">
            <div className="flex items-center gap-[7px]">
              <input
                type="number" min={0} max={100} defaultValue={quiz.passPercent} disabled={!canEdit}
                onBlur={(e) => void patch({ passPercent: Number(e.target.value) })}
                className={`${F} font-data`}
              />
              <span className="text-[13px] text-faint">%</span>
            </div>
          </Field>
          <Field label="Temps global" hint="Laisser vide pour ne pas limiter.">
            <div className="flex items-center gap-[7px]">
              <input
                type="number" min={0} defaultValue={quiz.durationSeconds ? Math.round(quiz.durationSeconds / 60) : ""}
                disabled={!canEdit} placeholder="—"
                onBlur={(e) => void patch({ durationSeconds: Number(e.target.value || 0) * 60 })}
                className={`${F} font-data`}
              />
              <span className="text-[13px] text-faint">min</span>
            </div>
          </Field>
          <Field label="Barème total" hint={manual ? "Contient des réponses à corriger à la main." : "Entièrement corrigé automatiquement."}>
            <div className="flex h-10 items-center rounded-sm border border-dashed border-border px-3 font-data text-[13px]" style={{ color: "var(--accent)" }}>
              {total} pt{total > 1 ? "s" : ""} · {questions.length} question{questions.length > 1 ? "s" : ""}
            </div>
          </Field>
        </div>

        {canEdit && (
          <div className="mt-[13px] flex flex-wrap items-center gap-[10px] border-t border-border pt-[13px]">
            <label className="flex cursor-pointer items-center gap-[8px] text-[13px]">
              <input
                type="checkbox" checked={quiz.shuffleQuestions}
                onChange={(e) => void patch({ shuffleQuestions: e.target.checked })}
                className="h-[15px] w-[15px] accent-[var(--accent)]"
              />
              Mélanger l'ordre des questions à chaque passage
            </label>
            <div className="flex-1" />
            {quiz.status === "DRAFT" ? (
              <Button variant="primary" onClick={() => void patch({ status: "PUBLISHED" })}>
                Marquer comme prêt
              </Button>
            ) : quiz.status === "PUBLISHED" ? (
              <Button onClick={() => void patch({ status: "DRAFT" })}>Repasser en brouillon</Button>
            ) : null}
            {can("lspa.quiz.delete") && (
              confirmDelete ? (
                <>
                  <span className="text-[12.5px] text-muted">Supprimer ce quiz ?</span>
                  <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</Button>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      const r = await toast.guard(remove({ quizId }), "Suppression impossible");
                      if (r === "archived") toast.success("Quiz archivé : il a déjà servi, ses copies sont conservées.");
                      else if (r === "deleted") toast.success("Quiz supprimé.");
                      if (r !== undefined) navigate("/lspa/quiz");
                    }}
                  >
                    Confirmer
                  </Button>
                </>
              ) : (
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-[14px] w-[14px]" />
                  Supprimer
                </Button>
              )
            )}
          </div>
        )}
      </section>

      {/* Questions */}
      <div className="mb-[11px] flex items-center gap-3">
        <h2 className="m-0 text-[13px] font-bold uppercase tracking-[0.09em] text-faint">Questions</h2>
        <div className="flex-1" />
        {canEdit && (
          <Button variant="primary" onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-[15px] w-[15px]" />
            Ajouter une question
          </Button>
        )}
      </div>

      {questions.length === 0 ? (
        <div className="rounded-card border border-border bg-surface">
          <EmptyState title="Aucune question" message="Le quiz ne peut pas être ouvert tant qu'il est vide." />
        </div>
      ) : (
        <div className="flex flex-col gap-[10px]">
          {questions.map((q, i) => (
            <article key={q._id} className="rounded-card border border-border bg-surface p-[13px_15px]">
              <div className="flex items-start gap-[11px]">
                <span className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[8px] bg-surface-2 font-data text-[12px] font-bold text-muted">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  {/* Aperçu en texte brut : monter un éditeur par question
                      rendait la liste lourde pour un simple résumé. */}
                  <div className="text-[13.5px] leading-[1.5]">
                    {richTextToPlain(q.prompt) || <span className="italic text-faint">Énoncé vide</span>}
                  </div>
                  <div className="mt-[6px] flex flex-wrap items-center gap-x-[12px] gap-y-[4px] text-[11.5px] text-muted">
                    <KindChip kind={q.kind as Kind} />
                    <span className="font-data">{q.points} pt{q.points > 1 ? "s" : ""}</span>
                    {q.timeLimitSeconds && (
                      <span className="flex items-center gap-[5px]"><Clock className="h-[12px] w-[12px]" />{q.timeLimitSeconds}s</span>
                    )}
                    {q.manual && (
                      <span className="flex items-center gap-[5px] text-warning"><PenLine className="h-[12px] w-[12px]" />Correction manuelle</span>
                    )}
                    {q.mediaUrls.length > 0 && <span>{q.mediaUrls.length} image{q.mediaUrls.length > 1 ? "s" : ""}</span>}
                  </div>
                  {q.kind !== "TEXT" && (
                    <ul className="m-0 mt-[8px] flex list-none flex-col gap-[3px] p-0">
                      {q.choices.map((c) => (
                        <li key={c._id} className="flex items-center gap-[7px] text-[12.5px]" style={{ color: c.correct ? "var(--accent)" : "var(--muted)" }}>
                          {c.correct ? <CheckCircle2 className="h-[13px] w-[13px] flex-shrink-0" /> : <Circle className="h-[13px] w-[13px] flex-shrink-0" />}
                          {c.label || <span className="italic text-faint">(vide)</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {canEdit && (
                  <div className="flex flex-shrink-0 items-center gap-[4px]">
                    <IconBtn title="Monter" disabled={i === 0} onClick={() => void moveQuestion({ questionId: q._id, direction: "up" })}><ChevronUp className="h-[14px] w-[14px]" /></IconBtn>
                    <IconBtn title="Descendre" disabled={i === questions.length - 1} onClick={() => void moveQuestion({ questionId: q._id, direction: "down" })}><ChevronDown className="h-[14px] w-[14px]" /></IconBtn>
                    <IconBtn
                      title="Modifier"
                      onClick={() => setDraft({
                        questionId: q._id,
                        kind: q.kind as Kind,
                        prompt: q.prompt,
                        mediaUrls: q.mediaUrls,
                        points: q.points,
                        timeLimitSeconds: q.timeLimitSeconds,
                        requireJustification: q.requireJustification,
                        expectedAnswer: q.expectedAnswer ?? "",
                        explanation: q.explanation ?? "",
                        choices: q.choices.length
                          ? q.choices.map((c) => ({ label: c.label, imageUrl: c.imageUrl ?? undefined, correct: c.correct }))
                          : emptyDraft().choices,
                      })}
                    >
                      <Pencil className="h-[14px] w-[14px]" />
                    </IconBtn>
                    <IconBtn
                      title="Supprimer"
                      danger
                      onClick={async () => { await toast.guard(removeQuestion({ questionId: q._id }), "Suppression impossible"); }}
                    >
                      <Trash2 className="h-[14px] w-[14px]" />
                    </IconBtn>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {draft && <QuestionPanel quizId={quizId} draft={draft} onClose={() => setDraft(null)} />}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-[5px]">
      <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

function IconBtn({ children, title, onClick, disabled, danger }: {
  children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`mdt-press flex h-[28px] w-[28px] items-center justify-center rounded-[7px] border border-border bg-surface-2 text-muted disabled:opacity-35 disabled:pointer-events-none ${danger ? "hover:text-danger" : "hover:text-text"}`}
    >
      {children}
    </button>
  );
}

function KindChip({ kind }: { kind: Kind }) {
  const k = KINDS.find((x) => x.value === kind) ?? KINDS[0];
  return <span className="flex items-center gap-[5px]"><k.icon className="h-[12px] w-[12px]" />{k.label}</span>;
}

// Panneau d'édition d'une question. La question et ses options sont enregistrées
// ensemble : on ne laisse jamais en base une question à choix sans réponse.
function QuestionPanel({ quizId, draft, onClose }: { quizId: Id<"quizzes">; draft: QuestionDraft; onClose: () => void }) {
  const save = useMutation(api.quiz.saveQuestion);
  const toast = useToast();
  const [d, setD] = useState<QuestionDraft>(draft);
  const [busy, setBusy] = useState(false);

  // Fermeture au clavier : le panneau couvre l'écran, Échap est le réflexe.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  function setChoice(i: number, patch: Partial<ChoiceDraft>) {
    setD((s) => ({ ...s, choices: s.choices.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  }

  // En réponse unique, cocher une option décoche les autres : c'est la
  // définition du type, autant l'appliquer plutôt que de la faire respecter
  // par un message d'erreur au moment d'enregistrer.
  function toggleCorrect(i: number) {
    setD((s) => ({
      ...s,
      choices: s.choices.map((c, j) =>
        s.kind === "SINGLE" ? { ...c, correct: j === i } : j === i ? { ...c, correct: !c.correct } : c,
      ),
    }));
  }

  async function submit() {
    setBusy(true);
    const r = await toast.guard(
      save({
        quizId,
        questionId: d.questionId,
        kind: d.kind,
        prompt: d.prompt,
        mediaUrls: d.mediaUrls,
        points: d.points,
        timeLimitSeconds: d.timeLimitSeconds ?? undefined,
        requireJustification: d.requireJustification,
        expectedAnswer: d.expectedAnswer,
        explanation: d.explanation,
        choices: d.choices.filter((c) => c.label.trim().length > 0),
      }),
      "Enregistrement impossible",
    );
    setBusy(false);
    if (r) { toast.success(d.questionId ? "Question mise à jour." : "Question ajoutée."); onClose(); }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-[620px] max-w-[96vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]"
        style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}
      >
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">{d.questionId ? "Modifier la question" : "Nouvelle question"}</h2>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto px-[18px] py-4">
          {/* Type */}
          <div className="grid grid-cols-1 gap-[7px] sm:grid-cols-3">
            {KINDS.map((k) => (
              <button
                key={k.value}
                onClick={() => setD((s) => ({ ...s, kind: k.value }))}
                className="mdt-press flex flex-col items-start gap-[4px] rounded-[10px] border p-[10px_11px] text-left"
                style={{
                  borderColor: d.kind === k.value ? "var(--accent)" : "var(--border)",
                  background: d.kind === k.value ? "var(--accent-soft)" : "var(--surface-2)",
                }}
              >
                <span className="flex items-center gap-[6px] text-[12.5px] font-semibold" style={{ color: d.kind === k.value ? "var(--accent)" : "var(--text)" }}>
                  <k.icon className="h-[14px] w-[14px]" />
                  {k.label}
                </span>
                <span className="text-[10.5px] leading-[1.35] text-faint">{k.hint}</span>
              </button>
            ))}
          </div>

          <Field label="Énoncé">
            <RichTextEditor value={d.prompt} onChange={(html) => setD((s) => ({ ...s, prompt: html }))} placeholder="Posez la question…" minHeight={110} />
          </Field>

          <Field label="Illustrations" hint="Images affichées avec l'énoncé.">
            <ImageGallery urls={d.mediaUrls} onChange={(urls) => setD((s) => ({ ...s, mediaUrls: urls }))} emptyLabel="Aucune illustration." />
          </Field>

          <div className="grid grid-cols-2 gap-[12px]">
            <Field label="Barème" hint="Points accordés à cette question.">
              <input
                type="number" min={0.5} step={0.5} value={d.points}
                onChange={(e) => setD((s) => ({ ...s, points: Number(e.target.value) }))}
                className={`${F} font-data`}
              />
            </Field>
            <Field label="Temps de la question" hint="En secondes. Vide = pas de limite propre.">
              <input
                type="number" min={0} value={d.timeLimitSeconds ?? ""} placeholder="—"
                onChange={(e) => setD((s) => ({ ...s, timeLimitSeconds: e.target.value ? Number(e.target.value) : null }))}
                className={`${F} font-data`}
              />
            </Field>
          </div>

          {/* Options */}
          {d.kind !== "TEXT" && (
            <Field label="Réponses" hint={d.kind === "SINGLE" ? "Cochez l'unique bonne réponse." : "Cochez toutes les bonnes réponses."}>
              <div className="flex flex-col gap-[7px]">
                {d.choices.map((c, i) => (
                  <div key={i} className="flex items-center gap-[8px]">
                    <button
                      onClick={() => toggleCorrect(i)}
                      title={c.correct ? "Bonne réponse" : "Marquer comme bonne réponse"}
                      className="mdt-press flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[8px] border"
                      style={{
                        borderColor: c.correct ? "var(--accent)" : "var(--border)",
                        background: c.correct ? "var(--accent-soft)" : "var(--surface-2)",
                        color: c.correct ? "var(--accent)" : "var(--faint)",
                      }}
                    >
                      {c.correct ? <CheckCircle2 className="h-[15px] w-[15px]" /> : <Circle className="h-[15px] w-[15px]" />}
                    </button>
                    <input
                      value={c.label}
                      onChange={(e) => setChoice(i, { label: e.target.value })}
                      placeholder={`Réponse ${i + 1}`}
                      className={F}
                    />
                    <IconBtn
                      title="Retirer"
                      danger
                      disabled={d.choices.length <= 2}
                      onClick={() => setD((s) => ({ ...s, choices: s.choices.filter((_, j) => j !== i) }))}
                    >
                      <X className="h-[14px] w-[14px]" />
                    </IconBtn>
                  </div>
                ))}
                <Button
                  onClick={() => setD((s) => ({ ...s, choices: [...s.choices, { label: "", correct: false }] }))}
                  className="!py-[6px] !text-[12.5px] self-start"
                >
                  <Plus className="h-[13px] w-[13px]" />
                  Ajouter une réponse
                </Button>
              </div>
            </Field>
          )}

          {d.kind !== "TEXT" && (
            <label className="flex cursor-pointer items-start gap-[9px] rounded-[9px] border border-border bg-surface-2 p-[10px_12px] text-[13px]">
              <input
                type="checkbox" checked={d.requireJustification}
                onChange={(e) => setD((s) => ({ ...s, requireJustification: e.target.checked }))}
                className="mt-[2px] h-[15px] w-[15px] flex-shrink-0 accent-[var(--accent)]"
              />
              <span>
                Demander en plus une justification écrite
                <span className="mt-[2px] block text-[11px] text-faint">
                  La question passe alors en correction manuelle : un instructeur devra la relire.
                </span>
              </span>
            </label>
          )}

          {(d.kind === "TEXT" || d.requireJustification) && (
            <Field label="Réponse attendue" hint="Repère de correction. Jamais montrée au cadet.">
              <textarea
                value={d.expectedAnswer}
                onChange={(e) => setD((s) => ({ ...s, expectedAnswer: e.target.value }))}
                rows={3}
                className="w-full rounded-sm border border-border bg-surface-2 p-3 text-[13px] outline-none focus:border-accent"
              />
            </Field>
          )}

          <Field label="Explication" hint="Affichée aux cadets à la publication des résultats.">
            <textarea
              value={d.explanation}
              onChange={(e) => setD((s) => ({ ...s, explanation: e.target.value }))}
              rows={2}
              className="w-full rounded-sm border border-border bg-surface-2 p-3 text-[13px] outline-none focus:border-accent"
            />
          </Field>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 border-t border-border px-[18px] py-4">
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>Enregistrer</Button>
        </div>
      </div>
    </div>
  );
}
