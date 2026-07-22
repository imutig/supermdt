import {
  FolderSearch,
  Gavel,
  ReceiptText,
  FileText,
  FileWarning,
  Crosshair,
  Car,
  Radio,
  Boxes,
  CalendarDays,
  Map as MapIcon,
  BookText,
  ListChecks,
  GraduationCap,
  Network,
  Users,
  Clock,
  CalendarOff,
  Settings,
  SlidersHorizontal,
  ShieldAlert,
  BarChart3,
  Archive as ArchiveIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { useApp } from "@/providers/app-state";
import { useCan } from "@/hooks/useCan";
import { usePrefs } from "@/hooks/usePrefs";

interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  to?: string;
  badge?: number;
  admin?: boolean;
  perm?: string; // permission de consultation requise (masque l'item sinon)
  anyPerm?: string[]; // ... ou l'une de ces permissions suffit
}
interface NavGroup {
  label: string;
  items: NavItem[];
  commandOnly?: boolean;
}

const GROUPS: NavGroup[] = [
  {
    label: "Opérations",
    items: [
      { key: "dossiers", label: "Accueil", icon: FolderSearch, to: "/" },
      { key: "dispatch", label: "Dispatch", icon: Radio, to: "/dispatch", perm: "dispatch.view" },
      { key: "mandats", label: "Mandats", icon: Gavel, to: "/mandats", perm: "mandats.view" },
      { key: "plaintes", label: "Plaintes", icon: FileWarning, to: "/plaintes", perm: "plaintes.view" },
      { key: "contraventions", label: "Historique judiciaire", icon: ReceiptText, to: "/contraventions", perm: "contraventions.view" },
      { key: "rapports", label: "Rapports", icon: FileText, to: "/rapports", perm: "rapports.view" },
      { key: "armes", label: "Armes", icon: Crosshair, to: "/armes", perm: "armes.view" },
      { key: "vehicules", label: "Véhicules", icon: Car, to: "/vehicules", anyPerm: ["vehicules.view", "flotte.view"] },
      { key: "saisies", label: "Saisies", icon: Boxes, to: "/saisies", perm: "saisies.view" },
      { key: "carte", label: "Carte", icon: MapIcon, to: "/carte", perm: "carte.view" },
      { key: "calendrier", label: "Calendrier", icon: CalendarDays, to: "/calendrier", perm: "calendrier.view" },
    ],
  },
  {
    label: "Référentiel",
    items: [
      { key: "codepenal", label: "Code pénal", icon: BookText, to: "/codepenal", perm: "codepenal.view" },
      { key: "protocoles", label: "Protocoles", icon: ListChecks, to: "/protocoles", perm: "protocoles.view" },
      { key: "ressources", label: "Ressources", icon: GraduationCap, to: "/ressources", perm: "formations.view" },
    ],
  },
  {
    label: "Effectif",
    items: [
      { key: "effectif", label: "Effectif", icon: Users, to: "/effectif", perm: "effectif.view" },
      { key: "organigramme", label: "Organigramme", icon: Network, to: "/organigramme", perm: "effectif.view" },
      { key: "services", label: "Services", icon: Clock, to: "/services", perm: "service.self" },
      { key: "absences", label: "Absences", icon: CalendarOff, to: "/absences", perm: "absences.request" },
      { key: "discipline", label: "Discipline", icon: ShieldAlert, to: "/discipline", perm: "discipline.view" },
    ],
  },
  {
    label: "Administration",
    commandOnly: true,
    items: [
      { key: "statistiques", label: "Statistiques", icon: BarChart3, admin: true, to: "/statistiques", perm: "stats.view" },
      { key: "config", label: "Configuration", icon: SlidersHorizontal, admin: true, to: "/config", perm: "rbac.manage" },
      { key: "archive", label: "Archive", icon: ArchiveIcon, admin: true, to: "/archive", perm: "archive.view" },
      { key: "admin", label: "Administration", icon: Settings, admin: true, to: "/admin", perm: "effectif.validate" },
    ],
  },
];

export function NavRail() {
  const { clock } = useApp();
  const { can, ready } = useCan();
  const { sidebarCollapsible: collapsible, sidebarHoverExpand } = usePrefs();
  // La section Administration s'ouvre à qui détient l'un de ses droits, et non
  // à un corps de grade décidé en dur.
  const canAdmin = can("rbac.manage") || can("audit.view") || can("effectif.validate") || can("invites.manage");
  const location = useLocation();
  const navigate = useNavigate();
  // Sans permission, la requête lèverait et ferait tomber toute l'application.
  const onlineCount = useQuery(api.agents.presence, can("effectif.view") ? {} : "skip")?.length ?? 0;
  const { navWidth, setNavWidth } = useApp();
  // Rail compact (icônes seules) : préférence utilisateur, ou automatiquement sur tablette (< lg).
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const compact = collapsible || narrow;

  const isActive = (item: NavItem) => {
    if (item.key === "dossiers")
      return location.pathname === "/" || location.pathname.startsWith("/citoyen");
    return !!item.to && location.pathname === item.to;
  };
  // Masque les items sans permission de consultation (§17). Pendant le chargement des perms, on montre tout.
  const canShow = (item: NavItem) =>
    !ready || (item.anyPerm ? item.anyPerm.some((p) => can(p)) : !item.perm || can(item.perm));

  const groups = GROUPS.filter((g) => !g.commandOnly || canAdmin)
    .map((g) => ({ ...g, items: g.items.filter(canShow) }))
    .filter((g) => g.items.length > 0);

  // ---- Rail compact : icônes seules, pas de texte ni d'expansion. ----
  // Rail compact : icônes seules, se déploie en overlay au survol (sans décaler le contenu).
  if (compact) {
    return (
      <div className="relative w-[58px] flex-shrink-0">
        <div
          className={`group absolute inset-y-0 left-0 z-40 flex w-[58px] flex-col gap-[2px] overflow-y-auto overflow-x-hidden border-r border-border bg-surface p-[10px_9px] transition-[width] duration-200 ${
            sidebarHoverExpand ? "hover:w-[220px] hover:shadow-[10px_0_40px_var(--shadow)]" : ""
          }`}
        >
          {groups.map((g, gi) => (
            <div key={g.label} className="flex w-full flex-col gap-[2px]">
              {gi > 0 && <div className="my-[7px] h-px w-full bg-border" />}
              <div className={`h-0 max-w-full overflow-hidden whitespace-nowrap px-[6px] text-[9.5px] font-bold uppercase tracking-[0.11em] text-faint opacity-0 transition-all duration-200 ${sidebarHoverExpand ? "group-hover:h-[16px] group-hover:opacity-100" : ""}`}>
                {g.label}
              </div>
              {g.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item);
                return (
                  <button
                    key={item.key}
                    onClick={() => item.to && navigate(item.to)}
                    title={item.label}
                    aria-label={item.label}
                    className={`flex h-[38px] w-full flex-shrink-0 items-center justify-center gap-0 rounded-sm hover:bg-surface-2 ${
                      sidebarHoverExpand ? "group-hover:justify-start group-hover:gap-[11px] group-hover:px-[8px]" : ""
                    }`}
                    style={active ? { background: "var(--accent-soft)" } : undefined}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" strokeWidth={2} style={{ color: active ? "var(--accent)" : "var(--faint)" }} />
                    {sidebarHoverExpand && (
                      <span
                        className="max-w-0 overflow-hidden whitespace-nowrap text-[13px] opacity-0 transition-all duration-200 group-hover:max-w-[160px] group-hover:opacity-100"
                        style={active ? { color: "var(--text)", fontWeight: 600 } : { color: "var(--muted)", fontWeight: 500 }}
                      >
                        {item.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- Rail complet ----
  return (
    <div className="relative flex flex-shrink-0" style={{ width: navWidth }}>
      <div className="flex min-w-0 flex-1 flex-col gap-[2px] overflow-y-auto border-r border-border bg-surface p-[12px_10px]">
      {groups.map((g) => (
        <div key={g.label} className="mb-2">
          <div className="px-3 pb-[5px] pt-[9px] text-[9.5px] font-bold uppercase tracking-[0.11em] text-faint">
            {g.label}
          </div>
          {g.items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <button
                key={item.key}
                onClick={() => item.to && navigate(item.to)}
                className="flex w-full items-center gap-[10px] rounded-sm px-[11px] py-2 text-left hover:bg-surface-2"
                style={
                  active
                    ? { background: "var(--accent-soft)", color: "var(--text)", fontWeight: 600 }
                    : { color: "var(--muted)", fontWeight: 500 }
                }
              >
                <Icon
                  className="h-5 w-5 flex-shrink-0"
                  strokeWidth={2}
                  style={{ color: active ? "var(--accent)" : "var(--faint)" }}
                />
                <span className="flex-1 text-[13px]">{item.label}</span>
                {item.admin && (
                  <span className="rounded-[4px] border border-border px-1 py-px text-[9px] font-bold tracking-[0.08em] text-faint">
                    ADMIN
                  </span>
                )}
                {item.badge != null && (
                  <span className="min-w-[18px] rounded-full bg-accent-soft px-[6px] py-px text-center font-data text-[10.5px] font-semibold text-accent">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}

      <div className="flex-1" />

      <div className="mt-[10px] rounded-sm border border-border bg-surface-2 p-[11px_12px]">
        <div className="mb-[5px] text-[10px] font-bold uppercase tracking-[0.1em] text-faint">
          Serveur
        </div>
        <div className="mb-[3px] flex justify-between text-[12px]">
          <span className="text-muted">Agents en service</span>
          <span className="font-data font-semibold">{onlineCount}</span>
        </div>
        <div className="flex justify-between text-[12px]">
          <span className="text-muted">Heure</span>
          <span className="font-data font-semibold">{clock}</span>
        </div>
      </div>
      </div>

      {/* Poignée de redimensionnement. La largeur est mémorisée : chacun règle
          la barre selon la place dont il dispose, tablette in-game comprise. */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Glisser pour redimensionner"
        onPointerDown={(e) => {
          e.preventDefault();
          const el = e.currentTarget;
          el.setPointerCapture(e.pointerId);
          const move = (ev: PointerEvent) => setNavWidth(ev.clientX);
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
        onDoubleClick={() => setNavWidth(216)}
        className="absolute inset-y-0 right-0 z-10 w-[5px] cursor-col-resize hover:bg-accent-soft active:bg-accent-soft"
      />
    </div>
  );
}
