import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface AppState {
  mode: "light" | "dark";
  toggleMode: () => void;
  // Mode concentré : masque l'en-tête et la navigation pour laisser toute la
  // surface au contenu. Pensé pour le dispatch sur tablette in-game.
  focus: boolean;
  toggleFocus: () => void;
  exitFocus: () => void;
  // Largeur de la barre de navigation, ajustable et mémorisée.
  navWidth: number;
  setNavWidth: (px: number) => void;
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  calcOpen: boolean;
  calcCitizenId: string | null;
  calcMode: "casier" | "contravention";
  openCalc: (citizenId?: string, mode?: "casier" | "contravention") => void;
  closeCalc: () => void;
  mandatOpen: boolean;
  mandatCitizenId: string | null;
  openMandat: (citizenId: string) => void;
  closeMandat: () => void;
  clock: string;
  // Transition d'entrée cinématique (jouée une fois après login / config owner).
  entryPending: boolean;
  requestEntry: () => void;
  endEntry: () => void;
}

const Ctx = createContext<AppState | null>(null);

const THEME_KEY = "s13-theme";
const NAV_WIDTH_KEY = "s13-nav-width";
const NAV_MIN = 168;
const NAV_MAX = 340;

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [focus, setFocus] = useState(false);
  // Identités stables : ces fonctions servent de dépendances d'effet ailleurs.
  // Recréées à chaque changement de `focus`, elles relançaient l'effet qui
  // quitte le mode plein écran, l'annulant aussitôt qu'il était activé.
  const toggleFocus = useCallback(() => setFocus((f) => !f), []);
  const exitFocus = useCallback(() => setFocus(false), []);
  const [navWidth, setNavWidthState] = useState<number>(() => {
    if (typeof window === "undefined") return 216;
    const raw = Number(localStorage.getItem(NAV_WIDTH_KEY));
    return Number.isFinite(raw) && raw >= NAV_MIN && raw <= NAV_MAX ? raw : 216;
  });
  const [mode, setMode] = useState<"light" | "dark">(() => {
    if (typeof localStorage !== "undefined" && localStorage.getItem(THEME_KEY) === "dark") return "dark";
    return "light";
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcCitizenId, setCalcCitizenId] = useState<string | null>(null);
  const [calcMode, setCalcMode] = useState<"casier" | "contravention">("casier");
  const [mandatOpen, setMandatOpen] = useState(false);
  const [mandatCitizenId, setMandatCitizenId] = useState<string | null>(null);
  const [entryPending, setEntryPending] = useState(false);
  const [clock, setClock] = useState(fmtClock());

  // Applique le thème sur <html> + persiste le choix de l'utilisateur.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", mode === "dark");
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      // stockage indisponible : on ignore
    }
  }, [mode]);

  // Horloge live
  useEffect(() => {
    const t = setInterval(() => setClock(fmtClock()), 1000);
    return () => clearInterval(t);
  }, []);

  // Raccourcis clavier : ⌘K / Ctrl+K ouvre la recherche ; Échap ferme.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setCalcOpen(false);
        setMandatOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      mode,
      toggleMode: () => setMode((m) => (m === "light" ? "dark" : "light")),
      focus,
      toggleFocus,
      exitFocus,
      navWidth,
      setNavWidth: (px: number) => {
        const clamped = Math.min(NAV_MAX, Math.max(NAV_MIN, Math.round(px)));
        setNavWidthState(clamped);
        try { localStorage.setItem(NAV_WIDTH_KEY, String(clamped)); } catch { /* stockage indisponible */ }
      },
      searchOpen,
      openSearch: () => setSearchOpen(true),
      closeSearch: () => setSearchOpen(false),
      calcOpen,
      calcCitizenId,
      calcMode,
      openCalc: (citizenId?: string, m: "casier" | "contravention" = "casier") => {
        setCalcCitizenId(citizenId ?? null);
        setCalcMode(m);
        setCalcOpen(true);
      },
      closeCalc: () => setCalcOpen(false),
      mandatOpen,
      mandatCitizenId,
      openMandat: (citizenId: string) => {
        setMandatCitizenId(citizenId);
        setMandatOpen(true);
      },
      closeMandat: () => setMandatOpen(false),
      clock,
      entryPending,
      requestEntry: () => setEntryPending(true),
      endEntry: () => setEntryPending(false),
    }),
    [mode, focus, toggleFocus, exitFocus, navWidth, searchOpen, calcOpen, calcCitizenId, calcMode, mandatOpen, mandatCitizenId, entryPending, clock],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used within AppStateProvider");
  return v;
}

function fmtClock() {
  return new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Paris",
  });
}
