import { useState } from "react";
import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { CasierEntryModal } from "@/components/dossier/CasierEntryModal";
import { ContraventionModal } from "@/components/dossier/ContraventionModal";
import { AgentTag } from "@/components/common/AgentTag";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { Pagination, usePaged } from "@/components/common/Pagination";

const FILTERS = [
  { key: "all", label: "Tout" },
  { key: "casier", label: "Casier" },
  { key: "citation", label: "Contraventions" },
] as const;

// Historique judiciaire combiné : entrées de casier + contraventions (§4).
export function Contraventions() {
  const { can } = useCan();
  const listQ = useQuery(api.activity.casierAndCitations, can("casier.view") ? {} : "skip");
  const list = listQ ?? [];
  const [filter, setFilter] = useState<"all" | "casier" | "citation">("all");
  const [page, setPage] = useState(1);
  // Ouvre directement le détail de l'élément cliqué plutôt que le dossier entier.
  const [open, setOpen] = useState<{ kind: "casier" | "citation"; id: string } | null>(null);
  const rows = list.filter((r) => filter === "all" || r.kind === filter);
  const { pages, slice, safePage } = usePaged(rows, 20, page);

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[4px] flex items-baseline gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Historique judiciaire</h1>
        <span className="text-[12.5px] text-muted">Entrées de casier et contraventions récentes.</span>
      </div>

      <div className="mb-[14px] mt-3 flex flex-wrap gap-[2px] rounded-card border border-border bg-surface p-[5px]">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setPage(1); }}
            className="rounded-[7px] px-[12px] py-[7px] text-[12.5px] font-semibold hover:bg-surface-2"
            style={filter === f.key ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-[.7fr_1.2fr_1.8fr_.8fr_1fr_.9fr] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
          <span>Type</span>
          <span>Citoyen</span>
          <span>Motif</span>
          <span>Montant</span>
          <span>Agent</span>
          <span>Date</span>
        </div>
        {listQ === undefined && <div className="p-4"><SkeletonRows rows={6} /></div>}
        {listQ !== undefined && rows.length === 0 && <EmptyState title="Aucune entrée" message="Aucun casier ni contravention pour ce filtre." />}
        {slice.map((r) => (
          <div
            key={`${r.kind}-${r._id}`}
            onClick={() => setOpen({ kind: r.kind, id: r._id })}
            className="grid cursor-pointer grid-cols-[.7fr_1.2fr_1.8fr_.8fr_1fr_.9fr] items-center gap-3 border-b border-border px-4 py-3 hover:bg-surface-2"
          >
            <span>
              <span
                className="rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold"
                style={
                  r.kind === "casier"
                    ? { background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }
                    : { background: "color-mix(in srgb, var(--warning) 14%, transparent)", color: "var(--warning)" }
                }
              >
                {r.kind === "casier" ? "Casier" : "Contrav."}
              </span>
            </span>
            <span className="text-[13px] font-semibold">{r.citizenName}</span>
            <span className="truncate text-[12.5px] text-muted">{r.motif}</span>
            <span className="font-data text-[13px] font-semibold">${r.totalFine.toLocaleString("fr-FR")}</span>
            <span className="text-[12.5px] text-muted">
              <AgentTag agent={r.officer} />
            </span>
            <span className="font-data text-[11.5px] text-muted">{new Date(r.at).toLocaleDateString("fr-FR")}</span>
          </div>
        ))}
        <Pagination page={safePage} pages={pages} total={rows.length} onPage={setPage} label="entrées" />
      </div>

      {open?.kind === "casier" && (
        <CasierEntryModal entryId={open.id as Id<"casierEntries">} canDelete={can("casier.annul")} onClose={() => setOpen(null)} />
      )}
      {open?.kind === "citation" && (
        <ContraventionModal citationId={open.id as Id<"citations">} canDelete={can("contraventions.annul")} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
