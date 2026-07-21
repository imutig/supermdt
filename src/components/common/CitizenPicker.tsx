import { useState } from "react";
import { Search, X } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/lib/api";

// Sélecteur de citoyen réutilisable (recherche dans les dossiers).
export function CitizenPicker({
  value,
  onChange,
  placeholder = "Rechercher un citoyen…",
  disabled,
}: {
  value: { id: string; name: string } | null;
  onChange: (v: { id: string; name: string } | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const results = useQuery(api.citizens.search, !value && q.trim() ? { q } : "skip");

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3 py-2">
        <span className="flex-1 text-[13px] font-semibold">{value.name}</span>
        {!disabled && (
          <button onClick={() => onChange(null)} className="text-faint hover:text-danger">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3">
        <Search className="h-4 w-4 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="h-10 flex-1 bg-transparent text-[13px] outline-none"
        />
      </div>
      {results && results.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-[180px] w-full overflow-y-auto rounded-sm border border-border bg-surface shadow-[0_8px_30px_var(--shadow)]">
          {results.map((c) => (
            <button
              key={c._id}
              onClick={() => { onChange({ id: c._id, name: `${c.prenom} ${c.nom}` }); setQ(""); }}
              className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left hover:bg-surface-2"
            >
              <span className="flex-1 text-[13px] font-semibold">{c.prenom} {c.nom}</span>
              <span className="font-data text-[11px] text-muted">{c.dateNaissance ?? ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
