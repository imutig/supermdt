import { type Client, type TextChannel } from "discord.js";
import { mdt } from "./convex.js";
import { presenceEmbed, dailyEmbed } from "./embeds.js";

// Les salons et l'heure du récap sont lus depuis le MDT (page Configuration),
// pas depuis l'environnement : un changement sur le site prend effet sans
// redémarrer le bot. Une seule boucle chaque minute pilote tout.

async function channel(client: Client, id: string | null): Promise<TextChannel | null> {
  if (!id) return null;
  try {
    const c = await client.channels.fetch(id);
    return c && c.isTextBased() ? (c as TextChannel) : null;
  } catch {
    return null;
  }
}

export function startTasks(client: Client) {
  // Message de présence réutilisé, édité en boucle au lieu de réémis.
  let presenceMessageId: string | null = null;
  // Date (YYYY-MM-DD) du dernier récap envoyé, pour n'en envoyer qu'un par jour.
  let lastDailySent = "";

  const tick = async () => {
    let cfg;
    try {
      cfg = await mdt.config();
    } catch (err) {
      console.error("[tasks] config injoignable :", err);
      return;
    }

    // --- Embed de présence ---
    if (cfg.presenceChannel) {
      const chan = await channel(client, cfg.presenceChannel);
      if (chan) {
        try {
          const embed = presenceEmbed(await mdt.agentsOnDuty());
          const existing = presenceMessageId ? await chan.messages.fetch(presenceMessageId).catch(() => null) : null;
          if (existing) await existing.edit({ embeds: [embed] });
          else presenceMessageId = (await chan.send({ embeds: [embed] })).id;
        } catch (err) {
          console.error("[presence] erreur :", err);
        }
      }
    }

    // --- Récapitulatif quotidien ---
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const today = now.toISOString().slice(0, 10);
    if (cfg.dailyChannel && cfg.dailyAt === hhmm && lastDailySent !== today) {
      lastDailySent = today;
      const chan = await channel(client, cfg.dailyChannel);
      if (chan) {
        try {
          await chan.send({ embeds: [dailyEmbed(await mdt.dayStats())] });
          console.log("[tasks] récapitulatif quotidien envoyé.");
        } catch (err) {
          console.error("[daily] erreur :", err);
        }
      }
    }
  };

  void tick();
  setInterval(() => void tick(), 60_000);
  console.log("[tasks] boucle active (présence + récap, config lue depuis le MDT).");
}
