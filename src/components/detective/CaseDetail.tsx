import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft, Pencil, Trash2, Plus, Users, FileText, ShieldAlert, Clock, Network, ScrollText,
  Lock, Check, Car, X,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { useToast } from "@/providers/toast";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { DetectiveEditor } from "./DetectiveEditor";
import { MediaField, MediaView } from "./media";
import { AgentPicker, PersonPicker, CitizenPicker, VehiclePicker, GangPicker } from "./pickers";
import { Board } from "./Board";
import { MapPickField, MapPointView } from "./MapField";
import {
  CASE_STATUS, PRIORITY, SUBDIV_LABEL, CASE_ROLE, ITEM_TYPE, EVIDENCE_TYPE, ORG_TYPE,
  Pill, Card, Field, inputCls, selectCls, dtShort, dtLong,
} from "./ui";

type InnerTab = "synth" | "actors" | "pieces" | "evidence" | "chrono" | "board";

export function CaseDetail({ divisionId, caseId, onBack }: {
  divisionId: Id<"divisions">; caseId: Id<"dbCases">; onBack: () => void;
}) {
  const c = useQuery(api.detective.getCase, { caseId });
  const removeCase = useMutation(api.detective.removeCase);
  const toast = useToast();
  const [tab, setTab] = useState<InnerTab>("synth");
  const [editing, setEditing] = useState(false);

  if (c === undefined) return <div className="p-2"><SkeletonRows rows={6} /></div>;

  const TABS: { key: InnerTab; label: string; icon: typeof Users }[] = [
    { key: "synth", label: "Synthèse", icon: ScrollText },
    { key: "actors", label: "Acteurs", icon: Users },
    { key: "pieces", label: "Pièces", icon: FileText },
    { key: "evidence", label: "Preuves", icon: ShieldAlert },
    { key: "chrono", label: "Chronologie", icon: Clock },
    { key: "board", label: "Tableau d'enquête", icon: Network },
  ];

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex flex-wrap items-start gap-3">
        <button onClick={onBack} className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm border border-border hover:bg-surface-2"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-data text-[13px] text-faint">#{c.number}</span>
            <h2 className="m-0 text-[19px] font-bold">{c.title}</h2>
            {c.confidential && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-danger"><Lock className="h-3.5 w-3.5" /> Confidentiel</span>}
          </div>
          <div className="mt-[5px] flex flex-wrap items-center gap-2">
            <Pill {...CASE_STATUS[c.status]} />
            <Pill {...PRIORITY[c.priority]} />
            {c.subDivision && <span className="rounded-[5px] border border-border px-2 py-[2px] text-[11px] font-semibold" title={SUBDIV_LABEL[c.subDivision]}>{c.subDivision}</span>}
            {c.lead && <span className="text-[12px] text-muted">Réf. {c.lead.name}</span>}
          </div>
        </div>
        {c.canWrite && <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Modifier</Button>}
        {c.canDelete && <Button variant="danger" onClick={async () => { if (confirm(`Supprimer l'enquête #${c.number} ?`)) { await toast.guard(removeCase({ caseId }), "Suppression impossible"); onBack(); } }}><Trash2 className="h-4 w-4" /></Button>}
      </div>

      {c.canWrite && <StatusBar caseId={caseId} status={c.status} />}

      <div className="flex flex-wrap gap-[2px] rounded-card border border-border bg-surface p-[5px]">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex items-center gap-[6px] rounded-[7px] px-[12px] py-[7px] text-[12.5px] font-semibold hover:bg-surface-2"
            style={tab === t.key ? { background: "var(--accent)", color: "var(--accent-contrast)" } : { color: "var(--muted)" }}>
            <t.icon className="h-[14px] w-[14px]" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "synth" && <SynthTab divisionId={divisionId} caseId={caseId} synthesis={c.synthesis} canWrite={c.canWrite} />}
      {tab === "actors" && <ActorsTab divisionId={divisionId} caseId={caseId} canWrite={c.canWrite} />}
      {tab === "pieces" && <PiecesTab divisionId={divisionId} caseId={caseId} canWrite={c.canWrite} />}
      {tab === "evidence" && <EvidenceTab divisionId={divisionId} caseId={caseId} canWrite={c.canWrite} />}
      {tab === "chrono" && <ChronoTab divisionId={divisionId} caseId={caseId} canWrite={c.canWrite} />}
      {tab === "board" && <Board caseId={caseId} canWrite={c.canWrite} />}

      {editing && <EditCasePanel divisionId={divisionId} caseId={caseId} current={c} onClose={() => setEditing(false)} />}
    </div>
  );
}

function StatusBar({ caseId, status }: { caseId: Id<"dbCases">; status: string }) {
  const setStatus = useMutation(api.detective.setStatus);
  const toast = useToast();
  return (
    <div className="flex flex-wrap items-center gap-[6px]">
      <span className="text-[11.5px] text-faint">Statut :</span>
      {Object.entries(CASE_STATUS).map(([k, v]) => (
        <button key={k} onClick={() => k !== status && toast.guard(setStatus({ caseId, status: k as any }), "Action impossible")}
          className="rounded-full px-[10px] py-[3px] text-[11.5px] font-semibold"
          style={k === status ? { background: v.color, color: "#fff" } : { background: "var(--surface-2)", color: "var(--muted)" }}>
          {v.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Synthèse ---------- */
function SynthTab({ divisionId, caseId, synthesis, canWrite }: { divisionId: Id<"divisions">; caseId: Id<"dbCases">; synthesis: string; canWrite: boolean }) {
  const save = useMutation(api.detective.setSynthesis);
  const toast = useToast();
  const [val, setVal] = useState(synthesis);
  const [busy, setBusy] = useState(false);
  const dirty = val !== synthesis;
  if (!canWrite) return <Card title="Synthèse de l'enquête">{synthesis ? <DetectiveEditor value={synthesis} editable={false} divisionId={divisionId} minHeight={0} /> : <EmptyState compact title="Aucune synthèse" />}</Card>;
  return (
    <Card title="Synthèse de l'enquête" action={dirty ? <Button variant="primary" loading={busy} onClick={async () => { setBusy(true); await toast.guard(save({ caseId, synthesis: val }), "Enregistrement impossible"); setBusy(false); }}>Enregistrer</Button> : undefined}>
      <DetectiveEditor value={synthesis} onChange={setVal} divisionId={divisionId} minHeight={220} placeholder="Résumé global de l'enquête : faits, contexte, état d'avancement, hypothèses… (tapez @ pour relier, insérez des médias)" />
    </Card>
  );
}

/* ---------- Acteurs : personnes, véhicules, gangs, équipe ---------- */
function ActorsTab({ divisionId, caseId, canWrite }: { divisionId: Id<"divisions">; caseId: Id<"dbCases">; canWrite: boolean }) {
  return (
    <div className="grid grid-cols-1 items-start gap-[14px] lg:grid-cols-2">
      <PersonsCard divisionId={divisionId} caseId={caseId} canWrite={canWrite} />
      <div className="flex flex-col gap-[14px]">
        <VehiclesCard caseId={caseId} canWrite={canWrite} />
        <GangsCard divisionId={divisionId} caseId={caseId} canWrite={canWrite} />
        <TeamCard divisionId={divisionId} caseId={caseId} canWrite={canWrite} />
      </div>
    </div>
  );
}

function PersonsCard({ divisionId, caseId, canWrite }: { divisionId: Id<"divisions">; caseId: Id<"dbCases">; canWrite: boolean }) {
  const persons = useQuery(api.detectiveRegistry.casePersons, { caseId });
  const remove = useMutation(api.detectiveRegistry.removeCasePerson);
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  return (
    <Card title="Personnes" action={canWrite ? <Button variant="secondary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Ajouter</Button> : undefined}>
      {persons === undefined ? <SkeletonRows rows={2} /> : persons.length === 0 ? <EmptyState compact title="Aucune personne" /> : (
        <div className="flex flex-col gap-[6px]">
          {persons.map((p) => (
            <div key={p._id} className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3 py-2">
              {p.photoUrl ? <img src={p.photoUrl} className="h-8 w-8 rounded-full object-cover" alt="" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-faint text-[11px]">{p.name.slice(0, 2).toUpperCase()}</span>}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold">{p.name} {p.deceased && <span className="text-danger">†</span>}</div>
                {p.alias && <div className="text-[11px] text-faint">alias « {p.alias} »</div>}
              </div>
              <Pill {...CASE_ROLE[p.caseRole]} />
              {canWrite && <button onClick={() => confirm("Retirer cette personne de l'enquête ?") && toast.guard(remove({ id: p._id }), "Action impossible")} className="text-faint hover:text-danger"><X className="h-4 w-4" /></button>}
            </div>
          ))}
        </div>
      )}
      {adding && <AddPersonPanel divisionId={divisionId} caseId={caseId} onClose={() => setAdding(false)} />}
    </Card>
  );
}

function AddPersonPanel({ divisionId, caseId, onClose }: { divisionId: Id<"divisions">; caseId: Id<"dbCases">; onClose: () => void }) {
  const add = useMutation(api.detectiveRegistry.addCasePerson);
  const toast = useToast();
  const [mode, setMode] = useState<"registry" | "citizen" | "manual">("registry");
  const [caseRole, setCaseRole] = useState("SUSPECT");
  const [picked, setPicked] = useState<{ personId?: Id<"dbPersons">; citizenId?: Id<"citizens">; name: string } | null>(null);
  const [manualName, setManualName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const args: any = { caseId, caseRole, note: note.trim() || undefined };
    if (mode === "registry") { if (!picked?.personId) { toast.error("Sélectionnez une personne."); setBusy(false); return; } args.personId = picked.personId; }
    else if (mode === "citizen") { if (!picked?.citizenId) { toast.error("Sélectionnez un citoyen."); setBusy(false); return; } args.citizenId = picked.citizenId; args.name = picked.name; }
    else { if (!manualName.trim()) { toast.error("Nom requis."); setBusy(false); return; } args.name = manualName.trim(); }
    const r = await toast.guard(add(args), "Ajout impossible");
    setBusy(false);
    if (r !== undefined) { toast.success("Personne ajoutée."); onClose(); }
  };

  return (
    <Modal title="Ajouter une personne" onClose={onClose} width={460}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" loading={busy} onClick={submit}>Ajouter</Button></div>}>
      <div className="flex flex-col gap-[14px]">
        <Field label="Rôle dans l'enquête">
          <select value={caseRole} onChange={(e) => setCaseRole(e.target.value)} className={selectCls}>
            {Object.entries(CASE_ROLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <div className="flex gap-[2px] rounded-sm border border-border p-[3px]">
          {([["registry", "Registre"], ["citizen", "Encodage"], ["manual", "Manuel"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setMode(k); setPicked(null); }} className="flex-1 rounded-[6px] px-2 py-[6px] text-[12px] font-semibold"
              style={mode === k ? { background: "var(--accent-soft)", color: "var(--accent)" } : { color: "var(--muted)" }}>{l}</button>
          ))}
        </div>
        {mode === "registry" && (picked?.personId ? <PickedRow name={picked.name} onClear={() => setPicked(null)} /> : <PersonPicker divisionId={divisionId} onPick={(p) => setPicked({ personId: p.personId, name: p.name })} />)}
        {mode === "citizen" && (picked?.citizenId ? <PickedRow name={picked.name} onClear={() => setPicked(null)} /> : <CitizenPicker onPick={(c) => setPicked({ citizenId: c.citizenId, name: c.name })} />)}
        {mode === "manual" && <Field label="Nom"><input value={manualName} onChange={(e) => setManualName(e.target.value)} className={inputCls} placeholder="Nom / identité présumée" /></Field>}
        <Field label="Note (optionnel)"><input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="Rôle présumé, précision…" /></Field>
      </div>
    </Modal>
  );
}

function PickedRow({ name, onClear }: { name: string; onClear: () => void }) {
  return <div className="flex items-center justify-between rounded-sm border border-border bg-surface-2 px-3 py-2 text-[13px]"><span>{name}</span><button onClick={onClear} className="text-[12px] text-danger hover:underline">Changer</button></div>;
}

function VehiclesCard({ caseId, canWrite }: { caseId: Id<"dbCases">; canWrite: boolean }) {
  const list = useQuery(api.detective.caseVehicles, { caseId });
  const add = useMutation(api.detective.addCaseVehicle);
  const remove = useMutation(api.detective.removeCaseVehicle);
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [plaque, setPlaque] = useState("");
  const [note, setNote] = useState("");
  return (
    <Card title="Véhicules" action={canWrite ? <Button variant="secondary" onClick={() => setAdding((v) => !v)}><Car className="h-4 w-4" /> Ajouter</Button> : undefined}>
      {adding && canWrite && (
        <div className="mb-2 flex flex-col gap-2 rounded-sm border border-border bg-surface-2 p-3">
          <VehiclePicker onPick={async (v) => { await toast.guard(add({ caseId, vehicleId: v.vehicleId, note: note.trim() || undefined }), "Ajout impossible"); setAdding(false); setNote(""); }} />
          <div className="text-[11px] text-faint">ou saisir une plaque manuellement :</div>
          <div className="flex gap-2">
            <input value={plaque} onChange={(e) => setPlaque(e.target.value)} className={inputCls} placeholder="Plaque" />
            <Button variant="primary" onClick={async () => { if (!plaque.trim()) return; await toast.guard(add({ caseId, plaque: plaque.trim(), note: note.trim() || undefined }), "Ajout impossible"); setPlaque(""); setAdding(false); }}>Ajouter</Button>
          </div>
        </div>
      )}
      {list === undefined ? <SkeletonRows rows={1} /> : list.length === 0 ? <EmptyState compact title="Aucun véhicule" /> : (
        <div className="flex flex-col gap-[6px]">
          {list.map((v) => (
            <div key={v._id} className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3 py-2">
              <span className="font-data text-[13px] font-semibold">{v.plaque || "—"}</span>
              <span className="flex-1 truncate text-[12px] text-muted">{v.label} {v.note && `· ${v.note}`}</span>
              {canWrite && <button onClick={() => toast.guard(remove({ id: v._id }), "Action impossible")} className="text-faint hover:text-danger"><X className="h-4 w-4" /></button>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function GangsCard({ divisionId, caseId, canWrite }: { divisionId: Id<"divisions">; caseId: Id<"dbCases">; canWrite: boolean }) {
  const list = useQuery(api.detectiveGangs.caseGangs, { caseId });
  const add = useMutation(api.detectiveGangs.addCaseGang);
  const remove = useMutation(api.detectiveGangs.removeCaseGang);
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  return (
    <Card title="Affiliations" action={canWrite ? <Button variant="secondary" onClick={() => setAdding((v) => !v)}><Plus className="h-4 w-4" /> Relier</Button> : undefined}>
      {adding && canWrite && <div className="mb-2"><GangPicker divisionId={divisionId} onPick={async (g) => { await toast.guard(add({ caseId, gangId: g.gangId }), "Action impossible"); setAdding(false); }} /></div>}
      {list === undefined ? <SkeletonRows rows={1} /> : list.length === 0 ? <EmptyState compact title="Aucune affiliation" /> : (
        <div className="flex flex-wrap gap-[6px]">
          {list.map((g) => (
            <span key={g._id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-[12.5px]" style={g.color ? { borderColor: g.color } : undefined}>
              <span className="h-2 w-2 rounded-full" style={{ background: g.color ?? "var(--faint)" }} />
              {g.name} <span className="text-[10px] text-faint">{ORG_TYPE[g.orgType]}</span>
              {canWrite && <button onClick={() => toast.guard(remove({ id: g._id }), "Action impossible")} className="text-faint hover:text-danger"><X className="h-3 w-3" /></button>}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

function TeamCard({ divisionId, caseId, canWrite }: { divisionId: Id<"divisions">; caseId: Id<"dbCases">; canWrite: boolean }) {
  const c = useQuery(api.detective.getCase, { caseId });
  const add = useMutation(api.detective.addTeamMember);
  const remove = useMutation(api.detective.removeTeamMember);
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const team = c?.team ?? [];
  return (
    <Card title="Équipe" action={canWrite ? <Button variant="secondary" onClick={() => setAdding((v) => !v)}><Plus className="h-4 w-4" /> Ajouter</Button> : undefined}>
      {adding && canWrite && <div className="mb-2"><AgentPicker divisionId={divisionId} exclude={team.map((t) => t.agentId as string)} onPick={async (a) => { await toast.guard(add({ caseId, agentId: a.agentId }), "Action impossible"); setAdding(false); }} /></div>}
      {team.length === 0 ? <EmptyState compact title="Aucun membre" /> : (
        <div className="flex flex-wrap gap-[6px]">
          {team.map((t) => (
            <span key={t._id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-[12.5px]">
              {t.name}
              {canWrite && <button onClick={() => toast.guard(remove({ teamId: t._id }), "Action impossible")} className="text-faint hover:text-danger"><X className="h-3 w-3" /></button>}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------- Pièces ---------- */
function PiecesTab({ divisionId, caseId, canWrite }: { divisionId: Id<"divisions">; caseId: Id<"dbCases">; canWrite: boolean }) {
  const folders = useQuery(api.detective.folders, { caseId }) ?? [];
  const items = useQuery(api.detective.items, { caseId });
  const addFolder = useMutation(api.detective.addFolder);
  const removeFolder = useMutation(api.detective.removeFolder);
  const toast = useToast();
  const [folder, setFolder] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<any | null>(null);

  const shown = (items ?? []).filter((i) => !folder || (i.folderId ?? "") === folder);

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        <select value={folder} onChange={(e) => setFolder(e.target.value)} className={`${selectCls} w-auto`}>
          <option value="">Tous les dossiers</option>
          {folders.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
        </select>
        {canWrite && <Button variant="ghost" onClick={async () => { const n = prompt("Nom du sous-dossier"); if (n?.trim()) await toast.guard(addFolder({ caseId, name: n.trim() }), "Action impossible"); }}><Plus className="h-4 w-4" /> Sous-dossier</Button>}
        {canWrite && folder && <Button variant="ghost" onClick={async () => { if (confirm("Supprimer ce dossier ? Ses pièces repassent à la racine.")) { await toast.guard(removeFolder({ id: folder as Id<"dbFolders"> }), "Action impossible"); setFolder(""); } }}><Trash2 className="h-4 w-4" /></Button>}
        <div className="flex-1" />
        {canWrite && <Button variant="primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Nouvelle pièce</Button>}
      </div>

      {items === undefined ? <SkeletonRows rows={3} /> : shown.length === 0 ? <EmptyState title="Aucune pièce" message="Ajoutez rapports, interrogatoires, auditions, photos ou lieux." /> : (
        <div className="grid grid-cols-1 gap-[8px] sm:grid-cols-2">
          {shown.map((i) => (
            <button key={i._id} onClick={() => setView(i)} className="flex flex-col gap-1 rounded-card border border-border bg-surface p-[12px] text-left hover:border-border-strong">
              <div className="flex items-center gap-2">
                <span className="rounded-[4px] bg-surface-2 px-1.5 py-px text-[10px] font-bold uppercase tracking-[.05em] text-faint">{ITEM_TYPE[i.type]}</span>
                {i.subject && <span className="text-[11px] text-muted">· {i.subject.name}</span>}
              </div>
              <div className="text-[13.5px] font-semibold">{i.title || ITEM_TYPE[i.type]}</div>
              <div className="text-[11px] text-faint">{i.authorName} · {dtShort(i.at)}{i.mediaUrls.length ? ` · ${i.mediaUrls.length} média(s)` : ""}</div>
            </button>
          ))}
        </div>
      )}

      {adding && <AddItemPanel divisionId={divisionId} caseId={caseId} folders={folders} defaultFolder={folder} onClose={() => setAdding(false)} />}
      {view && <ViewItemPanel divisionId={divisionId} item={view} canWrite={canWrite} onClose={() => setView(null)} />}
    </div>
  );
}

function AddItemPanel({ divisionId, caseId, folders, defaultFolder, onClose }: {
  divisionId: Id<"divisions">; caseId: Id<"dbCases">; folders: { _id: Id<"dbFolders">; name: string }[]; defaultFolder: string; onClose: () => void;
}) {
  const add = useMutation(api.detective.addItem);
  const toast = useToast();
  const [type, setType] = useState("REPORT");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [folderId, setFolderId] = useState(defaultFolder);
  const [subject, setSubject] = useState<{ personId: Id<"dbPersons">; name: string } | null>(null);
  const [media, setMedia] = useState<string[]>([]);
  const [loc, setLoc] = useState<{ x: number; y: number } | null>(null);
  const [locNote, setLocNote] = useState("");
  const [busy, setBusy] = useState(false);
  const hasBody = ["REPORT", "INTERROGATION", "AUDITION", "NOTE"].includes(type);
  const hasSubject = ["INTERROGATION", "AUDITION"].includes(type);

  const submit = async () => {
    setBusy(true);
    const r = await toast.guard(add({
      caseId, type: type as any, folderId: (folderId || undefined) as any,
      title: title.trim() || undefined, body: hasBody ? body : undefined,
      subjectPersonId: hasSubject ? subject?.personId : undefined,
      mediaUrls: media.length ? media : undefined,
      locX: type === "LOCATION" ? loc?.x : undefined, locY: type === "LOCATION" ? loc?.y : undefined,
      locNote: type === "LOCATION" ? (locNote.trim() || undefined) : undefined,
    }), "Création impossible");
    setBusy(false);
    if (r !== undefined) { toast.success("Pièce ajoutée."); onClose(); }
  };

  return (
    <Modal title="Nouvelle pièce" onClose={onClose} width={620}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" loading={busy} onClick={submit}>Ajouter</Button></div>}>
      <div className="flex flex-col gap-[14px]">
        <div className="grid grid-cols-2 gap-[12px]">
          <Field label="Type"><select value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>{Object.entries(ITEM_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Sous-dossier"><select value={folderId} onChange={(e) => setFolderId(e.target.value)} className={selectCls}><option value="">Racine</option>{folders.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}</select></Field>
        </div>
        <Field label="Titre"><input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder={ITEM_TYPE[type]} /></Field>
        {hasSubject && <Field label="Personne concernée">{subject ? <PickedRow name={subject.name} onClear={() => setSubject(null)} /> : <PersonPicker divisionId={divisionId} onPick={setSubject} />}</Field>}
        {hasBody && <Field label="Contenu"><DetectiveEditor value="" onChange={setBody} divisionId={divisionId} minHeight={200} placeholder="Rédigez… (mise en forme, @ pour relier, médias inline)" /></Field>}
        {type === "LOCATION" && <>
          <Field label="Emplacement sur la carte"><MapPickField value={loc} onChange={setLoc} /></Field>
          <Field label="Note du lieu"><input value={locNote} onChange={(e) => setLocNote(e.target.value)} className={inputCls} placeholder="Précision sur le lieu" /></Field>
        </>}
        <Field label={type === "PHOTO" ? "Photos / médias" : "Pièces jointes (médias)"}><MediaField value={media} onChange={setMedia} /></Field>
      </div>
    </Modal>
  );
}

function ViewItemPanel({ divisionId, item, canWrite, onClose }: { divisionId: Id<"divisions">; item: any; canWrite: boolean; onClose: () => void }) {
  const remove = useMutation(api.detective.removeItem);
  const toast = useToast();
  return (
    <Modal title={item.title || ITEM_TYPE[item.type]} onClose={onClose} width={640}
      footer={canWrite ? <div className="flex justify-between"><Button variant="danger" onClick={async () => { if (confirm("Supprimer cette pièce ?")) { await toast.guard(remove({ id: item._id }), "Suppression impossible"); onClose(); } }}><Trash2 className="h-4 w-4" /> Supprimer</Button><Button variant="ghost" onClick={onClose}>Fermer</Button></div> : undefined}>
      <div className="flex flex-col gap-[14px]">
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <span className="rounded-[4px] bg-surface-2 px-1.5 py-px text-[10px] font-bold uppercase text-faint">{ITEM_TYPE[item.type]}</span>
          {item.subject && <span>· {item.subject.name}</span>}
          <span>· {item.authorName} · {dtLong(item.at)}</span>
        </div>
        {item.body && <DetectiveEditor value={item.body} editable={false} divisionId={divisionId} minHeight={0} />}
        {item.type === "LOCATION" && item.locX != null && <MapPointView x={item.locX} y={item.locY} note={item.locNote} />}
        {item.mediaUrls?.length > 0 && <MediaView urls={item.mediaUrls} />}
      </div>
    </Modal>
  );
}

/* ---------- Preuves ---------- */
function EvidenceTab({ divisionId, caseId, canWrite }: { divisionId: Id<"divisions">; caseId: Id<"dbCases">; canWrite: boolean }) {
  const list = useQuery(api.detective.evidence, { caseId });
  const remove = useMutation(api.detective.removeEvidence);
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<any | null>(null);
  return (
    <div className="flex flex-col gap-[12px]">
      {canWrite && <div className="flex justify-end"><Button variant="primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Sceller une preuve</Button></div>}
      {list === undefined ? <SkeletonRows rows={2} /> : list.length === 0 ? <EmptyState title="Casier vide" message="Scellez les preuves de l'enquête." /> : (
        <div className="grid grid-cols-1 gap-[8px] sm:grid-cols-2">
          {list.map((e) => (
            <button key={e._id} onClick={() => setView(e)} className="flex flex-col gap-1 rounded-card border border-border bg-surface p-[12px] text-left hover:border-border-strong">
              <div className="flex items-center gap-2">
                {e.evidenceType && <span className="rounded-[4px] bg-surface-2 px-1.5 py-px text-[10px] font-bold uppercase text-faint">{EVIDENCE_TYPE[e.evidenceType]}</span>}
                {e.sealNumber && <span className="font-data text-[11px] text-muted">Scellé {e.sealNumber}</span>}
              </div>
              <div className="text-[13.5px] font-semibold">{e.label}</div>
              <div className="text-[11px] text-faint">{e.storageLoc && `${e.storageLoc} · `}{dtShort(e.at)}{e.mediaUrls.length ? ` · ${e.mediaUrls.length} média(s)` : ""}</div>
            </button>
          ))}
        </div>
      )}
      {adding && <EvidencePanel divisionId={divisionId} caseId={caseId} onClose={() => setAdding(false)} />}
      {view && (
        <Modal title={view.label} onClose={() => setView(null)} width={560}
          footer={canWrite ? <div className="flex justify-between"><Button variant="danger" onClick={async () => { if (confirm("Supprimer cette preuve ?")) { await toast.guard(remove({ id: view._id }), "Suppression impossible"); setView(null); } }}><Trash2 className="h-4 w-4" /> Supprimer</Button><Button variant="ghost" onClick={() => setView(null)}>Fermer</Button></div> : undefined}>
          <div className="flex flex-col gap-3">
            <div className="text-[12px] text-muted">{view.evidenceType && EVIDENCE_TYPE[view.evidenceType]}{view.sealNumber && ` · Scellé ${view.sealNumber}`}{view.storageLoc && ` · ${view.storageLoc}`}</div>
            {view.description && <DetectiveEditor value={view.description} editable={false} divisionId={divisionId} minHeight={0} />}
            {view.mediaUrls?.length > 0 && <MediaView urls={view.mediaUrls} />}
          </div>
        </Modal>
      )}
    </div>
  );
}

function EvidencePanel({ divisionId, caseId, onClose }: { divisionId: Id<"divisions">; caseId: Id<"dbCases">; onClose: () => void }) {
  const add = useMutation(api.detective.addEvidence);
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [evidenceType, setEvidenceType] = useState("PHYSIQUE");
  const [sealNumber, setSealNumber] = useState("");
  const [storageLoc, setStorageLoc] = useState("");
  const [description, setDescription] = useState("");
  const [media, setMedia] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!label.trim()) { toast.error("Libellé requis."); return; }
    setBusy(true);
    const r = await toast.guard(add({ caseId, label: label.trim(), evidenceType: evidenceType as any, sealNumber: sealNumber.trim() || undefined, storageLoc: storageLoc.trim() || undefined, description: description || undefined, mediaUrls: media.length ? media : undefined }), "Création impossible");
    setBusy(false);
    if (r !== undefined) { toast.success("Preuve scellée."); onClose(); }
  };
  return (
    <Modal title="Sceller une preuve" onClose={onClose} width={560}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" loading={busy} onClick={submit}>Sceller</Button></div>}>
      <div className="flex flex-col gap-[14px]">
        <Field label="Libellé"><input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} placeholder="Ex. Douille 9mm" /></Field>
        <div className="grid grid-cols-2 gap-[12px]">
          <Field label="Type"><select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value)} className={selectCls}>{Object.entries(EVIDENCE_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="N° de scellé"><input value={sealNumber} onChange={(e) => setSealNumber(e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Lieu de stockage"><input value={storageLoc} onChange={(e) => setStorageLoc(e.target.value)} className={inputCls} placeholder="Ex. Casier B-12" /></Field>
        <Field label="Description"><DetectiveEditor value="" onChange={setDescription} divisionId={divisionId} minHeight={120} /></Field>
        <Field label="Médias"><MediaField value={media} onChange={setMedia} /></Field>
      </div>
    </Modal>
  );
}

/* ---------- Chronologie + to-do ---------- */
function ChronoTab({ divisionId, caseId, canWrite }: { divisionId: Id<"divisions">; caseId: Id<"dbCases">; canWrite: boolean }) {
  const timeline = useQuery(api.detective.timeline, { caseId });
  const todos = useQuery(api.detective.todos, { caseId });
  const addEvent = useMutation(api.detective.addTimelineEvent);
  const removeEvent = useMutation(api.detective.removeTimelineEvent);
  const addTodo = useMutation(api.detective.addTodo);
  const toggleTodo = useMutation(api.detective.toggleTodo);
  const removeTodo = useMutation(api.detective.removeTodo);
  const toast = useToast();
  const [todoText, setTodoText] = useState("");
  const [assignee, setAssignee] = useState<{ agentId: Id<"agents">; name: string } | null>(null);

  return (
    <div className="grid grid-cols-1 items-start gap-[14px] lg:grid-cols-[1.4fr_1fr]">
      <Card title="Chronologie" action={canWrite ? <Button variant="ghost" onClick={async () => { const l = prompt("Évènement"); if (l?.trim()) await toast.guard(addEvent({ caseId, label: l.trim() }), "Action impossible"); }}><Plus className="h-4 w-4" /> Évènement</Button> : undefined}>
        {timeline === undefined ? <SkeletonRows rows={3} /> : timeline.length === 0 ? <EmptyState compact title="Rien pour l'instant" /> : (
          <div className="flex flex-col">
            {timeline.map((t, i) => (
              <div key={t._id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: t.type === "event" ? "var(--accent)" : "var(--border-strong)" }} />
                  {i < timeline.length - 1 && <span className="w-px flex-1 bg-border" />}
                </div>
                <div className="pb-4">
                  <div className="text-[13px] font-medium">{t.label}</div>
                  <div className="text-[11px] text-faint">{t.authorName} · {dtShort(t.at)}</div>
                  {canWrite && t.type === "event" && <button onClick={() => toast.guard(removeEvent({ id: t._id }), "Action impossible")} className="text-[11px] text-faint hover:text-danger">supprimer</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Pistes à suivre">
        {canWrite && (
          <div className="mb-3 flex flex-col gap-2">
            <input value={todoText} onChange={(e) => setTodoText(e.target.value)} className={inputCls} placeholder="Nouvelle piste…"
              onKeyDown={async (e) => { if (e.key === "Enter" && todoText.trim()) { await toast.guard(addTodo({ caseId, text: todoText.trim(), assigneeId: assignee?.agentId }), "Action impossible"); setTodoText(""); setAssignee(null); } }} />
            {assignee ? <PickedRow name={`Assigné : ${assignee.name}`} onClear={() => setAssignee(null)} /> : <AgentPicker divisionId={divisionId} onPick={setAssignee} placeholder="Assigner (optionnel)…" />}
          </div>
        )}
        {todos === undefined ? <SkeletonRows rows={2} /> : todos.length === 0 ? <EmptyState compact title="Aucune piste" /> : (
          <div className="flex flex-col gap-[6px]">
            {todos.map((t) => (
              <div key={t._id} className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3 py-2">
                <button onClick={() => canWrite && toast.guard(toggleTodo({ id: t._id }), "Action impossible")} className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border" style={t.done ? { background: "var(--success)", borderColor: "var(--success)" } : { borderColor: "var(--border-strong)" }}>{t.done && <Check className="h-3 w-3 text-white" />}</button>
                <span className={`flex-1 text-[13px] ${t.done ? "text-faint line-through" : ""}`}>{t.text}</span>
                {t.assignee && <span className="text-[11px] text-faint">{t.assignee.name}</span>}
                {canWrite && <button onClick={() => toast.guard(removeTodo({ id: t._id }), "Action impossible")} className="text-faint hover:text-danger"><X className="h-3.5 w-3.5" /></button>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- Édition de l'enquête ---------- */
function EditCasePanel({ divisionId, caseId, current, onClose }: { divisionId: Id<"divisions">; caseId: Id<"dbCases">; current: any; onClose: () => void }) {
  const update = useMutation(api.detective.updateCase);
  const toast = useToast();
  const [title, setTitle] = useState(current.title);
  const [subDivision, setSubDivision] = useState<string>(current.subDivision ?? "");
  const [priority, setPriority] = useState(current.priority);
  const [confidential, setConfidential] = useState(!!current.confidential);
  const [lead, setLead] = useState<{ agentId: Id<"agents">; name: string } | null>(current.lead ? { agentId: current.lead.agentId, name: current.lead.name } : null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!title.trim()) { toast.error("Titre requis."); return; }
    setBusy(true);
    await toast.guard(update({ caseId, title: title.trim(), subDivision: (subDivision || null) as any, priority: priority as any, confidential, leadAgentId: lead?.agentId ?? null }), "Enregistrement impossible");
    setBusy(false); onClose();
  };
  return (
    <Modal title={`Modifier l'enquête #${current.number}`} onClose={onClose} width={480}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" loading={busy} onClick={submit}>Enregistrer</Button></div>}>
      <div className="flex flex-col gap-[14px]">
        <Field label="Titre"><input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-[12px]">
          <Field label="Sous-division"><select value={subDivision} onChange={(e) => setSubDivision(e.target.value)} className={selectCls}><option value="">—</option><option value="GND">GND</option><option value="HRD">HRD</option></select></Field>
          <Field label="Priorité"><select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectCls}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
        </div>
        <Field label="Détective référent">{lead ? <PickedRow name={lead.name} onClear={() => setLead(null)} /> : <AgentPicker divisionId={divisionId} onPick={setLead} />}</Field>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} /> <span>Enquête confidentielle</span></label>
      </div>
    </Modal>
  );
}
