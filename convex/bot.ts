import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// Passerelle pour le bot Discord.
//
// Le bot est un service externe, il n'a pas de session d'agent : ces fonctions
// sont donc publiques mais protégées par un secret partagé (variable Convex
// BOT_SECRET, jamais dans le bundle client). Toute fonction exposée ici est en
// LECTURE SEULE — le bot n'écrit rien dans le MDT.
function assertBot(secret: string) {
  const expected = process.env.BOT_SECRET;
  if (!expected) throw new Error("BOT_SECRET non configuré côté Convex.");
  if (secret !== expected) throw new Error("Secret invalide.");
}

const DAY = 86_400_000;
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

async function gradeName(ctx: QueryCtx, a: Doc<"agents">) {
  if (a.isOwner) return "Owner";
  const g = a.gradeId ? await ctx.db.get(a.gradeId) : null;
  return g?.name ?? "Sans grade";
}

// Agents actuellement en service — alimente l'embed de présence.
export const agentsOnDuty = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    const open = await ctx.db
      .query("serviceSessions")
      .withIndex("by_open", (q) => q.eq("endedAt", undefined))
      .collect();
    const out = [];
    for (const s of open) {
      const a = await ctx.db.get(s.agentId);
      if (!a || a.status !== "ACTIVE") continue;
      out.push({
        name: `${a.prenomRP} ${a.nomRP}`,
        matricule: a.matricule ?? (a.isOwner ? 0 : null),
        grade: await gradeName(ctx, a),
        gradePosition: a.gradeId ? (await ctx.db.get(a.gradeId))?.position ?? 0 : 0,
        since: s.startedAt,
        callsign: s.callsignType ?? null,
      });
    }
    // Les plus gradés d'abord, puis par ancienneté de prise de service.
    out.sort((x, y) => (y.gradePosition - x.gradePosition) || (x.since - y.since));
    return out;
  },
});

// Récapitulatif de la journée — alimente le résumé quotidien.
export const dayStats = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    const now = Date.now();
    const dayStart = startOfToday();

    // Sessions du jour (démarrées aujourd'hui) : temps travaillé et présences.
    const sessions = await ctx.db.query("serviceSessions").withIndex("by_open").order("desc").take(400);
    const recent = await ctx.db.query("serviceSessions").order("desc").take(400);
    const all = [...sessions, ...recent];
    const seen = new Set<string>();
    let workedMs = 0;
    const perAgent = new Map<string, number>();
    let onDutyNow = 0;
    for (const s of all) {
      if (seen.has(s._id as string)) continue;
      seen.add(s._id as string);
      if (s.endedAt == null) onDutyNow++;
      const end = s.endedAt ?? now;
      if (end < dayStart) continue;
      const from = Math.max(s.startedAt, dayStart);
      const dur = Math.max(0, end - from);
      workedMs += dur;
      perAgent.set(s.agentId as string, (perAgent.get(s.agentId as string) ?? 0) + dur);
    }

    // Patrouilles ouvertes aujourd'hui.
    const patrols = await ctx.db.query("patrols").order("desc").take(200);
    const patrolsToday = patrols.filter((p) => p.startedAt >= dayStart).length;

    // Actes du jour.
    const casier = (await ctx.db.query("casierEntries").order("desc").take(200)).filter((e) => !e.deletedAt && e.at >= dayStart).length;
    const citations = (await ctx.db.query("citations").order("desc").take(200)).filter((c) => !c.deletedAt && c.at >= dayStart).length;

    // Top 5 des présences du jour.
    const topRaw = [...perAgent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const top = [];
    for (const [agentId, ms] of topRaw) {
      const a = await ctx.db.get(agentId as Doc<"agents">["_id"]);
      if (a) top.push({ name: `${a.prenomRP} ${a.nomRP}`, minutes: Math.round(ms / 60000) });
    }

    // Répartition horaire de la présence (24 tranches) pour un mini-graphique.
    const hourly = new Array(24).fill(0) as number[];
    for (const s of all) {
      const end = s.endedAt ?? now;
      if (end < dayStart) continue;
      const from = Math.max(s.startedAt, dayStart);
      for (let t = from; t < end && t < dayStart + DAY; t += 5 * 60000) {
        hourly[new Date(t).getHours()]++;
      }
    }

    return {
      date: dayStart,
      onDutyNow,
      workedMinutes: Math.round(workedMs / 60000),
      distinctAgents: perAgent.size,
      patrolsToday,
      casier,
      citations,
      top,
      hourly, // nombre de tranches de 5 min actives par heure (0-23)
    };
  },
});

// Effectif présent + effectif total — petit état des lieux rapide.
export const overview = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    const active = (await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "ACTIVE")).collect()).filter((a) => !a.isOwner);
    const onDuty = (await ctx.db.query("serviceSessions").withIndex("by_open", (q) => q.eq("endedAt", undefined)).collect()).length;
    const openPatrols = (await ctx.db.query("patrols").withIndex("by_open", (q) => q.eq("endedAt", undefined)).collect()).length;
    return { totalAgents: active.length, onDuty, openPatrols };
  },
});

// ============ Appel de présence (rollcall) ============
// Le bot écrit ici, mais seulement le rollcall, et toujours derrière le secret.

// Rollcall du jour, s'il existe (reprise après redémarrage du bot).
export const rollcallToday = query({
  args: { secret: v.string(), date: v.string() },
  handler: async (ctx, { secret, date }) => {
    assertBot(secret);
    const rc = await ctx.db.query("rollcalls").withIndex("by_date", (q) => q.eq("date", date)).first();
    if (!rc) return null;
    return { _id: rc._id, channelId: rc.channelId, messageId: rc.messageId, endsAt: rc.endsAt, closed: rc.closed };
  },
});

// Roll call précédent (message Discord à supprimer quand le nouveau est posté ;
// les présences restent en base). On garde l'historique, on ne retire que le
// message le plus récent qui précède la date donnée.
export const rollcallPrevious = query({
  args: { secret: v.string(), date: v.string() },
  handler: async (ctx, { secret, date }) => {
    assertBot(secret);
    const prev = (await ctx.db.query("rollcalls").collect())
      .filter((r) => r.date < date)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    return prev ? { channelId: prev.channelId, messageId: prev.messageId } : null;
  },
});

// Réserve atomiquement le roll call du jour AVANT de poster le message : une
// seule instance/tick gagne l'insertion (created:true) et poste ; les autres
// reçoivent created:false et ne postent rien. Évite les envois en double.
export const rollcallReserve = mutation({
  args: { secret: v.string(), date: v.string(), channelId: v.string(), endsAt: v.number(), ceremony: v.optional(v.boolean()), ceremonyTime: v.optional(v.string()), displayTime: v.optional(v.string()) },
  handler: async (ctx, { secret, date, channelId, endsAt, ceremony, ceremonyTime, displayTime }) => {
    assertBot(secret);
    const existing = await ctx.db.query("rollcalls").withIndex("by_date", (q) => q.eq("date", date)).first();
    if (existing) return { _id: existing._id, created: false };
    const _id = await ctx.db.insert("rollcalls", { date, channelId, messageId: "", startedAt: Date.now(), endsAt, closed: false, ceremony, ceremonyTime, displayTime });
    return { _id, created: true };
  },
});

// Enregistre l'id du message Discord une fois posté.
export const rollcallSetMessage = mutation({
  args: { secret: v.string(), rollcallId: v.id("rollcalls"), messageId: v.string() },
  handler: async (ctx, { secret, rollcallId, messageId }) => {
    assertBot(secret);
    await ctx.db.patch(rollcallId, { messageId });
  },
});

// Statuts groupés d'un appel : reconstruit l'embed après chaque vote.
export const rollcallState = query({
  args: { secret: v.string(), rollcallId: v.id("rollcalls") },
  handler: async (ctx, { secret, rollcallId }) => {
    assertBot(secret);
    const rc = await ctx.db.get(rollcallId);
    if (!rc) return null;
    const votes = await ctx.db.query("rollcallVotes").withIndex("by_rollcall", (q) => q.eq("rollcallId", rollcallId)).collect();
    const group = (st: string) => votes.filter((v) => v.status === st).sort((a, b) => a.at - b.at).map((v) => v.discordName);
    return {
      endsAt: rc.endsAt,
      closed: rc.closed,
      ceremony: rc.ceremony ?? false,
      ceremonyTime: rc.ceremonyTime ?? null,
      displayTime: rc.displayTime ?? null,
      present: group("PRESENT"),
      retard: group("RETARD"),
      absent: group("ABSENT"),
    };
  },
});

export const rollcallVote = mutation({
  args: {
    secret: v.string(),
    rollcallId: v.id("rollcalls"),
    discordUserId: v.string(),
    discordName: v.string(),
    status: v.union(v.literal("PRESENT"), v.literal("ABSENT"), v.literal("RETARD")),
  },
  handler: async (ctx, { secret, rollcallId, discordUserId, discordName, status }) => {
    assertBot(secret);
    const rc = await ctx.db.get(rollcallId);
    if (!rc) return { ok: false as const, reason: "introuvable" };
    if (rc.closed || Date.now() > rc.endsAt) return { ok: false as const, reason: "clos" };
    const existing = await ctx.db
      .query("rollcallVotes")
      .withIndex("by_rollcall_user", (q) => q.eq("rollcallId", rollcallId).eq("discordUserId", discordUserId))
      .first();
    if (existing) await ctx.db.patch(existing._id, { status, discordName, at: Date.now() });
    else await ctx.db.insert("rollcallVotes", { rollcallId, discordUserId, discordName, status, at: Date.now() });
    return { ok: true as const };
  },
});

export const rollcallClose = mutation({
  args: { secret: v.string(), rollcallId: v.id("rollcalls") },
  handler: async (ctx, { secret, rollcallId }) => {
    assertBot(secret);
    const rc = await ctx.db.get(rollcallId);
    if (rc && !rc.closed) await ctx.db.patch(rollcallId, { closed: true });
  },
});

// Configuration lue par le bot au fil de l'eau : salons et heures définis
// depuis la page Configuration du site, pas en variables d'environnement.
export const config = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    const cfg = await ctx.db.query("integrationConfig").first();
    return {
      presenceChannel: cfg?.botPresenceChannel ?? null,
      dailyChannel: cfg?.botDailyChannel ?? null,
      rollcallChannel: cfg?.botRollcallChannel ?? null,
      dailyAt: cfg?.botDailyAt ?? "23:30",
      rollcallStartAt: cfg?.botRollcallStartAt ?? null,
      rollcallEndAt: cfg?.botRollcallEndAt ?? null,
      ceremonyAt: cfg?.botCeremonyAt ?? null,
      rollcallPingRole: cfg?.botRollcallPingRole ?? null,
      rollcallPingEnabled: cfg?.botRollcallPingEnabled ?? false,
    };
  },
});

const nrm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Heures de service d'un agent sur la semaine en cours, recherché par son nom
// RP (« prénom nom »). Sert à la commande /heures — pas de compte Discord lié.
export const agentWeeklyHours = query({
  args: { secret: v.string(), query: v.string() },
  handler: async (ctx, { secret, query }) => {
    assertBot(secret);
    const needle = nrm(query);
    if (!needle) return { found: false as const };

    // Correspondance sur « prénom nom », « nom prénom » ou le login prenom.nom.
    const agents = await ctx.db.query("agents").collect();
    const match = agents.find((a) => {
      if (a.status !== "ACTIVE") return false;
      const full = nrm(`${a.prenomRP} ${a.nomRP}`);
      const rev = nrm(`${a.nomRP} ${a.prenomRP}`);
      return full === needle || rev === needle || nrm(a.login) === needle.replace(/\s+/g, ".");
    }) ?? agents.find((a) => a.status === "ACTIVE" && nrm(`${a.prenomRP} ${a.nomRP}`).includes(needle));

    if (!match) return { found: false as const };

    // Début de la semaine ISO (lundi 00:00).
    const now = new Date();
    const monday = new Date(now);
    const dow = (now.getDay() + 6) % 7; // 0 = lundi
    monday.setDate(now.getDate() - dow);
    monday.setHours(0, 0, 0, 0);
    const weekStart = monday.getTime();

    const sessions = await ctx.db.query("serviceSessions").withIndex("by_agent", (q) => q.eq("agentId", match._id)).collect();
    const perDay = new Array(7).fill(0) as number[]; // minutes, lun..dim
    let total = 0;
    const nowMs = Date.now();
    for (const s of sessions) {
      const end = s.endedAt ?? nowMs;
      if (end < weekStart) continue;
      const from = Math.max(s.startedAt, weekStart);
      // Réparti sur les jours traversés (une session peut chevaucher minuit).
      for (let t = from; t < end; t += 5 * 60000) {
        const dayIdx = Math.floor((t - weekStart) / DAY);
        if (dayIdx < 0 || dayIdx > 6) continue;
        perDay[dayIdx] += 5;
        total += 5;
      }
    }

    return {
      found: true as const,
      name: `${match.prenomRP} ${match.nomRP}`,
      matricule: match.matricule ?? (match.isOwner ? 0 : null),
      grade: await gradeName(ctx, match),
      totalMinutes: total,
      perDay, // minutes par jour, lundi -> dimanche
    };
  },
});

// ============ Consultations self-service ============

// Véhicule civil enregistré, par plaque. Ne renvoie pas la flotte LSPD.
export const vehicleByPlate = query({
  args: { secret: v.string(), plaque: v.string() },
  handler: async (ctx, { secret, plaque }) => {
    assertBot(secret);
    const p = plaque.trim().toUpperCase().replace(/\s+/g, "");
    if (!p) return null;
    const all = await ctx.db.query("vehicles").collect();
    const veh = all.find((v) => !v.deletedAt && v.plaque.toUpperCase().replace(/\s+/g, "") === p);
    if (!veh) return null;
    const owner = veh.ownerId ? await ctx.db.get(veh.ownerId) : null;
    const flags = [];
    for (const fl of await ctx.db.query("vehicleFlags").withIndex("by_vehicle", (q) => q.eq("vehicleId", veh._id)).collect()) {
      if (!fl.active) continue;
      const t = await ctx.db.get(fl.flagTypeId);
      if (t) flags.push(t.name);
    }
    return {
      plaque: veh.plaque,
      modele: veh.modele ?? "-",
      couleur: veh.couleur ?? "-",
      type: veh.type ?? "-",
      owner: owner ? `${owner.prenom} ${owner.nom}` : null,
      notes: veh.notes ?? null,
      flags,
    };
  },
});

// Extrait de casier d'un citoyen recherché par son nom (« prénom nom »).
export const casierByName = query({
  args: { secret: v.string(), query: v.string() },
  handler: async (ctx, { secret, query }) => {
    assertBot(secret);
    const needle = nrm(query);
    if (!needle) return { found: false as const };
    const citizens = await ctx.db.query("citizens").collect();
    const c =
      citizens.find((x) => x.status === "ACTIVE" && (nrm(`${x.prenom} ${x.nom}`) === needle || nrm(`${x.nom} ${x.prenom}`) === needle)) ??
      citizens.find((x) => x.status === "ACTIVE" && nrm(`${x.prenom} ${x.nom}`).includes(needle));
    if (!c) return { found: false as const };

    const entries = await ctx.db.query("casierEntries").withIndex("by_citizen", (q) => q.eq("citizenId", c._id)).order("desc").collect();
    let fine = 0, jail = 0;
    const rows = [];
    for (const e of entries) {
      if (e.deletedAt || e.status === "ANNULEE") continue;
      const charges = await ctx.db.query("casierCharges").withIndex("by_entry", (q) => q.eq("entryId", e._id)).collect();
      fine += e.totalFine;
      jail += e.totalJailSeconds;
      rows.push({
        at: e.at,
        type: e.arrestType === "DOSSIER" ? "Dossier" : "Rapport",
        charges: charges.map((ch) => ch.snapshot.name).join(", ") || "-",
        fine: e.totalFine,
        jailSeconds: e.totalJailSeconds,
      });
    }
    return {
      found: true as const,
      name: `${c.prenom} ${c.nom}`,
      dateNaissance: c.dateNaissance ?? null,
      sexe: c.sexe ?? null,
      nationalite: c.nationalite ?? null,
      totalFine: fine,
      totalJailSeconds: jail,
      count: rows.length,
      rows: rows.slice(0, 12),
    };
  },
});

// ============ Écritures self-service ============

// Demande d'absence posée depuis Discord pour un agent nommé. Statut EN_ATTENTE,
// à valider ensuite dans le MDT. Le demandeur Discord est tracé dans l'audit.
export const requestAbsence = mutation({
  args: { secret: v.string(), query: v.string(), from: v.number(), to: v.number(), reason: v.string(), discordName: v.string() },
  handler: async (ctx, { secret, query, from, to, reason, discordName }) => {
    assertBot(secret);
    const needle = nrm(query);
    const agents = await ctx.db.query("agents").collect();
    const agent =
      agents.find((a) => a.status === "ACTIVE" && (nrm(`${a.prenomRP} ${a.nomRP}`) === needle || nrm(`${a.nomRP} ${a.prenomRP}`) === needle)) ??
      agents.find((a) => a.status === "ACTIVE" && nrm(`${a.prenomRP} ${a.nomRP}`).includes(needle));
    if (!agent) return { ok: false as const, reason: "introuvable" };
    if (to < from) return { ok: false as const, reason: "dates" };

    const id = await ctx.db.insert("absences", { agentId: agent._id, reason: reason.trim(), from, to, status: "EN_ATTENTE", at: Date.now() });
    await ctx.db.insert("auditLog", {
      at: Date.now(),
      action: "absence.request",
      resourceType: "absence",
      resourceId: id,
      resourceLabel: `${agent.prenomRP} ${agent.nomRP}`,
      metadata: { via: "discord", by: discordName },
    });
    return { ok: true as const, name: `${agent.prenomRP} ${agent.nomRP}` };
  },
});

// ============ État du message de présence ============
export const presenceMessageGet = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    return (await ctx.db.query("integrationConfig").first())?.botPresenceMessageId ?? null;
  },
});

export const presenceMessageSet = mutation({
  args: { secret: v.string(), messageId: v.string() },
  handler: async (ctx, { secret, messageId }) => {
    assertBot(secret);
    const cfg = await ctx.db.query("integrationConfig").first();
    if (cfg) await ctx.db.patch(cfg._id, { botPresenceMessageId: messageId });
    else await ctx.db.insert("integrationConfig", { botPresenceMessageId: messageId, updatedAt: Date.now() });
  },
});

// ============ Système de tickets de candidature ============

const DEFAULT_IMPORTANT = [
  "Les informations fournies doivent être exactes et vérifiables. Toute fausse déclaration entraîne la disqualification.",
  "La soumission du formulaire ne garantit pas l'admission.",
  "Une confirmation sera envoyée après validation de votre dossier.",
  "Les candidats retenus passeront un entretien, une évaluation écrite, une étude du manuel, une évaluation psychologique et un examen final.",
].join("\n");
const DEFAULT_CONDITIONS = [
  "21 ans minimum",
  "Nationalité américaine ou permis de travail valide",
  "Casier judiciaire vierge",
  "Permis de conduire valide",
  "Disponibilité pour suivre la formation complète et résider à proximité",
].join("\n");
const DEFAULT_ANNOUNCE = "Présence obligatoire à toutes les personnes ayant le grade de {cadet}. Merci de nous prévenir à l'avance en cas de non-venue ; toute personne absente sans avoir prévenu sera démise de sa fonction d'apprenant.\n*(Prévenez de votre absence dans votre ticket, sinon blacklist automatique - sauf candidat en vacances !)*";
const DEFAULT_ITEMS = "Une tenue décente\nUne coiffure et une barbe taillées et réglementaires\nDe la nourriture et de la boisson";

// Embed d'annonce par défaut : reprend l'ancien rendu (corps + date/heure/lieu +
// à prévoir + promo) sous forme d'embed riche à placeholders. Reconstruit à
// partir des anciens champs à plat s'ils existent.
function defaultAnnounceEmbed(cfg: Doc<"ticketConfig"> | null) {
  const items = (cfg?.announceItems ?? DEFAULT_ITEMS).split("\n").map((s) => s.trim()).filter(Boolean).map((s) => `• ${s}`).join("\n");
  return {
    color: "#49a24a",
    title: "📢 ANNONCE OFFICIELLE - POLICE ACADEMY",
    description: cfg?.announceText ?? DEFAULT_ANNOUNCE,
    fields: [
      { name: "📅 Date", value: "{date}", inline: true },
      { name: "🕗 Heure", value: "{heure}", inline: true },
      { name: "📍 Lieu", value: "{lieu}", inline: true },
      ...(items ? [{ name: "🎒 Merci de prévoir", value: items }] : []),
    ],
    footer: "Promotion : {promo}",
  };
}

// Validateur d'embed riche pour les mutations du bot.
const richEmbedArg = v.object({
  authorName: v.optional(v.string()), authorIcon: v.optional(v.string()),
  title: v.optional(v.string()), description: v.optional(v.string()), color: v.optional(v.string()),
  thumbnail: v.optional(v.string()), image: v.optional(v.string()),
  footer: v.optional(v.string()), footerIcon: v.optional(v.string()),
  fields: v.optional(v.array(v.object({ name: v.string(), value: v.string(), inline: v.optional(v.boolean()) }))),
});

// Normalise un embed : soit l'embed riche stocké, soit reconstruit depuis les
// anciens champs à plat (title/description/color).
function normEmbed(embed: unknown, flat: { title?: string; description?: string; color?: string }) {
  if (embed) return embed;
  return { title: flat.title, description: flat.description, color: flat.color };
}

function ticketDefaults(cfg: Doc<"ticketConfig"> | null) {
  return {
    categoryId: cfg?.categoryId ?? null,
    panelChannelId: cfg?.panelChannelId ?? null,
    panelMessageId: cfg?.panelMessageId ?? null,
    candidaturesOpen: cfg?.candidaturesOpen ?? false,
    panelEmbed: normEmbed(cfg?.panelEmbed, { title: cfg?.panelTitle ?? "Rejoindre la Police Academy", description: cfg?.panelText ?? "Clique sur le bouton ci-dessous pour soumettre ta candidature.", color: "#49a24a" }),
    openEmbed: normEmbed(cfg?.openEmbed, { title: cfg?.openTitle ?? "Nouvelle candidature", description: cfg?.openText ?? "Merci pour ta candidature ! Un membre de l'académie va te répondre.", color: cfg?.openColor ?? "#49a24a" }),
    nomenclature: cfg?.nomenclature ?? "{prenom}-{nom}",
    renameNick: cfg?.renameNick ?? true,
    promoRoleIds: cfg?.promoRoleIds ?? [],
    cadetRoleId: cfg?.cadetRoleId ?? null,
    recruiterRoleIds: cfg?.recruiterRoleIds ?? [],
    importantInfo: cfg?.importantInfo ?? DEFAULT_IMPORTANT,
    conditionsRP: cfg?.conditionsRP ?? DEFAULT_CONDITIONS,
    announceEmbed: cfg?.announceEmbed ?? defaultAnnounceEmbed(cfg),
  };
}

export const ticketConfigGet = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    return ticketDefaults(await ctx.db.query("ticketConfig").first());
  },
});

export const ticketConfigSet = mutation({
  args: {
    secret: v.string(),
    patch: v.object({
      categoryId: v.optional(v.union(v.string(), v.null())),
      panelChannelId: v.optional(v.string()),
      panelMessageId: v.optional(v.string()),
      candidaturesOpen: v.optional(v.boolean()),
      panelTitle: v.optional(v.string()),
      panelText: v.optional(v.string()),
      openTitle: v.optional(v.string()),
      openText: v.optional(v.string()),
      openColor: v.optional(v.string()),
      panelEmbed: v.optional(richEmbedArg),
      openEmbed: v.optional(richEmbedArg),
      nomenclature: v.optional(v.string()),
      renameNick: v.optional(v.boolean()),
      promoRoleIds: v.optional(v.array(v.string())),
      cadetRoleId: v.optional(v.union(v.string(), v.null())),
      recruiterRoleIds: v.optional(v.array(v.string())),
      importantInfo: v.optional(v.string()),
      conditionsRP: v.optional(v.string()),
      announceEmbed: v.optional(richEmbedArg),
      announceText: v.optional(v.string()),
      announceItems: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { secret, patch }) => {
    assertBot(secret);
    const clean: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(patch)) {
      if (val === undefined) continue;
      clean[k] = val === null ? undefined : val;
    }
    const cfg = await ctx.db.query("ticketConfig").first();
    if (cfg) await ctx.db.patch(cfg._id, clean);
    else await ctx.db.insert("ticketConfig", { candidaturesOpen: false, updatedAt: Date.now(), ...clean });
  },
});

export const ticketTemplateList = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    return (await ctx.db.query("ticketTemplates").collect())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => ({ _id: t._id, name: t.name, pingOwner: t.pingOwner, embed: normEmbed(t.embed, { title: t.title, description: t.description, color: t.color }) }));
  },
});

export const ticketTemplateUpsert = mutation({
  args: { secret: v.string(), id: v.optional(v.string()), name: v.string(), pingOwner: v.boolean(), embed: richEmbedArg },
  handler: async (ctx, { secret, id, name, pingOwner, embed }) => {
    assertBot(secret);
    // On efface les anciens champs à plat au profit de l'embed riche.
    const data = { name: name.trim(), pingOwner, embed, title: undefined, description: undefined, color: undefined };
    if (id) { await ctx.db.patch(id as Id<"ticketTemplates">, data); return id; }
    return await ctx.db.insert("ticketTemplates", { name: name.trim(), pingOwner, embed, createdAt: Date.now() });
  },
});

export const ticketTemplateDelete = mutation({
  args: { secret: v.string(), id: v.string() },
  handler: async (ctx, { secret, id }) => {
    assertBot(secret);
    await ctx.db.delete(id as Id<"ticketTemplates">);
  },
});

export const ticketTemplateByName = query({
  args: { secret: v.string(), name: v.string() },
  handler: async (ctx, { secret, name }) => {
    assertBot(secret);
    const t = await ctx.db.query("ticketTemplates").withIndex("by_name", (q) => q.eq("name", name)).first();
    return t ? { _id: t._id, name: t.name, pingOwner: t.pingOwner, embed: normEmbed(t.embed, { title: t.title, description: t.description, color: t.color }) } : null;
  },
});

export const ticketCreate = mutation({
  args: {
    secret: v.string(), channelId: v.string(), ownerId: v.string(), ownerName: v.string(),
    prenom: v.string(), nom: v.string(), dateNaissance: v.optional(v.string()),
    motivations: v.optional(v.string()), experiences: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    assertBot(a.secret);
    await ctx.db.insert("tickets", {
      channelId: a.channelId, ownerId: a.ownerId, ownerName: a.ownerName,
      prenom: a.prenom, nom: a.nom, dateNaissance: a.dateNaissance,
      motivations: a.motivations, experiences: a.experiences,
      status: "OPEN", createdAt: Date.now(),
      events: [{ at: Date.now(), type: "created", label: `Candidature ouverte par ${a.ownerName}`, by: a.ownerName }],
    });
  },
});

// Complète le dossier après la seconde modale (motivations + expériences).
export const ticketSetDossier = mutation({
  args: { secret: v.string(), channelId: v.string(), motivations: v.optional(v.string()), experiences: v.optional(v.string()) },
  handler: async (ctx, { secret, channelId, motivations, experiences }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (t) await ctx.db.patch(t._id, { motivations, experiences });
  },
});

// Ajoute un événement au journal d'un ticket (présence, absence, note libre…).
const eventArg = v.object({ type: v.string(), label: v.string(), by: v.optional(v.string()) });
async function logEvent(ctx: MutationCtx, t: Doc<"tickets">, ev: { type: string; label: string; by?: string }) {
  await ctx.db.patch(t._id, { events: [...(t.events ?? []), { at: Date.now(), ...ev }] });
}

export const ticketLogEvent = mutation({
  args: { secret: v.string(), channelId: v.string(), event: eventArg },
  handler: async (ctx, { secret, channelId, event }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (t) await logEvent(ctx, t, event);
  },
});

export const ticketByChannel = query({
  args: { secret: v.string(), channelId: v.string() },
  handler: async (ctx, { secret, channelId }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    return t ? { ownerId: t.ownerId, ownerName: t.ownerName, prenom: t.prenom, nom: t.nom, status: t.status, integrationStatus: t.integrationStatus ?? null } : null;
  },
});

export const ticketClose = mutation({
  args: { secret: v.string(), channelId: v.string(), reason: v.optional(v.string()), by: v.optional(v.string()) },
  handler: async (ctx, { secret, channelId, reason, by }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (!t) return null;
    await ctx.db.patch(t._id, { status: "CLOSED", closeReason: reason, closedBy: by });
    await logEvent(ctx, t, { type: "close", label: reason ? `Ticket fermé - ${reason}` : "Ticket fermé", by });
    return { ownerId: t.ownerId, ownerName: t.ownerName };
  },
});

export const ticketReopen = mutation({
  args: { secret: v.string(), channelId: v.string(), by: v.optional(v.string()) },
  handler: async (ctx, { secret, channelId, by }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (!t) return null;
    await ctx.db.patch(t._id, { status: "OPEN", closeReason: undefined, closedBy: undefined });
    await logEvent(ctx, t, { type: "reopen", label: "Ticket réouvert", by });
    return { ownerId: t.ownerId };
  },
});

// Ticket complet pour l'archivage : toutes les infos + journal + promo liée.
export const ticketFull = query({
  args: { secret: v.string(), channelId: v.string() },
  handler: async (ctx, { secret, channelId }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (!t) return null;
    const promo = t.promotionId ? await ctx.db.get(t.promotionId) : null;
    return {
      channelId: t.channelId, ownerId: t.ownerId, ownerName: t.ownerName,
      prenom: t.prenom, nom: t.nom, dateNaissance: t.dateNaissance ?? null,
      motivations: t.motivations ?? null, experiences: t.experiences ?? null,
      status: t.status, integrationStatus: t.integrationStatus ?? null,
      promotionName: promo?.name ?? null, closeReason: t.closeReason ?? null,
      events: t.events ?? [],
      createdAt: t.createdAt,
    };
  },
});

// Enregistre l'archive d'un ticket (à la fermeture définitive) et supprime le
// ticket vivant. Consultable ensuite sur le portail LSPA.
export const ticketArchiveSave = mutation({
  args: {
    secret: v.string(), channelId: v.string(), channelName: v.string(),
    messages: v.array(v.object({ authorId: v.string(), authorName: v.string(), bot: v.optional(v.boolean()), content: v.string(), at: v.number(), attachments: v.optional(v.array(v.string())) })),
  },
  handler: async (ctx, { secret, channelId, channelName, messages }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (!t) return;
    const promo = t.promotionId ? await ctx.db.get(t.promotionId) : null;
    await ctx.db.insert("ticketArchives", {
      channelId: t.channelId, channelName,
      ownerId: t.ownerId, ownerName: t.ownerName, prenom: t.prenom, nom: t.nom,
      dateNaissance: t.dateNaissance, motivations: t.motivations, experiences: t.experiences,
      promotionName: promo?.name, integrationStatus: t.integrationStatus,
      finalStatus: t.status, closeReason: t.closeReason,
      events: t.events ?? [], messages,
      createdAt: t.createdAt, archivedAt: Date.now(),
    });
    await ctx.db.delete(t._id);
  },
});

// Ticket ouvert d'un utilisateur Discord (pour la présence à l'annonce).
export const ticketByOwner = query({
  args: { secret: v.string(), ownerId: v.string() },
  handler: async (ctx, { secret, ownerId }) => {
    assertBot(secret);
    const t = (await ctx.db.query("tickets").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect())
      .filter((x) => x.status === "OPEN")
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    return t ? { channelId: t.channelId, prenom: t.prenom, nom: t.nom, integrationStatus: t.integrationStatus ?? null } : null;
  },
});

const STATUS_LABELS: Record<string, string> = { EVALUATING: "En évaluation", FAILED: "Entretien raté", PASSED: "Entretien réussi", PASSED_ABSENT: "Réussi mais absent" };
export const ticketSetStatus = mutation({
  args: { secret: v.string(), channelId: v.string(), status: v.union(v.literal("EVALUATING"), v.literal("FAILED"), v.literal("PASSED"), v.literal("PASSED_ABSENT")), by: v.optional(v.string()) },
  handler: async (ctx, { secret, channelId, status, by }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (t) {
      await ctx.db.patch(t._id, { integrationStatus: status });
      await logEvent(ctx, t, { type: "status", label: `Statut : ${STATUS_LABELS[status] ?? status}`, by });
    }
    return t ? { prenom: t.prenom, nom: t.nom } : null;
  },
});

export const ticketSetPromotion = mutation({
  args: { secret: v.string(), channelId: v.string(), promotionId: v.string() },
  handler: async (ctx, { secret, channelId, promotionId }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (t) await ctx.db.patch(t._id, { promotionId: promotionId as Id<"promotions"> });
  },
});

// ---- Promotions (côté bot) ----

// Clé de jour canonique : minuit UTC du jour calendaire. Indépendante du fuseau
// de l'hôte (bot en heure locale, Convex en UTC) pour éviter tout décalage d'un
// jour lors du rapprochement d'une annonce avec une promo.
function dayKey(ts: number) {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function frDate(ts: number) {
  return new Date(ts).toLocaleDateString("fr-FR", { timeZone: "UTC" });
}

// Rapproche l'annonce d'une promo par sa date : renvoie la promo du même jour,
// ou la crée. C'est le point d'entrée principal de création d'une promo.
export const promoUpsertByDate = mutation({
  args: { secret: v.string(), paDate: v.number(), name: v.optional(v.string()), paTime: v.optional(v.string()), paPlace: v.optional(v.string()) },
  handler: async (ctx, { secret, paDate, name, paTime, paPlace }) => {
    assertBot(secret);
    const key = dayKey(paDate);
    const promos = await ctx.db.query("promotions").collect();
    const existing = promos.find((p) => p.paDate != null && dayKey(p.paDate) === key);
    if (existing) {
      await ctx.db.patch(existing._id, { paDate: key, ...(paTime ? { paTime } : {}), ...(paPlace ? { paPlace } : {}) });
      return { promotionId: existing._id, name: existing.name, discordCategoryId: existing.discordCategoryId ?? null, created: false };
    }
    const promoName = name?.trim() || `Promotion du ${frDate(key)}`;
    const promotionId = await ctx.db.insert("promotions", {
      name: promoName,
      startAt: Date.now(), status: "OPEN", paDate: key, paTime, paPlace,
    });
    return { promotionId, name: promoName, discordCategoryId: null, created: true };
  },
});

export const promoSetCategory = mutation({
  args: { secret: v.string(), promotionId: v.string(), categoryId: v.string() },
  handler: async (ctx, { secret, promotionId, categoryId }) => {
    assertBot(secret);
    await ctx.db.patch(promotionId as Id<"promotions">, { discordCategoryId: categoryId });
  },
});

export const promoGet = query({
  args: { secret: v.string(), promotionId: v.string() },
  handler: async (ctx, { secret, promotionId }) => {
    assertBot(secret);
    const p = await ctx.db.get(promotionId as Id<"promotions">);
    return p ? { name: p.name, discordCategoryId: p.discordCategoryId ?? null } : null;
  },
});

// Promos sans catégorie Discord : le bot les crée (tâche de réconciliation,
// couvre notamment les promos créées sur le site).
export const promosNeedingCategory = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    return (await ctx.db.query("promotions").withIndex("by_status", (q) => q.eq("status", "OPEN")).collect())
      .filter((p) => !p.deleting && !p.discordCategoryId)
      .map((p) => ({ promotionId: p._id, name: p.name }));
  },
});

// Promos marquées pour suppression sur le site : le bot nettoie leur catégorie
// Discord puis appelle promoFinalizeDeletion.
export const promosPendingDeletion = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    return (await ctx.db.query("promotions").collect())
      .filter((p) => p.deleting)
      .map((p) => ({ promotionId: p._id, name: p.name, discordCategoryId: p.discordCategoryId ?? null }));
  },
});

// Finalise la suppression d'une promo après nettoyage Discord : détache les
// tickets qui la référençaient, puis supprime la promo.
export const promoFinalizeDeletion = mutation({
  args: { secret: v.string(), promotionId: v.string() },
  handler: async (ctx, { secret, promotionId }) => {
    assertBot(secret);
    const id = promotionId as Id<"promotions">;
    for (const t of await ctx.db.query("tickets").collect()) {
      if (t.promotionId === id) await ctx.db.patch(t._id, { promotionId: undefined });
    }
    await ctx.db.delete(id);
  },
});
