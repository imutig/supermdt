import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission, can } from "./rbac";
import { writeAudit } from "./lib/audit";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";

// Section Saisies (item 10).
export const list = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "saisies.view");
    const rows = await ctx.db.query("saisies").withIndex("by_at").order("desc").collect();
    return rows.map((s) => ({
      _id: s._id,
      at: s.at,
      agentId: s.agentId,
      matricule: s.matricule ?? null,
      agentName: s.agentName,
      enquete: s.enquete ?? null,
      quantity: s.quantity,
      objectLabel: s.objectType === "Autre" ? `Autre : ${s.otherLabel ?? ""}`.trim() : s.objectType,
    }));
  },
});

// Types d'objets configurables + "Autre" immuable (toujours proposé).
export const objectTypes = query({
  args: {},
  handler: async (ctx) => {
    await requireAgent(ctx);
    const types = (await ctx.db.query("saisieObjectTypes").collect())
      .filter((t) => t.active)
      .sort((a, b) => a.position - b.position)
      .map((t) => t.name);
    return [...types, "Autre"];
  },
});

export const create = mutation({
  args: {
    objectType: v.string(),
    otherLabel: v.optional(v.string()),
    quantity: v.number(),
    enquete: v.optional(v.string()),
  },
  handler: async (ctx, { objectType, otherLabel, quantity, enquete }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "saisies.create");
    if (objectType === "Autre" && !(otherLabel ?? "").trim())
      throw new Error("Précisez l'objet saisi.");
    const id = await ctx.db.insert("saisies", {
      at: Date.now(),
      agentId: agent._id,
      matricule: agent.matricule,
      agentName: `${agent.prenomRP} ${agent.nomRP}`,
      enquete: (enquete ?? "").trim() || undefined,
      quantity: Math.max(0, Math.round(quantity)),
      objectType,
      otherLabel: objectType === "Autre" ? (otherLabel ?? "").trim() : undefined,
    });
    await writeAudit(ctx, agent, { action: "saisie.create", resourceType: "saisie", resourceId: id, resourceLabel: objectType });
    await notify(ctx, "saisie.create", {
      title: "Saisie enregistrée",
      description: `**${objectType === "Autre" ? (otherLabel ?? "").trim() : objectType}** x${Math.max(0, Math.round(quantity))}`,
      color: NOTIFY_COLOR.warning,
      fields: enquete?.trim() ? [{ name: "Enquête", value: enquete.trim() }] : undefined,
      url: await deepLink(ctx, "/saisies"),
      footer: `Saisi par ${agent.prenomRP} ${agent.nomRP}`,
    });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("saisies") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    const s = await ctx.db.get(id);
    if (!s) return;
    // Le créateur peut supprimer sa propre saisie ; sinon il faut la permission dédiée.
    if (s.agentId !== agent._id && !(await can(ctx, agent, "saisies.delete")))
      throw new Error("Suppression non autorisée.");
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, { action: "saisie.delete", resourceType: "saisie", resourceId: id });
  },
});
