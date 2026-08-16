import { useEffect, useState } from "react";
import { useMutation, useQuery, usePaginatedQuery } from "convex/react";
import {
  Plus, Settings, X, Trash2, ChevronUp, ChevronDown, MessageSquare, Dices, Info, ClipboardCheck, FileImage,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { useMe } from "@/hooks/useMe";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { useDialogs } from "@/components/detective/dialogs";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { LoadMore } from "@/components/common/Pagination";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { EntretienReport } from "./EntretienReport";

type Snap = { text: string; explanation?: string; note?: number };

// Note 1-5 -> fraction étalée (1 = 0 %, 5 = 100 %). Miroir du backend.
const noteFrac = (note?: number): number | null => (note ? (Math.min(5, Math.max(1, note)) - 1) / 4 : null);
function scoreOf(questions: Snap[], scenario?: Snap | null): number | null {
  const qf = questions.map((q) => noteFrac(q.note)).filter((x): x is number => x != null);
  const qAvg = qf.length ? qf.reduce((a, b) => a + b, 0) / qf.length : null;
  const sf = scenario ? noteFrac(scenario.note) : null;
  let f: number | null;
  if (qAvg != null && sf != null) f = qAvg * 0.75 + sf * 0.25;
  else if (qAvg != null) f = qAvg;
  else if (sf != null) f = sf;
  else f = null;
  return f == null ? null : Math.round(f * 100);
}
const scoreColor = (s: number | null) => (s == null ? "var(--muted)" : s >= 70 ? "var(--accent)" : s >= 40 ? "var(--warning)" : "var(--danger)");
const dt = (ts: number) => new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

export function LspaEntretiens() {
  const me = useMe();
  const { can } = useCan();
  const { results: list, status, loadMore } = usePaginatedQuery(api.interviews.page, {}, { initialNumItems: 30 });
  const loading = status === "LoadingFirstPage";
  const [selected, setSelected] = useState<Id<"interviews"> | null>(null);
  const [creating, setCreating] = useState(false);
  const [configuring, setConfiguring] = useState(false);

  if (me === undefined) return null;
  const access = !!me?.agent.isOwner || !!me?.academyRank || can("lspa.entretiens");
  if (!access) return <div className="p-[26px]"><EmptyState title="Accès restreint" message="Les entretiens sont réservés à l'encadrement de l'académie." /></div>;
  const canConfig = !!me?.agent.isOwner || !!me?.academyRank;

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[16px] flex items-end gap-3">
        <div className="flex-1">
          <h1 className="m-0 text-[21px] font-bold tracking-tight">Entretiens</h1>
          <div className="mt-[3px] text-[13px] text-muted">Les entretiens de recrutement, notés de 1 à 5 par l'instructeur.</div>
        </div>
        {canConfig && <Button onClick={() => setConfiguring(true)}><Settings className="h-[15px] w-[15px]" /> Configurer</Button>}
        <Button variant="primary" onClick={() => setCreating(true)}><Plus className="h-[15px] w-[15px]" /> Nouvel entretien</Button>
      </div>

      {loading ? (
        <div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={5} /></div>
      ) : list.length === 0 ? (
        <div className="rounded-card border border-border bg-surface"><EmptyState title="Aucun entretien" message="Crée un entretien pour commencer à noter un candidat." /></div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {list.map((it) => (
            <button key={it._id} onClick={() => setSelected(it._id as Id<"interviews">)} className="flex w-full items-center gap-[13px] border-b border-border px-[16px] py-[12px] text-left last:border-b-0 hover:bg-surface-2">
              <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-accent"><ClipboardCheck className="h-[16px] w-[16px]" /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{it.prenom} {it.nom}{it.dateNaissance ? <span className="ml-[6px] text-[12px] font-normal text-faint">{it.dateNaissance}</span> : null}</div>
                <div className="mt-[2px] text-[11.5px] text-muted">{it.questionCount} question(s){it.hasScenario ? " · mise en situation" : ""} · {it.createdByName} · {dt(it.createdAt)}</div>
              </div>
              <span className="flex-shrink-0 font-data text-[15px] font-bold" style={{ color: scoreColor(it.score) }}>{it.score != null ? `${it.score}%` : "-"}</span>
            </button>
          ))}
          <LoadMore status={status} onLoadMore={() => loadMore(30)} count={list.length} label="entretiens" />
        </div>
      )}

      {creating && <CreateModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setSelected(id); }} />}
      {configuring && <ConfigModal onClose={() => setConfiguring(false)} />}
      {selected && <InterviewPanel id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: Id<"interviews">) => void }) {
  const create = useMutation(api.interviews.create);
  const toast = useToast();
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [dob, setDob] = useState("");
  const [busy, setBusy] = useState(false);
  const F = "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13.5px] outline-none focus:border-accent";
  return (
    <Modal title="Nouvel entretien" icon={<ClipboardCheck className="h-[17px] w-[17px]" />} onClose={onClose} width={440}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="primary" loading={busy} disabled={!prenom.trim() || !nom.trim()} onClick={async () => {
          setBusy(true);
          const id = await toast.guard(create({ prenom: prenom.trim(), nom: nom.trim(), dateNaissance: dob.trim() || undefined }), "Création impossible");
          setBusy(false);
          if (id) onCreated(id as Id<"interviews">);
        }}>Créer et noter</Button>
      </>}
    >
      <div className="flex flex-col gap-[12px]">
        <div className="grid grid-cols-2 gap-[10px]">
          <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Prénom</span><input autoFocus value={prenom} onChange={(e) => setPrenom(e.target.value)} className={F} /></label>
          <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Nom</span><input value={nom} onChange={(e) => setNom(e.target.value)} className={F} /></label>
        </div>
        <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Date de naissance</span><input value={dob} onChange={(e) => setDob(e.target.value)} placeholder="JJ/MM/AAAA" className={F} /></label>
        <div className="text-[11.5px] text-faint">Les questions et une mise en situation tirée au hasard seront chargées depuis la banque.</div>
      </div>
    </Modal>
  );
}

// ---------- Panneau latéral (droite) : fiche d'entretien ----------
function InterviewPanel({ id, onClose }: { id: Id<"interviews">; onClose: () => void }) {
  const data = useQuery(api.interviews.get, { id });
  const save = useMutation(api.interviews.save);
  const remove = useMutation(api.interviews.remove);
  const toast = useToast();
  const { confirm } = useDialogs();
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [dob, setDob] = useState("");
  const [questions, setQuestions] = useState<Snap[]>([]);
  const [scenario, setScenario] = useState<Snap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(false);

  useEffect(() => {
    if (data && !loaded) {
      setPrenom(data.prenom); setNom(data.nom); setDob(data.dateNaissance ?? "");
      setQuestions(data.questions); setScenario(data.scenario); setLoaded(true);
    }
  }, [data, loaded]);

  const score = scoreOf(questions, scenario);
  const persist = async () => {
    setBusy(true);
    await toast.guard(save({ id, prenom: prenom.trim(), nom: nom.trim(), dateNaissance: dob.trim() || undefined, questions, scenario }), "Enregistrement impossible");
    setBusy(false);
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[600px] max-w-[96vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-surface-2 text-accent"><ClipboardCheck className="h-[19px] w-[19px]" /></span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold">Entretien - {prenom} {nom}</div>
            {data && <div className="text-[11.5px] text-muted">Par {data.createdByName} · {dt(data.createdAt)}</div>}
          </div>
          <div className="flex flex-col items-end">
            <span className="font-data text-[22px] font-bold leading-none" style={{ color: scoreColor(score) }}>{score != null ? `${score}%` : "-"}</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Score</span>
          </div>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>

        {data === undefined || !loaded ? (
          <div className="p-4"><SkeletonRows rows={6} /></div>
        ) : data === null ? (
          <div className="p-6"><EmptyState title="Entretien introuvable" /></div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto p-[18px]">
              {/* Identité candidat */}
              <div className="mb-[16px] grid grid-cols-3 gap-[8px]">
                <label className="flex flex-col gap-[4px]"><span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">Prénom</span><input value={prenom} onChange={(e) => setPrenom(e.target.value)} className="h-9 rounded-sm border border-border bg-surface-2 px-2 text-[13px] outline-none focus:border-accent" /></label>
                <label className="flex flex-col gap-[4px]"><span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">Nom</span><input value={nom} onChange={(e) => setNom(e.target.value)} className="h-9 rounded-sm border border-border bg-surface-2 px-2 text-[13px] outline-none focus:border-accent" /></label>
                <label className="flex flex-col gap-[4px]"><span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">Naissance</span><input value={dob} onChange={(e) => setDob(e.target.value)} className="h-9 rounded-sm border border-border bg-surface-2 px-2 text-[13px] outline-none focus:border-accent" /></label>
              </div>

              <SectionHead icon={<MessageSquare className="h-[13px] w-[13px]" />}>Questions ({questions.length})</SectionHead>
              {questions.length === 0 ? (
                <div className="mb-[14px] rounded-sm border border-dashed border-border px-3 py-[12px] text-center text-[12px] text-faint">Aucune question dans la banque. Configure-la d'abord.</div>
              ) : questions.map((q, i) => (
                <QuestionRow key={i} snap={q} onNote={(n) => setQuestions((prev) => prev.map((x, j) => (j === i ? { ...x, note: n } : x)))} />
              ))}

              <div className="mt-[8px]">
                <SectionHead icon={<Dices className="h-[13px] w-[13px]" />}>Mise en situation <span className="ml-[6px] rounded-[5px] bg-surface-2 px-[6px] py-[1px] text-[10px] font-bold text-faint">25% du score</span></SectionHead>
                {scenario ? (
                  <QuestionRow snap={scenario} onNote={(n) => setScenario((prev) => (prev ? { ...prev, note: n } : prev))} />
                ) : (
                  <div className="rounded-sm border border-dashed border-border px-3 py-[12px] text-center text-[12px] text-faint">Aucune mise en situation dans la banque.</div>
                )}
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center gap-2 border-t border-border px-[18px] py-3">
              <button
                onClick={async () => { if (await confirm({ title: "Supprimer cet entretien ?", message: "Il sera archivé.", danger: true, confirmLabel: "Supprimer" })) { await toast.guard(remove({ id }), "Suppression impossible"); onClose(); } }}
                className="flex h-[34px] w-[34px] items-center justify-center rounded-sm border border-border bg-surface-2 text-faint hover:text-danger" title="Supprimer"
              ><Trash2 className="h-[15px] w-[15px]" /></button>
              <div className="flex-1" />
              <Button variant="secondary" onClick={() => setReport(true)}><FileImage className="h-[15px] w-[15px]" /> Rapport (image)</Button>
              <Button variant="primary" loading={busy} onClick={persist}>Enregistrer</Button>
            </div>
          </>
        )}
      </div>

      {report && data && (
        <EntretienReport
          id={id} prenom={prenom} nom={nom} dob={dob}
          questions={questions} scenario={scenario} score={score}
          createdByName={data.createdByName} createdAt={data.createdAt}
          onClose={() => setReport(false)}
        />
      )}
    </div>
  );
}

function QuestionRow({ snap, onNote }: { snap: Snap; onNote: (n: number | undefined) => void }) {
  const [showExpl, setShowExpl] = useState(false);
  return (
    <div className="mb-[10px] rounded-card border border-border bg-surface p-[12px_13px]">
      <div className="mb-[8px] flex items-start gap-[8px]">
        <span className="min-w-0 flex-1 text-[13px] font-medium leading-[1.4]">{snap.text}</span>
        {snap.explanation && (
          <button onClick={() => setShowExpl((s) => !s)} title="Réponse attendue" className="flex-shrink-0 text-faint hover:text-accent"><Info className="h-[15px] w-[15px]" /></button>
        )}
      </div>
      {showExpl && snap.explanation && (
        <div className="mb-[9px] whitespace-pre-wrap rounded-sm bg-surface-2 p-[8px_10px] text-[12px] text-muted"><span className="font-semibold text-accent">Réponse attendue : </span>{snap.explanation}</div>
      )}
      <div className="flex items-center gap-[6px]">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = snap.note === n;
          return (
            <button key={n} onClick={() => onNote(on ? undefined : n)} className="mdt-press flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border font-data text-[13px] font-bold"
              style={{ borderColor: on ? "var(--accent)" : "var(--border)", background: on ? "var(--accent)" : "var(--surface-2)", color: on ? "#fff" : "var(--muted)" }}>{n}</button>
          );
        })}
        {snap.note != null && <span className="ml-[4px] text-[11.5px] text-faint">noté {snap.note}/5</span>}
      </div>
    </div>
  );
}

function SectionHead({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="mb-[9px] flex items-center gap-[6px] text-[11px] font-bold uppercase tracking-[0.08em] text-faint">{icon} {children}</div>;
}

// ---------- Configuration de la banque ----------
function ConfigModal({ onClose }: { onClose: () => void }) {
  const items = useQuery(api.interviews.items);
  const [tab, setTab] = useState<"QUESTION" | "SCENARIO">("QUESTION");
  const questions = (items ?? []).filter((i) => i.kind === "QUESTION");
  const scenarios = (items ?? []).filter((i) => i.kind === "SCENARIO");
  const rows = tab === "QUESTION" ? questions : scenarios;

  return (
    <Modal title="Banque d'entretien" icon={<Settings className="h-[17px] w-[17px]" />} onClose={onClose} width={640}
      footer={<Button variant="ghost" onClick={onClose}>Fermer</Button>}
    >
      <div className="mb-[12px] flex items-center gap-[6px]">
        <TabBtn on={tab === "QUESTION"} onClick={() => setTab("QUESTION")}>Questions ({questions.length})</TabBtn>
        <TabBtn on={tab === "SCENARIO"} onClick={() => setTab("SCENARIO")}>Mises en situation ({scenarios.length})</TabBtn>
      </div>
      {items === undefined ? <SkeletonRows rows={4} /> : (
        <div className="flex flex-col gap-[8px]">
          {rows.length === 0 && <div className="rounded-sm border border-dashed border-border px-3 py-[12px] text-center text-[12px] text-faint">Aucun élément. Ajoute-en un ci-dessous.</div>}
          {rows.map((it, idx) => <ConfigRow key={it._id} item={it} first={idx === 0} last={idx === rows.length - 1} />)}
          <AddRow kind={tab} />
        </div>
      )}
    </Modal>
  );
}

function TabBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className="rounded-[7px] px-[11px] py-[6px] text-[12.5px] font-semibold" style={on ? { background: "var(--accent)", color: "#fff" } : { background: "var(--surface-2)", color: "var(--muted)" }}>{children}</button>;
}

type ConfigItem = { _id: string; kind: "QUESTION" | "SCENARIO"; text: string; explanation: string; position: number; active: boolean };
function ConfigRow({ item, first, last }: { item: ConfigItem; first: boolean; last: boolean }) {
  const saveItem = useMutation(api.interviews.saveItem);
  const removeItem = useMutation(api.interviews.removeItem);
  const moveItem = useMutation(api.interviews.moveItem);
  const toggleItem = useMutation(api.interviews.toggleItem);
  const toast = useToast();
  const { confirm } = useDialogs();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const [expl, setExpl] = useState(item.explanation);

  if (editing) {
    return (
      <div className="rounded-card border border-accent bg-surface p-[11px]">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Intitulé" className="mb-[7px] h-9 w-full rounded-sm border border-border bg-surface-2 px-2 text-[13px] outline-none focus:border-accent" />
        <textarea value={expl} onChange={(e) => setExpl(e.target.value)} rows={2} placeholder="Réponse attendue / explication" className="mb-[7px] w-full rounded-sm border border-border bg-surface-2 p-2 text-[12.5px] outline-none focus:border-accent" />
        <div className="flex justify-end gap-[6px]">
          <Button variant="ghost" onClick={() => { setText(item.text); setExpl(item.explanation); setEditing(false); }}>Annuler</Button>
          <Button variant="primary" disabled={!text.trim()} onClick={async () => { await toast.guard(saveItem({ itemId: item._id as Id<"interviewItems">, kind: item.kind, text: text.trim(), explanation: expl.trim() || undefined }), "Enregistrement impossible"); setEditing(false); }}>Enregistrer</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-[8px] rounded-card border border-border bg-surface p-[10px_11px]" style={{ opacity: item.active ? 1 : 0.55 }}>
      <div className="flex flex-col">
        <button disabled={first} onClick={() => void moveItem({ itemId: item._id as Id<"interviewItems">, direction: "up" })} className="text-faint hover:text-text disabled:opacity-30"><ChevronUp className="h-[14px] w-[14px]" /></button>
        <button disabled={last} onClick={() => void moveItem({ itemId: item._id as Id<"interviewItems">, direction: "down" })} className="text-faint hover:text-text disabled:opacity-30"><ChevronDown className="h-[14px] w-[14px]" /></button>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{item.text}</div>
        {item.explanation && <div className="mt-[2px] text-[11.5px] text-muted">{item.explanation}</div>}
      </div>
      <label className="flex flex-shrink-0 items-center gap-[4px] text-[11px] text-faint"><input type="checkbox" checked={item.active} onChange={(e) => void toggleItem({ itemId: item._id as Id<"interviewItems">, active: e.target.checked })} /> actif</label>
      <button onClick={() => setEditing(true)} className="flex-shrink-0 rounded-sm border border-border bg-surface-2 px-[8px] py-[5px] text-[11.5px] font-semibold text-muted hover:text-text">Modifier</button>
      <button onClick={async () => { if (await confirm({ title: "Supprimer cet élément de la banque ?", danger: true, confirmLabel: "Supprimer" })) void removeItem({ itemId: item._id as Id<"interviewItems"> }); }} className="flex-shrink-0 text-faint hover:text-danger"><Trash2 className="h-[14px] w-[14px]" /></button>
    </div>
  );
}

function AddRow({ kind }: { kind: "QUESTION" | "SCENARIO" }) {
  const saveItem = useMutation(api.interviews.saveItem);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [expl, setExpl] = useState("");
  if (!open) return <button onClick={() => setOpen(true)} className="flex items-center justify-center gap-[6px] rounded-card border border-dashed border-border py-[10px] text-[12.5px] font-semibold text-muted hover:border-accent hover:text-accent"><Plus className="h-[14px] w-[14px]" /> Ajouter {kind === "QUESTION" ? "une question" : "une mise en situation"}</button>;
  return (
    <div className="rounded-card border border-accent bg-surface p-[11px]">
      <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === "QUESTION" ? "Question" : "Mise en situation"} className="mb-[7px] h-9 w-full rounded-sm border border-border bg-surface-2 px-2 text-[13px] outline-none focus:border-accent" />
      <textarea value={expl} onChange={(e) => setExpl(e.target.value)} rows={2} placeholder="Réponse attendue / explication" className="mb-[7px] w-full rounded-sm border border-border bg-surface-2 p-2 text-[12.5px] outline-none focus:border-accent" />
      <div className="flex justify-end gap-[6px]">
        <Button variant="ghost" onClick={() => { setText(""); setExpl(""); setOpen(false); }}>Annuler</Button>
        <Button variant="primary" disabled={!text.trim()} onClick={async () => { await toast.guard(saveItem({ kind, text: text.trim(), explanation: expl.trim() || undefined }), "Ajout impossible"); setText(""); setExpl(""); setOpen(false); }}>Ajouter</Button>
      </div>
    </div>
  );
}
