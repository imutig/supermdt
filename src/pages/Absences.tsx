import { useState } from "react";
import { X } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useToast } from "@/providers/toast";
import { parisDayStart, parisDayEnd } from "@/lib/paris";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { Clover } from "@/components/common/Clover";
import { DeleteButton } from "@/components/common/DeleteButton";

// Les absences ne sont plus soumises à approbation : on affiche leur état
// temporel (à venir / en cours / terminée) plutôt qu'un statut de validation.
function periodState(from: number, to: number): { label: string; color: string } {
  const now = Date.now();
  if (now < from) return { label: "À venir", color: "var(--accent)" };
  if (now > to) return { label: "Terminée", color: "var(--muted)" };
  return { label: "En cours", color: "var(--warning)" };
}

export function Absences() {
  const list = useQuery(api.absences.list);
  const remove = useMutation(api.absences.remove);
  const toast = useToast();
  const [modal, setModal] = useState(false);

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px] flex items-center gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Absences</h1>
        <div className="flex-1" />
        <button onClick={() => setModal(true)} className="mdt-press flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]">
          <Clover color="#fff" size={17} /> Déclarer une absence
        </button>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-[1.2fr_1.6fr_1.4fr_.9fr_.9fr] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
          <span>Agent</span><span>Motif</span><span>Période</span><span>État</span><span></span>
        </div>
        {list === undefined && <div className="p-4"><SkeletonRows rows={4} /></div>}
        {list && list.length === 0 && <EmptyState title="Aucune absence" message="Les absences déclarées apparaîtront ici." />}
        {(list ?? []).map((a) => {
          const s = periodState(a.from, a.to);
          return (
            <div key={a._id} className="grid grid-cols-[1.2fr_1.6fr_1.4fr_.9fr_.9fr] items-center gap-3 border-b border-border px-4 py-3">
              <span className="text-[13px] font-semibold">{a.agentName}</span>
              <span className="text-[12.5px] text-muted">{a.reason}</span>
              <span className="font-data text-[11.5px] text-muted">
                {new Date(a.from).toLocaleDateString("fr-FR")} - {new Date(a.to).toLocaleDateString("fr-FR")}
              </span>
              <span className="text-[12px] font-semibold" style={{ color: s.color }}>{s.label}</span>
              <span className="flex items-center justify-end gap-2">
                {a.canDelete && (
                  <DeleteButton onDelete={() => toast.guard(remove({ id: a._id as Id<"absences"> }), "Suppression impossible")} title="Supprimer l'absence" />
                )}
              </span>
            </div>
          );
        })}
      </div>

      {modal && <AbsenceModal onClose={() => setModal(false)} />}
    </div>
  );
}

function AbsenceModal({ onClose }: { onClose: () => void }) {
  const request = useMutation(api.absences.request);
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const fromTs = parisDayStart(from);
    const toTs = parisDayEnd(to);
    if (!reason.trim() || fromTs == null || toTs == null) return;
    setBusy(true);
    const r = await toast.guard(
      request({ reason: reason.trim(), from: fromTs, to: toTs }),
      "Demande impossible",
    );
    setBusy(false);
    if (r !== undefined) {
      toast.success("Absence demandée.");
      onClose();
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[440px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">Déclarer une absence</h2>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-4">
          <div className="grid grid-cols-2 gap-3">
            <L label="Du">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={FIELD} />
            </L>
            <L label="Au">
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={FIELD} />
            </L>
          </div>
          <L label="Motif">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} className="w-full resize-y rounded-sm border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-accent" />
          </L>
        </div>
        <div className="flex flex-shrink-0 gap-2 border-t border-border px-[18px] py-4">
          <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
          <button onClick={submit} disabled={busy || !reason.trim() || !from || !to} className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">
            {busy ? "…" : "Déclarer"}
          </button>
        </div>
      </div>
    </div>
  );
}

const FIELD = "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">{label}</div>
      {children}
    </div>
  );
}
