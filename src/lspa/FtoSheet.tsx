import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, CheckSquare, Square, Clock, Radio } from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { LoadingScreen } from "@/components/common/Loader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/common/Button";
import { fmtMatricule } from "@/components/common/AgentTag";
import { Modal } from "@/components/common/Modal";
import { useToast } from "@/providers/toast";

// Échelle de notation des critères (index stocké : 0 = Exécrable … 4 = Très Bien).
const LEVELS = [
  { v: 4, label: "Très Bien", color: "#3f9d4f" },
  { v: 3, label: "Bien", color: "#8fce93" },
  { v: 2, label: "Moyen", color: "#e6c84a" },
  { v: 1, label: "À revoir", color: "#e08a2e" },
  { v: 0, label: "Exécrable", color: "#d94040" },
];

type Item = { _id: string; section: string; label: string; kind: "SCALE" | "CHECK_TP" | "CHECK"; level: number | null; theorie: boolean; pratique: boolean; checked: boolean };

export function FtoSheet() {
  const { id } = useParams<{ id: string }>();
  const agentId = id as Id<"agents">;
  const data = useQuery(api.fto.sheet, { agentId });
  const setEntry = useMutation(api.fto.setEntry);
  const navigate = useNavigate();

  if (data === undefined) return <LoadingScreen label="Chargement de la fiche…" />;
  if (data === null) return <div className="p-[26px]"><EmptyState title="Fiche introuvable" action={<Button onClick={() => navigate("/lspa/fto")}>Retour</Button>} /></div>;
  if ("denied" in data) return <div className="p-[26px]"><EmptyState title="Accès restreint" message="Seuls le tuteur référent et l'encadrement de l'académie peuvent consulter cette fiche." action={<Button onClick={() => navigate("/lspa/fto")}>Retour</Button>} /></div>;

  const edit = data.canEdit;
  const scale = data.items.filter((i) => i.kind === "SCALE") as Item[];
  const checks = data.items.filter((i) => i.kind !== "SCALE") as Item[];
  const scaleBySection = groupBy(scale, (i) => i.section);
  const checkBySection = groupBy(checks, (i) => i.section);

  const save = (itemId: string, patch: Record<string, unknown>) => void setEntry({ agentId, itemId: itemId as Id<"ftoItems">, ...patch });

  return (
    <div className="mx-auto w-full max-w-[1280px] p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <button onClick={() => navigate("/lspa/fto")} className="mb-[14px] flex items-center gap-[6px] text-[12.5px] font-semibold text-muted hover:text-text"><ArrowLeft className="h-[14px] w-[14px]" /> Officiers 1</button>

      <Header agentId={agentId} data={data} />

      <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-2">
        {/* Colonne gauche : critères notés + rapports de patrouille */}
        <div className="flex flex-col gap-[16px]">
          <section className="overflow-hidden rounded-card border border-border bg-surface">
            <SectionHead>Critères</SectionHead>
            {Object.entries(scaleBySection).map(([section, items]) => (
              <div key={section}>
                <SubHead>{section}</SubHead>
                {items.map((it) => (
                  <div key={it._id} className="flex items-center gap-[10px] border-b border-border px-[14px] py-[8px] last:border-b-0">
                    <span className="min-w-0 flex-1 text-[12.5px]">{it.label}</span>
                    <div className="flex flex-shrink-0 overflow-hidden rounded-[6px] border border-border">
                      {LEVELS.map((lv) => {
                        const on = it.level === lv.v;
                        return (
                          <button
                            key={lv.v}
                            disabled={!edit}
                            onClick={() => save(it._id, { level: on ? null : lv.v })}
                            title={lv.label}
                            className="h-[26px] w-[26px] border-r border-border last:border-r-0 disabled:cursor-default"
                            style={{ background: on ? lv.color : `color-mix(in srgb, ${lv.color} 14%, transparent)`, opacity: on ? 1 : 0.5 }}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <div className="flex flex-wrap gap-[10px] px-[14px] py-[8px] text-[10.5px] text-muted">
              {LEVELS.map((l) => <span key={l.v} className="flex items-center gap-[4px]"><span className="h-[10px] w-[10px] rounded-[2px]" style={{ background: l.color }} /> {l.label}</span>)}
            </div>
          </section>

          <PatrolSection agentId={agentId} patrols={data.patrols} canEdit={edit} canAdd={data.canPatrol} />
        </div>

        {/* Colonne droite : checklists théorie/pratique + validations */}
        <div className="flex flex-col gap-[16px]">
          <section className="overflow-hidden rounded-card border border-border bg-surface">
            <SectionHead>Briefing & connaissances</SectionHead>
            {Object.entries(checkBySection).map(([section, items]) => {
              const hasTP = items.some((i) => i.kind === "CHECK_TP");
              return (
                <div key={section}>
                  <div className="flex items-center gap-2 bg-surface-2 px-[14px] py-[6px]">
                    <span className="flex-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint">{section}</span>
                    {hasTP && <><span className="w-[54px] text-center text-[10px] font-bold uppercase text-faint">Théorie</span><span className="w-[54px] text-center text-[10px] font-bold uppercase text-faint">Pratique</span></>}
                    {!hasTP && <span className="w-[54px] text-center text-[10px] font-bold uppercase text-faint">Validé</span>}
                  </div>
                  {items.map((it) => (
                    <div key={it._id} className="flex items-center gap-[8px] border-b border-border px-[14px] py-[7px] last:border-b-0">
                      <span className="min-w-0 flex-1 text-[12.5px]">{it.label}</span>
                      {it.kind === "CHECK_TP" ? (
                        <>
                          <Check on={it.theorie} disabled={!edit} onToggle={() => save(it._id, { theorie: !it.theorie })} />
                          <Check on={it.pratique} disabled={!edit} onToggle={() => save(it._id, { pratique: !it.pratique })} />
                        </>
                      ) : (
                        <div className="w-[54px] flex justify-center"><Check on={it.checked} disabled={!edit} onToggle={() => save(it._id, { checked: !it.checked })} /></div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </section>
        </div>
      </div>
    </div>
  );
}

function Check({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onToggle} className="flex w-[54px] justify-center disabled:cursor-default" style={{ color: on ? "var(--accent)" : "var(--faint)" }}>
      {on ? <CheckSquare className="h-[17px] w-[17px]" /> : <Square className="h-[17px] w-[17px]" />}
    </button>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return <div className="border-b border-border px-[15px] py-[10px] text-[12px] font-bold uppercase tracking-[0.09em]" style={{ background: "color-mix(in srgb, var(--accent) 8%, var(--surface))" }}>{children}</div>;
}
function SubHead({ children }: { children: React.ReactNode }) {
  return <div className="bg-surface-2 px-[14px] py-[6px] text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint">{children}</div>;
}

function groupBy<T>(arr: T[], key: (x: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const x of arr) (out[key(x)] ??= []).push(x);
  return out;
}

type SheetData = Exclude<NonNullable<ReturnType<typeof useQuery<typeof api.fto.sheet>>>, { denied: true }>;
function Header({ agentId, data }: { agentId: Id<"agents">; data: SheetData }) {
  const [editTutor, setEditTutor] = useState(false);
  const a = data.agent;
  return (
    <div className="mb-[16px] flex flex-wrap items-center gap-4 rounded-card border border-border bg-surface p-[16px_18px]">
      {a.avatarUrl ? <img src={a.avatarUrl} alt="" className="h-[56px] w-[56px] rounded-[12px] border border-border object-cover" /> : <div className="flex h-[56px] w-[56px] items-center justify-center rounded-[12px] bg-surface-2 text-[18px] font-bold text-muted">{a.prenomRP.charAt(0)}{a.nomRP.charAt(0)}</div>}
      <div className="min-w-0 flex-1">
        <h1 className="m-0 text-[20px] font-bold">{a.prenomRP} {a.nomRP}</h1>
        <div className="mt-[2px] text-[12.5px] text-muted">
          {fmtMatricule(a.matricule) && <span className="font-data text-accent">{fmtMatricule(a.matricule)} · </span>}Officier 1 en formation terrain
        </div>
      </div>
      <div className="flex flex-col items-end gap-[4px]">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Officier référent (FTO)</div>
        <button onClick={() => setEditTutor(true)} className="text-[13px] font-semibold hover:text-accent" title="Attribuer un tuteur">
          {data.tutor ? <>{fmtMatricule(data.tutor.matricule) ?? ""} {data.tutor.name}</> : <span className="text-faint">À attribuer</span>}
        </button>
        {data.startAt && <div className="text-[11px] text-faint">Début : {new Date(data.startAt).toLocaleDateString("fr-FR")}</div>}
      </div>
      {editTutor && <TutorModal agentId={agentId} currentStart={data.startAt} onClose={() => setEditTutor(false)} />}
    </div>
  );
}

function TutorModal({ agentId, currentStart, onClose }: { agentId: Id<"agents">; currentStart: number | null; onClose: () => void }) {
  const tutors = useQuery(api.fto.tutors);
  const setHeader = useMutation(api.fto.setHeader);
  const toast = useToast();
  const [tutorId, setTutorId] = useState("");
  const [date, setDate] = useState(currentStart ? new Date(currentStart).toISOString().slice(0, 10) : "");
  return (
    <Modal title="Encadrement" onClose={onClose} width={440}
      footer={<><Button variant="ghost" onClick={onClose}>Fermer</Button>
        <Button variant="primary" onClick={async () => {
          await toast.guard(setHeader({ agentId, ...(tutorId ? { tutorId: tutorId as Id<"agents"> } : {}), ...(date ? { startAt: new Date(date).getTime() } : {}) }), "Enregistrement impossible");
          onClose();
        }}>Enregistrer</Button></>}
    >
      <div className="flex flex-col gap-[12px]">
        <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Officier référent (FTO)</span>
          <select value={tutorId} onChange={(e) => setTutorId(e.target.value)} className="h-9 w-full rounded-sm border border-border bg-surface-2 px-2 text-[13px] outline-none focus:border-accent">
            <option value="">Ne pas changer</option>
            {(tutors ?? []).map((t) => <option key={t._id} value={t._id}>{fmtMatricule(t.matricule) ?? ""} {t.prenomRP} {t.nomRP}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Début de formation</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-full rounded-sm border border-border bg-surface-2 px-2 text-[13px] outline-none focus:border-accent" />
        </label>
      </div>
    </Modal>
  );
}

function PatrolSection({ agentId, patrols, canEdit, canAdd }: {
  agentId: Id<"agents">;
  patrols: { _id: string; startAt: number; endAt: number | null; lacunes: string; progres: string; general: string; authorName: string; mine: boolean }[];
  canEdit: boolean;
  canAdd: boolean;
}) {
  const remove = useMutation(api.fto.removePatrol);
  const [adding, setAdding] = useState(false);
  return (
    <section className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-[15px] py-[9px]" style={{ background: "color-mix(in srgb, var(--accent) 8%, var(--surface))" }}>
        <Radio className="h-[14px] w-[14px] text-accent" />
        <span className="flex-1 text-[12px] font-bold uppercase tracking-[0.09em]">Rapports de patrouille</span>
        {canAdd && <Button onClick={() => setAdding(true)} className="!py-[4px] !text-[11.5px]"><Plus className="h-[13px] w-[13px]" /> Ajouter</Button>}
      </div>
      {patrols.length === 0 ? (
        <div className="px-[15px] py-[16px] text-center text-[12px] text-faint">Aucune patrouille enregistrée.</div>
      ) : patrols.map((p) => (
        <div key={p._id} className="border-b border-border px-[15px] py-[11px] last:border-b-0">
          <div className="mb-[5px] flex items-center gap-[8px] text-[12px]">
            <Clock className="h-[12px] w-[12px] text-faint" />
            <span className="font-semibold">{new Date(p.startAt).toLocaleDateString("fr-FR")} · {new Date(p.startAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}{p.endAt ? ` – ${new Date(p.endAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
            <span className="text-faint">· {p.authorName}</span>
            <div className="flex-1" />
            {(p.mine || canEdit) && <button onClick={() => void remove({ patrolId: p._id as Id<"ftoPatrols"> })} className="text-faint hover:text-danger"><Trash2 className="h-[12px] w-[12px]" /></button>}
          </div>
          {p.lacunes && <PatrolLine label="Lacunes" value={p.lacunes} color="var(--danger)" />}
          {p.progres && <PatrolLine label="Progrès" value={p.progres} color="var(--accent)" />}
          {p.general && <PatrolLine label="Rapport général" value={p.general} color="var(--muted)" />}
        </div>
      ))}
      {adding && <PatrolModal agentId={agentId} onClose={() => setAdding(false)} />}
    </section>
  );
}

function PatrolLine({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="mt-[3px] text-[12.5px]"><span className="font-semibold" style={{ color }}>{label} : </span><span className="whitespace-pre-wrap text-muted">{value}</span></div>;
}

function PatrolModal({ agentId, onClose }: { agentId: Id<"agents">; onClose: () => void }) {
  const add = useMutation(api.fto.addPatrol);
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [lacunes, setLacunes] = useState("");
  const [progres, setProgres] = useState("");
  const [general, setGeneral] = useState("");
  const [busy, setBusy] = useState(false);
  const F = "h-9 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";

  function ts(d: string, t: string): number | undefined {
    if (!d) return undefined;
    return new Date(`${d}T${t || "00:00"}`).getTime();
  }

  return (
    <Modal title="Rapport de patrouille" icon={<Radio className="h-[17px] w-[17px]" />} onClose={onClose} width={520}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="primary" loading={busy} disabled={!date} onClick={async () => {
          setBusy(true);
          const r = await toast.guard(add({ agentId, startAt: ts(date, start)!, endAt: ts(date, end), lacunes, progres, general }), "Enregistrement impossible");
          setBusy(false);
          if (r !== undefined) onClose();
        }}>Enregistrer</Button></>}
    >
      <div className="flex flex-col gap-[12px]">
        <div className="grid grid-cols-3 gap-[8px]">
          <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={F} /></label>
          <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Début</span><input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={F} /></label>
          <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Fin</span><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={F} /></label>
        </div>
        <Field label="Lacunes"><textarea value={lacunes} onChange={(e) => setLacunes(e.target.value)} rows={2} className="w-full rounded-sm border border-border bg-surface-2 p-3 text-[13px] outline-none focus:border-accent" /></Field>
        <Field label="Progrès"><textarea value={progres} onChange={(e) => setProgres(e.target.value)} rows={2} className="w-full rounded-sm border border-border bg-surface-2 p-3 text-[13px] outline-none focus:border-accent" /></Field>
        <Field label="Rapport général"><textarea value={general} onChange={(e) => setGeneral(e.target.value)} rows={3} className="w-full rounded-sm border border-border bg-surface-2 p-3 text-[13px] outline-none focus:border-accent" /></Field>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">{label}</span>{children}</label>;
}
