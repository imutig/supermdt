import { useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { Radio, ClipboardList, Award, XCircle, Target, GraduationCap, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { SkeletonRows } from "@/components/common/Skeleton";
import { EmptyState } from "@/components/common/EmptyState";

// Accueil du cadet. Volontairement personnel : sa promo, ses épreuves, ses
// résultats. Rien de confidentiel (ni les autres cadets, ni l'encadrement).
export function LspaCadetHome() {
  const d = useQuery(api.lspa.cadetHome);
  const navigate = useNavigate();

  if (d === undefined) return <div className="p-[22px_26px]"><div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={4} /></div></div>;

  const activeSession = d.openSessions.find((s) => !s.submitted) ?? null;

  const tiles = [
    { label: "Épreuves passées", value: d.quizzesTaken, icon: ClipboardList },
    { label: "Moyenne", value: d.averagePct !== null ? `${d.averagePct}%` : "-", icon: Target },
    { label: "Réussites", value: d.passedCount, icon: Award },
  ];

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px]">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Bonjour, {d.prenomRP}.</h1>
        <div className="mt-[3px] flex items-center gap-[8px] text-[13px] text-muted">
          <GraduationCap className="h-[14px] w-[14px]" />
          {d.promo ? <>Promotion <span className="font-semibold text-text">{d.promo}</span></> : "Los Santos Police Academy"}
          {d.group && <span className="rounded-[5px] px-[7px] py-[2px] text-[11px] font-bold text-accent" style={{ background: "var(--accent-soft)" }}>Groupe {d.group}</span>}
        </div>
      </div>

      {/* Session ouverte : appel à l'action proéminent */}
      {activeSession && (
        <button
          onClick={() => navigate(`/lspa/session/${activeSession._id}`)}
          className="mdt-press mb-[18px] flex w-full items-center gap-[14px] rounded-card border p-[16px_18px] text-left"
          style={{ borderColor: "color-mix(in srgb, var(--accent) 45%, var(--border))", background: "var(--accent-soft)" }}
        >
          <span className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-[12px] bg-surface text-accent"><Radio className="h-[20px] w-[20px]" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-bold">{activeSession.title}</div>
            <div className="text-[12.5px] text-muted">
              {activeSession.status === "RUNNING" ? (activeSession.joined ? "Épreuve en cours - reprenez votre copie" : "Épreuve en cours") : activeSession.joined ? "En salle d'attente" : "Une session est ouverte, rejoignez-la"}
            </div>
          </div>
          <span className="flex items-center gap-[6px] text-[13px] font-bold text-accent">Rejoindre <ArrowRight className="h-[15px] w-[15px]" /></span>
        </button>
      )}

      {/* Stats perso */}
      <div className="mdt-stagger mb-[18px] grid grid-cols-3 gap-px overflow-hidden rounded-card border border-border bg-border">
        {tiles.map((t) => (
          <div key={t.label} className="bg-surface px-[15px] py-[14px]">
            <div className="mb-[7px] flex items-center gap-[7px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint"><t.icon className="h-[13px] w-[13px]" /> {t.label}</div>
            <div className="font-data text-[22px] font-bold tracking-tight">{t.value}</div>
          </div>
        ))}
      </div>

      {/* Derniers résultats */}
      <h2 className="mb-[9px] text-[11px] font-bold uppercase tracking-[0.09em] text-faint">Mes derniers résultats</h2>
      {d.recent.length === 0 ? (
        <div className="rounded-card border border-border bg-surface"><EmptyState compact title="Aucun résultat" message="Vos résultats de quiz apparaîtront ici après publication." /></div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {d.recent.map((r) => {
            const tint = r.passed === null ? "var(--muted)" : r.passed ? "var(--accent)" : "var(--danger)";
            return (
              <button key={r.sessionId} onClick={() => navigate(`/lspa/session/${r.sessionId}`)} className="flex w-full items-center gap-[11px] border-b border-border px-[16px] py-[11px] text-left last:border-b-0 hover:bg-surface-2">
                <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${tint} 14%, transparent)`, color: tint }}>
                  {r.passed === false ? <XCircle className="h-[15px] w-[15px]" /> : <Award className="h-[15px] w-[15px]" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{r.title}</span>
                <span className="font-data text-[12.5px] text-muted">{r.score}/{r.max}</span>
                <span className="w-[42px] flex-shrink-0 text-right font-data text-[14px] font-bold" style={{ color: tint }}>{r.pct}%</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-[16px]">
        <button onClick={() => navigate("/lspa/quiz")} className="text-[12.5px] font-semibold text-accent hover:underline">Voir tous mes quiz →</button>
      </div>

      {/* Ses collègues cadets */}
      {d.colleagues.length > 0 && (
        <div className="mt-[22px]">
          <h2 className="mb-[9px] text-[11px] font-bold uppercase tracking-[0.09em] text-faint">Ma promotion · {d.colleagues.length} cadet{d.colleagues.length > 1 ? "s" : ""}</h2>
          <div className="grid grid-cols-2 gap-[8px] sm:grid-cols-3 lg:grid-cols-4">
            {d.colleagues.map((c) => (
              <div
                key={c._id}
                className="flex items-center gap-[9px] rounded-card border px-[11px] py-[9px]"
                style={c.isMe ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : { borderColor: "var(--border)", background: "var(--surface)" }}
              >
                {c.avatarUrl ? (
                  <img src={c.avatarUrl} alt="" className="h-[30px] w-[30px] flex-shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-bold text-muted">{c.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-semibold">{c.name}{c.isMe && <span className="text-faint"> · vous</span>}</div>
                  {c.group && <div className="text-[10.5px] text-faint">Groupe {c.group}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
