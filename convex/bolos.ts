import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission, agentLabel } from "./rbac";
import { writeAudit } from "./lib/audit";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";

// Avis de recherche (BOLO). Les avis actifs remontent en tête de l'accueil.
export const active = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "bolo.view");
    const rows = await ctx.db.query("bolos").withIndex("by_active", (q) => q.eq("active", true)).collect();
    const out = [];
    for (const b of rows) {
      out.push({
        _id: b._id,
        kind: b.kind,
        title: b.title,
        description: b.description ?? null,
        imageUrl: b.imageUrl ?? null,
        citizenId: b.citizenId ?? null,
        danger: b.danger === true,
        at: b.at,
        author: (await agentLabel(ctx, b.createdBy)).name,
      });
    }
    // Les avis « dangereux » d'abord, puis les plus récents.
    out.sort((a, b) => (a.danger === b.danger ? b.at - a.at : a.danger ? -1 : 1));
    return out;
  },
});

export const create = mutation({
  args: {
    kind: v.union(v.literal("PERSONNE"), v.literal("VEHICULE")),
    title: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    citizenId: v.optional(v.id("citizens")),
    vehicleId: v.optional(v.id("vehicles")),
    danger: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "bolo.manage");
    const title = a.title.trim();
    if (!title) throw new Error("Intitulé requis.");
    const id = await ctx.db.insert("bolos", {
      ...a, title, active: true, createdBy: agent._id, at: Date.now(),
    });
    await writeAudit(ctx, agent, { action: "bolo.create", resourceType: "bolo", resourceId: id, resourceLabel: title });
    await notify(ctx, "bolo.create", {
      title: `Avis de recherche · ${a.kind === "PERSONNE" ? "personne" : "véhicule"}`,
      description: `**${title}**${a.description ? `
${a.description}` : ""}`,
      color: a.danger ? NOTIFY_COLOR.danger : NOTIFY_COLOR.warning,
      imageUrl: a.imageUrl,
      fields: a.danger ? [{ name: "Consigne", value: "Armé et dangereux - approche prudente" }] : undefined,
      url: a.citizenId ? await deepLink(ctx, `/citoyen/${a.citizenId}`) : undefined,
      footer: `Émis par ${agent.prenomRP} ${agent.nomRP}`,
    });
    return id;
  },
});

export const close = mutation({
  args: { id: v.id("bolos") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "bolo.manage");
    const b = await ctx.db.get(id);
    if (!b || !b.active) return;
    await ctx.db.patch(id, { active: false, closedAt: Date.now(), closedBy: agent._id });
    await writeAudit(ctx, agent, { action: "bolo.close", resourceType: "bolo", resourceId: id, resourceLabel: b.title });
    await notify(ctx, "bolo.close", {
      title: "Avis de recherche levé",
      description: `**${b.title}**`,
      color: NOTIFY_COLOR.muted,
      footer: `Clos par ${agent.prenomRP} ${agent.nomRP}`,
    });
  },
});
