import { useRef, useState } from "react";
import { X, Download } from "lucide-react";
import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { downloadFichePdf } from "@/lib/fichePdf";

// Document professionnel "Fiche de renseignement" (item 11) - consultable + téléchargeable en PDF multi-pages.
export function FicheDocument({ agentId, agentName, onClose }: { agentId: Id<"agents">; agentName: string; onClose: () => void }) {
  const fiche = useQuery(api.fiche.byAgent, { agentId });
  const docRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const d: Record<string, unknown> = (fiche?.data as Record<string, unknown>) ?? {};
  const g = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "") || "-";
  const enfants = Array.isArray(d.enfants) ? (d.enfants as { nom?: string; ddn?: string }[]) : [];
  const flags = (d.flags as Record<string, boolean>) ?? {};

  async function download() {
    if (!fiche) return;
    setBusy(true);
    try {
      await downloadFichePdf(fiche, agentName);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[85] flex flex-col" style={{ background: "rgba(0,0,0,.6)" }}>
      <div className="flex flex-shrink-0 items-center gap-3 bg-elev px-5 py-3 shadow">
        <span className="text-[13px] font-bold">Fiche de renseignement · {agentName}</span>
        <div className="flex-1" />
        {fiche && (
          <button onClick={download} disabled={busy} className="mdt-press flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">
            <Download className="h-[15px] w-[15px]" /> {busy ? "Génération…" : "Télécharger (PDF)"}
          </button>
        )}
        <button onClick={onClose} className="flex h-[34px] w-[34px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex flex-1 justify-center overflow-auto p-6">
        {fiche === undefined ? (
          <div className="text-center text-[13px] text-white/70">Chargement…</div>
        ) : fiche === null ? (
          <div className="h-fit rounded-card bg-white p-10 text-center text-[13px] text-[#5c626e]">Cet agent n'a pas encore rempli sa fiche de renseignement.</div>
        ) : (
          <div ref={docRef} className="h-fit bg-white p-[44px] text-[#0b0d10] shadow-[0_10px_40px_rgba(0,0,0,.3)]" style={{ width: 820, flexShrink: 0, fontFamily: "'Inter',system-ui,sans-serif" }}>
            <div className="flex items-center gap-4 border-b-2 pb-4" style={{ borderColor: "#49A24A" }}>
              <img src="/logos/logo-badge-light.svg" alt="" style={{ width: 60, height: 60 }} />
              <div className="flex-1">
                <div className="text-[18px] font-extrabold tracking-tight">LSPD · Station 13</div>
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#2E6B2F" }}>Fiche de renseignement individuel</div>
              </div>
              <div className="text-right text-[10.5px]" style={{ color: "#5c626e" }}>Établie le {new Date(fiche.submittedAt).toLocaleDateString("fr-FR")}</div>
            </div>

            <Block title="Information personnelle">
              <Row l="Nom complet" v={g("nomComplet")} full />
              <Row l="Prénom" v={g("prenom")} /><Row l="Nom de famille" v={g("nomFamille")} />
              <Row l="Date de naissance" v={g("dateNaissance")} /><Row l="Lieu de naissance" v={g("lieuNaissance")} />
              <Row l="Nationalité" v={g("nationalite")} /><Row l="Sexe" v={g("sexe")} />
              <Row l="État civil" v={g("etatCivil")} /><Row l="Téléphone mobile" v={g("telephone")} />
            </Block>

            <Block title="Informations médicales">
              <Row l="Groupe sanguin" v={g("groupeSanguin")} />
              <Row l="Allergies" v={flags.hasAllergies ? g("allergies") : "Aucune"} />
              <Row l="Conditions médicales" v={flags.hasConditions ? g("conditions") : "Aucune"} />
              <Row l="Médicaments en cours" v={flags.hasMedicaments ? g("medicaments") : "Aucun"} />
              <Row l="Médecin traitant" v={flags.hasMedecin ? g("medecin") : "Aucun"} full />
              <Row l="Contact d'urgence" v={flags.hasUrgence ? `${g("urgenceNom")} · ${g("urgenceLien")} · ${g("urgenceTel")}` : "Aucun"} full />
            </Block>

            <Block title="Informations familiales">
              <Row l="Conjoint" v={flags.hasConjoint ? `${g("conjointNom")} (${g("conjointDDN")})` : "Célibataire"} full />
              <Row l="Père" v={g("pereNom")} /><Row l="Mère" v={g("mereNom")} />
              {flags.hasEnfants && enfants.length > 0 && (
                <div className="col-span-2 mt-1">
                  <div className="text-[9.5px] font-bold uppercase tracking-[0.06em]" style={{ color: "#98a0ab" }}>Enfants</div>
                  {enfants.map((c, i) => <div key={i} className="text-[12.5px] font-semibold">{c.nom || "-"} {c.ddn ? `(${c.ddn})` : ""}</div>)}
                </div>
              )}
            </Block>

            <Block title="Autres informations">
              <Row l="Langues parlées" v={g("langues")} full />
              <Row l="Numéro de badge" v={g("matricule")} /><Row l="Code casier" v={g("codeCasier")} />
              <Row l="Permis de conduire" v={g("permisConduire")} full />
              <Row l="Véhicule" v={flags.hasVehicule ? `${g("vehiculeMarque")} ${g("vehiculeModele")} ${g("vehiculeAnnee")} · ${g("vehiculeImmat")}` : "Aucun"} full />
            </Block>
          </div>
        )}
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "#2E6B2F" }}>{title}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-[10px] rounded-[8px] border p-4" style={{ borderColor: "#e5e8ec", background: "#f7f8fa" }}>{children}</div>
    </div>
  );
}
function Row({ l, v, full }: { l: string; v: string; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-[9.5px] font-bold uppercase tracking-[0.06em]" style={{ color: "#98a0ab" }}>{l}</div>
      <div className="text-[12.5px] font-semibold">{v}</div>
    </div>
  );
}
