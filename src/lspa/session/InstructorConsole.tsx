import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Play, Square, Radio, Users, CheckCircle2, Hourglass, Trophy,
  PenLine, Send, Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { LoadingScreen } from "@/components/common/Loader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/common/Button";
import { RichTextEditor } from "@/components/common/RichTextEditor";
import { useCountdownLabel } from "./Countdown";

// Console de l'instructeur : salle d'attente, suivi en direct, puis correction
// et publication. Une seule route, l'état de la session décide de l'affichage.
export function InstructorConsole({ sessionId }: { sessionId: Id<"quizSessions"> }) {
  const data = useQuery(api.quizSession.supervise, { sessionId });
  const start = useMutation(api.quizSession.start);
  const close = useMutation(api.quizSession.close);
  const cancel = useMutation(api.quizSession.cancel);
  const publish = useMutation(api.quizSession.publish);
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useCan();
  const [grading, setGrading] = useState(false);
  const [busy, setBusy] = useState(false);

  const time = useCountdownLabel(data?.session.endsAt ?? null);

  if (data === undefined) return <LoadingScreen label="Chargement de la session…" />;
  if (data === null) {
    return <div className="p-[26px]"><EmptyState title="Session introuvable" action={<Button onClick={() => navigate("/lspa/quiz")}>Retour</Button>} /></div>;
  }

  const { session, participants, totalQuestions, totalPoints } = data;
  const pendingGrading = participants.filter((p) => p.needsGrading && session.status !== "LOBBY").length;

  async function run<T>(p: Promise<T>, msg: string, ok?: string) {
    setBusy(true);
    const r = await toast.guard(p, msg);
    setBusy(false);
    if (r !== undefined && ok) toast.success(ok);
    return r;
  }

  if (grading) return <GradingBoard sessionId={sessionId} onBack={() => setGrading(false)} />;

  return (
    <div className="mx-auto max-w-[820px] p-[22px_24px]" style={{ animation: "mdtFade .2s ease" }}>
      <button onClick={() => navigate(`/lspa/quiz/${session.quizId}`)} className="mb-[14px] flex items-center gap-[6px] text-[12.5px] font-semibold text-muted hover:text-text">
        <ArrowLeft className="h-[14px] w-[14px]" /> Retour au quiz
      </button>

      {/* En-tête d'état + commandes */}
      <div className="mb-[18px] rounded-card border border-border bg-surface p-[18px_20px]">
        <div className="flex items-center gap-[12px]">
          <StatusBadge status={session.status} />
          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate text-[19px] font-bold">{session.title}</h1>
            <div className="mt-[2px] text-[12.5px] text-muted">
              {totalQuestions} question{totalQuestions > 1 ? "s" : ""} · {totalPoints} pt{totalPoints > 1 ? "s" : ""} · {participants.length} inscrit{participants.length > 1 ? "s" : ""}
            </div>
          </div>
          {session.status === "RUNNING" && time.label && (
            <div className="flex items-center gap-[6px] rounded-[8px] border border-border px-[11px] py-[6px] font-data text-[14px] font-bold" style={time.urgent ? { color: "var(--danger)", borderColor: "var(--danger)" } : undefined}>
              {time.label}
            </div>
          )}
        </div>

        <div className="mt-[15px] flex flex-wrap items-center gap-2 border-t border-border pt-[15px]">
          {session.status === "LOBBY" && (
            <>
              <Button variant="primary" loading={busy} disabled={participants.length === 0} onClick={() => void run(start({ sessionId }), "Lancement impossible")}>
                <Play className="h-[15px] w-[15px]" /> Lancer l'épreuve
              </Button>
              <Button variant="ghost" onClick={() => void run(cancel({ sessionId }), "Annulation impossible").then((r) => r !== undefined && navigate(`/lspa/quiz/${session.quizId}`))}>
                Annuler la session
              </Button>
              <span className="text-[12px] text-faint">{participants.length === 0 ? "En attente de participants…" : "Lancez quand tout le monde a rejoint."}</span>
            </>
          )}
          {session.status === "RUNNING" && (
            <Button variant="danger" loading={busy} onClick={() => void run(close({ sessionId }), "Impossible de terminer", "Épreuve terminée.")}>
              <Square className="h-[14px] w-[14px]" /> Terminer l'épreuve
            </Button>
          )}
          {session.status === "CLOSED" && (
            <>
              {can("lspa.grade") && pendingGrading > 0 && (
                <Button variant="primary" onClick={() => setGrading(true)}>
                  <PenLine className="h-[15px] w-[15px]" /> Corriger ({pendingGrading})
                </Button>
              )}
              {can("lspa.grade") && (
                <Button
                  variant={pendingGrading > 0 ? "secondary" : "primary"}
                  loading={busy}
                  disabled={pendingGrading > 0}
                  onClick={() => void run(publish({ sessionId }), "Publication impossible", "Résultats publiés.")}
                >
                  <Send className="h-[15px] w-[15px]" /> Publier les résultats
                </Button>
              )}
              {pendingGrading > 0 && <span className="text-[12px] text-faint">{pendingGrading} copie(s) à corriger avant publication.</span>}
            </>
          )}
          {session.status === "PUBLISHED" && (
            <div className="flex items-center gap-[7px] text-[13px] font-semibold text-accent"><CheckCircle2 className="h-[15px] w-[15px]" /> Résultats publiés.</div>
          )}
        </div>
      </div>

      {/* Participants */}
      {participants.length === 0 ? (
        <div className="rounded-card border border-border bg-surface"><EmptyState title="Personne pour l'instant" message="Les cadets qui rejoignent apparaîtront ici en direct." /></div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="flex items-center gap-[9px] border-b border-border px-[16px] py-[10px] text-[11px] font-bold uppercase tracking-[0.09em] text-faint">
            <Users className="h-[13px] w-[13px]" /> Participants
          </div>
          {participants.map((p) => (
            <ParticipantRow key={p._id} p={p} total={totalQuestions} status={session.status} showScore={session.status !== "LOBBY"} />
          ))}
        </div>
      )}
    </div>
  );
}

function ParticipantRow({
  p, total, status, showScore,
}: {
  p: { name: string; joinedAt: number; submittedAt: number | null; answeredCount: number; score: number; needsGrading: boolean };
  total: number;
  status: string;
  showScore: boolean;
}) {
  const pct = total > 0 ? Math.round((p.answeredCount / total) * 100) : 0;
  return (
    <div className="flex items-center gap-[12px] border-b border-border px-[16px] py-[11px] last:border-b-0">
      <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-bold text-muted">
        {p.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[8px] text-[13.5px] font-semibold">
          <span className="truncate">{p.name}</span>
          {status === "RUNNING" && p.submittedAt && <span className="flex items-center gap-[3px] text-[11px] font-semibold text-accent"><CheckCircle2 className="h-[12px] w-[12px]" /> rendu</span>}
        </div>
        {status === "RUNNING" && !p.submittedAt && (
          <div className="mt-[4px] flex items-center gap-[8px]">
            <div className="h-[4px] w-[120px] overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="font-data text-[11px] text-faint">{p.answeredCount}/{total}</span>
          </div>
        )}
        {status === "LOBBY" && <div className="text-[11.5px] text-faint">Prêt</div>}
      </div>
      {showScore && (
        <div className="flex flex-shrink-0 items-center gap-[8px]">
          {p.needsGrading && <span title="À corriger" className="flex items-center gap-[4px] text-[11px] font-semibold text-warning"><PenLine className="h-[12px] w-[12px]" /> à corriger</span>}
          <span className="flex items-center gap-[5px] font-data text-[14px] font-bold"><Trophy className="h-[13px] w-[13px] text-faint" /> {p.score}</span>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; icon: typeof Radio }> = {
    LOBBY: { label: "Salle d'attente", color: "var(--warning)", icon: Hourglass },
    RUNNING: { label: "En cours", color: "var(--accent)", icon: Radio },
    CLOSED: { label: "Terminée", color: "var(--muted)", icon: Square },
    PUBLISHED: { label: "Publiée", color: "var(--accent)", icon: CheckCircle2 },
  };
  const s = map[status] ?? map.CLOSED;
  return (
    <span className="flex h-[40px] w-[40px] flex-shrink-0 items-center justify-center rounded-[11px]" style={{ background: `color-mix(in srgb, ${s.color} 15%, transparent)`, color: s.color }} title={s.label}>
      <s.icon className="h-[19px] w-[19px]" />
    </span>
  );
}

// Tableau de correction : une copie à la fois, réponses libres + repère attendu.
function GradingBoard({ sessionId, onBack }: { sessionId: Id<"quizSessions">; onBack: () => void }) {
  const data = useQuery(api.quizSession.gradingQueue, { sessionId });
  const grade = useMutation(api.quizSession.gradeParticipant);
  const toast = useToast();
  const [idx, setIdx] = useState(0);

  if (data === undefined) return <LoadingScreen label="Chargement des copies…" />;
  if (data === null) return <div className="p-[26px]"><EmptyState title="Rien à corriger" action={<Button onClick={onBack}>Retour</Button>} /></div>;

  const toGrade = data.rows.filter((r) => r.needsGrading);
  if (toGrade.length === 0) {
    return (
      <div className="mx-auto max-w-[720px] p-[26px]">
        <EmptyState title="Correction terminée" message="Toutes les copies sont notées. Vous pouvez publier les résultats." action={<Button variant="primary" onClick={onBack}>Retour à la session</Button>} />
      </div>
    );
  }

  const row = toGrade[Math.min(idx, toGrade.length - 1)];
  return (
    <div className="mx-auto max-w-[760px] p-[22px_24px]" style={{ animation: "mdtFade .2s ease" }}>
      <button onClick={onBack} className="mb-[14px] flex items-center gap-[6px] text-[12.5px] font-semibold text-muted hover:text-text">
        <ArrowLeft className="h-[14px] w-[14px]" /> Retour à la session
      </button>
      <div className="mb-[14px] flex items-center gap-[10px]">
        <h1 className="m-0 flex-1 text-[19px] font-bold">Correction · {row.name}</h1>
        <span className="font-data text-[12.5px] text-faint">{Math.min(idx + 1, toGrade.length)} / {toGrade.length}</span>
      </div>
      <GradeForm
        key={row.participantId}
        row={row}
        onSave={async (awards) => {
          const r = await toast.guard(grade({ participantId: row.participantId as Id<"quizParticipants">, awards }), "Enregistrement impossible");
          if (r !== undefined) {
            toast.success("Copie notée.");
            if (idx < toGrade.length - 1) setIdx(idx); // la liste se resserre : on reste sur la même position
            else onBack();
          }
        }}
      />
    </div>
  );
}

function GradeForm({
  row, onSave,
}: {
  row: {
    participantId: string;
    name: string;
    answers: { questionId: string; prompt: string; points: number; expectedAnswer: string | null; text: string; awarded: number | null; comment: string }[];
  };
  onSave: (awards: { questionId: Id<"quizQuestions">; awarded: number; comment?: string }[]) => void | Promise<void>;
}) {
  const [state, setState] = useState(() =>
    Object.fromEntries(row.answers.map((a) => [a.questionId, { awarded: a.awarded ?? 0, comment: a.comment ?? "" }])),
  );
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    await onSave(row.answers.map((a) => ({
      questionId: a.questionId as Id<"quizQuestions">,
      awarded: state[a.questionId].awarded,
      comment: state[a.questionId].comment || undefined,
    })));
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-[14px]">
      {row.answers.map((a) => (
        <article key={a.questionId} className="rounded-card border border-border bg-surface p-[15px_17px]">
          <div className="mb-[8px] text-[14px] font-semibold leading-[1.4]">
            <RichTextEditor value={a.prompt} editable={false} minHeight={0} />
          </div>

          <div className="mb-[3px] text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Réponse du cadet</div>
          <div className="mb-[10px] whitespace-pre-wrap rounded-sm border border-border bg-surface-2 p-[10px_12px] text-[13.5px]">
            {a.text || <span className="italic text-faint">Sans réponse</span>}
          </div>

          {a.expectedAnswer && (
            <div className="mb-[10px] rounded-sm border border-border bg-surface-2 p-[9px_11px]">
              <div className="mb-[2px] text-[11px] font-bold uppercase tracking-[0.07em] text-accent">Attendu</div>
              <div className="text-[13px] text-muted">{a.expectedAnswer}</div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-[12px]">
            <div className="flex items-center gap-[8px]">
              <span className="text-[12px] font-semibold text-muted">Points</span>
              <input
                type="number" min={0} max={a.points} step={0.5}
                value={state[a.questionId].awarded}
                onChange={(e) => setState((s) => ({ ...s, [a.questionId]: { ...s[a.questionId], awarded: Number(e.target.value) } }))}
                className="h-9 w-[74px] rounded-sm border border-border bg-surface-2 px-2 font-data text-[13px] outline-none focus:border-accent"
              />
              <span className="text-[12px] text-faint">/ {a.points}</span>
            </div>
            <div className="flex flex-1 items-center gap-[8px]">
              <button
                type="button"
                onClick={() => setState((s) => ({ ...s, [a.questionId]: { ...s[a.questionId], awarded: a.points } }))}
                className="rounded-sm border border-border bg-surface-2 px-[9px] py-[6px] text-[11.5px] font-semibold text-accent hover:border-border-strong"
              >
                Tout accorder
              </button>
              <button
                type="button"
                onClick={() => setState((s) => ({ ...s, [a.questionId]: { ...s[a.questionId], awarded: 0 } }))}
                className="rounded-sm border border-border bg-surface-2 px-[9px] py-[6px] text-[11.5px] font-semibold text-muted hover:border-border-strong"
              >
                Zéro
              </button>
            </div>
          </div>
          <input
            value={state[a.questionId].comment}
            onChange={(e) => setState((s) => ({ ...s, [a.questionId]: { ...s[a.questionId], comment: e.target.value } }))}
            placeholder="Commentaire (facultatif, visible par le cadet)"
            className="mt-[9px] h-9 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent"
          />
        </article>
      ))}

      <Button variant="primary" block loading={busy} onClick={() => void save()}>
        {busy ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <CheckCircle2 className="h-[15px] w-[15px]" />}
        Valider cette copie
      </Button>
    </div>
  );
}
