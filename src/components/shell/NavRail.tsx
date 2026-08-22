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
  BookOpen,
  ListChecks,
  GraduationCap,
  Shirt,
  Network,
  Users,
  Clock,
  CalendarOff,
  Settings,
  SlidersHorizontal,
  ShieldAlert,
  BarChart3,
  FileSignature,
  Wallet,
  Activity,
  Archive as ArchiveIcon,
  Shield,
  Award,
  RefreshCw,
  ChevronDown,
  CircleUser,
  PhoneCall,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { useApp } from "@/providers/app-state";
import { useCan } from "@/hooks/useCan";
import { usePrefs } from "@/hooks/usePrefs";
import { FEATURES } from "@/lib/features";

interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  to?: string;
  badge?: number;
  admin?: boolean;
  perm?: string; // permission de consultation requise (masque l'item sinon)
  anyPerm?: string[]; // ... ou l'une de ces permissions suffit
  logoUrl?: string; // logo custom (divisions) rendu à la place de l'icône
}
interface NavGroup {
  label: string;
  items: NavItem[];
  commandOnly?: boolean;
}

// Groupes plus resserrés et thématiques (au lieu d'un « Opérations » fourre-tout) :
// chaque section est repliable, donc la barre tient sans scroll même avec toutes
// les permissions. « Accueil » est épinglé au-dessus, hors accordéon.
const HOME_ITEM: NavItem = { key: "dossiers", label: "Accueil", icon: FolderSearch, to: "/" };

const GROUPS: NavGroup[] = [
  {
    label: "Général",
    items: [
      { key: "profil", label: "Mon profil", icon: CircleUser, to: "/profil" },
      { key: "dispatch", label: "Dispatch", icon: Radio, to: "/dispatch", perm: "dispatch.view" },
      { key: "calls911", label: "Appels 911", icon: PhoneCall, to: "/911", anyPerm: ["n911.view", "n911.operate"] },
      { key: "carte", label: "Carte", icon: MapIcon, to: "/carte" },
      { key: "calendrier", label: "Calendrier", icon: CalendarDays, to: "/calendrier", perm: "calendrier.view" },
    ],
  },
  {
    label: "Judiciaire",
    items: [
      { key: "plaintes", label: "Plaintes", icon: FileWarning, to: "/plaintes", perm: "plaintes.view" },
      { key: "mandats", label: "Mandats", icon: Gavel, to: "/mandats", perm: "mandats.view" },
      { key: "contraventions", label: "Historique judiciaire", icon: ReceiptText, to: "/contraventions", perm: "contraventions.view" },
      { key: "rapports", label: "Rapports", icon: FileText, to: "/rapports", perm: "rapports.view" },
    ],
  },
  {
    label: "Registres",
    items: [
      { key: "armes", label: "Armes", icon: Crosshair, to: "/armes", perm: "armes.view" },
      { key: "vehicules", label: "Véhicules", icon: Car, to: "/vehicules", anyPerm: ["vehicules.view", "flotte.view"] },
      { key: "saisies", label: "Saisies", icon: Boxes, to: "/saisies", perm: "saisies.view" },
    ],
  },
  {
    label: "Référentiel",
    items: [
      { key: "codepenal", label: "Code pénal", icon: BookText, to: "/codepenal", perm: "codepenal.view" },
      { key: "reglement", label: "Règlement", icon: BookOpen, to: "/reglement" },
      { key: "protocoles", label: "Protocoles", icon: ListChecks, to: "/protocoles", perm: "protocoles.view" },
      { key: "ressources", label: "Ressources", icon: GraduationCap, to: "/ressources", perm: "formations.view" },
      { key: "tenues", label: "Tenues", icon: Shirt, to: "/tenues", perm: "tenues.view" },
    ],
  },
  {
    label: "Administratif",
    items: [
      { key: "effectif", label: "Effectif", icon: Users, to: "/effectif", perm: "effectif.view" },
      { key: "organigramme", label: "Organigramme", icon: Network, to: "/organigramme", perm: "effectif.view" },
      { key: "services", label: "Services", icon: Clock, to: "/services", perm: "service.self" },
      { key: "absences", label: "Absences", icon: CalendarOff, to: "/absences", perm: "absences.request" },
      { key: "discipline", label: "Discipline", icon: ShieldAlert, to: "/discipline", perm: "discipline.view" },
      { key: "ceremonies", label: "Cérémonies", icon: Award, to: "/ceremonies", perm: "ceremonies.manage" },
    ],
  },
  {
    label: "Gestion",
    commandOnly: true,
    items: [
      { key: "statistiques", label: "Statistiques", icon: BarChart3, to: "/statistiques", perm: "stats.view" },
      { key: "rapportgouv", label: "Rapport gouv.", icon: FileSignature, to: "/rapport-gouvernement", perm: "rapportgouv.manage" },
      { key: "salaires", label: "Salaires", icon: Wallet, to: "/salaires", perm: "comptabilite.view" },
      { key: "analytics", label: "Analytics", icon: Activity, to: "/analytics", perm: "audit.view" },
      { key: "config", label: "Configuration", icon: SlidersHorizontal, to: "/config", perm: "rbac.manage" },
      { key: "synchronisation", label: "Synchronisation", icon: RefreshCw, to: "/synchronisation", perm: "rbac.manage" },
      { key: "archive", label: "Archive", icon: ArchiveIcon, to: "/archive", perm: "archive.view" },
      { key: "admin", label: "Administration", icon: Settings, to: "/admin", perm: "effectif.validate" },
    ],
  },
];

export function NavRail() {
  const { can, ready } = useCan();
  const { sidebarCollapsible: collapsible, sidebarHoverExpand } = usePrefs();
  // La section Administration s'ouvre à qui détient l'un de ses droits, et non
  // à un corps de grade décidé en dur.
  const canAdmin = can("rbac.manage") || can("audit.view") || can("effectif.validate") || can("invites.manage");
  const location = useLocation();
  const navigate = useNavigate();
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
  // Fonctions désactivées (cohabitation NexusMDT) : retirées de la navigation.
  const disabledKeys = new Set<string>();
  if (!FEATURES.dispatch) disabledKeys.add("dispatch");
  if (!FEATURES.service) disabledKeys.add("services");
  if (!FEATURES.plaintes) disabledKeys.add("plaintes");
  // Historique judiciaire (casiers/contraventions) : consultable dans le MDT
  // (les casiers et amendes sont importés depuis le Nexus). L'écriture reste
  // gérée par le flag judicialWrite au niveau des actions.

  // Masque les items sans permission de consultation (§17). Pendant le chargement des perms, on montre tout.
  const canShow = (item: NavItem) =>
    !disabledKeys.has(item.key)
    && (!ready || (item.anyPerm ? item.anyPerm.some((p) => can(p)) : !item.perm || can(item.perm)));

  const base = GROUPS.filter((g) => !g.commandOnly || canAdmin)
    .map((g) => ({ ...g, items: g.items.filter(canShow) }))
    .filter((g) => g.items.length > 0);

  // Divisions de l'agent : un groupe dynamique, inséré après « Opérations ».
  const myDivisions = useQuery(api.divisionSpace.mine) ?? [];
  const divisionGroup: NavGroup | null = myDivisions.length
    ? { label: "Divisions", items: myDivisions.map((d) => ({ key: `div-${d._id}`, label: d.name, icon: Shield, to: `/division/${d._id}`, logoUrl: d.logoUrl ?? undefined })) }
    : null;
  const groups = divisionGroup ? [base[0], divisionGroup, ...base.slice(1)].filter(Boolean) as NavGroup[] : base;

  // Sections repliables (accordéon) : la barre tient sans scroll même avec toutes
  // les permissions. La section de la page active est toujours ouverte ; le reste
  // s'ouvre à la demande, et l'état est mémorisé.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try { const raw = localStorage.getItem("mdt.nav.expanded"); if (raw) return new Set<string>(JSON.parse(raw)); } catch { /* */ }
    return new Set(["Général"]);
  });
  useEffect(() => { try { localStorage.setItem("mdt.nav.expanded", JSON.stringify([...expanded])); } catch { /* */ } }, [expanded]);
  const toggleGroup = (label: string) => setExpanded((prev) => { const n = new Set(prev); if (n.has(label)) n.delete(label); else n.add(label); return n; });
  const groupHasActive = (g: NavGroup) => g.items.some(isActive);

  // Bouton d'item (rail complet), réutilisé pour l'Accueil épinglé et les sections.
  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(item);
    return (
      <button
        key={item.key}
        onClick={() => item.to && navigate(item.to)}
        className="flex w-full items-center gap-[10px] rounded-sm px-[11px] py-2 text-left hover:bg-surface-2"
        style={active ? { background: "var(--accent-soft)", color: "var(--text)", fontWeight: 600 } : { color: "var(--muted)", fontWeight: 500 }}
      >
        {item.logoUrl ? (
          <img src={item.logoUrl} alt="" className="h-5 w-5 flex-shrink-0 rounded object-cover" />
        ) : (
          <Icon className="h-5 w-5 flex-shrink-0" strokeWidth={2} style={{ color: active ? "var(--accent)" : "var(--faint)" }} />
        )}
        <span className="flex-1 text-[13px]">{item.label}</span>
        {item.admin && <span className="rounded-[4px] border border-border px-1 py-px text-[9px] font-bold tracking-[0.08em] text-faint">ADMIN</span>}
        {item.badge != null && <span className="min-w-[18px] rounded-full bg-accent-soft px-[6px] py-px text-center font-data text-[10.5px] font-semibold text-accent">{item.badge}</span>}
      </button>
    );
  };

  // Bouton d'item (rail compact : icône seule, libellé au survol).
  const renderCompactItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(item);
    return (
      <button
        key={item.key}
        onClick={() => item.to && navigate(item.to)}
        title={item.label}
        aria-label={item.label}
        className={`flex h-[38px] w-full flex-shrink-0 items-center justify-center gap-0 rounded-sm hover:bg-surface-2 ${sidebarHoverExpand ? "group-hover:justify-start group-hover:gap-[11px] group-hover:px-[8px]" : ""}`}
        style={active ? { background: "var(--accent-soft)" } : undefined}
      >
        {item.logoUrl ? (
          <img src={item.logoUrl} alt="" className="h-5 w-5 flex-shrink-0 rounded object-cover" />
        ) : (
          <Icon className="h-5 w-5 flex-shrink-0" strokeWidth={2} style={{ color: active ? "var(--accent)" : "var(--faint)" }} />
        )}
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
  };

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
          {renderCompactItem(HOME_ITEM)}
          {groups.map((g) => (
            <div key={g.label} className="flex w-full flex-col gap-[2px]">
              <div className="my-[7px] h-px w-full bg-border" />
              <div className={`h-0 max-w-full overflow-hidden whitespace-nowrap px-[6px] text-[9.5px] font-bold uppercase tracking-[0.11em] text-faint opacity-0 transition-all duration-200 ${sidebarHoverExpand ? "group-hover:h-[16px] group-hover:opacity-100" : ""}`}>
                {g.label}
              </div>
              {g.items.map(renderCompactItem)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- Rail complet ----
  return (
    <div className="relative flex flex-shrink-0" style={{ width: navWidth }}>
      <div className="flex min-w-0 flex-1 flex-col gap-[1px] overflow-y-auto border-r border-border bg-surface p-[12px_10px]">
      {/* Accueil épinglé, toujours accessible. */}
      {renderItem(HOME_ITEM)}

      {groups.map((g) => {
        const open = expanded.has(g.label) || groupHasActive(g);
        return (
          <div key={g.label} className="mt-[6px]">
            <button
              onClick={() => toggleGroup(g.label)}
              className="flex w-full items-center gap-2 rounded-sm px-3 pb-[5px] pt-[7px] text-left hover:bg-surface-2"
              title={open ? "Réduire" : "Développer"}
            >
              <span className="flex-1 text-[9.5px] font-bold uppercase tracking-[0.11em] text-faint">{g.label}</span>
              <ChevronDown className="h-[14px] w-[14px] text-faint transition-transform duration-150" style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }} />
            </button>
            {open && g.items.map(renderItem)}
          </div>
        );
      })}

      <div className="flex-1" />
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
