import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

// Carte réutilisable — désormais rendue avec Leaflet sur les tuiles GTA (zoom
// profond et net). Même API qu'avant : coordonnées en % (0-100), marqueurs
// LIEU/SECTEUR, pastille (pin), tracé en cours (draft), clic -> onPick(x,y).
const TILE = "/tiles/gta/atlas/{z}_{x}_{y}.jpg"; // tuiles auto-hébergées (public/tiles/gta), zoom 0-7
const NATIVE_MAX = 7;
const WORLD = 256 * 2 ** NATIVE_MAX;

export function LosSantosMap({
  markers = [],
  pin,
  draft = null,
  draftColor = "#49A24A",
  onPick,
  onMarkerClick,
  height = 460,
}: {
  imageUrl?: string | null; // conservé pour compat (ignoré : on utilise les tuiles GTA)
  markers?: MapMarker[];
  pin?: { x: number; y: number } | null;
  draft?: Pt[] | null;
  draftColor?: string;
  onPick?: (x: number, y: number) => void;
  onMarkerClick?: (m: MapMarker) => void;
  height?: number;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  const overlay = useRef<L.LayerGroup | null>(null);
  // Handlers frais dans les écouteurs sans recréer la carte.
  const pickRef = useRef(onPick);
  const clickRef = useRef(onMarkerClick);
  useEffect(() => { pickRef.current = onPick; clickRef.current = onMarkerClick; }, [onPick, onMarkerClick]);

  function toLatLng(x: number, y: number): L.LatLng {
    const b = boundsRef.current!;
    return L.latLng(b.getNorth() + (y / 100) * (b.getSouth() - b.getNorth()), b.getWest() + (x / 100) * (b.getEast() - b.getWest()));
  }
  function toPct(ll: L.LatLng): [number, number] {
    const b = boundsRef.current!;
    const x = ((ll.lng - b.getWest()) / (b.getEast() - b.getWest())) * 100;
    const y = ((ll.lat - b.getNorth()) / (b.getSouth() - b.getNorth())) * 100;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  }

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { crs: L.CRS.Simple, minZoom: 0, maxZoom: NATIVE_MAX, attributionControl: false });
    mapRef.current = map;
    const bounds = L.latLngBounds(map.unproject([0, WORLD], NATIVE_MAX), map.unproject([WORLD, 0], NATIVE_MAX));
    boundsRef.current = bounds;
    L.tileLayer(TILE, { minZoom: 0, maxZoom: NATIVE_MAX, noWrap: true, bounds, tileSize: 256 }).addTo(map);
    map.setMaxBounds(bounds);
    map.fitBounds(bounds);
    overlay.current = L.layerGroup().addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => { const p = pickRef.current; if (p) { const [x, y] = toPct(e.latlng); p(x, y); } });
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)construit les couches à chaque changement de données.
  useEffect(() => {
    const g = overlay.current;
    if (!g || !boundsRef.current) return;
    g.clearLayers();

    for (const m of markers) {
      const col = m.color ?? "#49A24A";
      if (m.kind === "SECTEUR" && m.points && m.points.length >= 3) {
        const poly = L.polygon(m.points.map((p) => toLatLng(p.x, p.y)), { color: col, fillColor: col, fillOpacity: 0.18, weight: 2 });
        poly.on("click", (e) => { L.DomEvent.stop(e); clickRef.current?.(m); });
        poly.bindTooltip(m.name, { permanent: true, direction: "center", className: "ls-sector" });
        g.addLayer(poly);
      } else {
        const mk = L.marker(toLatLng(m.x, m.y), { icon: dotIcon(col) });
        mk.on("click", (e) => { L.DomEvent.stop(e as unknown as Event); clickRef.current?.(m); });
        mk.bindTooltip(m.name, { permanent: true, direction: "top", className: "ls-label" });
        g.addLayer(mk);
      }
    }

    if (draft && draft.length > 0) {
      const lls = draft.map((p) => toLatLng(p.x, p.y));
      const line = draft.length >= 3
        ? L.polygon(lls, { color: draftColor, fillColor: draftColor, fillOpacity: 0.18, weight: 2, dashArray: "4 3" })
        : L.polyline(lls, { color: draftColor, weight: 2, dashArray: "4 3" });
      g.addLayer(line);
      draft.forEach((p, i) => g.addLayer(L.circleMarker(toLatLng(p.x, p.y), { radius: 4, color: draftColor, fillColor: i === 0 ? draftColor : "#fff", fillOpacity: 1, weight: 2 })));
    }

    if (pin) g.addLayer(L.circleMarker(toLatLng(pin.x, pin.y), { radius: 7, color: "#fff", weight: 3, fillColor: "var(--accent)", fillOpacity: 1 }));
  }, [markers, draft, draftColor, pin]);

  return (
    <>
      <style>{`.ls-label,.ls-sector{background:rgba(11,13,17,.82)!important;border:none!important;color:#fff!important;font-weight:600;font-size:11px;box-shadow:none!important}.ls-label::before,.ls-sector::before{display:none}.ls-sector{text-transform:uppercase;letter-spacing:.04em}`}</style>
      <div ref={elRef} className="w-full rounded-sm border border-border" style={{ height, background: "#0b0d11", cursor: onPick ? "crosshair" : "grab" }} />
    </>
  );
}

function dotIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.6)"></div>`,
    iconSize: [14, 14], iconAnchor: [7, 7],
  });
}
