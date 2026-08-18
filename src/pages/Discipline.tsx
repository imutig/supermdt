import { Fragment, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { X, Paperclip, Trash2, RotateCcw } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/api";
import { useToast } from "@/providers/toast";
import { useCan } from "@/hooks/useCan";
import { InvestigationsSection } from "@/components/discipline/Investigations";
import { ImageGallery } from "@/components/common/ImageGallery";
import { SanctionModal } from "@/components/effectif/SanctionModal";
import { ConvocationModal } from "@/components/effectif/ConvocationModal";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { Clover } from "@/components/common/Clover";

const LEVELS: Record<string, { label: string; color: string }> = {
  AVERTISSEMENT: { label: "Avertissement", color: "var(--muted)" },
  BLAME: { label: "Blâme", color: "var(--warning)" },
  MISE_A_PIED: { label: "Mise à pied", color: "var(--danger)" },
  RADIATION: { label: "Radiation", color: "#b91c1c" },
  AUTRE: { label: "Autre", color: "var(--muted)" },
};
const fmtDateTime = (ts: number) => new Date(ts).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

export function Discipline() {
  const { can } = useCan();
  const canManage = can("discipline.create") || can("discipline.edit") || can("discipline.delete");
  const canConvoke = can("convocations.create");
  const canInvestigate = can("investigations.view");
  const [params] = useSearchParams();
  const deepEnquete = params.get("enquete");
  const [tab, setTab] = useState<"sanctions" | "convocations" | "enquetes">(deepEnquete && canInvestigate ? "enquetes" : "sanctions");
  const [modal, setModal] = useState<"sanction" | "convocation" | null>(null);
  const TABS: { key: "sanctions" | "convocations" | "enquetes"; label: string }[] = [
    { key: "sanctions", label: "Sanctions" },
    { key: "convocations", label: "Convocations" },
    ...(canInvestigate ? [{ key: "enquetes" as const, label: "Enquêtes internes" }] : []),
  ];

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[14px] flex items-center gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Discipline</h1>
        <span className="text-[12.5px] text-muted">Internal Affairs Division</span>
        <div className="flex-1" />
        {canConvoke && (
          <button onClick={() => setModal("convocation")} className="mdt-press flex items-center gap-[7px] rounded-[9px] border border-border bg-surface-2 px-[13px] py-[8px] text-[13px] font-semibold hover:border-border-strong">
            Convoquer
          </button>
        )}
        {can("discipline.create") && (
          <button onClick={() => setModal("sanction")} className="mdt-press flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]">
            <Clover color="#fff" size={17} /> Sanction
          </button>
        )}
      </div>

      <div className="mb-[14px] flex gap-[2px] rounded-card border border-border bg-surface p-[5px]">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className="rounded-[7px] px-[13px] py-[7px] text-[12.5px] font-semibold hover:bg-surface-2" style={tab === t.key ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "sanctions" ? <SanctionsTable canManage={canManage} />
        : tab === "convocations" ? <ConvocationsTable canManage={canManage} />
        : <InvestigationsSection initialOpenId={deepEnquete} />}

      {modal === "sanction" && <SanctionModal onClose={() => setModal(null)} />}
      {modal === "convocation" && <ConvocationModal onClose={() => setModal(null)} />}
    </div>
  );
}

function SanctionsTable({ canManage }: { canManage: boolean }) {
  const list = useQuery(api.disciplines.list);
  const remove = useMutation(api.disciplines.remove);
  const setEvidence = useMutation(api.disciplines.setEvidence);
  const reactivate = useMutation(api.disciplines.reactivate);
  const toast = useToast();
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      {/* Scroll horizontal sur petit écran : en-tête et lignes partagent le même min-w. */}
      <div className="overflow-x-auto">
      <div className="min-w-[820px]">
      <div className="grid grid-cols-[.6fr_1.1fr_1.5fr_1.1fr_.9fr_.8fr_auto] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
        <span>Réf.</span><span>Agent</span><span>Motif</span><span>Sanction</span><span>Par</span><span>Date</span><span></span>
      </div>
      {list === undefined && <div className="p-4"><SkeletonRows rows={4} /></div>}
      {list && list.length === 0 && <EmptyState title="Aucune sanction" message="Aucune procédure disciplinaire enregistrée." />}
      {(list ?? []).map((d) => {
        const lvl = d.level ? LEVELS[d.level] : null;
        return (
        <Fragment key={d._id}>
        <div className="grid grid-cols-[.6fr_1.1fr_1.5fr_1.1fr_.9fr_.8fr_auto] items-center gap-3 border-b border-border px-4 py-3">
          <span className="font-data text-[11.5px] text-faint">{d.reference != null ? `SANC-${String(d.reference).padStart(4, "0")}` : "-"}</span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold">{d.agentName}</span>
            {d.agentSuspended && <span className="text-[10.5px] font-bold" style={{ color: "var(--danger)" }}>● Mis à pied{d.suspendedUntil ? ` · fin ${fmtDateTime(d.suspendedUntil)}` : " · jusqu'à nouvel ordre"}</span>}
          </span>
          <span className="truncate text-[12.5px] text-muted">{d.motif}</span>
          <span className="flex flex-col gap-[3px]">
            <span className="w-fit rounded-[5px] px-[8px] py-[3px] text-[11.5px] font-semibold" style={{ background: "color-mix(in srgb, var(--warning) 14%, transparent)", color: "var(--warning)" }}>{d.sanction}</span>
            {lvl && <span className="w-fit text-[10px] font-bold uppercase tracking-[0.05em]" style={{ color: lvl.color }}>{lvl.label}</span>}
          </span>
          <span className="truncate text-[12px] text-muted">{d.by}</span>
          <span className="font-data text-[11.5px] text-muted">{new Date(d.at).toLocaleDateString("fr-FR")}</span>
          <span className="flex items-center justify-end gap-1">
            {canManage && d.agentSuspended && d.agentId && (
              <button onClick={async () => { const r = await toast.guard(reactivate({ agentId: d.agentId! }), "Action impossible"); if (r !== undefined) toast.success("Mise à pied levée."); }} title="Lever la mise à pied" className="flex h-[26px] items-center gap-[5px] rounded-sm border px-[7px] text-[11px] font-semibold" style={{ borderColor: "var(--success)", color: "var(--success)" }}>
                <RotateCcw className="h-[13px] w-[13px]" /> Lever
              </button>
            )}
            <button onClick={() => setOpenEvidence(openEvidence === d._id ? null : d._id)} title="Preuves" className="flex h-[26px] items-center gap-[5px] rounded-sm border border-border bg-surface-2 px-[7px] text-[11.5px] font-semibold text-muted hover:border-border-strong">
              <Paperclip className="h-[13px] w-[13px]" />{d.evidence.length > 0 && d.evidence.length}
            </button>
            {canManage && (confirmDel === d._id ? (
              <span className="flex items-center gap-1">
                <button onClick={async () => { const r = await toast.guard(remove({ id: d._id }), "Suppression impossible"); setConfirmDel(null); if (r !== undefined) toast.success("Supprimé."); }} className="rounded-[4px] px-[7px] py-[3px] text-[11px] font-semibold text-white" style={{ background: "var(--danger)" }}>Ok</button>
                <button onClick={() => setConfirmDel(null)} className="flex h-[24px] w-[24px] items-center justify-center rounded-sm border border-border text-muted"><X className="h-[13px] w-[13px]" /></button>
              </span>
            ) : (
              <button onClick={() => setConfirmDel(d._id)} className="flex h-[26px] w-[26px] items-center justify-center rounded-sm border border-border bg-surface-2 text-faint hover:text-danger"><Trash2 className="h-[13px] w-[13px]" /></button>
            ))}
          </span>
        </div>
        {openEvidence === d._id && (
          <div className="border-b border-border bg-surface-2 px-4 py-3">
            <div className="mb-[7px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Preuves</div>
            <ImageGallery urls={d.evidence} onChange={canManage ? (urls) => toast.guard(setEvidence({ id: d._id, imageUrls: urls }), "Mise à jour impossible") : undefined} emptyLabel="Aucune preuve jointe." />
          </div>
        )}
        </Fragment>
        );
      })}
      </div>
      </div>
    </div>
  );
}

function ConvocationsTable({ canManage }: { canManage: boolean }) {
  const list = useQuery(api.convocations.list);
  const remove = useMutation(api.convocations.remove);
  const toast = useToast();
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      {/* Scroll horizontal sur petit écran : en-tête et lignes partagent le même min-w. */}
      <div className="overflow-x-auto">
      <div className="min-w-[760px]">
      <div className="grid grid-cols-[.6fr_1.2fr_1.8fr_1.1fr_.9fr_auto] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
        <span>Réf.</span><span>Convoqué</span><span>Infos supp.</span><span>Convocation</span><span>Par</span><span></span>
      </div>
      {list === undefined && <div className="p-4"><SkeletonRows rows={3} /></div>}
      {list && list.length === 0 && <EmptyState title="Aucune convocation" message="Aucune convocation enregistrée." />}
      {(list ?? []).map((c) => (
        <div key={c._id} className="grid grid-cols-[.6fr_1.2fr_1.8fr_1.1fr_.9fr_auto] items-center gap-3 border-b border-border px-4 py-3">
          <span className="font-data text-[11.5px] text-faint">{c.reference != null ? `CONV-${String(c.reference).padStart(4, "0")}` : "-"}</span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold">{c.agentName}</span>
            {!c.linked && !c.agentId && <span className="text-[10.5px] text-faint">via ID Discord</span>}
          </span>
          <span className="truncate text-[12.5px] text-muted">{c.motif}</span>
          <span className="text-[11.5px] text-muted">{c.convokedAt ? fmtDateTime(c.convokedAt) : "-"}{c.lieu ? ` · ${c.lieu}` : ""}</span>
          <span className="truncate text-[12px] text-muted">{c.by}</span>
          <span className="flex items-center justify-end">
            {canManage && (confirmDel === c._id ? (
              <span className="flex items-center gap-1">
                <button onClick={async () => { const r = await toast.guard(remove({ id: c._id }), "Suppression impossible"); setConfirmDel(null); if (r !== undefined) toast.success("Supprimé."); }} className="rounded-[4px] px-[7px] py-[3px] text-[11px] font-semibold text-white" style={{ background: "var(--danger)" }}>Ok</button>
                <button onClick={() => setConfirmDel(null)} className="flex h-[24px] w-[24px] items-center justify-center rounded-sm border border-border text-muted"><X className="h-[13px] w-[13px]" /></button>
              </span>
            ) : (
              <button onClick={() => setConfirmDel(c._id)} className="flex h-[26px] w-[26px] items-center justify-center rounded-sm border border-border bg-surface-2 text-faint hover:text-danger"><Trash2 className="h-[13px] w-[13px]" /></button>
            ))}
          </span>
        </div>
      ))}
      </div>
      </div>
    </div>
  );
}
