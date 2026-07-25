import { useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { Radio, Hourglass, Square, CheckCircle2, Users, PenLine, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";

// Historique des sessions de quiz : tout se retrouve et se rouvre ici, une fois
// une session terminée elle ne disparaît pas. Réservé aux pilotes de session.
const STATUS: Record<string, { label: string; color: string; icon: typeof Radio }> = {
  LOBBY: { label: "Salle d'attente", color: "var(--warning)", icon: Hourglass },
  RUNNING: { label: "En cours", color: "var(--accent)", icon: Radio },
  CLOSED: { label: "Terminée", color: "var(--muted)", icon: Square },
  PUBLISHED: { label: "Publiée", color: "var(--accent)", icon: CheckCircle2 },
};

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function LspaHistory() {
  const rows = useQuery(api.quizSession.history);
  const navigate = useNavigate();

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px]">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Historique des sessions</h1>
        <div className="mt-[3px] text-[13px] text-muted">Toutes les épreuves passées : rouvrez une copie, reprenez une correction, revoyez les résultats.</div>
      </div>

      {rows === undefined ? (
        <div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={5} /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-card border border-border bg-surface">
          <EmptyState title="Aucune session" message="Les sessions que vous ouvrez apparaîtront ici." />
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {rows.map((r) => {
            const s = STATUS[r.status] ?? STATUS.CLOSED;
            const when = r.publishedAt ?? r.closedAt ?? r.openedAt;
            return (
              <button
                key={r._id}
                onClick={() => navigate(`/lspa/session/${r._id}`)}
                className="flex w-full items-center gap-[13px] border-b border-border px-[16px] py-[13px] text-left last:border-b-0 hover:bg-surface-2"
              >
                <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[10px]" style={{ background: `color-mix(in srgb, ${s.color} 14%, transparent)`, color: s.color }}>
                  <s.icon className="h-[16px] w-[16px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{r.title}</div>
                  <div className="mt-[2px] flex flex-wrap items-center gap-x-[12px] gap-y-[2px] text-[11.5px] text-muted">
                    <span>{fmtDate(when)}</span>
                    <span className="flex items-center gap-[4px]"><Users className="h-[12px] w-[12px]" /> {r.participants}</span>
                    {r.pendingGrading > 0 && <span className="flex items-center gap-[4px] font-semibold text-warning"><PenLine className="h-[12px] w-[12px]" /> {r.pendingGrading} à corriger</span>}
                  </div>
                </div>
                <span className="flex-shrink-0 rounded-[7px] px-[9px] py-[4px] text-[11px] font-bold uppercase tracking-[0.06em]" style={{ background: `color-mix(in srgb, ${s.color} 13%, transparent)`, color: s.color }}>{s.label}</span>
                <ChevronRight className="h-[16px] w-[16px] flex-shrink-0 text-faint" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
