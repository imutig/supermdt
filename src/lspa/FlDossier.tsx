import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Car, Clock, MapPin, Pencil, CheckSquare, Square } from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { LoadingScreen } from "@/components/common/Loader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { fmtMatricule } from "@/components/common/AgentTag";
import { useToast } from "@/providers/toast";
import { VERDICTS, verdictMeta } from "@/lspa/LspaFirstLincoln";

// Échelle de notation (index stocké : 0 = Exécrable … 4 = Très Bien).
const LEVELS = [
  { v: 4, label: "Très Bien", color: "#3f9d4f" },
  { v: 3, label: "Bien", color: "#8fce93" },
  { v: 2, label: "Moyen", color: "#e6c84a" },
  { v: 1, label: "À revoir", color: "#e08a2e" },
  { v: 0, label: "Exécrable", color: "#d94040" },
];

type Criterion = { _id: string; section: string; label: string; kind: "SCALE" | "CHECK" };
type Score = { criterionId: string; level: number | null; checked: boolean };
type Evaluation = {
  _id: string; evaluatorName: string; at: number; sector: string; vehicle: string;
  verdict: string; pointsForts: string; axes: string; conclusion: string; mine: boolean; scores: Score[];
};

export function FlDossier() {
  const { id } = useParams<{ id: string }>();
  const agentId = id as Id<"agents">;
  const data = useQuery(api.firstLincoln.dossier, { agentId });
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Evaluation | "new" | null>(null);

  if (data === undefined) return <LoadingScreen label="Chargement du dossier…" />;
  if (data === null) return <div className="p-[26px]"><EmptyState title="Dossier introuvable" action={<Button onClick={() => navigate("/lspa/first-lincoln")}>Retour</Button>} /></div>;
  if ("denied" in data) return <div className="p-[26px]"><EmptyState title="Accès restreint" message="Vous n'avez pas accès à First Lincoln." action={<Button onClick={() => navigate("/lspa/first-lincoln")}>Retour</Button>} /></div>;

  const a = data.agent;
  const critById = new Map(data.criteria.map((c) => [c._id, c]));

  return (
    <div className="mx-auto w-full max-w-[1100px] p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <button onClick={() => navigate("/lspa/first-lincoln")} className="mb-[14px] flex items-center gap-[6px] text-[12.5px] font-semibold text-muted hover:text-text"><ArrowLeft className="h-[14px] w-[14px]" /> First Lincoln</button>

      <div className="mb-[16px] flex flex-wrap items-center gap-4 rounded-card border border-border bg-surface p-[16px_18px]">
        {a.avatarUrl ? <img src={a.avatarUrl} alt="" className="h-[56px] w-[56px] rounded-[12px] border border-border object-cover" /> : <div className="flex h-[56px] w-[56px] items-center justify-center rounded-[12px] bg-surface-2 text-[18px] font-bold text-muted">{a.prenomRP.charAt(0)}{a.nomRP.charAt(0)}</div>}
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[20px] font-bold">{a.prenomRP} {a.nomRP}</h1>
          <div className="mt-[2px] text-[12.5px] text-muted">
            {fmtMatricule(a.matricule) && <span className="font-data text-accent">{fmtMatricule(a.matricule)} · </span>}{a.gradeName ?? "First Lincoln"}
          </div>
        </div>
        {data.canEvaluate && <Button variant="primary" onClick={() => setEditing("new")}><Plus className="h-[15px] w-[15px]" /> Nouvelle évaluation</Button>}
      </div>

      {data.criteria.length === 0 && (
        <div className="mb-[14px] rounded-card border px-[15px] py-[11px] text-[12.5px]" style={{ borderColor: "color-mix(in srgb, var(--warning) 40%, var(--border))", background: "color-mix(in srgb, var(--warning) 7%, var(--surface))", color: "var(--warning)" }}>
          Aucune grille d'évaluation configurée. Un membre de l'académie peut la définir via « Configurer » sur la liste First Lincoln.
        </div>
      )}

      {data.evaluations.length === 0 ? (
        <div className="rounded-card border border-border bg-surface"><EmptyState title="Aucune évaluation" message="Les évaluations First Lincoln de ce rookie apparaîtront ici." /></div>
      ) : (
        <div className="flex flex-col gap-[14px]">
          {(data.evaluations as Evaluation[]).map((e) => (
            <EvalCard key={e._id} e={e} critById={critById} canEdit={data.canEvaluate} canManage={data.canManage} onEdit={() => setEditing(e)} />
          ))}
        </div>
      )}

      {editing && <EvalModal agentId={agentId} criteria={data.criteria} evaluation={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EvalCard({ e, critById, canEdit, canManage, onEdit }: { e: Evaluation; critById: Map<string, Criterion>; canEdit: boolean; canManage: boolean; onEdit: () => void }) {
  const remove = useMutation(api.firstLincoln.removeEvaluation);
  const vm = verdictMeta(e.verdict);
  const scoreBySection: Record<string, { c: Criterion; s: Score }[]> = {};
  for (const s of e.scores) {
    const c = critById.get(s.criterionId);
    if (!c) continue;
    (scoreBySection[c.section] ??= []).push({ c, s });
  }

  return (
    <section className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-[10px] border-b border-border px-[15px] py-[11px]" style={{ background: "color-mix(in srgb, var(--accent) 7%, var(--surface))" }}>
        <span className="flex items-center gap-[6px] text-[13px] font-semibold"><Clock className="h-[13px] w-[13px] text-faint" />{new Date(e.at).toLocaleDateString("fr-FR")} · {new Date(e.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
        {e.sector && <span className="flex items-center gap-[5px] text-[12px] text-muted"><MapPin className="h-[12px] w-[12px]" />{e.sector}</span>}
        {e.vehicle && <span className="flex items-center gap-[5px] text-[12px] text-muted"><Car className="h-[12px] w-[12px]" />{e.vehicle}</span>}
        <span className="text-[12px] text-faint">· {e.evaluatorName}</span>
        <div className="flex-1" />
        <span className="rounded-[6px] px-[9px] py-[3px] text-[11px] font-bold uppercase" style={{ background: `color-mix(in srgb, ${vm.color} 14%, transparent)`, color: vm.color }}>{vm.label}</span>
        {(e.mine || canManage) && canEdit && <button onClick={onEdit} className="text-faint hover:text-text" title="Modifier"><Pencil className="h-[13px] w-[13px]" /></button>}
        {(e.mine || canManage) && <button onClick={() => void remove({ evaluationId: e._id as Id<"flEvaluations"> })} className="text-faint hover:text-danger" title="Supprimer"><Trash2 className="h-[13px] w-[13px]" /></button>}
      </div>

      {Object.entries(scoreBySection).length > 0 && (
        <div className="grid grid-cols-1 gap-x-[18px] px-[15px] py-[10px] sm:grid-cols-2">
          {Object.entries(scoreBySection).map(([section, rows]) => (
            <div key={section} className="py-[4px]">
              <div className="mb-[4px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">{section}</div>
              {rows.map(({ c, s }) => (
                <div key={c._id} className="flex items-center gap-[8px] py-[2px] text-[12.5px]">
                  <span className="min-w-0 flex-1 truncate text-muted">{c.label}</span>
                  {c.kind === "SCALE" ? (
                    s.level === null ? <span className="text-[11px] text-faint">—</span>
                      : <span className="rounded-[5px] px-[7px] py-[1px] text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${LEVELS.find((l) => l.v === s.level)?.color} 18%, transparent)`, color: LEVELS.find((l) => l.v === s.level)?.color }}>{LEVELS.find((l) => l.v === s.level)?.label}</span>
                  ) : (
                    s.checked ? <CheckSquare className="h-[15px] w-[15px] text-accent" /> : <Square className="h-[15px] w-[15px] text-faint" />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {(e.pointsForts || e.axes || e.conclusion) && (
        <div className="border-t border-border px-[15px] py-[10px]">
          {e.pointsForts && <Line label="Points forts" value={e.pointsForts} color="var(--success)" />}
          {e.axes && <Line label="Axes d'amélioration" value={e.axes} color="var(--warning)" />}
          {e.conclusion && <Line label="Conclusion" value={e.conclusion} color="var(--muted)" />}
        </div>
      )}
    </section>
  );
}

function Line({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="mt-[3px] text-[12.5px]"><span className="font-semibold" style={{ color }}>{label} : </span><span className="whitespace-pre-wrap text-muted">{value}</span></div>;
}

function EvalModal({ agentId, criteria, evaluation, onClose }: { agentId: Id<"agents">; criteria: Criterion[]; evaluation: Evaluation | null; onClose: () => void }) {
  const save = useMutation(api.firstLincoln.saveEvaluation);
  const toast = useToast();
  const initDate = evaluation ? new Date(evaluation.at) : new Date();
  const [date, setDate] = useState(toDateInput(initDate));
  const [time, setTime] = useState(evaluation ? toTimeInput(initDate) : "");
  const [sector, setSector] = useState(evaluation?.sector ?? "");
  const [vehicle, setVehicle] = useState(evaluation?.vehicle ?? "");
  const [verdict, setVerdict] = useState<string>(evaluation?.verdict ?? "EN_COURS");
  const [pointsForts, setPointsForts] = useState(evaluation?.pointsForts ?? "");
  const [axes, setAxes] = useState(evaluation?.axes ?? "");
  const [conclusion, setConclusion] = useState(evaluation?.conclusion ?? "");
  const [scores, setScores] = useState<Record<string, { level: number | null; checked: boolean }>>(() => {
    const m: Record<string, { level: number | null; checked: boolean }> = {};
    for (const c of criteria) {
      const s = evaluation?.scores.find((x) => x.criterionId === c._id);
      m[c._id] = { level: s?.level ?? null, checked: s?.checked ?? false };
    }
    return m;
  });
  const [busy, setBusy] = useState(false);
  const F = "h-9 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";

  const bySection: Record<string, Criterion[]> = {};
  for (const c of criteria) (bySection[c.section] ??= []).push(c);

  return (
    <Modal title={evaluation ? "Modifier l'évaluation" : "Évaluation First Lincoln"} icon={<Car className="h-[17px] w-[17px]" />} onClose={onClose} width={640}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="primary" loading={busy} disabled={!date} onClick={async () => {
          setBusy(true);
          const at = new Date(`${date}T${time || "00:00"}`).getTime();
          const scoreArr = criteria.map((c) => ({ criterionId: c._id as Id<"flCriteria">, level: scores[c._id]?.level ?? null, checked: !!scores[c._id]?.checked }));
          const r = await toast.guard(save({
            evaluationId: evaluation ? (evaluation._id as Id<"flEvaluations">) : undefined,
            agentId, at, sector, vehicle, verdict: verdict as "EN_COURS" | "VALIDE" | "A_REVOIR" | "ECHEC",
            pointsForts, axes, conclusion, scores: scoreArr,
          }), "Enregistrement impossible");
          setBusy(false);
          if (r !== undefined) onClose();
        }}>Enregistrer</Button></>}
    >
      <div className="flex flex-col gap-[14px]">
        <div className="grid grid-cols-2 gap-[8px] sm:grid-cols-4">
          <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={F} /></label>
          <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Heure</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={F} /></label>
          <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Secteur</span><input value={sector} onChange={(e) => setSector(e.target.value)} className={F} placeholder="Vespucci…" /></label>
          <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Véhicule</span><input value={vehicle} onChange={(e) => setVehicle(e.target.value)} className={F} placeholder="N° / modèle" /></label>
        </div>

        <div className="flex flex-col gap-[5px]">
          <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Verdict</span>
          <div className="grid grid-cols-4 gap-[6px]">
            {VERDICTS.map((vv) => {
              const on = verdict === vv.v;
              return (
                <button key={vv.v} onClick={() => setVerdict(vv.v)} className="rounded-[8px] border px-[8px] py-[7px] text-[12px] font-semibold"
                  style={on ? { background: `color-mix(in srgb, ${vv.color} 14%, transparent)`, borderColor: vv.color, color: vv.color } : { background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--muted)" }}>
                  {vv.label}
                </button>
              );
            })}
          </div>
        </div>

        {criteria.length > 0 && (
          <div className="flex flex-col gap-[10px]">
            {Object.entries(bySection).map(([section, crits]) => (
              <div key={section} className="overflow-hidden rounded-sm border border-border">
                <div className="bg-surface-2 px-[12px] py-[6px] text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint">{section}</div>
                {crits.map((c) => (
                  <div key={c._id} className="flex items-center gap-[10px] border-t border-border px-[12px] py-[7px]">
                    <span className="min-w-0 flex-1 text-[12.5px]">{c.label}</span>
                    {c.kind === "SCALE" ? (
                      <div className="flex flex-shrink-0 overflow-hidden rounded-[6px] border border-border">
                        {LEVELS.map((lv) => {
                          const on = scores[c._id]?.level === lv.v;
                          return (
                            <button key={lv.v} onClick={() => setScores((s) => ({ ...s, [c._id]: { ...s[c._id], level: on ? null : lv.v } }))} title={lv.label}
                              className="h-[26px] w-[26px] border-r border-border last:border-r-0" style={{ background: on ? lv.color : `color-mix(in srgb, ${lv.color} 14%, transparent)`, opacity: on ? 1 : 0.5 }} />
                          );
                        })}
                      </div>
                    ) : (
                      <button onClick={() => setScores((s) => ({ ...s, [c._id]: { ...s[c._id], checked: !s[c._id]?.checked } }))} className="flex-shrink-0" style={{ color: scores[c._id]?.checked ? "var(--accent)" : "var(--faint)" }}>
                        {scores[c._id]?.checked ? <CheckSquare className="h-[18px] w-[18px]" /> : <Square className="h-[18px] w-[18px]" />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
            <div className="flex flex-wrap gap-[10px] text-[10.5px] text-muted">
              {LEVELS.map((l) => <span key={l.v} className="flex items-center gap-[4px]"><span className="h-[10px] w-[10px] rounded-[2px]" style={{ background: l.color }} /> {l.label}</span>)}
            </div>
          </div>
        )}

        <Field label="Points forts"><textarea value={pointsForts} onChange={(e) => setPointsForts(e.target.value)} rows={2} className="w-full rounded-sm border border-border bg-surface-2 p-3 text-[13px] outline-none focus:border-accent" /></Field>
        <Field label="Axes d'amélioration"><textarea value={axes} onChange={(e) => setAxes(e.target.value)} rows={2} className="w-full rounded-sm border border-border bg-surface-2 p-3 text-[13px] outline-none focus:border-accent" /></Field>
        <Field label="Conclusion"><textarea value={conclusion} onChange={(e) => setConclusion(e.target.value)} rows={2} className="w-full rounded-sm border border-border bg-surface-2 p-3 text-[13px] outline-none focus:border-accent" /></Field>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">{label}</span>{children}</label>;
}

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
