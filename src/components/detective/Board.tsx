import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link2, Trash2, ExternalLink, X, Type, Plus, Move } from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { useToast } from "@/providers/toast";
import { useDetectiveNav } from "./nav";
import { useDialogs } from "./dialogs";

// Tableau d'enquête (« murder board ») : canevas infini (pan + zoom), fond ardoise
// (tableau à craie), nœuds déplaçables reliés par des fils. Survol = aperçu,
// clic = ouverture de l'entité. Ajout par clic droit / clic sur le fond.

const REF_COLOR: Record<string, string> = {
  PERSON: "#e06666", VEHICLE: "#6fa8dc", ITEM: "#ffd966", EVIDENCE: "#93c47d",
  GANG: "#b98ce0", EVENT: "#b7b7b7", DRUGSITE: "#76d7c4", TEXT: "#cfcfcf",
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

export function Board({ divisionId, caseId, canWrite }: { divisionId: Id<"divisions">; caseId: Id<"dbCases">; canWrite: boolean }) {
  const data = useQuery(api.detectiveBoard.board, { caseId });
  const move = useMutation(api.detectiveBoard.moveNode);
  const removeNode = useMutation(api.detectiveBoard.removeNode);
  const addNode = useMutation(api.detectiveBoard.addNode);
  const addEdge = useMutation(api.detectiveBoard.addEdge);
  const removeEdge = useMutation(api.detectiveBoard.removeEdge);
  const toast = useToast();
  const go = useDetectiveNav();
  const { prompt, confirm } = useDialogs();

  // Retrait d'un lien : action immédiate, on confirme avant.
  async function handleRemoveEdge(id: Id<"dbBoardEdges">) {
    if (!(await confirm({ title: "Supprimer le lien", message: "Ce lien entre deux nœuds sera retiré du tableau.", confirmLabel: "Supprimer", danger: true }))) return;
    await toast.guard(removeEdge({ id }), "Action impossible");
  }

  // Retrait d'un nœud : action immédiate, on confirme avant.
  async function handleRemoveNode(id: Id<"dbBoardNodes">, name: string) {
    if (!(await confirm({ title: "Retirer le nœud", message: `Le nœud « ${name} » et ses liens seront retirés du tableau.`, confirmLabel: "Retirer", danger: true }))) return;
    await toast.guard(removeNode({ id }), "Action impossible");
  }
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const [drag, setDrag] = useState<{ id: Id<"dbBoardNodes">; x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const [linkFrom, setLinkFrom] = useState<Id<"dbBoardNodes"> | null>(null);
  const [menu, setMenu] = useState<{ sx: number; sy: number; cx: number; cy: number } | null>(null);

  const nodes: BoardNode[] = (data?.nodes ?? []) as BoardNode[];
  const edges = data?.edges ?? [];
  const nodeXY = (n: BoardNode) => (drag?.id === n._id ? { x: drag.x, y: drag.y } : { x: n.x, y: n.y });
  const center = (n: BoardNode) => { const p = nodeXY(n); return { x: p.x + NODE_W / 2, y: p.y + 40 }; };

  // Coord écran -> coord canevas.
  const toCanvas = (sx: number, sy: number) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: (sx - r.left - view.x) / view.z, y: (sy - r.top - view.y) / view.z };
  };

  // Pan du fond.
  const onBgPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    setMenu(null);
    const startX = e.clientX, startY = e.clientY, ox = view.x, oy = view.y;
    let moved = false;
    const onMove = (ev: PointerEvent) => { const dx = ev.clientX - startX, dy = ev.clientY - startY; if (Math.abs(dx) + Math.abs(dy) > 3) moved = true; setView((v) => ({ ...v, x: ox + dx, y: oy + dy })); };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); if (!moved) setMenu(null); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const openMenu = (e: React.MouseEvent) => {
    if (!canWrite) return;
    e.preventDefault();
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    const r = wrapRef.current!.getBoundingClientRect();
    const c = toCanvas(e.clientX, e.clientY);
    setMenu({ sx: e.clientX - r.left, sy: e.clientY - r.top, cx: c.x, cy: c.y });
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const r = wrapRef.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const nz = Math.min(2, Math.max(0.4, view.z * (e.deltaY < 0 ? 1.1 : 0.9)));
    // Zoom centré sur le curseur.
    setView((v) => ({ z: nz, x: mx - ((mx - v.x) / v.z) * nz, y: my - ((my - v.y) / v.z) * nz }));
  };

  const onNodePointerDown = (e: React.PointerEvent, n: BoardNode) => {
    if (!canWrite) return;
    if ((e.target as HTMLElement).closest("[data-noderole=action]")) return;
    e.stopPropagation();
    movedRef.current = false;
    const startX = e.clientX, startY = e.clientY, ox = n.x, oy = n.y;
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / view.z, dy = (ev.clientY - startY) / view.z;
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 4) movedRef.current = true;
      setDrag({ id: n._id, x: ox + dx, y: oy + dy });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (movedRef.current) void move({ id: n._id, x: ox + (ev.clientX - startX) / view.z, y: oy + (ev.clientY - startY) / view.z });
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onNodeClick = async (n: BoardNode) => {
    if (movedRef.current) { movedRef.current = false; return; }
    if (linkFrom && linkFrom !== n._id) {
      const label = await prompt({ title: "Nouveau lien", label: "Libellé du lien (optionnel)", placeholder: "ex. associé de, propriétaire de…" });
      await toast.guard(addEdge({ caseId, fromNodeId: linkFrom, toNodeId: n._id, label: label?.trim() || undefined }), "Lien impossible");
      setLinkFrom(null);
      return;
    }
    if (n.link) { const [kind, id] = n.link.split(":"); if (kind && id) go(kind, id); }
  };

  const place = async (refType: string, refId: string | undefined, label?: string) => {
    if (!menu) return;
    await toast.guard(addNode({ caseId, x: menu.cx, y: menu.cy, refType: refType as any, refId, label }), "Ajout impossible");
    setMenu(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-faint">
        {canWrite && <span className="inline-flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> Clic droit (ou clic) sur le fond pour ajouter un nœud</span>}
        {linkFrom && <span className="text-accent">Cliquez le nœud cible pour créer le lien… <button onClick={() => setLinkFrom(null)} className="underline">annuler</button></span>}
        <span className="ml-auto inline-flex items-center gap-2">
          <Move className="h-3.5 w-3.5" /> glisser le fond pour naviguer · molette pour zoomer
          <button onClick={() => setView({ x: 0, y: 0, z: 1 })} className="rounded border border-border px-2 py-0.5 hover:bg-surface-2">Recentrer</button>
          <span>{nodes.length} nœud(s) · {edges.length} lien(s)</span>
        </span>
      </div>

      <div ref={wrapRef} onPointerDown={onBgPointerDown} onContextMenu={openMenu} onWheel={onWheel}
        className="db-chalkboard relative overflow-hidden rounded-card border border-border-strong" style={{ height: 600, cursor: "grab" }}>
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
          <svg className="pointer-events-none absolute overflow-visible" style={{ left: 0, top: 0 }} width={1} height={1}>
            {edges.map((e) => {
              const a = nodes.find((n) => n._id === e.fromNodeId); const b = nodes.find((n) => n._id === e.toNodeId);
              if (!a || !b) return null;
              const ca = center(a); const cb = center(b);
              return (
                <g key={e._id}>
                  <line x1={ca.x} y1={ca.y} x2={cb.x} y2={cb.y} stroke={e.color ?? "#e8dfce"} strokeWidth={1.6} strokeDasharray="1 0" opacity={0.7} />
                  {e.label && <text x={(ca.x + cb.x) / 2} y={(ca.y + cb.y) / 2 - 4} fill="#f4efe2" fontSize={11} textAnchor="middle" style={{ paintOrder: "stroke", stroke: "#20302a", strokeWidth: 3 }}>{e.label}</text>}
                </g>
              );
            })}
          </svg>

          {canWrite && edges.map((e) => {
            const a = nodes.find((n) => n._id === e.fromNodeId); const b = nodes.find((n) => n._id === e.toNodeId);
            if (!a || !b) return null;
            const ca = center(a); const cb = center(b);
            return <button key={`del-${e._id}`} onPointerDown={(ev) => ev.stopPropagation()} onClick={() => void handleRemoveEdge(e._id)}
              className="absolute z-10 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-danger"
              style={{ left: (ca.x + cb.x) / 2, top: (ca.y + cb.y) / 2 + 8 }} title="Supprimer le lien"><X className="h-2.5 w-2.5" /></button>;
          })}

          {nodes.map((n) => {
            const col = n.color ?? REF_COLOR[n.refType] ?? "#cfcfcf";
            const p = nodeXY(n);
            return (
              <div key={n._id} data-node onPointerDown={(e) => onNodePointerDown(e, n)} onClick={() => onNodeClick(n)}
                className="absolute select-none rounded-[8px] border bg-[#f7f1e3] text-[#241a12] shadow-[0_6px_16px_rgba(0,0,0,.55)]"
                style={{ left: p.x, top: p.y, width: NODE_W, borderColor: col, borderTopWidth: 4, cursor: canWrite ? "grab" : "pointer" }}>
                <span className="absolute -top-2 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-[#8b1a1a] bg-[#c0392b] shadow" />
                <div className="px-2 pb-2 pt-2.5">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-[.06em]" style={{ color: "#7a6a55" }}>{REF_LABEL[n.refType]}</span>
                    {canWrite && (
                      <span className="flex items-center gap-1" data-noderole="action">
                        <button onClick={() => setLinkFrom(n._id)} title="Relier" className="text-[#7a6a55] hover:text-[#241a12]"><Link2 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => void handleRemoveNode(n._id, n.title || n.label || "ce nœud")} title="Retirer" className="text-[#7a6a55] hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                      </span>
                    )}
                  </div>
                  <div className="text-[12.5px] font-bold leading-tight">{n.refType === "TEXT" ? (n.label || "Note") : (n.title || n.label || "-")}</div>
                  {(n.subtitle || (n.refType === "TEXT" && n.note)) && <div className="mt-0.5 text-[10.5px] text-[#6b5d49]">{n.refType === "TEXT" ? n.note : n.subtitle}</div>}
                  {n.missing && <div className="mt-0.5 text-[10px] italic text-danger">élément supprimé</div>}
                  {n.link && <span data-noderole="action" onClick={(e) => { e.stopPropagation(); const [kind, id] = n.link!.split(":"); go(kind, id); }} className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[10px] font-semibold" style={{ color: "#8b1a1a" }}><ExternalLink className="h-3 w-3" /> ouvrir</span>}
                </div>
              </div>
            );
          })}
        </div>

        {menu && <AddNodeMenu divisionId={divisionId} caseId={caseId} sx={menu.sx} sy={menu.sy} onPick={place} onClose={() => setMenu(null)} />}
      </div>
    </div>
  );
}

function AddNodeMenu({ divisionId, caseId, sx, sy, onPick, onClose }: {
  divisionId: Id<"divisions">; caseId: Id<"dbCases">; sx: number; sy: number;
  onPick: (refType: string, refId: string | undefined, label?: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const opts = useQuery(api.detectiveBoard.nodeOptions, { caseId });
  const global = useQuery(api.detectiveSearch.global, q.trim() ? { divisionId, q } : "skip");
  const ql = q.trim().toLowerCase();

  // Entités déjà dans l'enquête (items/preuves/véhicules/évènements) filtrées.
  const caseItems = opts ? [
    ...opts.persons, ...opts.items, ...opts.vehicles, ...opts.evidence, ...opts.gangs, ...opts.events,
  ].filter((it) => !ql || `${it.label} ${it.subtitle}`.toLowerCase().includes(ql)).slice(0, 8) : [];
  // Résultats globaux (registre / gangs / stups) hors enquête.
  const globalItems = global ? [
    ...global.persons.map((p) => ({ refType: "PERSON", refId: p._id as string, label: p.name, subtitle: "Registre" })),
    ...global.gangs.map((g) => ({ refType: "GANG", refId: g._id as string, label: g.name, subtitle: "Organisation" })),
    ...global.drugSites.map((d) => ({ refType: "DRUGSITE", refId: d._id as string, label: d.name, subtitle: "Stup" })),
  ].slice(0, 8) : [];

  return (
    <>
      <div className="fixed inset-0 z-20" onPointerDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="absolute z-30 w-[280px] rounded-card border border-border-strong bg-elev p-2 shadow-[0_16px_40px_rgba(0,0,0,.45)]"
        style={{ left: Math.min(sx, 9999), top: sy }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="mb-2 flex gap-1">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher ou texte libre…" className="h-9 flex-1 rounded-sm border border-border bg-surface-2 px-2 text-[13px] outline-none focus:border-accent" />
          <button onClick={() => { if (q.trim()) onPick("TEXT", undefined, q.trim()); }} title="Ajouter comme note" className="flex h-9 w-9 items-center justify-center rounded-sm border border-border bg-surface-2 hover:border-accent"><Type className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[280px] overflow-y-auto">
          {caseItems.length > 0 && <div className="px-1 py-0.5 text-[10px] font-bold uppercase tracking-[.06em] text-faint">Dans l'enquête</div>}
          {caseItems.map((it) => (
            <button key={`c-${it.refType}-${it.refId}-${it.label}`} onClick={() => onPick(it.refType, it.refId)} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-surface-2">
              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: REF_COLOR[it.refType] }} />
              <span className="flex-1 truncate text-[12.5px]">{it.label}</span>
              <span className="text-[10px] text-faint">{it.subtitle}</span>
            </button>
          ))}
          {globalItems.length > 0 && <div className="mt-1 px-1 py-0.5 text-[10px] font-bold uppercase tracking-[.06em] text-faint">Base du bureau</div>}
          {globalItems.map((it) => (
            <button key={`g-${it.refType}-${it.refId}`} onClick={() => onPick(it.refType, it.refId)} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-surface-2">
              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: REF_COLOR[it.refType] }} />
              <span className="flex-1 truncate text-[12.5px]">{it.label}</span>
              <span className="text-[10px] text-faint">{it.subtitle}</span>
            </button>
          ))}
          {q.trim() && caseItems.length === 0 && globalItems.length === 0 && <div className="px-2 py-2 text-[12px] text-faint">Entrée pour créer une note « {q.trim()} ».</div>}
          {!q.trim() && caseItems.length === 0 && <div className="px-2 py-2 text-[12px] text-faint">Tapez pour rechercher, ou saisissez une note libre.</div>}
        </div>
      </div>
    </>
  );
}
