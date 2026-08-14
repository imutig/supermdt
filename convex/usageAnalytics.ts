import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission, agentLabel } from "./rbac";
import { actionLabel, resourceLabel } from "../src/lib/auditLabels";
import { parisParts, parisWallToEpoch } from "./lib/paris";
import type { Id } from "./_generated/dataModel";

// ===========================================================================
// Analytics d'usage du MDT (État-Major) : synthèse d'utilisation à partir du
// journal d'audit (auditLog) et du journal d'accès (accessLog).
// Gardé par `audit.view`. Lecture BORNÉE (jamais de .collect() non plafonné) :
// la fenêtre est lue via l'index `by_at`, du plus récent au plus ancien, et
// plafonnée. `capped` signale au front que l'échantillon a été tronqué.
// ===========================================================================

const DAY = 86_400_000;
// Plafond de lecture : au-delà, on tronque (les plus récentes d'abord).
const MAX_ROWS = 4000;

type Unit = "hour" | "day" | "month";
const pad2 = (n: number) => String(n).padStart(2, "0");

// Clé de bucket temporel (heure de Paris) selon le pas choisi.
function bucketKey(ts: number, unit: Unit): string {
  const p = parisParts(ts);
  if (unit === "hour") return `${p.y}-${pad2(p.mo)}-${pad2(p.d)}-${pad2(p.h)}`;
  if (unit === "day") return `${p.y}-${pad2(p.mo)}-${pad2(p.d)}`;
  return `${p.y}-${pad2(p.mo)}`;
}
// Libellé lisible d'un bucket (axe des abscisses).
function bucketLabel(key: string, unit: Unit): string {
  const parts = key.split("-");
  if (unit === "hour") return `${parts[3]}h`;
  if (unit === "day") return `${parts[2]}/${parts[1]}`;
  return `${parts[1]}/${parts[0].slice(2)}`;
}
// Toutes les clés de bucket entre effLo et hi (buckets vides compris).
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

// Incrémente un compteur dans une Map.
function bump(m: Map<string, number>, k: string) { m.set(k, (m.get(k) ?? 0) + 1); }

export const overview = query({
  args: { from: v.optional(v.number()), to: v.optional(v.number()) },
  handler: async (ctx, { from, to }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "audit.view");

    const now = Date.now();
    const hi = to ?? now;
    const lo = from ?? null;

    // ---- Lecture bornée du journal d'audit (les plus récentes d'abord). ----
    const audit = lo == null
      ? await ctx.db.query("auditLog").withIndex("by_at", (q) => q.lte("at", hi)).order("desc").take(MAX_ROWS)
      : await ctx.db.query("auditLog").withIndex("by_at", (q) => q.gte("at", lo).lte("at", hi)).order("desc").take(MAX_ROWS);

    // ---- Lecture bornée du journal d'accès. ----
    const access = lo == null
      ? await ctx.db.query("accessLog").withIndex("by_at", (q) => q.lte("at", hi)).order("desc").take(MAX_ROWS)
      : await ctx.db.query("accessLog").withIndex("by_at", (q) => q.gte("at", lo).lte("at", hi)).order("desc").take(MAX_ROWS);

    const capped = audit.length >= MAX_ROWS || access.length >= MAX_ROWS;

    // ---- Répartition par type d'action (top 10, libellés lisibles). ----
    const actionTally = new Map<string, number>();
    const actorTally = new Map<string, number>();
    for (const r of audit) {
      bump(actionTally, r.action);
      if (r.actorId) bump(actorTally, r.actorId);
    }
    const byAction = [...actionTally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([action, count]) => ({ label: actionLabel(action), count }));

    // ---- Agents les plus actifs (top 8) : libellés résolus une seule fois. ----
    const topActorRaw = [...actorTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const topAgents: { matricule: number | null; name: string; count: number }[] = [];
    for (const [id, count] of topActorRaw) {
      const lbl = await agentLabel(ctx, id as Id<"agents">);
      topAgents.push({ ...lbl, count });
    }

    // ---- Ressources les plus consultées (accessLog, top 8). On agrège par
    // (type, id) puis on ne résout le libellé que des 8 gagnantes (borné). ----
    const resTally = new Map<string, { type: string; id: string | null; count: number }>();
    for (const r of access) {
      const type = r.resourceType ?? "—";
      const id = r.resourceId ?? null;
      const key = `${type}::${id ?? ""}`;
      const cur = resTally.get(key);
      if (cur) cur.count++;
      else resTally.set(key, { type, id, count: 1 });
    }
    const topResRaw = [...resTally.values()].sort((a, b) => b.count - a.count).slice(0, 8);
    const topResources: { label: string; count: number }[] = [];
    for (const r of topResRaw) {
      let label = resourceLabel(r.type);
      // Résolution du nom du citoyen consulté quand c'est possible (borné à 8).
      if (r.type === "citizen" && r.id) {
        const c = await ctx.db.get(r.id as Id<"citizens">);
        if (c) label = `${c.prenom} ${c.nom}`;
      }
      topResources.push({ label, count: r.count });
    }

    // ---- Série temporelle : nombre d'actions d'audit par bucket. ----
    let minAt = hi;
    for (const r of audit) if (r.at < minAt) minAt = r.at;
    const effLo = lo == null ? (audit.length ? minAt : hi - DAY) : lo;
    const span = Math.max(0, hi - effLo);
    const unit: Unit = span <= 2 * DAY ? "hour" : span <= 92 * DAY ? "day" : "month";
    const counts = new Map<string, number>();
    for (const r of audit) bump(counts, bucketKey(r.at, unit));
    const allKeys = [...new Set([...gridKeys(effLo, hi, unit), ...counts.keys()])].sort();
    const series = allKeys.map((k) => ({ label: bucketLabel(k, unit), count: counts.get(k) ?? 0 }));

    return {
      totalActions: audit.length,
      activeAgents: actorTally.size,
      totalLookups: access.length,
      topResource: topResources[0] ?? null,
      byAction,
      topAgents,
      topResources,
      unit,
      series,
      capped,
    };
  },
});
