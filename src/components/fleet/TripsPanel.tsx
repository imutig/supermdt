import { useState } from "react";
import { X, ArrowRight, Clock } from "lucide-react";
import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { AgentTag } from "@/components/common/AgentTag";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";

function fmt(ts: number) {
  return new Date(ts).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function duration(from: number, to: number) {
  const m = Math.max(1, Math.round((to - from) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

// Historique des sorties de véhicules : qui a sorti quel véhicule, quand, et
// tous les agents ayant composé la patrouille.
export function TripsPanel() {
  const trips = useQuery(api.fleet.trips, {});
  const [sel, setSel] = useState<string | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-[.7fr_1.6fr_1.3fr_1.4fr_.8fr] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
          <span>Indicatif</span><span>Véhicule</span><span>Sorti par</span><span>Période</span><span>Agents</span>
        </div>
        {trips === undefined ? (
          <div className="p-4"><SkeletonRows rows={6} /></div>
        ) : trips.length === 0 ? (
          <EmptyState title="Aucune sortie" message="Les sorties apparaissent dès qu'une patrouille prend un véhicule LSPD." />
        ) : (
          trips.map((t) => (
            <div
              key={t._id}
              onClick={() => setSel(t._id)}
              className="grid cursor-pointer grid-cols-[.7fr_1.6fr_1.3fr_1.4fr_.8fr] items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-surface-2"
            >
              <span className="font-data text-[13px] font-bold" style={{ color: "var(--accent)" }}>13x{t.roofNumber.slice(-2).padStart(2, "0")}</span>
              <span className="truncate text-[12.5px]">{t.vehicleLabel}</span>
              <span className="truncate text-[12.5px] text-muted">{t.startedBy}</span>
              <span className="flex items-center gap-[6px] text-[11.5px] text-muted">
                <span className="font-data">{fmt(t.startedAt)}</span>
                {t.ongoing ? (
                  <span className="rounded-[5px] px-[6px] py-px text-[10px] font-bold uppercase" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>en cours</span>
                ) : (
                  <><ArrowRight className="h-[12px] w-[12px] flex-shrink-0" /><span className="font-data">{fmt(t.endedAt!)}</span></>
                )}
              </span>
              <span className="font-data text-[12.5px] text-muted">{t.memberCount}</span>
            </div>
          ))
        )}
      </div>

      {sel && <TripDetailModal tripId={sel as Id<"fleetTrips">} onClose={() => setSel(null)} />}
    </>
  );
}

function TripDetailModal({ tripId, onClose }: { tripId: Id<"fleetTrips">; onClose: () => void }) {
  const members = useQuery(api.fleet.tripMembers, { tripId });

  return (
    <div onClick={onClose} className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)" }}>
      <div onClick={(e) => e.stopPropagation()} className="mdt-pop flex max-h-[80vh] w-[520px] max-w-[94vw] flex-col rounded-card border border-border-strong bg-elev shadow-[0_24px_70px_rgba(0,0,0,.4)]">
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-5 py-4">
          <Clock className="h-[17px] w-[17px] text-accent" />
          <h2 className="m-0 flex-1 text-[15px] font-bold">Agents de la sortie</h2>
          <button onClick={onClose} className="flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {members === undefined ? (
            <SkeletonRows rows={4} />
          ) : members.length === 0 ? (
            <div className="py-6 text-center text-[12.5px] text-faint">Aucun agent enregistré.</div>
          ) : (
            <div className="flex flex-col gap-[8px]">
              <div className="mb-1 text-[11.5px] text-faint">
                {members.length} agent{members.length > 1 ? "s" : ""} passé{members.length > 1 ? "s" : ""} par cette patrouille.
              </div>
              {members.map((m) => (
                <div key={m._id} className="flex items-center gap-3 rounded-sm border border-border bg-surface-2 px-[12px] py-[9px]">
                  <span className="flex-1 text-[13px] font-semibold"><AgentTag agent={m} /></span>
                  <span className="text-[11.5px] text-muted">
                    <span className="font-data">{fmt(m.joinedAt)}</span>
                    {m.leftAt ? (
                      <> · parti <span className="font-data">{fmt(m.leftAt)}</span> · {duration(m.joinedAt, m.leftAt)}</>
                    ) : (
                      <span className="ml-1 rounded-[5px] px-[6px] py-px text-[10px] font-bold uppercase" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>présent</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
