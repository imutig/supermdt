import { useState } from "react";
import { ChevronLeft, ChevronRight, X, Trash2, MapPin, Clock } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { EmptyState } from "@/components/common/EmptyState";

const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export function Calendrier() {
  const { can } = useCan();
  const canManage = can("calendrier.create") || can("calendrier.delete");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [modalDay, setModalDay] = useState<number | null>(null);

  const events = useQuery(api.calendar.month, { year, month }) ?? [];

  const firstDow = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // 0 = lundi
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsByDay = new Map<number, typeof events>();
  for (const e of events) {
    const d = new Date(e.at).getUTCDate();
    if (!eventsByDay.has(d)) eventsByDay.set(d, []);
    eventsByDay.get(d)!.push(e);
  }
  const isToday = (d: number) => now.getFullYear() === year && now.getMonth() === month && now.getDate() === d;

  function prev() { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); }
  function next() { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); }

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[16px] flex items-center gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Calendrier</h1>
        <div className="flex-1" />
        <button onClick={prev} className="flex h-[34px] w-[34px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><ChevronLeft className="h-4 w-4" /></button>
        <div className="min-w-[160px] text-center text-[15px] font-bold">{MONTHS[month]} {year}</div>
        <button onClick={next} className="flex h-[34px] w-[34px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><ChevronRight className="h-4 w-4" /></button>
        {canManage && (
          <button onClick={() => setModalDay(now.getMonth() === month && now.getFullYear() === year ? now.getDate() : 1)} className="ml-2 rounded-sm bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]">+ Évènement</button>
        )}
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-7 border-b border-border">
          {DOW.map((d) => <div key={d} className="px-3 py-[9px] text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => (
            <div
              key={i}
              onClick={() => d && canManage && setModalDay(d)}
              className={`min-h-[104px] border-b border-r border-border p-[6px] ${d && canManage ? "cursor-pointer hover:bg-surface-2" : ""}`}
              style={{ background: d ? undefined : "var(--surface-2)" }}
            >
              {d && (
                <>
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1 text-[12px] font-semibold"
                      style={isToday(d) ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}
                    >
                      {d}
                    </span>
                  </div>
                  <div className="flex flex-col gap-[3px]">
                    {(eventsByDay.get(d) ?? []).slice(0, 3).map((e) => (
                      <div key={e._id} className="truncate rounded-[4px] px-[5px] py-[2px] text-[10.5px] font-semibold" style={{ background: "var(--accent-soft)", color: "var(--accent)" }} title={e.title}>
                        {e.startTime ? `${e.startTime} ` : ""}{e.title}
                      </div>
                    ))}
                    {(eventsByDay.get(d) ?? []).length > 3 && (
                      <div className="px-[5px] text-[10px] text-faint">+{(eventsByDay.get(d) ?? []).length - 3}</div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {modalDay != null && (
        <DayModal
          year={year}
          month={month}
          day={modalDay}
          events={eventsByDay.get(modalDay) ?? []}
          canManage={canManage}
          onClose={() => setModalDay(null)}
        />
      )}
    </div>
  );
}

function DayModal({
  year, month, day, events, canManage, onClose,
}: {
  year: number; month: number; day: number;
  events: { _id: string; title: string; lieu: string | null; startTime: string | null; endTime: string | null }[];
  canManage: boolean; onClose: () => void;
}) {
  const create = useMutation(api.calendar.create);
  const remove = useMutation(api.calendar.remove);
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [lieu, setLieu] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!title.trim()) return;
    setBusy(true);
    const at = new Date(Date.UTC(year, month, day)).getTime();
    const r = await toast.guard(create({ at, title: title.trim(), lieu: lieu.trim() || undefined, startTime: start || undefined, endTime: end || undefined }), "Ajout impossible");
    setBusy(false);
    if (r !== undefined) { toast.success("Évènement ajouté."); setTitle(""); setLieu(""); setStart(""); setEnd(""); }
  }

  const F = "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";
  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[460px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">{String(day).padStart(2, "0")}/{String(month + 1).padStart(2, "0")}/{year}</h2>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-4">
          {events.length === 0 ? (
            <EmptyState compact title="Aucun évènement ce jour" />
          ) : (
            events.map((e) => (
              <div key={e._id} className="flex items-start gap-2 rounded-sm border border-border bg-surface-2 px-[12px] py-[10px]">
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">{e.title}</div>
                  <div className="mt-[3px] flex flex-wrap gap-3 text-[11.5px] text-muted">
                    {(e.startTime || e.endTime) && <span className="flex items-center gap-1"><Clock className="h-[12px] w-[12px]" />{e.startTime}{e.endTime ? ` - ${e.endTime}` : ""}</span>}
                    {e.lieu && <span className="flex items-center gap-1"><MapPin className="h-[12px] w-[12px]" />{e.lieu}</span>}
                  </div>
                </div>
                {canManage && (
                  <button onClick={() => toast.guard(remove({ id: e._id as Id<"calendarEvents"> }), "Suppression impossible")} className="text-faint hover:text-danger"><Trash2 className="h-[14px] w-[14px]" /></button>
                )}
              </div>
            ))
          )}

          {canManage && (
            <div className="mt-2 rounded-sm border border-border bg-surface-2 p-3">
              <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Nouvel évènement</div>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre" className={`${F} mb-2`} />
              <input value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="Lieu (optionnel)" className={`${F} mb-2`} />
              <div className="mb-2 grid grid-cols-2 gap-2">
                <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={`${F} font-data`} />
                <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={`${F} font-data`} />
              </div>
              <button onClick={add} disabled={busy || !title.trim()} className="w-full rounded-sm bg-accent px-4 py-[9px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "…" : "Ajouter"}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
