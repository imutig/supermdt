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
  agent: { matricule: number | null; name: string } | null | undefined;
  className?: string;
  muted?: boolean;
}) {
  if (!agent) return <span className={className}>-</span>;
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
