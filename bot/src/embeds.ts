import { EmbedBuilder } from "discord.js";
import { baseEmbed, BRAND, ago, fmtDuration, badge } from "./theme.js";
import { dailyPresenceChart, weeklyHoursChart } from "./charts.js";
import type { OnDutyAgent, DayStats, Overview, WeeklyHours, VehicleInfo, CasierInfo, CitizenInfo } from "./convex.js";

// Embed de présence : agents actuellement en service, groupés et signés.
export function presenceEmbed(agents: OnDutyAgent[]): EmbedBuilder {
  const e = baseEmbed(agents.length > 0 ? BRAND.green : BRAND.muted)
    .setTitle("🟢 Agents en service")
    .setDescription(
      agents.length === 0
        ? "*Aucun agent en service actuellement.*"
        : `**${agents.length}** agent${agents.length > 1 ? "s" : ""} en service.`,
    );

  if (agents.length > 0) {
    const lines = agents.map((a) => {
      const badgeStr = badge(a.matricule);
      const cs = a.callsign ? ` · \`${a.callsign}\`` : "";
      return `**${a.name}** ${badgeStr ? `\`${badgeStr}\`` : ""}\n╰ ${a.grade}${cs} · depuis ${ago(a.since)}`;
    });
    // Discord limite un field à 1024 caractères : on découpe si nécessaire.
    const chunks: string[] = [];
    let cur = "";
    for (const l of lines) {
      if ((cur + l + "\n\n").length > 1000) { chunks.push(cur); cur = ""; }
      cur += l + "\n\n";
    }
    if (cur) chunks.push(cur);
    chunks.forEach((c, i) => e.addFields({ name: i === 0 ? "Effectif présent" : "​", value: c.trim() }));
  }
  return e;
}

// Récapitulatif de la journée : chiffres clés + courbe de présence horaire.
export function dailyEmbed(s: DayStats): EmbedBuilder {
  const dateStr = new Date(s.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
  const e = baseEmbed(BRAND.green)
    .setTitle("📊 Récapitulatif de la journée")
    .setDescription(`Bilan du **${dateStr}**.`)
    .addFields(
      { name: "⏱️ Temps de service cumulé", value: `**${fmtDuration(s.workedMinutes)}**`, inline: true },
      { name: "👥 Agents actifs", value: `**${s.distinctAgents}**`, inline: true },
      { name: "🟢 En service maintenant", value: `**${s.onDutyNow}**`, inline: true },
      { name: "🚓 Patrouilles", value: `**${s.patrolsToday}**`, inline: true },
      { name: "📁 Casier", value: `**${s.casier}**`, inline: true },
      { name: "🎫 Contraventions", value: `**${s.citations}**`, inline: true },
    );

  // Courbe de présence en image (QuickChart) sous les statistiques.
  if (s.hourly.some((v) => v > 0)) e.setImage(dailyPresenceChart(s.hourly));

  if (s.top.length > 0) {
    const medals = ["🥇", "🥈", "🥉", "▪️", "▪️"];
    e.addFields({
      name: "🏅 Présence du jour",
      value: s.top.map((t, i) => `${medals[i] ?? "▪️"} **${t.name}** - ${fmtDuration(t.minutes)}`).join("\n"),
    });
  }
  return e;
}

// État des lieux express.
export function overviewEmbed(o: Overview): EmbedBuilder {
  return baseEmbed(BRAND.info)
    .setTitle("📋 État de la station")
    .addFields(
      { name: "🟢 En service", value: `**${o.onDuty}** / ${o.totalAgents}`, inline: true },
      { name: "🚓 Patrouilles ouvertes", value: `**${o.openPatrols}**`, inline: true },
    );
}

// Heures de service d'un agent sur la semaine, avec un graphique en barres.
export function weeklyHoursEmbed(h: WeeklyHours, query: string): EmbedBuilder {
  if (!h.found) {
    return baseEmbed(BRAND.warning)
      .setTitle("Agent introuvable")
      .setDescription(`Aucun agent actif ne correspond à **${query}**. Vérifiez l'orthographe du prénom et du nom RP.`);
  }
  const total = fmtDuration(h.totalMinutes);
  const badgeStr = badge(h.matricule);
  const e = baseEmbed(BRAND.green)
    .setTitle(`⏱️ Heures de ${h.name}`)
    .setDescription(`${h.grade}${badgeStr ? ` · \`${badgeStr}\`` : ""}
**${total}** de service cette semaine.`)
    .setImage(weeklyHoursChart(h.perDay));

  const days = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const detail = h.perDay
    .map((m, i) => (m > 0 ? `**${days[i]}** ${fmtDuration(m)}` : null))
    .filter(Boolean)
    .join(" · ");
  if (detail) e.addFields({ name: "Détail", value: detail });
  return e;
}

function money(n: number): string { return `$${n.toLocaleString("fr-FR")}`; }
function jail(seconds: number): string {
  if (!seconds) return "Aucune";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [h ? `${h}h` : "", m ? `${m}min` : ""].filter(Boolean).join(" ") || `${seconds}s`;
}
function date(ts: number): string { return new Date(ts).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }); }

// Fiche d'un véhicule civil enregistré.
export function vehicleEmbed(v: VehicleInfo): EmbedBuilder {
  const e = baseEmbed(v.flags.length ? BRAND.danger : BRAND.info)
    .setTitle(`🚗 ${v.plaque}`)
    .addFields(
      { name: "Modèle", value: v.modele || "-", inline: true },
      { name: "Couleur", value: v.couleur || "-", inline: true },
      { name: "Type", value: v.type || "-", inline: true },
      { name: "Propriétaire", value: v.owner ?? "*inconnu*", inline: false },
    );
  if (v.flags.length) e.addFields({ name: "⚠️ Signalements", value: v.flags.map((f) => `• ${f}`).join("\n") });
  if (v.notes) e.addFields({ name: "Notes", value: v.notes.slice(0, 1000) });
  return e;
}

export function vehicleNotFoundEmbed(plaque: string): EmbedBuilder {
  return baseEmbed(BRAND.warning).setTitle("Véhicule introuvable").setDescription(`Aucun véhicule enregistré avec la plaque **${plaque}**.`);
}

// Extrait de casier judiciaire, présenté comme un document.
export function casierEmbed(c: CasierInfo, query: string): EmbedBuilder {
  if (!c.found) {
    return baseEmbed(BRAND.warning).setTitle("Citoyen introuvable").setDescription(`Aucun dossier ne correspond à **${query}**.`);
  }
  const identite = [
    c.dateNaissance ? `Né(e) le ${c.dateNaissance}` : null,
    c.sexe ? (c.sexe === "H" ? "Homme" : c.sexe === "F" ? "Femme" : c.sexe) : null,
    c.nationalite,
  ].filter(Boolean).join(" · ");

  const e = baseEmbed(c.count > 0 ? BRAND.danger : BRAND.green)
    .setTitle(`📁 Extrait de casier - ${c.name}`)
    .setDescription(identite || "*Identité non renseignée.*")
    .addFields(
      { name: "Antécédents", value: `**${c.count}**`, inline: true },
      { name: "Total amendes", value: `**${money(c.totalFine)}**`, inline: true },
      { name: "Total peine", value: `**${jail(c.totalJailSeconds)}**`, inline: true },
    );

  if (c.count === 0) {
    e.addFields({ name: "​", value: "✅ *Aucun antécédent judiciaire enregistré.*" });
  } else {
    // Une ligne par entrée, tronquée à la limite d'un field Discord.
    let body = "";
    for (const r of c.rows) {
      const line = `\`${date(r.at)}\` **${r.type}** - ${r.charges}
╰ ${money(r.fine)} · ${jail(r.jailSeconds)}
`;
      if ((body + line).length > 1000) break;
      body += line;
    }
    e.addFields({ name: "Détail des antécédents", value: body.trim() });
    if (c.count > c.rows.length) e.setFooter({ text: `LSPD · Station 13 · ${c.count - c.rows.length} entrée(s) supplémentaire(s) non affichée(s)` });
  }
  return e;
}

// Fiche synthétique d'un citoyen (identité + compteurs + signalements).
export function citizenEmbed(c: CitizenInfo): EmbedBuilder {
  const identite = [
    c.dateNaissance ? `Né(e) le ${c.dateNaissance}` : null,
    c.sexe ? (c.sexe === "H" ? "Homme" : c.sexe === "F" ? "Femme" : c.sexe) : null,
    c.nationalite,
    c.telephone ? `☎️ ${c.telephone}` : null,
  ].filter(Boolean).join(" · ");

  // Couleur d'alerte si recherché, avis de recherche, ou décédé.
  const alert = c.wanted || !!c.bolo;
  const e = baseEmbed(alert ? BRAND.danger : c.deceased ? BRAND.muted : BRAND.info)
    .setTitle(`👤 ${c.prenom} ${c.nom}`)
    .setDescription(identite || "*Identité non renseignée.*");

  const badges: string[] = [];
  if (c.wanted) badges.push("🔴 **RECHERCHÉ**");
  if (c.deceased) badges.push("🕯️ **DÉCÉDÉ(E)**");
  if (badges.length) e.addFields({ name: "​", value: badges.join(" · ") });

  e.addFields(
    { name: "📁 Casiers", value: `**${c.casierCount}**`, inline: true },
    { name: "🎫 Contraventions", value: `**${c.citationCount}**`, inline: true },
    { name: "🚗 Véhicules", value: `**${c.vehicleCount}**`, inline: true },
  );

  if (c.bolo) {
    e.addFields({ name: `📌 Avis de recherche${c.bolo.danger ? " ⚠️" : ""}`, value: c.bolo.title.slice(0, 1000) });
  }
  return e;
}

export function citizenNotFoundEmbed(query: string): EmbedBuilder {
  return baseEmbed(BRAND.warning).setTitle("Citoyen introuvable").setDescription(`Aucun citoyen ne correspond à **${query}**.`);
}

// Confirmation d'une demande d'absence.
export function absenceEmbed(name: string, from: number, to: number, reason: string): EmbedBuilder {
  return baseEmbed(BRAND.green)
    .setTitle("🗓️ Absence enregistrée")
    .setDescription(`L'absence de **${name}** est enregistrée. L'agent ne sera pas relancé au roll call sur cette période.`)
    .addFields(
      { name: "Période", value: `du **${date(from)}** au **${date(to)}**`, inline: false },
      { name: "Motif", value: reason },
    );
}

// Embed publié dans le salon des absences à chaque nouvelle absence approuvée.
export function absencePublishEmbed(a: { name: string; matricule: number | null; discordId: string | null; from: number; to: number; reason: string }): EmbedBuilder {
  const mat = a.matricule != null ? `\`${String(a.matricule).padStart(5, "0")}\` ` : "";
  return baseEmbed(BRAND.warning)
    .setTitle("🗓️ Absence")
    .setDescription(`${mat}**${a.name}**${a.discordId ? ` (<@${a.discordId}>)` : ""} est absent(e).`)
    .addFields(
      { name: "Du", value: `<t:${Math.floor(a.from / 1000)}:D>`, inline: true },
      { name: "Au", value: `<t:${Math.floor(a.to / 1000)}:D>`, inline: true },
      { name: "Motif", value: a.reason || "-" },
    );
}

export function absentsListEmbed(rows: { name: string; matricule: number | null; until: number; reason: string }[]): EmbedBuilder {
  if (rows.length === 0) {
    return baseEmbed(BRAND.green).setTitle("🗓️ Absents").setDescription("Aucun agent absent actuellement.");
  }
  const mat = (m: number | null) => (m != null ? `\`${String(m).padStart(5, "0")}\` ` : "");
  const lines = rows.map((r) => `• ${mat(r.matricule)}**${r.name}** — jusqu'au ${date(r.until)}${r.reason ? ` · ${r.reason}` : ""}`);
  return baseEmbed(BRAND.warning)
    .setTitle(`🗓️ Absents - ${rows.length}`)
    .setDescription(lines.join("\n").slice(0, 4000));
}

export function errorEmbed(message: string): EmbedBuilder {
  return baseEmbed(BRAND.warning).setTitle("Impossible").setDescription(message);
}

// Signature Internal Affairs commune aux sanctions et convocations.
const IA_FOOTER = "Internal Affairs Division · Station 13 · Los Santos Police Department";
const mat5 = (m: number | null) => (m != null ? String(m).padStart(5, "0") : null);
const issuer = (name: string | null, matricule: number | null) => {
  const m = mat5(matricule);
  return name ? (m ? `${m} | ${name}` : name) : "État-Major";
};
// Mention de l'agent concerné : ping Discord si lié, sinon matricule + nom.
const concerned = (name: string | null, matricule: number | null, discordId: string | null) => {
  if (discordId) return `<@${discordId}>${matricule ? ` \`${mat5(matricule)}\`` : ""}`;
  const m = mat5(matricule);
  return `${m ? `\`${m}\` | ` : ""}**${name ?? "Agent"}**`;
};

// Embed de sanction disciplinaire (format IA officiel, cf. maquette serveur).
export function sanctionEmbed(s: import("./convex.js").SanctionAnnounce): EmbedBuilder {
  const ref = s.reference != null ? `SANC-${String(s.reference).padStart(4, "0")}` : null;
  let sanctionLine = `**${s.sanction}**`;
  if (s.suspends) {
    sanctionLine += s.suspendedUntil
      ? ` — mise à pied jusqu'au ${new Date(s.suspendedUntil).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}`
      : " — mise à pied jusqu'à nouvel ordre";
  }
  const body = [
    `__Effectif concerné :__ ${concerned(s.agentName, s.agentMatricule, s.agentDiscordId)}`,
    `__Date d'émission de la sanction :__ **${date(s.at)}**`,
    `__Motif de sanction :__ **${s.motif}**`,
    `__Sanction appliquée :__ ${sanctionLine}`,
    "",
    "*Que cette sanction serve d'exemple. Le respect est mutuel, quel que soit le grade ; tout manquement à la discipline sera sévèrement puni.*",
  ].join("\n");
  const e = baseEmbed(BRAND.danger)
    .setAuthor({ name: issuer(s.byName, s.byMatricule) })
    .setTitle("SANCTION DISCIPLINAIRE À EFFET IMMÉDIAT")
    .setDescription(body)
    .setFooter({ text: ref ? `${IA_FOOTER} · ${ref}` : IA_FOOTER });
  return e;
}

// Embed de convocation devant l'Internal Affairs Division.
export function convocationEmbed(c: import("./convex.js").ConvocationAnnounce): EmbedBuilder {
  const ref = c.reference != null ? `CONV-${String(c.reference).padStart(4, "0")}` : null;
  const lines = [
    `__Effectif convoqué :__ ${concerned(c.agentName, c.agentMatricule, c.pingDiscordId)}`,
  ];
  if (c.convokedAt) lines.push(`__Date de convocation :__ **${new Date(c.convokedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}**`);
  if (c.lieu) lines.push(`__Lieu :__ **${c.lieu}**`);
  lines.push(`__Motif de la convocation :__ **${c.motif}**`);
  lines.push("");
  lines.push("*Vous êtes prié(e) de vous présenter à la date indiquée. Toute absence non justifiée pourra faire l'objet de poursuites disciplinaires.*");
  return baseEmbed(BRAND.warning)
    .setAuthor({ name: issuer(c.byName, c.byMatricule) })
    .setTitle("CONVOCATION — INTERNAL AFFAIRS DIVISION")
    .setDescription(lines.join("\n"))
    .setFooter({ text: ref ? `${IA_FOOTER} · ${ref}` : IA_FOOTER });
}
