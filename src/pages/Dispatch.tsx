import { useRef, useState } from "react";
import { X, Plus, LogOut, Radio, Users, GripVertical, Flag, History, Maximize2, Minimize2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useMe } from "@/hooks/useMe";
import { useToast } from "@/providers/toast";
import { useApp } from "@/providers/app-state";
import { usePrefs } from "@/hooks/usePrefs";
import { usePointerDrag, dropZone, type DragPayload, type DropTarget } from "@/hooks/usePointerDrag";
import { PatrolCreateModal } from "@/components/dispatch/PatrolCreateModal";
import { PatrolDetailModal, PatrolJournal } from "@/components/dispatch/PatrolDetailModal";
import { StatusFieldsModal, fieldsSummary, type PatrolFields } from "@/components/dispatch/statusFields";
import { patrolBg, patrolBorder } from "@/lib/patrolColors";

type Status = { _id: string; name: string; color: string | null; icon: string | null; group: string | null; requires: string[] };
type Member = { matricule: number | null; name: string; agentId: string; gradeAbbrev: string | null; gradeColor: string | null };
type Operation = { _id: string; name: string; createdBy: string; startedAt: number; creator: string };
type Patrol = {
  _id: string; label: string; indicator: string; vehicleNumber: string; color: string | null; callsignTypeId: string | null;
  operationId: string | null;
  status: Status | null; detail: string | null; fields: PatrolFields | null; statusSince: number; startedAt: number; createdBy: string;
  members: Member[];
};
type Zone = { key: string; label: string; color: string | null; patrols: Patrol[]; status?: Status; operation?: Operation };
type Prompt =
  | { mode: "status"; patrolId: string; status: Status; initial: PatrolFields | null }
  | { mode: "createAgent"; agentId: string; status: Status };

const OPERATION_STATUS = "Opération";

function sinceLabel(ts: number) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

export function Dispatch() {
  const board = useQuery(api.dispatch.board);
  const myPatrol = useQuery(api.dispatch.myPatrol);
  const me = useMe();
  const { can } = useCan();
  const toast = useToast();
  const { focus, toggleFocus } = useApp();
  const { dispatchCompact } = usePrefs();
  const setStatus = useMutation(api.dispatch.setStatus);
  const createForAgent = useMutation(api.dispatch.createForAgent);
  const addMember = useMutation(api.dispatch.addMember);
  const join = useMutation(api.dispatch.join);
  const leave = useMutation(api.dispatch.leave);
  const dissolve = useMutation(api.dispatch.dissolve);
  const operationCreate = useMutation(api.dispatch.operationCreate);
  const operationEnd = useMutation(api.dispatch.operationEnd);
  const assignToOperation = useMutation(api.dispatch.assignToOperation);

  const canSelf = can("dispatch.self");
  const canManage = can("dispatch.manage");
  const canOps = can("dispatch.operations");
  const [create, setCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [newOp, setNewOp] = useState<string | null>(null);
  const [histOpen, setHistOpen] = useState(false);

  // Le hook doit être appelé à chaque rendu, y compris pendant le chargement :
  // il est donc déclaré avant le retour anticipé, et délègue à une référence
  // renseignée plus bas, une fois le tableau disponible.
  const dropHandler = useRef<(payload: DragPayload, target: DropTarget) => void>(() => {});
  const { drag, pos, grab, target, isDragging, dragHandle, didJustDrag } = usePointerDrag(
    (payload, t) => dropHandler.current(payload, t),
  );

  if (board === undefined) return <div className="p-[22px_26px] text-[13px] text-muted">Chargement du dispatch…</div>;

  const meId = me?.agent._id;
  const isMine = (p: Patrol) => myPatrol?._id === p._id;
  const canEditPatrol = (p: Patrol) => canManage || isMine(p) || p.createdBy === meId;

  const applyStatus = (patrol: Patrol, status: Status) => {
    if (status.requires.length > 0) { setPrompt({ mode: "status", patrolId: patrol._id, status, initial: patrol.fields }); return; }
    toast.guard(setStatus({ patrolId: patrol._id as Id<"patrols">, statusId: status._id as Id<"dispatchStatuses"> }), "Changement impossible");
  };

  // Dépôt : la cible est celle qui se trouve sous le pointeur au relâchement.
  const handleDrop = (payload: DragPayload, target: DropTarget): void => {
    if (!target) return;

    if (target.kind === "patrol") {
      // Les cartes couvrent leur zone : une patrouille lâchée sur une autre
      // carte doit être comprise comme un dépôt dans la zone qui la contient,
      // sinon la moitié de la surface utile ne répondrait pas.
      if (payload.type === "patrol") {
        const host = allZones.find((z) => z.patrols.some((p) => p._id === target.key));
        if (host) handleDrop(payload, { kind: "zone", key: host.key });
        return;
      }
      if (payload.type !== "agent") return;
      if (payload.id === meId) toast.guard(join({ patrolId: target.key as Id<"patrols"> }), "Impossible de rejoindre");
      else toast.guard(addMember({ patrolId: target.key as Id<"patrols">, agentId: payload.id as Id<"agents"> }), "Ajout impossible");
      return;
    }

    if (target.kind !== "zone") return;
    const zone = allZones.find((z) => z.key === target.key);
    if (!zone) return;

    if (payload.type === "patrol") {
      const patrol = board.patrols.find((p) => p._id === payload.id);
      if (!patrol || !canEditPatrol(patrol)) return;
      if (zone.operation) {
        if (patrol.operationId === zone.operation._id) return;
        toast.guard(assignToOperation({ patrolId: patrol._id as Id<"patrols">, operationId: zone.operation._id as Id<"operations"> }), "Affectation impossible");
        return;
      }
      if (zone.status) {
        if (patrol.status?._id === zone.status._id && !patrol.operationId) return;
        applyStatus(patrol, zone.status);
      }
      return;
    }

    // Un agent lâché sur une zone crée une patrouille dans ce statut.
    if (zone.status) {
      if (zone.status.requires.length > 0) { setPrompt({ mode: "createAgent", agentId: payload.id, status: zone.status }); return; }
      toast.guard(createForAgent({ agentId: payload.id as Id<"agents">, statusId: zone.status._id as Id<"dispatchStatuses"> }), "Création impossible");
    }
  };

  dropHandler.current = handleDrop;

  // ---- Construction des colonnes ----
  type Column = { key: string; title: string; color: string | null; grouped: boolean; zones: Zone[]; isOps?: boolean };
  const columns: Column[] = [];
  const groupIdx = new Map<string, number>();
  for (const s of board.statuses) {
    // La colonne « Opération » est remplacée par une colonne à zones (une par opération en cours).
    if (s.name === OPERATION_STATUS) {
      if (board.operations.length === 0) continue;
      columns.push({
        key: "ops",
        title: OPERATION_STATUS,
        color: s.color,
        grouped: true,
        isOps: true,
        zones: board.operations.map((o) => ({
          key: o._id, label: o.name, color: s.color, operation: o,
          patrols: board.patrols.filter((p) => p.operationId === o._id),
        })),
      });
      continue;
    }
    const zone: Zone = { key: s._id, label: s.name, color: s.color, status: s, patrols: board.patrols.filter((p) => p.status?._id === s._id && !p.operationId) };
    if (s.group) {
      const idx = groupIdx.get(s.group);
      if (idx === undefined) {
        groupIdx.set(s.group, columns.length);
        columns.push({ key: `g:${s.group}`, title: s.group, color: null, grouped: true, zones: [zone] });
      } else {
        columns[idx].zones.push(zone);
      }
    } else {
      columns.push({ key: s._id, title: s.name, color: s.color, grouped: false, zones: [zone] });
    }
  }
  const allZones = columns.flatMap((c) => c.zones);
  const placed = new Set(columns.flatMap((c) => c.zones.flatMap((z) => z.patrols.map((p) => p._id))));
  const orphans = board.patrols.filter((p) => !placed.has(p._id));

  const detailPatrol = detailId ? board.patrols.find((p) => p._id === detailId) : null;

  const renderCard = (p: Patrol) => (
    <PatrolCard
      key={p._id}
      patrol={p}
      drag={canEditPatrol(p) ? dragHandle({ type: "patrol", id: p._id }) : null}
      isMine={isMine(p)}
      agentDragging={drag?.type === "agent"}
      compact={dispatchCompact}
      onOpen={() => { if (!didJustDrag()) setDetailId(p._id); }}
      over={target?.kind === "patrol" && target.key === p._id}
      dimmed={drag?.type === "patrol" && drag.id === p._id}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col p-[18px_22px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[14px] flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Radio className="h-[19px] w-[19px] text-accent" />
          <h1 className="m-0 text-[21px] font-bold tracking-tight">Dispatch</h1>
        </div>
        <span className="rounded-[6px] bg-surface-2 px-[9px] py-[3px] text-[12px] font-semibold text-muted">{board.patrols.length} patrouille{board.patrols.length > 1 ? "s" : ""}</span>
        {board.operations.length > 0 && <span className="rounded-[6px] px-[9px] py-[3px] text-[12px] font-semibold" style={{ background: "color-mix(in srgb, #3b82f6 14%, transparent)", color: "#3b82f6" }}>{board.operations.length} opération{board.operations.length > 1 ? "s" : ""}</span>}
        <div className="flex-1" />
        {myPatrol && (
          <div className="flex items-center gap-2">
            <button onClick={() => setDetailId(myPatrol._id)} className="font-data text-[14px] font-bold text-accent hover:underline">{myPatrol.label}</button>
            <button onClick={() => toast.guard(leave(), "Action impossible")} className="flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-[11px] py-[7px] text-[12px] font-semibold text-muted hover:border-border-strong"><LogOut className="h-[14px] w-[14px]" /> Quitter</button>
            <button onClick={() => toast.guard(dissolve({ patrolId: myPatrol._id as Id<"patrols"> }), "Action impossible")} className="flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-[11px] py-[7px] text-[12px] font-semibold text-muted hover:border-danger hover:text-danger"><X className="h-[14px] w-[14px]" /> Dissoudre</button>
          </div>
        )}
        <button
          onClick={toggleFocus}
          title={focus ? "Quitter le plein écran" : "Plein écran : masque l'en-tête et la navigation"}
          className="mdt-press flex items-center gap-[7px] rounded-[9px] border border-border bg-surface-2 px-[13px] py-[8px] text-[13px] font-semibold text-muted hover:border-border-strong"
        >
          {focus ? <Minimize2 className="h-[15px] w-[15px]" /> : <Maximize2 className="h-[15px] w-[15px]" />}
          {focus ? "Réduire" : "Plein écran"}
        </button>
        <button onClick={() => setHistOpen(true)} className="mdt-press flex items-center gap-[7px] rounded-[9px] border border-border bg-surface-2 px-[13px] py-[8px] text-[13px] font-semibold text-muted hover:border-border-strong"><History className="h-[15px] w-[15px]" /> Historique</button>
        {canOps && <button onClick={() => setNewOp("")} className="mdt-press flex items-center gap-[7px] rounded-[9px] border border-border bg-surface-2 px-[13px] py-[8px] text-[13px] font-semibold text-muted hover:border-accent hover:text-accent"><Flag className="h-[15px] w-[15px]" /> Opération</button>}
        {canSelf && <button onClick={() => setCreate(true)} className="mdt-press flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]"><Plus className="h-[16px] w-[16px]" /> Créer une patrouille</button>}
      </div>

      <div className="flex min-h-0 flex-1 gap-[12px] overflow-x-auto pb-1">
        {/* Colonne "En service" */}
        <div className="flex w-[210px] flex-shrink-0 flex-col rounded-card border border-border bg-surface">
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-[13px] py-[10px]">
            <span className="h-[9px] w-[9px] rounded-full" style={{ background: "var(--success)" }} />
            <span className="truncate text-[12.5px] font-bold">En service</span>
            <div className="flex-1" />
            <span className="font-data text-[12px] text-faint">{board.onDuty.length}</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-[6px] overflow-y-auto p-[9px]">
            {board.onDuty.map((a) => (
              <div
                key={a.agentId}
                {...dragHandle({ type: "agent", id: a.agentId })}
                className={`flex cursor-grab select-none items-center gap-[7px] rounded-sm border border-border bg-surface-2 px-[8px] py-[6px] active:cursor-grabbing ${
                  drag?.type === "agent" && drag.id === a.agentId ? "opacity-30" : ""
                }`}
                title="Glisser vers un statut (crée une patrouille) ou sur une patrouille (l'ajoute)"
              >
                <GripVertical className="h-[13px] w-[13px] flex-shrink-0 text-faint" />
                {a.gradeAbbrev && (
                  <span
                    className="flex-shrink-0 rounded-[3px] border px-[4px] py-px text-[8.5px] font-bold uppercase tracking-[0.04em]"
                    style={a.gradeColor ? { borderColor: a.gradeColor, color: a.gradeColor } : { borderColor: "var(--border)", color: "var(--muted)" }}
                  >
                    {a.gradeAbbrev}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{a.name}</span>
              </div>
            ))}
            {board.onDuty.length === 0 && <div className="flex flex-1 items-center justify-center py-6 text-center text-[11px] text-faint">Personne en service</div>}
          </div>
        </div>

        {columns.map((col) => (
          <div key={col.key} className="flex min-w-[300px] flex-1 flex-col rounded-card border border-border bg-surface">
            <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-[13px] py-[10px]">
              <span className="h-[9px] w-[9px] rounded-full" style={{ background: col.grouped && !col.isOps ? "var(--accent)" : (col.color ?? "var(--faint)") }} />
              <span className="truncate text-[12.5px] font-bold">{col.title}</span>
              <div className="flex-1" />
              <span className="font-data text-[12px] text-faint">{col.zones.reduce((n, z) => n + z.patrols.length, 0)}</span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {col.zones.map((zone) => (
                <div
                  key={zone.key}
                  {...dropZone("zone", zone.key)}
                  className={`flex min-h-[64px] flex-shrink-0 flex-col gap-[8px] p-[9px] ${col.grouped ? "border-b border-border last:border-b-0" : "flex-1"} ${isDragging ? "outline-dashed outline-1 -outline-offset-4" : ""}`}
                  style={isDragging ? { outlineColor: target?.kind === "zone" && target.key === zone.key ? "var(--accent)" : "var(--border-strong)" } : undefined}
                >
                  {col.grouped && (
                    <div className="flex items-center gap-[6px]">
                      <span className="h-[7px] w-[7px] flex-shrink-0 rounded-full" style={{ background: zone.color ?? "var(--faint)" }} />
                      <span className="truncate text-[10px] font-bold uppercase tracking-[0.09em]" style={{ color: zone.color ?? "var(--faint)" }}>{zone.label}</span>
                      {zone.operation && <span className="truncate text-[9.5px] text-faint">· {zone.operation.creator}</span>}
                      <div className="flex-1" />
                      <span className="font-data text-[10px] text-faint">{zone.patrols.length}</span>
                      {zone.operation && (canOps && (zone.operation.createdBy === meId || canManage)) && (
                        <button
                          onClick={() => toast.guard(operationEnd({ operationId: zone.operation!._id as Id<"operations"> }), "Action impossible")}
                          title="Terminer l'opération"
                          className="flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border border-border text-faint hover:border-danger hover:text-danger"
                        >
                          <X className="h-[11px] w-[11px]" />
                        </button>
                      )}
                    </div>
                  )}
                  {zone.patrols.map(renderCard)}
                  {zone.patrols.length === 0 && <div className="flex min-h-[28px] flex-1 items-center justify-center text-center text-[10.5px] text-faint">—</div>}
                </div>
              ))}
            </div>
          </div>
        ))}

        {orphans.length > 0 && (
          <div className="flex w-[240px] flex-shrink-0 flex-col rounded-card border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border px-[13px] py-[10px]"><span className="text-[12.5px] font-bold">Sans statut</span></div>
            <div className="flex flex-col gap-[8px] overflow-y-auto p-[9px]">{orphans.map(renderCard)}</div>
          </div>
        )}
      </div>


      {/* Fantôme : une copie de l'élément saisi, centrée sur le curseur. Le
          glisser-déposer natif fournissait cet aperçu, les événements pointeur
          non. */}
      {drag && pos && grab && (
        <div
          className="pointer-events-none fixed z-[90] opacity-80"
          style={{
            left: pos.x,
            top: pos.y,
            width: grab.width,
            // Centrage par translation : le navigateur applique les dimensions
            // RÉELLES du fantôme. Les mesurer à la source décalait l'aperçu
            // agent, dont le balisage diffère légèrement de la ligne d'origine.
            transform: "translate(-50%, -50%) rotate(1.5deg)",
          }}
        >
          {drag.type === "patrol"
            ? (() => {
                const p = board.patrols.find((x) => x._id === drag.id);
                return p ? <PatrolCard patrol={p} drag={null} isMine={isMine(p)} agentDragging={false} compact={dispatchCompact} over={false} onOpen={() => {}} /> : null;
              })()
            : (() => {
                const a = board.onDuty.find((x) => x.agentId === drag.id);
                if (!a) return null;
                return (
                  <div className="flex items-center gap-[7px] rounded-sm border border-accent bg-surface-2 px-[8px] py-[6px] shadow-[0_8px_24px_var(--shadow)]">
                    <GripVertical className="h-[13px] w-[13px] flex-shrink-0 text-faint" />
                    {a.gradeAbbrev && (
                      <span
                        className="flex-shrink-0 rounded-[3px] border px-[4px] py-px text-[8.5px] font-bold uppercase tracking-[0.04em]"
                        style={a.gradeColor ? { borderColor: a.gradeColor, color: a.gradeColor } : { borderColor: "var(--border)", color: "var(--muted)" }}
                      >
                        {a.gradeAbbrev}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{a.name}</span>
                  </div>
                );
              })()}
        </div>
      )}

      {histOpen && <HistoryModal onClose={() => setHistOpen(false)} />}
      {create && <PatrolCreateModal onClose={() => setCreate(false)} />}
      {newOp !== null && (
        <OperationModal
          onCancel={() => setNewOp(null)}
          onConfirm={(name) => { toast.guard(operationCreate({ name }), "Création impossible"); setNewOp(null); }}
        />
      )}
      {detailPatrol && (
        <PatrolDetailModal
          patrol={detailPatrol}
          statuses={board.statuses}
          sectors={board.sectors}
          canEdit={canEditPatrol(detailPatrol)}
          isMember={isMine(detailPatrol)}
          canJoin={canSelf && myPatrol === null}
          onClose={() => setDetailId(null)}
        />
      )}
      {prompt && (
        <StatusFieldsModal
          statusName={prompt.status.name}
          requires={prompt.status.requires}
          sectors={board.sectors}
          initial={prompt.mode === "status" ? prompt.initial : null}
          onCancel={() => setPrompt(null)}
          onConfirm={(fields) => {
            if (prompt.mode === "status") {
              toast.guard(setStatus({ patrolId: prompt.patrolId as Id<"patrols">, statusId: prompt.status._id as Id<"dispatchStatuses">, fields }), "Changement impossible");
            } else {
              toast.guard(createForAgent({ agentId: prompt.agentId as Id<"agents">, statusId: prompt.status._id as Id<"dispatchStatuses">, fields }), "Création impossible");
            }
            setPrompt(null);
          }}
        />
      )}
    </div>
  );
}

// Historique des patrouilles terminées + journal de chacune.
function HistoryModal({ onClose }: { onClose: () => void }) {
  const rows = useQuery(api.dispatch.history);
  const [sel, setSel] = useState<string | null>(null);
  return (
    <div onClick={onClose} className="fixed inset-0 z-[85] flex items-center justify-center p-4" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-[70vh] w-[720px] max-w-[94vw] flex-col rounded-card border border-border-strong bg-elev shadow-[0_24px_70px_rgba(0,0,0,.4)] mdt-pop">
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-5 py-4">
          <History className="h-[17px] w-[17px] text-accent" />
          <h2 className="m-0 flex-1 text-[15px] font-bold">Historique des patrouilles</h2>
          <button onClick={onClose} className="flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr]">
          <div className="min-h-0 overflow-y-auto border-r border-border">
            {rows === undefined ? (
              <div className="p-4 text-[12.5px] text-faint">Chargement…</div>
            ) : rows.length === 0 ? (
              <div className="p-4 text-[12.5px] text-faint">Aucune patrouille terminée.</div>
            ) : rows.map((r) => (
              <button key={r._id} onClick={() => setSel(r._id)} className="flex w-full flex-col items-start gap-[2px] border-b border-border px-4 py-[10px] text-left hover:bg-surface-2" style={sel === r._id ? { background: "var(--accent-soft)" } : undefined}>
                <span className="font-data text-[13px] font-bold" style={{ color: r.color ?? "var(--text)" }}>{r.label}</span>
                <span className="text-[11px] text-faint">{new Date(r.startedAt).toLocaleString("fr-FR")}</span>
                <span className="text-[10.5px] text-faint">{Math.max(1, Math.round((r.endedAt - r.startedAt) / 60000))} min · {r.eventCount} action{r.eventCount > 1 ? "s" : ""}</span>
              </button>
            ))}
          </div>
          <div className="min-h-0 overflow-y-auto p-4">
            {sel ? <PatrolJournal patrolId={sel} /> : <div className="flex h-full items-center justify-center text-[12.5px] text-faint">Sélectionnez une patrouille.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function OperationModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div onClick={onCancel} className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)" }}>
      <div onClick={(e) => e.stopPropagation()} className="w-[380px] max-w-[94vw] rounded-card border border-border-strong bg-elev p-5 shadow-[0_24px_70px_rgba(0,0,0,.4)] mdt-pop">
        <h2 className="m-0 mb-1 text-[15px] font-bold">Nouvelle opération</h2>
        <p className="mb-4 mt-0 text-[12.5px] text-muted">Une zone dédiée apparaîtra dans la colonne Opération.</p>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Nom de l'opération…" onKeyDown={(e) => e.key === "Enter" && name.trim() && onConfirm(name.trim())} className="h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent" />
        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="rounded-sm border border-border bg-surface-2 px-4 py-[9px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
          <button onClick={() => name.trim() && onConfirm(name.trim())} disabled={!name.trim()} className="flex-1 rounded-sm bg-accent px-4 py-[9px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">Lancer l'opération</button>
        </div>
      </div>
    </div>
  );
}

function PatrolCard({ patrol, drag, isMine, agentDragging, compact, over, dimmed, onOpen }: {
  patrol: Patrol;
  // Attributs de préhension, ou null si l'agent n'a pas le droit de déplacer.
  drag: { onPointerDown: (e: React.PointerEvent) => void; style: { touchAction: "none" } } | null;
  isMine: boolean; agentDragging: boolean; compact: boolean; over: boolean;
  // Vraie pour la carte en cours de déplacement : elle s'estompe pendant que
  // le fantôme la représente sous le curseur.
  dimmed?: boolean;
  onOpen: () => void;
}) {
  const names = patrol.members.map((m) => m.name.split(" ").slice(-1)[0]).join(", ");
  const grades = patrol.members.filter((m) => m.gradeAbbrev);
  const summary = fieldsSummary(patrol.fields, patrol.status?.requires ?? []);
  const accent = patrol.status?.color ?? patrol.color ?? "var(--accent)";
  // En compact, détail et champs obligatoires partagent une seule ligne :
  // c'est ce qui coûtait le plus de hauteur sur une tablette.
  const line = compact ? [patrol.detail, summary].filter(Boolean).join(" · ") : null;

  const gradeTags = grades.map((m, i) => (
    <span
      key={i}
      className="rounded-[3px] border bg-surface px-[4px] py-px text-[8.5px] font-bold uppercase tracking-[0.04em]"
      style={m.gradeColor ? { borderColor: m.gradeColor, color: m.gradeColor } : { borderColor: "var(--border)", color: "var(--muted)" }}
    >
      {m.gradeAbbrev}
    </span>
  ));

  return (
    <div
      {...(drag ?? {})}
      {...dropZone("patrol", patrol._id)}
      onClick={onOpen}
      className={`cursor-pointer select-none rounded-sm border transition-shadow hover:shadow-[0_2px_10px_var(--shadow)] ${compact ? "p-[5px_8px]" : "p-[8px_10px]"} ${drag ? "active:cursor-grabbing" : ""} ${dimmed ? "opacity-30" : ""}`}
      style={{
        ...(drag?.style ?? {}),
        background: patrolBg(patrol.color),
        // Surlignée uniquement quand un agent la survole : c'est le seul dépôt
        // qu'une patrouille accepte.
        borderColor: over && agentDragging ? "var(--accent)" : patrolBorder(patrol.color),
        borderStyle: over && agentDragging ? "dashed" : "solid",
      }}
    >
      {/* En compact, les tags de grade rejoignent la ligne de l'indicatif au
          lieu d'occuper une rangée à eux seuls. */}
      {!compact && grades.length > 0 && <div className="mb-[3px] flex flex-wrap gap-[3px]">{gradeTags}</div>}

      <div className="flex items-center gap-[6px]">
        <span className={`font-data font-bold tracking-wide ${compact ? "text-[12.5px]" : "text-[14px]"}`}>{patrol.label}</span>
        {compact && grades.length > 0 && <span className="flex flex-shrink-0 gap-[3px]">{gradeTags}</span>}
        {isMine && <span className="rounded-[4px] bg-accent-soft px-[5px] py-px text-[8.5px] font-bold uppercase tracking-[0.06em] text-accent">Moi</span>}
        <div className="flex-1" />
        <span className="flex-shrink-0 font-data text-[10px] text-faint">{sinceLabel(patrol.statusSince)}</span>
      </div>

      <div className={`flex items-center gap-[6px] text-muted ${compact ? "mt-[2px] text-[10.5px]" : "mt-[4px] text-[11.5px]"}`}>
        <Users className="h-[12px] w-[12px] flex-shrink-0 text-faint" />
        <span className="min-w-0 flex-1 truncate">{names || "-"}</span>
      </div>

      {compact ? (
        line && (
          <div className="mt-[2px] truncate text-[10.5px] font-semibold" style={{ color: patrol.detail ? (patrol.color ?? "var(--accent)") : accent }} title={line}>
            {line}
          </div>
        )
      ) : (
        <>
          {summary && (
            <div className="mt-[6px] truncate rounded-[5px] px-[8px] py-[4px] text-[11.5px] font-semibold" style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }} title={summary}>
              {summary}
            </div>
          )}
          {patrol.detail && (
            <div className="mt-[5px] truncate rounded-[5px] px-[9px] py-[5px] text-[12px] font-semibold" style={{ background: `color-mix(in srgb, ${patrol.color ?? "var(--accent)"} 18%, transparent)`, color: patrol.color ?? "var(--accent)" }} title={patrol.detail}>
              {patrol.detail}
            </div>
          )}
        </>
      )}
    </div>
  );
}
