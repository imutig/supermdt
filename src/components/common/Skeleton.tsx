import type { CSSProperties } from "react";

// Bloc de chargement scintillant. Sert de brique à tous les squelettes.
export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div className={`mdt-skeleton ${className}`} style={style} />;
}

// Lignes de texte simulées (listes, tableaux).
export function SkeletonRows({ rows = 5, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton style={{ height: 30, width: 30, borderRadius: 8 }} />
          <Skeleton style={{ height: 12, flex: 1, maxWidth: `${70 - (i % 3) * 12}%` }} />
          <Skeleton style={{ height: 12, width: 54 }} />
        </div>
      ))}
    </div>
  );
}

// Cartes simulées (grilles de cartes / stat cards).
export function SkeletonCards({ count = 4, height = 74, className = "" }: { count?: number; height?: number; className?: string }) {
  return (
    <div className={`grid gap-3 ${className}`} style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} style={{ height }} />
      ))}
    </div>
  );
}
