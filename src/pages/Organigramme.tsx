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

// Au-delà de ce nombre par échelon, on abandonne les branches individuelles (qui
// ne tiennent pas sur une ligne) pour une galerie reliée : reste un trombinoscope.
const BRANCH_MAX = 7;

export function Organigramme() {
  const org = useQuery(api.agents.organigramme) as Grade[] | undefined;

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px] flex items-baseline gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Organigramme</h1>
        <span className="text-[12.5px] text-muted">Chaîne de commandement et trombinoscope de la station.</span>
      </div>

      {org === undefined && (
        <div className="flex flex-col items-center gap-6">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} style={{ height: 150, width: 460, maxWidth: "100%" }} />)}</div>
      )}
      {org && org.length === 0 && <EmptyState title="Organigramme vide" message="Aucun agent actif à afficher." />}

      {org && org.length > 0 && (
        <div className="overflow-x-auto pb-4">
          <div className="mdt-stagger mx-auto flex w-fit min-w-full flex-col items-center">
            {org.map((g, i) => {
              const color = g.color ?? "var(--accent)";
              const corpsChanged = i === 0 || g.corps !== org[i - 1].corps;
              const branch = i > 0 && g.agents.length <= BRANCH_MAX;
              return (
                <Fragment key={g._id}>
                  {/* Trait de liaison vertical vers l'échelon précédent */}
                  {i > 0 && <div className="h-[26px] w-px" style={{ background: "var(--border-strong)" }} />}

                  {corpsChanged && (
                    <div className="mb-[10px] flex items-center gap-[10px]">
                      <span className="h-px w-[24px]" style={{ background: "var(--border)" }} />
                      <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-faint">{CORPS_LABEL[g.corps] ?? g.corps}</span>
                      <span className="h-px w-[24px]" style={{ background: "var(--border)" }} />
                    </div>
                  )}

                  {/* Étiquette du grade */}
                  <div className="mb-[2px] flex items-center gap-[8px] rounded-full border border-border bg-surface px-[13px] py-[5px]" style={{ borderTop: `2px solid ${color}` }}>
                    <span className="text-[12.5px] font-bold tracking-tight" style={{ color }}>{g.name}</span>
                    <span className="font-data text-[11px] font-bold" style={{ color }}>{g.agents.length}</span>
                  </div>

                  {branch ? (
                    // Échelon branché : tronc central -> rail horizontal + tige par personne.
                    <>
                    <div className="h-[16px] w-px" style={{ background: "var(--border-strong)" }} />
                    <div className="relative inline-flex flex-nowrap justify-center gap-[22px] border-t pt-[24px]" style={{ borderColor: "var(--border-strong)" }}>
                      {g.agents.map((a) => (
                        <div key={a._id} className="relative">
                          <span className="absolute left-1/2 top-0 h-[24px] w-px -translate-x-1/2 -translate-y-[24px]" style={{ background: "var(--border-strong)" }} />
                          <PersonCard a={a} color={color} grade={g.name} />
                        </div>
                      ))}
                    </div>
                    </>
                  ) : (
                    // Échelon large : galerie reliée (trombinoscope).
                    <>
                      {i > 0 && <div className="h-[14px] w-px" style={{ background: "var(--border-strong)" }} />}
                      <div className="flex max-w-[980px] flex-wrap justify-center gap-[18px] rounded-card border border-border p-[18px]" style={{ background: "color-mix(in srgb, var(--surface-2) 45%, transparent)" }}>
                        {g.agents.map((a) => <PersonCard key={a._id} a={a} color={color} grade={g.name} />)}
                      </div>
                    </>
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PersonCard({ a, color, grade }: { a: Agent; color: string; grade: string }) {
  const initials = `${a.name.charAt(0)}${a.name.split(" ")[1]?.charAt(0) ?? ""}`.toUpperCase();
  return (
    <div className="mdt-lift flex w-[132px] flex-col items-center overflow-hidden rounded-[15px] border border-border bg-surface text-center shadow-[0_1px_0_rgba(0,0,0,.04)]" style={{ borderTop: `3px solid ${color}` }}>
      {/* Grande photo (trombinoscope) — pas un simple rond */}
      <div className="relative w-full" style={{ aspectRatio: "1 / 1.12" }}>
        {a.avatarUrl ? (
          <img src={a.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[30px] font-bold" style={{ background: `color-mix(in srgb, ${color} 12%, var(--surface-2))`, color }}>
            {initials || "—"}
          </div>
        )}
      </div>
      <div className="w-full px-[8px] py-[9px]">
        <div className="truncate text-[12.5px] font-semibold leading-tight" title={a.name}>{a.name}</div>
        <div className="mt-[2px] truncate text-[11px] font-semibold leading-tight" style={{ color }} title={grade}>{grade}</div>
        <div className="mt-[3px] font-data text-[10.5px] text-faint">{fmtMatricule(a.matricule) ?? "—"}</div>
      </div>
    </div>
  );
}
