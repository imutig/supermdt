import { Eye, X } from "lucide-react";
import { usePermPreview } from "@/providers/perm-preview";

// Barre flottante indiquant qu'un aperçu de grade est actif. Elle n'apparaît QUE
// pendant un aperçu (activé depuis Admin → Permissions) et sert à en sortir. Pas
// d'aperçu actif = pas de barre.
export function PermPreviewBar() {
  const { previewGradeName, setPreview, active } = usePermPreview();
  if (!active) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[9998] flex items-center gap-2 rounded-full border px-3 py-2 shadow-[0_8px_30px_rgba(0,0,0,.35)]"
      style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 16%, var(--elev))" }}
    >
      <Eye className="h-[15px] w-[15px]" style={{ color: "var(--accent)" }} />
      <span className="text-[12px] font-semibold" style={{ color: "var(--accent)" }}>
        Aperçu : {previewGradeName ?? "grade"}
      </span>
      <button
        onClick={() => setPreview(null)}
        className="flex h-7 items-center gap-1 rounded-sm bg-accent px-2 text-[12px] font-semibold text-accent-contrast hover:brightness-[1.06]"
        title="Quitter l'aperçu"
      >
        <X className="h-[13px] w-[13px]" /> Quitter
      </button>
    </div>
  );
}
