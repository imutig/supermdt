import { useEffect, useRef, useState } from "react";
import { useConvex } from "convex/react";
import { useEditor, EditorContent } from "@tiptap/react";
import Image from "@tiptap/extension-image";
import { ImagePlus, Loader2 } from "lucide-react";
import type { Id } from "convex/_generated/dataModel";
import { richTextExtensions, RichTextToolbar, normalizeRichText } from "@/components/common/RichTextEditor";
import { uploadMedia, mediaKind } from "@/lib/uploadImage";
import { useToast } from "@/providers/toast";
import { Video, Audio } from "./mediaNodes";
import { buildMention } from "./mention";
import { useDetectiveNav } from "./nav";

// Éditeur riche du Detective Bureau : mise en forme complète + médias inline
// (image / audio / vidéo) + mentions "@" cliquables. Réutilisé partout où la DB
// écrit (rapports, interrogatoires, auditions, notes, observations…).

export function DetectiveEditor({
  value, onChange, editable = true, placeholder, minHeight = 140, divisionId, media = true,
}: {
  value: string;
  onChange?: (html: string) => void;
  editable?: boolean;
  placeholder?: string;
  minHeight?: number;
  divisionId: Id<"divisions">;
  media?: boolean;
}) {
  const convex = useConvex();
  const toast = useToast();
  const go = useDetectiveNav();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      ...richTextExtensions(placeholder),
      Image.configure({ HTMLAttributes: { class: "db-media" } }),
      Video,
      Audio,
      buildMention(convex, divisionId),
    ],
    content: normalizeRichText(value),
    editable,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
    editorProps: {
      attributes: { class: "prose-mdt px-3 py-3 text-[13.5px] leading-[1.55] outline-none", style: `min-height:${minHeight}px` },
    },
  });

  // En lecture, le contenu peut arriver après le montage (useQuery) : on resynchronise.
  useEffect(() => {
    if (!editor || editable) return;
    const next = normalizeRichText(value);
    if (editor.getHTML() !== next) editor.commands.setContent(next, false);
  }, [value, editor, editable]);

  if (!editor) return null;

  const pickMedia = async (file: File) => {
    setBusy(true);
    try {
      const url = await uploadMedia(file);
      const k = mediaKind(url);
      if (k === "video") editor.chain().focus().insertContent({ type: "video", attrs: { src: url } }).run();
      else if (k === "audio") editor.chain().focus().insertContent({ type: "audio", attrs: { src: url } }).run();
      else editor.chain().focus().setImage({ src: url }).run();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'envoi du média.");
    } finally {
      setBusy(false);
    }
  };

  const onClickRead = (e: React.MouseEvent) => {
    const t = (e.target as HTMLElement).closest("[data-mention]") as HTMLElement | null;
    if (!t) return;
    const kind = t.getAttribute("data-kind");
    const id = t.getAttribute("data-id");
    if (kind && id) go(kind, id);
  };

  if (!editable) {
    return (
      <div className="prose-mdt px-1 text-[13.5px] leading-[1.55]" onClick={onClickRead}>
        <EditorContent editor={editor} />
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-border bg-surface-2">
      <RichTextToolbar editor={editor} />
      {media && (
        <div className="flex items-center gap-2 border-b border-border px-[8px] py-[5px] text-[11.5px] text-faint">
          <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickMedia(f); e.target.value = ""; }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
            className="flex items-center gap-1.5 rounded-sm border border-border bg-surface px-2 py-1 font-medium text-muted hover:border-accent hover:text-accent disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            Média (image / audio / vidéo)
          </button>
          <span className="ml-1">Tapez <b className="text-muted">@</b> pour relier une entité (citoyen, plaque, enquête, gang…).</span>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
