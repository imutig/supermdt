import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

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

export const rollcallOpen = mutation({
  args: { secret: v.string(), date: v.string(), channelId: v.string(), messageId: v.string(), endsAt: v.number() },
  handler: async (ctx, { secret, date, channelId, messageId, endsAt }) => {
    assertBot(secret);
    // Course éventuelle : si un appel existe déjà pour la date, on renvoie
    // l'existant, le bot supprimera son message en double.
    const existing = await ctx.db.query("rollcalls").withIndex("by_date", (q) => q.eq("date", date)).first();
    if (existing) return { _id: existing._id, duplicate: existing.messageId !== messageId };
    const _id = await ctx.db.insert("rollcalls", { date, channelId, messageId, startedAt: Date.now(), endsAt, closed: false });
    return { _id, duplicate: false };
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
    const veh = all.find((v) => v.plaque.toUpperCase().replace(/\s+/g, "") === p);
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
