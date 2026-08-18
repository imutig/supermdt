import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType,
  ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction, type ButtonInteraction, type ModalSubmitInteraction,
  type AnySelectMenuInteraction, type Guild, type TextChannel, type CategoryChannel,
  type Interaction, type Client, type Message, type User, type GuildMember, type ColorResolvable,
} from "discord.js";
import { mdt, type TicketConfig, type TicketTemplate, type IntegStatus, type RichEmbed, type EmbedField, type ArchiveMessage } from "./convex.js";
import { baseEmbed, BRAND } from "./theme.js";
import { fetchMembersCached } from "./rollcall.js";

// Rôle « Police Academy » : tuteurs habilités à voter sur les candidatures et
// dénominateur des seuils d'acceptation/refus automatiques.
const POLICE_ACADEMY_ROLE = "1511056490478178395";

// Statuts d'une candidature (cycle de vie). Le nom du salon est préfixé de
// l'emoji pour lire le statut d'un coup d'œil dans la liste des salons.
const STATUS_EMOJI: Record<IntegStatus, string> = { NEW: "🆕", VOTE: "🗳️", ACCEPTED: "📋", INTERVIEW: "📅", PASSED: "🎓", ACADEMY: "⭐", PRESENT: "🏫", REJECTED: "❌" };
const STATUS_LABEL: Record<IntegStatus, string> = {
  NEW: "Nouvelle candidature", VOTE: "Vote en cours", ACCEPTED: "Acceptée · en attente d'entretien",
  INTERVIEW: "Entretien programmé", PASSED: "Entretien réussi · en attente d'académie",
  ACADEMY: "Retenu pour la prochaine académie", PRESENT: "Présent à l'académie", REJECTED: "Refusée / entretien raté",
};
const STATUS_HEX: Record<IntegStatus, string> = { NEW: "#8a929c", VOTE: "#3b82f6", ACCEPTED: "#22b8cf", INTERVIEW: "#e0a030", PASSED: "#49a24a", ACADEMY: "#e6c84a", PRESENT: "#2f8f5b", REJECTED: "#d94040" };
const STATUS_ORDER: IntegStatus[] = ["NEW", "VOTE", "ACCEPTED", "INTERVIEW", "PASSED", "ACADEMY", "PRESENT", "REJECTED"];
// Statuts qui donnent droit au rôle Cadet (piste académie) : réussi/en attente,
// retenu pour l'académie, présent à l'académie. En sortir (ou fermer le ticket)
// retire le rôle.
const CADET_STATUSES = new Set<IntegStatus>(["PASSED", "ACADEMY", "PRESENT"]);
// Code points des emojis de préfixe (actuels + anciens) à retirer du nom du salon.
const PREFIX_CPS = new Set<string>([..."🆕🗳️📋📅🎓⭐🏫❌🟡🔴🟠🟢️"]);
const label = (s: IntegStatus | string | null): string => (s && STATUS_LABEL[s as IntegStatus]) || "-";
const emoji = (s: IntegStatus | string | null): string => (s && STATUS_EMOJI[s as IntegStatus]) || "";

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
  return empty ? buildEmbed({ ...e, description: "*Embed vide - ajoute un titre, une description ou un champ.*" }) : buildEmbed(e);
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
    new ButtonBuilder().setCustomId("tk|hub|conditions").setLabel("Conditions & infos").setEmoji("📋").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("tk|hub|statcats").setLabel("Catégories par statut").setEmoji("🗂️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("tk|hub|annoncetxt").setLabel("Texte de l'annonce").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("tk|hub|autotpl").setLabel("Automatisation").setEmoji("🤖").setStyle(ButtonStyle.Secondary),
  );
  return [category, row1, row2, row3];
}

function rolesComponents(cfg: TicketConfig) {
  const recruiters = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder().setCustomId("tk|cfg|recruiterroles").setPlaceholder("Rôles recruteurs (accès aux tickets, !r / !a, /validation)").setMinValues(0).setMaxValues(20).setDefaultRoles(cfg.recruiterRoleIds.slice(0, 20)),
  );
  const cadet = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder().setCustomId("tk|cfg|cadetrole").setPlaceholder("Rôle Cadet (attribué par /validation, ping annonce)").setMinValues(0).setMaxValues(1).setDefaultRoles(cfg.cadetRoleId ? [cfg.cadetRoleId] : []),
  );
  const promo = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder().setCustomId("tk|cfg|promoroles").setPlaceholder("Rôles ayant accès aux catégories de promo").setMinValues(0).setMaxValues(20).setDefaultRoles(cfg.promoRoleIds.slice(0, 20)),
  );
  const back = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("tk|hub|back").setLabel("Retour").setStyle(ButtonStyle.Secondary));
  return [recruiters, cadet, promo, back];
}

async function renderRoles(interaction: ButtonInteraction | AnySelectMenuInteraction) {
  const cfg = await mdt.ticketConfigGet();
  const embed = baseEmbed(BRAND.info).setTitle("👥 Rôles")
    .setDescription("Définis les rôles recruteurs (seuls à voir les tickets et à répondre), le rôle Cadet attribué par /validation, et les rôles qui voient les catégories de promotion.")
    .addFields(
      { name: "Recruteurs", value: cfg.recruiterRoleIds.length ? cfg.recruiterRoleIds.map((r) => `<@&${r}>`).join(" ") : "*aucun*" },
      { name: "Rôle Cadet", value: cfg.cadetRoleId ? `<@&${cfg.cadetRoleId}>` : "*non défini*" },
      { name: "Accès aux promos", value: cfg.promoRoleIds.length ? cfg.promoRoleIds.map((r) => `<@&${r}>`).join(" ") : "*aucun*" },
    );
  await interaction.update({ embeds: [embed], components: rolesComponents(cfg) });
}

// Catégorie Discord par statut : le ticket y est déplacé quand on choisit ce
// statut. Vide = reste dans la catégorie d'arrivée.
async function renderStatusCategories(interaction: ButtonInteraction | AnySelectMenuInteraction, editStatus?: string) {
  const cfg = await mdt.ticketConfigGet();
  const mapOf = (s: string) => cfg.statusCategories.find((x) => x.status === s)?.categoryId ?? null;
  const embed = baseEmbed(BRAND.info).setTitle("🗂️ Catégories par statut")
    .setDescription("Par défaut, tout reste dans la catégorie d'arrivée. Choisis un statut, puis sa catégorie de destination.")
    .addFields({ name: "Correspondances", value: STATUS_ORDER.map((s) => `${STATUS_EMOJI[s]} ${STATUS_LABEL[s]} → ${mapOf(s) ? `<#${mapOf(s)}>` : "*arrivée*"}`).join("\n") });
  const pick = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId("tk|statcat|pick").setPlaceholder("Choisir un statut à configurer…")
      .addOptions(...STATUS_ORDER.map((s) => ({ label: STATUS_LABEL[s], value: s, emoji: STATUS_EMOJI[s], default: editStatus === s }))),
  );
  const rows: ActionRowBuilder<StringSelectMenuBuilder | ChannelSelectMenuBuilder | ButtonBuilder>[] = [pick];
  if (editStatus) {
    rows.push(new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder().setCustomId(`tk|statcat|set|${editStatus}`).setPlaceholder(`Catégorie pour « ${STATUS_LABEL[editStatus as IntegStatus] ?? editStatus} »`).addChannelTypes(ChannelType.GuildCategory),
    ));
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`tk|statcat|clear|${editStatus}`).setLabel("Remettre en catégorie d'arrivée").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("tk|hub|back").setLabel("Retour").setStyle(ButtonStyle.Secondary),
    ));
  } else {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("tk|hub|back").setLabel("Retour").setStyle(ButtonStyle.Secondary)));
  }
  await interaction.update({ embeds: [embed], components: rows });
}
async function setStatusCategory(status: string, categoryId: string | null) {
  const cfg = await mdt.ticketConfigGet();
  const arr = cfg.statusCategories.filter((s) => s.status !== status);
  if (categoryId) arr.push({ status, categoryId });
  await mdt.ticketConfigSet({ statusCategories: arr });
}

// Automatisation des candidatures : choix des 3 templates (accusé / refus /
// acceptation) qui pilotent le flux automatique soumission -> vote -> décision.
async function renderAutoTemplates(interaction: ButtonInteraction | AnySelectMenuInteraction) {
  const [cfg, templates] = await Promise.all([mdt.ticketConfigGet(), mdt.ticketTemplateList()]);
  const nameOf = (id: string | null) => (id ? templates.find((t) => t._id === id)?.name ?? "*supprimé*" : null);
  const embed = baseEmbed(BRAND.info).setTitle("🤖 Automatisation des candidatures")
    .setDescription("À la **soumission** d'une candidature : envoi de l'**accusé de réception**, passage automatique en **Vote** (tuteurs Police Academy) et ping du rôle.\nÀ l'**issue du vote** : **≥ 50 %** de tuteurs *pour* → **acceptée** ; **> 50 %** *contre* → **refusée** (+ fermeture 6 h).")
    .addFields(
      { name: "Accusé de réception", value: nameOf(cfg.autoTplAccuse) ? `**${nameOf(cfg.autoTplAccuse)}**` : "*non défini*", inline: true },
      { name: "Refus", value: nameOf(cfg.autoTplRefus) ? `**${nameOf(cfg.autoTplRefus)}**` : "*non défini*", inline: true },
      { name: "Acceptation", value: nameOf(cfg.autoTplAccept) ? `**${nameOf(cfg.autoTplAccept)}**` : "*non défini*", inline: true },
    );
  const back = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("tk|hub|back").setLabel("Retour").setStyle(ButtonStyle.Secondary));
  if (templates.length === 0) {
    await interaction.update({ embeds: [embed.setFooter({ text: "Crée d'abord des templates (bouton Templates)." })], components: [back] });
    return;
  }
  const sel = (id: string, current: string | null, ph: string) =>
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(ph).addOptions(
        { label: "— Aucun —", value: "none", default: !current },
        ...templates.slice(0, 24).map((t) => ({ label: t.name.slice(0, 100), value: t._id, default: current === t._id })),
      ));
  await interaction.update({ embeds: [embed], components: [
    sel("tk|autotpl|accuse", cfg.autoTplAccuse, "Template — accusé de réception"),
    sel("tk|autotpl|refus", cfg.autoTplRefus, "Template — refus de candidature"),
    sel("tk|autotpl|accept", cfg.autoTplAccept, "Template — candidature acceptée"),
    back,
  ] });
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
    .setDescription(templates.length === 0 ? "Aucun template. Crée-en un avec **Nouveau template**." : templates.map((t) => `• **${t.name}** - ${t.pingOwner ? "🔔 ping" : "silencieux"}`).join("\n"));
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
    content: `🛠️ **Constructeur d'embed** - ${TARGET_LABEL[d.target]}. Édite chaque section, l'aperçu se met à jour en direct.${hint}`,
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
      ti("thumbnail", "Vignette (petite, en haut à droite) - URL", TextInputStyle.Short, e.thumbnail, false, 500),
      ti("image", "Grande image (en bas) - URL", TextInputStyle.Short, e.image, false, 500),
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
    content: "🧩 **Champs de l'embed** - ajoute, modifie ou supprime (laisse le nom vide pour supprimer).",
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

// Conditions de candidature affichées au candidat (une ligne par élément).
function conditionsModal(cfg: TicketConfig): ModalBuilder {
  return new ModalBuilder().setCustomId("tk|m|conditions").setTitle("Conditions de candidature").addComponents(
    ti("important", "Informations importantes (une par ligne)", TextInputStyle.Paragraph, cfg.importantInfo, true, 2000),
    ti("conditions", "Conditions requises (une par ligne)", TextInputStyle.Paragraph, cfg.conditionsRP, true, 2000),
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
    new ButtonBuilder().setCustomId("tk|cand|panel").setLabel("Candidater").setEmoji("📝").setStyle(ButtonStyle.Success).setDisabled(!cfg.candidaturesOpen),
  );
  return { embeds: [embed], components: [row] };
}

// ========================================================================
// Candidature par MP : le candidat écrit au bot, remplit deux modales, le
// ticket est créé côté serveur (visible des seuls recruteurs), et les échanges
// transitent par le bot (MP <-> ticket).
// ========================================================================

// État transitoire d'une candidature en cours (avant/à la création du ticket).
type CandState = { prenom: string; nom: string; naissance: string; channelId?: string; ticketPromise?: Promise<string | null> };
const candidatures = new Map<string, CandState>();

function bulletList(text: string): string {
  return text.split("\n").map((s) => s.trim()).filter(Boolean).map((s) => `• ${s}`).join("\n") || "*(aucune)*";
}

// Embed d'accueil envoyé en MP + bouton pour démarrer (une modale ne peut pas
// s'ouvrir sans une interaction : d'où le bouton).
async function startCandidatureDM(user: User): Promise<boolean> {
  const embed = baseEmbed(BRAND.green).setTitle("🎓 Candidature - Police Academy")
    .setDescription("Bienvenue. Tu t'apprêtes à déposer ta candidature à la Los Santos Police Academy. Clique sur le bouton ci-dessous pour commencer.")
    .addFields({ name: "💬 Comment nous parler", value: "**Écris-moi directement ici, en message privé**, quand tu veux : je transmets tes messages aux recruteurs, et ils te répondront de la même façon." })
    .setFooter({ text: "Tous tes échanges avec les recruteurs se font ici, en message privé." });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tk|cand|start").setLabel("Commencer ma candidature").setEmoji("📝").setStyle(ButtonStyle.Success),
  );
  try { await user.send({ embeds: [embed], components: [row] }); return true; }
  catch { return false; }
}

function identityModal(): ModalBuilder {
  return new ModalBuilder().setCustomId("tk|cand|m1").setTitle("Ta candidature (1/2)").addComponents(
    ti("prenom", "Prénom RP", TextInputStyle.Short, undefined, true, 40),
    ti("nom", "Nom RP", TextInputStyle.Short, undefined, true, 40),
    ti("naissance", "Date de naissance (JJ/MM/AAAA)", TextInputStyle.Short, undefined, true, 20),
  );
}
function dossierModal(): ModalBuilder {
  return new ModalBuilder().setCustomId("tk|cand|m2").setTitle("Ta candidature (2/2)").addComponents(
    ti("motivations", "Motivations", TextInputStyle.Paragraph, undefined, true, 1500),
    ti("experiences", "Expériences professionnelles", TextInputStyle.Paragraph, undefined, true, 1500),
  );
}

// Conditions à accepter, affichées après la modale d'identité.
function conditionsMessage(cfg: TicketConfig) {
  const embed = baseEmbed(BRAND.info).setTitle("📋 Conditions de candidature")
    .addFields(
      { name: "⚠️ Informations importantes", value: bulletList(cfg.importantInfo).slice(0, 1024) },
      { name: "Conditions requises", value: bulletList(cfg.conditionsRP).slice(0, 1024) },
    )
    .setFooter({ text: "En validant, tu certifies remplir ces conditions." });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tk|cand|accept").setLabel("J'accepte et je postule").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("tk|cand|cancel").setLabel("Annuler").setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

// Étape « dossier » : un BOUTON ouvre la modale (2/2). Ainsi, si le candidat
// ferme la fenêtre par erreur, il peut la rouvrir en recliquant.
function dossierStepMessage() {
  const embed = baseEmbed(BRAND.green).setTitle("✅ Conditions acceptées")
    .setDescription("Dernière étape : remplis ton **dossier de candidature** (motivations, expériences) en cliquant sur le bouton ci-dessous.")
    .addFields({ name: "💬 Besoin de nous parler ?", value: "Tu peux aussi **m'écrire directement ici, en message privé**, à tout moment : tes messages sont transmis aux recruteurs." })
    .setFooter({ text: "Si la fenêtre du dossier se ferme, reclique simplement sur le bouton." });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tk|cand|dossier").setLabel("Remplir mon dossier").setEmoji("📄").setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], components: [row] };
}

// Droits du ticket : @everyone masqué, rôles recruteurs autorisés, bot autorisé.
// Le candidat n'a PAS accès au salon (il échange par MP).
function recruiterOverwrites(guild: Guild, cfg: TicketConfig) {
  const rows: { id: string; allow: bigint[]; deny: bigint[] }[] = [
    { id: guild.roles.everyone.id, allow: [], deny: [PermissionFlagsBits.ViewChannel] },
  ];
  // On ignore les rôles qui n'existent plus / sont invalides : sinon discord.js
  // jette « Supplied parameter is not a cached User or Role » et la création du
  // salon échoue entièrement.
  for (const r of cfg.recruiterRoleIds) if (guild.roles.cache.has(r)) rows.push({ id: r, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles], deny: [] });
  if (guild.members.me) rows.push({ id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages], deny: [] });
  return rows;
}

// Crée le salon de ticket (recruteurs uniquement) et l'entrée en base.
async function createCandidatureTicket(client: Client, user: User, state: CandState): Promise<string | null> {
  const cfg = await mdt.ticketConfigGet();
  const guild = client.guilds.cache.first();
  if (!guild || !cfg.categoryId) return null;
  const name = applyNomenclature(cfg.nomenclature, { prenom: state.prenom, nom: state.nom, date: state.naissance || "" });
  let channel: TextChannel;
  try {
    channel = await guild.channels.create({ name, type: ChannelType.GuildText, parent: cfg.categoryId, permissionOverwrites: recruiterOverwrites(guild, cfg) });
  } catch (err) { console.error("[cand] création du salon impossible :", err); return null; }

  const embed = baseEmbed(BRAND.green).setTitle("🎓 Nouvelle candidature")
    .addFields(
      { name: "Candidat", value: `${state.prenom} ${state.nom}`, inline: true },
      { name: "Naissance", value: state.naissance || "-", inline: true },
      { name: "Discord", value: `<@${user.id}> · \`${user.username}\`` },
      { name: "Commandes recruteur", value: "`!r <msg>` répondre · `!a <msg>` répondre anonymement · `!ping` être ping à la prochaine réponse · `!alwaysping` à chaque réponse · `!unping` stop · `!close` fermer dans 10 s · `!close 24h` fermeture auto sans réponse" },
    )
    .setFooter({ text: "Dossier en cours de complétion..." }).setTimestamp(new Date());
  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tk|manage").setLabel("Statut du candidat").setEmoji("🎓").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("tk|close").setLabel("Fermer le ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger),
  );
  await channel.send({ embeds: [embed], components: [controls] });
  await mdt.ticketCreate({ channelId: channel.id, ownerId: user.id, ownerName: `${state.prenom} ${state.nom}`, prenom: state.prenom, nom: state.nom, dateNaissance: state.naissance || undefined });
  await renameStatus(client, channel.id, "NEW"); // 🆕 préfixe le salon dès l'ouverture
  state.channelId = channel.id;
  return channel.id;
}

// Modale 1 (identité) : on mémorise, puis on présente les conditions à accepter.
async function handleIdentityModal(interaction: ModalSubmitInteraction) {
  const prenom = interaction.fields.getTextInputValue("prenom").trim();
  const nom = interaction.fields.getTextInputValue("nom").trim();
  const naissance = interaction.fields.getTextInputValue("naissance").trim();
  candidatures.set(interaction.user.id, { prenom, nom, naissance });
  const cfg = await mdt.ticketConfigGet();
  await interaction.reply(conditionsMessage(cfg));
}

// Modale 2 (dossier) : complète le ticket créé à l'acceptation des conditions.
async function handleDossierModal(interaction: ModalSubmitInteraction) {
  const state = candidatures.get(interaction.user.id);
  const motivations = interaction.fields.getTextInputValue("motivations").trim();
  const experiences = interaction.fields.getTextInputValue("experiences").trim();
  await interaction.deferReply();

  let channelId: string | null = state?.channelId ?? null;
  if (!channelId && state?.ticketPromise) channelId = await state.ticketPromise;
  if (!channelId) {
    const existing = await mdt.ticketByOwner(interaction.user.id);
    channelId = existing?.channelId ?? (state ? await createCandidatureTicket(interaction.client, interaction.user, state) : null);
  }
  if (!channelId) { await interaction.editReply({ embeds: [baseEmbed(BRAND.danger).setDescription("Impossible de finaliser ta candidature. Renvoie-moi **Candidature** pour réessayer.")] }); return; }

  await mdt.ticketSetDossier(channelId, motivations, experiences);
  const chan = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (chan && chan.type === ChannelType.GuildText) {
    await (chan as TextChannel).send({ embeds: [baseEmbed(BRAND.info).setTitle("📄 Dossier de candidature").addFields(
      { name: "Motivations", value: motivations.slice(0, 1024) || "-" },
      { name: "Expériences professionnelles", value: experiences.slice(0, 1024) || "-" },
    )] }).catch(() => {});
  }
  candidatures.delete(interaction.user.id);
  await interaction.editReply({ embeds: [baseEmbed(BRAND.green).setTitle("✅ Candidature envoyée")
    .setDescription("Ton dossier est transmis aux recruteurs. Tu peux continuer à m'écrire ici : je relaie tes messages, et les recruteurs te répondront de la même façon.")] });
  // Automatisation : accusé de réception -> passage en Vote -> ping Police Academy.
  try { await startCandidatureVote(interaction.client, channelId); } catch (e) { console.error("[auto] candidature -> vote :", e); }
}

// ---------- Relais MP <-> ticket ----------

function isRecruiter(member: GuildMember | null, cfg: TicketConfig): boolean {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  return cfg.recruiterRoleIds.some((r) => member.roles.cache.has(r));
}

async function dmSay(user: User, color: ColorResolvable, desc: string, title?: string) {
  const e = baseEmbed(color).setDescription(desc);
  if (title) e.setTitle(title);
  await user.send({ embeds: [e] }).catch(() => {});
}

// Cycle de vie du rôle Cadet : attribué quand le ticket est sur la piste
// académie (PASSED/PRESENT), retiré sinon (autre statut, fermeture). Best-effort.
async function syncCadetRole(guild: Guild, ownerId: string, status: IntegStatus | null, cfg: TicketConfig) {
  if (!cfg.cadetRoleId) return;
  const member = await guild.members.fetch(ownerId).catch(() => null);
  if (!member) return;
  try {
    if (status && CADET_STATUSES.has(status)) await member.roles.add(cfg.cadetRoleId);
    else await member.roles.remove(cfg.cadetRoleId);
  } catch (err) { console.error("[cadet] gestion du rôle :", err); }
}

// Bouton « Fournir le compte SuperMDT » posté quand la présence est confirmée.
function accountButtonRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tk|account").setLabel("Fournir le compte SuperMDT").setEmoji("🎫").setStyle(ButtonStyle.Success),
  );
}

// Nom de fichier sûr pour une référence attachment:// (pas d'espace ni de
// caractère spécial, sinon l'image ne s'affiche pas dans l'embed).
function safeName(n: string, i: number): string {
  const s = (n || `fichier-${i + 1}`).replace(/[^\w.-]+/g, "_");
  return s || `fichier-${i + 1}`;
}

// Ré-attache les pièces jointes d'un message (images comprises) pour les relayer.
// Renvoie les fichiers à joindre et le nom de la 1re image (à afficher en grand).
function collectAttachments(msg: Message): { files: { attachment: string; name: string }[]; inlineName: string | null } {
  const atts = [...msg.attachments.values()];
  const files = atts.map((a, i) => ({ attachment: a.url, name: safeName(a.name ?? "", i) }));
  const imgIdx = atts.findIndex((a) => (a.contentType ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(a.name ?? ""));
  return { files, inlineName: imgIdx >= 0 ? files[imgIdx].name : null };
}

// Message du candidat (MP) retranscrit dans son ticket (images ré-uploadées).
async function relayCandidateMessage(msg: Message, channelId: string, name: string): Promise<boolean> {
  const chan = await msg.client.channels.fetch(channelId).catch(() => null);
  if (!chan || chan.type !== ChannelType.GuildText) return false;
  const { files, inlineName } = collectAttachments(msg);
  const embed = baseEmbed(BRAND.info)
    .setAuthor({ name: `${name} (candidat)`, iconURL: msg.author.displayAvatarURL() })
    .setDescription((msg.content || (files.length ? "*(pièce jointe)*" : "*(sans texte)*")).slice(0, 4000));
  if (inlineName) embed.setImage(`attachment://${inlineName}`);
  await (chan as TextChannel).send({ embeds: [embed], files });
  return true;
}

// Réponse d'un recruteur (!r nominatif / !a anonyme) envoyée au candidat en MP,
// avec un miroir dans le ticket.
async function relayRecruiterMessage(msg: Message, ownerId: string, body: string, anon: boolean) {
  const nick = msg.member?.displayName ?? msg.author.username;
  const { files, inlineName } = collectAttachments(msg);
  const senderLabel = anon ? "Recruteur" : nick;
  let delivered = true;
  try {
    const user = await msg.client.users.fetch(ownerId);
    const dm = baseEmbed(anon ? BRAND.muted : BRAND.green)
      .setDescription(`**${senderLabel}**${body ? ` : ${body}` : (files.length ? " a envoyé une pièce jointe :" : " :")}`.slice(0, 4000));
    if (inlineName) dm.setImage(`attachment://${inlineName}`);
    await user.send({ embeds: [dm], files });
  } catch { delivered = false; }
  const mirror = baseEmbed(anon ? BRAND.muted : BRAND.green)
    .setAuthor({ name: anon ? `${nick} (anonyme)` : nick, iconURL: msg.author.displayAvatarURL() })
    .setDescription((body || (files.length ? "*(pièce jointe)*" : "")).slice(0, 4000));
  if (inlineName) mirror.setImage(`attachment://${inlineName}`);
  if (!delivered) mirror.setFooter({ text: "Non reçu par le candidat (MP fermés)." });
  await (msg.channel as TextChannel).send({ embeds: [mirror], files }).catch(() => {});
}

// MP reçu par le bot : lancement de candidature ou retranscription.
export async function handleDirectMessage(msg: Message) {
  const content = (msg.content ?? "").trim();
  if (/^candidatures?$/i.test(content)) {
    const cfg = await mdt.ticketConfigGet();
    if (!cfg.candidaturesOpen) { await dmSay(msg.author, BRAND.muted, "Les candidatures sont actuellement fermées. Reviens un peu plus tard."); return; }
    const existing = await mdt.ticketByOwner(msg.author.id);
    if (existing) { await dmSay(msg.author, BRAND.muted, "Tu as déjà une candidature en cours. Écris-moi simplement ici, je transmets aux recruteurs."); return; }
    const ok = await startCandidatureDM(msg.author);
    if (!ok) await dmSay(msg.author, BRAND.danger, "Je n'ai pas pu ouvrir la procédure. Vérifie que tes messages privés sont ouverts.");
    return;
  }
  const ticket = await mdt.ticketByOwner(msg.author.id);
  if (ticket) {
    const ok = await relayCandidateMessage(msg, ticket.channelId, `${ticket.prenom} ${ticket.nom}`);
    if (ok) {
      await msg.react("📨").catch(() => {});
      // La réponse du candidat annule une éventuelle fermeture programmée.
      const cancel = await mdt.ticketCancelScheduledClose(ticket.channelId).catch(() => ({ cancelled: false }));
      if (cancel.cancelled) {
        const chan = await msg.client.channels.fetch(ticket.channelId).catch(() => null);
        if (chan && chan.type === ChannelType.GuildText) {
          await (chan as TextChannel).send({ embeds: [baseEmbed(BRAND.green).setDescription("✅ Le candidat a répondu : la fermeture automatique est **annulée**.")] }).catch(() => {});
        }
      }
      // Recruteurs abonnés aux pings (!ping / !alwaysping) : on les notifie.
      const toPing = await mdt.ticketPingConsume(ticket.channelId).catch(() => [] as string[]);
      if (toPing.length) {
        const chan = await msg.client.channels.fetch(ticket.channelId).catch(() => null);
        if (chan && chan.type === ChannelType.GuildText) {
          await (chan as TextChannel).send({ content: `📨 Réponse du candidat · ${toPing.map((id) => `<@${id}>`).join(" ")}`, allowedMentions: { users: toPing } }).catch(() => {});
        }
      }
    }
    return;
  }
  await dmSay(msg.author, BRAND.muted, "Pour déposer une candidature à la Police Academy, envoie-moi simplement le mot **Candidature**.");
}

// Délai type "24h" / "3j" / "3d" -> millisecondes (h = heures, j/d = jours).
function parseDelay(s: string): number | null {
  const m = /^(\d+)\s*([hjd])$/i.exec(s.trim());
  if (!m) return null;
  const n = +m[1];
  if (n <= 0) return null;
  return m[2].toLowerCase() === "h" ? n * 3_600_000 : n * 86_400_000;
}
function delayLabel(s: string): string {
  const m = /^(\d+)\s*([hjd])$/i.exec(s.trim());
  if (!m) return s;
  const n = +m[1];
  return m[2].toLowerCase() === "h" ? `${n} heure${n > 1 ? "s" : ""}` : `${n} jour${n > 1 ? "s" : ""}`;
}

// !close (sans argument) : ferme le ticket dans 10 s, avec un bouton « Annuler »
// pendant le décompte. Fermeture RÉELLE (archive + suppression du salon).
const pendingImmediateCloses = new Map<string, ReturnType<typeof setTimeout>>();

async function handleImmediateClose(msg: Message) {
  const chan = msg.channel as TextChannel;
  const channelId = chan.id;
  if (pendingImmediateCloses.has(channelId)) { await msg.delete().catch(() => {}); return; }
  const closeAtSec = Math.floor((Date.now() + 10_000) / 1000);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tk|cancelclose").setLabel("Annuler").setEmoji("✖️").setStyle(ButtonStyle.Secondary),
  );
  const sent = await chan.send({
    embeds: [baseEmbed(BRAND.warning).setTitle("🔒 Fermeture du ticket")
      .setDescription(`Ce ticket sera **fermé et archivé** <t:${closeAtSec}:R>.\nClique sur **Annuler** pour l'interrompre.`)],
    components: [row],
  }).catch(() => null);
  await msg.delete().catch(() => {});
  if (!sent) return;
  const timeout = setTimeout(() => {
    pendingImmediateCloses.delete(channelId);
    void sent.edit({ components: [] }).catch(() => {});
    void archiveAndDeleteChannel(msg.client, channelId);
  }, 10_000);
  pendingImmediateCloses.set(channelId, timeout);
}

// !close <délai> : programme la fermeture auto de la candidature sans réponse.
async function handleScheduledClose(msg: Message, ticket: { ownerId: string }, arg: string) {
  const ms = parseDelay(arg);
  if (ms === null) { await msg.reply("Format : `!close 24h`, `!close 3j` ou `!close 3d`.").catch(() => {}); return; }
  const closeAt = Date.now() + ms;
  const res = await mdt.ticketScheduleClose(msg.channel.id, closeAt, msg.member?.displayName ?? msg.author.username);
  if (!res) { await msg.react("⚠️").catch(() => {}); return; }
  const label = delayLabel(arg);
  const sec = Math.floor(closeAt / 1000);
  try {
    const cand = await msg.client.users.fetch(ticket.ownerId);
    await cand.send({ embeds: [baseEmbed(BRAND.warning).setTitle("⏳ Réponse attendue")
      .setDescription(`Sans réponse de ta part **dans ${label}** (avant le <t:${sec}:F>), ta candidature sera **automatiquement fermée** et tu devras **recandidater de zéro**.\n\nPour la maintenir active, réponds-moi simplement ici en message privé.`)] });
  } catch { /* MP fermés */ }
  await (msg.channel as TextChannel).send({ embeds: [baseEmbed(BRAND.warning).setDescription(`⏳ Fermeture automatique programmée dans **${label}** (<t:${sec}:R>) sauf réponse du candidat. Le candidat a été prévenu en MP.`)] }).catch(() => {});
  await msg.delete().catch(() => {});
}

// !ping / !alwaysping / !unping : le recruteur s'abonne aux pings à la réponse
// du candidat (prochaine, ou chacune), ou se désabonne.
async function handlePingSubscribe(msg: Message, cmd: string) {
  const mode = cmd === "alwaysping" ? "ALWAYS" : cmd === "unping" ? "OFF" : "ONCE";
  const res = await mdt.ticketPingSubscribe(msg.channel.id, msg.author.id, mode);
  if (!res) { await msg.react("⚠️").catch(() => {}); return; }
  const text = mode === "ALWAYS" ? "🔔 Tu seras ping à **chaque** réponse du candidat."
    : mode === "ONCE" ? "🔔 Tu seras ping à la **prochaine** réponse du candidat."
    : "🔕 Tu ne seras plus ping pour ce ticket.";
  await (msg.channel as TextChannel).send({ content: `<@${msg.author.id}> ${text}`, allowedMentions: { users: [msg.author.id] } }).catch(() => {});
  await msg.delete().catch(() => {});
}

// Message dans un salon serveur : commandes recruteur !r / !a / !close / !ping.
// Membre disposant des droits d'encadrement (équivalent message de isStaff).
function memberIsStaff(member: GuildMember | null): boolean {
  return !!member?.permissions.has(PermissionFlagsBits.ManageMessages);
}
async function msgMember(msg: Message): Promise<GuildMember | null> {
  return msg.member ?? (msg.guild ? await msg.guild.members.fetch(msg.author.id).catch(() => null) : null);
}

// !template : ouvre le menu Templates (créer / modifier / envoyer) dans le salon.
// Comme /template, mais en un seul menu (contournement des slash non visibles).
export async function openTemplateMenuMsg(msg: Message) {
  if (msg.channel.type !== ChannelType.GuildText) return;
  const cfg = await mdt.ticketConfigGet();
  const member = await msgMember(msg);
  if (!memberIsStaff(member) && !isRecruiter(member, cfg)) { await msg.react("⛔").catch(() => {}); return; }
  const templates = await mdt.ticketTemplateList();
  const embed = baseEmbed(BRAND.info).setTitle("🗂️ Templates de message")
    .setDescription(templates.length === 0 ? "Aucun template. Crée-en un avec **Nouveau template**." : templates.map((t) => `• **${t.name}** - ${t.pingOwner ? "🔔 ping" : "silencieux"}`).join("\n"));
  await msg.channel.send({ embeds: [embed], components: templatesListComponents(templates) }).catch(() => {});
}

// !statut : ouvre le panneau de statut de la candidature (dans un ticket).
export async function openStatusMenuMsg(msg: Message) {
  if (msg.channel.type !== ChannelType.GuildText) return;
  const member = await msgMember(msg);
  if (!memberIsStaff(member)) { await msg.react("⛔").catch(() => {}); return; }
  const ticket = await mdt.ticketByChannel(msg.channel.id);
  if (!ticket) { await msg.react("❓").catch(() => {}); return; }
  await msg.channel.send({ ...statusPanel(ticket.integrationStatus) }).catch(() => {});
}

export async function handleTicketChannelMessage(msg: Message) {
  const content = msg.content ?? "";
  if (/^!template\b/i.test(content)) { await openTemplateMenuMsg(msg); return; }
  if (/^!statut\b/i.test(content)) { await openStatusMenuMsg(msg); return; }
  const closeM = /^!close\b\s*(.*)$/i.exec(content);
  // !ping (prochaine réponse), !alwaysping (chaque réponse), !unping (se désabonner).
  const pingM = /^!(alwaysping|unping|ping)\b/i.exec(content);
  const relayM = /^!([ra])\b\s*([\s\S]*)$/i.exec(content);
  if (!closeM && !pingM && !relayM) return;
  const ticket = await mdt.ticketByChannel(msg.channel.id);
  if (!ticket) return;
  const cfg = await mdt.ticketConfigGet();
  const member = msg.member ?? (msg.guild ? await msg.guild.members.fetch(msg.author.id).catch(() => null) : null);
  if (!isRecruiter(member, cfg)) { await msg.react("⛔").catch(() => {}); return; }
  if (closeM) {
    const arg = closeM[1].trim();
    if (arg) await handleScheduledClose(msg, ticket, arg);
    else await handleImmediateClose(msg);
    return;
  }
  if (pingM) { await handlePingSubscribe(msg, pingM[1].toLowerCase()); return; }
  const body = relayM![2].trim();
  if (!body && msg.attachments.size === 0) { await msg.react("❓").catch(() => {}); return; }
  await relayRecruiterMessage(msg, ticket.ownerId, body, relayM![1].toLowerCase() === "a");
  await msg.delete().catch(() => {});
}

// /validation : attribue le rôle Cadet au candidat du ticket.
export async function validation(interaction: ChatInputCommandInteraction) {
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText || !interaction.guild) { await interaction.reply({ content: "À utiliser dans le salon d'un ticket.", flags: EPH }); return; }
  const cfg = await mdt.ticketConfigGet();
  if (!isRecruiter(interaction.member as GuildMember | null, cfg)) { await interaction.reply({ content: "Réservé aux recruteurs.", flags: EPH }); return; }
  const ticket = await mdt.ticketByChannel(channel.id);
  if (!ticket) { await interaction.reply({ content: "Ce salon n'est pas un ticket de candidature.", flags: EPH }); return; }
  if (!cfg.cadetRoleId) { await interaction.reply({ content: "Le rôle Cadet n'est pas configuré (/candidatures puis Rôles).", flags: EPH }); return; }
  await interaction.deferReply();
  const member = await interaction.guild.members.fetch(ticket.ownerId).catch(() => null);
  if (!member) { await interaction.editReply({ embeds: [baseEmbed(BRAND.danger).setDescription("Le candidat n'est pas (ou plus) sur le serveur.")] }); return; }
  try { await member.roles.add(cfg.cadetRoleId); }
  catch { await interaction.editReply({ embeds: [baseEmbed(BRAND.danger).setDescription("Attribution impossible : le bot a-t-il « Gérer les rôles » et un rôle placé au-dessus de Cadet ?")] }); return; }
  await mdt.ticketLogEvent(channel.id, { type: "status", label: "Validé : rôle Cadet attribué", by: interaction.user.username });
  await interaction.editReply({ embeds: [baseEmbed(BRAND.green).setTitle("✅ Candidat validé").setDescription(`<@${ticket.ownerId}> reçoit le rôle <@&${cfg.cadetRoleId}>.`)] });
  await dmSay(member.user, BRAND.green, "Ta candidature est validée : tu rejoins la Police Academy en tant que Cadet. Bienvenue !", "🎉 Félicitations");
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
  // Ticket fermé : on retire le rôle Cadet.
  if (interaction.guild) { const cfg = await mdt.ticketConfigGet(); await syncCadetRole(interaction.guild, ticket.ownerId, null, cfg); }

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

// Archive l'historique du salon sur le portail LSPA puis supprime le salon.
// Fermeture DÉFINITIVE réelle, partagée par le bouton « Fermer définitivement »,
// la fermeture immédiate (!close) et la fermeture programmée échue (!close 24h).
export async function archiveAndDeleteChannel(client: Client, channelId: string) {
  const chan = await client.channels.fetch(channelId).catch(() => null);
  if (!chan || chan.type !== ChannelType.GuildText) return;
  const ch = chan as TextChannel;
  try {
    const messages = await fetchAllMessages(ch);
    await mdt.ticketArchiveSave(ch.id, ch.name, messages);
    await ch.delete("Ticket de candidature fermé (archivé sur le portail LSPA).");
  } catch (err) {
    console.error("[ticket] archivage/suppression :", err);
  }
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

// Sérialise un message pour l'archive : contenu brut + embeds DÉTAILLÉS (auteur,
// titre, description, TOUS les champs, pied de page). Sans ça, les embeds à
// champs (dossier, identité, relais candidat/recruteur) n'affichaient qu'« Embed ».
type ArchiveEmbed = { author: string | null; title: string | null; description: string | null; fields: { name: string; value: string }[]; footer: string | null };
function messageContent(m: { content: string; embeds: ArchiveEmbed[] }): string {
  const parts: string[] = [];
  if (m.content) parts.push(m.content);
  for (const e of m.embeds) {
    const lines: string[] = [];
    const head = [e.author, e.title].filter(Boolean).join(" · ");
    if (head) lines.push(head);
    if (e.description) lines.push(e.description);
    for (const f of e.fields) lines.push(`${f.name} : ${f.value}`);
    if (e.footer) lines.push(e.footer);
    parts.push(lines.length ? lines.join("\n") : "[embed]");
  }
  return parts.join("\n\n");
}

async function fetchAllMessages(channel: TextChannel): Promise<ArchiveMessage[]> {
  const out: ArchiveMessage[] = [];
  let before: string | undefined;
  for (let i = 0; i < 6; i++) { // borne : ~600 messages
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch || batch.size === 0) break;
    for (const m of batch.values()) {
      const embeds: ArchiveEmbed[] = m.embeds.map((e) => ({
        author: e.author?.name ?? null,
        title: e.title ?? null,
        description: e.description ?? null,
        fields: (e.fields ?? []).map((f) => ({ name: f.name, value: f.value })),
        footer: e.footer?.text ?? null,
      }));
      out.push({
        authorId: m.author.id, authorName: m.author.username, bot: m.author.bot,
        content: messageContent({ content: m.content, embeds }),
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
  await interaction.reply({ content: "🗄️ Archivage de l'historique puis suppression du salon…", flags: EPH });
  await archiveAndDeleteChannel(interaction.client, channel.id);
}

// ---------- Envoi d'un template ----------

export async function sendTemplate(interaction: ChatInputCommandInteraction) {
  const name = interaction.options.getString("nom", true);
  const t = await mdt.ticketTemplateByName(name);
  if (!t) { await interaction.reply({ content: `Aucun template nommé « ${name} ».`, flags: EPH }); return; }
  const ticket = interaction.channel && interaction.channel.type === ChannelType.GuildText ? await mdt.ticketByChannel(interaction.channelId) : null;
  // Hors ticket : simple envoi de l'embed.
  if (!ticket) { await interaction.reply({ embeds: [buildEmbed(t.embed)] }); return; }
  // Dans un ticket : le template part au candidat en MP, comme une réponse !r.
  await interaction.deferReply();
  const member = interaction.member;
  const nick = (member && "displayName" in member ? (member.displayName as string) : null) ?? interaction.user.username;
  let delivered = true;
  try {
    const user = await interaction.client.users.fetch(ticket.ownerId);
    await user.send({ embeds: [buildEmbed(t.embed)] });
  } catch { delivered = false; }
  const note = baseEmbed(BRAND.green).setAuthor({ name: nick, iconURL: interaction.user.displayAvatarURL() })
    .setDescription(`Template envoyé au candidat : **${t.name}**`);
  if (!delivered) note.setFooter({ text: "Non reçu par le candidat (MP fermés)." });
  await interaction.editReply({ embeds: [buildEmbed(t.embed), note] });
}

export async function templateAutocomplete(interaction: Interaction) {
  if (!interaction.isAutocomplete()) return;
  const focused = interaction.options.getFocused().toLowerCase();
  const templates = await mdt.ticketTemplateList().catch(() => []);
  // Si la réponse arrive après le délai de Discord (requête Convex lente), le
  // token a expiré : on ignore l'erreur au lieu de faire crasher le client.
  await interaction.respond(templates.filter((t) => t.name.toLowerCase().includes(focused)).slice(0, 25).map((t) => ({ name: t.name, value: t.name }))).catch(() => {});
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
    // On filtre les rôles inexistants / invalides : un seul ID périmé faisait
    // échouer toute la création (« Supplied parameter is not a cached User or Role »).
    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...cfg.promoRoleIds.filter((id) => guild.roles.cache.has(id)).map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel] })),
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
    // Absence signalée : on garde une trace dans le journal (le statut reste
    // géré à la main via le menu « Statut du candidat »).
    await mdt.ticketLogEvent(ticket.channelId, { type: "absence", label: "Absence signalée pour la PA", by: interaction.user.username });
    await interaction.reply({ content: "🚫 Absence notée. Pense à préciser la raison dans ton ticket.", flags: EPH });
  }
}

// ---------- Intégration d'un candidat (cercles de statut) ----------

function stripPrefix(name: string): string {
  const chars = [...name];
  let i = 0;
  while (i < chars.length && PREFIX_CPS.has(chars[i])) i++;
  return chars.slice(i).join("").replace(/^[-\s]+/, "");
}
async function renameStatus(client: Client, channelId: string, status: IntegStatus | null) {
  try {
    const chan = await client.channels.fetch(channelId);
    if (!chan || chan.type !== ChannelType.GuildText) return;
    const base = stripPrefix((chan as TextChannel).name);
    await (chan as TextChannel).setName(status ? `${STATUS_EMOJI[status]}${base}` : base);
  } catch { /* rien */ }
}

// Déplace le salon vers la catégorie configurée pour ce statut, sinon vers la
// catégorie d'arrivée (par défaut, tout reste dans la même catégorie).
async function moveToStatusCategory(client: Client, channelId: string, status: IntegStatus, cfg: TicketConfig) {
  const target = cfg.statusCategories.find((s) => s.status === status)?.categoryId ?? cfg.categoryId;
  if (!target) return;
  try {
    const chan = await client.channels.fetch(channelId);
    if (chan && chan.type === ChannelType.GuildText && (chan as TextChannel).parentId !== target) {
      await (chan as TextChannel).setParent(target, { lockPermissions: false });
    }
  } catch { /* rien */ }
}

// Panneau de statut, ÉPHÉMÈRE (jamais visible du candidat) : un menu déroulant.
function statusPanel(current: IntegStatus | null) {
  const embed = baseEmbed(current ? hexToInt(STATUS_HEX[current as IntegStatus] ?? "#8a929c") : BRAND.muted).setTitle("🎓 Statut du candidat")
    .setDescription(current ? `Statut actuel : ${emoji(current)} **${label(current)}**.` : "Choisis le statut de cette candidature.")
    .addFields({ name: "Cycle de vie", value: STATUS_ORDER.map((s) => `${STATUS_EMOJI[s]} ${STATUS_LABEL[s]}`).join("\n") });
  const select = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId("tk|stsel").setPlaceholder("Définir le statut…").addOptions(
      ...STATUS_ORDER.map((s) => ({ label: STATUS_LABEL[s], value: s, emoji: STATUS_EMOJI[s], default: current === s })),
    ),
  );
  return { embeds: [embed], components: [select] };
}

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
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) return;
  // Entretien programmé : on demande la date + l'heure via une modale.
  if (status === "INTERVIEW") { await interaction.showModal(interviewModal()); return; }
  // On enregistre + on accuse réception (update du panneau) TOUT DE SUITE, puis
  // on fait les opérations lentes (renommage/déplacement de salon) : celles-ci
  // sont fortement limitées par Discord et dépasseraient le délai de 3 s.
  await mdt.ticketSetStatus(channel.id, status, interaction.user.username);
  await interaction.update(statusPanel(status));
  const cfg = await mdt.ticketConfigGet();
  try {
    await renameStatus(interaction.client, channel.id, status);
    await moveToStatusCategory(interaction.client, channel.id, status, cfg);
    if (status === "VOTE") await openVote(interaction.client, channel as TextChannel);
  } catch (err) { console.error("[status] finalisation :", err); }
  // Cycle de vie du rôle Cadet : attribué en PASSED/PRESENT, retiré sinon.
  const ticket = await mdt.ticketByChannel(channel.id);
  if (ticket && interaction.guild) await syncCadetRole(interaction.guild, ticket.ownerId, status, cfg);
  // « Présent à l'académie » : DM de confirmation + bouton de provisionnement.
  if (status === "PRESENT" && ticket) {
    const owner = await interaction.client.users.fetch(ticket.ownerId).catch(() => null);
    if (owner) await dmSay(owner, BRAND.green, "Votre présence à l'académie est confirmée, vous recevrez bientôt votre compte.", "🏫 Présence confirmée");
    await (channel as TextChannel).send({ embeds: [baseEmbed(BRAND.green).setTitle("🎫 Compte cadet").setDescription("Présence confirmée. Un instructeur peut désormais fournir le compte SuperMDT du cadet - prénom et nom sont pré-remplis, sans numéro de badge (attribué à la diplomation).")], components: [accountButtonRow()] }).catch(() => {});
  }
}

// Bouton « Fournir le compte SuperMDT » : crée le compte cadet (pré-rempli,
// sans matricule) et l'envoie en MP. Réservé à l'encadrement, statut PRESENT.
async function provideAccount(interaction: ButtonInteraction) {
  const cfg = await mdt.ticketConfigGet();
  if (!isStaff(interaction) && !isRecruiter(interaction.member as GuildMember | null, cfg)) {
    await interaction.reply({ content: "Réservé à l'encadrement.", flags: EPH }); return;
  }
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) { await interaction.reply({ content: "À utiliser dans un ticket.", flags: EPH }); return; }
  await interaction.deferReply({ flags: EPH });
  const res = await mdt.ticketProvisionAccount(channel.id, interaction.user.username);
  if (res.ok) {
    await interaction.editReply({ embeds: [baseEmbed(BRAND.green).setTitle("✅ Compte cadet créé").setDescription("Le lien d'inscription part en MP au cadet (prénom/nom pré-remplis, sans numéro de badge).")] });
    await (channel as TextChannel).send({ embeds: [baseEmbed(BRAND.green).setDescription(`🎫 Compte SuperMDT fourni par <@${interaction.user.id}>. Le cadet reçoit son lien d'inscription en message privé.`)] }).catch(() => {});
  } else {
    const msg = res.reason === "linked" ? "Ce candidat a déjà un compte SuperMDT relié."
      : res.reason === "notpresent" ? "Le compte ne peut être fourni qu'une fois le statut « Présent à l'académie » défini."
      : res.reason === "nograde" ? "Aucun grade d'académie (Cadet) n'est configuré côté MDT."
      : "Ce salon n'est pas un ticket de candidature.";
    await interaction.editReply({ embeds: [baseEmbed(BRAND.danger).setDescription(msg)] });
  }
}

// ---------- Entretien programmé (date + heure) ----------

function trow(input: TextInputBuilder) { return new ActionRowBuilder<TextInputBuilder>().addComponents(input); }
function interviewModal(prefillDate?: string, prefillHeure?: string): ModalBuilder {
  const dateInput = new TextInputBuilder().setCustomId("date").setLabel("Date (JJ/MM/AAAA)").setStyle(TextInputStyle.Short).setPlaceholder("25/12/2026").setRequired(true);
  const heureInput = new TextInputBuilder().setCustomId("heure").setLabel("Heure (HH:MM)").setStyle(TextInputStyle.Short).setPlaceholder("21:00").setRequired(true);
  if (prefillDate) dateInput.setValue(prefillDate);
  if (prefillHeure) heureInput.setValue(prefillHeure);
  return new ModalBuilder().setCustomId("tk|imodal").setTitle("Entretien programmé").addComponents(trow(dateInput), trow(heureInput));
}
// Décalage (ms) du fuseau `tz` à l'instant `utcMs`.
function tzOffsetMs(tz: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour === 24 ? 0 : +p.hour, +p.minute, +p.second);
  return asUTC - utcMs;
}
// L'heure saisie est une heure « murale » de Paris → epoch UTC correspondant.
export function parisWallToEpoch(year: number, mon: number, day: number, hr: number, min: number): number {
  const guess = Date.UTC(year, mon - 1, day, hr, min);
  let epoch = guess - tzOffsetMs("Europe/Paris", guess);
  const off2 = tzOffsetMs("Europe/Paris", epoch); // correction DST
  const epoch2 = guess - off2;
  if (epoch2 !== epoch) epoch = epoch2;
  return epoch;
}
function parseDateTime(d: string, h: string): number | null {
  const dm = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const hm = h.match(/^(\d{1,2}):(\d{2})$/);
  if (!dm || !hm) return null;
  const [day, mon, year, hr, min] = [+dm[1], +dm[2], +dm[3], +hm[1], +hm[2]];
  if (mon < 1 || mon > 12 || day < 1 || day > 31 || hr > 23 || min > 59) return null;
  const epoch = parisWallToEpoch(year, mon, day, hr, min);
  return isNaN(epoch) ? null : epoch;
}
const parisStr = (at: number, opts: Intl.DateTimeFormatOptions) => new Date(at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", ...opts });
// Champs date/heure « murale Paris » pré-remplis pour reprogrammer.
function parisDateHeure(at: number): { date: string; heure: string } {
  return { date: parisStr(at, { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "/"), heure: parisStr(at, { hour: "2-digit", minute: "2-digit" }).replace("h", ":") };
}
const PRESENCE_LABEL: Record<string, string> = { CONFIRMED: "✅ Présence confirmée par le candidat", DECLINED: "❌ Le candidat s'est déclaré indisponible" };
function interviewEmbed(at: number, presence: string | null): EmbedBuilder {
  const sec = Math.floor(at / 1000);
  return baseEmbed(hexToInt(STATUS_HEX.INTERVIEW)).setTitle("📅 Entretien programmé")
    .setDescription(`Entretien fixé au **<t:${sec}:F>** (<t:${sec}:R>).\nMerci d'être présent(e) à l'heure, en tenue correcte.`)
    .addFields({ name: "Présence du candidat", value: presence ? PRESENCE_LABEL[presence] : "⏳ En attente de confirmation" });
}
// Boutons instructeur sur la programmation.
function interviewButtons() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tk|iresched").setLabel("Reprogrammer").setEmoji("🔁").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("tk|icancel").setLabel("Annuler l'entretien").setEmoji("✖️").setStyle(ButtonStyle.Danger),
  );
}
// Boutons de confirmation envoyés au candidat en MP.
function candidateInterviewButtons() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tk|iyes").setLabel("Je confirme ma présence").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("tk|ino").setLabel("Je ne serai pas disponible").setEmoji("❌").setStyle(ButtonStyle.Danger),
  );
}
// Après une réponse de présence, on laisse le choix INVERSE : le candidat peut
// changer d'avis (confirmer puis se désister, ou l'inverse) tant que l'entretien
// est programmé.
function candidatePresenceToggle(presence: "CONFIRMED" | "DECLINED") {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (presence === "CONFIRMED") {
    row.addComponents(new ButtonBuilder().setCustomId("tk|ino").setLabel("Finalement, je ne serai pas disponible").setEmoji("❌").setStyle(ButtonStyle.Danger));
  } else {
    row.addComponents(new ButtonBuilder().setCustomId("tk|iyes").setLabel("Finalement, je confirme ma présence").setEmoji("✅").setStyle(ButtonStyle.Success));
  }
  return row;
}
async function postInterviewMessage(client: Client, channel: TextChannel, at: number) {
  const t = await mdt.ticketByChannel(channel.id);
  const embed = interviewEmbed(at, t?.interviewPresence ?? null);
  const existing = t?.interviewMsgId ? await channel.messages.fetch(t.interviewMsgId).catch(() => null) : null;
  if (existing) { await existing.edit({ embeds: [embed], components: [interviewButtons()] }); return; }
  const sent = await channel.send({ embeds: [embed], components: [interviewButtons()] });
  await mdt.ticketSetInterviewMsg(channel.id, sent.id);
}
// Re-render la programmation dans le ticket (après une réponse de présence).
async function refreshInterviewMessage(client: Client, channelId: string) {
  const t = await mdt.ticketByChannel(channelId);
  if (!t || t.interviewAt == null || !t.interviewMsgId) return;
  const chan = await client.channels.fetch(channelId).catch(() => null);
  if (!chan || chan.type !== ChannelType.GuildText) return;
  const msg = await (chan as TextChannel).messages.fetch(t.interviewMsgId).catch(() => null);
  if (msg) await msg.edit({ embeds: [interviewEmbed(t.interviewAt, t.interviewPresence ?? null)], components: [interviewButtons()] });
}

// Instructeur : reprogrammer (ouvre la modale pré-remplie avec la date actuelle).
async function handleReschedule(interaction: ButtonInteraction) {
  if (!isStaff(interaction)) { await interaction.reply({ content: "Réservé à l'encadrement.", flags: EPH }); return; }
  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) return;
  const t = await mdt.ticketByChannel(interaction.channel.id);
  const pre = t?.interviewAt ? parisDateHeure(t.interviewAt) : undefined;
  await interaction.showModal(interviewModal(pre?.date, pre?.heure));
}

// Déprogramme un entretien (manuel via bouton, ou auto faute de confirmation) :
// retour « en attente d'entretien », message + salon mis à jour, MP au candidat.
export async function deprogramInterview(client: Client, channelId: string, opts: { auto: boolean; byName?: string }) {
  const res = await mdt.ticketCancelInterview(channelId, opts.auto ? "Système (absence de confirmation)" : opts.byName);
  if (!res) return null;
  const chan = await client.channels.fetch(channelId).catch(() => null);
  if (chan && chan.type === ChannelType.GuildText) {
    const tc = chan as TextChannel;
    if (res.interviewMsgId) {
      const msg = await tc.messages.fetch(res.interviewMsgId).catch(() => null);
      if (msg) await msg.edit({ embeds: [baseEmbed(BRAND.muted).setTitle("✖️ Entretien déprogrammé")
        .setDescription(opts.auto ? "L'entretien a été **déprogrammé automatiquement** (le candidat n'a pas confirmé sa présence à temps). La candidature est de nouveau en attente d'entretien." : "L'entretien a été annulé. La candidature est de nouveau en attente d'entretien.")], components: [] }).catch(() => {});
    }
    if (opts.auto) {
      await tc.send({ embeds: [baseEmbed(BRAND.warning).setDescription(`⚠️ Entretien de **${res.prenom} ${res.nom}** **déprogrammé automatiquement** (pas de confirmation 15 min avant). Reprogrammez une date.`)] }).catch(() => {});
    }
  }
  try { await renameStatus(client, channelId, "ACCEPTED"); } catch { /* rien */ }
  try { const cfg = await mdt.ticketConfigGet(); await moveToStatusCategory(client, channelId, "ACCEPTED", cfg); } catch { /* rien */ }
  try { if (chan && chan.type === ChannelType.GuildText) await (chan as TextChannel).setTopic(""); } catch { /* rien */ }
  // MP au candidat (dans tous les cas).
  try {
    const cand = await client.users.fetch(res.ownerId);
    await cand.send({ embeds: [baseEmbed(BRAND.warning).setTitle("Entretien annulé")
      .setDescription(opts.auto
        ? "Ton entretien a été **déprogrammé** car tu ne l'as pas confirmé à temps. Ta candidature reste en cours : une nouvelle date te sera proposée. Pense à confirmer ta présence la prochaine fois."
        : "Ton entretien a été annulé. Ne t'inquiète pas : ta candidature reste en cours, une nouvelle date te sera proposée prochainement.")] });
  } catch { /* rien */ }
  return res;
}

// Instructeur : annuler l'entretien -> retour « en attente d'entretien ».
async function handleCancelInterview(interaction: ButtonInteraction) {
  if (!isStaff(interaction)) { await interaction.reply({ content: "Réservé à l'encadrement.", flags: EPH }); return; }
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) return;
  await interaction.reply({ content: "Entretien annulé. La candidature repasse en **attente d'entretien**. Le candidat a été prévenu.", flags: EPH });
  await deprogramInterview(interaction.client, channel.id, { auto: false, byName: interaction.user.username });
}

// Candidat : confirme (ou décline) sa présence depuis son MP.
async function handlePresenceButton(interaction: ButtonInteraction, presence: "CONFIRMED" | "DECLINED") {
  const res = await mdt.ticketSetPresence(interaction.user.id, presence);
  if (!res) { await interaction.update({ components: [] }).catch(() => {}); await interaction.followUp({ content: "Cet entretien n'est plus programmé.", flags: EPH }).catch(() => {}); return; }
  const sec = Math.floor(res.interviewAt / 1000);
  const embed = presence === "CONFIRMED"
    ? baseEmbed(BRAND.green).setTitle("✅ Présence confirmée").setDescription(`Merci ! Ta présence est confirmée pour l'entretien du <t:${sec}:F>.\nSi tu changes d'avis, tu peux te désister avec le bouton ci-dessous.`)
    : baseEmbed(BRAND.warning).setTitle("Indisponibilité notée").setDescription("C'est noté. Les recruteurs ont été prévenus et te proposeront une autre date.\nSi finalement tu es disponible, tu peux confirmer ci-dessous.");
  await interaction.update({ embeds: [embed], components: [candidatePresenceToggle(presence)] }).catch(() => {});
  await refreshInterviewMessage(interaction.client, res.channelId).catch(() => {});
  // Note dans le ticket (ping l'instructeur si indisponible).
  const chan = await interaction.client.channels.fetch(res.channelId).catch(() => null);
  if (chan && chan.type === ChannelType.GuildText) {
    if (presence === "CONFIRMED") {
      await (chan as TextChannel).send({ embeds: [baseEmbed(BRAND.green).setDescription(`✅ **${res.prenom} ${res.nom}** a confirmé sa présence à l'entretien.`)] }).catch(() => {});
    } else {
      await (chan as TextChannel).send({ content: res.interviewById ? `<@${res.interviewById}>` : undefined, embeds: [baseEmbed(BRAND.danger).setDescription(`❌ **${res.prenom} ${res.nom}** a signalé être **indisponible** pour l'entretien. Pense à reprogrammer.`)], allowedMentions: res.interviewById ? { users: [res.interviewById] } : undefined }).catch(() => {});
    }
  }
}
async function handleInterviewModal(interaction: ModalSubmitInteraction) {
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) { await interaction.reply({ content: "À utiliser dans un ticket.", flags: EPH }); return; }
  const at = parseDateTime(interaction.fields.getTextInputValue("date").trim(), interaction.fields.getTextInputValue("heure").trim());
  if (at === null) { await interaction.reply({ content: "Date/heure invalide. Formats attendus : JJ/MM/AAAA et HH:MM.", flags: EPH }); return; }
  // On enregistre + on répond TOUT DE SUITE (Discord expire l'interaction après
  // 3 s). Les opérations lentes (renommage/déplacement/topic, très limitées par
  // Discord) se font ensuite, hors du délai de l'interaction.
  const ticket = await mdt.ticketByChannel(channel.id);
  await mdt.ticketSetStatus(channel.id, "INTERVIEW", interaction.user.username, at, interaction.user.id);
  // INTERVIEW n'est pas un statut « cadet » : on retire le rôle si présent.
  if (ticket && interaction.guild) { const cfg = await mdt.ticketConfigGet(); await syncCadetRole(interaction.guild, ticket.ownerId, "INTERVIEW", cfg); }
  await interaction.reply({ content: `📅 Entretien programmé au **${parisStr(at, { dateStyle: "long", timeStyle: "short" })}** (heure de Paris). Le candidat a été prévenu en MP.`, flags: EPH });
  // Importants d'abord (rapides), puis renommage/déplacement (lents et limités
  // par Discord) en best-effort, chacun isolé pour ne pas se bloquer l'un l'autre.
  try { await postInterviewMessage(interaction.client, channel as TextChannel, at); } catch (err) { console.error("[interview] message ticket :", err); }
  if (ticket) {
    try {
      const cand = await interaction.client.users.fetch(ticket.ownerId);
      const sec = Math.floor(at / 1000);
      await cand.send({ embeds: [baseEmbed(BRAND.green).setTitle("📅 Entretien programmé")
        .setDescription(`Ta candidature avance ! Un entretien de recrutement est **programmé le <t:${sec}:F>** (heure de Paris).\nMerci d'être ponctuel(le) et en tenue correcte. Tu recevras un rappel 15 minutes avant.\n\n**Merci de confirmer ta présence** ci-dessous. ⚠️ Sans confirmation, le rendez-vous sera **automatiquement déprogrammé 15 minutes avant** l'heure proposée.`)], components: [candidateInterviewButtons()] });
    } catch (err) { console.error("[interview] MP candidat :", err); }
  }
  try { await renameStatus(interaction.client, channel.id, "INTERVIEW"); } catch (err) { console.error("[interview] renommage :", err); }
  try { const cfg = await mdt.ticketConfigGet(); await moveToStatusCategory(interaction.client, channel.id, "INTERVIEW", cfg); } catch (err) { console.error("[interview] déplacement :", err); }
  try { await (channel as TextChannel).setTopic(`Entretien : ${parisStr(at, { dateStyle: "short", timeStyle: "short" })}`); } catch (err) { console.error("[interview] topic :", err); }
}

// ---------- Vote pour / contre (statut « Vote en cours ») ----------

// Nombre de tuteurs = détenteurs du rôle Police Academy (dénominateur des seuils).
async function academyTutorCount(guild: Guild): Promise<number> {
  const members = await fetchMembersCached(guild);
  return members.filter((m) => m.roles.cache.has(POLICE_ACADEMY_ROLE)).size;
}
function voteEmbed(state: { for: string[]; against: string[] }, tutors: number): EmbedBuilder {
  const li = (a: string[]) => (a.length ? a.map((n) => `• ${n}`).join("\n") : "*-*");
  const acceptAt = Math.max(1, Math.ceil(tutors / 2));     // ≥ 50 %
  const refuseAt = Math.floor(tutors / 2) + 1;             // > 50 %
  return baseEmbed(hexToInt(STATUS_HEX.VOTE)).setTitle("🗳️ Vote d'intégration")
    .setDescription(`Tuteurs **Police Academy** : votez pour ou contre. Un vote par personne, modifiable.\n**${tutors} tuteur(s)** · acceptée dès **${acceptAt}** pour · refusée dès **${refuseAt}** contre.`)
    .addFields(
      { name: `✅ Pour - ${state.for.length}`, value: li(state.for), inline: true },
      { name: `❌ Contre - ${state.against.length}`, value: li(state.against), inline: true },
    );
}
function voteButtons(disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tk|vote|FOR").setLabel("Pour").setEmoji("✅").setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId("tk|vote|AGAINST").setLabel("Contre").setEmoji("❌").setStyle(ButtonStyle.Danger).setDisabled(disabled),
  );
}
async function openVote(client: Client, channel: TextChannel) {
  const t = await mdt.ticketByChannel(channel.id);
  const existing = t?.voteMsgId ? await channel.messages.fetch(t.voteMsgId).catch(() => null) : null;
  const state = (await mdt.ticketVoteState(channel.id)) ?? { for: [], against: [] };
  const tutors = await academyTutorCount(channel.guild);
  if (existing) { await existing.edit({ embeds: [voteEmbed(state, tutors)], components: [voteButtons()] }); return; }
  const sent = await channel.send({ embeds: [voteEmbed(state, tutors)], components: [voteButtons()] });
  await mdt.ticketSetVoteMsg(channel.id, sent.id);
}
async function handleVoteButton(interaction: ButtonInteraction) {
  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText || !interaction.inCachedGuild()) return;
  const t = await mdt.ticketByChannel(interaction.channel.id);
  if (t && t.ownerId === interaction.user.id) { await interaction.reply({ content: "Vous ne pouvez pas voter sur votre propre candidature.", flags: EPH }); return; }
  // Réservé aux tuteurs de la Police Academy (dénominateur des seuils).
  if (!interaction.member.roles.cache.has(POLICE_ACADEMY_ROLE)) { await interaction.reply({ content: "Seuls les tuteurs de la Police Academy peuvent voter.", flags: EPH }); return; }
  if (t && (t.integrationStatus === "ACCEPTED" || t.integrationStatus === "REJECTED")) { await interaction.reply({ content: "Le vote est clôturé.", flags: EPH }); return; }
  const choice = interaction.customId.split("|")[2] as "FOR" | "AGAINST";
  const name = interaction.member.displayName ?? interaction.user.username;
  await mdt.ticketVote(interaction.channel.id, interaction.user.id, name, choice);
  const state = (await mdt.ticketVoteState(interaction.channel.id)) ?? { for: [], against: [] };
  const tutors = await academyTutorCount(interaction.guild);
  if (interaction.message) await interaction.update({ embeds: [voteEmbed(state, tutors)], components: [voteButtons()] });
  // Décision automatique dès qu'un seuil est franchi (≥50% pour, >50% contre).
  if (tutors > 0 && state.for.length * 2 >= tutors) await finalizeVote(interaction.client, interaction.channel, "ACCEPTED").catch((e) => console.error("[vote] finalize accept :", e));
  else if (tutors > 0 && state.against.length * 2 > tutors) await finalizeVote(interaction.client, interaction.channel, "REJECTED").catch((e) => console.error("[vote] finalize refuse :", e));
}

// Envoie un template automatique (par id) au candidat en MP + miroir dans le salon.
async function sendAutoTemplate(client: Client, ownerId: string, tplId: string | null, channel: TextChannel | null): Promise<void> {
  if (!tplId) return;
  const tpl = (await mdt.ticketTemplateList()).find((t) => t._id === tplId);
  if (!tpl) return;
  let delivered = true;
  try { const u = await client.users.fetch(ownerId); await u.send({ embeds: [buildEmbed(tpl.embed)] }); } catch { delivered = false; }
  if (channel) {
    const note = baseEmbed(BRAND.green).setDescription(`Template « ${tpl.name} » envoyée au candidat${delivered ? "" : " *(MP fermés — non reçu)*"}.`);
    await channel.send({ embeds: [buildEmbed(tpl.embed), note] }).catch(() => {});
  }
}

// À la soumission d'une candidature : accusé de réception -> passage auto en Vote
// -> ping de la Police Academy. Best-effort (n'interrompt pas la soumission).
async function startCandidatureVote(client: Client, channelId: string): Promise<void> {
  const chan = await client.channels.fetch(channelId).catch(() => null);
  if (!chan || chan.type !== ChannelType.GuildText) return;
  const channel = chan as TextChannel;
  const ticket = await mdt.ticketByChannel(channelId);
  if (!ticket) return;
  const cfg = await mdt.ticketConfigGet();
  await sendAutoTemplate(client, ticket.ownerId, cfg.autoTplAccuse, channel);
  await mdt.ticketSetStatus(channelId, "VOTE", "Automatique");
  try {
    await renameStatus(client, channelId, "VOTE");
    await moveToStatusCategory(client, channelId, "VOTE", cfg);
    await openVote(client, channel);
  } catch (e) { console.error("[auto] ouverture du vote :", e); }
  await channel.send({
    content: `<@&${POLICE_ACADEMY_ROLE}>`,
    embeds: [baseEmbed(hexToInt(STATUS_HEX.VOTE)).setTitle("🗳️ Vote ouvert").setDescription("Une nouvelle candidature est prête. **Tuteurs Police Academy**, votez pour ou contre ci-dessus.")],
    allowedMentions: { roles: [POLICE_ACADEMY_ROLE] },
  }).catch(() => {});
}

// Clôture automatique du vote : statut final, boutons désactivés, template envoyée,
// + fermeture 6 h si refus. Idempotent (ne rejoue pas si déjà tranché).
async function finalizeVote(client: Client, channel: TextChannel, decision: "ACCEPTED" | "REJECTED"): Promise<void> {
  const ticket = await mdt.ticketByChannel(channel.id);
  if (!ticket || ticket.integrationStatus === "ACCEPTED" || ticket.integrationStatus === "REJECTED") return;
  const cfg = await mdt.ticketConfigGet();
  await mdt.ticketSetStatus(channel.id, decision, "Vote automatique");
  try { await renameStatus(client, channel.id, decision); await moveToStatusCategory(client, channel.id, decision, cfg); } catch (e) { console.error("[vote] finalisation salon :", e); }
  const state = (await mdt.ticketVoteState(channel.id)) ?? { for: [], against: [] };
  const tutors = await academyTutorCount(channel.guild);
  if (ticket.voteMsgId) {
    const vm = await channel.messages.fetch(ticket.voteMsgId).catch(() => null);
    if (vm) await vm.edit({ embeds: [voteEmbed(state, tutors).setFooter({ text: decision === "ACCEPTED" ? "Vote clôturé — candidature ACCEPTÉE" : "Vote clôturé — candidature REFUSÉE" })], components: [voteButtons(true)] }).catch(() => {});
  }
  if (decision === "ACCEPTED") {
    await sendAutoTemplate(client, ticket.ownerId, cfg.autoTplAccept, channel);
    await channel.send({ embeds: [baseEmbed(BRAND.green).setTitle("✅ Candidature acceptée").setDescription(`Seuil atteint (**${state.for.length}/${tutors}** tuteurs pour). Candidature **acceptée** automatiquement.`)] }).catch(() => {});
  } else {
    await sendAutoTemplate(client, ticket.ownerId, cfg.autoTplRefus, channel);
    await channel.send({ embeds: [baseEmbed(BRAND.danger).setTitle("❌ Candidature refusée").setDescription(`Seuil atteint (**${state.against.length}/${tutors}** tuteurs contre). Candidature **refusée** automatiquement. Fermeture du ticket dans **6 h**.`)] }).catch(() => {});
    await mdt.ticketScheduleClose(channel.id, Date.now() + 6 * 3600_000, "Vote automatique").catch(() => {});
  }
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

// Rôle habilité à configurer les candidatures, en plus des administrateurs.
const CANDIDATURES_ADMIN_ROLE = "1434397651465539636";
function canConfigCandidatures(interaction: ChatInputCommandInteraction | ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction): boolean {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  const roles = interaction.member && "roles" in interaction.member ? interaction.member.roles : null;
  if (roles && "cache" in roles) return roles.cache.has(CANDIDATURES_ADMIN_ROLE);
  if (Array.isArray(roles)) return roles.includes(CANDIDATURES_ADMIN_ROLE);
  return false;
}
export async function openHub(interaction: ChatInputCommandInteraction) {
  if (!canConfigCandidatures(interaction)) {
    await interaction.reply({ content: "Réservé aux administrateurs et au rôle habilité.", flags: EPH });
    return;
  }
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
    .setDescription(templates.length === 0 ? "Aucun template. Crée-en un avec `/template create` ou via /candidatures." : templates.map((t) => `• **${t.name}** - ${t.pingOwner ? "🔔 ping" : "silencieux"}`).join("\n"));
  await interaction.reply({ embeds: [embed], components: templatesListComponents(templates), flags: EPH });
}

export async function handleTicketInteraction(interaction: Interaction) {
  try {
    // Boutons
    if (interaction.isButton()) {
      const id = interaction.customId;
      // Actions de configuration du hub : réservées aux admins / rôle habilité. Le
      // hub est éphémère, mais le menu Templates (ouvrable publiquement via
      // !template) contient un « Retour » vers le hub -> on protège la config ici.
      if (((id.startsWith("tk|hub|") && id !== "tk|hub|templates") || id.startsWith("tk|cfg|") || id.startsWith("tk|statcat|")) && !canConfigCandidatures(interaction)) {
        await interaction.reply({ content: "Réservé aux administrateurs et au rôle habilité.", flags: EPH }); return;
      }
      // --- Candidature par MP ---
      if (id === "tk|cand|panel") {
        const cfg = await mdt.ticketConfigGet();
        if (!cfg.candidaturesOpen) { await interaction.reply({ content: "Les candidatures sont actuellement fermées.", flags: EPH }); return; }
        const existing = await mdt.ticketByOwner(interaction.user.id);
        if (existing) { await interaction.reply({ content: "Tu as déjà une candidature en cours. Regarde tes messages privés.", flags: EPH }); return; }
        const ok = await startCandidatureDM(interaction.user);
        await interaction.reply({ content: ok ? "Je t'ai envoyé un message privé pour démarrer ta candidature." : "Je n'arrive pas à t'écrire en privé : ouvre tes messages privés puis réessaie.", flags: EPH });
        return;
      }
      if (id === "tk|cand|start") {
        const cfg = await mdt.ticketConfigGet();
        if (!cfg.candidaturesOpen) { await interaction.reply({ content: "Les candidatures sont fermées.", flags: EPH }); return; }
        const existing = await mdt.ticketByOwner(interaction.user.id);
        if (existing) { await interaction.reply({ content: "Tu as déjà une candidature en cours.", flags: EPH }); return; }
        await interaction.showModal(identityModal()); return;
      }
      if (id === "tk|cand|cancel") {
        candidatures.delete(interaction.user.id);
        await interaction.update({ embeds: [baseEmbed(BRAND.muted).setDescription("Candidature annulée. Renvoie **Candidature** quand tu veux recommencer.")], components: [] });
        return;
      }
      if (id === "tk|cand|accept") {
        const state = candidatures.get(interaction.user.id);
        if (!state) { await interaction.reply({ content: "Ta session a expiré. Renvoie-moi **Candidature** pour recommencer.", flags: EPH }); return; }
        const existing = await mdt.ticketByOwner(interaction.user.id);
        if (existing) { await interaction.reply({ content: "Tu as déjà une candidature en cours.", flags: EPH }); return; }
        // On affiche l'étape « dossier » (bouton), et on crée le ticket en fond.
        await interaction.update(dossierStepMessage());
        state.ticketPromise = createCandidatureTicket(interaction.client, interaction.user, state);
        return;
      }
      // (Re)ouvre la modale du dossier : récupérable si la fenêtre a été fermée.
      if (id === "tk|cand|dossier") { await interaction.showModal(dossierModal()); return; }
      if (id === "tk|close") { await interaction.showModal(closeModal()); return; }
      if (id === "tk|cancelclose") {
        const to = pendingImmediateCloses.get(interaction.channelId);
        if (to) { clearTimeout(to); pendingImmediateCloses.delete(interaction.channelId); }
        await interaction.update({ embeds: [baseEmbed(BRAND.green).setTitle("✅ Fermeture annulée").setDescription(`Annulée par <@${interaction.user.id}>.`)], components: [] }).catch(() => {});
        return;
      }
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
      if (id === "tk|hub|conditions") { await interaction.showModal(conditionsModal(await mdt.ticketConfigGet())); return; }
      if (id === "tk|hub|roles") { await renderRoles(interaction); return; }
      if (id === "tk|hub|statcats") { await renderStatusCategories(interaction); return; }
      if (id === "tk|hub|autotpl") { await renderAutoTemplates(interaction); return; }
      if (id.startsWith("tk|statcat|clear|")) { const st = id.split("|")[3]; await setStatusCategory(st, null); await renderStatusCategories(interaction, st); return; }
      if (id === "tk|hub|annoncetxt") {
        const cfg = await mdt.ticketConfigGet();
        const d: Draft = { target: "announce", name: "", pingOwner: false, embed: structuredClone(cfg.announceEmbed) };
        drafts.set(interaction.user.id, d); await renderBuilder(interaction, d); return;
      }
      if (id.startsWith("tk|pres|")) { await handlePresence(interaction, true); return; }
      if (id.startsWith("tk|abs|")) { await handlePresence(interaction, false); return; }
      if (id === "tk|manage") { await openStatusPanel(interaction); return; }
      if (id === "tk|account") { await provideAccount(interaction); return; }
      if (id.startsWith("tk|vote|")) { await handleVoteButton(interaction); return; }
      if (id === "tk|iresched") { await handleReschedule(interaction); return; }
      if (id === "tk|icancel") { await handleCancelInterview(interaction); return; }
      if (id === "tk|iyes") { await handlePresenceButton(interaction, "CONFIRMED"); return; }
      if (id === "tk|ino") { await handlePresenceButton(interaction, "DECLINED"); return; }
      // Gestion des templates + constructeur d'embed : recruteurs OU encadrement
      // (les menus sont ouvrables via !template, donc publics — sans ce garde
      // n'importe quel membre pourrait cliquer « Nouveau template »/« Supprimer »).
      if ((id.startsWith("tk|tpl|") && !id.startsWith("tk|tpl|send|")) || id.startsWith("tk|b|") || id.startsWith("tk|bf|")) {
        const gcfg = await mdt.ticketConfigGet();
        if (!isStaff(interaction) && !isRecruiter(interaction.member as GuildMember | null, gcfg)) {
          await interaction.reply({ content: "Réservé aux recruteurs et à l'encadrement.", flags: EPH }); return;
        }
      }
      if (id.startsWith("tk|tpl|send|")) {
        const cfg = await mdt.ticketConfigGet();
        if (!isStaff(interaction) && !isRecruiter(interaction.member as GuildMember | null, cfg)) { await interaction.reply({ content: "Réservé à l'encadrement.", flags: EPH }); return; }
        const tpl = (await mdt.ticketTemplateList()).find((t) => t._id === id.split("|")[3]);
        if (!tpl) { await interaction.reply({ content: "Template introuvable.", flags: EPH }); return; }
        const channel = interaction.channel;
        const ticket = channel && channel.type === ChannelType.GuildText ? await mdt.ticketByChannel(channel.id) : null;
        if (!ticket) { await interaction.reply({ content: "À utiliser dans le salon d'un ticket de candidature.", flags: EPH }); return; }
        await interaction.deferReply();
        const m = interaction.member;
        const nick = (m && "displayName" in m ? (m.displayName as string) : null) ?? interaction.user.username;
        let delivered = true;
        try { const user = await interaction.client.users.fetch(ticket.ownerId); await user.send({ embeds: [buildEmbed(tpl.embed)] }); } catch { delivered = false; }
        const note = baseEmbed(BRAND.green).setAuthor({ name: nick, iconURL: interaction.user.displayAvatarURL() }).setDescription(`Template envoyé au candidat : **${tpl.name}**`);
        if (!delivered) note.setFooter({ text: "Non reçu par le candidat (MP fermés)." });
        await interaction.editReply({ embeds: [buildEmbed(tpl.embed), note] });
        return;
      }
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
    if (interaction.isChannelSelectMenu() && interaction.customId.startsWith("tk|statcat|set|")) {
      const st = interaction.customId.split("|")[3];
      await setStatusCategory(st, interaction.values[0] ?? null);
      await renderStatusCategories(interaction, st); return;
    }
    if (interaction.isRoleSelectMenu()) {
      if (interaction.customId === "tk|cfg|promoroles") { await mdt.ticketConfigSet({ promoRoleIds: [...interaction.values] }); await renderRoles(interaction); return; }
      if (interaction.customId === "tk|cfg|recruiterroles") { await mdt.ticketConfigSet({ recruiterRoleIds: [...interaction.values] }); await renderRoles(interaction); return; }
      if (interaction.customId === "tk|cfg|cadetrole") { await mdt.ticketConfigSet({ cadetRoleId: interaction.values[0] ?? null }); await renderRoles(interaction); return; }
    }
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "tk|stsel") { await applyStatusFromSelect(interaction); return; }
      if (interaction.customId === "tk|statcat|pick") { await renderStatusCategories(interaction, interaction.values[0]); return; }
      if (interaction.customId.startsWith("tk|autotpl|")) {
        if (!canConfigCandidatures(interaction)) { await interaction.reply({ content: "Réservé aux administrateurs et au rôle habilité.", flags: EPH }); return; }
        const kind = interaction.customId.split("|")[2];
        const val = interaction.values[0] === "none" ? null : interaction.values[0];
        const field = kind === "accuse" ? "autoTplAccuse" : kind === "refus" ? "autoTplRefus" : "autoTplAccept";
        await mdt.ticketConfigSet({ [field]: val });
        await renderAutoTemplates(interaction);
        return;
      }
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
          new ButtonBuilder().setCustomId(`tk|tpl|send|${tpl._id}`).setLabel("Envoyer au candidat").setEmoji("📤").setStyle(ButtonStyle.Success),
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
      if (id === "tk|cand|m1") { await handleIdentityModal(interaction); return; }
      if (id === "tk|cand|m2") { await handleDossierModal(interaction); return; }
      if (id === "tk|imodal") { await handleInterviewModal(interaction); return; }
      if (id === "tk|m|close") { await softCloseTicket(interaction); return; }
      if (id === "tk|m|nomen") { await mdt.ticketConfigSet({ nomenclature: interaction.fields.getTextInputValue("nomen") }); await renderHub(interaction, true); return; }
      if (id === "tk|m|conditions") {
        await mdt.ticketConfigSet({ importantInfo: interaction.fields.getTextInputValue("important"), conditionsRP: interaction.fields.getTextInputValue("conditions") });
        await renderHub(interaction, true); return;
      }
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
