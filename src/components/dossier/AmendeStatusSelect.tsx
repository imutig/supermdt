import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";

// Statut de l'amende liée à un casier/contravention. Couleur par statut.
const STATUT_COLOR: Record<string, string> = {
  "Notifiée": "var(--accent)",
  "Payée": "var(--success)",
  "En attente": "var(--warning)",
  "Contestée": "var(--warning)",
  "Annulée": "var(--muted)",
};

// Sélecteur de statut d'amende, pilotable là où l'amende est liée (liste casier,
// fiche casier…). Lecture seule (pastille colorée) sans la permission finances.
export function AmendeStatusSelect({ amende, compact }: { amende: { _id: string; statut: string } | null; compact?: boolean }) {
  const { can } = useCan();
  const statuts = useQuery(api.amendes.statuts, {});
  const setStatus = useMutation(api.amendes.setStatus);
  const toast = useToast();
  if (!amende) return null;
  const color = STATUT_COLOR[amende.statut] ?? "var(--muted)";

  if (!can("finances.manage")) {
    return (
      <span className={`rounded-[5px] font-semibold ${compact ? "px-[7px] py-[2px] text-[11px]" : "px-[9px] py-[3px] text-[12px]"}`} style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
        {amende.statut}
      </span>
    );
  }

  return (
    <select
      value={amende.statut}
      title="Statut de l'amende"
      onClick={(e) => e.stopPropagation()}
      onChange={async (e) => {
        e.stopPropagation();
        const v = e.target.value;
        const r = await toast.guard(setStatus({ amendeId: amende._id as Id<"amendes">, statut: v }), "Changement impossible");
        if (r !== undefined) toast.success("Statut de l'amende mis à jour.");
      }}
      className={`cursor-pointer rounded-[6px] border bg-surface-2 font-semibold outline-none ${compact ? "px-[7px] py-[3px] text-[11px]" : "px-3 py-[8px] text-[12.5px]"}`}
      style={{ borderColor: color, color }}
    >
      {(statuts ?? [amende.statut]).map((s) => (
        <option key={s} value={s} style={{ color: "var(--text)" }}>{s}</option>
      ))}
    </select>
  );
}
