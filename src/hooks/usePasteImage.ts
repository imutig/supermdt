import { useEffect } from "react";

// Colle une image depuis le presse-papiers (Ctrl+V) quand `enabled` est vrai
// (typiquement : la zone d'upload est survolée ou focalisée). §Images.
export function usePasteImage(enabled: boolean, onImage: (file: File) => void) {
  useEffect(() => {
    if (!enabled) return;
    function handler(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            onImage(f);
            return;
          }
        }
      }
    }
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [enabled, onImage]);
}
