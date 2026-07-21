import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { Clover } from "@/components/common/Clover";

const STATUS: Record<string, { label: string; color: string }> = {
  BROUILLON: { label: "Brouillon", color: "var(--muted)" },
  SOUMIS: { label: "Soumis", color: "var(--warning)" },
  VALIDE: { label: "Validé", color: "var(--success)" },
};

export function Rapports() {
  const list = useQuery(api.reports.list);
  const { can } = useCan();
  const navigate = useNavigate();
  const [modal, setModal] = useState(false);

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px] flex items-center gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Rapports</h1>
        <div className="flex-1" />
        {can("rapports.create") && (
          <button onClick={() => setModal(true)} className="mdt-press flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]">
            <Clover color="#fff" size={17} /> Rapport
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-[2fr_1fr_1.2fr_.8fr] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
          <span>Titre</span><span>Type</span><span>Lead</span><span>Statut</span>
        </div>
        {list === undefined && <div className="p-4"><SkeletonRows rows={5} /></div>}
        {list && list.length === 0 && <EmptyState title="Aucun rapport" message="Créez un premier rapport pour démarrer." />}
        {(list ?? []).map((r) => {
          const s = STATUS[r.status];
          return (
            <div key={r._id} onClick={() => navigate(`/rapport/${r._id}`)} className="grid cursor-pointer grid-cols-[2fr_1fr_1.2fr_.8fr] items-center gap-3 border-b border-border px-4 py-3 hover:bg-surface-2">
              <span className="text-[13px] font-semibold">{r.title}</span>
              <span className="text-[12.5px] text-muted">{r.typeName}</span>
              <span className="text-[12.5px] text-muted">{r.lead}</span>
              <span className="text-[12px] font-semibold" style={{ color: s.color }}>{s.label}</span>
            </div>
          );
        })}
      </div>

      {modal && <NewReportModal onClose={() => setModal(false)} />}
    </div>
  );
}

function NewReportModal({ onClose }: { onClose: () => void }) {
  const types = useQuery(api.reports.listTypes);
  const create = useMutation(api.reports.create);
  const toast = useToast();
  const navigate = useNavigate();
  const [typeId, setTypeId] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const effectiveType = typeId || types?.[0]?._id || "";

  async function submit() {
    if (!effectiveType || !title.trim()) return;
    setBusy(true);
    const id = await toast.guard(create({ typeId: effectiveType as Id<"reportTypes">, title: title.trim() }), "Création impossible");
    setBusy(false);
    if (id !== undefined) navigate(`/rapport/${id}`);
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[460px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">Nouveau rapport</h2>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-4">
          <div>
            <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Type</div>
            <select value={effectiveType} onChange={(e) => setTypeId(e.target.value)} className="h-10 w-full rounded-sm border border-border bg-surface-2 px-2 text-[13px] outline-none focus:border-accent">
              {(types ?? []).map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Titre</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="Titre du rapport" className="h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent" />
          </div>
        </div>
        <div className="flex flex-shrink-0 gap-2 border-t border-border px-[18px] py-4">
          <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
          <button onClick={submit} disabled={busy || !title.trim()} className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "…" : "Créer & rédiger"}</button>
        </div>
      </div>
    </div>
  );
}
