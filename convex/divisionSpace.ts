import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAgent, can } from "./rbac";
import { writeAudit } from "./lib/audit";

// Espace division : chaque agent affecté à une division y accède depuis la
// sidebar. Base commune : présentation, membres, grades internes + permissions,
// annonces, chat interne. Le Lead a un accès « owner » sur sa division.

// Catalogue des permissions INTERNES à une division (distinctes des
// permissions globales). Le Lead les a toutes.
export const DIVISION_PERMS: { slug: string; label: string }[] = [
  { slug: "members", label: "Gérer les membres et leurs grades" },
  { slug: "ranks", label: "Gérer les grades internes" },
  { slug: "announcements", label: "Publier et gérer les annonces" },
  { slug: "chat", label: "Modérer le chat (supprimer les messages)" },
  { slug: "config", label: "Éditer la présentation de la division" },
];
const ALL_PERMS = DIVISION_PERMS.map((p) => p.slug);

async function loadDivision(ctx: QueryCtx | MutationCtx, divisionId: Id<"divisions">) {
  const d = await ctx.db.get(divisionId);
  if (!d) throw new Error("Division introuvable.");
  return d;
}
async function membershipOf(ctx: QueryCtx | MutationCtx, agentId: Id<"agents">, divisionId: Id<"divisions">) {
  return (await ctx.db.query("agentDivisions").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect())
    .find((l) => l.divisionId === divisionId) ?? null;
}
function isLeadOf(agent: Doc<"agents">, division: Doc<"divisions">) {
  return agent.isOwner || division.leadAgentId === agent._id;
}
async function permsOf(ctx: QueryCtx | MutationCtx, agent: Doc<"agents">, division: Doc<"divisions">): Promise<Set<string>> {
  if (isLeadOf(agent, division)) return new Set(ALL_PERMS);
  const m = await membershipOf(ctx, agent._id, division._id);
  if (!m || !m.rankId) return new Set();
  const rows = await ctx.db.query("divisionRankPermissions").withIndex("by_rank", (q) => q.eq("rankId", m.rankId!)).collect();
  return new Set(rows.map((r) => r.perm));
}
// Membre de la division (ou owner) : requis pour consulter l'espace.
async function assertMember(ctx: QueryCtx | MutationCtx, agent: Doc<"agents">, division: Doc<"divisions">) {
  if (agent.isOwner) return;
  if (!(await membershipOf(ctx, agent._id, division._id))) throw new Error("Vous ne faites pas partie de cette division.");
}
async function assertPerm(ctx: MutationCtx, agent: Doc<"agents">, division: Doc<"divisions">, slug: string) {
  if (isLeadOf(agent, division)) return;
  if ((await permsOf(ctx, agent, division)).has(slug)) return;
  throw new Error("Action non autorisée dans cette division.");
}
// Désigner le Lead / gérer les divisions : droit global (owner / rbac.manage).
async function assertGlobalManage(ctx: MutationCtx, agent: Doc<"agents">) {
  if (agent.isOwner || (await can(ctx, agent, "rbac.manage"))) return;
  throw new Error("Réservé à l'administration.");
}

// ---------- Consultation ----------

// Divisions de l'agent courant (pour la sidebar).
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    const links = await ctx.db.query("agentDivisions").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).collect();
    const out = [];
    for (const l of links) {
      const d = await ctx.db.get(l.divisionId);
      if (d) out.push({ _id: d._id, name: d.name, color: d.color ?? null });
    }
    // L'owner voit toutes les divisions pour pouvoir administrer.
    if (agent.isOwner) {
      const have = new Set(out.map((d) => d._id as string));
      for (const d of await ctx.db.query("divisions").collect()) {
        if (!have.has(d._id as string)) out.push({ _id: d._id, name: d.name, color: d.color ?? null });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  },
});

export const home = query({
  args: { divisionId: v.id("divisions") },
  handler: async (ctx, { divisionId }) => {
    const agent = await requireAgent(ctx);
    const division = await loadDivision(ctx, divisionId);
    if (!agent.isOwner && !(await membershipOf(ctx, agent._id, divisionId))) return null;
    const perms = await permsOf(ctx, agent, division);
    const lead = division.leadAgentId ? await ctx.db.get(division.leadAgentId) : null;
    const members = await ctx.db.query("agentDivisions").withIndex("by_division", (q) => q.eq("divisionId", divisionId)).collect();
    const announcements = (await ctx.db.query("divisionAnnouncements").withIndex("by_division", (q) => q.eq("divisionId", divisionId)).collect())
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.at - a.at)
      .slice(0, 30)
      .map((a) => ({ _id: a._id, authorName: a.authorName, title: a.title, body: a.body, imageUrls: a.imageUrls ?? [], pinned: !!a.pinned, at: a.at, mine: a.authorId === agent._id }));
    return {
      division: { _id: division._id, name: division.name, color: division.color ?? null, description: division.description ?? "", tier: division.tier },
      isLead: isLeadOf(agent, division),
      lead: lead ? { name: `${lead.prenomRP} ${lead.nomRP}`, matricule: lead.matricule ?? null } : null,
      membersCount: members.length,
      perms: [...perms],
      canManageLead: agent.isOwner || (await can(ctx, agent, "rbac.manage")),
      announcements,
    };
  },
});

export const members = query({
  args: { divisionId: v.id("divisions") },
  handler: async (ctx, { divisionId }) => {
    const agent = await requireAgent(ctx);
    const division = await loadDivision(ctx, divisionId);
    await assertMember(ctx, agent, division);
    const ranks = new Map((await ctx.db.query("divisionRanks").withIndex("by_division", (q) => q.eq("divisionId", divisionId)).collect()).map((r) => [r._id as string, r]));
    const links = await ctx.db.query("agentDivisions").withIndex("by_division", (q) => q.eq("divisionId", divisionId)).collect();
    const out = [];
    for (const l of links) {
      const a = await ctx.db.get(l.agentId);
      if (!a || a.status !== "ACTIVE") continue;
      const rank = l.rankId ? ranks.get(l.rankId as string) : null;
      out.push({
        agentId: a._id,
        name: `${a.prenomRP} ${a.nomRP}`,
        matricule: a.matricule ?? null,
        avatarUrl: a.avatarUrl ?? null,
        rankId: l.rankId ?? null,
        rankName: rank?.name ?? null,
        rankColor: rank?.color ?? null,
        isLead: division.leadAgentId === a._id,
      });
    }
    return out.sort((a, b) => (b.isLead ? 1 : 0) - (a.isLead ? 1 : 0) || a.name.localeCompare(b.name, "fr"));
  },
});

// Grades internes + leurs permissions (pour la configuration).
export const ranks = query({
  args: { divisionId: v.id("divisions") },
  handler: async (ctx, { divisionId }) => {
    const agent = await requireAgent(ctx);
    const division = await loadDivision(ctx, divisionId);
    await assertMember(ctx, agent, division);
    const rows = (await ctx.db.query("divisionRanks").withIndex("by_division", (q) => q.eq("divisionId", divisionId)).collect())
      .sort((a, b) => a.position - b.position);
    const out = [];
    for (const r of rows) {
      const perms = (await ctx.db.query("divisionRankPermissions").withIndex("by_rank", (q) => q.eq("rankId", r._id)).collect()).map((p) => p.perm);
      out.push({ _id: r._id, name: r.name, color: r.color ?? null, position: r.position, perms });
    }
    return { ranks: out, catalog: DIVISION_PERMS };
  },
});

export const messages = query({
  args: { divisionId: v.id("divisions") },
  handler: async (ctx, { divisionId }) => {
    const agent = await requireAgent(ctx);
    const division = await loadDivision(ctx, divisionId);
    await assertMember(ctx, agent, division);
    const canModerate = isLeadOf(agent, division) || (await permsOf(ctx, agent, division)).has("chat");
    const rows = (await ctx.db.query("divisionMessages").withIndex("by_division", (q) => q.eq("divisionId", divisionId)).order("desc").take(80)).reverse();
    return rows.map((m) => ({
      _id: m._id, authorName: m.authorName, body: m.body, imageUrls: m.imageUrls ?? [], at: m.at,
      canDelete: canModerate || m.authorId === agent._id,
    }));
  },
});

// Cibles pour désigner le Lead : les membres actifs de la division.
export const memberOptions = query({
  args: { divisionId: v.id("divisions") },
  handler: async (ctx, { divisionId }) => {
    const agent = await requireAgent(ctx);
    if (!agent.isOwner && !(await can(ctx, agent, "rbac.manage"))) return [];
    const links = await ctx.db.query("agentDivisions").withIndex("by_division", (q) => q.eq("divisionId", divisionId)).collect();
    const out = [];
    for (const l of links) {
      const a = await ctx.db.get(l.agentId);
      if (a && a.status === "ACTIVE") out.push({ _id: a._id, name: `${a.prenomRP} ${a.nomRP}`, matricule: a.matricule ?? null });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  },
});

// ---------- Configuration (Lead / permissions internes) ----------

export const setDescription = mutation({
  args: { divisionId: v.id("divisions"), description: v.string() },
  handler: async (ctx, { divisionId, description }) => {
    const agent = await requireAgent(ctx);
    const division = await loadDivision(ctx, divisionId);
    await assertPerm(ctx, agent, division, "config");
    await ctx.db.patch(divisionId, { description: description.trim() || undefined });
  },
});

export const setLead = mutation({
  args: { divisionId: v.id("divisions"), agentId: v.union(v.id("agents"), v.null()) },
  handler: async (ctx, { divisionId, agentId }) => {
    const agent = await requireAgent(ctx);
    await assertGlobalManage(ctx, agent);
    const division = await loadDivision(ctx, divisionId);
    if (agentId) {
      const m = await membershipOf(ctx, agentId, divisionId);
      if (!m) throw new Error("Le Lead doit être membre de la division.");
    }
    await ctx.db.patch(divisionId, { leadAgentId: agentId ?? undefined });
    await writeAudit(ctx, agent, { action: "division.set_lead", resourceType: "division", resourceId: divisionId, resourceLabel: division.name });
  },
});

export const rankCreate = mutation({
  args: { divisionId: v.id("divisions"), name: v.string(), color: v.optional(v.string()) },
  handler: async (ctx, { divisionId, name, color }) => {
    const agent = await requireAgent(ctx);
    const division = await loadDivision(ctx, divisionId);
    await assertPerm(ctx, agent, division, "ranks");
    if (!name.trim()) throw new Error("Nom du grade requis.");
    const all = await ctx.db.query("divisionRanks").withIndex("by_division", (q) => q.eq("divisionId", divisionId)).collect();
    const position = all.reduce((m, r) => Math.max(m, r.position), -1) + 1;
    return await ctx.db.insert("divisionRanks", { divisionId, name: name.trim(), color, position });
  },
});

export const rankUpdate = mutation({
  args: { rankId: v.id("divisionRanks"), name: v.string(), color: v.optional(v.string()) },
  handler: async (ctx, { rankId, name, color }) => {
    const agent = await requireAgent(ctx);
    const rank = await ctx.db.get(rankId);
    if (!rank) return;
    const division = await loadDivision(ctx, rank.divisionId);
    await assertPerm(ctx, agent, division, "ranks");
    await ctx.db.patch(rankId, { name: name.trim() || rank.name, color });
  },
});

export const rankMove = mutation({
  args: { rankId: v.id("divisionRanks"), direction: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, { rankId, direction }) => {
    const agent = await requireAgent(ctx);
    const rank = await ctx.db.get(rankId);
    if (!rank) return;
    const division = await loadDivision(ctx, rank.divisionId);
    await assertPerm(ctx, agent, division, "ranks");
    const all = (await ctx.db.query("divisionRanks").withIndex("by_division", (q) => q.eq("divisionId", rank.divisionId)).collect()).sort((a, b) => a.position - b.position);
    const i = all.findIndex((r) => r._id === rankId);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= all.length) return;
    await ctx.db.patch(all[i]._id, { position: all[j].position });
    await ctx.db.patch(all[j]._id, { position: all[i].position });
  },
});

export const rankRemove = mutation({
  args: { rankId: v.id("divisionRanks") },
  handler: async (ctx, { rankId }) => {
    const agent = await requireAgent(ctx);
    const rank = await ctx.db.get(rankId);
    if (!rank) return;
    const division = await loadDivision(ctx, rank.divisionId);
    await assertPerm(ctx, agent, division, "ranks");
    // Détache les membres portant ce grade + supprime ses permissions.
    for (const l of await ctx.db.query("agentDivisions").withIndex("by_division", (q) => q.eq("divisionId", rank.divisionId)).collect()) {
      if (l.rankId === rankId) await ctx.db.patch(l._id, { rankId: undefined });
    }
    for (const p of await ctx.db.query("divisionRankPermissions").withIndex("by_rank", (q) => q.eq("rankId", rankId)).collect()) await ctx.db.delete(p._id);
    await ctx.db.delete(rankId);
  },
});

export const setRankPerms = mutation({
  args: { rankId: v.id("divisionRanks"), perms: v.array(v.string()) },
  handler: async (ctx, { rankId, perms }) => {
    const agent = await requireAgent(ctx);
    const rank = await ctx.db.get(rankId);
    if (!rank) return;
    const division = await loadDivision(ctx, rank.divisionId);
    await assertPerm(ctx, agent, division, "ranks");
    const wanted = new Set(perms.filter((p) => ALL_PERMS.includes(p)));
    const existing = await ctx.db.query("divisionRankPermissions").withIndex("by_rank", (q) => q.eq("rankId", rankId)).collect();
    for (const e of existing) { if (!wanted.has(e.perm)) await ctx.db.delete(e._id); else wanted.delete(e.perm); }
    for (const p of wanted) await ctx.db.insert("divisionRankPermissions", { rankId, perm: p });
  },
});

export const assignMemberRank = mutation({
  args: { divisionId: v.id("divisions"), agentId: v.id("agents"), rankId: v.union(v.id("divisionRanks"), v.null()) },
  handler: async (ctx, { divisionId, agentId, rankId }) => {
    const agent = await requireAgent(ctx);
    const division = await loadDivision(ctx, divisionId);
    await assertPerm(ctx, agent, division, "members");
    const m = await membershipOf(ctx, agentId, divisionId);
    if (!m) throw new Error("Cet agent n'est pas membre de la division.");
    await ctx.db.patch(m._id, { rankId: rankId ?? undefined });
  },
});

// ---------- Annonces ----------

export const announce = mutation({
  args: { divisionId: v.id("divisions"), title: v.string(), body: v.string(), imageUrls: v.optional(v.array(v.string())), pinned: v.optional(v.boolean()) },
  handler: async (ctx, a) => {
    const agent = await requireAgent(ctx);
    const division = await loadDivision(ctx, a.divisionId);
    await assertPerm(ctx, agent, division, "announcements");
    if (!a.title.trim()) throw new Error("Titre requis.");
    return await ctx.db.insert("divisionAnnouncements", {
      divisionId: a.divisionId, authorId: agent._id, authorName: `${agent.prenomRP} ${agent.nomRP}`,
      title: a.title.trim(), body: a.body, imageUrls: a.imageUrls, pinned: a.pinned, at: Date.now(),
    });
  },
});

export const announceRemove = mutation({
  args: { id: v.id("divisionAnnouncements") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    const post = await ctx.db.get(id);
    if (!post) return;
    const division = await loadDivision(ctx, post.divisionId);
    if (post.authorId !== agent._id) await assertPerm(ctx, agent, division, "announcements");
    else await assertMember(ctx, agent, division);
    await ctx.db.delete(id);
  },
});

// ---------- Chat interne ----------

export const sendMessage = mutation({
  args: { divisionId: v.id("divisions"), body: v.string(), imageUrls: v.optional(v.array(v.string())) },
  handler: async (ctx, { divisionId, body, imageUrls }) => {
    const agent = await requireAgent(ctx);
    const division = await loadDivision(ctx, divisionId);
    await assertMember(ctx, agent, division);
    if (!body.trim() && !(imageUrls && imageUrls.length)) return;
    await ctx.db.insert("divisionMessages", {
      divisionId, authorId: agent._id, authorName: `${agent.prenomRP} ${agent.nomRP}`,
      body, imageUrls, at: Date.now(),
    });
  },
});

export const deleteMessage = mutation({
  args: { id: v.id("divisionMessages") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    const msg = await ctx.db.get(id);
    if (!msg) return;
    const division = await loadDivision(ctx, msg.divisionId);
    if (msg.authorId !== agent._id) await assertPerm(ctx, agent, division, "chat");
    else await assertMember(ctx, agent, division);
    await ctx.db.delete(id);
  },
});
