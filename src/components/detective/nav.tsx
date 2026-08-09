import { createContext, useContext, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

// Navigation depuis un chip de mention "@" (ou un nœud du tableau d'enquête).
// Les entités du MDT (citoyen, véhicule) pointent vers leurs fiches ; les entités
// internes au bureau (enquête, personne, gang, point stup) sont gérées en app par
// la page de l'espace division qui fournit ce contexte.

export type DetectiveNav = {
  openCase?: (id: string) => void;
  openPerson?: (id: string) => void;
  openGang?: (id: string) => void;
  openDrugSite?: (id: string) => void;
};

const Ctx = createContext<DetectiveNav | null>(null);

export function DetectiveNavProvider({ value, children }: { value: DetectiveNav; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Hook renvoyant un routeur unifié : `go(kind, id)`.
export function useDetectiveNav() {
  const ctx = useContext(Ctx);
  const navigate = useNavigate();
  return (kind: string, id: string) => {
    switch (kind) {
      case "citizen": navigate(`/citoyen/${id}`); break;
      case "vehicle": navigate(`/vehicules`); break;
      case "case": ctx?.openCase?.(id); break;
      case "person": ctx?.openPerson?.(id); break;
      case "gang": ctx?.openGang?.(id); break;
      case "drugsite": ctx?.openDrugSite?.(id); break;
    }
  };
}
