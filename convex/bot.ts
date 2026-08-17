import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { inclusiveDaysParis } from "./lib/paris";
import { chargeDisplayNameQty } from "./lib/charges";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// Passerelle pour le bot Discord.
//
// Le bot est un service externe, il n'a pas de session d'agent : ces fonctions
// sont donc publiques mais protégées par un secret partagé (variable Convex
// BOT_SECRET, jamais dans le bundle client). Toute fonction exposée ici est en
// LECTURE SEULE - le bot n'écrit rien dans le MDT.
export function assertBot(secret: string) {
  const expected = process.env.BOT_SECRET;
  if (!expected) throw new ConvexError("BOT_SECRET non configuré côté Convex.");
  if (secret !== expected) throw new ConvexError("Secret invalide.");
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

// Agents actuellement en service - alimente l'embed de présence.
export const agentsOnDuty = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    return readOnDuty(ctx);
  },
});

// Récapitulatif de la journée - alimente le résumé quotidien.
export const dayStats = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    return readDayStats(ctx);
  },
});

// Effectif présent + effectif total - petit état des lieux rapide.
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
    return readRollcallForDate(ctx, date);
  },
});

// Ids Discord des agents ayant déjà voté au roll call (tout statut confondu).
export const rollcallVoters = query({
  args: { secret: v.string(), rollcallId: v.id("rollcalls") },
  handler: async (ctx, { secret, rollcallId }) => {
    assertBot(secret);
    const votes = await ctx.db.query("rollcallVotes").withIndex("by_rollcall", (q) => q.eq("rollcallId", rollcallId)).collect();
    return [...new Set(votes.map((v) => v.discordUserId))];
  },
});

// Marque des créneaux de relance ("HH:MM") comme envoyés (anti-doublon).
export const rollcallMarkReminders = mutation({
  args: { secret: v.string(), rollcallId: v.id("rollcalls"), slots: v.array(v.string()) },
  handler: async (ctx, { secret, rollcallId, slots }) => {
    assertBot(secret);
    const rc = await ctx.db.get(rollcallId);
    if (!rc) return;
    const set = new Set([...(rc.remindersSent ?? []), ...slots]);
    await ctx.db.patch(rollcallId, { remindersSent: [...set] });
  },
});

// Mémorise les messages de relance envoyés, pour les supprimer avec le roll call.
export const rollcallAddReminderMsgs = mutation({
  args: { secret: v.string(), rollcallId: v.id("rollcalls"), messageIds: v.array(v.string()) },
  handler: async (ctx, { secret, rollcallId, messageIds }) => {
    assertBot(secret);
    const rc = await ctx.db.get(rollcallId);
    if (!rc) return;
    await ctx.db.patch(rollcallId, { reminderMsgIds: [...(rc.reminderMsgIds ?? []), ...messageIds] });
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
    return prev ? { channelId: prev.channelId, messageId: prev.messageId, reminderMsgIds: prev.reminderMsgIds ?? [] } : null;
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

// ============ Liaison des comptes Discord (côté bot) ============

// Synchronise les membres du rôle LSPD : réconcilie la table discordMembers
// (upsert les présents, retire ceux qui ne sont plus dans le lot).
export const syncDiscordMembers = mutation({
  args: { secret: v.string(), members: v.array(v.object({ discordId: v.string(), username: v.string(), displayName: v.string(), roleIds: v.optional(v.array(v.string())) })) },
  handler: async (ctx, { secret, members }) => {
    assertBot(secret);
    const now = Date.now();
    const incoming = new Map(members.map((m) => [m.discordId, m]));
    const existing = await ctx.db.query("discordMembers").collect();
    for (const row of existing) {
      const m = incoming.get(row.discordId);
      if (!m) { await ctx.db.delete(row._id); continue; }
      await ctx.db.patch(row._id, { username: m.username, displayName: m.displayName, roleIds: m.roleIds ?? [], syncedAt: now });
      incoming.delete(row.discordId);
    }
    for (const m of incoming.values()) await ctx.db.insert("discordMembers", { discordId: m.discordId, username: m.username, displayName: m.displayName, roleIds: m.roleIds ?? [], syncedAt: now });
    return { count: members.length };
  },
});

// Invitations « Envoyer un compte » dont le MP reste à envoyer.
export const accountDMQueue = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    return readAccountDMs(ctx);
  },
});

export const markAccountDMSent = mutation({
  args: { secret: v.string(), code: v.string() },
  handler: async (ctx, { secret, code }) => {
    assertBot(secret);
    const inv = await ctx.db.query("invitations").withIndex("by_code", (q) => q.eq("code", code)).first();
    if (inv) await ctx.db.patch(inv._id, { dmPending: false, dmSentAt: Date.now() });
  },
});

// Alertes de synchro Nexus à envoyer en MP (échecs répétés, comptes invalides).
export const nexusAlertQueue = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    return readNexusAlerts(ctx);
  },
});
export const markNexusAlertSent = mutation({
  args: { secret: v.string(), id: v.string() },
  handler: async (ctx, { secret, id }) => {
    assertBot(secret);
    const row = await ctx.db.get(id as import("./_generated/dataModel").Id<"nexusAlerts">);
    if (row) await ctx.db.patch(row._id, { sent: true });
  },
});

// Tâches de rôle Discord à exécuter (montées en grade).
export const roleJobsPending = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    return readRoleJobs(ctx);
  },
});

export const markRoleJob = mutation({
  args: { secret: v.string(), jobId: v.id("discordRoleJobs"), status: v.union(v.literal("DONE"), v.literal("ERROR")), error: v.optional(v.string()) },
  handler: async (ctx, { secret, jobId, status, error }) => {
    assertBot(secret);
    if (status === "DONE") { await ctx.db.patch(jobId, { status: "DONE", error: undefined }); return; }
    // Échec : souvent transitoire (membre pas encore en cache, rate-limit, hoquet
    // gateway). On garde le job PENDING (rejoué au prochain tick) jusqu'à un
    // plafond de tentatives, puis ERROR définitif - au lieu d'abandonner au 1er échec.
    const job = await ctx.db.get(jobId);
    if (!job) return;
    const attempts = (job.attempts ?? 0) + 1;
    const MAX_ATTEMPTS = 5;
    await ctx.db.patch(jobId, { status: attempts >= MAX_ATTEMPTS ? "ERROR" : "PENDING", attempts, error });
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
    return readConfig(ctx);
  },
});

// Récap quotidien : marque la date (Paris) du dernier envoi pour éviter les
// doublons (persistant, survit à un redéploiement du bot).
export const markDailyRecapSent = mutation({
  args: { secret: v.string(), day: v.string() },
  handler: async (ctx, { secret, day }) => {
    assertBot(secret);
    const cfg = await ctx.db.query("integrationConfig").first();
    if (cfg) await ctx.db.patch(cfg._id, { botLastDailyRecap: day });
    else await ctx.db.insert("integrationConfig", { botLastDailyRecap: day, updatedAt: Date.now() });
  },
});

const nrm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Heures de service d'un agent sur la semaine en cours, recherché par son nom
// RP (« prénom nom »). Sert à la commande /heures - pas de compte Discord lié.
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

// Fiche synthétique d'un citoyen recherché par son nom (« prénom nom »).
// Données personnelles : commande SENSIBLE (voir SENSITIVE_COMMANDS).
export const citizenByName = query({
  args: { secret: v.string(), query: v.string() },
  handler: async (ctx, { secret, query }) => {
    assertBot(secret);
    const needle = nrm(query);
    if (!needle) return null;
    // Même approche que casierByName : match exact prénom/nom (ou inversé),
    // sinon repli sur une correspondance partielle. On ignore les fiches
    // archivées/fusionnées (status !== ACTIVE) et soft-supprimées.
    const citizens = (await ctx.db.query("citizens").collect()).filter((x) => !x.deletedAt && x.status === "ACTIVE");
    const c =
      citizens.find((x) => nrm(`${x.prenom} ${x.nom}`) === needle || nrm(`${x.nom} ${x.prenom}`) === needle) ??
      citizens.find((x) => nrm(`${x.prenom} ${x.nom}`).includes(needle));
    if (!c) return null;

    // Casiers vivants (rapports/dossiers non annulés, non supprimés).
    const casierEntries = await ctx.db.query("casierEntries").withIndex("by_citizen", (q) => q.eq("citizenId", c._id)).collect();
    const casierCount = casierEntries.filter((e) => !e.deletedAt && e.status !== "ANNULEE").length;

    // Contraventions vivantes.
    const citations = await ctx.db.query("citations").withIndex("by_citizen", (q) => q.eq("citizenId", c._id)).collect();
    const citationCount = citations.filter((e) => !e.deletedAt && e.status !== "ANNULEE").length;

    // Véhicules dont le citoyen est propriétaire.
    const vehicles = await ctx.db.query("vehicles").withIndex("by_owner", (q) => q.eq("ownerId", c._id)).collect();
    const vehicleCount = vehicles.filter((veh) => !veh.deletedAt).length;

    // « Recherché » : dérivé des mandats actifs marksWanted (cf. citizens.isWanted).
    let wanted = false;
    const now = Date.now();
    for (const m of await ctx.db.query("mandats").withIndex("by_citizen", (q) => q.eq("citizenId", c._id)).collect()) {
      if (m.deletedAt || m.status !== "ACTIF") continue;
      if (m.expiresAt != null && m.expiresAt < now) continue;
      const type = await ctx.db.get(m.typeId);
      if (type?.marksWanted) { wanted = true; break; }
    }

    // Avis de recherche (BOLO) actif visant ce citoyen, le cas échéant.
    const bolos = (await ctx.db.query("bolos").withIndex("by_active", (q) => q.eq("active", true)).collect())
      .filter((b) => b.citizenId === c._id);
    const bolo = bolos.length > 0 ? { title: bolos[0].title, danger: bolos.some((b) => b.danger === true) } : null;

    return {
      prenom: c.prenom,
      nom: c.nom,
      dateNaissance: c.dateNaissance ?? null,
      sexe: c.sexe ?? null,
      telephone: c.telephone ?? null,
      nationalite: c.nationalite ?? null,
      deceased: c.deceased === true,
      wanted,
      casierCount,
      citationCount,
      vehicleCount,
      bolo,
    };
  },
});

// ============ Écritures self-service ============

// Demande d'absence posée depuis Discord pour un agent nommé. Statut EN_ATTENTE,
// à valider ensuite dans le MDT. Le demandeur Discord est tracé dans l'audit.
// Déclaration d'absence via Discord. Sans `query`, on cible l'agent lié au
// membre invoquant (par son discordId) = sa propre absence. Avec `query`, on
// cible un agent par son nom (déclaration pour autrui, dont l'accès est contrôlé
// côté commande). Validée d'emblée (APPROUVEE) : exclut aussitôt du roll call.
export const requestAbsence = mutation({
  args: { secret: v.string(), discordId: v.string(), query: v.optional(v.string()), from: v.number(), to: v.number(), reason: v.string(), discordName: v.string() },
  handler: async (ctx, { secret, discordId, query, from, to, reason, discordName }) => {
    assertBot(secret);
    if (to < from) return { ok: false as const, reason: "dates" };
    if (inclusiveDaysParis(from, to) < 3) return { ok: false as const, reason: "tropcourt" };
    let agent;
    if (query && query.trim()) {
      const needle = nrm(query);
      const agents = await ctx.db.query("agents").collect();
      agent =
        agents.find((a) => a.status === "ACTIVE" && (nrm(`${a.prenomRP} ${a.nomRP}`) === needle || nrm(`${a.nomRP} ${a.prenomRP}`) === needle)) ??
        agents.find((a) => a.status === "ACTIVE" && nrm(`${a.prenomRP} ${a.nomRP}`).includes(needle));
    } else {
      agent = await ctx.db.query("agents").withIndex("by_discord", (q) => q.eq("discordId", discordId)).first() ?? undefined;
    }
    if (!agent) return { ok: false as const, reason: query ? "introuvable" : "noncompte" };

    const id = await ctx.db.insert("absences", { agentId: agent._id, reason: reason.trim() || "Absence", from, to, status: "APPROUVEE", at: Date.now() });
    await ctx.db.insert("auditLog", {
      at: Date.now(), action: "absence.create_for", resourceType: "absence", resourceId: id,
      resourceLabel: `${agent.prenomRP} ${agent.nomRP}`, metadata: { via: "discord", by: discordName },
    });
    return { ok: true as const, name: `${agent.prenomRP} ${agent.nomRP}` };
  },
});

// Contrôle d'accès d'une commande Discord. Ouvert par défaut (aucune config).
// Commandes exposant des données personnelles ou créant des enregistrements :
// fail-closed « agents liés uniquement » par défaut (voir commandAllowed).
const SENSITIVE_COMMANDS = new Set(["plaque", "casier", "citoyen", "absence"]);

// Sinon autorisé si : owner ; OU un des rôles du membre est listé ; OU l'agent
// lié a un grade >= au grade minimum configuré.
export const commandAllowed = query({
  args: { secret: v.string(), command: v.string(), discordId: v.string(), roleIds: v.array(v.string()), isLspd: v.optional(v.boolean()) },
  handler: async (ctx, { secret, command, discordId, roleIds, isLspd }) => {
    assertBot(secret);
    const cfg = await ctx.db.query("discordCommandAccess").withIndex("by_command", (q) => q.eq("command", command)).first();
    const hasRoleRule = !!cfg && cfg.roleIds.length > 0;
    const hasGradeRule = !!cfg && !!cfg.minGradeId;
    if (!hasRoleRule && !hasGradeRule) {
      // Non configurée : ouverte pour les commandes anodines. Les commandes
      // SENSIBLES (PII citoyen/véhicule, ou création d'absence) restent réservées,
      // par défaut, aux membres du rôle LSPD OU à un agent lié et actif - jamais à
      // un membre Discord quelconque. Pour restreindre davantage, configurer
      // rôle/grade.
      if (!SENSITIVE_COMMANDS.has(command)) return true;
      if (isLspd) return true;
      const a = await ctx.db.query("agents").withIndex("by_discord", (q) => q.eq("discordId", discordId)).first();
      return !!a && a.status === "ACTIVE";
    }
    const agent = await ctx.db.query("agents").withIndex("by_discord", (q) => q.eq("discordId", discordId)).first();
    if (agent?.isOwner) return true;
    if (hasRoleRule && roleIds.some((r) => cfg!.roleIds.includes(r))) return true;
    if (hasGradeRule && agent?.gradeId) {
      const min = await ctx.db.get(cfg!.minGradeId!);
      const g = await ctx.db.get(agent.gradeId);
      if (min && g && g.position >= min.position) return true;
    }
    return false;
  },
});

// Discord IDs des agents en absence approuvée en cours (roll call : ne pas ping).
export const absentDiscordIds = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    const now = Date.now();
    const rows = (await ctx.db.query("absences").withIndex("by_status", (q) => q.eq("status", "APPROUVEE")).collect())
      .filter((ab) => ab.from <= now && ab.to >= now);
    const ids: string[] = [];
    for (const ab of rows) {
      const a = await ctx.db.get(ab.agentId);
      if (a?.discordId) ids.push(a.discordId);
    }
    return [...new Set(ids)];
  },
});

// Absences approuvées non encore publiées dans le salon Discord (le bot draine
// et poste un embed, puis marque comme publiées).
export const absencesToAnnounce = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    return readAbsencesToAnnounce(ctx);
  },
});

export const markAbsenceAnnounced = mutation({
  args: { secret: v.string(), id: v.id("absences") },
  handler: async (ctx, { secret, id }) => {
    assertBot(secret);
    await ctx.db.patch(id, { announced: true });
  },
});

// ---- File d'annonce des SANCTIONS (embed + ping rôle LSPD) ----
export const sanctionsToAnnounce = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    return readSanctionsToAnnounce(ctx);
  },
});
export const markSanctionAnnounced = mutation({
  args: { secret: v.string(), id: v.id("disciplines") },
  handler: async (ctx, { secret, id }) => {
    assertBot(secret);
    await ctx.db.patch(id, { discordAnnounced: true });
  },
});

// ---- File d'annonces de CÉRÉMONIE (annonce + résultat, message texte brut) ----
export const ceremonyPostsToSend = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    return readCeremonyPosts(ctx);
  },
});
export const markCeremonyPostSent = mutation({
  args: { secret: v.string(), id: v.id("ceremonyPosts") },
  handler: async (ctx, { secret, id }) => {
    assertBot(secret);
    await ctx.db.patch(id, { sent: true });
  },
});

// ---- File d'annonce FTO « Tuteur -> Tutorés » (message + ping) ----
export const markFtoAnnouncement = mutation({
  args: { secret: v.string(), id: v.id("ftoAnnouncements") },
  handler: async (ctx, { secret, id }) => {
    assertBot(secret);
    await ctx.db.patch(id, { sent: true });
  },
});

// ---- File d'annonce des CONVOCATIONS (embed + ping de l'agent) ----
export const convocationsToAnnounce = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    return readConvocationsToAnnounce(ctx);
  },
});
export const markConvocationAnnounced = mutation({
  args: { secret: v.string(), id: v.id("convocations") },
  handler: async (ctx, { secret, id }) => {
    assertBot(secret);
    await ctx.db.patch(id, { discordAnnounced: true });
  },
});

// ---- Suivi des dossiers d'arrestation & contraventions (embed édité en place) ----
// Le bot poste UN embed par dossier / contravention dans le salon de suivi, et le
// ré-édite (même message) à chaque changement. On ne draine QUE les lignes
// marquées `trackingDirty` via l'index dédié - jamais un scan de table.

// Premier officier affichable d'une entrée de casier (nom RP).
async function firstCasierOfficer(ctx: QueryCtx, e: Doc<"casierEntries">): Promise<string> {
  if (e.officers && e.officers.length) return e.officers[0].name;
  const oid = e.officerIds[0];
  if (oid) {
    const a = await ctx.db.get(oid);
    if (a) return `${a.prenomRP} ${a.nomRP}`;
  }
  return "-";
}

export const trackingPending = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    return readTrackingPending(ctx);
  },
});

// Après un envoi/édition réussi : mémorise le message + le salon, efface le drapeau.
export const trackingMark = mutation({
  args: {
    secret: v.string(),
    kind: v.union(v.literal("casier"), v.literal("citation")),
    id: v.string(),
    messageId: v.string(),
    channelId: v.string(),
  },
  handler: async (ctx, { secret, kind, id, messageId, channelId }) => {
    assertBot(secret);
    const patch = { trackingMessageId: messageId, trackingChannelId: channelId, trackingDirty: false };
    if (kind === "casier") await ctx.db.patch(id as Id<"casierEntries">, patch);
    else await ctx.db.patch(id as Id<"citations">, patch);
  },
});

// Cas supprimé/annulé : le message a été retiré côté Discord. On efface le
// drapeau ET l'id du message (rien à ré-éditer).
export const trackingClear = mutation({
  args: {
    secret: v.string(),
    kind: v.union(v.literal("casier"), v.literal("citation")),
    id: v.string(),
  },
  handler: async (ctx, { secret, kind, id }) => {
    assertBot(secret);
    const patch = { trackingDirty: false, trackingMessageId: undefined };
    if (kind === "casier") await ctx.db.patch(id as Id<"casierEntries">, patch);
    else await ctx.db.patch(id as Id<"citations">, patch);
  },
});

// Liste des absents en cours (commande /absents) : nom + fin + motif.
export const absencesCurrent = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    const now = Date.now();
    const rows = (await ctx.db.query("absences").withIndex("by_status", (q) => q.eq("status", "APPROUVEE")).collect())
      .filter((ab) => ab.from <= now && ab.to >= now)
      .sort((a, b) => a.to - b.to);
    const out = [];
    for (const ab of rows) {
      const a = await ctx.db.get(ab.agentId);
      if (!a || a.status !== "ACTIVE") continue;
      out.push({ name: `${a.prenomRP} ${a.nomRP}`, matricule: a.matricule ?? null, until: ab.to, reason: ab.reason });
    }
    return out;
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
    statusCategories: cfg?.statusCategories ?? [],
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
      statusCategories: v.optional(v.array(v.object({ status: v.string(), categoryId: v.string() }))),
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
      status: "OPEN", integrationStatus: "NEW", createdAt: Date.now(),
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
    return t ? { ownerId: t.ownerId, ownerName: t.ownerName, prenom: t.prenom, nom: t.nom, status: t.status, integrationStatus: t.integrationStatus ?? null, interviewAt: t.interviewAt ?? null, interviewById: t.interviewById ?? null, interviewPresence: t.interviewPresence ?? null, interviewMsgId: t.interviewMsgId ?? null, voteMsgId: t.voteMsgId ?? null } : null;
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

// !close <délai> : programme une fermeture automatique faute de réponse.
export const ticketScheduleClose = mutation({
  args: { secret: v.string(), channelId: v.string(), closeAt: v.number(), by: v.optional(v.string()) },
  handler: async (ctx, { secret, channelId, closeAt, by }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (!t || t.status !== "OPEN") return null;
    await ctx.db.patch(t._id, { scheduledCloseAt: closeAt });
    await logEvent(ctx, t, { type: "status", label: `Fermeture automatique programmée le ${new Date(closeAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })} sans réponse`, by });
    return { ownerId: t.ownerId, prenom: t.prenom, nom: t.nom };
  },
});

// Le candidat a répondu : on annule la fermeture programmée (le cas échéant).
export const ticketCancelScheduledClose = mutation({
  args: { secret: v.string(), channelId: v.string() },
  handler: async (ctx, { secret, channelId }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (!t || t.scheduledCloseAt == null) return { cancelled: false as const };
    await ctx.db.patch(t._id, { scheduledCloseAt: undefined });
    await logEvent(ctx, t, { type: "status", label: "Réponse du candidat : fermeture automatique annulée" });
    return { cancelled: true as const };
  },
});

// !ping / !alwaysping / !unping : abonnement d'un recruteur aux pings sur
// réponse du candidat. mode ONCE = prochaine réponse ; ALWAYS = chaque réponse ;
// OFF = se désabonner des deux.
export const ticketPingSubscribe = mutation({
  args: { secret: v.string(), channelId: v.string(), userId: v.string(), mode: v.union(v.literal("ONCE"), v.literal("ALWAYS"), v.literal("OFF")) },
  handler: async (ctx, { secret, channelId, userId, mode }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (!t || t.status !== "OPEN") return null;
    let once = (t.pingOnce ?? []).filter((id) => id !== userId);
    let always = (t.pingAlways ?? []).filter((id) => id !== userId);
    if (mode === "ONCE") once = [...once, userId];
    else if (mode === "ALWAYS") always = [...always, userId];
    await ctx.db.patch(t._id, { pingOnce: once, pingAlways: always });
    return { mode };
  },
});

// Le candidat a répondu : renvoie les recruteurs à notifier (once + always) et
// vide la liste « once » (les « always » restent abonnés).
export const ticketPingConsume = mutation({
  args: { secret: v.string(), channelId: v.string() },
  handler: async (ctx, { secret, channelId }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (!t) return [];
    const once = t.pingOnce ?? [];
    const always = t.pingAlways ?? [];
    if (once.length === 0 && always.length === 0) return [];
    if (once.length) await ctx.db.patch(t._id, { pingOnce: [] });
    return [...new Set([...once, ...always])];
  },
});

// Tickets dont la fermeture programmée est échue.
export const ticketsDueForClose = query({
  args: { secret: v.string(), now: v.number() },
  handler: async (ctx, { secret, now }) => {
    assertBot(secret);
    return readTicketsDue(ctx, now);
  },
});

// Fermeture automatique effective : la candidature repart de zéro (statut CLOSED
// => plus prise en compte par ticketByOwner, le candidat peut recandidater).
export const ticketAutoClose = mutation({
  args: { secret: v.string(), channelId: v.string() },
  handler: async (ctx, { secret, channelId }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (!t) return null;
    await ctx.db.patch(t._id, { status: "CLOSED", scheduledCloseAt: undefined, closeReason: "Fermeture automatique (absence de réponse du candidat)", closedBy: "Système" });
    await logEvent(ctx, t, { type: "close", label: "Ticket fermé automatiquement (absence de réponse du candidat)" });
    return { ownerId: t.ownerId, prenom: t.prenom, nom: t.nom };
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
      searchText: `${t.ownerName} ${t.prenom} ${t.nom} ${t.ownerId}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(),
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

const STATUS_LABELS: Record<string, string> = {
  NEW: "Nouvelle candidature", VOTE: "Vote en cours", ACCEPTED: "Acceptée · en attente d'entretien",
  INTERVIEW: "Entretien programmé", PASSED: "Entretien réussi · en attente d'académie",
  ACADEMY: "Retenu pour la prochaine académie", PRESENT: "Présent à l'académie", REJECTED: "Refusée / entretien raté",
  // Anciennes valeurs.
  EVALUATING: "En évaluation", FAILED: "Entretien raté", PASSED_ABSENT: "Réussi mais absent",
};
const TICKET_STATUS = v.union(
  v.literal("NEW"), v.literal("VOTE"), v.literal("ACCEPTED"), v.literal("INTERVIEW"),
  v.literal("PASSED"), v.literal("ACADEMY"), v.literal("PRESENT"), v.literal("REJECTED"),
);
export const ticketSetStatus = mutation({
  args: { secret: v.string(), channelId: v.string(), status: TICKET_STATUS, by: v.optional(v.string()), byId: v.optional(v.string()), interviewAt: v.optional(v.union(v.number(), v.null())) },
  handler: async (ctx, { secret, channelId, status, by, byId, interviewAt }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (t) {
      const patch: Record<string, unknown> = { integrationStatus: status };
      if (interviewAt !== undefined) {
        patch.interviewAt = interviewAt ?? undefined;
        // Re-programmer réarme le rappel + la confirmation + mémorise l'instructeur.
        patch.interviewRemindedFor = undefined;
        patch.interviewPresence = undefined;
        if (status === "INTERVIEW") patch.interviewById = byId ?? undefined;
      }
      await ctx.db.patch(t._id, patch);
      const suffix = status === "INTERVIEW" && interviewAt ? ` (${new Date(interviewAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })})` : "";
      await logEvent(ctx, t, { type: "status", label: `Statut : ${STATUS_LABELS[status] ?? status}${suffix}`, by });
    }
    return t ? { prenom: t.prenom, nom: t.nom } : null;
  },
});

// Propriétaires (id Discord) des tickets OUVERTS sur la piste académie
// (statuts PASSED / ACADEMY / PRESENT) : le bot leur GARANTIT le rôle Cadet et
// le retire à tous les autres (réconciliation authoritative).
const CADET_TICKET_STATUSES = new Set(["PASSED", "ACADEMY", "PRESENT"]);
export const cadetRoleOwners = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    const tickets = await ctx.db.query("tickets").withIndex("by_status", (q) => q.eq("status", "OPEN")).collect();
    return [...new Set(
      tickets.filter((t) => t.integrationStatus && CADET_TICKET_STATUSES.has(t.integrationStatus)).map((t) => t.ownerId),
    )];
  },
});

function genInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Fournir un compte SuperMDT à un cadet depuis son ticket (bouton instructeur).
// Crée une invitation pré-remplie (prénom/nom du ticket), grade Cadet (académie),
// SANS matricule (attribué à la diplomation), poussée au bot pour le MP.
export const ticketProvisionAccount = mutation({
  args: { secret: v.string(), channelId: v.string(), by: v.optional(v.string()) },
  handler: async (ctx, { secret, channelId, by }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (!t) return { ok: false as const, reason: "notfound" as const };
    if (t.integrationStatus !== "PRESENT") return { ok: false as const, reason: "notpresent" as const };
    const linked = await ctx.db.query("agents").withIndex("by_discord", (q) => q.eq("discordId", t.ownerId)).first();
    if (linked) return { ok: false as const, reason: "linked" as const };
    const cadetGrade = (await ctx.db.query("grades").collect())
      .filter((g) => g.academyOnly === true)
      .sort((a, b) => a.position - b.position)[0];
    if (!cadetGrade) return { ok: false as const, reason: "nograde" as const };

    // Réutilise une invitation en attente non consommée pour ce Discord.
    const existing = (await ctx.db.query("invitations").withIndex("by_dm_pending", (q) => q.eq("dmPending", true)).collect())
      .find((i) => i.discordId === t.ownerId && !i.revoked);
    const fields = {
      discordId: t.ownerId, discordUsername: t.ownerName, dmPending: true, dmSentAt: undefined,
      prefillNom: t.nom, prefillPrenom: t.prenom, prefillMatricule: undefined,
      prefillGradeId: cadetGrade._id, autoActivate: true,
      // Rattache le cadet à la promotion du ticket (s'il en a une) : à l'inscription
      // il devient membre de la promo → diplômable ensuite via promotions.graduate.
      promotionId: t.promotionId ?? undefined,
    };
    let code: string;
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      code = existing.code;
    } else {
      code = genInviteCode();
      while (await ctx.db.query("invitations").withIndex("by_code", (q) => q.eq("code", code)).first()) code = genInviteCode();
      await ctx.db.insert("invitations", {
        code, type: "SINGLE", maxUses: 1, usesCount: 0, revoked: false,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000, ...fields,
      });
    }
    await logEvent(ctx, t, { type: "status", label: "Compte SuperMDT (cadet) fourni", by });
    await ctx.scheduler.runAfter(0, internal.push.notify, {}); // MP d'invitation immédiat
    return { ok: true as const, code };
  },
});

// Entretiens dont le rappel (15 min avant) doit partir : programmés, pas encore
// rappelés, et l'instant présent est dans la fenêtre [entretien-15min, entretien[.
export const interviewReminders = query({
  args: { secret: v.string(), now: v.number() },
  handler: async (ctx, { secret, now }) => {
    assertBot(secret);
    return readInterviewReminders(ctx, now);
  },
});

export const markInterviewReminded = mutation({
  args: { secret: v.string(), channelId: v.string() },
  handler: async (ctx, { secret, channelId }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (t && t.interviewAt != null) await ctx.db.patch(t._id, { interviewRemindedFor: t.interviewAt });
  },
});

// Le candidat confirme (ou décline) sa présence à l'entretien (depuis son MP).
export const ticketSetPresence = mutation({
  args: { secret: v.string(), ownerId: v.string(), presence: v.union(v.literal("CONFIRMED"), v.literal("DECLINED")) },
  handler: async (ctx, { secret, ownerId, presence }) => {
    assertBot(secret);
    // Un même candidat peut avoir plusieurs tickets (tests, réouvertures) : on
    // cible celui qui est réellement OUVERT avec un entretien programmé.
    const t = (await ctx.db.query("tickets").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect())
      .filter((x) => x.status === "OPEN" && x.integrationStatus === "INTERVIEW" && x.interviewAt != null)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!t) return null;
    await ctx.db.patch(t._id, { interviewPresence: presence });
    await logEvent(ctx, t, { type: "status", label: presence === "CONFIRMED" ? "Présence à l'entretien confirmée par le candidat" : "Le candidat a signalé être indisponible" });
    return { channelId: t.channelId, interviewById: t.interviewById ?? null, interviewAt: t.interviewAt, prenom: t.prenom, nom: t.nom };
  },
});

// L'instructeur annule l'entretien : retour « en attente d'entretien » (ACCEPTED).
export const ticketCancelInterview = mutation({
  args: { secret: v.string(), channelId: v.string(), by: v.optional(v.string()) },
  handler: async (ctx, { secret, channelId, by }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (!t) return null;
    await ctx.db.patch(t._id, {
      integrationStatus: "ACCEPTED", interviewAt: undefined, interviewPresence: undefined,
      interviewRemindedFor: undefined, interviewById: undefined, interviewMsgId: undefined,
    });
    await logEvent(ctx, t, { type: "status", label: "Entretien annulé : retour en attente d'entretien", by });
    return { ownerId: t.ownerId, prenom: t.prenom, nom: t.nom, interviewMsgId: t.interviewMsgId ?? null };
  },
});

export const ticketSetVoteMsg = mutation({
  args: { secret: v.string(), channelId: v.string(), messageId: v.string() },
  handler: async (ctx, { secret, channelId, messageId }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (t) await ctx.db.patch(t._id, { voteMsgId: messageId });
  },
});

export const ticketSetInterviewMsg = mutation({
  args: { secret: v.string(), channelId: v.string(), messageId: v.string() },
  handler: async (ctx, { secret, channelId, messageId }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (t) await ctx.db.patch(t._id, { interviewMsgId: messageId });
  },
});

// Vote pour/contre d'une candidature : un vote par personne (modifiable).
export const ticketVote = mutation({
  args: { secret: v.string(), channelId: v.string(), discordUserId: v.string(), discordName: v.string(), choice: v.union(v.literal("FOR"), v.literal("AGAINST")) },
  handler: async (ctx, { secret, channelId, discordUserId, discordName, choice }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (!t) return { ok: false as const };
    const existing = await ctx.db.query("ticketVotes").withIndex("by_ticket_user", (q) => q.eq("ticketId", t._id).eq("discordUserId", discordUserId)).first();
    if (existing) await ctx.db.patch(existing._id, { choice, discordName, at: Date.now() });
    else await ctx.db.insert("ticketVotes", { ticketId: t._id, discordUserId, discordName, choice, at: Date.now() });
    return { ok: true as const };
  },
});

export const ticketVoteState = query({
  args: { secret: v.string(), channelId: v.string() },
  handler: async (ctx, { secret, channelId }) => {
    assertBot(secret);
    const t = await ctx.db.query("tickets").withIndex("by_channel", (q) => q.eq("channelId", channelId)).first();
    if (!t) return null;
    const votes = await ctx.db.query("ticketVotes").withIndex("by_ticket", (q) => q.eq("ticketId", t._id)).collect();
    const pick = (c: string) => votes.filter((v) => v.choice === c).sort((a, b) => a.at - b.at).map((v) => v.discordName);
    return { for: pick("FOR"), against: pick("AGAINST") };
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

// ============================================================================
// Helpers de lecture partagés + requête AGRÉGÉE du tick bot.
//
// Le bot (bot/src/tasks.ts runTick) interrogeait ~15 requêtes séparées à CHAQUE
// passage (poll de sécurité 5 min + chaque push Convex) = autant de « Function
// Calls » Convex. `tick` regroupe TOUTES ces lectures en UNE seule requête.
// Chaque tranche réutilise le MÊME helper que la requête individuelle
// correspondante (formats identiques : le bot change au minimum), et les
// tranches COÛTEUSES ne sont calculées que dans leur fenêtre horaire (gate sur
// `now` en heure de Paris). Les MUTATIONS restent séparées (écritures ponctuelles).
// ============================================================================

const TICK_TZ = "Europe/Paris";
// Heure murale de Paris (indépendante du fuseau serveur, UTC sur Convex) : date
// YYYY-MM-DD + minutes depuis minuit, pour ne calculer certaines tranches que
// dans leur créneau.
function parisClock(now: number): { date: string; min: number } {
  const p: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: TICK_TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(now))) p[part.type] = part.value;
  const hour = p.hour === "24" ? 0 : Number(p.hour);
  return { date: `${p.year}-${p.month}-${p.day}`, min: hour * 60 + Number(p.minute) };
}
const hhmmToMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

async function readConfig(ctx: QueryCtx) {
  const cfg = await ctx.db.query("integrationConfig").first();
  return {
    presenceChannel: cfg?.botPresenceChannel ?? null,
    dailyChannel: cfg?.botDailyChannel ?? null,
    rollcallChannel: cfg?.botRollcallChannel ?? null,
    absenceChannel: cfg?.botAbsenceChannel ?? null,
    dailyAt: cfg?.botDailyAt ?? "23:30",
    rollcallStartAt: cfg?.botRollcallStartAt ?? null,
    rollcallEndAt: cfg?.botRollcallEndAt ?? null,
    ceremonyAt: cfg?.botCeremonyAt ?? null,
    rollcallPingRole: cfg?.botRollcallPingRole ?? null,
    rollcallPingEnabled: cfg?.botRollcallPingEnabled ?? false,
    sanctionsChannel: cfg?.botSanctionsChannel ?? null,
    sanctionsPingRole: cfg?.botSanctionsPingRole ?? null,
    trackingChannel: cfg?.botTrackingChannel ?? null,
    lastDailyRecap: cfg?.botLastDailyRecap ?? null,
  };
}

async function readOnDuty(ctx: QueryCtx) {
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
  out.sort((x, y) => (y.gradePosition - x.gradePosition) || (x.since - y.since));
  return out;
}

async function readDayStats(ctx: QueryCtx) {
  const now = Date.now();
  const dayStart = startOfToday();

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

  const patrols = await ctx.db.query("patrols").order("desc").take(200);
  const patrolsToday = patrols.filter((p) => p.startedAt >= dayStart).length;

  const casier = (await ctx.db.query("casierEntries").order("desc").take(200)).filter((e) => !e.deletedAt && e.at >= dayStart).length;
  const citations = (await ctx.db.query("citations").order("desc").take(200)).filter((c) => !c.deletedAt && c.at >= dayStart).length;

  const topRaw = [...perAgent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const top = [];
  for (const [agentId, ms] of topRaw) {
    const a = await ctx.db.get(agentId as Doc<"agents">["_id"]);
    if (a) top.push({ name: `${a.prenomRP} ${a.nomRP}`, minutes: Math.round(ms / 60000) });
  }

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
    hourly,
  };
}

async function readRollcallForDate(ctx: QueryCtx, date: string) {
  const rc = await ctx.db.query("rollcalls").withIndex("by_date", (q) => q.eq("date", date)).first();
  if (!rc) return null;
  return { _id: rc._id, channelId: rc.channelId, messageId: rc.messageId, endsAt: rc.endsAt, closed: rc.closed, remindersSent: rc.remindersSent ?? [] };
}

async function readAccountDMs(ctx: QueryCtx) {
  const rows = (await ctx.db.query("invitations").withIndex("by_dm_pending", (q) => q.eq("dmPending", true)).collect())
    .filter((i) => !i.revoked && !i.dmSentAt && i.discordId);
  const baseUrl = (await ctx.db.query("integrationConfig").first())?.baseUrl ?? "";
  return rows.map((i) => ({ code: i.code, discordId: i.discordId!, baseUrl }));
}

async function readNexusAlerts(ctx: QueryCtx) {
  const rows = await ctx.db.query("nexusAlerts").withIndex("by_sent", (q) => q.eq("sent", false)).take(10);
  return rows.map((r) => ({ id: r._id as string, message: r.message, discordId: r.targetDiscordId }));
}

async function readRoleJobs(ctx: QueryCtx) {
  const rows = await ctx.db.query("discordRoleJobs").withIndex("by_status", (q) => q.eq("status", "PENDING")).collect();
  return rows.map((j) => ({ _id: j._id, discordId: j.discordId, addRoleId: j.addRoleId ?? null, removeRoleIds: j.removeRoleIds, reason: j.reason ?? null }));
}

async function readAbsencesToAnnounce(ctx: QueryCtx) {
  const rows = (await ctx.db.query("absences").withIndex("by_status", (q) => q.eq("status", "APPROUVEE")).collect())
    .filter((ab) => ab.announced !== true)
    .slice(0, 20);
  const out = [];
  for (const ab of rows) {
    const a = await ctx.db.get(ab.agentId);
    out.push({
      id: ab._id,
      name: a ? `${a.prenomRP} ${a.nomRP}` : "Agent",
      matricule: a?.matricule ?? null,
      discordId: a?.discordId ?? null,
      from: ab.from, to: ab.to, reason: ab.reason,
    });
  }
  return out;
}

async function readSanctionsToAnnounce(ctx: QueryCtx) {
  const rows = (await ctx.db.query("disciplines").withIndex("by_announce", (q) => q.eq("discordAnnounced", false)).collect())
    .filter((d) => !d.deletedAt)
    .slice(0, 20);
  const out = [];
  for (const d of rows) {
    const a = await ctx.db.get(d.agentId);
    const by = d.byAgentId ? await ctx.db.get(d.byAgentId) : null;
    out.push({
      id: d._id,
      reference: d.reference ?? null,
      agentName: a ? `${a.prenomRP} ${a.nomRP}` : "Agent",
      agentMatricule: a?.matricule ?? null,
      agentDiscordId: a?.discordId ?? null,
      motif: d.motif,
      sanction: d.sanction,
      level: d.level ?? null,
      suspends: d.suspends ?? false,
      suspendedUntil: d.suspendedUntil ?? null,
      byName: by ? `${by.prenomRP} ${by.nomRP}` : null,
      byMatricule: by?.matricule ?? null,
      at: d.at,
    });
  }
  return out;
}

async function readCeremonyPosts(ctx: QueryCtx) {
  const cfg = await ctx.db.query("integrationConfig").first();
  const rows = (await ctx.db.query("ceremonyPosts").withIndex("by_sent", (q) => q.eq("sent", false)).collect()).slice(0, 10);
  return { channel: cfg?.botCeremonyChannel ?? null, posts: rows.map((p) => ({ id: p._id, content: p.content })) };
}

// Annonces FTO en attente : le salon est figé dans chaque ligne (ping inclus dans
// le contenu). Le bot poste puis marque `sent`.
async function readFtoAnnouncements(ctx: QueryCtx) {
  const rows = (await ctx.db.query("ftoAnnouncements").withIndex("by_sent", (q) => q.eq("sent", false)).collect()).slice(0, 10);
  return rows.map((p) => ({
    id: p._id,
    channelId: p.channelId,
    pingContent: p.pingContent ?? null,
    description: p.description ?? null,
    tutorCount: p.tutorCount ?? 0,
    traineeCount: p.traineeCount ?? 0,
    content: p.content ?? null, // legacy
  }));
}

async function readConvocationsToAnnounce(ctx: QueryCtx) {
  const rows = (await ctx.db.query("convocations").withIndex("by_announce", (q) => q.eq("discordAnnounced", false)).collect())
    .filter((c) => !c.deletedAt)
    .slice(0, 20);
  const out = [];
  for (const c of rows) {
    const a = c.agentId ? await ctx.db.get(c.agentId) : null;
    const by = c.byAgentId ? await ctx.db.get(c.byAgentId) : null;
    out.push({
      id: c._id,
      reference: c.reference ?? null,
      agentName: a ? `${a.prenomRP} ${a.nomRP}` : c.agentLabel ?? null,
      agentMatricule: a?.matricule ?? null,
      pingDiscordId: a?.discordId ?? c.discordId ?? null,
      motif: c.motif,
      convokedAt: c.convokedAt ?? null,
      lieu: c.lieu ?? null,
      byName: by ? `${by.prenomRP} ${by.nomRP}` : null,
      byMatricule: by?.matricule ?? null,
      at: c.at,
    });
  }
  return out;
}

async function readTrackingPending(ctx: QueryCtx) {
  const cfg = await ctx.db.query("integrationConfig").first();
  const base = cfg?.baseUrl?.trim().replace(/\/+$/, "");
  const link = (citizenId: string) => (base ? `${base}/citoyen/${citizenId}` : null);

  const out: {
    kind: "casier" | "citation";
    id: string;
    trackingMessageId: string | null;
    trackingChannelId: string | null;
    citizenId: string;
    citizenName: string;
    label: string;
    charges: string[];
    officer: string;
    totalFine: number;
    amendeStatut: string | null;
    closed: boolean;
    at: number;
    deleted: boolean;
    url: string | null;
  }[] = [];

  const casiers = await ctx.db
    .query("casierEntries")
    .withIndex("by_tracking_dirty", (q) => q.eq("trackingDirty", true))
    .take(25);
  for (const e of casiers) {
    const citizen = await ctx.db.get(e.citizenId);
    const charges = await ctx.db.query("casierCharges").withIndex("by_entry", (q) => q.eq("entryId", e._id)).collect();
    const amende = (await ctx.db.query("amendes").withIndex("by_casier", (q) => q.eq("casierEntryId", e._id)).collect()).find((a) => !a.deletedAt);
    out.push({
      kind: "casier",
      id: e._id as string,
      trackingMessageId: e.trackingMessageId ?? null,
      trackingChannelId: e.trackingChannelId ?? null,
      citizenId: e.citizenId as string,
      citizenName: citizen ? `${citizen.prenom} ${citizen.nom}` : "-",
      label: e.arrestType === "DOSSIER" ? "Dossier d'arrestation" : "Rapport d'arrestation",
      charges: charges.map((c) => chargeDisplayNameQty(c.snapshot.name, c.attemptType, c.formulaParam)),
      officer: await firstCasierOfficer(ctx, e),
      totalFine: e.totalFine,
      amendeStatut: amende?.statut ?? null,
      closed: e.closed ?? false,
      at: e.at,
      deleted: !!e.deletedAt || e.status === "ANNULEE",
      url: link(e.citizenId as string),
    });
  }

  const citations = await ctx.db
    .query("citations")
    .withIndex("by_tracking_dirty", (q) => q.eq("trackingDirty", true))
    .take(25);
  for (const c of citations) {
    const citizen = await ctx.db.get(c.citizenId);
    const charges = await ctx.db.query("citationCharges").withIndex("by_citation", (q) => q.eq("citationId", c._id)).collect();
    const amende = (await ctx.db.query("amendes").withIndex("by_citation", (q) => q.eq("citationId", c._id)).collect()).find((a) => !a.deletedAt);
    let officer = c.officerName ?? "-";
    if (!c.officerName) {
      const a = await ctx.db.get(c.officerId);
      if (a) officer = `${a.prenomRP} ${a.nomRP}`;
    }
    out.push({
      kind: "citation",
      id: c._id as string,
      trackingMessageId: c.trackingMessageId ?? null,
      trackingChannelId: c.trackingChannelId ?? null,
      citizenId: c.citizenId as string,
      citizenName: citizen ? `${citizen.prenom} ${citizen.nom}` : "-",
      label: "Contravention",
      charges: charges.map((ch) => chargeDisplayNameQty(ch.snapshot.name, ch.attemptType, ch.formulaParam)),
      officer,
      totalFine: c.totalFine,
      amendeStatut: amende?.statut ?? null,
      closed: false,
      at: c.at,
      deleted: !!c.deletedAt || c.status === "ANNULEE",
      url: link(c.citizenId as string),
    });
  }

  return out;
}

async function readTicketsDue(ctx: QueryCtx, now: number) {
  const rows = await ctx.db.query("tickets")
    .withIndex("by_close", (q) => q.eq("status", "OPEN").gt("scheduledCloseAt", 0).lte("scheduledCloseAt", now))
    .collect();
  return rows.map((t) => ({ channelId: t.channelId, ownerId: t.ownerId, prenom: t.prenom, nom: t.nom }));
}

async function readInterviewReminders(ctx: QueryCtx, now: number) {
  const tickets = await ctx.db.query("tickets")
    .withIndex("by_interview", (q) => q.eq("status", "OPEN").gt("interviewAt", now).lte("interviewAt", now + 15 * 60_000))
    .collect();
  const due = tickets.filter((t) =>
    t.integrationStatus === "INTERVIEW" &&
    t.interviewRemindedFor !== t.interviewAt,
  );
  return due.map((t) => ({ channelId: t.channelId, ownerId: t.ownerId, interviewById: t.interviewById ?? null, interviewAt: t.interviewAt!, prenom: t.prenom, nom: t.nom, interviewPresence: t.interviewPresence ?? null }));
}

// Requête AGRÉGÉE : UNE Function Call par tick au lieu de ~15. Les tranches
// coûteuses/temporelles (roll call, récap quotidien) sont gardées par `now`.
export const tick = query({
  args: { secret: v.string(), now: v.number() },
  handler: async (ctx, { secret, now }) => {
    assertBot(secret);
    const config = await readConfig(ctx);
    const ticketConfig = ticketDefaults(await ctx.db.query("ticketConfig").first());
    const clock = parisClock(now);

    // Roll call : n'existe qu'à partir de l'heure d'ouverture (avant, aucun appel
    // du jour n'est encore créé -> rollcallToday renverrait null de toute façon).
    let rollcall: Awaited<ReturnType<typeof readRollcallForDate>> = null;
    if (
      config.rollcallChannel && config.rollcallStartAt && config.rollcallEndAt &&
      clock.min >= hhmmToMin(config.rollcallStartAt)
    ) {
      rollcall = await readRollcallForDate(ctx, clock.date);
    }

    // Récap quotidien (COÛTEUX : agrège les sessions) : seulement passé l'heure et
    // pas déjà envoyé aujourd'hui (anti-doublon persistant).
    let dayStats: Awaited<ReturnType<typeof readDayStats>> | null = null;
    if (
      config.dailyChannel && config.dailyAt &&
      clock.min >= hhmmToMin(config.dailyAt) &&
      config.lastDailyRecap !== clock.date
    ) {
      dayStats = await readDayStats(ctx);
    }

    return {
      config,
      ticketConfig,
      rollcall,
      dayStats,
      // Tranches toujours utiles (files de drain, indexées et petites).
      agentsOnDuty: config.presenceChannel ? await readOnDuty(ctx) : null,
      ticketsDueForClose: await readTicketsDue(ctx, now),
      interviewReminders: await readInterviewReminders(ctx, now),
      accountDMQueue: await readAccountDMs(ctx),
      nexusAlertQueue: await readNexusAlerts(ctx),
      roleJobsPending: await readRoleJobs(ctx),
      ceremonyPosts: await readCeremonyPosts(ctx),
      ftoAnnouncements: await readFtoAnnouncements(ctx),
      // Tranches conditionnées au salon configuré (rien à publier sinon).
      absencesToAnnounce: config.absenceChannel ? await readAbsencesToAnnounce(ctx) : [],
      sanctionsToAnnounce: config.sanctionsChannel ? await readSanctionsToAnnounce(ctx) : [],
      convocationsToAnnounce: config.sanctionsChannel ? await readConvocationsToAnnounce(ctx) : [],
      trackingPending: config.trackingChannel ? await readTrackingPending(ctx) : [],
    };
  },
});
