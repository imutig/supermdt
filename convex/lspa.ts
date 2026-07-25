import { query } from "./_generated/server";
import { requireAgent, requirePermission } from "./rbac";

// Portail de la Police Academy.

// Chiffres d'accueil : effectif de la promotion et encadrement.
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.view");

    const grades = await ctx.db.query("grades").collect();
    const cadetGradeIds = new Set(grades.filter((g) => g.academyOnly).map((g) => g._id as string));

    const actifs = await ctx.db
      .query("agents")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .collect();

    const cadets = actifs.filter((a) => a.gradeId && cadetGradeIds.has(a.gradeId as string)).length;
    const encadrants = actifs.filter((a) => a.academyRankId).length;
    const enAttente = (await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "PENDING")).collect()).length;

    return { cadets, encadrants, enAttente };
  },
});
