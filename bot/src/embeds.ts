import { EmbedBuilder } from "discord.js";
import { baseEmbed, BRAND, sparkline, ago, fmtDuration, badge } from "./theme.js";
import type { OnDutyAgent, DayStats, Overview } from "./convex.js";

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

  // Courbe horaire : on affiche la plage active pour éviter une ligne de zéros.
  const active = s.hourly.map((v, h) => ({ v, h })).filter((x) => x.v > 0);
  if (active.length > 0) {
    const from = active[0].h;
    const to = active[active.length - 1].h;
    const slice = s.hourly.slice(from, to + 1);
    e.addFields({
      name: "📈 Présence par heure",
      value: `\`${String(from).padStart(2, "0")}h\` ${sparkline(slice)} \`${String(to).padStart(2, "0")}h\``,
    });
  }

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
