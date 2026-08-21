import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireAgent, requirePermission } from "./rbac";

// Journal TECHNIQUE : trace les opérations AUTOMATIQUES (imports Discord, tâches
// planifiées, files de rôles, génération de PDF…) pour le dépannage. Contrairement
// à `auditLog` (qui trace les actions humaines), il n'a pas d'acteur : une source,
// un niveau (INFO/WARN/ERROR) et un message français suffisent.

export type SysLevel = "INFO" | "WARN" | "ERROR";

// Écrit une entrée depuis un contexte de mutation (crons, mutations internes…).
export async function writeSystemLog(
  ctx: MutationCtx,
  entry: { source: string; level?: SysLevel; event: string; message: string; durationMs?: number; count?: number; metadata?: unknown },
) {
  await ctx.db.insert("systemLog", {
    at: Date.now(),
    source: entry.source,
    level: entry.level ?? "INFO",
    event: entry.event,
    message: entry.message,
    durationMs: entry.durationMs,
    count: entry.count,
    metadata: entry.metadata,
  });
}

// Variante appelable depuis une ACTION (pas d'accès direct à la base) via
// ctx.runMutation(internal.systemLog._log, {...}).
export const _log = internalMutation({
  args: {
    source: v.string(),
    level: v.optional(v.union(v.literal("INFO"), v.literal("WARN"), v.literal("ERROR"))),
    event: v.string(),
    message: v.string(),
    durationMs: v.optional(v.number()),
    count: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, a) => {
    await writeSystemLog(ctx, { source: a.source, level: a.level, event: a.event, message: a.message, durationMs: a.durationMs, count: a.count, metadata: a.metadata });
  },
});

// Consultation (site → journal technique). Réservé aux détenteurs d'audit.view.
export const recent = query({
  args: {
    source: v.optional(v.string()),
    level: v.optional(v.union(v.literal("INFO"), v.literal("WARN"), v.literal("ERROR"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { source, level, limit }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "audit.view");
    const take = Math.min(Math.max(limit ?? 200, 1), 500);
    let rows;
    if (source) {
      rows = await ctx.db.query("systemLog").withIndex("by_source", (q) => q.eq("source", source)).order("desc").take(take);
    } else if (level) {
      rows = await ctx.db.query("systemLog").withIndex("by_level", (q) => q.eq("level", level)).order("desc").take(take);
    } else {
      rows = await ctx.db.query("systemLog").withIndex("by_at").order("desc").take(take);
    }
    // Filtre secondaire en mémoire quand les deux critères sont posés.
    if (source && level) rows = rows.filter((r) => r.level === level);
    return rows.map((r) => ({
      _id: r._id, at: r.at, source: r.source, level: r.level, event: r.event,
      message: r.message, durationMs: r.durationMs ?? null, count: r.count ?? null, metadata: r.metadata ?? null,
    }));
  },
});

// Sources distinctes présentes (pour le filtre de l'UI).
export const sources = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "audit.view");
    // Échantillon récent : suffisant pour peupler le filtre sans tout scanner.
    const rows = await ctx.db.query("systemLog").withIndex("by_at").order("desc").take(500);
    return [...new Set(rows.map((r) => r.source))].sort();
  },
});
