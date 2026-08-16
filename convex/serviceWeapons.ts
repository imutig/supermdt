import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAgent, requirePermission, agentLabel, can } from "./rbac";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";

// Armes de service LSPD (voir table `serviceWeapons` dans schema.ts). Chaque
// agent enregistre la/les sienne(s) ; l'encadrement (effectif.view) voit tout.

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function shape(w: {
  _id: import("./_generated/dataModel").Id<"serviceWeapons">;
  serial: string; model: string; photoUrl: string; createdAt: number;
}) {
  return { _id: w._id, serial: w.serial, model: w.model, photoUrl: w.photoUrl, createdAt: w.createdAt };
}

// Mes armes de service (agent courant).
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    return (await ctx.db.query("serviceWeapons").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).collect())
      .filter((w) => !w.deletedAt)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(shape);
  },
});

// Enregistre une arme à son propre nom. Photo (n° de série visible) obligatoire.
export const register = mutation({
  args: { serial: v.string(), model: v.string(), photoUrl: v.string() },
  handler: async (ctx, { serial, model, photoUrl }) => {
    const agent = await requireAgent(ctx);
    const s = serial.trim(), m = model.trim(), p = photoUrl.trim();
    if (!s || !m) throw new ConvexError("Modèle et numéro de série requis.");
    if (!p) throw new ConvexError("Une photo de l'arme avec le numéro de série visible est requise.");
    // Doublon pour CE même agent uniquement (une autre personne peut détenir la
    // même série, ex. arme réattribuée après un licenciement).
    const dup = (await ctx.db.query("serviceWeapons").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).collect())
      .find((w) => !w.deletedAt && norm(w.serial) === norm(s));
    if (dup) throw new ConvexError("Tu as déjà enregistré une arme avec ce numéro de série.");
    const id = await ctx.db.insert("serviceWeapons", {
      agentId: agent._id, serial: s, model: m, photoUrl: p, createdBy: agent._id, createdAt: Date.now(),
    });
    await notify(ctx, "serviceWeapon.register", {
      title: "Arme de service enregistrée",
      description: `**${m}** · ${s}`,
      color: NOTIFY_COLOR.info,
      imageUrl: p,
      url: await deepLink(ctx, "/armes"),
      footer: `${agent.prenomRP} ${agent.nomRP}`,
    });
    return id;
  },
});

// Retire une arme : la sienne, ou celle d'un autre avec effectif.edit.
export const remove = mutation({
  args: { id: v.id("serviceWeapons") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    const w = await ctx.db.get(id);
    if (!w || w.deletedAt) return;
    if (w.agentId !== agent._id) await requirePermission(ctx, agent, "effectif.edit");
    await ctx.db.patch(id, { deletedAt: Date.now() });
    const owner = await agentLabel(ctx, w.agentId);
    await notify(ctx, "serviceWeapon.remove", {
      title: "Arme de service retirée",
      description: `**${w.model}** · ${w.serial}`,
      color: NOTIFY_COLOR.danger,
      fields: [{ name: "Agent", value: owner.name, inline: true }],
      url: await deepLink(ctx, "/armes"),
      footer: `Retirée par ${agent.prenomRP} ${agent.nomRP}`,
    });
  },
});

// Registre complet (encadrement) : toutes les armes de service, recherchable.
export const listAll = query({
  args: { q: v.optional(v.string()) },
  handler: async (ctx, { q }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "effectif.view");
    const term = norm((q ?? "").trim());
    const rows = (await ctx.db.query("serviceWeapons").collect()).filter((w) => !w.deletedAt);
    const out: { _id: string; agentId: string; agentName: string; matricule: number | null; serial: string; model: string; photoUrl: string; createdAt: number }[] = [];
    for (const w of rows) {
      const label = await agentLabel(ctx, w.agentId);
      if (term && !norm(`${w.serial} ${w.model} ${label.name}`).includes(term)) continue;
      out.push({ _id: w._id, agentId: w.agentId, agentName: label.name, matricule: label.matricule, serial: w.serial, model: w.model, photoUrl: w.photoUrl, createdAt: w.createdAt });
    }
    return out.sort((a, b) => a.agentName.localeCompare(b.agentName) || b.createdAt - a.createdAt);
  },
});

// Armes d'un agent donné (fiche Effectif). Réservé à effectif.view (ou soi-même).
export const byAgent = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const agent = await requireAgent(ctx);
    if (agent._id !== agentId && !(await can(ctx, agent, "effectif.view"))) return [];
    return (await ctx.db.query("serviceWeapons").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect())
      .filter((w) => !w.deletedAt)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(shape);
  },
});
