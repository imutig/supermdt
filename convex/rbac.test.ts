import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import schema from "./schema";
import { can, assertOutranks, requireOwnOrPermission } from "./rbac";
import type { Id } from "./_generated/dataModel";

// convex-test charge les modules du backend via un glob explicite (l'auto-glob
// interne n'est pas disponible sous edge-runtime). On exclut les fichiers .test.
const modules = import.meta.glob("./**/!(*.*.*)*.*s");

// Harnais minimal : insère users/grades/permissions/agents et exerce les
// helpers RBAC directement (ils prennent l'agent en argument, pas d'auth mock).
async function seedAgent(
  ctx: any,
  opts: { status?: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING"; isOwner?: boolean; gradeId?: Id<"grades">; matricule?: number },
) {
  const userId = await ctx.db.insert("users", {});
  return await ctx.db.insert("agents", {
    userId,
    login: "test.agent",
    nomRP: "Agent",
    prenomRP: "Test",
    matricule: opts.matricule,
    gradeId: opts.gradeId,
    status: opts.status ?? "ACTIVE",
    isOwner: opts.isOwner ?? false,
  });
}

describe("can()", () => {
  it("le propriétaire court-circuite toute permission", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const id = await seedAgent(ctx, { isOwner: true });
      const owner = (await ctx.db.get(id))!;
      expect(await can(ctx, owner, "n_importe_quoi.inexistant")).toBe(true);
    });
  });

  it("refuse un agent non ACTIVE même bien gradé", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const gradeId = await ctx.db.insert("grades", { name: "Cap", corps: "ETAT_MAJOR", position: 1 });
      const permId = await ctx.db.insert("permissions", { slug: "casier.view", domain: "casier", description: "" });
      await ctx.db.insert("gradePermissions", { gradeId, permissionId: permId });
      const id = await seedAgent(ctx, { status: "SUSPENDED", gradeId });
      const agent = (await ctx.db.get(id))!;
      expect(await can(ctx, agent, "casier.view")).toBe(false);
    });
  });

  it("refuse quand le grade ne porte pas la permission", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const gradeId = await ctx.db.insert("grades", { name: "Off", corps: "OPERATIONNEL", position: 5 });
      await ctx.db.insert("permissions", { slug: "casier.view", domain: "casier", description: "" });
      const id = await seedAgent(ctx, { gradeId });
      const agent = (await ctx.db.get(id))!;
      expect(await can(ctx, agent, "casier.view")).toBe(false);
    });
  });

  it("autorise quand la permission est rattachée au grade", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const gradeId = await ctx.db.insert("grades", { name: "Off", corps: "OPERATIONNEL", position: 5 });
      const permId = await ctx.db.insert("permissions", { slug: "casier.view", domain: "casier", description: "" });
      await ctx.db.insert("gradePermissions", { gradeId, permissionId: permId });
      const id = await seedAgent(ctx, { gradeId });
      const agent = (await ctx.db.get(id))!;
      expect(await can(ctx, agent, "casier.view")).toBe(true);
      expect(await can(ctx, agent, "casier.edit")).toBe(false); // slug inconnu
    });
  });
});

describe("assertOutranks()", () => {
  async function pair(ctx: any, actorPos: number, targetPos: number, opts: { actorExternal?: boolean } = {}) {
    const actorGrade = await ctx.db.insert("grades", { name: `A${actorPos}`, corps: "ETAT_MAJOR", position: actorPos, external: opts.actorExternal });
    const targetGrade = await ctx.db.insert("grades", { name: `T${targetPos}`, corps: "OPERATIONNEL", position: targetPos });
    const actorId = await seedAgent(ctx, { gradeId: actorGrade });
    const targetId = await seedAgent(ctx, { gradeId: targetGrade });
    return { actor: (await ctx.db.get(actorId))!, target: (await ctx.db.get(targetId))! };
  }

  // Dans ce codebase, assertOutranks exige actor.position > target.position :
  // une position numérique plus haute = autorité plus haute.
  it("un grade supérieur (position plus haute) peut agir sur un inférieur", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const { actor, target } = await pair(ctx, 5, 1);
      await expect(assertOutranks(ctx, actor, target)).resolves.toBeUndefined();
    });
  });

  it("un grade inférieur ne peut pas agir sur un supérieur", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const { actor, target } = await pair(ctx, 1, 5);
      await expect(assertOutranks(ctx, actor, target)).rejects.toBeInstanceOf(ConvexError);
    });
  });

  it("le propriétaire est intouchable", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const actorId = await seedAgent(ctx, { isOwner: true });
      const targetId = await seedAgent(ctx, { isOwner: true });
      const actor = (await ctx.db.get(actorId))!;
      const target = (await ctx.db.get(targetId))!;
      await expect(assertOutranks(ctx, actor, target)).rejects.toBeInstanceOf(ConvexError);
    });
  });

  it("interdit l'action sur soi-même", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const gradeId = await ctx.db.insert("grades", { name: "G", corps: "ETAT_MAJOR", position: 2 });
      const id = await seedAgent(ctx, { gradeId });
      const agent = (await ctx.db.get(id))!;
      await expect(assertOutranks(ctx, agent, agent)).rejects.toBeInstanceOf(ConvexError);
    });
  });

  it("un grade extérieur ne peut pas agir sur l'effectif", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const { actor, target } = await pair(ctx, 1, 5, { actorExternal: true });
      await expect(assertOutranks(ctx, actor, target)).rejects.toBeInstanceOf(ConvexError);
    });
  });
});

describe("requireOwnOrPermission()", () => {
  it("laisse l'auteur agir sur son propre enregistrement sans permission", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const id = await seedAgent(ctx, {});
      const agent = (await ctx.db.get(id))!;
      await expect(requireOwnOrPermission(ctx, agent, agent._id, "casier.annul")).resolves.toBeUndefined();
    });
  });

  it("exige la permission pour agir sur celui d'un autre", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const id = await seedAgent(ctx, {});
      const otherId = await seedAgent(ctx, {});
      const agent = (await ctx.db.get(id))!;
      await expect(requireOwnOrPermission(ctx, agent, otherId, "casier.annul")).rejects.toBeInstanceOf(ConvexError);
    });
  });
});
