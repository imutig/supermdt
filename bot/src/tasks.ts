import { type Client, type TextChannel } from "discord.js";
import { mdt } from "./convex.js";
import { presenceEmbed, dailyEmbed, absencePublishEmbed, sanctionEmbed, convocationEmbed } from "./embeds.js";
import { openRollcall, closeRollcall, remindNonVoters, LSPD_ROLE } from "./rollcall.js";
import { reconcilePromoCategories, reconcilePromoDeletions, deprogramInterview, parisWallToEpoch, finalizeAutoClose } from "./tickets.js";
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

// Composants de l'heure de Paris « maintenant », indépendants du fuseau du
// serveur (Railway tourne en UTC) : sans ça, roll call et récap se déclenchent
// avec 1-2 h de décalage.
function parisNow(now: Date): { date: string; hhmm: string; min: number; dow: number; y: number; mo: number; d: number } {
  const p: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" }).formatToParts(now)) p[part.type] = part.value;
  const hour = p.hour === "24" ? 0 : Number(p.hour);
  const hh = String(hour).padStart(2, "0");
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { date: `${p.year}-${p.month}-${p.day}`, hhmm: `${hh}:${p.minute}`, min: hour * 60 + Number(p.minute), dow: dowMap[p.weekday] ?? 0, y: Number(p.year), mo: Number(p.month), d: Number(p.day) };
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
  // Horodatage de la dernière synchro des membres LSPD. Initialisé de façon à ce
  // que la 1re synchro n'ait lieu que ~2 min après le démarrage : on évite un
  // guild.members.fetch() (opcode 8) juste au moment où la gateway s'identifie,
  // et surtout une rafale d'opcode 8 quand le bot est redéployé plusieurs fois
  // de suite (Discord throttle alors l'opcode 8 -> GatewayRateLimitError).
  let lastMemberSync = Date.now() - 8 * 60_000;

  // Verrou anti-chevauchement : le tick est déclenché par l'intervalle de sécurité
  // ET par les « push » de Convex. On empêche deux passages simultanés (sinon un
  // même item de file pourrait être traité deux fois avant d'être marqué envoyé).
  // Si un push arrive PENDANT un tick, on rejoue une passe à la fin (aucun événement
  // perdu).
  let ticking = false;
  let pending = false;
  const tick = async () => {
    if (ticking) { pending = true; return; }
    ticking = true;
    try {
      do {
        pending = false;
        await runTick();
      } while (pending);
    } finally {
      ticking = false;
    }
  };
  const runTick = async () => {
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
    const P = parisNow(now); // heure de Paris (indépendante du fuseau serveur)
    const hhmm = P.hhmm;
    const today = P.date;

    // --- Roll call : ouverture, puis clôture à l'heure de fin ---
    if (cfg.rollcallChannel && cfg.rollcallStartAt && cfg.rollcallEndAt) {
      const [eh, em] = cfg.rollcallEndAt.split(":").map(Number);
      const endsAtMs = parisWallToEpoch(P.y, P.mo, P.d, eh, em); // heure de fin, murale Paris
      const existing = await mdt.rollcallToday(today).catch(() => null);
      // Rattrapage : on ouvre dès que l'heure de début est atteinte OU dépassée,
      // tant que la clôture n'est pas passée et qu'aucun appel n'existe pour le
      // jour. Ainsi, configurer/déployer après l'heure poste quand même l'appel.
      // Comparaison en minutes (robuste aux heures non zéro-préfixées, ex. "9:00").
      const [sh, sm] = cfg.rollcallStartAt.split(":").map(Number);
      const nowMin = P.min;
      const inWindow = nowMin >= sh * 60 + sm && Date.now() < endsAtMs;
      if (inWindow && lastRollcallOpened !== today && !existing) {
        lastRollcallOpened = today;
        // Le dimanche (dow === 0), le roll call devient un appel à la cérémonie.
        const ceremony = P.dow === 0;
        await openRollcall(client, {
          channelId: cfg.rollcallChannel, date: today, endsAt: endsAtMs,
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
        // Ferme réellement le ticket (retire l'accès candidat + panneau encadrement).
        await finalizeAutoClose(client, t.channelId, t.ownerId, `${t.prenom} ${t.nom}`);
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
            .map((m) => ({ discordId: m.id, username: m.user.username, displayName: m.displayName, roleIds: [...m.roles.cache.keys()] }));
          await mdt.syncDiscordMembers(lspd);
        }
      } catch (err) { console.error("[discord] synchro membres (Server Members Intent ?) :", err); }
    }

    // --- « Envoyer un compte » : MP en attente ---
    // Lien unique et pré-rempli : un clic ouvre une page dédiée où il ne reste
    // qu'à indiquer son prénom et choisir un mot de passe (matricule et nom sont
    // détectés depuis le pseudo serveur). Pas de code à recopier.
    try {
      const queue = await mdt.accountDMQueue();
      for (const q of queue) {
        const user = await client.users.fetch(q.discordId).catch(() => null);
        if (user) {
          const link = q.baseUrl ? `${q.baseUrl.replace(/\/$/, "")}/rejoindre/${q.code}` : null;
          const embed = baseEmbed(BRAND.green).setTitle("🎫 Ton compte MDT - LSPD Station 13")
            .setDescription(link
              ? `Bienvenue ! Ton compte t'attend.\n\n**Clique sur le lien ci-dessous** : ton matricule et ton nom sont déjà pré-remplis, il ne te reste qu'à indiquer ton **prénom** et choisir un **mot de passe**.\n\n➡️ **${link}**`
              : `Bienvenue ! Rends-toi sur le site du MDT pour créer ton compte avec ce code : \`${q.code}\`.`)
            .setFooter({ text: "Lien à usage unique · ton compte sera relié à ce Discord." });
          await user.send({ embeds: [embed] }).catch(() => {});
        }
        await mdt.markAccountDMSent(q.code);
      }
    } catch (err) { console.error("[discord] envoi des comptes :", err); }

    // --- Alertes de synchro Nexus en MP ---
    try {
      const alerts = await mdt.nexusAlertQueue();
      for (const al of alerts) {
        const user = await client.users.fetch(al.discordId).catch(() => null);
        if (user) {
          await user.send({ embeds: [baseEmbed(BRAND.danger).setTitle("🔌 Alerte synchronisation NexusMDT").setDescription(al.message)] }).catch(() => {});
        }
        await mdt.markNexusAlertSent(al.id);
      }
    } catch (err) { console.error("[discord] alertes synchro :", err); }

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

    // --- Publication des absences dans le salon configuré ---
    if (cfg.absenceChannel) {
      try {
        const pending = await mdt.absencesToAnnounce();
        if (pending.length) {
          const chan = await channel(client, cfg.absenceChannel);
          for (const ab of pending) {
            // On ne marque « publié » qu'après un envoi CONFIRMÉ : un échec
            // (salon absent, rate-limit) sera réessayé au prochain tick plutôt
            // que perdu silencieusement.
            let ok = false;
            if (chan) { try { await chan.send({ embeds: [absencePublishEmbed(ab)] }); ok = true; } catch (e) { console.error("[absence] envoi échoué :", e); } }
            if (ok) await mdt.markAbsenceAnnounced(ab.id);
          }
        }
      } catch (err) { console.error("[absence] publication :", err); }
    }

    // --- Publication des sanctions (embed + ping rôle LSPD) ---
    if (cfg.sanctionsChannel) {
      try {
        const pending = await mdt.sanctionsToAnnounce();
        if (pending.length) {
          const chan = await channel(client, cfg.sanctionsChannel);
          for (const s of pending) {
            let ok = false;
            if (chan) {
              const ping = cfg.sanctionsPingRole
                ? { content: `<@&${cfg.sanctionsPingRole}>`, allowedMentions: { roles: [cfg.sanctionsPingRole] } }
                : {};
              try { await chan.send({ ...ping, embeds: [sanctionEmbed(s)] }); ok = true; } catch (e) { console.error("[sanction] envoi échoué :", e); }
            }
            if (ok) await mdt.markSanctionAnnounced(s.id); // publié seulement si confirmé
          }
        }
      } catch (err) { console.error("[sanction] publication :", err); }
    }

    // --- Publication des convocations (embed + ping de l'agent concerné) ---
    if (cfg.sanctionsChannel) {
      try {
        const pending = await mdt.convocationsToAnnounce();
        if (pending.length) {
          const chan = await channel(client, cfg.sanctionsChannel);
          for (const c of pending) {
            let ok = false;
            if (chan) {
              const ping = c.pingDiscordId
                ? { content: `<@${c.pingDiscordId}>`, allowedMentions: { users: [c.pingDiscordId] } }
                : {};
              try { await chan.send({ ...ping, embeds: [convocationEmbed(c)] }); ok = true; } catch (e) { console.error("[convocation] envoi échoué :", e); }
            }
            if (ok) await mdt.markConvocationAnnounced(c.id); // publié seulement si confirmé
          }
        }
      } catch (err) { console.error("[convocation] publication :", err); }
    }

    // --- Publication des annonces de CÉRÉMONIE (annonce + résultat) ---
    try {
      const { channel: ceremonyChannel, posts } = await mdt.ceremonyPostsToSend();
      if (posts.length && ceremonyChannel) {
        const chan = await channel(client, ceremonyChannel);
        for (const p of posts) {
          let ok = false;
          if (chan) { try { await chan.send({ content: p.content, allowedMentions: { parse: ["users", "roles"] } }); ok = true; } catch (e) { console.error("[ceremonie] envoi échoué :", e); } }
          if (ok) await mdt.markCeremonyPostSent(p.id); // publié seulement si confirmé
        }
      }
    } catch (err) { console.error("[ceremonie] publication :", err); }

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
  // Poll de SÉCURITÉ ralenti : le push Convex assure l'immédiateté ; ce filet
  // rattrape les push manqués (bot redémarré) et gère le temporel (roll call,
  // rappels, fermetures) qui tolère 5 min. La logique horaire est déjà « à
  // fenêtre » (pas d'égalité stricte à la minute), donc 5 min est sûr.
  setInterval(() => void tick(), 5 * 60_000);
  console.log("[tasks] boucle active (poll de sécurité 5 min + push Convex).");
  // Le serveur HTTP (index.ts) déclenche ce tick immédiatement quand Convex
  // « pousse » du travail (POST /push). On renvoie donc le déclencheur.
  return tick;
}
