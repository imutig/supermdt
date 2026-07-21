import type { ReactNode } from "react";
import { Sun, Moon } from "lucide-react";
import { useApp } from "@/providers/app-state";

// Cadre commun des écrans d'accès (Station 13) : marque + carte + pied de page.
export function AuthShell({ children, maxWidth = 400 }: { children: ReactNode; maxWidth?: number }) {
  const { mode, toggleMode } = useApp();
  return (
    <div className="relative flex h-full items-center justify-center overflow-y-auto bg-bg p-6">
      <button
        onClick={toggleMode}
        title={mode === "dark" ? "Passer en clair" : "Passer en sombre"}
        className="absolute right-5 top-5 flex h-[36px] w-[36px] items-center justify-center rounded-[10px] border border-border bg-surface text-muted hover:border-border-strong hover:text-text"
      >
        {mode === "dark" ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
      </button>
      <div className="w-full" style={{ maxWidth, animation: "s13Rise .45s cubic-bezier(.16,1,.3,1)" }}>
        <div className="mb-6 flex flex-col items-center gap-[13px]">
          <img src="/logos/logo-badge.svg" alt="LSPD Station 13" className="h-[84px] w-[84px]" />
          <div className="text-center">
            <div className="text-[20px] font-bold leading-none tracking-[-0.01em] text-text">
              LSPD · Station 13
            </div>
            <div className="mt-[7px] text-[10.5px] font-bold uppercase tracking-[0.2em] text-accent">
              Mobile Data Terminal
            </div>
          </div>
        </div>
        <div
          className="overflow-hidden rounded-[14px] border border-border bg-surface"
          style={{ boxShadow: "0 12px 40px var(--shadow)" }}
        >
          {children}
        </div>
        <div className="mt-[18px] text-center text-[11px] tracking-[0.03em] text-faint">
          Accès réservé au personnel assermenté · Lucky Thirteen · Newton Street
        </div>
      </div>
    </div>
  );
}

// Champ générique (conservé pour compatibilité).
export function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-[7px] block text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
        {label}
      </span>
      <input
        {...props}
        className="h-[46px] w-full rounded-[10px] border border-border bg-surface-2 px-[14px] text-[14px] text-text outline-none focus:border-accent"
      />
    </label>
  );
}

export function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="h-[46px] w-full rounded-[10px] bg-accent text-[14px] font-bold text-accent-contrast hover:brightness-[1.06] disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-faint disabled:shadow-[inset_0_0_0_1px_var(--border)]"
    >
      {children}
    </button>
  );
}
