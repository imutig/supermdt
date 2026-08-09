import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/api";
import { SkeletonRows } from "@/components/common/Skeleton";

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-surface px-[15px] py-[14px]">
      <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">{label}</div>
      <div className="font-data text-[19px] font-bold tracking-tight" style={{ color: color ?? "var(--text)" }}>{value}</div>
      {sub && <div className="mt-[2px] text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

export function Statistiques() {
  const s = useQuery(api.stats.overview);
  const requestRefresh = useMutation(api.stats.requestRefresh);

  // Consulter la page demande un rafraîchissement, ignoré si l'instantané a
  // moins de cinq minutes. C'est aussi ce qui produit le tout premier calcul.
  useEffect(() => { void requestRefresh({}).catch(() => {}); }, [requestRefresh]);

  // `null` = aucun instantané encore calculé : le premier passage est planifié
  // dès la première écriture qui touche aux données agrégées.
  if (s === undefined || s === null) {
    return (
      <div className="p-[22px_26px]">
        <div className="rounded-card border border-border bg-surface p-4">
          {s === null
            ? <div className="py-8 text-center text-[13px] text-faint">Statistiques en cours de calcul, revenez dans un instant.</div>
            : <SkeletonRows rows={6} />}
        </div>
      </div>
    );
  }

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px] flex items-center gap-3">
        <div>
          <h1 className="m-0 text-[21px] font-bold tracking-tight">Statistiques</h1>
          <div className="mt-[3px] text-[13px] text-muted">Activité et indicateurs de la station</div>
        </div>
        <div className="flex-1" />
        {s.defcon && (
          <span className="rounded-[7px] px-[12px] py-[7px] text-[12px] font-bold" style={{ background: `color-mix(in srgb, ${s.defcon.color ?? "var(--accent)"} 16%, transparent)`, color: s.defcon.color ?? "var(--accent)" }}>
            DEFCON · {s.defcon.name}
          </span>
        )}
      </div>

      {/* Compteurs globaux (données synchronisées / opérationnelles) */}
      <div className="mb-[18px] grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-4">
        <Stat label="Agents actifs" value={String(s.counts.agentsActive)} />
        <Stat label="Citoyens" value={s.counts.citizensCount.toLocaleString("fr-FR")} />
        <Stat label="Véhicules" value={s.counts.vehiclesCount.toLocaleString("fr-FR")} />
        <Stat label="Armes" value={s.counts.weaponsCount.toLocaleString("fr-FR")} />
      </div>

      <div className="rounded-card border border-border bg-surface p-5 text-[13px] text-muted">
        Les statistiques judiciaires (arrestations, contraventions, amendes, infractions) sont gérées sur le NexusMDT et ne sont plus calculées ici.
      </div>
    </div>
  );
}
