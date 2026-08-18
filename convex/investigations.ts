import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { requireAgent, requirePermission, can } from "./rbac";
import { writeAudit } from "./lib/audit";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";

// ============================================================================
// ENQUÊTES INTERNES (Internal Affairs). Une enquête vise un ou plusieurs agents,
// porte un statut (ouverte / en cours / clôturée), un journal d'actions (notes
// manuelles + événements), et une issue à la clôture. Confidentiel :
// investigations.view pour consulter, investigations.manage pour agir.
// ============================================================================

const ROLE_ARG = v.optional(v.union(v.literal("SUSPECT"), v.literal("WITNESS"), v.literal("INVOLVED")));
const SEVERITY_ARG = v.optional(v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH"), v.literal("CRITICAL")));

async function assertView(ctx: QueryCtx) {
  const agent = await requireAgent(ctx);
  await requirePermission(ctx, agent, "investigations.view");
  return agent;
}
async function assertManage(ctx: MutationCtx) {
  const agent = await requireAgent(ctx);
  await requirePermission(ctx, agent, "investigations.manage");
  return agent;
}

async function nextRef(ctx: MutationCtx): Promise<number> {
  const all = await ctx.db.query("internalInvestigations").collect();
  return all.reduce((m, i) => Math.max(m, i.reference ?? 0), 0) + 1;
}

async function agentBrief(ctx: QueryCtx, agentId: Id<"agents">) {
  const a = await ctx.db.get(agentId);
  if (!a) return { _id: agentId, name: "Agent supprimé", matricule: null as number | null, avatarUrl: null as string | null };
  return { _id: a._id, name: `${a.prenomRP} ${a.nomRP}`, matricule: a.matricule ?? null, avatarUrl: a.avatarUrl ?? null };
}

// Journalise un événement système (ouverture, statut, clôture, cibles).
async function logEvent(ctx: MutationCtx, actor: Doc<"agents">, investigationId: Id<"internalInvestigations">, body: string) {
  await ctx.db.insert("investigationNotes", {
    investigationId, body, kind: "EVENT",
    authorId: actor._id, authorName: `${actor.prenomRP} ${actor.nomRP}`, at: Date.now(),
  });
}

// ---------------------- Lecture ----------------------
export const list = query({
  args: { status: v.optional(v.union(v.literal("OPEN"), v.literal("IN_PROGRESS"), v.literal("CLOSED"), v.literal("ALL"))) },
  handler: async (ctx, { status }) => {
    const viewer = await assertView(ctx);
    const canManage = await can(ctx, viewer, "investigations.manage");
    const rows = (await ctx.db.query("internalInvestigations").collect())
      .filter((i) => !i.deletedAt && (!status || status === "ALL" || i.status === status))
      .sort((a, b) => b.at - a.at);
    const out = [];
    for (const inv of rows) {
      const targets = await ctx.db.query("investigationTargets").withIndex("by_investigation", (q) => q.eq("investigationId", inv._id)).collect();
      const opener = await agentBrief(ctx, inv.openedBy);
      const targetBriefs = [];
      for (const t of targets.slice(0, 6)) targetBriefs.push({ ...(await agentBrief(ctx, t.agentId)), role: t.role ?? "INVOLVED" });
      out.push({
        _id: inv._id, reference: inv.reference, title: inv.title, status: inv.status,
        severity: inv.severity ?? null, outcome: inv.outcome ?? null, at: inv.at,
        closedAt: inv.closedAt ?? null, openerName: opener.name,
        targets: targetBriefs, targetCount: targets.length,
      });
    }
    return { rows: out, canManage };
  },
});

export const get = query({
  args: { id: v.id("internalInvestigations") },
  handler: async (ctx, { id }) => {
    const viewer = await assertView(ctx);
    const inv = await ctx.db.get(id);
    if (!inv || inv.deletedAt) return null;
    const canManage = await can(ctx, viewer, "investigations.manage");
    const targets = await ctx.db.query("investigationTargets").withIndex("by_investigation", (q) => q.eq("investigationId", id)).collect();
    const targetOut = [];
    for (const t of targets) targetOut.push({ _id: t._id, role: t.role ?? "INVOLVED", agent: await agentBrief(ctx, t.agentId) });
    const notes = (await ctx.db.query("investigationNotes").withIndex("by_investigation", (q) => q.eq("investigationId", id)).collect())
      .sort((a, b) => b.at - a.at)
      .map((n) => ({ _id: n._id, body: n.body, kind: n.kind, imageUrls: n.imageUrls ?? [], authorName: n.authorName, authorId: n.authorId, at: n.at }));
    return {
      _id: inv._id, reference: inv.reference, title: inv.title, reason: inv.reason ?? "",
      status: inv.status, severity: inv.severity ?? null, outcome: inv.outcome ?? null, conclusion: inv.conclusion ?? "",
      opener: await agentBrief(ctx, inv.openedBy), at: inv.at,
      closedBy: inv.closedBy ? await agentBrief(ctx, inv.closedBy) : null, closedAt: inv.closedAt ?? null,
      targets: targetOut.sort((a, b) => a.agent.name.localeCompare(b.agent.name)),
      notes, canManage,
    };
  },
});

// Enquêtes concernant un agent (pour sa fiche Effectif). Vide si pas la permission.
export const byAgent = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const viewer = await requireAgent(ctx);
    if (!(await can(ctx, viewer, "investigations.view"))) return [];
    const links = await ctx.db.query("investigationTargets").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect();
    const out = [];
    for (const l of links) {
      const inv = await ctx.db.get(l.investigationId);
      if (!inv || inv.deletedAt) continue;
      out.push({ _id: inv._id, reference: inv.reference, title: inv.title, status: inv.status, severity: inv.severity ?? null, outcome: inv.outcome ?? null, role: l.role ?? "INVOLVED", at: inv.at });
    }
    return out.sort((a, b) => b.at - a.at);
  },
});

// Effectif proposable comme cible (actifs + suspendus, hors owner).
export const pickerAgents = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAgent(ctx);
    await requirePermission(ctx, viewer, "investigations.manage");
    const grades = new Map((await ctx.db.query("grades").collect()).map((g) => [g._id as string, g]));
    const agents = [
      ...await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "ACTIVE")).collect(),
      ...await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "SUSPENDED")).collect(),
    ];
    return agents.filter((a) => !a.isOwner).map((a) => ({
      _id: a._id, name: `${a.prenomRP} ${a.nomRP}`, matricule: a.matricule ?? null,
      gradeName: a.gradeId ? grades.get(a.gradeId as string)?.name ?? null : null,
    })).sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ---------------------- Écriture ----------------------
export const create = mutation({
  args: {
    title: v.string(),
    reason: v.optional(v.string()),
    severity: SEVERITY_ARG,
    targets: v.array(v.object({ agentId: v.id("agents"), role: ROLE_ARG })),
  },
  handler: async (ctx, args) => {
    const actor = await assertManage(ctx);
    if (!args.title.trim()) throw new ConvexError("Titre de l'enquête obligatoire.");
    if (args.targets.length === 0) throw new ConvexError("Sélectionnez au moins un agent concerné.");
    const reference = await nextRef(ctx);
    const id = await ctx.db.insert("internalInvestigations", {
      reference, title: args.title.trim(), reason: args.reason?.trim() || undefined,
      status: "OPEN", severity: args.severity, openedBy: actor._id, at: Date.now(),
    });
    const names: string[] = [];
    const seen = new Set<string>();
    for (const t of args.targets) {
      if (seen.has(t.agentId as string)) continue;
      seen.add(t.agentId as string);
      await ctx.db.insert("investigationTargets", { investigationId: id, agentId: t.agentId, role: t.role ?? "INVOLVED", addedAt: Date.now() });
      const a = await ctx.db.get(t.agentId);
      if (a) names.push(`${a.prenomRP} ${a.nomRP}`);
    }
    await logEvent(ctx, actor, id, `Enquête ouverte : « ${args.title.trim()} »`);
    await writeAudit(ctx, actor, { action: "investigation.create", resourceType: "investigation", resourceId: id, resourceLabel: args.title.trim(), metadata: { targets: names.length } });
    await notify(ctx, "investigation.create", {
      title: `Enquête interne #${reference} ouverte`,
      description: `**${args.title.trim()}**`,
      color: NOTIFY_COLOR.danger,
      fields: [{ name: "Agents concernés", value: names.join(", ").slice(0, 1024) || "-" }],
      url: await deepLink(ctx, `/discipline?enquete=${id}`),
      footer: `Ouverte par ${actor.prenomRP} ${actor.nomRP}`,
    });
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("internalInvestigations"), title: v.optional(v.string()), reason: v.optional(v.string()), severity: v.optional(v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH"), v.literal("CRITICAL"), v.null())) },
  handler: async (ctx, { id, title, reason, severity }) => {
    await assertManage(ctx);
    const inv = await ctx.db.get(id);
    if (!inv || inv.deletedAt) throw new ConvexError("Enquête introuvable.");
    await ctx.db.patch(id, {
      ...(title !== undefined ? { title: title.trim() || inv.title } : {}),
      ...(reason !== undefined ? { reason: reason.trim() || undefined } : {}),
      ...(severity !== undefined ? { severity: severity ?? undefined } : {}),
    });
  },
});

export const setStatus = mutation({
  args: { id: v.id("internalInvestigations"), status: v.union(v.literal("OPEN"), v.literal("IN_PROGRESS"), v.literal("CLOSED")) },
  handler: async (ctx, { id, status }) => {
    const actor = await assertManage(ctx);
    const inv = await ctx.db.get(id);
    if (!inv || inv.deletedAt) throw new ConvexError("Enquête introuvable.");
    if (inv.status === status) return;
    const LABEL = { OPEN: "Ouverte", IN_PROGRESS: "En cours", CLOSED: "Clôturée" } as const;
    // La clôture passe par `close` (issue + conclusion) ; ici on ne fait pas CLOSED.
    if (status === "CLOSED") throw new ConvexError("Utilisez la clôture avec issue.");
    await ctx.db.patch(id, { status, closedBy: undefined, closedAt: undefined, outcome: undefined });
    await logEvent(ctx, actor, id, `Statut : ${LABEL[status]}`);
  },
});

export const close = mutation({
  args: {
    id: v.id("internalInvestigations"),
    outcome: v.union(v.literal("NO_ACTION"), v.literal("EXONERATED"), v.literal("SANCTION"), v.literal("DISMISSAL"), v.literal("OTHER")),
    conclusion: v.optional(v.string()),
  },
  handler: async (ctx, { id, outcome, conclusion }) => {
    const actor = await assertManage(ctx);
    const inv = await ctx.db.get(id);
    if (!inv || inv.deletedAt) throw new ConvexError("Enquête introuvable.");
    await ctx.db.patch(id, { status: "CLOSED", outcome, conclusion: conclusion?.trim() || undefined, closedBy: actor._id, closedAt: Date.now() });
    const OUT = { NO_ACTION: "Sans suite", EXONERATED: "Agent(s) disculpé(s)", SANCTION: "Sanction", DISMISSAL: "Radiation", OTHER: "Autre" } as const;
    await logEvent(ctx, actor, id, `Enquête clôturée — issue : ${OUT[outcome]}${conclusion?.trim() ? ` — ${conclusion.trim()}` : ""}`);
    await writeAudit(ctx, actor, { action: "investigation.close", resourceType: "investigation", resourceId: id, resourceLabel: inv.title, metadata: { outcome } });
    await notify(ctx, "investigation.close", {
      title: `Enquête interne #${inv.reference} clôturée`,
      description: `**${inv.title}**`,
      color: NOTIFY_COLOR.muted,
      fields: [{ name: "Issue", value: OUT[outcome], inline: true }],
      footer: `Clôturée par ${actor.prenomRP} ${actor.nomRP}`,
    });
  },
});

export const reopen = mutation({
  args: { id: v.id("internalInvestigations") },
  handler: async (ctx, { id }) => {
    const actor = await assertManage(ctx);
    const inv = await ctx.db.get(id);
    if (!inv || inv.deletedAt) throw new ConvexError("Enquête introuvable.");
    await ctx.db.patch(id, { status: "IN_PROGRESS", outcome: undefined, conclusion: undefined, closedBy: undefined, closedAt: undefined });
    await logEvent(ctx, actor, id, "Enquête rouverte");
  },
});

export const addNote = mutation({
  args: { id: v.id("internalInvestigations"), body: v.string(), imageUrls: v.optional(v.array(v.string())) },
  handler: async (ctx, { id, body, imageUrls }) => {
    const actor = await assertManage(ctx);
    const inv = await ctx.db.get(id);
    if (!inv || inv.deletedAt) throw new ConvexError("Enquête introuvable.");
    if (!body.trim() && (!imageUrls || imageUrls.length === 0)) throw new ConvexError("Note vide.");
    await ctx.db.insert("investigationNotes", {
      investigationId: id, body: body.trim(), kind: "NOTE",
      imageUrls: imageUrls?.filter((u) => u.trim()).slice(0, 6),
      authorId: actor._id, authorName: `${actor.prenomRP} ${actor.nomRP}`, at: Date.now(),
    });
  },
});

export const removeNote = mutation({
  args: { noteId: v.id("investigationNotes") },
  handler: async (ctx, { noteId }) => {
    await assertManage(ctx);
    const n = await ctx.db.get(noteId);
    if (n && n.kind === "NOTE") await ctx.db.delete(noteId);
  },
});

export const addTarget = mutation({
  args: { id: v.id("internalInvestigations"), agentId: v.id("agents"), role: ROLE_ARG },
  handler: async (ctx, { id, agentId, role }) => {
    const actor = await assertManage(ctx);
    const inv = await ctx.db.get(id);
    if (!inv || inv.deletedAt) throw new ConvexError("Enquête introuvable.");
    const existing = (await ctx.db.query("investigationTargets").withIndex("by_investigation", (q) => q.eq("investigationId", id)).collect())
      .find((t) => t.agentId === agentId);
    if (existing) return;
    await ctx.db.insert("investigationTargets", { investigationId: id, agentId, role: role ?? "INVOLVED", addedAt: Date.now() });
    const a = await ctx.db.get(agentId);
    if (a) await logEvent(ctx, actor, id, `Agent ajouté : ${a.prenomRP} ${a.nomRP}`);
  },
});

export const setTargetRole = mutation({
  args: { targetId: v.id("investigationTargets"), role: v.union(v.literal("SUSPECT"), v.literal("WITNESS"), v.literal("INVOLVED")) },
  handler: async (ctx, { targetId, role }) => {
    await assertManage(ctx);
    await ctx.db.patch(targetId, { role });
  },
});

export const removeTarget = mutation({
  args: { targetId: v.id("investigationTargets") },
  handler: async (ctx, { targetId }) => {
    const actor = await assertManage(ctx);
    const t = await ctx.db.get(targetId);
    if (!t) return;
    const remaining = await ctx.db.query("investigationTargets").withIndex("by_investigation", (q) => q.eq("investigationId", t.investigationId)).collect();
    if (remaining.length <= 1) throw new ConvexError("Une enquête doit concerner au moins un agent.");
    const a = await ctx.db.get(t.agentId);
    await ctx.db.delete(targetId);
    if (a) await logEvent(ctx, actor, t.investigationId, `Agent retiré : ${a.prenomRP} ${a.nomRP}`);
  },
});

// Suppression douce (archive). Réversible : filtrée par deletedAt partout.
export const remove = mutation({
  args: { id: v.id("internalInvestigations") },
  handler: async (ctx, { id }) => {
    const actor = await assertManage(ctx);
    const inv = await ctx.db.get(id);
    if (!inv || inv.deletedAt) return;
    await ctx.db.patch(id, { deletedAt: Date.now(), deletedBy: actor._id });
    await writeAudit(ctx, actor, { action: "investigation.remove", resourceType: "investigation", resourceId: id, resourceLabel: inv.title, metadata: { soft: true } });
  },
});
