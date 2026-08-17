import { useState } from "react";
import { Pencil, Trash2, Square, Check, X, Search } from "lucide-react";
import { useMutation, useQuery, usePaginatedQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useToast } from "@/providers/toast";
import { useCan } from "@/hooks/useCan";
import { AgentTag, fmtMatricule } from "@/components/common/AgentTag";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { LoadMore } from "@/components/common/Pagination";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function fmtDur(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}`;
}
function toInput(ms: number) {
  const off = new Date(ms).getTimezoneOffset() * 60000;
  return new Date(ms - off).toISOString().slice(0, 16);
}
const fromInput = (s: string) => new Date(s).getTime();

type Session = {
  _id: string;
  startedAt: number;
  endedAt: number | null;
  seconds: number;
  open: boolean;
};

function SessionRow({
  s,
  agentCol,
  onEdit,
  onRemove,
  onCut,
}: {
  s: Session & { agent?: { matricule: number | null; name: string } };
  agentCol?: boolean;
  onEdit: (startedAt: number, endedAt?: number) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
  onCut: () => Promise<unknown>;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [start, setStart] = useState(toInput(s.startedAt));
  const [end, setEnd] = useState(s.endedAt ? toInput(s.endedAt) : "");

  const cols = agentCol
    ? "grid-cols-[1.2fr_1.4fr_1.4fr_.7fr_auto]"
    : "grid-cols-[1.6fr_1.6fr_.8fr_auto]";

  if (editing) {
    return (
      <div className={`grid ${cols} items-center gap-3 border-b border-border bg-surface-2 px-4 py-[9px]`}>
        {agentCol && <AgentTag agent={s.agent!} className="text-[12.5px]" />}
        <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="h-8 rounded-sm border border-border bg-surface px-2 font-data text-[12px] outline-none focus:border-accent" />
        <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="h-8 rounded-sm border border-border bg-surface px-2 font-data text-[12px] outline-none focus:border-accent" />
        <span />
        <span className="flex gap-1">
          <button
            onClick={async () => {
              const r = await toast.guard(onEdit(fromInput(start), end ? fromInput(end) : undefined), "Modification impossible");
              if (r !== undefined) {
                setEditing(false);
                toast.success("Service modifié.");
              }
            }}
            className="flex h-[26px] w-[26px] items-center justify-center rounded-sm border border-border bg-surface" style={{ color: "var(--success)" }}
          >
            <Check className="h-4 w-4" />
          </button>
          <button onClick={() => setEditing(false)} className="flex h-[26px] w-[26px] items-center justify-center rounded-sm border border-border bg-surface text-muted">
            <X className="h-4 w-4" />
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className={`grid ${cols} items-center gap-3 border-b border-border px-4 py-[10px] text-[12.5px]`}>
      {agentCol && <AgentTag agent={s.agent!} />}
      <span className="font-data text-muted">{new Date(s.startedAt).toLocaleString("fr-FR")}</span>
      <span className="font-data text-muted">
        {s.endedAt ? new Date(s.endedAt).toLocaleString("fr-FR") : <span style={{ color: "var(--success)" }}>en cours</span>}
      </span>
      <span className="font-data font-semibold">{s.open ? "-" : fmtDur(s.seconds)}</span>
      <span className="flex items-center justify-end gap-1">
        {s.open && (
          <button onClick={() => toast.guard(onCut(), "Action impossible")} title="Terminer" className="flex h-[26px] w-[26px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong">
            <Square className="h-[13px] w-[13px]" />
          </button>
        )}
        <button onClick={() => setEditing(true)} title="Modifier" className="flex h-[26px] w-[26px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong">
          <Pencil className="h-[13px] w-[13px]" />
        </button>
        {confirm ? (
          <>
            <button onClick={async () => { const r = await toast.guard(onRemove(), "Suppression impossible"); if (r !== undefined) toast.success("Supprimé."); }} className="rounded-[4px] px-[7px] py-[3px] text-[11px] font-semibold text-white" style={{ background: "var(--danger)" }}>Ok</button>
            <button onClick={() => setConfirm(false)} className="flex h-[26px] w-[26px] items-center justify-center rounded-sm border border-border text-muted"><X className="h-4 w-4" /></button>
          </>
        ) : (
          <button onClick={() => setConfirm(true)} title="Supprimer" className="flex h-[26px] w-[26px] items-center justify-center rounded-sm border border-border bg-surface-2 text-faint hover:text-danger">
            <Trash2 className="h-[13px] w-[13px]" />
          </button>
        )}
      </span>
    </div>
  );
}

export function Services() {
  const { can } = useCan();
  const canManage = can("services.manage");
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const mine = useQuery(api.services.mine);
  const [agentId, setAgentId] = useState<Id<"agents"> | null>(null);
  const [q, setQ] = useState("");
  const globalOn = tab === "all" && canManage;
  const { results: all, status, loadMore } = usePaginatedQuery(
    api.services.all,
    globalOn ? { agentId: agentId ?? undefined } : "skip",
    { initialNumItems: 40 },
  );
  const roster = useQuery(api.services.manageableAgents, globalOn ? {} : "skip");

  const update = useMutation(api.services.update);
  const remove = useMutation(api.services.remove);
  const cut = useMutation(api.services.cut);

  const needle = norm(q.trim());
  const matches = needle ? (roster ?? []).filter((a) => norm(a.name).includes(needle) || String(a.matricule ?? "").includes(needle)).slice(0, 8) : [];
  const selectedAgent = agentId ? (roster ?? []).find((a) => a._id === agentId) ?? null : null;

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <h1 className="m-0 mb-[14px] text-[21px] font-bold tracking-tight">Services</h1>

      <div className="mb-[16px] flex gap-[2px] rounded-card border border-border bg-surface p-[5px]" style={{ width: "fit-content" }}>
        <button onClick={() => setTab("mine")} className="rounded-[7px] px-[14px] py-[7px] text-[12.5px] font-semibold" style={tab === "mine" ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}>
          Mes services
        </button>
        {canManage && (
          <button onClick={() => setTab("all")} className="rounded-[7px] px-[14px] py-[7px] text-[12.5px] font-semibold" style={tab === "all" ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}>
            Gestion globale
          </button>
        )}
      </div>

      {tab === "mine" ? (
        <>
          <div className="mb-[14px] flex gap-3">
            <div className="rounded-card border border-border bg-surface px-[18px] py-[14px]">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Total cette semaine</div>
              <div className="mt-1 font-data text-[24px] font-bold">{mine ? fmtDur(mine.weekSeconds) : "…"}</div>
            </div>
          </div>
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <div className="grid grid-cols-[1.6fr_1.6fr_.8fr_auto] gap-3 border-b border-border px-4 py-[10px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
              <span>Début</span><span>Fin</span><span>Durée</span><span></span>
            </div>
            {mine === undefined ? (
              <div className="p-4"><SkeletonRows rows={4} /></div>
            ) : mine.sessions.length === 0 ? (
              <EmptyState title="Aucun service" message="Vos sessions de service apparaîtront ici." />
            ) : (
              mine.sessions.map((s) => (
                <SessionRow
                  key={s._id}
                  s={s}
                  onEdit={(st, en) => update({ id: s._id as Id<"serviceSessions">, startedAt: st, endedAt: en })}
                  onRemove={() => remove({ id: s._id as Id<"serviceSessions"> })}
                  onCut={() => cut({ id: s._id as Id<"serviceSessions"> })}
                />
              ))
            )}
          </div>
        </>
      ) : (
        <>
          {/* Filtre serveur par agent (annuaire borné, recherche nom / badge) */}
          <div className="relative mb-[14px] max-w-[420px]">
            {selectedAgent ? (
              <div className="flex items-center gap-2 rounded-sm border border-accent bg-accent-soft px-[11px] py-[8px] text-[13px] font-semibold text-accent">
                <span className="flex-1">{fmtMatricule(selectedAgent.matricule) ?? ""} {selectedAgent.name}</span>
                <button onClick={() => { setAgentId(null); setQ(""); }} className="text-[11.5px] text-muted hover:text-danger">Tout afficher</button>
              </div>
            ) : (
              <>
                <Search className="pointer-events-none absolute left-[10px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-faint" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer par agent (badge ou nom)…" className="h-10 w-full rounded-sm border border-border bg-surface-2 pl-[32px] pr-3 text-[13px] outline-none focus:border-accent" />
                {matches.length > 0 && (
                  <div className="absolute z-10 mt-[4px] w-full overflow-hidden rounded-sm border border-border bg-surface shadow-[0_10px_30px_var(--shadow)]">
                    {matches.map((a) => (
                      <button key={a._id} onClick={() => { setAgentId(a._id as Id<"agents">); setQ(""); }} className="flex w-full items-center gap-2 border-b border-border px-[11px] py-[7px] text-left text-[13px] last:border-b-0 hover:bg-surface-2">
                        {fmtMatricule(a.matricule) && <span className="font-data text-[11.5px] text-accent">{fmtMatricule(a.matricule)}</span>}
                        <span className="truncate">{a.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <div className="grid grid-cols-[1.2fr_1.4fr_1.4fr_.7fr_auto] gap-3 border-b border-border px-4 py-[10px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
              <span>Agent</span><span>Début</span><span>Fin</span><span>Durée</span><span></span>
            </div>
            {status === "LoadingFirstPage" ? (
              <div className="p-4"><SkeletonRows rows={5} /></div>
            ) : all.length === 0 ? (
              <EmptyState title="Aucun service" message={selectedAgent ? "Aucune session pour cet agent." : "Aucune session enregistrée."} />
            ) : (
              <>
                {all.map((s) => (
                  <SessionRow
                    key={s._id}
                    s={s}
                    agentCol
                    onEdit={(st, en) => update({ id: s._id as Id<"serviceSessions">, startedAt: st, endedAt: en })}
                    onRemove={() => remove({ id: s._id as Id<"serviceSessions"> })}
                    onCut={() => cut({ id: s._id as Id<"serviceSessions"> })}
                  />
                ))}
                <LoadMore status={status} onLoadMore={() => loadMore(40)} count={all.length} label="services" />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
