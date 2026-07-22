import { type Client, type TextChannel } from "discord.js";
import { mdt } from "./convex.js";
import { presenceEmbed, dailyEmbed } from "./embeds.js";
import { openRollcall, closeRollcall } from "./rollcall.js";

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
  // Message de présence réutilisé, édité en boucle. L'id est persisté côté MDT
  // pour survivre à un redémarrage du bot : on ne reposte pas un doublon.
  let presenceMessageId: string | null = null;
  let presenceLoaded = false;
  // Date (YYYY-MM-DD) du dernier récap envoyé, pour n'en envoyer qu'un par jour.
  let lastDailySent = "";
  let lastRollcallOpened = "";

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
          // Au premier passage, on récupère l'id mémorisé pour éditer le
          // message existant plutôt que d'en créer un nouveau.
          if (!presenceLoaded) { presenceMessageId = await mdt.presenceMessageGet().catch(() => null); presenceLoaded = true; }
          const embed = presenceEmbed(await mdt.agentsOnDuty());
          const existing = presenceMessageId ? await chan.messages.fetch(presenceMessageId).catch(() => null) : null;
          if (existing) {
            await existing.edit({ embeds: [embed] });
          } else {
            const sent = await chan.send({ embeds: [embed] });
            presenceMessageId = sent.id;
            await mdt.presenceMessageSet(sent.id).catch(() => {});
          }
        } catch (err) {
          console.error("[presence] erreur :", err);
        }
      }
    }

    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const today = now.toISOString().slice(0, 10);

    // --- Appel de présence : ouverture, puis clôture à l'heure de fin ---
    if (cfg.rollcallChannel && cfg.rollcallStartAt && cfg.rollcallEndAt) {
      const [eh, em] = cfg.rollcallEndAt.split(":").map(Number);
      const endsAt = new Date(now); endsAt.setHours(eh, em, 0, 0);
      const existing = await mdt.rollcallToday(today).catch(() => null);
      if (cfg.rollcallStartAt === hhmm && lastRollcallOpened !== today && !existing) {
        lastRollcallOpened = today;
        await openRollcall(client, cfg.rollcallChannel, today, endsAt.getTime());
      } else if (existing && !existing.closed && Date.now() >= existing.endsAt) {
        await closeRollcall(client, existing._id, existing.channelId, existing.messageId);
      }
    }

    // --- Récapitulatif quotidien ---
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
