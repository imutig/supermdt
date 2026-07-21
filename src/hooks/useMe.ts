import { useQuery } from "convex/react";
import { api } from "@/lib/api";

// Agent courant (+ grade, divisions, statut de service). undefined = en chargement, null = pas de profil.
export function useMe() {
  return useQuery(api.agents.me);
}
