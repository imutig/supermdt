import { useEffect, useRef, useState } from "react";
import { Scale, CornerDownLeft, ExternalLink, Loader2, AlertTriangle, Info, ShieldAlert, CheckCircle2, Lightbulb, type LucideIcon } from "lucide-react";
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

// ===== Rendu du langage visuel de l'assistant (sans dépendance markdown) =====
// Vocabulaire supporté : titres ###, listes - / 1., gras **, italique *, code `,
// badges de classification [[Crime]], tableaux | a | b |, encadrés :::danger …
// :::, et blocs d'étapes :::etapes … :::. Le prompt système documente tout ça.

// Badge de classification pénale, coloré selon la gravité.
function badgeStyle(label: string): { bg: string; color: string } {
  const n = label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let c = "var(--accent)";
  if (/crime/.test(n)) c = "var(--danger)";
  else if (/majeur/.test(n)) c = "var(--critical)";
  else if (/delit/.test(n)) c = "#e2711d";
  else if (/contravention/.test(n)) c = "var(--warning)";
  return { bg: `color-mix(in srgb, ${c} 16%, transparent)`, color: c };
}

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      const st = badgeStyle(m[2]);
      nodes.push(<span key={`${keyPrefix}-badge${i}`} className="mx-[1px] inline-block rounded-[5px] px-[7px] py-px text-[11px] font-bold uppercase tracking-[0.03em]" style={{ background: st.bg, color: st.color }}>{m[2]}</span>);
    } else if (m[3] !== undefined) nodes.push(<strong key={`${keyPrefix}-b${i}`} className="font-semibold text-text">{m[3]}</strong>);
    else if (m[4] !== undefined) nodes.push(<em key={`${keyPrefix}-i${i}`}>{m[4]}</em>);
    else if (m[5] !== undefined) nodes.push(<code key={`${keyPrefix}-c${i}`} className="rounded bg-surface-2 px-[4px] py-px font-data text-[12px]">{m[5]}</code>);
    last = re.lastIndex;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const CALLOUTS: Record<string, { color: string; icon: LucideIcon; label: string }> = {
  info: { color: "var(--accent)", icon: Info, label: "Info" },
  astuce: { color: "var(--accent)", icon: Lightbulb, label: "Astuce" },
  succes: { color: "var(--success)", icon: CheckCircle2, label: "OK" },
  success: { color: "var(--success)", icon: CheckCircle2, label: "OK" },
  attention: { color: "var(--warning)", icon: AlertTriangle, label: "Attention" },
  avertissement: { color: "var(--warning)", icon: AlertTriangle, label: "Attention" },
  danger: { color: "var(--danger)", icon: ShieldAlert, label: "Danger" },
};

function Callout({ type, title, children }: { type: string; title?: string; children: React.ReactNode }) {
  const c = CALLOUTS[type] ?? CALLOUTS.info;
  const Icon = c.icon;
  return (
    <div className="mb-[10px] flex gap-[10px] rounded-[10px] border px-[12px] py-[10px]" style={{ borderColor: `color-mix(in srgb, ${c.color} 40%, var(--border))`, background: `color-mix(in srgb, ${c.color} 8%, transparent)` }}>
      <Icon className="mt-[1px] h-4 w-4 flex-shrink-0" style={{ color: c.color }} />
      <div className="min-w-0 flex-1">
        {title && <div className="mb-[3px] text-[12px] font-bold" style={{ color: c.color }}>{title}</div>}
        <div className="text-[13px] text-muted">{children}</div>
      </div>
    </div>
  );
}

function Table({ head, rows, kb }: { head: string[]; rows: string[][]; kb: string }) {
  return (
    <div className="mb-[10px] overflow-x-auto rounded-[10px] border border-border">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="bg-surface-2">
            {head.map((h, i) => <th key={i} className="border-b border-border px-[10px] py-[7px] text-left font-bold text-text">{inline(h, `${kb}h${i}`)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-border last:border-0">
              {r.map((cell, ci) => <td key={ci} className="px-[10px] py-[7px] align-top text-muted">{inline(cell, `${kb}r${ri}c${ci}`)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Steps({ items, kb }: { items: string[]; kb: string }) {
  return (
    <div className="mb-[10px] flex flex-col gap-[8px]">
      {items.map((it, i) => (
        <div key={i} className="flex gap-[10px]">
          <span className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border border-accent bg-accent-soft text-[11px] font-bold text-accent">{i + 1}</span>
          <div className="pt-[2px] text-[13px] text-muted">{inline(it, `${kb}s${i}`)}</div>
        </div>
      ))}
    </div>
  );
}

const splitRow = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

function renderBlocks(lines: string[], kb: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  let k = 0;

  const flushPara = () => { if (para.length) { out.push(<p key={`${kb}p${k++}`} className="mb-[8px] last:mb-0">{inline(para.join(" "), `${kb}p${k}`)}</p>); para = []; } };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, idx) => <li key={idx} className="mb-[3px]">{inline(it, `${kb}l${k}-${idx}`)}</li>);
    out.push(list.ordered
      ? <ol key={`${kb}o${k++}`} className="mb-[8px] ml-[18px] list-decimal space-y-[2px]">{items}</ol>
      : <ul key={`${kb}u${k++}`} className="mb-[8px] ml-[16px] list-disc space-y-[2px] marker:text-faint">{items}</ul>);
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    // Encadré / étapes : :::type [titre] … :::
    const dir = line.match(/^:::\s*(\w+)\s*(.*)$/);
    if (dir) {
      flushPara(); flushList();
      const type = dir[1].toLowerCase();
      const title = dir[2].trim() || undefined;
      const inner: string[] = [];
      i++;
      while (i < lines.length && !/^:::\s*$/.test(lines[i].trim())) { inner.push(lines[i]); i++; }
      if (type === "etapes" || type === "etape" || type === "steps") {
        const steps = inner.map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, "").trim()).filter(Boolean);
        out.push(<Steps key={`${kb}st${k++}`} items={steps} kb={`${kb}st${k}`} />);
      } else {
        out.push(<Callout key={`${kb}co${k++}`} type={type} title={title}>{renderBlocks(inner, `${kb}co${k}`)}</Callout>);
      }
      continue;
    }

    // Tableau : ligne | … | suivie d'une ligne séparatrice | --- | --- |
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      flushPara(); flushList();
      const head = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      i--;
      out.push(<Table key={`${kb}t${k++}`} head={head} rows={rows} kb={`${kb}t${k}`} />);
      continue;
    }

    const heading = line.match(/^(#{2,6})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);

    if (line.trim() === "") { flushPara(); flushList(); continue; }
    if (heading) { flushPara(); flushList(); out.push(<div key={`${kb}h${k++}`} className="mb-[6px] mt-[12px] text-[11px] font-bold uppercase tracking-[0.08em] text-accent first:mt-0">{inline(heading[2], `${kb}h${k}`)}</div>); continue; }
    if (bullet) { flushPara(); if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; } list.items.push(bullet[1]); continue; }
    if (numbered) { flushPara(); if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; } list.items.push(numbered[1]); continue; }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return out;
}

function renderMarkdown(text: string): React.ReactNode {
  return renderBlocks(text.replace(/\r/g, "").split("\n"), "m");
}

export function StateCodeAssistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ask = useAction(api.stateCode.ask);
  const stats = useQuery(api.stateCode.stats, open ? {} : "skip");
  const [q, setQ] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

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

  // Remonter en haut de la réponse (sinon une réponse longue masque son début).
  useEffect(() => {
    if (state.kind === "answer" || state.kind === "loading") bodyRef.current?.scrollTo({ top: 0 });
  }, [state]);

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
              maxLength={600}
              spellCheck={false}
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
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-[18px] py-[16px]">
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
              <div className="text-[13.5px] leading-[1.55] text-muted">{renderMarkdown(state.answer)}</div>
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
