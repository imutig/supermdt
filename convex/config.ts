import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";

// Grades + divisions (pour les formulaires d'administration : validation, affectation).
export const options = query({
  args: {},
  handler: async (ctx) => {
    await requireAgent(ctx);
    const grades = await ctx.db.query("grades").withIndex("by_position").collect();
    const divisions = await ctx.db.query("divisions").collect();
    const qualifications = (await ctx.db.query("qualifications").withIndex("by_position").collect()).filter((q) => q.active);
    return {
      grades: grades.map((g) => ({ _id: g._id, name: g.name, position: g.position, corps: g.corps, external: g.external ?? false })),
      divisions: divisions.map((d) => ({ _id: d._id, name: d.name, tier: d.tier })),
      qualifications: qualifications.map((q) => ({ _id: q._id, code: q.code, name: q.name, kind: q.kind, color: q.color ?? null })),
    };
  },
});

// ---- Gestion des grades (dont grades extérieurs, item 8) ----
export const listGradesAdmin = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rbac.manage");
    const grades = await ctx.db.query("grades").withIndex("by_position").collect();
    // Les agents étaient rechargés à chaque itération : un seul chargement,
    // puis comptage en mémoire.
    const holderCount = new Map<string, number>();
    for (const a of await ctx.db.query("agents").collect()) {
      if (a.status !== "ACTIVE" || !a.gradeId) continue;
      holderCount.set(a.gradeId as string, (holderCount.get(a.gradeId as string) ?? 0) + 1);
    }
    const out = [];
    for (const g of grades) {
      const holders = holderCount.get(g._id as string) ?? 0;
      out.push({ _id: g._id, name: g.name, corps: g.corps, position: g.position, color: g.color ?? null, external: g.external ?? false, holders });
    }
    return out;
  },
});

export const createGrade = mutation({
  args: { name: v.string(), corps: v.union(v.literal("OPERATIONNEL"), v.literal("SUPERVISION"), v.literal("ETAT_MAJOR")), external: v.optional(v.boolean()) },
  handler: async (ctx, { name, corps, external }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rbac.manage");
    const all = await ctx.db.query("grades").collect();
    const position = Math.max(0, ...all.map((g) => g.position)) + 1;
    const id = await ctx.db.insert("grades", { name: name.trim(), corps, position, external: !!external });
    await writeAudit(ctx, agent, { action: "grade.create", resourceType: "grade", resourceId: id, resourceLabel: name });
    return id;
  },
});

export const updateGradeMeta = mutation({
  args: { gradeId: v.id("grades"), name: v.optional(v.string()), external: v.optional(v.boolean()), color: v.optional(v.string()) },
  handler: async (ctx, { gradeId, ...patch }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rbac.manage");
    const clean: Record<string, unknown> = {};
    if (patch.name !== undefined) clean.name = patch.name.trim();
    if (patch.external !== undefined) clean.external = patch.external;
    if (patch.color !== undefined) clean.color = patch.color;
    await ctx.db.patch(gradeId, clean);
    await writeAudit(ctx, agent, { action: "grade.update", resourceType: "grade", resourceId: gradeId });
  },
});

export const removeGrade = mutation({
  args: { gradeId: v.id("grades") },
  handler: async (ctx, { gradeId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rbac.manage");
    const holders = (await ctx.db.query("agents").collect()).filter((a) => a.gradeId === gradeId).length;
    if (holders > 0) throw new Error("Grade encore attribué à des agents.");
    for (const gp of await ctx.db.query("gradePermissions").withIndex("by_grade", (q) => q.eq("gradeId", gradeId)).collect()) await ctx.db.delete(gp._id);
    await ctx.db.delete(gradeId);
    await writeAudit(ctx, agent, { action: "grade.delete", resourceType: "grade", resourceId: gradeId });
  },
});

// Matrice permissions x grades (éditeur RBAC).
export const permissionMatrix = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rbac.manage");
    const grades = await ctx.db.query("grades").withIndex("by_position").collect();
    const permissions = await ctx.db.query("permissions").collect();
    const gradePerms = await ctx.db.query("gradePermissions").collect();
    const granted = gradePerms.map((gp) => `${gp.gradeId}:${gp.permissionId}`);
    return {
      grades: grades.map((g) => ({ _id: g._id, name: g.name, corps: g.corps })),
      permissions: permissions
        .map((p) => ({ _id: p._id, slug: p.slug, domain: p.domain, description: p.description }))
        .sort((a, b) => a.slug.localeCompare(b.slug)),
      granted,
    };
  },
});

export const setGradePermission = mutation({
  args: { gradeId: v.id("grades"), permissionId: v.id("permissions"), grant: v.boolean() },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rbac.manage");
    const existing = await ctx.db
      .query("gradePermissions")
      .withIndex("by_grade", (q) => q.eq("gradeId", args.gradeId))
      .filter((q) => q.eq(q.field("permissionId"), args.permissionId))
      .first();
    if (args.grant && !existing) {
      await ctx.db.insert("gradePermissions", { gradeId: args.gradeId, permissionId: args.permissionId });
    }
    if (!args.grant && existing) {
      await ctx.db.delete(existing._id);
    }
    await writeAudit(ctx, agent, {
      action: args.grant ? "permission.grant" : "permission.revoke",
      resourceType: "grade",
      resourceId: args.gradeId,
      metadata: { permissionId: args.permissionId },
    });
  },
});
