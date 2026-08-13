import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { SkeletonRows } from "@/components/common/Skeleton";

function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-surface px-[15px] py-[14px]">
      <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">{label}</div>
      <div className="font-data text-[19px] font-bold tracking-tight" style={{ color: color ?? "var(--text)" }}>{value}</div>
      {sub && <div className="mt-[2px] text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

const DIR_LABEL: Record<string, string> = { IMPORT: "Import", WRITE: "Écriture", AUTH: "Auth" };

export function Synchronisation() {
  const d = useQuery(api.nexusSync.dashboard);

  if (d === undefined) {
    return <div className="p-[22px_26px]"><div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={6} /></div></div>;
  }

  const maxDay = Math.max(1, ...d.days.map((x) => x.ok + x.err));
  const entities = Object.entries(d.totals.byEntity).sort((a, b) => b[1] - a[1]);
  const maxEntity = Math.max(1, ...entities.map(([, n]) => n));

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px]">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Synchronisation NexusMDT</h1>
        <div className="mt-[3px] text-[13px] text-muted">Imports, écritures write-through et appels API (30 derniers jours)</div>
      </div>

      {/* KPI */}
      <div className="mb-[18px] grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-4">
        <Tile label="Appels (30j)" value={String(d.totals.total)} />
        <Tile label="Taux de succès" value={d.totals.successRate == null ? "—" : `${d.totals.successRate}%`} color={d.totals.successRate != null && d.totals.successRate < 100 ? "var(--warning)" : "var(--success)"} sub={`${d.totals.errCount} en échec`} />
        <Tile label="Imports" value={String(d.totals.byDirection.IMPORT ?? 0)} />
        <Tile label="Écritures" value={String(d.totals.byDirection.WRITE ?? 0)} />
      </div>

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-[18px]">
          {/* Graphique appels 14 jours */}
          <div className="rounded-card border border-border bg-surface p-4">
            <div className="mb-[14px] flex items-center gap-2">
              <h2 className="m-0 text-[13.5px] font-bold">Appels · 14 derniers jours</h2>
              <div className="flex-1" />
              <span className="flex items-center gap-[5px] text-[11px] text-muted"><span className="h-[8px] w-[8px] rounded-[2px]" style={{ background: "var(--success)" }} /> OK</span>
              <span className="flex items-center gap-[5px] text-[11px] text-muted"><span className="h-[8px] w-[8px] rounded-[2px]" style={{ background: "var(--danger)" }} /> Échec</span>
            </div>
            {d.totals.total === 0 ? (
              <div className="py-10 text-center text-[13px] text-faint">Aucune opération enregistrée pour l'instant.</div>
            ) : (
              <div className="flex items-end gap-[3px] pb-[18px]" style={{ height: 158 }}>
                {d.days.map((x, i) => {
                  const total = x.ok + x.err;
                  const h = (total / maxDay) * 140;
                  const okH = total > 0 ? (x.ok / total) * h : 0;
                  const errH = total > 0 ? (x.err / total) * h : 0;
                  return (
                    <div key={i} className="relative flex min-w-0 flex-1 flex-col justify-end" style={{ height: 140 }} title={`${x.day} · ${x.ok} OK, ${x.err} échec`}>
                      <div className="w-full rounded-t-[3px]" style={{ height: errH, background: "var(--danger)" }} />
                      <div className="w-full" style={{ height: okH, background: "var(--success)", borderTopLeftRadius: errH === 0 ? 3 : 0, borderTopRightRadius: errH === 0 ? 3 : 0 }} />
                      <span className="absolute left-1/2 top-full mt-[5px] -translate-x-1/2 whitespace-nowrap text-[9px] text-faint">{x.day}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Journal des appels */}
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <div className="border-b border-border px-4 py-[13px]"><h2 className="m-0 text-[13.5px] font-bold">Journal des appels</h2></div>
            {d.recent.length === 0 ? (
              <div className="p-4 text-[13px] text-faint">Aucun appel.</div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto">
                {d.recent.map((r) => (
                  <div key={r._id} className="flex items-center gap-3 border-b border-border px-4 py-[9px] text-[12px]">
                    <span className="h-[8px] w-[8px] flex-shrink-0 rounded-full" style={{ background: r.ok ? "var(--success)" : "var(--danger)" }} />
                    <span className="w-[92px] flex-shrink-0 font-data text-[11px] text-faint">{new Date(r.at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="w-[64px] flex-shrink-0 text-[11px] font-semibold text-muted">{DIR_LABEL[r.direction] ?? r.direction}</span>
                    <span className="w-[92px] flex-shrink-0 font-semibold">{r.entity}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{r.error ? <span style={{ color: "var(--danger)" }}>{r.error}</span> : (r.detail ?? r.op)}{r.agent ? ` · ${r.agent}` : ""}</span>
                    <span className="w-[54px] flex-shrink-0 text-right font-data text-[11px] text-faint">{r.httpStatus ?? ""}{r.durationMs != null ? ` ${r.durationMs}ms` : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-[18px]">
          {/* Répartition par entité */}
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <div className="border-b border-border px-4 py-[13px]"><h2 className="m-0 text-[13.5px] font-bold">Par type</h2></div>
            {entities.length === 0 ? (
              <div className="p-4 text-[13px] text-faint">Aucune donnée.</div>
            ) : (
              entities.map(([name, n]) => (
                <div key={name} className="flex items-center gap-3 border-b border-border px-4 py-[9px]">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{name}</span>
                  <div className="h-[7px] w-[110px] overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${(n / maxEntity) * 100}%`, background: "var(--accent)" }} /></div>
                  <span className="w-[34px] text-right font-data text-[12px] font-semibold">{n}</span>
                </div>
              ))
            )}
          </div>

          {/* Agents liés */}
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <div className="border-b border-border px-4 py-[13px]"><h2 className="m-0 text-[13.5px] font-bold">Comptes Nexus liés</h2><div className="mt-[2px] text-[11px] text-faint">{d.linked.length} agent(s)</div></div>
            {d.linked.length === 0 ? (
              <div className="p-4 text-[13px] text-faint">Aucun agent n'a lié son compte Nexus.</div>
            ) : (
              d.linked.map((a, i) => {
                const color = a.status === "OK" ? "var(--success)" : a.status === "INVALID" ? "var(--danger)" : "var(--warning)";
                const label = a.status === "OK" ? "Connecté" : a.status === "INVALID" ? "Invalide" : "Non testé";
                return (
                  <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-[10px]">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-semibold">{a.name}</div>
                      <div className="truncate font-data text-[11px] text-faint">{a.email}</div>
                    </div>
                    <span className="flex-shrink-0 text-[12px] font-semibold" style={{ color }}>{label}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
