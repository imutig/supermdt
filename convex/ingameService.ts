import { v, ConvexError } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAgent, requirePermission } from "./rbac";
import { writeSystemLog } from "./systemLog";
import { parisParts, parisWallToEpoch } from "./lib/paris";
import { assertBot } from "./bot";

// Services IN-GAME importés depuis le salon Discord « VIZU | Service Log ».
// Le bot lit les embeds, en extrait début/fin + le Discord du joueur, et alimente
// cette table (dédup par messageId). Indépendant des services MDT.

// ---------- API bot (secret partagé) ----------

// État de synchro pour le bot : salon à lire + curseur + demande de resync.
export const syncState = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    const cfg = await ctx.db.query("integrationConfig").first();
    return {
      channelId: cfg?.botIngameServiceChannel ?? null,
      lastMsgId: cfg?.ingameServiceLastMsgId ?? null,
      resync: cfg?.ingameServiceResync === true,
    };
  },
});

// Enregistre une prise de service in-game (idempotent par messageId). Apparie
// l'agent via son discordId si le compte est lié.
export const upsert = mutation({
  args: {
    secret: v.string(),
    messageId: v.string(),
    discordId: v.string(),
    ingameName: v.optional(v.string()),
    ingameId: v.optional(v.string()),
    startedAt: v.number(),
    endedAt: v.number(),
  },
  handler: async (ctx, a) => {
    assertBot(a.secret);
    if (a.endedAt <= a.startedAt) return { created: false as const };
    const existing = await ctx.db.query("inGameServices").withIndex("by_message", (q) => q.eq("messageId", a.messageId)).first();
    if (existing) return { created: false as const };
    const agent = await ctx.db.query("agents").withIndex("by_discord", (q) => q.eq("discordId", a.discordId)).first();
    await ctx.db.insert("inGameServices", {
      messageId: a.messageId,
      discordId: a.discordId,
      agentId: agent?._id,
      ingameName: a.ingameName,
      ingameId: a.ingameId,
      startedAt: a.startedAt,
      endedAt: a.endedAt,
      seconds: Math.floor((a.endedAt - a.startedAt) / 1000),
      createdAt: Date.now(),
    });
    // Compteur maintenu sur integrationConfig : évite de rescanner toute la table
    // à chaque lecture de `config` (query réactive) — l'import initial la faisait
    // relire en O(n²). Insertions séquentielles côté bot → pas de contention.
    const cfg = await ctx.db.query("integrationConfig").first();
    if (cfg) await ctx.db.patch(cfg._id, { ingameServiceCount: (cfg.ingameServiceCount ?? 0) + 1 });
    return { created: true as const };
  },
});

// Récap d'une passe de synchro des services in-game (journal technique). Appelé
// par le bot après chaque passe : trace ce qui a été récupéré depuis Discord, et
// les échecs, pour faciliter le dépannage.
export const logSync = mutation({
  args: {
    secret: v.string(),
    processed: v.number(),
    created: v.number(),
    full: v.optional(v.boolean()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { secret, processed, created, full, error }) => {
    assertBot(secret);
    if (error) {
      await writeSystemLog(ctx, { source: "ingame", level: "ERROR", event: "ingame.sync", message: `Échec de la synchro des services in-game : ${error}` });
      return;
    }
    // On ne trace que les passes utiles (au moins un nouveau service) pour ne pas
    // saturer le journal — la passe tourne chaque minute.
    if (created > 0) {
      await writeSystemLog(ctx, {
        source: "ingame", level: "INFO", event: "ingame.sync",
        message: `${created} nouveau(x) service(s) in-game importé(s) depuis Discord${full ? " (resync complète)" : ""}.`,
        count: created, metadata: { processed, full: !!full },
      });
    }
  },
});

// Curseur de synchro : dernier message traité + horodatage ; efface la demande
// de resync une fois l'historique parcouru.
export const setCursor = mutation({
  args: { secret: v.string(), lastMsgId: v.optional(v.string()), clearResync: v.optional(v.boolean()) },
  handler: async (ctx, { secret, lastMsgId, clearResync }) => {
    assertBot(secret);
    const cfg = await ctx.db.query("integrationConfig").first();
    // Fin d'une resync complète : on recale le compteur en scannant la table UNE
    // fois (rare, piloté par l'admin). Entre deux resyncs, `upsert` l'incrémente.
    const recount = clearResync ? (await ctx.db.query("inGameServices").collect()).length : undefined;
    const patch = {
      ...(lastMsgId ? { ingameServiceLastMsgId: lastMsgId } : {}),
      ...(clearResync ? { ingameServiceResync: false } : {}),
      ...(recount !== undefined ? { ingameServiceCount: recount } : {}),
      ingameServiceLastSyncAt: Date.now(),
      updatedAt: Date.now(),
    };
    if (cfg) await ctx.db.patch(cfg._id, patch);
    else await ctx.db.insert("integrationConfig", patch);
  },
});

// ---------- Découpage hebdomadaire (lundi 00:00 -> dimanche 23:59:59.999, Paris) ----------
function weekStartOf(ts: number): number {
  const p = parisParts(ts);
  const dow = (new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay() + 6) % 7; // lundi = 0
  return parisWallToEpoch(p.y, p.mo, p.d - dow, 0, 0);
}
function weekEndOf(start: number): number {
  const p = parisParts(start);
  return parisWallToEpoch(p.y, p.mo, p.d + 6, 23, 59) + 59_999;
}
function isoWeek(ts: number): { week: number; year: number } {
  const p = parisParts(ts);
  const d = new Date(Date.UTC(p.y, p.mo - 1, p.d));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = Date.UTC(d.getUTCFullYear(), 0, 4);
  const week = 1 + Math.round(((d.getTime() - firstThu) / 86_400_000 - 3 + ((new Date(firstThu).getUTCDay() + 6) % 7)) / 7);
  return { week, year: d.getUTCFullYear() };
}
function fmtHours(sec: number): string {
  return `${Math.floor(sec / 3600)} h ${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}`;
}

// Secondes de service in-game chevauchant [from, to] parmi une liste (déjà
// filtrée par agent). Un service à cheval sur deux semaines est ainsi réparti.
export function overlapSeconds(rows: { startedAt: number; endedAt: number }[], from: number, to: number): number {
  let sec = 0;
  for (const s of rows) {
    const a = Math.max(s.startedAt, from), b = Math.min(s.endedAt, to);
    if (b > a) sec += Math.floor((b - a) / 1000);
  }
  return sec;
}

// ---------- Vue joueur ----------
export const myWeekly = query({
  args: { weeks: v.optional(v.number()) },
  handler: async (ctx, { weeks }) => {
    const agent = await requireAgent(ctx);
    const rows = agent.discordId
      ? await ctx.db.query("inGameServices").withIndex("by_discord", (q) => q.eq("discordId", agent.discordId!)).collect()
      : await ctx.db.query("inGameServices").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).collect();
    const n = Math.min(Math.max(weeks ?? 8, 1), 26);
    const curStart = weekStartOf(Date.now());
    const out = [];
    let totalSec = 0;
    for (let i = 0; i < n; i++) {
      // i semaines en arrière : on recule de 7 jours en heure murale.
      const p = parisParts(curStart - i * 7 * 86_400_000 + 12 * 3600_000); // midi pour éviter les bords DST
      const start = parisWallToEpoch(p.y, p.mo, p.d - ((new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay() + 6) % 7), 0, 0);
      const end = weekEndOf(start);
      // Détail : chaque service chevauchant la semaine, avec la part comptée pour
      // CETTE semaine (un service à cheval est réparti entre deux semaines).
      const services = [];
      let sec = 0;
      for (const s of rows) {
        const a = Math.max(s.startedAt, start), b = Math.min(s.endedAt, end);
        if (b <= a) continue;
        const overlap = Math.floor((b - a) / 1000);
        sec += overlap;
        services.push({
          startedAt: s.startedAt, endedAt: s.endedAt, seconds: s.seconds,
          weekSeconds: overlap, weekDisplay: fmtHours(overlap), display: fmtHours(s.seconds),
          split: a > s.startedAt || b < s.endedAt,
          ingameName: s.ingameName ?? null,
        });
      }
      services.sort((x, y) => x.startedAt - y.startedAt);
      const { week, year } = isoWeek(start);
      out.push({ weekStart: start, weekEnd: end, label: `Semaine ${week} · ${year}`, seconds: sec, display: fmtHours(sec), count: services.length, services });
    }
    for (const s of rows) totalSec += s.seconds;
    return { weeks: out, totalSeconds: totalSec, totalDisplay: fmtHours(totalSec), linked: !!agent.discordId, count: rows.length };
  },
});

// ---------- Config & resync (site) ----------
export const config = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "services.manage");
    const cfg = await ctx.db.query("integrationConfig").first();
    return {
      channelId: cfg?.botIngameServiceChannel ?? "",
      lastSyncAt: cfg?.ingameServiceLastSyncAt ?? null,
      resyncPending: cfg?.ingameServiceResync === true,
      // Compteur maintenu (voir upsert) — plus de scan intégral de la table ici.
      total: cfg?.ingameServiceCount ?? 0,
    };
  },
});

// Backfill unique du compteur (à lancer une fois après déploiement, puis maintenu
// par upsert + setCursor). Gardé par le secret bot pour être exécutable en CLI.
// `npx convex run --prod ingameService:backfillCount '{"secret":"<BOT_SECRET>"}'`.
export const backfillCount = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertBot(secret);
    const cfg = await ctx.db.query("integrationConfig").first();
    if (!cfg) return 0;
    const n = (await ctx.db.query("inGameServices").collect()).length;
    await ctx.db.patch(cfg._id, { ingameServiceCount: n });
    return n;
  },
});

export const setChannel = mutation({
  args: { channelId: v.string() },
  handler: async (ctx, { channelId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rbac.manage");
    const cfg = await ctx.db.query("integrationConfig").first();
    const clean = channelId.trim().replace(/[^0-9]/g, "") || undefined;
    const patch = { botIngameServiceChannel: clean, updatedAt: Date.now() };
    if (cfg) await ctx.db.patch(cfg._id, patch);
    else await ctx.db.insert("integrationConfig", patch);
  },
});

// Demande une resynchronisation complète (relit l'historique). Le bot la traite
// au prochain passage. Réveille le bot pour un traitement immédiat.
export const requestResync = mutation({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "services.manage");
    const cfg = await ctx.db.query("integrationConfig").first();
    if (!cfg?.botIngameServiceChannel) throw new ConvexError("Configurez d'abord le salon des services in-game.");
    // Resync = on efface le curseur pour relire tout l'historique.
    await ctx.db.patch(cfg._id, { ingameServiceResync: true, ingameServiceLastMsgId: undefined, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.push.notify, {});
  },
});

// Recompte l'apparition d'un agent après qu'il a lié son Discord : rattache les
// services in-game orphelins. Appelé après un changement de discordId (optionnel).
export const relinkAgent = internalMutation({
  args: { agentId: v.id("agents"), discordId: v.string() },
  handler: async (ctx, { agentId, discordId }) => {
    for (const s of await ctx.db.query("inGameServices").withIndex("by_discord", (q) => q.eq("discordId", discordId)).collect()) {
      if (s.agentId !== agentId) await ctx.db.patch(s._id, { agentId });
    }
  },
});

// Somme des heures in-game de la station sur [from, to] (pour le rapport hebdo).
export async function stationInGameSeconds(ctx: QueryCtx, from: number, to: number): Promise<number> {
  const rows = await ctx.db.query("inGameServices").collect();
  return overlapSeconds(rows, from, to);
}
