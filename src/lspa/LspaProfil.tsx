import { useMe } from "@/hooks/useMe";
import { usePrefs, setPref } from "@/hooks/usePrefs";
import { fmtMatricule } from "@/components/common/AgentTag";
import { fmtAnciennete } from "@/lib/anciennete";
import { SkeletonRows } from "@/components/common/Skeleton";

// Profil dans le portail de l'académie. Volontairement limité à l'identité du
// compte et aux préférences d'affichage : aucun élément opérationnel du MDT
// (heures de service, arrestations, contraventions, rapports) n'y figure. Les
// deux surfaces partagent le compte, pas le contenu.
export function LspaProfil() {
  const me = useMe();
  const prefs = usePrefs();

  if (me === undefined || me === null) {
    return <div className="p-[22px_26px]"><div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={4} /></div></div>;
  }

  const a = me.agent;
  const initials = `${a.prenomRP.charAt(0)}${a.nomRP.charAt(0)}`.toUpperCase();
  const gradeName = a.isOwner ? "Owner" : me.grade?.name ?? "Sans grade";
  const rank = me.academyRank;
  // Un cadet n'a pas de numéro de badge : il n'est assermenté qu'au terme de
  // sa formation.
  const isCadet = me.grade?.academyOnly === true;
  const badge = !isCadet ? fmtMatricule(a.matricule) : null;

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      {/* Identité du compte */}
      <div className="mb-[18px] flex items-center gap-4 rounded-card border border-border bg-surface p-5">
        {a.avatarUrl ? (
          <img src={a.avatarUrl} alt="" className="h-[64px] w-[64px] rounded-[12px] border border-border object-cover" />
        ) : (
          <div className="flex h-[64px] w-[64px] items-center justify-center rounded-[12px] border border-border bg-surface-2 text-[22px] font-bold text-muted">{initials}</div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[22px] font-bold tracking-tight">{a.prenomRP} {a.nomRP}</h1>
          <div className="mt-1 text-[13px] text-muted">
            {badge && <span className="font-data text-accent">{badge} · </span>}
            {gradeName} · @{a.login}
          </div>
          {rank && (
            <div className="mt-[8px]">
              <span
                className="rounded-[6px] px-[9px] py-[3px] text-[11.5px] font-semibold"
                style={{ background: `color-mix(in srgb, ${rank.color ?? "var(--accent)"} 14%, transparent)`, color: rank.color ?? "var(--accent)" }}
                title="Grade d'académie"
              >
                {rank.name}
              </span>
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Ancienneté</div>
          <div className="mt-1 text-[15px] font-bold">{fmtAnciennete(a.dateEntree)}</div>
          {a.dateEntree && <div className="text-[11px] text-faint">depuis le {new Date(a.dateEntree).toLocaleDateString("fr-FR", { timeZone: "UTC" })}</div>}
        </div>
      </div>

      {/* Préférences d'affichage (partagées avec le MDT car liées au compte) */}
      <div className="max-w-[560px] overflow-hidden rounded-card border border-border bg-surface">
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
      </div>
    </div>
  );
}

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
