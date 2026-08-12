import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import {
  Pentagon, PenTool, Spline, MapPin, Type as TypeIcon, CircleDashed,
  Pencil, Trash2, Eraser,
} from "lucide-react";

// Carte tactique Leaflet (moteur Geoman) avec barre d'outils maison en français.
// Tuiles GTA publiques (jsDelivr). Pensée pour préparer des opérations de police :
// secteurs (au point ou à main levée), périmètres, itinéraires de convoi fléchés,
// marqueurs typés (PC, unité, objectif…), texte libre sans fond, couleur au choix.
const TILE = (style: "atlas" | "satellite") =>
  `https://cdn.jsdelivr.net/gh/meesvrh/GTAV-Map-Tiles/tiles/${style}/{z}/{x}/{y}.jpg`;
const NATIVE_MAX = 5;
const WORLD = 256 * 2 ** NATIVE_MAX;

// Marqueurs typés utiles en opération (glyphe + libellé).
const MARKERS: { key: string; glyph: string; label: string }[] = [
  { key: "pc", glyph: "🚩", label: "Poste de commandement" },
  { key: "unit", glyph: "🚓", label: "Unité / véhicule" },
  { key: "target", glyph: "🎯", label: "Objectif / suspect" },
  { key: "entry", glyph: "🚪", label: "Point d'entrée" },
  { key: "checkpoint", glyph: "🚧", label: "Checkpoint" },
  { key: "hostage", glyph: "🆘", label: "Otage / blessé" },
  { key: "watch", glyph: "🔭", label: "Observation" },
  { key: "point", glyph: "📍", label: "Point" },
];

type Tool = "poly" | "free" | "circle" | "route" | "marker" | "text" | "edit" | "remove" | null;

function pinIcon(color: string, glyph: string) {
  return L.divIcon({
    className: "gta-pin",
    html: `<div style="transform:translateY(-2px)"><div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);font-size:14px;line-height:1">${glyph}</span></div></div>`,
    iconSize: [28, 34],
    iconAnchor: [14, 30],
  });
}

export function TacticalMap({ style = "atlas", height = 640 }: { style?: "atlas" | "satellite"; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.TileLayer | null>(null);
  const drawn = useRef<L.Layer[]>([]);
  const colorRef = useRef("#e23b3b");
  const glyphRef = useRef(MARKERS[0]);
  const freehand = useRef<{ on: boolean; pts: L.LatLng[]; temp: L.Polyline | null }>({ on: false, pts: [], temp: null });

  const [color, setColor] = useState("#e23b3b");
  const [markerKey, setMarkerKey] = useState(MARKERS[0].key);
  const [tool, setTool] = useState<Tool>(null);

  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { glyphRef.current = MARKERS.find((m) => m.key === markerKey) ?? MARKERS[0]; }, [markerKey]);

  // Applique la couleur courante aux prochains tracés Geoman.
  function applyColor(map: L.Map) {
    const c = colorRef.current;
    map.pm.setGlobalOptions({
      templineStyle: { color: c },
      hintlineStyle: { color: c, dashArray: "5 5" },
      pathOptions: { color: c, fillColor: c, fillOpacity: 0.18, weight: 2 },
    });
  }

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { crs: L.CRS.Simple, minZoom: 0, maxZoom: 8, attributionControl: false });
    mapRef.current = map;
    const bounds = L.latLngBounds(map.unproject([0, WORLD], NATIVE_MAX), map.unproject([WORLD, 0], NATIVE_MAX));
    layerRef.current = L.tileLayer(TILE(style), { minZoom: 0, maxZoom: 8, maxNativeZoom: NATIVE_MAX, noWrap: true, bounds, tileSize: 256 }).addTo(map);
    map.setMaxBounds(bounds);
    map.fitBounds(bounds);
    map.pm.setLang("fr");
    applyColor(map);

    // Tout tracé créé : on l'enregistre, on le colore, et on nettoie le texte.
    map.on("pm:create", (e: { shape: string; layer: L.Layer }) => {
      drawn.current.push(e.layer);
      const c = colorRef.current;
      if (e.shape !== "Marker" && e.shape !== "Text" && "setStyle" in e.layer) {
        (e.layer as L.Path).setStyle({ color: c, fillColor: c, fillOpacity: 0.18, weight: 2 });
      }
      if (e.shape === "Line") addArrows(map, e.layer as L.Polyline, c);
      if (e.shape === "Text") styleText(e.layer, c);
      setTool(null);
    });

    // Freehand : capture souris → polygone à main levée.
    map.on("mousedown", (e: L.LeafletMouseEvent) => {
      if (!freehand.current.on) return;
      freehand.current.pts = [e.latlng];
    });
    map.on("mousemove", (e: L.LeafletMouseEvent) => {
      const f = freehand.current;
      if (!f.on || f.pts.length === 0) return;
      f.pts.push(e.latlng);
      if (f.temp) f.temp.setLatLngs(f.pts);
      else f.temp = L.polyline(f.pts, { color: colorRef.current, weight: 2, dashArray: "4 3" }).addTo(map);
    });
    map.on("mouseup", () => {
      const f = freehand.current;
      if (!f.on) return;
      if (f.temp) { map.removeLayer(f.temp); f.temp = null; }
      if (f.pts.length >= 3) {
        const c = colorRef.current;
        const poly = L.polygon(f.pts, { color: c, fillColor: c, fillOpacity: 0.18, weight: 2 }).addTo(map);
        drawn.current.push(poly);
      }
      f.pts = [];
      f.on = false;
      map.dragging.enable();
      map.getContainer().style.cursor = "";
      setTool(null);
    });

    return () => { map.remove(); mapRef.current = null; drawn.current = []; };
  }, []);

  useEffect(() => { if (layerRef.current) layerRef.current.setUrl(TILE(style)); }, [style]);

  // --- Actions de la barre d'outils ---
  function stopAll() {
    const map = mapRef.current!;
    map.pm.disableDraw();
    map.pm.disableGlobalEditMode();
    map.pm.disableGlobalRemovalMode();
    freehand.current.on = false;
    if (freehand.current.temp) { map.removeLayer(freehand.current.temp); freehand.current.temp = null; }
    freehand.current.pts = [];
    map.dragging.enable();
    map.getContainer().style.cursor = "";
  }

  function pick(t: Tool) {
    const map = mapRef.current;
    if (!map) return;
    if (tool === t) { stopAll(); setTool(null); return; }
    stopAll();
    setTool(t);
    applyColor(map);
    const pm = (map as unknown as { pm: Record<string, (...a: unknown[]) => void> }).pm;
    if (t === "poly") pm.enableDraw("Polygon");
    else if (t === "circle") pm.enableDraw("Circle");
    else if (t === "route") pm.enableDraw("Line");
    else if (t === "text") pm.enableDraw("Text");
    else if (t === "marker") pm.enableDraw("Marker", { markerStyle: { icon: pinIcon(colorRef.current, glyphRef.current.glyph) } });
    else if (t === "edit") pm.enableGlobalEditMode();
    else if (t === "remove") pm.enableGlobalRemovalMode();
    else if (t === "free") { freehand.current.on = true; map.dragging.disable(); map.getContainer().style.cursor = "crosshair"; }
  }

  function clearAll() {
    const map = mapRef.current;
    if (!map) return;
    drawn.current.forEach((l) => map.removeLayer(l));
    drawn.current = [];
  }

  return (
    <div>
      <style>{`
        .leaflet-container .pm-textarea, .leaflet-container textarea.pm-textarea { background: transparent !important; border: none !important; box-shadow: none !important; resize: none; outline: none; font-weight: 700; text-shadow: 0 1px 3px rgba(0,0,0,.9), 0 0 2px rgba(0,0,0,.7); }
        .leaflet-pm-toolbar { display: none !important; }
      `}</style>

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

        <div className="ml-auto flex items-center gap-[10px]">
          <label className="flex items-center gap-[7px] text-[12px] font-semibold text-muted">
            Couleur
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-[26px] w-[34px] cursor-pointer rounded-sm border border-border bg-surface-2 p-0" />
          </label>
          <select value={markerKey} onChange={(e) => setMarkerKey(e.target.value)} className="h-[30px] rounded-sm border border-border bg-surface-2 px-2 text-[12px] outline-none focus:border-accent" title="Type de marqueur">
            {MARKERS.map((m) => <option key={m.key} value={m.key}>{m.glyph} {m.label}</option>)}
          </select>
        </div>
      </div>

      <div ref={ref} className="w-full rounded-sm border border-border" style={{ height, background: "#0b0d11" }} />
      <div className="mt-[8px] text-[12px] text-faint">
        Astuce : choisis la couleur avant de dessiner. « Secteur (libre) » = clique-glisse pour tracer à main levée. « Marqueur » utilise le type sélectionné à droite.
      </div>
    </div>
  );
}

// Flèches de direction le long d'un itinéraire (préparation de convoi).
function addArrows(map: L.Map, line: L.Polyline, color: string) {
  const lls = line.getLatLngs() as L.LatLng[];
  for (let i = 0; i < lls.length - 1; i++) {
    const a = map.latLngToLayerPoint(lls[i]);
    const b = map.latLngToLayerPoint(lls[i + 1]);
    const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    const mid = L.latLng((lls[i].lat + lls[i + 1].lat) / 2, (lls[i].lng + lls[i + 1].lng) / 2);
    L.marker(mid, {
      interactive: false,
      icon: L.divIcon({ className: "", html: `<div style="transform:rotate(${ang}deg);color:${color};font-size:16px;font-weight:900;text-shadow:0 0 2px #000">➤</div>`, iconSize: [16, 16], iconAnchor: [8, 8] }),
    }).addTo(map);
  }
}

// Texte sans fond, à la couleur choisie.
function styleText(layer: L.Layer, color: string) {
  setTimeout(() => {
    const el = (layer as unknown as { getElement?: () => HTMLElement | undefined }).getElement?.();
    const ta = el?.querySelector("textarea");
    if (ta) { ta.style.color = color; ta.style.background = "transparent"; ta.style.border = "none"; }
  }, 0);
}

function Btn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-[6px] rounded-sm border px-[10px] py-[7px] text-[12px] font-semibold"
      style={active ? { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" } : { background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--muted)" }}
    >
      {icon} {label}
    </button>
  );
}
