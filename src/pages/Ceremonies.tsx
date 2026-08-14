import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Award, Plus, X, Trash2, CalendarDays, Clock, MapPin, FileImage, Send, ArrowUpNarrowWide, ChevronRight } from "lucide-react";
import { api, type Id } from "@/lib/api";
import { useToast } from "@/providers/toast";
import { useCan } from "@/hooks/useCan";
import { fmtMatricule } from "@/components/common/AgentTag";
import { tsToDateInput, dateInputToTs } from "@/lib/anciennete";
import { AgentPicker } from "@/components/common/AgentPicker";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { CeremonieDoc } from "@/components/docs/CeremonieDoc";

const fmtDate = (at: number) => new Date(at).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "long", year: "numeric" });

export function Ceremonies() {
  const list = useQuery(api.ceremonies.list);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<Id<"ceremonies"> | null>(null);

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px] flex items-start gap-3">
        <div className="flex-1">
          <h1 className="m-0 text-[21px] font-bold tracking-tight">Cérémonies</h1>
          <div className="mt-[3px] text-[13px] text-muted">
            {list ? `${list.length} cérémonie${list.length > 1 ? "s" : ""}` : "…"}
          </div>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="mdt-press flex items-center gap-[7px] rounded-sm bg-accent px-[13px] py-[9px] text-[12.5px] font-semibold text-accent-contrast hover:brightness-[1.06]"
        >
          <Plus className="h-[15px] w-[15px]" /> Créer une cérémonie
        </button>
      </div>

      {list === undefined && <div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={5} /></div>}
      {list && list.length === 0 && (
        <div className="rounded-card border border-border bg-surface">
          <EmptyState title="Aucune cérémonie" message="Planifie une cérémonie : elle sera ajoutée au calendrier (1 h) et pourra porter des rappels et des montées en grade." />
        </div>
      )}
      {list && list.length > 0 && (
        <div className="flex flex-col gap-[10px]">
          {list.map((c) => (
            <button
              key={c._id}
              onClick={() => setOpenId(c._id)}
              className="mdt-press flex items-center gap-4 rounded-card border border-border bg-surface px-[16px] py-[13px] text-left hover:border-border-strong"
            >
              <div className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface-2 text-accent">
                <Award className="h-[20px] w-[20px]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold">{c.title}</div>
                <div className="mt-[3px] flex flex-wrap items-center gap-x-[14px] gap-y-[2px] text-[12px] text-muted">
                  <span className="flex items-center gap-[5px]"><CalendarDays className="h-[13px] w-[13px]" /> {fmtDate(c.at)}</span>
                  <span className="flex items-center gap-[5px]"><Clock className="h-[13px] w-[13px]" /> {c.startTime}</span>
                  {c.lieu && <span className="flex items-center gap-[5px]"><MapPin className="h-[13px] w-[13px]" /> {c.lieu}</span>}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-[6px]">
                {c.promotionCount > 0 && (
                  <span className="rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                    {c.promotionCount} montée{c.promotionCount > 1 ? "s" : ""}
                  </span>
                )}
                {c.reminderCount > 0 && (
                  <span className="rounded-[5px] bg-surface-2 px-[8px] py-[3px] text-[11px] font-semibold text-muted">
                    {c.reminderCount} rappel{c.reminderCount > 1 ? "s" : ""}
                  </span>
                )}
                <ChevronRight className="h-[16px] w-[16px] text-faint" />
              </div>
            </button>
          ))}
        </div>
      )}

      {creating && <CreateModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); }} />}
      {openId && <CeremonyDrawer ceremonyId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: Id<"ceremonies">) => void }) {
  const toast = useToast();
  const create = useMutation(api.ceremonies.create);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(tsToDateInput(Date.now()));
  const [time, setTime] = useState("21:00");
  const [lieu, setLieu] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const at = dateInputToTs(date);
    if (!title.trim() || at == null) return;
    setBusy(true);
    const id = await toast.guard(
      create({ title: title.trim(), at, startTime: time, lieu: lieu.trim() || undefined, notes: notes.trim() || undefined }),
      "Création impossible",
    );
    setBusy(false);
    if (id) { toast.success("Cérémonie créée et ajoutée au calendrier."); onCreated(id as Id<"ceremonies">); }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="w-[440px] max-w-[94vw] rounded-card border border-border-strong bg-elev shadow-[0_24px_70px_rgba(0,0,0,.35)]" style={{ animation: "mdtPop .2s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex items-center gap-3 border-b border-border px-[18px] py-[14px]">
          <Award className="h-[18px] w-[18px] text-accent" />
          <h2 className="m-0 flex-1 text-[15px] font-bold">Nouvelle cérémonie</h2>
          <button onClick={onClose} className="flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-col gap-[14px] px-[18px] py-[16px]">
          <Field label="Titre">
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cérémonie de promotions - Juin" className="h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10 w-full rounded-sm border border-border bg-surface-2 px-3 font-data text-[13px] outline-none focus:border-accent" />
            </Field>
            <Field label="Heure (Paris)">
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-10 w-full rounded-sm border border-border bg-surface-2 px-3 font-data text-[13px] outline-none focus:border-accent" />
            </Field>
          </div>
          <Field label="Lieu (optionnel)">
            <input value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="LSPD - Station 13, 3ème étage" className="h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent" />
          </Field>
          <Field label="Notes (optionnel)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full resize-none rounded-sm border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-accent" />
          </Field>
          <div className="text-[11.5px] text-faint">Un évènement d'1 h sera ajouté au calendrier à cette date et cette heure.</div>
        </div>
        <div className="flex gap-2 border-t border-border px-[18px] py-[14px]">
          <button onClick={onClose} className="flex-1 rounded-sm border border-border bg-surface-2 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
          <button onClick={submit} disabled={busy || !title.trim() || !date} className="flex-1 rounded-sm bg-accent py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">
            {busy ? "…" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CeremonyDrawer({ ceremonyId, onClose }: { ceremonyId: Id<"ceremonies">; onClose: () => void }) {
  const toast = useToast();
  const { can } = useCan();
  const c = useQuery(api.ceremonies.get, { ceremonyId });
  const roster = useQuery(api.agents.pickerList, can("effectif.view") ? {} : "skip") ?? [];
  const options = useQuery(api.config.options);

  const addReminder = useMutation(api.ceremonies.addReminder);
  const removeReminder = useMutation(api.ceremonies.removeReminder);
  const addPromotion = useMutation(api.ceremonies.addPromotion);
  const removePromotion = useMutation(api.ceremonies.removePromotion);
  const addDismissal = useMutation(api.ceremonies.addDismissal);
  const removeDismissal = useMutation(api.ceremonies.removeDismissal);
  const executeDiscord = useMutation(api.ceremonies.executeDiscordPromotions);
  const applyGrades = useMutation(api.ceremonies.applyGrades);
  const announce = useMutation(api.ceremonies.announce);
  const announceResult = useMutation(api.ceremonies.announceResult);
  const remove = useMutation(api.ceremonies.remove);

  const [reminderText, setReminderText] = useState("");
  const [promoAgent, setPromoAgent] = useState<string[]>([]);
  const [promoGrade, setPromoGrade] = useState("");
  const [dismissAgent, setDismissAgent] = useState<string[]>([]);
  const [dismissName, setDismissName] = useState("");
  const [dismissGrade, setDismissGrade] = useState("");
  const [posting, setPosting] = useState<"announce" | "result" | null>(null);
  const [docOpen, setDocOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<"discord" | "mdt" | null>(null);

  // Grades opérationnels/supervision/EM pour le grade cible (hors académie/extérieurs).
  const grades = (options?.grades ?? []).filter((g) => !g.academyOnly && !g.external).slice().sort((a, b) => b.position - a.position);

  async function onAddReminder() {
    if (!reminderText.trim()) return;
    const r = await toast.guard(addReminder({ ceremonyId, text: reminderText.trim() }), "Ajout impossible");
    if (r !== undefined) setReminderText("");
  }

  async function onAddPromotion() {
    const agentId = promoAgent[0];
    if (!agentId || !promoGrade) return;
    const r = await toast.guard(addPromotion({ ceremonyId, agentId: agentId as Id<"agents">, toGradeId: promoGrade as Id<"grades"> }), "Ajout impossible");
    if (r !== undefined) { setPromoAgent([]); setPromoGrade(""); }
  }

  async function onExecuteDiscord() {
    setBusy("discord");
    const r = await toast.guard(executeDiscord({ ceremonyId }), "Exécution impossible");
    setBusy(null);
    if (r) reportResult("Montées en grade Discord", r.queued, r.skipped, "mise(s) en file");
  }

  async function onApplyGrades() {
    setBusy("mdt");
    const r = await toast.guard(applyGrades({ ceremonyId }), "Application impossible");
    setBusy(null);
    if (r) reportResult("Grades MDT", r.applied, r.skipped, "appliquée(s)");
  }

  function reportResult(label: string, done: number, skipped: string[], verb: string) {
    if (done > 0) toast.success(`${label} : ${done} ${verb}.`);
    if (skipped.length > 0) toast.warning(`${label} - ignorée(s) : ${skipped.join(" · ")}`);
    if (done === 0 && skipped.length === 0) toast.warning(`${label} : aucune montée en grade à traiter.`);
  }

  async function onAddDismissal() {
    const agentId = dismissAgent[0];
    if (agentId) {
      const r = await toast.guard(addDismissal({ ceremonyId, agentId: agentId as Id<"agents"> }), "Ajout impossible");
      if (r) setDismissAgent([]);
    } else if (dismissName.trim()) {
      const r = await toast.guard(addDismissal({ ceremonyId, name: dismissName.trim(), fromGradeName: dismissGrade.trim() || undefined }), "Ajout impossible");
      if (r) { setDismissName(""); setDismissGrade(""); }
    }
  }

  async function onAnnounce(kind: "announce" | "result") {
    setPosting(kind);
    const r = kind === "announce"
      ? await toast.guard(announce({ ceremonyId }), "Envoi impossible")
      : await toast.guard(announceResult({ ceremonyId }), "Envoi impossible");
    setPosting(null);
    if (r !== undefined) toast.success(kind === "announce" ? "Annonce de cérémonie envoyée sur Discord." : "Résultat de cérémonie envoyé sur Discord.");
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[560px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <div className="flex h-[40px] w-[40px] items-center justify-center rounded-[9px] border border-border bg-surface-2 text-accent"><Award className="h-[19px] w-[19px]" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 truncate text-[15px] font-bold">{c ? c.title : "…"}</h2>
            <div className="mt-[2px] truncate text-[12px] text-muted">
              {c ? `${fmtDate(c.at)} · ${c.startTime}${c.lieu ? ` · ${c.lieu}` : ""}` : ""}
            </div>
          </div>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex flex-1 flex-col gap-[20px] overflow-y-auto px-[18px] py-4">
          {c === undefined ? (
            <div className="text-[13px] text-muted">Chargement…</div>
          ) : c === null ? (
            <div className="text-[13px] text-muted">Cérémonie introuvable.</div>
          ) : (
            <>
              {/* Montées en grade */}
              <section>
                <div className="mb-[8px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Montées en grade</div>
                <div className="rounded-sm border border-border bg-surface-2 p-[12px]">
                  <AgentPicker
                    roster={roster.filter((a) => !c.promotions.some((p) => p.agentId === a._id))}
                    selected={promoAgent}
                    onChange={(ids) => setPromoAgent(ids.slice(-1))}
                    placeholder="Rechercher l'agent à promouvoir…"
                  />
                  <div className="mt-[8px] flex gap-2">
                    <select value={promoGrade} onChange={(e) => setPromoGrade(e.target.value)} className="h-9 flex-1 rounded-sm border border-border bg-surface px-2 text-[13px] outline-none focus:border-accent">
                      <option value="">Grade futur…</option>
                      {grades.map((g) => <option key={g._id} value={g._id}>{g.name}</option>)}
                    </select>
                    <button onClick={onAddPromotion} disabled={!promoAgent[0] || !promoGrade} className="flex items-center gap-[6px] rounded-sm bg-accent px-3 text-[12px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">
                      <Plus className="h-[14px] w-[14px]" /> Ajouter
                    </button>
                  </div>
                </div>

                {c.promotions.length > 0 && (
                  <div className="mt-[10px] flex flex-col gap-[7px]">
                    {c.promotions.map((p) => (
                      <div key={p._id} className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-[12px] py-[9px]">
                        <span className="font-data text-[11px] text-accent">{fmtMatricule(p.matricule) ?? "-"}</span>
                        <span className="flex-1 truncate text-[13px] font-semibold">{p.agentName}</span>
                        <span className="text-[12px] text-muted">{p.fromGrade ?? "-"}</span>
                        <span className="text-faint">→</span>
                        <span className="text-[12px] font-semibold">{p.toGrade}</span>
                        {p.discordApplied && <span title="Rôle Discord mis en file" className="h-[7px] w-[7px] rounded-full" style={{ background: "var(--accent)" }} />}
                        {p.mdtApplied && <span title="Grade appliqué dans le MDT" className="h-[7px] w-[7px] rounded-full" style={{ background: "var(--success)" }} />}
                        <button onClick={() => toast.guard(removePromotion({ promotionId: p._id as Id<"ceremonyPromotions"> }), "Suppression impossible")} className="text-faint hover:text-danger"><Trash2 className="h-[14px] w-[14px]" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Licenciements */}
              <section>
                <div className="mb-[8px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Licenciements</div>
                <div className="rounded-sm border border-border bg-surface-2 p-[12px]">
                  <AgentPicker
                    roster={roster}
                    selected={dismissAgent}
                    onChange={(ids) => setDismissAgent(ids.slice(-1))}
                    placeholder="Rechercher l'agent licencié…"
                  />
                  <div className="my-[8px] text-center text-[10.5px] uppercase tracking-[0.08em] text-faint">ou saisie manuelle</div>
                  <div className="flex gap-2">
                    <input value={dismissName} onChange={(e) => setDismissName(e.target.value)} placeholder="Nom (non recensé)" className="h-9 flex-1 rounded-sm border border-border bg-surface px-2 text-[13px] outline-none focus:border-accent" />
                    <input value={dismissGrade} onChange={(e) => setDismissGrade(e.target.value)} placeholder="Grade quitté" className="h-9 w-[130px] rounded-sm border border-border bg-surface px-2 text-[13px] outline-none focus:border-accent" />
                    <button onClick={onAddDismissal} disabled={!dismissAgent[0] && !dismissName.trim()} className="flex items-center gap-[6px] rounded-sm bg-accent px-3 text-[12px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">
                      <Plus className="h-[14px] w-[14px]" /> Ajouter
                    </button>
                  </div>
                </div>
                {c.dismissals.length > 0 && (
                  <div className="mt-[10px] flex flex-col gap-[7px]">
                    {c.dismissals.map((d) => (
                      <div key={d._id} className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-[12px] py-[9px]">
                        <span className="flex-1 truncate text-[13px] font-semibold">{d.name}</span>
                        <span className="text-[12px] text-muted">{d.fromGradeName ?? "-"}</span>
                        <span className="text-faint">→</span>
                        <span className="text-[12px] font-semibold">civil</span>
                        <button onClick={() => toast.guard(removeDismissal({ dismissalId: d._id as Id<"ceremonyDismissals"> }), "Suppression impossible")} className="text-faint hover:text-danger"><Trash2 className="h-[14px] w-[14px]" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Annonces Discord */}
              <section>
                <div className="mb-[8px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Annonces Discord</div>
                <div className="flex flex-col gap-2">
                  <button onClick={() => onAnnounce("announce")} disabled={posting !== null} className="flex items-center gap-[8px] rounded-sm border border-border bg-surface-2 px-[13px] py-[10px] text-[12.5px] font-semibold text-muted hover:border-border-strong disabled:opacity-50">
                    <Send className="h-[15px] w-[15px]" /> {posting === "announce" ? "Envoi…" : c.announceSent ? "Renvoyer l'annonce de cérémonie" : "Envoyer l'annonce de cérémonie"}
                    {c.announceSent && <span className="h-[7px] w-[7px] rounded-full" style={{ background: "var(--success)" }} />}
                  </button>
                  <button onClick={() => onAnnounce("result")} disabled={posting !== null || (c.promotions.length === 0 && c.dismissals.length === 0)} className="flex items-center gap-[8px] rounded-sm border border-border bg-surface-2 px-[13px] py-[10px] text-[12.5px] font-semibold text-muted hover:border-border-strong disabled:opacity-50">
                    <Send className="h-[15px] w-[15px]" /> {posting === "result" ? "Envoi…" : c.resultSent ? "Renvoyer le résultat de cérémonie" : "Envoyer le résultat de cérémonie"}
                    {c.resultSent && <span className="h-[7px] w-[7px] rounded-full" style={{ background: "var(--success)" }} />}
                  </button>
                  <div className="text-[11px] text-faint">Publié dans le salon des cérémonies (Configuration &gt; Bot Discord). L'annonce indique date, heure et présence obligatoire ; le résultat liste les montées en grade et les licenciements.</div>
                </div>
              </section>

              {/* Rappels */}
              <section>
                <div className="mb-[8px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Rappels</div>
                <div className="flex gap-2">
                  <input
                    value={reminderText}
                    onChange={(e) => setReminderText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onAddReminder(); } }}
                    placeholder="Ajouter un rappel (ex. tenue de cérémonie obligatoire)…"
                    className="h-9 flex-1 rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent"
                  />
                  <button onClick={onAddReminder} disabled={!reminderText.trim()} className="flex items-center gap-[6px] rounded-sm bg-accent px-3 text-[12px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">
                    <Plus className="h-[14px] w-[14px]" /> Ajouter
                  </button>
                </div>
                {c.reminders.length > 0 && (
                  <div className="mt-[10px] flex flex-col gap-[6px]">
                    {c.reminders.map((r) => (
                      <div key={r._id} className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-[12px] py-[8px]">
                        <span className="flex-1 text-[12.5px]">{r.text}</span>
                        <button onClick={() => toast.guard(removeReminder({ reminderId: r._id as Id<"ceremonyReminders"> }), "Suppression impossible")} className="text-faint hover:text-danger"><Trash2 className="h-[14px] w-[14px]" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Actions Discord / MDT */}
              <section>
                <div className="mb-[8px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Exécution des montées en grade</div>
                <div className="flex flex-col gap-2">
                  <button onClick={onExecuteDiscord} disabled={busy !== null || c.promotions.length === 0} className="flex items-center gap-[8px] rounded-sm border border-border bg-surface-2 px-[13px] py-[10px] text-[12.5px] font-semibold text-muted hover:border-border-strong disabled:opacity-50">
                    <Send className="h-[15px] w-[15px]" /> {busy === "discord" ? "Exécution…" : "Exécuter les montées en grade Discord"}
                  </button>
                  <button onClick={onApplyGrades} disabled={busy !== null || c.promotions.length === 0} className="flex items-center gap-[8px] rounded-sm border border-border bg-surface-2 px-[13px] py-[10px] text-[12.5px] font-semibold text-muted hover:border-border-strong disabled:opacity-50">
                    <ArrowUpNarrowWide className="h-[15px] w-[15px]" /> {busy === "mdt" ? "Application…" : "Appliquer les grades dans le MDT"}
                  </button>
                  <div className="text-[11px] text-faint">Le rôle Discord est mis en file (le bot l'applique). L'application MDT change le grade dans l'effectif.</div>
                </div>
              </section>
            </>
          )}
        </div>

        {c && (
          <div className="flex flex-shrink-0 items-center gap-2 border-t border-border px-[18px] py-4">
            {confirmDelete ? (
              <>
                <span className="flex-1 text-[12.5px] text-muted">Supprimer cette cérémonie ?</span>
                <button onClick={() => setConfirmDelete(false)} className="rounded-sm border border-border bg-surface-2 px-3 py-[8px] text-[12.5px] font-semibold hover:border-border-strong">Annuler</button>
                <button onClick={() => toast.guard(remove({ ceremonyId }), "Suppression impossible").then((r) => { if (r !== undefined) { toast.success("Cérémonie supprimée."); onClose(); } })} className="rounded-sm px-3 py-[8px] text-[12.5px] font-semibold text-white" style={{ background: "var(--danger)" }}>Confirmer</button>
              </>
            ) : (
              <>
                <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-[12px] py-[10px] text-[12.5px] font-semibold text-muted hover:border-danger hover:text-danger">
                  <Trash2 className="h-[14px] w-[14px]" /> Supprimer
                </button>
                <div className="flex-1" />
                <button onClick={() => setDocOpen(true)} className="flex items-center gap-[7px] rounded-sm bg-accent px-[14px] py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]">
                  <FileImage className="h-[15px] w-[15px]" /> Générer le document
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {docOpen && c && <CeremonieDoc ceremony={c} onClose={() => setDocOpen(false)} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">{label}</div>
      {children}
    </div>
  );
}
