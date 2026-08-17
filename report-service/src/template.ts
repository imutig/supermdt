// Génère le document LaTeX du rapport hebdomadaire à partir des données (JSON).
// Tout texte issu des données est échappé ; les sections rédigées à la main
// acceptent un sous-ensemble sûr de mise en forme (paragraphes, listes, gras).

export type ReportPayload = {
  meta: {
    periodLabel: string;    // « du 10 au 16 août 2026 »
    weekLabel: string;      // « Semaine 33 · 2026 »
    generatedLabel: string; // « Généré le 17 août 2026 »
    chiefName?: string;     // défaut : Andres Acosta
    chiefRole?: string;     // défaut : Capitaine · LSPD
    dataNote?: string;      // avertissement de périmètre (ex. données depuis la mise en service)
  };
  // Sections rédigées à la main (vides -> masquées).
  sections: {
    motChef?: string;
    analyseCrime?: string;
    operationsNotables?: string;
    pointRH?: string;
    objectifs?: string;
  };
  kpis: {
    arrestations: number;
    contraventions: number;
    amendesMontant: number; // en $ (émises)
    heuresService: string;  // « 312 h 40 » (service MDT, en attendant le service in-game)
    patrouilles: number;
    operations: number;
    appels911: number;
    sanctions: number;
  };
  // Graphique « activité par jour » : arrestations + contraventions par jour.
  chart?: { label: string; arrestations: number; contraventions: number }[];
  crime: {
    dossiers: number;
    rapports: number;
    bolos: number;
    amendesCount: number; // amendes émises
    topInfractions: { name: string; count: number }[];
  };
  ops: {
    patrouilles: number;
    appels911: number;
    saisies: number;
    operations: { name: string; date: string }[];
  };
  rh: {
    effectifTotal: number;
    parGrade: { grade: string; count: number }[];
  };
  // Agents à l'honneur : liste curatée à la main (pré-remplie depuis l'activité).
  honneur: { name: string; matricule?: string; reason?: string }[];
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

function money(n: number): string {
  return "\\$" + Math.round(n).toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, "\\,");
}

// ---- Conversion « texte rédigé à la main » -> LaTeX (sûr) ----
export function richToLatex(input: string): string {
  const src = (input ?? "").replace(/\r\n/g, "\n").trim();
  if (!src) return "";
  const inline = (t: string) => tex(t).replace(/\*\*([^*]+)\*\*/g, (_m, g) => `\\textbf{${tex(g)}}`);
  const out: string[] = [];
  for (const block of src.split(/\n{2,}/)) {
    const lines = block.split("\n");
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      out.push("\\begin{itemize}");
      for (const l of lines) out.push("  \\item " + inline(l.replace(/^\s*[-*]\s+/, "")));
      out.push("\\end{itemize}");
    } else {
      out.push("\\justifying " + inline(block.replace(/\n/g, " ")) + "\\par");
    }
  }
  return out.join("\n\n");
}

function manual(title: string | null, body?: string): string {
  const t = richToLatex(body ?? "");
  if (!t) return "";
  return (title ? `\\sstitre{${tex(title)}}\n` : "") + t + "\n";
}

function crimeTable(rows: { name: string; count: number }[]): string {
  if (!rows.length) return "\\rlead{Aucune infraction relevée sur la période.}";
  const body = rows.map((r, i) => `${i % 2 ? "\\altrow " : ""}\\tkey{${tex(r.name)}} & ${r.count} \\\\`).join("\n");
  return [
    "\\vspace{3pt}",
    "\\noindent\\begin{longtable}{@{}P{0.82\\linewidth} C{0.14\\linewidth}@{}}",
    "\\headrow \\thead{Infraction} & \\thead{Nb} \\\\",
    body,
    "\\end{longtable}",
  ].join("\n");
}

function gradeTable(rows: { grade: string; count: number }[], total: number): string {
  if (!rows.length) return "\\rlead{Effectif indisponible.}";
  const body = rows.map((r, i) => `${i % 2 ? "\\altrow " : ""}\\tkey{${tex(r.grade)}} & ${r.count} \\\\`).join("\n");
  return [
    "\\vspace{3pt}",
    "\\noindent\\begin{longtable}{@{}P{0.82\\linewidth} C{0.14\\linewidth}@{}}",
    "\\headrow \\thead{Grade} & \\thead{Effectif} \\\\",
    body,
    `\\headrow \\thead{Total} & \\thead{${total}} \\\\`,
    "\\end{longtable}",
  ].join("\n");
}

function opsList(rows: { name: string; date: string }[]): string {
  if (!rows.length) return "\\rlead{Aucune opération enregistrée sur la période.}";
  return (
    "\\begin{itemize}\n" +
    rows.map((r) => `  \\item \\stress{${tex(r.name)}}${r.date ? ` \\textemdash{} ${tex(r.date)}` : ""}`).join("\n") +
    "\n\\end{itemize}"
  );
}

function honneurList(rows: ReportPayload["honneur"]): string {
  if (!rows.length) return "\\rlead{À compléter par l'état-major.}";
  return (
    "\\begin{itemize}\n" +
    rows
      .map(
        (r) =>
          `  \\item \\stress{${tex(r.name)}}` +
          (r.matricule ? ` {\\lspdsans\\color{lspdgrey}(${tex(r.matricule)})}` : "") +
          (r.reason ? ` \\textemdash{} ${tex(r.reason)}` : ""),
      )
      .join("\n") +
    "\n\\end{itemize}"
  );
}

// Barres groupées : arrestations + contraventions par jour.
function dayChart(data: ReportPayload["chart"]): string {
  const pts = (data ?? []).filter((d) => d && typeof d.arrestations === "number");
  if (pts.length < 2) return "";
  const N = pts.length;
  const xticks = pts.map((_d, i) => i + 1).join(",");
  const xlabels = pts.map((d) => `{${tex(d.label)}}`).join(",");
  const arr = pts.map((d, i) => `(${i + 1},${Math.max(0, Math.round(d.arrestations))})`).join(" ");
  const con = pts.map((d, i) => `(${i + 1},${Math.max(0, Math.round(d.contraventions))})`).join(" ");
  return [
    "\\sstitre{Activité judiciaire par jour}",
    "\\begin{center}\\begin{tikzpicture}",
    `\\begin{axis}[lspdgroup, xtick={${xticks}}, xticklabels={${xlabels}}, xmin=0.4, xmax=${N + 0.6}]`,
    `\\addplot[fill=lspdblue, draw=lspdnavy, line width=.3pt] coordinates {${arr}};`,
    `\\addplot[fill=lspdgold, draw=lspdgold!60!black, line width=.3pt] coordinates {${con}};`,
    "\\legend{Arrestations, Contraventions}",
    "\\end{axis}\\end{tikzpicture}\\end{center}",
  ].join("\n");
}

// Barres horizontales : répartition (biggest en haut).
function hbarChart(title: string, data: { name: string; count: number }[], max = 8): string {
  const rows = [...(data ?? [])].filter((r) => r && typeof r.count === "number").slice(0, max).reverse();
  if (rows.length < 2) return "";
  const N = rows.length;
  const yticks = rows.map((_r, i) => i + 1).join(",");
  const ylabels = rows.map((r) => `{${tex(r.name)}}`).join(",");
  const coords = rows.map((r, i) => `(${Math.max(0, Math.round(r.count))},${i + 1})`).join(" ");
  const height = 16 + N * 8; // mm, s'adapte au nombre de lignes
  return [
    `\\sstitre{${tex(title)}}`,
    "\\begin{center}\\begin{tikzpicture}",
    `\\begin{axis}[lspdhbar, height=${height}mm, ytick={${yticks}}, yticklabels={${ylabels}}, ymin=0.4, ymax=${N + 0.6}]`,
    `\\addplot coordinates {${coords}};`,
    "\\end{axis}\\end{tikzpicture}\\end{center}",
  ].join("\n");
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

  // 2. Synthèse (avertissement de périmètre + KPI + graphique)
  parts.push("\\rsection{Synthèse de la semaine}");
  if (p.meta.dataNote?.trim()) {
    parts.push("\\begin{note}[Périmètre des données]", `\\justifying ${tex(p.meta.dataNote.trim())}`, "\\end{note}", "");
  }
  parts.push(
    "\\begin{kpigrid}",
    `\\kpi{${k.arrestations}}{Arrestations}`,
    `\\kpi{${k.contraventions}}{Contraventions}`,
    `\\kpi{${money(k.amendesMontant)}}{Amendes émises}`,
    `\\kpi{${tex(k.heuresService)}}{Heures de service\\mdtmark}`,
    `\\kpi{${k.patrouilles}}{Patrouilles\\mdtmark}`,
    `\\kpi{${k.operations}}{Opérations\\mdtmark}`,
    `\\kpi{${k.appels911}}{Appels 911\\mdtmark}`,
    `\\kpi{${k.sanctions}}{Sanctions\\mdtmark}`,
    "\\end{kpigrid}",
    dayChart(p.chart ?? []),
    "\\mdtlegend",
    "",
  );

  // 3. Criminalité & activité judiciaire (sans mandats ; amendes = émises)
  parts.push(
    "\\rsection{Criminalité \\& activité judiciaire}",
    `\\statline{Dossiers d'arrestation}{${p.crime.dossiers}}`,
    `\\statline{Rapports d'arrestation}{${p.crime.rapports}}`,
    `\\statline{Avis de recherche émis\\mdtmark}{${p.crime.bolos}}`,
    `\\statline{Amendes émises}{${p.crime.amendesCount}}`,
    hbarChart("Infractions les plus relevées", p.crime.topInfractions) ||
      ["\\sstitre{Infractions les plus relevées}", crimeTable(p.crime.topInfractions)].join("\n"),
    manual("Analyse de l'état-major", p.sections.analyseCrime),
    "",
  );

  // 4. Activité opérationnelle
  parts.push(
    "\\rsection{Activité opérationnelle}",
    `\\statline{Patrouilles engagées\\mdtmark}{${p.ops.patrouilles}}`,
    `\\statline{Appels 911 traités\\mdtmark}{${p.ops.appels911}}`,
    `\\statline{Saisies enregistrées}{${p.ops.saisies}}`,
    "\\sstitre{Opérations de la semaine}",
    opsList(p.ops.operations),
    manual("Opérations notables", p.sections.operationsNotables),
    "",
  );

  // 5. Ressources humaines (effectif par grade uniquement)
  parts.push(
    "\\rsection{Ressources humaines}",
    hbarChart("Effectif par grade", p.rh.parGrade.map((g) => ({ name: g.grade, count: g.count })), 12),
    "\\sstitre{Détail de l'effectif}",
    gradeTable(p.rh.parGrade, p.rh.effectifTotal),
    manual("Point ressources humaines", p.sections.pointRH),
    "",
  );

  // 6. Agents à l'honneur (liste manuelle)
  parts.push("\\rsection{Agents à l'honneur}", honneurList(p.honneur), "");

  // 7. Objectifs & message au gouvernement (optionnel)
  const obj = richToLatex(p.sections.objectifs ?? "");
  if (obj) parts.push("\\rsection{Objectifs \\& message au Gouvernement}", obj, "");

  // Signature
  parts.push(
    "\\vspace{16pt}",
    "\\noindent\\begin{tikzpicture}\\fill[lspdrule] (0,0) rectangle (\\linewidth,.4pt);\\end{tikzpicture}",
    "\\vspace{6pt}",
    `\\noindent{\\lspdsans\\fontsize{8.4}{11}\\selectfont\\color{lspdgrey}${tex(p.meta.generatedLabel)}}\\hfill`,
    "\\begin{minipage}[t]{0.5\\linewidth}\\raggedleft",
    `\\blocSignature{\\signatureChief}{${tex(p.meta.chiefName ?? "Andres Acosta")}}{${tex(p.meta.chiefRole ?? "Capitaine · Los Santos Police Department")}}{}`,
    "\\end{minipage}",
    "\\end{document}",
    "",
  );

  return parts.join("\n");
}
