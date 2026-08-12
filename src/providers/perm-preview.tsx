import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";

// Mode « Prévisualiser en tant que grade » : on remplace, le temps de l'aperçu,
// l'ensemble de permissions du gestionnaire par celui d'un grade choisi, afin de
// voir le MDT tel que ce grade le verrait. Purement visuel (le serveur applique
// toujours les vraies permissions de l'utilisateur), donc sans risque.
type Ctx = {
  previewGradeId: Id<"grades"> | null;
  previewGradeName: string | null;
  setPreview: (id: Id<"grades"> | null, name?: string | null) => void;
  previewSet: Set<string> | null; // null = inactif OU en cours de chargement
  active: boolean;
};

const PermPreviewContext = createContext<Ctx>({
  previewGradeId: null,
  previewGradeName: null,
  setPreview: () => {},
  previewSet: null,
  active: false,
});

export function usePermPreview() {
  return useContext(PermPreviewContext);
}

export function PermPreviewProvider({ children }: { children: ReactNode }) {
  const [previewGradeId, setId] = useState<Id<"grades"> | null>(null);
  const [previewGradeName, setName] = useState<string | null>(null);

  const perms = useQuery(
    api.agents.permissionsForGrade,
    previewGradeId ? { gradeId: previewGradeId } : "skip",
  );
  const previewSet = previewGradeId ? (perms ? new Set(perms) : null) : null;

  const setPreview = (id: Id<"grades"> | null, name: string | null = null) => {
    setId(id);
    setName(name);
  };

  return (
    <PermPreviewContext.Provider
      value={{ previewGradeId, previewGradeName, setPreview, previewSet, active: !!previewGradeId }}
    >
      {children}
    </PermPreviewContext.Provider>
  );
}
