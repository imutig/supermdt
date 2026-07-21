import type { CSSProperties } from "react";

// Trèfle Station 13 appliqué en masque CSS : la couleur vient du `background`,
// donc on change de teinte sans recharger d'image. Base de tout le système visuel.
export function Clover({
  color = "var(--accent)",
  size = 16,
  opacity = 1,
  className = "",
  spin = false,
  style,
}: {
  color?: string;
  size?: number;
  opacity?: number;
  className?: string;
  spin?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={`${spin ? "mdt-spin " : ""}${className}`}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        flexShrink: 0,
        background: color,
        opacity,
        WebkitMask: "url(/logos/logo-mark.svg) center/contain no-repeat",
        mask: "url(/logos/logo-mark.svg) center/contain no-repeat",
        ...style,
      }}
    />
  );
}
