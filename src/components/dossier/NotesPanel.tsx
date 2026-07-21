import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { RichTextEditor } from "@/components/common/RichTextEditor";

const TONE_COLOR: Record<string, string> = {
  neutral: "var(--muted)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

// Liste des notes d'un citoyen (l'ajout se fait via NoteModal, §2).
export function NotesPanel({ citizenId }: { citizenId: Id<"citizens"> }) {
  const notes = useQuery(api.notes.byCitizen, { citizenId });

  if (notes === undefined) {
    return <div className="py-6 text-center text-[13px] text-faint">Chargement...</div>;
  }
  if (notes.length === 0) {
    return <div className="py-8 text-center text-[13px] text-faint">Aucune note.</div>;
  }
  return (
    <div className="flex flex-col gap-[10px]">
      {notes.map((n) => (
        <div
          key={n._id}
          className="rounded-sm border border-border bg-surface-2 px-[13px] py-3"
          style={{ borderLeft: `3px solid ${TONE_COLOR[n.tone] ?? "var(--muted)"}` }}
        >
          <RichTextEditor value={n.text} editable={false} />
          <div className="mt-[6px] text-[11px] text-faint">
            {n.author} · {new Date(n.at).toLocaleString("fr-FR")}
          </div>
        </div>
      ))}
    </div>
  );
}
