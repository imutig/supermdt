import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAgent, requirePermission } from "./rbac";

// Liaison des comptes MDT aux membres Discord (rôle LSPD). Côté site : on voit
// les membres synchronisés par le bot, on « Envoie un compte » (invitation
// ciblée + MP par le bot), et on peut relier/délier un agent existant. La
// synchro des membres et l'envoi des MP se font par le bot (BOT_SECRET).

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode(): string {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
  return `${part()}-${part()}`;
}

// Membres Discord (rôle LSPD) + statut de liaison / invitation en attente.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "invites.manage");
    const members = (await ctx.db.query("discordMembers").collect()).sort((a, b) => a.displayName.localeCompare(b.displayName, "fr"));
    const pending = new Set(
      (await ctx.db.query("invitations").withIndex("by_dm_pending", (q) => q.eq("dmPending", true)).collect())
        .filter((i) => !i.revoked && i.discordId)
        .map((i) => i.discordId as string),
    );
    const out = [];
    for (const m of members) {
      const linkedAgent = (await ctx.db.query("agents").withIndex("by_discord", (q) => q.eq("discordId", m.discordId)).first());
      let linked = null;
      if (linkedAgent) {
        const grade = linkedAgent.gradeId ? await ctx.db.get(linkedAgent.gradeId) : null;
        linked = { agentId: linkedAgent._id, name: `${linkedAgent.prenomRP} ${linkedAgent.nomRP}`, matricule: linkedAgent.matricule ?? null, gradeName: grade?.name ?? null, status: linkedAgent.status };
      }
      out.push({ discordId: m.discordId, username: m.username, displayName: m.displayName, linked, invitePending: pending.has(m.discordId) });
    }
    return out;
  },
});

// Envoie un compte : invitation ciblée à ce membre, MP délégué au bot.
export const sendAccount = mutation({
  args: { discordId: v.string() },
  handler: async (ctx, { discordId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "invites.manage");
    const already = await ctx.db.query("agents").withIndex("by_discord", (q) => q.eq("discordId", discordId)).first();
    if (already) throw new Error("Ce membre Discord est déjà relié à un compte.");
    const member = await ctx.db.query("discordMembers").withIndex("by_discord", (q) => q.eq("discordId", discordId)).first();
    // Réutilise une invitation en attente non consommée pour ce membre.
    const existing = (await ctx.db.query("invitations").withIndex("by_dm_pending", (q) => q.eq("dmPending", true)).collect())
      .find((i) => i.discordId === discordId && !i.revoked);
    if (existing) { await ctx.db.patch(existing._id, { dmSentAt: undefined, dmPending: true }); return existing.code; }
    let code = genCode();
    while (await ctx.db.query("invitations").withIndex("by_code", (q) => q.eq("code", code)).first()) code = genCode();
    await ctx.db.insert("invitations", {
      code, type: "SINGLE", maxUses: 1, usesCount: 0, revoked: false,
      createdBy: agent._id, expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
      discordId, discordUsername: member?.username, dmPending: true,
    });
    return code;
  },
});

// Relie manuellement un agent existant à un membre Discord.
export const linkExisting = mutation({
  args: { agentId: v.id("agents"), discordId: v.string() },
  handler: async (ctx, { agentId, discordId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "invites.manage");
    const other = await ctx.db.query("agents").withIndex("by_discord", (q) => q.eq("discordId", discordId)).first();
    if (other && other._id !== agentId) throw new Error("Ce membre Discord est déjà relié à un autre compte.");
    await ctx.db.patch(agentId, { discordId });
  },
});

export const unlink = mutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "invites.manage");
    await ctx.db.patch(agentId, { discordId: undefined });
  },
});

// Applique le rôle Discord du grade d'un agent (retire les autres rôles de
// grade, ajoute celui du grade courant). Exécuté par le bot via la file.
export const syncGradeRole = mutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "effectif.edit");
    const target = await ctx.db.get(agentId);
    if (!target) throw new Error("Agent introuvable.");
    if (!target.discordId) throw new Error("Cet agent n'est pas relié à un compte Discord.");
    const grade = target.gradeId ? await ctx.db.get(target.gradeId) : null;
    const addRoleId = grade?.discordRoleId ?? undefined;
    const allGradeRoles = (await ctx.db.query("grades").collect()).map((g) => g.discordRoleId).filter((r): r is string => !!r);
    const removeRoleIds = allGradeRoles.filter((r) => r !== addRoleId);
    if (!addRoleId && removeRoleIds.length === 0) throw new Error("Aucun rôle Discord configuré pour les grades.");
    await ctx.db.insert("discordRoleJobs", {
      discordId: target.discordId, addRoleId, removeRoleIds,
      reason: `Grade : ${grade?.name ?? "-"}`, status: "PENDING", createdAt: Date.now(),
    });
    return { ok: true };
  },
});
