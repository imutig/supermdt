import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  type Client, type TextChannel, type ButtonInteraction,
} from "discord.js";
import { mdt, type RollcallState, type RollStatus } from "./convex.js";
import { baseEmbed, BRAND } from "./theme.js";

const LABELS: Record<RollStatus, string> = { PRESENT: "Présent", RETARD: "En retard", ABSENT: "Absent" };

// Rôle LSPD : mentionné à la publication du roll call, et base des relances
// (on ne re-ping que ses membres n'ayant pas encore voté).
export const LSPD_ROLE = "1434397107086692452";

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
  const prev = await mdt.rollcallPrevious(date).catch(() => null);
  const state: RollcallState = { endsAt, closed: false, ceremony: !!ceremony, ceremonyTime: ceremonyTime ?? null, displayTime: displayTime ?? null, present: [], retard: [], absent: [] };
  // Première mention : le rôle LSPD à la publication.
  const ping = { content: `<@&${LSPD_ROLE}>`, allowedMentions: { roles: [LSPD_ROLE] } };
  const sent = await chan.send({ ...ping, embeds: [rollcallEmbed(state)], components: buttons(res._id) });
  await mdt.rollcallSetMessage(res._id, sent.id).catch(() => {});
  // Supprime le message du roll call précédent (l'historique reste en base).
  if (prev && prev.messageId && prev.messageId !== sent.id) {
    const prevChan = await channel(client, prev.channelId);
    const prevMsg = prevChan ? await prevChan.messages.fetch(prev.messageId).catch(() => null) : null;
    await prevMsg?.delete().catch(() => {});
  }
  console.log(`[rollcall] roll call ouvert (${date}).`);
}

// Relance : mentionne les membres du rôle LSPD qui n'ont PAS encore voté au
// roll call du jour (ceux qui ont voté ne sont plus ping).
export async function remindNonVoters(client: Client, rc: { _id: string; channelId: string; messageId: string }) {
  const guild = client.guilds.cache.first();
  if (!guild) return;
  let members;
  try { members = await guild.members.fetch(); }
  catch (e) { console.error("[rollcall] énumération des membres impossible (active « Server Members Intent » ?) :", e); return; }
  const lspd = [...members.values()].filter((m) => !m.user.bot && m.roles.cache.has(LSPD_ROLE));
  if (lspd.length === 0) return;
  const voters = new Set(await mdt.rollcallVoters(rc._id).catch(() => [] as string[]));
  const nonVoters = lspd.filter((m) => !voters.has(m.id)).map((m) => m.id);
  if (nonVoters.length === 0) return; // tout le monde a voté : rien à relancer.
  const chan = await channel(client, rc.channelId);
  if (!chan) return;
  const link = `https://discord.com/channels/${guild.id}/${rc.channelId}/${rc.messageId}`;
  // Discord limite le nombre de mentions par message : on découpe par 90.
  for (let i = 0; i < nonVoters.length; i += 90) {
    const chunk = nonVoters.slice(i, i + 90);
    const head = i === 0 ? `📣 **Roll call** - vous n'avez pas encore indiqué votre présence. Merci de voter : ${link}\n` : "";
    await chan.send({ content: `${head}${chunk.map((id) => `<@${id}>`).join(" ")}`, allowedMentions: { users: chunk } }).catch(() => {});
  }
  console.log(`[rollcall] relance envoyée à ${nonVoters.length} non-votant(s).`);
}

export async function closeRollcall(client: Client, rollcallId: string, channelId: string, messageId: string) {
  await mdt.rollcallClose(rollcallId);
  await refresh(client, rollcallId, channelId, messageId);
  console.log("[rollcall] appel clos.");
}

// Gestion d'un clic sur un bouton de vote.
export async function handleRollcallButton(interaction: ButtonInteraction) {
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
  if (interaction.message) await refresh(interaction.client, rollcallId, interaction.channelId, interaction.message.id);
}
