import { type Client, type TextChannel } from "discord.js";
import { mdt } from "./convex.js";
import { presenceEmbed, dailyEmbed } from "./embeds.js";
import { openRollcall, closeRollcall } from "./rollcall.js";
import { reconcilePromoCategories, reconcilePromoDeletions } from "./tickets.js";
import { baseEmbed, BRAND } from "./theme.js";

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

    // --- Roll call : ouverture, puis clôture à l'heure de fin ---
    if (cfg.rollcallChannel && cfg.rollcallStartAt && cfg.rollcallEndAt) {
      const [eh, em] = cfg.rollcallEndAt.split(":").map(Number);
      const endsAt = new Date(now); endsAt.setHours(eh, em, 0, 0);
      const existing = await mdt.rollcallToday(today).catch(() => null);
      // Rattrapage : on ouvre dès que l'heure de début est atteinte OU dépassée,
      // tant que la clôture n'est pas passée et qu'aucun appel n'existe pour le
      // jour. Ainsi, configurer/déployer après l'heure poste quand même l'appel.
      // Comparaison en minutes (robuste aux heures non zéro-préfixées, ex. "9:00").
      const [sh, sm] = cfg.rollcallStartAt.split(":").map(Number);
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const inWindow = nowMin >= sh * 60 + sm && Date.now() < endsAt.getTime();
      if (inWindow && lastRollcallOpened !== today && !existing) {
        lastRollcallOpened = today;
        // Le dimanche (getDay() === 0), le roll call devient un appel à la cérémonie.
        const ceremony = now.getDay() === 0;
        await openRollcall(client, {
          channelId: cfg.rollcallChannel, date: today, endsAt: endsAt.getTime(),
          pingRoleId: cfg.rollcallPingRole, pingEnabled: cfg.rollcallPingEnabled,
          ceremony, ceremonyTime: cfg.ceremonyAt,
          // L'heure de présence affichée = l'heure de clôture des votes.
          displayTime: cfg.rollcallEndAt,
        });
      } else if (existing && !existing.closed && Date.now() >= existing.endsAt) {
        await closeRollcall(client, existing._id, existing.channelId, existing.messageId);
      }
    }

    // --- Catégories de promo : crée celles qui manquent, nettoie les supprimées ---
    await reconcilePromoCategories(client).catch(() => {});
    await reconcilePromoDeletions(client).catch(() => {});

    // --- Rappels d'entretien : 15 min avant, MP au candidat + ping instructeur ---
    try {
      const due = await mdt.interviewReminders(Date.now());
      for (const it of due) {
        const whenParis = new Date(it.interviewAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });
        const sec = Math.floor(it.interviewAt / 1000);
        // MP au candidat (il n'est pas dans le salon recruteur).
        const cand = await client.users.fetch(it.ownerId).catch(() => null);
        if (cand) {
          await cand.send({ embeds: [baseEmbed(BRAND.green).setTitle("📅 Rappel d'entretien")
            .setDescription(`Ton entretien de recrutement a lieu **dans 15 minutes** (<t:${sec}:t>, heure de Paris).\nMerci d'être ponctuel(le) et en tenue réglementaire.`)] }).catch(() => {});
        }
        // Ping de l'instructeur qui a pris en charge, dans le salon du ticket.
        const chan = await channel(client, it.channelId);
        if (chan && it.interviewById) {
          await chan.send({ content: `<@${it.interviewById}> Rappel : entretien de **${it.prenom} ${it.nom}** dans 15 minutes (${whenParis}).`, allowedMentions: { users: [it.interviewById] } }).catch(() => {});
        }
        await mdt.markInterviewReminded(it.channelId);
      }
    } catch (err) { console.error("[interview] rappels :", err); }

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
