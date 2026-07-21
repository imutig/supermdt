import { Plus, Trash2 } from "lucide-react";

export type Casing = { serial?: string; time?: string; caliber?: string; location?: string; notes?: string };

// Éditeur de douilles ramassées (item 9).
export function CasingsEditor({
  value,
  onChange,
  editable,
}: {
  value: Casing[];
  onChange?: (v: Casing[]) => void;
  editable?: boolean;
}) {
  const F = "h-9 w-full rounded-sm border border-border bg-surface px-2 text-[12.5px] outline-none focus:border-accent";
  const patch = (i: number, k: keyof Casing, val: string) => onChange?.(value.map((c, j) => (j === i ? { ...c, [k]: val } : c)));

  if (!editable && value.length === 0) return <div className="text-[12.5px] text-faint">Aucune douille.</div>;

  return (
    <div className="flex flex-col gap-[8px]">
      {value.map((c, i) => (
        <div key={i} className="rounded-sm border border-border bg-surface-2 p-[10px]">
          {editable ? (
            <>
              <div className="mb-2 grid grid-cols-3 gap-2">
                <input value={c.serial ?? ""} onChange={(e) => patch(i, "serial", e.target.value)} placeholder="N° de série" className={`${F} font-data`} />
                <input type="time" value={c.time ?? ""} onChange={(e) => patch(i, "time", e.target.value)} className={`${F} font-data`} />
                <input value={c.caliber ?? ""} onChange={(e) => patch(i, "caliber", e.target.value)} placeholder="Calibre" className={F} />
              </div>
              <div className="flex gap-2">
                <input value={c.location ?? ""} onChange={(e) => patch(i, "location", e.target.value)} placeholder="Lieu de découverte" className={F} />
                <input value={c.notes ?? ""} onChange={(e) => patch(i, "notes", e.target.value)} placeholder="Notes (optionnel)" className={F} />
                <button onClick={() => onChange?.(value.filter((_, j) => j !== i))} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm border border-border bg-surface text-faint hover:text-danger"><Trash2 className="h-[14px] w-[14px]" /></button>
              </div>
            </>
          ) : (
            <div className="text-[12.5px]">
              <span className="font-data font-semibold">{c.serial || "?"}</span>
              {c.caliber ? ` · ${c.caliber}` : ""}{c.time ? ` · ${c.time}` : ""}{c.location ? ` · ${c.location}` : ""}
              {c.notes ? <div className="mt-[2px] text-[11.5px] text-muted">{c.notes}</div> : null}
            </div>
          )}
        </div>
      ))}
      {editable && (
        <button onClick={() => onChange?.([...value, {}])} className="flex items-center justify-center gap-[6px] rounded-sm border border-dashed border-border py-[8px] text-[12.5px] font-semibold text-muted hover:border-accent hover:text-accent">
          <Plus className="h-[15px] w-[15px]" /> Ajouter une douille
        </button>
      )}
    </div>
  );
}
