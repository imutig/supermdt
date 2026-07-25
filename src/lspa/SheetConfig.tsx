import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, ChevronUp, ChevronDown, Trash2, Pencil, ArrowLeft, ClipboardList, Clock, PenLine, Tag } from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { SkeletonRows } from "@/components/common/Skeleton";
import { useToast } from "@/providers/toast";

type Kind = "MANUAL" | "TIME" | "QUIZ_CATEGORY";
type Bracket = { maxSeconds?: number; points: number; eliminate?: boolean };
type Item = {
  _id: string; section: string; label: string; kind: Kind; maxPoints: number;
  allowEliminate: boolean; timeBrackets: Bracket[]; categoryId: string | null; categoryName: string | null;
};

const KIND_LABEL: Record<Kind, { label: string; icon: typeof PenLine }> = {
  MANUAL: { label: "Points saisis", icon: PenLine },
  TIME: { label: "Temps chronométré", icon: Clock },
  QUIZ_CATEGORY: { label: "Catégorie de quiz (auto)", icon: Tag },
};

// Configuration de la fiche de notation : sections et critères, entièrement
// réglables (barèmes, paliers de temps, catégories notées).
export function SheetConfigModal({ onClose }: { onClose: () => void }) {
  const items = useQuery(api.grading.listItems);
  const seed = useMutation(api.grading.seedDefault);
  const move = useMutation(api.grading.moveItem);
  const remove = useMutation(api.grading.removeItem);
  const toast = useToast();
  const [editing, setEditing] = useState<Item | "new" | null>(null);

  if (editing) return <ItemForm item={editing === "new" ? null : editing} onClose={() => setEditing(null)} onDone={() => setEditing(null)} />;

  return (
    <Modal title="Fiche de notation" icon={<ClipboardList className="h-[17px] w-[17px]" />} onClose={onClose} width={560}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Fermer</Button>
        <Button variant="primary" onClick={() => setEditing("new")}><Plus className="h-[15px] w-[15px]" /> Ajouter un critère</Button>
      </>}
    >
      {items === undefined ? <SkeletonRows rows={6} /> : items.length === 0 ? (
        <div className="flex flex-col items-center gap-[12px] py-6 text-center">
          <div className="text-[13px] text-muted">Aucune fiche configurée.</div>
          <Button variant="primary" onClick={() => void toast.guard(seed({}), "Création impossible")}>Créer la fiche par défaut</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-[6px]">
          {items.map((it, idx) => {
            const K = KIND_LABEL[it.kind as Kind];
            return (
              <div key={it._id} className="flex items-center gap-[9px] rounded-sm border border-border bg-surface-2 px-[11px] py-[8px]">
                <span className="w-[86px] flex-shrink-0 truncate text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">{it.section}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{it.label}</div>
                  <div className="flex items-center gap-[5px] text-[11px] text-faint"><K.icon className="h-[11px] w-[11px]" /> {K.label} · /{it.maxPoints}{it.categoryName ? ` · ${it.categoryName}` : ""}</div>
                </div>
                <button disabled={idx === 0} onClick={() => void move({ itemId: it._id as Id<"gradingItems">, direction: "up" })} className="text-faint hover:text-text disabled:opacity-30"><ChevronUp className="h-[15px] w-[15px]" /></button>
                <button disabled={idx === items.length - 1} onClick={() => void move({ itemId: it._id as Id<"gradingItems">, direction: "down" })} className="text-faint hover:text-text disabled:opacity-30"><ChevronDown className="h-[15px] w-[15px]" /></button>
                <button onClick={() => setEditing(it as Item)} className="text-faint hover:text-text"><Pencil className="h-[13px] w-[13px]" /></button>
                <button onClick={() => void remove({ itemId: it._id as Id<"gradingItems"> })} className="text-faint hover:text-danger"><Trash2 className="h-[13px] w-[13px]" /></button>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function ItemForm({ item, onClose, onDone }: { item: Item | null; onClose: () => void; onDone: () => void }) {
  const save = useMutation(api.grading.saveItem);
  const categories = useQuery(api.quiz.listCategories);
  const toast = useToast();
  const [section, setSection] = useState(item?.section ?? "");
  const [label, setLabel] = useState(item?.label ?? "");
  const [kind, setKind] = useState<Kind>(item?.kind ?? "MANUAL");
  const [maxPoints, setMaxPoints] = useState(item?.maxPoints ?? 10);
  const [allowEliminate, setAllowEliminate] = useState(item?.allowEliminate ?? false);
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? "");
  const [brackets, setBrackets] = useState<Bracket[]>(item?.timeBrackets?.length ? item.timeBrackets : [{ maxSeconds: 30, points: 10 }, { eliminate: true, points: 0 }]);
  const [busy, setBusy] = useState(false);
  const F = "h-9 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";

  async function submit() {
    if (!section.trim() || !label.trim()) return;
    setBusy(true);
    const r = await toast.guard(save({
      itemId: item ? (item._id as Id<"gradingItems">) : undefined,
      section, label, kind, maxPoints,
      allowEliminate: kind === "MANUAL" ? allowEliminate : undefined,
      timeBrackets: kind === "TIME" ? brackets : undefined,
      categoryId: kind === "QUIZ_CATEGORY" && categoryId ? (categoryId as Id<"quizCategories">) : undefined,
    }), "Enregistrement impossible");
    setBusy(false);
    if (r) onDone();
  }

  return (
    <Modal title={item ? "Modifier le critère" : "Nouveau critère"} onClose={onClose} width={520}
      footer={<>
        <Button variant="ghost" onClick={onClose}><ArrowLeft className="h-[14px] w-[14px]" /> Retour</Button>
        <Button variant="primary" loading={busy} disabled={!section.trim() || !label.trim()} onClick={() => void submit()}>Enregistrer</Button>
      </>}
    >
      <div className="flex flex-col gap-[12px]">
        <div className="grid grid-cols-2 gap-[10px]">
          <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Section</span><input value={section} onChange={(e) => setSection(e.target.value)} placeholder="Tir, Conduite…" className={F} /></label>
          <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Barème</span><input type="number" min={0} step={0.5} value={maxPoints} onChange={(e) => setMaxPoints(Number(e.target.value))} className={`${F} font-data`} /></label>
        </div>
        <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Libellé</span><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Circuit court 1…" className={F} /></label>

        <div className="flex flex-col gap-[5px]">
          <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Type de notation</span>
          <div className="grid grid-cols-3 gap-[6px]">
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => {
              const K = KIND_LABEL[k];
              return (
                <button key={k} onClick={() => setKind(k)} className="mdt-press flex flex-col items-center gap-[4px] rounded-[9px] border p-[9px] text-center" style={{ borderColor: kind === k ? "var(--accent)" : "var(--border)", background: kind === k ? "var(--accent-soft)" : "var(--surface-2)" }}>
                  <K.icon className="h-[15px] w-[15px]" style={{ color: kind === k ? "var(--accent)" : "var(--faint)" }} />
                  <span className="text-[10.5px] font-semibold leading-tight" style={{ color: kind === k ? "var(--accent)" : "var(--muted)" }}>{K.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {kind === "MANUAL" && (
          <label className="flex cursor-pointer items-center gap-[8px] text-[13px]">
            <input type="checkbox" checked={allowEliminate} onChange={(e) => setAllowEliminate(e.target.checked)} className="h-[15px] w-[15px] accent-[var(--accent)]" />
            Autoriser l'élimination sur ce critère (ex. otage touché)
          </label>
        )}

        {kind === "QUIZ_CATEGORY" && (
          <label className="flex flex-col gap-[5px]">
            <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Catégorie notée</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={F}>
              <option value="">Choisir une catégorie…</option>
              {(categories ?? []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <span className="text-[11px] text-faint">Les points sont la moyenne du cadet dans cette catégorie, ramenée au barème.</span>
          </label>
        )}

        {kind === "TIME" && (
          <div className="flex flex-col gap-[6px]">
            <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Paliers de temps</span>
            {brackets.map((b, i) => (
              <div key={i} className="flex items-center gap-[7px]">
                <span className="text-[11.5px] text-faint">moins de</span>
                <input type="number" min={0} value={b.maxSeconds ?? ""} placeholder="∞" onChange={(e) => setBrackets((s) => s.map((x, j) => j === i ? { ...x, maxSeconds: e.target.value === "" ? undefined : Number(e.target.value) } : x))} className="h-8 w-[70px] rounded-sm border border-border bg-surface-2 px-2 text-center font-data text-[12.5px] outline-none focus:border-accent" />
                <span className="text-[11.5px] text-faint">s →</span>
                {b.eliminate ? (
                  <span className="flex-1 text-[12.5px] font-semibold text-danger">Élimination</span>
                ) : (
                  <><input type="number" min={0} value={b.points} onChange={(e) => setBrackets((s) => s.map((x, j) => j === i ? { ...x, points: Number(e.target.value) } : x))} className="h-8 w-[60px] rounded-sm border border-border bg-surface-2 px-2 text-center font-data text-[12.5px] outline-none focus:border-accent" /><span className="text-[11.5px] text-faint">pts</span></>
                )}
                <div className="flex-1" />
                <label className="flex items-center gap-[4px] text-[11px] text-muted"><input type="checkbox" checked={!!b.eliminate} onChange={(e) => setBrackets((s) => s.map((x, j) => j === i ? { ...x, eliminate: e.target.checked } : x))} className="h-[13px] w-[13px] accent-[var(--danger)]" /> élim.</label>
                <button onClick={() => setBrackets((s) => s.filter((_, j) => j !== i))} className="text-faint hover:text-danger"><Trash2 className="h-[13px] w-[13px]" /></button>
              </div>
            ))}
            <button onClick={() => setBrackets((s) => [...s, { maxSeconds: undefined, points: 0 }])} className="self-start text-[12px] font-semibold text-accent hover:underline">+ Ajouter un palier</button>
            <span className="text-[11px] text-faint">Laissez « moins de » vide pour le dernier palier (au-delà de tout).</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
