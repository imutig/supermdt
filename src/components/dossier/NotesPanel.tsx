import { useMutation, useQuery } from "convex/react";
import { Trash2 } from "lucide-react";
import { api, type Id } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { RichTextEditor } from "@/components/common/RichTextEditor";

// Pastille de tonalité : un point suffit à signaler la gravité, là où un
// liseré latéral déséquilibrait la carte pour une information secondaire.
const TONE_COLOR: Record<string, string> = {
  neutral: "var(--faint)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

// Liste des notes d'un citoyen (l'ajout se fait via NoteModal, §2).
export function NotesPanel({ citizenId }: { citizenId: Id<"citizens"> }) {
  const notes = useQuery(api.notes.byCitizen, { citizenId });
  const remove = useMutation(api.notes.remove);
  const { can } = useCan();
  const toast = useToast();
  const canEditCitizen = can("citoyens.edit");

  if (notes === undefined) {
    return <div className="py-6 text-center text-[13px] text-faint">Chargement...</div>;
  }
  if (notes.length === 0) {
    return <div className="py-8 text-center text-[13px] text-faint">Aucune note.</div>;
  }

  return (
    <div className="overflow-hidden rounded-sm border border-border">
      {notes.map((n) => (
        <div
          key={n._id}
          className="group flex gap-[9px] border-b border-border bg-surface-2 px-[11px] py-[8px] last:border-b-0"
        >
          <span
            className="mt-[6px] h-[7px] w-[7px] flex-shrink-0 rounded-full"
            style={{ background: TONE_COLOR[n.tone] ?? "var(--faint)" }}
          />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] leading-[1.45]">
              <RichTextEditor value={n.text} editable={false} />
            </div>
            <div className="mt-[2px] text-[10.5px] text-faint">
              {n.author} · {new Date(n.at).toLocaleString("fr-FR")}
            </div>
          </div>
          {(n.mine || canEditCitizen) && (
            <button
              onClick={() => toast.guard(remove({ id: n._id as Id<"citizenNotes"> }), "Suppression impossible")}
              title={n.mine ? "Supprimer ma note" : "Supprimer la note"}
              // Discret au repos, révélé au survol : la suppression ne doit pas
              // rivaliser visuellement avec le contenu.
              className="mt-[2px] flex h-[24px] w-[24px] flex-shrink-0 items-center justify-center rounded-sm text-faint opacity-0 transition-opacity hover:bg-surface hover:text-danger focus:opacity-100 group-hover:opacity-100"
            >
              <Trash2 className="h-[13px] w-[13px]" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
