import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import {
  Clock, ChevronLeft, ChevronRight, CheckCircle2, Circle, Send, Hourglass, Loader2, ArrowLeft,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { useToast } from "@/providers/toast";
import { LoadingScreen } from "@/components/common/Loader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/common/Button";
import { RichTextEditor } from "@/components/common/RichTextEditor";
import { QuizMedia } from "@/components/common/QuizMedia";
import { Countdown, useCountdownLabel } from "./Countdown";
import { ResultView } from "./ResultView";

export type PlayQuestion = {
  _id: string;
  kind: "SINGLE" | "MULTI" | "TEXT";
  prompt: string;
  mediaUrls: string[];
  points: number;
  timeLimitSeconds: number | null;
  requireJustification: boolean;
  multiple: boolean;
  choices: { _id: string; label: string; imageUrl: string | null }[];
};
export type LocalAnswer = { choiceIds: string[]; text: string };

// Expérience du cadet pour une session : salle d'attente, décompte, épreuve à
// rythme libre avec persistance, puis rendu et résultats une fois publiés.
export function CadetPlay({ sessionId }: { sessionId: Id<"quizSessions"> }) {
  const data = useQuery(api.quizSession.play, { sessionId });
  const join = useMutation(api.quizSession.join);
  const navigate = useNavigate();
  const toast = useToast();
  const [counting, setCounting] = useState(false);

  const status = data?.session.status;
  const startedAt = data?.session.startedAt ?? null;

  // Bascule automatiquement en décompte quand le départ est imminent.
  useEffect(() => {
    if (status === "RUNNING" && startedAt && startedAt > Date.now()) setCounting(true);
  }, [status, startedAt]);

  if (data === undefined) return <LoadingScreen label="Chargement de la session…" />;
  if (data === null) {
    return (
      <div className="p-[26px]">
        <EmptyState title="Session introuvable" message="Elle a peut-être été fermée." action={<Button onClick={() => navigate("/lspa/quiz")}>Retour aux quiz</Button>} />
      </div>
    );
  }

  const back = (
    <button onClick={() => navigate("/lspa/quiz")} className="flex items-center gap-[6px] text-[12.5px] font-semibold text-muted hover:text-text">
      <ArrowLeft className="h-[14px] w-[14px]" /> Quitter
    </button>
  );

  if (status === "PUBLISHED") return <ResultView sessionId={sessionId} onBack={() => navigate("/lspa/quiz")} />;

  if (status === "CLOSED") {
    return (
      <Centered>
        {back}
        <StateCard icon={<Hourglass className="h-[26px] w-[26px]" />} title="Épreuve terminée" message="Votre copie est enregistrée. Les résultats seront publiés par un instructeur." />
      </Centered>
    );
  }

  if (status === "LOBBY") {
    return (
      <Centered>
        {back}
        {data.joined ? (
          <StateCard
            icon={<span className="flex h-[26px] w-[26px] items-center justify-center"><span className="h-[12px] w-[12px] animate-pulse rounded-full bg-accent" /></span>}
            title="En salle d'attente"
            message={`« ${data.session.title} ». Patientez : l'instructeur lancera l'épreuve. Ne fermez pas cette page.`}
          />
        ) : (
          <StateCard
            icon={<Hourglass className="h-[26px] w-[26px]" />}
            title={data.session.title}
            message="Rejoignez la salle d'attente pour participer."
            action={<Button variant="primary" onClick={() => void toast.guard(join({ sessionId }), "Impossible de rejoindre")}>Rejoindre</Button>}
          />
        )}
      </Centered>
    );
  }

  // RUNNING
  if (!data.joined) {
    return (
      <Centered>
        {back}
        <StateCard icon={<Hourglass className="h-[26px] w-[26px]" />} title="Session déjà lancée" message="L'épreuve a commencé sans vous ; vous ne pouvez plus la rejoindre." />
      </Centered>
    );
  }
  if (data.submitted) {
    return (
      <Centered>
        {back}
        <StateCard icon={<CheckCircle2 className="h-[26px] w-[26px] text-accent" />} title="Copie rendue" message="Votre copie est enregistrée. Les résultats arriveront après correction." />
      </Centered>
    );
  }
  if (counting && startedAt && startedAt > Date.now()) {
    return <div className="h-full"><Countdown to={startedAt} onDone={() => setCounting(false)} /></div>;
  }
  if (!data.questions) return <LoadingScreen label="Préparation de l'épreuve…" />;

  return <Runner sessionId={sessionId} questions={data.questions} initial={data.answers} endsAt={data.session.endsAt} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center gap-[18px] p-[26px]"><div className="w-full max-w-[560px]">{children}</div></div>;
}

function StateCard({ icon, title, message, action }: { icon: React.ReactNode; title: string; message: string; action?: React.ReactNode }) {
  return (
    <div className="mt-[10vh] flex flex-col items-center rounded-card border border-border bg-surface p-[34px] text-center" style={{ animation: "mdtPopIn .3s ease" }}>
      <span className="mb-[14px] flex h-[58px] w-[58px] items-center justify-center rounded-full bg-surface-2 text-accent">{icon}</span>
      <h1 className="m-0 text-[19px] font-bold">{title}</h1>
      <p className="mt-[8px] mb-0 max-w-[420px] text-[13.5px] leading-[1.55] text-muted">{message}</p>
      {action && <div className="mt-[18px]">{action}</div>}
    </div>
  );
}

// Le déroulé de l'épreuve : une question à l'écran, navigation libre, minuterie
// globale et minuterie par question. Chaque réponse est enregistrée aussitôt.
function Runner({
  sessionId, questions, initial, endsAt,
}: {
  sessionId: Id<"quizSessions">;
  questions: PlayQuestion[];
  initial: Record<string, LocalAnswer>;
  endsAt: number | null;
}) {
  const save = useMutation(api.quizSession.saveAnswer);
  const submit = useMutation(api.quizSession.submit);
  const toast = useToast();
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>(initial);
  const [i, setI] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const time = useCountdownLabel(endsAt);
  const q = questions[i];

  // Temps global écoulé : on rend la copie automatiquement.
  useEffect(() => {
    if (time.expired) void doSubmit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time.expired]);

  const answered = useMemo(() => {
    const s = new Set<string>();
    for (const [qid, a] of Object.entries(answers)) {
      if (a.choiceIds.length > 0 || a.text.trim().length > 0) s.add(qid);
    }
    return s;
  }, [answers]);

  function persist(questionId: string, a: LocalAnswer) {
    const payload = {
      sessionId,
      questionId: questionId as Id<"quizQuestions">,
      choiceIds: a.choiceIds.length ? (a.choiceIds as Id<"quizChoices">[]) : undefined,
      text: a.text.trim() ? a.text : undefined,
    };
    void save(payload).catch(() => {/* réenregistré au prochain changement */});
  }

  function setChoice(questionId: string, choiceId: string, multiple: boolean) {
    setAnswers((prev) => {
      const cur = prev[questionId] ?? { choiceIds: [], text: "" };
      let choiceIds: string[];
      if (multiple) {
        choiceIds = cur.choiceIds.includes(choiceId) ? cur.choiceIds.filter((c) => c !== choiceId) : [...cur.choiceIds, choiceId];
      } else {
        choiceIds = cur.choiceIds[0] === choiceId ? [] : [choiceId];
      }
      const next = { ...cur, choiceIds };
      persist(questionId, next);
      return { ...prev, [questionId]: next };
    });
  }

  function setText(questionId: string, text: string) {
    setAnswers((prev) => {
      const cur = prev[questionId] ?? { choiceIds: [], text: "" };
      const next = { ...cur, text };
      // Le texte se sauvegarde en léger différé pour ne pas écrire à chaque frappe.
      clearTimeout(timers.current[questionId]);
      timers.current[questionId] = setTimeout(() => persist(questionId, next), 600);
      return { ...prev, [questionId]: next };
    });
  }

  async function doSubmit(auto = false) {
    setSubmitting(true);
    // On vide les sauvegardes de texte en attente avant de figer la copie.
    Object.values(timers.current).forEach(clearTimeout);
    for (const [qid, a] of Object.entries(answers)) {
      if (a.text.trim()) persist(qid, a);
    }
    const r = await toast.guard(submit({ sessionId }), "Envoi impossible");
    setSubmitting(false);
    if (r !== undefined && !auto) toast.success("Copie rendue.");
  }

  const goNext = () => (i < questions.length - 1 ? setI(i + 1) : setReviewing(true));

  return (
    <div className="flex h-full flex-col">
      {/* Barre de progression + minuterie */}
      <div className="flex flex-shrink-0 items-center gap-[12px] border-b border-border bg-surface px-[20px] py-[11px]">
        <div className="min-w-0 flex-1">
          <div className="mb-[5px] flex items-center gap-[8px] text-[11.5px] font-semibold text-muted">
            <span>Question {reviewing ? questions.length : i + 1} / {questions.length}</span>
            <span className="text-faint">·</span>
            <span>{answered.size} répondue{answered.size > 1 ? "s" : ""}</span>
          </div>
          <div className="h-[5px] overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(answered.size / questions.length) * 100}%` }} />
          </div>
        </div>
        {time.label && (
          <div
            className="flex items-center gap-[6px] rounded-[8px] border px-[11px] py-[6px] font-data text-[14px] font-bold"
            style={time.urgent
              ? { borderColor: "var(--danger)", color: "var(--danger)", background: "color-mix(in srgb, var(--danger) 10%, transparent)" }
              : { borderColor: "var(--border)", color: "var(--text)" }}
          >
            <Clock className="h-[14px] w-[14px]" />
            {time.label}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[960px] p-[22px_20px]">
          {reviewing ? (
            <Review
              questions={questions}
              answered={answered}
              onJump={(idx) => { setReviewing(false); setI(idx); }}
              onSubmit={() => void doSubmit()}
              submitting={submitting}
            />
          ) : (
            <QuestionCard
              key={q._id}
              q={q}
              answer={answers[q._id] ?? { choiceIds: [], text: "" }}
              onChoice={(cid) => setChoice(q._id, cid, q.multiple)}
              onText={(t) => setText(q._id, t)}
              onExpire={goNext}
            />
          )}
        </div>
      </div>

      {!reviewing && (
        <div className="flex flex-shrink-0 items-center gap-2 border-t border-border bg-surface px-[20px] py-[12px]">
          <Button onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>
            <ChevronLeft className="h-[15px] w-[15px]" /> Précédent
          </Button>
          <div className="flex-1" />
          {i < questions.length - 1 ? (
            <Button variant="primary" onClick={goNext}>Suivant <ChevronRight className="h-[15px] w-[15px]" /></Button>
          ) : (
            <Button variant="primary" onClick={() => setReviewing(true)}>Vérifier mes réponses <ChevronRight className="h-[15px] w-[15px]" /></Button>
          )}
        </div>
      )}
    </div>
  );
}

export function QuestionCard({
  q, answer, onChoice, onText, onExpire,
}: {
  q: PlayQuestion;
  answer: LocalAnswer;
  onChoice: (choiceId: string) => void;
  onText: (text: string) => void;
  onExpire: () => void;
}) {
  return (
    <div style={{ animation: "mdtPopIn .25s ease" }}>
      {q.timeLimitSeconds && <QuestionTimer key={q._id} seconds={q.timeLimitSeconds} onExpire={onExpire} />}

      <div className="mb-[6px] flex items-center gap-[8px] text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
        <span>{q.kind === "TEXT" ? "Réponse libre" : q.multiple ? "Plusieurs réponses" : "Une réponse"}</span>
        <span className="text-faint">·</span>
        <span>{q.points} pt{q.points > 1 ? "s" : ""}</span>
      </div>

      <div className="mb-[16px] text-[16px] font-semibold leading-[1.4]">
        <RichTextEditor value={q.prompt} editable={false} minHeight={0} />
      </div>

      {q.mediaUrls.length > 0 && (
        <div className="mb-[16px] grid grid-cols-1 gap-[8px] sm:grid-cols-2">
          {q.mediaUrls.map((u) => <QuizMedia key={u} url={u} />)}
        </div>
      )}

      {q.kind === "TEXT" ? (
        <textarea
          value={answer.text}
          onChange={(e) => onText(e.target.value)}
          rows={6}
          placeholder="Rédigez votre réponse…"
          className="w-full rounded-sm border border-border bg-surface-2 p-3 text-[14px] leading-[1.55] outline-none focus:border-accent"
        />
      ) : (
        <div className="flex flex-col gap-[9px]">
          {q.choices.map((c) => {
            const picked = answer.choiceIds.includes(c._id);
            return (
              <button
                key={c._id}
                onClick={() => onChoice(c._id)}
                className="mdt-press flex items-center gap-[12px] rounded-[11px] border p-[13px_15px] text-left"
                style={{
                  borderColor: picked ? "var(--accent)" : "var(--border)",
                  background: picked ? "var(--accent-soft)" : "var(--surface)",
                }}
              >
                <span className="flex-shrink-0" style={{ color: picked ? "var(--accent)" : "var(--faint)" }}>
                  {picked ? <CheckCircle2 className="h-[19px] w-[19px]" /> : <Circle className="h-[19px] w-[19px]" />}
                </span>
                {c.imageUrl && <img src={c.imageUrl} alt="" className="h-[42px] w-[42px] flex-shrink-0 rounded-sm object-cover" />}
                <span className="text-[14px]" style={{ color: picked ? "var(--accent)" : "var(--text)", fontWeight: picked ? 600 : 400 }}>{c.label}</span>
              </button>
            );
          })}
          {q.requireJustification && (
            <div className="mt-[6px]">
              <div className="mb-[6px] text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Justification</div>
              <textarea
                value={answer.text}
                onChange={(e) => onText(e.target.value)}
                rows={3}
                placeholder="Expliquez votre choix…"
                className="w-full rounded-sm border border-border bg-surface-2 p-3 text-[13.5px] outline-none focus:border-accent"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Minuterie par question : barre qui se vide, puis passage automatique.
function QuestionTimer({ seconds, onExpire }: { seconds: number; onExpire: () => void }) {
  const [end] = useState(() => Date.now() + seconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= end) { clearInterval(id); onExpire(); }
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end]);
  const ratio = Math.max(0, (end - now) / (seconds * 1000));
  const left = Math.max(0, Math.ceil((end - now) / 1000));
  return (
    <div className="mb-[14px]">
      <div className="mb-[5px] flex items-center justify-between text-[11px] font-semibold text-muted">
        <span className="flex items-center gap-[5px]"><Clock className="h-[12px] w-[12px]" /> Temps pour cette question</span>
        <span className="font-data">{left}s</span>
      </div>
      <div className="h-[4px] overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, background: ratio < 0.25 ? "var(--danger)" : "var(--accent)", transition: "width .2s linear" }} />
      </div>
    </div>
  );
}

function Review({
  questions, answered, onJump, onSubmit, submitting,
}: {
  questions: PlayQuestion[];
  answered: Set<string>;
  onJump: (i: number) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const missing = questions.filter((q) => !answered.has(q._id)).length;
  return (
    <div style={{ animation: "mdtPopIn .25s ease" }}>
      <h1 className="m-0 text-[19px] font-bold">Vérifiez vos réponses</h1>
      <p className="mt-[6px] mb-[18px] text-[13px] text-muted">
        {missing === 0 ? "Toutes les questions ont une réponse." : `${missing} question${missing > 1 ? "s" : ""} sans réponse.`} Une fois la copie rendue, vous ne pourrez plus la modifier.
      </p>
      <div className="mb-[20px] grid grid-cols-6 gap-[8px] sm:grid-cols-10">
        {questions.map((q, idx) => {
          const ok = answered.has(q._id);
          return (
            <button
              key={q._id}
              onClick={() => onJump(idx)}
              title={ok ? "Répondue" : "Sans réponse"}
              className="mdt-press flex aspect-square items-center justify-center rounded-[9px] border font-data text-[13px] font-bold"
              style={{
                borderColor: ok ? "var(--accent)" : "var(--border)",
                background: ok ? "var(--accent-soft)" : "var(--surface)",
                color: ok ? "var(--accent)" : "var(--muted)",
              }}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>
      <Button variant="primary" block loading={submitting} onClick={onSubmit}>
        <Send className="h-[15px] w-[15px]" /> Rendre ma copie
      </Button>
      {submitting && <div className="mt-[10px] flex items-center justify-center gap-[7px] text-[12px] text-faint"><Loader2 className="h-[13px] w-[13px] animate-spin" /> Envoi…</div>}
    </div>
  );
}
