import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { uploadMedia, mediaKind } from "@/lib/uploadImage";
import { useToast } from "@/providers/toast";

// Champ + galerie de médias (images / audio / vidéo) stockés en tableau d'URLs.

function MediaItem({ url, onRemove }: { url: string; onRemove?: () => void }) {
  const k = mediaKind(url);
  return (
    <div className="relative overflow-hidden rounded-sm border border-border bg-surface-2">
      {k === "image" && <img src={url} alt="" className="h-[92px] w-[120px] object-cover" />}
      {k === "video" && <video src={url} controls className="h-[92px] w-[160px] bg-black object-cover" preload="metadata" />}
      {k === "audio" && <audio src={url} controls className="w-[220px] p-2" preload="metadata" />}
      {onRemove && (
        <button type="button" onClick={onRemove}
          className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80">
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export function MediaField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const add = async (files: FileList) => {
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) urls.push(await uploadMedia(f));
      onChange([...value, ...urls]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'envoi.");
    } finally { setBusy(false); }
  };
  return (
    <div>
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {value.map((u, i) => <MediaItem key={u + i} url={u} onRemove={() => onChange(value.filter((_, j) => j !== i))} />)}
        </div>
      )}
      <input ref={ref} type="file" accept="image/*,video/*,audio/*" multiple className="hidden"
        onChange={(e) => { if (e.target.files?.length) void add(e.target.files); e.target.value = ""; }} />
      <button type="button" onClick={() => ref.current?.click()} disabled={busy}
        className="flex items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-3 py-2 text-[12.5px] font-medium text-muted hover:border-accent hover:text-accent disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        Ajouter un média (image / audio / vidéo)
      </button>
    </div>
  );
}

export function MediaView({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return <div className="flex flex-wrap gap-2">{urls.map((u, i) => <MediaItem key={u + i} url={u} />)}</div>;
}

// Photo unique (avatar / mugshot) : une seule image.
export function PhotoField({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const pick = async (file: File) => {
    setBusy(true);
    try { const url = await uploadMedia(file); onChange(url); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Échec de l'envoi."); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex items-center gap-3">
      {value ? <img src={value} alt="" className="h-16 w-16 rounded-[10px] border border-border object-cover" />
        : <span className="flex h-16 w-16 items-center justify-center rounded-[10px] border border-dashed border-border text-faint"><ImagePlus className="h-5 w-5" /></span>}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
      <div className="flex gap-2">
        <button type="button" onClick={() => ref.current?.click()} disabled={busy}
          className="flex items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-3 py-2 text-[12.5px] font-medium text-muted hover:border-accent hover:text-accent disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{value ? "Changer" : "Photo"}
        </button>
        {value && <button type="button" onClick={() => onChange(null)} className="text-[12px] text-danger hover:underline">Retirer</button>}
      </div>
    </div>
  );
}
