import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, Link2, Trash2, ExternalLink, X, Type } from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { useToast } from "@/providers/toast";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { Field, inputCls } from "./ui";
import { useDetectiveNav } from "./nav";

// Tableau d'enquête (« murder board »). Nœuds déplaçables reliés par des fils.
// Style « film » : liège sombre, épingles, ficelle rouge. Survol = aperçu,
// clic = ouverture de l'entité.

const REF_COLOR: Record<string, string> = {
  PERSON: "#d94040", VEHICLE: "#3b82f6", ITEM: "#e0a030", EVIDENCE: "#49a24a",
  GANG: "#8b5cf6", EVENT: "#8a929c", DRUGSITE: "#14b8a6", TEXT: "#94a3b8",
};
const REF_LABEL: Record<string, string> = {
  PERSON: "Personne", VEHICLE: "Véhicule", ITEM: "Pièce", EVIDENCE: "Preuve",
  GANG: "Organisation", EVENT: "Évènement", DRUGSITE: "Stup", TEXT: "Note",
};
const NODE_W = 176;

type BoardNode = {
  _id: Id<"dbBoardNodes">; x: number; y: number; refType: string; refId: string | null;
  label: string; note: string; color: string | null; title: string; subtitle: string; link: string | null; missing: boolean;
};

export function Board({ caseId, canWrite }: { caseId: Id<"dbCases">; canWrite: boolean }) {
  const data = useQuery(api.detectiveBoard.board, { caseId });
  const move = useMutation(api.detectiveBoard.moveNode);
  const removeNode = useMutation(api.detectiveBoard.removeNode);
  const addEdge = useMutation(api.detectiveBoard.addEdge);
  const removeEdge = useMutation(api.detectiveBoard.removeEdge);
  const toast = useToast();
  const go = useDetectiveNav();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(false);
  const [linkFrom, setLinkFrom] = useState<Id<"dbBoardNodes"> | null>(null);
  const [drag, setDrag] = useState<{ id: Id<"dbBoardNodes">; x: number; y: number; moved: boolean } | null>(null);

  const nodes: BoardNode[] = (data?.nodes ?? []) as BoardNode[];
  const edges = data?.edges ?? [];
  const center = (n: BoardNode) => ({ x: (drag?.id === n._id ? drag.x : n.x) + NODE_W / 2, y: (drag?.id === n._id ? drag.y : n.y) + 34 });

  const onNodePointerDown = (e: React.PointerEvent, n: BoardNode) => {
    if (!canWrite) return;
    if ((e.target as HTMLElement).closest("[data-noderole=action]")) return;
    e.preventDefault();
    const rect = wrapRef.current!.getBoundingClientRect();
    const scroll = wrapRef.current!;
    const startX = e.clientX; const startY = e.clientY; const ox = n.x; const oy = n.y;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX; const dy = ev.clientY - startY;
      setDrag({ id: n._id, x: Math.max(0, ox + dx), y: Math.max(0, oy + dy), moved: Math.abs(dx) + Math.abs(dy) > 4 });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const dx = ev.clientX - startX; const dy = ev.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        void move({ id: n._id, x: Math.max(0, ox + dx), y: Math.max(0, oy + dy) });
      }
      setDrag(null);
      void rect; void scroll;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onNodeClick = (n: BoardNode) => {
    if (drag?.moved) return;
    if (linkFrom && linkFrom !== n._id) {
      const label = prompt("Libellé du lien (optionnel)") ?? "";
      void toast.guard(addEdge({ caseId, fromNodeId: linkFrom, toNodeId: n._id, label: label.trim() || undefined }), "Lien impossible");
      setLinkFrom(null);
      return;
    }
    if (n.link) { const [kind, id] = n.link.split(":"); if (kind && id) go(kind === "vehicle" ? "vehicle" : kind, id); }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {canWrite && <Button variant="primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Ajouter un nœud</Button>}
        {linkFrom && <span className="text-[12px] text-accent">Cliquez le nœud cible pour créer le lien… <button onClick={() => setLinkFrom(null)} className="underline">annuler</button></span>}
        <span className="ml-auto text-[11.5px] text-faint">{nodes.length} nœud(s) · {edges.length} lien(s)</span>
      </div>

      <div ref={wrapRef} className="relative overflow-auto rounded-card border border-border-strong"
        style={{ height: 560, background: "radial-gradient(circle at 30% 20%, #3a2c1e, #241a12 60%, #1a130d)", backgroundColor: "#241a12" }}>
        <div className="relative" style={{ width: 2200, height: 1500 }}>
          <svg className="pointer-events-none absolute inset-0" width={2200} height={1500}>
            {edges.map((e) => {
              const a = nodes.find((n) => n._id === e.fromNodeId); const b = nodes.find((n) => n._id === e.toNodeId);
              if (!a || !b) return null;
              const ca = center(a); const cb = center(b);
              return (
                <g key={e._id}>
                  <line x1={ca.x} y1={ca.y} x2={cb.x} y2={cb.y} stroke={e.color ?? "#c0392b"} strokeWidth={2} opacity={0.85} />
                  {e.label && <text x={(ca.x + cb.x) / 2} y={(ca.y + cb.y) / 2 - 4} fill="#f0e6d2" fontSize={11} textAnchor="middle" style={{ paintOrder: "stroke", stroke: "#1a130d", strokeWidth: 3 }}>{e.label}</text>}
                </g>
              );
            })}
          </svg>

          {canWrite && edges.map((e) => {
            const a = nodes.find((n) => n._id === e.fromNodeId); const b = nodes.find((n) => n._id === e.toNodeId);
            if (!a || !b) return null;
            const ca = center(a); const cb = center(b);
            return <button key={`del-${e._id}`} onClick={() => toast.guard(removeEdge({ id: e._id }), "Action impossible")}
              className="absolute z-10 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white hover:bg-danger"
              style={{ left: (ca.x + cb.x) / 2, top: (ca.y + cb.y) / 2 + 8 }} title="Supprimer le lien"><X className="h-2.5 w-2.5" /></button>;
          })}

          {nodes.map((n) => {
            const col = n.color ?? REF_COLOR[n.refType] ?? "#94a3b8";
            const x = drag?.id === n._id ? drag.x : n.x; const y = drag?.id === n._id ? drag.y : n.y;
            return (
              <div key={n._id} onPointerDown={(e) => onNodePointerDown(e, n)} onClick={() => onNodeClick(n)}
                className="absolute select-none rounded-[8px] border bg-[#f7f1e3] text-[#241a12] shadow-[0_6px_16px_rgba(0,0,0,.5)]"
                style={{ left: x, top: y, width: NODE_W, borderColor: col, borderTopWidth: 4, cursor: canWrite ? "grab" : "pointer" }}>
                <span className="absolute -top-2 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-[#8b1a1a] bg-[#c0392b] shadow" />
                <div className="px-2 pb-2 pt-2.5">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-[.06em]" style={{ color: col }}>{REF_LABEL[n.refType]}</span>
                    {canWrite && (
                      <span className="flex items-center gap-1" data-noderole="action">
                        <button onClick={() => setLinkFrom(n._id)} title="Relier" className="text-[#7a6a55] hover:text-[#241a12]"><Link2 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => toast.guard(removeNode({ id: n._id }), "Action impossible")} title="Retirer" className="text-[#7a6a55] hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                      </span>
                    )}
                  </div>
                  <div className="text-[12.5px] font-bold leading-tight">{n.refType === "TEXT" ? (n.label || "Note") : (n.title || n.label || "—")}</div>
                  {(n.subtitle || (n.refType === "TEXT" && n.note)) && <div className="mt-0.5 text-[10.5px] text-[#6b5d49]">{n.refType === "TEXT" ? n.note : n.subtitle}</div>}
                  {n.missing && <div className="mt-0.5 text-[10px] italic text-danger">élément supprimé</div>}
                  {n.link && <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: col }} data-noderole="action" onClick={(e) => { e.stopPropagation(); const [kind, id] = n.link!.split(":"); go(kind, id); }}><ExternalLink className="h-3 w-3" /> ouvrir</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {adding && <AddNodePanel caseId={caseId} onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddNodePanel({ caseId, onClose }: { caseId: Id<"dbCases">; onClose: () => void }) {
  const opts = useQuery(api.detectiveBoard.nodeOptions, { caseId });
  const addNode = useMutation(api.detectiveBoard.addNode);
  const toast = useToast();
  const [text, setText] = useState("");
  const [pos, setPos] = useState(0);

  const place = () => { const p = 60 + pos * 30; setPos((v) => (v + 1) % 12); return { x: p, y: p }; };
  const add = async (refType: string, refId: string | undefined, label?: string) => {
    const { x, y } = place();
    const r = await toast.guard(addNode({ caseId, x, y, refType: refType as any, refId, label }), "Ajout impossible");
    if (r !== undefined) toast.success("Nœud ajouté.");
  };

  const groups: { title: string; items: { refType: string; refId: string; label: string; subtitle: string }[] }[] = opts ? [
    { title: "Personnes", items: opts.persons },
    { title: "Pièces", items: opts.items },
    { title: "Véhicules", items: opts.vehicles },
    { title: "Preuves", items: opts.evidence },
    { title: "Organisations", items: opts.gangs },
    { title: "Chronologie", items: opts.events },
  ] : [];

  return (
    <Modal title="Ajouter un nœud" onClose={onClose} width={460}
      footer={<div className="flex justify-end"><Button variant="ghost" onClick={onClose}>Fermer</Button></div>}>
      <div className="flex flex-col gap-[14px]">
        <Field label="Note libre">
          <div className="flex gap-2">
            <input value={text} onChange={(e) => setText(e.target.value)} className={inputCls} placeholder="Texte du post-it" />
            <Button variant="primary" onClick={async () => { if (!text.trim()) return; await add("TEXT", undefined, text.trim()); setText(""); }}><Type className="h-4 w-4" /></Button>
          </div>
        </Field>
        {groups.map((g) => g.items.length > 0 && (
          <div key={g.title}>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-faint">{g.title}</div>
            <div className="flex flex-col gap-[5px]">
              {g.items.map((it) => (
                <button key={`${it.refType}-${it.refId}-${it.label}`} onClick={() => add(it.refType, it.refId)}
                  className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3 py-2 text-left hover:border-accent">
                  <span className="h-2 w-2 rounded-full" style={{ background: REF_COLOR[it.refType] }} />
                  <span className="flex-1 truncate text-[13px]">{it.label}</span>
                  <span className="text-[11px] text-faint">{it.subtitle}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {opts && groups.every((g) => g.items.length === 0) && <div className="text-[12.5px] text-faint">Ajoutez d'abord des personnes, pièces ou véhicules à l'enquête pour les épingler ici. Vous pouvez aussi créer des notes libres.</div>}
      </div>
    </Modal>
  );
}
