import { useEffect, useState } from "react";
import { BookOpen, Star } from "lucide-react";
import { RES_CATS, ALL_PAGES } from "@/components/ressources/registry";

const FAV_KEY = "s13-res-favs";

// Ressources : pages hardcodées au design soigné (organisation, radio, procédures, gravités...).
// Les articles rédigés à la main relèvent des Protocoles.
export function Ressources() {
  const [id, setId] = useState(ALL_PAGES[0].id);
  const [favs, setFavs] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); }, [favs]);
  const toggleFav = (pid: string) => setFavs((f) => (f.includes(pid) ? f.filter((x) => x !== pid) : [...f, pid]));

  const page = ALL_PAGES.find((p) => p.id === id) ?? ALL_PAGES[0];
  const Page = page.Component;
  const favPages = favs.map((pid) => ALL_PAGES.find((p) => p.id === pid)).filter(Boolean) as typeof ALL_PAGES;

  const Row = ({ pid, label }: { pid: string; label: string }) => {
    const active = pid === id;
    const fav = favs.includes(pid);
    return (
      <div className="group flex items-center gap-1 rounded-sm pr-1 hover:bg-surface-2" style={active ? { background: "var(--accent-soft)" } : undefined}>
        <button
          onClick={() => setId(pid)}
          className="mdt-press flex flex-1 items-center gap-2 px-2 py-[7px] text-left text-[12.5px]"
          style={active ? { color: "var(--accent)", fontWeight: 600 } : { color: "var(--muted)" }}
        >
          <span className="h-[6px] w-[6px] flex-shrink-0 rounded-full" style={{ background: active ? "var(--accent)" : "var(--border-strong)" }} />
          {label}
        </button>
        <button onClick={() => toggleFav(pid)} title={fav ? "Retirer des favoris" : "Mettre en favori"} className={`flex h-[24px] w-[24px] items-center justify-center rounded-sm ${fav ? "" : "opacity-0 group-hover:opacity-100"}`}>
          <Star className="h-[14px] w-[14px]" style={{ color: fav ? "#eab308" : "var(--faint)" }} fill={fav ? "#eab308" : "none"} />
        </button>
      </div>
    );
  };

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="grid grid-cols-[248px_1fr] items-start gap-[20px]">
        {/* Sommaire */}
        <div className="sticky top-[14px] flex flex-col gap-[14px] rounded-card border border-border bg-surface p-[10px]">
          <div className="flex items-center gap-[8px] px-2 pt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-accent">
            <BookOpen className="h-[15px] w-[15px]" /> Ressources
          </div>

          {favPages.length > 0 && (
            <div>
              <div className="flex items-center gap-[6px] px-2 pb-[5px] text-[9.5px] font-bold uppercase tracking-[0.1em] text-faint">
                <Star className="h-[11px] w-[11px]" style={{ color: "#eab308" }} fill="#eab308" /> Favoris
              </div>
              <div className="flex flex-col">{favPages.map((p) => <Row key={"f-" + p.id} pid={p.id} label={p.label} />)}</div>
            </div>
          )}

          {RES_CATS.map((cat) => (
            <div key={cat.label}>
              <div className="px-2 pb-[5px] text-[9.5px] font-bold uppercase tracking-[0.1em] text-faint">{cat.label}</div>
              <div className="flex flex-col">{cat.pages.map((p) => <Row key={p.id} pid={p.id} label={p.label} />)}</div>
            </div>
          ))}
        </div>

        {/* Contenu */}
        <div key={id} className="min-w-0 mdt-page">
          <Page />
        </div>
      </div>
    </div>
  );
}
