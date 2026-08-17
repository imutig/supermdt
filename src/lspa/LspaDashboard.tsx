import { useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { GraduationCap, Users, ClipboardList, Radio, PenLine, ShieldCheck, ChevronRight, CheckSquare, Car } from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/hooks/useMe";
import { SkeletonRows } from "@/components/common/Skeleton";

// Tableau de bord de l'encadrement de l'académie : chiffres clés, ce qui demande
// une action, et les promotions / sessions en cours.
export function LspaDashboard() {
  const me = useMe();
  const d = useQuery(api.lspa.staffHome);
  const navigate = useNavigate();

  const tiles = [
    { label: "Cadets en formation", value: d?.cadets, icon: GraduationCap, to: "/lspa/effectif" },
    { label: "Encadrants", value: d?.encadrants, icon: Users, to: "/lspa/effectif" },
    { label: "Promotions ouvertes", value: d?.promosOuvertes, icon: GraduationCap, to: "/lspa/promotions" },
    { label: "Sessions en cours", value: d?.sessionsEnCours, icon: Radio, to: "/lspa/quiz" },
    { label: "Officiers en formation", value: d?.offi1, icon: ShieldCheck, to: "/lspa/fto" },
    { label: "En First Lincoln", value: d?.offi1, icon: Car, to: "/lspa/first-lincoln" },
  ];

  const todo = [
    d && d.copiesACorriger > 0 ? { label: `${d.copiesACorriger} copie${d.copiesACorriger > 1 ? "s" : ""} à corriger`, icon: PenLine, to: "/lspa/quiz" } : null,
  ].filter(Boolean) as { label: string; icon: typeof PenLine; to: string }[];

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px]">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Bonjour, {me?.agent.prenomRP ?? ""}.</h1>
        <div className="mt-[3px] text-[13px] text-muted">
          {me?.academyRank
            ? <>Académie · <span style={{ color: me.academyRank.color ?? "var(--accent)" }}>{me.academyRank.name}</span></>
            : "Los Santos Police Academy"}
        </div>
      </div>

      {d === undefined ? (
        <div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={4} /></div>
      ) : (
        <div className="flex flex-col gap-[18px]">
          {/* Compteurs */}
          <div className="mdt-stagger grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
            {tiles.map((t) => (
              <button
                key={t.label}
                onClick={t.to ? () => navigate(t.to!) : undefined}
                disabled={!t.to}
                className="bg-surface px-[15px] py-[14px] text-left enabled:hover:bg-surface-2 disabled:cursor-default"
              >
                <div className="mb-[7px] flex items-center gap-[7px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
                  <t.icon className="h-[13px] w-[13px]" /> {t.label}
                </div>
                <div className="font-data text-[22px] font-bold tracking-tight">{t.value ?? 0}</div>
              </button>
            ))}
          </div>

          {/* À traiter */}
          {todo.length > 0 && (
            <section>
              <h2 className="mb-[9px] text-[11px] font-bold uppercase tracking-[0.09em] text-faint">À traiter</h2>
              <div className="flex flex-col gap-[8px]">
                {todo.map((t) => (
                  <button key={t.label} onClick={() => navigate(t.to)} className="mdt-press flex items-center gap-[11px] rounded-card border p-[13px_16px] text-left" style={{ borderColor: "color-mix(in srgb, var(--warning) 40%, var(--border))", background: "color-mix(in srgb, var(--warning) 7%, var(--surface))" }}>
                    <span className="flex h-[32px] w-[32px] flex-shrink-0 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--warning) 15%, transparent)", color: "var(--warning)" }}><t.icon className="h-[16px] w-[16px]" /></span>
                    <span className="flex-1 text-[13.5px] font-semibold">{t.label}</span>
                    <ChevronRight className="h-[16px] w-[16px] text-faint" />
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-2">
            {/* Sessions en cours */}
            <Panel title="Sessions de quiz en cours" icon={<Radio className="h-[13px] w-[13px]" />}>
              {d.openSessions.length === 0 ? (
                <Empty>Aucune session ouverte.</Empty>
              ) : d.openSessions.map((s) => (
                <button key={s._id} onClick={() => navigate(`/lspa/session/${s._id}`)} className="flex w-full items-center gap-[10px] border-b border-border px-[15px] py-[10px] text-left last:border-b-0 hover:bg-surface-2">
                  <ClipboardList className="h-[15px] w-[15px] flex-shrink-0 text-faint" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{s.title}</span>
                  <span className="flex-shrink-0 rounded-[6px] px-[7px] py-[2px] text-[10.5px] font-bold uppercase text-accent" style={{ background: "var(--accent-soft)" }}>{s.status === "RUNNING" ? "En cours" : "Salle d'attente"}</span>
                </button>
              ))}
            </Panel>

            {/* Promotions ouvertes */}
            <Panel title="Promotions ouvertes" icon={<GraduationCap className="h-[13px] w-[13px]" />}>
              {d.promotions.length === 0 ? (
                <Empty>Aucune promotion ouverte.</Empty>
              ) : d.promotions.map((p) => (
                <button key={p._id} onClick={() => navigate(`/lspa/promotions/${p._id}`)} className="flex w-full items-center gap-[10px] border-b border-border px-[15px] py-[10px] text-left last:border-b-0 hover:bg-surface-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{p.name}</span>
                  <span className="flex items-center gap-[4px] text-[11.5px] text-muted"><Users className="h-[12px] w-[12px]" /> {p.cadets}</span>
                  <ChevronRight className="h-[15px] w-[15px] text-faint" />
                </button>
              ))}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="flex items-center gap-[8px] border-b border-border px-[15px] py-[10px] text-[11px] font-bold uppercase tracking-[0.09em] text-faint">{icon} {title}</div>
      {children}
    </section>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-[8px] px-[15px] py-[16px] text-[12.5px] text-faint"><CheckSquare className="h-[14px] w-[14px]" /> {children}</div>;
}
