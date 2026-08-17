import { useState } from "react";
import { X } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useApp } from "@/providers/app-state";
import { useToast } from "@/providers/toast";
import { useDocSender } from "@/components/docs/DocSender";
import { Clover } from "@/components/common/Clover";
import { RichTextEditor } from "@/components/common/RichTextEditor";
import { ImageGallery } from "@/components/common/ImageGallery";
import { ChargePicker, type Row, rowFine, rowError, fmtMoney, fmtDur } from "@/components/calc/ChargePicker";
import { ReportSearchPicker, VehicleSearchPicker, WeaponSearchPicker } from "@/components/dossier/LinkPickers";
import { FEATURES } from "@/lib/features";

export function CalcModal() {
  const { calcOpen, closeCalc, calcCitizenId, calcMode } = useApp();
  const toast = useToast();
  const isCitation = calcMode === "contravention";
  const [rows, setRows] = useState<Row[]>([]);
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);
  // Champs arrestation (casier uniquement, §3)
  const [cuffedAt, setCuffedAt] = useState("");
  const [mirandaAt, setMirandaAt] = useState("");
  const [rLawyer, setRLawyer] = useState(false);
  const [rFood, setRFood] = useState(false);
  const [rMedical, setRMedical] = useState(false);
  const [finePaid, setFinePaid] = useState(false);
  // Champs dossier d'arrestation (remplis directement à la création, item H)
  const [dReport, setDReport] = useState("");
  const [dImages, setDImages] = useState<string[]>([]);
  const [dAvocat, setDAvocat] = useState("");
  const [dLinkedReport, setDLinkedReport] = useState("");
  const [dVehicles, setDVehicles] = useState<string[]>([]);
  const [dWeapons, setDWeapons] = useState<string[]>([]);
  const [dStatus, setDStatus] = useState("");
  const [dForce, setDForce] = useState(false);

  const citizenId = calcCitizenId as Id<"citizens"> | null;
  const citizen = useQuery(api.citizens.getById, citizenId ? { id: citizenId } : "skip");
  const cfgOpts = useQuery(api.configEditors.options, calcOpen && !isCitation ? {} : "skip");
  const addEntry = useMutation(api.casier.addEntry);
  const addCitation = useMutation(api.citations.create);
  const createCasierSynced = useAction(api.nexusSync.createCasier);
  const createContravSynced = useAction(api.nexusSync.createContravention);
  const nexusStatus = useQuery(api.nexusSync.myStatus);
  const syncActive = !!nexusStatus?.configured && nexusStatus.status === "OK";
  const canWrite = FEATURES.judicialWrite || syncActive;
  const docSender = useDocSender();

  if (!calcOpen) return null;

  // Cohabitation NexusMDT : création de casiers / dossiers d'arrestation /
  // contraventions désactivée. Message quelle que soit l'entrée (accueil,
  // dossier, palette).
  if (!canWrite) {
    return (
      <div onClick={closeCalc} className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)" }}>
        <div onClick={(e) => e.stopPropagation()} className="w-[460px] max-w-[94vw] rounded-card border border-border-strong bg-elev p-6 text-center mdt-pop">
          <div className="mb-2 text-[15px] font-bold">Synchronisation requise</div>
          <p className="mb-4 text-[13px] leading-[1.5] text-muted">Pour émettre casiers et contraventions depuis SuperMDT, active la synchronisation NexusMDT dans <b>Mon profil</b> (Utiliser SuperMDT comme MDT principal). L'acte sera créé sur le NexusMDT en ton nom.</p>
          <button onClick={closeCalc} className="rounded-sm border border-border bg-surface-2 px-4 py-2 text-[13px] font-semibold hover:border-border-strong">Fermer</button>
        </div>
      </div>
    );
  }

  // Dossier d'arrestation dès qu'une charge est un Crime ou un Délit majeur, sinon simple rapport.
  const isDossier = rows.some((r) => r.charge.severityName === "Crime" || r.charge.severityName === "Délit majeur");
  const arrestLabel = isDossier ? "Dossier d'arrestation" : "Rapport d'arrestation";
  const LBL = "mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint";
  const INP = "h-9 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] text-text outline-none focus:border-accent";

  const totalFine = rows.reduce((s, r) => s + rowFine(r), 0);
  const totalJail = rows.reduce((s, r) => s + (r.charge.jailSeconds ?? 0), 0);
  const sanctions = [...new Set(rows.flatMap((r) => r.charge.sanctions))];
  const dojRequired = rows.some((r) => r.charge.dojRequest);
  const hasErrors = rows.some((r) => rowError(r) !== null);

  async function validate() {
    if (!citizenId || rows.length === 0) return;
    if (hasErrors) {
      toast.error("Une charge a une quantité hors bornes.");
      return;
    }
    setBusy(true);
    const charges = rows.map((r) => ({
      penalChargeId: r.charge._id,
      param: r.param,
      isRecidive: false, // récidive retirée (item 6)
      attemptType: r.attemptType || undefined, // tentative / complicité (label seul)
    }));
    const casierArgs = {
      citizenId,
      charges,
      lieu: place || undefined,
      cuffedAt: cuffedAt || undefined,
      mirandaAt: mirandaAt || undefined,
      rightsLawyer: rLawyer,
      rightsFood: rFood,
      rightsMedical: rMedical,
      finePaid,
      reportBody: dReport || undefined,
      imageUrls: dImages,
      avocat: dAvocat.trim() || undefined,
      linkedReportId: isDossier && dLinkedReport ? (dLinkedReport as Id<"reports">) : undefined,
      vehicleIds: isDossier ? (dVehicles as Id<"vehicles">[]) : undefined,
      weaponIds: isDossier ? (dWeapons as Id<"weapons">[]) : undefined,
      dossierStatus: isDossier ? dStatus || undefined : undefined,
      forceUsed: isDossier ? dForce : undefined,
    };
    // Synchro active : on écrit d'abord sur Nexus (write-through strict).
    const res = isCitation
      ? await toast.guard(syncActive ? createContravSynced({ citizenId, charges }) : addCitation({ citizenId, charges }), "Émission impossible")
      : await toast.guard(
          syncActive ? createCasierSynced(casierArgs) : addEntry(casierArgs),
          "Validation impossible",
        );
    setBusy(false);
    if (res !== undefined) {
      toast.success(isCitation ? "Contravention émise." : "Entrée de casier créée.");
      // Relaie le document officiel en image vers les webhooks abonnés.
      docSender.send(isCitation
        ? { kind: "citation", id: res as Id<"citations"> }
        : { kind: "casier", id: res as Id<"casierEntries"> });
      setRows([]);
      setPlace("");
      setCuffedAt("");
      setMirandaAt("");
      setRLawyer(false);
      setRFood(false);
      setRMedical(false);
      setFinePaid(false);
      setDReport(""); setDImages([]); setDAvocat(""); setDLinkedReport(""); setDVehicles([]); setDWeapons([]); setDStatus(""); setDForce(false);
      closeCalc();
    }
  }

  return (
    <div
      onClick={closeCalc}
      className="absolute inset-0 z-50 flex justify-end"
      style={{
        background: "var(--scrim)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        animation: "mdtFade .15s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-[560px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]"
        style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <div className="flex-1">
            <h2 className="m-0 text-[15px] font-bold">
              {isCitation ? "Émettre une contravention" : "Calculateur - entrée de casier"}
            </h2>
            <div className="mt-[2px] text-[12px] text-muted">
              {citizen ? `${citizen.citizen.prenom} ${citizen.citizen.nom}` : "…"} ·{" "}
              <span className="font-data">{citizen?.citizen.dateNaissance ?? ""}</span>
            </div>
          </div>
          <button
            onClick={closeCalc}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[18px] py-4">
          {/* Contexte : dossier vs rapport (item 3) */}
          {!isCitation && (
            <div
              className="flex items-center gap-[10px] rounded-sm border px-[13px] py-[10px]"
              style={
                isDossier
                  ? { background: "var(--accent-soft)", borderColor: "var(--accent)" }
                  : { background: "var(--surface-2)", borderColor: "var(--border)" }
              }
            >
              <Clover color={isDossier ? "var(--accent)" : "var(--faint)"} size={18} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold" style={{ color: isDossier ? "var(--accent)" : "var(--text)" }}>
                  {arrestLabel}
                </div>
                <div className="text-[11.5px] text-muted">
                  {isDossier
                    ? "Contient un crime ou un délit majeur - sera classé en dossier d'arrestation."
                    : "Délits mineurs / contraventions - sera classé en simple rapport d'arrestation."}
                </div>
              </div>
            </div>
          )}

          <ChargePicker rows={rows} setRows={setRows} isCitation={isCitation} />

          {/* Déroulé + lieu (casier uniquement) */}
          {!isCitation && (
          <div className="flex flex-col gap-[10px]">
            <div>
              <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
                Rapport d'arrestation
              </div>
              <RichTextEditor value={dReport} onChange={setDReport} minHeight={120} placeholder="Récit de l'intervention…" />
            </div>
            <div>
              <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
                Lieu de l'incident
              </div>
              <input
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                placeholder="Ex. Sandy Shores, Alamo Rd…"
                className="h-9 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] text-text outline-none focus:border-accent"
              />
            </div>

            {/* Procédure d'arrestation (§3) */}
            <div className="rounded-sm border border-border bg-surface-2 px-[13px] py-[12px]">
              <div className="mb-[10px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
                Procédure d'arrestation
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-[5px] block text-[11px] text-muted">Heure de menottage</span>
                  <input
                    type="time"
                    value={cuffedAt}
                    onChange={(e) => setCuffedAt(e.target.value)}
                    className="h-9 w-full rounded-sm border border-border bg-surface px-3 font-data text-[13px] text-text outline-none focus:border-accent"
                  />
                </label>
                <label className="block">
                  <span className="mb-[5px] block text-[11px] text-muted">Lecture des droits (Miranda)</span>
                  <input
                    type="time"
                    value={mirandaAt}
                    onChange={(e) => setMirandaAt(e.target.value)}
                    className="h-9 w-full rounded-sm border border-border bg-surface px-3 font-data text-[13px] text-text outline-none focus:border-accent"
                  />
                </label>
              </div>
              <div className="mt-[11px] text-[11px] text-muted">Droits exercés</div>
              <div className="mt-[6px] flex flex-wrap gap-[8px]">
                {[
                  { on: rLawyer, set: setRLawyer, label: "Appel à un avocat" },
                  { on: rFood, set: setRFood, label: "Nourriture / boisson" },
                  { on: rMedical, set: setRMedical, label: "Soins médicaux" },
                ].map((r) => (
                  <button
                    key={r.label}
                    onClick={() => r.set(!r.on)}
                    className="rounded-[6px] border px-[10px] py-[6px] text-[11.5px] font-semibold"
                    style={
                      r.on
                        ? { background: "color-mix(in srgb, var(--success) 14%, transparent)", borderColor: "var(--success)", color: "var(--success)" }
                        : { background: "var(--surface)", borderColor: "var(--border)", color: "var(--muted)" }
                    }
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          )}

          {/* Volet dossier d'arrestation - saisi directement (item H) */}
          {!isCitation && isDossier && (
            <div className="flex flex-col gap-[11px] rounded-sm border border-accent p-[13px]" style={{ background: "var(--accent-soft)" }}>
              <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-accent"><Clover size={13} /> Dossier d'arrestation</div>
              <div><div className={LBL}>Images</div><ImageGallery urls={dImages} onChange={setDImages} emptyLabel="Aucune image." /></div>
              <div><div className={LBL}>Avocat</div><input value={dAvocat} onChange={(e) => setDAvocat(e.target.value)} placeholder="Nom de l'avocat" className={INP} /></div>
              <div><div className={LBL}>Rapport lié</div>
                <ReportSearchPicker value={dLinkedReport} onChange={setDLinkedReport} />
              </div>
              <div><div className={LBL}>Véhicules impliqués</div><VehicleSearchPicker selected={dVehicles} onChange={setDVehicles} /></div>
              <div><div className={LBL}>Armes utilisées</div><WeaponSearchPicker selected={dWeapons} onChange={setDWeapons} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><div className={LBL}>Statut du dossier</div>
                  <select value={dStatus} onChange={(e) => setDStatus(e.target.value)} className={INP}>
                    <option value="">-</option>
                    {(cfgOpts?.dossierStatuses ?? []).map((s) => <option key={s._id} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
                <div><div className={LBL}>Force utilisée</div>
                  <label className="flex h-9 items-center gap-2 text-[13px]"><input type="checkbox" checked={dForce} onChange={(e) => setDForce(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" /> Neutralisé par la force</label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Totals footer */}
        <div className="flex-shrink-0 border-t border-border px-[18px] py-4">
          <div className={`mb-3 grid ${isCitation ? "grid-cols-1" : "grid-cols-2"} gap-[10px]`}>
            <div className="rounded-sm border border-border bg-surface-2 px-[13px] py-[11px]">
              <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-faint">Amende totale</div>
              <div className="mt-1 font-data text-[19px] font-bold">{fmtMoney(totalFine)}</div>
            </div>
            {!isCitation && (
              <div className="rounded-sm border border-border bg-surface-2 px-[13px] py-[11px]">
                <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-faint">Prison totale</div>
                <div className="mt-1 font-data text-[19px] font-bold">{fmtDur(totalJail)}</div>
              </div>
            )}
          </div>
          {/* Statut de l'amende (item 4) */}
          {!isCitation && totalFine > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[11px] font-semibold text-muted">Amende</span>
              <button
                onClick={() => setFinePaid(false)}
                className="rounded-[6px] border px-[10px] py-[5px] text-[11.5px] font-semibold"
                style={!finePaid ? { background: "rgba(220,38,38,0.10)", borderColor: "rgba(220,38,38,0.4)", color: "var(--danger)" } : { background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--muted)" }}
              >
                Non payée
              </button>
              <button
                onClick={() => setFinePaid(true)}
                className="rounded-[6px] border px-[10px] py-[5px] text-[11.5px] font-semibold"
                style={finePaid ? { background: "color-mix(in srgb, var(--success) 14%, transparent)", borderColor: "var(--success)", color: "var(--success)" } : { background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--muted)" }}
              >
                Payée
              </button>
            </div>
          )}
          <div className="mb-3 flex flex-wrap gap-[6px]">
            {sanctions.map((s) => (
              <span key={s} className="rounded-[6px] border border-border bg-surface-2 px-[9px] py-[3px] text-[11px] text-muted">
                {s}
              </span>
            ))}
            {!isCitation && dojRequired && (
              <span
                className="rounded-[6px] border px-[9px] py-[3px] text-[11px] font-semibold"
                style={{ background: "rgba(179,15,58,0.10)", borderColor: "rgba(179,15,58,0.4)", color: "var(--critical)" }}
              >
                ⚖ Demande au procureur (DOJ) requise
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={closeCalc}
              className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold text-text hover:border-border-strong"
            >
              Annuler
            </button>
            <button
              onClick={validate}
              disabled={busy || rows.length === 0 || !citizenId || hasErrors}
              className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50"
            >
              {busy ? "…" : isCitation ? "Émettre la contravention" : isDossier ? "Valider le dossier" : "Valider le rapport"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
