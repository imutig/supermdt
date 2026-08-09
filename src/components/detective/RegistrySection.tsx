import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, Search, Trash2, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { useToast } from "@/providers/toast";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { DetectiveEditor } from "./DetectiveEditor";
import { MediaField, MediaView, PhotoField } from "./media";
import { CitizenPicker, GangPicker } from "./pickers";
import { PERSON_ROLE, Pill, Field, inputCls, selectCls } from "./ui";

export function RegistrySection({ divisionId, canWrite, openPersonId, onConsumeOpen }: {
  divisionId: Id<"divisions">; canWrite: boolean; openPersonId?: string | null; onConsumeOpen?: () => void;
}) {
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<Id<"dbPersons"> | null>(null);
  const list = useQuery(api.detectiveRegistry.listPersons, { divisionId, role: (role || undefined) as any, q: q.trim() || undefined });

  // Ouverture provoquée par une mention "@".
  if (openPersonId && view !== openPersonId) { setView(openPersonId as Id<"dbPersons">); onConsumeOpen?.(); }

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (nom, alias)…" className={`${inputCls} pl-9`} />
        </div>
        <select value={role} onChange={(e) => setRole(e.target.value)} className={`${selectCls} w-auto`}>
          <option value="">Tous rôles</option>
          {Object.entries(PERSON_ROLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {canWrite && <Button variant="primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nouvelle fiche</Button>}
      </div>

      {list === undefined ? <SkeletonRows rows={4} /> : list.length === 0 ? <EmptyState title="Registre vide" message="Ajoutez suspects, témoins, victimes ou membres de gang." /> : (
        <div className="grid grid-cols-1 gap-[8px] sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <button key={p._id} onClick={() => setView(p._id)} className="flex items-center gap-3 rounded-card border border-border bg-surface p-[12px] text-left hover:border-border-strong">
              {p.photoUrl ? <img src={p.photoUrl} className="h-11 w-11 rounded-[9px] object-cover" alt="" /> : <span className="flex h-11 w-11 items-center justify-center rounded-[9px] bg-surface-2 text-faint">{p.name.slice(0, 2).toUpperCase()}</span>}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold">{p.name} {p.deceased && <span className="text-danger">†</span>}</div>
                {p.alias && <div className="truncate text-[11px] text-faint">« {p.alias} »</div>}
                <div className="mt-1 flex items-center gap-1.5">
                  {p.role && <Pill {...PERSON_ROLE[p.role]} />}
                  {p.gangName && <span className="truncate text-[10.5px] text-muted">{p.gangName}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {creating && <PersonPanel divisionId={divisionId} onClose={() => setCreating(false)} />}
      {view && <PersonView divisionId={divisionId} personId={view} canWrite={canWrite} onClose={() => setView(null)} />}
    </div>
  );
}

function PersonView({ divisionId, personId, canWrite, onClose }: { divisionId: Id<"divisions">; personId: Id<"dbPersons">; canWrite: boolean; onClose: () => void }) {
  const p = useQuery(api.detectiveRegistry.getPerson, { personId });
  const remove = useMutation(api.detectiveRegistry.removePerson);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  if (!p) return <Modal title="Fiche" onClose={onClose}><SkeletonRows rows={4} /></Modal>;
  if (editing) return <PersonPanel divisionId={divisionId} existing={p} onClose={() => setEditing(false)} />;
  return (
    <Modal title={p.name} onClose={onClose} width={560}
      footer={canWrite ? <div className="flex justify-between"><Button variant="danger" onClick={async () => { if (confirm("Supprimer cette fiche ?")) { await toast.guard(remove({ personId }), "Suppression impossible"); onClose(); } }}><Trash2 className="h-4 w-4" /> Supprimer</Button><Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Modifier</Button></div> : undefined}>
      <div className="flex flex-col gap-[14px]">
        <div className="flex items-center gap-3">
          {p.photoUrl ? <img src={p.photoUrl} className="h-16 w-16 rounded-[10px] object-cover" alt="" /> : <span className="flex h-16 w-16 items-center justify-center rounded-[10px] bg-surface-2 text-faint">{p.name.slice(0, 2).toUpperCase()}</span>}
          <div>
            <div className="text-[16px] font-bold">{p.name} {p.deceased && <span className="text-danger">†</span>}</div>
            {p.alias && <div className="text-[12px] text-faint">alias « {p.alias} »</div>}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {p.role && <Pill {...PERSON_ROLE[p.role]} />}
              {p.wantedLevel && <span className="rounded-full bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] px-2 py-px text-[11px] font-semibold text-danger">Recherché : {p.wantedLevel}</span>}
            </div>
          </div>
        </div>
        {p.gang && <div className="text-[12.5px]"><b>Affiliation :</b> {p.gang.name}{p.gangRankName && ` · ${p.gangRankName}`}{p.gangRoleLabel && ` (${p.gangRoleLabel})`}</div>}
        {p.citizenId && <div className="text-[12.5px]"><a href={`/citoyen/${p.citizenId}`} className="text-accent underline">Voir la fiche citoyen (encodage)</a></div>}
        {(p.deceased || p.victimCause || p.victimNextOfKin || p.victimAutopsy) && (
          <div className="rounded-sm border border-border bg-surface-2 p-3">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Fiche victime</div>
            {p.victimCause && <div className="text-[12.5px]"><b>Cause :</b> {p.victimCause}</div>}
            {p.victimNextOfKin && <div className="text-[12.5px]"><b>Proches :</b> {p.victimNextOfKin}</div>}
            {p.victimAutopsy && <div className="mt-1"><DetectiveEditor value={p.victimAutopsy} editable={false} divisionId={divisionId} minHeight={0} /></div>}
          </div>
        )}
        {p.notes && <div><div className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Notes</div><DetectiveEditor value={p.notes} editable={false} divisionId={divisionId} minHeight={0} /></div>}
        {p.mediaUrls.length > 0 && <MediaView urls={p.mediaUrls} />}
        {p.cases.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Enquêtes liées</div>
            <div className="flex flex-col gap-1">
              {p.cases.map((c) => <div key={c.caseId} className="text-[12.5px]">#{c.number} — {c.title} <span className="text-faint">({c.caseRole})</span></div>)}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function PersonPanel({ divisionId, existing, onClose }: { divisionId: Id<"divisions">; existing?: any; onClose: () => void }) {
  const create = useMutation(api.detectiveRegistry.createPerson);
  const update = useMutation(api.detectiveRegistry.updatePerson);
  const toast = useToast();
  const [name, setName] = useState(existing?.name ?? "");
  const [alias, setAlias] = useState(existing?.alias ?? "");
  const [role, setRole] = useState(existing?.role ?? "");
  const [citizen, setCitizen] = useState<{ citizenId: Id<"citizens">; name: string } | null>(existing?.citizenId ? { citizenId: existing.citizenId, name: "Citoyen lié" } : null);
  const [gang, setGang] = useState<{ gangId: Id<"dbGangs">; name: string } | null>(existing?.gang ? { gangId: existing.gang._id, name: existing.gang.name } : null);
  const [gangRoleLabel, setGangRoleLabel] = useState(existing?.gangRoleLabel ?? "");
  const [wantedLevel, setWantedLevel] = useState(existing?.wantedLevel ?? "");
  const [photo, setPhoto] = useState<string | null>(existing?.photoUrl ?? null);
  const [deceased, setDeceased] = useState(!!existing?.deceased);
  const [victimCause, setVictimCause] = useState(existing?.victimCause ?? "");
  const [victimNextOfKin, setVictimNextOfKin] = useState(existing?.victimNextOfKin ?? "");
  const [victimAutopsy, setVictimAutopsy] = useState(existing?.victimAutopsy ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [media, setMedia] = useState<string[]>(existing?.mediaUrls ?? []);
  const [busy, setBusy] = useState(false);
  const showVictim = role === "VICTIM" || deceased;

  const submit = async () => {
    if (!name.trim()) { toast.error("Nom requis."); return; }
    setBusy(true);
    const base: any = {
      name: name.trim(), alias: alias.trim() || undefined, role: (role || null) as any,
      citizenId: citizen?.citizenId ?? null, gangId: gang?.gangId ?? null,
      gangRoleLabel: gangRoleLabel.trim() || undefined, wantedLevel: wantedLevel.trim() || undefined,
      photoUrl: photo, deceased, victimCause: victimCause.trim() || undefined,
      victimNextOfKin: victimNextOfKin.trim() || undefined, victimAutopsy: victimAutopsy || undefined,
      notes: notes || undefined, mediaUrls: media,
    };
    const r = existing
      ? await toast.guard(update({ personId: existing._id, ...base }), "Enregistrement impossible")
      : await toast.guard(create({ divisionId, ...base }), "Création impossible");
    setBusy(false);
    if (r !== undefined) { toast.success(existing ? "Fiche mise à jour." : "Fiche créée."); onClose(); }
  };

  return (
    <Modal title={existing ? "Modifier la fiche" : "Nouvelle fiche"} onClose={onClose} width={560}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" loading={busy} onClick={submit}>{existing ? "Enregistrer" : "Créer"}</Button></div>}>
      <div className="flex flex-col gap-[14px]">
        <Field label="Photo"><PhotoField value={photo} onChange={setPhoto} /></Field>
        <div className="grid grid-cols-2 gap-[12px]">
          <Field label="Nom / identité"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
          <Field label="Alias"><input value={alias} onChange={(e) => setAlias(e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-[12px]">
          <Field label="Rôle"><select value={role} onChange={(e) => setRole(e.target.value)} className={selectCls}><option value="">—</option>{Object.entries(PERSON_ROLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
          <Field label="Niveau de recherche"><input value={wantedLevel} onChange={(e) => setWantedLevel(e.target.value)} className={inputCls} placeholder="Ex. Activement recherché" /></Field>
        </div>
        <Field label="Lien encodage (citoyen)">{citizen ? <div className="flex items-center justify-between rounded-sm border border-border bg-surface-2 px-3 py-2 text-[13px]"><span>{citizen.name}</span><button onClick={() => setCitizen(null)} className="text-[12px] text-danger hover:underline">Retirer</button></div> : <CitizenPicker onPick={setCitizen} />}</Field>
        <div className="grid grid-cols-2 gap-[12px]">
          <Field label="Organisation">{gang ? <div className="flex items-center justify-between rounded-sm border border-border bg-surface-2 px-3 py-2 text-[13px]"><span>{gang.name}</span><button onClick={() => setGang(null)} className="text-[12px] text-danger hover:underline">Retirer</button></div> : <GangPicker divisionId={divisionId} onPick={setGang} />}</Field>
          <Field label="Rôle dans l'organisation"><input value={gangRoleLabel} onChange={(e) => setGangRoleLabel(e.target.value)} className={inputCls} placeholder="Ex. Enforcer" /></Field>
        </div>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={deceased} onChange={(e) => setDeceased(e.target.checked)} /> <span>Personne décédée</span></label>
        {showVictim && (
          <div className="flex flex-col gap-[12px] rounded-sm border border-border bg-surface-2 p-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Fiche victime (HRD)</div>
            <div className="grid grid-cols-2 gap-[12px]">
              <Field label="Cause du décès"><input value={victimCause} onChange={(e) => setVictimCause(e.target.value)} className={inputCls} /></Field>
              <Field label="Proches / famille"><input value={victimNextOfKin} onChange={(e) => setVictimNextOfKin(e.target.value)} className={inputCls} /></Field>
            </div>
            <Field label="Notes d'autopsie"><DetectiveEditor value={existing?.victimAutopsy ?? ""} onChange={setVictimAutopsy} divisionId={divisionId} minHeight={100} /></Field>
          </div>
        )}
        <Field label="Notes"><DetectiveEditor value={existing?.notes ?? ""} onChange={setNotes} divisionId={divisionId} minHeight={120} placeholder="Observations, antécédents… (@ pour relier, médias inline)" /></Field>
        <Field label="Médias"><MediaField value={media} onChange={setMedia} /></Field>
      </div>
    </Modal>
  );
}
