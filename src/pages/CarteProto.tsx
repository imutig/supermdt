import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LosSantosMap } from "@/components/carte/LosSantosMap";

// Prototype comparatif de moteurs de carte (voir la discussion « carte type GTA »).
// Trois onglets : Leaflet (tuiles raster + dessin Geoman), MapLibre (WebGL, zoom
// fluide) et l'image actuelle. Tuiles publiques via jsDelivr (dépôt communautaire).
const TILE = (style: "atlas" | "satellite") =>
  `https://cdn.jsdelivr.net/gh/meesvrh/GTAV-Map-Tiles/tiles/${style}/{z}/{x}/{y}.jpg`;
const NATIVE_MAX = 5; // niveaux de tuiles disponibles (0..5)
const WORLD = 256 * 2 ** NATIVE_MAX; // 8192 px au zoom natif max

type Tab = "leaflet" | "maplibre" | "image";

export function CarteProto() {
  const [tab, setTab] = useState<Tab>("leaflet");
  const [style, setStyle] = useState<"atlas" | "satellite">("atlas");

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[14px]">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Carte - prototype</h1>
        <div className="mt-[3px] text-[13px] text-muted">
          Comparaison de trois moteurs sur la carte GTA (tuiles publiques). Zoome à fond pour juger la netteté ; sur Leaflet, la barre d'outils à gauche permet de dessiner.
        </div>
      </div>

      <div className="mb-[14px] flex flex-wrap items-center gap-2">
        <div className="flex gap-[2px] rounded-card border border-border bg-surface p-[5px]">
          {([["leaflet", "Leaflet (tuiles + dessin)"], ["maplibre", "MapLibre (fluide)"], ["image", "Image (actuel)"]] as [Tab, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className="rounded-[7px] px-[13px] py-[7px] text-[12.5px] font-semibold hover:bg-surface-2"
              style={tab === k ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}
            >
              {label}
            </button>
          ))}
        </div>
        {tab !== "image" && (
          <div className="flex gap-[2px] rounded-card border border-border bg-surface p-[5px]">
            {(["atlas", "satellite"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStyle(s)}
                className="rounded-[7px] px-[12px] py-[7px] text-[12px] font-semibold capitalize hover:bg-surface-2"
                style={style === s ? { background: "var(--surface-2)", color: "var(--text)" } : { color: "var(--muted)" }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "leaflet" && <LeafletMap style={style} />}
      {tab === "maplibre" && <MapLibreMap style={style} />}
      {tab === "image" && (
        <div>
          <LosSantosMap height={620} />
          <div className="mt-[8px] text-[12px] text-faint">Système actuel : une seule image agrandie en CSS (pixelise à fort zoom).</div>
        </div>
      )}
    </div>
  );
}

// --- Leaflet : pyramide de tuiles (CRS.Simple) + dessin Geoman ---
function LeafletMap({ style }: { style: "atlas" | "satellite" }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { crs: L.CRS.Simple, minZoom: 0, maxZoom: 8, attributionControl: false, zoomControl: true });
    mapRef.current = map;
    const bounds = L.latLngBounds(map.unproject([0, WORLD], NATIVE_MAX), map.unproject([WORLD, 0], NATIVE_MAX));
    layerRef.current = L.tileLayer(TILE(style), {
      minZoom: 0, maxZoom: 8, maxNativeZoom: NATIVE_MAX, noWrap: true, bounds, tileSize: 256,
    }).addTo(map);
    map.setMaxBounds(bounds);
    map.fitBounds(bounds);
    // Outils de dessin : polygones (zones), lignes (itinéraires), marqueurs, texte.
    map.pm.addControls({ position: "topleft", drawCircleMarker: false, rotateMode: false });
    map.pm.setGlobalOptions({ layerGroup: undefined });
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Changement de fond sans recréer la carte.
  useEffect(() => {
    if (layerRef.current) layerRef.current.setUrl(TILE(style));
  }, [style]);

  return <div ref={ref} className="w-full rounded-sm border border-border" style={{ height: 620, background: "#0b0d11" }} />;
}

// --- MapLibre GL : mêmes tuiles raster, rendu WebGL (zoom continu fluide) ---
function MapLibreMap({ style }: { style: "atlas" | "satellite" }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: {
        version: 8,
        sources: { gta: { type: "raster", tiles: [TILE(style)], tileSize: 256, minzoom: 0, maxzoom: NATIVE_MAX } },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#0b0d11" } },
          { id: "gta", type: "raster", source: "gta" },
        ],
      },
      center: [0, 0], zoom: 1, minZoom: 0, maxZoom: 8, renderWorldCopies: false, attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("gta") as maplibregl.RasterTileSource | undefined;
    if (src && "setTiles" in src) (src as unknown as { setTiles: (t: string[]) => void }).setTiles([TILE(style)]);
  }, [style]);

  return <div ref={ref} className="w-full overflow-hidden rounded-sm border border-border" style={{ height: 620, background: "#0b0d11" }} />;
}
