import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { Moon, Sun } from "lucide-react";
import { NexusSyncCard } from "@/components/profil/NexusSyncCard";
import { api } from "@/lib/api";
import { fmtMatricule } from "@/components/common/AgentTag";
import { fmtAnciennete } from "@/lib/anciennete";
import { SkeletonRows } from "@/components/common/Skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { usePrefs, setPref } from "@/hooks/usePrefs";
import { FEATURES } from "@/lib/features";
import { useApp } from "@/providers/app-state";
import { parisDayStart, parisDayEnd } from "@/lib/paris";
import { actionLabel, resourceLabel } from "@/lib/auditLabels";

const DAY = 86_400_000;
const money = (n: number) => "$" + Math.round(n).toLocaleString("fr-FR");

export function Profil() {
  const p = useQuery(api.profile.me);
  const [tab, setTab] = useState<"stats" | "activite" | "parametres">("stats");

  if (p === undefined) {
    return <div className="p-[22px_26px]"><div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={6} /></div></div>;
  }
  const a = p.agent;
  const initials = `${a.prenomRP.charAt(0)}${a.nomRP.charAt(0)}`.toUpperCase();

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      {/* En-tête profil */}
      <div className="mb-[16px] flex items-center gap-4 rounded-card border border-border bg-surface p-5">
        {a.avatarUrl ? (
          <img src={a.avatarUrl} alt="" className="h-[64px] w-[64px] rounded-[12px] border border-border object-cover" />
        ) : (
          <div className="flex h-[64px] w-[64px] items-center justify-center rounded-[12px] border border-border bg-surface-2 text-[22px] font-bold text-muted">{initials}</div>
        )}
        <div className="flex-1">
          <h1 className="m-0 text-[22px] font-bold tracking-tight">{a.prenomRP} {a.nomRP}</h1>
          <div className="mt-1 text-[13px] text-muted">
            {fmtMatricule(a.matricule) && <span className="font-data text-accent">{fmtMatricule(a.matricule)} </span>}
            · {a.gradeName} · @{a.login}
          </div>
          <div className="mt-[6px] flex flex-wrap gap-[6px]">
            {a.divisions.map((d, i) => <span key={i} className="rounded-[6px] border border-border bg-surface-2 px-[9px] py-[3px] text-[11.5px] font-semibold text-muted">{d}</span>)}
            {a.qualifications.map((q, i) => (
              <span key={`q${i}`} title={`${q.name} · ${q.kind === "FORMATION" ? "formation" : "spécialité"} · obtenue le ${new Date(q.at).toLocaleDateString("fr-FR")}`}
                className="rounded-[6px] border px-[9px] py-[3px] text-[11.5px] font-semibold"
                style={q.color ? { borderColor: q.color, color: q.color, background: `color-mix(in srgb, ${q.color} 12%, transparent)` } : { borderColor: "var(--border)", color: "var(--muted)", background: "var(--surface-2)" }}>
                {q.code}
              </span>
            ))}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Ancienneté</div>
          <div className="mt-1 text-[15px] font-bold">{fmtAnciennete(a.dateEntree)}</div>
          {a.dateEntree && <div className="text-[11px] text-faint">depuis le {new Date(a.dateEntree).toLocaleDateString("fr-FR", { timeZone: "UTC" })}</div>}
        </div>
      </div>

      {/* Onglets */}
      <div className="mb-[16px] flex gap-[2px] rounded-card border border-border bg-surface p-[5px]">
        {([["stats", "Statistiques"], ["activite", "Mon activité"], ["parametres", "Paramètres"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="rounded-[7px] px-[13px] py-[7px] text-[12.5px] font-semibold hover:bg-surface-2" style={tab === k ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "stats" && <StatsTab />}
      {tab === "activite" && <ActivityTab />}
      {tab === "parametres" && <SettingsTab />}
    </div>
  );
}

// ---------------------------- Statistiques perso ----------------------------
function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-surface px-[15px] py-[14px]">
      <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">{label}</div>
      <div className="font-data text-[19px] font-bold tracking-tight" style={{ color: color ?? "var(--text)" }}>{value}</div>
      {sub && <div className="mt-[2px] text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
type RangeKind = "24h" | "7j" | "14j" | "30j" | "all" | "custom";
const PRESETS: { key: RangeKind; label: string }[] = [
  { key: "24h", label: "24 h" }, { key: "7j", label: "7 j" }, { key: "14j", label: "14 j" },
  { key: "30j", label: "30 j" }, { key: "all", label: "Depuis toujours" }, { key: "custom", label: "Perso" },
];
const SUBLABEL: Record<RangeKind, string> = { "24h": "dernières 24 h", "7j": "7 derniers jours", "14j": "14 derniers jours", "30j": "30 derniers jours", all: "depuis toujours", custom: "période choisie" };

function StatsTab() {
  const [rangeKind, setRangeKind] = useState<RangeKind>("14j");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const args = useMemo<{ from?: number; to?: number } | "skip">(() => {
    const now = Date.now();
    switch (rangeKind) {
      case "24h": return { from: now - DAY };
      case "7j": return { from: now - 7 * DAY };
      case "14j": return { from: now - 14 * DAY };
      case "30j": return { from: now - 30 * DAY };
      case "all": return {};
      case "custom": { const f = parisDayStart(customFrom); const t = parisDayEnd(customTo); if (f == null || t == null) return "skip"; return { from: f, to: t }; }
    }
  }, [rangeKind, customFrom, customTo]);

  const r = useQuery(api.stats.myRangeStats, args);
  const sub = SUBLABEL[rangeKind];
  const series = r?.series ?? [];
  const maxBar = Math.max(1, ...series.map((d) => d.arr + d.cit));
  const labelStep = Math.max(1, Math.ceil(series.length / 14));

  return (
    <div style={{ animation: "mdtFade .2s ease" }}>
      {/* Sélecteur de période */}
      <div className="mb-[14px] flex flex-wrap items-center gap-[6px]">
        <div className="flex flex-wrap gap-[3px] rounded-[10px] bg-surface-2 p-[3px]">
          {PRESETS.map((pz) => (
            <button key={pz.key} onClick={() => setRangeKind(pz.key)} className="rounded-[8px] px-[11px] py-[6px] text-[12px] font-semibold" style={rangeKind === pz.key ? { background: "var(--accent)", color: "var(--accent-contrast)" } : { color: "var(--muted)" }}>
              {pz.label}
            </button>
          ))}
        </div>
        {rangeKind === "custom" && (
          <div className="flex items-center gap-[6px]">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 rounded-sm border border-border bg-surface-2 px-2 text-[12.5px] outline-none focus:border-accent" />
            <span className="text-[12px] text-faint">→</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 rounded-sm border border-border bg-surface-2 px-2 text-[12.5px] outline-none focus:border-accent" />
          </div>
        )}
      </div>

      {/* Cartes de stats (période) */}
      <div className="mb-[16px] grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border md:grid-cols-4">
        <Stat label="Arrestations" value={r ? String(r.arrests) : "…"} sub={r ? `${r.dossiers} dossier(s) · ${r.rapports} rapport(s)` : sub} color="var(--danger)" />
        <Stat label="Contraventions" value={r ? String(r.citations) : "…"} sub={sub} color="var(--warning)" />
        <Stat label="Rapports rédigés" value={r ? String(r.reports) : "…"} sub={sub} />
        <Stat label="Amendes émises" value={r ? money(r.totalFine) : "…"} sub={sub} />
      </div>

      <div className="grid grid-cols-1 items-start gap-[16px] lg:grid-cols-[1.4fr_1fr]">
        {/* Graphique d'activité */}
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="mb-[14px] flex items-center gap-2">
            <h2 className="m-0 text-[13.5px] font-bold">Mon activité · {sub}</h2>
            <div className="flex-1" />
            <span className="flex items-center gap-[5px] text-[11px] text-muted"><span className="h-[8px] w-[8px] rounded-[2px]" style={{ background: "var(--danger)" }} /> Arrestations</span>
            <span className="flex items-center gap-[5px] text-[11px] text-muted"><span className="h-[8px] w-[8px] rounded-[2px]" style={{ background: "var(--warning)" }} /> Contraventions</span>
          </div>
          {r === undefined && args !== "skip" ? (
            <div style={{ height: 160 }}><SkeletonRows rows={1} /></div>
          ) : series.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-faint">Aucune activité sur cette période.</div>
          ) : (
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
                    {i % labelStep === 0 && <span className="absolute left-1/2 top-full mt-[5px] -translate-x-1/2 whitespace-nowrap text-[9px] text-faint">{d.label}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Mes infractions les plus fréquentes */}
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-[13px]"><h2 className="m-0 text-[13.5px] font-bold">Mes infractions fréquentes</h2><div className="mt-[2px] text-[11px] text-faint">{sub}</div></div>
          {!r || r.topCharges.length === 0 ? (
            <div className="p-4 text-[13px] text-faint">Aucune donnée.</div>
          ) : (
            r.topCharges.map((c, i) => {
              const max = r.topCharges[0].count;
              return (
                <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-[9px]">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{c.name}</span>
                  <div className="h-[7px] w-[110px] overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${(c.count / max) * 100}%`, background: "var(--accent)" }} /></div>
                  <span className="w-[32px] text-right font-data text-[12px] font-semibold">{c.count}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------- Mon activité ----------------------------
function ActivityTab() {
  const rows = useQuery(api.activity.myActivity, {});
  const navigate = useNavigate();
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface" style={{ animation: "mdtFade .2s ease" }}>
      <div className="border-b border-border px-4 py-[13px]"><h2 className="m-0 text-[13.5px] font-bold">Mon activité récente</h2><div className="mt-[2px] text-[11px] text-faint">Toutes vos actions tracées dans le MDT.</div></div>
      {rows === undefined ? (
        <div className="p-4"><SkeletonRows rows={6} /></div>
      ) : rows.length === 0 ? (
        <EmptyState title="Aucune activité" message="Vos créations et modifications apparaîtront ici." />
      ) : (
        rows.map((l) => (
          <div
            key={l._id}
            onClick={() => l.link && navigate(l.link)}
            className={`flex items-center gap-3 border-b border-border px-4 py-[10px] last:border-0 ${l.link ? "cursor-pointer hover:bg-surface-2" : ""}`}
          >
            <span className="rounded-[4px] border border-border bg-surface-2 px-[7px] py-[2px] text-[10px] font-semibold text-muted">{resourceLabel(l.resourceType)}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px]">
                Vous {actionLabel(l.action)}
                {l.resourceLabel && <span className="text-muted"> — {l.resourceLabel}</span>}
              </div>
            </div>
            {l.link && <span className="text-[11.5px] font-semibold text-accent">Ouvrir →</span>}
            <span className="font-data text-[11px] text-faint">{new Date(l.at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}</span>
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------- Paramètres ----------------------------
function SettingsTab() {
  const prefs = usePrefs();
  const { mode, toggleMode } = useApp();
  return (
    <div className="grid grid-cols-1 items-start gap-[16px] lg:grid-cols-[1fr_1fr]" style={{ animation: "mdtFade .2s ease" }}>
      {/* Synchronisation NexusMDT */}
      <div><NexusSyncCard /></div>

      {/* Préférences d'affichage */}
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="border-b border-border px-4 py-[13px]"><h2 className="m-0 text-[13.5px] font-bold">Affichage</h2></div>
        <Toggle label="Thème sombre" hint="Bascule entre le thème clair et sombre du MDT." on={mode === "dark"} onToggle={toggleMode} />
        <Toggle label="Barre latérale réductible" hint="Réduit la barre de navigation à ses icônes." on={prefs.sidebarCollapsible} onToggle={() => setPref("sidebarCollapsible", !prefs.sidebarCollapsible)} />
        <Toggle label="Déploiement au survol" hint="La barre réduite s'élargit quand la souris la survole." on={prefs.sidebarHoverExpand} disabled={!prefs.sidebarCollapsible} onToggle={() => setPref("sidebarHoverExpand", !prefs.sidebarHoverExpand)} />
        {FEATURES.dispatch && <Toggle label="Dispatch compact" hint="Resserre en hauteur les cartes de patrouille sur le tableau Dispatch." on={prefs.dispatchCompact} onToggle={() => setPref("dispatchCompact", !prefs.dispatchCompact)} />}
      </div>
    </div>
  );
}

function Toggle({ label, hint, on, onToggle, disabled }: { label: string; hint: string; on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-3 border-b border-border px-4 py-[13px] last:border-0 ${disabled ? "opacity-50" : "cursor-pointer"}`} title={disabled ? "Nécessite la barre latérale réductible." : undefined}>
      <div className="flex-1">
        <div className="text-[13px] font-semibold">{label}</div>
        <div className="mt-[2px] text-[11.5px] text-muted">{hint}</div>
      </div>
      <button onClick={disabled ? undefined : onToggle} disabled={disabled} className="relative h-[24px] w-[42px] flex-shrink-0 rounded-full transition-colors" style={{ background: on ? "var(--accent)" : "var(--surface-2)", border: "1px solid var(--border)" }}>
        <span className="absolute top-[2px] flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white transition-[left]" style={{ left: on ? 21 : 2 }}>
          {label === "Thème sombre" && (on ? <Moon className="h-[11px] w-[11px] text-accent" /> : <Sun className="h-[11px] w-[11px] text-muted" />)}
        </span>
      </button>
    </label>
  );
}
