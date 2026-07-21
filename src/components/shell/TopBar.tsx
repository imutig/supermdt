import { Search, Sun, Moon } from "lucide-react";
import { useApp } from "@/providers/app-state";
import { useService } from "@/hooks/useService";
import { ServiceToggle } from "@/components/common/ServiceToggle";
import { DispatchStatus } from "./DispatchStatus";
import { ProfileMenu } from "./ProfileMenu";

// Barre unique. Elle était doublée d'une bande « dev » qui coûtait une ligne
// entière pour un titre et un sélecteur de thème : les deux sont ici, et le
// DEFCON a rejoint l'administration où il se règle.
export function TopBar() {
  const { openSearch, mode, toggleMode } = useApp();
  const { onDuty, toggle: toggleDuty } = useService();

  return (
    <div className="z-[5] flex h-[50px] flex-shrink-0 items-center gap-[10px] border-b border-border bg-surface px-[14px]">
      {/* Logo. Le sous-titre disparaît sous 1280px : sur la tablette in-game,
          chaque pixel de hauteur et de largeur compte. */}
      <div className="flex flex-shrink-0 items-center gap-[9px]">
        <img src="/logos/logo-mark.svg" alt="Station 13" className="h-[26px] w-[26px]" />
        <div className="hidden leading-[1.05] xl:block">
          <div className="text-[13px] font-bold tracking-[0.01em]">LSPD · Station 13</div>
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-faint">
            Mobile Data Terminal
          </div>
        </div>
      </div>

      <button
        onClick={openSearch}
        className="flex h-[34px] min-w-[120px] max-w-[420px] flex-1 cursor-text items-center gap-[9px] rounded-[9px] border border-border bg-surface-2 px-[10px] text-[13px] text-muted hover:border-border-strong"
      >
        <Search className="h-[15px] w-[15px] flex-shrink-0 text-faint" strokeWidth={2} />
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
          Rechercher…
        </span>
        <span className="hidden rounded-[5px] border border-border px-[6px] py-px font-data text-[11px] text-faint lg:inline">
          ⌘K
        </span>
      </button>

      <div className="flex-1" />

      <DispatchStatus />

      <div className="flex-shrink-0 rounded-[9px] border border-border bg-surface-2 px-[10px] py-[5px]">
        <ServiceToggle onDuty={onDuty} onToggle={toggleDuty} />
      </div>

      <button
        onClick={toggleMode}
        title={mode === "dark" ? "Passer en clair" : "Passer en sombre"}
        className="mdt-press flex h-[32px] w-[32px] flex-shrink-0 items-center justify-center rounded-[9px] border border-border bg-surface-2 text-muted hover:border-border-strong hover:text-text"
      >
        {mode === "dark" ? <Moon className="h-[15px] w-[15px]" /> : <Sun className="h-[15px] w-[15px]" />}
      </button>

      <ProfileMenu />
    </div>
  );
}
