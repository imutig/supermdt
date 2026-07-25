import { useCallback, useRef, useState } from "react";
import { FilePlus, X, Loader2, Play } from "lucide-react";
import { uploadMedia, mediaKind } from "@/lib/uploadImage";
import { useToast } from "@/providers/toast";

// Rendu d'un média d'énoncé : image, vidéo ou audio selon l'URL. Utilisé au
// passage (cadet), en aperçu et dans les résultats.
export function QuizMedia({ url, className = "" }: { url: string; className?: string }) {
  const kind = mediaKind(url);
  if (kind === "video") {
    return <video src={url} controls preload="metadata" className={`w-full rounded-sm border border-border bg-black ${className}`} />;
  }
  if (kind === "audio") {
    return (
      <div className={`flex items-center gap-[10px] rounded-sm border border-border bg-surface-2 px-[12px] py-[10px] ${className}`}>
        <Play className="h-[15px] w-[15px] flex-shrink-0 text-accent" />
        <audio src={url} controls className="min-w-0 flex-1" />
      </div>
    );
  }
  return <img src={url} alt="" className={`w-full rounded-sm border border-border object-cover ${className}`} />;
}

// Grille de médias d'un énoncé : images, vidéos et audio mêlés. Ne stocke que
// les URLs. Vidéo/audio passent par Cloudinary.
export function MediaGallery({
  urls, onChange, disabled,
}: {
  urls: string[];
  onChange?: (urls: string[]) => void;
  disabled?: boolean;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const editable = !disabled && !!onChange;

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!files.length || !onChange) return;
      setBusy(true);
      const added: string[] = [];
      for (const f of files) {
        const url = await toast.guard(uploadMedia(f), "Upload impossible");
        if (url) added.push(url);
      }
      setBusy(false);
      if (added.length) onChange([...urls, ...added]);
    },
    [onChange, toast, urls],
  );

  if (urls.length === 0 && !editable) return null;

  return (
    <div>
      {urls.length > 0 && (
        <div className="mb-[8px] grid grid-cols-1 gap-[8px] sm:grid-cols-2">
          {urls.map((u, i) => (
            <div key={i} className="group relative overflow-hidden rounded-sm">
              <QuizMedia url={u} />
              {editable && (
                <button
                  onClick={() => onChange!(urls.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 z-[1] flex h-[24px] w-[24px] items-center justify-center rounded-sm bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  title="Retirer"
                >
                  <X className="h-[13px] w-[13px]" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {editable && (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-[8px] rounded-sm border border-dashed border-border bg-surface-2 py-[10px] text-[12.5px] font-semibold text-faint hover:text-muted disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <FilePlus className="h-[15px] w-[15px]" />}
          Ajouter une image, une vidéo ou un audio
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        className="hidden"
        onChange={(e) => uploadFiles(Array.from(e.target.files ?? []))}
      />
    </div>
  );
}
