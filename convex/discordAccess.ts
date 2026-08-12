import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAgent, requirePermission } from "./rbac";

// Catalogue des commandes Discord contrôlables. `label` pour l'UII ; le `command`
// doit correspondre exactement au nom de la commande slash côté bot.
export const DISCORD_COMMANDS: { command: string; label: string }[] = [
  { command: "enservice", label: "/enservice - agents en service" },
  { command: "effectif", label: "/effectif - état de la station" },
  { command: "recap", label: "/recap - récapitulatif du jour" },
  { command: "heures", label: "/heures - heures de service d'un agent" },
  { command: "plaque", label: "/plaque - fiche véhicule" },
  { command: "casier", label: "/casier - extrait de casier" },
  { command: "absence", label: "/absence - déclarer une absence" },
  { command: "absents", label: "/absents - liste des absents" },
  { command: "candidatures", label: "/candidatures - config recrutement" },
  { command: "template", label: "/template - modèles de message" },
  { command: "annonce", label: "/annonce - annonce officielle" },
  { command: "integrer", label: "/integrer - intégrer un candidat" },
  { command: "validation", label: "/validation - valider un candidat" },
];

const KNOWN = new Set(DISCORD_COMMANDS.map((c) => c.command));

// Config d'accès de toutes les commandes (site, permission rbac.manage).
export const list = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rbac.manage");
    const rows = await ctx.db.query("discordCommandAccess").collect();
    const byCmd = new Map(rows.map((r) => [r.command, r]));
    const grades = (await ctx.db.query("grades").collect())
      .filter((g) => !g.academyOnly && !g.external)
      .sort((a, b) => b.position - a.position);
    const gradeName = new Map(grades.map((g) => [g._id as string, g.name]));
    const commands = DISCORD_COMMANDS.map((c) => {
      const r = byCmd.get(c.command);
      return {
        command: c.command,
        label: c.label,
        minGradeId: r?.minGradeId ?? null,
        minGradeName: r?.minGradeId ? gradeName.get(r.minGradeId as string) ?? null : null,
        roleIds: r?.roleIds ?? [],
      };
    });
    return { commands, grades: grades.map((g) => ({ _id: g._id, name: g.name, position: g.position })) };
  },
});

export const set = mutation({
  args: { command: v.string(), minGradeId: v.optional(v.id("grades")), roleIds: v.array(v.string()) },
  handler: async (ctx, { command, minGradeId, roleIds }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rbac.manage");
    if (!KNOWN.has(command)) throw new Error("Commande inconnue.");
    const cleanRoles = [...new Set(roleIds.map((r) => r.trim()).filter((r) => /^\d{5,}$/.test(r)))];
    const existing = await ctx.db.query("discordCommandAccess").withIndex("by_command", (q) => q.eq("command", command)).first();
    if (existing) await ctx.db.patch(existing._id, { minGradeId, roleIds: cleanRoles });
    else await ctx.db.insert("discordCommandAccess", { command, minGradeId, roleIds: cleanRoles });
  },
});
