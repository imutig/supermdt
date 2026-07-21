import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useApp } from "@/providers/app-state";
import { useToast } from "@/providers/toast";
import { useDocSender } from "@/components/docs/DocSender";
import { Clover } from "@/components/common/Clover";
import { RichTextEditor } from "@/components/common/RichTextEditor";
import { ImageGallery } from "@/components/common/ImageGallery";
import { MultiSelect } from "@/components/common/MultiSelect";

interface Charge {
  _id: Id<"penalCharges">;
  name: string;
  categoryName: string;
  sensitive: boolean;
  severityName: string | null;
  fine: { kind: string; amount?: number; unit?: string; raw: string };
  jailSeconds: number | null;
  dojRequest: boolean;
  minParam: number | null;
  maxParam: number | null;
  sanctions: string[];
}
interface Row {
  uid: number;
  charge: Charge;
  param: number;
  isRecidive: boolean;
}
let uidSeq = 1;

export function CalcModal() {
  const { calcOpen, closeCalc, calcCitizenId, calcMode } = useApp();
  const toast = useToast();
  const isCitation = calcMode === "contravention";
  const [pq, setPq] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [narr, setNarr] = useState("");
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
  const dossierReports = useQuery(api.reports.list, calcOpen && !isCitation ? {} : "skip");
  const vehicleOpts = useQuery(api.vehicles.pickerList, calcOpen && !isCitation ? {} : "skip");
  const weaponOpts = useQuery(api.weapons.pickerList, calcOpen && !isCitation ? {} : "skip");
  const cfgOpts = useQuery(api.configEditors.options, calcOpen && !isCitation ? {} : "skip");
  const allCharges = useQuery(api.penal.listCharges, calcOpen ? { search: pq || undefined } : "skip") as
    | Charge[]
    | undefined;
  // En contravention, seules les infractions de sévérité "Contravention" sont proposables (§4).
  const charges = useMemo(
    () => (allCharges && isCitation ? allCharges.filter((c) => c.severityName === "Contravention") : allCharges),
    [allCharges, isCitation],
  );
  const addEntry = useMutation(api.casier.addEntry);
  const addCitation = useMutation(api.citations.create);
  const docSender = useDocSender();

  const pickerGroups = useMemo(() => {
    if (!charges) return [];
    const byCat = new Map<string, Charge[]>();
    for (const c of charges) {
      if (!byCat.has(c.categoryName)) byCat.set(c.categoryName, []);
      byCat.get(c.categoryName)!.push(c);
    }
    return [...byCat.entries()].map(([label, list]) => ({ label, list: list.slice(0, 12) }));
  }, [charges]);

  if (!calcOpen) return null;

  const add = (c: Charge) =>
    setRows((r) => [...r, { uid: uidSeq++, charge: c, param: c.fine.kind === "PER_UNIT" ? 1 : 0, isRecidive: false }]);
  const remove = (uid: number) => setRows((r) => r.filter((x) => x.uid !== uid));
  const patch = (uid: number, p: Partial<Row>) =>
    setRows((r) => r.map((x) => (x.uid === uid ? { ...x, ...p } : x)));

  const baseOf = (row: Row) => {
    const f = row.charge.fine;
    if (f.kind === "FIXED") return f.amount ?? 0;
    if (f.kind === "PER_UNIT") return (f.amount ?? 0) * (row.param || 1);
    if (f.kind === "FORMULA") return row.param || 0;
    return 0;
  };
  // Item 4 : plus de multiplicateur DEFCON, amende à 100% (× récidive).
  const rowFine = (row: Row) =>
    row.charge.fine.kind === "ON_DECISION" ? 0 : Math.round(baseOf(row) * (row.isRecidive ? 2 : 1));

  // Dossier d'arrestation dès qu'une charge est un Crime ou un Délit majeur, sinon simple rapport.
  const isDossier = rows.some((r) => r.charge.severityName === "Crime" || r.charge.severityName === "Délit majeur");
  const arrestLabel = isDossier ? "Dossier d'arrestation" : "Rapport d'arrestation";
  const LBL = "mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint";
  const INP = "h-9 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] text-text outline-none focus:border-accent";

  const totalFine = rows.reduce((s, r) => s + rowFine(r), 0);
  const totalJail = rows.reduce((s, r) => s + (r.charge.jailSeconds ?? 0), 0);
  const sanctions = [...new Set(rows.flatMap((r) => r.charge.sanctions))];
  const dojRequired = rows.some((r) => r.charge.dojRequest);

  // Bornes de quantité (§3) : bloque la validation si un paramètre est hors [min, max].
  const rowError = (row: Row): string | null => {
    if (row.charge.fine.kind !== "PER_UNIT" && row.charge.fine.kind !== "FORMULA") return null;
    if (row.charge.minParam != null && row.param < row.charge.minParam)
      return `Quantité minimale : ${row.charge.minParam}`;
    if (row.charge.maxParam != null && row.param > row.charge.maxParam)
      return `Quantité maximale : ${row.charge.maxParam}`;
    return null;
  };
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
      isRecidive: r.isRecidive,
    }));
    const res = isCitation
      ? await toast.guard(addCitation({ citizenId, charges }), "Émission impossible")
      : await toast.guard(
          addEntry({
            citizenId,
            charges,
            derouleFaits: narr || undefined,
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
          }),
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
      setNarr("");
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

          {/* Picker */}
          <div>
            <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
              Ajouter une charge - code pénal
            </div>
            <input
              value={pq}
              onChange={(e) => setPq(e.target.value)}
              placeholder="Rechercher une infraction…"
              className="mb-[9px] h-9 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] text-text outline-none focus:border-accent"
            />
            <div className="max-h-[176px] overflow-y-auto rounded-sm border border-border">
              {charges === undefined && (
                <div className="px-3 py-6 text-center text-[12px] text-faint">Chargement…</div>
              )}
              {charges && charges.length === 0 && (
                <div className="px-3 py-6 text-center text-[12px] text-faint">Aucune infraction.</div>
              )}
              {charges && pq.trim()
                ? charges.slice(0, 25).map((c) => (
                    <button
                      key={c._id}
                      onClick={() => add(c)}
                      className="flex w-full items-center gap-[10px] border-b border-border px-3 py-[9px] text-left hover:bg-accent-soft"
                    >
                      <span className="flex-1 text-[12.5px]">
                        {c.name}
                        <span className="ml-2 text-[10.5px] text-faint">{c.categoryName}</span>
                      </span>
                      <span className="font-data text-[11px] text-muted">{c.fine.raw}</span>
                      <span className="text-[16px] font-normal leading-none text-accent">+</span>
                    </button>
                  ))
                : pickerGroups.map((g) => (
                    <div key={g.label}>
                      <div className="sticky top-0 bg-surface-2 px-3 py-[7px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
                        {g.label}
                      </div>
                      {g.list.map((c) => (
                        <button
                          key={c._id}
                          onClick={() => add(c)}
                          className="flex w-full items-center gap-[10px] border-b border-border px-3 py-[9px] text-left hover:bg-accent-soft"
                        >
                          <span className="flex-1 text-[12.5px]">{c.name}</span>
                          <span className="font-data text-[11px] text-muted">{c.fine.raw}</span>
                          <span className="text-[16px] font-normal leading-none text-accent">+</span>
                        </button>
                      ))}
                    </div>
                  ))}
            </div>
          </div>

          {/* Selected */}
          <div>
            <div className="mb-[9px] flex items-center gap-2">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
                Charges retenues
              </div>
              <span className="font-data text-[11px] text-muted">{rows.length}</span>
            </div>
            {rows.length === 0 && (
              <div className="rounded-sm border border-dashed border-border px-[22px] py-[22px] text-center text-[12.5px] text-faint">
                Aucune charge - ajoutez une infraction ci-dessus.
              </div>
            )}
            <div className="flex flex-col gap-[9px]">
              {rows.map((r) => (
                <div key={r.uid} className="rounded-sm border border-border bg-surface px-3 py-[11px]">
                  <div className="flex items-start gap-[9px]">
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold">{r.charge.name}</div>
                      <div className="mt-[2px] text-[11px] text-muted">
                        {r.charge.categoryName}
                        {r.charge.jailSeconds ? ` · Prison ${fmtDur(r.charge.jailSeconds)}` : ""}
                      </div>
                    </div>
                    <span className="font-data text-[14px] font-bold">
                      {r.charge.fine.kind === "ON_DECISION" ? "DOJ" : fmtMoney(rowFine(r))}
                    </span>
                    <button
                      onClick={() => remove(r.uid)}
                      className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-[6px] border border-border text-[12px] leading-none text-faint hover:border-danger hover:text-danger"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-[10px] flex flex-wrap items-center gap-[9px]">
                    {(r.charge.fine.kind === "PER_UNIT" || r.charge.fine.kind === "FORMULA") && (
                      <div className="flex items-center gap-[7px] rounded-[6px] border border-border bg-surface-2 px-[9px] py-1">
                        <span className="text-[11px] text-muted">
                          {r.charge.fine.kind === "PER_UNIT" ? `Quantité` : "Montant de base"}
                        </span>
                        <input
                          value={r.param}
                          onChange={(e) => patch(r.uid, { param: parseInt(e.target.value) || 0 })}
                          className="h-6 w-[64px] rounded-[5px] border border-border bg-surface px-[6px] text-center font-data text-[12px] text-text outline-none focus:border-accent"
                        />
                        {r.charge.fine.unit && <span className="text-[11px] text-faint">{r.charge.fine.unit}</span>}
                      </div>
                    )}
                    <button
                      onClick={() => patch(r.uid, { isRecidive: !r.isRecidive })}
                      className="flex items-center gap-[6px] rounded-[6px] border px-[9px] py-1 text-[11.5px] font-semibold"
                      style={
                        r.isRecidive
                          ? { background: "rgba(220,38,38,0.10)", borderColor: "rgba(220,38,38,0.4)", color: "var(--danger)" }
                          : { background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--muted)" }
                      }
                    >
                      <span
                        className="h-[7px] w-[7px] rounded-full"
                        style={{ background: "currentColor", opacity: r.isRecidive ? 1 : 0.35 }}
                      />
                      Récidive
                    </button>
                  </div>
                  {rowError(r) && (
                    <div className="mt-[8px] rounded-[5px] px-[8px] py-[5px] text-[11.5px] font-semibold" style={{ background: "rgba(220,38,38,0.10)", color: "var(--danger)" }}>
                      {rowError(r)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Déroulé + lieu (casier uniquement) */}
          {!isCitation && (
          <div className="flex flex-col gap-[10px]">
            <div>
              <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
                Déroulé des faits
              </div>
              <RichTextEditor value={narr} onChange={setNarr} minHeight={110} placeholder="Récit de l'intervention…" />
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
              <div><div className={LBL}>Rapport d'arrestation</div><RichTextEditor value={dReport} onChange={setDReport} /></div>
              <div><div className={LBL}>Images</div><ImageGallery urls={dImages} onChange={setDImages} emptyLabel="Aucune image." /></div>
              <div><div className={LBL}>Avocat</div><input value={dAvocat} onChange={(e) => setDAvocat(e.target.value)} placeholder="Nom de l'avocat" className={INP} /></div>
              <div><div className={LBL}>Rapport lié</div>
                <select value={dLinkedReport} onChange={(e) => setDLinkedReport(e.target.value)} className={INP}>
                  <option value="">- Sélectionner un rapport -</option>
                  {(dossierReports ?? []).map((r) => <option key={r._id} value={r._id}>{r.title}</option>)}
                </select>
              </div>
              <div><div className={LBL}>Véhicules impliqués</div><MultiSelect options={vehicleOpts} selected={dVehicles} onChange={setDVehicles} placeholder="Ajouter un véhicule…" /></div>
              <div><div className={LBL}>Armes utilisées</div><MultiSelect options={weaponOpts} selected={dWeapons} onChange={setDWeapons} placeholder="Ajouter une arme…" /></div>
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

function fmtMoney(n: number) {
  return "$" + n.toLocaleString("fr-FR");
}
function fmtDur(seconds: number) {
  if (!seconds) return "Aucune";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [h ? `${h}h` : "", m ? `${m}min` : ""].filter(Boolean).join(" ") || `${seconds}s`;
}
