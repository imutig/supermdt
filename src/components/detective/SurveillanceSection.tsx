import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, Trash2, Eye, X, Clock, MapPin } from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { useToast } from "@/providers/toast";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { DetectiveEditor } from "./DetectiveEditor";
import { MediaField, MediaView } from "./media";
import { MapPickField, MapPointView } from "./MapField";
import { AgentPicker } from "./pickers";
import { Field, inputCls, dtLong } from "./ui";

const toLocalInput = (ts: number) => { const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
const fromLocalInput = (s: string) => new Date(s).getTime();

export function SurveillanceSection({ divisionId, canWrite }: { divisionId: Id<"divisions">; canWrite: boolean }) {
  const list = useQuery(api.detectiveSurveillance.listSurveillance, { divisionId });
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<any | null>(null);
  return (
    <div className="flex flex-col gap-[14px]">
      {canWrite && <div className="flex justify-end"><Button variant="primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nouvelle surveillance</Button></div>}
      {list === undefined ? <SkeletonRows rows={4} /> : list.length === 0 ? <EmptyState title="Aucune surveillance" message="Consignez planques et observations de terrain." /> : (
        <div className="flex flex-col gap-[8px]">
          {list.map((s) => (
            <button key={s._id} onClick={() => setView(s)} className="flex items-start gap-3 rounded-card border border-border bg-surface p-[12px_14px] text-left hover:border-border-strong">
              <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[9px] bg-surface-2 text-faint"><Eye className="h-[18px] w-[18px]" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold">{s.title || "Surveillance"}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-muted">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {dtLong(s.date)}{s.durationMin ? ` · ${s.durationMin} min` : ""}</span>
                  {s.locationText && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {s.locationText}</span>}
                  {s.caseLabel && <span className="text-accent">{s.caseLabel}</span>}
                </div>
                {s.members.length > 0 && <div className="mt-1 text-[11px] text-faint">{s.members.map((m) => m.name).join(", ")}</div>}
              </div>
              {s.mediaUrls.length > 0 && <span className="text-[11px] text-faint">{s.mediaUrls.length} média(s)</span>}
            </button>
          ))}
        </div>
      )}
      {creating && <SurvPanel divisionId={divisionId} onClose={() => setCreating(false)} />}
      {view && <SurvView divisionId={divisionId} s={view} canWrite={canWrite} onClose={() => setView(null)} />}
    </div>
  );
}

function SurvView({ divisionId, s, canWrite, onClose }: { divisionId: Id<"divisions">; s: any; canWrite: boolean; onClose: () => void }) {
  const remove = useMutation(api.detectiveSurveillance.removeSurveillance);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  if (editing) return <SurvPanel divisionId={divisionId} existing={s} onClose={() => setEditing(false)} />;
  return (
    <Modal title={s.title || "Surveillance"} onClose={onClose} width={600}
      footer={canWrite ? <div className="flex justify-between"><Button variant="danger" onClick={async () => { if (confirm("Supprimer ?")) { await toast.guard(remove({ id: s._id }), "Suppression impossible"); onClose(); } }}><Trash2 className="h-4 w-4" /></Button><Button variant="secondary" onClick={() => setEditing(true)}>Modifier</Button></div> : undefined}>
      <div className="flex flex-col gap-3">
        <div className="text-[12.5px] text-muted">{dtLong(s.date)}{s.durationMin ? ` · ${s.durationMin} min` : ""}{s.locationText ? ` · ${s.locationText}` : ""}</div>
        {s.members.length > 0 && <div className="text-[12.5px]"><b>Présents :</b> {s.members.map((m: any) => m.name).join(", ")}</div>}
        {s.observations && <DetectiveEditor value={s.observations} editable={false} divisionId={divisionId} minHeight={0} />}
        {s.x != null && <MapPointView x={s.x} y={s.y} />}
        {s.mediaUrls?.length > 0 && <MediaView urls={s.mediaUrls} />}
      </div>
    </Modal>
  );
}

function SurvPanel({ divisionId, existing, onClose }: { divisionId: Id<"divisions">; existing?: any; onClose: () => void }) {
  const create = useMutation(api.detectiveSurveillance.createSurveillance);
  const update = useMutation(api.detectiveSurveillance.updateSurveillance);
  const toast = useToast();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [members, setMembers] = useState<{ agentId: Id<"agents">; name: string }[]>(existing?.members?.map((m: any) => ({ agentId: m.agentId, name: m.name })) ?? []);
  const [date, setDate] = useState(toLocalInput(existing?.date ?? Date.now()));
  const [durationMin, setDurationMin] = useState<string>(existing?.durationMin?.toString() ?? "");
  const [locationText, setLocationText] = useState(existing?.locationText ?? "");
  const [loc, setLoc] = useState<{ x: number; y: number } | null>(existing?.x != null ? { x: existing.x, y: existing.y } : null);
  const [observations, setObservations] = useState(existing?.observations ?? "");
  const [media, setMedia] = useState<string[]>(existing?.mediaUrls ?? []);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const base: any = {
      title: title.trim() || undefined, members: members.map((m) => m.agentId),
      date: fromLocalInput(date), durationMin: durationMin ? Number(durationMin) : (existing ? null : undefined),
      locationText: locationText.trim() || undefined, x: loc?.x ?? (existing ? null : undefined), y: loc?.y ?? (existing ? null : undefined),
      observations: observations || undefined, mediaUrls: media,
    };
    if (existing) { await toast.guard(update({ id: existing._id, ...base }), "Enregistrement impossible"); setBusy(false); toast.success("Mis à jour."); onClose(); }
    else { const r = await toast.guard(create({ divisionId, ...base }), "Création impossible"); setBusy(false); if (r !== undefined) { toast.success("Surveillance consignée."); onClose(); } }
  };

  return (
    <Modal title={existing ? "Modifier la surveillance" : "Nouvelle surveillance"} onClose={onClose} width={600}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" loading={busy} onClick={submit}>{existing ? "Enregistrer" : "Consigner"}</Button></div>}>
      <div className="flex flex-col gap-[14px]">
        <Field label="Titre / cible"><input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Ex. Planque entrepôt docks" /></Field>
        <div className="grid grid-cols-2 gap-[12px]">
          <Field label="Date / heure"><input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
          <Field label="Durée (min)"><input type="number" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Membres présents">
          <div className="flex flex-col gap-2">
            {members.length > 0 && <div className="flex flex-wrap gap-1.5">{members.map((m) => <span key={m.agentId} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[12px]">{m.name}<button onClick={() => setMembers((v) => v.filter((x) => x.agentId !== m.agentId))} className="text-faint hover:text-danger"><X className="h-3 w-3" /></button></span>)}</div>}
            <AgentPicker divisionId={divisionId} exclude={members.map((m) => m.agentId as string)} onPick={(a) => setMembers((v) => [...v, a])} />
          </div>
        </Field>
        <Field label="Lieu (texte)"><input value={locationText} onChange={(e) => setLocationText(e.target.value)} className={inputCls} /></Field>
        <Field label="Emplacement sur la carte"><MapPickField value={loc} onChange={setLoc} /></Field>
        <Field label="Éléments observés"><DetectiveEditor value={existing?.observations ?? ""} onChange={setObservations} divisionId={divisionId} minHeight={160} placeholder="Observations… (@ pour relier, photos/vidéos inline)" /></Field>
        <Field label="Médias"><MediaField value={media} onChange={setMedia} /></Field>
      </div>
    </Modal>
  );
}
