import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { LosSantosMap } from "@/components/carte/LosSantosMap";

// Sélection / affichage d'un point sur le fond de carte du MDT (réutilise
// LosSantosMap et l'image configurée dans carte.get). Coords en % (0–100).

export function MapPickField({ value, onChange }: { value: { x: number; y: number } | null; onChange: (v: { x: number; y: number }) => void }) {
  const data = useQuery(api.carte.get);
  return (
    <div>
      <LosSantosMap imageUrl={data?.imageUrl ?? null} pin={value} onPick={(x, y) => onChange({ x, y })} height={320} />
      <div className="mt-1 text-[11px] text-faint">{value ? `Point placé (${value.x.toFixed(1)}, ${value.y.toFixed(1)})` : "Cliquez sur la carte pour placer le lieu."}</div>
    </div>
  );
}

export function MapPointView({ x, y, note }: { x: number; y: number; note?: string }) {
  const data = useQuery(api.carte.get);
  return (
    <div>
      <LosSantosMap imageUrl={data?.imageUrl ?? null} pin={{ x, y }} height={260} />
      {note && <div className="mt-1 text-[12px] text-muted">{note}</div>}
    </div>
  );
}
