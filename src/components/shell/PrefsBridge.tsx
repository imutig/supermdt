import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/api";
import { useMe } from "@/hooks/useMe";
import { hydratePrefs, registerPrefsSync } from "@/hooks/usePrefs";

// Relie les préférences d'affichage au compte de l'agent : elles étaient
// jusqu'ici cantonnées au stockage local, donc perdues d'un navigateur à
// l'autre. Le stockage local reste le cache de premier rendu.
export function PrefsBridge() {
  const me = useMe();
  const setUiPrefs = useMutation(api.agents.setUiPrefs);

  useEffect(() => {
    registerPrefsSync((patch) => { void setUiPrefs(patch).catch(() => {}); });
    return () => registerPrefsSync(null);
  }, [setUiPrefs]);

  const remote = me?.agent.uiPrefs;
  useEffect(() => { hydratePrefs(remote); }, [remote]);

  return null;
}
