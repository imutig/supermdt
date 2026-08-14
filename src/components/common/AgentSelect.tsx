import { useState } from "react";
import { Search, X } from "lucide-react";
import { fmtMatricule } from "@/components/common/AgentTag";

type Agent = { _id: string; prenomRP: string; nomRP: string; matricule?: number | null };

// Sélection d'UN agent par recherche (jamais de liste déroulante exhaustive :
// l'effectif est trop grand). Affiche l'agent choisi sous forme de puce.
export function AgentSelect({
  roster,
  value,
  onChange,
  disabled,
  allowClear = true,
  placeholder = "Rechercher un agent…",
}: {
  roster: Agent[];
  value: string | null | undefined;
  onChange: (id: string | undefined) => void;
  disabled?: boolean;
  allowClear?: boolean;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const byId = new Map(roster.map((a) => [a._id, a]));
  const label = (a: Agent) => `${fmtMatricule(a.matricule) ?? ""} ${a.prenomRP} ${a.nomRP}`.trim();
  const needle = q.trim().toLowerCase();
  const matches = needle
    ? roster
        .filter((a) => a._id !== value)
        .filter((a) => `${a.prenomRP} ${a.nomRP} ${a.matricule ?? ""}`.toLowerCase().includes(needle))
        .slice(0, 8)
    : [];

  const selected = value ? byId.get(value) : null;

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3 py-2">
        <span className="flex-1 truncate text-[13px] font-semibold">{selected ? label(selected) : "Agent"}</span>
        {!disabled && allowClear && (
          <button onClick={() => onChange(undefined)} className="text-faint hover:text-danger"><X className="h-4 w-4" /></button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3">
        <Search className="h-4 w-4 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className="h-10 flex-1 bg-transparent text-[13px] outline-none"
        />
      </div>
      {matches.length > 0 && (
        <div className="mt-[6px] overflow-hidden rounded-sm border border-border">
          {matches.map((a) => (
            <button
              key={a._id}
              onClick={() => { onChange(a._id); setQ(""); }}
              className="block w-full border-b border-border px-3 py-[7px] text-left text-[12.5px] last:border-0 hover:bg-surface-2"
            >
              {label(a)}
            </button>
          ))}
        </div>
      )}
      {needle && matches.length === 0 && <div className="mt-[6px] text-[11.5px] text-faint">Aucun agent trouvé.</div>}
    </div>
  );
}
