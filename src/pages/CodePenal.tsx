import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { ChargeEditModal } from "@/components/penal/ChargeEditModal";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";

function fmtDur(seconds: number | null) {
  if (!seconds) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [h ? `${h}h` : "", m ? `${m}min` : ""].filter(Boolean).join(" ") || "-";
}
const SEV_COLOR: Record<string, string> = {
  Contravention: "var(--muted)",
  "Délit mineur": "var(--warning)",
  "Délit majeur": "var(--danger)",
  Crime: "var(--critical)",
};

export function CodePenal() {
  const { can } = useCan();
  const canManage = can("codepenal.create") || can("codepenal.edit") || can("codepenal.delete");
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [sevFilter, setSevFilter] = useState("");
  const [modal, setModal] = useState<{ id?: Id<"penalCharges"> } | null>(null);

  const charges = useQuery(api.penal.listCharges, { search: q.trim() || undefined });
  const categories = useQuery(api.penal.listCategories);
  const severities = useQuery(api.penal.listSeverities);

  const filtered = useMemo(() => {
    if (!charges) return undefined;
    return charges.filter(
      (c) =>
        (!catFilter || c.categoryName === catFilter) &&
        (!sevFilter || c.severityName === sevFilter),
    );
  }, [charges, catFilter, sevFilter]);

  const groups = useMemo(() => {
    if (!filtered) return [];
    if (q.trim()) return [{ label: "", list: filtered }];
    const byCat = new Map<string, typeof filtered>();
    for (const c of filtered) {
      if (!byCat.has(c.categoryName)) byCat.set(c.categoryName, []);
      byCat.get(c.categoryName)!.push(c);
    }
    return [...byCat.entries()].map(([label, list]) => ({ label, list }));
  }, [filtered, q]);

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[14px] flex items-center justify-between gap-4">
        <div>
          <h1 className="m-0 text-[21px] font-bold tracking-tight">Code pénal</h1>
          <div className="mt-[3px] text-[13px] text-muted">{filtered ? `${filtered.length} charges` : "..."}</div>
        </div>
        {canManage && (
          <button onClick={() => setModal({})} className="rounded-sm bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]">
            + Infraction
          </button>
        )}
      </div>

      {/* Recherche + filtres (§15) */}
      <div className="mb-[16px] flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher une infraction..."
          className="h-10 min-w-[280px] flex-1 rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent"
        />
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="h-10 rounded-sm border border-border bg-surface-2 px-2 text-[13px] outline-none focus:border-accent">
          <option value="">Toutes catégories</option>
          {(categories ?? []).map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
        </select>
        <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value)} className="h-10 rounded-sm border border-border bg-surface-2 px-2 text-[13px] outline-none focus:border-accent">
          <option value="">Toutes gravités</option>
          {(severities ?? []).map((s) => <option key={s._id} value={s.name}>{s.name}</option>)}
        </select>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-[.5fr_2fr_.8fr_.9fr_.7fr_1.3fr] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
          <span>Gravité</span><span>Infraction</span><span>Amende</span><span>Prison</span><span>DOJ</span><span>Sanctions</span>
        </div>
        {filtered === undefined && <div className="p-4"><SkeletonRows rows={8} /></div>}
        {filtered && filtered.length === 0 && <EmptyState title="Aucune infraction" message="Aucune charge ne correspond à ce filtre." />}
        {groups.map((g) => (
          <div key={g.label || "results"}>
            {g.label && (
              <div className="border-b border-border bg-surface-2 px-4 py-[7px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">{g.label}</div>
            )}
            {g.list.map((c) => (
              <div
                key={c._id}
                onClick={canManage ? () => setModal({ id: c._id }) : undefined}
                className={`grid grid-cols-[.5fr_2fr_.8fr_.9fr_.7fr_1.3fr] items-center gap-3 border-b border-border px-4 py-[10px] hover:bg-surface-2 ${canManage ? "cursor-pointer" : ""}`}
              >
                <span>
                  <span className="h-[8px] w-[8px] rounded-full" style={{ display: "inline-block", background: SEV_COLOR[c.severityName ?? ""] ?? "var(--muted)" }} title={c.severityName ?? ""} />
                </span>
                <span className="text-[13px] font-medium">
                  {c.name}
                  {(c.minParam != null || c.maxParam != null) && (
                    <span className="ml-2 font-data text-[10.5px] text-faint">
                      [{c.minParam ?? "-"}…{c.maxParam ?? "-"}]
                    </span>
                  )}
                </span>
                <span className="font-data text-[12px] text-muted">{c.fine.raw}</span>
                <span className="font-data text-[12px] text-muted">{fmtDur(c.jailSeconds)}</span>
                <span className="text-[12px]">{c.dojRequest ? "Oui" : "-"}</span>
                <span className="flex flex-wrap gap-1">
                  {c.sanctions.map((s) => (
                    <span key={s} className="rounded-[4px] bg-surface-2 px-[6px] py-[1px] text-[10.5px] text-faint">{s}</span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {modal && <ChargeEditModal chargeId={modal.id} onClose={() => setModal(null)} />}
    </div>
  );
}
