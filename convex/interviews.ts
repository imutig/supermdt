import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { requireAgent, can } from "./rbac";
import { writeAudit } from "./lib/audit";

// Entretiens de recrutement (portail LSPA). Un instructeur note des questions
// (1 à 5) puis une mise en situation tirée au hasard. Banque de questions /
// situations configurable ; contenu de chaque entretien conservé et éditable.

// Accès : encadrement académie (grade d'académie), owner, ou permission dédiée.
async function assertAccess(ctx: QueryCtx | MutationCtx, agent: Doc<"agents">) {
  if (agent.isOwner || agent.academyRankId) return;
  if (await can(ctx, agent, "lspa.entretiens")) return;
  throw new ConvexError("Accès aux entretiens réservé à l'académie.");
}
// Configuration de la banque : encadrement académie + owner uniquement.
function assertConfig(agent: Doc<"agents">) {
  if (agent.isOwner || agent.academyRankId) return;
  throw new ConvexError("Configuration de la banque réservée à l'encadrement de l'académie.");
}

// Note 1-5 -> fraction étalée (1 = 0 %, 5 = 100 %).
const noteFrac = (note?: number | null): number | null =>
  note ? (Math.min(5, Math.max(1, note)) - 1) / 4 : null;

type ItemSnap = { text: string; explanation?: string; note?: number };

// Score final (0-100) : moyenne des questions (75 %) + mise en situation (25 %).
// La part manquante est ignorée (pondération adaptative).
function computeScore(questions: ItemSnap[], scenario?: ItemSnap | null): number | undefined {
  const qFracs = questions.map((q) => noteFrac(q.note)).filter((x): x is number => x != null);
  const qAvg = qFracs.length ? qFracs.reduce((a, b) => a + b, 0) / qFracs.length : null;
  const sFrac = scenario ? noteFrac(scenario.note) : null;
  let final: number | null;
  if (qAvg != null && sFrac != null) final = qAvg * 0.75 + sFrac * 0.25;
  else if (qAvg != null) final = qAvg;
  else if (sFrac != null) final = sFrac;
  else final = null;
  return final == null ? undefined : Math.round(final * 100);
}

const itemSnap = v.object({ text: v.string(), explanation: v.optional(v.string()), note: v.optional(v.number()) });

// ---------- Banque de questions / mises en situation ----------

export const items = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await assertAccess(ctx, agent);
    return (await ctx.db.query("interviewItems").withIndex("by_position").collect())
      .map((i) => ({ _id: i._id, kind: i.kind, text: i.text, explanation: i.explanation ?? "", position: i.position, active: i.active !== false }));
  },
});

export const saveItem = mutation({
  args: {
    itemId: v.optional(v.id("interviewItems")),
    kind: v.union(v.literal("QUESTION"), v.literal("SCENARIO")),
    text: v.string(),
    explanation: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const agent = await requireAgent(ctx);
    assertConfig(agent);
    const text = a.text.trim();
    if (!text) throw new ConvexError("L'intitulé est obligatoire.");
    const base = { kind: a.kind, text, explanation: a.explanation?.trim() || undefined };
    if (a.itemId) {
      await ctx.db.patch(a.itemId, base);
      await writeAudit(ctx, agent, { action: "interviewitem.update", resourceType: "interviewItem", resourceId: a.itemId, resourceLabel: text, metadata: { kind: a.kind } });
      return a.itemId;
    }
    const all = await ctx.db.query("interviewItems").collect();
    const position = all.reduce((m, i) => Math.max(m, i.position), -1) + 1;
    const itemId = await ctx.db.insert("interviewItems", { ...base, position, active: true });
    await writeAudit(ctx, agent, { action: "interviewitem.create", resourceType: "interviewItem", resourceId: itemId, resourceLabel: text, metadata: { kind: a.kind } });
    return itemId;
  },
});

export const toggleItem = mutation({
  args: { itemId: v.id("interviewItems"), active: v.boolean() },
  handler: async (ctx, { itemId, active }) => {
    const agent = await requireAgent(ctx);
    assertConfig(agent);
    await ctx.db.patch(itemId, { active });
    const it = await ctx.db.get(itemId);
    await writeAudit(ctx, agent, { action: "interviewitem.toggle", resourceType: "interviewItem", resourceId: itemId, resourceLabel: it?.text, metadata: { active } });
  },
});

export const removeItem = mutation({
  args: { itemId: v.id("interviewItems") },
  handler: async (ctx, { itemId }) => {
    const agent = await requireAgent(ctx);
    assertConfig(agent);
    const it = await ctx.db.get(itemId);
    await ctx.db.delete(itemId);
    await writeAudit(ctx, agent, { action: "interviewitem.remove", resourceType: "interviewItem", resourceId: itemId, resourceLabel: it?.text });
  },
});

export const moveItem = mutation({
  args: { itemId: v.id("interviewItems"), direction: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, { itemId, direction }) => {
    const agent = await requireAgent(ctx);
    assertConfig(agent);
    // Réordonne au sein du même type (question ou mise en situation).
    const it = await ctx.db.get(itemId);
    if (!it) return;
    const same = (await ctx.db.query("interviewItems").withIndex("by_position").collect()).filter((x) => x.kind === it.kind);
    const i = same.findIndex((x) => x._id === itemId);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= same.length) return;
    await ctx.db.patch(same[i]._id, { position: same[j].position });
    await ctx.db.patch(same[j]._id, { position: same[i].position });
    await writeAudit(ctx, agent, { action: "interviewitem.move", resourceType: "interviewItem", resourceId: itemId, resourceLabel: it.text, metadata: { direction } });
  },
});

// ---------- Entretiens ----------

function shapeInterview(r: Doc<"interviews">) {
  return {
    _id: r._id,
    prenom: r.prenom,
    nom: r.nom,
    dateNaissance: r.dateNaissance ?? null,
    score: r.score ?? null,
    questionCount: r.questions.length,
    hasScenario: !!r.scenario,
    createdByName: r.createdByName,
    createdAt: r.createdAt,
  };
}

// Pagination serveur (curseur Convex) : borne la lecture au lieu de tout charger.
export const page = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const agent = await requireAgent(ctx);
    await assertAccess(ctx, agent);
    const res = await ctx.db.query("interviews").withIndex("by_created").order("desc").paginate(paginationOpts);
    return { ...res, page: res.page.filter((r) => !r.deletedAt).map(shapeInterview) };
  },
});

export const get = query({
  args: { id: v.id("interviews") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await assertAccess(ctx, agent);
    const r = await ctx.db.get(id);
    if (!r || r.deletedAt) return null;
    return {
      _id: r._id,
      prenom: r.prenom,
      nom: r.nom,
      dateNaissance: r.dateNaissance ?? "",
      questions: r.questions,
      scenario: r.scenario ?? null,
      score: r.score ?? null,
      createdByName: r.createdByName,
      createdAt: r.createdAt,
    };
  },
});

// Crée un entretien : snapshot des questions actives + une mise en situation
// tirée au hasard parmi les situations actives.
export const create = mutation({
  args: { prenom: v.string(), nom: v.string(), dateNaissance: v.optional(v.string()) },
  handler: async (ctx, { prenom, nom, dateNaissance }) => {
    const agent = await requireAgent(ctx);
    await assertAccess(ctx, agent);
    if (!prenom.trim() || !nom.trim()) throw new ConvexError("Prénom et nom du candidat requis.");
    const active = (await ctx.db.query("interviewItems").withIndex("by_position").collect()).filter((i) => i.active !== false);
    const questions: ItemSnap[] = active.filter((i) => i.kind === "QUESTION").map((i) => ({ text: i.text, explanation: i.explanation }));
    const scenarios = active.filter((i) => i.kind === "SCENARIO");
    // Tirage au sort robuste : on mélange Math.random ET Date.now (les deux
    // varient à chaque création) pour éviter tout biais éventuel de l'un ou
    // l'autre - sinon on retombait toujours sur la même mise en situation.
    const rnd = Math.floor(Math.random() * 1_000_000) + Date.now();
    const picked = scenarios.length ? scenarios[rnd % scenarios.length] : null;
    const scenario: ItemSnap | undefined = picked ? { text: picked.text, explanation: picked.explanation } : undefined;
    const id = await ctx.db.insert("interviews", {
      prenom: prenom.trim(), nom: nom.trim(), dateNaissance: dateNaissance?.trim() || undefined,
      questions, scenario, score: undefined,
      createdBy: agent._id, createdByName: `${agent.prenomRP} ${agent.nomRP}`, createdAt: Date.now(),
    });
    await writeAudit(ctx, agent, { action: "interview.create", resourceType: "interview", resourceId: id, resourceLabel: `${prenom} ${nom}` });
    return id;
  },
});

// Sauvegarde complète (identité + questions + notes + mise en situation).
export const save = mutation({
  args: {
    id: v.id("interviews"),
    prenom: v.string(),
    nom: v.string(),
    dateNaissance: v.optional(v.string()),
    questions: v.array(itemSnap),
    scenario: v.optional(v.union(itemSnap, v.null())),
  },
  handler: async (ctx, { id, prenom, nom, dateNaissance, questions, scenario }) => {
    const agent = await requireAgent(ctx);
    await assertAccess(ctx, agent);
    const r = await ctx.db.get(id);
    if (!r || r.deletedAt) throw new ConvexError("Entretien introuvable.");
    const clean = (s?: ItemSnap | null): ItemSnap | undefined => s ? { text: s.text, explanation: s.explanation?.trim() || undefined, note: s.note && s.note >= 1 && s.note <= 5 ? s.note : undefined } : undefined;
    const q = questions.map((x) => clean(x)!).filter(Boolean);
    const sc = clean(scenario);
    await ctx.db.patch(id, {
      prenom: prenom.trim(), nom: nom.trim(), dateNaissance: dateNaissance?.trim() || undefined,
      questions: q, scenario: sc, score: computeScore(q, sc),
    });
    await writeAudit(ctx, agent, { action: "interview.update", resourceType: "interview", resourceId: id, resourceLabel: `${prenom.trim()} ${nom.trim()}` });
  },
});

export const remove = mutation({
  args: { id: v.id("interviews") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await assertAccess(ctx, agent);
    const r = await ctx.db.get(id);
    if (!r || r.deletedAt) return;
    await ctx.db.patch(id, { deletedAt: Date.now(), deletedBy: agent._id });
    await writeAudit(ctx, agent, { action: "interview.delete", resourceType: "interview", resourceId: id, resourceLabel: `${r.prenom} ${r.nom}` });
  },
});
