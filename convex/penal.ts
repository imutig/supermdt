import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "codepenal.view");
    return ctx.db.query("penalCategories").withIndex("by_position").collect();
  },
});

// Liste des charges (référentiel + picker du calculateur). Recherche full-text optionnelle.
export const listCharges = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, { search }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "codepenal.view");
    const q = (search ?? "").trim();

    const raw = q
      ? await ctx.db
          .query("penalCharges")
          .withSearchIndex("search", (s) => s.search("name", q))
          .take(80)
      : await ctx.db.query("penalCharges").collect();

    const categories = await ctx.db.query("penalCategories").collect();
    const severities = await ctx.db.query("severityLevels").collect();
    const sanctionTypes = await ctx.db.query("sanctionTypes").collect();
    const catById = new Map(categories.map((c) => [c._id, c]));
    const sevById = new Map(severities.map((s) => [s._id, s]));
    const sancById = new Map(sanctionTypes.map((s) => [s._id, s.name]));

    const mapped = raw
      .filter((c) => c.active)
      .map((c) => ({
        _id: c._id,
        name: c.name,
        categoryName: catById.get(c.categoryId)?.name ?? "",
        categoryPosition: catById.get(c.categoryId)?.position ?? 999,
        sensitive: catById.get(c.categoryId)?.sensitive ?? false,
        severityName: c.severityId ? (sevById.get(c.severityId)?.name ?? null) : null,
        fine: c.fine,
        jailSeconds: c.jailSeconds ?? null,
        dojRequest: c.dojRequest,
        recidiveDays: c.recidiveDays ?? null,
        minParam: c.minParam ?? null,
        maxParam: c.maxParam ?? null,
        sanctions: c.sanctionIds.map((id) => sancById.get(id)).filter((n): n is string => !!n),
      }));

    if (!q) {
      return mapped.sort((a, b) => a.categoryPosition - b.categoryPosition);
    }

    // En recherche : prioriser les correspondances de sous-chaîne (nom contient la requête),
    // du match le plus précoce au plus tardif ; le reste garde l'ordre de pertinence full-text.
    const needle = norm(q);
    return mapped
      .map((c) => ({ c, idx: norm(c.name).indexOf(needle) }))
      .sort((a, b) => {
        const am = a.idx >= 0;
        const bm = b.idx >= 0;
        if (am !== bm) return am ? -1 : 1;
        if (am && bm) return a.idx - b.idx;
        return 0;
      })
      .map((x) => x.c);
  },
});

// ================= Éditeur du code pénal (§15) =================
export const listSeverities = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "codepenal.view");
    return ctx.db.query("severityLevels").withIndex("by_position").collect();
  },
});

// Charge complète pour l'éditeur.
export const getCharge = query({
  args: { id: v.id("penalCharges") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "codepenal.view");
    const c = await ctx.db.get(id);
    if (!c) return null;
    return {
      _id: c._id,
      categoryId: c.categoryId,
      severityId: c.severityId ?? null,
      name: c.name,
      fine: c.fine,
      jailSeconds: c.jailSeconds ?? null,
      recidiveDays: c.recidiveDays ?? null,
      dojRequest: c.dojRequest,
      sanctionIds: c.sanctionIds,
      description: c.description ?? null,
      minParam: c.minParam ?? null,
      maxParam: c.maxParam ?? null,
      active: c.active,
    };
  },
});

export const listSanctions = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "codepenal.view");
    return (await ctx.db.query("sanctionTypes").collect())
      .filter((s) => s.active)
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ _id: s._id, name: s.name }));
  },
});

export const categoryCreate = mutation({
  args: { name: v.string(), sensitive: v.boolean() },
  handler: async (ctx, a) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "codepenal.create");
    const all = await ctx.db.query("penalCategories").collect();
    const position = all.reduce((m, c) => Math.max(m, c.position + 1), 0);
    const id = await ctx.db.insert("penalCategories", { name: a.name, sensitive: a.sensitive, position });
    await writeAudit(ctx, agent, { action: "codepenal.category_create", resourceType: "config", resourceLabel: a.name });
    return id;
  },
});
export const categoryUpdate = mutation({
  args: { id: v.id("penalCategories"), name: v.string(), sensitive: v.boolean() },
  handler: async (ctx, { id, ...f }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "codepenal.edit");
    await ctx.db.patch(id, f);
    await writeAudit(ctx, agent, { action: "codepenal.category_update", resourceType: "config", resourceLabel: f.name });
  },
});
export const categoryRemove = mutation({
  args: { id: v.id("penalCategories") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "codepenal.delete");
    const used = await ctx.db
      .query("penalCharges")
      .withIndex("by_category", (q) => q.eq("categoryId", id))
      .first();
    if (used) throw new Error("Catégorie utilisée par des charges : videz-la d'abord.");
    const c = await ctx.db.get(id);
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, { action: "codepenal.category_remove", resourceType: "config", resourceLabel: c?.name ?? "" });
  },
});

const FINE = v.object({
  kind: v.union(
    v.literal("FIXED"),
    v.literal("FORMULA"),
    v.literal("ON_DECISION"),
    v.literal("PER_UNIT"),
    v.literal("UNSPECIFIED"),
  ),
  amount: v.optional(v.number()),
  unit: v.optional(v.string()),
  formula: v.optional(v.string()),
  raw: v.string(),
});

export const chargeCreate = mutation({
  args: {
    categoryId: v.id("penalCategories"),
    severityId: v.optional(v.id("severityLevels")),
    name: v.string(),
    fine: FINE,
    jailSeconds: v.optional(v.number()),
    recidiveDays: v.optional(v.number()),
    dojRequest: v.boolean(),
    sanctionIds: v.array(v.id("sanctionTypes")),
    description: v.optional(v.string()),
    minParam: v.optional(v.number()),
    maxParam: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "codepenal.create");
    const all = await ctx.db.query("penalCharges").collect();
    const position = all.reduce((m, c) => Math.max(m, c.position + 1), 0);
    const id = await ctx.db.insert("penalCharges", {
      ...a,
      jailOnDecision: false,
      active: true,
      position,
    });
    await writeAudit(ctx, agent, { action: "codepenal.charge_create", resourceType: "config", resourceLabel: a.name });
    return id;
  },
});
export const chargeUpdate = mutation({
  args: {
    id: v.id("penalCharges"),
    categoryId: v.id("penalCategories"),
    severityId: v.optional(v.id("severityLevels")),
    name: v.string(),
    fine: FINE,
    jailSeconds: v.optional(v.number()),
    recidiveDays: v.optional(v.number()),
    dojRequest: v.boolean(),
    sanctionIds: v.array(v.id("sanctionTypes")),
    description: v.optional(v.string()),
    minParam: v.optional(v.number()),
    maxParam: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...f }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "codepenal.edit");
    await ctx.db.patch(id, f);
    await writeAudit(ctx, agent, { action: "codepenal.charge_update", resourceType: "config", resourceLabel: f.name });
  },
});
export const chargeRemove = mutation({
  args: { id: v.id("penalCharges") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "codepenal.delete");
    const c = await ctx.db.get(id);
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, { action: "codepenal.charge_remove", resourceType: "config", resourceLabel: c?.name ?? "" });
  },
});
