import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAgent, requirePermission, can } from "./rbac";
import { writeAudit } from "./lib/audit";
import { parisParts, parisWallToEpoch } from "./lib/paris";

// ============================================================================
// COMPTABILITÉ / SALAIRES. Paie hebdomadaire (lundi 00:00 -> dimanche 23:59:59,
// heure de Paris) calculée depuis les HEURES DE SERVICE IN-GAME. Taux HORAIRE par
// grade + salaire max global, définis par des barèmes DATÉS (timeline : chaque
// barème s'applique à partir d'une semaine, jusqu'au suivant). Primes hebdo
// individuelles/globales en supplément. Montant figé au paiement.
// ============================================================================

const DAY = 86_400_000;
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// ---------- Bornes de semaine (lundi 00:00 -> dimanche 23:59:59.999, Paris) ----------
function weekStartOf(ts: number): number {
  const p = parisParts(ts);
  const dow = (new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay() + 6) % 7; // lundi = 0
  return parisWallToEpoch(p.y, p.mo, p.d - dow, 0, 0);
}
function weekEndOf(start: number): number {
  const p = parisParts(start);
  return parisWallToEpoch(p.y, p.mo, p.d + 6, 23, 59) + 59_999;
}
function isoWeek(ts: number): { week: number; year: number } {
  const p = parisParts(ts);
  const d = new Date(Date.UTC(p.y, p.mo - 1, p.d));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = Date.UTC(d.getUTCFullYear(), 0, 4);
  const week = 1 + Math.round(((d.getTime() - firstThu) / 86_400_000 - 3 + ((new Date(firstThu).getUTCDay() + 6) % 7)) / 7);
  return { week, year: d.getUTCFullYear() };
}
function frDate(ts: number): string {
  const p = parisParts(ts);
  return `${p.d} ${MOIS[p.mo - 1]} ${p.y}`;
}
function weekMeta(offset: number) {
  const ref = Date.now() + offset * 7 * DAY;
  const start = weekStartOf(ref);
  const end = weekEndOf(start);
  const { week, year } = isoWeek(start);
  return { start, end, weekLabel: `Semaine ${week} · ${year}`, periodLabel: `${frDate(start)} – ${frDate(end)}`, isCurrent: offset === 0 };
}

// ---------- Barème actif pour une semaine (timeline) ----------
// Le barème retenu = celui dont `effectiveFromWeek` est le plus grand tout en
// restant <= à la semaine visée (absent = depuis toujours).
async function scaleForWeek(ctx: QueryCtx, weekStart: number): Promise<Doc<"payScales"> | null> {
  const all = await ctx.db.query("payScales").collect();
  const eligible = all
    .filter((s) => (s.effectiveFromWeek ?? 0) <= weekStart)
    .sort((a, b) => (b.effectiveFromWeek ?? 0) - (a.effectiveFromWeek ?? 0));
  return eligible[0] ?? null;
}
function rateFor(scale: Doc<"payScales"> | null, gradeId: Id<"grades"> | undefined): number {
  if (!scale || !gradeId) return 0;
  return scale.rates.find((r) => r.gradeId === gradeId)?.hourlyRate ?? 0;
}

// Secondes de service in-game par agent sur [from, to] (chevauchement clampé aux
// bornes de la semaine). Lecture bornée via l'index by_started (+ marge de 2 j
// pour capter un service à cheval sur le lundi).
async function secondsByAgent(ctx: QueryCtx, from: number, to: number): Promise<Map<string, number>> {
  const rows = await ctx.db
    .query("inGameServices")
    .withIndex("by_started", (q) => q.gte("startedAt", from - 2 * DAY).lte("startedAt", to))
    .collect();
  const out = new Map<string, number>();
  for (const s of rows) {
    if (!s.agentId) continue;
    const a = Math.max(s.startedAt, from), b = Math.min(s.endedAt, to);
    if (b <= a) continue;
    out.set(s.agentId as string, (out.get(s.agentId as string) ?? 0) + Math.floor((b - a) / 1000));
  }
  return out;
}

// Base horaire d'un agent : heures × taux, plafonnée au salaire max (les primes
// s'ajoutent AU-DESSUS du plafond).
function computeBase(seconds: number, rate: number, maxSalary: number | undefined) {
  const hours = seconds / 3600;
  const gross = Math.round(hours * rate);
  const base = maxSalary != null ? Math.min(gross, maxSalary) : gross;
  const maxed = maxSalary != null && gross >= maxSalary;
  return { hours, gross, base, maxed };
}

async function assertView(ctx: QueryCtx) {
  const agent = await requireAgent(ctx);
  await requirePermission(ctx, agent, "comptabilite.view");
  return agent;
}
async function assertManage(ctx: MutationCtx) {
  const agent = await requireAgent(ctx);
  await requirePermission(ctx, agent, "comptabilite.manage");
  return agent;
}

// ---------- Vue paie d'une semaine (page Salaires) ----------
export const overview = query({
  args: { offset: v.optional(v.number()) },
  handler: async (ctx, { offset }) => {
    const viewer = await assertView(ctx);
    const canManage = await can(ctx, viewer, "comptabilite.manage");
    const meta = weekMeta(offset ?? 0);
    const scale = await scaleForWeek(ctx, meta.start);

    const grades = new Map((await ctx.db.query("grades").collect()).map((g) => [g._id as string, g]));
    const seconds = await secondsByAgent(ctx, meta.start, meta.end);

    const bonusRows = (await ctx.db.query("salaryBonuses").withIndex("by_week", (q) => q.eq("weekStart", meta.start)).collect()).filter((b) => !b.deletedAt);
    const globalBonusTotal = bonusRows.filter((b) => !b.agentId).reduce((s, b) => s + b.amount, 0);
    const indivByAgent = new Map<string, number>();
    for (const b of bonusRows) if (b.agentId) indivByAgent.set(b.agentId as string, (indivByAgent.get(b.agentId as string) ?? 0) + b.amount);

    const payments = new Map(
      (await ctx.db.query("salaryPayments").withIndex("by_week", (q) => q.eq("weekStart", meta.start)).collect())
        .map((p) => [p.agentId as string, p]),
    );

    const agents = (await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "ACTIVE")).collect())
      .filter((a) => !a.isOwner);

    let totalDue = 0, totalPaid = 0, paidCount = 0;
    const rows = agents.map((a) => {
      const sec = seconds.get(a._id as string) ?? 0;
      const rate = rateFor(scale, a.gradeId);
      const { hours, gross, base, maxed } = computeBase(sec, rate, scale?.maxSalary);
      const indiv = indivByAgent.get(a._id as string) ?? 0;
      const total = base + indiv + globalBonusTotal;
      const pay = payments.get(a._id as string);
      const paid = !!pay;
      const amount = paid ? pay!.amount : total;
      totalDue += amount;
      if (paid) { totalPaid += pay!.amount; paidCount++; }
      const g = a.gradeId ? grades.get(a.gradeId as string) : null;
      return {
        agentId: a._id,
        name: `${a.prenomRP} ${a.nomRP}`,
        matricule: a.matricule ?? null,
        avatarUrl: a.avatarUrl ?? null,
        iban: a.iban ?? null,
        gradeName: g?.name ?? "Sans grade",
        gradePosition: g?.position ?? -1,
        seconds: sec,
        hours,
        rate,
        gross,
        base,
        maxed,
        individualBonus: indiv,
        globalBonus: globalBonusTotal,
        total,
        paid,
        paidAmount: paid ? pay!.amount : null,
        paidAt: paid ? pay!.paidAt : null,
      };
    });

    return {
      week: meta,
      canManage,
      scale: scale
        ? {
            hasScale: true as const,
            maxSalary: scale.maxSalary ?? null,
            effectiveFromWeek: scale.effectiveFromWeek ?? null,
            effectiveLabel: scale.effectiveFromWeek ? `depuis la ${labelForWeek(scale.effectiveFromWeek)}` : "depuis toujours",
          }
        : { hasScale: false as const, maxSalary: null, effectiveFromWeek: null, effectiveLabel: "aucun barème défini" },
      rows,
      bonuses: bonusRows
        .map((b) => ({
          _id: b._id,
          agentId: b.agentId ?? null,
          agentName: b.agentId ? (rows.find((r) => r.agentId === b.agentId)?.name ?? null) : null,
          scope: b.agentId ? ("INDIVIDUAL" as const) : ("GLOBAL" as const),
          amount: b.amount,
          motif: b.motif,
          createdAt: b.createdAt,
        }))
        .sort((a, b) => b.createdAt - a.createdAt),
      totals: {
        agents: rows.length,
        totalDue,
        totalPaid,
        paidCount,
        unpaidCount: rows.length - paidCount,
        globalBonusTotal,
      },
    };
  },
});

function labelForWeek(weekStart: number): string {
  const { week, year } = isoWeek(weekStart);
  return `semaine ${week} · ${year}`;
}

// ---------- Configuration des barèmes ----------
export const config = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "comptabilite.manage");
    const grades = (await ctx.db.query("grades").withIndex("by_position").collect())
      .filter((g) => !g.academyOnly && !g.external)
      .map((g) => ({ _id: g._id, name: g.name, position: g.position }));
    const scales = (await ctx.db.query("payScales").collect())
      .sort((a, b) => (b.effectiveFromWeek ?? 0) - (a.effectiveFromWeek ?? 0))
      .map((s) => ({
        _id: s._id,
        effectiveFromWeek: s.effectiveFromWeek ?? null,
        effectiveLabel: s.effectiveFromWeek ? labelForWeek(s.effectiveFromWeek) : "depuis toujours",
        maxSalary: s.maxSalary ?? null,
        rates: s.rates.map((r) => ({ gradeId: r.gradeId, hourlyRate: r.hourlyRate })),
        updatedAt: s.updatedAt,
      }));
    return { grades, scales };
  },
});

export const saveScale = mutation({
  args: {
    id: v.optional(v.id("payScales")),
    // Semaine d'effet : un timestamp quelconque dans la semaine, normalisé au lundi.
    // Absent/null = depuis toujours.
    effectiveFrom: v.optional(v.union(v.number(), v.null())),
    maxSalary: v.optional(v.union(v.number(), v.null())),
    rates: v.array(v.object({ gradeId: v.id("grades"), hourlyRate: v.number() })),
  },
  handler: async (ctx, { id, effectiveFrom, maxSalary, rates }) => {
    const agent = await assertManage(ctx);
    const effectiveFromWeek = effectiveFrom == null ? undefined : weekStartOf(effectiveFrom);
    const clean = rates.filter((r) => r.hourlyRate > 0).map((r) => ({ gradeId: r.gradeId, hourlyRate: Math.max(0, Math.round(r.hourlyRate)) }));
    const patch = {
      effectiveFromWeek,
      maxSalary: maxSalary == null ? undefined : Math.max(0, Math.round(maxSalary)),
      rates: clean,
      updatedBy: agent._id,
      updatedAt: Date.now(),
    };
    if (id) {
      const before = await ctx.db.get(id);
      await ctx.db.patch(id, patch);
      await writeAudit(ctx, agent, { action: "payroll.scale_save", resourceType: "payScale", resourceId: id, before: before ? { maxSalary: before.maxSalary ?? null, rates: before.rates } : null, after: { maxSalary: patch.maxSalary ?? null, rates: clean } });
      return id;
    }
    const newId = await ctx.db.insert("payScales", patch);
    await writeAudit(ctx, agent, { action: "payroll.scale_save", resourceType: "payScale", resourceId: newId, after: { maxSalary: patch.maxSalary ?? null, rates: clean } });
    return newId;
  },
});

export const deleteScale = mutation({
  args: { id: v.id("payScales") },
  handler: async (ctx, { id }) => {
    const agent = await assertManage(ctx);
    const before = await ctx.db.get(id);
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, { action: "payroll.scale_delete", resourceType: "payScale", resourceId: id, before: before ? { maxSalary: before.maxSalary ?? null, rates: before.rates } : null });
  },
});

// ---------- Primes hebdomadaires ----------
export const addBonus = mutation({
  args: { weekStart: v.number(), agentId: v.optional(v.id("agents")), amount: v.number(), motif: v.string() },
  handler: async (ctx, { weekStart, agentId, amount, motif }) => {
    const agent = await assertManage(ctx);
    if (!motif.trim()) throw new ConvexError("Motif de prime obligatoire.");
    if (!Number.isFinite(amount) || amount === 0) throw new ConvexError("Montant de prime invalide.");
    const target = agentId ? await ctx.db.get(agentId) : null;
    const bonusId = await ctx.db.insert("salaryBonuses", {
      weekStart: weekStartOf(weekStart),
      agentId,
      amount: Math.round(amount),
      motif: motif.trim().slice(0, 200),
      createdBy: agent._id,
      createdAt: Date.now(),
    });
    await writeAudit(ctx, agent, { action: "payroll.bonus_add", resourceType: "salaryBonus", resourceId: bonusId, resourceLabel: target ? `${target.prenomRP} ${target.nomRP}` : "Prime globale", after: { amount: Math.round(amount), motif: motif.trim().slice(0, 200) } });
  },
});

export const deleteBonus = mutation({
  args: { id: v.id("salaryBonuses") },
  handler: async (ctx, { id }) => {
    const agent = await assertManage(ctx);
    const before = await ctx.db.get(id);
    if (before?.deletedAt) return;
    await ctx.db.patch(id, { deletedAt: Date.now(), deletedBy: agent._id });
    await writeAudit(ctx, agent, { action: "payroll.bonus_delete", resourceType: "salaryBonus", resourceId: id, before: before ? { amount: before.amount, motif: before.motif } : null });
  },
});

// ---------- Paiement (figé au montant courant) ----------
// Calcule le montant courant d'un agent pour une semaine (base + primes).
async function currentAmount(ctx: QueryCtx, agentId: Id<"agents">, weekStart: number, weekEnd: number): Promise<number> {
  const agent = await ctx.db.get(agentId);
  if (!agent) return 0;
  const scale = await scaleForWeek(ctx, weekStart);
  const seconds = (await secondsByAgent(ctx, weekStart, weekEnd)).get(agentId as string) ?? 0;
  const { base } = computeBase(seconds, rateFor(scale, agent.gradeId), scale?.maxSalary);
  const bonuses = (await ctx.db.query("salaryBonuses").withIndex("by_week", (q) => q.eq("weekStart", weekStart)).collect()).filter((b) => !b.deletedAt);
  const indiv = bonuses.filter((b) => b.agentId === agentId).reduce((s, b) => s + b.amount, 0);
  const global = bonuses.filter((b) => !b.agentId).reduce((s, b) => s + b.amount, 0);
  return base + indiv + global;
}

export const setPaid = mutation({
  args: { agentId: v.id("agents"), weekStart: v.number(), paid: v.boolean() },
  handler: async (ctx, { agentId, weekStart, paid }) => {
    const manager = await assertManage(ctx);
    const start = weekStartOf(weekStart);
    const existing = await ctx.db
      .query("salaryPayments")
      .withIndex("by_agent_week", (q) => q.eq("agentId", agentId).eq("weekStart", start))
      .unique();
    const target = await ctx.db.get(agentId);
    const label = target ? `${target.prenomRP} ${target.nomRP}` : undefined;
    if (paid) {
      if (existing) return;
      const amount = await currentAmount(ctx, agentId, start, weekEndOf(start));
      await ctx.db.insert("salaryPayments", { agentId, weekStart: start, amount, paidAt: Date.now(), paidBy: manager._id });
      await writeAudit(ctx, manager, { action: "payroll.set_paid", resourceType: "salaryPayment", resourceId: agentId, resourceLabel: label, before: { paid: false }, after: { paid: true, amount, weekStart: start } });
    } else if (existing) {
      await ctx.db.delete(existing._id);
      await writeAudit(ctx, manager, { action: "payroll.set_paid", resourceType: "salaryPayment", resourceId: agentId, resourceLabel: label, before: { paid: true, amount: existing.amount, weekStart: start }, after: { paid: false } });
    }
  },
});

// Marque payés TOUS les agents actifs non encore payés dont le salaire > 0.
export const payAll = mutation({
  args: { weekStart: v.number() },
  handler: async (ctx, { weekStart }) => {
    const manager = await assertManage(ctx);
    const start = weekStartOf(weekStart), end = weekEndOf(start);
    const scale = await scaleForWeek(ctx, start);
    const seconds = await secondsByAgent(ctx, start, end);
    const bonuses = (await ctx.db.query("salaryBonuses").withIndex("by_week", (q) => q.eq("weekStart", start)).collect()).filter((b) => !b.deletedAt);
    const globalBonus = bonuses.filter((b) => !b.agentId).reduce((s, b) => s + b.amount, 0);
    const indivByAgent = new Map<string, number>();
    for (const b of bonuses) if (b.agentId) indivByAgent.set(b.agentId as string, (indivByAgent.get(b.agentId as string) ?? 0) + b.amount);
    const paidSet = new Set(
      (await ctx.db.query("salaryPayments").withIndex("by_week", (q) => q.eq("weekStart", start)).collect()).map((p) => p.agentId as string),
    );
    const agents = (await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "ACTIVE")).collect()).filter((a) => !a.isOwner);
    let n = 0;
    for (const a of agents) {
      if (paidSet.has(a._id as string)) continue;
      const { base } = computeBase(seconds.get(a._id as string) ?? 0, rateFor(scale, a.gradeId), scale?.maxSalary);
      const amount = base + (indivByAgent.get(a._id as string) ?? 0) + globalBonus;
      if (amount <= 0) continue;
      await ctx.db.insert("salaryPayments", { agentId: a._id, weekStart: start, amount, paidAt: Date.now(), paidBy: manager._id });
      n++;
    }
    await writeAudit(ctx, manager, { action: "payroll.pay_all", resourceType: "salaryPayment", metadata: { weekStart: start, agentsPaid: n } });
    return { paid: n };
  },
});

// ---------- Mon salaire (accueil + profil), semaine en cours ----------
export const mySalary = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    const meta = weekMeta(0);
    const scale = await scaleForWeek(ctx, meta.start);
    const seconds = (await secondsByAgent(ctx, meta.start, meta.end)).get(agent._id as string) ?? 0;
    const rate = rateFor(scale, agent.gradeId);
    const { hours, gross, base, maxed } = computeBase(seconds, rate, scale?.maxSalary);
    const bonuses = (await ctx.db.query("salaryBonuses").withIndex("by_week", (q) => q.eq("weekStart", meta.start)).collect()).filter((b) => !b.deletedAt);
    const indiv = bonuses.filter((b) => b.agentId === agent._id).reduce((s, b) => s + b.amount, 0);
    const global = bonuses.filter((b) => !b.agentId).reduce((s, b) => s + b.amount, 0);
    const pay = await ctx.db
      .query("salaryPayments")
      .withIndex("by_agent_week", (q) => q.eq("agentId", agent._id).eq("weekStart", meta.start))
      .unique();
    const total = base + indiv + global;
    return {
      weekLabel: meta.weekLabel,
      periodLabel: meta.periodLabel,
      seconds,
      hours,
      rate,
      gross,
      base,
      maxSalary: scale?.maxSalary ?? null,
      maxed,
      bonus: indiv + global,
      total,
      hasScale: !!scale,
      paid: !!pay,
      paidAmount: pay?.amount ?? null,
    };
  },
});
