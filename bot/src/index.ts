import { Client, GatewayIntentBits, Events } from "discord.js";
import { createServer } from "node:http";
import { env } from "./env.js";
import { registerCommands, handleCommand } from "./commands.js";
import { startTasks } from "./tasks.js";
import { handleRollcallButton } from "./rollcall.js";

// Le bot lit les événements de la Gateway (aucun intent privilégié requis :
// il ne lit pas le contenu des messages, seulement les commandes slash).
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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
  if (interaction.isChatInputCommand()) await handleCommand(interaction);
  else if (interaction.isButton() && interaction.customId.startsWith("rc|")) await handleRollcallButton(interaction);
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
