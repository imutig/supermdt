import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAgent, requirePermission, agentLabel } from "./rbac";

const DAY = 86_400_000;

// Statistiques de la station (État-Major). Fenêtres bornées pour rester performant.
// Fenêtre de fraîcheur : en deçà, on ne recalcule pas. Le calcul balaie
// plusieurs milliers de documents, le rejouer à chaque écriture le rendait
// proportionnel au trafic ET au nombre de clients abonnés.
const STALE_MS = 5 * 60 * 1000;

// Forme de l'instantané : la table le stocke en v.any(), ce type restitue le
// contrat au client, qui perdrait sinon tout typage.
export type StatsData = {
  counts: { agentsActive: number; citizensCount: number; vehiclesCount: number; weaponsCount: number; mandatsActive: number };
  arrests: { total: number; week: number; month: number };
  citations: { total: number; week: number; month: number };
  fines: { collected: number; unpaid: number };
  topAgents: { matricule: number | null; name: string; count: number }[];
  topCharges: { name: string; count: number }[];
  days: { day: string; arr: number; cit: number }[];
  defcon: { name: string; color: string | null } | null;
};

// Lecture : un seul document. `null` tant qu'aucun calcul n'a eu lieu.
export const overview = query({
  args: {},
  handler: async (ctx): Promise<(StatsData & { computedAt: number }) | null> => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "stats.view");
    const snap = await ctx.db.query("statsSnapshot").first();
    if (!snap) return null;
    return { ...(snap.data as StatsData), computedAt: snap.computedAt };
  },
});

// Demande un recalcul, ignorée si l'instantané est encore frais. Appelée par
// les mutations qui modifient les données agrégées : le coût réel est donc
// borné à un calcul par fenêtre, quel que soit le volume d'écritures.
export async function touchStats(ctx: MutationCtx) {
  const snap = await ctx.db.query("statsSnapshot").first();
  if (snap && Date.now() - snap.computedAt < STALE_MS) return;
  await ctx.scheduler.runAfter(0, internal.stats.recompute, {});
}

// Appelée à l'ouverture de la page. Sans elle, une base neuve n'obtient jamais
// son premier instantané : le recalcul n'était demandé que par les écritures.
export const requestRefresh = mutation({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "stats.view");
    await touchStats(ctx);
  },
});

export const recompute = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const weekAgo = now - 7 * DAY;
    const monthAgo = now - 30 * DAY;

    // ---- Compteurs globaux ----
    const agentsActive = (await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "ACTIVE")).collect()).filter((a) => !a.isOwner).length;
    const citizensCount = (await ctx.db.query("citizens").take(5000)).filter((c) => c.status === "ACTIVE").length;
    const vehiclesCount = (await ctx.db.query("vehicles").take(5000)).length;
    const weaponsCount = (await ctx.db.query("weapons").take(5000)).length;

    // ---- Arrestations (casier) ----
    const casiers = await ctx.db.query("casierEntries").order("desc").take(2000);
    let arrTotal = 0, arrWeek = 0, arrMonth = 0, fineCollected = 0, fineUnpaid = 0;
    const agentTally = new Map<string, number>();
    for (const e of casiers) {
      if (e.deletedAt || e.status === "ANNULEE") continue;
      arrTotal++;
      if (e.at >= weekAgo) arrWeek++;
      if (e.at >= monthAgo) arrMonth++;
      if (e.totalFine > 0) {
        if (e.finePaid === true) fineCollected += e.totalFine;
        else fineUnpaid += e.totalFine;
      }
      if (e.at >= monthAgo) {
        const off = e.officerIds[0] ?? e.createdBy;
        if (off) agentTally.set(off, (agentTally.get(off) ?? 0) + 1);
      }
    }

    // ---- Contraventions ----
    const citations = await ctx.db.query("citations").order("desc").take(2000);
    let citTotal = 0, citWeek = 0, citMonth = 0;
    for (const c of citations) {
      if (c.deletedAt || c.status === "ANNULEE") continue;
      citTotal++;
      if (c.at >= weekAgo) citWeek++;
      if (c.at >= monthAgo) citMonth++;
      if (c.totalFine > 0) {
        if (c.finePaid === true) fineCollected += c.totalFine;
        else fineUnpaid += c.totalFine;
      }
      if (c.at >= monthAgo) agentTally.set(c.officerId, (agentTally.get(c.officerId) ?? 0) + 1);
    }

    // ---- Top agents (30 j) ----
    const topAgentsRaw = [...agentTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const topAgents = [];
    for (const [id, count] of topAgentsRaw) {
      const label = await agentLabel(ctx, id as import("./_generated/dataModel").Id<"agents">);
      topAgents.push({ ...label, count });
    }

    // ---- Top charges (casier + contraventions) ----
    const chargeTally = new Map<string, number>();
    for (const ch of await ctx.db.query("casierCharges").take(4000)) {
      chargeTally.set(ch.snapshot.name, (chargeTally.get(ch.snapshot.name) ?? 0) + 1);
    }
    for (const ch of await ctx.db.query("citationCharges").take(4000)) {
      chargeTally.set(ch.snapshot.name, (chargeTally.get(ch.snapshot.name) ?? 0) + 1);
    }
    const topCharges = [...chargeTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));

    // ---- Activité par jour (14 derniers jours) : arrestations + contraventions ----
    const days: { day: string; arr: number; cit: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const start = new Date(now - i * DAY);
      start.setHours(0, 0, 0, 0);
      const s = start.getTime();
      const e2 = s + DAY;
      const label = start.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
      const arr = casiers.filter((x) => !x.deletedAt && x.status !== "ANNULEE" && x.at >= s && x.at < e2).length;
      const cit = citations.filter((x) => !x.deletedAt && x.status !== "ANNULEE" && x.at >= s && x.at < e2).length;
      days.push({ day: label, arr, cit });
    }

    // ---- DEFCON courant ----
    const levels = await ctx.db.query("defconLevels").withIndex("by_position").collect();
    const def = levels.find((l) => l.isDefault) ?? levels[0] ?? null;
    const lastChange = await ctx.db.query("defconChanges").withIndex("by_at").order("desc").first();
    let currentDefcon = def;
    if (lastChange && !(lastChange.until != null && lastChange.until < now)) {
      currentDefcon = (await ctx.db.get(lastChange.levelId)) ?? def;
    }

    // ---- Mandats actifs ----
    const mandatsActive = (await ctx.db.query("mandats").withIndex("by_status", (q) => q.eq("status", "ACTIF")).collect()).filter((m) => !m.deletedAt).length;

    const data = {
      counts: { agentsActive, citizensCount, vehiclesCount, weaponsCount, mandatsActive },
      arrests: { total: arrTotal, week: arrWeek, month: arrMonth },
      citations: { total: citTotal, week: citWeek, month: citMonth },
      fines: { collected: fineCollected, unpaid: fineUnpaid },
      topAgents,
      topCharges,
      days,
      defcon: currentDefcon ? { name: currentDefcon.name, color: currentDefcon.color ?? null } : null,
    };

    const existing = await ctx.db.query("statsSnapshot").first();
    if (existing) await ctx.db.patch(existing._id, { data, computedAt: now });
    else await ctx.db.insert("statsSnapshot", { data, computedAt: now });
    return "ok";
  },
});
