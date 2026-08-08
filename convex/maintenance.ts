import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

// Opérations de maintenance ponctuelles, NON exposées au client (internalMutation :
// exécutables uniquement via `npx convex run` par un administrateur du déploiement).

// Supprime TOUS les comptes sauf l'owner : agents non-owner + leurs comptes
// d'authentification (users / authAccounts / authSessions) + rattachements
// (divisions, promotions, sessions de service). IRRÉVERSIBLE.
//
// Usage (prod) :
//   npx convex run maintenance:purgeNonOwnerAccounts '{"confirm":"SUPPRIMER"}' --prod
export const purgeNonOwnerAccounts = internalMutation({
  args: { confirm: v.string() },
  handler: async (ctx, { confirm }) => {
    if (confirm !== "SUPPRIMER") throw new Error('Confirmation requise : passe {"confirm":"SUPPRIMER"}.');

    const agents = await ctx.db.query("agents").collect();
    const victims = agents.filter((a) => !a.isOwner);
    const userIds = new Set(victims.map((a) => a.userId as string));
    const keptOwners = agents.length - victims.length;

    let deletedAgents = 0;
    for (const a of victims) {
      for (const d of await ctx.db.query("agentDivisions").withIndex("by_agent", (q) => q.eq("agentId", a._id)).collect()) await ctx.db.delete(d._id);
      for (const m of await ctx.db.query("promotionMembers").withIndex("by_agent", (q) => q.eq("agentId", a._id)).collect()) await ctx.db.delete(m._id);
      for (const s of await ctx.db.query("serviceSessions").withIndex("by_agent", (q) => q.eq("agentId", a._id)).collect()) await ctx.db.delete(s._id);
      await ctx.db.delete(a._id);
      deletedAgents++;
    }

    // Comptes d'authentification liés (empêche toute reconnexion).
    let deletedUsers = 0;
    for (const u of await ctx.db.query("users").collect()) {
      if (userIds.has(u._id as string)) { await ctx.db.delete(u._id); deletedUsers++; }
    }
    let deletedAuthRows = 0;
    for (const table of ["authAccounts", "authSessions"] as const) {
      for (const row of await ctx.db.query(table).collect()) {
        const uid = (row as { userId?: Id<"users"> }).userId;
        if (uid && userIds.has(uid as string)) { await ctx.db.delete(row._id); deletedAuthRows++; }
      }
    }

    return { keptOwners, deletedAgents, deletedUsers, deletedAuthRows };
  },
});
