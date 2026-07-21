// Génère la fiche de renseignement en PDF natif, multi-pages (item 11).
// Texte réel (pas une image) : lisible, léger, et se répartit sur plusieurs pages si besoin.
// jsPDF est chargé dynamiquement (lourd) : il n'entre pas dans le bundle initial.

type Fiche = { data: unknown; submittedAt: number };

const ACCENT: [number, number, number] = [0x49, 0xa2, 0x4a];
const GREEN_DARK: [number, number, number] = [0x2e, 0x6b, 0x2f];
const GREY: [number, number, number] = [0x98, 0xa0, 0xab];
const INK: [number, number, number] = [0x0b, 0x0d, 0x10];

export async function downloadFichePdf(fiche: Fiche, agentName: string) {
  const { jsPDF } = await import("jspdf");
  const d: Record<string, unknown> = (fiche.data as Record<string, unknown>) ?? {};
  const g = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "") || "-";
  const enfants = Array.isArray(d.enfants) ? (d.enfants as { nom?: string; ddn?: string }[]) : [];
  const flags = (d.flags as Record<string, boolean>) ?? {};

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 16; // marge
  const contentW = pageW - M * 2;
  let y = M;

  const ensure = (h: number) => {
    if (y + h > pageH - M) {
      doc.addPage();
      y = M;
    }
  };

  // En-tete (repris sur chaque page).
  const header = () => {
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("LSPD · Station 13", M, y + 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...GREEN_DARK);
    doc.text("FICHE DE RENSEIGNEMENT INDIVIDUEL", M, y + 10);
    doc.setTextColor(...GREY);
    doc.setFont("helvetica", "normal");
    doc.text(`Établie le ${new Date(fiche.submittedAt).toLocaleDateString("fr-FR")}`, pageW - M, y + 5, { align: "right" });
    doc.text(agentName, pageW - M, y + 10, { align: "right" });
    y += 14;
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(0.7);
    doc.line(M, y, pageW - M, y);
    y += 8;
  };

  const section = (title: string) => {
    ensure(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...GREEN_DARK);
    doc.text(title.toUpperCase(), M, y);
    y += 5;
  };

  const row = (label: string, value: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(value, contentW);
    const h = 5 + lines.length * 5 + 2;
    ensure(h);
    doc.setTextColor(...GREY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(label.toUpperCase(), M, y);
    y += 4.5;
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(lines, M, y);
    y += lines.length * 5 + 2;
  };

  header();

  section("Information personnelle");
  row("Nom complet", g("nomComplet"));
  row("Prénom", g("prenom"));
  row("Nom de famille", g("nomFamille"));
  row("Date de naissance", g("dateNaissance"));
  row("Lieu de naissance", g("lieuNaissance"));
  row("Nationalité", g("nationalite"));
  row("Sexe", g("sexe"));
  row("État civil", g("etatCivil"));
  row("Téléphone mobile", g("telephone"));
  y += 3;

  section("Informations médicales");
  row("Groupe sanguin", g("groupeSanguin"));
  row("Allergies", flags.hasAllergies ? g("allergies") : "Aucune");
  row("Conditions médicales", flags.hasConditions ? g("conditions") : "Aucune");
  row("Médicaments en cours", flags.hasMedicaments ? g("medicaments") : "Aucun");
  row("Médecin traitant", flags.hasMedecin ? g("medecin") : "Aucun");
  row("Contact d'urgence", flags.hasUrgence ? `${g("urgenceNom")} · ${g("urgenceLien")} · ${g("urgenceTel")}` : "Aucun");
  y += 3;

  section("Informations familiales");
  row("Conjoint", flags.hasConjoint ? `${g("conjointNom")} (${g("conjointDDN")})` : "Célibataire");
  row("Père", g("pereNom"));
  row("Mère", g("mereNom"));
  if (flags.hasEnfants && enfants.length > 0) {
    row("Enfants", enfants.map((c) => `${c.nom || "-"}${c.ddn ? ` (${c.ddn})` : ""}`).join("\n"));
  } else {
    row("Enfants", "Aucun");
  }
  y += 3;

  section("Autres informations");
  row("Langues parlées", g("langues"));
  row("Numéro de badge", g("matricule"));
  row("Code casier", g("codeCasier"));
  row("Permis de conduire", g("permisConduire"));
  row("Véhicule", flags.hasVehicule ? `${g("vehiculeMarque")} ${g("vehiculeModele")} ${g("vehiculeAnnee")} · ${g("vehiculeImmat")}`.trim() : "Aucun");

  // Numérotation des pages.
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(`Page ${i} / ${pages}`, pageW - M, pageH - 8, { align: "right" });
    doc.text("LSPD · Station 13 · Document confidentiel", M, pageH - 8);
  }

  doc.save(`Fiche-${agentName.replace(/\s+/g, "-")}.pdf`);
}
