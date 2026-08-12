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
type TopAgent = { matricule: number | null; name: string; count: number };
type PeriodStats = {
  arrests: number;
  citations: number;
  topAgents: TopAgent[];
  topAgentsCasiers: TopAgent[];
  topAgentsContraventions: TopAgent[];
};
export const STAT_PERIODS = [7, 14, 30] as const;
export type StatsData = {
  counts: { agentsActive: number; citizensCount: number; vehiclesCount: number; weaponsCount: number; mandatsActive: number };
  // Statistiques par fenêtre glissante (jours). Le front choisit la période.
  periods: Record<string, PeriodStats>;
  topCharges: { name: string; count: number }[];
  days: { day: string; arr: number; cit: number }[]; // série journalière sur 30 j
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

    // ---- Compteurs globaux ----
    const allAgents = await ctx.db.query("agents").collect();
    const agentsActive = allAgents.filter((a) => a.status === "ACTIVE" && !a.isOwner).length;
    // Compte owner : sert de fallback createdBy sur les dossiers importés dont
    // l'officier n'a pas de compte -> à exclure du classement "agents actifs".
    const ownerId = allAgents.find((a) => a.isOwner)?._id;
    const citizensCount = (await ctx.db.query("citizens").take(5000)).filter((c) => c.status === "ACTIVE").length;
    const vehiclesCount = (await ctx.db.query("vehicles").take(5000)).filter((v) => !v.deletedAt).length;
    const weaponsCount = (await ctx.db.query("weapons").take(5000)).filter((w) => !w.deletedAt).length;

    // ---- Fenêtres glissantes (7 / 14 / 30 j) ----
    // Un même acte est compté dans toutes les fenêtres qui l'englobent.
    const bump = (m: Map<string, number>, id: string) => m.set(id, (m.get(id) ?? 0) + 1);
    type Bucket = { arrests: number; citations: number; agent: Map<string, number>; casier: Map<string, number>; citation: Map<string, number> };
    const buckets: Record<number, Bucket> = {} as Record<number, Bucket>;
    for (const p of STAT_PERIODS) buckets[p] = { arrests: 0, citations: 0, agent: new Map(), casier: new Map(), citation: new Map() };
    const since = (p: number) => now - p * DAY;

    // ---- Arrestations (casier) ----
    const casiers = await ctx.db.query("casierEntries").order("desc").take(2000);
    for (const e of casiers) {
      if (e.deletedAt || e.status === "ANNULEE") continue;
      const off = e.officerIds[0] ?? e.createdBy;
      for (const p of STAT_PERIODS) {
        if (e.at < since(p)) continue;
        buckets[p].arrests++;
        if (off && off !== ownerId) { bump(buckets[p].agent, off); bump(buckets[p].casier, off); }
      }
    }

    // ---- Contraventions ----
    const citations = await ctx.db.query("citations").order("desc").take(2000);
    for (const c of citations) {
      if (c.deletedAt || c.status === "ANNULEE") continue;
      for (const p of STAT_PERIODS) {
        if (c.at < since(p)) continue;
        buckets[p].citations++;
        if (c.officerId !== ownerId) { bump(buckets[p].agent, c.officerId); bump(buckets[p].citation, c.officerId); }
      }
    }

    // ---- Top agents par fenêtre : global / casiers / contraventions ----
    const buildTop = async (tally: Map<string, number>) => {
      const raw = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
      const list = [];
      for (const [id, count] of raw) {
        const label = await agentLabel(ctx, id as import("./_generated/dataModel").Id<"agents">);
        list.push({ ...label, count });
      }
      return list;
    };
    const periods: Record<string, PeriodStats> = {};
    for (const p of STAT_PERIODS) {
      periods[String(p)] = {
        arrests: buckets[p].arrests,
        citations: buckets[p].citations,
        topAgents: await buildTop(buckets[p].agent),
        topAgentsCasiers: await buildTop(buckets[p].casier),
        topAgentsContraventions: await buildTop(buckets[p].citation),
      };
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

    // ---- Activité par jour (30 derniers jours) : arrestations + contraventions ----
    // Le front tronque à la période choisie (7 / 14 / 30 j).
    const days: { day: string; arr: number; cit: number }[] = [];
    for (let i = 29; i >= 0; i--) {
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

    const data: StatsData = {
      counts: { agentsActive, citizensCount, vehiclesCount, weaponsCount, mandatsActive },
      periods,
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
