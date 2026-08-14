import { useState } from "react";
import { X, Link2Off } from "lucide-react";
import { useAction, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { RichTextEditor } from "@/components/common/RichTextEditor";
import { AgentPicker } from "@/components/common/AgentPicker";

// Déposition (format NexusMDT) : autonome, avec un objet et les officiers
// présents. Synchronisée en write-through — réservée aux comptes Nexus liés.
export function DepositionModal({ citizenId, onClose }: { citizenId: Id<"citizens">; onClose: () => void }) {
  const { can } = useCan();
  const createSynced = useAction(api.nexusSync.createDeposition);
  const nexusStatus = useQuery(api.nexusSync.myStatus);
  const syncActive = !!nexusStatus?.configured && nexusStatus.status === "OK";
  const roster = useQuery(api.agents.roster, can("effectif.view") ? {} : "skip") ?? [];
  const toast = useToast();
  const [objet, setObjet] = useState("");
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!syncActive) { toast.error("Nécessite un compte NexusMDT lié (voir Mon profil)."); return; }
    if (!objet.trim() || !body.trim()) { toast.error("Objet et corps requis."); return; }
    setBusy(true);
    const r = await toast.guard(
      createSynced({ citizenId, title: objet.trim(), body: body.trim(), agentIds: agentIds as Id<"agents">[] }),
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
          {!syncActive && nexusStatus !== undefined && (
            <div className="flex items-start gap-[9px] rounded-sm px-3 py-[10px] text-[12px]" style={{ background: "color-mix(in srgb, var(--warning) 10%, transparent)", color: "var(--warning)" }}>
              <Link2Off className="mt-[1px] h-[15px] w-[15px] flex-shrink-0" />
              <span>Les dépositions sont synchronisées avec le NexusMDT. Lie ton compte Nexus dans <b>Mon profil</b> pour pouvoir en créer.</span>
            </div>
          )}
          <div><div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Objet *</div><input value={objet} onChange={(e) => setObjet(e.target.value)} disabled={!syncActive} placeholder="Ex. Interrogatoire — provenance de stupéfiants" className={F} /></div>
          <div><div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Officiers présents</div><AgentPicker roster={roster} selected={agentIds} onChange={setAgentIds} disabled={!syncActive} /></div>
          <div><div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Déposition *</div><RichTextEditor value={body} onChange={setBody} editable={syncActive} minHeight={190} placeholder="Propos recueillis…" /></div>
        </div>
        <div className="flex flex-shrink-0 gap-2 border-t border-border px-[18px] py-4">
          <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
          <button onClick={submit} disabled={busy || !syncActive || !objet.trim() || !body.trim()} className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "…" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}
