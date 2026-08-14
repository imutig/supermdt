import type { LucideIcon } from "lucide-react";
import { Gavel, Receipt, FileWarning, FileText, MessageSquareQuote, Scale } from "lucide-react";

export type TimelineKind = "casier" | "contravention" | "mandat" | "rapport" | "deposition" | "plainte";

export type TimelineEvent = {
  id: string;
  at: number;
  kind: TimelineKind;
  title: string;
  sub?: string;
  badge?: string;
  muted?: boolean; // annulé / inactif → rendu atténué
  onClick?: () => void;
};

const META: Record<TimelineKind, { label: string; icon: LucideIcon; color: string }> = {
  casier: { label: "Casier", icon: Gavel, color: "var(--danger)" },
  contravention: { label: "Contravention", icon: Receipt, color: "var(--warning)" },
  mandat: { label: "Mandat", icon: FileWarning, color: "var(--critical)" },
  rapport: { label: "Rapport", icon: FileText, color: "var(--accent)" },
  deposition: { label: "Déposition", icon: MessageSquareQuote, color: "var(--accent)" },
  plainte: { label: "Plainte", icon: Scale, color: "var(--muted)" },
};

function fmtDate(at: number) {
  return new Date(at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

// Timeline unifiée du citoyen : agrège casier, contraventions, mandats, rapports,
// dépositions et plaintes en une seule frise chronologique (plus récent en haut).
export function CitizenTimeline({ events }: { events: TimelineEvent[] }) {
  const sorted = [...events].sort((a, b) => b.at - a.at);

  if (sorted.length === 0) {
    return (
      <div className="flex min-h-[180px] items-center justify-center text-[13px] text-faint">
        Aucun événement dans l'historique de ce citoyen.
      </div>
    );
  }

  return (
    <div className="relative py-[6px] pl-[8px] pr-[14px]">
      {/* Rail vertical */}
      <div className="absolute bottom-[14px] left-[22px] top-[14px] w-px bg-border" />
      <div className="flex flex-col">
        {sorted.map((ev) => {
          const m = META[ev.kind];
          const Icon = m.icon;
          return (
            <div
              key={`${ev.kind}-${ev.id}`}
              onClick={ev.onClick}
              className={`group relative flex gap-[14px] rounded-sm px-[6px] py-[9px] ${ev.onClick ? "cursor-pointer hover:bg-surface-2" : ""}`}
              style={ev.muted ? { opacity: 0.55 } : undefined}
            >
              <div
                className="z-[1] flex h-[28px] w-[28px] flex-shrink-0 items-center justify-center rounded-full border"
                style={{ background: "var(--elev)", borderColor: m.color, color: m.color }}
              >
                <Icon className="h-[14px] w-[14px]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[2px]">
                  <span className="text-[10px] font-bold uppercase tracking-[0.07em]" style={{ color: m.color }}>{m.label}</span>
                  <span className="truncate text-[13.5px] font-semibold">{ev.title}</span>
                  {ev.badge && (
                    <span className="rounded-[5px] px-[7px] py-[1px] text-[10.5px] font-semibold" style={{ background: "color-mix(in srgb, var(--muted) 14%, transparent)", color: "var(--muted)" }}>{ev.badge}</span>
                  )}
                  <div className="flex-1" />
                  <span className="font-data text-[11px] text-faint">{fmtDate(ev.at)}</span>
                </div>
                {ev.sub && <div className="mt-[3px] text-[12px] text-muted">{ev.sub}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
