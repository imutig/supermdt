import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Trash2, Pencil, Search } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { ImageUpload } from "@/components/common/ImageUpload";
import { useToast } from "@/providers/toast";

function VehicleParticipation({ vehicleId }: { vehicleId: Id<"vehicles"> }) {
  const data = useQuery(api.vehicles.participation, { id: vehicleId });
  const navigate = useNavigate();
  if (!data || (data.dossiers.length === 0 && data.reports.length === 0)) {
    return (
      <div>
        <div className="mb-[8px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Participation</div>
        <div className="text-[12.5px] text-faint">Aucun dossier ni rapport.</div>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-[8px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Participation</div>
      <div className="flex flex-col gap-[6px]">
        {data.dossiers.map((d) => (
          <div key={d._id} onClick={() => navigate(`/citoyen/${d.citizenId}`)} className="flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-surface-2 px-[11px] py-[8px] hover:border-border-strong">
            <span className="rounded-[4px] px-[6px] py-[1px] text-[10px] font-bold uppercase" style={{ background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }}>Dossier</span>
            <span className="flex-1 text-[12.5px] font-semibold">{d.label}</span>
            <span className="font-data text-[11px] text-faint">{new Date(d.at).toLocaleDateString("fr-FR")}</span>
          </div>
        ))}
        {data.reports.map((r) => (
          <div key={r._id} onClick={() => navigate(`/rapport/${r._id}`)} className="flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-surface-2 px-[11px] py-[8px] hover:border-border-strong">
            <span className="rounded-[4px] px-[6px] py-[1px] text-[10px] font-bold uppercase" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>Rapport</span>
            <span className="flex-1 text-[12.5px] font-semibold">{r.title}</span>
            <span className="font-data text-[11px] text-faint">{new Date(r.at).toLocaleDateString("fr-FR")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type Props = {
  vehicleId?: Id<"vehicles">;
  ownerId?: Id<"citizens">;
  ownerName?: string;
  initialPlaque?: string;
  canEdit: boolean;
  onClose: () => void;
};

const FIELD =
  "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] text-text outline-none focus:border-accent";

export function VehicleModal({ vehicleId, ownerId, ownerName, initialPlaque, canEdit: canEditAny, onClose }: Props) {
  const isCreate = !vehicleId;
  const toast = useToast();
  const vehicle = useQuery(api.vehicles.get, vehicleId ? { id: vehicleId } : "skip");
  // L'agent qui a enregistré le véhicule peut le modifier et le retirer sans
  // détenir vehicules.edit.
  const canEdit = canEditAny || !!vehicle?.mine;
  const create = useMutation(api.vehicles.create);
  const update = useMutation(api.vehicles.update);
  const remove = useMutation(api.vehicles.remove);

  const [editing, setEditing] = useState(isCreate);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  // Propriétaire (obligatoire à la création, §6). Fixé si fourni, sinon à choisir.
  const [owner, setOwner] = useState<{ id: Id<"citizens">; name: string } | null>(
    ownerId ? { id: ownerId, name: ownerName ?? "" } : null,
  );
  const [ownerQuery, setOwnerQuery] = useState("");
  const ownerResults = useQuery(
    api.citizens.search,
    isCreate && !ownerId && ownerQuery.trim() ? { q: ownerQuery } : "skip",
  );

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [form, setForm] = useState<{ init: boolean; plaque: string; modele: string; couleur: string; type: string; notes: string }>({
    init: isCreate,
    plaque: initialPlaque ?? "",
    modele: "",
    couleur: "",
    type: "",
    notes: "",
  });
  if (!form.init && vehicle) {
    setForm({ init: true, plaque: vehicle.plaque, modele: vehicle.modele, couleur: vehicle.couleur, type: vehicle.type, notes: vehicle.notes });
    setPhotoUrl(vehicle.photoUrl);
  }

  async function save() {
    if (!form.plaque.trim()) return;
    setBusy(true);
    if (isCreate) {
      if (!owner) {
        setBusy(false);
        toast.error("Un propriétaire est obligatoire.");
        return;
      }
      const r = await toast.guard(
        create({
          plaque: form.plaque.trim(),
          modele: form.modele.trim() || undefined,
          couleur: form.couleur.trim() || undefined,
          type: form.type.trim() || undefined,
          notes: form.notes.trim() || undefined,
          photoUrl: photoUrl ?? undefined,
          ownerId: owner.id,
        }),
        "Enregistrement impossible",
      );
      setBusy(false);
      if (r !== undefined) {
        toast.success("Véhicule enregistré.");
        onClose();
      }
    } else if (vehicleId) {
      const r = await toast.guard(
        update({
          id: vehicleId,
          plaque: form.plaque.trim(),
          modele: form.modele.trim() || undefined,
          couleur: form.couleur.trim() || undefined,
          type: form.type.trim() || undefined,
          notes: form.notes.trim() || undefined,
          photoUrl: photoUrl ?? undefined,
          ownerId: vehicle?.ownerId ?? undefined,
        }),
        "Modification impossible",
      );
      setBusy(false);
      if (r !== undefined) setEditing(false);
    }
  }

  async function doDelete() {
    if (!vehicleId) return;
    setBusy(true);
    const r = await toast.guard(remove({ id: vehicleId }), "Suppression impossible");
    setBusy(false);
    if (r !== undefined) {
      toast.success("Véhicule supprimé.");
      onClose();
    }
  }

  const ownerLabel = owner?.name || vehicle?.ownerName || "Non rattaché";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex justify-end"
      style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-[480px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]"
        style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}
      >
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <div className="flex-1">
            <h2 className="m-0 text-[15px] font-bold">{isCreate ? "Enregistrer un véhicule" : "Fiche véhicule"}</h2>
            <div className="mt-[2px] text-[12px] text-muted">Propriétaire : {ownerLabel}</div>
          </div>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[18px] py-4">
          {/* Sélection du propriétaire (création depuis la recherche) */}
          {isCreate && !ownerId && (
            <div>
              <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Propriétaire *</div>
              {owner ? (
                <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3 py-2">
                  <span className="flex-1 text-[13px] font-semibold">{owner.name}</span>
                  <button onClick={() => setOwner(null)} className="text-faint hover:text-danger"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <div className="relative">
                  <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3">
                    <Search className="h-4 w-4 text-faint" />
                    <input
                      value={ownerQuery}
                      onChange={(e) => setOwnerQuery(e.target.value)}
                      placeholder="Rechercher un citoyen…"
                      className="h-10 flex-1 bg-transparent text-[13px] outline-none"
                    />
                  </div>
                  {ownerResults && ownerResults.length > 0 && (
                    <div className="mt-1 max-h-[180px] overflow-y-auto rounded-sm border border-border bg-surface">
                      {ownerResults.map((c) => (
                        <button
                          key={c._id}
                          onClick={() => {
                            setOwner({ id: c._id, name: `${c.prenom} ${c.nom}` });
                            setOwnerQuery("");
                          }}
                          className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left hover:bg-surface-2"
                        >
                          <span className="flex-1 text-[13px] font-semibold">{c.prenom} {c.nom}</span>
                          <span className="font-data text-[11px] text-muted">{c.dateNaissance ?? ""}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!isCreate && vehicle === undefined ? (
            <div className="text-[13px] text-muted">Chargement…</div>
          ) : !isCreate && vehicle === null ? (
            <div className="text-[13px] text-muted">Véhicule introuvable.</div>
          ) : editing ? (
            <>
              <LabeledField label="Plaque">
                <input value={form.plaque} onChange={(e) => setForm({ ...form, plaque: e.target.value })} placeholder="SA-00AA" className={`${FIELD} font-data uppercase`} />
              </LabeledField>
              <LabeledField label="Modèle">
                <input value={form.modele} onChange={(e) => setForm({ ...form, modele: e.target.value })} placeholder="Bravado Banshee" className={FIELD} />
              </LabeledField>
              <div className="grid grid-cols-2 gap-3">
                <LabeledField label="Couleur">
                  <input value={form.couleur} onChange={(e) => setForm({ ...form, couleur: e.target.value })} className={FIELD} />
                </LabeledField>
                <LabeledField label="Type">
                  <input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="voiture" className={FIELD} />
                </LabeledField>
              </div>
              <LabeledField label="Photo du véhicule">
                <ImageUpload value={photoUrl} onChange={setPhotoUrl} aspect="wide" className="w-[220px]" />
              </LabeledField>
              <LabeledField label="Notes">
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full resize-y rounded-sm border border-border bg-surface-2 px-3 py-2 text-[13px] text-text outline-none focus:border-accent" />
              </LabeledField>
            </>
          ) : (
            vehicle && (
              <>
                {vehicle.photoUrl && (
                  <img src={vehicle.photoUrl} alt={vehicle.plaque} className="max-h-[190px] w-full rounded-sm border border-border object-cover" />
                )}
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border">
                  <ViewField label="Plaque" mono>{vehicle.plaque}</ViewField>
                  <ViewField label="Type">{vehicle.type || "-"}</ViewField>
                  <ViewField label="Modèle">{vehicle.modele || "-"}</ViewField>
                  <ViewField label="Couleur">{vehicle.couleur || "-"}</ViewField>
                  <div className="col-span-2 bg-surface-2 px-3 py-[10px]">
                    <div className="mb-[3px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Notes</div>
                    <div className="whitespace-pre-wrap text-[13px]">{vehicle.notes || "-"}</div>
                  </div>
                </div>
                {vehicleId && <VehicleFlags vehicleId={vehicleId} flags={vehicle.flags} canManage={canEdit} />}
                {vehicleId && <VehicleParticipation vehicleId={vehicleId} />}
              </>
            )
          )}
        </div>

        {canEdit && (
          <div className="flex flex-shrink-0 items-center gap-2 border-t border-border px-[18px] py-4">
            {confirm ? (
              <>
                <span className="flex-1 text-[12.5px] text-muted">Supprimer ce véhicule ?</span>
                <button onClick={() => setConfirm(false)} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
                <button onClick={doDelete} disabled={busy} className="rounded-sm px-4 py-[10px] text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--danger)" }}>{busy ? "…" : "Confirmer"}</button>
              </>
            ) : editing ? (
              <>
                {!isCreate && (
                  <button onClick={() => setConfirm(true)} className="flex h-[38px] w-[38px] items-center justify-center rounded-sm border border-border bg-surface-2 hover:border-border-strong" style={{ color: "var(--danger)" }} title="Supprimer">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
                <button onClick={save} disabled={busy || !form.plaque.trim() || (isCreate && !owner)} className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">
                  {busy ? "…" : isCreate ? "Enregistrer" : "Enregistrer les modifications"}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setConfirm(true)} className="flex items-center gap-[7px] rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong" style={{ color: "var(--danger)" }}>
                  <Trash2 className="h-4 w-4" /> Supprimer
                </button>
                <div className="flex-1" />
                <button onClick={() => setEditing(true)} className="flex items-center gap-[7px] rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]">
                  <Pencil className="h-4 w-4" /> Modifier
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function VehicleFlags({
  vehicleId,
  flags,
  canManage,
}: {
  vehicleId: Id<"vehicles">;
  flags: { _id: string; flagTypeId: string; name: string; color: string | null }[];
  canManage: boolean;
}) {
  const toast = useToast();
  const types = useQuery(api.vehicles.flagTypes);
  const setFlag = useMutation(api.vehicles.setFlag);
  const removeFlag = useMutation(api.vehicles.removeFlag);
  const [sel, setSel] = useState("");
  const held = new Set(flags.map((f) => f.flagTypeId));
  const available = (types ?? []).filter((t) => !held.has(t._id));

  return (
    <div>
      <div className="mb-[8px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Flags véhicule</div>
      {flags.length === 0 ? (
        <div className="text-[12.5px] text-faint">Aucun flag.</div>
      ) : (
        <div className="flex flex-wrap gap-[6px]">
          {flags.map((f) => (
            <span key={f._id} className="flex items-center gap-[6px] rounded-[6px] px-[9px] py-[4px] text-[11.5px] font-semibold" style={{ background: `color-mix(in srgb, ${f.color ?? "var(--danger)"} 14%, transparent)`, color: f.color ?? "var(--danger)" }}>
              {f.name}
              {canManage && (
                <button onClick={() => toast.guard(removeFlag({ id: f._id as Id<"vehicleFlags"> }), "Retrait impossible")} className="opacity-70 hover:opacity-100">
                  <X className="h-[13px] w-[13px]" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {canManage && available.length > 0 && (
        <div className="mt-[10px] flex items-center gap-2">
          <select value={sel} onChange={(e) => setSel(e.target.value)} className="h-9 flex-1 rounded-sm border border-border bg-surface-2 px-2 text-[12.5px] outline-none focus:border-accent">
            <option value="">Ajouter un flag…</option>
            {available.map((t) => (
              <option key={t._id} value={t._id}>{t.name}</option>
            ))}
          </select>
          <button
            onClick={async () => {
              if (!sel) return;
              const r = await toast.guard(setFlag({ vehicleId, flagTypeId: sel as Id<"vehicleFlagTypes"> }), "Ajout impossible");
              if (r !== undefined) setSel("");
            }}
            disabled={!sel}
            className="rounded-sm bg-accent px-[12px] py-[7px] text-[12.5px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50"
          >
            Ajouter
          </button>
        </div>
      )}
    </div>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">{label}</div>
      {children}
    </div>
  );
}

function ViewField({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="bg-surface-2 px-3 py-[10px]">
      <div className="mb-[3px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">{label}</div>
      <div className={`text-[13px] ${mono ? "font-data font-semibold" : ""}`}>{children}</div>
    </div>
  );
}
