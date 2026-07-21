import { useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { fmtMatricule } from "@/components/common/AgentTag";
import { fmtAnciennete } from "@/lib/anciennete";
import { SkeletonRows } from "@/components/common/Skeleton";
import { usePrefs, setPref } from "@/hooks/usePrefs";

function fmtHours(ms: number) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h${m > 0 ? String(m).padStart(2, "0") : ""}`;
}

const REPORT_STATUS: Record<string, { label: string; color: string }> = {
  BROUILLON: { label: "Brouillon", color: "var(--muted)" },
  SOUMIS: { label: "Soumis", color: "var(--warning)" },
  VALIDE: { label: "Validé", color: "var(--success)" },
};

export function Profil() {
  const p = useQuery(api.profile.me);
  const prefs = usePrefs();
  const navigate = useNavigate();

  if (p === undefined) {
    return <div className="p-[22px_26px]"><div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={6} /></div></div>;
  }

  const a = p.agent;
  const initials = `${a.prenomRP.charAt(0)}${a.nomRP.charAt(0)}`.toUpperCase();

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      {/* En-tête profil */}
      <div className="mb-[18px] flex items-center gap-4 rounded-card border border-border bg-surface p-5">
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
              <span
                key={`q${i}`}
                title={`${q.name} · ${q.kind === "FORMATION" ? "formation" : "spécialité"} · obtenue le ${new Date(q.at).toLocaleDateString("fr-FR")}`}
                className="rounded-[6px] border px-[9px] py-[3px] text-[11.5px] font-semibold"
                style={q.color
                  ? { borderColor: q.color, color: q.color, background: `color-mix(in srgb, ${q.color} 12%, transparent)` }
                  : { borderColor: "var(--border)", color: "var(--muted)", background: "var(--surface-2)" }}
              >
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

      {/* Stats perso */}
      <div className="mb-[18px] grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border md:grid-cols-4">
        <div className="bg-surface px-[15px] py-[14px]"><div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Heures de service</div><div className="font-data text-[19px] font-bold">{fmtHours(p.service.totalMs)}</div><div className="mt-[2px] text-[11px] text-muted">{fmtHours(p.service.weekMs)} cette semaine</div></div>
        <div className="bg-surface px-[15px] py-[14px]"><div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Arrestations</div><div className="font-data text-[19px] font-bold">{p.activity.myArrests}</div><div className="mt-[2px] text-[11px] text-muted">{p.activity.myArrestsMonth} sur 30j</div></div>
        <div className="bg-surface px-[15px] py-[14px]"><div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Contraventions</div><div className="font-data text-[19px] font-bold">{p.activity.myCitations}</div><div className="mt-[2px] text-[11px] text-muted">{p.activity.myCitationsMonth} sur 30j</div></div>
        <div className="bg-surface px-[15px] py-[14px]"><div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Services</div><div className="font-data text-[19px] font-bold">{p.service.sessionCount}</div><div className="mt-[2px] text-[11px] text-muted">{p.service.openSince ? "en service" : "sessions"}</div></div>
      </div>

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1.4fr_1fr]">
        {/* Mes rapports */}
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-[13px]"><h2 className="m-0 text-[13.5px] font-bold">Mes rapports</h2></div>
          {p.reports.length === 0 ? (
            <div className="p-4 text-[13px] text-faint">Aucun rapport.</div>
          ) : (
            p.reports.map((r) => {
              const st = REPORT_STATUS[r.status] ?? REPORT_STATUS.BROUILLON;
              return (
                <div key={r._id} onClick={() => navigate(`/rapport/${r._id}`)} className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-[11px] hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">{r.title}</div>
                    <div className="text-[11.5px] text-faint">{new Date(r.at).toLocaleDateString("fr-FR")} · {r.role}</div>
                  </div>
                  <span className="rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${st.color} 14%, transparent)`, color: st.color }}>{st.label}</span>
                </div>
              );
            })
          )}
        </div>

        {/* Paramètres perso */}
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-[13px]"><h2 className="m-0 text-[13.5px] font-bold">Paramètres</h2></div>
          <Toggle
            label="Barre latérale réductible"
            hint="Réduit la barre de navigation à ses icônes."
            on={prefs.sidebarCollapsible}
            onToggle={() => setPref("sidebarCollapsible", !prefs.sidebarCollapsible)}
          />
          <Toggle
            label="Déploiement au survol"
            hint="La barre réduite s'élargit quand la souris la survole. Désactivez pour qu'elle reste strictement compacte."
            on={prefs.sidebarHoverExpand}
            disabled={!prefs.sidebarCollapsible}
            onToggle={() => setPref("sidebarHoverExpand", !prefs.sidebarHoverExpand)}
          />
          <Toggle
            label="Dispatch compact"
            hint="Resserre les cartes de patrouille en hauteur : utile sur un écran de tablette."
            on={prefs.dispatchCompact}
            onToggle={() => setPref("dispatchCompact", !prefs.dispatchCompact)}
          />
        </div>
      </div>
    </div>
  );
}

// Interrupteur de préférence, réutilisé par la liste des paramètres.
function Toggle({ label, hint, on, onToggle, disabled }: {
  label: string; hint: string; on: boolean; onToggle: () => void; disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-3 border-b border-border px-4 py-[13px] last:border-0 ${disabled ? "opacity-50" : "cursor-pointer"}`}
      title={disabled ? "Nécessite la barre latérale réductible." : undefined}
    >
      <div className="flex-1">
        <div className="text-[13px] font-semibold">{label}</div>
        <div className="mt-[2px] text-[11.5px] text-muted">{hint}</div>
      </div>
      <button
        onClick={disabled ? undefined : onToggle}
        disabled={disabled}
        className="relative h-[24px] w-[42px] flex-shrink-0 rounded-full transition-colors"
        style={{ background: on ? "var(--accent)" : "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        <span className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white transition-[left]" style={{ left: on ? 21 : 2 }} />
      </button>
    </label>
  );
}
