import { useRef } from "react";
import { CalendarDays } from "lucide-react";

// Champ de date JJ/MM/AAAA : saisie directe OU sélection via le calendrier natif (item 8).
function toFr(iso: string) {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : "";
}
function toIso(fr: string) {
  const m = fr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

export function DateField({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const picker = useRef<HTMLInputElement>(null);

  return (
    <div className={`flex h-[46px] items-center rounded-[10px] border border-border bg-surface-2 pr-2 focus-within:border-accent ${className}`}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="JJ/MM/AAAA"
        inputMode="numeric"
        className="h-full min-w-0 flex-1 rounded-l-[10px] border-none bg-transparent px-[14px] font-data text-[14px] text-text outline-none"
      />
      <button
        type="button"
        onClick={() => picker.current?.showPicker?.()}
        className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] text-faint hover:text-accent"
        title="Choisir dans le calendrier"
      >
        <CalendarDays className="h-[17px] w-[17px]" />
      </button>
      <input
        ref={picker}
        type="date"
        value={toIso(value)}
        onChange={(e) => onChange(toFr(e.target.value))}
        className="absolute h-0 w-0 opacity-0"
        tabIndex={-1}
      />
    </div>
  );
}
