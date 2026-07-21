import { useCallback, useRef, useState } from "react";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { uploadImage } from "@/lib/uploadImage";
import { useToast } from "@/providers/toast";
import { usePasteImage } from "@/hooks/usePasteImage";

// Uploader d'image unique (avatar, mugshot...). Ne stocke que l'URL (§1).
export function ImageUpload({
  value,
  onChange,
  disabled,
  className = "",
  aspect = "square",
}: {
  value?: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
  className?: string;
  aspect?: "square" | "portrait" | "wide";
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);
  const ratio = aspect === "portrait" ? "aspect-[3/4]" : aspect === "wide" ? "aspect-[16/10]" : "aspect-square";

  const handleFile = useCallback(
    async (file?: File) => {
      if (!file) return;
      setBusy(true);
      const url = await toast.guard(uploadImage(file), "Upload impossible");
      setBusy(false);
      if (url) onChange(url);
    },
    [toast, onChange],
  );

  usePasteImage(hover && !disabled, (f) => handleFile(f));

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`relative ${ratio} w-full overflow-hidden rounded-sm border border-border bg-surface-2 ${className}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {value ? (
        <>
          <img src={value} alt="" className="h-full w-full object-cover" />
          {!disabled && (
            <button
              onClick={() => onChange(null)}
              className="absolute right-1 top-1 flex h-[24px] w-[24px] items-center justify-center rounded-sm bg-black/55 text-white hover:bg-black/75"
              title="Retirer"
            >
              <X className="h-[14px] w-[14px]" />
            </button>
          )}
        </>
      ) : (
        <button
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="flex h-full w-full flex-col items-center justify-center gap-[6px] text-faint hover:text-muted disabled:cursor-not-allowed"
        >
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <>
              <ImagePlus className="h-6 w-6" />
              <span className="text-[11px] font-semibold">Ajouter</span>
              <span className="text-[10px] text-faint">ou Ctrl+V</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
