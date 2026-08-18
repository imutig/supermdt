import { useAgentCard } from "./AgentCard";

// Affichage standardisé d'un agent : « #NuméroDeBadge Prénom Nom ».
// Le numéro de badge est un identifiant à 5 chiffres (owner = 00000).

export function fmtBadge(m: number | null | undefined) {
  if (m == null) return null;
  return `#${String(m).padStart(5, "0")}`;
}
// Alias conservé pour compatibilité (ancien nom).
export const fmtMatricule = fmtBadge;

// Photo pro de l'agent (ronde), repli sur les initiales si aucune photo.
// Réutilisable partout (effectif, dispatch, présence, classements…). Avec `agentId`,
// un clic ouvre la carte profil contextuelle (hovercard) ancrée à la photo.
export function AgentAvatar({ url, name, size = 24, className = "", agentId }: { url?: string | null; name?: string | null; size?: number; className?: string; agentId?: string | null }) {
  const openCard = useAgentCard();
  const initials = (name ?? "").split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  const inner = url ? (
    <img src={url} alt="" className={`block h-full w-full rounded-full border border-border object-cover ${className}`} />
  ) : (
    <span className={`inline-flex h-full w-full items-center justify-center rounded-full border border-border bg-surface-2 font-semibold text-muted ${className}`} style={{ fontSize: Math.round(size * 0.38) }}>{initials}</span>
  );
  if (agentId && openCard) {
    return (
      <button
        type="button"
        title={name ?? undefined}
        onClick={(e) => { e.stopPropagation(); openCard(agentId, e.currentTarget.getBoundingClientRect()); }}
        onPointerDown={(e) => e.stopPropagation()}
        className="block shrink-0 cursor-pointer rounded-full outline-none transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:ring-accent"
        style={{ width: size, height: size, lineHeight: 0 }}
      >
        {inner}
      </button>
    );
  }
  return <span className="inline-block shrink-0" style={{ width: size, height: size, lineHeight: 0 }}>{inner}</span>;
}

export function AgentTag({
  agent,
  className = "",
  muted = false,
  avatar = false,
}: {
  // `linked === false` : nom écrit dans un rapport importé, non rattaché à un
  // compte du MDT (agent parti / jamais créé). Affiché sans badge, en discret.
  agent: { matricule: number | null; name: string; linked?: boolean; avatarUrl?: string | null } | null | undefined;
  className?: string;
  muted?: boolean;
  avatar?: boolean;
}) {
  if (!agent) return <span className={className}>-</span>;
  if (avatar && agent.linked !== false) {
    const mat = fmtMatricule(agent.matricule);
    return (
      <span className={`inline-flex items-center gap-[6px] ${className}`}>
        <AgentAvatar url={agent.avatarUrl} name={agent.name} size={20} />
        {mat && <span className="font-data font-semibold text-accent" style={muted ? { opacity: 0.85 } : undefined}>{mat}</span>}
        <span>{agent.name}</span>
      </span>
    );
  }
  if (agent.linked === false) {
    const name = (agent.name || "").trim();
    // Aucun officier réel (placeholder) : on n'affiche pas le badge « non relié ».
    if (!name || name === "-") return <span className={className}>-</span>;
    const mat = fmtMatricule(agent.matricule);
    return (
      <span className={`inline-flex items-center gap-1 ${className}`}>
        {mat && <span className="font-data italic text-muted">{mat}</span>}
        <span className="italic text-muted">{name}</span>
        <span
          title="Officier issu du Nexus, non relié à un compte du MDT (ancien agent ou compte pas encore créé)"
          className="rounded border border-white/10 bg-white/5 px-1 text-[10px] uppercase tracking-wide text-muted"
        >
          non relié
        </span>
      </span>
    );
  }
  const mat = fmtMatricule(agent.matricule);
  return (
    <span className={className}>
      {mat && (
        <span
          className="font-data font-semibold text-accent"
          style={muted ? { opacity: 0.85 } : undefined}
        >
          {mat}
        </span>
      )}
      {mat ? " " : ""}
      {agent.name}
    </span>
  );
}
