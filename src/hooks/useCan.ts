import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { usePermPreview } from "@/providers/perm-preview";

// Hook de permission côté UI (§17). Retourne une fonction can(slug) et l'ensemble brut.
// Owner -> tout autorisé. Sert à griser / désactiver les actions non permises.
// En mode « Prévisualiser en tant que grade » (usePermPreview), can() répond
// selon les permissions du grade prévisualisé au lieu de celles de l'utilisateur.
export function useCan() {
  const preview = usePermPreview();
  const perms = useQuery(api.agents.myPermissions);

  if (preview.active) {
    const set = preview.previewSet;
    return { can: (slug: string) => (set ? set.has(slug) : false), ready: set !== null };
  }

  const set = perms ? new Set(perms) : null;
  const can = (slug: string) => (set ? set.has(slug) : false);
  return { can, ready: perms !== undefined };
}
