import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";

// Liaison des comptes MDT aux membres Discord (rôle LSPD). Côté site : on voit
// les membres synchronisés par le bot, on « Envoie un compte » (invitation
// ciblée + MP par le bot), et on peut relier/délier un agent existant. La
// synchro des membres et l'envoi des MP se font par le bot (BOT_SECRET).

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode(): string {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
  return `${part()}-${part()}`;
}

// Détecte matricule + nom de famille + initiale du prénom depuis un pseudo
// serveur Discord standardisé, ex. "56420 | D. Carter". Tolérant : sans barre,
// sans point, ou sans matricule, on extrait ce qu'on peut.
function parseNickname(nick: string): { matricule?: number; nom?: string; prenomInitial?: string } {
  const out: { matricule?: number; nom?: string; prenomInitial?: string } = {};
  const digits = nick.match(/\d{2,6}/);
  if (digits) out.matricule = Number(digits[0]);
  // Partie « nom » : après la barre si présente, sinon le pseudo débarrassé du matricule.
  const namePart = (nick.includes("|") ? nick.split("|").slice(1).join("|") : nick.replace(/\d{2,6}/, "")).trim();
  const withInitial = namePart.match(/^([A-Za-zÀ-ÿ])\.?\s+(.+)$/); // "D. Carter" ou "D Carter"
  if (withInitial) {
    out.prenomInitial = withInitial[1].toUpperCase();
    out.nom = withInitial[2].trim();
  } else if (namePart) {
    out.nom = namePart;
  }
  return out;
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
    // Grades porteurs d'un rôle Discord, du plus élevé au plus bas, pour détecter
    // le grade d'un membre depuis ses rôles.
    const gradeRoles = (await ctx.db.query("grades").collect())
      .filter((g) => g.discordRoleId)
      .sort((a, b) => b.position - a.position);
    const out = [];
    for (const m of members) {
      const linkedAgent = (await ctx.db.query("agents").withIndex("by_discord", (q) => q.eq("discordId", m.discordId)).first());
      let linked = null;
      if (linkedAgent) {
        const grade = linkedAgent.gradeId ? await ctx.db.get(linkedAgent.gradeId) : null;
        linked = { agentId: linkedAgent._id, name: `${linkedAgent.prenomRP} ${linkedAgent.nomRP}`, matricule: linkedAgent.matricule ?? null, gradeName: grade?.name ?? null, status: linkedAgent.status };
      }
      const roleSet = new Set(m.roleIds ?? []);
      const detectedGrade = gradeRoles.find((g) => roleSet.has(g.discordRoleId!))?.name ?? null;
      out.push({ discordId: m.discordId, username: m.username, displayName: m.displayName, linked, invitePending: pending.has(m.discordId), detectedGrade });
    }
    return out;
  },
});

// Recherche des agents PORTANT une liaison Discord (tous statuts, y compris les
// comptes désactivés invisibles dans l'effectif), par nom ou matricule. Sert à
// délier un ancien compte qui « réserve » encore un Discord et bloque l'envoi
// d'un nouveau compte à la même personne.
export const linkedAgentsSearch = query({
  args: { term: v.string() },
  handler: async (ctx, { term }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "invites.manage");
    const t = term.trim().toLowerCase();
    if (!t) return [];
    const raw = term.trim();
    const rows = (await ctx.db.query("agents").collect())
      .filter((a) => a.discordId && !a.isOwner)
      // Recherche par nom, matricule, OU identifiant Discord (clic droit → Copier
      // l'identifiant), pour retrouver un compte même sans connaître son nom actuel.
      .filter((a) => `${a.prenomRP} ${a.nomRP}`.toLowerCase().includes(t) || String(a.matricule ?? "").includes(t) || (a.discordId ?? "").includes(raw))
      .slice(0, 12);
    const out = [];
    for (const a of rows) {
      const grade = a.gradeId ? await ctx.db.get(a.gradeId) : null;
      const member = a.discordId ? await ctx.db.query("discordMembers").withIndex("by_discord", (q) => q.eq("discordId", a.discordId!)).first() : null;
      out.push({
        _id: a._id,
        name: `${a.prenomRP} ${a.nomRP}`,
        matricule: a.matricule ?? null,
        status: a.status,
        gradeName: grade?.name ?? null,
        discordId: a.discordId!,
        discordLabel: member?.displayName ?? member?.username ?? null,
      });
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
    // Seul un compte vivant bloque : on libère au passage les anciens comptes
    // désactivés (INACTIVE) qui retiendraient encore ce Discord.
    const holders = await ctx.db.query("agents").withIndex("by_discord", (q) => q.eq("discordId", discordId)).collect();
    if (holders.some((a) => a.status !== "INACTIVE")) throw new ConvexError("Ce membre Discord est déjà relié à un compte.");
    for (const dead of holders) await ctx.db.patch(dead._id, { discordId: undefined });
    const member = await ctx.db.query("discordMembers").withIndex("by_discord", (q) => q.eq("discordId", discordId)).first();
    const prefill = member ? parseNickname(member.displayName) : {};
    // Grade détecté depuis les rôles Discord du membre (grades.discordRoleId).
    // En cas de plusieurs rôles de grade, on retient le plus élevé.
    let prefillGradeId: Id<"grades"> | undefined = undefined;
    if (member?.roleIds?.length) {
      const roleSet = new Set(member.roleIds);
      const matches = (await ctx.db.query("grades").collect())
        .filter((g) => g.discordRoleId && roleSet.has(g.discordRoleId))
        .sort((a, b) => b.position - a.position);
      prefillGradeId = matches[0]?._id;
    }
    // Réutilise une invitation en attente non consommée pour ce membre, en
    // rafraîchissant le pré-remplissage (le pseudo a pu changer entre-temps).
    const existing = (await ctx.db.query("invitations").withIndex("by_dm_pending", (q) => q.eq("dmPending", true)).collect())
      .find((i) => i.discordId === discordId && !i.revoked);
    if (existing) {
      await ctx.db.patch(existing._id, { dmSentAt: undefined, dmPending: true, prefillNom: prefill.nom, prefillMatricule: prefill.matricule, prefillPrenomInitial: prefill.prenomInitial, prefillGradeId });
      return existing.code;
    }
    let code = genCode();
    while (await ctx.db.query("invitations").withIndex("by_code", (q) => q.eq("code", code)).first()) code = genCode();
    await ctx.db.insert("invitations", {
      code, type: "SINGLE", maxUses: 1, usesCount: 0, revoked: false,
      createdBy: agent._id, expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
      discordId, discordUsername: member?.username, dmPending: true,
      prefillNom: prefill.nom, prefillMatricule: prefill.matricule, prefillPrenomInitial: prefill.prenomInitial,
      prefillGradeId, autoActivate: true,
    });
    await ctx.scheduler.runAfter(0, internal.push.notify, {}); // prévient le bot (MP d'invitation)
    await writeAudit(ctx, agent, { action: "discord.send_account", resourceType: "invitation", resourceLabel: member?.displayName ?? member?.username ?? discordId, metadata: { discordId } });
    return code;
  },
});

// Relie manuellement un agent existant à un membre Discord.
export const linkExisting = mutation({
  args: { agentId: v.id("agents"), discordId: v.string() },
  handler: async (ctx, { agentId, discordId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "invites.manage");
    // Un autre compte VIVANT bloque ; les anciens comptes désactivés sont déliés.
    const others = (await ctx.db.query("agents").withIndex("by_discord", (q) => q.eq("discordId", discordId)).collect())
      .filter((a) => a._id !== agentId);
    if (others.some((a) => a.status !== "INACTIVE")) throw new ConvexError("Ce membre Discord est déjà relié à un autre compte.");
    for (const dead of others) await ctx.db.patch(dead._id, { discordId: undefined });
    const target = await ctx.db.get(agentId);
    await ctx.db.patch(agentId, { discordId });
    await writeAudit(ctx, agent, { action: "discord.link", resourceType: "agent", resourceId: agentId, resourceLabel: target ? `${target.prenomRP} ${target.nomRP}` : undefined, before: { discordId: target?.discordId ?? null }, after: { discordId } });
  },
});

export const unlink = mutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "invites.manage");
    const target = await ctx.db.get(agentId);
    await ctx.db.patch(agentId, { discordId: undefined });
    await writeAudit(ctx, agent, { action: "discord.unlink", resourceType: "agent", resourceId: agentId, resourceLabel: target ? `${target.prenomRP} ${target.nomRP}` : undefined, before: { discordId: target?.discordId ?? null }, after: { discordId: null } });
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
    if (!target) throw new ConvexError("Agent introuvable.");
    if (!target.discordId) throw new ConvexError("Cet agent n'est pas relié à un compte Discord.");
    const grade = target.gradeId ? await ctx.db.get(target.gradeId) : null;
    const addRoleId = grade?.discordRoleId ?? undefined;
    const allGradeRoles = (await ctx.db.query("grades").collect()).map((g) => g.discordRoleId).filter((r): r is string => !!r);
    const removeRoleIds = allGradeRoles.filter((r) => r !== addRoleId);
    if (!addRoleId && removeRoleIds.length === 0) throw new ConvexError("Aucun rôle Discord configuré pour les grades.");
    await ctx.db.insert("discordRoleJobs", {
      discordId: target.discordId, addRoleId, removeRoleIds,
      reason: `Grade : ${grade?.name ?? "-"}`, status: "PENDING", createdAt: Date.now(),
    });
    await writeAudit(ctx, agent, { action: "discord.sync_role", resourceType: "agent", resourceId: agentId, resourceLabel: `${target.prenomRP} ${target.nomRP}`, metadata: { grade: grade?.name ?? null } });
    return { ok: true };
  },
});
