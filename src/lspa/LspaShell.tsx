import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Home, Users, GraduationCap, ClipboardList, History, ShieldCheck, ArrowLeftRight, Sun, Moon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useApp } from "@/providers/app-state";
import { useCan } from "@/hooks/useCan";
import { usePortals } from "@/hooks/usePortals";
import { usePrefs } from "@/hooks/usePrefs";
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
  { to: "/lspa/promotions", label: "Promotions", icon: GraduationCap, perm: "lspa.effectif.view" },
  { to: "/lspa/quiz", label: "Quiz", icon: ClipboardList },
  { to: "/lspa/historique", label: "Historique", icon: History, perm: "lspa.session.manage" },
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
        <LspaNav items={items} />

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

// Rail de navigation de l'académie. Respecte les mêmes préférences que le MDT :
// réduction à ses icônes (auto sur tablette) et déploiement au survol.
function LspaNav({ items }: { items: Item[] }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { sidebarCollapsible, sidebarHoverExpand } = usePrefs();
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const compact = sidebarCollapsible || narrow;
  const isActive = (to: string) => (to === "/lspa" ? location.pathname === "/lspa" : location.pathname.startsWith(to));

  if (compact) {
    return (
      <div className="relative w-[58px] flex-shrink-0">
        <div
          className={`group absolute inset-y-0 left-0 z-40 flex w-[58px] flex-col gap-[2px] overflow-y-auto overflow-x-hidden border-r border-border bg-surface p-[10px_9px] transition-[width] duration-200 ${
            sidebarHoverExpand ? "hover:w-[210px] hover:shadow-[10px_0_40px_var(--shadow)]" : ""
          }`}
        >
          <div className={`h-0 max-w-full overflow-hidden whitespace-nowrap px-[6px] text-[9.5px] font-bold uppercase tracking-[0.11em] text-faint opacity-0 transition-all duration-200 ${sidebarHoverExpand ? "group-hover:h-[16px] group-hover:opacity-100" : ""}`}>
            Académie
          </div>
          {items.map((i) => {
            const active = isActive(i.to);
            return (
              <button
                key={i.to}
                onClick={() => navigate(i.to)}
                title={i.label}
                aria-label={i.label}
                className={`flex h-[38px] w-full flex-shrink-0 items-center justify-center rounded-sm hover:bg-surface-2 ${
                  sidebarHoverExpand ? "group-hover:justify-start group-hover:gap-[11px] group-hover:px-[8px]" : ""
                }`}
                style={active ? { background: "var(--accent-soft)" } : undefined}
              >
                <i.icon className="h-5 w-5 flex-shrink-0" strokeWidth={2} style={{ color: active ? "var(--accent)" : "var(--faint)" }} />
                {sidebarHoverExpand && (
                  <span
                    className="max-w-0 overflow-hidden whitespace-nowrap text-[13px] opacity-0 transition-all duration-200 group-hover:max-w-[150px] group-hover:opacity-100"
                    style={active ? { color: "var(--accent)", fontWeight: 600 } : { color: "var(--muted)", fontWeight: 500 }}
                  >
                    {i.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
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
          style={({ isActive: a }) =>
            a ? { background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600 } : { color: "var(--muted)" }
          }
        >
          {({ isActive: a }) => (
            <>
              <i.icon className="h-5 w-5 flex-shrink-0" strokeWidth={2} style={{ color: a ? "var(--accent)" : "var(--faint)" }} />
              {i.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
