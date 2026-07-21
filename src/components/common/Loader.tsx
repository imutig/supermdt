import { Clover } from "./Clover";

// Élément 4 du handoff : trèfle en rotation continue.
export function Spinner({ size = 22, color = "var(--accent)" }: { size?: number; color?: string }) {
  return <Clover color={color} size={size} spin />;
}

// Écran / bloc de chargement centré, à utiliser tant qu'une requête n'a pas répondu.
export function LoadingScreen({ label = "Chargement…", pad = 64 }: { label?: string; pad?: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-center mdt-reveal" style={{ paddingTop: pad, paddingBottom: pad }}>
      <Spinner size={38} />
      <div className="text-[12.5px] text-muted">{label}</div>
    </div>
  );
}

// Chargement en ligne (dans un bouton, une barre…).
export function InlineLoader({ label, size = 15 }: { label?: string; size?: number }) {
  return (
    <span className="inline-flex items-center gap-[7px]">
      <Spinner size={size} color="currentColor" />
      {label && <span>{label}</span>}
    </span>
  );
}
