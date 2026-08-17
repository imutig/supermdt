import {
  REST, Routes, SlashCommandBuilder, PermissionFlagsBits,
  type ChatInputCommandInteraction, type Client,
} from "discord.js";
import { env } from "./env.js";
import { mdt } from "./convex.js";
import {
  vehicleEmbed, vehicleNotFoundEmbed, casierEmbed, citizenEmbed, citizenNotFoundEmbed, absenceEmbed, absentsListEmbed, errorEmbed,
} from "./embeds.js";
import { openHub, sendTemplate, renderTemplatesCmd, startTemplateBuilder, integrer, validation, parisWallToEpoch } from "./tickets.js";
import { LSPD_ROLE } from "./rollcall.js";

// Définition des commandes slash. Chaque réponse est un embed élaboré.
export const commands = [
  new SlashCommandBuilder()
    .setName("plaque")
    .setDescription("Informations d'un véhicule enregistré")
    .addStringOption((o) => o.setName("plaque").setDescription("Plaque d'immatriculation").setRequired(true)),
  new SlashCommandBuilder()
    .setName("casier")
    .setDescription("Extrait de casier d'un citoyen")
    .addStringOption((o) => o.setName("citoyen").setDescription("Prénom et nom du citoyen").setRequired(true)),
  new SlashCommandBuilder()
    .setName("citoyen")
    .setDescription("Fiche d'un citoyen enregistré")
    .addStringOption((o) => o.setName("nom").setDescription("Prénom et nom du citoyen").setRequired(true)),
  new SlashCommandBuilder()
    .setName("absence")
    .setDescription("Déclarer une absence (la tienne, ou celle d'un agent)")
    .addStringOption((o) => o.setName("du").setDescription("Date de début (JJ/MM/AAAA)").setRequired(true))
    .addStringOption((o) => o.setName("au").setDescription("Date de fin (JJ/MM/AAAA)").setRequired(true))
    .addStringOption((o) => o.setName("motif").setDescription("Motif de l'absence").setRequired(false))
    .addStringOption((o) => o.setName("agent").setDescription("Pour un autre agent (prénom et nom RP)").setRequired(false)),
  new SlashCommandBuilder().setName("absents").setDescription("Voir les agents actuellement absents"),
  // Système de candidatures : hub central. Visible de tous (pour que le rôle
  // habilité y accède même sans « Gérer le serveur ») mais l'accès réel est
  // filtré dans openHub (administrateur OU rôle CANDIDATURES_ADMIN_ROLE).
  new SlashCommandBuilder().setName("candidatures").setDescription("Configurer le système de candidatures de l'académie"),
  new SlashCommandBuilder().setName("template").setDescription("Templates de message des tickets")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) => s.setName("send").setDescription("Envoyer un template dans ce ticket")
      .addStringOption((o) => o.setName("nom").setDescription("Nom du template").setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName("create").setDescription("Créer un template (avec aperçu)"))
    .addSubcommand((s) => s.setName("list").setDescription("Lister les templates")),
  new SlashCommandBuilder().setName("integrer").setDescription("Intégrer le candidat de ce ticket à la Police Academy")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName("statut").setDescription("Changer le statut de la candidature de ce ticket")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName("validation").setDescription("Valider le candidat de ce ticket : lui attribuer le rôle Cadet")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
].map((c) => c.toJSON());

// « JJ/MM/AAAA » -> {y,mo,d} validé, ou null.
function dateParts(s: string): { y: number; mo: number; d: number } | null {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [, d, mo, y] = m.map(Number);
  const dt = new Date(y, mo - 1, d);
  return dt.getMonth() === mo - 1 && dt.getDate() === d ? { y, mo, d } : null;
}
// Bornes de la journée saisie, en heure de Paris (début 00:00, fin 23:59:59.999).
function parisDayStart(s: string): number | null { const p = dateParts(s); return p ? parisWallToEpoch(p.y, p.mo, p.d, 0, 0) : null; }
function parisDayEnd(s: string): number | null { const p = dateParts(s); return p ? parisWallToEpoch(p.y, p.mo, p.d, 23, 59) : null; }

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
    // Contrôle d'accès configuré sur le site (grade minimum et/ou rôles Discord).
    // Ouvert par défaut ; refus explicite sinon (les gardes internes des tickets
    // restent en plus). Si le MDT est injoignable, on échoue OUVERT pour les
    // commandes anodines mais FERMÉ pour les commandes sensibles (PII / création).
    const SENSITIVE = new Set(["plaque", "casier", "citoyen", "absence"]);
    const roleIds = interaction.inCachedGuild() ? [...interaction.member.roles.cache.keys()] : [];
    const isLspd = roleIds.includes(LSPD_ROLE);
    const allowed = await mdt.commandAllowed(interaction.commandName, interaction.user.id, roleIds, isLspd)
      // MDT injoignable : on retombe sur le rôle LSPD pour les commandes sensibles.
      .catch(() => !SENSITIVE.has(interaction.commandName) || isLspd);
    if (!allowed) {
      await interaction.reply({ content: "⛔ Tu n'as pas la permission d'utiliser cette commande.", flags: 64 });
      return;
    }
    if (interaction.commandName === "candidatures") { await openHub(interaction); return; }
    if (interaction.commandName === "template") {
      const sub = interaction.options.getSubcommand();
      if (sub === "send") await sendTemplate(interaction);
      else if (sub === "create") await startTemplateBuilder(interaction);
      else await renderTemplatesCmd(interaction);
      return;
    }
    if (interaction.commandName === "integrer" || interaction.commandName === "statut") { await integrer(interaction); return; }
    if (interaction.commandName === "validation") { await validation(interaction); return; }
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
    if (interaction.commandName === "citoyen") {
      await interaction.deferReply();
      const q = interaction.options.getString("nom", true);
      const cit = await mdt.citizenByName(q);
      await interaction.editReply({ embeds: [cit ? citizenEmbed(cit) : citizenNotFoundEmbed(q)] });
      return;
    }
    if (interaction.commandName === "absence") {
      await interaction.deferReply({ flags: 64 });
      const q = interaction.options.getString("agent") ?? undefined; // absent -> soi-même
      const from = parisDayStart(interaction.options.getString("du", true));
      const to = parisDayEnd(interaction.options.getString("au", true));
      const reason = interaction.options.getString("motif") ?? "Absence";
      if (from === null || to === null) {
        await interaction.editReply({ embeds: [errorEmbed("Dates invalides. Format attendu : JJ/MM/AAAA.")] });
        return;
      }
      const member = interaction.member;
      const who = (member && "displayName" in member ? member.displayName : null) ?? interaction.user.username;
      const res = await mdt.requestAbsence(interaction.user.id, q, from, to, reason, who);
      if (!res.ok) {
        const msg = res.reason === "dates" ? "La date de fin précède la date de début."
          : res.reason === "tropcourt" ? "Une absence doit durer au moins **3 jours** (jours de début et de fin inclus). Pour une absence plus courte, mets-toi simplement absent au roll call."
          : res.reason === "noncompte" ? "Ton compte Discord n'est relié à aucun agent du MDT. Précise l'option `agent`, ou fais-toi envoyer un compte."
          : `Aucun agent actif ne correspond à « ${q} ».`;
        await interaction.editReply({ embeds: [errorEmbed(msg)] });
        return;
      }
      await interaction.editReply({ embeds: [absenceEmbed(res.name ?? "", from, to, reason)] });
      return;
    }
    if (interaction.commandName === "absents") {
      await interaction.deferReply();
      await interaction.editReply({ embeds: [absentsListEmbed(await mdt.absencesCurrent())] });
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
