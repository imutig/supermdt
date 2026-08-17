import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  type Client, type TextChannel, type ButtonInteraction,
} from "discord.js";
import { mdt, type RollcallState, type RollStatus } from "./convex.js";
import { baseEmbed, BRAND } from "./theme.js";

const LABELS: Record<RollStatus, string> = { PRESENT: "Présent", RETARD: "En retard", ABSENT: "Absent" };

// Rôle LSPD : base d'éligibilité au roll call (tout le personnel).
export const LSPD_ROLE = "1434397107086692452";

// Rôle « LSPD - Roll-call » auto-géré : porté par les agents LSPD non absents qui
// n'ont pas encore voté. Il est ping à l'ouverture et à chaque relance ; retiré
// au votant dès qu'il répond ; ré-attribué à tous les éligibles à la clôture
// (pour le roll call du lendemain).
export const ROLLCALL_ROLE = "1538912557153390694";

// Synchronise l'appartenance au rôle roll-call : présent chez tout agent LSPD non
// absent, absent partout ailleurs. Utilisé à l'ouverture et à la clôture.
export async function syncRollcallRole(client: Client) {
  const guild = client.guilds.cache.first();
  if (!guild) return;
  let members;
  try { members = await guild.members.fetch(); }
  catch (e) { console.error("[rollcall] énumération des membres impossible (active « Server Members Intent » ?) :", e); return; }
  const absent = new Set(await mdt.absentDiscordIds().catch(() => [] as string[]));
  let added = 0, removed = 0;
  const ops: Promise<unknown>[] = [];
  for (const m of members.values()) {
    if (m.user.bot) continue;
    const eligible = m.roles.cache.has(LSPD_ROLE) && !absent.has(m.id);
    const has = m.roles.cache.has(ROLLCALL_ROLE);
    if (eligible && !has) ops.push(m.roles.add(ROLLCALL_ROLE).then(() => { added++; }).catch(() => {}));
    else if (!eligible && has) ops.push(m.roles.remove(ROLLCALL_ROLE).then(() => { removed++; }).catch(() => {}));
  }
  await Promise.allSettled(ops);
  console.log(`[rollcall] rôle roll-call synchronisé (+${added} / -${removed}).`);
}

// Boutons de vote, préfixés du rollcall pour survivre à un redémarrage du bot.
function buttons(rollcallId: string) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`rc|PRESENT|${rollcallId}`).setLabel("Présent").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`rc|RETARD|${rollcallId}`).setLabel("En retard").setEmoji("⏰").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`rc|ABSENT|${rollcallId}`).setLabel("Absent").setEmoji("❌").setStyle(ButtonStyle.Danger),
  );
  return [row];
}

function list(names: string[]): string {
  return names.length === 0 ? "*-*" : names.map((n) => `• ${n}`).join("\n");
}

// Message de la cérémonie du dimanche (texte officiel dicté). L'heure est
// configurable sur le site ("HH:MM") et affichée façon "21h00".
function ceremonyText(time: string | null): string {
  const display = (time && /^\d{1,2}:\d{2}$/.test(time)) ? time.replace(":", "h") : "21h00";
  return [
    "Ce soir, le Roll Call habituel est remplacé par une cérémonie officielle.",
    "",
    `Rendez-vous à ${display} - Étage 3.`,
    "",
    "Tous les agents sont attendus en tenue de cérémonie complète et réglementaire.",
    "La présence de chacun est fortement attendue.",
    "",
    "Merci d'être ponctuels et de respecter le protocole de la cérémonie.",
  ].join("\n");
}

const hm = (t: string | null): string | null => (t && /^\d{1,2}:\d{2}$/.test(t)) ? t.replace(":", "h") : null;

// Message d'un roll call ordinaire : date, heure et lieu, puis les consignes.
function rollcallText(state: RollcallState, endStamp: string): string {
  const dateStamp = `<t:${Math.floor(state.endsAt / 1000)}:D>`;
  const heure = hm(state.displayTime);
  return [
    `📅 ${dateStamp}${heure ? `  ·  🕘 ${heure}` : ""}  ·  📍 3ème étage, Poste de Vespucci`,
    "",
    "Présentez-vous en avance et en tenue de patrouille. À défaut, notez-vous « En retard ».",
    "Toute absence de plus de 72h doit être signalée.",
    "",
    `Indiquez votre présence ci-dessous. Clôture des votes à ${endStamp}.`,
  ].join("\n");
}

function rollcallEmbed(state: RollcallState): EmbedBuilder {
  const endStamp = `<t:${Math.floor(state.endsAt / 1000)}:t>`;
  const total = state.present.length + state.retard.length + state.absent.length;
  const title = state.ceremony
    ? (state.closed ? "🎖️ Appel à la cérémonie - clos" : "🎖️ Appel à la cérémonie")
    : (state.closed ? "📋 Roll call - clos" : "📣 Roll call");
  const description = state.closed
    ? (state.ceremony
        ? `La cérémonie est terminée. **${total}** réponse${total > 1 ? "s" : ""} enregistrée${total > 1 ? "s" : ""}.`
        : `Le roll call est terminé. **${total}** réponse${total > 1 ? "s" : ""} enregistrée${total > 1 ? "s" : ""}.`)
    : (state.ceremony
        ? `${ceremonyText(state.ceremonyTime)}\n\nIndiquez votre présence ci-dessous. Clôture des votes à ${endStamp}.`
        : rollcallText(state, endStamp));
  const e = baseEmbed(state.closed ? BRAND.muted : BRAND.green)
    .setTitle(title)
    .setDescription(description)
    .addFields(
      { name: `✅ Présents - ${state.present.length}`, value: list(state.present), inline: true },
      { name: `⏰ En retard - ${state.retard.length}`, value: list(state.retard), inline: true },
      { name: `❌ Absents - ${state.absent.length}`, value: list(state.absent), inline: true },
    );
  return e;
}

async function channel(client: Client, id: string): Promise<TextChannel | null> {
  try {
    const c = await client.channels.fetch(id);
    return c && c.isTextBased() ? (c as TextChannel) : null;
  } catch {
    return null;
  }
}

async function refresh(client: Client, rollcallId: string, channelId: string, messageId: string) {
  const state = await mdt.rollcallState(rollcallId);
  if (!state) return;
  const chan = await channel(client, channelId);
  const msg = chan ? await chan.messages.fetch(messageId).catch(() => null) : null;
  if (!msg) return;
  await msg.edit({ embeds: [rollcallEmbed(state)], components: state.closed ? [] : buttons(rollcallId) });
}

// Ouvre le roll call du jour. Idempotent : on RÉSERVE le créneau en base avant
// de poster (une seule instance/tick gagne l'insertion), ce qui évite tout
// envoi en double, y compris pendant un redéploiement (deux instances).
export async function openRollcall(client: Client, opts: {
  channelId: string; date: string; endsAt: number;
  ceremony?: boolean; ceremonyTime?: string | null; displayTime?: string | null;
}) {
  const { channelId, date, endsAt, ceremony, ceremonyTime, displayTime } = opts;
  const chan = await channel(client, channelId);
  if (!chan) return;
  // Réservation atomique : si un autre a déjà ouvert le roll call du jour, on
  // n'envoie rien.
  const res = await mdt.rollcallReserve(date, channelId, endsAt, ceremony, ceremonyTime, displayTime).catch(() => null);
  if (!res || !res.created) return;
  // Réattribue le rôle roll-call à tous les éligibles avant de publier (reset du
  // jour) : la mention ne touchera que les agents non absents.
  await syncRollcallRole(client);
  const prev = await mdt.rollcallPrevious(date).catch(() => null);
  const state: RollcallState = { endsAt, closed: false, ceremony: !!ceremony, ceremonyTime: ceremonyTime ?? null, displayTime: displayTime ?? null, present: [], retard: [], absent: [] };
  // Première mention : le rôle roll-call à la publication.
  const ping = { content: `<@&${ROLLCALL_ROLE}>`, allowedMentions: { roles: [ROLLCALL_ROLE] } };
  const sent = await chan.send({ ...ping, embeds: [rollcallEmbed(state)], components: buttons(res._id) });
  await mdt.rollcallSetMessage(res._id, sent.id).catch(() => {});
  // Supprime le message du roll call précédent ET ses messages de relance
  // (l'historique des présences reste en base).
  if (prev && prev.channelId) {
    const prevChan = await channel(client, prev.channelId);
    if (prevChan) {
      const toDelete = [prev.messageId, ...(prev.reminderMsgIds ?? [])].filter((id) => id && id !== sent.id);
      for (const id of toDelete) {
        const msg = await prevChan.messages.fetch(id).catch(() => null);
        await msg?.delete().catch(() => {});
      }
    }
  }
  console.log(`[rollcall] roll call ouvert (${date}).`);
}

// Relance : ping le rôle roll-call, qui ne porte plus que les agents non absents
// n'ayant pas encore voté (le vote retire le rôle). Rien à faire si le rôle est
// vide (tout le monde a répondu / est absent).
export async function remindNonVoters(client: Client, rc: { _id: string; channelId: string; messageId: string }) {
  const guild = client.guilds.cache.first();
  if (!guild) return;
  let members;
  try { members = await guild.members.fetch(); }
  catch (e) { console.error("[rollcall] énumération des membres impossible (active « Server Members Intent » ?) :", e); return; }
  const pending = [...members.values()].filter((m) => !m.user.bot && m.roles.cache.has(ROLLCALL_ROLE));
  if (pending.length === 0) return; // tout le monde a voté (ou est absent) : rien à relancer.
  const chan = await channel(client, rc.channelId);
  if (!chan) return;
  const link = `https://discord.com/channels/${guild.id}/${rc.channelId}/${rc.messageId}`;
  const msg = await chan.send({
    content: `📣 **Roll call** - vous n'avez pas encore indiqué votre présence. Merci de voter : ${link}\n<@&${ROLLCALL_ROLE}>`,
    allowedMentions: { roles: [ROLLCALL_ROLE] },
  }).catch(() => null);
  // Mémorise ce message pour le supprimer avec le roll call du lendemain.
  if (msg) await mdt.rollcallAddReminderMsgs(rc._id, [msg.id]).catch(() => {});
  console.log(`[rollcall] relance envoyée à ${pending.length} non-votant(s) via le rôle.`);
}

export async function closeRollcall(client: Client, rollcallId: string, channelId: string, messageId: string) {
  await mdt.rollcallClose(rollcallId);
  await refresh(client, rollcallId, channelId, messageId);
  // Ré-attribue le rôle roll-call à tous les éligibles pour l'appel du lendemain.
  await syncRollcallRole(client);
  console.log("[rollcall] appel clos.");
}

// Gestion d'un clic sur un bouton de vote. Tout le corps est protégé : un throw
// (mutation Convex, edit du message…) ne doit pas remonter en rejection non
// gérée mais informer l'utilisateur via un message éphémère.
export async function handleRollcallButton(interaction: ButtonInteraction) {
  try {
    const [, status, rollcallId] = interaction.customId.split("|");
    if (rollcallId === "pending") {
      await interaction.reply({ content: "L'appel s'initialise, réessayez dans un instant.", flags: 64 });
      return;
    }
    const member = interaction.member;
    const name = (member && "displayName" in member ? member.displayName : null) ?? interaction.user.username;
    const res = await mdt.rollcallVote(rollcallId, interaction.user.id, name, status as RollStatus);
    if (!res.ok) {
      await interaction.reply({ content: res.reason === "clos" ? "L'appel est clos, le vote n'est plus possible." : "Vote impossible.", flags: 64 });
      return;
    }
    await interaction.reply({ content: `Présence enregistrée : **${LABELS[status as RollStatus]}**.`, flags: 64 });
    // Le votant ne sera plus ping aux relances : on lui retire le rôle roll-call.
    if (interaction.guild) {
      interaction.guild.members.fetch(interaction.user.id)
        .then((m) => m.roles.remove(ROLLCALL_ROLE))
        .catch(() => { /* best-effort (perms / hiérarchie) */ });
    }
    if (interaction.message) await refresh(interaction.client, rollcallId, interaction.channelId, interaction.message.id);
  } catch (err) {
    console.error("[rollcall] traitement du vote impossible :", err);
    // Ne répond que si l'interaction n'a pas déjà été acquittée (sinon Discord
    // rejette une seconde réponse, ce qui masquerait l'erreur d'origine).
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Une erreur est survenue, réessayez dans un instant.", flags: 64 }).catch(() => {});
    }
  }
}
