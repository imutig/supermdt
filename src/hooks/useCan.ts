import { useQuery } from "convex/react";
import { api } from "@/lib/api";

// Hook de permission côté UI (§17). Retourne une fonction can(slug) et l'ensemble brut.
// Owner -> tout autorisé. Sert à griser / désactiver les actions non permises.
export function useCan() {
  const perms = useQuery(api.agents.myPermissions);
  const set = perms ? new Set(perms) : null;
  const can = (slug: string) => (set ? set.has(slug) : false);
  return { can, ready: perms !== undefined };
}
