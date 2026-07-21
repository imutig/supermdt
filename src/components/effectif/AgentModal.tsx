import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Scissors, Plus, IdCard, KeyRound, Lock } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useToast } from "@/providers/toast";
import { useCan } from "@/hooks/useCan";
import { fmtMatricule } from "@/components/common/AgentTag";
import { fmtAnciennete, tsToDateInput, dateInputToTs } from "@/lib/anciennete";
import { actionLabel, resourceLabel } from "@/lib/auditLabels";
import { SanctionModal } from "@/components/effectif/SanctionModal";
import { FicheDocument } from "@/components/effectif/FicheDocument";

export function AgentModal({ agentId, onClose }: { agentId: Id<"agents">; onClose: () => void }) {
  const toast = useToast();
  const { can } = useCan();
  const [ficheOpen, setFicheOpen] = useState(false);
  const navigate = useNavigate();
  const a = useQuery(api.agents.getAgent, { agentId });
  const options = useQuery(api.config.options);
  const logs = useQuery(api.agents.recentLogs, { agentId });
  const sanctions = useQuery(api.disciplines.byAgent, { agentId });

  const updateGrade = useMutation(api.agents.updateGrade);
  const setMatricule = useMutation(api.agents.setMatricule);
  const setDivisions = useMutation(api.agents.setDivisions);
  const setQualifications = useMutation(api.agents.setQualifications);
  const setStatus = useMutation(api.agents.setStatus);
  const setDateEntree = useMutation(api.agents.setDateEntree);
  const resetPassword = useAction(api.accounts.resetPassword);
  const setLock = useMutation(api.agents.setLock);
  const cutService = useMutation(api.services.cut);

  const [matInput, setMatInput] = useState("");
  const [sanctionModal, setSanctionModal] = useState(false);

  const canGrade = can("effectif.grade");
  const canEditAgent = can("effectif.edit");
  const canDiv = can("effectif.division");
  const canQual = can("effectif.qualification");
  const canDeact = can("effectif.deactivate");
  const canResetPw = can("effectif.resetpw");
  const canManageSvc = can("services.manage");
  const canDiscipline = can("discipline.create");

  const divIds = new Set((a?.divisions ?? []).map((d) => d._id));
  const qualIds = new Set((a?.qualifications ?? []).map((q) => q._id));

  async function toggleDivision(id: Id<"divisions">) {
    if (!a) return;
    const next = new Set(divIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    await toast.guard(setDivisions({ agentId, divisionIds: [...next] }), "Modification impossible");
  }

  async function toggleQualification(id: Id<"qualifications">) {
    if (!a) return;
    const next = new Set(qualIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    await toast.guard(setQualifications({ agentId, qualificationIds: [...next] }), "Modification impossible");
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex justify-end"
      style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-[560px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]"
        style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}
      >
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <div className="flex h-[42px] w-[42px] items-center justify-center overflow-hidden rounded-[9px] border border-border bg-surface-2 text-[14px] font-bold text-muted">
            {a?.avatarUrl ? (
              <img src={a.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : a ? (
              `${a.prenomRP.charAt(0)}${a.nomRP.charAt(0)}`.toUpperCase()
            ) : (
              "…"
            )}
          </div>
          <div className="flex-1">
            <h2 className="m-0 text-[15px] font-bold">
              {a ? (
                <>
                  {fmtMatricule(a.matricule) && <span className="font-data text-accent">{fmtMatricule(a.matricule)} </span>}
                  {a.prenomRP} {a.nomRP}
                </>
              ) : (
                "…"
              )}
            </h2>
            <div className="mt-[2px] text-[12px] text-muted">
              {a ? `${a.isOwner ? "Owner" : a.grade?.name ?? "-"} · @${a.login}` : ""}
            </div>
          </div>
          {a && (
            <span
              className="rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold"
              style={
                a.status === "ACTIVE"
                  ? { background: "color-mix(in srgb, var(--success) 14%, transparent)", color: "var(--success)" }
                  : { background: "color-mix(in srgb, var(--danger) 14%, transparent)", color: "var(--danger)" }
              }
            >
              {a.status}
            </span>
          )}
          {a && !a.isOwner && (
            <button onClick={() => setFicheOpen(true)} className="mdt-press flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-[11px] py-[7px] text-[12px] font-semibold text-muted hover:border-border-strong hover:text-text" title="Fiche de renseignement">
              <IdCard className="h-[15px] w-[15px]" /> Fiche
            </button>
          )}
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-[18px] py-4">
          {a === undefined ? (
            <div className="text-[13px] text-muted">Chargement…</div>
          ) : a === null ? (
            <div className="text-[13px] text-muted">Agent introuvable.</div>
          ) : a.isOwner ? (
            <div className="rounded-sm border border-border bg-surface-2 px-4 py-3 text-[13px] text-muted">
              Le compte owner est intouchable (hors effectif RP).
            </div>
          ) : (
            <>
              {/* Service en cours */}
              <div className="flex items-center gap-3 rounded-sm border border-border bg-surface-2 px-[13px] py-[11px]">
                <span className="h-[9px] w-[9px] rounded-full" style={{ background: a.onDuty ? "var(--success)" : "var(--faint)" }} />
                <span className="flex-1 text-[13px] font-semibold">{a.onDuty ? "En service" : "Hors service"}</span>
                {a.onDuty && canManageSvc && a.openSessionId && (
                  <button
                    onClick={() => toast.guard(cutService({ id: a.openSessionId as Id<"serviceSessions"> }), "Action impossible")}
                    className="flex items-center gap-[6px] rounded-sm border border-border bg-surface px-[10px] py-[6px] text-[12px] font-semibold text-muted hover:border-border-strong"
                  >
                    <Scissors className="h-[13px] w-[13px]" /> Couper
                  </button>
                )}
              </div>

              {a.currentAbsence && (
                <div className="rounded-sm border px-[13px] py-[10px] text-[12.5px]" style={{ borderColor: "var(--warning)", background: "color-mix(in srgb, var(--warning) 8%, transparent)", color: "var(--warning)" }}>
                  Absence en cours jusqu'au {new Date(a.currentAbsence.to).toLocaleDateString("fr-FR")}
                </div>
              )}

              {/* Grade + matricule */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Grade</div>
                  {canGrade ? (
                    <select
                      value={a.grade?._id ?? ""}
                      onChange={(e) => toast.guard(updateGrade({ agentId, gradeId: e.target.value as Id<"grades"> }), "Modification impossible")}
                      className="h-9 w-full rounded-sm border border-border bg-surface-2 px-2 text-[13px] outline-none focus:border-accent"
                    >
                      {(options?.grades ?? []).map((g) => (
                        <option key={g._id} value={g._id}>{g.name}{g.external ? " (extérieur)" : ""}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-[13px]">{a.grade?.name ?? "-"}</div>
                  )}
                </div>
                <div>
                  <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">N° de badge</div>
                  {canEditAgent ? (
                    <div className="flex gap-2">
                      <input
                        value={matInput}
                        onChange={(e) => setMatInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
                        placeholder={a.matricule != null ? String(a.matricule).padStart(5, "0") : "5 chiffres"}
                        className="h-9 w-full rounded-sm border border-border bg-surface-2 px-2 font-data text-[13px] outline-none focus:border-accent"
                      />
                      <button
                        onClick={async () => {
                          const n = parseInt(matInput);
                          if (!n) return;
                          const r = await toast.guard(setMatricule({ agentId, matricule: n }), "Modification impossible");
                          if (r !== undefined) {
                            toast.success("Numéro de badge mis à jour.");
                            setMatInput("");
                          }
                        }}
                        className="rounded-sm bg-accent px-3 text-[12px] font-semibold text-accent-contrast hover:brightness-[1.06]"
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <div className="font-data text-[13px]">{fmtMatricule(a.matricule) ?? "-"}</div>
                  )}
                </div>
              </div>

              {/* Date d'arrivée + ancienneté */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Date d'arrivée</div>
                  {canEditAgent ? (
                    <input
                      type="date"
                      value={tsToDateInput(a.dateEntree)}
                      onChange={(e) => toast.guard(setDateEntree({ agentId, dateEntree: dateInputToTs(e.target.value) }), "Modification impossible")}
                      className="h-9 w-full rounded-sm border border-border bg-surface-2 px-2 font-data text-[13px] outline-none focus:border-accent"
                    />
                  ) : (
                    <div className="font-data text-[13px]">{a.dateEntree ? new Date(a.dateEntree).toLocaleDateString("fr-FR", { timeZone: "UTC" }) : "-"}</div>
                  )}
                </div>
                <div>
                  <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Ancienneté</div>
                  <div className="flex h-9 items-center text-[13px] font-semibold">{fmtAnciennete(a.dateEntree)}</div>
                </div>
              </div>

              {/* Divisions */}
              <div>
                <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Divisions</div>
                <div className="flex flex-wrap gap-[6px]">
                  {(options?.divisions ?? []).map((d) => {
                    const on = divIds.has(d._id);
                    return (
                      <button
                        key={d._id}
                        disabled={!canDiv}
                        onClick={() => toggleDivision(d._id)}
                        className="rounded-[6px] border px-[10px] py-[5px] text-[11.5px] font-semibold disabled:cursor-default"
                        style={on ? { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent)" } : { background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--muted)" }}
                      >
                        {d.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Formations & spécialités : purement déclaratives, elles n'ouvrent aucun droit. */}
              <div>
                <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Formations & spécialités</div>
                {(options?.qualifications ?? []).length === 0 ? (
                  <div className="text-[12.5px] text-faint">Aucun référentiel configuré.</div>
                ) : (
                  (["FORMATION", "SPECIALITE"] as const).map((kind) => {
                    const rows = (options?.qualifications ?? []).filter((q) => q.kind === kind);
                    if (rows.length === 0) return null;
                    return (
                      <div key={kind} className="mb-[8px]">
                        <div className="mb-[4px] text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">
                          {kind === "FORMATION" ? "Formations" : "Spécialités"}
                        </div>
                        <div className="flex flex-wrap gap-[6px]">
                          {rows.map((q) => {
                            const on = qualIds.has(q._id);
                            const tint = q.color ?? "var(--accent)";
                            return (
                              <button
                                key={q._id}
                                disabled={!canQual}
                                title={q.name}
                                onClick={() => toggleQualification(q._id as Id<"qualifications">)}
                                className="flex items-center gap-[6px] rounded-[6px] border px-[10px] py-[5px] text-[11.5px] font-semibold disabled:cursor-default"
                                style={on
                                  ? { background: `color-mix(in srgb, ${tint} 14%, transparent)`, borderColor: tint, color: tint }
                                  : { background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--muted)" }}
                              >
                                <span className="font-data text-[10.5px] font-bold">{q.code}</span>
                                <span className="opacity-80">{q.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Sanctions disciplinaires */}
              <div>
                <div className="mb-[8px] flex items-center gap-2">
                  <div className="flex-1 text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Sanctions</div>
                  {canDiscipline && (
                    <button
                      onClick={() => setSanctionModal(true)}
                      title="Ajouter une sanction"
                      className="flex h-[24px] w-[24px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong hover:text-accent"
                    >
                      <Plus className="h-[15px] w-[15px]" />
                    </button>
                  )}
                </div>
                {(sanctions ?? []).length === 0 ? (
                  <div className="text-[12.5px] text-faint">Aucune sanction.</div>
                ) : (
                  <div className="flex flex-col gap-[7px]">
                    {(sanctions ?? []).map((s) => (
                      <div key={s._id} className="rounded-sm border border-border bg-surface-2 px-[12px] py-[9px]">
                        <div className="flex items-center gap-2">
                          <span className="rounded-[5px] px-[7px] py-[2px] text-[11px] font-semibold" style={{ background: "color-mix(in srgb, var(--warning) 14%, transparent)", color: "var(--warning)" }}>{s.sanction}</span>
                          <span className="flex-1 text-[12.5px]">{s.motif}</span>
                          <span className="font-data text-[11px] text-faint">{new Date(s.at).toLocaleDateString("fr-FR")}</span>
                        </div>
                        {s.evidence.length > 0 && (
                          <div className="mt-[8px] flex flex-wrap gap-[6px]">
                            {s.evidence.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noreferrer">
                                <img src={url} alt="Preuve" className="h-[56px] w-[76px] rounded-[5px] border border-border object-cover hover:border-accent" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Logs récents */}
              <div>
                <div className="mb-[8px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Logs récents</div>
                {(logs ?? []).length === 0 ? (
                  <div className="text-[12.5px] text-faint">Aucune action récente.</div>
                ) : (
                  <div className="flex flex-col gap-px overflow-hidden rounded-sm border border-border bg-border">
                    {(logs ?? []).map((l) => (
                      <div key={l._id} className="flex items-center gap-2 bg-surface-2 px-3 py-[8px] text-[12px]">
                        <span
                          className="rounded-[4px] px-[6px] py-[1px] text-[10px] font-semibold"
                          style={{ background: "var(--surface)", color: "var(--muted)" }}
                        >
                          {resourceLabel(l.resourceType)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {actionLabel(l.action)}
                          {l.resourceLabel ? (
                            <>
                              {" · "}
                              {l.citizenId ? (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onClose();
                                    navigate(`/citoyen/${l.citizenId}`);
                                  }}
                                  className="cursor-pointer font-semibold text-accent hover:underline"
                                >
                                  {l.resourceLabel}
                                </span>
                              ) : (
                                <span className="font-semibold">{l.resourceLabel}</span>
                              )}
                            </>
                          ) : null}
                        </span>
                        <span className="flex-shrink-0 font-data text-[11px] text-faint">{new Date(l.at).toLocaleDateString("fr-FR")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {a && canResetPw && <AccountSection agentId={agentId} onReset={resetPassword} onLock={setLock} lockedUntil={a.lockedUntil ?? null} />}
        </div>

        {/* Footer : statut / virer */}
        {a && !a.isOwner && canDeact && (
          <div className="flex flex-shrink-0 gap-2 border-t border-border px-[18px] py-4">
            {a.status === "ACTIVE" ? (
              <>
                <button
                  onClick={() => toast.guard(setStatus({ agentId, status: "SUSPENDED" }), "Action impossible")}
                  className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold text-warning hover:border-border-strong"
                >
                  Suspendre
                </button>
                <button
                  onClick={() => toast.guard(setStatus({ agentId, status: "INACTIVE" }), "Action impossible").then((r) => r !== undefined && toast.success("Agent viré."))}
                  className="flex-1 rounded-sm px-4 py-[10px] text-[13px] font-semibold text-white hover:brightness-[1.06]"
                  style={{ background: "var(--danger)" }}
                >
                  Virer de l'effectif
                </button>
              </>
            ) : (
              <button
                onClick={() => toast.guard(setStatus({ agentId, status: "ACTIVE" }), "Action impossible").then((r) => r !== undefined && toast.success("Agent réactivé."))}
                className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]"
              >
                Réactiver
              </button>
            )}
          </div>
        )}
      </div>

      {sanctionModal && <SanctionModal initialAgentId={agentId} onClose={() => setSanctionModal(false)} />}
      {ficheOpen && a && <FicheDocument agentId={agentId} agentName={`${a.prenomRP} ${a.nomRP}`} onClose={() => setFicheOpen(false)} />}
    </div>
  );
}

// Gestion du compte : réinitialisation du mot de passe (permission effectif.resetpw).
// Le mot de passe temporaire n'est affiché qu'une fois, à la volée : il n'est
// stocké nulle part en clair et ne pourra pas être relu ensuite.
function AccountSection({
  agentId,
  onReset,
  onLock,
  lockedUntil,
}: {
  agentId: Id<"agents">;
  onReset: (args: { agentId: Id<"agents"> }) => Promise<string>;
  onLock: (args: { agentId: Id<"agents">; minutes?: number; reason?: string }) => Promise<unknown>;
  lockedUntil: number | null;
}) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  const locked = lockedUntil != null && lockedUntil > Date.now();

  async function run() {
    setBusy(true);
    const pwd = await toast.guard(onReset({ agentId }), "Réinitialisation impossible");
    setBusy(false);
    setConfirm(false);
    if (pwd) {
      setTemp(pwd);
      toast.success("Mot de passe réinitialisé.");
    }
  }

  return (
    <div className="mt-[18px]">
      <div className="mb-[8px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Gestion du compte</div>

      {temp ? (
        <div className="rounded-sm border p-[13px]" style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
          <div className="mb-[7px] text-[12px] font-semibold" style={{ color: "var(--accent)" }}>
            Mot de passe temporaire - transmettez-le à l'agent
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 select-all rounded-sm border border-border bg-surface px-3 py-[9px] font-data text-[15px] font-bold tracking-[0.08em]">{temp}</code>
            <button
              onClick={() => { void navigator.clipboard.writeText(temp); toast.success("Copié."); }}
              className="rounded-sm border border-border bg-surface px-3 py-[9px] text-[12.5px] font-semibold text-muted hover:border-border-strong"
            >
              Copier
            </button>
          </div>
          <div className="mt-[8px] text-[11.5px] text-muted">
            Il ne sera plus affiché après fermeture. L'agent devra le changer à sa prochaine connexion, et ses sessions ouvertes ont été fermées.
          </div>
        </div>
      ) : confirm ? (
        <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-[12px] py-[10px]">
          <span className="flex-1 text-[12.5px] text-muted">Réinitialiser le mot de passe de cet agent ?</span>
          <button onClick={() => setConfirm(false)} className="rounded-sm border border-border bg-surface px-3 py-[7px] text-[12.5px] font-semibold hover:border-border-strong">Annuler</button>
          <button onClick={run} disabled={busy} className="rounded-sm px-3 py-[7px] text-[12.5px] font-semibold text-accent-contrast disabled:opacity-50" style={{ background: "var(--accent)" }}>
            {busy ? "…" : "Confirmer"}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirm(true)}
          className="flex w-full items-center gap-[8px] rounded-sm border border-border bg-surface-2 px-[12px] py-[10px] text-[12.5px] font-semibold text-muted hover:border-border-strong"
        >
          <KeyRound className="h-[15px] w-[15px]" />
          Réinitialiser le mot de passe
        </button>
      )}

      {/* Verrouillage : refuse toute ouverture de session, même avec le bon
          mot de passe. Utile face à une tentative d'intrusion en cours. */}
      <div className="mt-[8px]">
        {locked ? (
          <div className="flex flex-wrap items-center gap-2 rounded-sm border p-[10px]" style={{ borderColor: "var(--danger)", background: "var(--danger-soft)" }}>
            <Lock className="h-[15px] w-[15px]" style={{ color: "var(--danger)" }} />
            <span className="flex-1 text-[12px] font-semibold" style={{ color: "var(--danger)" }}>
              Verrouillé jusqu'au {new Date(lockedUntil!).toLocaleString("fr-FR")}
            </span>
            <button
              onClick={() => toast.guard(onLock({ agentId }), "Action impossible").then((r) => r !== undefined && toast.success("Compte déverrouillé."))}
              className="rounded-sm border border-border bg-surface px-3 py-[6px] text-[12px] font-semibold hover:border-border-strong"
            >
              Déverrouiller
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {[60, 24 * 60].map((m) => (
              <button
                key={m}
                onClick={() => toast.guard(onLock({ agentId, minutes: m }), "Action impossible").then((r) => r !== undefined && toast.success("Compte verrouillé."))}
                className="flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-[11px] py-[8px] text-[12px] font-semibold text-muted hover:border-danger hover:text-danger"
              >
                <Lock className="h-[14px] w-[14px]" /> Verrouiller {m === 60 ? "1 h" : "24 h"}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
