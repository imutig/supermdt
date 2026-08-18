import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { fmtMatricule } from "@/components/common/AgentTag";
import { X, Plus, Trash2, Search, Shield, ScrollText, Clock } from "lucide-react";

const STATUS: Record<string, { label: string; color: string }> = {
  OPEN: { label: "Ouverte", color: "var(--accent)" },
  IN_PROGRESS: { label: "En cours", color: "var(--warning)" },
  CLOSED: { label: "Clôturée", color: "var(--muted)" },
};
const SEVERITY: Record<string, { label: string; color: string }> = {
  LOW: { label: "Faible", color: "var(--muted)" },
  MEDIUM: { label: "Moyenne", color: "var(--accent)" },
  HIGH: { label: "Élevée", color: "var(--warning)" },
  CRITICAL: { label: "Critique", color: "var(--danger)" },
};
const ROLE: Record<string, { label: string; color: string }> = {
  SUSPECT: { label: "Mis en cause", color: "var(--danger)" },
  WITNESS: { label: "Témoin", color: "var(--accent)" },
  INVOLVED: { label: "Impliqué", color: "var(--muted)" },
};
const OUTCOME: Record<string, string> = {
  NO_ACTION: "Sans suite", EXONERATED: "Disculpé(s)", SANCTION: "Sanction", DISMISSAL: "Radiation", OTHER: "Autre",
};
const fmtDate = (ts: number) => new Date(ts).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });
const Badge = ({ text, color }: { text: string; color: string }) => (
  <span className="rounded-[5px] px-[7px] py-[2px] text-[10.5px] font-bold" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>{text}</span>
);

// Section « Enquêtes internes » de la page Discipline.
export function InvestigationsSection({ initialOpenId }: { initialOpenId?: string | null }) {
  const { can } = useCan();
  const canManage = can("investigations.manage");
  const [filter, setFilter] = useState<"ALL" | "OPEN" | "IN_PROGRESS" | "CLOSED">("ALL");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const data = useQuery(api.investigations.list, { status: filter });
  useEffect(() => { if (initialOpenId) setOpenId(initialOpenId); }, [initialOpenId]);

  return (
    <div>
      <div className="mb-[12px] flex flex-wrap items-center gap-2">
        <div className="flex gap-[2px] rounded-[8px] bg-surface-2 p-[3px]">
          {(["ALL", "OPEN", "IN_PROGRESS", "CLOSED"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className="rounded-[6px] px-[10px] py-[6px] text-[12px] font-semibold" style={filter === f ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}>
              {f === "ALL" ? "Toutes" : STATUS[f].label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {canManage && (
          <button onClick={() => setCreating(true)} className="mdt-press flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]">
            <Plus className="h-[15px] w-[15px]" /> Ouvrir une enquête
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[.5fr_1.5fr_1.5fr_.8fr_.8fr_.9fr] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
              <span>Réf.</span><span>Objet</span><span>Agents concernés</span><span>Gravité</span><span>Statut</span><span>Ouverte</span>
            </div>
            {data === undefined ? (
              <div className="p-4"><SkeletonRows rows={4} /></div>
            ) : data.rows.length === 0 ? (
              <EmptyState compact title="Aucune enquête" message="Aucune enquête interne pour ce filtre." />
            ) : data.rows.map((inv) => (
              <div key={inv._id} onClick={() => setOpenId(inv._id)} className="grid cursor-pointer grid-cols-[.5fr_1.5fr_1.5fr_.8fr_.8fr_.9fr] items-center gap-3 border-b border-border px-4 py-3 text-[12.5px] last:border-b-0 hover:bg-surface-2">
                <span className="font-data font-bold text-accent">#{inv.reference}</span>
                <span className="truncate font-semibold">{inv.title}</span>
                <span className="flex flex-wrap gap-[4px]">
                  {inv.targets.slice(0, 3).map((t) => <span key={t._id} className="rounded-[5px] bg-surface-2 px-[6px] py-[2px] text-[11px]">{t.name}</span>)}
                  {inv.targetCount > 3 && <span className="text-[11px] text-faint">+{inv.targetCount - 3}</span>}
                </span>
                <span>{inv.severity ? <Badge text={SEVERITY[inv.severity].label} color={SEVERITY[inv.severity].color} /> : <span className="text-faint">—</span>}</span>
                <span><Badge text={STATUS[inv.status].label} color={STATUS[inv.status].color} /></span>
                <span className="font-data text-[11.5px] text-muted">{fmtDate(inv.at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {creating && <CreateModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); }} />}
      {openId && <InvestigationDetail id={openId as Id<"internalInvestigations">} onClose={() => setOpenId(null)} />}
    </div>
  );
}

// Liste compacte des enquêtes concernant un agent (fiche Effectif).
export function AgentInvestigations({ agentId, onOpen }: { agentId: Id<"agents">; onOpen: (id: string) => void }) {
  const list = useQuery(api.investigations.byAgent, { agentId });
  if (list === undefined || list.length === 0) return null;
  return (
    <div>
      <div className="mb-[6px] flex items-center gap-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint"><Shield className="h-[13px] w-[13px]" /> Enquêtes internes</div>
      <div className="flex flex-col gap-[6px]">
        {list.map((inv) => (
          <button key={inv._id} onClick={() => onOpen(inv._id)} className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-[11px] py-[8px] text-left text-[12.5px] hover:border-accent">
            <span className="font-data font-bold text-accent">#{inv.reference}</span>
            <span className="flex-1 truncate font-semibold">{inv.title}</span>
            <Badge text={ROLE[inv.role].label} color={ROLE[inv.role].color} />
            <Badge text={STATUS[inv.status].label} color={STATUS[inv.status].color} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Création ----------
function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const create = useMutation(api.investigations.create);
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [severity, setSeverity] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "">("");
  const [targets, setTargets] = useState<Record<string, "SUSPECT" | "WITNESS" | "INVOLVED">>({});
  const [busy, setBusy] = useState(false);
  const count = Object.keys(targets).length;

  return (
    <Modal title="Ouvrir une enquête interne" icon={<Shield className="h-[17px] w-[17px]" />} onClose={onClose} width={560}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="primary" loading={busy} disabled={!title.trim() || count === 0} onClick={async () => {
          setBusy(true);
          const r = await toast.guard(create({ title, reason, severity: severity || undefined, targets: Object.entries(targets).map(([agentId, role]) => ({ agentId: agentId as Id<"agents">, role })) }), "Ouverture impossible");
          setBusy(false);
          if (r) { toast.success("Enquête ouverte."); onCreated(r as string); }
        }}>Ouvrir l'enquête</Button></>}>
      <div className="flex flex-col gap-[12px]">
        <Field label="Objet de l'enquête"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Usage disproportionné de la force" className={INP} /></Field>
        <Field label="Motif d'ouverture (optionnel)"><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={INP + " py-2"} /></Field>
        <Field label="Gravité">
          <div className="flex gap-[3px] rounded-[8px] bg-surface-2 p-[3px]">
            {(["", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((s) => (
              <button key={s || "none"} onClick={() => setSeverity(s)} className="flex-1 rounded-[6px] px-2 py-[6px] text-[12px] font-semibold" style={severity === s ? { background: s ? SEVERITY[s].color : "var(--muted)", color: "#fff" } : { color: "var(--muted)" }}>
                {s ? SEVERITY[s].label : "—"}
              </button>
            ))}
          </div>
        </Field>
        <Field label={`Agents concernés${count ? ` (${count})` : ""}`}>
          <TargetPicker targets={targets} onChange={setTargets} />
        </Field>
      </div>
    </Modal>
  );
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function TargetPicker({ targets, onChange }: { targets: Record<string, "SUSPECT" | "WITNESS" | "INVOLVED">; onChange: (t: Record<string, "SUSPECT" | "WITNESS" | "INVOLVED">) => void }) {
  const agents = useQuery(api.investigations.pickerAgents, {}) ?? [];
  const [q, setQ] = useState("");
  const needle = norm(q.trim());
  const filtered = useMemo(() => agents.filter((a) => !needle || norm(a.name).includes(needle) || String(a.matricule ?? "").includes(needle)).slice(0, 40), [agents, needle]);
  const toggle = (id: string) => { const next = { ...targets }; if (next[id]) delete next[id]; else next[id] = "INVOLVED"; onChange(next); };
  return (
    <div className="flex flex-col gap-[8px]">
      {Object.keys(targets).length > 0 && (
        <div className="flex flex-wrap gap-[6px]">
          {Object.entries(targets).map(([id, role]) => {
            const a = agents.find((x) => x._id === id);
            return (
              <span key={id} className="flex items-center gap-[6px] rounded-[6px] border border-accent bg-accent-soft px-[8px] py-[4px] text-[12px] font-semibold text-accent">
                {a?.name ?? "…"}
                <select value={role} onChange={(e) => onChange({ ...targets, [id]: e.target.value as "SUSPECT" | "WITNESS" | "INVOLVED" })} className="rounded-[4px] border border-border bg-surface px-1 py-[1px] text-[10.5px] text-text outline-none">
                  {(["INVOLVED", "SUSPECT", "WITNESS"] as const).map((r) => <option key={r} value={r}>{ROLE[r].label}</option>)}
                </select>
                <button onClick={() => toggle(id)} className="text-muted hover:text-danger"><X className="h-[12px] w-[12px]" /></button>
              </span>
            );
          })}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-[9px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un agent…" className={INP + " pl-[30px]"} />
      </div>
      <div className="max-h-[190px] overflow-y-auto rounded-sm border border-border">
        {filtered.length === 0 ? <div className="p-3 text-[12px] text-faint">Aucun agent.</div> : filtered.map((a) => (
          <button key={a._id} onClick={() => toggle(a._id)} className="flex w-full items-center gap-2 border-b border-border px-[10px] py-[7px] text-left text-[12.5px] last:border-b-0 hover:bg-surface-2" style={targets[a._id] ? { background: "var(--accent-soft)" } : undefined}>
            <input type="checkbox" readOnly checked={!!targets[a._id]} className="pointer-events-none" />
            {fmtMatricule(a.matricule) && <span className="font-data text-[11.5px] text-accent">{fmtMatricule(a.matricule)}</span>}
            <span className="flex-1 truncate">{a.name}</span>
            {a.gradeName && <span className="text-[11px] text-faint">{a.gradeName}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Détail (panneau latéral) ----------
function InvestigationDetail({ id, onClose }: { id: Id<"internalInvestigations">; onClose: () => void }) {
  const inv = useQuery(api.investigations.get, { id });
  const setStatus = useMutation(api.investigations.setStatus);
  const reopen = useMutation(api.investigations.reopen);
  const addNote = useMutation(api.investigations.addNote);
  const removeNote = useMutation(api.investigations.removeNote);
  const setTargetRole = useMutation(api.investigations.setTargetRole);
  const removeTarget = useMutation(api.investigations.removeTarget);
  const addTarget = useMutation(api.investigations.addTarget);
  const remove = useMutation(api.investigations.remove);
  const toast = useToast();
  const [note, setNote] = useState("");
  const [closing, setClosing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [addingTarget, setAddingTarget] = useState(false);

  const canManage = !!inv?.canManage;

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[560px] max-w-[96vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        {inv === undefined ? (
          <div className="p-6"><SkeletonRows rows={6} /></div>
        ) : inv === null ? (
          <div className="p-6"><EmptyState title="Introuvable" message="Cette enquête n'existe plus." /><div className="mt-4"><Button onClick={onClose}>Fermer</Button></div></div>
        ) : (
          <>
            <div className="flex flex-shrink-0 items-start gap-3 border-b border-border px-[18px] py-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-data text-[13px] font-bold text-accent">#{inv.reference}</span>
                  <Badge text={STATUS[inv.status].label} color={STATUS[inv.status].color} />
                  {inv.severity && <Badge text={SEVERITY[inv.severity].label} color={SEVERITY[inv.severity].color} />}
                  {inv.outcome && <Badge text={`Issue : ${OUTCOME[inv.outcome]}`} color="var(--muted)" />}
                </div>
                <h2 className="m-0 mt-[4px] text-[16px] font-bold">{inv.title}</h2>
                <div className="mt-[2px] text-[11.5px] text-muted">Ouverte par {inv.opener.name} · {fmtDate(inv.at)}{inv.closedAt ? ` · clôturée le ${fmtDate(inv.closedAt)}` : ""}</div>
              </div>
              <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex flex-1 flex-col gap-[16px] overflow-y-auto px-[18px] py-4">
              {inv.reason && <div><div className="mb-[5px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Motif d'ouverture</div><div className="whitespace-pre-wrap rounded-sm border border-border bg-surface-2 px-[12px] py-[9px] text-[13px]">{inv.reason}</div></div>}
              {inv.conclusion && <div><div className="mb-[5px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Conclusion</div><div className="whitespace-pre-wrap rounded-sm border px-[12px] py-[9px] text-[13px]" style={{ borderColor: "color-mix(in srgb, var(--success) 30%, var(--border))", background: "color-mix(in srgb, var(--success) 6%, var(--surface))" }}>{inv.conclusion}</div></div>}

              {/* Agents concernés */}
              <div>
                <div className="mb-[6px] flex items-center gap-2"><div className="flex-1 text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Agents concernés ({inv.targets.length})</div>{canManage && <button onClick={() => setAddingTarget((v) => !v)} className="text-[11.5px] font-semibold text-accent hover:underline">{addingTarget ? "Fermer" : "+ Ajouter"}</button>}</div>
                <div className="flex flex-col gap-[6px]">
                  {inv.targets.map((t) => (
                    <div key={t._id} className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-[10px] py-[7px] text-[12.5px]">
                      {fmtMatricule(t.agent.matricule) && <span className="font-data text-[11.5px] text-accent">{fmtMatricule(t.agent.matricule)}</span>}
                      <span className="flex-1 font-semibold">{t.agent.name}</span>
                      {canManage ? (
                        <select value={t.role} onChange={(e) => toast.guard(setTargetRole({ targetId: t._id, role: e.target.value as "SUSPECT" | "WITNESS" | "INVOLVED" }), "Impossible")} className="rounded-[5px] border border-border bg-surface px-2 py-[3px] text-[11px] outline-none">
                          {(["INVOLVED", "SUSPECT", "WITNESS"] as const).map((r) => <option key={r} value={r}>{ROLE[r].label}</option>)}
                        </select>
                      ) : <Badge text={ROLE[t.role].label} color={ROLE[t.role].color} />}
                      {canManage && inv.targets.length > 1 && <button onClick={() => toast.guard(removeTarget({ targetId: t._id }), "Impossible")} className="text-faint hover:text-danger"><Trash2 className="h-[12px] w-[12px]" /></button>}
                    </div>
                  ))}
                </div>
                {addingTarget && canManage && (
                  <div className="mt-[8px]"><TargetAdder existing={inv.targets.map((t) => t.agent._id as string)} onAdd={async (agentId) => { await toast.guard(addTarget({ id, agentId: agentId as Id<"agents"> }), "Ajout impossible"); }} /></div>
                )}
              </div>

              {/* Journal */}
              <div>
                <div className="mb-[6px] flex items-center gap-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint"><ScrollText className="h-[13px] w-[13px]" /> Journal d'enquête</div>
                {canManage && inv.status !== "CLOSED" && (
                  <div className="mb-[10px] flex flex-col gap-[6px]">
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Ajouter une note d'enquête…" className={INP + " py-2"} />
                    <Button variant="primary" disabled={!note.trim()} onClick={async () => { const r = await toast.guard(addNote({ id, body: note }), "Impossible"); if (r !== undefined) setNote(""); }} className="self-end">Ajouter la note</Button>
                  </div>
                )}
                <div className="flex flex-col gap-[7px]">
                  {inv.notes.length === 0 ? <div className="text-[12px] text-faint">Aucune entrée.</div> : inv.notes.map((n) => (
                    <div key={n._id} className={`rounded-sm border px-[11px] py-[8px] text-[12.5px] ${n.kind === "EVENT" ? "border-dashed" : ""}`} style={{ borderColor: "var(--border)", background: n.kind === "EVENT" ? "transparent" : "var(--surface-2)" }}>
                      <div className="mb-[3px] flex items-center gap-2 text-[10.5px] text-faint"><Clock className="h-[11px] w-[11px]" /> {n.authorName} · {fmtDate(n.at)} {n.kind === "EVENT" && <span className="italic">· événement</span>}
                        {canManage && n.kind === "NOTE" && <button onClick={() => toast.guard(removeNote({ noteId: n._id }), "Impossible")} className="ml-auto text-faint hover:text-danger"><Trash2 className="h-[11px] w-[11px]" /></button>}
                      </div>
                      <div className={`whitespace-pre-wrap ${n.kind === "EVENT" ? "text-muted" : ""}`}>{n.body}</div>
                      {n.imageUrls.length > 0 && <div className="mt-[6px] flex flex-wrap gap-[6px]">{n.imageUrls.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="h-[64px] w-[64px] rounded-sm border border-border object-cover" /></a>)}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            {canManage && (
              <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-t border-border px-[18px] py-4">
                {inv.status === "OPEN" && <Button onClick={() => toast.guard(setStatus({ id, status: "IN_PROGRESS" }), "Impossible")}>Passer « En cours »</Button>}
                {inv.status !== "CLOSED" ? (
                  <Button variant="primary" onClick={() => setClosing(true)}>Clôturer</Button>
                ) : (
                  <Button onClick={() => toast.guard(reopen({ id }), "Impossible")}>Rouvrir</Button>
                )}
                <div className="flex-1" />
                {confirmDel ? (
                  <><span className="text-[12px] text-muted">Archiver ?</span><Button variant="ghost" onClick={() => setConfirmDel(false)}>Non</Button><button onClick={async () => { const r = await toast.guard(remove({ id }), "Impossible"); if (r !== undefined) { toast.success("Enquête archivée."); onClose(); } }} className="rounded-sm px-3 py-[8px] text-[13px] font-semibold text-white" style={{ background: "var(--danger)" }}>Confirmer</button></>
                ) : (
                  <button onClick={() => setConfirmDel(true)} className="flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-3 py-[8px] text-[13px] font-semibold hover:border-border-strong" style={{ color: "var(--danger)" }}><Trash2 className="h-4 w-4" /> Supprimer</button>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {closing && inv && <CloseModal id={id} onClose={() => setClosing(false)} onDone={() => setClosing(false)} />}
    </div>
  );
}

function TargetAdder({ existing, onAdd }: { existing: string[]; onAdd: (agentId: string) => Promise<void> }) {
  const agents = useQuery(api.investigations.pickerAgents, {}) ?? [];
  const [q, setQ] = useState("");
  const needle = norm(q.trim());
  const filtered = agents.filter((a) => !existing.includes(a._id) && (!needle || norm(a.name).includes(needle) || String(a.matricule ?? "").includes(needle))).slice(0, 15);
  return (
    <div className="rounded-sm border border-border bg-surface-2 p-[8px]">
      <div className="relative mb-[6px]"><Search className="pointer-events-none absolute left-[9px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-faint" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className={INP + " pl-[30px]"} /></div>
      <div className="max-h-[150px] overflow-y-auto">
        {filtered.map((a) => (
          <button key={a._id} onClick={() => onAdd(a._id)} className="flex w-full items-center gap-2 rounded-sm px-[8px] py-[6px] text-left text-[12.5px] hover:bg-surface">
            {fmtMatricule(a.matricule) && <span className="font-data text-[11.5px] text-accent">{fmtMatricule(a.matricule)}</span>}
            <span className="flex-1 truncate">{a.name}</span><Plus className="h-[13px] w-[13px] text-accent" />
          </button>
        ))}
      </div>
    </div>
  );
}

function CloseModal({ id, onClose, onDone }: { id: Id<"internalInvestigations">; onClose: () => void; onDone: () => void }) {
  const close = useMutation(api.investigations.close);
  const toast = useToast();
  const [outcome, setOutcome] = useState<"NO_ACTION" | "EXONERATED" | "SANCTION" | "DISMISSAL" | "OTHER">("NO_ACTION");
  const [conclusion, setConclusion] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Clôturer l'enquête" onClose={onClose} width={460}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="primary" loading={busy} onClick={async () => { setBusy(true); const r = await toast.guard(close({ id, outcome, conclusion }), "Clôture impossible"); setBusy(false); if (r !== undefined) { toast.success("Enquête clôturée."); onDone(); } }}>Clôturer</Button></>}>
      <div className="flex flex-col gap-[12px]">
        <Field label="Issue de l'enquête">
          <select value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)} className={INP}>
            {Object.entries(OUTCOME).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Conclusion (optionnel)"><textarea value={conclusion} onChange={(e) => setConclusion(e.target.value)} rows={4} className={INP + " py-2"} placeholder="Synthèse des constats et de la décision…" /></Field>
      </div>
    </Modal>
  );
}

const INP = "h-9 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-[5px]"><span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">{label}</span>{children}</label>;
}
