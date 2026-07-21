import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Clover } from "./Clover";
import { InlineLoader } from "./Loader";

type Variant = "primary" | "secondary" | "danger" | "ghost";

// Élément 2 du handoff : boutons d'action. Principale pleine (accent + trèfle),
// secondaire contour neutre, variante danger. Micro-interaction d'enfoncement incluse.
export function Button({
  variant = "secondary",
  clover,
  loading = false,
  block = false,
  children,
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  clover?: boolean; // force l'affichage du trèfle (par défaut : oui sur primary)
  loading?: boolean;
  block?: boolean;
  children?: ReactNode;
}) {
  const base =
    "mdt-press inline-flex items-center justify-center gap-[8px] rounded-[9px] px-[14px] py-[9px] text-[13px] font-semibold disabled:opacity-50 disabled:pointer-events-none";
  const variants: Record<Variant, string> = {
    primary: "bg-accent text-accent-contrast hover:brightness-[1.06] border border-transparent",
    secondary: "bg-surface-2 text-text border border-border hover:border-border-strong",
    danger: "bg-transparent text-danger border hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]",
    ghost: "bg-transparent text-muted hover:text-text hover:bg-surface-2 border border-transparent",
  };
  const showClover = clover ?? variant === "primary";
  return (
    <button
      className={`${base} ${variants[variant]} ${block ? "w-full" : ""} ${className}`}
      style={variant === "danger" ? { borderColor: "color-mix(in srgb, var(--danger) 40%, transparent)" } : undefined}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <InlineLoader />
      ) : (
        <>
          {showClover && <Clover color={variant === "primary" ? "#fff" : "var(--accent)"} size={17} />}
          {children}
        </>
      )}
    </button>
  );
}
