import { useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useApp } from "@/providers/app-state";
import { useMe } from "@/hooks/useMe";
import { useService } from "@/hooks/useService";
import { quickActions } from "@/data/demo";
import { fmtMatricule } from "@/components/common/AgentTag";
import { ServiceToggle } from "@/components/common/ServiceToggle";
import { EmptyState } from "@/components/common/EmptyState";
import { Clover } from "@/components/common/Clover";
import { SkeletonRows } from "@/components/common/Skeleton";
import { BoloBanner } from "@/components/bolo/BoloBanner";

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}
function relTime(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

export function Dashboard() {
  const { openSearch, openCalc } = useApp();
  const { onDuty, toggle: toggleDuty, dutySince } = useService();
  const me = useMe();
  const { can } = useCan();
  const mandatsQ = useQuery(api.mandats.active, can("mandats.view") ? {} : "skip");
  const presenceQ = useQuery(api.agents.presence, can("effectif.view") ? {} : "skip");
  const feedQ = useQuery(api.activity.home, can("casier.view") ? {} : "skip");
  const upcomingQ = useQuery(api.calendar.upcoming, can("calendrier.view") ? {} : "skip");
  const mandats = mandatsQ ?? [];
  const presenceList = presenceQ ?? [];
  const feed = feedQ ?? [];
  const upcoming = upcomingQ ?? [];
  const navigate = useNavigate();

  const first = me?.agent.prenomRP ?? "";
  const gradeName = me?.agent.isOwner ? "Owner" : (me?.grade?.name ?? "-");
  const divLabel = me?.divisions.map((d) => d.name).join(" · ") || "-";
  const CORPS: Record<string, string> = {
    OPERATIONNEL: "Corps opérationnel",
    SUPERVISION: "Supervision",
    ETAT_MAJOR: "État-Major",
  };
  const corpsLabel = me?.agent.isOwner
    ? "accès total"
    : me?.grade
      ? (CORPS[me.grade.corps] ?? "")
      : "";
  const cards = [
    { label: "Grade", value: gradeName, sub: corpsLabel, danger: false },
    { label: "Divisions", value: String(me?.divisions.length ?? 0), sub: divLabel, danger: false },
    { label: "Mandats actifs", value: String(mandats.length), sub: "sur le serveur", danger: mandats.length > 0 },
    { label: "Agents en service", value: String(presenceList.length), sub: "temps réel", danger: false },
  ];

  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const todayLabel = today.charAt(0).toUpperCase() + today.slice(1);

  const quickHandlers = [openSearch, openSearch, () => openCalc(), openSearch];

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px] flex items-baseline justify-between">
        <div>
          <h1 className="m-0 text-[21px] font-bold tracking-tight">Bonjour, {first}.</h1>
          <div className="mt-[3px] text-[13px] text-muted">
            {todayLabel} · {gradeName} · {divLabel}
          </div>
        </div>
      </div>

      <BoloBanner />

      <div className="grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[1fr_316px]">
        {/* Left column */}
        <div className="mdt-stagger flex min-w-0 flex-col gap-[18px]">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border md:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="bg-surface px-[15px] py-[14px]">
                <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
                  {c.label}
                </div>
                <div
                  className="font-data text-[19px] font-bold tracking-tight"
                  style={{ color: c.danger ? "var(--danger)" : "var(--text)" }}
                >
                  {c.value}
                </div>
                <div className="mt-[2px] text-[11px] text-muted">{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Mandats actifs (LIVE) */}
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <div className="flex items-center gap-[9px] border-b border-border px-4 py-[13px]">
              <span
                className="h-[7px] w-[7px] rounded-full"
                style={{ background: "#dc2626", animation: "mdtPulse 1.6s ease-in-out infinite" }}
              />
              <h2 className="m-0 text-[13.5px] font-bold">Mandats actifs</h2>
              <span className="text-[11px] text-faint">temps réel · qui est recherché</span>
              <div className="flex-1" />
              <span className="font-data text-[12px] font-semibold text-muted">{mandats.length}</span>
            </div>
            <div className="grid grid-cols-[1.4fr_1.7fr_.9fr_.7fr] gap-3 border-b border-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
              <span>Individu</span>
              <span>Motif</span>
              <span>Type</span>
              <span>Émis</span>
            </div>
            {mandatsQ === undefined && <div className="p-4"><SkeletonRows rows={3} /></div>}
            {mandatsQ !== undefined && mandats.length === 0 && (
              <EmptyState compact title="Aucun mandat actif" message="La chance est de votre côté aujourd'hui." />
            )}
            {mandats.map((m) => (
              <div
                key={m._id}
                onClick={() => navigate(`/citoyen/${m.citizenId}`)}
                className="grid cursor-pointer grid-cols-[1.4fr_1.7fr_.9fr_.7fr] gap-3 border-b border-border px-4 py-[11px] hover:bg-surface-2"
              >
                <div className="flex min-w-0 items-center gap-[10px]">
                  <div
                    className="h-[30px] w-[30px] flex-shrink-0 rounded-[7px]"
                    style={{
                      background:
                        "repeating-linear-gradient(135deg,var(--surface-2),var(--surface-2) 5px,var(--border) 5px,var(--border) 6px)",
                    }}
                  />
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold">
                    {m.citizenName}
                  </div>
                </div>
                <div className="self-center overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] text-muted">
                  {m.motif}
                </div>
                <div className="self-center">
                  <span
                    className="rounded-[5px] px-[7px] py-[2px] text-[10px] font-semibold"
                    style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                  >
                    {m.typeName}
                  </span>
                </div>
                <div className="self-center text-[11.5px] text-muted">{relTime(m.issuedAt)}</div>
              </div>
            ))}
          </div>

          {/* Activité récente : casier + rapports (§14) */}
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <div className="flex items-center gap-[9px] border-b border-border px-4 py-[13px]">
              <h2 className="m-0 text-[13.5px] font-bold">Activité récente</h2>
              <span className="text-[11px] text-faint">dernières entrées de casier &amp; rapports</span>
            </div>
            {feedQ === undefined && <div className="p-4"><SkeletonRows rows={4} /></div>}
            {feedQ !== undefined && feed.length === 0 && (
              <EmptyState compact title="Aucune activité récente" message="Les nouveaux casiers et rapports apparaîtront ici." />
            )}
            {feed.map((f) => (
              <div
                key={`${f.kind}-${f._id}`}
                onClick={() => navigate(f.kind === "casier" ? `/citoyen/${f.citizenId}` : `/rapport/${f.reportId}`)}
                className="flex cursor-pointer items-center gap-[13px] border-b border-border px-4 py-[12px] hover:bg-surface-2"
              >
                <Clover color={f.kind === "casier" ? "var(--danger)" : "var(--accent)"} size={13} />
                <span
                  className="h-fit rounded-[5px] px-[8px] py-[3px] text-[10px] font-bold uppercase tracking-[0.05em]"
                  style={
                    f.kind === "casier"
                      ? { background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }
                      : { background: "var(--accent-soft)", color: "var(--accent)" }
                  }
                >
                  {f.kind === "casier" ? "Casier" : "Rapport"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{f.title}</div>
                  <div className="truncate text-[12px] text-muted">{f.subtitle}</div>
                </div>
                <span className="font-data text-[11px] text-faint">{relTime(f.at)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="mdt-stagger flex flex-col gap-[18px]">
          {/* Service — interrupteur trèfle (élément 3) */}
          <div className="rounded-card border border-border bg-surface p-4">
            <div className="mb-[12px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
              Mon service
            </div>
            <div className="flex items-center gap-[10px]">
              <ServiceToggle onDuty={onDuty} onToggle={toggleDuty} />
              <div className="flex-1" />
              <span className="font-data text-[12px] text-muted">
                {onDuty && dutySince ? `depuis ${fmtTime(dutySince)}` : ""}
              </span>
            </div>
          </div>

          {/* Quick actions */}
          <div className="rounded-card border border-border bg-surface p-4">
            <div className="mb-[11px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
              Raccourcis
            </div>
            <div className="flex flex-col gap-2">
              {quickActions.map((q, i) => (
                <button
                  key={i}
                  onClick={quickHandlers[i]}
                  className="flex items-center gap-[11px] rounded-sm border border-border bg-surface-2 px-3 py-[10px] text-left hover:border-accent hover:bg-accent-soft"
                >
                  <span className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[6px] bg-accent-soft text-[14px] font-bold text-accent">
                    {q.glyph}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">{q.label}</span>
                    <span className="block text-[11px] text-muted">{q.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Prochains évènements (calendrier) */}
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border px-4 py-[13px]">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">À venir</div>
              <div className="flex-1" />
              <span onClick={() => navigate("/calendrier")} className="cursor-pointer text-[11px] text-accent hover:underline">Calendrier</span>
            </div>
            {upcoming.length === 0 ? (
              <EmptyState compact title="Aucun évènement à venir" />
            ) : (
              upcoming.map((e) => (
                <div key={e._id} onClick={() => navigate("/calendrier")} className="flex cursor-pointer items-center gap-[11px] border-b border-border px-4 py-[10px] hover:bg-surface-2">
                  <div className="flex h-[34px] w-[38px] flex-shrink-0 flex-col items-center justify-center rounded-[7px] bg-accent-soft">
                    <span className="text-[13px] font-bold leading-none text-accent">{new Date(e.at).getUTCDate()}</span>
                    <span className="text-[8.5px] font-semibold uppercase text-accent">{new Date(e.at).toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" })}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">{e.title}</div>
                    <div className="truncate text-[11.5px] text-muted">{e.startTime ? `${e.startTime}${e.endTime ? ` - ${e.endTime}` : ""}` : ""}{e.lieu ? ` · ${e.lieu}` : ""}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Presence */}
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border px-4 py-[13px]">
              <span className="h-[6px] w-[6px] rounded-full" style={{ background: "#16a34a" }} />
              <div className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">En service</div>
              <div className="flex-1" />
              <span className="font-data text-[12px] text-muted">{presenceList.length}</span>
            </div>
            {presenceQ === undefined && <div className="p-4"><SkeletonRows rows={2} /></div>}
            {presenceQ !== undefined && presenceList.length === 0 && (
              <EmptyState compact title="Personne en service" />
            )}
            {presenceList.map((p) => (
              <div key={p._id} className="flex items-center gap-[10px] border-b border-border px-4 py-[9px]">
                <div className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border border-border bg-surface-2 text-[11px] font-bold text-muted">
                  {p.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] font-semibold">
                    {fmtMatricule(p.matricule) && (
                      <span className="font-data text-accent">{fmtMatricule(p.matricule)} </span>
                    )}
                    {p.name}
                  </div>
                  <div className="flex items-center gap-[5px] text-[11px] text-faint">
                    {p.gradeAbbrev && (
                      <span
                        className="rounded-[3px] border px-[4px] py-px text-[8.5px] font-bold uppercase tracking-[0.04em]"
                        style={p.gradeColor
                          ? { borderColor: p.gradeColor, color: p.gradeColor }
                          : { borderColor: "var(--border)", color: "var(--muted)" }}
                      >
                        {p.gradeAbbrev}
                      </span>
                    )}
                    <span className="truncate">{p.grade}</span>
                  </div>
                </div>
                <span
                  className="rounded-[5px] px-[7px] py-[2px] text-[9.5px] font-bold uppercase tracking-[0.06em]"
                  style={{ background: "rgba(22,163,74,0.12)", color: "var(--success)" }}
                >
                  EN SERVICE
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

