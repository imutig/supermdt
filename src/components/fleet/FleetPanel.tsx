import { useState } from "react";
import { Car, X, Trash2, Plus } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { ImageUpload } from "@/components/common/ImageUpload";

// Registre des véhicules de service. Le numéro de toit détermine l'indicatif
// de patrouille : ses deux derniers chiffres en forment le suffixe.
export function FleetPanel() {
  const { can } = useCan();
  const canCreate = can("flotte.create");
  const canEdit = can("flotte.edit");
  const [q, setQ] = useState("");
  const rows = useQuery(api.fleet.list, q.trim() ? { q } : {});
  const [modal, setModal] = useState<{ id?: Id<"fleetVehicles"> } | null>(null);

  return (
    <>
      <div className="mb-[14px] flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher (numéro de toit, plaque, modèle)…"
          className="h-10 w-full max-w-[440px] rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent"
        />
        <div className="flex-1" />
        {canCreate && (
          <button onClick={() => setModal({})} className="mdt-press flex flex-shrink-0 items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]">
            <Plus className="h-[16px] w-[16px]" /> Véhicule LSPD
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-[56px_.7fr_1.4fr_1fr_.9fr] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
          <span />
          <span>N° toit</span><span>Modèle</span><span>Plaque</span><span>Indicatif</span>
        </div>
        {rows === undefined ? (
          <div className="p-4"><SkeletonRows rows={5} /></div>
        ) : rows.length === 0 ? (
          <EmptyState title={q ? "Aucun véhicule trouvé" : "Aucun véhicule LSPD"} message={q ? "Essayez un autre terme." : "Ajoutez un véhicule pour composer la flotte."} />
        ) : (
          rows.map((v) => (
            <div
              key={v._id}
              onClick={() => setModal({ id: v._id })}
              className="grid cursor-pointer grid-cols-[56px_.7fr_1.4fr_1fr_.9fr] items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-surface-2"
              style={v.active ? undefined : { opacity: 0.5 }}
            >
              <span>
                {v.photoUrl
                  ? <img src={v.photoUrl} alt="" className="h-[36px] w-[48px] rounded-[5px] border border-border object-cover" />
                  : <span className="flex h-[36px] w-[48px] items-center justify-center rounded-[5px] border border-dashed border-border text-faint"><Car className="h-[15px] w-[15px]" /></span>}
              </span>
              <span className="font-data text-[14px] font-bold">{v.roofNumber}</span>
              <span className="text-[13px]">{v.modele}</span>
              <span className="font-data text-[12.5px] text-muted">{v.plaque}</span>
              <span className="font-data text-[12.5px]" style={{ color: "var(--accent)" }}>13x{v.number}{v.active ? "" : " · hors service"}</span>
            </div>
          ))
        )}
      </div>

      {modal && <FleetVehicleModal id={modal.id} canEdit={canEdit || (modal.id === undefined && canCreate)} onClose={() => setModal(null)} />}
    </>
  );
}

function FleetVehicleModal({ id, canEdit, onClose }: { id?: Id<"fleetVehicles">; canEdit: boolean; onClose: () => void }) {
  const isCreate = !id;
  const existing = useQuery(api.fleet.get, id ? { id } : "skip");
  const create = useMutation(api.fleet.create);
  const update = useMutation(api.fleet.update);
  const remove = useMutation(api.fleet.remove);
  const { can } = useCan();
  const toast = useToast();

  const [init, setInit] = useState(false);
  const [f, setF] = useState({ modele: "", plaque: "", roofNumber: "", active: true });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  if (!init && existing) {
    setInit(true);
    setF({ modele: existing.modele, plaque: existing.plaque, roofNumber: existing.roofNumber, active: existing.active });
    setPhotoUrl(existing.photoUrl);
  }

  const suffix = f.roofNumber.replace(/[^0-9]/g, "").slice(-2).padStart(2, "0");

  async function save() {
    if (!f.modele.trim() || !f.plaque.trim() || !f.roofNumber.trim()) {
      toast.error("Modèle, plaque et numéro de toit requis.");
      return;
    }
    setBusy(true);
    const payload = { modele: f.modele.trim(), plaque: f.plaque.trim(), roofNumber: f.roofNumber.trim(), photoUrl: photoUrl ?? undefined };
    const r = isCreate
      ? await toast.guard(create(payload), "Création impossible")
      : await toast.guard(update({ id: id!, ...payload, active: f.active }), "Modification impossible");
    setBusy(false);
    if (r !== undefined) { toast.success(isCreate ? "Véhicule ajouté." : "Véhicule mis à jour."); onClose(); }
  }

  const F = "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[460px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">{isCreate ? "Ajouter un véhicule LSPD" : "Véhicule LSPD"}</h2>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-4">
          <L label="Photo">
            <ImageUpload value={photoUrl} onChange={setPhotoUrl} aspect="wide" className="w-[220px]" disabled={!canEdit} />
          </L>
          <div className="grid grid-cols-2 gap-3">
            <L label="N° de toit">
              <input value={f.roofNumber} onChange={(e) => setF({ ...f, roofNumber: e.target.value })} placeholder="509" disabled={!canEdit} className={`${F} font-data`} />
            </L>
            <L label="Indicatif de patrouille">
              <div className="flex h-10 items-center rounded-sm border border-dashed border-border px-3 font-data text-[13px]" style={{ color: "var(--accent)" }}>
                13x{suffix}
              </div>
            </L>
          </div>
          <L label="Modèle"><input value={f.modele} onChange={(e) => setF({ ...f, modele: e.target.value })} placeholder="Bravado Buffalo" disabled={!canEdit} className={F} /></L>
          <L label="Plaque"><input value={f.plaque} onChange={(e) => setF({ ...f, plaque: e.target.value })} placeholder="LSPD 001" disabled={!canEdit} className={`${F} font-data uppercase`} /></L>
          {!isCreate && (
            <label className="flex cursor-pointer items-center gap-[9px] pt-1 text-[13px]">
              <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} disabled={!canEdit} className="h-[15px] w-[15px] accent-[var(--accent)]" />
              En service (décocher pour retirer de la sélection sans le supprimer)
            </label>
          )}
        </div>

        {canEdit && (
          <div className="flex flex-shrink-0 items-center gap-2 border-t border-border px-[18px] py-4">
            {!isCreate && can("flotte.delete") && (confirm ? (
              <>
                <span className="flex-1 text-[12.5px] text-muted">Supprimer définitivement ?</span>
                <button onClick={() => setConfirm(false)} className="rounded-sm border border-border bg-surface-2 px-3 py-[9px] text-[12.5px] font-semibold">Annuler</button>
                <button onClick={async () => { const r = await toast.guard(remove({ id: id! }), "Suppression impossible"); if (r !== undefined) { toast.success("Véhicule retiré."); onClose(); } }} className="rounded-sm px-3 py-[9px] text-[12.5px] font-semibold text-white" style={{ background: "var(--danger)" }}>Confirmer</button>
              </>
            ) : (
              <button onClick={() => setConfirm(true)} className="flex h-[38px] w-[38px] items-center justify-center rounded-sm border border-border bg-surface-2" style={{ color: "var(--danger)" }} title="Supprimer"><Trash2 className="h-4 w-4" /></button>
            ))}
            {!confirm && (
              <>
                <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
                <button onClick={save} disabled={busy} className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "…" : "Enregistrer"}</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">{label}</div>
      {children}
    </div>
  );
}
