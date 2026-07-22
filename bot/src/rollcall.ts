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
  return names.length === 0 ? "*—*" : names.map((n) => `• ${n}`).join("\n");
}

function rollcallEmbed(state: RollcallState): EmbedBuilder {
  const endStamp = `<t:${Math.floor(state.endsAt / 1000)}:t>`;
  const total = state.present.length + state.retard.length + state.absent.length;
  const e = baseEmbed(state.closed ? BRAND.muted : BRAND.green)
    .setTitle(state.closed ? "📋 Appel de présence — clos" : "📣 Appel de présence")
    .setDescription(
      state.closed
        ? `L'appel est terminé. **${total}** réponse${total > 1 ? "s" : ""} enregistrée${total > 1 ? "s" : ""}.`
        : `Indiquez votre présence ci-dessous. Clôture à ${endStamp}.`,
    )
    .addFields(
      { name: `✅ Présents — ${state.present.length}`, value: list(state.present), inline: true },
      { name: `⏰ En retard — ${state.retard.length}`, value: list(state.retard), inline: true },
      { name: `❌ Absents — ${state.absent.length}`, value: list(state.absent), inline: true },
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

// Ouvre l'appel du jour s'il ne l'est pas déjà. Idempotent grâce à la clé de
// date côté Convex : un message posté en double est nettoyé.
export async function openRollcall(client: Client, channelId: string, date: string, endsAt: number) {
  const chan = await channel(client, channelId);
  if (!chan) return;
  const emptyState: RollcallState = { endsAt, closed: false, present: [], retard: [], absent: [] };
  const sent = await chan.send({ embeds: [rollcallEmbed(emptyState)], components: buttons("pending") });
  const res = await mdt.rollcallOpen(date, channelId, sent.id, endsAt);
  if (res.duplicate) {
    // Un autre appel existait déjà : on retire notre message superflu.
    await sent.delete().catch(() => {});
    return;
  }
  // Réécrit les boutons avec le véritable id de l'appel.
  await sent.edit({ embeds: [rollcallEmbed(emptyState)], components: buttons(res._id) });
  console.log(`[rollcall] appel ouvert (${date}).`);
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
