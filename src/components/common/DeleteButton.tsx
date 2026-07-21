import { useState } from "react";
import { Trash2 } from "lucide-react";

// Bouton de suppression avec confirmation inline (point 1).
export function DeleteButton({
  onDelete,
  title = "Supprimer",
}: {
  onDelete: () => Promise<unknown>;
  title?: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  if (confirm) {
    return (
      <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={async () => {
            setBusy(true);
            try {
              await onDelete();
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          className="rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--danger)" }}
        >
          {busy ? "…" : "Supprimer"}
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="rounded-[5px] border border-border px-[8px] py-[3px] text-[11px] text-muted hover:border-border-strong"
        >
          Annuler
        </button>
      </span>
    );
  }
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setConfirm(true);
      }}
      title={title}
      className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-sm border border-border bg-surface-2 text-faint hover:border-border-strong"
      style={{ transition: "color .12s" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--faint)")}
    >
      <Trash2 className="h-[14px] w-[14px]" />
    </button>
  );
}
