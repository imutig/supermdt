import { useState } from "react";
import { X, Trash2, Search } from "lucide-react";
import { useMutation, useQuery, usePaginatedQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { Clover } from "@/components/common/Clover";
import { LoadMore } from "@/components/common/Pagination";

const STATUS = [
  { value: "ACTIVE", label: "Active", color: "var(--success)" },
  { value: "ENREGISTREE", label: "Enregistrée", color: "var(--accent)" },
  { value: "SAISIE", label: "Saisie", color: "var(--warning)" },
  { value: "DETRUITE", label: "Détruite", color: "var(--muted)" },
] as const;
const statusOf = (s: string) => STATUS.find((x) => x.value === s) ?? STATUS[1];

export function Armes() {
  const { can } = useCan();
  const canCreate = can("armes.create");
  const canEdit = can("armes.edit");
  const canDelete = can("armes.delete");
  const canOpen = canEdit || canDelete; // ouvrir la fiche pour éditer/supprimer
  const [q, setQ] = useState("");
  const searching = q.trim().length > 0;
  const searchRes = useQuery(api.weapons.list, searching ? { q } : "skip");
  const paged = usePaginatedQuery(api.weapons.page, searching ? "skip" : {}, { initialNumItems: 20 });
  const weapons = searching ? (searchRes ?? []) : paged.results;
  const loadingFirst = searching ? searchRes === undefined : paged.status === "LoadingFirstPage";
  const [modal, setModal] = useState<{ id?: Id<"weapons"> } | null>(null);

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[16px] flex items-center gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Registre des armes</h1>
        <div className="flex-1" />
        {canCreate && <button onClick={() => setModal({})} className="mdt-press flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]"><Clover color="#fff" size={17} /> Arme</button>}
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (modèle, n° de série, type)…" className="mb-[14px] h-10 w-full max-w-[440px] rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent" />

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-[1fr_1.2fr_1fr_.8fr_1.1fr_.9fr] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
          <span>Type</span><span>Modèle</span><span>N° série</span><span>Origine</span><span>Propriétaire</span><span>Statut</span>
        </div>
        {loadingFirst && <div className="p-4"><SkeletonRows rows={6} /></div>}
        {!loadingFirst && weapons.length === 0 && <EmptyState title={q ? "Aucune arme trouvée" : "Aucune arme enregistrée"} message={q ? "Essayez un autre terme." : "Encodez une arme pour commencer le registre."} />}
        {weapons.map((w) => {
          const st = statusOf(w.status);
          return (
            <div key={w._id} onClick={() => canOpen && setModal({ id: w._id })} className={`grid grid-cols-[1fr_1.2fr_1fr_.8fr_1.1fr_.9fr] items-center gap-3 border-b border-border px-4 py-3 ${canOpen ? "cursor-pointer hover:bg-surface-2" : ""}`}>
              <span className="text-[13px] font-semibold">{w.typeName}</span>
              <span className="text-[13px]">{w.modele}</span>
              <span className="font-data text-[12.5px] text-muted">{w.serial}</span>
              <span className="text-[12.5px] text-muted">{w.origine ?? "-"}</span>
              <span className="text-[12.5px] text-muted">{w.ownerName ?? "-"}</span>
              <span><span className="rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${st.color} 14%, transparent)`, color: st.color }}>{st.label}</span></span>
            </div>
          );
        })}
        {!searching && <LoadMore status={paged.status} onLoadMore={() => paged.loadMore(20)} count={weapons.length} label="armes" />}
      </div>

      {modal && <WeaponModal weaponId={modal.id} canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} onClose={() => setModal(null)} />}
    </div>
  );
}

export function WeaponModal({ weaponId, canCreate, canEdit, canDelete, onClose }: { weaponId?: Id<"weapons">; canCreate: boolean; canEdit: boolean; canDelete: boolean; onClose: () => void }) {
  const isCreate = !weaponId;
  const canWrite = isCreate ? canCreate : canEdit; // droit d'écriture selon création/édition
  const existing = useQuery(api.weapons.list, weaponId ? {} : "skip");
  const w = weaponId && existing ? existing.find((x) => x._id === weaponId) : null;
  const opts = useQuery(api.configEditors.options);
  const create = useMutation(api.weapons.create);
  const update = useMutation(api.weapons.update);
  const remove = useMutation(api.weapons.remove);
  const toast = useToast();
  const navigate = useNavigate();

  const [init, setInit] = useState(false);
  const [f, setF] = useState({ typeId: "", modele: "", serial: "", motif: "", origine: "", status: "ENREGISTREE" });
  const [owner, setOwner] = useState<{ id: string; name: string } | null>(null);
  const [ownerQuery, setOwnerQuery] = useState("");
  const ownerResults = useQuery(api.citizens.search, ownerQuery.trim() ? { q: ownerQuery } : "skip");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  if (!init && w) {
    setInit(true);
    setF({ typeId: w.typeId ?? "", modele: w.modele, serial: w.serial, motif: w.motif ?? "", origine: w.origine ?? "", status: w.status });
    if (w.ownerId && w.ownerName) setOwner({ id: w.ownerId, name: w.ownerName });
  }

  async function save() {
    if (!f.modele.trim() || !f.serial.trim()) { toast.error("Modèle et n° de série requis."); return; }
    setBusy(true);
    const payload = {
      typeId: f.typeId ? (f.typeId as Id<"weaponTypes">) : undefined,
      modele: f.modele.trim(), serial: f.serial.trim(), motif: f.motif.trim() || undefined,
      origine: f.origine || undefined,
      ownerId: owner ? (owner.id as Id<"citizens">) : undefined,
      status: f.status as "ACTIVE" | "ENREGISTREE" | "SAISIE" | "DETRUITE",
    };
    const r = isCreate ? await toast.guard(create(payload), "Création impossible") : await toast.guard(update({ id: weaponId!, ...payload }), "Modification impossible");
    setBusy(false);
    if (r !== undefined) { toast.success(isCreate ? "Arme encodée." : "Arme mise à jour."); onClose(); }
  }

  const F = "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";
  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[480px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">{isCreate ? "Encoder une arme" : "Fiche arme"}</h2>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-4">
          <L label="Type"><select value={f.typeId} onChange={(e) => setF({ ...f, typeId: e.target.value })} className={F} disabled={!canWrite}><option value="">-</option>{(opts?.weaponTypes ?? []).map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select></L>
          <div className="grid grid-cols-2 gap-3">
            <L label="Modèle"><input value={f.modele} onChange={(e) => setF({ ...f, modele: e.target.value })} disabled={!canWrite} className={F} /></L>
            <L label="N° de série"><input value={f.serial} onChange={(e) => setF({ ...f, serial: e.target.value })} disabled={!canWrite} className={`${F} font-data`} /></L>
          </div>
          <L label="Statut"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className={F} disabled={!canWrite}>{STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></L>
          <div className="grid grid-cols-2 gap-3">
            <L label="Motif (optionnel)"><input value={f.motif} onChange={(e) => setF({ ...f, motif: e.target.value })} disabled={!canWrite} className={F} /></L>
            <L label="Origine"><select value={f.origine} onChange={(e) => setF({ ...f, origine: e.target.value })} className={F} disabled={!canWrite}><option value="">-</option>{(opts?.weaponOrigins ?? []).map((o) => <option key={o._id} value={o.name}>{o.name}</option>)}</select></L>
          </div>
          <L label="Citoyen lié">
            {owner ? (
              <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3 py-2">
                <span onClick={() => navigate(`/citoyen/${owner.id}`)} className="flex-1 cursor-pointer text-[13px] font-semibold hover:text-accent">{owner.name}</span>
                {canWrite && <button onClick={() => setOwner(null)} className="text-faint hover:text-danger"><X className="h-4 w-4" /></button>}
              </div>
            ) : canWrite ? (
              <div className="relative">
                <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3"><Search className="h-4 w-4 text-faint" /><input value={ownerQuery} onChange={(e) => setOwnerQuery(e.target.value)} placeholder="Rechercher un citoyen…" className="h-10 flex-1 bg-transparent text-[13px] outline-none" /></div>
                {ownerResults && ownerResults.length > 0 && (
                  <div className="mt-1 max-h-[160px] overflow-y-auto rounded-sm border border-border bg-surface">
                    {ownerResults.map((c) => <button key={c._id} onClick={() => { setOwner({ id: c._id, name: `${c.prenom} ${c.nom}` }); setOwnerQuery(""); }} className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left hover:bg-surface-2"><span className="flex-1 text-[13px] font-semibold">{c.prenom} {c.nom}</span></button>)}
                  </div>
                )}
              </div>
            ) : <div className="text-[13px] text-muted">-</div>}
          </L>
        </div>
        {(canWrite || canDelete) && (
          <div className="flex flex-shrink-0 items-center gap-2 border-t border-border px-[18px] py-4">
            {!isCreate && canDelete && (confirm ? (
              <>
                <span className="flex-1 text-[12.5px] text-muted">Supprimer ?</span>
                <button onClick={() => setConfirm(false)} className="rounded-sm border border-border bg-surface-2 px-3 py-[9px] text-[12.5px] font-semibold">Annuler</button>
                <button onClick={async () => { const r = await toast.guard(remove({ id: weaponId! }), "Suppression impossible"); if (r !== undefined) { toast.success("Supprimé."); onClose(); } }} className="rounded-sm px-3 py-[9px] text-[12.5px] font-semibold text-white" style={{ background: "var(--danger)" }}>Confirmer</button>
              </>
            ) : (
              <button onClick={() => setConfirm(true)} className="flex h-[38px] w-[38px] items-center justify-center rounded-sm border border-border bg-surface-2" style={{ color: "var(--danger)" }}><Trash2 className="h-4 w-4" /></button>
            ))}
            {!confirm && (
              <>
                <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
                {canWrite && <button onClick={save} disabled={busy} className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "…" : "Enregistrer"}</button>}
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
