import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission, agentLabel } from "./rbac";
import { writeAudit } from "./lib/audit";
import { touchStats } from "./stats";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";

// Tableau global des mandats actifs (dashboard + « qui est recherché »).
export const active = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "mandats.view");
    const rows = await ctx.db
      .query("mandats")
      .withIndex("by_status", (q) => q.eq("status", "ACTIF"))
      .collect();
    const now = Date.now();
    const out = [];
    for (const m of rows) {
      if (m.deletedAt) continue;
      if (m.expiresAt != null && m.expiresAt < now) continue;
      const citizen = await ctx.db.get(m.citizenId);
      const type = await ctx.db.get(m.typeId);
      out.push({
        _id: m._id,
        motif: m.motif,
        issuedAt: m.issuedAt,
        citizenId: m.citizenId,
        citizenName: citizen ? `${citizen.prenom} ${citizen.nom}` : "-",
        typeName: type?.name ?? "",
      });
    }
    return out.sort((a, b) => b.issuedAt - a.issuedAt);
  },
});

export const listTypes = query({
  args: {},
  handler: async (ctx) => {
    await requireAgent(ctx);
    return (await ctx.db.query("mandatTypes").collect()).filter((t) => t.active);
  },
});

export const byCitizen = query({
  args: { citizenId: v.id("citizens") },
  handler: async (ctx, { citizenId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "mandats.view");
    const rows = await ctx.db
      .query("mandats")
      .withIndex("by_citizen", (q) => q.eq("citizenId", citizenId))
      .order("desc")
      .collect();
    const now = Date.now();
    const out = [];
    for (const m of rows) {
      if (m.deletedAt) continue;
      const type = await ctx.db.get(m.typeId);
      const effActive = m.status === "ACTIF" && (m.expiresAt == null || m.expiresAt >= now);
      out.push({
        _id: m._id,
        motif: m.motif,
        typeName: type?.name ?? "",
        status: m.status,
        effectiveActive: effActive,
        issuer: await agentLabel(ctx, m.issuedBy),
        issuedAt: m.issuedAt,
      });
    }
    return out;
  },
});

// Suppression douce d'un mandat (§18 : Archive, restaurable).
export const remove = mutation({
  args: { mandatId: v.id("mandats") },
  handler: async (ctx, { mandatId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "mandats.annul");
    const m = await ctx.db.get(mandatId);
    if (!m) throw new Error("Mandat introuvable.");
    if (m.deletedAt) return;
    const citizen = await ctx.db.get(m.citizenId);
    await ctx.db.patch(mandatId, { deletedAt: Date.now(), deletedBy: agent._id });
    await writeAudit(ctx, agent, {
      action: "mandat.delete",
      resourceType: "mandat",
      resourceId: mandatId,
      resourceLabel: citizen ? `${citizen.prenom} ${citizen.nom}` : "",
      metadata: { soft: true, motif: m.motif, status: m.status },
    });
    await notify(ctx, "mandat.annul", {
      title: "Mandat annulé",
      description: citizen ? `**${citizen.prenom} ${citizen.nom}**` : undefined,
      color: NOTIFY_COLOR.muted,
      fields: [{ name: "Motif", value: m.motif }],
      url: await deepLink(ctx, `/citoyen/${m.citizenId}`),
      footer: `Annulé par ${agent.prenomRP} ${agent.nomRP}`,
    });
  },
});

// Marque un mandat comme EXÉCUTÉ (ex. individu arrêté) - §5.
export const execute = mutation({
  args: { mandatId: v.id("mandats") },
  handler: async (ctx, { mandatId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "mandats.execute");
    const m = await ctx.db.get(mandatId);
    if (!m) throw new Error("Mandat introuvable.");
    if (m.status !== "ACTIF") throw new Error("Seul un mandat actif peut être exécuté.");
    const citizen = await ctx.db.get(m.citizenId);
    await ctx.db.patch(mandatId, {
      status: "EXECUTE",
      executedBy: agent._id,
      executedAt: Date.now(),
    });
    await writeAudit(ctx, agent, {
      action: "mandat.execute",
      resourceType: "mandat",
      resourceId: mandatId,
      resourceLabel: citizen ? `${citizen.prenom} ${citizen.nom}` : "",
      metadata: { motif: m.motif },
    });
    await notify(ctx, "mandat.execute", {
      title: "Mandat exécuté",
      description: citizen ? `**${citizen.prenom} ${citizen.nom}**` : undefined,
      color: NOTIFY_COLOR.accent,
      fields: [{ name: "Motif", value: m.motif }],
      url: await deepLink(ctx, `/citoyen/${m.citizenId}`),
      footer: `Exécuté par ${agent.prenomRP} ${agent.nomRP}`,
    });
  },
});

export const create = mutation({
  args: {
    citizenId: v.id("citizens"),
    typeId: v.id("mandatTypes"),
    motif: v.string(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "mandats.create");
    const id = await ctx.db.insert("mandats", {
      citizenId: args.citizenId,
      typeId: args.typeId,
      motif: args.motif,
      status: "ACTIF",
      expiresAt: args.expiresAt,
      issuedBy: agent._id,
      issuedAt: Date.now(),
    });
    const citizen = await ctx.db.get(args.citizenId);
    await writeAudit(ctx, agent, {
      action: "mandat.create",
      resourceType: "mandat",
      resourceId: id,
      resourceLabel: citizen ? `${citizen.prenom} ${citizen.nom}` : "",
      metadata: { motif: args.motif },
    });
    await touchStats(ctx);
    const type = await ctx.db.get(args.typeId);
    await notify(ctx, "mandat.create", {
      title: `Mandat émis${type ? ` · ${type.name}` : ""}`,
      description: citizen ? `**${citizen.prenom} ${citizen.nom}**` : undefined,
      color: NOTIFY_COLOR.danger,
      fields: [
        { name: "Motif", value: args.motif },
        ...(args.expiresAt ? [{ name: "Expire le", value: new Date(args.expiresAt).toLocaleString("fr-FR"), inline: true }] : []),
      ],
      url: await deepLink(ctx, `/citoyen/${args.citizenId}`),
      footer: `Émis par ${agent.prenomRP} ${agent.nomRP}`,
    });
    return id;
  },
});

// Passe en EXPIRE les mandats actifs dont l'échéance est dépassée (cron horaire).
export const expireDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const actifs = await ctx.db.query("mandats").withIndex("by_status", (q) => q.eq("status", "ACTIF")).collect();
    let n = 0;
    for (const m of actifs) {
      if (m.deletedAt) continue;
      if (m.expiresAt == null || m.expiresAt >= now) continue;
      await ctx.db.patch(m._id, { status: "EXPIRE" });
      n++;
    }
    return n;
  },
});
