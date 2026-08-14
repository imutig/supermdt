import { internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
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
    if (confirm !== "SUPPRIMER") throw new ConvexError('Confirmation requise : passe {"confirm":"SUPPRIMER"}.');

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

// Nettoie les comptes d'authentification ORPHELINS : un `users` sans aucune fiche
// `agents` (inscription abandonnée / interrompue avant completeRegistration).
// Sans ça, l'identifiant reste « pris » et la personne voit « un compte existe
// déjà ». On applique un délai de grâce pour ne pas supprimer une inscription
// en cours. Appelé par le cron (chaque heure) et exécutable à la main.
//   npx convex run maintenance:cleanupOrphanAuth
export const cleanupOrphanAuth = internalMutation({
  args: { graceMinutes: v.optional(v.number()) },
  handler: async (ctx, { graceMinutes }) => {
    const cutoff = Date.now() - (graceMinutes ?? 30) * 60_000;
    const linked = new Set((await ctx.db.query("agents").collect()).map((a) => a.userId as string));
    const orphans = (await ctx.db.query("users").collect()).filter((u) => !linked.has(u._id as string) && u._creationTime < cutoff);
    if (orphans.length === 0) return { orphans: 0 };
    const orphanIds = new Set(orphans.map((u) => u._id as string));

    // Sessions + refresh tokens rattachés.
    const sessionIds = new Set<string>();
    for (const s of await ctx.db.query("authSessions").collect()) {
      const uid = (s as { userId?: Id<"users"> }).userId;
      if (uid && orphanIds.has(uid as string)) { sessionIds.add(s._id as string); await ctx.db.delete(s._id); }
    }
    for (const rt of await ctx.db.query("authRefreshTokens").collect()) {
      const sid = (rt as { sessionId?: Id<"authSessions"> }).sessionId;
      if (sid && sessionIds.has(sid as string)) await ctx.db.delete(rt._id);
    }
    // Comptes (password provider) + codes de vérification rattachés.
    const accountIds = new Set<string>();
    for (const acc of await ctx.db.query("authAccounts").collect()) {
      const uid = (acc as { userId?: Id<"users"> }).userId;
      if (uid && orphanIds.has(uid as string)) { accountIds.add(acc._id as string); await ctx.db.delete(acc._id); }
    }
    for (const vc of await ctx.db.query("authVerificationCodes").collect()) {
      const aid = (vc as { accountId?: Id<"authAccounts"> }).accountId;
      if (aid && accountIds.has(aid as string)) await ctx.db.delete(vc._id);
    }
    for (const u of orphans) await ctx.db.delete(u._id);

    return { orphans: orphans.length };
  },
});

// Marque toutes les absences existantes comme « déjà publiées », pour ne pas
// inonder le salon Discord des absences historiques au premier déploiement de la
// publication. À lancer une fois : `npx convex run maintenance:markAllAbsencesAnnounced`.
export const markAllAbsencesAnnounced = internalMutation({
  args: {},
  handler: async (ctx) => {
    let n = 0;
    for (const ab of await ctx.db.query("absences").collect()) {
      if (ab.announced !== true) { await ctx.db.patch(ab._id, { announced: true }); n++; }
    }
    return { marked: n };
  },
});
