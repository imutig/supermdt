import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { fmtMatricule } from "@/components/common/AgentTag";
import { SkeletonRows, SkeletonCards } from "@/components/common/Skeleton";
import { EmptyState } from "@/components/common/EmptyState";

const DAY = 86_400_000;

// Tuile de stat, calquée sur la page Statistiques (même gabarit visuel).
function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-surface px-[15px] py-[14px]">
      <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">{label}</div>
      <div className="truncate font-data text-[19px] font-bold tracking-tight" style={{ color: color ?? "var(--text)" }} title={value}>{value}</div>
      {sub && <div className="mt-[2px] text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

// Ligne d'un mini-classement : libellé + barre proportionnelle + compteur.
function RankRow({ rank, name, count, max, accent }: { rank?: number; name: React.ReactNode; count: number; max: number; accent?: string }) {
  return (
    <div className="flex items-center gap-[10px] border-b border-border px-4 py-[9px] last:border-b-0">
      {rank != null && <span className="w-[16px] text-center font-data text-[12px] font-bold text-faint">{rank}</span>}
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{name}</span>
      <div className="h-[7px] w-[110px] overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full" style={{ width: `${(count / Math.max(1, max)) * 100}%`, background: accent ?? "var(--accent)" }} />
      </div>
      <span className="w-[32px] text-right font-data text-[12px] font-semibold">{count}</span>
    </div>
  );
}

type RangeKind = "7j" | "30j" | "all";
const PRESETS: { key: RangeKind; label: string }[] = [
  { key: "7j", label: "7 j" },
  { key: "30j", label: "30 j" },
  { key: "all", label: "Depuis toujours" },
];
const SUBLABEL: Record<RangeKind, string> = {
  "7j": "7 derniers jours",
  "30j": "30 derniers jours",
  all: "depuis toujours",
};

export function UsageAnalytics() {
  const [rangeKind, setRangeKind] = useState<RangeKind>("30j");

  // Bornes de la plage. L'ancre `now` est figée au changement de sélection pour
  // ne pas ré-abonner la requête à chaque render.
  const args = useMemo<{ from?: number; to?: number }>(() => {
    const now = Date.now();
    switch (rangeKind) {
      case "7j": return { from: now - 7 * DAY };
      case "30j": return { from: now - 30 * DAY };
      case "all": return {};
    }
  }, [rangeKind]);

  const d = useQuery(api.usageAnalytics.overview, args);
  const sub = SUBLABEL[rangeKind];

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      {/* En-tête + sélecteur de période */}
      <div className="mb-[16px] flex flex-wrap items-center gap-3">
        <div>
          <h1 className="m-0 text-[21px] font-bold tracking-tight">Analytics</h1>
          <div className="mt-[3px] text-[13px] text-muted">Usage du MDT : actions et consultations</div>
        </div>
        <div className="flex-1" />
        <div className="flex flex-wrap gap-[3px] rounded-[8px] bg-surface-2 p-[3px]">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setRangeKind(p.key)}
              className={`rounded-[6px] px-[10px] py-[6px] text-[12px] font-semibold transition-colors ${rangeKind === p.key ? "bg-accent text-accent-contrast" : "text-muted hover:text-text"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {d === undefined ? (
        <div className="flex flex-col gap-[18px]">
          <SkeletonCards count={4} height={70} />
          <div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={5} /></div>
        </div>
      ) : d.totalActions === 0 ? (
        <div className="rounded-card border border-border bg-surface">
          <EmptyState title="Aucune activité enregistrée" message={`Pas d'action journalisée sur la période (${sub}).`} />
        </div>
      ) : (
        <>
          {/* Bandeau tronqué : l'échantillon lu est plafonné côté serveur. */}
          {d.capped && (
            <div className="mb-[14px] rounded-card border border-border bg-surface px-4 py-[9px] text-[12px] text-muted">
              Échantillon volumineux : les compteurs portent sur les entrées les plus récentes de la période.
            </div>
          )}

          {/* Tuiles globales */}
          <div className="mb-[18px] grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-4">
            <Stat label="Actions" value={d.totalActions.toLocaleString("fr-FR")} sub={sub} />
            <Stat label="Agents actifs" value={String(d.activeAgents)} sub="ayant agi" />
            <Stat label="Consultations" value={d.totalLookups.toLocaleString("fr-FR")} sub="recherches + accès" />
            <Stat label="Ressource nº1" value={d.topResource ? d.topResource.label : "—"} sub={d.topResource ? `${d.topResource.count} consultation(s)` : undefined} />
          </div>

          {/* Série temporelle : actions par bucket */}
          <div className="mb-[18px] rounded-card border border-border bg-surface p-4">
            <div className="mb-[14px] flex items-center gap-2">
              <h2 className="m-0 text-[13.5px] font-bold">Actions dans le temps</h2>
              <div className="flex-1" />
              <span className="text-[11px] text-muted">{sub}</span>
            </div>
            {(() => {
              const series = d.series;
              const maxBar = Math.max(1, ...series.map((s) => s.count));
              const labelStep = Math.max(1, Math.ceil(series.length / 14));
              if (series.every((s) => s.count === 0)) {
                return <div className="py-10 text-center text-[13px] text-faint">Aucune action sur cette période.</div>;
              }
              return (
                // Libellés en position absolue : hors du flux, ils ne peuvent pas
                // élargir la colonne -> barres de largeur égale, dates centrées.
                <div className="flex items-end gap-[3px] pb-[18px]" style={{ height: 158 }}>
                  {series.map((s, i) => {
                    const h = (s.count / maxBar) * 140;
                    return (
                      <div key={i} className="relative flex min-w-0 flex-1 flex-col justify-end" style={{ height: 140 }} title={`${s.label} · ${s.count} action(s)`}>
                        <div className="w-full rounded-t-[3px]" style={{ height: h, background: "var(--accent)" }} />
                        {i % labelStep === 0 && (
                          <span className="absolute left-1/2 top-full mt-[5px] -translate-x-1/2 whitespace-nowrap text-[9px] text-faint">{s.label}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-2">
            {/* Agents les plus actifs */}
            <div className="overflow-hidden rounded-card border border-border bg-surface">
              <div className="border-b border-border px-4 py-[13px]">
                <h2 className="m-0 text-[13.5px] font-bold">Agents les plus actifs</h2>
                <div className="mt-[2px] text-[11px] text-faint">{sub}</div>
              </div>
              {d.topAgents.length === 0 ? (
                <div className="p-4 text-[13px] text-faint">Aucune donnée.</div>
              ) : (
                d.topAgents.map((a, i) => (
                  <RankRow
                    key={i}
                    rank={i + 1}
                    max={d.topAgents[0].count}
                    count={a.count}
                    name={
                      <>
                        {fmtMatricule(a.matricule) && <span className="font-data text-accent">{fmtMatricule(a.matricule)} </span>}
                        {a.name}
                      </>
                    }
                  />
                ))
              )}
            </div>

            {/* Actions les plus fréquentes */}
            <div className="overflow-hidden rounded-card border border-border bg-surface">
              <div className="border-b border-border px-4 py-[13px]">
                <h2 className="m-0 text-[13.5px] font-bold">Actions les plus fréquentes</h2>
                <div className="mt-[2px] text-[11px] text-faint">{sub}</div>
              </div>
              {d.byAction.length === 0 ? (
                <div className="p-4 text-[13px] text-faint">Aucune donnée.</div>
              ) : (
                d.byAction.map((a, i) => (
                  <RankRow key={i} max={d.byAction[0].count} count={a.count} name={a.label} />
                ))
              )}
            </div>
          </div>

          {/* Ressources les plus consultées */}
          {d.topResources.length > 0 && (
            <div className="mt-[18px] overflow-hidden rounded-card border border-border bg-surface">
              <div className="border-b border-border px-4 py-[13px]">
                <h2 className="m-0 text-[13.5px] font-bold">Ressources les plus consultées</h2>
                <div className="mt-[2px] text-[11px] text-faint">{sub} · journal d'accès</div>
              </div>
              {d.topResources.map((r, i) => (
                <RankRow key={i} max={d.topResources[0].count} count={r.count} name={r.label} accent="var(--warning)" />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
