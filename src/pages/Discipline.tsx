import { Fragment, useState } from "react";
import { X, Paperclip, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/api";
import { useToast } from "@/providers/toast";
import { useCan } from "@/hooks/useCan";
import { ImageGallery } from "@/components/common/ImageGallery";
import { SanctionModal } from "@/components/effectif/SanctionModal";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { Clover } from "@/components/common/Clover";

export function Discipline() {
  const list = useQuery(api.disciplines.list);
  const { can } = useCan();
  const canManage = can("discipline.create") || can("discipline.edit") || can("discipline.delete");
  const remove = useMutation(api.disciplines.remove);
  const setEvidence = useMutation(api.disciplines.setEvidence);
  const toast = useToast();
  const [modal, setModal] = useState(false);
  // Preuves dépliables sous la ligne concernée.
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px] flex items-center gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Discipline</h1>
        <div className="flex-1" />
        {canManage && (
          <button onClick={() => setModal(true)} className="mdt-press flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]">
            <Clover color="#fff" size={17} /> Sanction
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-[1.1fr_1.6fr_1.2fr_1fr_.8fr_auto] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
          <span>Agent</span><span>Motif</span><span>Sanction</span><span>Par</span><span>Date</span><span></span>
        </div>
        {list === undefined && <div className="p-4"><SkeletonRows rows={4} /></div>}
        {list && list.length === 0 && <EmptyState title="Aucune sanction" message="Aucune procédure disciplinaire enregistrée." />}
        {(list ?? []).map((d) => (
          <Fragment key={d._id}>
          <div className="grid grid-cols-[1.1fr_1.6fr_1.2fr_1fr_.8fr_auto] items-center gap-3 border-b border-border px-4 py-3">
            <span className="text-[13px] font-semibold">{d.agentName}</span>
            <span className="text-[12.5px] text-muted">{d.motif}</span>
            <span>
              <span className="rounded-[5px] px-[8px] py-[3px] text-[11.5px] font-semibold" style={{ background: "color-mix(in srgb, var(--warning) 14%, transparent)", color: "var(--warning)" }}>
                {d.sanction}
              </span>
            </span>
            <span className="text-[12px] text-muted">{d.by}</span>
            <span className="font-data text-[11.5px] text-muted">{new Date(d.at).toLocaleDateString("fr-FR")}</span>
            <span className="flex items-center justify-end gap-1">
              <button
                onClick={() => setOpenEvidence(openEvidence === d._id ? null : d._id)}
                title="Preuves"
                className="flex h-[26px] items-center gap-[5px] rounded-sm border border-border bg-surface-2 px-[7px] text-[11.5px] font-semibold text-muted hover:border-border-strong"
              >
                <Paperclip className="h-[13px] w-[13px]" />
                {d.evidence.length > 0 && d.evidence.length}
              </button>
              {canManage && (
                confirmDel === d._id ? (
                  <span className="flex items-center gap-1">
                    <button onClick={async () => { const r = await toast.guard(remove({ id: d._id }), "Suppression impossible"); setConfirmDel(null); if (r !== undefined) toast.success("Supprimé."); }} className="rounded-[4px] px-[7px] py-[3px] text-[11px] font-semibold text-white" style={{ background: "var(--danger)" }}>Ok</button>
                    <button onClick={() => setConfirmDel(null)} className="flex h-[24px] w-[24px] items-center justify-center rounded-sm border border-border text-muted"><X className="h-[13px] w-[13px]" /></button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDel(d._id)} className="flex h-[26px] w-[26px] items-center justify-center rounded-sm border border-border bg-surface-2 text-faint hover:text-danger"><Trash2 className="h-[13px] w-[13px]" /></button>
                )
              )}
            </span>
          </div>
          {openEvidence === d._id && (
            <div className="border-b border-border bg-surface-2 px-4 py-3">
              <div className="mb-[7px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Preuves</div>
              <ImageGallery
                urls={d.evidence}
                onChange={canManage ? (urls) => toast.guard(setEvidence({ id: d._id, imageUrls: urls }), "Mise à jour impossible") : undefined}
                emptyLabel="Aucune preuve jointe."
              />
            </div>
          )}
          </Fragment>
        ))}
      </div>

      {modal && <SanctionModal onClose={() => setModal(false)} />}
    </div>
  );
}
