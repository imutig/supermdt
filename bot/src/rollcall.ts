import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  type Client, type TextChannel, type ButtonInteraction,
} from "discord.js";
import { mdt, type RollcallState, type RollStatus } from "./convex.js";
import { baseEmbed, BRAND } from "./theme.js";

const LABELS: Record<RollStatus, string> = { PRESENT: "Présent", RETARD: "En retard", ABSENT: "Absent" };

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
  const start = hm(state.startTime);
  return [
    `📅 ${dateStamp}${start ? `  ·  🕘 ${start}` : ""}  ·  📍 3ème étage, Poste de Vespucci`,
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

// Ouvre le roll call du jour s'il ne l'est pas déjà. Idempotent grâce à la clé
// de date côté Convex : un message posté en double est nettoyé. `pingRoleId`
// mentionne un rôle à l'ouverture (configuré sur le site).
export async function openRollcall(client: Client, channelId: string, date: string, endsAt: number, pingRoleId?: string | null, ceremony?: boolean, ceremonyTime?: string | null, startTime?: string | null) {
  const chan = await channel(client, channelId);
  if (!chan) return;
  // Roll call précédent : on supprimera son message Discord une fois le nouveau
  // posté (les présences restent en base pour l'historique).
  const prev = await mdt.rollcallPrevious(date).catch(() => null);
  const emptyState: RollcallState = { endsAt, closed: false, ceremony: !!ceremony, ceremonyTime: ceremonyTime ?? null, startTime: startTime ?? null, present: [], retard: [], absent: [] };
  const ping = pingRoleId ? { content: `<@&${pingRoleId}>`, allowedMentions: { roles: [pingRoleId] } } : {};
  const sent = await chan.send({ ...ping, embeds: [rollcallEmbed(emptyState)], components: buttons("pending") });
  const res = await mdt.rollcallOpen(date, channelId, sent.id, endsAt, ceremony, ceremonyTime, startTime);
  if (res.duplicate) {
    // Un autre roll call existait déjà : on retire notre message superflu.
    await sent.delete().catch(() => {});
    return;
  }
  // Réécrit les boutons avec le véritable id du roll call (le ping/contenu reste).
  await sent.edit({ embeds: [rollcallEmbed(emptyState)], components: buttons(res._id) });
  // Supprime le message du roll call précédent (l'historique reste en base).
  if (prev && prev.messageId !== sent.id) {
    const prevChan = await channel(client, prev.channelId);
    const prevMsg = prevChan ? await prevChan.messages.fetch(prev.messageId).catch(() => null) : null;
    await prevMsg?.delete().catch(() => {});
  }
  console.log(`[rollcall] roll call ouvert (${date}).`);
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
