import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate, Navigate } from "react-router-dom";
import { Car, ChevronRight, Settings, Plus, Trash2, ChevronUp, ChevronDown, ArrowLeft, Star, ListChecks, History, Users } from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { useToast } from "@/providers/toast";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { fmtMatricule } from "@/components/common/AgentTag";

// First Lincoln : évaluations de la première patrouille encadrée des rookies.
export const VERDICTS = [
  { v: "EN_COURS", label: "En cours", color: "var(--muted)" },
  { v: "VALIDE", label: "Validé", color: "var(--success)" },
  { v: "A_REVOIR", label: "À revoir", color: "var(--warning)" },
  { v: "ECHEC", label: "Échec", color: "var(--danger)" },
] as const;
export function verdictMeta(v: string) {
  return VERDICTS.find((x) => x.v === v) ?? VERDICTS[0];
}

export function LspaFirstLincoln() {
  const access = useQuery(api.firstLincoln.access);
  const navigate = useNavigate();
  const [tab, setTab] = useState<"active" | "history">("active");
  const list = useQuery(api.firstLincoln.listRookies, { history: tab === "history" });
  const [configuring, setConfiguring] = useState(false);

  if (access === undefined) return null;
  if (!access.view) return <Navigate to="/lspa" replace />;

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[16px] flex items-end gap-3">
        <div className="flex-1">
          <h1 className="m-0 text-[21px] font-bold tracking-tight">First Lincoln</h1>
          <div className="mt-[3px] text-[13px] text-muted">Évaluation de la première patrouille menée en lead par le rookie, sous supervision.</div>
        </div>
        {access.manage && <Button onClick={() => setConfiguring(true)}><Settings className="h-[15px] w-[15px]" /> Configurer</Button>}
      </div>

      <div className="mb-[14px] flex gap-[6px]">
        <TabBtn on={tab === "active"} onClick={() => setTab("active")} icon={Users}>Rookies</TabBtn>
        <TabBtn on={tab === "history"} onClick={() => setTab("history")} icon={History}>Historique</TabBtn>
      </div>

      {configuring && <FlConfigModal onClose={() => setConfiguring(false)} />}

      {list === undefined ? (
        <div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={4} /></div>
      ) : list.length === 0 ? (
        <div className="rounded-card border border-border bg-surface">
          {tab === "active"
            ? <EmptyState title="Aucun rookie" message="Les agents en formation terrain apparaîtront ici pour leur First Lincoln." />
            : <EmptyState title="Historique vide" message="Les rookies évalués puis promus apparaîtront ici." />}
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {list.map((o) => {
            const vm = o.lastVerdict ? verdictMeta(o.lastVerdict) : null;
            return (
              <button key={o._id} onClick={() => navigate(`/lspa/first-lincoln/${o._id}`)}
                className="flex w-full items-center gap-[13px] border-b border-border px-[16px] py-[12px] text-left last:border-b-0 hover:bg-surface-2">
                <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
                  {o.avatarUrl ? <img src={o.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" /> : <Car className="h-[16px] w-[16px]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[7px] text-[14px] font-semibold">
                    {fmtMatricule(o.matricule) && <span className="font-data text-[12px] text-accent">{fmtMatricule(o.matricule)}</span>}
                    <span className="truncate">{o.name}</span>
                    {o.gradeName && <span className="rounded-[5px] bg-surface-2 px-[7px] py-[1px] text-[10.5px] font-semibold text-muted">{o.gradeName}</span>}
                  </div>
                  <div className="text-[11.5px] text-muted">{o.count === 0 ? "Aucune évaluation" : `${o.count} évaluation${o.count > 1 ? "s" : ""}`}</div>
                </div>
                {vm && <span className="flex-shrink-0 rounded-[6px] px-[8px] py-[3px] text-[11px] font-bold uppercase" style={{ background: `color-mix(in srgb, ${vm.color} 14%, transparent)`, color: vm.color }}>{vm.label}</span>}
                <ChevronRight className="h-[16px] w-[16px] flex-shrink-0 text-faint" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TabBtn({ on, onClick, icon: Icon, children }: { on: boolean; onClick: () => void; icon: typeof Users; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex items-center gap-[6px] rounded-[8px] border px-[12px] py-[7px] text-[12.5px] font-semibold"
      style={on ? { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent)" } : { background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--muted)" }}>
      <Icon className="h-[14px] w-[14px]" /> {children}
    </button>
  );
}

const KINDS = [
  { value: "SCALE", label: "Critère noté", icon: Star },
  { value: "CHECK", label: "Validation", icon: ListChecks },
] as const;

function FlConfigModal({ onClose }: { onClose: () => void }) {
  const items = useQuery(api.firstLincoln.listCriteria);
  const seed = useMutation(api.firstLincoln.seedDefault);
  const move = useMutation(api.firstLincoln.moveCriterion);
  const remove = useMutation(api.firstLincoln.removeCriterion);
  const toast = useToast();
  const [editing, setEditing] = useState<"new" | { _id: string; section: string; label: string; kind: string } | null>(null);

  if (editing) return <CriterionForm item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />;

  return (
    <Modal title="Configurer la grille First Lincoln" icon={<Settings className="h-[17px] w-[17px]" />} onClose={onClose} width={560}
      footer={<><Button variant="ghost" onClick={onClose}>Fermer</Button><Button variant="primary" onClick={() => setEditing("new")}><Plus className="h-[15px] w-[15px]" /> Ajouter un critère</Button></>}
    >
      {items === undefined ? <SkeletonRows rows={6} /> : items.length === 0 ? (
        <div className="flex flex-col items-center gap-[12px] py-6 text-center">
          <div className="text-[13px] text-muted">Aucune grille configurée.</div>
          <Button variant="primary" onClick={() => void toast.guard(seed({}), "Création impossible")}>Créer la grille par défaut</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-[6px]">
          {items.map((it, idx) => {
            const K = KINDS.find((k) => k.value === it.kind) ?? KINDS[0];
            return (
              <div key={it._id} className="flex items-center gap-[9px] rounded-sm border border-border bg-surface-2 px-[11px] py-[8px]">
                <span className="w-[130px] flex-shrink-0 truncate text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">{it.section}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{it.label}</div>
                  <div className="flex items-center gap-[5px] text-[11px] text-faint"><K.icon className="h-[11px] w-[11px]" /> {K.label}</div>
                </div>
                <button disabled={idx === 0} onClick={() => void move({ criterionId: it._id as Id<"flCriteria">, direction: "up" })} className="text-faint hover:text-text disabled:opacity-30"><ChevronUp className="h-[15px] w-[15px]" /></button>
                <button disabled={idx === items.length - 1} onClick={() => void move({ criterionId: it._id as Id<"flCriteria">, direction: "down" })} className="text-faint hover:text-text disabled:opacity-30"><ChevronDown className="h-[15px] w-[15px]" /></button>
                <button onClick={() => setEditing(it)} className="text-faint hover:text-text"><Settings className="h-[13px] w-[13px]" /></button>
                <button onClick={() => void remove({ criterionId: it._id as Id<"flCriteria"> })} className="text-faint hover:text-danger"><Trash2 className="h-[13px] w-[13px]" /></button>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function CriterionForm({ item, onClose }: { item: { _id: string; section: string; label: string; kind: string } | null; onClose: () => void }) {
  const save = useMutation(api.firstLincoln.saveCriterion);
  const toast = useToast();
  const [section, setSection] = useState(item?.section ?? "");
  const [label, setLabel] = useState(item?.label ?? "");
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>((item?.kind as (typeof KINDS)[number]["value"]) ?? "SCALE");
  const [busy, setBusy] = useState(false);
  const F = "h-9 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";
  return (
    <Modal title={item ? "Modifier le critère" : "Nouveau critère"} onClose={onClose} width={480}
      footer={<><Button variant="ghost" onClick={onClose}><ArrowLeft className="h-[14px] w-[14px]" /> Retour</Button>
        <Button variant="primary" loading={busy} disabled={!section.trim() || !label.trim()} onClick={async () => {
          setBusy(true);
          const r = await toast.guard(save({ criterionId: item ? (item._id as Id<"flCriteria">) : undefined, section, label, kind }), "Enregistrement impossible");
          setBusy(false); if (r) onClose();
        }}>Enregistrer</Button></>}
    >
      <div className="flex flex-col gap-[12px]">
        <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Section</span><input value={section} onChange={(e) => setSection(e.target.value)} placeholder="Posture de lead, Conduite…" className={F} /></label>
        <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Libellé</span><input value={label} onChange={(e) => setLabel(e.target.value)} className={F} /></label>
        <div className="flex flex-col gap-[5px]">
          <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Type</span>
          <div className="grid grid-cols-2 gap-[6px]">
            {KINDS.map((k) => (
              <button key={k.value} onClick={() => setKind(k.value)} className="mdt-press flex flex-col items-center gap-[4px] rounded-[9px] border p-[9px] text-center" style={{ borderColor: kind === k.value ? "var(--accent)" : "var(--border)", background: kind === k.value ? "var(--accent-soft)" : "var(--surface-2)" }}>
                <k.icon className="h-[15px] w-[15px]" style={{ color: kind === k.value ? "var(--accent)" : "var(--faint)" }} />
                <span className="text-[10.5px] font-semibold leading-tight" style={{ color: kind === k.value ? "var(--accent)" : "var(--muted)" }}>{k.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
