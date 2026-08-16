import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireAgent, requirePermission, can, agentLabel } from "./rbac";
import { writeAudit } from "./lib/audit";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";

// ============================================================================
// Fiches 911 : suivi des appels par les opérateurs 911.
//   - Opérateur (n911.operate) : crée et gère SES fiches (édition + statut).
//   - Agent (n911.view) : consulte en lecture seule.
//   - Seul le créateur (ou l'owner) peut modifier une fiche.
// Statuts : EN_COURS -> ATTRIBUE (à une patrouille) -> RESOLU.
// ============================================================================

const STATUS = v.union(v.literal("EN_COURS"), v.literal("ATTRIBUE"), v.literal("RESOLU"));

// Un opérateur ou un consultant peut voir les fiches.
async function requireCanSee(ctx: Parameters<typeof requireAgent>[0]) {
  const agent = await requireAgent(ctx);
  if (!(await can(ctx, agent, "n911.view")) && !(await can(ctx, agent, "n911.operate"))) {
    throw new ConvexError("Accès refusé aux fiches 911.");
  }
  return agent;
}

async function nextNumber(ctx: MutationCtx): Promise<number> {
  const last = await ctx.db.query("calls911").withIndex("by_number").order("desc").first();
  return (last?.number ?? 0) + 1;
}

export const list = query({
  args: { status: v.optional(STATUS) },
  handler: async (ctx, { status }) => {
    const viewer = await requireCanSee(ctx);
    const rows = (await ctx.db.query("calls911").withIndex("by_number").order("desc").take(300))
      .filter((c) => !c.deletedAt && (!status || c.status === status));
    const out = [];
    for (const c of rows) {
      out.push({
        _id: c._id,
        number: c.number,
        status: c.status,
        callerName: c.callerName ?? null,
        callerPhone: c.callerPhone ?? null,
        location: c.location ?? null,
        nature: c.nature ?? null,
        priority: c.priority ?? null,
        assignedPatrol: c.assignedPatrol ?? null,
        at: c.at,
        by: (await agentLabel(ctx, c.createdBy)).name,
        mine: c.createdBy === viewer._id,
      });
    }
    return out;
  },
});

export const get = query({
  args: { id: v.id("calls911") },
  handler: async (ctx, { id }) => {
    const viewer = await requireCanSee(ctx);
    const c = await ctx.db.get(id);
    if (!c || c.deletedAt) return null;
    const citizen = c.citizenId ? await ctx.db.get(c.citizenId) : null;
    return {
      _id: c._id,
      number: c.number,
      status: c.status,
      callerName: c.callerName ?? "",
      callerPhone: c.callerPhone ?? "",
      location: c.location ?? "",
      locX: c.locX ?? null,
      locY: c.locY ?? null,
      nature: c.nature ?? "",
      priority: c.priority ?? "",
      info: c.info,
      peopleInvolved: c.peopleInvolved ?? "",
      weapons: c.weapons ?? false,
      weaponType: c.weaponType ?? "",
      vehicle: c.vehicle ?? "",
      citizenId: c.citizenId ?? null,
      citizenName: citizen ? `${citizen.prenom} ${citizen.nom}` : null,
      assignedPatrol: c.assignedPatrol ?? "",
      at: c.at,
      updatedAt: c.updatedAt ?? null,
      by: (await agentLabel(ctx, c.createdBy)).name,
      canEdit: c.createdBy === viewer._id || viewer.isOwner,
    };
  },
});

const FIELDS = {
  callerName: v.optional(v.string()),
  callerPhone: v.optional(v.string()),
  location: v.optional(v.string()),
  locX: v.optional(v.number()),
  locY: v.optional(v.number()),
  nature: v.optional(v.string()),
  priority: v.optional(v.string()),
  info: v.string(),
  peopleInvolved: v.optional(v.string()),
  weapons: v.optional(v.boolean()),
  weaponType: v.optional(v.string()),
  vehicle: v.optional(v.string()),
  citizenId: v.optional(v.id("citizens")),
  assignedPatrol: v.optional(v.string()),
};

export const create = mutation({
  args: FIELDS,
  handler: async (ctx, a) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "n911.operate");
    if (!a.info.trim()) throw new ConvexError("Les informations de l'appel sont requises.");
    const number = await nextNumber(ctx);
    const id = await ctx.db.insert("calls911", {
      number,
      status: "EN_COURS",
      ...a,
      info: a.info.trim(),
      createdBy: agent._id,
      at: Date.now(),
    });
    await writeAudit(ctx, agent, { action: "call911.create", resourceType: "call911", resourceId: id, resourceLabel: `Fiche 911 n°${number}` });
    await notify(ctx, "call911.create", {
      title: `Fiche 911 n°${number}`,
      description: a.nature?.trim() ? `**${a.nature.trim()}**` : a.info.trim(),
      color: NOTIFY_COLOR.danger,
      fields: [
        ...(a.location?.trim() ? [{ name: "Lieu", value: a.location.trim(), inline: true }] : []),
        ...(a.priority?.trim() ? [{ name: "Priorité", value: a.priority.trim(), inline: true }] : []),
      ],
      url: await deepLink(ctx, "/911"),
      footer: `Ouverte par ${agent.prenomRP} ${agent.nomRP}`,
    });
    return { id, number };
  },
});

// Seul le créateur (ou l'owner) modifie sa fiche.
async function requireOwnerOfFiche(ctx: MutationCtx, id: string) {
  const agent = await requireAgent(ctx);
  const c = await ctx.db.get(id as any);
  if (!c || (c as any).deletedAt) throw new ConvexError("Fiche introuvable.");
  if ((c as any).createdBy !== agent._id && !agent.isOwner) throw new ConvexError("Seul l'opérateur qui a créé la fiche peut la modifier.");
  return { agent, c: c as any };
}

export const update = mutation({
  args: { id: v.id("calls911"), ...FIELDS },
  handler: async (ctx, { id, ...a }) => {
    const { agent } = await requireOwnerOfFiche(ctx, id);
    if (!a.info.trim()) throw new ConvexError("Les informations de l'appel sont requises.");
    await ctx.db.patch(id, { ...a, info: a.info.trim(), updatedAt: Date.now() });
    await writeAudit(ctx, agent, { action: "call911.edit", resourceType: "call911", resourceId: id });
  },
});

export const setStatus = mutation({
  args: { id: v.id("calls911"), status: STATUS, assignedPatrol: v.optional(v.string()) },
  handler: async (ctx, { id, status, assignedPatrol }) => {
    const { agent, c } = await requireOwnerOfFiche(ctx, id);
    const patch: Record<string, unknown> = { status, updatedAt: Date.now() };
    // On ne touche à la patrouille attribuée que si elle est fournie (ne pas
    // l'effacer en passant à « résolu »).
    if (assignedPatrol !== undefined) patch.assignedPatrol = assignedPatrol.trim() || undefined;
    if (status === "RESOLU") patch.resolvedAt = Date.now();
    await ctx.db.patch(id, patch);
    await writeAudit(ctx, agent, { action: "call911.status", resourceType: "call911", resourceId: id, resourceLabel: status });
    await notify(ctx, "call911.status", {
      title: `Fiche 911 n°${c.number} · ${status}`,
      description: c.nature ? `**${c.nature}**` : undefined,
      color: status === "RESOLU" ? NOTIFY_COLOR.accent : NOTIFY_COLOR.warning,
      fields: assignedPatrol?.trim() ? [{ name: "Patrouille", value: assignedPatrol.trim(), inline: true }] : undefined,
      url: await deepLink(ctx, "/911"),
      footer: `Mise à jour par ${agent.prenomRP} ${agent.nomRP}`,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("calls911") },
  handler: async (ctx, { id }) => {
    const { agent, c } = await requireOwnerOfFiche(ctx, id);
    await ctx.db.patch(id, { deletedAt: Date.now(), deletedBy: agent._id });
    await writeAudit(ctx, agent, { action: "call911.delete", resourceType: "call911", resourceId: id });
    await notify(ctx, "call911.delete", {
      title: `Fiche 911 n°${c.number} supprimée`,
      description: c.nature ? `**${c.nature}**` : undefined,
      color: NOTIFY_COLOR.danger,
      url: await deepLink(ctx, "/911"),
      footer: `Supprimée par ${agent.prenomRP} ${agent.nomRP}`,
    });
  },
});
