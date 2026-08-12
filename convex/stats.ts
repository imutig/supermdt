import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireAgent, requirePermission, agentLabel } from "./rbac";
import { parisParts, parisWallToEpoch } from "./lib/paris";

const DAY = 86_400_000;

// Statistiques de la station (État-Major). Fenêtres bornées pour rester performant.
// Fenêtre de fraîcheur : en deçà, on ne recalcule pas. Le calcul balaie
// plusieurs milliers de documents, le rejouer à chaque écriture le rendait
// proportionnel au trafic ET au nombre de clients abonnés.
const STALE_MS = 5 * 60 * 1000;

// Forme de l'instantané : la table le stocke en v.any(), ce type restitue le
// contrat au client, qui perdrait sinon tout typage. L'instantané ne porte que
// les indicateurs indépendants de la période (compteurs, DEFCON) ; tout ce qui
// dépend d'une plage de dates est calculé à la volée par `rangeStats`.
type TopAgent = { matricule: number | null; name: string; count: number };
export type StatsData = {
  counts: { agentsActive: number; citizensCount: number; vehiclesCount: number; weaponsCount: number; mandatsActive: number };
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

    // ---- Compteurs globaux (indépendants de la période) ----
    const allAgents = await ctx.db.query("agents").collect();
    const agentsActive = allAgents.filter((a) => a.status === "ACTIVE" && !a.isOwner).length;
    const citizensCount = (await ctx.db.query("citizens").take(5000)).filter((c) => c.status === "ACTIVE").length;
    const vehiclesCount = (await ctx.db.query("vehicles").take(5000)).filter((v) => !v.deletedAt).length;
    const weaponsCount = (await ctx.db.query("weapons").take(5000)).filter((w) => !w.deletedAt).length;

    // ---- DEFCON courant ----
    const levels = await ctx.db.query("defconLevels").withIndex("by_position").collect();
    const def = levels.find((l) => l.isDefault) ?? levels[0] ?? null;
    const lastChange = await ctx.db.query("defconChanges").withIndex("by_at").order("desc").first();
    let currentDefcon = def;
    if (lastChange && !(lastChange.until != null && lastChange.until < now)) {
      currentDefcon = (await ctx.db.get(lastChange.levelId)) ?? def;
    }

    const mandatsActive = (await ctx.db.query("mandats").withIndex("by_status", (q) => q.eq("status", "ACTIF")).collect()).filter((m) => !m.deletedAt).length;

    const data: StatsData = {
      counts: { agentsActive, citizensCount, vehiclesCount, weaponsCount, mandatsActive },
      defcon: currentDefcon ? { name: currentDefcon.name, color: currentDefcon.color ?? null } : null,
    };

    const existing = await ctx.db.query("statsSnapshot").first();
    if (existing) await ctx.db.patch(existing._id, { data, computedAt: now });
    else await ctx.db.insert("statsSnapshot", { data, computedAt: now });
    return "ok";
  },
});

// ===========================================================================
// Statistiques sur une plage libre (calcul à la volée, non mis en cache).
// `from`/`to` en epoch ms ; `from` absent = depuis toujours ; `to` absent = maintenant.
// Le pas du graphique s'adapte à l'étendue (heure / jour / mois).
// ===========================================================================
type Unit = "hour" | "day" | "month";
const pad2 = (n: number) => String(n).padStart(2, "0");
function bucketKey(ts: number, unit: Unit): string {
  const p = parisParts(ts);
  if (unit === "hour") return `${p.y}-${pad2(p.mo)}-${pad2(p.d)}-${pad2(p.h)}`;
  if (unit === "day") return `${p.y}-${pad2(p.mo)}-${pad2(p.d)}`;
  return `${p.y}-${pad2(p.mo)}`;
}
function bucketLabel(key: string, unit: Unit): string {
  const parts = key.split("-");
  if (unit === "hour") return `${parts[3]}h`;
  if (unit === "day") return `${parts[2]}/${parts[1]}`;
  return `${parts[1]}/${parts[0].slice(2)}`;
}
// Toutes les clés (bornes de bucket) de effLo à hi, buckets vides compris.
function gridKeys(effLo: number, hi: number, unit: Unit): Set<string> {
  const keys = new Set<string>();
  if (unit === "month") {
    const s = parisParts(effLo), e = parisParts(hi);
    let y = s.y, m = s.mo;
    while (y < e.y || (y === e.y && m <= e.mo)) { keys.add(`${y}-${pad2(m)}`); m++; if (m > 12) { m = 1; y++; } }
    return keys;
  }
  const step = unit === "hour" ? 3_600_000 : DAY;
  const s = parisParts(effLo);
  const start = unit === "hour" ? parisWallToEpoch(s.y, s.mo, s.d, s.h, 0) : parisWallToEpoch(s.y, s.mo, s.d, 0, 0);
  for (let t = start; t <= hi; t += step) keys.add(bucketKey(t, unit));
  keys.add(bucketKey(hi, unit));
  return keys;
}

export const rangeStats = query({
  args: { from: v.optional(v.number()), to: v.optional(v.number()) },
  handler: async (ctx, { from, to }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "stats.view");
    const now = Date.now();
    const hi = to ?? now;
    const lo = from ?? null;

    const allAgents = await ctx.db.query("agents").collect();
    const ownerId = allAgents.find((a) => a.isOwner)?._id;

    const fetchInRange = async <T extends { at: number; deletedAt?: number; status?: string }>(
      table: "casierEntries" | "citations",
    ): Promise<T[]> => {
      const rows = lo == null
        ? await ctx.db.query(table).withIndex("by_at", (q) => q.lte("at", hi)).collect()
        : await ctx.db.query(table).withIndex("by_at", (q) => q.gte("at", lo).lte("at", hi)).collect();
      return (rows as unknown as T[]).filter((r) => !r.deletedAt && r.status !== "ANNULEE");
    };
    const casiers = await fetchInRange<{ _id: import("./_generated/dataModel").Id<"casierEntries">; at: number; deletedAt?: number; status?: string; officerIds: import("./_generated/dataModel").Id<"agents">[]; createdBy: import("./_generated/dataModel").Id<"agents"> }>("casierEntries");
    const citations = await fetchInRange<{ _id: import("./_generated/dataModel").Id<"citations">; at: number; deletedAt?: number; status?: string; officerId: import("./_generated/dataModel").Id<"agents"> }>("citations");

    // ---- Top agents (owner exclu : fallback des imports non reliés) ----
    const bump = (m: Map<string, number>, id: string) => m.set(id, (m.get(id) ?? 0) + 1);
    const agentTally = new Map<string, number>();
    const casierTally = new Map<string, number>();
    const citationTally = new Map<string, number>();
    for (const e of casiers) {
      const off = e.officerIds[0] ?? e.createdBy;
      if (off && off !== ownerId) { bump(agentTally, off); bump(casierTally, off); }
    }
    for (const c of citations) {
      if (c.officerId !== ownerId) { bump(agentTally, c.officerId); bump(citationTally, c.officerId); }
    }
    const buildTop = async (tally: Map<string, number>) => {
      const raw = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
      const list: TopAgent[] = [];
      for (const [id, count] of raw) {
        const label = await agentLabel(ctx, id as import("./_generated/dataModel").Id<"agents">);
        list.push({ ...label, count });
      }
      return list;
    };

    // ---- Top infractions sur la plage (jointure charges -> entrée) ----
    const casIds = new Set(casiers.map((e) => e._id as string));
    const citIds = new Set(citations.map((c) => c._id as string));
    const chargeTally = new Map<string, number>();
    for (const ch of await ctx.db.query("casierCharges").take(20000)) {
      if (casIds.has(ch.entryId as string)) bump(chargeTally, ch.snapshot.name);
    }
    for (const ch of await ctx.db.query("citationCharges").take(20000)) {
      if (citIds.has(ch.citationId as string)) bump(chargeTally, ch.snapshot.name);
    }
    const topCharges = [...chargeTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));

    // ---- Série temporelle (pas adaptatif) ----
    let minAt = hi;
    for (const e of casiers) if (e.at < minAt) minAt = e.at;
    for (const c of citations) if (c.at < minAt) minAt = c.at;
    const effLo = lo == null ? (casiers.length || citations.length ? minAt : hi - DAY) : lo;
    const span = Math.max(0, hi - effLo);
    const unit: Unit = span <= 2 * DAY ? "hour" : span <= 92 * DAY ? "day" : "month";
    const counts = new Map<string, { arr: number; cit: number }>();
    const acc = (ts: number, field: "arr" | "cit") => {
      const k = bucketKey(ts, unit);
      const b = counts.get(k) ?? { arr: 0, cit: 0 };
      b[field]++; counts.set(k, b);
    };
    for (const e of casiers) acc(e.at, "arr");
    for (const c of citations) acc(c.at, "cit");
    const allKeys = [...new Set([...gridKeys(effLo, hi, unit), ...counts.keys()])].sort();
    const series = allKeys.map((k) => ({ label: bucketLabel(k, unit), arr: counts.get(k)?.arr ?? 0, cit: counts.get(k)?.cit ?? 0 }));

    return {
      arrests: casiers.length,
      citations: citations.length,
      unit,
      series,
      topAgents: await buildTop(agentTally),
      topAgentsCasiers: await buildTop(casierTally),
      topAgentsContraventions: await buildTop(citationTally),
      topCharges,
    };
  },
});
