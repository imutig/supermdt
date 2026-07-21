import { X } from "lucide-react";

// Sélection multiple à partir d'une liste { _id, label }.
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Ajouter…",
  disabled,
}: {
  options: { _id: string; label: string }[] | undefined;
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const byId = new Map((options ?? []).map((o) => [o._id, o.label]));
  const available = (options ?? []).filter((o) => !selected.includes(o._id));

  return (
    <div>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-[6px]">
          {selected.map((id) => (
            <span key={id} className="flex items-center gap-[6px] rounded-[6px] border border-border bg-surface-2 px-[9px] py-[4px] text-[11.5px] font-semibold">
              {byId.get(id) ?? id}
              {!disabled && (
                <button onClick={() => onChange(selected.filter((x) => x !== id))} className="text-faint hover:text-danger">
                  <X className="h-[13px] w-[13px]" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && available.length > 0 && (
        <select
          value=""
          onChange={(e) => { if (e.target.value) onChange([...selected, e.target.value]); }}
          className="h-9 w-full rounded-sm border border-border bg-surface-2 px-2 text-[12.5px] outline-none focus:border-accent"
        >
          <option value="">{placeholder}</option>
          {available.map((o) => <option key={o._id} value={o._id}>{o.label}</option>)}
        </select>
      )}
    </div>
  );
}
