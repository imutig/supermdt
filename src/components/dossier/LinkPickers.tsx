import { useState } from "react";
import { X } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/lib/api";

// Sélecteurs « recherche au fil de la frappe » pour les liens d'un dossier /
// rapport d'arrestation (item 6) : rapport lié (mono), véhicules & armes (multi).
// Remplacent les anciens menus déroulants. Calqués sur le champ citoyen (Saisies).

const F = "h-9 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] text-text outline-none focus:border-accent";
const DROP =
  "absolute z-30 mt-1 max-h-[190px] w-full overflow-y-auto rounded-sm border border-border bg-surface shadow-[0_10px_30px_rgba(0,0,0,.3)]";

// ---- Rapport lié (sélection unique) ----
export function ReportSearchPicker({
  value,
  onChange,
  initialLabel,
}: {
  value: string;
  onChange: (id: string) => void;
  initialLabel?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(initialLabel ?? "");
  const results = useQuery(api.reports.search, open && q.trim() ? { q } : "skip");

  if (value) {
    return (
      <div className="flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-3 py-[7px]">
        <span className="flex-1 truncate text-[13px] font-semibold">{label || "Rapport lié"}</span>
        <button onClick={() => { onChange(""); setLabel(""); setQ(""); }} className="text-faint hover:text-danger">
          <X className="h-[14px] w-[14px]" />
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Rechercher un rapport…"
        className={F}
      />
      {open && results && results.length > 0 && (
        <div className={DROP}>
          {results.map((r) => (
            <button
              key={r._id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(r._id); setLabel(r.title); setOpen(false); }}
              className="flex w-full items-center gap-2 border-b border-border px-3 py-[7px] text-left hover:bg-surface-2"
            >
              <span className="flex-1 truncate text-[13px] font-semibold">{r.title}</span>
              {r.typeName && <span className="text-[11px] text-faint">{r.typeName}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Véhicules impliqués (sélection multiple) ----
export function VehicleSearchPicker({
  selected,
  onChange,
  initialLabels,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  initialLabels?: Record<string, string>;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<Record<string, string>>(initialLabels ?? {});
  const results = useQuery(api.vehicles.search, open && q.trim() ? { q } : "skip");
  const labelOf = (id: string) => labels[id] ?? id;

  return (
    <div>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-[6px]">
          {selected.map((id) => (
            <span key={id} className="flex items-center gap-[6px] rounded-[6px] border border-border bg-surface-2 px-[9px] py-[4px] text-[11.5px] font-semibold">
              {labelOf(id)}
              <button onClick={() => onChange(selected.filter((x) => x !== id))} className="text-faint hover:text-danger">
                <X className="h-[13px] w-[13px]" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Rechercher un véhicule (plaque, modèle)…"
          className={F}
        />
        {open && results && results.length > 0 && (
          <div className={DROP}>
            {results.filter((v) => !selected.includes(v._id)).map((v) => {
              const lbl = `${v.plaque} · ${v.modele ?? ""}`.trim();
              return (
                <button
                  key={v._id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setLabels((m) => ({ ...m, [v._id]: lbl })); onChange([...selected, v._id]); setQ(""); }}
                  className="flex w-full items-center gap-2 border-b border-border px-3 py-[7px] text-left hover:bg-surface-2"
                >
                  <span className="flex-1 truncate text-[13px] font-semibold">{v.plaque}</span>
                  <span className="text-[11px] text-faint">{v.modele}{v.ownerName ? ` · ${v.ownerName}` : ""}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Armes utilisées (sélection multiple) ----
export function WeaponSearchPicker({
  selected,
  onChange,
  initialLabels,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  initialLabels?: Record<string, string>;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<Record<string, string>>(initialLabels ?? {});
  const results = useQuery(api.weapons.list, open && q.trim() ? { q } : "skip");
  const labelOf = (id: string) => labels[id] ?? id;

  return (
    <div>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-[6px]">
          {selected.map((id) => (
            <span key={id} className="flex items-center gap-[6px] rounded-[6px] border border-border bg-surface-2 px-[9px] py-[4px] text-[11.5px] font-semibold">
              {labelOf(id)}
              <button onClick={() => onChange(selected.filter((x) => x !== id))} className="text-faint hover:text-danger">
                <X className="h-[13px] w-[13px]" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Rechercher une arme (modèle, série)…"
          className={F}
        />
        {open && results && results.length > 0 && (
          <div className={DROP}>
            {results.filter((w) => !selected.includes(w._id)).map((w) => {
              const lbl = `${w.typeName ?? ""} ${w.modele} · ${w.serial}`.trim();
              return (
                <button
                  key={w._id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setLabels((m) => ({ ...m, [w._id]: lbl })); onChange([...selected, w._id]); setQ(""); }}
                  className="flex w-full items-center gap-2 border-b border-border px-3 py-[7px] text-left hover:bg-surface-2"
                >
                  <span className="flex-1 truncate text-[13px] font-semibold">{w.modele}</span>
                  <span className="text-[11px] text-faint">{w.typeName} · {w.serial}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
