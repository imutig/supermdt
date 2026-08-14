import { Fragment } from "react";
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

type Agent = { _id: string; name: string; matricule: number | null; avatarUrl: string | null };
type Grade = { _id: string; name: string; corps: string; color: string | null; agents: Agent[] };

// Trait de liaison vertical central : relie chaque échelon au suivant pour
// former la colonne hiérarchique de l'organigramme.
function Spine({ tall }: { tall?: boolean }) {
  return <div className="mx-auto w-px" style={{ height: tall ? 26 : 16, background: "var(--border-strong)" }} />;
}

export function Organigramme() {
  const org = useQuery(api.agents.organigramme) as Grade[] | undefined;

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px] flex items-baseline gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Organigramme</h1>
        <span className="text-[12.5px] text-muted">Chaîne de commandement de la station, du sommet à la base.</span>
      </div>

      {org === undefined && (
        <div className="flex flex-col items-center gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} style={{ height: 120, width: 420, maxWidth: "100%" }} />)}</div>
      )}
      {org && org.length === 0 && <EmptyState title="Organigramme vide" message="Aucun agent actif à afficher." />}

      {org && org.length > 0 && (
        <div className="mdt-stagger flex flex-col items-center">
          {org.map((g, i) => {
            const color = g.color ?? "var(--accent)";
            const corpsChanged = i === 0 || g.corps !== org[i - 1].corps;
            return (
              <Fragment key={g._id}>
                {i > 0 && <Spine tall />}

                {/* Séparateur de corps (État-Major / Supervision / Opérationnel) */}
                {corpsChanged && (
                  <div className="mb-[10px] mt-[2px] flex items-center gap-[10px]">
                    <span className="h-px w-[26px]" style={{ background: "var(--border)" }} />
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint">{CORPS_LABEL[g.corps] ?? g.corps}</span>
                    <span className="h-px w-[26px]" style={{ background: "var(--border)" }} />
                  </div>
                )}

                {/* Nœud d'échelon : intitulé du grade + effectif */}
                <div
                  className="flex items-center gap-[10px] rounded-card border bg-surface px-[16px] py-[10px] shadow-[0_1px_0_rgba(0,0,0,.04)]"
                  style={{ borderColor: "var(--border)", borderTop: `3px solid ${color}` }}
                >
                  <span className="text-[14px] font-bold tracking-tight" style={{ color }}>{g.name}</span>
                  <span
                    className="rounded-full px-[8px] py-[2px] font-data text-[11px] font-bold"
                    style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
                  >
                    {g.agents.length}
                  </span>
                </div>

                {/* Descente vers le trombinoscope de l'échelon */}
                <Spine />

                {/* Roster : membres de l'échelon, rattachés au nœud ci-dessus */}
                <div
                  className="flex max-w-[880px] flex-wrap justify-center gap-[12px] rounded-card border border-border bg-surface-2/40 px-[16px] py-[16px]"
                  style={{ background: "color-mix(in srgb, var(--surface-2) 55%, transparent)" }}
                >
                  {g.agents.map((a) => (
                    <div key={a._id} className="mdt-lift flex w-[120px] flex-col items-center gap-[8px] rounded-sm border border-border bg-surface px-[10px] py-[13px] text-center">
                      {a.avatarUrl ? (
                        <img src={a.avatarUrl} alt="" className="h-[58px] w-[58px] rounded-full border-2 object-cover" style={{ borderColor: color }} />
                      ) : (
                        <div className="flex h-[58px] w-[58px] items-center justify-center rounded-full border-2 bg-surface-2 text-[17px] font-bold text-muted" style={{ borderColor: color }}>
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
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
