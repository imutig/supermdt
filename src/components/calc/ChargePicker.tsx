import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";

// Sélecteur de chefs d'inculpation réutilisable (création via CalcModal, édition
// via EditChargesModal). Rend le champ de recherche + la liste groupée + les
// charges retenues, avec le paramètre (quantité / montant) et le label
// tentative / complicité par charge. Le calcul reste INCHANGÉ.

export interface Charge {
  _id: Id<"penalCharges">;
  name: string;
  categoryName: string;
  sensitive: boolean;
  severityName: string | null;
  fine: { kind: string; amount?: number; unit?: string; raw: string };
  jailSeconds: number | null;
  dojRequest: boolean;
  minParam: number | null;
  maxParam: number | null;
  sanctions: string[];
}
export type AttemptType = "" | "TENTATIVE" | "COMPLICITE";
export interface Row {
  uid: number;
  charge: Charge;
  param: number;
  isRecidive: boolean;
  attemptType: AttemptType;
}
let uidSeq = 1;
export const nextUid = () => uidSeq++;

export function baseOf(row: Row) {
  const f = row.charge.fine;
  if (f.kind === "FIXED") return f.amount ?? 0;
  if (f.kind === "PER_UNIT") return (f.amount ?? 0) * (row.param || 1);
  if (f.kind === "FORMULA") return row.param || 0;
  return 0;
}
// Item 4 : plus de multiplicateur DEFCON. Item 6 : plus de facteur récidive.
export const rowFine = (row: Row) => (row.charge.fine.kind === "ON_DECISION" ? 0 : Math.round(baseOf(row)));

// Bornes de quantité (§3) : bloque la validation si un paramètre est hors [min, max].
export function rowError(row: Row): string | null {
  if (row.charge.fine.kind !== "PER_UNIT" && row.charge.fine.kind !== "FORMULA") return null;
  if (row.charge.minParam != null && row.param < row.charge.minParam) return `Quantité minimale : ${row.charge.minParam}`;
  if (row.charge.maxParam != null && row.param > row.charge.maxParam) return `Quantité maximale : ${row.charge.maxParam}`;
  return null;
}

export function fmtMoney(n: number) {
  return "$" + n.toLocaleString("fr-FR");
}
export function fmtDur(seconds: number) {
  if (!seconds) return "Aucune";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [h ? `${h}h` : "", m ? `${m}min` : ""].filter(Boolean).join(" ") || `${seconds}s`;
}

const ATTEMPTS: { key: AttemptType; label: string }[] = [
  { key: "", label: "Normale" },
  { key: "TENTATIVE", label: "Tentative" },
  { key: "COMPLICITE", label: "Complicité" },
];

export function ChargePicker({
  rows,
  setRows,
  isCitation,
}: {
  rows: Row[];
  setRows: React.Dispatch<React.SetStateAction<Row[]>>;
  isCitation: boolean;
}) {
  const [pq, setPq] = useState("");
  const allCharges = useQuery(api.penal.listCharges, { search: pq || undefined }) as Charge[] | undefined;
  // En contravention, seules les infractions de sévérité "Contravention" sont proposables (§4).
  const charges = useMemo(
    () => (allCharges && isCitation ? allCharges.filter((c) => c.severityName === "Contravention") : allCharges),
    [allCharges, isCitation],
  );

  const pickerGroups = useMemo(() => {
    if (!charges) return [];
    const byCat = new Map<string, Charge[]>();
    for (const c of charges) {
      if (!byCat.has(c.categoryName)) byCat.set(c.categoryName, []);
      byCat.get(c.categoryName)!.push(c);
    }
    return [...byCat.entries()].map(([label, list]) => ({ label, list: list.slice(0, 12) }));
  }, [charges]);

  const add = (c: Charge) =>
    setRows((r) => [...r, { uid: nextUid(), charge: c, param: c.fine.kind === "PER_UNIT" ? 1 : 0, isRecidive: false, attemptType: "" }]);
  const remove = (uid: number) => setRows((r) => r.filter((x) => x.uid !== uid));
  const patch = (uid: number, p: Partial<Row>) => setRows((r) => r.map((x) => (x.uid === uid ? { ...x, ...p } : x)));

  return (
    <>
      {/* Picker */}
      <div>
        <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Ajouter une charge - code pénal</div>
        <input
          value={pq}
          onChange={(e) => setPq(e.target.value)}
          placeholder="Rechercher une infraction…"
          className="mb-[9px] h-9 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] text-text outline-none focus:border-accent"
        />
        <div className="max-h-[176px] overflow-y-auto rounded-sm border border-border">
          {charges === undefined && <div className="px-3 py-6 text-center text-[12px] text-faint">Chargement…</div>}
          {charges && charges.length === 0 && <div className="px-3 py-6 text-center text-[12px] text-faint">Aucune infraction.</div>}
          {charges && pq.trim()
            ? charges.slice(0, 25).map((c) => (
                <button
                  key={c._id}
                  onClick={() => add(c)}
                  className="flex w-full items-center gap-[10px] border-b border-border px-3 py-[9px] text-left hover:bg-accent-soft"
                >
                  <span className="flex-1 text-[12.5px]">
                    {c.name}
                    <span className="ml-2 text-[10.5px] text-faint">{c.categoryName}</span>
                  </span>
                  <span className="font-data text-[11px] text-muted">{c.fine.raw}</span>
                  <span className="text-[16px] font-normal leading-none text-accent">+</span>
                </button>
              ))
            : pickerGroups.map((g) => (
                <div key={g.label}>
                  <div className="sticky top-0 bg-surface-2 px-3 py-[7px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">{g.label}</div>
                  {g.list.map((c) => (
                    <button
                      key={c._id}
                      onClick={() => add(c)}
                      className="flex w-full items-center gap-[10px] border-b border-border px-3 py-[9px] text-left hover:bg-accent-soft"
                    >
                      <span className="flex-1 text-[12.5px]">{c.name}</span>
                      <span className="font-data text-[11px] text-muted">{c.fine.raw}</span>
                      <span className="text-[16px] font-normal leading-none text-accent">+</span>
                    </button>
                  ))}
                </div>
              ))}
        </div>
      </div>

      {/* Selected */}
      <div>
        <div className="mb-[9px] flex items-center gap-2">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Charges retenues</div>
          <span className="font-data text-[11px] text-muted">{rows.length}</span>
        </div>
        {rows.length === 0 && (
          <div className="rounded-sm border border-dashed border-border px-[22px] py-[22px] text-center text-[12.5px] text-faint">
            Aucune charge - ajoutez une infraction ci-dessus.
          </div>
        )}
        <div className="flex flex-col gap-[9px]">
          {rows.map((r) => (
            <div key={r.uid} className="rounded-sm border border-border bg-surface px-3 py-[11px]">
              <div className="flex items-start gap-[9px]">
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">{r.charge.name}</div>
                  <div className="mt-[2px] text-[11px] text-muted">
                    {r.charge.categoryName}
                    {r.charge.jailSeconds ? ` · Prison ${fmtDur(r.charge.jailSeconds)}` : ""}
                  </div>
                </div>
                <span className="font-data text-[14px] font-bold">{r.charge.fine.kind === "ON_DECISION" ? "DOJ" : fmtMoney(rowFine(r))}</span>
                <button
                  onClick={() => remove(r.uid)}
                  className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-[6px] border border-border text-[12px] leading-none text-faint hover:border-danger hover:text-danger"
                >
                  ✕
                </button>
              </div>
              {(r.charge.fine.kind === "PER_UNIT" || r.charge.fine.kind === "FORMULA") && (
                <div className="mt-[10px] flex flex-wrap items-center gap-[9px]">
                  <div className="flex items-center gap-[7px] rounded-[6px] border border-border bg-surface-2 px-[9px] py-1">
                    <span className="text-[11px] text-muted">{r.charge.fine.kind === "PER_UNIT" ? `Quantité` : "Montant de base"}</span>
                    <input
                      value={r.param}
                      onChange={(e) => patch(r.uid, { param: parseInt(e.target.value) || 0 })}
                      className="h-6 w-[64px] rounded-[5px] border border-border bg-surface px-[6px] text-center font-data text-[12px] text-text outline-none focus:border-accent"
                    />
                    {r.charge.fine.unit && <span className="text-[11px] text-faint">{r.charge.fine.unit}</span>}
                  </div>
                </div>
              )}
              {/* Tentative / complicité (label seul ; n'affecte pas la peine). */}
              <div className="mt-[10px] flex items-center gap-[6px]">
                {ATTEMPTS.map((a) => {
                  const on = r.attemptType === a.key;
                  return (
                    <button
                      key={a.key || "normal"}
                      onClick={() => patch(r.uid, { attemptType: a.key })}
                      className="rounded-[6px] border px-[10px] py-[4px] text-[11px] font-semibold"
                      style={
                        on
                          ? { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent)" }
                          : { background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--muted)" }
                      }
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
              {rowError(r) && (
                <div className="mt-[8px] rounded-[5px] px-[8px] py-[5px] text-[11.5px] font-semibold" style={{ background: "rgba(220,38,38,0.10)", color: "var(--danger)" }}>
                  {rowError(r)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
