import { useNavigate } from "react-router-dom";
import { GraduationCap, Radio, Lock, ArrowRight } from "lucide-react";
import { useMe } from "@/hooks/useMe";
import { usePortals } from "@/hooks/usePortals";
import { LoadingScreen } from "@/components/common/Loader";

// Écran d'aiguillage : MDT opérationnel ou portail de l'académie.
// Les deux surfaces partagent le même compte, seul le contenu diffère.
export function PortalChoice() {
  const me = useMe();
  const navigate = useNavigate();
  const { canMdt, canLspa, ready } = usePortals();

  if (!ready || !me) return <LoadingScreen label="Chargement des accès…" />;

  return (
    <div className="flex min-h-full flex-col items-center justify-center p-[26px]" style={{ animation: "mdtFade .25s ease" }}>
      <div className="mb-[30px] flex flex-col items-center text-center">
        <img src="/logos/logo-mark.svg" alt="" className="mb-[14px] h-[46px] w-[46px]" />
        <h1 className="m-0 text-[24px] font-bold tracking-tight">Bonjour, {me.agent.prenomRP}.</h1>
        <p className="mt-[7px] mb-0 max-w-[430px] text-[13.5px] leading-[1.55] text-muted">
          Choisissez la surface à ouvrir. Vous pourrez basculer de l'une à l'autre à tout moment.
        </p>
      </div>

      <div className="grid w-full max-w-[760px] grid-cols-1 gap-[16px] md:grid-cols-2">
        <PortalCard
          icon={<Radio className="h-[26px] w-[26px]" />}
          tint="#49A24A"
          title="MDT · Station 13"
          subtitle="Mobile Data Terminal"
          lines={["Dossiers citoyens et casiers", "Dispatch et patrouilles", "Rapports, mandats, véhicules"]}
          enabled={canMdt}
          lockedLabel="Réservé aux agents assermentés"
          onOpen={() => navigate("/")}
        />
        <PortalCard
          icon={<GraduationCap className="h-[26px] w-[26px]" />}
          tint="#3B82F6"
          title="Portail LSPA"
          subtitle="Los Santos Police Academy"
          lines={["Formation des cadets", "Quiz et évaluations", "Suivi de promotion"]}
          enabled={canLspa}
          lockedLabel="Accès non accordé"
          onOpen={() => navigate("/lspa")}
        />
      </div>
    </div>
  );
}

function PortalCard({
  icon, tint, title, subtitle, lines, enabled, lockedLabel, onOpen,
}: {
  icon: React.ReactNode;
  tint: string;
  title: string;
  subtitle: string;
  lines: string[];
  enabled: boolean;
  lockedLabel: string;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={enabled ? onOpen : undefined}
      disabled={!enabled}
      className={`group mdt-reveal flex flex-col rounded-card border p-[20px] text-left transition-all ${
        enabled ? "mdt-press cursor-pointer hover:shadow-[0_14px_44px_var(--shadow)]" : "cursor-not-allowed"
      }`}
      style={{
        borderColor: enabled ? "var(--border-strong)" : "var(--border)",
        background: enabled ? `color-mix(in srgb, ${tint} 5%, var(--surface))` : "var(--surface)",
        opacity: enabled ? 1 : 0.55,
      }}
    >
      <div className="mb-[14px] flex items-center gap-[12px]">
        <span
          className="flex h-[48px] w-[48px] flex-shrink-0 items-center justify-center rounded-[13px]"
          style={{ background: `color-mix(in srgb, ${tint} 16%, transparent)`, color: tint }}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-[16px] font-bold leading-tight">{title}</div>
          <div className="mt-[2px] text-[10.5px] font-semibold uppercase tracking-[0.1em] text-faint">{subtitle}</div>
        </div>
      </div>

      <ul className="m-0 mb-[16px] flex list-none flex-col gap-[6px] p-0">
        {lines.map((l) => (
          <li key={l} className="flex items-center gap-[8px] text-[12.5px] text-muted">
            <span className="h-[4px] w-[4px] flex-shrink-0 rounded-full" style={{ background: tint }} />
            {l}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex items-center gap-[7px] text-[12.5px] font-semibold" style={{ color: enabled ? tint : "var(--faint)" }}>
        {enabled ? (
          <>
            Entrer
            <ArrowRight className="h-[15px] w-[15px] transition-transform group-hover:translate-x-[3px]" />
          </>
        ) : (
          <>
            <Lock className="h-[14px] w-[14px]" />
            {lockedLabel}
          </>
        )}
      </div>
    </button>
  );
}
