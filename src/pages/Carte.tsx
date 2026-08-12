import { useRef, useState } from "react";
import { Plus, Save, Share2, Copy, Trash2, MapIcon, X, Eye } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useToast } from "@/providers/toast";
import { TacticalMap, type TacticalMapHandle, type Shape } from "@/components/carte/TacticalMap";
import { EmptyState } from "@/components/common/EmptyState";

function parse(s: string): Shape[] { try { return JSON.parse(s) as Shape[]; } catch { return []; } }

export function Carte() {
  const toast = useToast();
  const mine = useQuery(api.plans.mine);
  const [openId, setOpenId] = useState<Id<"mapPlans"> | null>(null);
  const [code, setCode] = useState("");
  const [viewCode, setViewCode] = useState<string | null>(null);
  const [style, setStyle] = useState<"atlas" | "satellite">("atlas");

  const plan = useQuery(api.plans.get, openId ? { planId: openId } : "skip");
  const shared = useQuery(api.plans.byCode, viewCode ? { code: viewCode } : "skip");

  const create = useMutation(api.plans.create);
  const save = useMutation(api.plans.save);
  const remove = useMutation(api.plans.remove);
  const mapRef = useRef<TacticalMapHandle>(null);

  async function newPlan() {
    const name = window.prompt("Nom du plan :")?.trim();
    if (!name) return;
    const id = await toast.guard(create({ name }), "Création impossible");
    if (id) { setViewCode(null); setOpenId(id as Id<"mapPlans">); }
  }

  async function doSave() {
    if (!openId || !mapRef.current) return;
    const shapes = JSON.stringify(mapRef.current.getShapes());
    const r = await toast.guard(save({ planId: openId, shapes }), "Enregistrement impossible");
    if (r !== undefined) toast.success("Plan enregistré.");
  }

  function openShared() {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setOpenId(null); setViewCode(c);
  }

  const styleToggle = (
    <div className="flex gap-[2px] rounded-card border border-border bg-surface p-[4px]">
      {(["atlas", "satellite"] as const).map((s) => (
        <button key={s} onClick={() => setStyle(s)} className="rounded-[6px] px-[10px] py-[5px] text-[11.5px] font-semibold capitalize hover:bg-surface-2" style={style === s ? { background: "var(--surface-2)", color: "var(--text)" } : { color: "var(--muted)" }}>{s}</button>
      ))}
    </div>
  );

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[16px] flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Carte</h1>
        <span className="text-[12.5px] text-muted">Tes plans personnels sur la carte de Los Santos. Partage-les par code.</span>
        <div className="flex-1" />
        {styleToggle}
        <button onClick={newPlan} className="flex items-center gap-[6px] rounded-sm bg-accent px-[13px] py-[8px] text-[12.5px] font-semibold text-accent-contrast hover:brightness-[1.06]">
          <Plus className="h-[15px] w-[15px]" /> Nouveau plan
        </button>
      </div>

      <div className="grid grid-cols-[1fr_290px] items-start gap-[18px]">
        <div className="rounded-card border border-border bg-surface p-2">
          {viewCode ? (
            shared === undefined ? <Placeholder text="Chargement du plan partagé…" />
            : shared === null ? <Placeholder text="Aucun plan ne correspond à ce code." />
            : <TacticalMap key={`shared-${viewCode}`} readOnly style={style} initialShapes={parse(shared.shapes)} height={560} />
          ) : openId ? (
            plan === undefined ? <Placeholder text="Chargement…" />
            : plan === null ? <Placeholder text="Plan introuvable." />
            : <TacticalMap key={openId} ref={mapRef} style={style} initialShapes={parse(plan.shapes)} height={560} />
          ) : (
            <Placeholder text="Crée un nouveau plan ou ouvre-en un pour commencer à dessiner." />
          )}
        </div>

        <div className="flex flex-col gap-[14px]">
          {/* Plan en cours */}
          {viewCode && shared ? (
            <div className="rounded-card border border-accent bg-surface p-4">
              <div className="mb-[6px] flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-accent"><Eye className="h-[13px] w-[13px]" /> Plan partagé</div>
              <div className="text-[14px] font-bold">{shared.name}</div>
              <div className="mt-[2px] text-[12px] text-muted">par {shared.owner} · lecture seule</div>
              <button onClick={() => { setViewCode(null); setCode(""); }} className="mt-[10px] flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-3 py-[8px] text-[12.5px] font-semibold hover:border-border-strong"><X className="h-[14px] w-[14px]" /> Fermer</button>
            </div>
          ) : openId && plan ? (
            <div className="rounded-card border border-accent bg-surface p-4">
              <div className="mb-[8px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Plan en cours</div>
              <div className="mb-[10px] text-[14px] font-bold">{plan.name}</div>
              <button onClick={doSave} className="mb-[8px] flex w-full items-center justify-center gap-[7px] rounded-sm bg-accent px-3 py-[9px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]">
                <Save className="h-[15px] w-[15px]" /> Enregistrer
              </button>
              <div className="rounded-sm border border-border bg-surface-2 p-[10px]">
                <div className="mb-[5px] flex items-center gap-[6px] text-[11px] font-bold uppercase tracking-[0.08em] text-faint"><Share2 className="h-[12px] w-[12px]" /> Code de partage</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 select-all rounded-sm border border-border bg-surface px-2 py-[6px] font-data text-[13px] font-bold tracking-[0.08em]">{plan.shareCode}</code>
                  <button onClick={() => { void navigator.clipboard.writeText(plan.shareCode); toast.success("Code copié."); }} className="rounded-sm border border-border bg-surface px-[9px] py-[6px] text-muted hover:border-border-strong"><Copy className="h-[13px] w-[13px]" /></button>
                </div>
                <div className="mt-[6px] text-[11px] text-faint">Partage ce code : n'importe quel agent pourra voir ce plan (lecture seule).</div>
              </div>
            </div>
          ) : null}

          {/* Ouvrir un plan partagé */}
          <div className="rounded-card border border-border bg-surface p-4">
            <div className="mb-[8px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Ouvrir un plan partagé</div>
            <div className="flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") openShared(); }} placeholder="CODE-XXXX" className="h-9 flex-1 rounded-sm border border-border bg-surface-2 px-3 font-data text-[13px] outline-none focus:border-accent" />
              <button onClick={openShared} disabled={!code.trim()} className="rounded-sm bg-accent px-3 text-[12.5px] font-semibold text-accent-contrast disabled:opacity-50">Ouvrir</button>
            </div>
          </div>

          {/* Mes plans */}
          <div className="rounded-card border border-border bg-surface p-4">
            <div className="mb-[10px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Mes plans</div>
            {mine === undefined ? (
              <div className="text-[12.5px] text-faint">Chargement…</div>
            ) : mine.length === 0 ? (
              <EmptyState compact title="Aucun plan" message="Crée ton premier plan." />
            ) : (
              <div className="flex flex-col gap-[6px]">
                {mine.map((p) => (
                  <div key={p._id} className={`flex items-center gap-2 rounded-sm border px-[10px] py-[7px] ${openId === p._id ? "border-accent" : "border-border"} bg-surface-2`}>
                    <MapIcon className="h-[14px] w-[14px] text-muted" />
                    <button onClick={() => { setViewCode(null); setOpenId(p._id as Id<"mapPlans">); }} className="flex-1 truncate text-left text-[13px] font-semibold hover:text-accent">{p.name}</button>
                    <button onClick={() => toast.guard(remove({ planId: p._id as Id<"mapPlans"> }), "Suppression impossible").then((r) => { if (r !== undefined && openId === p._id) setOpenId(null); })} className="text-faint hover:text-danger"><Trash2 className="h-[13px] w-[13px]" /></button>
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

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center rounded-sm border border-dashed border-border bg-surface-2 text-center text-[13px] text-faint" style={{ height: 560 }}>
      <span className="max-w-[320px] px-6">{text}</span>
    </div>
  );
}
