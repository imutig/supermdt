import { Suspense, useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Home, Users, ClipboardList, ShieldCheck, ArrowLeftRight, Sun, Moon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useApp } from "@/providers/app-state";
import { useCan } from "@/hooks/useCan";
import { usePortals } from "@/hooks/usePortals";
import { LoadingScreen } from "@/components/common/Loader";
import { ProfileMenu } from "@/components/shell/ProfileMenu";
import { PageBoundary } from "@/components/shell/PageBoundary";

// Enveloppe du portail de l'académie. Structure volontairement proche du MDT
// (barre haute, rail de navigation, contenu) pour ne pas dérouter, mais avec sa
// propre navigation : les deux surfaces n'ont rien de commun au-delà du compte.
type Item = { to: string; label: string; icon: LucideIcon; perm?: string };

const ITEMS: Item[] = [
  { to: "/lspa", label: "Accueil", icon: Home },
  { to: "/lspa/effectif", label: "Effectif", icon: Users, perm: "lspa.effectif.view" },
  { to: "/lspa/quiz", label: "Quiz", icon: ClipboardList },
  // Même administration que le MDT (validation des comptes, invitations,
  // permissions…), accessible ici pour l'encadrement de l'académie.
  { to: "/lspa/admin", label: "Administration", icon: ShieldCheck, perm: "effectif.validate" },
];

export function LspaShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { mode, toggleMode, exitFocus } = useApp();
  const { can, ready } = useCan();
  const { canMdt } = usePortals();

  const routeKey = location.pathname;
  useEffect(() => { exitFocus(); }, [routeKey, exitFocus]);

  const items = ITEMS.filter((i) => !i.perm || !ready || can(i.perm));

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="z-[5] flex h-[50px] flex-shrink-0 items-center gap-[10px] border-b border-border bg-surface px-[14px]">
        <div className="flex flex-shrink-0 items-center gap-[9px]">
          <img src="/logos/lspa-badge.svg" alt="LSPA" className="h-[28px] w-[28px]" />
          <div className="hidden leading-[1.05] xl:block">
            <div className="text-[13px] font-bold tracking-[0.01em]">Portail LSPA</div>
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-faint">
              Los Santos Police Academy
            </div>
          </div>
        </div>

        <div className="flex-1" />

        {canMdt && (
          <button
            onClick={() => navigate("/portail")}
            title="Changer de portail"
            className="mdt-press flex flex-shrink-0 items-center gap-[7px] rounded-[9px] border border-border bg-surface-2 px-[11px] py-[6px] text-[12.5px] font-semibold text-muted hover:border-border-strong"
          >
            <ArrowLeftRight className="h-[14px] w-[14px]" />
            <span className="hidden sm:inline">Portail</span>
          </button>
        )}

        <button
          onClick={toggleMode}
          title={mode === "dark" ? "Passer en clair" : "Passer en sombre"}
          className="mdt-press flex h-[32px] w-[32px] flex-shrink-0 items-center justify-center rounded-[9px] border border-border bg-surface-2 text-muted hover:border-border-strong hover:text-text"
        >
          {mode === "dark" ? <Moon className="h-[15px] w-[15px]" /> : <Sun className="h-[15px] w-[15px]" />}
        </button>

        <ProfileMenu />
      </div>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-[196px] flex-shrink-0 flex-col gap-[2px] border-r border-border bg-surface p-[12px_10px]">
          <div className="px-3 pb-[5px] pt-[3px] text-[9.5px] font-bold uppercase tracking-[0.11em] text-faint">
            Académie
          </div>
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.to === "/lspa"}
              className="flex h-[38px] flex-shrink-0 items-center gap-[11px] rounded-sm px-[10px] text-[13px] font-medium hover:bg-surface-2"
              style={({ isActive }) =>
                isActive
                  ? { background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600 }
                  : { color: "var(--muted)" }
              }
            >
              {({ isActive }) => (
                <>
                  <i.icon className="h-5 w-5 flex-shrink-0" strokeWidth={2} style={{ color: isActive ? "var(--accent)" : "var(--faint)" }} />
                  {i.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div key={routeKey} className="mdt-page flex min-h-full flex-col">
            <PageBoundary resetKey={routeKey}>
              <Suspense fallback={<LoadingScreen label="Chargement…" />}>
                <Outlet />
              </Suspense>
            </PageBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
