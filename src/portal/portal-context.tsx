import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { MDT_ENABLED } from "@/lib/features";

// Choix du portail. Il se fait AVANT la connexion : c'est le premier écran du
// site, et il décide quelle surface (MDT ou LSPA) s'ouvre ensuite. Chaque portail
// peut demander son propre code d'accès (rideau, voir convex/access.ts).
export type Portal = "mdt" | "lspa";

const PORTAL_KEY = "s13.portal";
const UNLOCK_KEY = (p: Portal) => `s13.unlock.${p}`;

type Ctx = {
  portal: Portal | null;
  /** Le serveur a-t-il répondu sur l'état des verrous ? */
  ready: boolean;
  /** Un code d'accès est configuré côté serveur pour ce portail. */
  locked: (p: Portal) => boolean;
  /** Le navigateur a un déverrouillage valide en mémoire pour ce portail. */
  unlocked: (p: Portal) => boolean;
  choose: (p: Portal) => void;
  /** Retour à l'écran de choix. */
  clear: () => void;
  markUnlocked: (p: Portal, expiresAt: number | null) => void;
};

const PortalCtx = createContext<Ctx | null>(null);

function readPortal(): Portal | null {
  const v = localStorage.getItem(PORTAL_KEY);
  return v === "mdt" || v === "lspa" ? v : null;
}

function readUnlockValid(p: Portal): boolean {
  const raw = localStorage.getItem(UNLOCK_KEY(p));
  if (!raw) return false;
  // "0" = déverrouillage sans échéance (aucun code n'était configuré).
  const until = Number(raw);
  if (!Number.isFinite(until)) return false;
  return until === 0 || until > Date.now();
}

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [portalState, setPortal] = useState<Portal | null>(() => readPortal());
  const [unlockTick, setUnlockTick] = useState(0); // force le recalcul après un déverrouillage
  const status = useQuery(api.access.status);
  const ready = status !== undefined;

  const locked = useCallback((p: Portal) => (p === "lspa" ? status?.lspaLocked : status?.mdtLocked) ?? false, [status]);
  const unlocked = useCallback((p: Portal) => { void unlockTick; return readUnlockValid(p); }, [unlockTick]);

  // MDT désactivé : la seule surface est la LSPA, on force le portail quel que
  // soit ce qui traîne en mémoire.
  const portal: Portal | null = MDT_ENABLED ? portalState : "lspa";

  // Le déverrouillage expire ; sans ce contrôle, un navigateur resté sur un
  // portail verrouillé n'aurait jamais à ressaisir le code.
  useEffect(() => {
    if (!ready || !portal) return;
    if (locked(portal) && !readUnlockValid(portal)) {
      localStorage.removeItem(PORTAL_KEY);
      setPortal(null);
    }
  }, [ready, portal, unlockTick, locked]);

  const choose = useCallback((p: Portal) => {
    localStorage.setItem(PORTAL_KEY, p);
    setPortal(p);
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(PORTAL_KEY);
    setPortal(null);
  }, []);

  const markUnlocked = useCallback((p: Portal, expiresAt: number | null) => {
    localStorage.setItem(UNLOCK_KEY(p), String(expiresAt ?? 0));
    setUnlockTick((t) => t + 1);
  }, []);

  const value = useMemo(
    () => ({ portal, ready, locked, unlocked, choose, clear, markUnlocked }),
    [portal, ready, locked, unlocked, choose, clear, markUnlocked],
  );
  return <PortalCtx.Provider value={value}>{children}</PortalCtx.Provider>;
}

export function usePortal(): Ctx {
  const c = useContext(PortalCtx);
  if (!c) throw new Error("usePortal doit être utilisé dans PortalProvider.");
  return c;
}
