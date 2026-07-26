import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType,
  ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction, type ButtonInteraction, type ModalSubmitInteraction,
  type AnySelectMenuInteraction, type Guild, type TextChannel, type CategoryChannel,
  type Interaction, type Client,
} from "discord.js";
import { mdt, type TicketConfig, type TicketTemplate, type IntegStatus, type RichEmbed, type EmbedField, type ArchiveMessage } from "./convex.js";
import { baseEmbed, BRAND } from "./theme.js";

// Cercles de statut d'un candidat intégré.
const STATUS_EMOJI: Record<IntegStatus, string> = { EVALUATING: "🟡", FAILED: "🔴", PASSED: "🟢", PASSED_ABSENT: "🟠" };
const STATUS_LABEL: Record<IntegStatus, string> = { EVALUATING: "En évaluation", FAILED: "Entretien raté", PASSED: "Entretien réussi", PASSED_ABSENT: "Réussi mais absent" };
const CIRCLES = "🟡🔴🟠🟢";

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

function isUrl(s: string | undefined): s is string { return !!s && /^https?:\/\/\S+$/i.test(s); }

// Construit un embed Discord à partir d'un embed riche stocké. Les URLs
// invalides sont ignorées pour ne jamais faire échouer l'envoi.
function buildEmbed(e: RichEmbed): EmbedBuilder {
  const b = new EmbedBuilder();
  b.setColor(hexToInt(e.color || "#49a24a"));
  if (e.authorName) b.setAuthor({ name: e.authorName.slice(0, 256), ...(isUrl(e.authorIcon) ? { iconURL: e.authorIcon } : {}) });
  if (e.title) b.setTitle(e.title.slice(0, 256));
  if (e.description) b.setDescription(e.description.slice(0, 4096));
  if (isUrl(e.thumbnail)) b.setThumbnail(e.thumbnail);
  if (isUrl(e.image)) b.setImage(e.image);
  if (e.footer) b.setFooter({ text: e.footer.slice(0, 2048), ...(isUrl(e.footerIcon) ? { iconURL: e.footerIcon } : {}) });
  if (e.fields?.length) b.addFields(e.fields.slice(0, 25).map((f) => ({ name: (f.name || "​").slice(0, 256), value: (f.value || "​").slice(0, 1024), inline: !!f.inline })));
  return b;
}
// Aperçu : garantit un embed non vide (Discord refuse un embed totalement vide).
function previewEmbed(e: RichEmbed): EmbedBuilder {
  const empty = !e.title && !e.description && !e.authorName && !(e.fields?.length) && !isUrl(e.image) && !isUrl(e.thumbnail);
  return empty ? buildEmbed({ ...e, description: "*Embed vide — ajoute un titre, une description ou un champ.*" }) : buildEmbed(e);
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

// ---------- Constructeur d'embed (brouillons en mémoire) ----------

// Un brouillon vise soit un template, soit le panneau public, soit le message
// d'ouverture d'un ticket. `embed` est l'embed riche en cours d'édition.
type Draft = {
  target: "template" | "panel" | "openmsg" | "announce";
  id?: string;          // id du template édité (target=template)
  name: string;         // nom du template (target=template)
  pingOwner: boolean;   // ping du propriétaire (target=template)
  embed: RichEmbed;
};
const drafts = new Map<string, Draft>();

const TARGET_LABEL: Record<Draft["target"], string> = {
  template: "template", panel: "panneau de candidature", openmsg: "message d'ouverture", announce: "annonce officielle",
};

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
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tk|hub|roles").setLabel("Rôles").setEmoji("👥").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("tk|hub|annoncetxt").setLabel("Texte de l'annonce").setStyle(ButtonStyle.Secondary),
  );
  return [category, row1, row2, row3];
}

function rolesComponents(cfg: TicketConfig) {
  const promo = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder().setCustomId("tk|cfg|promoroles").setPlaceholder("Rôles ayant accès aux catégories de promo").setMinValues(0).setMaxValues(20).setDefaultRoles(cfg.promoRoleIds.slice(0, 20)),
  );
  const cadet = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder().setCustomId("tk|cfg|cadetrole").setPlaceholder("Rôle @Cadet (ping de l'annonce)").setMinValues(0).setMaxValues(1).setDefaultRoles(cfg.cadetRoleId ? [cfg.cadetRoleId] : []),
  );
  const back = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("tk|hub|back").setLabel("Retour").setStyle(ButtonStyle.Secondary));
  return [promo, cadet, back];
}

async function renderRoles(interaction: ButtonInteraction | AnySelectMenuInteraction) {
  const cfg = await mdt.ticketConfigGet();
  const embed = baseEmbed(BRAND.info).setTitle("👥 Rôles")
    .setDescription("Définis les rôles qui voient les catégories de promotion, et le rôle @Cadet pinguée dans les annonces.")
    .addFields(
      { name: "Accès aux promos", value: cfg.promoRoleIds.length ? cfg.promoRoleIds.map((r) => `<@&${r}>`).join(" ") : "*aucun*" },
      { name: "Rôle Cadet", value: cfg.cadetRoleId ? `<@&${cfg.cadetRoleId}>` : "*non défini*" },
    );
  await interaction.update({ embeds: [embed], components: rolesComponents(cfg) });
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
        .addOptions(templates.slice(0, 25).map((t) => ({ label: t.name.slice(0, 100), value: t._id, description: (t.embed.title ?? "").slice(0, 100) || undefined }))),
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

// Constructeur d'embed riche : aperçu vivant + boutons vers les sous-modales.
function builderComponents(d: Draft) {
  const sections = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tk|b|auteur").setLabel("Auteur").setEmoji("👤").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("tk|b|texte").setLabel("Titre & texte").setEmoji("📝").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("tk|b|images").setLabel("Images").setEmoji("🖼️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("tk|b|footer").setLabel("Pied de page").setEmoji("🦶").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("tk|b|fields").setLabel(`Champs (${d.embed.fields?.length ?? 0})`).setEmoji("🧩").setStyle(ButtonStyle.Secondary),
  );
  const color = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId("tk|b|color").setPlaceholder("Couleur de la barre")
      .addOptions(COLORS.map((c) => ({ label: c.label, value: c.value, emoji: c.emoji, default: c.value.toLowerCase() === (d.embed.color ?? "#49a24a").toLowerCase() }))),
  );
  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...(d.target === "template" ? [
      new ButtonBuilder().setCustomId("tk|b|name").setLabel(d.name ? `Nom : ${d.name}`.slice(0, 60) : "Nom du template").setEmoji("🏷️").setStyle(d.name ? ButtonStyle.Secondary : ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("tk|b|ping").setLabel(d.pingOwner ? "Ping : Oui" : "Ping : Non").setEmoji(d.pingOwner ? "🔔" : "🔕").setStyle(d.pingOwner ? ButtonStyle.Success : ButtonStyle.Secondary),
    ] : []),
    new ButtonBuilder().setCustomId("tk|b|save").setLabel("Enregistrer").setEmoji("💾").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("tk|b|cancel").setLabel("Annuler").setStyle(ButtonStyle.Danger),
  );
  return [sections, color, controls];
}

async function renderBuilder(interaction: ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction | ChatInputCommandInteraction, d: Draft) {
  const preview = previewEmbed(d.embed);
  const hint = d.target === "announce"
    ? " Placeholders disponibles : `{date}` `{heure}` `{lieu}` `{promo}` `{cadet}` (remplacés à l'envoi de `/annonce`)."
    : "";
  const payload = {
    content: `🛠️ **Constructeur d'embed** — ${TARGET_LABEL[d.target]}. Édite chaque section, l'aperçu se met à jour en direct.${hint}`,
    embeds: [preview], components: builderComponents(d),
  };
  if (interaction.isMessageComponent()) await interaction.update(payload);
  else if (interaction.isModalSubmit() && interaction.isFromMessage()) await interaction.update(payload);
  else await interaction.reply({ ...payload, flags: EPH });
}

// Sous-modales du constructeur : chacune édite un groupe de champs de l'embed.
function ti(id: string, label: string, style: TextInputStyle, value: string | undefined, required: boolean, max: number) {
  const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);
  if (value) t.setValue(value);
  return new ActionRowBuilder<TextInputBuilder>().addComponents(t);
}
function sectionModal(kind: "auteur" | "texte" | "images" | "footer", e: RichEmbed): ModalBuilder {
  const m = new ModalBuilder().setCustomId(`tk|bm|${kind}`);
  if (kind === "auteur") {
    m.setTitle("En-tête (auteur)").addComponents(
      ti("authorName", "Nom de l'auteur", TextInputStyle.Short, e.authorName, false, 256),
      ti("authorIcon", "Icône de l'auteur (URL image)", TextInputStyle.Short, e.authorIcon, false, 500),
    );
  } else if (kind === "texte") {
    m.setTitle("Titre & description").addComponents(
      ti("title", "Titre", TextInputStyle.Short, e.title, false, 256),
      ti("description", "Description", TextInputStyle.Paragraph, e.description, false, 4000),
    );
  } else if (kind === "images") {
    m.setTitle("Images").addComponents(
      ti("thumbnail", "Vignette (petite, en haut à droite) — URL", TextInputStyle.Short, e.thumbnail, false, 500),
      ti("image", "Grande image (en bas) — URL", TextInputStyle.Short, e.image, false, 500),
    );
  } else {
    m.setTitle("Pied de page").addComponents(
      ti("footer", "Texte du pied de page", TextInputStyle.Short, e.footer, false, 2048),
      ti("footerIcon", "Icône du pied (URL image)", TextInputStyle.Short, e.footerIcon, false, 500),
    );
  }
  return m;
}
function nameModal(d: Draft): ModalBuilder {
  return new ModalBuilder().setCustomId("tk|bm|name").setTitle("Nom du template").addComponents(
    ti("name", "Nom du template", TextInputStyle.Short, d.name, true, 60),
  );
}

// Sous-vue « Champs » : liste, ajout, édition (nom vide = suppression).
function fieldsComponents(d: Draft) {
  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
  const fields = d.embed.fields ?? [];
  if (fields.length > 0) {
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId("tk|bf|pick").setPlaceholder("Modifier un champ…")
        .addOptions(fields.slice(0, 25).map((f, i) => ({ label: (f.name || "(sans titre)").slice(0, 100), value: String(i), description: (f.value || "").slice(0, 100) || undefined }))),
    ));
  }
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tk|bf|add").setLabel("Ajouter un champ").setEmoji("➕").setStyle(ButtonStyle.Success).setDisabled(fields.length >= 25),
    new ButtonBuilder().setCustomId("tk|bf|back").setLabel("Retour au constructeur").setStyle(ButtonStyle.Secondary),
  ));
  return rows;
}
async function renderFields(interaction: ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction, d: Draft) {
  const payload = {
    content: "🧩 **Champs de l'embed** — ajoute, modifie ou supprime (laisse le nom vide pour supprimer).",
    embeds: [previewEmbed(d.embed)], components: fieldsComponents(d),
  };
  if (interaction.isMessageComponent()) await interaction.update(payload);
  else if (interaction.isModalSubmit() && interaction.isFromMessage()) await interaction.update(payload);
  else await interaction.reply({ ...payload, flags: EPH });
}
function fieldModal(idx: number | "new", f?: EmbedField): ModalBuilder {
  return new ModalBuilder().setCustomId(`tk|bf|m|${idx}`).setTitle(idx === "new" ? "Nouveau champ" : "Modifier le champ").addComponents(
    ti("name", "Titre du champ (vide = supprimer)", TextInputStyle.Short, f?.name, false, 256),
    ti("value", "Contenu du champ", TextInputStyle.Paragraph, f?.value, false, 1024),
    ti("inline", "En ligne ? (oui / non)", TextInputStyle.Short, f ? (f.inline ? "oui" : "non") : "non", false, 4),
  );
}

// ---------- Configuration (modal nomenclature) ----------

function nomenModal(cfg: TicketConfig): ModalBuilder {
  return new ModalBuilder().setCustomId("tk|m|nomen").setTitle("Nomenclature des tickets").addComponents(
    ti("nomen", "Modèle (placeholders {prenom} {nom} {date})", TextInputStyle.Short, cfg.nomenclature, true, 80),
  );
}

// Lecture d'un champ de modale : chaîne vidée -> undefined.
function opt(interaction: ModalSubmitInteraction, field: string): string | undefined {
  const v = interaction.fields.getTextInputValue(field).trim();
  return v || undefined;
}

// Applique une sous-modale (auteur / texte / images / footer / nom) au brouillon.
async function applySectionModal(interaction: ModalSubmitInteraction, kind: string) {
  const d = drafts.get(interaction.user.id);
  if (!d) { await interaction.reply({ content: "Session expirée, relance le constructeur.", flags: EPH }); return; }
  const e = d.embed;
  if (kind === "auteur") { e.authorName = opt(interaction, "authorName"); e.authorIcon = opt(interaction, "authorIcon"); }
  else if (kind === "texte") { e.title = opt(interaction, "title"); e.description = opt(interaction, "description"); }
  else if (kind === "images") { e.thumbnail = opt(interaction, "thumbnail"); e.image = opt(interaction, "image"); }
  else if (kind === "footer") { e.footer = opt(interaction, "footer"); e.footerIcon = opt(interaction, "footerIcon"); }
  else if (kind === "name") { d.name = opt(interaction, "name") ?? ""; }
  await renderBuilder(interaction, d);
}

// Applique la modale d'un champ : nom vide = suppression.
async function applyFieldModal(interaction: ModalSubmitInteraction, idxRaw: string) {
  const d = drafts.get(interaction.user.id);
  if (!d) { await interaction.reply({ content: "Session expirée, relance le constructeur.", flags: EPH }); return; }
  const fields = d.embed.fields ?? [];
  const name = opt(interaction, "name");
  const value = opt(interaction, "value") ?? "​";
  const inline = /^(o|y|1|true)/i.test(interaction.fields.getTextInputValue("inline").trim());
  if (idxRaw === "new") {
    if (name) fields.push({ name, value, inline });
  } else {
    const idx = Number(idxRaw);
    if (!name) fields.splice(idx, 1);            // suppression
    else fields[idx] = { name, value, inline };
  }
  d.embed.fields = fields.length ? fields : undefined;
  await renderFields(interaction, d);
}

// Enregistre le brouillon selon sa cible.
async function saveDraft(interaction: ButtonInteraction) {
  const d = drafts.get(interaction.user.id);
  if (!d) return;
  const empty = !d.embed.title && !d.embed.description && !d.embed.authorName && !(d.embed.fields?.length) && !isUrl(d.embed.image) && !isUrl(d.embed.thumbnail);
  if (empty) { await interaction.reply({ content: "L'embed est vide : ajoute au moins un titre, une description, un champ ou une image.", flags: EPH }); return; }
  if (d.target === "template") {
    if (!d.name.trim()) { await interaction.reply({ content: "Donne un nom au template (bouton 🏷️ Nom) avant d'enregistrer.", flags: EPH }); return; }
    await mdt.ticketTemplateUpsert({ id: d.id, name: d.name.trim(), pingOwner: d.pingOwner, embed: d.embed });
    drafts.delete(interaction.user.id);
    await renderTemplates(interaction);
  } else if (d.target === "panel") {
    await mdt.ticketConfigSet({ panelEmbed: d.embed });
    await refreshPanel(interaction);
    drafts.delete(interaction.user.id);
    await renderHub(interaction, true);
  } else if (d.target === "announce") {
    await mdt.ticketConfigSet({ announceEmbed: d.embed });
    drafts.delete(interaction.user.id);
    await renderHub(interaction, true);
  } else {
    await mdt.ticketConfigSet({ openEmbed: d.embed });
    drafts.delete(interaction.user.id);
    await renderHub(interaction, true);
  }
}

// ---------- Panneau public + candidature ----------

function panelMessage(cfg: TicketConfig) {
  const embed = previewEmbed(cfg.panelEmbed);
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

  const embed = previewEmbed(cfg.openEmbed)
    .addFields(
      { name: "Candidat", value: `${prenom} ${nom}`, inline: true },
      ...(naissance ? [{ name: "Naissance", value: naissance, inline: true }] : []),
      { name: "Motivations", value: motivations.slice(0, 1024) },
    ).setTimestamp(new Date());
  if (!embed.data.footer) embed.setFooter({ text: "Police Academy · candidature" });
  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tk|manage").setLabel("Statut du candidat").setEmoji("🎓").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("tk|close").setLabel("Fermer le ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger),
  );
  await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [controls] });
  await mdt.ticketCreate({ channelId: channel.id, ownerId: interaction.user.id, ownerName: `${prenom} ${nom}`, prenom, nom, dateNaissance: naissance || undefined, motivations });
  await interaction.editReply({ content: `Ta candidature est créée : <#${channel.id}>` });
}

function closeModal(): ModalBuilder {
  return new ModalBuilder().setCustomId("tk|m|close").setTitle("Fermer le ticket").addComponents(
    ti("reason", "Raison de la fermeture", TextInputStyle.Paragraph, undefined, true, 1000),
  );
}

// Fermeture « douce » : le candidat (ou un recruteur) ferme son ticket. Le
// candidat perd l'accès au salon ; un panneau réservé aux recruteurs apparaît
// pour rouvrir ou fermer définitivement.
async function softCloseTicket(interaction: ModalSubmitInteraction) {
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) { await interaction.reply({ content: "À utiliser dans un salon de ticket.", flags: EPH }); return; }
  const reason = interaction.fields.getTextInputValue("reason").trim();
  const by = interaction.user.username;
  const ticket = await mdt.ticketClose(channel.id, reason, by);
  if (!ticket) { await interaction.reply({ content: "Ce salon n'est pas un ticket.", flags: EPH }); return; }
  // Le candidat perd l'accès (lecture + écriture).
  await (channel as TextChannel).permissionOverwrites.edit(ticket.ownerId, { ViewChannel: false, SendMessages: false }).catch(() => {});

  const embed = baseEmbed(BRAND.muted).setTitle("🔒 Ticket fermé")
    .setDescription(`Fermé par <@${interaction.user.id}>.`)
    .addFields({ name: "Raison", value: reason || "*non précisée*" })
    .setFooter({ text: "Réservé à l'encadrement : rouvrir ou archiver définitivement." });
  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tk|reopen").setLabel("Rouvrir le ticket").setEmoji("🔓").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("tk|delete").setLabel("Fermer définitivement").setEmoji("🗄️").setStyle(ButtonStyle.Danger),
  );
  await interaction.reply({ embeds: [embed], components: [controls] });
}

async function reopenTicket(interaction: ButtonInteraction) {
  if (!isStaff(interaction)) { await interaction.reply({ content: "Réservé à l'encadrement.", flags: EPH }); return; }
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) return;
  const t = await mdt.ticketReopen(channel.id, interaction.user.username);
  if (!t) { await interaction.reply({ content: "Ce salon n'est pas un ticket.", flags: EPH }); return; }
  await (channel as TextChannel).permissionOverwrites.edit(t.ownerId, { ViewChannel: true, SendMessages: true }).catch(() => {});
  await interaction.update({ embeds: [baseEmbed(BRAND.green).setTitle("🔓 Ticket réouvert").setDescription(`Réouvert par <@${interaction.user.id}>. Le candidat retrouve l'accès.`)], components: [] });
  await (channel as TextChannel).send({ content: `<@${t.ownerId}>`, embeds: [baseEmbed(BRAND.green).setDescription("Ton ticket a été réouvert par l'encadrement.")] }).catch(() => {});
}

// Sérialise un message pour l'archive (contenu + embeds condensés).
function messageContent(m: { content: string; embeds: { title: string | null; description: string | null }[] }): string {
  const parts: string[] = [];
  if (m.content) parts.push(m.content);
  for (const e of m.embeds) {
    const bits = [e.title, e.description].filter(Boolean).join(" — ");
    if (bits) parts.push(`[embed] ${bits}`);
    else parts.push("[embed]");
  }
  return parts.join("\n");
}

async function fetchAllMessages(channel: TextChannel): Promise<ArchiveMessage[]> {
  const out: ArchiveMessage[] = [];
  let before: string | undefined;
  for (let i = 0; i < 6; i++) { // borne : ~600 messages
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch || batch.size === 0) break;
    for (const m of batch.values()) {
      out.push({
        authorId: m.author.id, authorName: m.author.username, bot: m.author.bot,
        content: messageContent({ content: m.content, embeds: m.embeds.map((e) => ({ title: e.title, description: e.description })) }),
        at: m.createdTimestamp,
        attachments: m.attachments.size ? [...m.attachments.values()].map((a) => a.url) : undefined,
      });
    }
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }
  return out.sort((a, b) => a.at - b.at);
}

// Fermeture définitive : archive l'historique complet sur le portail LSPA puis
// supprime le salon.
async function deleteTicket(interaction: ButtonInteraction) {
  if (!isStaff(interaction)) { await interaction.reply({ content: "Réservé à l'encadrement.", flags: EPH }); return; }
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) return;
  const ch = channel as TextChannel;
  await interaction.reply({ content: "🗄️ Archivage de l'historique puis suppression du salon…", flags: EPH });
  try {
    const messages = await fetchAllMessages(ch);
    await mdt.ticketArchiveSave(ch.id, ch.name, messages);
    await ch.delete("Ticket de candidature fermé définitivement (archivé sur le portail LSPA).");
  } catch (err) {
    console.error("[ticket] archivage/suppression :", err);
    await interaction.editReply({ content: "Échec de l'archivage ou de la suppression du salon." }).catch(() => {});
  }
}

// ---------- Envoi d'un template ----------

export async function sendTemplate(interaction: ChatInputCommandInteraction) {
  const name = interaction.options.getString("nom", true);
  const t = await mdt.ticketTemplateByName(name);
  if (!t) { await interaction.reply({ content: `Aucun template nommé « ${name} ».`, flags: EPH }); return; }
  const ticket = interaction.channel && interaction.channel.type === ChannelType.GuildText ? await mdt.ticketByChannel(interaction.channelId) : null;
  const ping = t.pingOwner && ticket ? `<@${ticket.ownerId}>` : undefined;
  await interaction.reply({ ...(ping ? { content: ping } : {}), embeds: [buildEmbed(t.embed)] });
}

export async function templateAutocomplete(interaction: Interaction) {
  if (!interaction.isAutocomplete()) return;
  const focused = interaction.options.getFocused().toLowerCase();
  const templates = await mdt.ticketTemplateList().catch(() => []);
  await interaction.respond(templates.filter((t) => t.name.toLowerCase().includes(focused)).slice(0, 25).map((t) => ({ name: t.name, value: t.name })));
}

// ---------- Annonce officielle ----------

const MONTHS: Record<string, number> = { janvier: 0, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6, aout: 7, septembre: 8, octobre: 9, novembre: 10, decembre: 11 };
function noAccent(s: string): string { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
// "JJ/MM/AAAA" ou "25 juillet 2026" -> minuit UTC du jour calendaire, ou null.
// On travaille en UTC de bout en bout (bot en heure locale, Convex en UTC) pour
// éviter tout décalage d'un jour sur la clé de rapprochement des promos.
function parseDate(s: string): number | null {
  const t = s.trim();
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(t);
  if (m) {
    const d = +m[1], mo = +m[2], y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    const ts = Date.UTC(y, mo - 1, d);
    const dt = new Date(ts);
    return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? ts : null;
  }
  const m2 = /^(\d{1,2})\s+([a-zà-ÿ]+)\.?\s+(\d{4})$/i.exec(t);
  if (m2 && noAccent(m2[2]) in MONTHS) {
    return Date.UTC(+m2[3], MONTHS[noAccent(m2[2])], +m2[1]);
  }
  return null;
}

function announceModal(): ModalBuilder {
  return new ModalBuilder().setCustomId("tk|m|annonce").setTitle("Annonce de Police Academy").addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("name").setLabel("Nom de la promo (facultatif)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("date").setLabel("Date (JJ/MM/AAAA ou 25 juillet 2026)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("heure").setLabel("Heure (ex. 20h30)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("lieu").setLabel("Lieu de rendez-vous").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
  );
}

// Substitue les placeholders de l'annonce dans tous les textes de l'embed.
function fillEmbed(e: RichEmbed, vars: Record<string, string>): RichEmbed {
  const sub = (s: string | undefined) => s?.replace(/\{(date|heure|lieu|promo|cadet)\}/gi, (_, k) => vars[k.toLowerCase()] ?? "");
  return {
    ...e,
    authorName: sub(e.authorName), title: sub(e.title), description: sub(e.description),
    footer: sub(e.footer),
    fields: e.fields?.map((f) => ({ ...f, name: sub(f.name) ?? f.name, value: sub(f.value) ?? f.value })),
  };
}

function announceEmbed(cfg: TicketConfig, promoName: string, dateStr: string, heure: string, lieu: string): EmbedBuilder {
  const cadet = cfg.cadetRoleId ? `<@&${cfg.cadetRoleId}>` : "**Cadet**";
  return buildEmbed(fillEmbed(cfg.announceEmbed, { date: dateStr, heure, lieu, promo: promoName, cadet }));
}

function presenceButtons(promotionId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`tk|pres|${promotionId}`).setLabel("Je serai présent").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`tk|abs|${promotionId}`).setLabel("Je serai absent").setEmoji("🚫").setStyle(ButtonStyle.Danger),
  );
}

// Crée la catégorie d'une promo (droits : staff configuré + bot, @everyone masqué).
async function createPromoCategory(guild: Guild, name: string, cfg: TicketConfig): Promise<string | null> {
  try {
    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...cfg.promoRoleIds.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel] })),
      ...(guild.members.me ? [{ id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels] }] : []),
    ];
    const cat = await guild.channels.create({ name, type: ChannelType.GuildCategory, permissionOverwrites: overwrites });
    return cat.id;
  } catch (err) {
    console.error("[promo] création de catégorie impossible :", err);
    return null;
  }
}

async function postAnnouncement(interaction: ModalSubmitInteraction) {
  const guild = interaction.guild;
  if (!guild || !interaction.channel || interaction.channel.type !== ChannelType.GuildText) { await interaction.reply({ content: "À utiliser dans un salon textuel du serveur.", flags: EPH }); return; }
  const dateTs = parseDate(interaction.fields.getTextInputValue("date"));
  if (dateTs === null) { await interaction.reply({ content: "Date invalide. Format : JJ/MM/AAAA (ou « 25 juillet 2026 »).", flags: EPH }); return; }
  await interaction.deferReply({ flags: EPH });

  const name = interaction.fields.getTextInputValue("name").trim();
  const heure = interaction.fields.getTextInputValue("heure").trim();
  const lieu = interaction.fields.getTextInputValue("lieu").trim();
  const dateStr = new Date(dateTs).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  const promo = await mdt.promoUpsertByDate(dateTs, name || undefined, heure, lieu);
  const cfg = await mdt.ticketConfigGet();
  // Catégorie de la promo, créée si besoin.
  let categoryId = promo.discordCategoryId;
  if (!categoryId) {
    categoryId = await createPromoCategory(guild, promo.name, cfg);
    if (categoryId) await mdt.promoSetCategory(promo.promotionId, categoryId);
  }

  const content = cfg.cadetRoleId ? `<@&${cfg.cadetRoleId}>` : undefined;
  await (interaction.channel as TextChannel).send({ ...(content ? { content } : {}), embeds: [announceEmbed(cfg, promo.name, dateStr, heure, lieu)], components: [presenceButtons(promo.promotionId)] });
  await interaction.editReply({ content: `Annonce publiée. Promotion ${promo.created ? "créée" : "reliée"} : **${promo.name}**${categoryId ? ` (catégorie <#${categoryId}>)` : " (catégorie non créée : vérifie les droits du bot)"}.` });
}

async function handlePresence(interaction: ButtonInteraction, present: boolean) {
  const promotionId = interaction.customId.split("|")[2];
  const ticket = await mdt.ticketByOwner(interaction.user.id);
  if (!ticket) { await interaction.reply({ content: "Aucun ticket de candidature ouvert à ton nom.", flags: EPH }); return; }

  if (present) {
    const promo = await mdt.promoGet(promotionId);
    if (!promo?.discordCategoryId) { await interaction.reply({ content: "La catégorie de la promotion n'existe pas encore.", flags: EPH }); return; }
    try {
      const chan = await interaction.client.channels.fetch(ticket.channelId);
      if (chan && chan.type === ChannelType.GuildText) await (chan as TextChannel).setParent(promo.discordCategoryId, { lockPermissions: false });
    } catch (err) { console.error("[presence] déplacement impossible :", err); }
    await mdt.ticketSetPromotion(ticket.channelId, promotionId);
    await mdt.ticketLogEvent(ticket.channelId, { type: "presence", label: "Présence confirmée à la PA", by: interaction.user.username });
    await interaction.reply({ content: `✅ Présence enregistrée. Ton ticket rejoint la promotion.`, flags: EPH });
  } else {
    // Absence : un candidat reçu passe en « réussi mais absent ».
    if (ticket.integrationStatus === "PASSED") {
      await mdt.ticketSetStatus(ticket.channelId, "PASSED_ABSENT", interaction.user.username);
      await renameStatus(interaction.client, ticket.channelId, "PASSED_ABSENT");
    }
    await mdt.ticketLogEvent(ticket.channelId, { type: "absence", label: "Absence signalée pour la PA", by: interaction.user.username });
    await interaction.reply({ content: "🚫 Absence notée. Pense à préciser la raison dans ton ticket.", flags: EPH });
  }
}

// ---------- Intégration d'un candidat (cercles de statut) ----------

function stripCircle(name: string): string {
  const chars = [...name];
  let i = 0;
  while (i < chars.length && CIRCLES.includes(chars[i])) i++;
  return chars.slice(i).join("").replace(/^[-\s]+/, "");
}
async function renameStatus(client: Client, channelId: string, status: IntegStatus | null) {
  try {
    const chan = await client.channels.fetch(channelId);
    if (!chan || chan.type !== ChannelType.GuildText) return;
    const base = stripCircle((chan as TextChannel).name);
    await (chan as TextChannel).setName(status ? `${STATUS_EMOJI[status]}${base}` : base);
  } catch { /* rien */ }
}

// Panneau de statut, ÉPHÉMÈRE (jamais visible du candidat) : un menu déroulant.
function statusPanel(current: IntegStatus | null) {
  const embed = baseEmbed(current ? hexToInt(STATUS_HEX[current]) : BRAND.muted).setTitle("🎓 Statut du candidat")
    .setDescription(current ? `Statut actuel : ${STATUS_EMOJI[current]} **${STATUS_LABEL[current]}**.` : "Ce candidat n'est pas encore intégré. Choisis un statut pour l'intégrer à la Police Academy.")
    .addFields({ name: "Légende", value: "🟡 en évaluation · 🟢 réussi · 🟠 réussi mais absent · 🔴 raté" });
  const select = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId("tk|stsel").setPlaceholder("Définir le statut…").addOptions(
      { label: "En évaluation", value: "EVALUATING", emoji: "🟡", default: current === "EVALUATING" },
      { label: "Entretien réussi", value: "PASSED", emoji: "🟢", default: current === "PASSED" },
      { label: "Réussi mais absent", value: "PASSED_ABSENT", emoji: "🟠", default: current === "PASSED_ABSENT" },
      { label: "Entretien raté", value: "FAILED", emoji: "🔴", default: current === "FAILED" },
    ),
  );
  return { embeds: [embed], components: [select] };
}
const STATUS_HEX: Record<IntegStatus, string> = { EVALUATING: "#e6c84a", FAILED: "#d94040", PASSED: "#49a24a", PASSED_ABSENT: "#e0a030" };

// Réservé au staff : la config d'un ticket ne doit jamais être manipulable par
// le candidat.
function isStaff(interaction: ButtonInteraction | ChatInputCommandInteraction | AnySelectMenuInteraction): boolean {
  return !!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
}

// Ouvre le panneau de statut (éphémère) depuis le bouton du ticket ou /integrer.
async function openStatusPanel(interaction: ButtonInteraction | ChatInputCommandInteraction) {
  if (!isStaff(interaction)) { await interaction.reply({ content: "Réservé à l'encadrement.", flags: EPH }); return; }
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) { await interaction.reply({ content: "À utiliser dans le salon d'un ticket.", flags: EPH }); return; }
  const ticket = await mdt.ticketByChannel(channel.id);
  if (!ticket) { await interaction.reply({ content: "Ce salon n'est pas un ticket de candidature.", flags: EPH }); return; }
  await interaction.reply({ ...statusPanel(ticket.integrationStatus), flags: EPH });
}

async function applyStatusFromSelect(interaction: AnySelectMenuInteraction) {
  if (!isStaff(interaction)) { await interaction.reply({ content: "Réservé à l'encadrement.", flags: EPH }); return; }
  const status = interaction.values[0] as IntegStatus;
  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) return;
  await mdt.ticketSetStatus(interaction.channel.id, status, interaction.user.username);
  await renameStatus(interaction.client, interaction.channel.id, status);
  await syncCadetRole(interaction, interaction.channel.id, status);
  await interaction.update(statusPanel(status));
}

// Le rôle @Cadet est donné dès qu'un candidat est reçu (réussi / réussi mais
// absent) et retiré s'il repasse en évaluation ou en échec. Nécessite que le
// bot ait « Gérer les rôles » et un rôle placé au-dessus de @Cadet.
async function syncCadetRole(interaction: AnySelectMenuInteraction, channelId: string, status: IntegStatus) {
  try {
    const cfg = await mdt.ticketConfigGet();
    if (!cfg.cadetRoleId || !interaction.guild) return;
    const ticket = await mdt.ticketByChannel(channelId);
    if (!ticket) return;
    const member = await interaction.guild.members.fetch(ticket.ownerId).catch(() => null);
    if (!member) return;
    const grant = status === "PASSED" || status === "PASSED_ABSENT";
    if (grant) await member.roles.add(cfg.cadetRoleId).catch(() => {});
    else await member.roles.remove(cfg.cadetRoleId).catch(() => {});
  } catch (err) { console.error("[ticket] rôle cadet :", err); }
}

// Réconciliation : crée les catégories manquantes (promos créées sur le site).
export async function reconcilePromoCategories(client: Client) {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;
    const cfg = await mdt.ticketConfigGet();
    const pending = await mdt.promosNeedingCategory();
    for (const p of pending) {
      const categoryId = await createPromoCategory(guild, p.name, cfg);
      if (categoryId) await mdt.promoSetCategory(p.promotionId, categoryId);
    }
  } catch (err) { console.error("[promo] réconciliation impossible :", err); }
}

// Suppression de promo demandée sur le site : renvoie les tickets restants dans
// la catégorie des candidatures, supprime la catégorie de la promo, puis
// finalise la suppression côté MDT.
export async function reconcilePromoDeletions(client: Client) {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;
    const pending = await mdt.promosPendingDeletion();
    if (pending.length === 0) return;
    const cfg = await mdt.ticketConfigGet();
    for (const p of pending) {
      if (p.discordCategoryId) {
        const cat = await guild.channels.fetch(p.discordCategoryId).catch(() => null);
        if (cat && cat.type === ChannelType.GuildCategory) {
          // Déplace les salons restants vers la catégorie classique (ou détache).
          for (const child of (cat as CategoryChannel).children.cache.values()) {
            await child.setParent(cfg.categoryId ?? null, { lockPermissions: false }).catch(() => {});
          }
          await (cat as CategoryChannel).delete("Promotion supprimée depuis le portail LSPA.").catch(() => {});
        }
      }
      await mdt.promoFinalizeDeletion(p.promotionId);
    }
  } catch (err) { console.error("[promo] suppression impossible :", err); }
}

export async function openAnnounce(interaction: ChatInputCommandInteraction) {
  await interaction.showModal(announceModal());
}
export async function integrer(interaction: ChatInputCommandInteraction) {
  await openStatusPanel(interaction);
}

// ---------- Routage central des interactions « tk| » ----------

export function isTicketInteraction(id: string): boolean {
  return id.startsWith("tk|");
}

export async function openHub(interaction: ChatInputCommandInteraction) {
  await renderHub(interaction, false);
}

function newTemplateDraft(): Draft {
  return { target: "template", name: "", pingOwner: false, embed: { color: "#49a24a" } };
}

// /template create : ouvre directement le constructeur d'embed riche.
export async function startTemplateBuilder(interaction: ChatInputCommandInteraction) {
  const d = newTemplateDraft();
  drafts.set(interaction.user.id, d);
  await renderBuilder(interaction, d);
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
      if (id === "tk|close") { await interaction.showModal(closeModal()); return; }
      if (id === "tk|reopen") { await reopenTicket(interaction); return; }
      if (id === "tk|delete") { await deleteTicket(interaction); return; }
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
      if (id === "tk|hub|panel") {
        const cfg = await mdt.ticketConfigGet();
        const d: Draft = { target: "panel", name: "", pingOwner: false, embed: structuredClone(cfg.panelEmbed) };
        drafts.set(interaction.user.id, d); await renderBuilder(interaction, d); return;
      }
      if (id === "tk|hub|openmsg") {
        const cfg = await mdt.ticketConfigGet();
        const d: Draft = { target: "openmsg", name: "", pingOwner: false, embed: structuredClone(cfg.openEmbed) };
        drafts.set(interaction.user.id, d); await renderBuilder(interaction, d); return;
      }
      if (id === "tk|hub|nomen") { await interaction.showModal(nomenModal(await mdt.ticketConfigGet())); return; }
      if (id === "tk|hub|roles") { await renderRoles(interaction); return; }
      if (id === "tk|hub|annoncetxt") {
        const cfg = await mdt.ticketConfigGet();
        const d: Draft = { target: "announce", name: "", pingOwner: false, embed: structuredClone(cfg.announceEmbed) };
        drafts.set(interaction.user.id, d); await renderBuilder(interaction, d); return;
      }
      if (id.startsWith("tk|pres|")) { await handlePresence(interaction, true); return; }
      if (id.startsWith("tk|abs|")) { await handlePresence(interaction, false); return; }
      if (id === "tk|manage") { await openStatusPanel(interaction); return; }
      if (id === "tk|tpl|new") { const d = newTemplateDraft(); drafts.set(interaction.user.id, d); await renderBuilder(interaction, d); return; }

      // --- Constructeur d'embed ---
      if (id === "tk|b|auteur" || id === "tk|b|texte" || id === "tk|b|images" || id === "tk|b|footer") {
        const d = drafts.get(interaction.user.id);
        if (d) await interaction.showModal(sectionModal(id.split("|")[2] as "auteur" | "texte" | "images" | "footer", d.embed));
        return;
      }
      if (id === "tk|b|name") { const d = drafts.get(interaction.user.id); if (d) await interaction.showModal(nameModal(d)); return; }
      if (id === "tk|b|fields") { const d = drafts.get(interaction.user.id); if (d) await renderFields(interaction, d); return; }
      if (id === "tk|b|ping") { const d = drafts.get(interaction.user.id); if (d) { d.pingOwner = !d.pingOwner; await renderBuilder(interaction, d); } return; }
      if (id === "tk|b|cancel") {
        const d = drafts.get(interaction.user.id);
        drafts.delete(interaction.user.id);
        if (d && d.target !== "template") await renderHub(interaction, true);
        else await renderTemplates(interaction);
        return;
      }
      if (id === "tk|b|save") { await saveDraft(interaction); return; }
      if (id === "tk|bf|add") { const d = drafts.get(interaction.user.id); if (d) await interaction.showModal(fieldModal("new")); return; }
      if (id === "tk|bf|back") { const d = drafts.get(interaction.user.id); if (d) await renderBuilder(interaction, d); return; }

      if (id.startsWith("tk|tpl|del|")) { await mdt.ticketTemplateDelete(id.split("|")[3]); await renderTemplates(interaction); return; }
      if (id.startsWith("tk|tpl|edit|")) {
        const tpl = (await mdt.ticketTemplateList()).find((t) => t._id === id.split("|")[3]);
        if (tpl) { const d: Draft = { target: "template", id: tpl._id, name: tpl.name, pingOwner: tpl.pingOwner, embed: structuredClone(tpl.embed) }; drafts.set(interaction.user.id, d); await renderBuilder(interaction, d); }
        return;
      }
      return;
    }

    // Sélecteurs
    if (interaction.isChannelSelectMenu() && interaction.customId === "tk|cfg|category") {
      await mdt.ticketConfigSet({ categoryId: interaction.values[0] });
      await renderHub(interaction, true); return;
    }
    if (interaction.isRoleSelectMenu()) {
      if (interaction.customId === "tk|cfg|promoroles") { await mdt.ticketConfigSet({ promoRoleIds: [...interaction.values] }); await renderRoles(interaction); return; }
      if (interaction.customId === "tk|cfg|cadetrole") { await mdt.ticketConfigSet({ cadetRoleId: interaction.values[0] ?? null }); await renderRoles(interaction); return; }
    }
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "tk|stsel") { await applyStatusFromSelect(interaction); return; }
      if (interaction.customId === "tk|b|color") { const d = drafts.get(interaction.user.id); if (d) { d.embed.color = interaction.values[0]; await renderBuilder(interaction, d); } return; }
      if (interaction.customId === "tk|bf|pick") {
        const d = drafts.get(interaction.user.id);
        const idx = Number(interaction.values[0]);
        const f = d?.embed.fields?.[idx];
        if (d && f) await interaction.showModal(fieldModal(idx, f));
        return;
      }
      if (interaction.customId === "tk|tpl|pick") {
        const tpl = (await mdt.ticketTemplateList()).find((t) => t._id === interaction.values[0]);
        if (!tpl) { await renderTemplates(interaction); return; }
        const embed = buildEmbed(tpl.embed).setFooter({ text: `Template « ${tpl.name} » · ${tpl.pingOwner ? "ping activé" : "sans ping"}` });
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
      if (id === "tk|m|close") { await softCloseTicket(interaction); return; }
      if (id === "tk|m|nomen") { await mdt.ticketConfigSet({ nomenclature: interaction.fields.getTextInputValue("nomen") }); await renderHub(interaction, true); return; }
      if (id === "tk|m|annonce") { await postAnnouncement(interaction); return; }

      // --- Sous-modales du constructeur d'embed ---
      if (id.startsWith("tk|bm|")) { await applySectionModal(interaction, id.split("|")[2]); return; }
      if (id.startsWith("tk|bf|m|")) { await applyFieldModal(interaction, id.split("|")[3]); return; }
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
