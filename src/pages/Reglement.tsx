import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Upload, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingScreen } from "@/components/common/Loader";

// Règlement LSPD : visualiseur PDF inline (viewer natif du navigateur via iframe),
// remplaçable par l'État-Major. Le PDF est stocké dans le storage Convex.
export function Reglement() {
  const doc = useQuery(api.documents.getReglement);
  const { can } = useCan();
  const canManage = can("rbac.manage");

  return (
    <div className="flex min-h-0 flex-1 flex-col p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[14px] flex items-center gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Règlement</h1>
        {doc && <span className="text-[12.5px] text-muted">{doc.fileName} · mis à jour le {new Date(doc.uploadedAt).toLocaleDateString("fr-FR")}</span>}
        <div className="flex-1" />
        {doc && (
          <a href={doc.url} target="_blank" rel="noreferrer" className="mdt-press flex items-center gap-[7px] rounded-[9px] border border-border bg-surface-2 px-[13px] py-[8px] text-[13px] font-semibold text-muted hover:border-border-strong">
            <ExternalLink className="h-[15px] w-[15px]" /> Ouvrir en plein écran
          </a>
        )}
        {canManage && <ReglementUpload compact />}
      </div>

      {doc === undefined ? (
        <div className="flex flex-1 items-center justify-center"><LoadingScreen /></div>
      ) : doc === null ? (
        <div className="rounded-card border border-border bg-surface">
          <EmptyState
            title="Aucun règlement"
            message={canManage ? "Téléverse le PDF du règlement (aussi possible depuis Configuration > Règlement)." : "Le règlement n'a pas encore été publié."}
          />
        </div>
      ) : (
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-card border border-border bg-surface" style={{ minHeight: "calc(100vh - 210px)" }}>
          <iframe src={`${doc.url}#toolbar=1&view=FitH`} title="Règlement LSPD" className="absolute inset-0 h-full w-full" style={{ border: "none" }} />
        </div>
      )}
    </div>
  );
}

// Bouton de téléversement du règlement (PDF) - réutilisé ici et dans Configuration.
export function ReglementUpload({ compact }: { compact?: boolean }) {
  const genUrl = useMutation(api.documents.generateReglementUploadUrl);
  const setReglement = useMutation(api.documents.setReglement);
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) { toast.error("Le règlement doit être un PDF."); return; }
    if (file.size > 25 * 1024 * 1024) { toast.error("PDF trop volumineux (max 25 Mo)."); return; }
    setBusy(true);
    try {
      const url = await genUrl();
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type || "application/pdf" }, body: file });
      if (!res.ok) throw new Error("upload");
      const { storageId } = await res.json();
      await setReglement({ storageId, fileName: file.name });
      toast.success("Règlement mis à jour.");
    } catch {
      toast.error("Téléversement impossible.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="mdt-press flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50"
      >
        <Upload className="h-[15px] w-[15px]" /> {busy ? "Téléversement…" : compact ? "Remplacer le PDF" : "Téléverser le règlement (PDF)"}
      </button>
    </>
  );
}
