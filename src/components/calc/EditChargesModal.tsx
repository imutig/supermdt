import { useState } from "react";
import { X } from "lucide-react";
import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useToast } from "@/providers/toast";
import { ChargePicker, type Charge, type Row, type AttemptType, nextUid, rowFine, rowError, fmtMoney, fmtDur } from "@/components/calc/ChargePicker";

// Chef d'inculpation existant (tel que renvoyé par casier/citations.getEntry).
export interface ExistingCharge {
  penalChargeId: Id<"penalCharges"> | string | null;
  name: string;
  category: string;
  severity: string;
  fineRaw: string;
  computedFine: number;
  computedJailSeconds?: number;
  formulaParam?: unknown;
  attemptType: AttemptType | null;
}

// Édition des chefs d'inculpation d'une entrée / contravention non clôturée
// (item 2). Réutilise le sélecteur de charges (ChargePicker), pré-rempli avec
// les charges actuelles, et délègue l'enregistrement à onSave.
export function EditChargesModal({
  title,
  initialCharges,
  isCitation,
  onSave,
  onClose,
}: {
  title: string;
  initialCharges: ExistingCharge[];
  isCitation: boolean;
  onSave: (charges: { penalChargeId: Id<"penalCharges">; param?: number; isRecidive: boolean; attemptType?: "TENTATIVE" | "COMPLICITE" }[]) => Promise<unknown>;
  onClose: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [init, setInit] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  // Référentiel complet : pour rebâtir des lignes éditables (bornes, type de
  // barème) à partir des penalChargeId existants.
  const all = useQuery(api.penal.listCharges, {}) as Charge[] | undefined;
  // Certaines charges ne sont plus rattachables (importées, référentiel purgé).
  const [dropped, setDropped] = useState(0);

  if (!init && all) {
    setInit(true);
    const byId = new Map(all.map((c) => [c._id as string, c]));
    const built: Row[] = [];
    let drop = 0;
    for (const ec of initialCharges) {
      const pid = ec.penalChargeId ? String(ec.penalChargeId) : null;
      if (!pid) { drop++; continue; } // pas de penalChargeId : non ré-encodable
      const live = byId.get(pid);
      // Charge encore au référentiel : ligne complète (bornes / barème corrects).
      // Sinon, stub fidèle au snapshot stocké (barème FIXED = montant calculé).
      const charge: Charge = live ?? {
        _id: pid as Id<"penalCharges">,
        name: ec.name,
        categoryName: ec.category,
        sensitive: false,
        severityName: ec.severity || null,
        fine: { kind: "FIXED", amount: ec.computedFine, raw: ec.fineRaw },
        jailSeconds: ec.computedJailSeconds ?? null,
        dojRequest: false,
        minParam: null,
        maxParam: null,
        sanctions: [],
      };
      // Charge vivante : param = quantité stockée (Qté par défaut 1 ; FORMULA 0 =
      // montant à saisir). Stub (charge purgée) : son `amount` est déjà le total
      // calculé -> param neutre (1) pour ne pas re-multiplier à l'affichage.
      const param = !live
        ? 1
        : typeof ec.formulaParam === "number"
          ? ec.formulaParam
          : charge.fine.kind === "FORMULA"
            ? 0
            : 1;
      built.push({ uid: nextUid(), charge, param, isRecidive: false, attemptType: (ec.attemptType ?? "") as AttemptType });
    }
    setRows(built);
    setDropped(drop);
  }

  const totalFine = rows.reduce((s, r) => s + rowFine(r), 0);
  const totalJail = rows.reduce((s, r) => s + (r.charge.jailSeconds ?? 0), 0);
  const hasErrors = rows.some((r) => rowError(r) !== null);

  async function save() {
    if (rows.length === 0) { toast.error("Au moins une charge est requise."); return; }
    if (hasErrors) { toast.error("Une charge a une quantité hors bornes."); return; }
    setBusy(true);
    const charges = rows.map((r) => ({
      penalChargeId: r.charge._id,
      param: r.param,
      isRecidive: false,
      attemptType: r.attemptType || undefined,
    }));
    const res = await toast.guard(onSave(charges), "Enregistrement impossible");
    setBusy(false);
    if (res !== undefined) {
      toast.success("Chefs d'inculpation mis à jour.");
      onClose();
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-[70] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[560px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">{title}</h2>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[18px] py-4">
          {!all ? (
            <div className="px-3 py-6 text-center text-[12px] text-faint">Chargement…</div>
          ) : (
            <>
              {dropped > 0 && (
                <div className="rounded-sm px-[10px] py-[8px] text-[11.5px] font-semibold" style={{ background: "rgba(220,38,38,0.10)", color: "var(--danger)" }}>
                  {dropped} chef(s) non rattaché(s) au code pénal ne peuvent être réédités et seront retirés si vous enregistrez.
                </div>
              )}
              <ChargePicker rows={rows} setRows={setRows} isCitation={isCitation} />
            </>
          )}
        </div>

        <div className="flex-shrink-0 border-t border-border px-[18px] py-4">
          <div className={`mb-3 grid ${isCitation ? "grid-cols-1" : "grid-cols-2"} gap-[10px]`}>
            <div className="rounded-sm border border-border bg-surface-2 px-[13px] py-[11px]">
              <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-faint">Amende totale</div>
              <div className="mt-1 font-data text-[19px] font-bold">{fmtMoney(totalFine)}</div>
            </div>
            {!isCitation && (
              <div className="rounded-sm border border-border bg-surface-2 px-[13px] py-[11px]">
                <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-faint">Prison totale</div>
                <div className="mt-1 font-data text-[19px] font-bold">{fmtDur(totalJail)}</div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold text-text hover:border-border-strong">Annuler</button>
            <button onClick={save} disabled={busy || rows.length === 0 || hasErrors} className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">
              {busy ? "…" : "Enregistrer les chefs"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
