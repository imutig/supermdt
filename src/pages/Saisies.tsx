import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useMe } from "@/hooks/useMe";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { Clover } from "@/components/common/Clover";
import { fmtBadge } from "@/components/common/AgentTag";
import { Pagination, usePaged } from "@/components/common/Pagination";

export function Saisies() {
  const rows = useQuery(api.saisies.list);
  const remove = useMutation(api.saisies.remove);
  const me = useMe();
  const { can } = useCan();
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [page, setPage] = useState(1);
  const { pages, slice, safePage } = usePaged(rows ?? [], 20, page);

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[16px] flex items-center gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Saisies</h1>
        <span className="text-[12.5px] text-muted">Registre des objets saisis par les agents.</span>
        <div className="flex-1" />
        <button onClick={() => setModal(true)} className="mdt-press flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]">
          <Clover color="#fff" size={17} /> Saisie
        </button>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-[1.2fr_.6fr_1.4fr_1.3fr_.9fr_auto] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
          <span>Objet</span><span>Qté</span><span>Enquête</span><span>Agent</span><span>Date</span><span></span>
        </div>
        {rows === undefined && <div className="p-4"><SkeletonRows rows={6} /></div>}
        {rows && rows.length === 0 && <EmptyState title="Aucune saisie" message="Enregistrez une première saisie." />}
        {slice.map((s) => {
          // Le serveur accepte aussi `saisies.delete` : l'interface masquait le
          // bouton à qui détenait pourtant ce droit.
          const canDelete = me?.agent.isOwner || s.agentId === me?.agent._id || can("saisies.delete");
          return (
            <div key={s._id} className="grid grid-cols-[1.2fr_.6fr_1.4fr_1.3fr_.9fr_auto] items-center gap-3 border-b border-border px-4 py-[11px]">
              <span className="text-[13px] font-semibold">{s.objectLabel}</span>
              <span className="font-data text-[13px]">{s.quantity}</span>
              <span className="truncate text-[12.5px] text-muted">{s.enquete || "-"}</span>
              <span className="text-[12.5px]"><span className="font-data text-accent">{fmtBadge(s.matricule) ?? ""}</span> {s.agentName}</span>
              <span className="font-data text-[11.5px] text-muted">{new Date(s.at).toLocaleDateString("fr-FR")} {new Date(s.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
              <span>{canDelete && <button onClick={() => toast.guard(remove({ id: s._id as Id<"saisies"> }), "Suppression impossible")} className="text-faint hover:text-danger"><Trash2 className="h-[14px] w-[14px]" /></button>}</span>
            </div>
          );
        })}
        <Pagination page={safePage} pages={pages} total={(rows ?? []).length} onPage={setPage} label="saisies" />
      </div>

      {modal && <SaisieModal onClose={() => setModal(false)} />}
    </div>
  );
}

function SaisieModal({ onClose }: { onClose: () => void }) {
  const types = useQuery(api.saisies.objectTypes) ?? [];
  const create = useMutation(api.saisies.create);
  const me = useMe();
  const toast = useToast();
  const [objectType, setObjectType] = useState("");
  const [otherLabel, setOtherLabel] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [enquete, setEnquete] = useState("");
  const [busy, setBusy] = useState(false);

  const effectiveType = objectType || types[0] || "";
  const isOther = effectiveType === "Autre";

  async function submit() {
    if (!effectiveType) return;
    if (isOther && !otherLabel.trim()) { toast.error("Précisez l'objet saisi."); return; }
    setBusy(true);
    const r = await toast.guard(
      create({ objectType: effectiveType, otherLabel: isOther ? otherLabel.trim() : undefined, quantity: parseInt(quantity) || 1, enquete: enquete.trim() || undefined }),
      "Enregistrement impossible",
    );
    setBusy(false);
    if (r !== undefined) { toast.success("Saisie enregistrée."); onClose(); }
  }

  const F = "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";
  const L = "mb-[6px] block text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint";

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[460px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">Nouvelle saisie</h2>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-4">
          <div className="rounded-sm border border-border bg-surface-2 px-3 py-[10px] text-[12px] text-muted">
            <div className="flex justify-between"><span>Agent</span><span className="font-semibold text-text">{me ? `${me.agent.prenomRP} ${me.agent.nomRP}` : "…"}</span></div>
            <div className="mt-1 flex justify-between"><span>N° de badge</span><span className="font-data text-text">{fmtBadge(me?.agent.matricule) ?? "-"}</span></div>
            <div className="mt-1 flex justify-between"><span>Date & heure</span><span className="font-data text-text">automatiques</span></div>
          </div>
          <div><span className={L}>Type d'objet</span>
            <select value={effectiveType} onChange={(e) => setObjectType(e.target.value)} className={F}>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {isOther && <div><span className={L}>Préciser l'objet</span><input value={otherLabel} onChange={(e) => setOtherLabel(e.target.value)} autoFocus className={F} /></div>}
          <div><span className={L}>Quantité</span><input value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))} className={F} /></div>
          <div><span className={L}>Enquête liée (optionnel)</span><input value={enquete} onChange={(e) => setEnquete(e.target.value)} placeholder="Référence / intitulé de l'enquête…" className={F} /></div>
        </div>
        <div className="flex flex-shrink-0 gap-2 border-t border-border px-[18px] py-4">
          <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
          <button onClick={submit} disabled={busy} className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "…" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}
