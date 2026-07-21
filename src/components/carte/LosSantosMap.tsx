import { useEffect, useRef, useState } from "react";
import { Plus, Minus, Maximize } from "lucide-react";

export interface Pt { x: number; y: number }
export interface MapMarker {
  _id: string;
  name: string;
  kind: "LIEU" | "SECTEUR";
  x: number;
  y: number;
  color?: string | null;
  points?: Pt[] | null;
}

const MIN_Z = 1;
const MAX_Z = 8;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// Carte réutilisable avec zoom + déplacement (§19). Coordonnées en % (0-100) de l'image.
export function LosSantosMap({
  imageUrl,
  markers = [],
  pin,
  draft = null,
  draftColor = "#49A24A",
  onPick,
  onMarkerClick,
  height = 460,
}: {
  imageUrl?: string | null;
  markers?: MapMarker[];
  pin?: { x: number; y: number } | null;
  draft?: Pt[] | null;
  draftColor?: string;
  onPick?: (x: number, y: number) => void;
  onMarkerClick?: (m: MapMarker) => void;
  height?: number;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ sx: number; sy: number; px: number; py: number; moved: boolean } | null>(null);

  // Mesure du viewport
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const S = size.h; // côté du carré (l'image est carrée)
  const worldLeft = (size.w - S) / 2;

  // Zoom molette centré sur le curseur (listener natif non passif).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setZoom((z) => {
        const nz = clamp(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), MIN_Z, MAX_Z);
        setPan((p) => {
          const centerX = worldLeft + S / 2 + p.x;
          const centerY = S / 2 + p.y;
          const ux = (cx - centerX) / z;
          const uy = (cy - centerY) / z;
          return { x: cx - ux * nz - worldLeft - S / 2, y: cy - uy * nz - S / 2 };
        });
        return nz;
      });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [S, worldLeft]);

  function onMouseDown(e: React.MouseEvent) {
    drag.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y, moved: false };
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.sx;
    const dy = e.clientY - drag.current.sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.current.moved = true;
    setPan({ x: drag.current.px + dx, y: drag.current.py + dy });
  }
  function onMouseUp(e: React.MouseEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || !onPick || !worldRef.current) return;
    // Clic simple -> placer un point (coords via le rect transformé du monde).
    const r = worldRef.current.getBoundingClientRect();
    const x = clamp(((e.clientX - r.left) / r.width) * 100, 0, 100);
    const y = clamp(((e.clientY - r.top) / r.height) * 100, 0, 100);
    onPick(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
  }

  function reset() { setZoom(1); setPan({ x: 0, y: 0 }); }
  function zoomBtn(dir: 1 | -1) {
    setZoom((z) => clamp(z * (dir > 0 ? 1.4 : 1 / 1.4), MIN_Z, MAX_Z));
  }

  const inv = 1 / zoom; // contre-échelle des libellés

  return (
    <div
      ref={viewportRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => (drag.current = null)}
      className="relative w-full overflow-hidden rounded-sm border border-border bg-[#0b0d11]"
      style={{ height, cursor: drag.current?.moved ? "grabbing" : onPick ? "crosshair" : "grab", touchAction: "none" }}
    >
      {S > 0 && (
        <div
          ref={worldRef}
          className="absolute select-none"
          style={{
            left: worldLeft,
            top: 0,
            width: S,
            height: S,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
          }}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="Los Santos" draggable={false} className="h-full w-full object-fill" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-center text-[12px] text-faint" style={{ background: "repeating-linear-gradient(0deg,var(--surface-2),var(--surface-2) 24px,var(--border) 24px,var(--border) 25px), repeating-linear-gradient(90deg,var(--surface-2),var(--surface-2) 24px,var(--border) 24px,var(--border) 25px)" }}>
              Définissez un fond de carte.
            </div>
          )}

          {/* Délimitations des secteurs + tracé en cours (§19, item 3) */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {markers
              .filter((m) => m.kind === "SECTEUR" && m.points && m.points.length >= 3)
              .map((m) => {
                const col = m.color ?? "#49A24A";
                return (
                  <polygon
                    key={m._id}
                    points={m.points!.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill={col}
                    fillOpacity={0.18}
                    stroke={col}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            {draft && draft.length > 0 && (
              <>
                {draft.length >= 3 ? (
                  // Polygone ferme (dernier sommet relie au premier) -> vraie zone.
                  <polygon
                    points={draft.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill={draftColor}
                    fillOpacity={0.18}
                    stroke={draftColor}
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : (
                  <polyline
                    points={draft.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={draftColor}
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {draft.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={0.7}
                    fill={i === 0 ? draftColor : "#fff"}
                    stroke={draftColor}
                    strokeWidth={1.4}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </>
            )}
          </svg>

          {markers.map((m) => (
            <div key={m._id} className="absolute" style={{ left: `${m.x}%`, top: `${m.y}%` }}>
              <button
                onClick={(e) => { e.stopPropagation(); onMarkerClick?.(m); }}
                className="block"
                style={{ transform: `translate(-50%, -50%) scale(${inv})`, transformOrigin: "center" }}
                title={m.name}
              >
                {m.kind === "SECTEUR" ? (
                  <span className="whitespace-nowrap rounded-[5px] border px-[7px] py-[2px] text-[10.5px] font-bold uppercase tracking-[0.06em]" style={{ borderColor: m.color ?? "var(--accent)", color: m.color ?? "var(--accent)", background: "rgba(11,13,17,.82)" }}>{m.name}</span>
                ) : (
                  <span className="flex flex-col items-center gap-[2px]">
                    <span className="h-[13px] w-[13px] rounded-full border-2 border-white shadow" style={{ background: m.color ?? "var(--danger)" }} />
                    <span className="whitespace-nowrap rounded-[4px] px-[5px] py-[1px] text-[10px] font-semibold text-white shadow" style={{ background: "rgba(11,13,17,.82)" }}>{m.name}</span>
                  </span>
                )}
              </button>
            </div>
          ))}

          {pin && (
            <span className="absolute" style={{ left: `${pin.x}%`, top: `${pin.y}%` }}>
              <span className="block h-[18px] w-[18px] rounded-full border-[3px] border-white shadow" style={{ background: "var(--accent)", transform: `translate(-50%, -50%) scale(${inv})`, transformOrigin: "center" }} />
            </span>
          )}
        </div>
      )}

      {/* Contrôles zoom */}
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <Ctrl onClick={() => zoomBtn(1)}><Plus className="h-4 w-4" /></Ctrl>
        <Ctrl onClick={() => zoomBtn(-1)}><Minus className="h-4 w-4" /></Ctrl>
        <Ctrl onClick={reset}><Maximize className="h-[15px] w-[15px]" /></Ctrl>
      </div>
    </div>
  );
}

function Ctrl({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseDown={(e) => e.stopPropagation()}
      className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface/90 text-muted shadow hover:border-border-strong hover:text-text"
    >
      {children}
    </button>
  );
}
