import { useEffect, useRef, useState } from "react";
import { Scale, CornerDownLeft, ExternalLink, Loader2, AlertTriangle } from "lucide-react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/lib/api";
import { readableError } from "@/lib/errors";

type Source = { code: string; sourceUrl: string | null };
type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "answer"; question: string; answer: string; sources: Source[] }
  | { kind: "error"; message: string };

const EXAMPLES = [
  "Quelle est la limite de vitesse sur une highway ?",
  "Quelle sanction pour port d'arme de catégorie B1 non autorisé ?",
  "Que risque-t-on pour conduite sans permis ?",
  "Quels sont les droits d'une personne en garde à vue ?",
];

// Rendu léger : gras **…**, et une ligne par paragraphe. Pas de dépendance markdown.
function renderAnswer(text: string) {
  return text.split(/\n/).map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} className={line.trim() ? "mb-[6px]" : "mb-[6px] h-[2px]"}>
        {parts.map((p, j) =>
          p.startsWith("**") && p.endsWith("**") ? (
            <strong key={j} className="font-semibold text-text">{p.slice(2, -2)}</strong>
          ) : (
            <span key={j}>{p}</span>
          ),
        )}
      </p>
    );
  });
}

export function StateCodeAssistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ask = useAction(api.stateCode.ask);
  const stats = useQuery(api.stateCode.stats, open ? {} : "skip");
  const [q, setQ] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else { setQ(""); setState({ kind: "idle" }); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (question: string) => {
    const text = question.trim();
    if (text.length < 3 || state.kind === "loading") return;
    setState({ kind: "loading" });
    try {
      const res = await ask({ question: text });
      setState({ kind: "answer", question: text, answer: res.answer, sources: res.sources });
    } catch (e) {
      setState({ kind: "error", message: readableError(e, "L'assistant n'a pas pu répondre.") });
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh]"
      style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Assistant State Code"
        className="flex max-h-[80vh] w-[680px] max-w-[93vw] flex-col overflow-hidden rounded-[14px] border border-border-strong bg-elev shadow-[0_24px_70px_rgba(0,0,0,.32)]"
        style={{ animation: "mdtPop .18s ease" }}
      >
        {/* En-tête + saisie */}
        <div className="flex items-start gap-3 border-b border-border px-[18px] py-[14px]">
          <span className="mt-[3px] flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[8px] border border-accent bg-accent-soft text-accent">
            <Scale className="h-[16px] w-[16px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-[2px] text-[13px] font-bold">Assistant State Code</div>
            <textarea
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(q); } }}
              rows={1}
              placeholder="Pose une question juridique sur le State Code…"
              className="max-h-[120px] w-full resize-none border-none bg-transparent text-[15px] text-text outline-none placeholder:text-faint"
            />
          </div>
          <button
            onClick={() => submit(q)}
            disabled={q.trim().length < 3 || state.kind === "loading"}
            aria-label="Envoyer la question"
            className="mt-[2px] flex h-[32px] w-[32px] flex-shrink-0 items-center justify-center rounded-[8px] bg-accent text-accent-contrast hover:brightness-[1.06] disabled:opacity-40"
          >
            {state.kind === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CornerDownLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Corps */}
        <div className="min-h-0 flex-1 overflow-y-auto px-[18px] py-[16px]">
          {state.kind === "idle" && (
            <div>
              <div className="mb-[10px] text-[12px] text-muted">
                Pose une question, l'assistant répond <b>uniquement</b> à partir du State Code et cite les articles.
              </div>
              <div className="mb-[8px] text-[10px] font-bold uppercase tracking-[0.09em] text-faint">Exemples</div>
              <div className="flex flex-col gap-[6px]">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => { setQ(ex); submit(ex); }}
                    className="rounded-[9px] border border-border bg-surface-2 px-[12px] py-[9px] text-left text-[13px] text-muted hover:border-border-strong hover:text-text"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {state.kind === "loading" && (
            <div className="flex items-center gap-[10px] py-6 text-[13px] text-muted">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              Recherche dans le State Code…
            </div>
          )}

          {state.kind === "error" && (
            <div className="flex items-start gap-[10px] rounded-[10px] border px-[14px] py-[12px] text-[13px]" style={{ borderColor: "var(--danger)", background: "color-mix(in srgb, var(--danger) 8%, transparent)", color: "var(--danger)" }} role="alert">
              <AlertTriangle className="mt-[1px] h-4 w-4 flex-shrink-0" />
              <span>{state.message}</span>
            </div>
          )}

          {state.kind === "answer" && (
            <div>
              <div className="mb-[10px] rounded-[9px] bg-surface-2 px-[12px] py-[8px] text-[13px] font-medium text-muted">
                {state.question}
              </div>
              <div className="text-[13.5px] leading-[1.55] text-muted">{renderAnswer(state.answer)}</div>
              {state.sources.length > 0 && (
                <div className="mt-[14px] border-t border-border pt-[12px]">
                  <div className="mb-[7px] text-[10px] font-bold uppercase tracking-[0.09em] text-faint">Sources</div>
                  <div className="flex flex-wrap gap-[6px]">
                    {state.sources.map((s) => (
                      s.sourceUrl ? (
                        <a
                          key={s.code}
                          href={s.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-[5px] rounded-full border border-border bg-surface-2 px-[10px] py-[4px] text-[11.5px] text-muted hover:border-accent hover:text-accent"
                        >
                          {s.code}
                          <ExternalLink className="h-[11px] w-[11px]" />
                        </a>
                      ) : (
                        <span key={s.code} className="rounded-full border border-border bg-surface-2 px-[10px] py-[4px] text-[11.5px] text-muted">{s.code}</span>
                      )
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pied */}
        <div className="flex items-center gap-3 border-t border-border px-[18px] py-[9px] text-[11px] text-faint">
          <span><b className="font-data text-muted">↵</b> envoyer · <b className="font-data text-muted">⇧↵</b> nouvelle ligne · <b className="font-data text-muted">ESC</b> fermer</span>
          <div className="flex-1" />
          <span>{stats ? `${stats.count} codes indexés` : "…"} · aide, l'agent vérifie</span>
        </div>
      </div>
    </div>
  );
}
