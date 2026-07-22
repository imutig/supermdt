import { useState } from "react";
import { X, Search, Plus, UserPlus, Car } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useToast } from "@/providers/toast";
import { useMe } from "@/hooks/useMe";
import { fmtMatricule } from "@/components/common/AgentTag";
import { PATROL_COLORS } from "@/lib/patrolColors";
import { StatusFieldsModal, type PatrolFields } from "@/components/dispatch/statusFields";

type Member = { _id: string; name: string; matricule: number | null };

// Création de patrouille : on indique les agents présents (le créateur n'est PAS ajouté d'office).
// L'indicateur (L/A/T/X) se déduit de l'effectif ; une spécialité peut le forcer.
export function PatrolCreateModal({ onClose }: { onClose: () => void }) {
  const roster = useQuery(api.agents.roster) ?? [];
  const callsigns = useQuery(api.dispatch.callsigns) ?? [];
  const opts = useQuery(api.dispatch.statusOptions);
  const create = useMutation(api.dispatch.create);
  const toast = useToast();
  const me = useMe();

  const [num, setNum] = useState("");
  const [fleet, setFleet] = useState<{ _id: string; label: string; number: string } | null>(null);
  const [unregistered, setUnregistered] = useState(false);
  const [vq, setVq] = useState("");
  const vehResults = useQuery(api.fleet.pick, unregistered ? "skip" : { q: vq });
  const [members, setMembers] = useState<Member[]>([]);
  const [specialty, setSpecialty] = useState("");
  const [color, setColor] = useState("");
  const [detail, setDetail] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const meId = me?.agent._id;
  const meInPatrol = members.some((m) => m._id === meId);
  const held = new Set(members.map((m) => m._id));
  const matches = q.trim() ? roster.filter((a) => !held.has(a._id) && `${a.prenomRP} ${a.nomRP}`.toLowerCase().includes(q.trim().toLowerCase())) : [];

  const count = members.length;
  const cs = callsigns.find((c) => c._id === specialty);
  const indicator = cs ? cs.indicator : ["L", "A", "T", "X"][Math.min(Math.max(count || 1, 1), 4) - 1];
  const effNum = fleet ? fleet.number : num ? num.padStart(2, "0") : "";
  const preview = `13${indicator}${effNum || "…"}`;

  const addMe = () => { if (me && meId && !meInPatrol) setMembers((p) => [...p, { _id: meId, name: `${me.agent.prenomRP} ${me.agent.nomRP}`, matricule: me.agent.matricule ?? null }]); };

  // Statut initial (par défaut) : il peut exiger des champs (ex. secteur pour « En patrouille »).
  const initialStatus = opts?.statuses.find((s) => s.isDefault) ?? opts?.statuses[0] ?? null;
  const [askFields, setAskFields] = useState(false);

  async function doCreate(fields?: PatrolFields) {
    setBusy(true);
    const r = await toast.guard(create({
      vehicleNumber: num,
      fleetVehicleId: fleet ? (fleet._id as Id<"fleetVehicles">) : undefined,
      memberIds: members.map((m) => m._id as Id<"agents">),
      callsignTypeId: specialty ? (specialty as Id<"callsignTypes">) : undefined,
      color: color || undefined,
      detail: detail.trim() || undefined,
      fields,
    }), "Création impossible");
    setBusy(false);
    if (r !== undefined) { toast.success("Patrouille créée."); onClose(); }
  }

  function submit() {
    if (members.length === 0) { toast.error("Sélectionnez au moins un agent présent."); return; }
    if (!fleet && !num.trim()) { toast.error("Choisissez un véhicule ou indiquez un numéro."); return; }
    // Si le statut initial exige des informations, on les demande avant de créer.
    if (initialStatus && initialStatus.requires.length > 0) { setAskFields(true); return; }
    void doCreate();
  }

  const F = "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";
  const L = "mb-[6px] block text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint";

  return (
    <div onClick={onClose} className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[92vh] w-[420px] max-w-[94vw] flex-col rounded-card border border-border-strong bg-elev shadow-[0_24px_70px_rgba(0,0,0,.4)] mdt-pop">
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-5 py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">Créer une patrouille</h2>
          <button onClick={onClose} className="flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-3 flex items-center justify-center rounded-sm border py-3" style={{ borderColor: color || "var(--border)", background: color ? `color-mix(in srgb, ${color} 12%, var(--surface-2))` : "var(--surface-2)" }}>
            <span className="font-data text-[24px] font-bold tracking-wide text-accent">{preview}</span>
          </div>

          {/* Effectif */}
          <div className="mb-3">
            <div className="mb-[6px] flex items-center gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Agents présents ({count})</span>
              <div className="flex-1" />
              {!meInPatrol && <button onClick={addMe} className="flex items-center gap-[5px] rounded-[6px] border border-border bg-surface-2 px-[8px] py-[3px] text-[11px] font-semibold text-muted hover:border-accent hover:text-accent"><UserPlus className="h-[12px] w-[12px]" /> M'ajouter</button>}
            </div>
            {members.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-[6px]">
                {members.map((m) => (
                  <span key={m._id} className="flex items-center gap-[6px] rounded-[6px] border border-border bg-surface-2 px-[9px] py-[4px] text-[12px] font-semibold">
                    {fmtMatricule(m.matricule)} {m.name}
                    <button onClick={() => setMembers((prev) => prev.filter((x) => x._id !== m._id))} className="text-faint hover:text-danger"><X className="h-[13px] w-[13px]" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-2">
                <Search className="h-[14px] w-[14px] text-faint" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ajouter un agent…" className="h-9 flex-1 bg-transparent text-[12.5px] outline-none" />
              </div>
              {matches.length > 0 && (
                <div className="mt-1 max-h-[150px] overflow-y-auto rounded-sm border border-border bg-surface">
                  {matches.slice(0, 8).map((a) => (
                    <button key={a._id} onClick={() => { setMembers((prev) => [...prev, { _id: a._id, name: `${a.prenomRP} ${a.nomRP}`, matricule: a.matricule ?? null }]); setQ(""); }} className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left hover:bg-surface-2">
                      <Plus className="h-[13px] w-[13px] text-accent" />
                      <span className="font-data text-[11px] text-accent">{fmtMatricule(a.matricule)}</span>
                      <span className="flex-1 text-[12.5px] font-semibold">{a.prenomRP} {a.nomRP}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Véhicule : LSPD (fixe le numéro) ou non enregistré (numéro libre). */}
          <div className="mb-3">
            <div className="mb-[6px] flex items-center gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Véhicule</span>
              <div className="flex-1" />
              <label className="flex cursor-pointer items-center gap-[5px] text-[11px] font-semibold text-muted">
                <input type="checkbox" checked={unregistered} onChange={(e) => { setUnregistered(e.target.checked); setFleet(null); }} className="h-[13px] w-[13px] accent-[var(--accent)]" />
                Non enregistré
              </label>
            </div>

            {unregistered ? (
              <input value={num} onChange={(e) => setNum(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))} placeholder="Fin d'indicatif, ex. 09" className={`${F} font-data`} />
            ) : fleet ? (
              <div className="flex items-center gap-2 rounded-sm border border-accent bg-surface-2 px-3 py-[8px]">
                <Car className="h-[15px] w-[15px] text-accent" />
                <span className="flex-1 text-[12.5px] font-semibold">{fleet.label}</span>
                <span className="font-data text-[12px] text-accent">13x{fleet.number}</span>
                <button onClick={() => setFleet(null)} className="text-faint hover:text-danger"><X className="h-[14px] w-[14px]" /></button>
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-2">
                  <Search className="h-[14px] w-[14px] text-faint" />
                  <input value={vq} onChange={(e) => setVq(e.target.value)} placeholder="Numéro de toit ou plaque…" className="h-9 flex-1 bg-transparent text-[12.5px] outline-none" />
                </div>
                {(vehResults ?? []).length > 0 && (
                  <div className="mt-1 max-h-[170px] overflow-y-auto rounded-sm border border-border bg-surface">
                    {(vehResults ?? []).map((v) => (
                      <button key={v._id} disabled={v.inUse} onClick={() => { setFleet({ _id: v._id, label: `${v.modele} · ${v.plaque}`, number: v.number }); setVq(""); }} className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left last:border-0 hover:bg-surface-2 disabled:opacity-40">
                        <span className="font-data text-[13px] font-bold text-accent">{v.roofNumber}</span>
                        <span className="flex-1 text-[12.5px] font-semibold">{v.modele}</span>
                        <span className="font-data text-[11px] text-muted">{v.plaque}</span>
                        {v.inUse && <span className="rounded-[4px] px-[5px] py-px text-[9px] font-bold uppercase text-danger" style={{ background: "color-mix(in srgb, var(--danger) 14%, transparent)" }}>sorti</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mb-3">
            <span className={L}>Type</span>
            <select value={specialty} onChange={(e) => setSpecialty(e.target.value)} className={F}>
              <option value="">Auto ({["L", "A", "T", "X"][Math.min(Math.max(count || 1, 1), 4) - 1]} · effectif)</option>
              {callsigns.map((c) => <option key={c._id} value={c._id}>{c.indicator} · {c.code} ({c.label})</option>)}
            </select>
          </div>

          <div className="mb-3"><span className={L}>Détail (libre, optionnel)</span><input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Ex. secteur nord, banalisée…" className={F} /></div>

          <div>
            <span className={L}>Couleur</span>
            <div className="flex gap-[8px]">
              <button onClick={() => setColor("")} className="flex h-[30px] w-[30px] items-center justify-center rounded-full border-2" style={{ borderColor: !color ? "var(--accent)" : "var(--border)", background: "var(--surface-2)" }} title="Aucune"><X className="h-[13px] w-[13px] text-faint" /></button>
              {PATROL_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} className="h-[30px] w-[30px] rounded-full border-2" style={{ background: c, borderColor: color === c ? "var(--text)" : "transparent" }} />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 gap-2 border-t border-border px-5 py-4">
          <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
          <button onClick={submit} disabled={busy} className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "…" : "Créer la patrouille"}</button>
        </div>
      </div>

      {askFields && initialStatus && (
        <StatusFieldsModal
          statusName={initialStatus.name}
          requires={initialStatus.requires}
          sectors={opts?.sectors ?? []}
          onCancel={() => setAskFields(false)}
          onConfirm={(fields) => { setAskFields(false); void doCreate(fields); }}
        />
      )}
    </div>
  );
}
