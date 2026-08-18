import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { fmtMatricule } from "@/components/common/AgentTag";
import { SkeletonRows } from "@/components/common/Skeleton";
import { parisDayStart, parisDayEnd } from "@/lib/paris";

const DAY = 86_400_000;

// « il y a X » compact pour l'horodatage de calcul du cache de stats.
function agoLabel(ts?: number): string {
  if (!ts) return "";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  return `il y a ${h} h`;
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-surface px-[15px] py-[14px]">
      <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">{label}</div>
      <div className="font-data text-[19px] font-bold tracking-tight" style={{ color: color ?? "var(--text)" }}>{value}</div>
      {sub && <div className="mt-[2px] text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

type TopFilter = "all" | "casiers" | "contraventions";
type RangeKind = "24h" | "7j" | "14j" | "30j" | "all" | "custom";
const PRESETS: { key: RangeKind; label: string }[] = [
  { key: "24h", label: "24 h" },
  { key: "7j", label: "7 j" },
  { key: "14j", label: "14 j" },
  { key: "30j", label: "30 j" },
  { key: "all", label: "Depuis toujours" },
  { key: "custom", label: "Perso" },
];
const SUBLABEL: Record<RangeKind, string> = {
  "24h": "dernières 24 h",
  "7j": "7 derniers jours",
  "14j": "14 derniers jours",
  "30j": "30 derniers jours",
  all: "depuis toujours",
  custom: "période choisie",
};

export function Statistiques() {
  const s = useQuery(api.stats.overview);
  const requestRefresh = useMutation(api.stats.requestRefresh);
  const [topFilter, setTopFilter] = useState<TopFilter>("all");
  const [rangeKind, setRangeKind] = useState<RangeKind>("14j");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Consulter la page demande un rafraîchissement (compteurs + DEFCON), ignoré
  // si l'instantané a moins de cinq minutes.
  useEffect(() => { void requestRefresh({}).catch(() => {}); }, [requestRefresh]);

  // Bornes de la plage. L'ancre `now` est figée au changement de sélection pour
  // ne pas ré-abonner la requête à chaque render.
  const args = useMemo<{ from?: number; to?: number; cacheKey: string } | "skip">(() => {
    const now = Date.now();
    const key = rangeKind === "custom" ? `custom:${customFrom}:${customTo}` : rangeKind;
    switch (rangeKind) {
      case "24h": return { from: now - DAY, cacheKey: key };
      case "7j": return { from: now - 7 * DAY, cacheKey: key };
      case "14j": return { from: now - 14 * DAY, cacheKey: key };
      case "30j": return { from: now - 30 * DAY, cacheKey: key };
      case "all": return { cacheKey: key };
      case "custom": {
        const f = parisDayStart(customFrom);
        const t = parisDayEnd(customTo);
        if (f == null || t == null) return "skip";
        return { from: f, to: t, cacheKey: key };
      }
    }
  }, [rangeKind, customFrom, customTo]);

  const r = useQuery(api.stats.rangeStats, args);
  const refreshRange = useMutation(api.stats.refreshRangeStats);
  const [resyncing, setResyncing] = useState(false);
  // Cache par plage : on (re)calcule à l'ouverture uniquement si vide ou périmé (>30 min).
  useEffect(() => {
    if (args === "skip") return;
    if (r === null || (r && r.stale)) void refreshRange(args).catch(() => {});
  }, [r, args, refreshRange]);
  const resync = async () => {
    if (args === "skip") return;
    setResyncing(true);
    try { await refreshRange({ ...args, force: true }); } finally { setResyncing(false); }
  };

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

  const sub = SUBLABEL[rangeKind];
  const series = r?.series ?? [];
  const maxBar = Math.max(1, ...series.map((d) => d.arr + d.cit));
  const labelStep = Math.max(1, Math.ceil(series.length / 14));

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[16px] flex flex-wrap items-center gap-3">
        <div>
          <h1 className="m-0 text-[21px] font-bold tracking-tight">Statistiques</h1>
          <div className="mt-[3px] flex items-center gap-[8px] text-[13px] text-muted">
            Activité et indicateurs de la station
            {r && <span className="text-[11.5px] text-faint">· stats {agoLabel(r.computedAt)}{r.stale ? " (actualisation…)" : ""}</span>}
          </div>
        </div>
        <div className="flex-1" />
        <button onClick={resync} disabled={resyncing || args === "skip"} title="Recalculer les statistiques maintenant" className="flex items-center gap-[6px] rounded-[7px] border border-border bg-surface px-[10px] py-[7px] text-[12px] font-semibold text-muted hover:border-border-strong disabled:opacity-50">
          <RefreshCw className={`h-[13px] w-[13px] ${resyncing ? "animate-spin" : ""}`} /> Resynchro des stats
        </button>
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
        {s.defcon && (
          <span className="rounded-[7px] px-[12px] py-[7px] text-[12px] font-bold" style={{ background: `color-mix(in srgb, ${s.defcon.color ?? "var(--accent)"} 16%, transparent)`, color: s.defcon.color ?? "var(--accent)" }}>
            DEFCON · {s.defcon.name}
          </span>
        )}
      </div>

      {/* Plage personnalisée */}
      {rangeKind === "custom" && (
        <div className="mb-[16px] flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface px-4 py-[13px]">
          <div>
            <div className="mb-[5px] text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">Du</div>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 rounded-sm border border-border bg-surface-2 px-2 font-data text-[13px] outline-none focus:border-accent" />
          </div>
          <div>
            <div className="mb-[5px] text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">Au</div>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 rounded-sm border border-border bg-surface-2 px-2 font-data text-[13px] outline-none focus:border-accent" />
          </div>
          {args === "skip" && <div className="pb-[8px] text-[12px] text-faint">Choisissez deux dates pour afficher la période.</div>}
        </div>
      )}

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
          {/* Activité sur la période */}
          <div className="rounded-card border border-border bg-surface p-4">
            <div className="mb-[14px] flex items-center gap-2">
              <h2 className="m-0 text-[13.5px] font-bold">Activité · {sub}</h2>
              <div className="flex-1" />
              <span className="flex items-center gap-[5px] text-[11px] text-muted"><span className="h-[8px] w-[8px] rounded-[2px]" style={{ background: "var(--danger)" }} /> Arrestations</span>
              <span className="flex items-center gap-[5px] text-[11px] text-muted"><span className="h-[8px] w-[8px] rounded-[2px]" style={{ background: "var(--warning)" }} /> Contraventions</span>
            </div>
            {(r === undefined || r === null) && args !== "skip" ? (
              <div className="flex items-end gap-[6px]" style={{ height: 160 }}><SkeletonRows rows={1} /></div>
            ) : series.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-faint">Aucune activité sur cette période.</div>
            ) : (
              // Libellés en position absolue : hors du flux, ils ne peuvent pas
              // élargir la colonne qui les porte -> toutes les barres restent de
              // largeur égale et chaque date reste centrée sous sa barre.
              <div className="flex items-end gap-[3px] pb-[18px]" style={{ height: 158 }}>
                {series.map((d, i) => {
                  const total = d.arr + d.cit;
                  const h = (total / maxBar) * 140;
                  const arrH = total > 0 ? (d.arr / total) * h : 0;
                  const citH = total > 0 ? (d.cit / total) * h : 0;
                  return (
                    <div key={i} className="relative flex min-w-0 flex-1 flex-col justify-end" style={{ height: 140 }} title={`${d.label} · ${d.arr} arrestation(s), ${d.cit} contravention(s)`}>
                      <div className="w-full rounded-t-[3px]" style={{ height: citH, background: "var(--warning)" }} />
                      <div className="w-full" style={{ height: arrH, background: "var(--danger)", borderTopLeftRadius: citH === 0 ? 3 : 0, borderTopRightRadius: citH === 0 ? 3 : 0 }} />
                      {i % labelStep === 0 && (
                        <span className="absolute left-1/2 top-full mt-[5px] -translate-x-1/2 whitespace-nowrap text-[9px] text-faint">{d.label}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top charges */}
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <div className="border-b border-border px-4 py-[13px]"><h2 className="m-0 text-[13.5px] font-bold">Infractions les plus fréquentes</h2><div className="mt-[2px] text-[11px] text-faint">{sub}</div></div>
            {!r || r.topCharges.length === 0 ? (
              <div className="p-4 text-[13px] text-faint">Aucune donnée.</div>
            ) : (
              r.topCharges.map((c, i) => {
                const max = r.topCharges[0].count;
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
          {/* Arrestations / contraventions résumé (période choisie) */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border">
            <Stat label="Arrestations" value={r ? String(r.arrests) : "…"} sub={sub} />
            <Stat label="Contraventions" value={r ? String(r.citations) : "…"} sub={sub} />
          </div>

          {/* Top agents */}
          {(() => {
            const list = (topFilter === "casiers" ? r?.topAgentsCasiers : topFilter === "contraventions" ? r?.topAgentsContraventions : r?.topAgents) ?? [];
            const filterSub = topFilter === "casiers" ? "casiers" : topFilter === "contraventions" ? "contraventions" : "arrestations + contraventions";
            const tabs: { key: TopFilter; label: string }[] = [
              { key: "all", label: "Tout" },
              { key: "casiers", label: "Casiers" },
              { key: "contraventions", label: "Contraventions" },
            ];
            return (
              <div className="overflow-hidden rounded-card border border-border bg-surface">
                <div className="border-b border-border px-4 py-[13px]">
                  <div className="flex items-center gap-2">
                    <h2 className="m-0 flex-1 text-[13.5px] font-bold">Agents les plus actifs</h2>
                    <div className="flex gap-[3px] rounded-[7px] bg-surface-2 p-[3px]">
                      {tabs.map((t) => (
                        <button
                          key={t.key}
                          onClick={() => setTopFilter(t.key)}
                          className={`rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold transition-colors ${topFilter === t.key ? "bg-accent text-accent-contrast" : "text-muted hover:text-text"}`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-[3px] text-[11px] text-faint">{sub} · {filterSub}</div>
                </div>
                {!r ? (
                  <div className="p-4"><SkeletonRows rows={3} /></div>
                ) : list.length === 0 ? (
                  <div className="p-4 text-[13px] text-faint">Aucune donnée.</div>
                ) : (
                  list.map((a, i) => (
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
            );
          })()}
        </div>
      </div>
    </div>
  );
}
