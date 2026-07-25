import { useQuery } from "convex/react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, GraduationCap, ClipboardList } from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { LoadingScreen } from "@/components/common/Loader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/common/Button";
import { fmtAnciennete } from "@/lib/anciennete";

// Fiche d'un cadet. Base : identité, moyenne par catégorie de quiz, historique
// des épreuves. Destinée à s'enrichir (évaluations, notes d'encadrant).
export function LspaCadet() {
  const { id } = useParams<{ id: string }>();
  const data = useQuery(api.lspa.cadetSheet, { agentId: id as Id<"agents"> });
  const navigate = useNavigate();

  if (data === undefined) return <LoadingScreen label="Chargement de la fiche…" />;
  if (data === null) {
    return <div className="p-[26px]"><EmptyState title="Cadet introuvable" action={<Button onClick={() => navigate("/lspa/effectif")}>Retour à l'effectif</Button>} /></div>;
  }
  const a = data.agent;
  const initials = `${a.prenomRP.charAt(0)}${a.nomRP.charAt(0)}`.toUpperCase();

  return (
    <div className="mx-auto w-full max-w-[1000px] p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <button onClick={() => navigate("/lspa/effectif")} className="mb-[14px] flex items-center gap-[6px] text-[12.5px] font-semibold text-muted hover:text-text">
        <ArrowLeft className="h-[14px] w-[14px]" /> Effectif
      </button>

      {/* Identité */}
      <div className="mb-[18px] flex items-center gap-4 rounded-card border border-border bg-surface p-5">
        {a.avatarUrl ? (
          <img src={a.avatarUrl} alt="" className="h-[60px] w-[60px] rounded-[12px] border border-border object-cover" />
        ) : (
          <div className="flex h-[60px] w-[60px] items-center justify-center rounded-[12px] border border-border bg-surface-2 text-[20px] font-bold text-muted">{initials}</div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[21px] font-bold tracking-tight">{a.prenomRP} {a.nomRP}</h1>
          <div className="mt-1 flex items-center gap-[7px] text-[13px] text-muted">
            <GraduationCap className="h-[14px] w-[14px]" /> {a.grade ?? "Cadet"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">À l'académie depuis</div>
          <div className="mt-1 text-[15px] font-bold">{fmtAnciennete(a.dateEntree)}</div>
        </div>
      </div>

      {/* Moyennes par catégorie */}
      <h2 className="mb-[9px] text-[11px] font-bold uppercase tracking-[0.09em] text-faint">Niveau par catégorie</h2>
      {data.byCategory.length === 0 ? (
        <div className="mb-[18px] rounded-card border border-border bg-surface"><EmptyState compact title="Aucune note" message="Les moyennes apparaîtront après les premiers quiz publiés." /></div>
      ) : (
        <div className="mb-[18px] grid grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-3">
          {data.byCategory.map((c) => {
            const tint = c.color ?? (c.average >= 70 ? "var(--accent)" : c.average >= 40 ? "var(--warning)" : "var(--danger)");
            return (
              <div key={c.categoryId ?? "none"} className="rounded-card border border-border bg-surface p-[14px_16px]">
                <div className="mb-[8px] flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold">{c.name}</span>
                  <span className="font-data text-[16px] font-bold" style={{ color: tint }}>{c.average}%</span>
                </div>
                <div className="h-[6px] overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full" style={{ width: `${c.average}%`, background: tint }} />
                </div>
                <div className="mt-[6px] text-[11px] text-faint">{c.quizzes} quiz</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Historique */}
      <h2 className="mb-[9px] text-[11px] font-bold uppercase tracking-[0.09em] text-faint">Épreuves passées</h2>
      {data.history.length === 0 ? (
        <div className="rounded-card border border-border bg-surface"><EmptyState compact title="Aucune épreuve" message="Les résultats publiés apparaîtront ici." /></div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {data.history.map((h) => {
            const tint = h.passed === null ? "var(--muted)" : h.passed ? "var(--accent)" : "var(--danger)";
            return (
              <button
                key={h.sessionId}
                onClick={() => navigate(`/lspa/session/${h.sessionId}`)}
                className="flex w-full items-center gap-[12px] border-b border-border px-[16px] py-[11px] text-left last:border-b-0 hover:bg-surface-2"
              >
                <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[9px] bg-surface-2 text-faint"><ClipboardList className="h-[15px] w-[15px]" /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold">{h.title}</div>
                  {h.category && <div className="text-[11.5px] text-faint">{h.category}</div>}
                </div>
                <span className="font-data text-[12.5px] text-muted">{h.score}/{h.maxPoints}</span>
                <span className="w-[42px] flex-shrink-0 text-right font-data text-[14px] font-bold" style={{ color: tint }}>{h.pct}%</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
