import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType,
  ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction, type ButtonInteraction, type ModalSubmitInteraction,
  type AnySelectMenuInteraction, type Guild, type TextChannel, type CategoryChannel,
  type Interaction,
} from "discord.js";
import { mdt, type TicketConfig, type TicketTemplate } from "./convex.js";
import { baseEmbed, BRAND } from "./theme.js";

const EPH = MessageFlags.Ephemeral;

// ---------- Utilitaires ----------

function hexToInt(hex: string): number {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return Number.isFinite(n) ? n : (BRAND.green as number);
}

// Nom de salon depuis la nomenclature : minuscules, tirets, sans accents.
function slugify(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 90) || "ticket";
}
function applyNomenclature(pattern: string, v: { prenom: string; nom: string; date: string }): string {
  const out = pattern.replace(/\{prenom\}/gi, v.prenom).replace(/\{nom\}/gi, v.nom).replace(/\{date\}/gi, v.date);
  return slugify(out);
}

// Embed d'un template / brouillon (l'aperçu = le rendu final).
function templateEmbed(t: { title: string; description: string; color: string }): EmbedBuilder {
  return new EmbedBuilder().setColor(hexToInt(t.color)).setTitle(t.title || "Sans titre").setDescription(t.description || "*Aucun texte.*");
}

// Couleurs proposées dans le constructeur.
const COLORS: { label: string; value: string; emoji: string }[] = [
  { label: "Vert académie", value: "#49a24a", emoji: "🟢" },
  { label: "Laiton", value: "#c4a24a", emoji: "🟡" },
  { label: "Bleu", value: "#3b82f6", emoji: "🔵" },
  { label: "Rouge", value: "#d94040", emoji: "🔴" },
  { label: "Orange", value: "#e0a030", emoji: "🟠" },
  { label: "Violet", value: "#8b5cf6", emoji: "🟣" },
  { label: "Gris", value: "#8a929c", emoji: "⚪" },
];

// ---------- Brouillons de template (en mémoire, le temps de la création) ----------

type Draft = { id?: string; name: string; title: string; description: string; color: string; pingOwner: boolean };
const drafts = new Map<string, Draft>();

// ---------- Panneau central : /candidatures ----------

function hubComponents(cfg: TicketConfig) {
  const category = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder().setCustomId("tk|cfg|category").setPlaceholder(cfg.categoryId ? "Catégorie des tickets (définie)" : "Choisir la catégorie des tickets")
      .addChannelTypes(ChannelType.GuildCategory),
  );
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tk|hub|toggle").setLabel(cfg.candidaturesOpen ? "Fermer les candidatures" : "Ouvrir les candidatures").setEmoji(cfg.candidaturesOpen ? "🔒" : "✅").setStyle(cfg.candidaturesOpen ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId("tk|hub|publish").setLabel("Publier le panneau").setEmoji("📣").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("tk|hub|templates").setLabel("Templates").setEmoji("🗂️").setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tk|hub|panel").setLabel("Texte du panneau").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("tk|hub|openmsg").setLabel("Message d'ouverture").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("tk|hub|nomen").setLabel("Nomenclature").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("tk|hub|nick").setLabel(cfg.renameNick ? "Renommage : ON" : "Renommage : OFF").setStyle(cfg.renameNick ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
  return [category, row1, row2];
}

function hubEmbed(cfg: TicketConfig, templateCount: number): EmbedBuilder {
  return baseEmbed(cfg.candidaturesOpen ? BRAND.green : BRAND.muted)
    .setTitle("🎫 Système de candidatures")
    .setDescription("Configure ici le système de tickets de la Police Academy. Utilise les boutons ci-dessous.")
    .addFields(
      { name: "Candidatures", value: cfg.candidaturesOpen ? "🟢 **Ouvertes**" : "🔴 **Fermées**", inline: true },
      { name: "Catégorie", value: cfg.categoryId ? `<#${cfg.categoryId}>` : "*non définie*", inline: true },
      { name: "Panneau", value: cfg.panelMessageId ? "✅ publié" : "*non publié*", inline: true },
      { name: "Nomenclature", value: `\`${cfg.nomenclature}\``, inline: true },
      { name: "Renommage du pseudo", value: cfg.renameNick ? "activé" : "désactivé", inline: true },
      { name: "Templates", value: `${templateCount}`, inline: true },
    );
}

async function renderHub(interaction: ButtonInteraction | ChatInputCommandInteraction | AnySelectMenuInteraction | ModalSubmitInteraction, edit: boolean) {
  const [cfg, templates] = await Promise.all([mdt.ticketConfigGet(), mdt.ticketTemplateList()]);
  const payload = { embeds: [hubEmbed(cfg, templates.length)], components: hubComponents(cfg) };
  if (edit && "update" in interaction && interaction.isMessageComponent()) await interaction.update(payload);
  else if (edit && interaction.isModalSubmit() && interaction.isFromMessage()) await interaction.update(payload);
  else await interaction.reply({ ...payload, flags: EPH });
}

// ---------- Templates ----------

function templatesListComponents(templates: TicketTemplate[]) {
  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
  if (templates.length > 0) {
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId("tk|tpl|pick").setPlaceholder("Ouvrir un template…")
        .addOptions(templates.slice(0, 25).map((t) => ({ label: t.name.slice(0, 100), value: t._id, description: t.title.slice(0, 100) || undefined }))),
    ));
  }
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tk|tpl|new").setLabel("Nouveau template").setEmoji("➕").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("tk|hub|back").setLabel("Retour").setStyle(ButtonStyle.Secondary),
  ));
  return rows;
}

async function renderTemplates(interaction: ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction) {
  const templates = await mdt.ticketTemplateList();
  const embed = baseEmbed(BRAND.info).setTitle("🗂️ Templates de message")
    .setDescription(templates.length === 0 ? "Aucun template. Crée-en un avec **Nouveau template**." : templates.map((t) => `• **${t.name}** — ${t.pingOwner ? "🔔 ping" : "silencieux"}`).join("\n"));
  const payload = { embeds: [embed], components: templatesListComponents(templates) };
  if (interaction.isMessageComponent()) await interaction.update(payload);
  else if (interaction.isModalSubmit() && interaction.isFromMessage()) await interaction.update(payload);
  else await interaction.reply({ ...payload, flags: EPH });
}

// Constructeur : aperçu vivant + contrôles.
function builderComponents(d: Draft) {
  const color = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId("tk|b|color").setPlaceholder("Couleur")
      .addOptions(COLORS.map((c) => ({ label: c.label, value: c.value, emoji: c.emoji, default: c.value.toLowerCase() === d.color.toLowerCase() }))),
  );
  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tk|b|ping").setLabel(d.pingOwner ? "Ping : Oui" : "Ping : Non").setEmoji(d.pingOwner ? "🔔" : "🔕").setStyle(d.pingOwner ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("tk|b|edit").setLabel("Modifier le texte").setEmoji("✏️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("tk|b|save").setLabel("Enregistrer").setEmoji("💾").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("tk|b|cancel").setLabel("Annuler").setStyle(ButtonStyle.Danger),
  );
  return [color, controls];
}

async function renderBuilder(interaction: ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction, d: Draft) {
  const preview = templateEmbed(d).setFooter({ text: `Aperçu du template « ${d.name} »` });
  const payload = { content: "Voici l'aperçu de ton template. Ajuste la couleur, le ping, puis enregistre.", embeds: [preview], components: builderComponents(d) };
  if (interaction.isMessageComponent()) await interaction.update(payload);
  else if (interaction.isModalSubmit() && interaction.isFromMessage()) await interaction.update(payload);
  else await interaction.reply({ ...payload, flags: EPH });
}

function templateModal(d?: Draft): ModalBuilder {
  return new ModalBuilder().setCustomId("tk|m|tpl").setTitle(d?.id ? "Modifier le template" : "Nouveau template").addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("name").setLabel("Nom du template").setStyle(TextInputStyle.Short).setValue(d?.name ?? "").setRequired(true).setMaxLength(60)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("title").setLabel("Titre de l'embed").setStyle(TextInputStyle.Short).setValue(d?.title ?? "").setRequired(true).setMaxLength(256)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("description").setLabel("Message").setStyle(TextInputStyle.Paragraph).setValue(d?.description ?? "").setRequired(true).setMaxLength(3800)),
  );
}

// ---------- Configuration (modals) ----------

function configModal(cfg: TicketConfig, kind: "panel" | "openmsg" | "nomen"): ModalBuilder {
  const m = new ModalBuilder();
  if (kind === "panel") {
    m.setCustomId("tk|m|panel").setTitle("Texte du panneau de candidature").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("title").setLabel("Titre").setStyle(TextInputStyle.Short).setValue(cfg.panelTitle).setRequired(true).setMaxLength(256)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("text").setLabel("Texte").setStyle(TextInputStyle.Paragraph).setValue(cfg.panelText).setRequired(true).setMaxLength(2000)),
    );
  } else if (kind === "openmsg") {
    m.setCustomId("tk|m|openmsg").setTitle("Message d'ouverture du ticket").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("title").setLabel("Titre").setStyle(TextInputStyle.Short).setValue(cfg.openTitle).setRequired(true).setMaxLength(256)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("text").setLabel("Texte").setStyle(TextInputStyle.Paragraph).setValue(cfg.openText).setRequired(true).setMaxLength(2000)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("color").setLabel("Couleur (hex, ex. #49a24a)").setStyle(TextInputStyle.Short).setValue(cfg.openColor).setRequired(false).setMaxLength(7)),
    );
  } else {
    m.setCustomId("tk|m|nomen").setTitle("Nomenclature des tickets").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("nomen").setLabel("Modèle (placeholders {prenom} {nom} {date})").setStyle(TextInputStyle.Short).setValue(cfg.nomenclature).setRequired(true).setMaxLength(80)),
    );
  }
  return m;
}

// ---------- Panneau public + candidature ----------

function panelMessage(cfg: TicketConfig) {
  const embed = baseEmbed(BRAND.green).setTitle(cfg.panelTitle).setDescription(cfg.panelText);
  if (!cfg.candidaturesOpen) embed.addFields({ name: "​", value: "🔴 *Les candidatures sont actuellement fermées.*" });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tk|apply").setLabel("Soumettre ma candidature").setEmoji("📝").setStyle(ButtonStyle.Success).setDisabled(!cfg.candidaturesOpen),
  );
  return { embeds: [embed], components: [row] };
}

function applyModal(): ModalBuilder {
  return new ModalBuilder().setCustomId("tk|m|apply").setTitle("Ma candidature").addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("prenom").setLabel("Prénom RP").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("nom").setLabel("Nom RP").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("naissance").setLabel("Date de naissance").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("motivations").setLabel("Motivations").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500)),
  );
}

// Droits du salon de ticket : hérite de la catégorie (les rôles staff gardent
// accès), refuse @everyone, autorise le candidat et le bot.
function ticketOverwrites(guild: Guild, category: CategoryChannel | null, applicantId: string) {
  const map = new Map<string, { id: string; allow: bigint[]; deny: bigint[] }>();
  if (category) for (const po of category.permissionOverwrites.cache.values()) map.set(po.id, { id: po.id, allow: po.allow.toArray().map(BigInt), deny: po.deny.toArray().map(BigInt) });
  map.set(guild.roles.everyone.id, { id: guild.roles.everyone.id, allow: [], deny: [PermissionFlagsBits.ViewChannel] });
  map.set(applicantId, { id: applicantId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles], deny: [] });
  if (guild.members.me) map.set(guild.members.me.id, { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels], deny: [] });
  return [...map.values()];
}

async function createTicket(interaction: ModalSubmitInteraction) {
  const cfg = await mdt.ticketConfigGet();
  if (!cfg.candidaturesOpen) { await interaction.reply({ content: "Les candidatures sont fermées.", flags: EPH }); return; }
  const guild = interaction.guild;
  if (!guild) { await interaction.reply({ content: "Action possible uniquement sur le serveur.", flags: EPH }); return; }
  if (!cfg.categoryId) { await interaction.reply({ content: "La catégorie des tickets n'est pas configurée. Un responsable doit la définir via /candidatures.", flags: EPH }); return; }

  await interaction.deferReply({ flags: EPH });
  const prenom = interaction.fields.getTextInputValue("prenom").trim();
  const nom = interaction.fields.getTextInputValue("nom").trim();
  const naissance = interaction.fields.getTextInputValue("naissance").trim();
  const motivations = interaction.fields.getTextInputValue("motivations").trim();

  const category = guild.channels.cache.get(cfg.categoryId) as CategoryChannel | undefined;
  const name = applyNomenclature(cfg.nomenclature, { prenom, nom, date: naissance || "" });

  let channel: TextChannel;
  try {
    channel = await guild.channels.create({
      name, type: ChannelType.GuildText, parent: cfg.categoryId,
      permissionOverwrites: ticketOverwrites(guild, category ?? null, interaction.user.id),
    });
  } catch (err) {
    console.error("[ticket] création du salon impossible :", err);
    await interaction.editReply({ content: "Impossible de créer le ticket (le bot a-t-il la permission Gérer les salons ?)." });
    return;
  }

  // Renommage du pseudo en Prénom Nom RP.
  if (cfg.renameNick && interaction.member && "setNickname" in interaction.member) {
    await interaction.member.setNickname(`${prenom} ${nom}`).catch(() => {/* hiérarchie de rôles insuffisante */});
  }

  const embed = new EmbedBuilder().setColor(hexToInt(cfg.openColor)).setTitle(cfg.openTitle).setDescription(cfg.openText)
    .addFields(
      { name: "Candidat", value: `${prenom} ${nom}`, inline: true },
      ...(naissance ? [{ name: "Naissance", value: naissance, inline: true }] : []),
      { name: "Motivations", value: motivations.slice(0, 1024) },
    ).setFooter({ text: "Police Academy · candidature" }).setTimestamp(new Date());
  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tk|close").setLabel("Fermer le ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger),
  );
  await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [controls] });
  await mdt.ticketCreate({ channelId: channel.id, ownerId: interaction.user.id, ownerName: `${prenom} ${nom}`, prenom, nom, dateNaissance: naissance || undefined, motivations });
  await interaction.editReply({ content: `Ta candidature est créée : <#${channel.id}>` });
}

async function closeTicket(interaction: ButtonInteraction) {
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) return;
  await mdt.ticketClose(channel.id);
  const ticket = await mdt.ticketByChannel(channel.id);
  if (ticket && interaction.guild) {
    await (channel as TextChannel).permissionOverwrites.edit(ticket.ownerId, { SendMessages: false }).catch(() => {});
  }
  await interaction.reply({ embeds: [baseEmbed(BRAND.muted).setTitle("🔒 Ticket fermé").setDescription(`Fermé par <@${interaction.user.id}>.`)] });
}

// ---------- Envoi d'un template ----------

export async function sendTemplate(interaction: ChatInputCommandInteraction) {
  const name = interaction.options.getString("nom", true);
  const t = await mdt.ticketTemplateByName(name);
  if (!t) { await interaction.reply({ content: `Aucun template nommé « ${name} ».`, flags: EPH }); return; }
  const ticket = interaction.channel && interaction.channel.type === ChannelType.GuildText ? await mdt.ticketByChannel(interaction.channelId) : null;
  const ping = t.pingOwner && ticket ? `<@${ticket.ownerId}>` : undefined;
  await interaction.reply({ ...(ping ? { content: ping } : {}), embeds: [templateEmbed(t)] });
}

export async function templateAutocomplete(interaction: Interaction) {
  if (!interaction.isAutocomplete()) return;
  const focused = interaction.options.getFocused().toLowerCase();
  const templates = await mdt.ticketTemplateList().catch(() => []);
  await interaction.respond(templates.filter((t) => t.name.toLowerCase().includes(focused)).slice(0, 25).map((t) => ({ name: t.name, value: t.name })));
}

// ---------- Routage central des interactions « tk| » ----------

export function isTicketInteraction(id: string): boolean {
  return id.startsWith("tk|");
}

export async function openHub(interaction: ChatInputCommandInteraction) {
  await renderHub(interaction, false);
}

// /template create : lance le constructeur (modal puis aperçu).
export async function startTemplateBuilder(interaction: ChatInputCommandInteraction) {
  drafts.delete(interaction.user.id);
  await interaction.showModal(templateModal());
}

// /template list : liste des templates.
export async function renderTemplatesCmd(interaction: ChatInputCommandInteraction) {
  const templates = await mdt.ticketTemplateList();
  const embed = baseEmbed(BRAND.info).setTitle("🗂️ Templates de message")
    .setDescription(templates.length === 0 ? "Aucun template. Crée-en un avec `/template create` ou via /candidatures." : templates.map((t) => `• **${t.name}** — ${t.pingOwner ? "🔔 ping" : "silencieux"}`).join("\n"));
  await interaction.reply({ embeds: [embed], components: templatesListComponents(templates), flags: EPH });
}

export async function handleTicketInteraction(interaction: Interaction) {
  try {
    // Boutons
    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id === "tk|apply") {
        const cfg = await mdt.ticketConfigGet();
        if (!cfg.candidaturesOpen) { await interaction.reply({ content: "Les candidatures sont actuellement fermées.", flags: EPH }); return; }
        await interaction.showModal(applyModal()); return;
      }
      if (id === "tk|close") { await closeTicket(interaction); return; }
      if (id === "tk|hub|back") { await renderHub(interaction, true); return; }
      if (id === "tk|hub|templates") { await renderTemplates(interaction); return; }
      if (id === "tk|hub|toggle") {
        const cfg = await mdt.ticketConfigGet();
        await mdt.ticketConfigSet({ candidaturesOpen: !cfg.candidaturesOpen });
        await refreshPanel(interaction);
        await renderHub(interaction, true); return;
      }
      if (id === "tk|hub|nick") {
        const cfg = await mdt.ticketConfigGet();
        await mdt.ticketConfigSet({ renameNick: !cfg.renameNick });
        await renderHub(interaction, true); return;
      }
      if (id === "tk|hub|publish") { await publishPanel(interaction); return; }
      if (id === "tk|hub|panel") { await interaction.showModal(configModal(await mdt.ticketConfigGet(), "panel")); return; }
      if (id === "tk|hub|openmsg") { await interaction.showModal(configModal(await mdt.ticketConfigGet(), "openmsg")); return; }
      if (id === "tk|hub|nomen") { await interaction.showModal(configModal(await mdt.ticketConfigGet(), "nomen")); return; }
      if (id === "tk|tpl|new") { drafts.delete(interaction.user.id); await interaction.showModal(templateModal()); return; }
      if (id === "tk|b|ping") { const d = drafts.get(interaction.user.id); if (d) { d.pingOwner = !d.pingOwner; await renderBuilder(interaction, d); } return; }
      if (id === "tk|b|edit") { const d = drafts.get(interaction.user.id); if (d) await interaction.showModal(templateModal(d)); return; }
      if (id === "tk|b|cancel") { drafts.delete(interaction.user.id); await interaction.update({ content: "Création annulée.", embeds: [], components: [] }); return; }
      if (id === "tk|b|save") {
        const d = drafts.get(interaction.user.id);
        if (!d) return;
        await mdt.ticketTemplateUpsert(d);
        drafts.delete(interaction.user.id);
        await renderTemplates(interaction); return;
      }
      if (id.startsWith("tk|tpl|del|")) { await mdt.ticketTemplateDelete(id.split("|")[3]); await renderTemplates(interaction); return; }
      if (id.startsWith("tk|tpl|edit|")) {
        const tpl = (await mdt.ticketTemplateList()).find((t) => t._id === id.split("|")[3]);
        if (tpl) { drafts.set(interaction.user.id, { id: tpl._id, name: tpl.name, title: tpl.title, description: tpl.description, color: tpl.color, pingOwner: tpl.pingOwner }); await interaction.showModal(templateModal(drafts.get(interaction.user.id))); }
        return;
      }
      return;
    }

    // Sélecteurs
    if (interaction.isChannelSelectMenu() && interaction.customId === "tk|cfg|category") {
      await mdt.ticketConfigSet({ categoryId: interaction.values[0] });
      await renderHub(interaction, true); return;
    }
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "tk|b|color") { const d = drafts.get(interaction.user.id); if (d) { d.color = interaction.values[0]; await renderBuilder(interaction, d); } return; }
      if (interaction.customId === "tk|tpl|pick") {
        const tpl = (await mdt.ticketTemplateList()).find((t) => t._id === interaction.values[0]);
        if (!tpl) { await renderTemplates(interaction); return; }
        const embed = templateEmbed(tpl).setFooter({ text: `Template « ${tpl.name} » · ${tpl.pingOwner ? "ping activé" : "sans ping"}` });
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`tk|tpl|edit|${tpl._id}`).setLabel("Modifier").setEmoji("✏️").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`tk|tpl|del|${tpl._id}`).setLabel("Supprimer").setEmoji("🗑️").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("tk|hub|templates").setLabel("Retour").setStyle(ButtonStyle.Secondary),
        );
        await interaction.update({ content: "", embeds: [embed], components: [row] }); return;
      }
    }

    // Modals
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;
      if (id === "tk|m|apply") { await createTicket(interaction); return; }
      if (id === "tk|m|panel") {
        await mdt.ticketConfigSet({ panelTitle: interaction.fields.getTextInputValue("title"), panelText: interaction.fields.getTextInputValue("text") });
        await refreshPanel(interaction);
        await renderHub(interaction, true); return;
      }
      if (id === "tk|m|openmsg") {
        const color = interaction.fields.getTextInputValue("color").trim();
        await mdt.ticketConfigSet({ openTitle: interaction.fields.getTextInputValue("title"), openText: interaction.fields.getTextInputValue("text"), ...(color ? { openColor: color } : {}) });
        await renderHub(interaction, true); return;
      }
      if (id === "tk|m|nomen") { await mdt.ticketConfigSet({ nomenclature: interaction.fields.getTextInputValue("nomen") }); await renderHub(interaction, true); return; }
      if (id === "tk|m|tpl") {
        const prev = drafts.get(interaction.user.id);
        const d: Draft = {
          id: prev?.id,
          name: interaction.fields.getTextInputValue("name").trim(),
          title: interaction.fields.getTextInputValue("title").trim(),
          description: interaction.fields.getTextInputValue("description"),
          color: prev?.color ?? "#49a24a",
          pingOwner: prev?.pingOwner ?? false,
        };
        drafts.set(interaction.user.id, d);
        await renderBuilder(interaction, d); return;
      }
    }
  } catch (err) {
    console.error("[ticket] erreur d'interaction :", err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Une erreur est survenue.", flags: EPH }).catch(() => {});
    }
  }
}

// Publie (ou republie) le panneau de candidature dans le salon courant.
async function publishPanel(interaction: ButtonInteraction) {
  const cfg = await mdt.ticketConfigGet();
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) { await interaction.reply({ content: "Utilise ce bouton dans un salon textuel où publier le panneau.", flags: EPH }); return; }
  const sent = await (channel as TextChannel).send(panelMessage(cfg));
  await mdt.ticketConfigSet({ panelChannelId: channel.id, panelMessageId: sent.id });
  await interaction.reply({ content: `Panneau publié dans <#${channel.id}>.`, flags: EPH });
}

// Met à jour le message du panneau existant (état ouvert/fermé, textes).
async function refreshPanel(interaction: ButtonInteraction | ModalSubmitInteraction) {
  const cfg = await mdt.ticketConfigGet();
  if (!cfg.panelChannelId || !cfg.panelMessageId) return;
  try {
    const chan = await interaction.client.channels.fetch(cfg.panelChannelId);
    if (chan && chan.type === ChannelType.GuildText) {
      const msg = await (chan as TextChannel).messages.fetch(cfg.panelMessageId).catch(() => null);
      if (msg) await msg.edit(panelMessage(cfg));
    }
  } catch { /* le panneau a pu être supprimé */ }
}
