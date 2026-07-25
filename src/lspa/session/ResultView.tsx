import { useQuery } from "convex/react";
import { ArrowLeft, CheckCircle2, XCircle, Circle, Award, PenLine } from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { LoadingScreen } from "@/components/common/Loader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/common/Button";
import { RichTextEditor } from "@/components/common/RichTextEditor";

// Copie corrigée vue par le cadet, après publication : score, réussite, puis le
// détail question par question avec les bonnes réponses et l'explication.
export function ResultView({ sessionId, onBack }: { sessionId: Id<"quizSessions">; onBack: () => void }) {
  const r = useQuery(api.quizSession.myResult, { sessionId });

  if (r === undefined) return <LoadingScreen label="Chargement du résultat…" />;
  if (r === null) {
    return (
      <div className="p-[26px]">
        <EmptyState title="Résultat indisponible" message="Cette copie n'est pas encore publiée." action={<Button onClick={onBack}>Retour</Button>} />
      </div>
    );
  }

  const pct = r.maxPoints > 0 ? Math.round((r.score / r.maxPoints) * 100) : 0;
  const tint = r.passed ? "var(--accent)" : "var(--danger)";

  return (
    <div className="mx-auto max-w-[920px] p-[22px_24px]" style={{ animation: "mdtFade .2s ease" }}>
      <button onClick={onBack} className="mb-[16px] flex items-center gap-[6px] text-[12.5px] font-semibold text-muted hover:text-text">
        <ArrowLeft className="h-[14px] w-[14px]" /> Retour
      </button>

      <div className="mb-[20px] flex items-center gap-[18px] rounded-card border p-[20px_22px]" style={{ borderColor: `color-mix(in srgb, ${tint} 40%, var(--border))`, background: `color-mix(in srgb, ${tint} 6%, var(--surface))` }}>
        <span className="flex h-[58px] w-[58px] flex-shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${tint} 15%, transparent)`, color: tint }}>
          {r.passed ? <Award className="h-[28px] w-[28px]" /> : <XCircle className="h-[28px] w-[28px]" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-faint">{r.title}</div>
          <div className="mt-[3px] text-[22px] font-bold" style={{ color: tint }}>
            {r.passed ? "Réussi" : "Non validé"}
          </div>
          <div className="mt-[2px] text-[13px] text-muted">
            {r.score} / {r.maxPoints} points · {pct}% (seuil {r.passPercent}%)
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-[12px]">
        {r.questions.map((q, idx) => (
          <article key={q._id} className="rounded-card border border-border bg-surface p-[15px_17px]">
            <div className="mb-[8px] flex items-start gap-[11px]">
              <span className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[8px] bg-surface-2 font-data text-[12px] font-bold text-muted">{idx + 1}</span>
              <div className="min-w-0 flex-1 text-[14.5px] font-semibold leading-[1.4]">
                <RichTextEditor value={q.prompt} editable={false} minHeight={0} />
              </div>
              <ScorePill awarded={q.awarded} points={q.points} manual={q.manual} />
            </div>

            {q.kind !== "TEXT" && (
              <ul className="m-0 mb-[6px] ml-[37px] flex list-none flex-col gap-[4px] p-0">
                {q.choices.map((c, ci) => <ChoiceLine key={ci} label={c.label} correct={c.correct} picked={c.picked} />)}
              </ul>
            )}

            {(q.kind === "TEXT" || q.myText) && (
              <div className="ml-[37px] mt-[6px]">
                <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Votre réponse</div>
                <div className="mt-[3px] whitespace-pre-wrap rounded-sm border border-border bg-surface-2 p-[9px_11px] text-[13px]">{q.myText || <span className="italic text-faint">Sans réponse</span>}</div>
              </div>
            )}

            {q.expectedAnswer && (
              <div className="ml-[37px] mt-[8px] rounded-sm border border-border bg-surface-2 p-[9px_11px]">
                <div className="mb-[2px] flex items-center gap-[6px] text-[11px] font-bold uppercase tracking-[0.07em] text-accent"><PenLine className="h-[12px] w-[12px]" /> Attendu</div>
                <div className="text-[13px] text-muted">{q.expectedAnswer}</div>
              </div>
            )}

            {q.comment && (
              <div className="ml-[37px] mt-[8px] text-[12.5px] text-muted"><span className="font-semibold text-text">Note de l'instructeur : </span>{q.comment}</div>
            )}

            {q.explanation && (
              <div className="ml-[37px] mt-[8px] rounded-sm border-l-[3px] p-[6px_11px] text-[12.5px] text-muted" style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
                {q.explanation}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function ScorePill({ awarded, points, manual }: { awarded: number | null; points: number; manual: boolean }) {
  const full = awarded !== null && awarded >= points;
  const zero = awarded === null || awarded <= 0;
  const tint = full ? "var(--accent)" : zero ? "var(--danger)" : "var(--warning)";
  return (
    <span className="flex flex-shrink-0 items-center gap-[5px] rounded-[7px] px-[9px] py-[4px] font-data text-[12px] font-bold" style={{ background: `color-mix(in srgb, ${tint} 13%, transparent)`, color: tint }}>
      {manual && <PenLine className="h-[11px] w-[11px]" />}
      {awarded ?? 0} / {points}
    </span>
  );
}

function ChoiceLine({ label, correct, picked }: { label: string; correct: boolean; picked: boolean }) {
  // Vert = bonne réponse ; rouge = cochée à tort ; neutre sinon.
  const tint = correct ? "var(--accent)" : picked ? "var(--danger)" : "var(--muted)";
  const Icon = correct ? CheckCircle2 : picked ? XCircle : Circle;
  return (
    <li className="flex items-center gap-[8px] text-[13px]" style={{ color: tint }}>
      <Icon className="h-[14px] w-[14px] flex-shrink-0" />
      <span style={{ fontWeight: correct || picked ? 600 : 400 }}>{label}</span>
      {picked && <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-faint">votre choix</span>}
    </li>
  );
}
