import { useState } from "react";
import { Shield, Siren, ClipboardList, Target, Pause, Radio, Car, Search, type LucideIcon } from "lucide-react";

// Champs obligatoires selon le statut (catalogue fixe, miroir de convex/dispatch.ts).
export type PatrolFields = {
  secteur?: string;
  vehiculeType?: string;
  vehiculeCouleur?: string;
  occupants?: string;
  suspects?: string;
  raison?: string;
};

export const FIELD_LABELS: Record<string, string> = {
  secteur: "Secteur",
  vehiculeType: "Type de véhicule",
  vehiculeCouleur: "Couleur du véhicule",
  occupants: "Nombre d'occupants",
  suspects: "Nombre de suspects",
  raison: "Raison",
};

// Icônes de statut (affichées en filigrane sur la carte).
export const STATUS_ICONS: Record<string, LucideIcon> = {
  shield: Shield,
  siren: Siren,
  clipboard: ClipboardList,
  target: Target,
  pause: Pause,
  radio: Radio,
  car: Car,
  search: Search,
};

export function statusIcon(key: string | null | undefined): LucideIcon | null {
  return key ? (STATUS_ICONS[key] ?? null) : null;
}

const AUTRE = "__autre__";

// Modal de saisie des champs exigés par un statut (secteur, véhicule, suspects…).
export function StatusFieldsModal({ statusName, requires, sectors, initial, onCancel, onConfirm }: {
  statusName: string;
  requires: string[];
  sectors: string[];
  initial?: PatrolFields | null;
  onCancel: () => void;
  onConfirm: (fields: PatrolFields) => void;
}) {
  const [f, setF] = useState<PatrolFields>({ ...(initial ?? {}) });
  // Secteur : liste déroulante + option « Autre » (saisie libre).
  const initialSector = initial?.secteur ?? "";
  const [sectorMode, setSectorMode] = useState<string>(
    initialSector && !sectors.includes(initialSector) ? AUTRE : initialSector,
  );

  const set = (k: keyof PatrolFields, val: string) => setF((p) => ({ ...p, [k]: val }));
  const missing = requires.filter((k) => !(f[k as keyof PatrolFields] ?? "").trim());
  const ok = missing.length === 0;

  const F = "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";
  const L = "mb-[6px] block text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint";

  return (
    <div onClick={onCancel} className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)" }}>
      <div onClick={(e) => e.stopPropagation()} className="w-[400px] max-w-[94vw] rounded-card border border-border-strong bg-elev p-5 shadow-[0_24px_70px_rgba(0,0,0,.4)] mdt-pop">
        <h2 className="m-0 mb-1 text-[15px] font-bold">Statut : {statusName}</h2>
        <p className="mb-4 mt-0 text-[12.5px] text-muted">Renseignez les informations requises.</p>

        <div className="flex flex-col gap-3">
          {requires.includes("secteur") && (
            <div>
              <span className={L}>{FIELD_LABELS.secteur}</span>
              <select
                value={sectorMode}
                onChange={(e) => {
                  const val = e.target.value;
                  setSectorMode(val);
                  set("secteur", val === AUTRE ? "" : val);
                }}
                className={F}
              >
                <option value="" disabled>Choisir un secteur…</option>
                {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
                <option value={AUTRE}>Autre…</option>
              </select>
              {sectorMode === AUTRE && (
                <input autoFocus value={f.secteur ?? ""} onChange={(e) => set("secteur", e.target.value)} placeholder="Préciser le secteur…" className={`${F} mt-2`} />
              )}
            </div>
          )}

          {requires.includes("vehiculeType") && (
            <div><span className={L}>{FIELD_LABELS.vehiculeType}</span>
              <input value={f.vehiculeType ?? ""} onChange={(e) => set("vehiculeType", e.target.value)} placeholder="Ex. berline, SUV, moto…" className={F} />
            </div>
          )}
          {requires.includes("vehiculeCouleur") && (
            <div><span className={L}>{FIELD_LABELS.vehiculeCouleur}</span>
              <input value={f.vehiculeCouleur ?? ""} onChange={(e) => set("vehiculeCouleur", e.target.value)} placeholder="Ex. noire, rouge…" className={F} />
            </div>
          )}
          {requires.includes("occupants") && (
            <div><span className={L}>{FIELD_LABELS.occupants}</span>
              <input value={f.occupants ?? ""} onChange={(e) => set("occupants", e.target.value.replace(/[^0-9]/g, "").slice(0, 2))} placeholder="2" className={`${F} font-data`} />
            </div>
          )}
          {requires.includes("raison") && (
            <div><span className={L}>{FIELD_LABELS.raison}</span>
              <input autoFocus value={f.raison ?? ""} onChange={(e) => set("raison", e.target.value)} placeholder="Ex. repas, ravitaillement, retour poste…" className={F} />
            </div>
          )}
          {requires.includes("suspects") && (
            <div><span className={L}>{FIELD_LABELS.suspects}</span>
              <input value={f.suspects ?? ""} onChange={(e) => set("suspects", e.target.value.replace(/[^0-9]/g, "").slice(0, 2))} placeholder="1" className={`${F} font-data`} />
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="rounded-sm border border-border bg-surface-2 px-4 py-[9px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
          <button onClick={() => ok && onConfirm(f)} disabled={!ok} className="flex-1 rounded-sm bg-accent px-4 py-[9px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">Confirmer</button>
        </div>
      </div>
    </div>
  );
}

// Résumé compact des champs pour affichage sur la carte (ex. "Downtown" ou "SUV noire · 2 occ.").
export function fieldsSummary(fields: PatrolFields | null | undefined, requires: string[]): string | null {
  if (!fields) return null;
  const parts: string[] = [];
  if (requires.includes("secteur") && fields.secteur) parts.push(fields.secteur);
  const veh = [fields.vehiculeType, fields.vehiculeCouleur].filter(Boolean).join(" ");
  if (requires.includes("vehiculeType") && veh) parts.push(veh);
  if (requires.includes("occupants") && fields.occupants) parts.push(`${fields.occupants} occ.`);
  if (requires.includes("suspects") && fields.suspects) parts.push(`${fields.suspects} suspect${Number(fields.suspects) > 1 ? "s" : ""}`);
  if (requires.includes("raison") && fields.raison) parts.push(fields.raison);
  return parts.length ? parts.join(" · ") : null;
}
