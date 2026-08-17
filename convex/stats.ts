import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireAgent, requirePermission, agentLabel } from "./rbac";
import { parisParts, parisWallToEpoch } from "./lib/paris";

const DAY = 86_400_000;

// Statistiques de la station (État-Major). Fenêtres bornées pour rester performant.
// Fenêtre de fraîcheur : en deçà, on ne recalcule pas. Le calcul balaie
// plusieurs milliers de documents, le rejouer à chaque écriture le rendait
// proportionnel au trafic ET au nombre de clients abonnés.
const STALE_MS = 5 * 60 * 1000;

// Forme de l'instantané : la table le stocke en v.any(), ce type restitue le
// contrat au client, qui perdrait sinon tout typage. L'instantané ne porte que
// les indicateurs indépendants de la période (compteurs, DEFCON) ; tout ce qui
// dépend d'une plage de dates est calculé à la volée par `rangeStats`.
type TopAgent = { matricule: number | null; name: string; count: number };
export type StatsData = {
  counts: { agentsActive: number; citizensCount: number; vehiclesCount: number; weaponsCount: number; mandatsActive: number };
  defcon: { name: string; color: string | null } | null;
};

// Lecture : un seul document. `null` tant qu'aucun calcul n'a eu lieu.
export const overview = query({
  args: {},
  handler: async (ctx): Promise<(StatsData & { computedAt: number }) | null> => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "stats.view");
    const snap = await ctx.db.query("statsSnapshot").first();
    if (!snap) return null;
    return { ...(snap.data as StatsData), computedAt: snap.computedAt };
  },
});

// Compteurs légers pour l'accueil : lit le même instantané mais SANS exiger
// `stats.view` (l'accueil est visible par tous les agents). Ne renvoie que des
// totaux non sensibles (citoyens / véhicules / armes synchronisés).
export const counts = query({
  args: {},
  handler: async (ctx): Promise<{ citizensCount: number; vehiclesCount: number; weaponsCount: number } | null> => {
    await requireAgent(ctx);
    const snap = await ctx.db.query("statsSnapshot").first();
    if (!snap) return null;
    const c = (snap.data as StatsData).counts;
    return { citizensCount: c.citizensCount, vehiclesCount: c.vehiclesCount, weaponsCount: c.weaponsCount };
  },
});

// Amorce l'instantané pour un agent quelconque (l'accueil l'appelle) : sans ça,
// un agent sans `stats.view` ne verrait jamais les compteurs sur une base neuve.
export const ensureSnapshot = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAgent(ctx);
    await touchStats(ctx);
  },
});

// Demande un recalcul, ignorée si l'instantané est encore frais. Appelée par
// les mutations qui modifient les données agrégées : le coût réel est donc
// borné à un calcul par fenêtre, quel que soit le volume d'écritures.
export async function touchStats(ctx: MutationCtx) {
  const snap = await ctx.db.query("statsSnapshot").first();
  if (snap && Date.now() - snap.computedAt < STALE_MS) return;
  await ctx.scheduler.runAfter(0, internal.stats.recompute, {});
}

// Appelée à l'ouverture de la page. Sans elle, une base neuve n'obtient jamais
// son premier instantané : le recalcul n'était demandé que par les écritures.
export const requestRefresh = mutation({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "stats.view");
    await touchStats(ctx);
  },
});

export const recompute = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // ---- Compteurs globaux (indépendants de la période) ----
    const allAgents = await ctx.db.query("agents").collect();
    const agentsActive = allAgents.filter((a) => a.status === "ACTIVE" && !a.isOwner).length;
    const citizensCount = (await ctx.db.query("citizens").take(5000)).filter((c) => c.status === "ACTIVE").length;
    const vehiclesCount = (await ctx.db.query("vehicles").take(5000)).filter((v) => !v.deletedAt).length;
    const weaponsCount = (await ctx.db.query("weapons").take(5000)).filter((w) => !w.deletedAt).length;

    // ---- DEFCON courant ----
    const levels = await ctx.db.query("defconLevels").withIndex("by_position").collect();
    const def = levels.find((l) => l.isDefault) ?? levels[0] ?? null;
    const lastChange = await ctx.db.query("defconChanges").withIndex("by_at").order("desc").first();
    let currentDefcon = def;
    if (lastChange && !(lastChange.until != null && lastChange.until < now)) {
      currentDefcon = (await ctx.db.get(lastChange.levelId)) ?? def;
    }

    const mandatsActive = (await ctx.db.query("mandats").withIndex("by_status", (q) => q.eq("status", "ACTIF")).collect()).filter((m) => !m.deletedAt).length;

    const data: StatsData = {
      counts: { agentsActive, citizensCount, vehiclesCount, weaponsCount, mandatsActive },
      defcon: currentDefcon ? { name: currentDefcon.name, color: currentDefcon.color ?? null } : null,
    };

    const existing = await ctx.db.query("statsSnapshot").first();
    if (existing) await ctx.db.patch(existing._id, { data, computedAt: now });
    else await ctx.db.insert("statsSnapshot", { data, computedAt: now });
    return "ok";
  },
});

// ===========================================================================
// Statistiques sur une plage libre (calcul à la volée, non mis en cache).
// `from`/`to` en epoch ms ; `from` absent = depuis toujours ; `to` absent = maintenant.
// Le pas du graphique s'adapte à l'étendue (heure / jour / mois).
// ===========================================================================
type Unit = "hour" | "day" | "month";
const pad2 = (n: number) => String(n).padStart(2, "0");
function bucketKey(ts: number, unit: Unit): string {
  const p = parisParts(ts);
  if (unit === "hour") return `${p.y}-${pad2(p.mo)}-${pad2(p.d)}-${pad2(p.h)}`;
  if (unit === "day") return `${p.y}-${pad2(p.mo)}-${pad2(p.d)}`;
  return `${p.y}-${pad2(p.mo)}`;
}
function bucketLabel(key: string, unit: Unit): string {
  const parts = key.split("-");
  if (unit === "hour") return `${parts[3]}h`;
  if (unit === "day") return `${parts[2]}/${parts[1]}`;
  return `${parts[1]}/${parts[0].slice(2)}`;
}
// Toutes les clés (bornes de bucket) de effLo à hi, buckets vides compris.
function gridKeys(effLo: number, hi: number, unit: Unit): Set<string> {
  const keys = new Set<string>();
  if (unit === "month") {
    const s = parisParts(effLo), e = parisParts(hi);
    let y = s.y, m = s.mo;
    while (y < e.y || (y === e.y && m <= e.mo)) { keys.add(`${y}-${pad2(m)}`); m++; if (m > 12) { m = 1; y++; } }
    return keys;
  }
  const step = unit === "hour" ? 3_600_000 : DAY;
  const s = parisParts(effLo);
  const start = unit === "hour" ? parisWallToEpoch(s.y, s.mo, s.d, s.h, 0) : parisWallToEpoch(s.y, s.mo, s.d, 0, 0);
  for (let t = start; t <= hi; t += step) keys.add(bucketKey(t, unit));
  keys.add(bucketKey(hi, unit));
  return keys;
}

export const rangeStats = query({
  args: { from: v.optional(v.number()), to: v.optional(v.number()) },
  handler: async (ctx, { from, to }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "stats.view");
    const now = Date.now();
    const hi = to ?? now;
    const lo = from ?? null;

    const allAgents = await ctx.db.query("agents").collect();
    const ownerId = allAgents.find((a) => a.isOwner)?._id;

    const fetchInRange = async <T extends { at: number; deletedAt?: number; status?: string }>(
      table: "casierEntries" | "citations",
    ): Promise<T[]> => {
      // Index VIVANT [deletedAt, at] : on ne lit que les fiches non archivées de
      // la plage (les archivées ne pèsent plus sur l'I/O de cette query réactive).
      const rows = lo == null
        ? await ctx.db.query(table).withIndex("by_live_at", (q) => q.eq("deletedAt", undefined).lte("at", hi)).collect()
        : await ctx.db.query(table).withIndex("by_live_at", (q) => q.eq("deletedAt", undefined).gte("at", lo).lte("at", hi)).collect();
      return (rows as unknown as T[]).filter((r) => r.status !== "ANNULEE");
    };
    const casiers = await fetchInRange<{ _id: import("./_generated/dataModel").Id<"casierEntries">; at: number; deletedAt?: number; status?: string; officerIds: import("./_generated/dataModel").Id<"agents">[]; createdBy: import("./_generated/dataModel").Id<"agents"> }>("casierEntries");
    const citations = await fetchInRange<{ _id: import("./_generated/dataModel").Id<"citations">; at: number; deletedAt?: number; status?: string; officerId: import("./_generated/dataModel").Id<"agents"> }>("citations");

    // ---- Top agents (owner exclu : fallback des imports non reliés) ----
    const bump = (m: Map<string, number>, id: string) => m.set(id, (m.get(id) ?? 0) + 1);
    const agentTally = new Map<string, number>();
    const casierTally = new Map<string, number>();
    const citationTally = new Map<string, number>();
    for (const e of casiers) {
      const off = e.officerIds[0] ?? e.createdBy;
      if (off && off !== ownerId) { bump(agentTally, off); bump(casierTally, off); }
    }
    for (const c of citations) {
      if (c.officerId !== ownerId) { bump(agentTally, c.officerId); bump(citationTally, c.officerId); }
    }
    const buildTop = async (tally: Map<string, number>) => {
      const raw = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
      const list: TopAgent[] = [];
      for (const [id, count] of raw) {
        const label = await agentLabel(ctx, id as import("./_generated/dataModel").Id<"agents">);
        list.push({ ...label, count });
      }
      return list;
    };

    // ---- Top infractions sur la plage ----
    // Le décompte des charges est un N+1 (une sous-requête par fiche via by_entry /
    // by_citation). Sur une grande plage cela multipliait l'I/O par le nombre de
    // fiches. On PLAFONNE ce widget mineur aux 300 casiers + 300 contraventions les
    // plus récents de la plage (le top infractions reste représentatif).
    const CHARGE_CAP = 300;
    const recentCasiers = casiers.length > CHARGE_CAP ? [...casiers].sort((a, b) => b.at - a.at).slice(0, CHARGE_CAP) : casiers;
    const recentCitations = citations.length > CHARGE_CAP ? [...citations].sort((a, b) => b.at - a.at).slice(0, CHARGE_CAP) : citations;
    const chargeTally = new Map<string, number>();
    for (const e of recentCasiers) {
      for (const ch of await ctx.db.query("casierCharges").withIndex("by_entry", (q) => q.eq("entryId", e._id)).collect()) bump(chargeTally, ch.snapshot.name);
    }
    for (const c of recentCitations) {
      for (const ch of await ctx.db.query("citationCharges").withIndex("by_citation", (q) => q.eq("citationId", c._id)).collect()) bump(chargeTally, ch.snapshot.name);
    }
    const topCharges = [...chargeTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));

    // ---- Série temporelle (pas adaptatif) ----
    let minAt = hi;
    for (const e of casiers) if (e.at < minAt) minAt = e.at;
    for (const c of citations) if (c.at < minAt) minAt = c.at;
    const effLo = lo == null ? (casiers.length || citations.length ? minAt : hi - DAY) : lo;
    const span = Math.max(0, hi - effLo);
    const unit: Unit = span <= 2 * DAY ? "hour" : span <= 92 * DAY ? "day" : "month";
    const counts = new Map<string, { arr: number; cit: number }>();
    const acc = (ts: number, field: "arr" | "cit") => {
      const k = bucketKey(ts, unit);
      const b = counts.get(k) ?? { arr: 0, cit: 0 };
      b[field]++; counts.set(k, b);
    };
    for (const e of casiers) acc(e.at, "arr");
    for (const c of citations) acc(c.at, "cit");
    const allKeys = [...new Set([...gridKeys(effLo, hi, unit), ...counts.keys()])].sort();
    const series = allKeys.map((k) => ({ label: bucketLabel(k, unit), arr: counts.get(k)?.arr ?? 0, cit: counts.get(k)?.cit ?? 0 }));

    return {
      arrests: casiers.length,
      citations: citations.length,
      unit,
      series,
      topAgents: await buildTop(agentTally),
      topAgentsCasiers: await buildTop(casierTally),
      topAgentsContraventions: await buildTop(citationTally),
      topCharges,
    };
  },
});

// ===========================================================================
// Statistiques PERSONNELLES de l'agent courant (dashboard « Mon profil »).
// Mêmes plages que rangeStats, mais restreint aux fiches dont l'agent est
// l'officier/créateur. Aucune permission stats.view requise : ce sont ses
// propres chiffres. On n'inclut PAS les heures de service (fonction off).
// ===========================================================================
export const myRangeStats = query({
  args: { from: v.optional(v.number()), to: v.optional(v.number()) },
  handler: async (ctx, { from, to }) => {
    const agent = await requireAgent(ctx);
    const now = Date.now();
    const hi = to ?? now;
    const lo = from ?? null;

    // Lecture PAR AGENT via index (au lieu de scanner TOUTE la plage puis filtrer) :
    // on ne lit que SES casiers (jointure casierOfficers.by_officer, bornée sur `at`)
    // et SES contraventions (by_officer), puis on borne EN MÉMOIRE (volumes par agent
    // naturellement petits). Gain majeur : cette query réactive ne se ré-exécute plus
    // sur les écritures des AUTRES agents, et ne lit plus les tables entières.
    // « Mes arrestations » = casiers où l'agent est IMPLIQUÉ (créateur inclus) :
    // la jointure crédite chaque agent impliqué sans scanner le tableau officerIds.
    const isOwner = agent.isOwner;
    const inWindow = (r: any) => r.status !== "ANNULEE" && r.deletedAt == null && r.at <= hi && (lo == null || r.at >= lo);
    const officerRows = lo == null
      ? await ctx.db.query("casierOfficers").withIndex("by_officer", (q) => q.eq("officerId", agent._id).lte("at", hi)).collect()
      : await ctx.db.query("casierOfficers").withIndex("by_officer", (q) => q.eq("officerId", agent._id).gte("at", lo).lte("at", hi)).collect();
    const casiers: any[] = [];
    for (const jr of officerRows) {
      const e = await ctx.db.get(jr.entryId);
      if (e && inWindow(e)) casiers.push(e);
    }
    // Contravention avec officerName = verbalisateur Nexus non relié : pour l'owner
    // (compte de repli des imports), on l'écarte de ses stats personnelles.
    const citations = (
      await ctx.db.query("citations").withIndex("by_officer", (q) => q.eq("officerId", agent._id)).collect()
    ).filter((c: any) => inWindow(c) && (!isOwner || !c.officerName));

    // Rapports d'intervention rédigés (lead) sur la plage.
    const myReports = (await ctx.db.query("reports").withIndex("by_lead", (q) => q.eq("leadId", agent._id)).collect())
      .filter((r) => !r.deletedAt && (lo == null || r._creationTime >= lo) && r._creationTime <= hi);

    const dossiers = casiers.filter((e: any) => (e.arrestType ?? "DOSSIER") === "DOSSIER").length;
    const rapports = casiers.filter((e: any) => e.arrestType === "RAPPORT").length;
    const totalFine = casiers.reduce((s: number, e: any) => s + (e.totalFine ?? 0), 0)
      + citations.reduce((s: number, c: any) => s + (c.totalFine ?? 0), 0);

    // Top infractions : charges des SEULES fiches de l'agent (borné, pas de scan
    // global de toutes les charges).
    const chargeTally = new Map<string, number>();
    const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    for (const e of casiers) for (const ch of await ctx.db.query("casierCharges").withIndex("by_entry", (q) => q.eq("entryId", e._id)).collect()) bump(chargeTally, ch.snapshot.name);
    for (const c of citations) for (const ch of await ctx.db.query("citationCharges").withIndex("by_citation", (q) => q.eq("citationId", c._id)).collect()) bump(chargeTally, ch.snapshot.name);
    const topCharges = [...chargeTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));

    // Série temporelle (même pas adaptatif que rangeStats).
    let minAt = hi;
    for (const e of casiers) if (e.at < minAt) minAt = e.at;
    for (const c of citations) if (c.at < minAt) minAt = c.at;
    const effLo = lo == null ? (casiers.length || citations.length ? minAt : hi - DAY) : lo;
    const span = Math.max(0, hi - effLo);
    const unit: Unit = span <= 2 * DAY ? "hour" : span <= 92 * DAY ? "day" : "month";
    const counts = new Map<string, { arr: number; cit: number }>();
    const acc = (ts: number, field: "arr" | "cit") => { const k = bucketKey(ts, unit); const b = counts.get(k) ?? { arr: 0, cit: 0 }; b[field]++; counts.set(k, b); };
    for (const e of casiers) acc(e.at, "arr");
    for (const c of citations) acc(c.at, "cit");
    const allKeys = [...new Set([...gridKeys(effLo, hi, unit), ...counts.keys()])].sort();
    const series = allKeys.map((k) => ({ label: bucketLabel(k, unit), arr: counts.get(k)?.arr ?? 0, cit: counts.get(k)?.cit ?? 0 }));

    return {
      arrests: casiers.length,
      dossiers,
      rapports,
      citations: citations.length,
      reports: myReports.length,
      totalFine,
      unit,
      series,
      topCharges,
    };
  },
});
