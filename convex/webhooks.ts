import { v } from "convex/values";
import { action, internalAction, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";

// ============ Catalogue des événements notifiables ============
// Source de vérité : l'UI de configuration liste ces entrées, groupées par domaine.
export const WEBHOOK_EVENTS: { slug: string; group: string; label: string }[] = [
  { slug: "bolo.create", group: "Avis de recherche", label: "Avis de recherche émis" },
  { slug: "bolo.close", group: "Avis de recherche", label: "Avis de recherche clos" },

  { slug: "mandat.create", group: "Mandats", label: "Mandat émis" },
  { slug: "mandat.execute", group: "Mandats", label: "Mandat exécuté" },
  { slug: "mandat.annul", group: "Mandats", label: "Mandat annulé" },

  { slug: "contravention.create", group: "Contraventions", label: "Contravention émise" },
  { slug: "contravention.annul", group: "Contraventions", label: "Contravention annulée" },
  { slug: "amende.paid", group: "Contraventions", label: "Amende marquée payée" },

  { slug: "casier.create", group: "Casier", label: "Entrée de casier créée" },
  { slug: "casier.closed", group: "Casier", label: "Dossier d'arrestation clôturé" },

  { slug: "rapport.submit", group: "Rapports", label: "Rapport soumis" },
  { slug: "rapport.validate", group: "Rapports", label: "Rapport validé" },

  { slug: "agent.pending", group: "Effectif", label: "Nouvelle inscription en attente" },
  { slug: "agent.validate", group: "Effectif", label: "Agent validé" },
  { slug: "agent.grade", group: "Effectif", label: "Promotion / rétrogradation" },
  { slug: "agent.deactivate", group: "Effectif", label: "Agent désactivé" },

  { slug: "discipline.create", group: "Discipline", label: "Sanction disciplinaire ouverte" },
  { slug: "absence.request", group: "Discipline", label: "Demande d'absence" },

  { slug: "defcon.change", group: "Opérations", label: "Changement de DEFCON" },
  { slug: "operation.start", group: "Opérations", label: "Opération lancée" },
  { slug: "operation.end", group: "Opérations", label: "Opération terminée" },

  { slug: "plainte.create", group: "Divers", label: "Plainte déposée" },
  { slug: "saisie.create", group: "Divers", label: "Saisie enregistrée" },
];

const VALID = new Set(WEBHOOK_EVENTS.map((e) => e.slug));

// ============ Adresse du MDT (liens profonds des webhooks) ============
export const baseUrl = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "webhooks.manage");
    return (await ctx.db.query("integrationConfig").first())?.baseUrl ?? "";
  },
});

// Configuration du bot Discord (salons + heure du récap), éditée sur le site.
export const botConfig = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "webhooks.manage");
    const c = await ctx.db.query("integrationConfig").first();
    return {
      presenceChannel: c?.botPresenceChannel ?? "",
      dailyChannel: c?.botDailyChannel ?? "",
      rollcallChannel: c?.botRollcallChannel ?? "",
      dailyAt: c?.botDailyAt ?? "23:30",
    };
  },
});

export const setBotConfig = mutation({
  args: {
    presenceChannel: v.optional(v.string()),
    dailyChannel: v.optional(v.string()),
    rollcallChannel: v.optional(v.string()),
    dailyAt: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "webhooks.manage");
    // Un id de salon Discord est une suite de 17 à 20 chiffres.
    const chan = (v?: string) => {
      const t = (v ?? "").trim();
      if (t && !/^\d{17,20}$/.test(t)) throw new Error("Identifiant de salon invalide (17 à 20 chiffres).");
      return t || undefined;
    };
    if (a.dailyAt !== undefined && a.dailyAt.trim() && !/^\d{1,2}:\d{2}$/.test(a.dailyAt.trim())) {
      throw new Error("Heure invalide (format HH:MM).");
    }
    const patch = {
      botPresenceChannel: chan(a.presenceChannel),
      botDailyChannel: chan(a.dailyChannel),
      botRollcallChannel: chan(a.rollcallChannel),
      botDailyAt: a.dailyAt?.trim() || undefined,
      updatedBy: agent._id,
      updatedAt: Date.now(),
    };
    const existing = await ctx.db.query("integrationConfig").first();
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("integrationConfig", patch);
  },
});

export const setBaseUrl = mutation({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "webhooks.manage");
    const clean = url.trim().replace(/\/+$/, "");
    if (clean && !/^https?:\/\//.test(clean)) throw new Error("L'adresse doit commencer par http:// ou https://.");
    const existing = await ctx.db.query("integrationConfig").first();
    if (existing) await ctx.db.patch(existing._id, { baseUrl: clean, updatedBy: agent._id, updatedAt: Date.now() });
    else await ctx.db.insert("integrationConfig", { baseUrl: clean, updatedBy: agent._id, updatedAt: Date.now() });
  },
});

// ============ Configuration ============
export const catalog = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "webhooks.manage");
    return WEBHOOK_EVENTS;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "webhooks.manage");
    const rows = await ctx.db.query("webhooks").collect();
    return rows.map((w) => ({
      _id: w._id,
      name: w.name,
      // L'URL contient un secret : on n'expose que sa fin pour l'identifier.
      urlMasked: `…${w.url.slice(-12)}`,
      events: w.events,
      active: w.active,
      lastStatus: w.lastStatus ?? null,
      lastAt: w.lastAt ?? null,
    }));
  },
});

function assertUrl(url: string) {
  if (!/^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\//.test(url)) {
    throw new Error("URL de webhook Discord invalide.");
  }
}

export const create = mutation({
  args: { name: v.string(), url: v.string(), events: v.array(v.string()) },
  handler: async (ctx, a) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "webhooks.manage");
    const name = a.name.trim();
    if (!name) throw new Error("Nom requis.");
    assertUrl(a.url.trim());
    const id = await ctx.db.insert("webhooks", {
      name,
      url: a.url.trim(),
      events: a.events.filter((e) => VALID.has(e)),
      active: true,
    });
    await writeAudit(ctx, agent, { action: "webhook.create", resourceType: "webhook", resourceId: id, resourceLabel: name });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("webhooks"),
    name: v.optional(v.string()),
    url: v.optional(v.string()),
    events: v.optional(v.array(v.string())),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "webhooks.manage");
    const w = await ctx.db.get(id);
    if (!w) throw new Error("Webhook introuvable.");
    const next: Record<string, unknown> = {};
    if (patch.name !== undefined && patch.name.trim()) next.name = patch.name.trim();
    if (patch.url !== undefined && patch.url.trim()) { assertUrl(patch.url.trim()); next.url = patch.url.trim(); }
    if (patch.events !== undefined) next.events = patch.events.filter((e) => VALID.has(e));
    if (patch.active !== undefined) next.active = patch.active;
    await ctx.db.patch(id, next);
    await writeAudit(ctx, agent, { action: "webhook.update", resourceType: "webhook", resourceId: id, resourceLabel: w.name });
  },
});

export const remove = mutation({
  args: { id: v.id("webhooks") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "webhooks.manage");
    const w = await ctx.db.get(id);
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, { action: "webhook.delete", resourceType: "webhook", resourceId: id, resourceLabel: w?.name });
  },
});

// Envoi d'un message de test pour vérifier qu'une URL fonctionne.
export const test = action({
  args: { id: v.id("webhooks") },
  handler: async (ctx, { id }): Promise<string> => {
    await ctx.runMutation(internal.webhooks.assertCanSend, { manage: true });
    const url = await ctx.runMutation(internal.webhooks.urlOf, { id });
    if (!url) throw new Error("Webhook introuvable.");
    return await ctx.runAction(internal.webhooks.post, {
      urls: [url],
      embed: {
        title: "Test de connexion",
        description: "Le MDT de la Station 13 est correctement relié à ce salon.",
        color: 0x49a24a,
      },
    });
  },
});

// Les actions n'ont pas d'accès direct à la base : ce contrôle est délégué à
// une mutation interne, qui hérite de l'identité de l'appelant.
export const assertCanSend = internalMutation({
  args: { manage: v.optional(v.boolean()) },
  handler: async (ctx, { manage }) => {
    const agent = await requireAgent(ctx);
    if (manage) {
      await requirePermission(ctx, agent, "webhooks.manage");
    } else if (agent.status !== "ACTIVE") {
      // Un compte suspendu ou en attente ne relaie rien vers Discord.
      throw new Error("Compte inactif.");
    }
    return true;
  },
});

export const urlOf = internalMutation({
  args: { id: v.id("webhooks") },
  handler: async (ctx, { id }) => (await ctx.db.get(id))?.url ?? null,
});

export const linkFor = internalMutation({
  args: { path: v.string() },
  handler: async (ctx, { path }) => {
    const base = (await ctx.db.query("integrationConfig").first())?.baseUrl?.trim().replace(/\/+$/, "");
    return base ? `${base}${path}` : undefined;
  },
});

export const markResult = internalMutation({
  args: { url: v.string(), status: v.string() },
  handler: async (ctx, { url, status }) => {
    const rows = await ctx.db.query("webhooks").collect();
    for (const w of rows) {
      if (w.url === url) await ctx.db.patch(w._id, { lastStatus: status, lastAt: Date.now() });
    }
  },
});

// ============ Envoi ============
const EMBED = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  color: v.optional(v.number()),
  url: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  fields: v.optional(v.array(v.object({ name: v.string(), value: v.string(), inline: v.optional(v.boolean()) }))),
  footer: v.optional(v.string()),
});

export const post = internalAction({
  args: { urls: v.array(v.string()), embed: EMBED },
  handler: async (ctx, { urls, embed }): Promise<string> => {
    const body = {
      username: "LSPD · Station 13",
      embeds: [
        {
          title: embed.title,
          description: embed.description,
          color: embed.color ?? 0x49a24a,
          url: embed.url,
          image: embed.imageUrl ? { url: embed.imageUrl } : undefined,
          fields: embed.fields,
          footer: { text: embed.footer ?? "MDT · Station 13" },
          timestamp: new Date().toISOString(),
        },
      ],
    };
    let last = "ok";
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        last = res.ok ? "ok" : `HTTP ${res.status}`;
      } catch (e) {
        last = e instanceof Error ? e.message : "erreur réseau";
      }
      await ctx.runMutation(internal.webhooks.markResult, { url, status: last });
    }
    return last;
  },
});

// Résout les URLs abonnées à un événement (utilisé par les actions d'envoi de fichier).
export const urlsFor = internalMutation({
  args: { event: v.string() },
  handler: async (ctx, { event }) => {
    const hooks = await ctx.db.query("webhooks").withIndex("by_active", (q) => q.eq("active", true)).collect();
    return hooks.filter((h) => h.events.includes(event)).map((h) => h.url);
  },
});

// Envoi d'un document en pièce jointe (contravention, rapport).
// Le document est rendu côté client (image du gabarit officiel) puis transmis
// ici en base64 : Discord n'accepte les fichiers qu'en multipart/form-data.
// Une image est référencée par `attachment://` pour s'afficher DANS l'embed,
// au lieu de rester un fichier à télécharger comme le serait un PDF.
export const postDocument = action({
  args: {
    event: v.string(),
    filename: v.string(),
    base64: v.string(),
    embed: EMBED,
    // Chemin dans le MDT (ex. /citoyen/xxx) : l'adresse de base vient de la
    // configuration serveur, pas de l'URL du navigateur qui l'a émis.
    path: v.optional(v.string()),
  },
  handler: async (ctx, { event, filename, base64, embed, path }): Promise<string> => {
    await ctx.runMutation(internal.webhooks.assertCanSend, {});
    const urls: string[] = await ctx.runMutation(internal.webhooks.urlsFor, { event });
    if (urls.length === 0) return "aucun webhook abonné";

    const isImage = /\.(png|jpe?g|webp|gif)$/i.test(filename);
    const mime = isImage
      ? `image/${filename.split(".").pop()!.toLowerCase().replace("jpg", "jpeg")}`
      : "application/pdf";

    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const payload = {
      username: "LSPD · Station 13",
      embeds: [
        {
          title: embed.title,
          description: embed.description,
          color: embed.color ?? 0x49a24a,
          url: path ? await ctx.runMutation(internal.webhooks.linkFor, { path }) : embed.url,
          fields: embed.fields,
          image: isImage ? { url: `attachment://${filename}` } : undefined,
          footer: { text: embed.footer ?? "MDT · Station 13" },
          timestamp: new Date().toISOString(),
        },
      ],
      attachments: [{ id: 0, filename }],
    };

    let last = "ok";
    for (const url of urls) {
      try {
        const form = new FormData();
        form.append("payload_json", JSON.stringify(payload));
        form.append("files[0]", new Blob([bytes], { type: mime }), filename);
        const res = await fetch(url, { method: "POST", body: form });
        last = res.ok ? "ok" : `HTTP ${res.status}`;
      } catch (e) {
        last = e instanceof Error ? e.message : "erreur réseau";
      }
      await ctx.runMutation(internal.webhooks.markResult, { url, status: last });
    }
    return last;
  },
});
