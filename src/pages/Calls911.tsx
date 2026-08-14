import { useState } from "react";
import { PhoneCall, X, Plus, Trash2, MapPin, User, Phone, Car, AlertTriangle } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api, type Id } from "@/lib/api";

type Fiche = NonNullable<FunctionReturnType<typeof api.calls911.get>>;
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { CitizenPicker } from "@/components/common/CitizenPicker";

type Status = "EN_COURS" | "ATTRIBUE" | "RESOLU";
const STATUS_META: Record<Status, { label: string; color: string; bg: string }> = {
  EN_COURS: { label: "En cours", color: "var(--warning)", bg: "color-mix(in srgb, var(--warning) 15%, transparent)" },
  ATTRIBUE: { label: "Attribué", color: "var(--accent)", bg: "var(--accent-soft)" },
  RESOLU: { label: "Résolu", color: "var(--success)", bg: "color-mix(in srgb, var(--success) 15%, transparent)" },
};
const PRIORITIES = ["", "P1", "P2", "P3"];

// Suivi des appels 911 : les opérateurs créent des fiches, les agents consultent.
export function Calls911() {
  const { can } = useCan();
  const canOperate = can("n911.operate");
  const [filter, setFilter] = useState<Status | "ALL">("ALL");
  const rows = useQuery(api.calls911.list, filter === "ALL" ? {} : { status: filter });
  const [modal, setModal] = useState<{ id?: Id<"calls911"> } | null>(null);

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[16px] flex flex-wrap items-center gap-3">
        <PhoneCall className="h-[20px] w-[20px]" style={{ color: "var(--accent)" }} />
        <h1 className="m-0 text-[20px] font-bold tracking-tight">Appels 911</h1>
        <div className="flex-1" />
        {canOperate && (
          <button onClick={() => setModal({})} className="mdt-press flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]">
            <Plus className="h-[16px] w-[16px]" /> Nouvelle fiche
          </button>
        )}
      </div>

      <div className="mb-[14px] flex flex-wrap gap-[6px]">
        {([["ALL", "Toutes"], ["EN_COURS", "En cours"], ["ATTRIBUE", "Attribuées"], ["RESOLU", "Résolues"]] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setFilter(k as Status | "ALL")}
            className="rounded-[8px] border px-[12px] py-[6px] text-[12.5px] font-semibold"
            style={filter === k ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" } : { borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--muted)" }}>
            {lbl}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        {rows === undefined ? (
          <div className="p-4"><SkeletonRows rows={5} /></div>
        ) : rows.length === 0 ? (
          <EmptyState title="Aucune fiche 911" message={canOperate ? "Créez une fiche dès qu'un appel arrive." : "Les fiches créées par les opérateurs apparaîtront ici."} />
        ) : (
          rows.map((c) => {
            const m = STATUS_META[c.status as Status];
            return (
              <div key={c._id} onClick={() => setModal({ id: c._id as Id<"calls911"> })}
                className="grid cursor-pointer grid-cols-[64px_1fr_auto] items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-surface-2">
                <span className="font-data text-[15px] font-bold" style={{ color: "var(--accent)" }}>#{c.number}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13.5px] font-semibold">{c.nature || "Appel 911"}</span>
                    {c.priority && <span className="rounded-[4px] border border-border px-[6px] py-px text-[10px] font-bold text-muted">{c.priority}</span>}
                  </div>
                  <div className="mt-[2px] truncate text-[12px] text-muted">
                    {c.callerName || "Appelant inconnu"}{c.location ? ` · ${c.location}` : ""}{c.assignedPatrol ? ` · ${c.assignedPatrol}` : ""}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-[3px]">
                  <span className="rounded-[5px] px-[8px] py-[3px] text-[10px] font-bold uppercase tracking-[0.05em]" style={{ background: m.bg, color: m.color }}>{m.label}</span>
                  <span className="text-[10.5px] text-faint">{new Date(c.at).toLocaleString("fr-FR")}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {modal && <FicheModal id={modal.id} canOperate={canOperate} onClose={() => setModal(null)} />}
    </div>
  );
}

const F = "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";

function FicheModal({ id, canOperate, onClose }: { id?: Id<"calls911">; canOperate: boolean; onClose: () => void }) {
  const isCreate = !id;
  const existing = useQuery(api.calls911.get, id ? { id } : "skip");
  const create = useMutation(api.calls911.create);
  const update = useMutation(api.calls911.update);
  const setStatus = useMutation(api.calls911.setStatus);
  const remove = useMutation(api.calls911.remove);
  const toast = useToast();

  const [init, setInit] = useState(false);
  const [f, setF] = useState({ nature: "", priority: "", callerName: "", callerPhone: "", location: "", peopleInvolved: "", vehicle: "", weapons: false, info: "" });
  const [citizen, setCitizen] = useState<{ id: string; name: string } | null>(null);
  const [patrol, setPatrol] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);

  if (!init && existing) {
    setInit(true);
    setF({ nature: existing.nature, priority: existing.priority, callerName: existing.callerName, callerPhone: existing.callerPhone, location: existing.location, peopleInvolved: existing.peopleInvolved, vehicle: existing.vehicle, weapons: existing.weapons, info: existing.info });
    setPatrol(existing.assignedPatrol);
    if (existing.citizenId) setCitizen({ id: existing.citizenId, name: existing.citizenName ?? "Citoyen" });
  }

  const canEdit = isCreate ? canOperate : existing?.canEdit ?? false;
  const readOnly = !isCreate && !editing;
  const status = (existing?.status ?? "EN_COURS") as Status;

  async function save() {
    if (!f.info.trim()) { toast.error("Les informations de l'appel sont requises."); return; }
    setBusy(true);
    const payload = {
      nature: f.nature.trim() || undefined, priority: f.priority || undefined,
      callerName: f.callerName.trim() || undefined, callerPhone: f.callerPhone.trim() || undefined,
      location: f.location.trim() || undefined, peopleInvolved: f.peopleInvolved.trim() || undefined,
      vehicle: f.vehicle.trim() || undefined, weapons: f.weapons || undefined,
      info: f.info.trim(), citizenId: (citizen?.id as Id<"citizens">) ?? undefined,
      assignedPatrol: patrol.trim() || undefined,
    };
    const r = isCreate
      ? await toast.guard(create(payload), "Création impossible")
      : await toast.guard(update({ id: id!, ...payload }), "Modification impossible");
    setBusy(false);
    if (r !== undefined) {
      toast.success(isCreate ? `Fiche 911 n°${(r as { number: number }).number} créée.` : "Fiche mise à jour.");
      if (isCreate) onClose(); else setEditing(false);
    }
  }

  async function changeStatus(s: Status) {
    const r = await toast.guard(setStatus({ id: id!, status: s, assignedPatrol: patrol.trim() || undefined }), "Changement de statut impossible");
    if (r !== undefined) toast.success("Statut mis à jour.");
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[520px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <PhoneCall className="h-[18px] w-[18px]" style={{ color: "var(--accent)" }} />
          <h2 className="m-0 flex-1 text-[15px] font-bold">{isCreate ? "Nouvelle fiche 911" : `Fiche 911 n°${existing?.number ?? ""}`}</h2>
          {!isCreate && existing && (
            <span className="rounded-[5px] px-[8px] py-[3px] text-[10px] font-bold uppercase tracking-[0.05em]" style={{ background: STATUS_META[status].bg, color: STATUS_META[status].color }}>{STATUS_META[status].label}</span>
          )}
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-[13px] overflow-y-auto px-[18px] py-4">
          {/* Statut (créateur uniquement) */}
          {!isCreate && canEdit && (
            <div className="rounded-card border border-border bg-surface-2 p-[12px]">
              <div className="mb-[8px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Statut de l'appel</div>
              <div className="mb-[9px] flex gap-[6px]">
                {(["EN_COURS", "ATTRIBUE", "RESOLU"] as Status[]).map((s) => (
                  <button key={s} onClick={() => changeStatus(s)}
                    className="mdt-press flex-1 rounded-[8px] border px-2 py-[7px] text-[12px] font-semibold"
                    style={status === s ? { borderColor: STATUS_META[s].color, background: STATUS_META[s].bg, color: STATUS_META[s].color } : { borderColor: "var(--border)", background: "var(--surface)", color: "var(--muted)" }}>
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
              <input value={patrol} onChange={(e) => setPatrol(e.target.value)} placeholder="Patrouille attribuée (ex. 13A09)" className={`${F} font-data`} />
            </div>
          )}
          {!isCreate && !canEdit && existing?.assignedPatrol && (
            <div className="rounded-card border border-border bg-surface-2 px-[12px] py-[9px] text-[12.5px]">Patrouille attribuée : <span className="font-data font-semibold">{existing.assignedPatrol}</span></div>
          )}

          {readOnly ? (
            <ReadView existing={existing} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <L label="Nature de l'appel"><input value={f.nature} onChange={(e) => setF({ ...f, nature: e.target.value })} placeholder="Accident, bagarre, cambriolage…" className={F} /></L>
                <L label="Priorité">
                  <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} className={F}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p || "—"}</option>)}
                  </select>
                </L>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <L label="Nom de l'appelant"><input value={f.callerName} onChange={(e) => setF({ ...f, callerName: e.target.value })} className={F} /></L>
                <L label="Numéro de l'appelant"><input value={f.callerPhone} onChange={(e) => setF({ ...f, callerPhone: e.target.value })} className={`${F} font-data`} /></L>
              </div>
              <L label="Lieu / adresse"><input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} className={F} /></L>
              <div className="grid grid-cols-2 gap-3">
                <L label="Personnes impliquées"><input value={f.peopleInvolved} onChange={(e) => setF({ ...f, peopleInvolved: e.target.value })} placeholder="Nombre, signalement…" className={F} /></L>
                <L label="Véhicule"><input value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value })} placeholder="Modèle, couleur, plaque…" className={F} /></L>
              </div>
              <label className="flex cursor-pointer items-center gap-[9px] text-[13px]">
                <input type="checkbox" checked={f.weapons} onChange={(e) => setF({ ...f, weapons: e.target.checked })} className="h-[15px] w-[15px] accent-[var(--danger)]" />
                Arme(s) signalée(s) sur les lieux
              </label>
              <L label="Appelant lié à une fiche citoyen (optionnel)">
                <CitizenPicker value={citizen} onChange={setCitizen} />
              </L>
              <L label="Informations recueillies *">
                <textarea value={f.info} onChange={(e) => setF({ ...f, info: e.target.value })} rows={6} className={`${F} h-auto resize-y py-2`} placeholder="Récit de l'appel, consignes transmises à la patrouille…" />
              </L>
            </>
          )}

          {!isCreate && existing && (
            <div className="text-[11px] text-faint">Créée par {existing.by} · {new Date(existing.at).toLocaleString("fr-FR")}{existing.updatedAt ? ` · modifiée le ${new Date(existing.updatedAt).toLocaleString("fr-FR")}` : ""}</div>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 border-t border-border px-[18px] py-4">
          {!isCreate && canEdit && !editing && (confirm ? (
            <>
              <span className="flex-1 text-[12.5px] text-muted">Supprimer cette fiche ?</span>
              <button onClick={() => setConfirm(false)} className="rounded-sm border border-border bg-surface-2 px-3 py-[9px] text-[12.5px] font-semibold">Annuler</button>
              <button onClick={async () => { const r = await toast.guard(remove({ id: id! }), "Suppression impossible"); if (r !== undefined) { toast.success("Fiche supprimée."); onClose(); } }} className="rounded-sm px-3 py-[9px] text-[12.5px] font-semibold text-white" style={{ background: "var(--danger)" }}>Confirmer</button>
            </>
          ) : (
            <button onClick={() => setConfirm(true)} className="flex h-[38px] w-[38px] items-center justify-center rounded-sm border border-border bg-surface-2" style={{ color: "var(--danger)" }} title="Supprimer"><Trash2 className="h-4 w-4" /></button>
          ))}
          {!confirm && (
            <>
              <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Fermer</button>
              {canEdit && (readOnly ? (
                <button onClick={() => setEditing(true)} className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]">Modifier</button>
              ) : (
                <button onClick={save} disabled={busy} className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "…" : isCreate ? "Créer la fiche" : "Enregistrer"}</button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ReadView({ existing }: { existing: Fiche | null | undefined }) {
  if (!existing) return <SkeletonRows rows={4} />;
  return (
    <div className="flex flex-col gap-[11px]">
      {existing.nature && <div className="text-[16px] font-bold">{existing.nature}{existing.priority ? <span className="ml-2 rounded-[4px] border border-border px-[7px] py-px text-[11px] font-bold text-muted">{existing.priority}</span> : null}</div>}
      <div className="grid grid-cols-2 gap-[9px]">
        <Info icon={User} label="Appelant" value={existing.callerName || "—"} />
        <Info icon={Phone} label="Numéro" value={existing.callerPhone || "—"} mono />
        <Info icon={MapPin} label="Lieu" value={existing.location || "—"} />
        <Info icon={User} label="Personnes" value={existing.peopleInvolved || "—"} />
        <Info icon={Car} label="Véhicule" value={existing.vehicle || "—"} />
        <Info icon={AlertTriangle} label="Arme(s)" value={existing.weapons ? "Oui" : "Non"} danger={existing.weapons} />
      </div>
      {existing.citizenName && <div className="text-[12.5px] text-muted">Fiche citoyen liée : <span className="font-semibold text-text">{existing.citizenName}</span></div>}
      <div>
        <div className="mb-[5px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Informations</div>
        <p className="m-0 whitespace-pre-wrap rounded-card border border-border bg-surface-2 p-[12px] text-[13px] leading-[1.6]">{existing.info}</p>
      </div>
    </div>
  );
}

function Info({ icon: Icon, label, value, mono, danger }: { icon: typeof User; label: string; value: string; mono?: boolean; danger?: boolean }) {
  return (
    <div className="rounded-card border border-border bg-surface-2 px-[11px] py-[8px]">
      <div className="mb-[2px] flex items-center gap-[5px] text-[10px] font-bold uppercase tracking-[0.07em] text-faint"><Icon className="h-[12px] w-[12px]" /> {label}</div>
      <div className={`text-[13px] ${mono ? "font-data" : ""}`} style={danger ? { color: "var(--danger)", fontWeight: 700 } : undefined}>{value}</div>
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
