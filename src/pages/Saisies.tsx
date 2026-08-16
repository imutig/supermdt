import { useState } from "react";
import { Trash2, X, Link2Off } from "lucide-react";
import { useAction, useQuery, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api, type Id } from "@/lib/api";
import { useMe } from "@/hooks/useMe";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { Clover } from "@/components/common/Clover";
import { DateField } from "@/components/common/DateField";
import { fmtBadge } from "@/components/common/AgentTag";
import { LoadMore } from "@/components/common/Pagination";

// Listes fixes imposées par le NexusMDT (voir /api/saisies).
const TYPES = ["Véhicule", "Arme", "Argent", "Stupéfiants", "Objet"] as const;
const STATUTS = ["Sous scellés", "Confisqué", "Restitué", "Détruit"] as const;

const STATUT_COLOR: Record<string, string> = {
  "Sous scellés": "var(--warning)",
  "Confisqué": "var(--accent)",
  "Restitué": "var(--success)",
  "Détruit": "var(--muted)",
};

// Conversions date : la fiche affiche JJ/MM/AAAA, Nexus stocke « YYYY-MM-DD ».
function isoToFr(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
function frToIso(fr: string) {
  const m = fr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
function fmtMoney(n: number) {
  return "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

type Row = FunctionReturnType<typeof api.saisies.page>["page"][number];

export function Saisies() {
  const { results: rows, status, loadMore } = usePaginatedQuery(api.saisies.page, {}, { initialNumItems: 30 });
  const loading = status === "LoadingFirstPage";
  const me = useMe();
  const { can } = useCan();
  const nexusStatus = useQuery(api.nexusSync.myStatus);
  const syncActive = !!nexusStatus?.configured && nexusStatus.status === "OK";
  const canCreate = can("saisies.create");
  const [modal, setModal] = useState<{ row?: Row } | null>(null);

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[16px] flex items-center gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Saisies</h1>
        <span className="text-[12.5px] text-muted">Registre des objets saisis, synchronisé avec le NexusMDT.</span>
        <div className="flex-1" />
        {canCreate && syncActive && (
          <button onClick={() => setModal({})} className="mdt-press flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]">
            <Clover color="#fff" size={17} /> Saisie
          </button>
        )}
      </div>

      {canCreate && !syncActive && nexusStatus !== undefined && (
        <div className="mb-[16px] flex items-start gap-[9px] rounded-card border border-border px-[14px] py-[11px] text-[12.5px]" style={{ background: "color-mix(in srgb, var(--warning) 9%, transparent)", color: "var(--warning)" }}>
          <Link2Off className="mt-[1px] h-[15px] w-[15px] flex-shrink-0" />
          <span>Le registre des saisies est synchronisé avec le NexusMDT. Lie ton compte Nexus dans <b>Mon profil</b> pour enregistrer, modifier ou retirer une saisie.</span>
        </div>
      )}

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-[.8fr_1.3fr_.7fr_.8fr_1.1fr_.9fr_.8fr_auto] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
          <span>Type</span><span>Objet</span><span>Qté</span><span>Valeur</span><span>Mis en cause</span><span>Statut</span><span>Date</span><span></span>
        </div>
        {loading && <div className="p-4"><SkeletonRows rows={6} /></div>}
        {!loading && rows.length === 0 && <EmptyState title="Aucune saisie" message="Enregistrez une première saisie." />}
        {rows.map((s) => {
          const canEdit = me?.agent.isOwner || s.mine || can("saisies.create");
          const canDelete = me?.agent.isOwner || s.mine || can("saisies.delete");
          const st = s.statut ?? "";
          return (
            <div
              key={s._id}
              onClick={() => (canEdit || canDelete) && syncActive && setModal({ row: s })}
              className={`grid grid-cols-[.8fr_1.3fr_.7fr_.8fr_1.1fr_.9fr_.8fr_auto] items-center gap-3 border-b border-border px-4 py-[11px] ${(canEdit || canDelete) && syncActive ? "cursor-pointer hover:bg-surface-2" : ""}`}
            >
              <span className="text-[12.5px] text-muted">{s.type ?? "-"}</span>
              <span className="text-[13px] font-semibold">{s.objet || "-"}</span>
              <span className="font-data text-[12.5px]">{s.quantite ?? "-"}</span>
              <span className="font-data text-[12.5px]">{s.montant != null && s.montant > 0 ? fmtMoney(s.montant) : "-"}</span>
              <span className="truncate text-[12.5px] text-muted">{s.misEnCause || "-"}</span>
              <span>{st ? <span className="rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${STATUT_COLOR[st] ?? "var(--muted)"} 14%, transparent)`, color: STATUT_COLOR[st] ?? "var(--muted)" }}>{st}</span> : "-"}</span>
              <span className="font-data text-[11.5px] text-muted">{s.date ? isoToFr(s.date) : new Date(s.at).toLocaleDateString("fr-FR")}</span>
              <span className="text-[11px] text-faint">{s.agentName ? <span title={s.agentName}><span className="font-data text-accent">{fmtBadge(s.matricule) ?? ""}</span></span> : ""}</span>
            </div>
          );
        })}
        <LoadMore status={status} onLoadMore={() => loadMore(30)} count={rows.length} label="saisies" />
      </div>

      {modal && <SaisieModal row={modal.row} onClose={() => setModal(null)} />}
    </div>
  );
}

function SaisieModal({ row, onClose }: { row?: Row; onClose: () => void }) {
  const isCreate = !row;
  const me = useMe();
  const { can } = useCan();
  const toast = useToast();
  const createSynced = useAction(api.nexusSync.createSaisie);
  const updateSynced = useAction(api.nexusSync.updateSaisie);
  const delSynced = useAction(api.nexusSync.deleteRecord);
  const nexusStatus = useQuery(api.nexusSync.myStatus);
  const syncActive = !!nexusStatus?.configured && nexusStatus.status === "OK";

  const canEdit = me?.agent.isOwner || row?.mine || can("saisies.create");
  const canDelete = me?.agent.isOwner || row?.mine || can("saisies.delete");
  const canWrite = (isCreate ? can("saisies.create") : canEdit) && syncActive;

  const [type, setType] = useState<string>(row?.type ?? TYPES[4]);
  const [statut, setStatut] = useState<string>(row?.statut ?? STATUTS[0]);
  const [objet, setObjet] = useState(row?.objet ?? "");
  const [quantite, setQuantite] = useState(row?.quantite ?? "");
  const [montant, setMontant] = useState(row?.montant != null ? String(row.montant) : "");
  const [misEnCause, setMisEnCause] = useState(row?.misEnCause ?? "");
  const [date, setDate] = useState(row?.date ? isoToFr(row.date) : "");
  const [lieu, setLieu] = useState(row?.lieu ?? "");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function submit() {
    if (!syncActive) { toast.error("Nécessite un compte NexusMDT lié (voir Mon profil)."); return; }
    if (!objet.trim()) { toast.error("L'objet saisi est requis."); return; }
    setBusy(true);
    const payload = {
      type,
      objet: objet.trim(),
      quantite: quantite.trim() || undefined,
      montant: montant.trim() ? Number(montant) || 0 : undefined,
      statut,
      misEnCause: misEnCause.trim() || undefined,
      date: date.trim() ? frToIso(date.trim()) : undefined,
      lieu: lieu.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    const r = isCreate
      ? await toast.guard(createSynced(payload), "Enregistrement impossible")
      : await toast.guard(updateSynced({ id: row!._id as Id<"saisies">, ...payload }), "Modification impossible");
    setBusy(false);
    if (r !== undefined) { toast.success(isCreate ? "Saisie enregistrée." : "Saisie mise à jour."); onClose(); }
  }

  const F = "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";
  const L = "mb-[6px] block text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint";

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[480px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">{isCreate ? "Nouvelle saisie" : "Modifier la saisie"}</h2>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-4">
          {isCreate && (
            <div className="rounded-sm border border-border bg-surface-2 px-3 py-[10px] text-[12px] text-muted">
              <div className="flex justify-between"><span>Agent</span><span className="font-semibold text-text">{me ? `${me.agent.prenomRP} ${me.agent.nomRP}` : "…"}</span></div>
              <div className="mt-1 flex justify-between"><span>N° de badge</span><span className="font-data text-text">{fmtBadge(me?.agent.matricule) ?? "-"}</span></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><span className={L}>Type</span>
              <select value={type} onChange={(e) => setType(e.target.value)} disabled={!canWrite} className={F}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><span className={L}>Statut</span>
              <select value={statut} onChange={(e) => setStatut(e.target.value)} disabled={!canWrite} className={F}>
                {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div><span className={L}>Objet saisi *</span><input value={objet} onChange={(e) => setObjet(e.target.value)} disabled={!canWrite} placeholder="Ex. Pistolet 9mm, COKE…" autoFocus className={F} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><span className={L}>Quantité</span><input value={quantite} onChange={(e) => setQuantite(e.target.value)} disabled={!canWrite} placeholder="x1, 250g…" className={F} /></div>
            <div><span className={L}>Valeur ($)</span><input value={montant} onChange={(e) => setMontant(e.target.value.replace(/[^0-9]/g, ""))} disabled={!canWrite} inputMode="numeric" className={`${F} font-data`} /></div>
          </div>
          <div><span className={L}>Mis en cause</span><MisEnCauseField value={misEnCause} onChange={setMisEnCause} disabled={!canWrite} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><span className={L}>Date</span><DateField value={date} onChange={setDate} /></div>
            <div><span className={L}>Lieu</span><input value={lieu} onChange={(e) => setLieu(e.target.value)} disabled={!canWrite} className={F} /></div>
          </div>
          <div><span className={L}>Notes</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canWrite} rows={3} className="w-full rounded-sm border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-accent" /></div>
        </div>

        {!syncActive && nexusStatus !== undefined && (
          <div className="flex flex-shrink-0 items-start gap-[9px] border-t border-border px-[18px] py-3 text-[12px]" style={{ background: "color-mix(in srgb, var(--warning) 9%, transparent)", color: "var(--warning)" }}>
            <Link2Off className="mt-[1px] h-[15px] w-[15px] flex-shrink-0" />
            <span>Le registre des saisies est synchronisé avec le NexusMDT. Lie ton compte Nexus dans <b>Mon profil</b> pour enregistrer, modifier ou retirer une saisie.</span>
          </div>
        )}
        {syncActive && (canWrite || canDelete) && (
          <div className="flex flex-shrink-0 items-center gap-2 border-t border-border px-[18px] py-4">
            {!isCreate && canDelete && (confirm ? (
              <>
                <span className="flex-1 text-[12.5px] text-muted">Supprimer ?</span>
                <button onClick={() => setConfirm(false)} className="rounded-sm border border-border bg-surface-2 px-3 py-[9px] text-[12.5px] font-semibold">Annuler</button>
                <button onClick={async () => { const r = await toast.guard(delSynced({ kind: "saisie", localId: row!._id }), "Suppression impossible"); if (r !== undefined) { toast.success("Supprimé."); onClose(); } }} className="rounded-sm px-3 py-[9px] text-[12.5px] font-semibold text-white" style={{ background: "var(--danger)" }}>Confirmer</button>
              </>
            ) : (
              <button onClick={() => setConfirm(true)} className="flex h-[38px] w-[38px] items-center justify-center rounded-sm border border-border bg-surface-2" style={{ color: "var(--danger)" }}><Trash2 className="h-4 w-4" /></button>
            ))}
            {!confirm && (
              <>
                <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
                {canWrite && <button onClick={submit} disabled={busy} className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "…" : "Enregistrer"}</button>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Champ « Mis en cause » : recherche dans les citoyens encodés (autocomplétion),
// avec repli en saisie libre si aucune fiche ne correspond.
function MisEnCauseField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const { can } = useCan();
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const results = useQuery(api.citizens.search, open && q.trim() && can("citoyens.view") ? { q } : "skip");
  const F = "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";
  return (
    <div className="relative">
      <input
        value={q}
        disabled={disabled}
        onChange={(e) => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Rechercher un citoyen, ou saisir un nom libre"
        className={F}
      />
      {open && !disabled && results && results.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-[170px] w-full overflow-y-auto rounded-sm border border-border bg-surface shadow-[0_10px_30px_rgba(0,0,0,.3)]">
          {results.map((c) => (
            <button
              key={c._id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); const name = `${c.prenom} ${c.nom}`; setQ(name); onChange(name); setOpen(false); }}
              className="flex w-full items-center gap-2 border-b border-border px-3 py-[7px] text-left hover:bg-surface-2"
            >
              <span className="text-[13px] font-semibold">{c.prenom} {c.nom}</span>
              {c.dateNaissance && <span className="text-[11px] text-faint">{c.dateNaissance}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
