import { EmbedBuilder } from "discord.js";
import { baseEmbed, BRAND, ago, fmtDuration, badge } from "./theme.js";
import { dailyPresenceChart, weeklyHoursChart } from "./charts.js";
import type { OnDutyAgent, DayStats, Overview, WeeklyHours } from "./convex.js";

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
  const dateStr = new Date(s.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
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
      value: s.top.map((t, i) => `${medals[i] ?? "▪️"} **${t.name}** — ${fmtDuration(t.minutes)}`).join("\n"),
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
