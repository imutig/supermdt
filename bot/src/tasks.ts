import { type Client, type TextChannel } from "discord.js";
import { mdt } from "./convex.js";
import { presenceEmbed, dailyEmbed } from "./embeds.js";
import { openRollcall, closeRollcall, remindNonVoters, LSPD_ROLE } from "./rollcall.js";
import { reconcilePromoCategories, reconcilePromoDeletions, deprogramInterview } from "./tickets.js";
import { baseEmbed, BRAND } from "./theme.js";

// Les salons et l'heure du récap sont lus depuis le MDT (page Configuration),
// pas depuis l'environnement : un changement sur le site prend effet sans
// redémarrer le bot. Une seule boucle chaque minute pilote tout.

const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const pad2 = (n: number) => String(n).padStart(2, "0");
// Créneaux de relance : toutes les 2 h après l'ouverture, avant la clôture.
// Ex. début 14:00, fin 21:00 -> ["16:00", "18:00", "20:00"].
function reminderSlots(start: string, end: string): string[] {
  const s = toMin(start), e = toMin(end);
  const out: string[] = [];
  for (let t = s + 120; t < e; t += 120) out.push(`${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`);
  return out;
}

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
  let lastMemberSync = 0; // horodatage de la dernière synchro des membres LSPD

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
          ceremony, ceremonyTime: cfg.ceremonyAt,
          // L'heure de présence affichée = l'heure de clôture des votes.
          displayTime: cfg.rollcallEndAt,
        });
      } else if (existing && !existing.closed && Date.now() >= existing.endsAt) {
        await closeRollcall(client, existing._id, existing.channelId, existing.messageId);
      } else if (existing && !existing.closed) {
        // Relances toutes les 2 h (16h, 18h, 20h…) : re-ping les LSPD non-votants.
        const slots = reminderSlots(cfg.rollcallStartAt, cfg.rollcallEndAt);
        const endMin = toMin(cfg.rollcallEndAt);
        const due = slots.filter((s) => nowMin >= toMin(s) && nowMin < endMin && !existing.remindersSent.includes(s));
        if (due.length) {
          await remindNonVoters(client, existing);
          await mdt.rollcallMarkReminders(existing._id, due); // marque tous les créneaux passés (pas de rafale)
        }
      }
    }

    // --- Fermetures de ticket programmées (!close <délai>) échues ---
    try {
      const due = await mdt.ticketsDueForClose(Date.now());
      for (const t of due) {
        const res = await mdt.ticketAutoClose(t.channelId);
        if (!res) continue;
        const cand = await client.users.fetch(t.ownerId).catch(() => null);
        if (cand) {
          await cand.send({ embeds: [baseEmbed(BRAND.muted).setTitle("Candidature fermée")
            .setDescription("Faute de réponse dans le délai imparti, ta candidature a été **fermée**. Tu peux repartir de zéro à tout moment en m'envoyant le mot **Candidature**.")] }).catch(() => {});
        }
        const chan = await channel(client, t.channelId);
        if (chan) await chan.send({ embeds: [baseEmbed(BRAND.muted).setDescription(`🔒 Ticket de **${t.prenom} ${t.nom}** fermé automatiquement (absence de réponse du candidat).`)] }).catch(() => {});
      }
    } catch (err) { console.error("[ticket] fermetures auto :", err); }

    // --- Catégories de promo : crée celles qui manquent, nettoie les supprimées ---
    await reconcilePromoCategories(client).catch(() => {});
    await reconcilePromoDeletions(client).catch(() => {});

    // --- Entretiens à T-15 min ---
    // Confirmé : rappel (MP candidat + ping instructeur). Non confirmé :
    // déprogrammation automatique (le candidat n'a pas validé sa présence).
    try {
      const due = await mdt.interviewReminders(Date.now());
      for (const it of due) {
        if (it.interviewPresence !== "CONFIRMED") {
          await deprogramInterview(client, it.channelId, { auto: true });
          continue; // l'annulation efface interviewAt : ne réapparaîtra plus.
        }
        const whenParis = new Date(it.interviewAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });
        const sec = Math.floor(it.interviewAt / 1000);
        const cand = await client.users.fetch(it.ownerId).catch(() => null);
        if (cand) {
          await cand.send({ embeds: [baseEmbed(BRAND.green).setTitle("📅 Rappel d'entretien")
            .setDescription(`Ton entretien de recrutement a lieu **dans 15 minutes** (<t:${sec}:t>, heure de Paris).\nMerci d'être ponctuel(le) et en tenue correcte.`)] }).catch(() => {});
        }
        const chan = await channel(client, it.channelId);
        if (chan && it.interviewById) {
          await chan.send({ content: `<@${it.interviewById}> Rappel : entretien de **${it.prenom} ${it.nom}** dans 15 minutes (${whenParis}).`, allowedMentions: { users: [it.interviewById] } }).catch(() => {});
        }
        await mdt.markInterviewReminded(it.channelId);
      }
    } catch (err) { console.error("[interview] rappels :", err); }

    // --- Liaison des comptes : synchro des membres LSPD (toutes les ~10 min) ---
    if (Date.now() - lastMemberSync > 10 * 60_000) {
      lastMemberSync = Date.now();
      try {
        const guild = client.guilds.cache.first();
        if (guild) {
          const members = await guild.members.fetch();
          const lspd = [...members.values()].filter((m) => !m.user.bot && m.roles.cache.has(LSPD_ROLE))
            .map((m) => ({ discordId: m.id, username: m.user.username, displayName: m.displayName }));
          await mdt.syncDiscordMembers(lspd);
        }
      } catch (err) { console.error("[discord] synchro membres (Server Members Intent ?) :", err); }
    }

    // --- « Envoyer un compte » : MP en attente ---
    try {
      const queue = await mdt.accountDMQueue();
      for (const q of queue) {
        const user = await client.users.fetch(q.discordId).catch(() => null);
        if (user) {
          const link = q.baseUrl || "le site du MDT";
          await user.send({ embeds: [baseEmbed(BRAND.green).setTitle("🎫 Ton compte MDT - LSPD Station 13")
            .setDescription(`Bienvenue ! Voici de quoi créer ton compte sur le MDT.\n\n**1.** Rends-toi sur ${q.baseUrl ? `**${q.baseUrl}**` : "le site du MDT"}\n**2.** Crée ton compte (identifiant \`prénom.nom\` + un mot de passe).\n**3.** Quand on te le demande, entre ce **code d'invitation** :`)
            .addFields({ name: "Code d'invitation", value: `\`\`\`${q.code}\`\`\`` })
            .setFooter({ text: "Ton compte sera automatiquement relié à ce Discord." })] }).catch(() => {});
        }
        await mdt.markAccountDMSent(q.code);
      }
    } catch (err) { console.error("[discord] envoi des comptes :", err); }

    // --- Montées en grade : tâches de rôle Discord ---
    try {
      const jobs = await mdt.roleJobsPending();
      const guild = client.guilds.cache.first();
      for (const job of jobs) {
        try {
          if (!guild) throw new Error("guilde introuvable");
          const member = await guild.members.fetch(job.discordId);
          for (const rid of job.removeRoleIds) if (member.roles.cache.has(rid)) await member.roles.remove(rid, job.reason ?? "Montée en grade MDT");
          if (job.addRoleId && !member.roles.cache.has(job.addRoleId)) await member.roles.add(job.addRoleId, job.reason ?? "Montée en grade MDT");
          await mdt.markRoleJob(job._id, "DONE");
        } catch (e) {
          await mdt.markRoleJob(job._id, "ERROR", e instanceof Error ? e.message : String(e)).catch(() => {});
        }
      }
    } catch (err) { console.error("[discord] montées en grade :", err); }

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
