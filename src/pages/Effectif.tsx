import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { MessagesSquare, Search, X } from "lucide-react";
import { api, type Id } from "@/lib/api";
import { AgentModal } from "@/components/effectif/AgentModal";
import { DiscordAccounts } from "@/components/effectif/DiscordAccounts";
import { fmtMatricule } from "@/components/common/AgentTag";
import { fmtAnciennete } from "@/lib/anciennete";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { useCan } from "@/hooks/useCan";

type StatusFilter = "all" | "onduty" | "offduty" | "absent";

export function Effectif() {
  const roster = useQuery(api.agents.roster);
  const { can } = useCan();
  const [openAgent, setOpenAgent] = useState<Id<"agents"> | null>(null);
  const [discordOpen, setDiscordOpen] = useState(false);

  const [q, setQ] = useState("");
  const [gradeF, setGradeF] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  // Grades présents dans l'effectif, du plus élevé au plus bas.
  const gradeOpts = useMemo(
    () => [...new Map((roster ?? []).filter((a) => a.grade).map((a) => [a.grade as string, a.gradePosition])).entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([g]) => g),
    [roster],
  );

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (roster ?? []).filter((a) => {
      if (t && !`${a.prenomRP} ${a.nomRP} ${fmtMatricule(a.matricule) ?? ""} ${a.matricule ?? ""}`.toLowerCase().includes(t)) return false;
      if (gradeF && (a.grade ?? "") !== gradeF) return false;
      if (status === "onduty" && !(a.onDuty && !a.absent)) return false;
      if (status === "offduty" && (a.onDuty || a.absent)) return false;
      if (status === "absent" && !a.absent) return false;
      return true;
    });
  }, [roster, q, gradeF, status]);

  const hasFilters = !!q.trim() || !!gradeF || status !== "all";

  const STATUS: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "Tous" },
    { key: "onduty", label: "En service" },
    { key: "offduty", label: "Hors service" },
    { key: "absent", label: "Absents" },
  ];

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[16px] flex items-start gap-3">
        <div className="flex-1">
          <h1 className="m-0 text-[21px] font-bold tracking-tight">Effectif</h1>
          <div className="mt-[3px] text-[13px] text-muted">
            {roster
              ? hasFilters
                ? `${filtered.length} / ${roster.length} agent${roster.length > 1 ? "s" : ""}`
                : `${roster.length} agent${roster.length > 1 ? "s" : ""} actif${roster.length > 1 ? "s" : ""}`
              : "…"}
          </div>
        </div>
        {can("invites.manage") && (
          <button
            onClick={() => setDiscordOpen(true)}
            className="mdt-press flex items-center gap-[7px] rounded-sm border border-border bg-surface-2 px-[13px] py-[9px] text-[12.5px] font-semibold text-muted hover:border-border-strong hover:text-text"
          >
            <MessagesSquare className="h-[15px] w-[15px]" /> Comptes Discord
          </button>
        )}
      </div>

      {/* Recherche & filtres */}
      <div className="mb-[14px] flex flex-wrap items-center gap-2">
        <div className="flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-sm border border-border bg-surface-2 px-3">
          <Search className="h-[15px] w-[15px] text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un agent (nom, matricule)…"
            className="h-full flex-1 bg-transparent text-[13px] outline-none"
          />
          {q && <button onClick={() => setQ("")} className="text-faint hover:text-text"><X className="h-[14px] w-[14px]" /></button>}
        </div>

        <select value={gradeF} onChange={(e) => setGradeF(e.target.value)} className="h-9 rounded-sm border border-border bg-surface-2 px-2 text-[12.5px] outline-none focus:border-accent">
          <option value="">Tous les grades</option>
          {gradeOpts.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>

        <div className="flex h-9 items-center gap-[2px] rounded-sm border border-border bg-surface-2 p-[3px]">
          {STATUS.map((s) => (
            <button
              key={s.key}
              onClick={() => setStatus(s.key)}
              className="rounded-[5px] px-[10px] py-[5px] text-[12px] font-semibold hover:bg-surface"
              style={status === s.key ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {hasFilters && (
          <button onClick={() => { setQ(""); setGradeF(""); setStatus("all"); }} className="flex h-9 items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-[11px] text-[12px] font-semibold text-muted hover:border-border-strong hover:text-text">
            <X className="h-[14px] w-[14px]" /> Réinitialiser
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        {/* Scroll horizontal sur petit écran : en-tête et lignes partagent le même min-w. */}
        <div className="overflow-x-auto">
        <div className="min-w-[900px]">
        <div className="grid grid-cols-[2fr_.8fr_1.4fr_.7fr_.7fr_.9fr_.8fr] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
          <span>Agent</span>
          <span>N° de badge</span>
          <span>Grade</span>
          <span>Divisions</span>
          <span>Formations</span>
          <span>Ancienneté</span>
          <span>Service</span>
        </div>
        {roster === undefined && <div className="p-4"><SkeletonRows rows={6} /></div>}
        {roster && roster.length === 0 && <EmptyState title="Aucun agent actif" message="L'effectif de la station apparaîtra ici." />}
        {roster && roster.length > 0 && filtered.length === 0 && <EmptyState title="Aucun résultat" message="Aucun agent ne correspond à la recherche ou aux filtres." />}
        {filtered.map((a) => (
          <div
            key={a._id}
            onClick={() => setOpenAgent(a._id)}
            className="grid cursor-pointer grid-cols-[2fr_.8fr_1.4fr_.7fr_.7fr_.9fr_.8fr] items-center gap-3 border-b border-border px-4 py-3 hover:bg-surface-2"
            style={a.suspended ? { background: "color-mix(in srgb, var(--danger) 9%, transparent)" } : a.absent ? { background: "color-mix(in srgb, var(--warning) 7%, transparent)" } : undefined}
          >
            <div className="flex items-center gap-[10px]">
              <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] border border-border bg-surface-2 text-[11px] font-bold text-muted">
                {`${a.prenomRP.charAt(0)}${a.nomRP.charAt(0)}`.toUpperCase()}
              </div>
              <span className="text-[13px] font-semibold">
                {a.prenomRP} {a.nomRP}
              </span>
            </div>
            <span className="font-data text-[13px] text-accent">{fmtMatricule(a.matricule) ?? "-"}</span>
            <span className="text-[13px]">{a.grade ?? "-"}</span>
            <span className="text-[13px] text-muted">{a.divisionCount}</span>
            <span className="text-[13px] text-muted">{a.qualifications || "-"}</span>
            <span className="text-[12.5px] text-muted">{fmtAnciennete(a.dateEntree)}</span>
            <span>
              {a.suspended ? (
                <span
                  className="inline-flex items-center gap-[6px] rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold"
                  style={{ background: "color-mix(in srgb, var(--danger) 16%, transparent)", color: "var(--danger)" }}
                  title={a.suspendedUntil ? `Fin le ${new Date(a.suspendedUntil).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}` : "Jusqu'à nouvel ordre"}
                >
                  <span className="h-[6px] w-[6px] rounded-full" style={{ background: "var(--danger)" }} />
                  Mis à pied
                </span>
              ) : a.absent ? (
                <span
                  className="inline-flex items-center gap-[6px] rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold"
                  style={{ background: "color-mix(in srgb, var(--warning) 16%, transparent)", color: "var(--warning)" }}
                >
                  <span className="h-[6px] w-[6px] rounded-full" style={{ background: "var(--warning)" }} />
                  Absent
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-[6px] rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold"
                  style={
                    a.onDuty
                      ? { background: "rgba(22,163,74,0.12)", color: "var(--success)" }
                      : { background: "var(--surface-2)", color: "var(--muted)" }
                  }
                >
                  <span className="h-[6px] w-[6px] rounded-full" style={{ background: a.onDuty ? "var(--success)" : "var(--faint)" }} />
                  {a.onDuty ? "En service" : "Hors service"}
                </span>
              )}
            </span>
          </div>
        ))}
        </div>
        </div>
      </div>

      {openAgent && <AgentModal agentId={openAgent} onClose={() => setOpenAgent(null)} />}
      {discordOpen && <DiscordAccounts onClose={() => setDiscordOpen(false)} />}
    </div>
  );
}
