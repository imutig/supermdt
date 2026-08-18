import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { ChevronLeft, ChevronRight, Wallet, Check, Plus, Trash2, SlidersHorizontal, Gift, DollarSign } from "lucide-react";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { fmtMatricule } from "@/components/common/AgentTag";

const money = (n: number | null | undefined) => (n == null ? "—" : "$" + Math.round(n).toLocaleString("fr-FR"));
const fmtH = (sec: number) => `${Math.floor(sec / 3600)} h ${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}`;

type SortCol = "salary" | "hours" | "grade" | "name" | "base";

export function Salaires() {
  const { can } = useCan();
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<{ col: SortCol; dir: 1 | -1 }>({ col: "salary", dir: -1 });
  const [cfgOpen, setCfgOpen] = useState(false);
  const [bonusOpen, setBonusOpen] = useState(false);
  const [bonusAgent, setBonusAgent] = useState<{ id: string; name: string } | null>(null);

  const data = useQuery(api.payroll.overview, can("comptabilite.view") ? { offset } : "skip");
  const setPaid = useMutation(api.payroll.setPaid);
  const payAll = useMutation(api.payroll.payAll);
  const deleteBonus = useMutation(api.payroll.deleteBonus);
  const toast = useToast();

  const canManage = !!data?.canManage;

  const rows = useMemo(() => {
    const list = [...(data?.rows ?? [])];
    const { col, dir } = sort;
    list.sort((a, b) => {
      let d = 0;
      if (col === "salary") d = (a.paid ? a.paidAmount ?? a.total : a.total) - (b.paid ? b.paidAmount ?? b.total : b.total);
      else if (col === "hours") d = a.seconds - b.seconds;
      else if (col === "grade") d = a.gradePosition - b.gradePosition;
      else if (col === "base") d = a.base - b.base;
      else d = a.name.localeCompare(b.name);
      return (d || a.name.localeCompare(b.name)) * dir;
    });
    return list;
  }, [data, sort]);

  if (!can("comptabilite.view")) {
    return <div className="p-[26px]"><EmptyState title="Accès restreint" message="La page Salaires est réservée à la comptabilité." /></div>;
  }

  const clickSort = (col: SortCol) => setSort((s) => (s.col === col ? { col, dir: (s.dir * -1) as 1 | -1 } : { col, dir: col === "name" ? 1 : -1 }));
  const arrow = (col: SortCol) => (sort.col === col ? (sort.dir === 1 ? " ▲" : " ▼") : "");

  const togglePaid = async (agentId: string, paid: boolean) => {
    if (!data) return;
    const r = await toast.guard(setPaid({ agentId: agentId as Id<"agents">, weekStart: data.week.start, paid }), "Action impossible");
    if (r !== undefined) toast.success(paid ? "Salaire marqué payé." : "Paiement annulé.");
  };
  const doPayAll = async () => {
    if (!data) return;
    const r = await toast.guard(payAll({ weekStart: data.week.start }), "Action impossible");
    if (r !== undefined) toast.success(`${(r as { paid: number }).paid} salaire(s) marqué(s) payés.`);
  };
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copié : ${text}`); }
    catch { toast.error("Copie impossible."); }
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[16px] flex flex-wrap items-center gap-3">
        <Wallet className="h-[22px] w-[22px] text-accent" />
        <div className="flex-1">
          <h1 className="m-0 text-[21px] font-bold tracking-tight">Salaires</h1>
          <div className="mt-[2px] text-[13px] text-muted">Paie hebdomadaire calculée sur les heures de service in-game.</div>
        </div>
        {canManage && (
          <button onClick={() => setCfgOpen(true)} className="flex items-center gap-[7px] rounded-sm border border-border bg-surface-2 px-[12px] py-[9px] text-[13px] font-semibold hover:border-accent">
            <SlidersHorizontal className="h-[15px] w-[15px]" /> Barèmes
          </button>
        )}
        <div className="flex items-center gap-[6px] rounded-[9px] border border-border bg-surface px-[6px] py-[5px]">
          <button onClick={() => setOffset((o) => o - 1)} className="flex h-[28px] w-[28px] items-center justify-center rounded-sm hover:bg-surface-2"><ChevronLeft className="h-[16px] w-[16px]" /></button>
          <div className="min-w-[160px] text-center">
            <div className="text-[12.5px] font-bold">{data?.week.weekLabel ?? "…"}</div>
            <div className="text-[10.5px] text-faint">{data?.week.periodLabel ?? ""}</div>
          </div>
          <button disabled={offset >= 0} onClick={() => setOffset((o) => Math.min(0, o + 1))} className="flex h-[28px] w-[28px] items-center justify-center rounded-sm hover:bg-surface-2 disabled:opacity-30"><ChevronRight className="h-[16px] w-[16px]" /></button>
        </div>
      </div>

      {/* Barème + totaux */}
      {data && (
        <div className="mb-[14px] flex flex-wrap items-center gap-[10px] rounded-card border border-border bg-surface px-[14px] py-[11px] text-[12.5px]">
          <span className="text-muted">Barème : <b className="text-text">{data.scale.effectiveLabel}</b></span>
          <Dot />
          <span className="text-muted">Salaire max : <b className="text-text">{data.scale.maxSalary != null ? money(data.scale.maxSalary) : "aucun"}</b></span>
          <div className="flex-1" />
          <span className="text-muted">Total dû : <b className="font-data text-text">{money(data.totals.totalDue)}</b></span>
          <Dot />
          <span className="text-muted">Payé : <b className="font-data" style={{ color: "var(--success)" }}>{money(data.totals.totalPaid)}</b> ({data.totals.paidCount}/{data.totals.agents})</span>
          {canManage && data.totals.unpaidCount > 0 && (
            <button onClick={doPayAll} className="ml-2 flex items-center gap-[6px] rounded-sm bg-success px-[12px] py-[7px] text-[12.5px] font-semibold text-white hover:brightness-[1.06]">
              <Check className="h-[14px] w-[14px]" /> Tout payer ({data.totals.unpaidCount})
            </button>
          )}
        </div>
      )}

      {!data?.scale.hasScale && data && (
        <div className="mb-[12px] rounded-card border px-[14px] py-[10px] text-[12.5px]" style={{ borderColor: "color-mix(in srgb, var(--warning) 40%, var(--border))", background: "color-mix(in srgb, var(--warning) 7%, var(--surface))", color: "var(--warning)" }}>
          Aucun barème ne couvre cette semaine — les salaires sont à 0. {canManage ? "Définissez un barème via « Barèmes »." : "Contactez la comptabilité."}
        </div>
      )}

      {/* Tableau */}
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[1.5fr_.9fr_.7fr_.55fr_.7fr_.75fr_.7fr_.8fr_.7fr] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
              <Hd onClick={() => clickSort("name")}>Agent{arrow("name")}</Hd>
              <Hd onClick={() => clickSort("grade")}>Grade{arrow("grade")}</Hd>
              <Hd onClick={() => clickSort("hours")}>Heures IG{arrow("hours")}</Hd>
              <span>Taux/h</span>
              <Hd onClick={() => clickSort("base")}>Base{arrow("base")}</Hd>
              <span>Primes</span>
              <span>IBAN</span>
              <Hd onClick={() => clickSort("salary")}>Salaire{arrow("salary")}</Hd>
              <span className="text-right">Payé</span>
            </div>
            {data === undefined ? (
              <div className="p-4"><SkeletonRows rows={8} /></div>
            ) : rows.length === 0 ? (
              <EmptyState title="Aucun agent" message="Aucun agent actif à afficher." />
            ) : (
              rows.map((r) => (
                <div key={r.agentId} className="grid grid-cols-[1.5fr_.9fr_.7fr_.55fr_.7fr_.75fr_.7fr_.8fr_.7fr] items-center gap-3 border-b border-border px-4 py-[10px] text-[12.5px] last:border-b-0">
                  <div className="flex items-center gap-2">
                    {r.avatarUrl ? <img src={r.avatarUrl} alt="" className="h-[26px] w-[26px] rounded-[6px] object-cover" /> : <div className="flex h-[26px] w-[26px] items-center justify-center rounded-[6px] bg-surface-2 text-[10px] font-bold text-muted">{r.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</div>}
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{r.name}</div>
                      {fmtMatricule(r.matricule) && <div className="font-data text-[10.5px] text-accent">{fmtMatricule(r.matricule)}</div>}
                    </div>
                  </div>
                  <span className="text-muted">{r.gradeName}</span>
                  <span className="font-data">{fmtH(r.seconds)}</span>
                  <span className="font-data text-muted">{r.rate > 0 ? `$${r.rate}` : "—"}</span>
                  <span className="font-data">
                    {money(r.base)}
                    {r.maxed && <span className="ml-1 rounded-[4px] px-[5px] py-[1px] text-[9.5px] font-bold" style={{ background: "color-mix(in srgb, var(--warning) 16%, transparent)", color: "var(--warning)" }}>MAX</span>}
                  </span>
                  <span className="font-data text-muted">
                    {r.individualBonus + r.globalBonus > 0 ? (
                      <button onClick={() => canManage && (setBonusAgent({ id: r.agentId, name: r.name }), setBonusOpen(true))} className="text-accent hover:underline" title={`Individuelle ${money(r.individualBonus)} · Globale ${money(r.globalBonus)}`}>
                        +{money(r.individualBonus + r.globalBonus)}
                      </button>
                    ) : canManage ? (
                      <button onClick={() => (setBonusAgent({ id: r.agentId, name: r.name }), setBonusOpen(true))} className="text-faint hover:text-accent"><Plus className="h-[13px] w-[13px]" /></button>
                    ) : "—"}
                  </span>
                  {r.iban ? (
                    <button onClick={() => copy(r.iban!, "IBAN")} title="Copier l'IBAN" className="text-left font-data hover:text-accent hover:underline">{r.iban}</button>
                  ) : (
                    <span className="text-[11.5px] text-faint">non renseigné</span>
                  )}
                  <button
                    onClick={() => copy(String(Math.round(r.paid ? r.paidAmount ?? r.total : r.total)), "Salaire")}
                    title="Copier le montant (sans le $)"
                    className="text-left font-data font-bold hover:underline"
                    style={{ color: (r.paid ? r.paidAmount ?? r.total : r.total) > 0 ? "var(--success)" : "var(--faint)" }}
                  >
                    {money(r.paid ? r.paidAmount : r.total)}
                  </button>
                  <div className="flex justify-end">
                    {r.paid ? (
                      <button disabled={!canManage} onClick={() => togglePaid(r.agentId, false)} title={r.paidAt ? `Payé le ${new Date(r.paidAt).toLocaleDateString("fr-FR")}` : "Payé"} className="flex items-center gap-[5px] rounded-[6px] px-[9px] py-[4px] text-[11.5px] font-semibold disabled:cursor-default" style={{ background: "color-mix(in srgb, var(--success) 15%, transparent)", color: "var(--success)" }}>
                        <Check className="h-[12px] w-[12px]" /> Payé
                      </button>
                    ) : canManage ? (
                      <button onClick={() => togglePaid(r.agentId, true)} className="rounded-[6px] border border-border bg-surface-2 px-[9px] py-[4px] text-[11.5px] font-semibold text-muted hover:border-success hover:text-success">Payer</button>
                    ) : (
                      <span className="text-[11.5px] text-faint">En attente</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Primes de la semaine */}
      {data && (
        <section className="mt-[16px] overflow-hidden rounded-card border border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-border px-[15px] py-[10px]" style={{ background: "color-mix(in srgb, var(--accent) 8%, var(--surface))" }}>
            <Gift className="h-[14px] w-[14px] text-accent" />
            <span className="flex-1 text-[12px] font-bold uppercase tracking-[0.09em]">Primes de la semaine</span>
            {canManage && <Button onClick={() => (setBonusAgent(null), setBonusOpen(true))} className="!py-[4px] !text-[11.5px]"><Plus className="h-[13px] w-[13px]" /> Ajouter</Button>}
          </div>
          {data.bonuses.length === 0 ? (
            <div className="px-[15px] py-[14px] text-center text-[12px] text-faint">Aucune prime cette semaine.</div>
          ) : (
            data.bonuses.map((b) => (
              <div key={b._id} className="flex items-center gap-3 border-b border-border px-[15px] py-[9px] text-[12.5px] last:border-b-0">
                <span className="rounded-[5px] px-[7px] py-[2px] text-[10.5px] font-bold" style={b.scope === "GLOBAL" ? { background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" } : { background: "var(--surface-2)", color: "var(--muted)" }}>
                  {b.scope === "GLOBAL" ? "GLOBALE" : b.agentName ?? "Agent"}
                </span>
                <span className="flex-1 text-muted">{b.motif}</span>
                <span className="font-data font-semibold" style={{ color: "var(--success)" }}>+{money(b.amount)}</span>
                {canManage && <button onClick={() => toast.guard(deleteBonus({ id: b._id }), "Suppression impossible")} className="text-faint hover:text-danger"><Trash2 className="h-[13px] w-[13px]" /></button>}
              </div>
            ))
          )}
        </section>
      )}

      {cfgOpen && <ScalesModal onClose={() => setCfgOpen(false)} />}
      {bonusOpen && data && <BonusModal weekStart={data.week.start} agent={bonusAgent} onClose={() => { setBonusOpen(false); setBonusAgent(null); }} />}
    </div>
  );
}

function Hd({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="text-left uppercase tracking-[0.08em] hover:text-accent">{children}</button>;
}
function Dot() { return <span className="text-faint">·</span>; }

// ---------- Modale : ajouter une prime ----------
function BonusModal({ weekStart, agent, onClose }: { weekStart: number; agent: { id: string; name: string } | null; onClose: () => void }) {
  const add = useMutation(api.payroll.addBonus);
  const toast = useToast();
  const [scope, setScope] = useState<"GLOBAL" | "INDIVIDUAL">(agent ? "INDIVIDUAL" : "GLOBAL");
  const [amount, setAmount] = useState("");
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal title="Ajouter une prime" icon={<Gift className="h-[17px] w-[17px]" />} onClose={onClose} width={440}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="primary" loading={busy} disabled={!amount || !motif.trim()} onClick={async () => {
          setBusy(true);
          const r = await toast.guard(add({ weekStart, agentId: scope === "INDIVIDUAL" && agent ? (agent.id as Id<"agents">) : undefined, amount: Number(amount), motif }), "Ajout impossible");
          setBusy(false);
          if (r !== undefined) { toast.success("Prime ajoutée."); onClose(); }
        }}>Ajouter</Button></>}>
      <div className="flex flex-col gap-[12px]">
        <div className="flex gap-[3px] rounded-[8px] bg-surface-2 p-[3px]">
          <button onClick={() => setScope("GLOBAL")} className="flex-1 rounded-[6px] px-3 py-[7px] text-[12.5px] font-semibold" style={scope === "GLOBAL" ? { background: "var(--accent)", color: "var(--accent-contrast)" } : { color: "var(--muted)" }}>Globale (tous)</button>
          <button onClick={() => setScope("INDIVIDUAL")} disabled={!agent} className="flex-1 rounded-[6px] px-3 py-[7px] text-[12.5px] font-semibold disabled:opacity-40" style={scope === "INDIVIDUAL" ? { background: "var(--accent)", color: "var(--accent-contrast)" } : { color: "var(--muted)" }}>Individuelle</button>
        </div>
        {scope === "INDIVIDUAL" && <div className="rounded-sm border border-border bg-surface-2 px-3 py-[8px] text-[12.5px] font-semibold">{agent?.name ?? "—"}</div>}
        <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Montant ($)</span>
          <div className="relative"><DollarSign className="pointer-events-none absolute left-[9px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-faint" />
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" className="h-9 w-full rounded-sm border border-border bg-surface-2 pl-[30px] pr-3 font-data text-[13px] outline-none focus:border-accent" /></div>
        </label>
        <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Motif</span>
          <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Prime d'objectif, heures exceptionnelles…" className="h-9 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent" />
        </label>
      </div>
    </Modal>
  );
}

// ---------- Modale : barèmes datés ----------
function ScalesModal({ onClose }: { onClose: () => void }) {
  const cfg = useQuery(api.payroll.config, {});
  const save = useMutation(api.payroll.saveScale);
  const del = useMutation(api.payroll.deleteScale);
  const toast = useToast();
  const [editing, setEditing] = useState<null | { id?: string; effectiveFrom: string; always: boolean; maxSalary: string; rates: Record<string, string> }>(null);

  const startNew = () => setEditing({ effectiveFrom: "", always: true, maxSalary: "", rates: {} });
  const startEdit = (s: NonNullable<typeof cfg>["scales"][number]) => setEditing({
    id: s._id,
    always: s.effectiveFromWeek == null,
    effectiveFrom: s.effectiveFromWeek ? new Date(s.effectiveFromWeek).toISOString().slice(0, 10) : "",
    maxSalary: s.maxSalary != null ? String(s.maxSalary) : "",
    rates: Object.fromEntries(s.rates.map((r) => [r.gradeId as string, String(r.hourlyRate)])),
  });

  const doSave = async () => {
    if (!editing || !cfg) return;
    const rates = cfg.grades.map((g) => ({ gradeId: g._id, hourlyRate: Number(editing.rates[g._id as string] ?? 0) || 0 }));
    const r = await toast.guard(save({
      id: editing.id as Id<"payScales"> | undefined,
      effectiveFrom: editing.always || !editing.effectiveFrom ? null : new Date(editing.effectiveFrom).getTime(),
      maxSalary: editing.maxSalary.trim() ? Number(editing.maxSalary) : null,
      rates,
    }), "Enregistrement impossible");
    if (r !== undefined) { toast.success("Barème enregistré."); setEditing(null); }
  };

  return (
    <Modal title="Barèmes de paie" icon={<SlidersHorizontal className="h-[17px] w-[17px]" />} onClose={onClose} width={560}
      footer={<Button variant="ghost" onClick={onClose}>Fermer</Button>}>
      {cfg === undefined ? <SkeletonRows rows={4} /> : editing ? (
        <div className="flex flex-col gap-[12px]">
          <div className="text-[12.5px] font-semibold">{editing.id ? "Modifier le barème" : "Nouveau barème"}</div>
          <label className="flex items-center gap-[8px] text-[12.5px]">
            <input type="checkbox" checked={editing.always} onChange={(e) => setEditing({ ...editing, always: e.target.checked })} />
            S'applique depuis toujours (aux semaines les plus anciennes)
          </label>
          {!editing.always && (
            <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">À partir de la semaine contenant le</span>
              <input type="date" value={editing.effectiveFrom} onChange={(e) => setEditing({ ...editing, effectiveFrom: e.target.value })} className="h-9 w-full rounded-sm border border-border bg-surface-2 px-2 text-[13px] outline-none focus:border-accent" />
            </label>
          )}
          <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Salaire max ($, vide = aucun)</span>
            <input type="number" value={editing.maxSalary} onChange={(e) => setEditing({ ...editing, maxSalary: e.target.value })} placeholder="Aucun plafond" className="h-9 w-full rounded-sm border border-border bg-surface-2 px-3 font-data text-[13px] outline-none focus:border-accent" />
          </label>
          <div>
            <div className="mb-[6px] text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Taux horaire par grade ($/h)</div>
            <div className="flex flex-col gap-[5px] max-h-[240px] overflow-y-auto pr-1">
              {cfg.grades.map((g) => (
                <div key={g._id} className="flex items-center gap-2">
                  <span className="flex-1 text-[12.5px]">{g.name}</span>
                  <input type="number" value={editing.rates[g._id as string] ?? ""} onChange={(e) => setEditing({ ...editing, rates: { ...editing.rates, [g._id as string]: e.target.value } })} placeholder="0" className="h-8 w-[90px] rounded-sm border border-border bg-surface-2 px-2 font-data text-[12.5px] outline-none focus:border-accent" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-[12px]">
            <Button variant="ghost" onClick={() => setEditing(null)}>Annuler</Button>
            <Button variant="primary" onClick={doSave}>Enregistrer</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-[10px]">
          <p className="text-[12px] text-muted">Chaque barème s'applique <b>à partir de</b> sa semaine et jusqu'au barème suivant. Le plus récent l'emporte pour une semaine donnée.</p>
          {cfg.scales.length === 0 ? (
            <div className="rounded-sm border border-dashed border-border p-4 text-center text-[12.5px] text-faint">Aucun barème. Créez-en un premier « depuis toujours ».</div>
          ) : cfg.scales.map((s) => (
            <div key={s._id} className="flex items-center gap-3 rounded-sm border border-border bg-surface-2 px-[12px] py-[9px]">
              <div className="flex-1">
                <div className="text-[12.5px] font-semibold">À partir de : {s.effectiveLabel}</div>
                <div className="text-[11.5px] text-muted">Max : {s.maxSalary != null ? money(s.maxSalary) : "aucun"} · {s.rates.filter((r) => r.hourlyRate > 0).length} grade(s) tarifé(s)</div>
              </div>
              <button onClick={() => startEdit(s)} className="rounded-sm border border-border bg-surface px-[10px] py-[5px] text-[11.5px] font-semibold hover:border-accent">Modifier</button>
              <button onClick={() => toast.guard(del({ id: s._id }), "Suppression impossible")} className="text-faint hover:text-danger"><Trash2 className="h-[14px] w-[14px]" /></button>
            </div>
          ))}
          <Button onClick={startNew} className="self-start"><Plus className="h-[14px] w-[14px]" /> Nouveau barème</Button>
        </div>
      )}
    </Modal>
  );
}
