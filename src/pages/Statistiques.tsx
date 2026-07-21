import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/api";
import { fmtMatricule } from "@/components/common/AgentTag";
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

  const maxDay = Math.max(1, ...s.days.map((d) => d.arr + d.cit));

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

      {/* Compteurs globaux */}
      <div className="mb-[18px] grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Agents actifs" value={String(s.counts.agentsActive)} />
        <Stat label="Citoyens" value={s.counts.citizensCount.toLocaleString("fr-FR")} />
        <Stat label="Véhicules" value={s.counts.vehiclesCount.toLocaleString("fr-FR")} />
        <Stat label="Armes" value={s.counts.weaponsCount.toLocaleString("fr-FR")} />
        <Stat label="Mandats actifs" value={String(s.counts.mandatsActive)} color={s.counts.mandatsActive > 0 ? "var(--danger)" : undefined} />
      </div>

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-[18px]">
          {/* Activité 14 jours */}
          <div className="rounded-card border border-border bg-surface p-4">
            <div className="mb-[14px] flex items-center gap-2">
              <h2 className="m-0 text-[13.5px] font-bold">Activité · 14 derniers jours</h2>
              <div className="flex-1" />
              <span className="flex items-center gap-[5px] text-[11px] text-muted"><span className="h-[8px] w-[8px] rounded-[2px]" style={{ background: "var(--danger)" }} /> Arrestations</span>
              <span className="flex items-center gap-[5px] text-[11px] text-muted"><span className="h-[8px] w-[8px] rounded-[2px]" style={{ background: "var(--warning)" }} /> Contraventions</span>
            </div>
            <div className="flex items-end gap-[6px]" style={{ height: 160 }}>
              {s.days.map((d, i) => {
                const total = d.arr + d.cit;
                const h = (total / maxDay) * 140;
                const arrH = total > 0 ? (d.arr / total) * h : 0;
                const citH = total > 0 ? (d.cit / total) * h : 0;
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-[5px]">
                    <div className="flex w-full flex-col justify-end" style={{ height: 140 }} title={`${d.arr} arrestation(s), ${d.cit} contravention(s)`}>
                      <div className="w-full rounded-t-[3px]" style={{ height: citH, background: "var(--warning)" }} />
                      <div className="w-full" style={{ height: arrH, background: "var(--danger)", borderTopLeftRadius: citH === 0 ? 3 : 0, borderTopRightRadius: citH === 0 ? 3 : 0 }} />
                    </div>
                    <span className="text-[9px] text-faint">{d.day}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top charges */}
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <div className="border-b border-border px-4 py-[13px]"><h2 className="m-0 text-[13.5px] font-bold">Infractions les plus fréquentes</h2></div>
            {s.topCharges.length === 0 ? (
              <div className="p-4 text-[13px] text-faint">Aucune donnée.</div>
            ) : (
              s.topCharges.map((c, i) => {
                const max = s.topCharges[0].count;
                return (
                  <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-[9px]">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{c.name}</span>
                    <div className="h-[7px] w-[120px] overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full" style={{ width: `${(c.count / max) * 100}%`, background: "var(--accent)" }} />
                    </div>
                    <span className="w-[32px] text-right font-data text-[12px] font-semibold">{c.count}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex flex-col gap-[18px]">
          {/* Amendes */}
          <div className="rounded-card border border-border bg-surface p-4">
            <div className="mb-[12px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Amendes</div>
            <div className="flex items-baseline justify-between border-b border-border pb-[10px]">
              <span className="text-[12.5px] text-muted">Collectées</span>
              <span className="font-data text-[16px] font-bold" style={{ color: "var(--success)" }}>${s.fines.collected.toLocaleString("fr-FR")}</span>
            </div>
            <div className="flex items-baseline justify-between pt-[10px]">
              <span className="text-[12.5px] text-muted">Impayées</span>
              <span className="font-data text-[16px] font-bold" style={{ color: "var(--danger)" }}>${s.fines.unpaid.toLocaleString("fr-FR")}</span>
            </div>
          </div>

          {/* Arrestations / contraventions résumé */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border">
            <Stat label="Arrestations (7j)" value={String(s.arrests.week)} sub={`${s.arrests.month} sur 30j`} />
            <Stat label="Contraventions (7j)" value={String(s.citations.week)} sub={`${s.citations.month} sur 30j`} />
          </div>

          {/* Top agents */}
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <div className="border-b border-border px-4 py-[13px]"><h2 className="m-0 text-[13.5px] font-bold">Agents les plus actifs</h2><div className="mt-[2px] text-[11px] text-faint">30 derniers jours · arrestations + contraventions</div></div>
            {s.topAgents.length === 0 ? (
              <div className="p-4 text-[13px] text-faint">Aucune donnée.</div>
            ) : (
              s.topAgents.map((a, i) => (
                <div key={i} className="flex items-center gap-[10px] border-b border-border px-4 py-[10px]">
                  <span className="w-[16px] text-center font-data text-[12px] font-bold text-faint">{i + 1}</span>
                  <div className="min-w-0 flex-1 text-[12.5px] font-semibold">
                    {fmtMatricule(a.matricule) && <span className="font-data text-accent">{fmtMatricule(a.matricule)} </span>}
                    {a.name}
                  </div>
                  <span className="font-data text-[13px] font-bold">{a.count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
