import { useCallback, useRef, useState } from "react";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { uploadImage } from "@/lib/uploadImage";
import { useToast } from "@/providers/toast";
import { usePasteImage } from "@/hooks/usePasteImage";

// Galerie d'images (rapports, protocoles, ressources...). Stocke un tableau d'URLs (§1).
export function ImageGallery({
  urls,
  onChange,
  disabled,
  emptyLabel = "Aucune image.",
}: {
  urls: string[];
  onChange?: (urls: string[]) => void;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const editable = !disabled && !!onChange;

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!files.length || !onChange) return;
      setBusy(true);
      const added: string[] = [];
      for (const f of files) {
        const url = await toast.guard(uploadImage(f), "Upload impossible");
        if (url) added.push(url);
      }
      setBusy(false);
      if (added.length) onChange([...urls, ...added]);
    },
    [onChange, toast, urls],
  );

  usePasteImage(hover && editable, (f) => uploadFiles([f]));

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {urls.length === 0 && !editable ? (
        <div className="py-6 text-center text-[12.5px] text-faint">{emptyLabel}</div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {urls.map((u, i) => (
            <div
              key={i}
              className="group relative aspect-square overflow-hidden rounded-sm border border-border bg-surface-2"
            >
              <img
                src={u}
                alt=""
                onClick={() => setLightbox(u)}
                className="h-full w-full cursor-zoom-in object-cover"
              />
              {editable && (
                <button
                  onClick={() => onChange!(urls.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 flex h-[22px] w-[22px] items-center justify-center rounded-sm bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  title="Retirer"
                >
                  <X className="h-[13px] w-[13px]" />
                </button>
              )}
            </div>
          ))}
          {editable && (
            <button
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border bg-surface-2 text-faint hover:text-muted disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              <span className="text-[10.5px] font-semibold">Ajouter</span>
              <span className="text-[9px] text-faint">ou Ctrl+V</span>
            </button>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => uploadFiles(Array.from(e.target.files ?? []))}
      />

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[90] flex items-center justify-center p-8"
          style={{ background: "rgba(0,0,0,.8)", backdropFilter: "blur(4px)" }}
        >
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-sm object-contain" />
        </div>
      )}
    </div>
  );
}
