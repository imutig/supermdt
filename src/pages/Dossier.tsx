import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useApp } from "@/providers/app-state";
import { NotesPanel } from "@/components/dossier/NotesPanel";
import { NoteModal } from "@/components/dossier/NoteModal";
import { CasierEntryModal } from "@/components/dossier/CasierEntryModal";
import { ContraventionModal } from "@/components/dossier/ContraventionModal";
import { VehicleModal } from "@/components/dossier/VehicleModal";
import { EditIdentityModal } from "@/components/dossier/EditIdentityModal";
import { LicensesManager } from "@/components/dossier/LicensesManager";
import { FlagsManager } from "@/components/dossier/FlagsManager";
import { CasierExtract } from "@/components/dossier/CasierExtract";
import { DepositionModal } from "@/components/dossier/DepositionModal";
import { FamilyTab } from "@/components/dossier/FamilyTab";
import { CitizenTimeline, type TimelineEvent } from "@/components/dossier/CitizenTimeline";
import { ComplaintModal } from "@/pages/Plaintes";
import { AgentTag } from "@/components/common/AgentTag";
import { DeleteButton } from "@/components/common/DeleteButton";
import { EmptyState } from "@/components/common/EmptyState";
import { useCan } from "@/hooks/useCan";
import { RichTextEditor } from "@/components/common/RichTextEditor";
import { FEATURES, NEXUS_MSG } from "@/lib/features";

const TABS = [
  { key: "identite", label: "Identité" },
  { key: "timeline", label: "Timeline" },
  { key: "famille", label: "Famille" },
  { key: "vehicules", label: "Véhicules" },
  { key: "casier", label: "Casier" },
  { key: "mandats", label: "Mandats" },
  { key: "contraventions", label: "Contraventions" },
  { key: "plaintes", label: "Plaintes" },
  { key: "depositions", label: "Dépositions" },
  { key: "rapports", label: "Rapports" },
  { key: "notes", label: "Notes" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const TAB_ADD_BTN =
  "flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-[12px] py-[7px] text-[12.5px] font-semibold text-text hover:border-border-strong";

function sexeLabel(s?: string) {
  if (s === "H") return "Homme";
  if (s === "F") return "Femme";
  return s ?? "-";
}

function ageFrom(dob?: string) {
  if (!dob) return null;
  // Supporte JJ/MM/AAAA et AAAA-MM-JJ.
  const fr = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const d = fr ? new Date(`${fr[3]}-${fr[2]}-${fr[1]}`) : new Date(dob);
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

export function Dossier() {
  const { id } = useParams();
  const { openCalc, openMandat } = useApp();
  const { can } = useCan();
  // Chaque action vise sa propre permission. Un contrôle unique fondé sur le
  // corps du grade ignorait la configuration : un Officier ne pouvait rien
  // faire même avec les droits accordés, et un gradé pouvait tout faire même
  // après les lui avoir retirés.
  // Cohabitation NexusMDT : l'écriture citoyenne (identité, permis, flags) et
  // judiciaire (casiers, contraventions) est désactivée ici. Consultation OK.
  // Synchro Nexus active : débloque l'écriture citoyenne/judiciaire (write-through).
  const nexusStatus = useQuery(api.nexusSync.myStatus);
  const syncActive = !!nexusStatus?.configured && nexusStatus.status === "OK";
  const cw = FEATURES.citizenWrite || syncActive;
  const jw = FEATURES.judicialWrite || syncActive;
  const canEditCitizen = can("citoyens.edit") && cw;
  const canCreateVehicle = can("vehicules.create");
  const canAnnulCasier = can("casier.annul") && jw;
  const canAnnulContravention = can("contraventions.annul") && jw;
  const canAnnulMandat = can("mandats.annul");
  const canEditVehicle = can("vehicules.edit");
  const canManageLicenses = can("citoyens.licenses") && cw;
  const canCasier = can("casier.create") && jw;
  const canContravention = can("contraventions.create") && jw;
  const canMandat = can("mandats.create");
  const canExecuteMandat = can("mandats.execute");
  const canPlainte = can("plaintes.create") || can("plaintes.edit") || can("plaintes.delete");
  const canDeposition = can("depositions.create");
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("identite");

  // Modals locaux
  const [casierModalId, setCasierModalId] = useState<Id<"casierEntries"> | null>(null);
  const [contravModalId, setContravModalId] = useState<Id<"citations"> | null>(null);
  const [vehicleModal, setVehicleModal] = useState<
    { mode: "view"; id: Id<"vehicles"> } | { mode: "create" } | null
  >(null);
  const [editIdentity, setEditIdentity] = useState(false);
  const [noteModal, setNoteModal] = useState(false);
  const [depositionModal, setDepositionModal] = useState(false);
  const [complaintModal, setComplaintModal] = useState<{ id?: Id<"complaints"> } | null>(null);
  const [extractOpen, setExtractOpen] = useState(false);

  const citizenId = id as Id<"citizens"> | undefined;
  const data = useQuery(api.citizens.getById, citizenId ? { id: citizenId } : "skip");
  const vehicles = useQuery(api.vehicles.byOwner, citizenId && can("vehicules.view") ? { citizenId } : "skip");
  const casier = useQuery(api.casier.byCitizen, citizenId && can("casier.view") ? { citizenId } : "skip");
  const mandats = useQuery(api.mandats.byCitizen, citizenId && can("mandats.view") ? { citizenId } : "skip");
  const contraventions = useQuery(api.citations.byCitizen, citizenId && can("contraventions.view") ? { citizenId } : "skip");
  const rapports = useQuery(api.reports.byCitizen, citizenId && can("rapports.view") ? { citizenId } : "skip");
  const plaintes = useQuery(api.complaints.byCitizen, citizenId && can("plaintes.view") ? { citizenId } : "skip");
  const depositions = useQuery(api.depositions.byCitizen, citizenId && can("depositions.view") ? { citizenId } : "skip");
  const bolos = useQuery(api.bolos.activeForCitizen, citizenId && can("bolo.view") ? { citizenId } : "skip");
  const wanted = bolos ?? [];
  const logView = useMutation(api.citizens.logView);
  const removeMandat = useMutation(api.mandats.remove);
  const executeMandat = useMutation(api.mandats.execute);

  useEffect(() => {
    if (citizenId) logView({ id: citizenId }).catch(() => {});
  }, [citizenId, logView]);

  // Timeline unifiée : agrège les sources déjà chargées pour les onglets.
  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    const ev: TimelineEvent[] = [];
    for (const e of casier ?? []) {
      ev.push({
        id: e._id, at: e.at, kind: "casier",
        title: `${e.chargeCount} charge${e.chargeCount > 1 ? "s" : ""} · ${e.arrestType === "DOSSIER" ? "Dossier" : "Rapport"} d'arrestation`,
        sub: e.charges.slice(0, 4).join(" · ") + (e.charges.length > 4 ? ` +${e.charges.length - 4}` : ""),
        badge: e.status === "ANNULEE" ? "Annulée" : undefined,
        muted: e.status === "ANNULEE",
        onClick: () => { setTab("casier"); setCasierModalId(e._id); },
      });
    }
    for (const cv of contraventions ?? []) {
      ev.push({
        id: cv._id, at: cv.at, kind: "contravention",
        title: cv.motif,
        sub: `$${cv.totalFine.toLocaleString("fr-FR")}`,
        badge: cv.status === "ANNULEE" ? "Annulée" : undefined,
        muted: cv.status === "ANNULEE",
        onClick: () => { setTab("contraventions"); setContravModalId(cv._id); },
      });
    }
    for (const m of mandats ?? []) {
      ev.push({
        id: m._id, at: m.issuedAt, kind: "mandat",
        title: m.motif, sub: m.typeName,
        badge: m.effectiveActive ? "Actif" : undefined,
        muted: !m.effectiveActive,
        onClick: () => setTab("mandats"),
      });
    }
    for (const r of rapports ?? []) {
      ev.push({
        id: r._id, at: r.at, kind: "rapport",
        title: r.title, sub: r.typeName,
        badge: r.status.charAt(0) + r.status.slice(1).toLowerCase(),
        onClick: () => navigate(`/rapport/${r._id}`),
      });
    }
    for (const d of depositions ?? []) {
      ev.push({
        id: d._id, at: d.at, kind: "deposition",
        title: d.title || d.linkLabel, sub: d.linkLabel,
        onClick: () => setTab("depositions"),
      });
    }
    for (const p of [...(plaintes?.filed ?? []), ...(plaintes?.against ?? [])]) {
      ev.push({
        id: p._id, at: p.at, kind: "plainte",
        title: p.motif, sub: `${p.plaignant ?? "?"} → ${p.defendant ?? "?"}`,
        badge: p.status,
        onClick: () => setComplaintModal({ id: p._id as Id<"complaints"> }),
      });
    }
    return ev;
  }, [casier, contraventions, mandats, rapports, depositions, plaintes, navigate]);

  if (data === undefined) {
    return <div className="p-[22px_26px] text-[13px] text-muted">Chargement du dossier…</div>;
  }
  if (data === null) {
    return (
      <div className="p-[22px_26px]">
        <div className="rounded-card border border-border bg-surface p-6 text-[13px] text-muted">
          Dossier introuvable.{" "}
          <span onClick={() => navigate("/")} className="cursor-pointer text-accent hover:underline">
            Retour
          </span>
        </div>
      </div>
    );
  }

  const c = data.citizen;
  const age = ageFrom(c.dateNaissance);
  const headFacts = [
    { label: "Sexe", value: sexeLabel(c.sexe) },
    { label: "Taille", value: c.taille ?? "-" },
    { label: "Poids", value: c.poids ?? "-" },
    { label: "Téléphone", value: c.telephone ?? "-", mono: true },
    { label: "Adresse", value: c.adresse ?? "-" },
    { label: "Emploi", value: c.metier ?? "-" },
    { label: "Groupe", value: c.groupe ?? "-" },
    { label: "Signes distinctifs", value: c.descriptionPhysique ?? "-" },
  ];
  const identityFields = [
    { label: "Nom complet", value: `${c.prenom} ${c.nom}` },
    { label: "Date de naissance", value: c.dateNaissance ?? "-", mono: true },
    { label: "Lieu de naissance", value: c.lieuNaissance ?? "-" },
    { label: "Sexe", value: sexeLabel(c.sexe) },
    { label: "Nationalité", value: c.nationalite ?? "-" },
    { label: "Groupe sanguin", value: c.groupeSanguin ?? "-" },
    { label: "Téléphone", value: c.telephone ?? "-", mono: true },
    { label: "Email", value: c.email ?? "-" },
    { label: "Ethnie", value: c.ethnie ?? "-" },
    { label: "Cheveux", value: c.cheveux ?? "-" },
    { label: "Yeux", value: c.yeux ?? "-" },
    { label: "Adresse", value: c.adresse ?? "-" },
    { label: "Groupe", value: c.groupe ?? "-" },
    { label: "Emploi", value: c.metier ?? "-" },
  ];

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      {/* Breadcrumb */}
      <div className="mb-[14px] flex items-center gap-2 text-[12px] text-muted">
        <span onClick={() => navigate("/")} className="cursor-pointer text-accent hover:underline">
          Recherche
        </span>
        <span className="text-faint">/</span>
        <span>Dossier citoyen</span>
        <span className="text-faint">/</span>
        <span>{c.prenom} {c.nom}</span>
      </div>

      {/* Avis de recherche actif : fiche en rouge, bien visible. */}
      {wanted.length > 0 && (
        <div className="mdt-reveal mb-[16px] overflow-hidden rounded-card border-2" style={{ borderColor: "var(--danger)", background: "color-mix(in srgb, var(--danger) 12%, var(--surface))" }}>
          <div className="flex items-center gap-[9px] px-[15px] py-[11px] text-white" style={{ background: "var(--danger)" }}>
            <span className="text-[16px]">⚑</span>
            <span className="text-[13px] font-bold uppercase tracking-[0.08em]">
              Individu sous avis de recherche · {wanted.length} actif{wanted.length > 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex flex-col gap-[10px] p-[15px]">
            {wanted.map((w) => (
              <div key={w._id}>
                <div className="flex flex-wrap items-center gap-[8px]">
                  <span className="text-[14px] font-bold">{w.title}</span>
                  {w.danger && <span className="rounded-[4px] px-[6px] py-[1px] text-[10px] font-bold uppercase tracking-[0.05em] text-white" style={{ background: "var(--danger)" }}>Armé et dangereux</span>}
                  <span className="text-[11px] text-faint">émis le {new Date(w.at).toLocaleString("fr-FR")}</span>
                </div>
                {w.description && <p className="mt-[4px] mb-0 whitespace-pre-wrap text-[12.5px] leading-[1.5] text-muted">{w.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {!cw && (
        <div className="mb-[16px] flex items-start gap-[10px] rounded-card border px-[15px] py-[12px] text-[13px]" style={{ borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)", background: "var(--accent-soft)", color: "var(--text)" }}>
          <span className="text-accent">ⓘ</span>
          <span>{NEXUS_MSG} La consultation reste disponible ici (données synchronisées).</span>
        </div>
      )}

      {/* Header (rouge si sous avis de recherche) */}
      <div className="mb-[18px] flex gap-5 rounded-card border p-5" style={wanted.length > 0 ? { borderColor: "var(--danger)", background: "color-mix(in srgb, var(--danger) 6%, var(--surface))" } : { borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="flex flex-shrink-0 flex-col gap-[9px]">
          <div
            className="flex h-[140px] w-[118px] items-end justify-center overflow-hidden rounded-sm border border-border pb-2"
            style={
              c.mugshotUrl
                ? { padding: 0 }
                : {
                    background:
                      "repeating-linear-gradient(135deg,var(--surface-2),var(--surface-2) 7px,var(--border) 7px,var(--border) 8px)",
                  }
            }
          >
            {c.mugshotUrl ? (
              <img src={c.mugshotUrl} alt="Mugshot" className="h-full w-full object-cover" />
            ) : (
              <span className="rounded-[4px] bg-surface px-[7px] py-[2px] font-data text-[9.5px] tracking-[0.1em] text-faint">
                MUGSHOT
              </span>
            )}
          </div>
          <div className="rounded-sm border border-border bg-surface-2 px-[9px] py-[7px] text-center">
            <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-faint">Né(e) le</div>
            <div className="font-data text-[11px] font-semibold">{c.dateNaissance ?? "-"}</div>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-[14px]">
            <div>
              <h1 className="m-0 text-[24px] font-bold tracking-tight">
                {c.prenom} {c.nom}
              </h1>
              <div className="mt-1 text-[13px] text-muted">
                {c.dateNaissance ?? "-"}
                {age != null ? ` · ${age} ans` : ""} · {c.nationalite ?? "-"}
              </div>
              {(c.aliases?.length ?? 0) > 0 && (
                <div className="mt-[6px] flex flex-wrap items-center gap-[6px]">
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint">Alias</span>
                  {c.aliases!.map((a) => (
                    <span key={a} className="rounded-full border border-border bg-surface-2 px-[9px] py-[2px] text-[11.5px] text-text">{a}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1" />
            <div className="flex flex-wrap gap-[7px]">
              {c.deceased && (
                <span
                  className="rounded-[6px] px-[10px] py-[4px] text-[11.5px] font-semibold text-white"
                  style={{ background: "#4b5563" }}
                >
                  ✝ Décédé
                </span>
              )}
              {data.wanted && (
                <span
                  className="rounded-[6px] px-[10px] py-[4px] text-[11.5px] font-semibold text-white"
                  style={{ background: "var(--danger)" }}
                >
                  ⚑ Recherché
                </span>
              )}
              {data.flags.map((f) => (
                <span
                  key={f.name}
                  className="rounded-[6px] px-[10px] py-[4px] text-[11.5px] font-semibold"
                  style={{ background: "transparent", color: f.color ?? "var(--critical)", border: `1px solid ${f.color ?? "var(--critical)"}` }}
                >
                  {f.name}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-[14px_18px]">
            {headFacts.map((k) => (
              <div key={k.label}>
                <div className="mb-[3px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
                  {k.label}
                </div>
                <div className={`text-[13px] font-medium ${"mono" in k && k.mono ? "font-data" : ""}`}>
                  {k.value}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-[18px] flex flex-wrap gap-2 border-t border-border pt-4">
            <button
              onClick={() => setExtractOpen(true)}
              className="rounded-sm border border-border bg-surface-2 px-[14px] py-2 text-[13px] font-semibold text-text hover:border-border-strong"
            >
              Extrait de casier
            </button>
            {canEditCitizen && (
              <button
                onClick={() => setEditIdentity(true)}
                className="rounded-sm border border-border bg-transparent px-[14px] py-2 text-[13px] font-semibold text-muted hover:border-border-strong"
              >
                Éditer l'identité
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs + content */}
      <div className="grid grid-cols-[1fr_300px] items-start gap-[18px]">
        <div className="min-w-0">
          <div className="mb-[14px] flex flex-wrap gap-[2px] rounded-card border border-border bg-surface p-[5px]">
            {TABS.filter((t) => t.key !== "mandats").filter((t) => t.key !== "plaintes" || FEATURES.plaintes).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="rounded-[7px] px-[11px] py-[7px] text-[12.5px] font-semibold hover:bg-surface-2"
                style={tab === t.key ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="min-h-[240px] overflow-hidden rounded-card border border-border bg-surface">
            {tab === "identite" ? (
              <div className="py-[6px]">
                <div className="grid grid-cols-3 gap-px bg-border">
                  {identityFields.map((k) => (
                    <div key={k.label} className="bg-surface px-4 py-3">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
                        {k.label}
                      </div>
                      <div className={`text-[13px] ${"mono" in k && k.mono ? "font-data" : ""}`}>{k.value}</div>
                    </div>
                  ))}
                </div>
                {/* Bloc médical / contact d'urgence - affiché seulement si renseigné. */}
                {(c.allergies || c.antecedents || c.traitements || c.contactUrgence?.nom || c.contactUrgence?.telephone) && (
                  <div className="grid grid-cols-2 gap-px border-t border-border bg-border">
                    {c.allergies && <div className="bg-surface px-4 py-3"><div className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Allergies</div><div className="text-[13px] whitespace-pre-wrap">{c.allergies}</div></div>}
                    {c.antecedents && <div className="bg-surface px-4 py-3"><div className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Antécédents médicaux</div><div className="text-[13px] whitespace-pre-wrap">{c.antecedents}</div></div>}
                    {c.traitements && <div className="bg-surface px-4 py-3"><div className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Traitements</div><div className="text-[13px] whitespace-pre-wrap">{c.traitements}</div></div>}
                    {(c.contactUrgence?.nom || c.contactUrgence?.telephone) && <div className="bg-surface px-4 py-3"><div className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Contact d'urgence</div><div className="text-[13px]">{[`${c.contactUrgence?.prenom ?? ""} ${c.contactUrgence?.nom ?? ""}`.trim(), c.contactUrgence?.telephone].filter(Boolean).join(" · ") || "-"}</div></div>}
                  </div>
                )}
                <div className="p-4">
                  <div className="mb-[11px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
                    Licences &amp; permis
                  </div>
                  {citizenId && (
                    <LicensesManager
                      citizenId={citizenId}
                      licenses={data.licenses}
                      canManage={canManageLicenses}
                    />
                  )}
                  <div className="mb-[11px] mt-[18px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
                    Signalements
                  </div>
                  {citizenId && <FlagsManager citizenId={citizenId} flags={data.flags} canManage={can("citoyens.flag") && cw} />}
                </div>
              </div>
            ) : tab === "timeline" ? (
              <CitizenTimeline events={timelineEvents} />
            ) : tab === "famille" ? (
              citizenId ? <FamilyTab citizenId={citizenId} canEdit={can("citoyens.edit") && cw} onOpen={(id) => navigate(`/citoyen/${id}`)} /> : null
            ) : tab === "vehicules" ? (
              <div>
                <div className="flex items-center justify-between border-b border-border px-4 py-[10px]">
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
                    Véhicules rattachés
                  </span>
                  {canCreateVehicle && syncActive && (
                    <button
                      onClick={() => setVehicleModal({ mode: "create" })}
                      className="rounded-sm border border-border bg-surface-2 px-[11px] py-[6px] text-[12px] font-semibold text-text hover:border-border-strong"
                    >
                      + Véhicule
                    </button>
                  )}
                </div>
                {(vehicles ?? []).length === 0 ? (
                  <div className="flex min-h-[160px] items-center justify-center text-[13px] text-faint">
                    Aucun véhicule rattaché.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-[.9fr_1.2fr_.9fr_1fr] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
                      <span>Plaque</span>
                      <span>Modèle</span>
                      <span>Couleur</span>
                      <span>Statut</span>
                    </div>
                    {(vehicles ?? []).map((v) => (
                      <div
                        key={v._id}
                        onClick={() => setVehicleModal({ mode: "view", id: v._id })}
                        className="grid cursor-pointer grid-cols-[.9fr_1.2fr_.9fr_1fr] items-center gap-3 border-b border-border px-4 py-3 hover:bg-surface-2"
                      >
                        <span className="font-data text-[13px] font-semibold">{v.plaque}</span>
                        <span className="text-[13px]">{v.modele}</span>
                        <span className="text-[13px] text-muted">{v.couleur}</span>
                        <span className="flex flex-wrap gap-1">
                          {v.flags.length === 0 ? (
                            <span className="text-[12px] text-faint">En règle</span>
                          ) : (
                            v.flags.map((f) => (
                              <span
                                key={f}
                                className="rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold"
                                style={{ background: "rgba(220,38,38,0.12)", color: "var(--danger)" }}
                              >
                                {f}
                              </span>
                            ))
                          )}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : tab === "casier" ? (
              <div className="flex flex-col gap-[11px] p-[14px]">
                {canCasier && (
                  <div className="flex justify-end">
                    <button onClick={() => openCalc(c._id)} className={TAB_ADD_BTN}>
                      + Entrée de casier
                    </button>
                  </div>
                )}
                {(casier ?? []).length === 0 ? (
                  <EmptyState compact title="Casier vierge" message="Aucun antécédent judiciaire." />
                ) : (
                  (casier ?? []).map((e) => (
                    <div
                      key={e._id}
                      onClick={() => setCasierModalId(e._id)}
                      className="cursor-pointer rounded-sm border border-border bg-surface-2 px-[15px] py-[13px] transition-colors hover:border-border-strong"
                      style={e.status === "ANNULEE" ? { opacity: 0.6 } : undefined}
                    >
                      <div className="mb-[8px] flex items-center gap-[10px]">
                        <span
                          className="rounded-[5px] px-[8px] py-[3px] text-[10.5px] font-bold uppercase tracking-[0.05em]"
                          style={
                            e.arrestType === "DOSSIER"
                              ? { background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent)" }
                              : { background: "color-mix(in srgb, var(--muted) 12%, transparent)", color: "var(--muted)", border: "1px solid var(--border)" }
                          }
                        >
                          {e.arrestType === "DOSSIER" ? "Dossier d'arrestation" : "Rapport d'arrestation"}
                        </span>
                        {e.arrestType === "DOSSIER" && e.dossierStatus && (
                          <span className="rounded-[5px] px-[7px] py-[2px] text-[10.5px] font-semibold" style={{ background: "color-mix(in srgb, var(--warning) 14%, transparent)", color: "var(--warning)" }}>
                            {e.dossierStatus}
                          </span>
                        )}
                        {e.closed && (
                          <span className="rounded-[5px] px-[7px] py-[2px] text-[10.5px] font-bold uppercase" style={{ background: "color-mix(in srgb, var(--muted) 16%, transparent)", color: "var(--muted)" }}>
                            Clos
                          </span>
                        )}
                        <span className="text-[13.5px] font-semibold">
                          {e.chargeCount} charge{e.chargeCount > 1 ? "s" : ""}
                        </span>
                        {e.status === "ANNULEE" && (
                          <span
                            className="rounded-[5px] px-[7px] py-[2px] text-[10.5px] font-semibold"
                            style={{
                              background: "color-mix(in srgb, var(--muted) 14%, transparent)",
                              color: "var(--muted)",
                            }}
                          >
                            Annulée
                          </span>
                        )}
                        {e.dojRequired && (
                          <span
                            className="rounded-[5px] px-[7px] py-[2px] text-[10.5px] font-semibold"
                            style={{
                              background: "color-mix(in srgb, var(--critical) 14%, transparent)",
                              color: "var(--critical)",
                            }}
                          >
                            DOJ requise
                          </span>
                        )}
                        <div className="flex-1" />
                        <span className="font-data text-[11.5px] text-faint">
                          {new Date(e.at).toLocaleDateString("fr-FR")}
                        </span>
                      </div>
                      <div className="mb-[10px] flex flex-wrap gap-[6px]">
                        {e.charges.slice(0, 6).map((ch, i) => (
                          <span
                            key={i}
                            className="rounded-[5px] border border-border bg-surface px-2 py-[2px] text-[11.5px] text-muted"
                          >
                            {ch}
                          </span>
                        ))}
                        {e.charges.length > 6 && (
                          <span className="px-1 text-[11.5px] text-faint">
                            +{e.charges.length - 6}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px]">
                        <span className="text-muted">
                          Amende{" "}
                          <b className="font-data text-text">
                            ${e.totalFine.toLocaleString("fr-FR")}
                          </b>
                        </span>
                        <span className="text-muted">
                          Prison <b className="font-data text-text">{fmtDur(e.totalJailSeconds)}</b>
                        </span>
                        <span className="text-muted">
                          Agent <AgentTag agent={e.officer} className="text-text" />
                        </span>
                        <div className="flex-1" />
                        <span className="text-[11.5px] text-accent">Détails →</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : tab === "mandats" ? (
              <div className="flex flex-col gap-[11px] p-[14px]">
                {canMandat && (
                  <div className="flex justify-end">
                    <button onClick={() => openMandat(c._id)} className={TAB_ADD_BTN}>
                      + Mandat
                    </button>
                  </div>
                )}
                {(mandats ?? []).length === 0 ? (
                  <EmptyState compact title="Aucun mandat" />
                ) : (
                  (mandats ?? []).map((m) => (
                    <div
                      key={m._id}
                      className="flex gap-[13px] rounded-sm border border-border bg-surface-2 px-[14px] py-[13px]"
                    >
                      <span
                        className="mt-[5px] h-[9px] w-[9px] flex-shrink-0 rounded-full"
                        style={{ background: m.effectiveActive ? "var(--danger)" : "var(--faint)" }}
                      />
                      <div className="flex-1">
                        <div className="text-[13.5px] font-semibold">{m.motif}</div>
                        <div className="mt-[3px] text-[11.5px] text-muted">
                          {m.typeName} · émis par <AgentTag agent={m.issuer} /> ·{" "}
                          {new Date(m.issuedAt).toLocaleDateString("fr-FR")}
                        </div>
                      </div>
                      <span
                        className="h-fit rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold"
                        style={{
                          background: `color-mix(in srgb, ${m.effectiveActive ? "var(--danger)" : "var(--muted)"} 12%, transparent)`,
                          color: m.effectiveActive ? "var(--danger)" : "var(--muted)",
                        }}
                      >
                        {m.effectiveActive ? "ACTIF" : m.status === "EXECUTE" ? "EXÉCUTÉ" : m.status === "EXPIRE" ? "EXPIRÉ" : m.status === "ANNULE" ? "ANNULÉ" : m.status}
                      </span>
                      {m.effectiveActive && canExecuteMandat && (
                        <button
                          onClick={() => executeMandat({ mandatId: m._id })}
                          className="h-fit rounded-sm border border-border bg-surface px-[9px] py-[5px] text-[11.5px] font-semibold text-muted hover:border-border-strong"
                          title="Marquer comme exécuté (individu arrêté)"
                        >
                          Arrêter
                        </button>
                      )}
                      {canAnnulMandat && (
                        <DeleteButton onDelete={() => removeMandat({ mandatId: m._id })} title="Supprimer le mandat" />
                      )}
                    </div>
                  ))
                )}
              </div>
            ) : tab === "contraventions" ? (
              <div>
                {canContravention && (
                  <div className="flex justify-end border-b border-border p-[10px]">
                    <button onClick={() => openCalc(c._id, "contravention")} className={TAB_ADD_BTN}>
                      + Contravention
                    </button>
                  </div>
                )}
                {(contraventions ?? []).length === 0 ? (
                  <div className="flex min-h-[180px] items-center justify-center text-[13px] text-faint">
                    Aucune contravention.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-[1fr_.7fr_.9fr_.6fr] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
                      <span>Motif</span>
                      <span>Montant</span>
                      <span>Agent</span>
                      <span>Statut</span>
                    </div>
                    {(contraventions ?? []).map((c) => (
                      <div
                        key={c._id}
                        onClick={() => setContravModalId(c._id)}
                        className="grid cursor-pointer grid-cols-[1fr_.7fr_.9fr_.6fr] items-center gap-3 border-b border-border px-4 py-3 hover:bg-surface-2"
                      >
                        <div>
                          <div className="text-[13px] font-medium">{c.motif}</div>
                          <div className="font-data text-[11px] text-faint">
                            {new Date(c.at).toLocaleDateString("fr-FR")}
                          </div>
                        </div>
                        <span className="font-data text-[13px] font-semibold">
                          ${c.totalFine.toLocaleString("fr-FR")}
                        </span>
                        <span className="text-[12.5px] text-muted">
                          <AgentTag agent={c.officer} />
                        </span>
                        <span
                          className="text-[12px] font-semibold"
                          style={{ color: c.status === "ANNULEE" ? "var(--muted)" : "var(--warning)" }}
                        >
                          {c.status === "ANNULEE" ? "Annulée" : "Émise"}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : tab === "plaintes" ? (
              <div className="p-[14px]">
                {canPlainte && syncActive && (
                  <div className="mb-3 flex justify-end">
                    <button onClick={() => setComplaintModal({})} className={TAB_ADD_BTN}>+ Plainte</button>
                  </div>
                )}
                {(plaintes?.filed.length ?? 0) === 0 && (plaintes?.against.length ?? 0) === 0 ? (
                  <EmptyState title="Aucune plainte" message="Ce citoyen n'a déposé ni fait l'objet d'aucune plainte." />
                ) : (
                  <>
                    {(plaintes?.filed.length ?? 0) > 0 && (
                      <PlaintesSection title="Déposées par ce citoyen" items={plaintes?.filed ?? []} onOpen={(id) => setComplaintModal({ id })} />
                    )}
                    {(plaintes?.filed.length ?? 0) > 0 && (plaintes?.against.length ?? 0) > 0 && <div className="h-3" />}
                    {(plaintes?.against.length ?? 0) > 0 && (
                      <PlaintesSection title="Déposées à son encontre" items={plaintes?.against ?? []} onOpen={(id) => setComplaintModal({ id })} />
                    )}
                  </>
                )}
              </div>
            ) : tab === "depositions" ? (
              <div className="p-[14px]">
                {canDeposition && syncActive && (
                  <div className="mb-3 flex justify-end">
                    <button onClick={() => setDepositionModal(true)} className={TAB_ADD_BTN}>+ Déposition</button>
                  </div>
                )}
                {(depositions ?? []).length === 0 ? (
                  <EmptyState compact title="Aucune déposition" />
                ) : (
                  <div className="flex flex-col gap-[10px]">
                    {(depositions ?? []).map((d) => (
                      <div key={d._id} className="rounded-sm border border-border bg-surface-2 px-[14px] py-[12px]">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="rounded-[5px] px-[7px] py-[2px] text-[10.5px] font-semibold" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{d.linkLabel}</span>
                          {d.title && <span className="text-[13px] font-semibold">{d.title}</span>}
                          <div className="flex-1" />
                          <span className="font-data text-[11px] text-faint">{new Date(d.at).toLocaleDateString("fr-FR")}</span>
                        </div>
                        <RichTextEditor value={d.body} editable={false} />
                        <div className="mt-2 text-[11px] text-faint">Par <AgentTag agent={d.by} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : tab === "notes" ? (
              <div className="p-[14px]">
                <div className="mb-3 flex justify-end">
                  <button onClick={() => setNoteModal(true)} className={TAB_ADD_BTN}>
                    + Note
                  </button>
                </div>
                {citizenId ? <NotesPanel citizenId={citizenId} /> : null}
              </div>
            ) : tab === "rapports" ? (
              <div>
                {(rapports ?? []).length === 0 ? (
                  <div className="flex min-h-[180px] items-center justify-center text-[13px] text-faint">
                    Aucun rapport impliquant ce citoyen.
                  </div>
                ) : (
                  (rapports ?? []).map((r) => (
                    <div
                      key={r._id}
                      onClick={() => navigate(`/rapport/${r._id}`)}
                      className="grid cursor-pointer grid-cols-[1.7fr_1fr_.8fr_.8fr] items-center gap-3 border-b border-border px-4 py-3 hover:bg-surface-2"
                    >
                      <span className="text-[13px] font-semibold">{r.title}</span>
                      <span className="text-[12.5px] text-muted">{r.typeName}</span>
                      <span
                        className="text-[12px] font-semibold"
                        style={{
                          color:
                            r.status === "VALIDE"
                              ? "var(--success)"
                              : r.status === "SOUMIS"
                                ? "var(--warning)"
                                : "var(--muted)",
                        }}
                      >
                        {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                      </span>
                      <span className="font-data text-[11.5px] text-muted">
                        {new Date(r.at).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="flex min-h-[200px] items-center justify-center text-[13px] text-faint">
                {TABS.find((t) => t.key === tab)?.label}
              </div>
            )}
          </div>
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-4">
          <div className="rounded-card border border-border bg-surface p-[15px]">
            <div className="mb-[10px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
              Synthèse
            </div>
            <div className="flex flex-col gap-[9px]">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] text-muted">Statut</span>
                <span
                  className="font-data text-[12.5px] font-semibold"
                  style={{ color: data.wanted ? "var(--danger)" : "var(--muted)" }}
                >
                  {data.wanted ? "RECHERCHÉ" : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] text-muted">Signalements</span>
                <span className="font-data text-[12.5px] font-semibold">{data.flags.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] text-muted">Licences</span>
                <span className="font-data text-[12.5px] font-semibold">{data.licenses.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] text-muted">Entrées casier</span>
                <span className="font-data text-[12.5px] font-semibold">{(casier ?? []).length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {casierModalId && (
        <CasierEntryModal
          entryId={casierModalId}
          canDelete={canAnnulCasier}
          onClose={() => setCasierModalId(null)}
        />
      )}
      {contravModalId && (
        <ContraventionModal
          citationId={contravModalId}
          canDelete={canAnnulContravention}
          onClose={() => setContravModalId(null)}
        />
      )}
      {vehicleModal && (
        <VehicleModal
          vehicleId={vehicleModal.mode === "view" ? vehicleModal.id : undefined}
          ownerId={vehicleModal.mode === "create" ? c._id : undefined}
          ownerName={`${c.prenom} ${c.nom}`}
          canEdit={vehicleModal.mode === "create" ? canCreateVehicle : canEditVehicle}
          onClose={() => setVehicleModal(null)}
        />
      )}
      {editIdentity && (
        <EditIdentityModal
          citizen={c}
          onClose={() => setEditIdentity(false)}
          onArchived={() => navigate("/")}
        />
      )}
      {noteModal && citizenId && (
        <NoteModal citizenId={citizenId} onClose={() => setNoteModal(false)} />
      )}
      {depositionModal && citizenId && (
        <DepositionModal citizenId={citizenId} onClose={() => setDepositionModal(false)} />
      )}
      {complaintModal && citizenId && (
        <ComplaintModal
          complaintId={complaintModal.id}
          presetPlaignant={complaintModal.id ? undefined : { id: citizenId, name: `${c.prenom} ${c.nom}` }}
          canManage={canPlainte}
          onClose={() => setComplaintModal(null)}
        />
      )}
      {extractOpen && <CasierExtract citizen={c} onClose={() => setExtractOpen(false)} />}
    </div>
  );
}

function PlaintesSection({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: { _id: string; motif: string; status: string; plaignant: string | null; defendant: string | null; at: number }[];
  onOpen: (id: Id<"complaints">) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">{title}</div>
      {items.length === 0 ? (
        <div className="text-[12.5px] text-faint">Aucune.</div>
      ) : (
        <div className="flex flex-col gap-[7px]">
          {items.map((c) => (
            <div key={c._id} onClick={() => onOpen(c._id as Id<"complaints">)} className="flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-surface-2 px-[13px] py-[10px] hover:border-border-strong">
              <div className="flex-1">
                <div className="text-[13px] font-semibold">{c.motif}</div>
                <div className="mt-[2px] text-[11.5px] text-muted">{c.plaignant} → {c.defendant}</div>
              </div>
              <span className="rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{c.status}</span>
              <span className="font-data text-[11px] text-faint">{new Date(c.at).toLocaleDateString("fr-FR")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtDur(seconds: number) {
  if (!seconds) return "Aucune";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [h ? `${h}h` : "", m ? `${m}min` : ""].filter(Boolean).join(" ") || `${seconds}s`;
}
