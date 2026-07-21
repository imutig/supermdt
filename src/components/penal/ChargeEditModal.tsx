import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useToast } from "@/providers/toast";

const FIELD = "h-9 w-full rounded-sm border border-border bg-surface-2 px-2 text-[13px] outline-none focus:border-accent";
const KINDS = [
  { value: "FIXED", label: "Montant fixe" },
  { value: "PER_UNIT", label: "Par unité" },
  { value: "FORMULA", label: "Formule (montant saisi)" },
  { value: "ON_DECISION", label: "Sur décision (DOJ)" },
  { value: "UNSPECIFIED", label: "Non spécifié" },
];

// Éditeur d'une charge du code pénal (§15/§16). chargeId absent = création.
export function ChargeEditModal({ chargeId, onClose }: { chargeId?: Id<"penalCharges">; onClose: () => void }) {
  const isCreate = !chargeId;
  const toast = useToast();
  const existing = useQuery(api.penal.getCharge, chargeId ? { id: chargeId } : "skip");
  const categories = useQuery(api.penal.listCategories);
  const severities = useQuery(api.penal.listSeverities);
  const sanctions = useQuery(api.penal.listSanctions);
  const create = useMutation(api.penal.chargeCreate);
  const update = useMutation(api.penal.chargeUpdate);
  const removeCharge = useMutation(api.penal.chargeRemove);

  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [f, setF] = useState<{
    init: boolean;
    name: string; categoryId: string; severityId: string;
    kind: string; amount: string; unit: string; formula: string; raw: string;
    jailSeconds: string; recidiveDays: string; dojRequest: boolean;
    minParam: string; maxParam: string; description: string; sanctionIds: string[];
  }>({
    init: isCreate, name: "", categoryId: "", severityId: "", kind: "FIXED", amount: "", unit: "", formula: "", raw: "",
    jailSeconds: "", recidiveDays: "", dojRequest: false, minParam: "", maxParam: "", description: "", sanctionIds: [],
  });

  if (!f.init && existing) {
    setF({
      init: true,
      name: existing.name,
      categoryId: existing.categoryId,
      severityId: existing.severityId ?? "",
      kind: existing.fine.kind,
      amount: existing.fine.amount != null ? String(existing.fine.amount) : "",
      unit: existing.fine.unit ?? "",
      formula: existing.fine.formula ?? "",
      raw: existing.fine.raw,
      jailSeconds: existing.jailSeconds != null ? String(existing.jailSeconds) : "",
      recidiveDays: existing.recidiveDays != null ? String(existing.recidiveDays) : "",
      dojRequest: existing.dojRequest,
      minParam: existing.minParam != null ? String(existing.minParam) : "",
      maxParam: existing.maxParam != null ? String(existing.maxParam) : "",
      description: existing.description ?? "",
      sanctionIds: existing.sanctionIds,
    });
  }

  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

  async function save() {
    if (!f.name.trim() || !f.categoryId || !f.raw.trim()) {
      toast.error("Nom, catégorie et libellé d'amende requis.");
      return;
    }
    const payload = {
      categoryId: f.categoryId as Id<"penalCategories">,
      severityId: f.severityId ? (f.severityId as Id<"severityLevels">) : undefined,
      name: f.name.trim(),
      fine: {
        kind: f.kind as "FIXED" | "FORMULA" | "ON_DECISION" | "PER_UNIT" | "UNSPECIFIED",
        amount: num(f.amount),
        unit: f.unit.trim() || undefined,
        formula: f.formula.trim() || undefined,
        raw: f.raw.trim(),
      },
      jailSeconds: num(f.jailSeconds),
      recidiveDays: num(f.recidiveDays),
      dojRequest: f.dojRequest,
      sanctionIds: f.sanctionIds as Id<"sanctionTypes">[],
      description: f.description.trim() || undefined,
      minParam: num(f.minParam),
      maxParam: num(f.maxParam),
    };
    setBusy(true);
    const r = isCreate
      ? await toast.guard(create(payload), "Création impossible")
      : await toast.guard(update({ id: chargeId!, ...payload }), "Modification impossible");
    setBusy(false);
    if (r !== undefined) {
      toast.success(isCreate ? "Infraction créée." : "Infraction modifiée.");
      onClose();
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[540px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">{isCreate ? "Nouvelle infraction" : "Éditer l'infraction"}</h2>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-4">
          <L label="Nom"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={FIELD} /></L>
          <div className="grid grid-cols-2 gap-3">
            <L label="Catégorie">
              <select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} className={FIELD}>
                <option value="">-</option>
                {(categories ?? []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </L>
            <L label="Gravité">
              <select value={f.severityId} onChange={(e) => setF({ ...f, severityId: e.target.value })} className={FIELD}>
                <option value="">-</option>
                {(severities ?? []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </L>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <L label="Type d'amende">
              <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className={FIELD}>
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </L>
            <L label="Libellé d'amende (affiché)"><input value={f.raw} onChange={(e) => setF({ ...f, raw: e.target.value })} className={FIELD} /></L>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <L label="Montant"><input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className={FIELD} /></L>
            <L label="Unité"><input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} className={FIELD} /></L>
            <L label="Prison (s)"><input type="number" value={f.jailSeconds} onChange={(e) => setF({ ...f, jailSeconds: e.target.value })} className={FIELD} /></L>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <L label="Récidive (jours)"><input type="number" value={f.recidiveDays} onChange={(e) => setF({ ...f, recidiveDays: e.target.value })} className={FIELD} /></L>
            <L label="Quantité min"><input type="number" value={f.minParam} onChange={(e) => setF({ ...f, minParam: e.target.value })} className={FIELD} /></L>
            <L label="Quantité max"><input type="number" value={f.maxParam} onChange={(e) => setF({ ...f, maxParam: e.target.value })} className={FIELD} /></L>
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={f.dojRequest} onChange={(e) => setF({ ...f, dojRequest: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
            Demande au procureur (DOJ) requise
          </label>
          <L label="Sanctions">
            <div className="flex flex-wrap gap-[6px]">
              {(sanctions ?? []).map((s) => {
                const on = f.sanctionIds.includes(s._id);
                return (
                  <button key={s._id} onClick={() => setF({ ...f, sanctionIds: on ? f.sanctionIds.filter((x) => x !== s._id) : [...f.sanctionIds, s._id] })}
                    className="rounded-[6px] border px-[9px] py-[5px] text-[11.5px] font-semibold"
                    style={on ? { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent)" } : { background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--muted)" }}>
                    {s.name}
                  </button>
                );
              })}
            </div>
          </L>
          <L label="Description"><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} className="w-full resize-y rounded-sm border border-border bg-surface-2 px-2 py-2 text-[13px] outline-none focus:border-accent" /></L>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 border-t border-border px-[18px] py-4">
          {!isCreate && (confirm ? (
            <>
              <span className="flex-1 text-[12.5px] text-muted">Supprimer ?</span>
              <button onClick={() => setConfirm(false)} className="rounded-sm border border-border bg-surface-2 px-3 py-[9px] text-[12.5px] font-semibold">Annuler</button>
              <button onClick={async () => { const r = await toast.guard(removeCharge({ id: chargeId! }), "Suppression impossible"); if (r !== undefined) { toast.success("Supprimé."); onClose(); } }} className="rounded-sm px-3 py-[9px] text-[12.5px] font-semibold text-white" style={{ background: "var(--danger)" }}>Confirmer</button>
            </>
          ) : (
            <button onClick={() => setConfirm(true)} className="flex h-[38px] w-[38px] items-center justify-center rounded-sm border border-border bg-surface-2" style={{ color: "var(--danger)" }}><Trash2 className="h-4 w-4" /></button>
          ))}
          {!confirm && (
            <>
              <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
              <button onClick={save} disabled={busy} className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "…" : "Enregistrer"}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-[5px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">{label}</div>
      {children}
    </div>
  );
}
