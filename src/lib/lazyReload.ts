import { lazy, type ComponentType } from "react";

// React.lazy résistant aux chunks périmés. Après un redéploiement, les fichiers
// hashés changent : une page restée ouverte tente de charger un ancien chunk
// qui n'existe plus, ce qui casse l'import dynamique. On recharge alors la page
// une seule fois pour récupérer la nouvelle version.
export function lazyReload<T extends ComponentType<unknown>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (e) {
      const KEY = "chunkReloaded";
      if (typeof window !== "undefined" && !sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, "1");
        window.location.reload();
        // On suspend le rendu le temps que le rechargement prenne effet.
        await new Promise<never>(() => {});
      }
      throw e;
    }
  });
}
