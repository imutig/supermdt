import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";
import { touchStats } from "./stats";

const STATUS = v.union(
  v.literal("ACTIVE"),
  v.literal("ENREGISTREE"),
  v.literal("SAISIE"),
  v.literal("DETRUITE"),
);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function shape(ctx: QueryCtx, w: Doc<"weapons">) {
  const owner = w.ownerId ? await ctx.db.get(w.ownerId) : null;
  return {
    _id: w._id,
    typeName: w.typeName ?? "-",
    typeId: w.typeId ?? null,
    modele: w.modele,
    serial: w.serial,
    motif: w.motif ?? null,
    origine: w.origine ?? null,
    status: w.status,
    ownerId: w.ownerId ?? null,
    ownerName: owner ? `${owner.prenom} ${owner.nom}` : null,
    at: w.at,
  };
}

export const list = query({
  args: { q: v.optional(v.string()) },
  handler: async (ctx, { q }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "armes.view");
    const rows =
      q && q.trim()
        ? await ctx.db
            .query("weapons")
            .withSearchIndex("search", (s) => s.search("searchText", norm(q)))
            .take(50)
        : await ctx.db.query("weapons").order("desc").take(100);
    const out = [];
    for (const w of rows) out.push(await shape(ctx, w));
    return out;
  },
});

// Pagination serveur (curseur) pour le registre en mode navigation (sans recherche).
export const page = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "armes.view");
    const res = await ctx.db.query("weapons").order("desc").paginate(paginationOpts);
    const rows = [];
    for (const w of res.page) rows.push(await shape(ctx, w));
    return { ...res, page: rows };
  },
});

export const byOwner = query({
  args: { citizenId: v.id("citizens") },
  handler: async (ctx, { citizenId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "armes.view");
    const rows = await ctx.db
      .query("weapons")
      .withIndex("by_owner", (q) => q.eq("ownerId", citizenId))
      .collect();
    const out = [];
    for (const w of rows) out.push(await shape(ctx, w));
    return out;
  },
});

// Résumé pour les pickers (dossiers d'arrestation / rapports).
export const pickerList = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "armes.view");
    const rows = await ctx.db.query("weapons").order("desc").take(200);
    return rows.map((w) => ({ _id: w._id, label: `${w.typeName ?? ""} ${w.modele} · ${w.serial}`.trim() }));
  },
});

export const create = mutation({
  args: {
    typeId: v.optional(v.id("weaponTypes")),
    modele: v.string(),
    serial: v.string(),
    motif: v.optional(v.string()),
    origine: v.optional(v.string()),
    ownerId: v.optional(v.id("citizens")),
    status: STATUS,
  },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "armes.create");
    const type = args.typeId ? await ctx.db.get(args.typeId) : null;
    const id = await ctx.db.insert("weapons", {
      ...args,
      typeName: type?.name,
      at: Date.now(),
      createdBy: agent._id,
      searchText: norm(`${type?.name ?? ""} ${args.modele} ${args.serial}`),
    });
    await writeAudit(ctx, agent, { action: "weapon.create", resourceType: "weapon", resourceId: id, resourceLabel: `${args.modele} ${args.serial}` });
    await touchStats(ctx);
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("weapons"),
    typeId: v.optional(v.id("weaponTypes")),
    modele: v.string(),
    serial: v.string(),
    motif: v.optional(v.string()),
    origine: v.optional(v.string()),
    ownerId: v.optional(v.id("citizens")),
    status: STATUS,
  },
  handler: async (ctx, { id, ...f }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "armes.edit");
    const type = f.typeId ? await ctx.db.get(f.typeId) : null;
    await ctx.db.patch(id, { ...f, typeName: type?.name, searchText: norm(`${type?.name ?? ""} ${f.modele} ${f.serial}`) });
    await writeAudit(ctx, agent, { action: "weapon.update", resourceType: "weapon", resourceId: id, resourceLabel: `${f.modele} ${f.serial}` });
  },
});

export const remove = mutation({
  args: { id: v.id("weapons") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "armes.delete");
    const w = await ctx.db.get(id);
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, { action: "weapon.delete", resourceType: "weapon", resourceId: id, resourceLabel: w ? `${w.modele} ${w.serial}` : "" });
    await touchStats(ctx);
  },
});
