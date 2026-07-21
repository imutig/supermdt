import { useState } from "react";
import { Search, X } from "lucide-react";
import { fmtMatricule } from "@/components/common/AgentTag";

type Agent = { _id: string; prenomRP: string; nomRP: string; matricule?: number | null };

// Sélection d'agents par recherche plutôt que par liste exhaustive : l'effectif
// dépasse la vingtaine, afficher tout le monde d'un coup devient illisible.
export function AgentPicker({
  roster,
  selected,
  onChange,
  disabled,
  placeholder = "Rechercher un agent…",
}: {
  roster: Agent[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const held = new Set(selected);
  const byId = new Map(roster.map((a) => [a._id, a]));
  const needle = q.trim().toLowerCase();
  const matches = needle
    ? roster
        .filter((a) => !held.has(a._id))
        .filter((a) => `${a.prenomRP} ${a.nomRP} ${a.matricule ?? ""}`.toLowerCase().includes(needle))
        .slice(0, 8)
    : [];

  const label = (a: Agent) => `${fmtMatricule(a.matricule) ?? ""} ${a.prenomRP} ${a.nomRP}`.trim();

  return (
    <div>
      {selected.length > 0 && (
        <div className="mb-[7px] flex flex-wrap gap-[6px]">
          {selected.map((id) => {
            const a = byId.get(id);
            return (
              <span key={id} className="flex items-center gap-[6px] rounded-[6px] border px-[9px] py-[5px] text-[11.5px] font-semibold" style={{ background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent)" }}>
                {a ? label(a) : "Agent"}
                {!disabled && (
                  <button onClick={() => onChange(selected.filter((x) => x !== id))} className="opacity-70 hover:opacity-100"><X className="h-[12px] w-[12px]" /></button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {!disabled && (
        <>
          <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3">
            <Search className="h-4 w-4 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              className="h-10 flex-1 bg-transparent text-[13px] outline-none"
            />
          </div>
          {matches.length > 0 && (
            <div className="mt-[6px] overflow-hidden rounded-sm border border-border">
              {matches.map((a) => (
                <button
                  key={a._id}
                  onClick={() => { onChange([...selected, a._id]); setQ(""); }}
                  className="block w-full border-b border-border px-3 py-[7px] text-left text-[12.5px] last:border-0 hover:bg-surface-2"
                >
                  {label(a)}
                </button>
              ))}
            </div>
          )}
          {needle && matches.length === 0 && (
            <div className="mt-[6px] text-[11.5px] text-faint">Aucun agent trouvé.</div>
          )}
        </>
      )}
    </div>
  );
}
