import {
  REST, Routes, SlashCommandBuilder,
  type ChatInputCommandInteraction, type Client,
} from "discord.js";
import { env } from "./env.js";
import { mdt } from "./convex.js";
import {
  presenceEmbed, dailyEmbed, overviewEmbed, weeklyHoursEmbed,
  vehicleEmbed, vehicleNotFoundEmbed, casierEmbed, absenceEmbed, errorEmbed,
} from "./embeds.js";

// Définition des commandes slash. Chaque réponse est un embed élaboré.
export const commands = [
  new SlashCommandBuilder().setName("enservice").setDescription("Voir les agents actuellement en service"),
  new SlashCommandBuilder().setName("effectif").setDescription("État de la station en un coup d'œil"),
  new SlashCommandBuilder().setName("recap").setDescription("Récapitulatif de la journée en cours"),
  new SlashCommandBuilder()
    .setName("heures")
    .setDescription("Heures de service d'un agent sur la semaine")
    .addStringOption((o) => o.setName("agent").setDescription("Prénom et nom RP de l'agent").setRequired(true)),
  new SlashCommandBuilder()
    .setName("plaque")
    .setDescription("Informations d'un véhicule enregistré")
    .addStringOption((o) => o.setName("plaque").setDescription("Plaque d'immatriculation").setRequired(true)),
  new SlashCommandBuilder()
    .setName("casier")
    .setDescription("Extrait de casier d'un citoyen")
    .addStringOption((o) => o.setName("citoyen").setDescription("Prénom et nom du citoyen").setRequired(true)),
  new SlashCommandBuilder()
    .setName("absence")
    .setDescription("Poser une demande d'absence")
    .addStringOption((o) => o.setName("agent").setDescription("Prénom et nom RP de l'agent").setRequired(true))
    .addStringOption((o) => o.setName("du").setDescription("Date de début (JJ/MM/AAAA)").setRequired(true))
    .addStringOption((o) => o.setName("au").setDescription("Date de fin (JJ/MM/AAAA)").setRequired(true))
    .addStringOption((o) => o.setName("motif").setDescription("Motif de l'absence").setRequired(true)),
].map((c) => c.toJSON());

// « JJ/MM/AAAA » -> timestamp (minuit), ou null si invalide.
function parseDate(s: string): number | null {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [, d, mo, y] = m.map(Number);
  const dt = new Date(y, mo - 1, d);
  return dt.getMonth() === mo - 1 && dt.getDate() === d ? dt.getTime() : null;
}

// Enregistrement au niveau du serveur : mise à jour instantanée, contrairement
// aux commandes globales qui mettent jusqu'à une heure à se propager.
export async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(env.discordToken);
  try {
    const res = await rest.put(
      Routes.applicationGuildCommands(env.discordAppId, env.guildId),
      { body: commands },
    );
    const n = Array.isArray(res) ? res.length : commands.length;
    console.log(`[commands] ${n} commande(s) enregistrée(s) sur le serveur ${env.guildId}.`);
    console.log("[commands] Si elles n'apparaissent pas dans Discord, ré-invitez le bot avec le scope applications.commands (voir le README de déploiement).");
  } catch (err) {
    console.error("[commands] échec de l'enregistrement :", err);
    console.error("[commands] Vérifiez DISCORD_BOT_ID (= Application ID) et DISCORD_GUILD_ID, et que le bot est bien membre du serveur.");
  }
}

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  try {
    if (interaction.commandName === "enservice") {
      await interaction.deferReply();
      const agents = await mdt.agentsOnDuty();
      await interaction.editReply({ embeds: [presenceEmbed(agents)] });
      return;
    }
    if (interaction.commandName === "effectif") {
      await interaction.deferReply();
      await interaction.editReply({ embeds: [overviewEmbed(await mdt.overview())] });
      return;
    }
    if (interaction.commandName === "recap") {
      await interaction.deferReply();
      await interaction.editReply({ embeds: [dailyEmbed(await mdt.dayStats())] });
      return;
    }
    if (interaction.commandName === "heures") {
      await interaction.deferReply();
      const q = interaction.options.getString("agent", true);
      await interaction.editReply({ embeds: [weeklyHoursEmbed(await mdt.weeklyHours(q), q)] });
      return;
    }
    if (interaction.commandName === "plaque") {
      await interaction.deferReply();
      const plate = interaction.options.getString("plaque", true);
      const veh = await mdt.vehicleByPlate(plate);
      await interaction.editReply({ embeds: [veh ? vehicleEmbed(veh) : vehicleNotFoundEmbed(plate)] });
      return;
    }
    if (interaction.commandName === "casier") {
      await interaction.deferReply();
      const q = interaction.options.getString("citoyen", true);
      await interaction.editReply({ embeds: [casierEmbed(await mdt.casierByName(q), q)] });
      return;
    }
    if (interaction.commandName === "absence") {
      await interaction.deferReply({ flags: 64 });
      const q = interaction.options.getString("agent", true);
      const from = parseDate(interaction.options.getString("du", true));
      const to = parseDate(interaction.options.getString("au", true));
      const reason = interaction.options.getString("motif", true);
      if (from === null || to === null) {
        await interaction.editReply({ embeds: [errorEmbed("Dates invalides. Format attendu : JJ/MM/AAAA.")] });
        return;
      }
      const member = interaction.member;
      const who = (member && "displayName" in member ? member.displayName : null) ?? interaction.user.username;
      const res = await mdt.requestAbsence(q, from, to, reason, who);
      if (!res.ok) {
        await interaction.editReply({ embeds: [errorEmbed(res.reason === "dates" ? "La date de fin précède la date de début." : `Aucun agent actif ne correspond à « ${q} ».`)] });
        return;
      }
      await interaction.editReply({ embeds: [absenceEmbed(res.name ?? q, from, to, reason)] });
      return;
    }
  } catch (err) {
    console.error("[command] erreur :", err);
    const msg = { content: "Le MDT est momentanément injoignable. Réessayez dans un instant.", flags: 64 as const };
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content: msg.content });
    else await interaction.reply(msg);
  }
}

// Rappel de type pour le point d'entrée.
export type BotClient = Client;
