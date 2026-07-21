import { useState } from "react";
import { X } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useToast } from "@/providers/toast";
import { RichTextEditor } from "@/components/common/RichTextEditor";

// Ajout d'une déposition, reliée à une plainte OU un rapport (item 7).
export function DepositionModal({ citizenId, onClose }: { citizenId: Id<"citizens">; onClose: () => void }) {
  const opts = useQuery(api.depositions.linkOptions, { citizenId });
  const create = useMutation(api.depositions.create);
  const toast = useToast();
  const [linkType, setLinkType] = useState<"COMPLAINT" | "REPORT">("COMPLAINT");
  const [linkId, setLinkId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const list = linkType === "COMPLAINT" ? opts?.complaints ?? [] : opts?.reports ?? [];

  async function submit() {
    if (!body.trim() || !linkId) { toast.error("Rattachement et corps requis."); return; }
    setBusy(true);
    const r = await toast.guard(
      create({
        citizenId,
        linkType,
        complaintId: linkType === "COMPLAINT" ? (linkId as Id<"complaints">) : undefined,
        reportId: linkType === "REPORT" ? (linkId as Id<"reports">) : undefined,
        title: title.trim() || undefined,
        body: body.trim(),
      }),
      "Ajout impossible",
    );
    setBusy(false);
    if (r !== undefined) { toast.success("Déposition ajoutée."); onClose(); }
  }

  const F = "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";
  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[480px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">Nouvelle déposition</h2>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-4">
          <div>
            <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Rattachée à</div>
            <div className="mb-2 flex gap-2">
              <button onClick={() => { setLinkType("COMPLAINT"); setLinkId(""); }} className="flex-1 rounded-sm border px-2 py-[7px] text-[12.5px] font-semibold" style={linkType === "COMPLAINT" ? { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent)" } : { borderColor: "var(--border)", color: "var(--muted)" }}>Une plainte</button>
              <button onClick={() => { setLinkType("REPORT"); setLinkId(""); }} className="flex-1 rounded-sm border px-2 py-[7px] text-[12.5px] font-semibold" style={linkType === "REPORT" ? { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent)" } : { borderColor: "var(--border)", color: "var(--muted)" }}>Un rapport</button>
            </div>
            <select value={linkId} onChange={(e) => setLinkId(e.target.value)} className={F}>
              <option value="">Sélectionner…</option>
              {list.map((o) => <option key={o._id} value={o._id}>{o.label}</option>)}
            </select>
            {list.length === 0 && <div className="mt-1 text-[11.5px] text-faint">{linkType === "COMPLAINT" ? "Aucune plainte liée à ce citoyen." : "Aucun rapport impliquant ce citoyen."}</div>}
          </div>
          <div><div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Titre (optionnel)</div><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Déposition d'otage" className={F} /></div>
          <div><div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Déposition</div><RichTextEditor value={body} onChange={setBody} minHeight={190} placeholder="Propos recueillis…" /></div>
        </div>
        <div className="flex flex-shrink-0 gap-2 border-t border-border px-[18px] py-4">
          <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
          <button onClick={submit} disabled={busy || !body.trim() || !linkId} className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "…" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}
