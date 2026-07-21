import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";
import { notify, NOTIFY_COLOR } from "./lib/notify";

// DEFCON courant = calculé (dernier changement encore valide, sinon défaut). Pas de cron.
export const current = query({
  args: {},
  handler: async (ctx) => {
    const levels = await ctx.db.query("defconLevels").withIndex("by_position").collect();
    if (levels.length === 0) return null;
    const def = levels.find((l) => l.isDefault) ?? levels[0];
    const last = await ctx.db.query("defconChanges").withIndex("by_at").order("desc").first();
    if (!last) return def;
    if (last.until != null && last.until < Date.now()) return def;
    return (await ctx.db.get(last.levelId)) ?? def;
  },
});

export const listLevels = query({
  args: {},
  handler: async (ctx) => ctx.db.query("defconLevels").withIndex("by_position").collect(),
});

export const setDefcon = mutation({
  args: { levelId: v.id("defconLevels"), durationMinutes: v.optional(v.number()) },
  handler: async (ctx, { levelId, durationMinutes }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "defcon.manage");
    const level = await ctx.db.get(levelId);
    if (!level) throw new Error("Niveau DEFCON inconnu.");
    const until = durationMinutes ? Date.now() + durationMinutes * 60_000 : undefined;
    await ctx.db.insert("defconChanges", { levelId, byAgentId: agent._id, at: Date.now(), until });
    await writeAudit(ctx, agent, {
      action: "defcon.change",
      resourceType: "defcon",
      resourceLabel: level.name,
      after: { level: level.name, until },
    });
    await notify(ctx, "defcon.change", {
      title: `DEFCON · ${level.name}`,
      description: until ? `Jusqu'à ${new Date(until).toLocaleString("fr-FR")}.` : "Sans échéance.",
      color: NOTIFY_COLOR.info,
      footer: `Décidé par ${agent.prenomRP} ${agent.nomRP}`,
    });
    return level.name;
  },
});
