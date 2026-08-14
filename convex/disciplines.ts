import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { assertOutranks, requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";
import { parisWallToEpoch } from "./lib/paris";

// "YYYY-MM-DDTHH:MM" (datetime-local, heure de Paris) -> epoch ; undefined si vide.
function wallToEpoch(s?: string): number | undefined {
  if (!s) return undefined;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return undefined;
  return parisWallToEpoch(+m[1], +m[2], +m[3], +m[4], +m[5]);
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "discipline.view");
    const rows = (await ctx.db.query("disciplines").order("desc").take(60)).filter((d) => !d.deletedAt);
    const out = [];
    for (const d of rows) {
      const ag = await ctx.db.get(d.agentId);
      const by = d.byAgentId ? await ctx.db.get(d.byAgentId) : null;
      out.push({
        _id: d._id,
        agentId: d.agentId,
        agentName: ag ? `${ag.prenomRP} ${ag.nomRP}` : "-",
        agentSuspended: ag?.status === "SUSPENDED",
        motif: d.motif,
        sanction: d.sanction,
        level: d.level ?? null,
        reference: d.reference ?? null,
        suspends: d.suspends ?? false,
        suspendedUntil: d.suspendedUntil ?? null,
        status: d.status,
        by: by ? `${by.prenomRP} ${by.nomRP}` : "-",
        at: d.at,
        evidence: d.imageUrls ?? [],
      });
    }
    return out;
  },
});

// Types de sanction disciplinaire prédéfinis (§12).
export const sanctionTypes = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "discipline.view");
    return (await ctx.db.query("disciplineSanctionTypes").collect())
      .filter((t) => t.active)
      .sort((a, b) => a.position - b.position)
      .map((t) => ({ _id: t._id, name: t.name, suspends: t.suspends ?? false }));
  },
});

// Sanctions d'un agent (affichées sur sa fiche, §11/§12).
export const byAgent = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const viewer = await requireAgent(ctx);
    await requirePermission(ctx, viewer, "discipline.view");
    const rows = (await ctx.db
      .query("disciplines")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .order("desc")
      .collect()).filter((d) => !d.deletedAt);
    const out = [];
    for (const d of rows) {
      const by = d.byAgentId ? await ctx.db.get(d.byAgentId) : null;
      out.push({
        _id: d._id,
        motif: d.motif,
        sanction: d.sanction,
        level: d.level ?? null,
        reference: d.reference ?? null,
        suspends: d.suspends ?? false,
        suspendedUntil: d.suspendedUntil ?? null,
        status: d.status,
        by: by ? `${by.prenomRP} ${by.nomRP}` : "-",
        at: d.at,
        evidence: d.imageUrls ?? [],
      });
    }
    return out;
  },
});

// Preuves attachées à une sanction (captures, enregistrements...).
export const setEvidence = mutation({
  args: { id: v.id("disciplines"), imageUrls: v.array(v.string()) },
  handler: async (ctx, { id, imageUrls }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "discipline.edit");
    await ctx.db.patch(id, { imageUrls });
  },
});

export const remove = mutation({
  args: { id: v.id("disciplines") },
  handler: async (ctx, { id }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "discipline.delete");
    const d = await ctx.db.get(id);
    if (!d || d.deletedAt) return;
    await ctx.db.patch(id, { deletedAt: Date.now(), deletedBy: actor._id });
    await writeAudit(ctx, actor, { action: "discipline.remove", resourceType: "discipline", resourceId: id });
  },
});

// Prochain numéro de référence (SANC-xxxx) : max des références existantes + 1.
async function nextReference(ctx: MutationCtx): Promise<number> {
  let max = 0;
  for (const d of await ctx.db.query("disciplines").collect()) if ((d.reference ?? 0) > max) max = d.reference ?? 0;
  return max + 1;
}

export const create = mutation({
  args: {
    agentId: v.id("agents"),
    motif: v.string(),
    sanction: v.string(),
    level: v.optional(v.string()), // AVERTISSEMENT | BLAME | MISE_A_PIED | RADIATION | CUSTOM
    imageUrls: v.optional(v.array(v.string())),
    // Mise à pied : suspend le compte jusqu'à suspendedUntilWall (vide = jusqu'à
    // nouvel ordre). Heure murale Paris "YYYY-MM-DDTHH:MM".
    suspends: v.optional(v.boolean()),
    suspendedUntilWall: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "discipline.create");
    const targetAgent = await ctx.db.get(args.agentId);
    if (!targetAgent) throw new Error("Agent introuvable.");
    await assertOutranks(ctx, actor, targetAgent);
    const reference = await nextReference(ctx);
    const suspendedUntil = args.suspends ? wallToEpoch(args.suspendedUntilWall) : undefined;
    const id = await ctx.db.insert("disciplines", {
      agentId: args.agentId,
      motif: args.motif,
      sanction: args.sanction,
      level: args.level,
      imageUrls: args.imageUrls,
      status: "OUVERTE",
      byAgentId: actor._id,
      at: Date.now(),
      reference,
      suspends: args.suspends,
      suspendedUntil,
      discordAnnounced: false, // le bot dépilera via sanctionsToAnnounce
    });
    // Mise à pied : suspend le compte (rouge dans l'effectif, connexion bloquée).
    if (args.suspends) {
      await ctx.db.patch(args.agentId, {
        status: "SUSPENDED",
        suspendedUntil,
        suspendedReason: args.motif,
        suspendedBy: actor._id,
      });
    }
    await writeAudit(ctx, actor, { action: "discipline.create", resourceType: "discipline", resourceId: id });
    await notify(ctx, "discipline.create", {
      title: "Sanction disciplinaire ouverte",
      description: `**${targetAgent.prenomRP} ${targetAgent.nomRP}**`,
      color: NOTIFY_COLOR.danger,
      fields: [
        { name: "Motif", value: args.motif },
        { name: "Sanction", value: args.sanction, inline: true },
      ],
      url: await deepLink(ctx, "/discipline"),
      footer: `Ouverte par ${actor.prenomRP} ${actor.nomRP}`,
    });
    return id;
  },
});

// Levée manuelle d'une mise à pied : réactive le compte.
export const reactivate = mutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "discipline.edit");
    const target = await ctx.db.get(agentId);
    if (!target) throw new Error("Agent introuvable.");
    if (target.status !== "SUSPENDED") return;
    await ctx.db.patch(agentId, { status: "ACTIVE", suspendedUntil: undefined, suspendedReason: undefined, suspendedBy: undefined });
    await writeAudit(ctx, actor, { action: "discipline.reactivate", resourceType: "agent", resourceId: agentId });
  },
});

export const close = mutation({
  args: { id: v.id("disciplines") },
  handler: async (ctx, { id }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "discipline.edit");
    await ctx.db.patch(id, { status: "CLOSE" });
    await writeAudit(ctx, actor, { action: "discipline.close", resourceType: "discipline", resourceId: id });
  },
});

// Cron : réactive les comptes dont la mise à pied est arrivée à échéance.
export const liftExpiredSuspensions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const suspended = await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "SUSPENDED")).collect();
    let lifted = 0;
    for (const a of suspended) {
      if (typeof a.suspendedUntil === "number" && a.suspendedUntil <= now) {
        await ctx.db.patch(a._id, { status: "ACTIVE", suspendedUntil: undefined, suspendedReason: undefined, suspendedBy: undefined });
        lifted++;
      }
    }
    return { lifted };
  },
});
