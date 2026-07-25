import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, ChevronRight, Settings, Plus, Trash2, ChevronUp, ChevronDown, ArrowLeft, Star, ListChecks, SplitSquareHorizontal, Lock } from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { fmtMatricule } from "@/components/common/AgentTag";

// Formation terrain : liste des Officiers 1, accès à leur fiche FTO.
export function LspaFto() {
  const list = useQuery(api.fto.listOffi1);
  const navigate = useNavigate();
  const { can } = useCan();
  const [configuring, setConfiguring] = useState(false);

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px] flex items-end gap-3">
        <div className="flex-1">
          <h1 className="m-0 text-[21px] font-bold tracking-tight">Formation terrain (FTO)</h1>
          <div className="mt-[3px] text-[13px] text-muted">Les Officiers 1 en formation, encadrés par leur tuteur jusqu'au passage Officier 2.</div>
        </div>
        {can("fto.manage") && <Button onClick={() => setConfiguring(true)}><Settings className="h-[15px] w-[15px]" /> Configurer la fiche</Button>}
      </div>

      {configuring && <FtoConfigModal onClose={() => setConfiguring(false)} />}

      {list === undefined ? (
        <div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={4} /></div>
      ) : list.length === 0 ? (
        <div className="rounded-card border border-border bg-surface"><EmptyState title="Aucun Officier 1" message="Les agents au grade Officier 1 apparaîtront ici." /></div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {list.map((o) => (
            <button
              key={o._id}
              disabled={!o.canOpen}
              onClick={() => navigate(`/lspa/fto/${o._id}`)}
              title={o.canOpen ? undefined : "Réservé au tuteur référent et à l'encadrement"}
              className="flex w-full items-center gap-[13px] border-b border-border px-[16px] py-[12px] text-left last:border-b-0 enabled:hover:bg-surface-2 disabled:cursor-default disabled:opacity-60"
            >
              <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent"><ShieldCheck className="h-[16px] w-[16px]" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-[7px] text-[14px] font-semibold">
                  {fmtMatricule(o.matricule) && <span className="font-data text-[12px] text-accent">{fmtMatricule(o.matricule)}</span>}
                  <span className="truncate">{o.name}</span>
                </div>
                <div className="text-[11.5px] text-muted">{o.tutorName ? `Tuteur : ${o.tutorName}` : "Sans tuteur"}</div>
              </div>
              {o.canOpen ? (
                <>
                  <div className="flex w-[130px] flex-shrink-0 items-center gap-[8px]">
                    <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${o.progress}%` }} /></div>
                    <span className="font-data text-[11.5px] text-muted">{o.progress}%</span>
                  </div>
                  <ChevronRight className="h-[16px] w-[16px] flex-shrink-0 text-faint" />
                </>
              ) : (
                <Lock className="h-[15px] w-[15px] flex-shrink-0 text-faint" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const KINDS = [
  { value: "SCALE", label: "Critère noté", icon: Star },
  { value: "CHECK_TP", label: "Théorie / Pratique", icon: SplitSquareHorizontal },
  { value: "CHECK", label: "Validation", icon: ListChecks },
] as const;

function FtoConfigModal({ onClose }: { onClose: () => void }) {
  const items = useQuery(api.fto.listItems);
  const seed = useMutation(api.fto.seedDefault);
  const move = useMutation(api.fto.moveItem);
  const remove = useMutation(api.fto.removeItem);
  const toast = useToast();
  const [editing, setEditing] = useState<"new" | { _id: string; section: string; label: string; kind: string } | null>(null);

  if (editing) return <ItemForm item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />;

  return (
    <Modal title="Configurer la fiche FTO" icon={<Settings className="h-[17px] w-[17px]" />} onClose={onClose} width={560}
      footer={<><Button variant="ghost" onClick={onClose}>Fermer</Button><Button variant="primary" onClick={() => setEditing("new")}><Plus className="h-[15px] w-[15px]" /> Ajouter un critère</Button></>}
    >
      {items === undefined ? <SkeletonRows rows={6} /> : items.length === 0 ? (
        <div className="flex flex-col items-center gap-[12px] py-6 text-center">
          <div className="text-[13px] text-muted">Aucune fiche configurée.</div>
          <Button variant="primary" onClick={() => void toast.guard(seed({}), "Création impossible")}>Créer la fiche par défaut</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-[6px]">
          {items.map((it, idx) => {
            const K = KINDS.find((k) => k.value === it.kind) ?? KINDS[0];
            return (
              <div key={it._id} className="flex items-center gap-[9px] rounded-sm border border-border bg-surface-2 px-[11px] py-[8px]">
                <span className="w-[110px] flex-shrink-0 truncate text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">{it.section}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{it.label}</div>
                  <div className="flex items-center gap-[5px] text-[11px] text-faint"><K.icon className="h-[11px] w-[11px]" /> {K.label}</div>
                </div>
                <button disabled={idx === 0} onClick={() => void move({ itemId: it._id as Id<"ftoItems">, direction: "up" })} className="text-faint hover:text-text disabled:opacity-30"><ChevronUp className="h-[15px] w-[15px]" /></button>
                <button disabled={idx === items.length - 1} onClick={() => void move({ itemId: it._id as Id<"ftoItems">, direction: "down" })} className="text-faint hover:text-text disabled:opacity-30"><ChevronDown className="h-[15px] w-[15px]" /></button>
                <button onClick={() => setEditing(it)} className="text-faint hover:text-text"><Settings className="h-[13px] w-[13px]" /></button>
                <button onClick={() => void remove({ itemId: it._id as Id<"ftoItems"> })} className="text-faint hover:text-danger"><Trash2 className="h-[13px] w-[13px]" /></button>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function ItemForm({ item, onClose }: { item: { _id: string; section: string; label: string; kind: string } | null; onClose: () => void }) {
  const save = useMutation(api.fto.saveItem);
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
          const r = await toast.guard(save({ itemId: item ? (item._id as Id<"ftoItems">) : undefined, section, label, kind }), "Enregistrement impossible");
          setBusy(false); if (r) onClose();
        }}>Enregistrer</Button></>}
    >
      <div className="flex flex-col gap-[12px]">
        <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Section</span><input value={section} onChange={(e) => setSection(e.target.value)} placeholder="Véhicule, Communication radio…" className={F} /></label>
        <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Libellé</span><input value={label} onChange={(e) => setLabel(e.target.value)} className={F} /></label>
        <div className="flex flex-col gap-[5px]">
          <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Type</span>
          <div className="grid grid-cols-3 gap-[6px]">
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
