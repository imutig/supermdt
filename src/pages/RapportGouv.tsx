import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, FileSignature, Wand2, Plus, Trash2, Download, Save, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";

type Honneur = { name: string; matricule?: string; reason?: string };
type Sections = { motChef: string; analyseCrime: string; operationsNotables: string; pointRH: string; objectifs: string; dataNote: string };
const EMPTY: Sections = { motChef: "", analyseCrime: "", operationsNotables: "", pointRH: "", objectifs: "", dataNote: "" };

export function RapportGouv() {
  const { can } = useCan();
  const [offset, setOffset] = useState(0);
  const bounds = useQuery(api.weeklyReport.weekBounds, can("rapportgouv.manage") ? { offset } : "skip");
  const overview = useQuery(api.weeklyReport.overview, bounds ? { from: bounds.from, to: bounds.to } : "skip");
  const save = useMutation(api.weeklyReport.saveSections);
  const generate = useAction(api.weeklyReport.generate);
  const toast = useToast();

  const [form, setForm] = useState<Sections>(EMPTY);
  const [honneur, setHonneur] = useState<Honneur[]>([]);
  const [busy, setBusy] = useState(false);
  const loadedKey = useRef<number | null>(null);

  useEffect(() => {
    if (overview && bounds && loadedKey.current !== bounds.from) {
      loadedKey.current = bounds.from;
      setForm({
        motChef: overview.sections.motChef, analyseCrime: overview.sections.analyseCrime,
        operationsNotables: overview.sections.operationsNotables, pointRH: overview.sections.pointRH,
        objectifs: overview.sections.objectifs, dataNote: overview.sections.dataNote,
      });
      setHonneur(overview.honneur ?? []);
    }
  }, [overview, bounds]);

  if (!can("rapportgouv.manage")) return <div className="p-[26px]"><EmptyState title="Accès restreint" message="Le rapport hebdomadaire est réservé à l'état-major." /></div>;

  const payloadArgs = bounds ? { weekStart: bounds.from, weekEnd: bounds.to, ...form, honneur: honneur.filter((h) => h.name.trim()) } : null;

  const doSave = async () => {
    if (!payloadArgs) return;
    const r = await toast.guard(save(payloadArgs), "Enregistrement impossible");
    if (r !== undefined) toast.success("Rapport enregistré.");
  };
  const doGenerate = async () => {
    if (!bounds || !payloadArgs) return;
    setBusy(true);
    const s = await toast.guard(save(payloadArgs), "Enregistrement impossible");
    if (s === undefined) { setBusy(false); return; }
    const r = await toast.guard(generate({ from: bounds.from, to: bounds.to }), "Génération impossible");
    setBusy(false);
    if (r?.url) { window.open(r.url, "_blank", "noopener"); toast.success("Rapport PDF généré."); }
  };

  const d = overview?.data;

  return (
    <div className="mx-auto w-full max-w-[1180px] p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[16px] flex flex-wrap items-center gap-3">
        <FileSignature className="h-[22px] w-[22px] text-accent" />
        <div className="flex-1">
          <h1 className="m-0 text-[21px] font-bold tracking-tight">Rapport hebdomadaire</h1>
          <div className="mt-[2px] text-[13px] text-muted">Rapport d'activité à l'attention du Gouvernement · document LaTeX généré à la demande.</div>
        </div>
        <div className="flex items-center gap-[6px] rounded-[9px] border border-border bg-surface px-[6px] py-[5px]">
          <button onClick={() => setOffset((o) => o - 1)} className="flex h-[28px] w-[28px] items-center justify-center rounded-sm hover:bg-surface-2"><ChevronLeft className="h-[16px] w-[16px]" /></button>
          <div className="min-w-[150px] text-center">
            <div className="text-[12.5px] font-bold">{bounds?.weekLabel ?? "…"}</div>
            <div className="text-[10.5px] text-faint">{bounds?.periodLabel ?? ""}</div>
          </div>
          <button disabled={offset >= 0} onClick={() => setOffset((o) => Math.min(0, o + 1))} className="flex h-[28px] w-[28px] items-center justify-center rounded-sm hover:bg-surface-2 disabled:opacity-30"><ChevronRight className="h-[16px] w-[16px]" /></button>
        </div>
      </div>

      {overview === undefined ? (
        <div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={6} /></div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1.15fr_1fr]">
          {/* Colonne gauche : parties rédigées à la main */}
          <div className="flex flex-col gap-[14px]">
            <Note>Mise en forme acceptée : paragraphes (ligne vide), listes <code>- puce</code>, et <code>**gras**</code>.</Note>
            <Field label="Mot du Chef de la Police" value={form.motChef} onChange={(v) => setForm({ ...form, motChef: v })} rows={4} placeholder="Éditorial d'introduction…" />
            <Field label="Analyse de la criminalité (état-major)" value={form.analyseCrime} onChange={(v) => setForm({ ...form, analyseCrime: v })} rows={3} />
            <Field label="Opérations notables" value={form.operationsNotables} onChange={(v) => setForm({ ...form, operationsNotables: v })} rows={3} />
            <Field label="Point ressources humaines" value={form.pointRH} onChange={(v) => setForm({ ...form, pointRH: v })} rows={3} />
            <Field label="Objectifs & message au Gouvernement" value={form.objectifs} onChange={(v) => setForm({ ...form, objectifs: v })} rows={3} />

            {/* Agents à l'honneur */}
            <section className="rounded-card border border-border bg-surface p-[14px]">
              <div className="mb-[8px] flex items-center gap-2">
                <div className="flex-1 text-[12px] font-bold uppercase tracking-[0.08em] text-faint">Agents à l'honneur</div>
                {d?.topAgents?.length ? (
                  <button onClick={() => setHonneur(d.topAgents.map((a) => ({ name: a.name, matricule: a.matricule, reason: `${a.arrestations} arrestation${a.arrestations > 1 ? "s" : ""}` })))} className="flex items-center gap-[5px] rounded-sm border border-border bg-surface-2 px-[8px] py-[4px] text-[11.5px] font-semibold hover:border-accent"><Wand2 className="h-[12px] w-[12px]" /> Pré-remplir</button>
                ) : null}
              </div>
              <div className="flex flex-col gap-[7px]">
                {honneur.map((h, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-[6px]">
                    <input value={h.name} onChange={(e) => setHonneur(honneur.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Nom" className="h-8 min-w-[130px] flex-1 rounded-sm border border-border bg-surface-2 px-2 text-[12.5px] outline-none focus:border-accent" />
                    <input value={h.matricule ?? ""} onChange={(e) => setHonneur(honneur.map((x, j) => j === i ? { ...x, matricule: e.target.value } : x))} placeholder="#" className="h-8 w-[74px] rounded-sm border border-border bg-surface-2 px-2 font-data text-[12px] outline-none focus:border-accent" />
                    <input value={h.reason ?? ""} onChange={(e) => setHonneur(honneur.map((x, j) => j === i ? { ...x, reason: e.target.value } : x))} placeholder="Motif" className="h-8 min-w-[150px] flex-[2] rounded-sm border border-border bg-surface-2 px-2 text-[12.5px] outline-none focus:border-accent" />
                    <button onClick={() => setHonneur(honneur.filter((_, j) => j !== i))} className="flex h-8 w-8 items-center justify-center rounded-sm border border-border text-faint hover:text-danger"><Trash2 className="h-[13px] w-[13px]" /></button>
                  </div>
                ))}
                <button onClick={() => setHonneur([...honneur, { name: "", matricule: "", reason: "" }])} className="flex items-center gap-[6px] self-start rounded-sm border border-dashed border-border px-[10px] py-[6px] text-[12px] font-semibold text-muted hover:border-accent hover:text-accent"><Plus className="h-[13px] w-[13px]" /> Ajouter un agent</button>
              </div>
            </section>

            <Field label="Note de périmètre des données (optionnel)" value={form.dataNote} onChange={(v) => setForm({ ...form, dataNote: v })} rows={2} placeholder="Ex. Statistiques depuis la mise en service du MDT le 16 août 2026 à 20h00." />

            <div className="flex flex-wrap gap-[8px]">
              <button onClick={doSave} className="flex items-center gap-[7px] rounded-sm border border-border bg-surface-2 px-[14px] py-[9px] text-[13px] font-semibold hover:border-accent"><Save className="h-[15px] w-[15px]" /> Enregistrer</button>
              <button onClick={doGenerate} disabled={busy} className="flex items-center gap-[7px] rounded-sm bg-accent px-[16px] py-[9px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-60">
                {busy ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <FileSignature className="h-[15px] w-[15px]" />} Générer le PDF
              </button>
              {overview.pdfUrl && (
                <a href={overview.pdfUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-[7px] rounded-sm border border-border bg-surface-2 px-[14px] py-[9px] text-[13px] font-semibold hover:border-accent"><Download className="h-[15px] w-[15px]" /> Dernier PDF</a>
              )}
            </div>
          </div>

          {/* Colonne droite : aperçu des données automatiques */}
          <div className="flex flex-col gap-[14px]">
            <section className="overflow-hidden rounded-card border border-border bg-surface">
              <Head>Synthèse (données automatiques)</Head>
              <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                <Kpi label="Arrestations" value={d?.kpis.arrestations} />
                <Kpi label="Contraventions" value={d?.kpis.contraventions} />
                <Kpi label="Amendes émises" value={d ? `$${d.kpis.amendesMontant.toLocaleString("fr-FR")}` : undefined} />
                <Kpi label="Heures service" value={d?.kpis.heuresService} />
                <Kpi label="Patrouilles" value={d?.kpis.patrouilles} />
                <Kpi label="Opérations" value={d?.kpis.operations} />
                <Kpi label="Appels 911" value={d?.kpis.appels911} />
                <Kpi label="Sanctions" value={d?.kpis.sanctions} />
              </div>
            </section>

            <section className="overflow-hidden rounded-card border border-border bg-surface">
              <Head>Criminalité</Head>
              <div className="p-[13px]">
                <Line k="Dossiers d'arrestation" v={d?.crime.dossiers} />
                <Line k="Rapports d'arrestation" v={d?.crime.rapports} />
                <Line k="Avis de recherche émis" v={d?.crime.bolos} />
                <Line k="Amendes émises" v={d?.crime.amendesCount} />
                {d?.crime.topInfractions?.length ? (
                  <div className="mt-[8px] border-t border-border pt-[8px]">
                    <div className="mb-[4px] text-[10.5px] font-bold uppercase text-faint">Top infractions</div>
                    {d.crime.topInfractions.map((c) => <Line key={c.name} k={c.name} v={c.count} />)}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="overflow-hidden rounded-card border border-border bg-surface">
              <Head>Effectif par grade</Head>
              <div className="p-[13px]">
                {d?.rh.parGrade?.length ? d.rh.parGrade.map((g) => <Line key={g.grade} k={g.grade} v={g.count} />) : <div className="text-[12.5px] text-faint">—</div>}
                <div className="mt-[6px] border-t border-border pt-[6px]"><Line k="Total actif" v={d?.rh.effectifTotal} bold /></div>
              </div>
            </section>

            {d?.ops.operations?.length ? (
              <section className="overflow-hidden rounded-card border border-border bg-surface">
                <Head>Opérations de la semaine</Head>
                <div className="p-[13px] text-[12.5px]">
                  {d.ops.operations.map((o, i) => <div key={i} className="py-[2px]"><b>{o.name}</b> <span className="text-faint">· {o.date}</span></div>)}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, rows, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows: number; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-[5px]">
      <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} className="w-full rounded-sm border border-border bg-surface-2 p-3 text-[13px] leading-[1.5] outline-none focus:border-accent" />
    </label>
  );
}
function Note({ children }: { children: React.ReactNode }) {
  return <div className="rounded-sm border border-border bg-surface-2 px-[11px] py-[8px] text-[11.5px] text-muted">{children}</div>;
}
function Head({ children }: { children: React.ReactNode }) {
  return <div className="border-b border-border px-[14px] py-[9px] text-[11px] font-bold uppercase tracking-[0.09em] text-faint">{children}</div>;
}
function Kpi({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="bg-surface px-[13px] py-[11px]">
      <div className="font-data text-[17px] font-bold tracking-tight">{value ?? "…"}</div>
      <div className="mt-[2px] text-[10px] font-bold uppercase tracking-[0.06em] text-faint">{label}</div>
    </div>
  );
}
function Line({ k, v, bold }: { k: string; v?: number | string; bold?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-[2px] text-[12.5px]">
      <span className="min-w-0 flex-1 truncate text-muted">{k}</span>
      <span className={`font-data ${bold ? "font-bold text-text" : "font-semibold"}`}>{v ?? "…"}</span>
    </div>
  );
}
