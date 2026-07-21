import { useState } from "react";
import { X } from "lucide-react";
import { useMutation } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useToast } from "@/providers/toast";
import { RichTextEditor } from "@/components/common/RichTextEditor";

const TONES = [
  { key: "neutral", label: "Neutre", color: "var(--muted)" },
  { key: "success", label: "Positif", color: "var(--success)" },
  { key: "warning", label: "Vigilance", color: "var(--warning)" },
  { key: "danger", label: "Danger", color: "var(--danger)" },
];

// Ajout d'une note citoyen via modal (§2).
export function NoteModal({ citizenId, onClose }: { citizenId: Id<"citizens">; onClose: () => void }) {
  const add = useMutation(api.notes.add);
  const toast = useToast();
  const [text, setText] = useState("");
  const [tone, setTone] = useState("neutral");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    const r = await toast.guard(add({ citizenId, text: text.trim(), tone }), "Ajout impossible");
    setBusy(false);
    if (r !== undefined) {
      toast.success("Note ajoutée.");
      onClose();
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex justify-end"
      style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-[460px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]"
        style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}
      >
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">Nouvelle note</h2>
          <button
            onClick={onClose}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-4">
          <RichTextEditor value={text} onChange={setText} minHeight={120} placeholder="Note / signalement…" />
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button
                key={t.key}
                onClick={() => setTone(t.key)}
                className="rounded-[6px] border px-[10px] py-[6px] text-[12px] font-semibold"
                style={
                  tone === t.key
                    ? { background: `color-mix(in srgb, ${t.color} 14%, transparent)`, borderColor: t.color, color: t.color }
                    : { background: "var(--surface)", borderColor: "var(--border)", color: "var(--muted)" }
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-shrink-0 gap-2 border-t border-border px-[18px] py-4">
          <button
            onClick={onClose}
            className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold text-text hover:border-border-strong"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={busy || !text.trim()}
            className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50"
          >
            {busy ? "…" : "Ajouter la note"}
          </button>
        </div>
      </div>
    </div>
  );
}
