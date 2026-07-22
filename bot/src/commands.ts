import {
  REST, Routes, SlashCommandBuilder,
  type ChatInputCommandInteraction, type Client,
} from "discord.js";
import { env } from "./env.js";
import { mdt } from "./convex.js";
import { presenceEmbed, dailyEmbed, overviewEmbed, weeklyHoursEmbed } from "./embeds.js";

// Définition des commandes slash. Chaque réponse est un embed élaboré.
export const commands = [
  new SlashCommandBuilder().setName("enservice").setDescription("Voir les agents actuellement en service"),
  new SlashCommandBuilder().setName("effectif").setDescription("État de la station en un coup d'œil"),
  new SlashCommandBuilder().setName("recap").setDescription("Récapitulatif de la journée en cours"),
  new SlashCommandBuilder()
    .setName("heures")
    .setDescription("Heures de service d'un agent sur la semaine")
    .addStringOption((o) => o.setName("agent").setDescription("Prénom et nom RP de l'agent").setRequired(true)),
].map((c) => c.toJSON());

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
  } catch (err) {
    console.error("[command] erreur :", err);
    const msg = { content: "Le MDT est momentanément injoignable. Réessayez dans un instant.", flags: 64 as const };
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content: msg.content });
    else await interaction.reply(msg);
  }
}

// Rappel de type pour le point d'entrée.
export type BotClient = Client;
