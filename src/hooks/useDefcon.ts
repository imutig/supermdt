import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/api";

// DEFCON réel : niveau courant + cycle vers le niveau suivant (permission defcon.manage).
export function useDefcon() {
  const current = useQuery(api.defcon.current);
  const levels = useQuery(api.defcon.listLevels);
  const setDefcon = useMutation(api.defcon.setDefcon);

  const cycle = () => {
    if (!current || !levels || levels.length === 0) return;
    const idx = levels.findIndex((l) => l._id === current._id);
    const next = levels[(idx + 1) % levels.length];
    setDefcon({ levelId: next._id }).catch(() => {});
  };

  return { current, levels, cycle };
}
