import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, Search, Trash2, Map as MapIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { useToast } from "@/providers/toast";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { LosSantosMap } from "@/components/carte/LosSantosMap";
import { DetectiveEditor } from "./DetectiveEditor";
import { MediaField, MediaView } from "./media";
import { MapPickField } from "./MapField";
import { GangPicker } from "./pickers";
import { useDialogs } from "./dialogs";
import { DRUG_KIND, Field, inputCls, selectCls, filterSelectCls, dtShort } from "./ui";

export function DrugsSection({ divisionId, canWrite }: { divisionId: Id<"divisions">; canWrite: boolean }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [mapView, setMapView] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const carte = useQuery(api.carte.get);
  const list = useQuery(api.detectiveGangs.listDrugSites, { divisionId, kind: (kind || undefined) as any, q: q.trim() || undefined });

  const markers = (list ?? []).filter((d) => d.x != null).map((d) => ({ _id: d._id, name: d.name, kind: "LIEU" as const, x: d.x!, y: d.y!, color: d.kind === "LABO" ? "#d94040" : "#e0a030" }));

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un point / labo…" className={`${inputCls} pl-9`} />
        </div>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={filterSelectCls}>
          <option value="">Tous</option>{Object.entries(DRUG_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Button variant="secondary" onClick={() => setMapView((v) => !v)}><MapIcon className="h-4 w-4" /> {mapView ? "Liste" : "Carte"}</Button>
        {canWrite && <Button variant="primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Ajouter</Button>}
      </div>

      {mapView ? <LosSantosMap imageUrl={carte?.imageUrl ?? null} markers={markers} height={520} /> :
        list === undefined ? <SkeletonRows rows={4} /> : list.length === 0 ? <EmptyState title="Aucun point recensé" message="Recensez points de vente et labos." /> : (
          <div className="grid grid-cols-1 gap-[8px] sm:grid-cols-2 lg:grid-cols-3">
            {list.map((d) => (
              <button key={d._id} onClick={() => setEditing(d)} className="flex flex-col gap-1 rounded-card border border-border bg-surface p-[12px] text-left hover:border-border-strong">
                <div className="flex items-center gap-2">
                  <span className="rounded-[4px] px-1.5 py-px text-[10px] font-bold uppercase" style={{ background: d.kind === "LABO" ? "color-mix(in srgb, #d94040 16%, transparent)" : "color-mix(in srgb, #e0a030 16%, transparent)", color: d.kind === "LABO" ? "#d94040" : "#e0a030" }}>{DRUG_KIND[d.kind]}</span>
                  {d.gangName && <span className="truncate text-[11px] text-muted">{d.gangName}</span>}
                </div>
                <div className="text-[13.5px] font-semibold">{d.name}</div>
                {d.drugTypes && <div className="text-[11.5px] text-muted">{d.drugTypes}</div>}
                <div className="text-[11px] text-faint">{dtShort(d.at)}{d.x != null ? " · localisé" : ""}</div>
              </button>
            ))}
          </div>
        )}

      {creating && <DrugPanel divisionId={divisionId} onClose={() => setCreating(false)} />}
      {editing && <DrugPanel divisionId={divisionId} existing={editing} canWrite={canWrite} onClose={() => setEditing(null)} />}
    </div>
  );
}

function DrugPanel({ divisionId, existing, canWrite = true, onClose }: { divisionId: Id<"divisions">; existing?: any; canWrite?: boolean; onClose: () => void }) {
  const create = useMutation(api.detectiveGangs.createDrugSite);
  const update = useMutation(api.detectiveGangs.updateDrugSite);
  const remove = useMutation(api.detectiveGangs.removeDrugSite);
  const toast = useToast();
  const { confirm } = useDialogs();
  const readOnly = existing && !canWrite;
  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState(existing?.kind ?? "POINT_VENTE");
  const [gang, setGang] = useState<{ gangId: Id<"dbGangs">; name: string } | null>(existing?.gangId ? { gangId: existing.gangId, name: existing.gangName ?? "Organisation" } : null);
  const [drugTypes, setDrugTypes] = useState(existing?.drugTypes ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [loc, setLoc] = useState<{ x: number; y: number } | null>(existing?.x != null ? { x: existing.x, y: existing.y } : null);
  const [media, setMedia] = useState<string[]>(existing?.mediaUrls ?? []);
  const [busy, setBusy] = useState(false);

  if (readOnly) {
    return (
      <Modal title={existing.name} onClose={onClose} width={520}>
        <div className="flex flex-col gap-3">
          <div className="text-[12px] text-muted">{DRUG_KIND[existing.kind]}{existing.gangName ? ` · ${existing.gangName}` : ""}{existing.drugTypes ? ` · ${existing.drugTypes}` : ""}</div>
          {existing.note && <DetectiveEditor value={existing.note} editable={false} divisionId={divisionId} minHeight={0} />}
          {existing.mediaUrls?.length > 0 && <MediaView urls={existing.mediaUrls} />}
        </div>
      </Modal>
    );
  }

  const submit = async () => {
    if (!name.trim()) { toast.error("Nom requis."); return; }
    setBusy(true);
    const base: any = { name: name.trim(), kind, gangId: gang?.gangId ?? (existing ? null : undefined), drugTypes: drugTypes.trim() || undefined, note: note || undefined, x: loc?.x ?? (existing ? null : undefined), y: loc?.y ?? (existing ? null : undefined), mediaUrls: media };
    if (existing) { await toast.guard(update({ id: existing._id, ...base }), "Enregistrement impossible"); setBusy(false); toast.success("Mis à jour."); onClose(); }
    else { const r = await toast.guard(create({ divisionId, ...base }), "Création impossible"); setBusy(false); if (r !== undefined) { toast.success("Ajouté."); onClose(); } }
  };

  return (
    <Modal title={existing ? "Modifier" : "Nouveau point / labo"} onClose={onClose} width={560}
      footer={<div className="flex justify-between">{existing && canWrite ? <Button variant="danger" onClick={async () => { if (await confirm({ title: "Supprimer ce point / labo ?", danger: true, confirmLabel: "Supprimer" })) { await toast.guard(remove({ id: existing._id }), "Suppression impossible"); onClose(); } }}><Trash2 className="h-4 w-4" /></Button> : <span />}<div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" loading={busy} onClick={submit}>{existing ? "Enregistrer" : "Créer"}</Button></div></div>}>
      <div className="flex flex-col gap-[14px]">
        <div className="grid grid-cols-2 gap-[12px]">
          <Field label="Nom"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
          <Field label="Type"><select value={kind} onChange={(e) => setKind(e.target.value)} className={selectCls}>{Object.entries(DRUG_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        <Field label="Organisation affiliée (optionnel)">{gang ? <div className="flex items-center justify-between rounded-sm border border-border bg-surface-2 px-3 py-2 text-[13px]"><span>{gang.name}</span><button onClick={() => setGang(null)} className="text-[12px] text-danger hover:underline">Retirer</button></div> : <GangPicker divisionId={divisionId} onPick={setGang} />}</Field>
        <Field label="Produits"><input value={drugTypes} onChange={(e) => setDrugTypes(e.target.value)} className={inputCls} placeholder="Ex. Cocaïne, méthamphétamine" /></Field>
        <Field label="Emplacement"><MapPickField value={loc} onChange={setLoc} /></Field>
        <Field label="Note"><DetectiveEditor value={existing?.note ?? ""} onChange={setNote} divisionId={divisionId} minHeight={120} /></Field>
        <Field label="Médias"><MediaField value={media} onChange={setMedia} /></Field>
      </div>
    </Modal>
  );
}
