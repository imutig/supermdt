import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { fmtMatricule } from "@/components/common/AgentTag";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/common/Skeleton";

const CORPS_LABEL: Record<string, string> = {
  ETAT_MAJOR: "État-Major",
  SUPERVISION: "Supervision",
  OPERATIONNEL: "Corps opérationnel",
};

export function Organigramme() {
  const org = useQuery(api.agents.organigramme);

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px] flex items-baseline gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Organigramme</h1>
        <span className="text-[12.5px] text-muted">Hiérarchie et trombinoscope de la station.</span>
      </div>

      {org === undefined && (
        <div className="flex flex-col gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} style={{ height: 120 }} />)}</div>
      )}
      {org && org.length === 0 && <EmptyState title="Organigramme vide" message="Aucun agent actif à afficher." />}

      <div className="mdt-stagger flex flex-col gap-[14px]">
        {(org ?? []).map((g, i) => {
          const color = g.color ?? "var(--accent)";
          return (
            <div key={g._id} className="relative">
              {i > 0 && <div className="mx-auto mb-[14px] h-[14px] w-px" style={{ background: "var(--border-strong)" }} />}
              <div className="overflow-hidden rounded-card border border-border bg-surface">
                <div className="flex items-center gap-[10px] border-b border-border px-4 py-[11px]" style={{ borderLeft: `3px solid ${color}` }}>
                  <span className="text-[14px] font-bold" style={{ color }}>{g.name}</span>
                  <span className="rounded-[5px] bg-surface-2 px-[7px] py-[2px] text-[10px] font-bold uppercase tracking-[0.06em] text-faint">{CORPS_LABEL[g.corps] ?? g.corps}</span>
                  <div className="flex-1" />
                  <span className="font-data text-[12px] text-muted">{g.agents.length}</span>
                </div>
                <div className="flex flex-wrap gap-[14px] p-4">
                  {g.agents.map((a) => (
                    <div key={a._id} className="mdt-lift flex w-[128px] flex-col items-center gap-[8px] rounded-sm border border-border bg-surface-2 px-[10px] py-[14px] text-center">
                      {a.avatarUrl ? (
                        <img src={a.avatarUrl} alt="" className="h-[62px] w-[62px] rounded-full border-2 object-cover" style={{ borderColor: color }} />
                      ) : (
                        <div className="flex h-[62px] w-[62px] items-center justify-center rounded-full border-2 bg-surface text-[18px] font-bold text-muted" style={{ borderColor: color }}>
                          {`${a.name.charAt(0)}${a.name.split(" ")[1]?.charAt(0) ?? ""}`.toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="text-[12.5px] font-semibold leading-tight">{a.name}</div>
                        <div className="font-data text-[11px] text-accent">{fmtMatricule(a.matricule) ?? "—"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
