import "./tz.js"; // fuseau Paris - doit s'exécuter avant tout usage de Date
import { Client, GatewayIntentBits, Partials, Events } from "discord.js";
import { createServer } from "node:http";
import { env } from "./env.js";
import { registerCommands, handleCommand } from "./commands.js";
import { startTasks } from "./tasks.js";
import { handleRollcallButton } from "./rollcall.js";
import { handleTicketInteraction, templateAutocomplete, handleDirectMessage, handleTicketChannelMessage } from "./tickets.js";
import { handleHttp } from "./pushServer.js";

// Déclencheur du tick, renseigné une fois les tâches démarrées (voir ClientReady).
// Avant ça, un push éventuel est un no-op inoffensif (le poll de sécurité rattrape).
let onPush: () => Promise<void> | void = () => {};

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
  onPush = startTasks(client);
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

// Événements gateway : visibilité sur l'état de la connexion Discord. Un shard
// qui se déconnecte/reconnecte est géré tout seul par discord.js (auto-resume) ;
// on se contente de logguer pour le diagnostic.
client.on(Events.Error, (err) => console.error("[bot] erreur client :", err));
client.on(Events.ShardError, (err, shardId) => console.error(`[bot] erreur shard #${shardId} :`, err));
client.on(Events.ShardDisconnect, (event, shardId) => console.warn(`[bot] shard #${shardId} déconnecté (code ${event.code}).`));
client.on(Events.ShardReconnecting, (shardId) => console.warn(`[bot] shard #${shardId} en reconnexion…`));
client.on(Events.ShardResume, (shardId, replayed) => console.log(`[bot] shard #${shardId} repris (${replayed} évènements rejoués).`));
// Session invalidée : révocation non récupérable (token, kick, etc.). On ne peut
// pas se reconnecter : on sort en erreur pour que Railway relance le process.
client.on(Events.Invalidated, () => {
  console.error("[bot] session invalidée (non récupérable) - redémarrage forcé.");
  process.exit(1);
});

// Getter d'état gateway partagé avec le healthcheck : prêt = client connecté et
// WebSocket en statut READY (0 dans discord.js). Un bot zombie renverra 503.
const isReady = (): boolean => client.isReady() && client.ws.status === 0;

// Serveur HTTP unique : healthcheck Railway + endpoint /push (Convex prévient le
// bot qu'il y a du travail, au lieu qu'il sonde en boucle). Un seul port exposé
// par Railway, donc un seul serveur - voir handleHttp.
const port = Number(process.env.PORT ?? 8080);
const server = createServer((req, res) => handleHttp(req, res, () => onPush(), isReady));
// Le serveur HTTP ne doit jamais faire tomber le process (ex. EADDRINUSE) : on
// loggue sans crasher.
server.on("error", (err) => console.error("[http] erreur serveur :", err));
server.listen(port, () => {
  console.log(`[http] healthcheck + push à l'écoute sur le port ${port}`);
});

void client.login(env.discordToken);

// Arrêt propre : Railway envoie SIGTERM au redéploiement.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => { console.log(`[bot] arrêt (${sig})`); client.destroy(); process.exit(0); });
}

// Filets de sécurité process-level : sans eux, une seule promesse non gérée peut
// tuer le process silencieusement.
// - unhandledRejection : le plus souvent bénin (fetch avorté, edit sur un message
//   supprimé…). On loggue et on continue plutôt que d'abattre tout le bot.
process.on("unhandledRejection", (reason) => {
  console.error("[bot] promesse rejetée non gérée :", reason);
});
// - uncaughtException : l'état du process peut être corrompu. On loggue puis on
//   sort en erreur pour laisser Railway repartir sur une base saine.
process.on("uncaughtException", (err) => {
  console.error("[bot] exception non interceptée - arrêt du process :", err);
  process.exit(1);
});
