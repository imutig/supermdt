import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { RichTextEditor } from "@/components/common/RichTextEditor";
import { CitizenPicker } from "@/components/common/CitizenPicker";
import { AgentPicker } from "@/components/common/AgentPicker";
import { AgentTag } from "@/components/common/AgentTag";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { Clover } from "@/components/common/Clover";

export function Plaintes() {
  const { can } = useCan();
  const canCreate = can("plaintes.create");
  const canManage = can("plaintes.create") || can("plaintes.edit") || can("plaintes.delete");
  const listQ = useQuery(api.complaints.list);
  const list = listQ ?? [];
  const navigate = useNavigate();
  const [modal, setModal] = useState<{ id?: Id<"complaints"> } | null>(null);

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[16px] flex items-center gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Plaintes</h1>
        <div className="flex-1" />
        {canCreate && <button onClick={() => setModal({})} className="mdt-press flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]"><Clover color="#fff" size={17} /> Plainte</button>}
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-[1.2fr_1.2fr_1.6fr_1fr_.8fr] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
          <span>Plaignant</span><span>Mis en cause</span><span>Motif</span><span>Statut</span><span>Date</span>
        </div>
        {listQ === undefined && <div className="p-4"><SkeletonRows rows={5} /></div>}
        {listQ !== undefined && list.length === 0 && <EmptyState title="Aucune plainte" message="Les plaintes déposées apparaîtront ici." />}
        {list.map((c) => (
          <div key={c._id} onClick={() => setModal({ id: c._id })} className="grid cursor-pointer grid-cols-[1.2fr_1.2fr_1.6fr_1fr_.8fr] items-center gap-3 border-b border-border px-4 py-3 hover:bg-surface-2">
            <span onClick={(e) => { e.stopPropagation(); if (c.plaignantId) navigate(`/citoyen/${c.plaignantId}`); }} className="text-[13px] font-semibold hover:text-accent">{c.plaignant ?? "-"}</span>
            <span onClick={(e) => { if (c.defendantCitizenId) { e.stopPropagation(); navigate(`/citoyen/${c.defendantCitizenId}`); } }} className={`text-[13px] ${c.defendantCitizenId ? "hover:text-accent" : "text-muted"}`}>{c.defendant}</span>
            <span className="truncate text-[12.5px] text-muted">{c.motif}</span>
            <span><span className="rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{c.status}</span></span>
            <span className="font-data text-[11.5px] text-muted">{new Date(c.at).toLocaleDateString("fr-FR")}</span>
          </div>
        ))}
      </div>

      {modal && <ComplaintModal complaintId={modal.id} canManage={canManage} onClose={() => setModal(null)} />}
    </div>
  );
}

export function ComplaintModal({
  complaintId,
  presetPlaignant,
  canManage,
  onClose,
}: {
  complaintId?: Id<"complaints">;
  presetPlaignant?: { id: string; name: string };
  canManage: boolean;
  onClose: () => void;
}) {
  const isCreate = !complaintId;
  const existing = useQuery(api.complaints.get, complaintId ? { id: complaintId } : "skip");
  const { can } = useCan();
  const opts = useQuery(api.configEditors.options);
  const roster = useQuery(api.agents.roster, can("effectif.view") ? {} : "skip") ?? [];
  const create = useMutation(api.complaints.create);
  const update = useMutation(api.complaints.update);
  const remove = useMutation(api.complaints.remove);
  const toast = useToast();

  const [init, setInit] = useState(isCreate);
  const [plaignant, setPlaignant] = useState<{ id: string; name: string } | null>(presetPlaignant ?? null);
  const [defMode, setDefMode] = useState<"citizen" | "free">("citizen");
  const [defendant, setDefendant] = useState<{ id: string; name: string } | null>(null);
  const [defName, setDefName] = useState("");
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [motif, setMotif] = useState("");
  const [status, setStatus] = useState("");
  const [avocat, setAvocat] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const readonly = !canManage;

  if (!init && existing) {
    setInit(true);
    if (existing.plaignantId) setPlaignant({ id: existing.plaignantId, name: existing.plaignant ?? "" });
    if (existing.defendantCitizenId) { setDefMode("citizen"); setDefendant({ id: existing.defendantCitizenId, name: existing.defendant ?? "" }); }
    else { setDefMode("free"); setDefName(existing.defendant ?? ""); }
    setAgentIds(existing.agentIds);
    setMotif(existing.motif); setStatus(existing.status); setAvocat(existing.avocat ?? ""); setBody(existing.body);
  }

  const effStatus = status || opts?.complaintStatuses?.[0]?.name || "Ouverte";

  async function save() {
    if (!plaignant || !motif.trim() || !body.trim()) { toast.error("Plaignant, motif et corps requis."); return; }
    setBusy(true);
    const payload = {
      defendantCitizenId: defMode === "citizen" && defendant ? (defendant.id as Id<"citizens">) : undefined,
      defendantName: defMode === "free" ? defName.trim() || undefined : undefined,
      agentIds: agentIds as Id<"agents">[],
      motif: motif.trim(), status: effStatus, avocat: avocat.trim() || undefined, body: body.trim(),
    };
    const r = isCreate
      ? await toast.guard(create({ plaignantId: plaignant.id as Id<"citizens">, ...payload }), "Création impossible")
      : await toast.guard(update({ id: complaintId!, ...payload }), "Modification impossible");
    setBusy(false);
    if (r !== undefined) { toast.success("Plainte enregistrée."); onClose(); }
  }

  const F = "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";
  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[560px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">{isCreate ? "Nouvelle plainte" : "Plainte"}</h2>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-4">
          <L label="Plaignant *"><CitizenPicker value={plaignant} onChange={setPlaignant} disabled={readonly || !!presetPlaignant} /></L>
          <div>
            <div className="mb-[6px] flex items-center gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Mis en cause</span>
              {!readonly && (
                <div className="flex gap-1">
                  <button onClick={() => setDefMode("citizen")} className="rounded-[5px] border px-[7px] py-[2px] text-[10.5px] font-semibold" style={defMode === "citizen" ? { borderColor: "var(--accent)", color: "var(--accent)" } : { borderColor: "var(--border)", color: "var(--muted)" }}>Citoyen</button>
                  <button onClick={() => setDefMode("free")} className="rounded-[5px] border px-[7px] py-[2px] text-[10.5px] font-semibold" style={defMode === "free" ? { borderColor: "var(--accent)", color: "var(--accent)" } : { borderColor: "var(--border)", color: "var(--muted)" }}>Non recensé</button>
                </div>
              )}
            </div>
            {defMode === "citizen" ? <CitizenPicker value={defendant} onChange={setDefendant} disabled={readonly} placeholder="Rechercher le mis en cause…" /> : <input value={defName} onChange={(e) => setDefName(e.target.value)} disabled={readonly} placeholder="Nom (personne non recensée)" className={F} />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <L label="Motif *"><input value={motif} onChange={(e) => setMotif(e.target.value)} disabled={readonly} className={F} /></L>
            <L label="Statut"><select value={effStatus} onChange={(e) => setStatus(e.target.value)} disabled={readonly} className={F}>{(opts?.complaintStatuses ?? []).map((s) => <option key={s._id} value={s.name}>{s.name}</option>)}</select></L>
          </div>
          <L label="Avocat (optionnel)"><input value={avocat} onChange={(e) => setAvocat(e.target.value)} disabled={readonly} className={F} /></L>
          <L label="Agents en charge">
            <AgentPicker roster={roster} selected={agentIds} onChange={setAgentIds} disabled={readonly} />
            {existing && existing.agents.length > 0 && agentIds.length === 0 && (
              <div className="mt-2 text-[11.5px] text-muted">Actuels : {existing.agents.map((ag, i) => <AgentTag key={i} agent={ag} className="mr-2" />)}</div>
            )}
          </L>
          <L label="Corps de la plainte *"><RichTextEditor value={body} onChange={setBody} editable={!readonly} minHeight={150} placeholder="Exposé des faits…" /></L>
        </div>
        {canManage && (
          <div className="flex flex-shrink-0 items-center gap-2 border-t border-border px-[18px] py-4">
            {!isCreate && (confirm ? (
              <>
                <span className="flex-1 text-[12.5px] text-muted">Supprimer ?</span>
                <button onClick={() => setConfirm(false)} className="rounded-sm border border-border bg-surface-2 px-3 py-[9px] text-[12.5px] font-semibold">Annuler</button>
                <button onClick={async () => { const r = await toast.guard(remove({ id: complaintId! }), "Suppression impossible"); if (r !== undefined) { toast.success("Supprimée."); onClose(); } }} className="rounded-sm px-3 py-[9px] text-[12.5px] font-semibold text-white" style={{ background: "var(--danger)" }}>Confirmer</button>
              </>
            ) : <button onClick={() => setConfirm(true)} className="rounded-sm border border-border bg-surface-2 px-3 py-[9px] text-[12.5px] font-semibold" style={{ color: "var(--danger)" }}>Supprimer</button>)}
            {!confirm && (
              <>
                <div className="flex-1" />
                <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
                <button onClick={save} disabled={busy} className="rounded-sm bg-accent px-5 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "…" : "Enregistrer"}</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">{label}</div>{children}</div>;
}
