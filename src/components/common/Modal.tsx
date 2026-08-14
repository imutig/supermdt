import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

// Panneau latéral (side panel) qui s'ouvre depuis la droite, comme les fiches du
// MDT. C'est le format unique de tous les modaux : créations, configurations,
// confirmations. Toute création passe par ce panneau (ou une page dédiée),
// jamais par un champ greffé sur la page d'origine.
export function Modal({
  title,
  icon,
  onClose,
  children,
  footer,
  width = 460,
}: {
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Largeur du panneau (px). Plafonnée à 96vw sur petit écran. */
  width?: number;
}) {
  // Échap ferme : le panneau couvre le contenu, c'est le réflexe attendu.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] flex justify-end"
      style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]"
        style={{ width, maxWidth: "96vw", animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}
      >
        <div className="flex flex-shrink-0 items-center gap-[10px] border-b border-border px-5 py-4">
          {icon && <span className="flex-shrink-0 text-accent">{icon}</span>}
          <h2 className="m-0 flex-1 text-[15px] font-bold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-[18px]">{children}</div>

        {footer && (
          <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
