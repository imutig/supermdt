import { useState, type ReactNode } from "react";
import { Search } from "lucide-react";

// Constantes + petits composants partagés du Detective Bureau.

export const CASE_STATUS: Record<string, { label: string; color: string }> = {
  OPEN: { label: "Ouverte", color: "#3b82f6" },
  IN_PROGRESS: { label: "En cours", color: "#e0a030" },
  SUSPENDED: { label: "Suspendue", color: "#8a929c" },
  COLD: { label: "Cold case", color: "#64748b" },
  SOLVED: { label: "Résolue", color: "#49a24a" },
  CLOSED: { label: "Clôturée", color: "#8a929c" },
};

export const PRIORITY: Record<string, { label: string; color: string }> = {
  LOW: { label: "Basse", color: "#8a929c" },
  MEDIUM: { label: "Moyenne", color: "#3b82f6" },
  HIGH: { label: "Haute", color: "#e0a030" },
  CRITICAL: { label: "Critique", color: "#d94040" },
};

export const SUBDIV: Record<string, string> = { GND: "GND", HRD: "HRD" };
export const SUBDIV_LABEL: Record<string, string> = {
  GND: "Gang & Narcotics", HRD: "Homicide-Robbery",
};

export const ITEM_TYPE: Record<string, string> = {
  REPORT: "Rapport d'enquête", INTERROGATION: "Interrogatoire", AUDITION: "Audition",
  PHOTO: "Photo", LOCATION: "Lieu", NOTE: "Note",
};

export const PERSON_ROLE: Record<string, { label: string; color: string }> = {
  SUSPECT: { label: "Suspect", color: "#d94040" },
  VICTIM: { label: "Victime", color: "#8b5cf6" },
  WITNESS: { label: "Témoin", color: "#3b82f6" },
  GANG_MEMBER: { label: "Membre de gang", color: "#e0a030" },
  POI: { label: "Personne d'intérêt", color: "#8a929c" },
};

export const CASE_ROLE: Record<string, { label: string; color: string }> = {
  SUSPECT: { label: "Suspect", color: "#d94040" },
  VICTIM: { label: "Victime", color: "#8b5cf6" },
  WITNESS: { label: "Témoin", color: "#3b82f6" },
  POI: { label: "Personne d'intérêt", color: "#8a929c" },
};

export const ORG_TYPE: Record<string, string> = {
  GANG: "Gang", MC: "MC", ORGANISATION: "Organisation", PF: "Petite frappe", AUTRE: "Autre",
};

export const EVIDENCE_TYPE: Record<string, string> = {
  PHYSIQUE: "Physique", NUMERIQUE: "Numérique", TEMOIGNAGE: "Témoignage", AUTRE: "Autre",
};

export const DRUG_KIND: Record<string, string> = { POINT_VENTE: "Point de vente", LABO: "Labo" };

export function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-[5px] rounded-full px-[9px] py-[2px] text-[11px] font-semibold"
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
      <span className="h-[6px] w-[6px] rounded-full" style={{ background: color }} /> {label}
    </span>
  );
}

export function Card({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-card border border-border bg-surface p-[16px] ${className}`}>
      {(title || action) && (
        <div className="mb-[10px] flex items-center justify-between gap-2">
          {title && <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">{title}</div>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <div className="mb-[5px] text-[11.5px] font-semibold text-muted">{label}</div>
      {children}
      {hint && <div className="mt-[4px] text-[11px] text-faint">{hint}</div>}
    </label>
  );
}

export const inputCls = "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";
export const selectCls = inputCls;
// Select compact pour les barres de filtre (largeur au contenu, ne s'étire pas).
export const filterSelectCls = "h-10 rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";

// Combobox présentationnel : le parent gère la requête + fournit les résultats.
export type ComboItem = { id: string; label: string; sub?: string };
export function Combobox({
  query, onQuery, items, onPick, placeholder, autoFocus,
}: {
  query: string;
  onQuery: (v: string) => void;
  items: ComboItem[];
  onPick: (item: ComboItem) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <input
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => { onQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={`${inputCls} pl-9`}
      />
      {open && query.trim() && (
        <div className="absolute z-20 mt-1 max-h-[260px] w-full overflow-y-auto rounded-sm border border-border-strong bg-elev shadow-[0_14px_36px_rgba(0,0,0,.3)]">
          {items.length === 0 && <div className="px-3 py-2 text-[12.5px] text-faint">Aucun résultat.</div>}
          {items.map((it) => (
            <button key={it.id} type="button" onMouseDown={(e) => { e.preventDefault(); onPick(it); setOpen(false); }}
              className="flex w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-surface-2">
              <span className="flex-1 truncate text-[13px] font-medium">{it.label}</span>
              {it.sub && <span className="flex-shrink-0 text-[11px] text-faint">{it.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const dtLong = (ts: number) => new Date(ts).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const dtShort = (ts: number) => new Date(ts).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
export const dateOnly = (ts: number) => new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
