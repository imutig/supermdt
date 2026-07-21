import { useState } from "react";
import { Trash2, ImageIcon } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { LosSantosMap } from "@/components/carte/LosSantosMap";
import { EmptyState } from "@/components/common/EmptyState";

export function Carte() {
  const data = useQuery(api.carte.get);
  const { can } = useCan();
  const toast = useToast();
  const canManage = can("carte.create") || can("carte.edit") || can("carte.delete");
  const canDeleteLoc = can("carte.delete");
  const canEditMap = can("carte.edit");
  const addLocation = useMutation(api.carte.addLocation);
  const removeLocation = useMutation(api.carte.removeLocation);
  const setImage = useMutation(api.carte.setImage);

  const [mode, setMode] = useState<"LIEU" | "SECTEUR">("LIEU");
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number }[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#49A24A");
  const [imgInput, setImgInput] = useState("");
  const [showImg, setShowImg] = useState(false);

  function onPick(x: number, y: number) {
    if (mode === "LIEU") setPending({ x, y });
    else setDraft((d) => [...d, { x, y }]);
  }

  function switchMode(m: "LIEU" | "SECTEUR") {
    setMode(m);
    setPending(null);
    setDraft([]);
    setName("");
  }

  async function confirmLieu() {
    if (!pending || !name.trim()) return;
    const r = await toast.guard(addLocation({ name: name.trim(), kind: "LIEU", x: pending.x, y: pending.y, color }), "Ajout impossible");
    if (r !== undefined) {
      toast.success("Lieu ajouté.");
      setPending(null);
      setName("");
    }
  }

  async function confirmSecteur() {
    if (draft.length < 3 || !name.trim()) return;
    const cx = Math.round((draft.reduce((s, p) => s + p.x, 0) / draft.length) * 10) / 10;
    const cy = Math.round((draft.reduce((s, p) => s + p.y, 0) / draft.length) * 10) / 10;
    const r = await toast.guard(addLocation({ name: name.trim(), kind: "SECTEUR", x: cx, y: cy, color, points: draft }), "Ajout impossible");
    if (r !== undefined) {
      toast.success("Secteur ajouté.");
      setDraft([]);
      setName("");
    }
  }

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[16px] flex items-center gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Carte de Los Santos</h1>
        <span className="text-[12.5px] text-muted">
          {canManage
            ? mode === "LIEU"
              ? "Cliquez sur la carte pour placer un lieu."
              : "Cliquez plusieurs points pour tracer la délimitation du secteur."
            : "Secteurs et lieux importants."}
        </span>
        <div className="flex-1" />
        {canEditMap && (
          <button onClick={() => { setShowImg(!showImg); setImgInput(data?.imageUrl ?? ""); }} className="flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-[12px] py-[8px] text-[12.5px] font-semibold hover:border-border-strong">
            <ImageIcon className="h-[14px] w-[14px]" /> Fond de carte
          </button>
        )}
      </div>

      {showImg && canEditMap && (
        <div className="mb-3 flex items-center gap-2 rounded-card border border-border bg-surface p-3">
          <input value={imgInput} onChange={(e) => setImgInput(e.target.value)} placeholder="URL de l'image de fond (carte Los Santos)…" className="h-9 flex-1 rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent" />
          <button onClick={async () => { const r = await toast.guard(setImage({ imageUrl: imgInput.trim() || undefined }), "Action impossible"); if (r !== undefined) { toast.success("Fond mis à jour."); setShowImg(false); } }} className="rounded-sm bg-accent px-4 py-[9px] text-[12.5px] font-semibold text-accent-contrast">Enregistrer</button>
        </div>
      )}

      <div className="grid grid-cols-[1fr_280px] items-start gap-[18px]">
        <div className="rounded-card border border-border bg-surface p-2">
          <LosSantosMap
            imageUrl={data?.imageUrl}
            markers={data?.locations ?? []}
            pin={mode === "LIEU" ? pending : null}
            draft={mode === "SECTEUR" ? draft : null}
            draftColor={color}
            onPick={canManage ? onPick : undefined}
            height={520}
          />
        </div>

        <div className="flex flex-col gap-[14px]">
          {canManage && (
            <div className="rounded-card border border-accent bg-surface p-4">
              <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Ajouter</div>
              <div className="mb-3 flex gap-2">
                <button onClick={() => switchMode("LIEU")} className="flex-1 rounded-sm border px-2 py-[6px] text-[12px] font-semibold" style={mode === "LIEU" ? { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent)" } : { borderColor: "var(--border)", color: "var(--muted)" }}>Lieu</button>
                <button onClick={() => switchMode("SECTEUR")} className="flex-1 rounded-sm border px-2 py-[6px] text-[12px] font-semibold" style={mode === "SECTEUR" ? { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent)" } : { borderColor: "var(--border)", color: "var(--muted)" }}>Secteur</button>
              </div>

              {/* Couleur */}
              <div className="mb-3 flex items-center gap-2">
                <span className="text-[11.5px] font-semibold text-muted">Couleur</span>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-10 cursor-pointer rounded-sm border border-border bg-surface-2 p-0" />
                <div className="flex gap-1">
                  {["#49A24A", "#2f6df0", "#e0b100", "#e0533d", "#8b5cf6", "#e05aa0"].map((c) => (
                    <button key={c} onClick={() => setColor(c)} className="h-5 w-5 rounded-full border" style={{ background: c, borderColor: color.toLowerCase() === c.toLowerCase() ? "var(--text)" : "var(--border)" }} />
                  ))}
                </div>
              </div>

              {mode === "LIEU" ? (
                pending ? (
                  <>
                    <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Nom du lieu" className="mb-2 h-9 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent" />
                    <div className="flex gap-2">
                      <button onClick={() => { setPending(null); setName(""); }} className="rounded-sm border border-border bg-surface-2 px-3 py-[8px] text-[12px] font-semibold hover:border-border-strong">Annuler</button>
                      <button onClick={confirmLieu} disabled={!name.trim()} className="flex-1 rounded-sm bg-accent px-3 py-[8px] text-[12px] font-semibold text-accent-contrast disabled:opacity-50">Ajouter</button>
                    </div>
                  </>
                ) : (
                  <div className="text-[11.5px] text-faint">Cliquez sur la carte pour choisir l'emplacement.</div>
                )
              ) : (
                <>
                  <div className="mb-2 text-[11.5px] text-muted">{draft.length === 0 ? "Cliquez sur la carte pour poser les sommets." : `${draft.length} sommet${draft.length > 1 ? "s" : ""} placé${draft.length > 1 ? "s" : ""}${draft.length < 3 ? " (min. 3)" : ""}.`}</div>
                  {draft.length > 0 && (
                    <div className="mb-2 flex gap-2">
                      <button onClick={() => setDraft((d) => d.slice(0, -1))} className="rounded-sm border border-border bg-surface-2 px-3 py-[7px] text-[12px] font-semibold hover:border-border-strong">Retirer dernier</button>
                      <button onClick={() => setDraft([])} className="rounded-sm border border-border bg-surface-2 px-3 py-[7px] text-[12px] font-semibold hover:border-border-strong">Effacer</button>
                    </div>
                  )}
                  {draft.length >= 3 && (
                    <>
                      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du secteur" className="mb-2 h-9 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent" />
                      <button onClick={confirmSecteur} disabled={!name.trim()} className="w-full rounded-sm bg-accent px-3 py-[8px] text-[12px] font-semibold text-accent-contrast disabled:opacity-50">Enregistrer le secteur</button>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          <div className="rounded-card border border-border bg-surface p-4">
            <div className="mb-[10px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Lieux &amp; secteurs</div>
            {(data?.locations ?? []).length === 0 ? (
              <EmptyState compact title="Aucun lieu défini" />
            ) : (
              <div className="flex flex-col gap-[6px]">
                {(data?.locations ?? []).map((l) => (
                  <div key={l._id} className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-[10px] py-[7px]">
                    <span className="h-[10px] w-[10px] flex-shrink-0 rounded-full border border-border" style={{ background: l.color ?? "var(--accent)" }} />
                    <span className="rounded-[4px] px-[6px] py-[1px] text-[9.5px] font-bold uppercase" style={{ background: "var(--surface)", color: "var(--muted)" }}>{l.kind === "LIEU" ? "Lieu" : "Secteur"}</span>
                    <span className="flex-1 text-[13px] font-semibold">{l.name}</span>
                    {canDeleteLoc && (
                      <button onClick={() => toast.guard(removeLocation({ id: l._id as Id<"mapLocations"> }), "Suppression impossible")} className="text-faint hover:text-danger"><Trash2 className="h-[13px] w-[13px]" /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
