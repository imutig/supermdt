import { useState } from "react";
import { X, Search, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useToast } from "@/providers/toast";
import { AgentTag, fmtMatricule } from "@/components/common/AgentTag";
import { PATROL_COLORS, patrolBg } from "@/lib/patrolColors";
import { StatusFieldsModal, FIELD_LABELS, type PatrolFields } from "@/components/dispatch/statusFields";

type Status = { _id: string; name: string; color: string | null; icon: string | null; group: string | null; requires: string[] };
type Patrol = {
  _id: string; label: string; color: string | null; vehicleNumber: string;
  status: Status | null; detail: string | null; fields: PatrolFields | null;
  members: { matricule: number | null; name: string; agentId: string }[];
};

export function PatrolDetailModal({ patrol, statuses, sectors, canEdit, isMember, canJoin, onClose }: {
  patrol: Patrol;
  statuses: Status[];
  sectors: string[];
  canEdit: boolean;
  isMember: boolean;
  canJoin: boolean;
  onClose: () => void;
}) {
  const roster = useQuery(api.agents.roster) ?? [];
  const update = useMutation(api.dispatch.update);
  const addMember = useMutation(api.dispatch.addMember);
  const removeMember = useMutation(api.dispatch.removeMember);
  const setStatus = useMutation(api.dispatch.setStatus);
  const setDetail = useMutation(api.dispatch.setDetail);
  const dissolve = useMutation(api.dispatch.dissolve);
  const join = useMutation(api.dispatch.join);
  const toast = useToast();

  const [num, setNum] = useState(patrol.vehicleNumber);
  const [detail, setDetailText] = useState(patrol.detail ?? "");
  const [q, setQ] = useState("");
  const [pendingStatus, setPendingStatus] = useState<Status | null>(null);

  const held = new Set(patrol.members.map((m) => m.agentId));
  const matches = q.trim() ? roster.filter((a) => !held.has(a._id) && `${a.prenomRP} ${a.nomRP}`.toLowerCase().includes(q.trim().toLowerCase())) : [];

  const L = "mb-[6px] block text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint";

  return (
    <div onClick={onClose} className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[92vh] w-[430px] max-w-[94vw] flex-col rounded-card border border-border-strong bg-elev shadow-[0_24px_70px_rgba(0,0,0,.4)] mdt-pop">
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-5 py-4" style={{ background: patrolBg(patrol.color) }}>
          <span className="font-data text-[20px] font-bold tracking-wide">{patrol.label}</span>
          {patrol.status && <span className="rounded-[5px] px-[8px] py-[3px] text-[11.5px] font-semibold" style={{ background: `color-mix(in srgb, ${patrol.status.color ?? "var(--muted)"} 16%, transparent)`, color: patrol.status.color ?? "var(--text)" }}>{patrol.status.name}</span>}
          <div className="flex-1" />
          <button onClick={onClose} className="flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* Statut */}
          <div className="mb-4">
            <span className={L}>Statut</span>
            <select
              value={patrol.status?._id ?? ""}
              disabled={!canEdit}
              onChange={(e) => {
                const s = statuses.find((x) => x._id === e.target.value);
                if (!s) return;
                if (s.requires.length > 0) { setPendingStatus(s); return; }
                toast.guard(setStatus({ patrolId: patrol._id as Id<"patrols">, statusId: s._id as Id<"dispatchStatuses"> }), "Changement impossible");
              }}
              className="h-10 w-full rounded-sm border border-border bg-surface-2 px-2 text-[13px] outline-none focus:border-accent disabled:opacity-60"
            >
              <option value="" disabled>Choisir…</option>
              {statuses.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
            {/* Champs liés au statut courant */}
            {(patrol.status?.requires ?? []).length > 0 && (
              <div className="mt-2 flex flex-col gap-[3px] rounded-sm border border-border bg-surface-2 px-[10px] py-[8px]">
                {(patrol.status?.requires ?? []).map((k) => (
                  <div key={k} className="flex items-baseline gap-2 text-[12px]">
                    <span className="text-faint">{FIELD_LABELS[k] ?? k}</span>
                    <span className="flex-1 border-b border-dashed border-border" />
                    <span className="font-semibold">{(patrol.fields ?? {})[k as keyof PatrolFields] || "-"}</span>
                  </div>
                ))}
                {canEdit && patrol.status && (
                  <button onClick={() => setPendingStatus(patrol.status)} className="mt-[5px] self-start text-[11.5px] font-semibold text-accent hover:underline">Modifier ces informations</button>
                )}
              </div>
            )}
          </div>

          {/* Détail libre */}
          <div className="mb-4">
            <span className={L}>Détail (libre)</span>
            <div className="flex gap-2">
              <input value={detail} disabled={!canEdit} onChange={(e) => setDetailText(e.target.value)} placeholder="Ex. transport détenu, intervention en cours…" onBlur={() => canEdit && detail !== (patrol.detail ?? "") && toast.guard(setDetail({ patrolId: patrol._id as Id<"patrols">, detail }), "Modification impossible")} className="h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent disabled:opacity-60" />
              {canEdit && detail !== (patrol.detail ?? "") && <button onClick={() => toast.guard(setDetail({ patrolId: patrol._id as Id<"patrols">, detail }), "Modification impossible")} className="rounded-sm bg-accent px-3 text-[12px] font-semibold text-accent-contrast">OK</button>}
            </div>
          </div>

          {/* Membres */}
          <div className="mb-4">
            <span className={L}>Membres ({patrol.members.length})</span>
            <div className="flex flex-col gap-[5px]">
              {patrol.members.map((m) => (
                <div key={m.agentId} className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-[10px] py-[7px]">
                  <span className="flex-1 text-[12.5px]"><AgentTag agent={m} /></span>
                  {canEdit && patrol.members.length > 1 && (
                    <button onClick={() => toast.guard(removeMember({ patrolId: patrol._id as Id<"patrols">, agentId: m.agentId as Id<"agents"> }), "Retrait impossible")} className="text-faint hover:text-danger"><X className="h-[14px] w-[14px]" /></button>
                  )}
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="relative mt-2">
                <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-2">
                  <Search className="h-[14px] w-[14px] text-faint" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ajouter un agent…" className="h-9 flex-1 bg-transparent text-[12.5px] outline-none" />
                </div>
                {matches.length > 0 && (
                  <div className="mt-1 max-h-[150px] overflow-y-auto rounded-sm border border-border bg-surface">
                    {matches.slice(0, 8).map((a) => (
                      <button key={a._id} onClick={() => { toast.guard(addMember({ patrolId: patrol._id as Id<"patrols">, agentId: a._id as Id<"agents"> }), "Ajout impossible"); setQ(""); }} className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left hover:bg-surface-2">
                        <Plus className="h-[13px] w-[13px] text-accent" />
                        <span className="font-data text-[11px] text-accent">{fmtMatricule(a.matricule)}</span>
                        <span className="flex-1 text-[12.5px] font-semibold">{a.prenomRP} {a.nomRP}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {!isMember && canJoin && (
            <button onClick={() => toast.guard(join({ patrolId: patrol._id as Id<"patrols"> }), "Impossible de rejoindre").then((r) => r !== undefined && onClose())} className="mb-4 w-full rounded-sm bg-accent px-4 py-[9px] text-[12.5px] font-semibold text-accent-contrast hover:brightness-[1.06]">
              Rejoindre cette patrouille
            </button>
          )}

          {/* Journal d'actions */}
          <div className="mb-4">
            <span className={L}>Journal</span>
            <PatrolJournal patrolId={patrol._id} />
          </div>

          {canEdit && (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div><span className={L}>N° véhicule</span>
                  <div className="flex gap-2">
                    <input value={num} onChange={(e) => setNum(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))} className="h-9 w-full rounded-sm border border-border bg-surface-2 px-2 font-data text-[13px] outline-none focus:border-accent" />
                    <button onClick={() => toast.guard(update({ patrolId: patrol._id as Id<"patrols">, vehicleNumber: num }), "Modification impossible")} className="rounded-sm bg-accent px-3 text-[12px] font-semibold text-accent-contrast">OK</button>
                  </div>
                </div>
                <div><span className={L}>Couleur</span>
                  <div className="flex gap-[6px]">
                    <button onClick={() => toast.guard(update({ patrolId: patrol._id as Id<"patrols">, color: null }), "Modification impossible")} className="flex h-[28px] w-[28px] items-center justify-center rounded-full border-2" style={{ borderColor: !patrol.color ? "var(--accent)" : "var(--border)", background: "var(--surface-2)" }}><X className="h-[12px] w-[12px] text-faint" /></button>
                    {PATROL_COLORS.map((c) => (
                      <button key={c} onClick={() => toast.guard(update({ patrolId: patrol._id as Id<"patrols">, color: c }), "Modification impossible")} className="h-[28px] w-[28px] rounded-full border-2" style={{ background: c, borderColor: patrol.color === c ? "var(--text)" : "transparent" }} />
                    ))}
                  </div>
                </div>
              </div>

              <button onClick={() => toast.guard(dissolve({ patrolId: patrol._id as Id<"patrols"> }), "Action impossible").then((r) => r !== undefined && onClose())} className="flex w-full items-center justify-center gap-[7px] rounded-sm border border-border bg-surface-2 px-4 py-[9px] text-[12.5px] font-semibold text-danger hover:border-danger">
                <Trash2 className="h-[14px] w-[14px]" /> Dissoudre la patrouille
              </button>
            </>
          )}
        </div>
      </div>

      {pendingStatus && (
        <StatusFieldsModal
          statusName={pendingStatus.name}
          requires={pendingStatus.requires}
          sectors={sectors}
          initial={patrol.status?._id === pendingStatus._id ? patrol.fields : null}
          onCancel={() => setPendingStatus(null)}
          onConfirm={(fields) => {
            toast.guard(setStatus({ patrolId: patrol._id as Id<"patrols">, statusId: pendingStatus._id as Id<"dispatchStatuses">, fields }), "Changement impossible");
            setPendingStatus(null);
          }}
        />
      )}
    </div>
  );
}

// Journal d'actions d'une patrouille (statuts, membres, couleur, opération…).
export function PatrolJournal({ patrolId }: { patrolId: string }) {
  const events = useQuery(api.dispatch.events, { patrolId: patrolId as Id<"patrols"> });
  const COLORS: Record<string, string> = {
    created: "var(--accent)", status: "var(--warning)", member_add: "var(--success)",
    member_remove: "var(--danger)", operation: "#3b82f6", ended: "var(--muted)",
  };
  if (events === undefined) return <div className="text-[12px] text-faint">Chargement…</div>;
  if (events.length === 0) return <div className="text-[12.5px] text-faint">Aucune action enregistrée.</div>;
  return (
    <div className="max-h-[190px] overflow-y-auto rounded-sm border border-border bg-surface-2">
      {events.map((e) => (
        <div key={e._id} className="flex items-start gap-2 border-b border-border px-[10px] py-[7px] last:border-b-0">
          <span className="mt-[5px] h-[6px] w-[6px] flex-shrink-0 rounded-full" style={{ background: COLORS[e.kind] ?? "var(--faint)" }} />
          <div className="min-w-0 flex-1">
            <div className="text-[12px]">{e.label}</div>
            <div className="text-[10.5px] text-faint">
              {new Date(e.at).toLocaleString("fr-FR")}{e.by ? ` · ${e.by}` : ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
