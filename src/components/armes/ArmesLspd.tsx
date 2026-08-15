import { useState } from "react";
import { Plus, Trash2, X, Search } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { ImageUpload } from "@/components/common/ImageUpload";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";

// Section « Armes LSPD » du registre : chaque agent enregistre sa/ses arme(s)
// de service (photo n° de série visible, série, modèle). L'encadrement voit le
// registre complet.
export function ArmesLspd() {
  const { can } = useCan();
  const mine = useQuery(api.serviceWeapons.mine);
  const remove = useMutation(api.serviceWeapons.remove);
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [confirmId, setConfirmId] = useState<Id<"serviceWeapons"> | null>(null);
  const canSeeAll = can("effectif.view");

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Mes armes */}
      <div>
        <div className="mb-[10px] flex items-center gap-3">
          <h2 className="m-0 text-[14px] font-bold">Mes armes de service</h2>
          <div className="flex-1" />
          <button onClick={() => setModal(true)} className="mdt-press flex items-center gap-[6px] rounded-[9px] bg-accent px-[13px] py-[7px] text-[12.5px] font-semibold text-accent-contrast hover:brightness-[1.06]">
            <Plus className="h-[15px] w-[15px]" /> Enregistrer une arme
          </button>
        </div>
        {mine === undefined ? (
          <div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={2} /></div>
        ) : mine.length === 0 ? (
          <EmptyState compact title="Aucune arme enregistrée" message="Enregistre ton arme de service (au moins une est requise)." />
        ) : (
          <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((w) => (
              <div key={w._id} className="overflow-hidden rounded-card border border-border bg-surface">
                <img src={w.photoUrl} alt="" className="h-[150px] w-full object-cover" />
                <div className="flex items-start gap-2 px-[13px] py-[11px]">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold">{w.model}</div>
                    <div className="font-data text-[12px] text-muted">N° {w.serial}</div>
                  </div>
                  {confirmId === w._id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setConfirmId(null)} className="rounded-sm border border-border px-2 py-[3px] text-[11px] font-semibold">Non</button>
                      <button onClick={async () => { setConfirmId(null); const r = await toast.guard(remove({ id: w._id }), "Suppression impossible"); if (r !== undefined) toast.success("Arme retirée."); }} className="rounded-sm px-2 py-[3px] text-[11px] font-semibold text-white" style={{ background: "var(--danger)" }}>Retirer</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmId(w._id)} className="flex-shrink-0 text-faint hover:text-danger" title="Retirer"><Trash2 className="h-[15px] w-[15px]" /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Registre complet (encadrement) */}
      {canSeeAll && <LspdRegistry />}

      {modal && <ServiceWeaponModal onClose={() => setModal(false)} />}
    </div>
  );
}

function LspdRegistry() {
  const [q, setQ] = useState("");
  const rows = useQuery(api.serviceWeapons.listAll, { q: q.trim() || undefined });
  return (
    <div>
      <h2 className="mb-[10px] text-[14px] font-bold">Registre LSPD · toutes les armes</h2>
      <div className="mb-[12px] flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3">
        <Search className="h-4 w-4 text-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (agent, modèle, n° de série)…" className="h-10 flex-1 bg-transparent text-[13px] outline-none" />
      </div>
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-[64px_1.3fr_1fr_1fr] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
          <span>Photo</span><span>Agent</span><span>Modèle</span><span>N° série</span>
        </div>
        {rows === undefined ? (
          <div className="p-4"><SkeletonRows rows={5} /></div>
        ) : rows.length === 0 ? (
          <EmptyState compact title="Aucune arme" message={q ? "Aucun résultat." : "Aucune arme de service enregistrée."} />
        ) : (
          rows.map((w) => (
            <div key={w._id} className="grid grid-cols-[64px_1.3fr_1fr_1fr] items-center gap-3 border-b border-border px-4 py-[9px]">
              <a href={w.photoUrl} target="_blank" rel="noreferrer"><img src={w.photoUrl} alt="" className="h-[40px] w-[56px] rounded-[6px] border border-border object-cover" /></a>
              <span className="truncate text-[13px] font-semibold">
                {w.matricule != null && <span className="font-data text-accent">{String(w.matricule).padStart(2, "0")} </span>}{w.agentName}
              </span>
              <span className="truncate text-[12.5px]">{w.model}</span>
              <span className="font-data text-[12.5px] text-muted">{w.serial}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ServiceWeaponModal({ onClose }: { onClose: () => void }) {
  const register = useMutation(api.serviceWeapons.register);
  const toast = useToast();
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = model.trim() && serial.trim() && photoUrl;
  const F = "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";

  async function save() {
    if (!valid) { toast.error("Modèle, n° de série et photo sont requis."); return; }
    setBusy(true);
    const r = await toast.guard(register({ model: model.trim(), serial: serial.trim(), photoUrl: photoUrl! }), "Enregistrement impossible");
    setBusy(false);
    if (r !== undefined) { toast.success("Arme enregistrée."); onClose(); }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[460px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">Enregistrer une arme de service</h2>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[18px] py-4">
          <div>
            <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Photo de l'arme · numéro de série visible</div>
            <ImageUpload value={photoUrl} onChange={setPhotoUrl} aspect="wide" />
          </div>
          <div>
            <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Modèle</div>
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="ex. Glock 17" className={F} />
          </div>
          <div>
            <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Numéro de série</div>
            <input value={serial} onChange={(e) => setSerial(e.target.value)} className={`${F} font-data`} />
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2 border-t border-border px-[18px] py-4">
          <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
          <button onClick={save} disabled={busy || !valid} className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "…" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}
