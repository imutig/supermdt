import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { requireAgent, requirePermission, can } from "./rbac";
import { writeAudit } from "./lib/audit";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";
import { inclusiveDaysParis } from "./lib/paris";

// Une absence doit couvrir au moins 3 jours (début et fin inclus). En deçà,
// l'agent se met simplement absent aux roll calls.
const MIN_ABSENCE_DAYS = 3;
const TOO_SHORT_MSG = "Une absence doit durer au moins 3 jours (jours de début et de fin inclus). Pour une absence plus courte, mets-toi simplement absent au roll call.";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAgent(ctx);
    const isManager = await can(ctx, viewer, "absences.manage");
    const canDelete = await can(ctx, viewer, "absences.delete");
    const rows = isManager
      ? await ctx.db.query("absences").order("desc").take(60)
      : await ctx.db
          .query("absences")
          .withIndex("by_agent", (q) => q.eq("agentId", viewer._id))
          .order("desc")
          .collect();
    const out = [];
    for (const a of rows) {
      const ag = await ctx.db.get(a.agentId);
      out.push({
        _id: a._id,
        agentName: ag ? `${ag.prenomRP} ${ag.nomRP}` : "-",
        reason: a.reason,
        from: a.from,
        to: a.to,
        status: a.status,
        canDecide: isManager && a.status === "EN_ATTENTE",
        canDelete,
      });
    }
    return out;
  },
});

export const request = mutation({
  args: { reason: v.string(), from: v.number(), to: v.number() },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "absences.request");
    if (args.to < args.from) throw new ConvexError("La date de fin précède la date de début.");
    if (inclusiveDaysParis(args.from, args.to) < MIN_ABSENCE_DAYS) throw new ConvexError(TOO_SHORT_MSG);
    // Plus d'approbation nécessaire : une absence déclarée est active d'emblée
    // (elle exclut aussitôt l'agent du ping du roll call).
    const id = await ctx.db.insert("absences", {
      agentId: agent._id,
      reason: args.reason,
      from: args.from,
      to: args.to,
      status: "APPROUVEE",
      at: Date.now(),
    });
    await writeAudit(ctx, agent, { action: "absence.request", resourceType: "absence", resourceId: id });
    await notify(ctx, "absence.request", {
      title: "Absence déclarée",
      description: `**${agent.prenomRP} ${agent.nomRP}**`,
      color: NOTIFY_COLOR.info,
      fields: [
        { name: "Période", value: `${new Date(args.from).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })} au ${new Date(args.to).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}` },
        { name: "Motif", value: args.reason },
      ],
    });
    await ctx.scheduler.runAfter(0, internal.push.notify, {}); // prévient le bot (annonce absence)
    return id;
  },
});

// Un gradé (permission absences.manage, par défaut à partir de SLO) déclare une
// absence pour un autre agent : validée d'emblée (elle exclut aussitôt l'agent
// du ping du roll call).
export const createFor = mutation({
  args: { agentId: v.id("agents"), reason: v.string(), from: v.number(), to: v.number() },
  handler: async (ctx, args) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "absences.manage");
    const target = await ctx.db.get(args.agentId);
    if (!target) throw new ConvexError("Agent introuvable.");
    if (args.to < args.from) throw new ConvexError("La date de fin précède la date de début.");
    if (inclusiveDaysParis(args.from, args.to) < MIN_ABSENCE_DAYS) throw new ConvexError(TOO_SHORT_MSG);
    const id = await ctx.db.insert("absences", {
      agentId: args.agentId,
      reason: args.reason.trim() || "Absence",
      from: args.from,
      to: args.to,
      status: "APPROUVEE",
      decidedBy: actor._id,
      at: Date.now(),
    });
    await writeAudit(ctx, actor, { action: "absence.create_for", resourceType: "absence", resourceId: id, resourceLabel: `${target.prenomRP} ${target.nomRP}` });
    await notify(ctx, "absence.request", {
      title: "Absence déclarée",
      description: `**${target.prenomRP} ${target.nomRP}**`,
      color: NOTIFY_COLOR.info,
      fields: [
        { name: "Période", value: `${new Date(args.from).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })} au ${new Date(args.to).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}` },
        { name: "Motif", value: args.reason.trim() || "Absence" },
      ],
      footer: `Déclarée par ${actor.prenomRP} ${actor.nomRP}`,
    });
    await ctx.scheduler.runAfter(0, internal.push.notify, {}); // prévient le bot (annonce absence)
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("absences") },
  handler: async (ctx, { id }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "absences.delete");
    const ab = await ctx.db.get(id);
    await ctx.db.delete(id);
    await writeAudit(ctx, actor, { action: "absence.delete", resourceType: "absence", resourceId: id });
    const target = ab ? await ctx.db.get(ab.agentId) : null;
    await notify(ctx, "absence.delete", {
      title: "Absence supprimée",
      description: target ? `**${target.prenomRP} ${target.nomRP}**` : undefined,
      color: NOTIFY_COLOR.danger,
      url: await deepLink(ctx, "/discipline"),
      footer: `Supprimée par ${actor.prenomRP} ${actor.nomRP}`,
    });
  },
});

export const decide = mutation({
  args: { id: v.id("absences"), approve: v.boolean() },
  handler: async (ctx, { id, approve }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "absences.manage");
    await ctx.db.patch(id, { status: approve ? "APPROUVEE" : "REFUSEE", decidedBy: actor._id });
    await writeAudit(ctx, actor, {
      action: approve ? "absence.approve" : "absence.reject",
      resourceType: "absence",
      resourceId: id,
    });
    const ab = await ctx.db.get(id);
    const target = ab ? await ctx.db.get(ab.agentId) : null;
    await notify(ctx, "absence.decide", {
      title: approve ? "Absence approuvée" : "Absence refusée",
      description: target ? `**${target.prenomRP} ${target.nomRP}**` : undefined,
      color: approve ? NOTIFY_COLOR.accent : NOTIFY_COLOR.danger,
      fields: ab
        ? [{ name: "Période", value: `${new Date(ab.from).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })} au ${new Date(ab.to).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}` }]
        : undefined,
      url: await deepLink(ctx, "/discipline"),
      footer: `Décidée par ${actor.prenomRP} ${actor.nomRP}`,
    });
  },
});
