import { type Client, type TextChannel } from "discord.js";
import cron from "node-cron";
import { env } from "./env.js";
import { mdt } from "./convex.js";
import { presenceEmbed, dailyEmbed } from "./embeds.js";

// « HH:MM » -> expression cron « M H * * * ».
function toCron(hhmm: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${min} ${h} * * *`;
}

async function channel(client: Client, id: string): Promise<TextChannel | null> {
  if (!id) return null;
  try {
    const c = await client.channels.fetch(id);
    return c && c.isTextBased() ? (c as TextChannel) : null;
  } catch {
    return null;
  }
}

// Embed de présence tenu à jour : un unique message édité en boucle, plutôt
// qu'un flot de nouveaux messages.
function startPresenceLoop(client: Client) {
  const chanId = env.channels.presence;
  if (!chanId) return;
  let messageId: string | null = null;

  const tick = async () => {
    const chan = await channel(client, chanId);
    if (!chan) return;
    const embed = presenceEmbed(await mdt.agentsOnDuty());
    try {
      if (messageId) {
        const msg = await chan.messages.fetch(messageId).catch(() => null);
        if (msg) { await msg.edit({ embeds: [embed] }); return; }
      }
      const sent = await chan.send({ embeds: [embed] });
      messageId = sent.id;
    } catch (err) {
      console.error("[presence] erreur :", err);
    }
  };

  void tick();
  setInterval(() => void tick(), 60_000); // rafraîchi chaque minute
  console.log("[tasks] boucle de présence active (rafraîchie chaque minute).");
}

function scheduleDaily(client: Client) {
  const expr = toCron(env.dailySummaryAt);
  if (!expr || !env.channels.daily) return;
  cron.schedule(expr, async () => {
    const chan = await channel(client, env.channels.daily);
    if (!chan) return;
    try {
      await chan.send({ embeds: [dailyEmbed(await mdt.dayStats())] });
      console.log("[tasks] récapitulatif quotidien envoyé.");
    } catch (err) {
      console.error("[daily] erreur :", err);
    }
  });
  console.log(`[tasks] récapitulatif quotidien planifié à ${env.dailySummaryAt}.`);
}

export function startTasks(client: Client) {
  startPresenceLoop(client);
  scheduleDaily(client);
}
