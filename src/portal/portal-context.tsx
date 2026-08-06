import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { MDT_ENABLED } from "@/lib/features";

// Choix du portail. Il se fait AVANT la connexion : c'est le premier écran du
// site, et il décide quelle surface (MDT ou LSPA) s'ouvre ensuite.
export type Portal = "mdt" | "lspa";

const PORTAL_KEY = "s13.portal";
const UNLOCK_KEY = "s13.mdtUnlock";

type Ctx = {
  portal: Portal | null;
  /** Le serveur a-t-il répondu sur l'état du verrou ? */
  ready: boolean;
  /** Un code d'accès est configuré côté serveur. */
  mdtLocked: boolean;
  /** Le navigateur a un déverrouillage valide en mémoire. */
  mdtUnlocked: boolean;
  choose: (p: Portal) => void;
  /** Retour à l'écran de choix. */
  clear: () => void;
  markUnlocked: (expiresAt: number | null) => void;
};

const PortalCtx = createContext<Ctx | null>(null);

function readPortal(): Portal | null {
  const v = localStorage.getItem(PORTAL_KEY);
  return v === "mdt" || v === "lspa" ? v : null;
}

function readUnlockValid(): boolean {
  const raw = localStorage.getItem(UNLOCK_KEY);
  if (!raw) return false;
  // "0" = déverrouillage sans échéance (aucun code n'était configuré).
  const until = Number(raw);
  if (!Number.isFinite(until)) return false;
  return until === 0 || until > Date.now();
}

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [portalState, setPortal] = useState<Portal | null>(() => readPortal());
  const [mdtUnlocked, setMdtUnlocked] = useState(() => readUnlockValid());
  const status = useQuery(api.access.status);
  const ready = status !== undefined;
  const mdtLocked = status?.mdtLocked ?? false;
  // MDT désactivé : la seule surface est la LSPA, on force le portail quel que
  // soit ce qui traîne en mémoire.
  const portal: Portal | null = MDT_ENABLED ? portalState : "lspa";

  // Le déverrouillage expire ; sans ce contrôle, un navigateur resté sur le MDT
  // n'aurait jamais à ressaisir le code.
  useEffect(() => {
    if (!MDT_ENABLED || !ready) return;
    if (portal === "mdt" && mdtLocked && !mdtUnlocked) {
      localStorage.removeItem(PORTAL_KEY);
      setPortal(null);
    }
  }, [ready, portal, mdtLocked, mdtUnlocked]);

  const choose = useCallback((p: Portal) => {
    localStorage.setItem(PORTAL_KEY, p);
    setPortal(p);
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(PORTAL_KEY);
    setPortal(null);
  }, []);

  const markUnlocked = useCallback((expiresAt: number | null) => {
    localStorage.setItem(UNLOCK_KEY, String(expiresAt ?? 0));
    setMdtUnlocked(true);
  }, []);

  const value = useMemo(
    () => ({ portal, ready, mdtLocked, mdtUnlocked, choose, clear, markUnlocked }),
    [portal, ready, mdtLocked, mdtUnlocked, choose, clear, markUnlocked],
  );
  return <PortalCtx.Provider value={value}>{children}</PortalCtx.Provider>;
}

export function usePortal(): Ctx {
  const c = useContext(PortalCtx);
  if (!c) throw new Error("usePortal doit être utilisé dans PortalProvider.");
  return c;
}
