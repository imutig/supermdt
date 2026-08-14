import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { X, Trash2, Ban, ClipboardList, MessageSquarePlus, Send } from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { SkeletonRows } from "@/components/common/Skeleton";
import { Button } from "@/components/common/Button";

type Item = {
  _id: string; section: string; label: string; kind: "MANUAL" | "TIME" | "QUIZ_CATEGORY";
  maxPoints: number; allowEliminate: boolean;
  categoryName: string | null; quizAvgPct: number | null;
  points: number; eliminated: boolean;
  entryPoints: number | null; entrySeconds: number | null; entryEliminated: boolean;
};

// "1:20" ou "80" -> secondes. Vide -> null.
function parseTime(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  if (s.includes(":")) {
    const [m, sec] = s.split(":");
    return (parseInt(m || "0", 10) || 0) * 60 + (parseInt(sec || "0", 10) || 0);
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function fmtTime(sec: number | null): string {
  if (sec === null) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : String(s);
}

// Fiche de notation d'un cadet, en panneau latéral. Remplissage concurrent :
// chaque critère et la conclusion s'enregistrent indépendamment, tout le monde
// voit les mises à jour en direct.
export function CadetSheetPanel({ agentId, onClose }: { agentId: Id<"agents">; onClose: () => void }) {
  const data = useQuery(api.grading.cadetSheet, { agentId });
  const setEntry = useMutation(api.grading.setEntry);

  const bySection: Record<string, Item[]> = {};
  for (const it of (data?.items ?? []) as Item[]) (bySection[it.section] ??= []).push(it);

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[560px] max-w-[96vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        {/* En-tête */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          {data && (
            <>
              {data.agent.avatarUrl ? (
                <img src={data.agent.avatarUrl} alt="" className="h-[38px] w-[38px] rounded-[10px] border border-border object-cover" />
              ) : (
                <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-surface-2 text-[13px] font-bold text-muted">
                  {data.agent.prenomRP.charAt(0)}{data.agent.nomRP.charAt(0)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-bold">{data.agent.prenomRP} {data.agent.nomRP}</div>
                <div className="text-[11.5px] text-muted">Fiche de notation · {data.agent.grade ?? "Cadet"}</div>
              </div>
              <div className="text-right">
                <div className="font-data text-[20px] font-bold" style={{ color: data.eliminated ? "var(--danger)" : "var(--accent)" }}>
                  {data.eliminated ? "Éliminé" : `${data.total}`}
                </div>
                {!data.eliminated && <div className="text-[10.5px] text-faint">/ {data.maxTotal}</div>}
              </div>
            </>
          )}
          <button onClick={onClose} className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-[18px] py-4">
          {data === undefined ? (
            <SkeletonRows rows={8} />
          ) : data === null ? (
            <div className="py-10 text-center text-[13px] text-faint">Cadet introuvable.</div>
          ) : (data.items.length === 0 ? (
            <div className="rounded-sm border border-dashed border-border px-4 py-8 text-center text-[12.5px] text-faint">
              Aucune fiche configurée. Un responsable peut la créer depuis « Fiche de notation ».
            </div>
          ) : (
            <div className="flex flex-col gap-[16px]">
              {Object.entries(bySection).map(([section, items]) => {
                const secTotal = items.reduce((s, i) => s + i.points, 0);
                const secMax = items.reduce((s, i) => s + i.maxPoints, 0);
                return (
                  <section key={section}>
                    <div className="mb-[7px] flex items-center gap-[8px]">
                      <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-faint">{section}</span>
                      <span className="font-data text-[11px] text-muted">{Math.round(secTotal * 10) / 10} / {secMax}</span>
                    </div>
                    <div className="flex flex-col gap-[7px]">
                      {items.map((it) => (
                        <ItemRow key={it._id} agentId={agentId} it={it} onSave={setEntry} />
                      ))}
                    </div>
                  </section>
                );
              })}

              <NotesSection agentId={agentId} notes={data.notes} />
              <ConclusionSection agentId={agentId} conclusion={data.conclusion} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ItemRow({ agentId, it, onSave }: {
  agentId: Id<"agents">;
  it: Item;
  onSave: (a: { agentId: Id<"agents">; itemId: Id<"gradingItems">; points?: number | null; seconds?: number | null; eliminated?: boolean }) => Promise<unknown>;
}) {
  const itemId = it._id as Id<"gradingItems">;
  const save = (patch: Partial<{ points: number | null; seconds: number | null; eliminated: boolean }>) =>
    void onSave({ agentId, itemId, ...patch });

  return (
    <div className="flex items-center gap-[10px] rounded-sm border border-border bg-surface-2 px-[12px] py-[9px]">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{it.label}</div>
        {it.kind === "QUIZ_CATEGORY" && (
          <div className="text-[11px] text-faint">Auto · {it.categoryName ?? "catégorie"} · {it.quizAvgPct !== null ? `${it.quizAvgPct}%` : "aucun quiz"}</div>
        )}
        {it.kind === "TIME" && <div className="text-[11px] text-faint">Temps · mm:ss ou secondes</div>}
      </div>

      {it.eliminated ? (
        <span className="rounded-[6px] px-[8px] py-[3px] text-[11px] font-bold uppercase text-danger" style={{ background: "color-mix(in srgb, var(--danger) 13%, transparent)" }}>Éliminé</span>
      ) : (
        <span className="font-data text-[13px] font-bold text-accent">{it.points}<span className="text-[11px] text-faint">/{it.maxPoints}</span></span>
      )}

      {it.kind === "MANUAL" && (
        <input
          key={`p-${it.entryPoints}`}
          type="number" min={0} max={it.maxPoints} step={0.5}
          defaultValue={it.entryPoints ?? ""}
          disabled={it.entryEliminated}
          onBlur={(e) => save({ points: e.target.value === "" ? null : Number(e.target.value) })}
          className="h-8 w-[60px] flex-shrink-0 rounded-sm border border-border bg-surface px-2 text-center font-data text-[13px] outline-none focus:border-accent disabled:opacity-40"
        />
      )}
      {it.kind === "TIME" && (
        <input
          key={`t-${it.entrySeconds}`}
          defaultValue={fmtTime(it.entrySeconds)}
          placeholder="-"
          onBlur={(e) => save({ seconds: parseTime(e.target.value) })}
          className="h-8 w-[70px] flex-shrink-0 rounded-sm border border-border bg-surface px-2 text-center font-data text-[13px] outline-none focus:border-accent"
        />
      )}
      {(it.kind === "MANUAL" && it.allowEliminate) && (
        <button
          onClick={() => save({ eliminated: !it.entryEliminated })}
          title={it.entryEliminated ? "Annuler l'élimination" : "Éliminer (ex. otage touché)"}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm border border-border bg-surface"
          style={it.entryEliminated ? { borderColor: "var(--danger)", color: "var(--danger)" } : { color: "var(--faint)" }}
        >
          <Ban className="h-[14px] w-[14px]" />
        </button>
      )}
    </div>
  );
}

function NotesSection({ agentId, notes }: {
  agentId: Id<"agents">;
  notes: { _id: string; authorName: string; text: string; at: number; mine: boolean }[];
}) {
  const add = useMutation(api.grading.addNote);
  const remove = useMutation(api.grading.removeNote);
  const [text, setText] = useState("");
  return (
    <section>
      <div className="mb-[7px] flex items-center gap-[7px] text-[11px] font-bold uppercase tracking-[0.09em] text-faint"><ClipboardList className="h-[12px] w-[12px]" /> Notes des instructeurs</div>
      <div className="flex flex-col gap-[6px]">
        {notes.map((n) => (
          <div key={n._id} className="rounded-sm border border-border bg-surface-2 px-[11px] py-[8px]">
            <div className="mb-[2px] flex items-center gap-[7px]">
              <span className="text-[11px] font-semibold text-muted">{n.authorName}</span>
              <span className="text-[10.5px] text-faint">{new Date(n.at).toLocaleDateString("fr-FR")}</span>
              <div className="flex-1" />
              {n.mine && <button onClick={() => void remove({ noteId: n._id as Id<"cadetNotes"> })} className="text-faint hover:text-danger"><Trash2 className="h-[12px] w-[12px]" /></button>}
            </div>
            <div className="whitespace-pre-wrap text-[13px]">{n.text}</div>
          </div>
        ))}
        <div className="flex items-end gap-[7px]">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Ajouter une note…"
            className="min-w-0 flex-1 rounded-sm border border-border bg-surface-2 p-[8px_10px] text-[13px] outline-none focus:border-accent"
          />
          <Button variant="primary" disabled={!text.trim()} onClick={async () => { await add({ agentId, text }); setText(""); }} className="!py-[8px]">
            <MessageSquarePlus className="h-[14px] w-[14px]" />
          </Button>
        </div>
      </div>
    </section>
  );
}

function ConclusionSection({ agentId, conclusion }: {
  agentId: Id<"agents">;
  conclusion: { text: string; byName: string; at: number } | null;
}) {
  const setConclusion = useMutation(api.grading.setConclusion);
  return (
    <section>
      <div className="mb-[7px] flex items-center gap-[7px] text-[11px] font-bold uppercase tracking-[0.09em] text-faint"><Send className="h-[12px] w-[12px]" /> Conclusion du recrutement</div>
      <textarea
        key={`c-${conclusion?.at ?? 0}`}
        defaultValue={conclusion?.text ?? ""}
        rows={4}
        placeholder="Rédigée en commun par les instructeurs…"
        onBlur={(e) => { if (e.target.value !== (conclusion?.text ?? "")) void setConclusion({ agentId, text: e.target.value }); }}
        className="w-full rounded-sm border border-border bg-surface-2 p-3 text-[13px] leading-[1.5] outline-none focus:border-accent"
      />
      {conclusion && <div className="mt-[4px] text-[10.5px] text-faint">Dernière modification par {conclusion.byName}</div>}
    </section>
  );
}
