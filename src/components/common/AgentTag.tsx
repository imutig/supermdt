// Affichage standardisé d'un agent : « #NuméroDeBadge Prénom Nom ».
// Le numéro de badge est un identifiant à 5 chiffres (owner = 00000).

export function fmtBadge(m: number | null | undefined) {
  if (m == null) return null;
  return `#${String(m).padStart(5, "0")}`;
}
// Alias conservé pour compatibilité (ancien nom).
export const fmtMatricule = fmtBadge;

export function AgentTag({
  agent,
  className = "",
  muted = false,
}: {
  // `linked === false` : nom écrit dans un rapport importé, non rattaché à un
  // compte du MDT (agent parti / jamais créé). Affiché sans badge, en discret.
  agent: { matricule: number | null; name: string; linked?: boolean } | null | undefined;
  className?: string;
  muted?: boolean;
}) {
  if (!agent) return <span className={className}>-</span>;
  if (agent.linked === false) {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`}>
        <span className="italic text-muted">{agent.name || "?"}</span>
        <span
          title="Nom saisi dans le rapport, non relié à un agent du MDT"
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
