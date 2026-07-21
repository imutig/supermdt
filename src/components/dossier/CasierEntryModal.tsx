import { useEffect, useState } from "react";
import { X, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { AgentTag } from "@/components/common/AgentTag";
import { RichTextEditor } from "@/components/common/RichTextEditor";
import { ImageGallery } from "@/components/common/ImageGallery";
import { MultiSelect } from "@/components/common/MultiSelect";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";

function fmtDur(seconds: number) {
  if (!seconds) return "Aucune";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [h ? `${h}h` : "", m ? `${m}min` : ""].filter(Boolean).join(" ") || `${seconds}s`;
}
// Heure de sortie de cellule = heure Miranda + durée de peine (item 4).
function addSecondsToTime(hhmm: string, seconds: number): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const total = (+m[1] * 3600 + +m[2] * 60 + seconds) % 86400;
  const h = Math.floor(total / 3600);
  const mn = Math.floor((total % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(mn).padStart(2, "0")}`;
}

export function CasierEntryModal({ entryId, canDelete, onClose }: { entryId: Id<"casierEntries">; canDelete: boolean; onClose: () => void }) {
  const entry = useQuery(api.casier.getEntry, { entryId });
  const remove = useMutation(api.casier.remove);
  const updateArrest = useMutation(api.casier.updateArrest);
  const closeDossier = useMutation(api.casier.closeDossier);
  const reopenDossier = useMutation(api.casier.reopenDossier);
  const { can } = useCan();
  const toast = useToast();
  const canEditClosed = can("casier.editClosed");
  const locked = !!entry?.closed && !canEditClosed; // dossier clos, verrouillé pour les non-hauts-gradés
  const canEdit = can("casier.edit") && !locked;

  const reports = useQuery(api.reports.list, canEdit ? {} : "skip");
  const vehicleOpts = useQuery(api.vehicles.pickerList, canEdit ? {} : "skip");
  const weaponOpts = useQuery(api.weapons.pickerList, canEdit ? {} : "skip");
  const opts = useQuery(api.configEditors.options);

  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  // Volet arrestation éditable (dérivé de l'entrée).
  const [init, setInit] = useState(false);
  const [a, setA] = useState<{
    arrestType: "RAPPORT" | "DOSSIER";
    reportBody: string; imageUrls: string[]; avocat: string;
    linkedReportId: string; vehicleIds: string[]; weaponIds: string[]; dossierStatus: string; forceUsed: boolean; finePaid: boolean;
  }>({ arrestType: "RAPPORT", reportBody: "", imageUrls: [], avocat: "", linkedReportId: "", vehicleIds: [], weaponIds: [], dossierStatus: "", forceUsed: false, finePaid: false });

  if (!init && entry) {
    setInit(true);
    setA({
      arrestType: entry.arrestType, reportBody: entry.reportBody, imageUrls: entry.imageUrls, avocat: entry.avocat,
      linkedReportId: entry.linkedReportId ?? "", vehicleIds: entry.vehicleIds, weaponIds: entry.weaponIds,
      dossierStatus: entry.dossierStatus, forceUsed: entry.forceUsed, finePaid: entry.finePaid,
    });
  }
  const isDossier = a.arrestType === "DOSSIER";

  async function saveArrest() {
    setBusy(true);
    const r = await toast.guard(updateArrest({
      entryId, arrestType: a.arrestType,
      reportBody: a.reportBody || undefined, imageUrls: a.imageUrls, avocat: a.avocat.trim() || undefined,
      linkedReportId: isDossier && a.linkedReportId ? (a.linkedReportId as Id<"reports">) : undefined,
      vehicleIds: isDossier ? (a.vehicleIds as Id<"vehicles">[]) : undefined,
      weaponIds: isDossier ? (a.weaponIds as Id<"weapons">[]) : undefined,
      dossierStatus: isDossier ? a.dossierStatus || undefined : undefined,
      forceUsed: isDossier ? a.forceUsed : undefined,
      finePaid: a.finePaid,
    }), "Enregistrement impossible");
    setBusy(false);
    if (r !== undefined) toast.success("Volet arrestation enregistré.");
  }

  async function doDelete() {
    setBusy(true);
    try { await remove({ entryId }); onClose(); } finally { setBusy(false); }
  }

  const F = "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";
  const H = "mb-[8px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint";

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[600px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <div className="flex-1">
            <h2 className="m-0 text-[15px] font-bold">{isDossier ? "Dossier d'arrestation" : "Rapport d'arrestation"}</h2>
            <div className="mt-[2px] text-[12px] text-muted">
              {entry ? entry.citizenName : "…"}
              {entry && <> · <span className="font-data">{new Date(entry.at).toLocaleString("fr-FR")}</span></>}
            </div>
          </div>
          {entry?.closed && <span className="rounded-[5px] px-[8px] py-[3px] text-[11px] font-bold uppercase" style={{ background: "color-mix(in srgb, var(--muted) 16%, transparent)", color: "var(--muted)" }}>Clos</span>}
          {entry && entry.status === "ANNULEE" && <span className="rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold" style={{ background: "color-mix(in srgb, var(--muted) 14%, transparent)", color: "var(--muted)" }}>Annulée</span>}
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-[18px] py-4">
          {entry === undefined ? <div className="text-[13px] text-muted">Chargement…</div> : entry === null ? <div className="text-[13px] text-muted">Entrée introuvable.</div> : (
            <>
              {/* Type d'arrestation */}
              <div>
                <div className={H}>Type</div>
                <div className="flex gap-2">
                  {(["RAPPORT", "DOSSIER"] as const).map((t) => (
                    <button key={t} disabled={!canEdit} onClick={() => setA({ ...a, arrestType: t })} className="flex-1 rounded-sm border px-3 py-[8px] text-[12.5px] font-semibold disabled:cursor-default" style={a.arrestType === t ? { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent)" } : { borderColor: "var(--border)", color: "var(--muted)" }}>
                      {t === "RAPPORT" ? "Rapport d'arrestation" : "Dossier d'arrestation"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Totaux */}
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-border bg-border">
                <div className="bg-surface-2 px-3 py-[10px]"><div className="mb-[3px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Amende</div><div className="font-data text-[14px] font-semibold">${entry.totalFine.toLocaleString("fr-FR")}</div></div>
                <div className="bg-surface-2 px-3 py-[10px]"><div className="mb-[3px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Prison</div><div className="font-data text-[14px] font-semibold">{fmtDur(entry.totalJailSeconds)}</div></div>
                <div className="bg-surface-2 px-3 py-[10px]"><div className="mb-[3px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">DOJ</div><div className="text-[13px] font-semibold" style={{ color: entry.dojRequired ? "var(--critical)" : "var(--muted)" }}>{entry.dojRequired ? "Requise" : "Non"}</div></div>
              </div>

              {/* Statut de l'amende (item 4) */}
              {entry.totalFine > 0 && (
                <div className="flex items-center gap-2">
                  <div className={H + " mb-0 flex-1"}>Statut de l'amende</div>
                  {(["nonpaid", "paid"] as const).map((k) => {
                    const on = k === "paid" ? a.finePaid : !a.finePaid;
                    const paid = k === "paid";
                    return (
                      <button key={k} disabled={!canEdit} onClick={() => canEdit && setA({ ...a, finePaid: paid })}
                        className="rounded-[6px] border px-[11px] py-[6px] text-[12px] font-semibold disabled:cursor-default"
                        style={on
                          ? paid ? { background: "color-mix(in srgb, var(--success) 14%, transparent)", borderColor: "var(--success)", color: "var(--success)" } : { background: "rgba(220,38,38,0.10)", borderColor: "rgba(220,38,38,0.4)", color: "var(--danger)" }
                          : { background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--muted)" }}>
                        {paid ? "Payée" : "Non payée"}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Timer de garde à vue (live) */}
              {entry.totalJailSeconds > 0 && entry.status !== "ANNULEE" && (
                <GardeAVueTimer
                  bookedAt={entry.at}
                  totalJailSeconds={entry.totalJailSeconds}
                  plannedExit={entry.mirandaAt ? addSecondsToTime(entry.mirandaAt, entry.totalJailSeconds) : null}
                  mirandaAt={entry.mirandaAt}
                />
              )}

              {/* Charges */}
              <div>
                <div className={H}>Charges ({entry.charges.length})</div>
                <div className="flex flex-col gap-[8px]">
                  {entry.charges.map((ch, i) => (
                    <div key={i} className="rounded-sm border border-border bg-surface-2 px-[12px] py-[10px]">
                      <div className="flex items-baseline gap-2"><span className="flex-1 text-[13px] font-semibold">{ch.name}</span><span className="font-data text-[13px] font-semibold">{ch.onDecision ? "À décision" : `$${ch.computedFine.toLocaleString("fr-FR")}`}</span></div>
                      <div className="mt-[5px] flex flex-wrap gap-[6px] text-[11px]">
                        <span className="rounded-[4px] border border-border bg-surface px-[6px] py-[1px] text-muted">{ch.category}</span>
                        {ch.severity && <span className="rounded-[4px] border border-border bg-surface px-[6px] py-[1px] text-muted">{ch.severity}</span>}
                        {ch.isRecidive && <span className="rounded-[4px] px-[6px] py-[1px] font-semibold" style={{ background: "color-mix(in srgb, var(--warning) 16%, transparent)", color: "var(--warning)" }}>Récidive</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Contexte */}
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border">
                <Field label="Agent">{entry.officers[0] ? <AgentTag agent={entry.officers[0]} /> : "-"}</Field>
                <Field label="Lieu">{entry.lieu || "-"}</Field>
                <Field label="Sanctions">{entry.sanctions.length ? entry.sanctions.join(", ") : "-"}</Field>
                <Field label="Menottage / Miranda">{entry.cuffedAt || "-"} / {entry.mirandaAt || "-"}</Field>
              </div>

              {entry.derouleFaits && (
                <div><div className={H}>Déroulé des faits</div><div className="rounded-sm border border-border bg-surface-2 px-[10px] py-[8px]"><RichTextEditor value={entry.derouleFaits} editable={false} /></div></div>
              )}

              {/* Avocat (les deux) */}
              <div><div className={H}>Avocat</div>{canEdit ? <input value={a.avocat} onChange={(e) => setA({ ...a, avocat: e.target.value })} placeholder="Nom de l'avocat" className={F} /> : <div className="text-[13px]">{a.avocat || "-"}</div>}</div>

              {/* Rapport (les deux) */}
              <div><div className={H}>Rapport d'arrestation</div>{canEdit ? <RichTextEditor value={a.reportBody} onChange={(v) => setA({ ...a, reportBody: v })} /> : a.reportBody ? <RichTextEditor value={a.reportBody} editable={false} /> : <div className="text-[12.5px] text-faint">Aucun rapport.</div>}</div>

              {/* Galerie (les deux) */}
              <div><div className={H}>Images</div><ImageGallery urls={a.imageUrls} onChange={canEdit ? (u) => setA({ ...a, imageUrls: u }) : undefined} emptyLabel="Aucune image." /></div>

              {/* Champs dossier uniquement */}
              {isDossier && (
                <>
                  <div><div className={H}>Rapport lié</div>
                    {canEdit ? (
                      <select value={a.linkedReportId} onChange={(e) => setA({ ...a, linkedReportId: e.target.value })} className={F}>
                        <option value="">- Sélectionner un rapport -</option>
                        {(reports ?? []).map((r) => <option key={r._id} value={r._id}>{r.title}</option>)}
                      </select>
                    ) : <div className="text-[13px]">{entry.linkedReport?.title ?? "-"}</div>}
                  </div>
                  <div><div className={H}>Véhicules impliqués</div>{canEdit ? <MultiSelect options={vehicleOpts} selected={a.vehicleIds} onChange={(ids) => setA({ ...a, vehicleIds: ids })} placeholder="Ajouter un véhicule…" /> : <div className="text-[13px]">{entry.vehicles.map((v) => v.label).join(", ") || "-"}</div>}</div>
                  <div><div className={H}>Armes utilisées</div>{canEdit ? <MultiSelect options={weaponOpts} selected={a.weaponIds} onChange={(ids) => setA({ ...a, weaponIds: ids })} placeholder="Ajouter une arme…" /> : <div className="text-[13px]">{entry.weapons.map((w) => w.label).join(", ") || "-"}</div>}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><div className={H}>Statut du dossier</div>
                      {canEdit ? <select value={a.dossierStatus} onChange={(e) => setA({ ...a, dossierStatus: e.target.value })} className={F}><option value="">-</option>{(opts?.dossierStatuses ?? []).map((s) => <option key={s._id} value={s.name}>{s.name}</option>)}</select> : <div className="text-[13px]">{a.dossierStatus || "-"}</div>}
                    </div>
                    <div><div className={H}>Force utilisée</div>
                      <label className="flex h-10 items-center gap-2 text-[13px]"><input type="checkbox" disabled={!canEdit} checked={a.forceUsed} onChange={(e) => setA({ ...a, forceUsed: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" /> Individu neutralisé par la force</label>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {entry && (canEdit || canDelete || isDossier || entry.closed) && (
          <div className="flex flex-shrink-0 items-center gap-2 border-t border-border px-[18px] py-4">
            {confirm ? (
              <>
                <span className="flex-1 text-[12.5px] text-muted">Supprimer (archiver) ?</span>
                <button onClick={() => setConfirm(false)} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
                <button onClick={doDelete} disabled={busy} className="rounded-sm px-4 py-[10px] text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--danger)" }}>{busy ? "…" : "Confirmer"}</button>
              </>
            ) : (
              <>
                {canDelete && <button onClick={() => setConfirm(true)} className="flex h-[42px] w-[42px] items-center justify-center rounded-sm border border-border bg-surface-2" style={{ color: "var(--danger)" }} title="Supprimer"><Trash2 className="h-4 w-4" /></button>}
                {/* Clôture / réouverture d'un dossier d'arrestation (item I) */}
                {isDossier && !entry.closed && canEdit && (
                  <button onClick={async () => { const r = await toast.guard(closeDossier({ entryId }), "Clôture impossible"); if (r !== undefined) toast.success("Dossier clôturé."); }} className="rounded-sm border border-border bg-surface-2 px-3 py-[10px] text-[12.5px] font-semibold hover:border-border-strong">Clôturer le dossier</button>
                )}
                {entry.closed && canEditClosed && (
                  <button onClick={async () => { const r = await toast.guard(reopenDossier({ entryId }), "Réouverture impossible"); if (r !== undefined) toast.success("Dossier rouvert."); }} className="rounded-sm border border-border bg-surface-2 px-3 py-[10px] text-[12.5px] font-semibold hover:border-border-strong">Rouvrir</button>
                )}
                <div className="flex-1" />
                {locked && <span className="text-[11.5px] italic text-faint">Dossier clôturé - lecture seule</span>}
                {canEdit && <button onClick={saveArrest} disabled={busy} className="rounded-sm bg-accent px-5 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "…" : "Enregistrer"}</button>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Timer de garde à vue : décompte live du temps de détention à partir du booking.
function GardeAVueTimer({ bookedAt, totalJailSeconds, plannedExit, mirandaAt }: { bookedAt: number; totalJailSeconds: number; plannedExit: string | null; mirandaAt?: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const target = bookedAt + totalJailSeconds * 1000;
  const remainingMs = target - now;
  const done = remainingMs <= 0;
  const absSec = Math.floor(Math.abs(remainingMs) / 1000);
  const hh = String(Math.floor(absSec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((absSec % 3600) / 60)).padStart(2, "0");
  const ss = String(absSec % 60).padStart(2, "0");
  const pct = Math.max(0, Math.min(100, ((now - bookedAt) / (totalJailSeconds * 1000)) * 100));
  const color = done ? "var(--success)" : remainingMs < 60_000 ? "var(--warning)" : "var(--accent)";

  return (
    <div className="rounded-sm border px-[14px] py-[12px]" style={{ borderColor: color, background: `color-mix(in srgb, ${color} 7%, transparent)` }}>
      <div className="flex items-center gap-2">
        <span className="h-[8px] w-[8px] rounded-full" style={{ background: color, animation: done ? "none" : "mdtPulse 1.6s ease-in-out infinite" }} />
        <span className="text-[11px] font-bold uppercase tracking-[0.09em]" style={{ color }}>{done ? "Détention terminée" : "Garde à vue en cours"}</span>
        <div className="flex-1" />
        <span className="font-data text-[22px] font-bold tabular-nums" style={{ color }}>{hh}:{mm}:{ss}</span>
      </div>
      <div className="mt-[9px] h-[5px] overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="mt-[8px] flex items-center gap-2 text-[11px] text-faint">
        <span>Peine {fmtDur(totalJailSeconds)}</span>
        <div className="flex-1" />
        {done ? (
          <span>Dépassement depuis {hh}:{mm}:{ss}</span>
        ) : plannedExit ? (
          <span>Sortie prévue {plannedExit}{mirandaAt ? ` (Miranda ${mirandaAt})` : ""}</span>
        ) : (
          <span>Sortie estimée {new Date(target).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}</span>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-2 px-3 py-[10px]">
      <div className="mb-[3px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">{label}</div>
      <div className="text-[13px]">{children}</div>
    </div>
  );
}
