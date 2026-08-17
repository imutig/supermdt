// Génère le document LaTeX du rapport hebdomadaire à partir des données (JSON).
// Tout texte issu des données est échappé ; les sections rédigées à la main
// acceptent un sous-ensemble sûr de mise en forme (paragraphes, listes, gras).

export type ReportPayload = {
  meta: {
    periodLabel: string;   // « du 11 au 17 août 2026 »
    weekLabel: string;     // « Semaine 33 · 2026 »
    generatedLabel: string;// « Généré le 17 août 2026 »
    chiefName?: string;
    chiefRole?: string;
  };
  // Sections rédigées à la main (peuvent être vides -> section masquée).
  sections: {
    motChef?: string;
    analyseCrime?: string;
    operationsNotables?: string;
    pointRH?: string;
    distinctions?: string;
    objectifs?: string;
  };
  kpis: {
    arrestations: number;
    contraventions: number;
    amendesMontant: number; // en $
    heuresService: string;  // « 312 h 40 »
    patrouilles: number;
    operations: number;
    appels911: number;
    sanctions: number;
  };
  crime: {
    dossiers: number;
    rapports: number;
    topInfractions: { name: string; count: number }[];
    mandatsEmis: number;
    mandatsExecutes: number;
    bolos: number;
    amendesCount: number;
    amendesPayees: number;
  };
  ops: {
    patrouilles: number;
    operations: { name: string; date: string }[];
    appels911: number;
    saisies: number;
  };
  rh: {
    effectifActif: number;
    arrivees: string[];
    departs: string[];
    promotions: { name: string; grade: string }[];
    sanctions: number;
    absences: number;
  };
  topAgents: { name: string; matricule: string; arrestations: number; heures: string }[];
};

// ---- Échappement LaTeX ----
export function tex(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/"/g, "\\textquotedbl{}");
}

// Montant $ formaté.
function money(n: number): string {
  return "\\$" + Math.round(n).toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, "\\,");
}

// ---- Conversion « texte rédigé à la main » -> LaTeX ----
// Sous-ensemble volontairement restreint et sûr : paragraphes (ligne vide),
// listes à puces (- / *), et gras **texte**. Tout le reste est échappé.
export function richToLatex(input: string): string {
  const src = (input ?? "").replace(/\r\n/g, "\n").trim();
  if (!src) return "";
  const inline = (t: string) =>
    tex(t).replace(/\*\*([^*]+)\*\*/g, (_m, g) => `\\textbf{${tex(g)}}`);
  const blocks = src.split(/\n{2,}/);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const isList = lines.every((l) => /^\s*[-*]\s+/.test(l));
    if (isList) {
      out.push("\\begin{itemize}");
      for (const l of lines) out.push("  \\item " + inline(l.replace(/^\s*[-*]\s+/, "")));
      out.push("\\end{itemize}");
    } else {
      out.push("\\justifying " + inline(block.replace(/\n/g, " ")) + "\\par");
    }
  }
  return out.join("\n\n");
}

// Un bloc de section manuelle : rien si vide.
function manual(title: string | null, body?: string): string {
  const t = richToLatex(body ?? "");
  if (!t) return "";
  return (title ? `\\sstitre{${tex(title)}}\n` : "") + t + "\n";
}

function crimeTable(rows: { name: string; count: number }[]): string {
  if (!rows.length) return "\\rlead{Aucune infraction relevée sur la période.}";
  const body = rows
    .map((r, i) => `${i % 2 ? "\\altrow " : ""}\\tkey{${tex(r.name)}} & ${r.count} \\\\`)
    .join("\n");
  return [
    "\\vspace{3pt}",
    "\\noindent\\begin{longtable}{@{}P{0.82\\linewidth} C{0.14\\linewidth}@{}}",
    "\\headrow \\thead{Infraction} & \\thead{Nb} \\\\",
    body,
    "\\end{longtable}",
  ].join("\n");
}

function agentsTable(rows: ReportPayload["topAgents"]): string {
  if (!rows.length) return "\\rlead{Aucune activité enregistrée sur la période.}";
  const body = rows
    .map(
      (r, i) =>
        `${i % 2 ? "\\altrow " : ""}\\tkey{${tex(r.matricule)}} & ${tex(r.name)} & ${r.arrestations} & ${tex(r.heures)} \\\\`,
    )
    .join("\n");
  return [
    "\\vspace{3pt}",
    "\\noindent\\begin{longtable}{@{}C{0.16\\linewidth} P{0.5\\linewidth} C{0.14\\linewidth} C{0.14\\linewidth}@{}}",
    "\\headrow \\thead{Matricule} & \\thead{Agent} & \\thead{Arrest.} & \\thead{Service} \\\\",
    body,
    "\\end{longtable}",
  ].join("\n");
}

function nameList(names: string[]): string {
  if (!names.length) return "\\rlead{Aucun.}";
  return "\\begin{itemize}\n" + names.map((n) => `  \\item ${tex(n)}`).join("\n") + "\n\\end{itemize}";
}

function promoList(rows: { name: string; grade: string }[]): string {
  if (!rows.length) return "\\rlead{Aucune promotion sur la période.}";
  return (
    "\\begin{itemize}\n" +
    rows.map((r) => `  \\item ${tex(r.name)} \\textemdash{} \\stress{${tex(r.grade)}}`).join("\n") +
    "\n\\end{itemize}"
  );
}

function opsList(rows: { name: string; date: string }[]): string {
  if (!rows.length) return "\\rlead{Aucune opération enregistrée sur la période.}";
  return (
    "\\begin{itemize}\n" +
    rows.map((r) => `  \\item \\stress{${tex(r.name)}}${r.date ? ` \\textemdash{} ${tex(r.date)}` : ""}`).join("\n") +
    "\n\\end{itemize}"
  );
}

export function buildTex(p: ReportPayload): string {
  const k = p.kpis;
  const parts: string[] = [];

  parts.push(
    "% !TEX program = xelatex",
    "\\documentclass[11pt,a4paper]{article}",
    "\\usepackage{style/rapport}",
    "\\hypersetup{",
    `  pdftitle  = {Rapport hebdomadaire d'activité - ${p.meta.weekLabel.replace(/[{}]/g, "")}},`,
    "  pdfauthor = {État-Major du Los Santos Police Department},",
    "  pdfsubject= {Rapport hebdomadaire d'activité}}",
    "\\begin{document}",
    `\\rapportcouverture{${tex(p.meta.periodLabel)}}{${tex(p.meta.weekLabel)}}`,
    "\\lspdactivaterules",
    "\\pagestyle{lspdmain}",
    "\\pagenumbering{arabic}",
    "",
  );

  // 1. Mot du Chef (optionnel)
  const mot = richToLatex(p.sections.motChef ?? "");
  if (mot) parts.push("\\rsection{Mot du Chef de la Police}", mot, "");

  // 2. Synthèse (KPI)
  parts.push(
    "\\rsection{Synthèse de la semaine}",
    "\\begin{kpigrid}",
    `\\kpi{${k.arrestations}}{Arrestations}`,
    `\\kpi{${k.contraventions}}{Contraventions}`,
    `\\kpi{${money(k.amendesMontant)}}{Amendes émises}`,
    `\\kpi{${tex(k.heuresService)}}{Heures de service}`,
    `\\kpi{${k.patrouilles}}{Patrouilles}`,
    `\\kpi{${k.operations}}{Opérations}`,
    `\\kpi{${k.appels911}}{Appels 911}`,
    `\\kpi{${k.sanctions}}{Sanctions}`,
    "\\end{kpigrid}",
    "",
  );

  // 3. Criminalité & activité judiciaire
  parts.push(
    "\\rsection{Criminalité \\& activité judiciaire}",
    `\\statline{Dossiers d'arrestation}{${p.crime.dossiers}}`,
    `\\statline{Rapports d'arrestation}{${p.crime.rapports}}`,
    `\\statline{Mandats émis / exécutés}{${p.crime.mandatsEmis} / ${p.crime.mandatsExecutes}}`,
    `\\statline{Avis de recherche émis}{${p.crime.bolos}}`,
    `\\statline{Amendes émises / réglées}{${p.crime.amendesCount} / ${p.crime.amendesPayees}}`,
    "\\sstitre{Infractions les plus relevées}",
    crimeTable(p.crime.topInfractions),
    manual("Analyse de l'état-major", p.sections.analyseCrime),
    "",
  );

  // 4. Activité opérationnelle
  parts.push(
    "\\rsection{Activité opérationnelle}",
    `\\statline{Patrouilles engagées}{${p.ops.patrouilles}}`,
    `\\statline{Appels 911 traités}{${p.ops.appels911}}`,
    `\\statline{Saisies enregistrées}{${p.ops.saisies}}`,
    "\\sstitre{Opérations de la semaine}",
    opsList(p.ops.operations),
    manual("Opérations notables", p.sections.operationsNotables),
    "",
  );

  // 5. Ressources humaines
  parts.push(
    "\\rsection{Ressources humaines}",
    `\\statline{Effectif actif}{${p.rh.effectifActif}}`,
    `\\statline{Absences en cours}{${p.rh.absences}}`,
    `\\statline{Sanctions prononcées}{${p.rh.sanctions}}`,
    "\\sstitre{Arrivées}",
    nameList(p.rh.arrivees),
    "\\sstitre{Départs}",
    nameList(p.rh.departs),
    "\\sstitre{Promotions}",
    promoList(p.rh.promotions),
    manual("Point ressources humaines", p.sections.pointRH),
    "",
  );

  // 6. Agents à l'honneur
  parts.push(
    "\\rsection{Agents à l'honneur}",
    agentsTable(p.topAgents),
    manual("Distinctions", p.sections.distinctions),
    "",
  );

  // 7. Objectifs & message au gouvernement (optionnel)
  const obj = richToLatex(p.sections.objectifs ?? "");
  if (obj) parts.push("\\rsection{Objectifs \\& message au Gouvernement}", obj, "");

  // Signature
  parts.push(
    "\\vspace{14pt}",
    "\\noindent\\begin{tikzpicture}\\fill[lspdrule] (0,0) rectangle (\\linewidth,.4pt);\\end{tikzpicture}",
    "\\vspace{4pt}",
    `\\noindent{\\lspdsans\\fontsize{8.4}{11}\\selectfont\\color{lspdgrey}${tex(p.meta.generatedLabel)}}\\hfill`,
    "\\begin{minipage}[t]{0.5\\linewidth}\\raggedleft",
    `\\blocSignature{\\signatureChief}{${tex(p.meta.chiefName ?? "L'État-Major")}}{${tex(p.meta.chiefRole ?? "Los Santos Police Department")}}{}`,
    "\\end{minipage}",
    "\\end{document}",
    "",
  );

  return parts.join("\n");
}
