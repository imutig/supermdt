import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";

// Promotions de la Police Academy : cohortes de cadets, de l'admission à la
// diplomation. Consultation sous lspa.effectif.view ; décisions (rejet,
// diplomation, qui touchent le compte et le badge) sous effectif.validate.

// Grade Cadet (n'ouvre que la LSPA).
async function cadetGrade(ctx: QueryCtx | MutationCtx) {
  const grades = await ctx.db.query("grades").collect();
  return grades.find((g) => g.academyOnly) ?? null;
}

// Grade d'entrée opérationnel (Officier 1) : le plus bas non-académie et non
// extérieur. C'est celui que reçoit un cadet diplômé.
async function entryGrade(ctx: QueryCtx | MutationCtx) {
  const grades = (await ctx.db.query("grades").collect())
    .filter((g) => !g.academyOnly && !g.external)
    .sort((a, b) => a.position - b.position);
  return grades[0] ?? null;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.effectif.view");
    const promos = await ctx.db.query("promotions").collect();
    const counts = new Map<string, { active: number; total: number }>();
    for (const m of await ctx.db.query("promotionMembers").collect()) {
      const c = counts.get(m.promotionId as string) ?? { active: 0, total: 0 };
      c.total += 1;
      if (m.status === "ACTIVE") c.active += 1;
      counts.set(m.promotionId as string, c);
    }
    return promos
      .map((p) => ({
        _id: p._id,
        name: p.name,
        status: p.status,
        startAt: p.startAt,
        endAt: p.endAt ?? null,
        cadets: counts.get(p._id as string)?.active ?? 0,
        total: counts.get(p._id as string)?.total ?? 0,
      }))
      .sort((a, b) => b.startAt - a.startAt);
  },
});

export const get = query({
  args: { promotionId: v.id("promotions") },
  handler: async (ctx, { promotionId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.effectif.view");
    const promo = await ctx.db.get(promotionId);
    if (!promo) return null;

    const members = await ctx.db
      .query("promotionMembers")
      .withIndex("by_promotion", (q) => q.eq("promotionId", promotionId))
      .collect();
    const rows = [];
    for (const m of members) {
      const a = await ctx.db.get(m.agentId);
      if (!a) continue;
      rows.push({
        memberId: m._id,
        agentId: a._id,
        name: `${a.prenomRP} ${a.nomRP}`,
        avatarUrl: a.avatarUrl ?? null,
        status: m.status,
        joinedAt: m.joinedAt,
      });
    }
    // Codes d'invitation rattachés à cette promo.
    const invites = (await ctx.db.query("invitations").collect())
      .filter((i) => i.promotionId === promotionId)
      .map((i) => ({
        _id: i._id, code: i.code, usesCount: i.usesCount, maxUses: i.maxUses,
        revoked: i.revoked, usable: !i.revoked && i.usesCount < i.maxUses && (!i.expiresAt || i.expiresAt > Date.now()),
      }));

    const order = { ACTIVE: 0, GRADUATED: 1, REJECTED: 2 } as const;
    rows.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
    return {
      promo: { _id: promo._id, name: promo.name, status: promo.status, startAt: promo.startAt, endAt: promo.endAt ?? null },
      members: rows,
      invites,
    };
  },
});

export const create = mutation({
  args: { name: v.string(), startAt: v.optional(v.number()) },
  handler: async (ctx, { name, startAt }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "effectif.validate");
    const clean = name.trim();
    if (!clean) throw new Error("Le nom de la promotion est obligatoire.");
    const id = await ctx.db.insert("promotions", {
      name: clean,
      startAt: startAt ?? Date.now(),
      status: "OPEN",
      createdBy: agent._id,
    });
    await writeAudit(ctx, agent, { action: "lspa.promo_create", resourceType: "promotion", resourceId: id, resourceLabel: clean });
    return id;
  },
});

export const close = mutation({
  args: { promotionId: v.id("promotions"), reopen: v.optional(v.boolean()) },
  handler: async (ctx, { promotionId, reopen }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "effectif.validate");
    await ctx.db.patch(promotionId, { status: reopen ? "OPEN" : "CLOSED", endAt: reopen ? undefined : Date.now() });
  },
});

// Ajoute un cadet existant à la promo (ou le réactive s'il en était sorti).
export const addMember = mutation({
  args: { promotionId: v.id("promotions"), agentId: v.id("agents") },
  handler: async (ctx, { promotionId, agentId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "effectif.validate");
    const existing = await ctx.db
      .query("promotionMembers")
      .withIndex("by_promotion_agent", (q) => q.eq("promotionId", promotionId).eq("agentId", agentId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { status: "ACTIVE", decidedAt: Date.now(), decidedBy: agent._id });
      return existing._id;
    }
    return await ctx.db.insert("promotionMembers", {
      promotionId, agentId, status: "ACTIVE", joinedAt: Date.now(),
    });
  },
});

// Rejette (ou réintègre) un cadet. Un cadet rejeté conserve son compte mais perd
// l'accès LSPA tant qu'il n'a aucune appartenance active (voir agents.me).
export const setMemberStatus = mutation({
  args: { memberId: v.id("promotionMembers"), status: v.union(v.literal("ACTIVE"), v.literal("REJECTED")) },
  handler: async (ctx, { memberId, status }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "effectif.validate");
    const m = await ctx.db.get(memberId);
    if (!m) throw new Error("Membre introuvable.");
    if (m.status === "GRADUATED") throw new Error("Ce cadet est déjà diplômé.");
    await ctx.db.patch(memberId, { status, decidedAt: Date.now(), decidedBy: agent._id });
    await writeAudit(ctx, agent, {
      action: status === "REJECTED" ? "lspa.promo_reject" : "lspa.promo_reinstate",
      resourceType: "agent",
      resourceId: m.agentId,
    });
  },
});

// Diplome un cadet : il passe au grade d'entrée (Officier 1) avec un numéro de
// badge, et son appartenance passe GRADUATED.
export const graduate = mutation({
  args: { memberId: v.id("promotionMembers"), matricule: v.number() },
  handler: async (ctx, { memberId, matricule }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "effectif.validate");
    const m = await ctx.db.get(memberId);
    if (!m) throw new Error("Membre introuvable.");
    if (m.status === "GRADUATED") throw new Error("Déjà diplômé.");
    const target = await ctx.db.get(m.agentId);
    if (!target) throw new Error("Cadet introuvable.");

    const grade = await entryGrade(ctx);
    if (!grade) throw new Error("Aucun grade d'entrée (Officier 1) n'est configuré.");
    if (!matricule || matricule < 1 || matricule > 99999) throw new Error("Numéro de badge (5 chiffres) requis.");
    const dup = await ctx.db.query("agents").withIndex("by_matricule", (q) => q.eq("matricule", matricule)).first();
    if (dup) throw new Error("Numéro de badge déjà attribué.");

    await ctx.db.patch(m.agentId, { gradeId: grade._id, matricule, status: "ACTIVE" });
    await ctx.db.patch(memberId, { status: "GRADUATED", decidedAt: Date.now(), decidedBy: actor._id });
    await ctx.db.insert("gradeHistory", {
      agentId: m.agentId,
      fromGradeId: target.gradeId,
      toGradeId: grade._id,
      byAgentId: actor._id,
      at: Date.now(),
      reason: "Diplomation LSPA",
    });
    await writeAudit(ctx, actor, {
      action: "lspa.promo_graduate",
      resourceType: "agent",
      resourceId: m.agentId,
      resourceLabel: `${target.prenomRP} ${target.nomRP}`,
      metadata: { matricule, grade: grade.name },
    });
  },
});

// Cadets encore sans promo active, proposables à l'ajout manuel.
export const assignableCadets = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.effectif.view");
    const cadet = await cadetGrade(ctx);
    if (!cadet) return [];
    const activeAgents = new Set(
      (await ctx.db.query("promotionMembers").collect())
        .filter((m) => m.status === "ACTIVE")
        .map((m) => m.agentId as string),
    );
    return (await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "ACTIVE")).collect())
      .filter((a) => a.gradeId === cadet._id && !activeAgents.has(a._id as string))
      .map((a) => ({ _id: a._id, prenomRP: a.prenomRP, nomRP: a.nomRP, matricule: a.matricule ?? null }));
  },
});

// Statistiques d'une promo : moyenne par catégorie de quiz sur ses cadets, et le
// classement des cadets par moyenne générale.
export const stats = query({
  args: { promotionId: v.id("promotions") },
  handler: async (ctx, { promotionId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.effectif.view");
    const members = await ctx.db
      .query("promotionMembers")
      .withIndex("by_promotion", (q) => q.eq("promotionId", promotionId))
      .collect();
    const categories = await ctx.db.query("quizCategories").withIndex("by_position").collect();
    const catById = new Map(categories.map((c) => [c._id as string, c]));

    const catAgg = new Map<string, { got: number; max: number }>();
    const perCadet = [];
    for (const m of members) {
      if (m.status === "REJECTED") continue;
      const a = await ctx.db.get(m.agentId);
      if (!a) continue;
      let cadetGot = 0, cadetMax = 0, count = 0;
      const parts = await ctx.db.query("quizParticipants").withIndex("by_agent", (q) => q.eq("agentId", m.agentId)).collect();
      for (const p of parts) {
        const s = await ctx.db.get(p.sessionId);
        if (!s || s.status !== "PUBLISHED") continue;
        const quiz = await ctx.db.get(s.quizId);
        const max = (await ctx.db.query("quizQuestions").withIndex("by_quiz", (q) => q.eq("quizId", s.quizId)).collect())
          .reduce((sum, q) => sum + q.points, 0);
        const got = p.autoScore + (p.manualScore ?? 0);
        cadetGot += got; cadetMax += max; count += 1;
        const key = (quiz?.categoryId as string) ?? "__none__";
        const agg = catAgg.get(key) ?? { got: 0, max: 0 };
        agg.got += got; agg.max += max;
        catAgg.set(key, agg);
      }
      perCadet.push({
        agentId: a._id,
        name: `${a.prenomRP} ${a.nomRP}`,
        status: m.status,
        average: cadetMax > 0 ? Math.round((cadetGot / cadetMax) * 100) : null,
        quizzes: count,
      });
    }
    perCadet.sort((a, b) => (b.average ?? -1) - (a.average ?? -1));

    const byCategory = [...catAgg.entries()].map(([key, agg]) => {
      const cat = key === "__none__" ? null : catById.get(key);
      return {
        name: cat?.name ?? "Sans catégorie",
        color: cat?.color ?? null,
        average: agg.max > 0 ? Math.round((agg.got / agg.max) * 100) : 0,
      };
    });

    return { byCategory, perCadet };
  },
});
