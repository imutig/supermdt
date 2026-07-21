import { useState } from "react";
import { X, Plus } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useToast } from "@/providers/toast";

type Flag = { _id: string; flagTypeId: string; name: string; color?: string | null; note?: string | null };

// Pose / retrait des signalements (flags) d'un citoyen.
export function FlagsManager({ citizenId, flags, canManage }: {
  citizenId: Id<"citizens">;
  flags: Flag[];
  canManage: boolean;
}) {
  const types = useQuery(api.citizens.flagTypes) ?? [];
  const setFlag = useMutation(api.citizens.setFlag);
  const removeFlag = useMutation(api.citizens.removeFlag);
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [note, setNote] = useState("");

  const held = new Set(flags.map((f) => f.flagTypeId));
  const available = types.filter((t) => !held.has(t._id));

  async function submit() {
    const id = typeId || available[0]?._id;
    if (!id) return;
    const r = await toast.guard(setFlag({ citizenId, flagTypeId: id as Id<"flagTypes">, note: note.trim() || undefined }), "Ajout impossible");
    if (r !== undefined) { toast.success("Signalement posé."); setAdding(false); setTypeId(""); setNote(""); }
  }

  return (
    <div>
      {flags.length === 0 ? (
        <div className="text-[12.5px] text-faint">Aucun signalement.</div>
      ) : (
        <div className="flex flex-col gap-[6px]">
          {flags.map((f) => (
            <div key={f._id} className="flex items-center gap-2 rounded-sm border px-[10px] py-[7px]" style={{ borderColor: f.color ?? "var(--border)", background: `color-mix(in srgb, ${f.color ?? "var(--muted)"} 8%, transparent)` }}>
              <span className="text-[12.5px] font-semibold" style={{ color: f.color ?? "var(--text)" }}>{f.name}</span>
              {f.note && <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">{f.note}</span>}
              <div className="flex-1" />
              {canManage && (
                <button onClick={() => toast.guard(removeFlag({ id: f._id as Id<"citizenFlags"> }), "Retrait impossible")} className="text-faint hover:text-danger"><X className="h-[14px] w-[14px]" /></button>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && available.length > 0 && (
        adding ? (
          <div className="mt-2 rounded-sm border border-border bg-surface-2 p-3">
            <select value={typeId || available[0]._id} onChange={(e) => setTypeId(e.target.value)} className="mb-2 h-9 w-full rounded-sm border border-border bg-surface px-2 text-[12.5px] outline-none focus:border-accent">
              {available.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Précision (optionnel)…" className="mb-2 h-9 w-full rounded-sm border border-border bg-surface px-2 text-[12.5px] outline-none focus:border-accent" />
            <div className="flex gap-2">
              <button onClick={() => setAdding(false)} className="rounded-sm border border-border bg-surface px-3 py-[7px] text-[12px] font-semibold hover:border-border-strong">Annuler</button>
              <button onClick={submit} className="flex-1 rounded-sm bg-accent px-3 py-[7px] text-[12px] font-semibold text-accent-contrast hover:brightness-[1.06]">Poser</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="mt-2 flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-[11px] py-[7px] text-[12px] font-semibold text-muted hover:border-accent hover:text-accent">
            <Plus className="h-[14px] w-[14px]" /> Poser un signalement
          </button>
        )
      )}
    </div>
  );
}
