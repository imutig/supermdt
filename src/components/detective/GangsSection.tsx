import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, Search, Trash2, Pencil, ArrowLeft, Map as MapIcon, ChevronUp, ChevronDown, X, Swords, Handshake } from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { useToast } from "@/providers/toast";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { LosSantosMap } from "@/components/carte/LosSantosMap";
import { DetectiveEditor } from "./DetectiveEditor";
import { PhotoField } from "./media";
import { PersonPicker, GangPicker } from "./pickers";
import { useDialogs } from "./dialogs";
import { ORG_TYPE, Card, Field, inputCls, selectCls, filterSelectCls } from "./ui";

export function GangsSection({ divisionId, canWrite, openGangId, onConsumeOpen }: {
  divisionId: Id<"divisions">; canWrite: boolean; openGangId?: string | null; onConsumeOpen?: () => void;
}) {
  const [q, setQ] = useState("");
  const [orgType, setOrgType] = useState("");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Id<"dbGangs"> | null>(null);
  const [mapView, setMapView] = useState(false);
  const list = useQuery(api.detectiveGangs.listGangs, { divisionId, q: q.trim() || undefined, orgType: (orgType || undefined) as any });

  if (openGangId && selected !== openGangId) { setSelected(openGangId as Id<"dbGangs">); onConsumeOpen?.(); }
  if (selected) return <GangDetail divisionId={divisionId} gangId={selected} onBack={() => setSelected(null)} />;
  if (mapView) return <GlobalMap divisionId={divisionId} onBack={() => setMapView(false)} />;

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une organisation…" className={`${inputCls} pl-9`} />
        </div>
        <select value={orgType} onChange={(e) => setOrgType(e.target.value)} className={filterSelectCls}>
          <option value="">Tous types</option>
          {Object.entries(ORG_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Button variant="secondary" onClick={() => setMapView(true)}><MapIcon className="h-4 w-4" /> Carte globale</Button>
        {canWrite && <Button variant="primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nouvelle</Button>}
      </div>

      {list === undefined ? <SkeletonRows rows={4} /> : list.length === 0 ? <EmptyState title="Aucune organisation" message="Recensez gangs, MC, organisations et petites frappes." /> : (
        <div className="grid grid-cols-1 gap-[8px] sm:grid-cols-2 lg:grid-cols-3">
          {list.map((g) => (
            <button key={g._id} onClick={() => setSelected(g._id)} className="flex items-center gap-3 rounded-card border border-border bg-surface p-[12px] text-left hover:border-border-strong" style={{ borderLeft: `3px solid ${g.color ?? "var(--border)"}` }}>
              {g.logoUrl ? <img src={g.logoUrl} className="h-11 w-11 rounded-[9px] object-cover" alt="" /> : <span className="flex h-11 w-11 items-center justify-center rounded-[9px] text-[15px] font-bold" style={{ background: `color-mix(in srgb, ${g.color ?? "#888"} 18%, transparent)`, color: g.color ?? "var(--faint)" }}>{g.name.slice(0, 2).toUpperCase()}</span>}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold">{g.name}</div>
                <div className="text-[11px] text-faint">{ORG_TYPE[g.orgType]}{g.subDivision ? ` · ${g.subDivision}` : ""}</div>
                <div className="text-[11px] text-muted">{g.membersCount} membre(s){g.territoryText ? ` · ${g.territoryText}` : ""}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {creating && <GangPanel divisionId={divisionId} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setSelected(id); }} />}
    </div>
  );
}

function GangDetail({ divisionId, gangId, onBack }: { divisionId: Id<"divisions">; gangId: Id<"dbGangs">; onBack: () => void }) {
  const g = useQuery(api.detectiveGangs.getGang, { gangId });
  const remove = useMutation(api.detectiveGangs.removeGang);
  const rankCreate = useMutation(api.detectiveGangs.gangRankCreate);
  const rankRename = useMutation(api.detectiveGangs.gangRankRename);
  const rankMove = useMutation(api.detectiveGangs.gangRankMove);
  const rankRemove = useMutation(api.detectiveGangs.gangRankRemove);
  const setMemberGang = useMutation(api.detectiveGangs.setMemberGang);
  const setRelation = useMutation(api.detectiveGangs.setGangRelation);
  const removeRelation = useMutation(api.detectiveGangs.removeGangRelation);
  const territoryRemove = useMutation(api.detectiveGangs.territoryRemove);
  const toast = useToast();
  const { confirm, prompt } = useDialogs();
  const [editing, setEditing] = useState(false);
  const [addRel, setAddRel] = useState<"RIVAL" | "ALLY" | null>(null);
  const [addTerr, setAddTerr] = useState(false);
  const [addMember, setAddMember] = useState(false);

  if (g === undefined) return <div className="p-2"><SkeletonRows rows={5} /></div>;

  const membersByRank = (rankId: string | null) => g.members.filter((m) => (m.gangRankId ?? null) === rankId);
  const unranked = membersByRank(null);

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-sm border border-border hover:bg-surface-2"><ArrowLeft className="h-4 w-4" /></button>
        {g.logoUrl ? <img src={g.logoUrl} className="h-12 w-12 rounded-[10px] object-cover" alt="" /> : <span className="flex h-12 w-12 items-center justify-center rounded-[10px] text-[16px] font-bold" style={{ background: `color-mix(in srgb, ${g.color ?? "#888"} 18%, transparent)`, color: g.color ?? "var(--faint)" }}>{g.name.slice(0, 2).toUpperCase()}</span>}
        <div className="flex-1">
          <h2 className="m-0 text-[19px] font-bold">{g.name}</h2>
          <div className="text-[12px] text-muted">{ORG_TYPE[g.orgType]}{g.subDivision ? ` · ${g.subDivision}` : ""}{g.territoryText ? ` · ${g.territoryText}` : ""}</div>
        </div>
        {g.canWrite && <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Modifier</Button>}
        {g.canDelete && <Button variant="danger" onClick={async () => { if (await confirm({ title: "Supprimer cette organisation ?", danger: true, confirmLabel: "Supprimer" })) { await toast.guard(remove({ gangId }), "Suppression impossible"); onBack(); } }}><Trash2 className="h-4 w-4" /></Button>}
      </div>

      <div className="grid grid-cols-1 items-start gap-[14px] lg:grid-cols-2">
        <div className="flex flex-col gap-[14px]">
          {g.description && <Card title="Présentation"><DetectiveEditor value={g.description} editable={false} divisionId={divisionId} minHeight={0} /></Card>}
          <Card title="Organigramme" action={g.canWrite ? <Button variant="ghost" onClick={async () => { const n = await prompt({ title: "Nouveau grade", label: "Nom du grade", placeholder: "ex. Leader, Enforcer" }); if (n?.trim()) await toast.guard(rankCreate({ gangId, name: n.trim() }), "Action impossible"); }}><Plus className="h-4 w-4" /> Grade</Button> : undefined}>
            {g.ranks.length === 0 && unranked.length === 0 ? <EmptyState compact title="Aucun grade" /> : (
              <div className="flex flex-col gap-[10px]">
                {g.ranks.map((r, i) => (
                  <div key={r._id}>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[12px] font-bold uppercase tracking-[.05em] text-muted">{r.name}</span>
                      {g.canWrite && <span className="flex items-center gap-1">
                        <button onClick={() => i > 0 && toast.guard(rankMove({ rankId: r._id, dir: "up" }), "")} className="text-faint hover:text-text"><ChevronUp className="h-3.5 w-3.5" /></button>
                        <button onClick={() => i < g.ranks.length - 1 && toast.guard(rankMove({ rankId: r._id, dir: "down" }), "")} className="text-faint hover:text-text"><ChevronDown className="h-3.5 w-3.5" /></button>
                        <button onClick={async () => { const n = await prompt({ title: "Renommer le grade", label: "Nom", defaultValue: r.name }); if (n?.trim()) await toast.guard(rankRename({ rankId: r._id, name: n.trim() }), ""); }} className="text-faint hover:text-text"><Pencil className="h-3 w-3" /></button>
                        <button onClick={async () => { if (await confirm({ title: "Supprimer ce grade ?", danger: true, confirmLabel: "Supprimer" })) void toast.guard(rankRemove({ rankId: r._id }), ""); }} className="text-faint hover:text-danger"><Trash2 className="h-3 w-3" /></button>
                      </span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {membersByRank(r._id).map((m) => <MemberChip key={m._id} m={m} canWrite={g.canWrite} onUnassign={() => setMemberGang({ personId: m._id, gangId: null })} />)}
                      {membersByRank(r._id).length === 0 && <span className="text-[11px] text-faint">-</span>}
                    </div>
                  </div>
                ))}
                {unranked.length > 0 && (
                  <div>
                    <div className="mb-1 text-[12px] font-bold uppercase tracking-[.05em] text-faint">Sans grade</div>
                    <div className="flex flex-wrap gap-1.5">{unranked.map((m) => <MemberChip key={m._id} m={m} canWrite={g.canWrite} onUnassign={() => setMemberGang({ personId: m._id, gangId: null })} />)}</div>
                  </div>
                )}
              </div>
            )}
            {g.canWrite && <div className="mt-3 border-t border-border pt-3">
              {addMember ? <div className="flex flex-col gap-2">
                <PersonPicker divisionId={divisionId} onPick={async (p) => { await toast.guard(setMemberGang({ personId: p.personId, gangId }), "Action impossible"); setAddMember(false); }} placeholder="Rattacher une personne du registre…" />
                <button onClick={() => setAddMember(false)} className="text-[11px] text-faint hover:underline">annuler</button>
              </div> : <Button variant="ghost" onClick={() => setAddMember(true)}><Plus className="h-4 w-4" /> Rattacher un membre</Button>}
              {g.ranks.length > 0 && <RankAssigner gangId={gangId} ranks={g.ranks} members={g.members} />}
            </div>}
          </Card>
        </div>

        <div className="flex flex-col gap-[14px]">
          <Card title="Rivalités & alliances" action={g.canWrite ? <div className="flex gap-1"><Button variant="ghost" onClick={() => setAddRel("RIVAL")}><Swords className="h-4 w-4" /></Button><Button variant="ghost" onClick={() => setAddRel("ALLY")}><Handshake className="h-4 w-4" /></Button></div> : undefined}>
            {addRel && g.canWrite && <div className="mb-2 rounded-sm border border-border bg-surface-2 p-2">
              <div className="mb-1 text-[11.5px] font-semibold">{addRel === "RIVAL" ? "Ajouter une rivalité" : "Ajouter une alliance"}</div>
              <GangPicker divisionId={divisionId} onPick={async (o) => { if (o.gangId === gangId) { toast.error("Choisissez une autre organisation."); return; } await toast.guard(setRelation({ gangId, otherGangId: o.gangId, kind: addRel }), "Action impossible"); setAddRel(null); }} />
              <button onClick={() => setAddRel(null)} className="mt-1 text-[11px] text-faint hover:underline">annuler</button>
            </div>}
            {g.relations.length === 0 ? <EmptyState compact title="Aucune relation" /> : (
              <div className="flex flex-col gap-[6px]">
                {g.relations.map((r) => (
                  <div key={r._id} className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3 py-2">
                    {r.kind === "RIVAL" ? <Swords className="h-4 w-4 text-danger" /> : <Handshake className="h-4 w-4 text-[#49a24a]" />}
                    <span className="flex-1 text-[13px]">{r.name}</span>
                    <span className="text-[11px] text-faint">{r.kind === "RIVAL" ? "Rival" : "Allié"}</span>
                    {g.canWrite && <button onClick={() => toast.guard(removeRelation({ gangId, otherGangId: r.gangId }), "")} className="text-faint hover:text-danger"><X className="h-4 w-4" /></button>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Territoires & QG" action={g.canWrite ? <Button variant="ghost" onClick={() => setAddTerr(true)}><Plus className="h-4 w-4" /> Territoire</Button> : undefined}>
            <GangMap gang={g} />
            {g.territories.length > 0 && <div className="mt-2 flex flex-col gap-1">
              {g.territories.map((t) => (
                <div key={t._id} className="flex items-center gap-2 text-[12.5px]">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color ?? g.color ?? "var(--faint)" }} />
                  <span className="flex-1">{t.name || "Zone"}</span>
                  {g.canWrite && <button onClick={() => toast.guard(territoryRemove({ id: t._id }), "")} className="text-faint hover:text-danger"><X className="h-3.5 w-3.5" /></button>}
                </div>
              ))}
            </div>}
            {g.canWrite && <div className="mt-2"><SetHqButton gangId={gangId} hq={g.hqX != null ? { x: g.hqX, y: g.hqY! } : null} /></div>}
          </Card>
        </div>
      </div>

      {editing && <GangPanel divisionId={divisionId} existing={g} onClose={() => setEditing(false)} />}
      {addTerr && <TerritoryPanel gangId={gangId} color={g.color} onClose={() => setAddTerr(false)} />}
    </div>
  );
}

function MemberChip({ m, canWrite, onUnassign }: { m: any; canWrite: boolean; onUnassign: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[12px]">
      {m.name}{m.gangRoleLabel && <span className="text-[10px] text-faint">{m.gangRoleLabel}</span>}
      {canWrite && <button onClick={onUnassign} className="text-faint hover:text-danger"><X className="h-3 w-3" /></button>}
    </span>
  );
}

function RankAssigner({ gangId, ranks, members }: { gangId: Id<"dbGangs">; ranks: { _id: Id<"dbGangRanks">; name: string }[]; members: any[] }) {
  const setMemberGang = useMutation(api.detectiveGangs.setMemberGang);
  const toast = useToast();
  const [member, setMember] = useState("");
  const [rank, setRank] = useState("");
  if (members.length === 0) return null;
  return (
    <div className="mt-2 flex items-center gap-2">
      <select value={member} onChange={(e) => setMember(e.target.value)} className={`${selectCls} flex-1`}><option value="">Attribuer un grade à…</option>{members.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}</select>
      <select value={rank} onChange={(e) => setRank(e.target.value)} className={`${selectCls} flex-1`}><option value="">Grade</option>{ranks.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}</select>
      <Button variant="secondary" disabled={!member} onClick={async () => { await toast.guard(setMemberGang({ personId: member as Id<"dbPersons">, gangId, gangRankId: (rank || null) as any }), "Action impossible"); setMember(""); setRank(""); }}>OK</Button>
    </div>
  );
}

function GangMap({ gang }: { gang: any }) {
  const data = useQuery(api.carte.get);
  const markers = [
    ...gang.territories.map((t: any) => ({ _id: t._id, name: t.name || gang.name, kind: "SECTEUR" as const, x: centroid(t.points).x, y: centroid(t.points).y, color: t.color ?? gang.color, points: t.points })),
    ...(gang.hqX != null ? [{ _id: "hq", name: "QG", kind: "LIEU" as const, x: gang.hqX, y: gang.hqY, color: gang.color }] : []),
  ];
  return <LosSantosMap imageUrl={data?.imageUrl ?? null} markers={markers} height={260} />;
}

function centroid(points: { x: number; y: number }[]) {
  if (!points.length) return { x: 50, y: 50 };
  return { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length };
}

function SetHqButton({ gangId, hq }: { gangId: Id<"dbGangs">; hq: { x: number; y: number } | null }) {
  const setHq = useMutation(api.detectiveGangs.setGangHq);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pt, setPt] = useState<{ x: number; y: number } | null>(hq);
  const data = useQuery(api.carte.get);
  if (!open) return <Button variant="ghost" onClick={() => setOpen(true)}><MapIcon className="h-4 w-4" /> {hq ? "Déplacer le QG" : "Placer le QG"}</Button>;
  return (
    <div className="flex flex-col gap-2">
      <LosSantosMap imageUrl={data?.imageUrl ?? null} pin={pt} onPick={(x, y) => setPt({ x, y })} height={260} />
      <div className="flex gap-2">
        <Button variant="primary" disabled={!pt} onClick={async () => { await toast.guard(setHq({ gangId, x: pt!.x, y: pt!.y }), "Action impossible"); setOpen(false); }}>Enregistrer le QG</Button>
        {hq && <Button variant="ghost" onClick={async () => { await toast.guard(setHq({ gangId, x: null, y: null }), ""); setOpen(false); }}>Retirer</Button>}
        <Button variant="ghost" onClick={() => setOpen(false)}>Fermer</Button>
      </div>
    </div>
  );
}

function TerritoryPanel({ gangId, color, onClose }: { gangId: Id<"dbGangs">; color: string | null; onClose: () => void }) {
  const add = useMutation(api.detectiveGangs.territoryAdd);
  const toast = useToast();
  const data = useQuery(api.carte.get);
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Nouveau territoire" onClose={onClose} width={560}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" loading={busy} disabled={points.length < 3} onClick={async () => { setBusy(true); const r = await toast.guard(add({ gangId, name: name.trim() || undefined, points, color: color ?? undefined }), "Création impossible"); setBusy(false); if (r !== undefined) { toast.success("Territoire ajouté."); onClose(); } }}>Enregistrer</Button></div>}>
      <div className="flex flex-col gap-[12px]">
        <Field label="Nom (optionnel)"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Ex. Grove Street" /></Field>
        <div className="text-[12px] text-muted">Cliquez sur la carte pour tracer le contour (au moins 3 points).</div>
        <LosSantosMap imageUrl={data?.imageUrl ?? null} draft={points} draftColor={color ?? "#8b5cf6"} onPick={(x, y) => setPoints((p) => [...p, { x, y }])} height={340} />
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-faint">{points.length} point(s)</span>
          {points.length > 0 && <button onClick={() => setPoints((p) => p.slice(0, -1))} className="text-danger hover:underline">retirer le dernier</button>}
        </div>
      </div>
    </Modal>
  );
}

function GlobalMap({ divisionId, onBack }: { divisionId: Id<"divisions">; onBack: () => void }) {
  const data = useQuery(api.detectiveGangs.globalMap, { divisionId });
  const carte = useQuery(api.carte.get);
  const markers = data ? [
    ...data.territories.map((t) => ({ _id: t._id, name: t.name, kind: "SECTEUR" as const, x: centroid(t.points).x, y: centroid(t.points).y, color: t.color, points: t.points })),
    ...data.hqs.map((h) => ({ _id: `hq-${h.gangId}`, name: `QG ${h.gangName}`, kind: "LIEU" as const, x: h.x, y: h.y, color: h.color })),
  ] : [];
  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-sm border border-border hover:bg-surface-2"><ArrowLeft className="h-4 w-4" /></button>
        <h2 className="m-0 text-[18px] font-bold">Carte globale des territoires</h2>
      </div>
      {data === undefined ? <SkeletonRows rows={4} /> : <LosSantosMap imageUrl={carte?.imageUrl ?? null} markers={markers} height={560} />}
    </div>
  );
}

function GangPanel({ divisionId, existing, onClose, onCreated }: { divisionId: Id<"divisions">; existing?: any; onClose: () => void; onCreated?: (id: Id<"dbGangs">) => void }) {
  const create = useMutation(api.detectiveGangs.createGang);
  const update = useMutation(api.detectiveGangs.updateGang);
  const toast = useToast();
  const [name, setName] = useState(existing?.name ?? "");
  const [orgType, setOrgType] = useState(existing?.orgType ?? "GANG");
  const [subDivision, setSubDivision] = useState(existing?.subDivision ?? "");
  const [color, setColor] = useState(existing?.color ?? "#8b5cf6");
  const [logo, setLogo] = useState<string | null>(existing?.logoUrl ?? null);
  const [territoryText, setTerritoryText] = useState(existing?.territoryText ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim()) { toast.error("Nom requis."); return; }
    setBusy(true);
    const base: any = { name: name.trim(), orgType, subDivision: (subDivision || null) as any, color, logoUrl: logo, territoryText: territoryText.trim() || undefined, description: description || undefined };
    if (existing) { await toast.guard(update({ gangId: existing._id, ...base }), "Enregistrement impossible"); setBusy(false); toast.success("Mis à jour."); onClose(); }
    else { const id = await toast.guard(create({ divisionId, ...base }), "Création impossible"); setBusy(false); if (id) { toast.success("Organisation créée."); onCreated?.(id as Id<"dbGangs">); } }
  };
  return (
    <Modal title={existing ? "Modifier l'organisation" : "Nouvelle organisation"} onClose={onClose} width={540}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" loading={busy} onClick={submit}>{existing ? "Enregistrer" : "Créer"}</Button></div>}>
      <div className="flex flex-col gap-[14px]">
        <Field label="Logo"><PhotoField value={logo} onChange={setLogo} /></Field>
        <Field label="Nom"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
        <div className="grid grid-cols-3 gap-[12px]">
          <Field label="Type"><select value={orgType} onChange={(e) => setOrgType(e.target.value)} className={selectCls}>{Object.entries(ORG_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Sous-div."><select value={subDivision} onChange={(e) => setSubDivision(e.target.value)} className={selectCls}><option value="">-</option><option value="GND">GND</option><option value="HRD">HRD</option></select></Field>
          <Field label="Couleur"><input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-full rounded-sm border border-border bg-surface-2" /></Field>
        </div>
        <Field label="Territoire (texte)"><input value={territoryText} onChange={(e) => setTerritoryText(e.target.value)} className={inputCls} placeholder="Ex. Sud de la ville" /></Field>
        <Field label="Présentation"><DetectiveEditor value={existing?.description ?? ""} onChange={setDescription} divisionId={divisionId} minHeight={140} /></Field>
      </div>
    </Modal>
  );
}
