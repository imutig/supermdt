import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Radio, ChevronDown, LogOut, X } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { PatrolCreateModal } from "@/components/dispatch/PatrolCreateModal";
import { StatusFieldsModal } from "@/components/dispatch/statusFields";

type WidgetStatus = { _id: string; name: string; color: string | null; requires: string[] };

// Widget TopBar : ma patrouille + changement de statut + détail libre.
export function DispatchStatus() {
  const { can } = useCan();
  const canView = can("dispatch.view");
  const myPatrol = useQuery(api.dispatch.myPatrol, canView ? {} : "skip");
  const opts = useQuery(api.dispatch.statusOptions, canView ? {} : "skip");
  const setStatus = useMutation(api.dispatch.setStatus);
  const setDetail = useMutation(api.dispatch.setDetail);
  const leave = useMutation(api.dispatch.leave);
  const dissolve = useMutation(api.dispatch.dissolve);
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [create, setCreate] = useState(false);
  const [detail, setDetailText] = useState("");
  const [detailInit, setDetailInit] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<WidgetStatus | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Synchronise le champ détail à l'ouverture.
  const currentDetail = myPatrol && myPatrol !== null ? (myPatrol.detail ?? "") : "";
  useEffect(() => { if (open && detailInit === null) { setDetailText(currentDetail); setDetailInit(currentDetail); } if (!open) setDetailInit(null); }, [open, currentDetail, detailInit]);

  if (!canView) return null;

  if (myPatrol === null) {
    return can("dispatch.self") ? (
      <>
        <button onClick={() => setCreate(true)} className="mdt-press flex items-center gap-[6px] rounded-[9px] border border-border bg-surface-2 px-[11px] py-[7px] text-[12.5px] font-semibold text-muted hover:border-accent hover:text-accent">
          <Radio className="h-[15px] w-[15px]" /> Patrouille
        </button>
        {create && <PatrolCreateModal onClose={() => setCreate(false)} />}
      </>
    ) : null;
  }
  if (!myPatrol) return null;

  const st = myPatrol.status;
  const pick = (s: WidgetStatus) => {
    if (s.requires.length > 0) { setPendingStatus(s); setOpen(false); return; }
    toast.guard(setStatus({ patrolId: myPatrol._id as Id<"patrols">, statusId: s._id as Id<"dispatchStatuses"> }), "Changement impossible");
  };
  const saveDetail = () => { if (detail !== (myPatrol.detail ?? "")) toast.guard(setDetail({ patrolId: myPatrol._id as Id<"patrols">, detail }), "Modification impossible"); };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="mdt-press flex items-center gap-[8px] rounded-[9px] border border-border bg-surface-2 px-[11px] py-[6px] hover:border-border-strong">
        <span className="font-data text-[13px] font-bold text-accent">{myPatrol.label}</span>
        {st && <><span className="h-[7px] w-[7px] rounded-full" style={{ background: st.color ?? "var(--muted)" }} /><span className="text-[12px] font-semibold" style={{ color: st.color ?? "var(--text)" }}>{st.name}</span></>}
        <ChevronDown className="h-[13px] w-[13px] text-faint" />
      </button>

      {open && opts && (
        <div className="absolute right-0 top-[42px] z-[70] w-[250px] overflow-hidden rounded-[10px] border border-border-strong bg-elev shadow-[0_16px_50px_var(--shadow)] mdt-pop">
          <div className="max-h-[260px] overflow-y-auto py-1">
            <div className="px-3 pb-[3px] pt-[7px] text-[9.5px] font-bold uppercase tracking-[0.09em] text-faint">Statut</div>
            {opts.statuses.map((s) => (
              <button key={s._id} onClick={() => pick(s)} className="flex w-full items-center gap-[8px] px-3 py-[7px] text-left text-[12.5px] hover:bg-surface-2" style={st?._id === s._id ? { background: "var(--accent-soft)" } : undefined}>
                <span className="h-[7px] w-[7px] rounded-full" style={{ background: s.color ?? "var(--muted)" }} />
                <span className="flex-1 font-medium">{s.name}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-border p-2">
            <div className="mb-[5px] text-[9.5px] font-bold uppercase tracking-[0.09em] text-faint">Détail</div>
            <input value={detail} onChange={(e) => setDetailText(e.target.value)} onBlur={saveDetail} onKeyDown={(e) => e.key === "Enter" && saveDetail()} placeholder="Détail libre…" className="h-8 w-full rounded-sm border border-border bg-surface-2 px-2 text-[12px] outline-none focus:border-accent" />
          </div>
          <div className="flex gap-1 border-t border-border p-2">
            <button onClick={() => { setOpen(false); navigate("/dispatch"); }} className="flex-1 rounded-sm border border-border bg-surface-2 px-2 py-[7px] text-[11.5px] font-semibold text-muted hover:border-border-strong">Board</button>
            <button onClick={() => toast.guard(leave(), "Action impossible").then(() => setOpen(false))} className="flex items-center gap-[5px] rounded-sm border border-border bg-surface-2 px-2 py-[7px] text-[11.5px] font-semibold text-muted hover:border-border-strong"><LogOut className="h-[13px] w-[13px]" /> Quitter</button>
            <button onClick={() => toast.guard(dissolve({ patrolId: myPatrol._id as Id<"patrols"> }), "Action impossible").then(() => setOpen(false))} className="flex items-center gap-[5px] rounded-sm border border-border bg-surface-2 px-2 py-[7px] text-[11.5px] font-semibold text-muted hover:border-danger hover:text-danger" title="Dissoudre"><X className="h-[13px] w-[13px]" /></button>
          </div>
        </div>
      )}

      {pendingStatus && (
        <StatusFieldsModal
          statusName={pendingStatus.name}
          requires={pendingStatus.requires}
          sectors={opts?.sectors ?? []}
          initial={myPatrol.status?._id === pendingStatus._id ? myPatrol.fields : null}
          onCancel={() => setPendingStatus(null)}
          onConfirm={(fields) => {
            toast.guard(setStatus({ patrolId: myPatrol._id as Id<"patrols">, statusId: pendingStatus._id as Id<"dispatchStatuses">, fields }), "Changement impossible");
            setPendingStatus(null);
          }}
        />
      )}
    </div>
  );
}
