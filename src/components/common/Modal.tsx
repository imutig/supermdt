import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

// Boîte de dialogue centrée, partagée par les créations et les confirmations.
// Toute création passe par une modale (ou une page dédiée) : jamais de champ de
// saisie greffé directement sur la page d'origine.
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
  width?: number;
}) {
  // Échap ferme : la modale couvre l'écran, c'est le réflexe attendu.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mdt-pop flex max-h-[86vh] flex-col rounded-card border border-border-strong bg-elev shadow-[0_24px_70px_rgba(0,0,0,.4)]"
        style={{ width, maxWidth: "94vw" }}
      >
        <div className="flex flex-shrink-0 items-center gap-[10px] border-b border-border px-5 py-4">
          {icon && <span className="flex-shrink-0 text-accent">{icon}</span>}
          <h2 className="m-0 flex-1 text-[15px] font-bold">{title}</h2>
          <button
            onClick={onClose}
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
