import { Client, GatewayIntentBits, Partials, Events } from "discord.js";
import { createServer } from "node:http";
import { env } from "./env.js";
import { registerCommands, handleCommand } from "./commands.js";
import { startTasks } from "./tasks.js";
import { handleRollcallButton } from "./rollcall.js";
import { handleTicketInteraction, templateAutocomplete, handleDirectMessage, handleTicketChannelMessage } from "./tickets.js";

// La candidature se fait par MP (le candidat écrit au bot) et les recruteurs
// répondent avec !r / !a dans le ticket : il faut donc lire le contenu des
// messages (intent privilégié « Message Content », à activer dans le portail
// développeur Discord) et recevoir les MP (Partials.Channel pour les salons DM).
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    // Requiert « Server Members Intent » activé dans le portail développeur :
    // sert à énumérer les membres du rôle LSPD pour relancer les non-votants.
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`[bot] connecté en tant que ${c.user.tag}`);
  try {
    await registerCommands();
  } catch (err) {
    console.error("[bot] enregistrement des commandes impossible :", err);
  }
  startTasks(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) { await templateAutocomplete(interaction); return; }
  if (interaction.isChatInputCommand()) { await handleCommand(interaction); return; }
  if (interaction.isButton() && interaction.customId.startsWith("rc|")) { await handleRollcallButton(interaction); return; }
  // Toutes les interactions du système de tickets (boutons, menus, modals).
  const cid = "customId" in interaction ? (interaction.customId as string) : "";
  if (cid.startsWith("tk|")) await handleTicketInteraction(interaction);
});

// Messages : MP des candidats (candidature + retranscription) et !r / !a des
// recruteurs dans les tickets.
client.on(Events.MessageCreate, async (msg) => {
  try {
    if (msg.author.bot) return;
    if (!msg.guild) { await handleDirectMessage(msg); return; }
    if (msg.content.startsWith("!")) await handleTicketChannelMessage(msg);
  } catch (err) {
    console.error("[message] erreur :", err);
  }
});

client.on(Events.Error, (err) => console.error("[bot] erreur client :", err));

// Petit serveur HTTP : Railway attend qu'un service écoute un port pour le
// considérer sain. Le bot n'a pas d'API, ce point ne sert qu'au healthcheck.
const port = Number(process.env.PORT ?? 8080);
createServer((_req, res) => { res.writeHead(200); res.end("Station 13 bot OK"); }).listen(port, () => {
  console.log(`[health] écoute sur le port ${port}`);
});

void client.login(env.discordToken);

// Arrêt propre : Railway envoie SIGTERM au redéploiement.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => { console.log(`[bot] arrêt (${sig})`); client.destroy(); process.exit(0); });
}
