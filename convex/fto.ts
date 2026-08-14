import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAgent, can } from "./rbac";

// FTO : formation terrain des Officiers 1, encadrés par un tuteur (officier
// référent) jusqu'à leur passage Officier 2. Fiche configurable, remplie au fil
// des patrouilles.

// Grade d'entrée (Officier 1) = plus bas grade opérationnel non extérieur.
async function entryGrade(ctx: QueryCtx | MutationCtx) {
  const grades = (await ctx.db.query("grades").collect())
    .filter((g) => !g.academyOnly && !g.external)
    .sort((a, b) => a.position - b.position);
  return grades[0] ?? null;
}

async function sheetDoc(ctx: QueryCtx | MutationCtx, agentId: Id<"agents">) {
  return await ctx.db.query("ftoSheets").withIndex("by_agent", (q) => q.eq("agentId", agentId)).unique();
}

// Membre de l'académie (instructeur / cadre) : porte un grade d'académie.
function isAcademy(viewer: Doc<"agents">): boolean {
  return !!viewer.academyRankId;
}

// Officier 2 ou plus : grade opérationnel (non académie, non extérieur) placé
// au-dessus du grade d'entrée (Officier 1).
async function isOffi2Plus(ctx: QueryCtx | MutationCtx, viewer: Doc<"agents">): Promise<boolean> {
  if (!viewer.gradeId) return false;
  const g = await ctx.db.get(viewer.gradeId);
  if (!g || g.academyOnly || g.external) return false;
  const entry = await entryGrade(ctx);
  return !!entry && g.position > entry.position;
}

// Accès à la Formation Terrain : Officier 2+, académie, ou owner.
async function hasFieldTraining(ctx: QueryCtx | MutationCtx, viewer: Doc<"agents">): Promise<boolean> {
  return viewer.isOwner || isAcademy(viewer) || (await can(ctx, viewer, "fto.view")) || (await isOffi2Plus(ctx, viewer));
}

// Modifier la FICHE (critères, briefing, connaissances) : le tuteur référent, un
// membre de l'académie, un détenteur de fto.edit, ou l'owner.
async function canEditSheet(ctx: QueryCtx | MutationCtx, viewer: Doc<"agents">, agentId: Id<"agents">): Promise<boolean> {
  if (viewer.isOwner || isAcademy(viewer)) return true;
  const sheet = await sheetDoc(ctx, agentId);
  if (sheet?.tutorId && sheet.tutorId === viewer._id) return true;
  return await can(ctx, viewer, "fto.edit");
}
async function assertEdit(ctx: MutationCtx, viewer: Doc<"agents">, agentId: Id<"agents">) {
  if (!(await canEditSheet(ctx, viewer, agentId))) throw new ConvexError("Seul le tuteur FTO ou l'académie peut modifier cette fiche.");
}

// Ajouter un RAPPORT DE PATROUILLE : tout Officier 2+ (en plus de ceux qui
// peuvent éditer la fiche).
async function canAddPatrol(ctx: QueryCtx | MutationCtx, viewer: Doc<"agents">, agentId: Id<"agents">): Promise<boolean> {
  return (await canEditSheet(ctx, viewer, agentId)) || (await isOffi2Plus(ctx, viewer));
}

// Gérer le MODÈLE (critères configurables) et l'encadrement : académie, owner,
// ou fto.manage.
async function assertManage(ctx: QueryCtx | MutationCtx, viewer: Doc<"agents">) {
  if (viewer.isOwner || isAcademy(viewer)) return;
  if (await can(ctx, viewer, "fto.manage")) return;
  throw new ConvexError("Réservé à l'encadrement de l'académie.");
}

// ---------- Liste des Officiers 1 ----------

export const listOffi1 = query({
  args: {},
  handler: async (ctx) => {
    // Ouvert à tout agent assermenté : la liste des Officiers 1 est visible de
    // tous, sauf des cadets. Seul l'accès à une fiche est restreint (référent ou
    // fto.view), signalé par `canOpen` sur chaque ligne.
    const viewer = await requireAgent(ctx);
    const viewerGrade = viewer.gradeId ? await ctx.db.get(viewer.gradeId) : null;
    if (viewerGrade?.academyOnly) return [];
    const grade = await entryGrade(ctx);
    if (!grade) return [];
    const hasFtoView = await hasFieldTraining(ctx, viewer);
    const items = (await ctx.db.query("ftoItems").withIndex("by_position").collect()).filter((i) => i.active !== false);
    const totalItems = items.length;

    const agents = (await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "ACTIVE")).collect())
      .filter((a) => a.gradeId === grade._id && !a.isOwner);

    const out = [];
    for (const a of agents) {
      const sheet = await sheetDoc(ctx, a._id);
      const tutor = sheet?.tutorId ? await ctx.db.get(sheet.tutorId) : null;
      const canOpen = hasFtoView || sheet?.tutorId === viewer._id;
      const entries = await ctx.db.query("ftoEntries").withIndex("by_agent", (q) => q.eq("agentId", a._id)).collect();
      const byItem = new Map(entries.map((e) => [e.itemId as string, e]));
      let filled = 0;
      for (const it of items) {
        const e = byItem.get(it._id as string);
        if (!e) continue;
        if (it.kind === "SCALE" && typeof e.level === "number") filled++;
        else if (it.kind === "CHECK_TP" && (e.theorie || e.pratique)) filled++;
        else if (it.kind === "CHECK" && e.checked) filled++;
      }
      out.push({
        _id: a._id,
        name: `${a.prenomRP} ${a.nomRP}`,
        matricule: a.matricule ?? null,
        avatarUrl: a.avatarUrl ?? null,
        tutorName: tutor ? `${tutor.prenomRP} ${tutor.nomRP}` : null,
        canOpen,
        progress: totalItems > 0 ? Math.round((filled / totalItems) * 100) : 0,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ---------- Fiche d'un Officier 1 ----------

export const sheet = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const viewer = await requireAgent(ctx);
    const agent = await ctx.db.get(agentId);
    if (!agent) return null;
    const doc = await sheetDoc(ctx, agentId);
    // Accès : Officier 2+, académie, référent, ou fto.view. Sinon fiche
    // verrouillée plutôt qu'une erreur (arrivée depuis la liste).
    const allowed = (await hasFieldTraining(ctx, viewer)) || doc?.tutorId === viewer._id;
    if (!allowed) return { denied: true as const };
    const tutor = doc?.tutorId ? await ctx.db.get(doc.tutorId) : null;

    const items = (await ctx.db.query("ftoItems").withIndex("by_position").collect()).filter((i) => i.active !== false);
    const entries = await ctx.db.query("ftoEntries").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect();
    const byItem = new Map(entries.map((e) => [e.itemId as string, e]));

    const scored = items.map((it) => {
      const e = byItem.get(it._id as string);
      return {
        _id: it._id, section: it.section, label: it.label, kind: it.kind,
        level: e?.level ?? null, theorie: e?.theorie ?? false, pratique: e?.pratique ?? false, checked: e?.checked ?? false,
      };
    });

    const patrols = (await ctx.db.query("ftoPatrols").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect())
      .sort((a, b) => b.startAt - a.startAt)
      .map((p) => ({ _id: p._id, startAt: p.startAt, endAt: p.endAt ?? null, lacunes: p.lacunes ?? "", progres: p.progres ?? "", general: p.general ?? "", authorName: p.authorName, mine: p.authorId === viewer._id }));

    return {
      agent: { _id: agent._id, prenomRP: agent.prenomRP, nomRP: agent.nomRP, matricule: agent.matricule ?? null, avatarUrl: agent.avatarUrl ?? null },
      tutor: tutor ? { _id: tutor._id, name: `${tutor.prenomRP} ${tutor.nomRP}`, matricule: tutor.matricule ?? null } : null,
      startAt: doc?.startAt ?? null,
      items: scored,
      patrols,
      canEdit: await canEditSheet(ctx, viewer, agentId),
      canPatrol: await canAddPatrol(ctx, viewer, agentId),
    };
  },
});

export const setEntry = mutation({
  args: {
    agentId: v.id("agents"),
    itemId: v.id("ftoItems"),
    level: v.optional(v.union(v.number(), v.null())),
    theorie: v.optional(v.boolean()),
    pratique: v.optional(v.boolean()),
    checked: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const viewer = await requireAgent(ctx);
    await assertEdit(ctx, viewer, a.agentId);
    const existing = await ctx.db.query("ftoEntries").withIndex("by_agent_item", (q) => q.eq("agentId", a.agentId).eq("itemId", a.itemId)).unique();
    const patch = {
      ...(a.level !== undefined ? { level: a.level === null ? undefined : a.level } : {}),
      ...(a.theorie !== undefined ? { theorie: a.theorie || undefined } : {}),
      ...(a.pratique !== undefined ? { pratique: a.pratique || undefined } : {}),
      ...(a.checked !== undefined ? { checked: a.checked || undefined } : {}),
      updatedBy: viewer._id,
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("ftoEntries", { agentId: a.agentId, itemId: a.itemId, ...patch });
  },
});

export const setHeader = mutation({
  args: { agentId: v.id("agents"), tutorId: v.optional(v.union(v.id("agents"), v.null())), startAt: v.optional(v.union(v.number(), v.null())) },
  handler: async (ctx, { agentId, tutorId, startAt }) => {
    const viewer = await requireAgent(ctx);
    // Attribuer un tuteur / la date d'entrée est un acte d'encadrement.
    await assertManage(ctx, viewer);
    const doc = await sheetDoc(ctx, agentId);
    const patch = {
      ...(tutorId !== undefined ? { tutorId: tutorId ?? undefined } : {}),
      ...(startAt !== undefined ? { startAt: startAt ?? undefined } : {}),
    };
    if (doc) await ctx.db.patch(doc._id, patch);
    else await ctx.db.insert("ftoSheets", { agentId, ...patch });
  },
});

// ---------- Rapports de patrouille ----------

export const addPatrol = mutation({
  args: { agentId: v.id("agents"), startAt: v.number(), endAt: v.optional(v.number()), lacunes: v.optional(v.string()), progres: v.optional(v.string()), general: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const viewer = await requireAgent(ctx);
    if (!(await canAddPatrol(ctx, viewer, a.agentId))) throw new ConvexError("Réservé aux Officiers 2 et plus.");
    await ctx.db.insert("ftoPatrols", {
      agentId: a.agentId,
      startAt: a.startAt,
      endAt: a.endAt,
      lacunes: a.lacunes?.trim() || undefined,
      progres: a.progres?.trim() || undefined,
      general: a.general?.trim() || undefined,
      authorId: viewer._id,
      authorName: `${viewer.prenomRP} ${viewer.nomRP}`,
      at: Date.now(),
    });
  },
});

export const removePatrol = mutation({
  args: { patrolId: v.id("ftoPatrols") },
  handler: async (ctx, { patrolId }) => {
    const viewer = await requireAgent(ctx);
    const p = await ctx.db.get(patrolId);
    if (!p) return;
    if (p.authorId !== viewer._id) await assertManage(ctx, viewer);
    await ctx.db.delete(patrolId);
  },
});

// Officiers proposables comme tuteur : agents actifs assermentés (hors cadets).
export const tutors = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAgent(ctx);
    await assertManage(ctx, viewer);
    const grades = new Map((await ctx.db.query("grades").collect()).map((g) => [g._id as string, g]));
    return (await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "ACTIVE")).collect())
      .filter((a) => !a.isOwner && a.gradeId && !grades.get(a.gradeId as string)?.academyOnly)
      .map((a) => ({ _id: a._id, prenomRP: a.prenomRP, nomRP: a.nomRP, matricule: a.matricule ?? null }))
      .sort((a, b) => `${a.nomRP}`.localeCompare(b.nomRP));
  },
});

// ---------- Configuration du modèle ----------

export const listItems = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAgent(ctx);
    if (!(await hasFieldTraining(ctx, viewer))) return [];
    return (await ctx.db.query("ftoItems").withIndex("by_position").collect()).map((it) => ({
      _id: it._id, section: it.section, label: it.label, kind: it.kind, active: it.active !== false, position: it.position,
    }));
  },
});

export const saveItem = mutation({
  args: {
    itemId: v.optional(v.id("ftoItems")),
    section: v.string(),
    label: v.string(),
    kind: v.union(v.literal("SCALE"), v.literal("CHECK_TP"), v.literal("CHECK")),
  },
  handler: async (ctx, a) => {
    const viewer = await requireAgent(ctx);
    await assertManage(ctx, viewer);
    if (!a.section.trim() || !a.label.trim()) throw new ConvexError("Section et libellé obligatoires.");
    const base = { section: a.section.trim(), label: a.label.trim(), kind: a.kind };
    if (a.itemId) { await ctx.db.patch(a.itemId, base); return a.itemId; }
    const all = await ctx.db.query("ftoItems").collect();
    const position = all.reduce((m, i) => Math.max(m, i.position), -1) + 1;
    return await ctx.db.insert("ftoItems", { ...base, position, active: true });
  },
});

export const removeItem = mutation({
  args: { itemId: v.id("ftoItems") },
  handler: async (ctx, { itemId }) => {
    const viewer = await requireAgent(ctx);
    await assertManage(ctx, viewer);
    for (const e of await ctx.db.query("ftoEntries").collect()) if (e.itemId === itemId) await ctx.db.delete(e._id);
    await ctx.db.delete(itemId);
  },
});

export const moveItem = mutation({
  args: { itemId: v.id("ftoItems"), direction: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, { itemId, direction }) => {
    const viewer = await requireAgent(ctx);
    await assertManage(ctx, viewer);
    const all = await ctx.db.query("ftoItems").withIndex("by_position").collect();
    const i = all.findIndex((x) => x._id === itemId);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= all.length) return;
    await ctx.db.patch(all[i]._id, { position: all[j].position });
    await ctx.db.patch(all[j]._id, { position: all[i].position });
  },
});

export const seedDefault = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAgent(ctx);
    await assertManage(ctx, viewer);
    if (await ctx.db.query("ftoItems").first()) return "exists" as const;
    const tp = (section: string, labels: string[]) => labels.map((label) => ({ section, label, kind: "CHECK_TP" as const }));
    const items: Array<{ section: string; label: string; kind: "SCALE" | "CHECK_TP" | "CHECK" }> = [
      ...["Conduite voiture", "Conduite voiture intervention", "Codes gyro"].map((label) => ({ section: "Véhicule", label, kind: "SCALE" as const })),
      ...["Attitude / Comportement", "Utilisation radio", "Présence", "Compréhension des ordres", "Interaction avec civils", "Rédaction / Rapports & casiers", "Respect des procédures"].map((label) => ({ section: "Général", label, kind: "SCALE" as const })),
      ...tp("Les bases du LSPD", ["Connaître le MDT et où trouver les informations", "Connaître les grades de la hiérarchie", "Connaître l'équipement et les tenues", "Connaître les véhicules du poste", "Connaître les spécialités et divisions du poste"]),
      ...tp("Communication radio", ["Connaître le lexique radio", "Connaître les indicatifs standard et de spécialités", "Fréquence radio des services publics", "Savoir s'annoncer sur la radio d'un autre service", "Connaître le code 99"]),
      ...tp("Patrouille (terrain)", ["Début de patrouille correct avec dispatch", "Connaître la manœuvre du PIT", "Savoir procéder à un contrôle / contraventionner", "Sécurisation d'une grosse intervention (banque, bijouterie…)", "Utilisation des gyrophares et signal lumineux"]),
      ...tp("Arrestations / Panel justice", ["Différence comparution immédiate / plaider coupable", "Neutraliser un suspect", "Lecture des droits mirandas et application", "Différence palpation / fouille intégrale", "Transport d'un suspect jusqu'au poste", "Savoir faire une mise en garde à vue", "Savoir contacter le DOJ", "Cas des mineurs et handicap mental"]),
      ...["Règles d'arme à feu (ISTC, AMER, PARA, CEVITAL)", "Conditions de l'usage de la force (légitime défense)", "Mise en place d'une amende", "Législations sur l'argent sur soi", "Législations sur les drogues", "Mise en fourrière", "Sortie de fourrière", "Connaître les deux postes (pièces essentielles)"].map((label) => ({ section: "Connaissances", label, kind: "CHECK" as const })),
    ];
    let position = 0;
    for (const it of items) await ctx.db.insert("ftoItems", { ...it, position: position++, active: true });
    return "seeded" as const;
  },
});
