import { useState } from "react";
import { X, Trash2, FileText } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { AgentTag } from "@/components/common/AgentTag";
import { useToast } from "@/providers/toast";
import { ContraventionDoc } from "@/components/docs/ContraventionDoc";

// Détail complet d'une contravention (§6). Miroir du modal casier, sans prison ni arrestation.
export function ContraventionModal({
  citationId,
  canDelete: canDeleteAny,
  onClose,
}: {
  citationId: Id<"citations">;
  canDelete: boolean;
  onClose: () => void;
}) {
  const entry = useQuery(api.citations.getEntry, { citationId });
  // L'agent verbalisateur peut annuler sa contravention sans la permission.
  const canDelete = canDeleteAny || !!entry?.mine;
  const remove = useMutation(api.citations.remove);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [doc, setDoc] = useState(false);

  async function doDelete() {
    setBusy(true);
    const r = await toast.guard(remove({ citationId }), "Suppression impossible");
    setBusy(false);
    if (r !== undefined) {
      toast.success("Contravention supprimée (archivée).");
      onClose();
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex justify-end"
      style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-[480px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]"
        style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}
      >
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <div className="flex-1">
            <h2 className="m-0 text-[15px] font-bold">Contravention</h2>
            <div className="mt-[2px] text-[12px] text-muted">
              {entry ? entry.citizenName : "…"}
              {entry && <> · <span className="font-data">{new Date(entry.at).toLocaleString("fr-FR")}</span></>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-[18px] py-4">
          {entry === undefined ? (
            <div className="text-[13px] text-muted">Chargement…</div>
          ) : entry === null ? (
            <div className="text-[13px] text-muted">Introuvable.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border">
                <div className="bg-surface-2 px-3 py-[10px]">
                  <div className="mb-[3px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Montant</div>
                  <div className="font-data text-[14px] font-semibold">${entry.totalFine.toLocaleString("fr-FR")}</div>
                </div>
                <div className="bg-surface-2 px-3 py-[10px]">
                  <div className="mb-[3px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">DEFCON</div>
                  <div className="text-[13px]">{entry.defcon.name}</div>
                </div>
                <div className="bg-surface-2 px-3 py-[10px]">
                  <div className="mb-[3px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Agent</div>
                  <div className="text-[13px]"><AgentTag agent={entry.officer} /></div>
                </div>
                <div className="bg-surface-2 px-3 py-[10px]">
                  <div className="mb-[3px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Statut</div>
                  <div className="text-[13px]">{entry.status === "ANNULEE" ? "Annulée" : "Émise"}</div>
                </div>
              </div>

              <div>
                <div className="mb-[8px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
                  Charges ({entry.charges.length})
                </div>
                <div className="flex flex-col gap-[8px]">
                  {entry.charges.map((ch, i) => (
                    <div key={i} className="rounded-sm border border-border bg-surface-2 px-[12px] py-[10px]">
                      <div className="flex items-baseline gap-2">
                        <span className="flex-1 text-[13px] font-semibold">{ch.name}</span>
                        <span className="font-data text-[13px] font-semibold">
                          {ch.onDecision ? "À décision" : `$${ch.computedFine.toLocaleString("fr-FR")}`}
                        </span>
                      </div>
                      <div className="mt-[5px] flex flex-wrap gap-[6px] text-[11px]">
                        <span className="rounded-[4px] border border-border bg-surface px-[6px] py-[1px] text-muted">{ch.category}</span>
                        {ch.isRecidive && (
                          <span className="rounded-[4px] px-[6px] py-[1px] font-semibold" style={{ background: "color-mix(in srgb, var(--warning) 16%, transparent)", color: "var(--warning)" }}>Récidive</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {entry.notes && (
                <div>
                  <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Notes</div>
                  <div className="whitespace-pre-wrap rounded-sm border border-border bg-surface-2 px-[12px] py-[10px] text-[13px]">{entry.notes}</div>
                </div>
              )}
            </>
          )}
        </div>

        {entry && (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-t border-border px-[18px] py-4">
            <button onClick={() => setDoc(true)} className="flex items-center gap-[7px] rounded-sm border border-border bg-surface-2 px-3 py-[10px] text-[13px] font-semibold text-muted hover:border-border-strong">
              <FileText className="h-4 w-4" /> Document officiel
            </button>
            <div className="flex-1" />
            {canDelete && (<>
            {confirm ? (
              <>
                <span className="flex-1 text-[12.5px] text-muted">Supprimer (archiver) ?</span>
                <button onClick={() => setConfirm(false)} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
                <button onClick={doDelete} disabled={busy} className="rounded-sm px-4 py-[10px] text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--danger)" }}>{busy ? "…" : "Confirmer"}</button>
              </>
            ) : (
              <button onClick={() => setConfirm(true)} className="flex items-center gap-[7px] rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong" style={{ color: "var(--danger)" }}>
                <Trash2 className="h-4 w-4" /> Supprimer
              </button>
            )}</>)}
          </div>
        )}
      </div>

      {doc && <ContraventionDoc citationId={citationId} onClose={() => setDoc(false)} />}
    </div>
  );
}
