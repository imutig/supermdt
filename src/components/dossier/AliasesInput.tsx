import { useState } from "react";
import { X } from "lucide-react";

const FIELD =
  "h-[46px] w-full rounded-[10px] border border-border bg-surface-2 px-[14px] text-[13px] text-text outline-none focus:border-accent";

// Éditeur d'alias / AKA sous forme de puces. Entrée ou virgule pour ajouter.
export function AliasesInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) {
      if (!next.some((a) => a.toLowerCase() === p.toLowerCase())) next.push(p);
    }
    onChange(next);
    setDraft("");
  };

  return (
    <div>
      {value.length > 0 && (
        <div className="mb-[6px] flex flex-wrap gap-[6px]">
          {value.map((a) => (
            <span key={a} className="inline-flex items-center gap-[5px] rounded-full border border-border bg-surface-2 px-[10px] py-[4px] text-[12px] text-text">
              {a}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== a))}
                className="text-muted hover:text-danger"
                aria-label={`Retirer l'alias ${a}`}
              >
                <X className="h-[13px] w-[13px]" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); }
          else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => draft.trim() && add(draft)}
        placeholder="Surnom, pseudo… (Entrée pour ajouter)"
        className={FIELD}
      />
    </div>
  );
}
