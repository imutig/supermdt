import { v, ConvexError } from "convex/values";
import { query, mutation, internalQuery, internalMutation, action } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAgent, requirePermission } from "./rbac";
import { parisParts, parisWallToEpoch } from "./lib/paris";

// Rapport hebdomadaire d'activité (à l'attention du Gouvernement RP). Les données
// chiffrées sont agrégées à la volée sur la période ; les sections rédigées à la
// main et les agents à l'honneur sont stockés dans weeklyReports. La génération
// du PDF (service LaTeX externe) est déclenchée manuellement, jamais en auto.

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function frDate(ts: number): string {
  const p = parisParts(ts);
  return `${p.d} ${MOIS[p.mo - 1]} ${p.y}`;
}
function periodLabel(from: number, to: number): string {
  const a = parisParts(from), b = parisParts(to);
  if (a.mo === b.mo && a.y === b.y) return `du ${a.d} au ${b.d} ${MOIS[a.mo - 1]} ${a.y}`;
  if (a.y === b.y) return `du ${a.d} ${MOIS[a.mo - 1]} au ${b.d} ${MOIS[b.mo - 1]} ${a.y}`;
  return `du ${a.d} ${MOIS[a.mo - 1]} ${a.y} au ${b.d} ${MOIS[b.mo - 1]} ${b.y}`;
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
function fmtHours(sec: number): string {
  return `${Math.floor(sec / 3600)} h ${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}`;
}
function dayKey(ts: number): string {
  const p = parisParts(ts);
  return `${p.y}-${p.mo}-${p.d}`;
}

async function assertManage(ctx: QueryCtx) {
  const agent = await requireAgent(ctx);
  await requirePermission(ctx, agent, "rapportgouv.manage");
  return agent;
}

// ---------- Agrégation des données de la semaine ----------
export type AutoData = Awaited<ReturnType<typeof aggregate>>;

async function aggregate(ctx: QueryCtx, from: number, to: number) {
  const inRange = (t: number | undefined | null) => typeof t === "number" && t >= from && t <= to;

  // Casiers (arrestations) non annulés.
  const casiers = (await ctx.db.query("casierEntries").collect())
    .filter((e) => inRange(e.at) && e.status !== "ANNULEE" && !e.deletedAt);
  const dossiers = casiers.filter((e) => e.arrestType === "DOSSIER").length;
  const rapports = casiers.length - dossiers;

  // Top infractions (charges des casiers de la période).
  const infr = new Map<string, number>();
  for (const e of casiers) {
    const charges = await ctx.db.query("casierCharges").withIndex("by_entry", (q) => q.eq("entryId", e._id)).collect();
    for (const c of charges) {
      const name = (c.snapshot as { name?: string } | undefined)?.name;
      if (name) infr.set(name, (infr.get(name) ?? 0) + 1);
    }
  }
  const topInfractions = [...infr.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);

  // Agents à l'honneur (pré-remplissage) : plus d'arrestations sur la période.
  const byOfficer = new Map<string, number>();
  for (const e of casiers) for (const id of e.officerIds ?? []) byOfficer.set(id as string, (byOfficer.get(id as string) ?? 0) + 1);
  const topAgents: { name: string; matricule: string; arrestations: number }[] = [];
  for (const [id, n] of [...byOfficer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    const a = await ctx.db.get(id as Id<"agents">);
    if (a) topAgents.push({ name: `${a.prenomRP} ${a.nomRP}`, matricule: a.matricule != null ? `#${String(a.matricule).padStart(5, "0")}` : "", arrestations: n });
  }

  // Contraventions, amendes émises.
  const contraventions = (await ctx.db.query("citations").collect())
    .filter((c) => inRange(c.at) && c.status !== "ANNULEE" && !c.deletedAt).length;
  const amendes = (await ctx.db.query("amendes").collect()).filter((a) => inRange(a._creationTime) && !a.deletedAt);
  const amendesMontant = amendes.reduce((s, a) => s + (a.montant ?? 0), 0);

  // Heures de service (chevauchement des sessions avec la période).
  let serviceSec = 0;
  for (const s of await ctx.db.query("serviceSessions").collect()) {
    const end = s.endedAt ?? to;
    const a = Math.max(s.startedAt, from), b = Math.min(end, to);
    if (b > a) serviceSec += Math.floor((b - a) / 1000);
  }

  // Opérations, patrouilles, appels 911, saisies, sanctions, avis de recherche.
  const operationsRows = (await ctx.db.query("operations").collect()).filter((o) => inRange(o.startedAt));
  const patrouilles = (await ctx.db.query("patrols").collect()).filter((p) => inRange(p.startedAt)).length;
  const appels911 = (await ctx.db.query("calls911").collect()).filter((c) => inRange(c.at) && !c.deletedAt).length;
  const saisies = (await ctx.db.query("saisies").collect()).filter((s) => inRange(s.at) && !s.deletedAt).length;
  const sanctions = (await ctx.db.query("disciplines").collect()).filter((d) => inRange(d.at) && !d.deletedAt).length;
  const bolos = (await ctx.db.query("bolos").collect()).filter((b) => inRange(b.at) && !b.deletedAt).length;

  // Effectif par grade (agents actifs).
  const grades = new Map((await ctx.db.query("grades").collect()).map((g) => [g._id as string, g]));
  const activeAgents = (await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "ACTIVE")).collect())
    .filter((a) => !a.isOwner);
  const gradeCount = new Map<string, number>();
  for (const a of activeAgents) if (a.gradeId) gradeCount.set(a.gradeId as string, (gradeCount.get(a.gradeId as string) ?? 0) + 1);
  const parGrade = [...gradeCount.entries()]
    .map(([gid, count]) => ({ grade: grades.get(gid)?.name ?? "—", position: grades.get(gid)?.position ?? -1, count }))
    .sort((a, b) => b.position - a.position)
    .map(({ grade, count }) => ({ grade, count }));

  // Graphique « activité par jour » : arrestations par jour calendaire.
  const dayBuckets: { key: string; label: string; value: number }[] = [];
  const seen = new Set<string>();
  for (let cursor = from; cursor <= to && dayBuckets.length < 9; cursor += 86_400_000) {
    const key = dayKey(cursor);
    if (seen.has(key)) continue;
    seen.add(key);
    const p = parisParts(cursor);
    dayBuckets.push({ key, label: `${p.d}/${String(p.mo).padStart(2, "0")}`, value: 0 });
  }
  const dayIdx = new Map(dayBuckets.map((d, i) => [d.key, i]));
  for (const e of casiers) {
    const i = dayIdx.get(dayKey(e.at));
    if (i != null) dayBuckets[i].value++;
  }

  return {
    kpis: {
      arrestations: casiers.length,
      contraventions,
      amendesMontant,
      heuresService: fmtHours(serviceSec),
      patrouilles,
      operations: operationsRows.length,
      appels911,
      sanctions,
    },
    chart: dayBuckets.map(({ label, value }) => ({ label, value })),
    crime: { dossiers, rapports, bolos, amendesCount: amendes.length, topInfractions },
    ops: {
      patrouilles,
      appels911,
      saisies,
      operations: operationsRows
        .sort((a, b) => a.startedAt - b.startedAt)
        .map((o) => ({ name: o.name, date: frDate(o.startedAt) })),
    },
    rh: { effectifTotal: activeAgents.length, parGrade },
    topAgents,
  };
}

// Bornes de la semaine (lundi 00:00 -> dimanche 23:59:59.999, heure de Paris).
// offset 0 = semaine en cours, -1 = semaine précédente, etc.
export const weekBounds = query({
  args: { offset: v.optional(v.number()) },
  handler: async (ctx, { offset }) => {
    await assertManage(ctx);
    const ref = Date.now() + (offset ?? 0) * 7 * 86_400_000;
    const p = parisParts(ref);
    const dow = (new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay() + 6) % 7; // lundi = 0
    const from = parisWallToEpoch(p.y, p.mo, p.d - dow, 0, 0);
    const to = parisWallToEpoch(p.y, p.mo, p.d - dow + 6, 23, 59) + 59_999;
    const { week, year } = isoWeek(from);
    return { from, to, periodLabel: periodLabel(from, to), weekLabel: `Semaine ${week} · ${year}`, isCurrent: (offset ?? 0) === 0 };
  },
});

// ---------- Vue d'ensemble (UI) ----------
export const overview = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }) => {
    await assertManage(ctx);
    const doc = await ctx.db.query("weeklyReports").withIndex("by_weekStart", (q) => q.eq("weekStart", from)).first();
    const data = await aggregate(ctx, from, to);
    const { week, year } = isoWeek(from);
    return {
      meta: { periodLabel: periodLabel(from, to), weekLabel: `Semaine ${week} · ${year}` },
      data,
      sections: {
        motChef: doc?.motChef ?? "",
        analyseCrime: doc?.analyseCrime ?? "",
        operationsNotables: doc?.operationsNotables ?? "",
        pointRH: doc?.pointRH ?? "",
        objectifs: doc?.objectifs ?? "",
        dataNote: doc?.dataNote ?? "",
      },
      honneur: doc?.honneur ?? null, // null = non curaté -> l'UI propose le pré-remplissage
      generatedAt: doc?.generatedAt ?? null,
      pdfUrl: doc?.pdfStorageId ? await ctx.storage.getUrl(doc.pdfStorageId) : null,
    };
  },
});

export const saveSections = mutation({
  args: {
    weekStart: v.number(),
    weekEnd: v.number(),
    motChef: v.optional(v.string()),
    analyseCrime: v.optional(v.string()),
    operationsNotables: v.optional(v.string()),
    pointRH: v.optional(v.string()),
    objectifs: v.optional(v.string()),
    dataNote: v.optional(v.string()),
    honneur: v.optional(v.array(v.object({ name: v.string(), matricule: v.optional(v.string()), reason: v.optional(v.string()) }))),
  },
  handler: async (ctx, a) => {
    const agent = await assertManage(ctx);
    const doc = await ctx.db.query("weeklyReports").withIndex("by_weekStart", (q) => q.eq("weekStart", a.weekStart)).first();
    const patch = {
      weekEnd: a.weekEnd,
      motChef: a.motChef, analyseCrime: a.analyseCrime, operationsNotables: a.operationsNotables,
      pointRH: a.pointRH, objectifs: a.objectifs, dataNote: a.dataNote,
      ...(a.honneur !== undefined ? { honneur: a.honneur } : {}),
      updatedBy: agent._id, updatedAt: Date.now(),
    };
    if (doc) await ctx.db.patch(doc._id, patch);
    else await ctx.db.insert("weeklyReports", { weekStart: a.weekStart, ...patch });
  },
});

// ---------- Assemblage du payload pour le service LaTeX ----------
export const _payload = internalQuery({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }) => {
    await assertManage(ctx);
    const doc = await ctx.db.query("weeklyReports").withIndex("by_weekStart", (q) => q.eq("weekStart", from)).first();
    const data = await aggregate(ctx, from, to);
    const { week, year } = isoWeek(from);
    const honneur = doc?.honneur ?? data.topAgents.map((a) => ({ name: a.name, matricule: a.matricule, reason: `${a.arrestations} arrestation${a.arrestations > 1 ? "s" : ""}` }));
    return {
      meta: {
        periodLabel: periodLabel(from, to),
        weekLabel: `Semaine ${week} · ${year}`,
        generatedLabel: `Généré le ${frDate(Date.now())}`,
        dataNote: doc?.dataNote?.trim() || undefined,
      },
      sections: {
        motChef: doc?.motChef ?? "",
        analyseCrime: doc?.analyseCrime ?? "",
        operationsNotables: doc?.operationsNotables ?? "",
        pointRH: doc?.pointRH ?? "",
        objectifs: doc?.objectifs ?? "",
      },
      kpis: data.kpis,
      chart: data.chart,
      crime: data.crime,
      ops: data.ops,
      rh: data.rh,
      honneur,
    };
  },
});

export const _recordPdf = internalMutation({
  args: { weekStart: v.number(), weekEnd: v.number(), storageId: v.id("_storage") },
  handler: async (ctx, { weekStart, weekEnd, storageId }) => {
    const doc = await ctx.db.query("weeklyReports").withIndex("by_weekStart", (q) => q.eq("weekStart", weekStart)).first();
    const patch = { pdfStorageId: storageId, generatedAt: Date.now(), updatedAt: Date.now() };
    if (doc) {
      if (doc.pdfStorageId) await ctx.storage.delete(doc.pdfStorageId).catch(() => {});
      await ctx.db.patch(doc._id, patch);
    } else {
      await ctx.db.insert("weeklyReports", { weekStart, weekEnd, ...patch });
    }
  },
});

// ---------- Génération du PDF (appel du service LaTeX) ----------
export const generate = action({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }): Promise<{ url: string }> => {
    const base = process.env.REPORT_SERVICE_URL;
    const secret = process.env.REPORT_SECRET;
    if (!base || !secret) throw new ConvexError("Service de rapport non configuré (REPORT_SERVICE_URL / REPORT_SECRET).");
    const payload = await ctx.runQuery(internal.weeklyReport._payload, { from, to });
    const url = (/^https?:\/\//i.test(base) ? base : `https://${base}`).replace(/\/$/, "") + "/compile";
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-report-secret": secret },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new ConvexError(`Échec de génération (${res.status}). ${t.slice(0, 400)}`);
    }
    const blob = new Blob([await res.arrayBuffer()], { type: "application/pdf" });
    const storageId = await ctx.storage.store(blob);
    await ctx.runMutation(internal.weeklyReport._recordPdf, { weekStart: from, weekEnd: to, storageId });
    return { url: (await ctx.storage.getUrl(storageId)) ?? "" };
  },
});
