import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { Pentagon, PenTool, Spline, MapPin, Type as TypeIcon, CircleDashed, Pencil, Trash2, Eraser } from "lucide-react";
import { useDialogs } from "@/components/detective/dialogs";

// Carte tactique Leaflet (moteur Geoman), barre d'outils maison en français.
// Modèle de formes en % (0-100), indépendant des tuiles → sérialisable et
// partageable. Réutilisable en édition (plans perso) ou en lecture seule.
// Tuiles GTA auto-hébergées (public/tiles/gta), zoom 0-6. Nommage plat {z}_{x}_{y}.
const TILE = (style: "atlas" | "satellite") => `/tiles/gta/${style}/{z}_{x}_{y}.jpg`;
const NATIVE_MAX = 6;
const WORLD = 256 * 2 ** NATIVE_MAX;

export type Shape =
  | { t: "poly"; pts: [number, number][]; color: string }
  | { t: "line"; pts: [number, number][]; color: string }
  | { t: "circle"; c: [number, number]; r: number; color: string }
  | { t: "marker"; p: [number, number]; color: string; text?: string }
  | { t: "text"; p: [number, number]; color: string; text: string };

export interface TacticalMapHandle {
  getShapes: () => Shape[];
}

type Tool = "poly" | "free" | "circle" | "route" | "marker" | "text" | "edit" | "remove" | null;
type Meta = { t: Shape["t"]; color: string; text?: string };
type LayerWithMeta = L.Layer & { _meta?: Meta };

function pinIcon(color: string) {
  return L.divIcon({
    className: "gta-pin",
    html: `<div style="transform:translateY(-2px)"><div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.55)"></div></div>`,
    iconSize: [26, 32], iconAnchor: [13, 28],
  });
}
function textIcon(color: string, text: string) {
  const safe = text.replace(/</g, "&lt;");
  return L.divIcon({
    className: "gta-textlabel",
    html: `<div style="color:${color};font-weight:700;font-size:13px;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,.9),0 0 2px rgba(0,0,0,.8)">${safe}</div>`,
    iconSize: [1, 1], iconAnchor: [0, 0],
  });
}

export const TacticalMap = forwardRef<TacticalMapHandle, {
  style?: "atlas" | "satellite";
  height?: number;
  initialShapes?: Shape[];
  readOnly?: boolean;
}>(function TacticalMap({ style = "atlas", height = 620, initialShapes, readOnly = false }, ref) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  const drawn = useRef<LayerWithMeta[]>([]);
  const colorRef = useRef("#e23b3b");
  const placeText = useRef(false);
  const freehand = useRef<{ on: boolean; pts: L.LatLng[]; temp: L.Polyline | null }>({ on: false, pts: [], temp: null });

  const [color, setColor] = useState("#e23b3b");
  const [tool, setTool] = useState<Tool>(null);

  // Dialogue de saisie in-app (jamais de prompt() natif). Réf pour l'utiliser
  // dans les écouteurs Leaflet enregistrés une seule fois.
  const { prompt: askDialog } = useDialogs();
  const promptRef = useRef(askDialog);
  useEffect(() => { promptRef.current = askDialog; }, [askDialog]);
  useEffect(() => { colorRef.current = color; }, [color]);

  // --- Conversions % <-> latlng (via les bornes des tuiles) ---
  function toLatLng(x: number, y: number): L.LatLng {
    const b = boundsRef.current!;
    return L.latLng(b.getNorth() + (y / 100) * (b.getSouth() - b.getNorth()), b.getWest() + (x / 100) * (b.getEast() - b.getWest()));
  }
  function toPct(ll: L.LatLng): [number, number] {
    const b = boundsRef.current!;
    const x = ((ll.lng - b.getWest()) / (b.getEast() - b.getWest())) * 100;
    const y = ((ll.lat - b.getNorth()) / (b.getSouth() - b.getNorth())) * 100;
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
  }
  function widthUnits() { const b = boundsRef.current!; return b.getEast() - b.getWest(); }

  function styleShape(map: L.Map) {
    const c = colorRef.current;
    (map as unknown as { pm: { setGlobalOptions: (o: unknown) => void } }).pm.setGlobalOptions({
      templineStyle: { color: c }, hintlineStyle: { color: c, dashArray: "5 5" },
      pathOptions: { color: c, fillColor: c, fillOpacity: 0.18, weight: 2 },
    });
  }

  function addArrows(map: L.Map, line: L.Polyline, c: string) {
    const lls = line.getLatLngs() as L.LatLng[];
    for (let i = 0; i < lls.length - 1; i++) {
      const a = map.latLngToLayerPoint(lls[i]); const b = map.latLngToLayerPoint(lls[i + 1]);
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      const mid = L.latLng((lls[i].lat + lls[i + 1].lat) / 2, (lls[i].lng + lls[i + 1].lng) / 2);
      L.marker(mid, { interactive: false, pmIgnore: true, icon: L.divIcon({ className: "", html: `<div style="transform:rotate(${ang}deg);color:${c};font-size:16px;font-weight:900;text-shadow:0 0 2px #000">➤</div>`, iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(map);
    }
  }

  // Recrée les couches à partir du modèle % (chargement d'un plan).
  function loadShapes(map: L.Map, shapes: Shape[]) {
    for (const s of shapes) {
      let layer: LayerWithMeta | null = null;
      if (s.t === "poly") layer = L.polygon(s.pts.map(([x, y]) => toLatLng(x, y)), { color: s.color, fillColor: s.color, fillOpacity: 0.18, weight: 2 });
      else if (s.t === "line") { const pl = L.polyline(s.pts.map(([x, y]) => toLatLng(x, y)), { color: s.color, weight: 3 }); layer = pl; }
      else if (s.t === "circle") layer = L.circle(toLatLng(s.c[0], s.c[1]), { radius: (s.r / 100) * widthUnits(), color: s.color, fillColor: s.color, fillOpacity: 0.15, weight: 2 });
      else if (s.t === "marker") { const m = L.marker(toLatLng(s.p[0], s.p[1]), { icon: pinIcon(s.color) }); if (s.text) m.bindTooltip(s.text, { permanent: true, direction: "top", className: "gta-tt" }); layer = m; }
      else if (s.t === "text") layer = L.marker(toLatLng(s.p[0], s.p[1]), { icon: textIcon(s.color, s.text) });
      if (!layer) continue;
      layer._meta = { t: s.t, color: s.color, text: "text" in s ? s.text : ("marker" === s.t ? s.text : undefined) };
      layer.addTo(map);
      if (s.t === "line") addArrows(map, layer as L.Polyline, s.color);
      if (readOnly && (layer as L.Layer & { pm?: { setOptions?: (o: unknown) => void } }).pm) (layer as unknown as { pmIgnore: boolean }).pmIgnore = true;
      drawn.current.push(layer);
    }
  }

  useImperativeHandle(ref, () => ({
    getShapes: () => serialize(),
  }));

  function serialize(): Shape[] {
    const out: Shape[] = [];
    for (const layer of drawn.current) {
      const m = layer._meta; if (!m) continue;
      if (m.t === "poly") {
        const lls = ((layer as L.Polygon).getLatLngs()[0] as L.LatLng[]) ?? [];
        out.push({ t: "poly", color: m.color, pts: lls.map((ll) => toPct(ll)) });
      } else if (m.t === "line") {
        const lls = (layer as L.Polyline).getLatLngs() as L.LatLng[];
        out.push({ t: "line", color: m.color, pts: lls.map((ll) => toPct(ll)) });
      } else if (m.t === "circle") {
        const c = layer as L.Circle;
        out.push({ t: "circle", color: m.color, c: toPct(c.getLatLng()), r: (c.getRadius() / widthUnits()) * 100 });
      } else if (m.t === "marker") {
        out.push({ t: "marker", color: m.color, p: toPct((layer as L.Marker).getLatLng()), text: m.text });
      } else if (m.t === "text") {
        out.push({ t: "text", color: m.color, text: m.text ?? "", p: toPct((layer as L.Marker).getLatLng()) });
      }
    }
    return out;
  }

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { crs: L.CRS.Simple, minZoom: 0, maxZoom: NATIVE_MAX, attributionControl: false });
    mapRef.current = map;
    const bounds = L.latLngBounds(map.unproject([0, WORLD], NATIVE_MAX), map.unproject([WORLD, 0], NATIVE_MAX));
    boundsRef.current = bounds;
    tileRef.current = L.tileLayer(TILE(style), { minZoom: 0, maxZoom: NATIVE_MAX, noWrap: true, bounds, tileSize: 256 }).addTo(map);
    map.setMaxBounds(bounds);
    map.fitBounds(bounds);
    (map as unknown as { pm: { setLang: (l: string) => void } }).pm.setLang("fr");

    if (initialShapes?.length) loadShapes(map, initialShapes);

    if (!readOnly) {
      styleShape(map);
      map.on("pm:create", (e: { shape: string; layer: LayerWithMeta }) => {
        const c = colorRef.current;
        (map as unknown as { pm: { disableDraw: () => void } }).pm.disableDraw(); // une forme par clic d'outil
        if (e.shape !== "Marker" && "setStyle" in e.layer) (e.layer as L.Path).setStyle({ color: c, fillColor: c, fillOpacity: 0.18, weight: 2 });
        if (e.shape === "Line") addArrows(map, e.layer as L.Polyline, c);
        e.layer._meta = { t: e.shape === "Marker" ? "marker" : e.shape === "Line" ? "line" : e.shape === "Circle" ? "circle" : "poly", color: c };
        drawn.current.push(e.layer);
        setTool(null);
        if (e.shape === "Marker") {
          (e.layer as L.Marker).setIcon(pinIcon(c));
          void promptRef.current({ title: "Marqueur", label: "Texte du marqueur (optionnel)", placeholder: "ex. PC, point d'entrée…" }).then((txt) => {
            const t = txt?.trim();
            if (t) { (e.layer as L.Marker).bindTooltip(t, { permanent: true, direction: "top", className: "gta-tt" }); e.layer._meta!.text = t; }
          });
        }
      });

      // Texte libre (clic simple) sans fond.
      map.on("click", (e: L.LeafletMouseEvent) => {
        if (!placeText.current) return;
        const latlng = e.latlng;
        placeText.current = false;
        map.getContainer().style.cursor = "";
        setTool(null);
        void promptRef.current({ title: "Texte", label: "Texte à placer", placeholder: "ex. Zone d'assaut" }).then((txt) => {
          const t = txt?.trim();
          if (!t) return;
          const c = colorRef.current;
          const m = L.marker(latlng, { icon: textIcon(c, t) }) as LayerWithMeta;
          m._meta = { t: "text", color: c, text: t };
          m.addTo(map); drawn.current.push(m);
        });
      });

      // Freehand secteur.
      map.on("mousedown", (e: L.LeafletMouseEvent) => { if (freehand.current.on) freehand.current.pts = [e.latlng]; });
      map.on("mousemove", (e: L.LeafletMouseEvent) => {
        const f = freehand.current; if (!f.on || f.pts.length === 0) return;
        f.pts.push(e.latlng);
        if (f.temp) f.temp.setLatLngs(f.pts);
        else f.temp = L.polyline(f.pts, { color: colorRef.current, weight: 2, dashArray: "4 3" }).addTo(map);
      });
      map.on("mouseup", () => {
        const f = freehand.current; if (!f.on) return;
        if (f.temp) { map.removeLayer(f.temp); f.temp = null; }
        if (f.pts.length >= 3) {
          const c = colorRef.current;
          const poly = L.polygon(f.pts, { color: c, fillColor: c, fillOpacity: 0.18, weight: 2 }) as LayerWithMeta;
          poly._meta = { t: "poly", color: c }; poly.addTo(map); drawn.current.push(poly);
        }
        f.pts = []; f.on = false; map.dragging.enable(); map.getContainer().style.cursor = ""; setTool(null);
      });
    }

    return () => { map.remove(); mapRef.current = null; drawn.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (tileRef.current) tileRef.current.setUrl(TILE(style)); }, [style]);

  function stopAll() {
    const map = mapRef.current!;
    const pm = (map as unknown as { pm: Record<string, () => void> }).pm;
    pm.disableDraw(); pm.disableGlobalEditMode(); pm.disableGlobalRemovalMode();
    placeText.current = false;
    freehand.current.on = false;
    if (freehand.current.temp) { map.removeLayer(freehand.current.temp); freehand.current.temp = null; }
    freehand.current.pts = []; map.dragging.enable(); map.getContainer().style.cursor = "";
  }

  function pick(t: Tool) {
    const map = mapRef.current; if (!map) return;
    if (tool === t) { stopAll(); setTool(null); return; }
    stopAll(); setTool(t); styleShape(map);
    const pm = (map as unknown as { pm: Record<string, (...a: unknown[]) => void> }).pm;
    if (t === "poly") pm.enableDraw("Polygon");
    else if (t === "circle") pm.enableDraw("Circle");
    else if (t === "route") pm.enableDraw("Line");
    else if (t === "marker") pm.enableDraw("Marker", { markerStyle: { icon: pinIcon(colorRef.current) } });
    else if (t === "text") { placeText.current = true; map.getContainer().style.cursor = "text"; }
    else if (t === "edit") pm.enableGlobalEditMode();
    else if (t === "remove") pm.enableGlobalRemovalMode();
    else if (t === "free") { freehand.current.on = true; map.dragging.disable(); map.getContainer().style.cursor = "crosshair"; }
  }

  function clearAll() {
    const map = mapRef.current; if (!map) return;
    drawn.current.forEach((l) => map.removeLayer(l)); drawn.current = [];
  }

  return (
    <div>
      <style>{`.gta-tt{background:rgba(11,13,17,.82)!important;border:none!important;color:#fff!important;font-weight:600;font-size:11px}.gta-tt::before{display:none}.leaflet-pm-toolbar{display:none!important}`}</style>

      {!readOnly && (
        <div className="mb-[10px] flex flex-wrap items-center gap-[6px] rounded-card border border-border bg-surface p-[7px]">
          <Btn active={tool === "poly"} onClick={() => pick("poly")} icon={<Pentagon className="h-[15px] w-[15px]" />} label="Secteur (points)" />
          <Btn active={tool === "free"} onClick={() => pick("free")} icon={<PenTool className="h-[15px] w-[15px]" />} label="Secteur (libre)" />
          <Btn active={tool === "circle"} onClick={() => pick("circle")} icon={<CircleDashed className="h-[15px] w-[15px]" />} label="Périmètre" />
          <Btn active={tool === "route"} onClick={() => pick("route")} icon={<Spline className="h-[15px] w-[15px]" />} label="Itinéraire / convoi" />
          <Btn active={tool === "marker"} onClick={() => pick("marker")} icon={<MapPin className="h-[15px] w-[15px]" />} label="Marqueur" />
          <Btn active={tool === "text"} onClick={() => pick("text")} icon={<TypeIcon className="h-[15px] w-[15px]" />} label="Texte" />
          <div className="mx-[2px] h-[22px] w-px bg-border" />
          <Btn active={tool === "edit"} onClick={() => pick("edit")} icon={<Pencil className="h-[15px] w-[15px]" />} label="Éditer" />
          <Btn active={tool === "remove"} onClick={() => pick("remove")} icon={<Trash2 className="h-[15px] w-[15px]" />} label="Supprimer" />
          <button onClick={clearAll} className="flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-[10px] py-[7px] text-[12px] font-semibold text-muted hover:border-danger hover:text-danger">
            <Eraser className="h-[15px] w-[15px]" /> Effacer tout
          </button>
          <label className="ml-auto flex items-center gap-[7px] text-[12px] font-semibold text-muted">
            Couleur
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-[26px] w-[34px] cursor-pointer rounded-sm border border-border bg-surface-2 p-0" />
          </label>
        </div>
      )}

      <div ref={elRef} className="w-full rounded-sm border border-border" style={{ height, background: "#0b0d11" }} />
    </div>
  );
});

function Btn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-[6px] rounded-sm border px-[10px] py-[7px] text-[12px] font-semibold" style={active ? { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" } : { background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--muted)" }}>
      {icon} {label}
    </button>
  );
}
