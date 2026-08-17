import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAgent, can } from "./rbac";

// FTO : formation terrain des Officiers 1 Probatoire, encadrés par un tuteur
// (officier référent) jusqu'à leur passage Officier 1 Confirmé. Fiche
// configurable, remplie au fil des patrouilles. Le grade « en formation » est
// configurable ; un agent promu au-dessus bascule dans l'historique.

// Grades opérationnels (non académie, non extérieurs) triés par position.
async function operationalGrades(ctx: QueryCtx | MutationCtx) {
  return (await ctx.db.query("grades").collect())
    .filter((g) => !g.academyOnly && !g.external)
    .sort((a, b) => a.position - b.position);
}

// Grade « en formation terrain ». Configurable via ftoConfig ; à défaut, le plus
// bas grade opérationnel (Officier 1 Probatoire). Exporté : First Lincoln
// s'appuie sur le même grade en formation.
export async function traineeGrade(ctx: QueryCtx | MutationCtx) {
  const cfg = await ctx.db.query("ftoConfig").first();
  if (cfg?.traineeGradeId) {
    const g = await ctx.db.get(cfg.traineeGradeId);
    if (g && !g.academyOnly && !g.external) return g;
  }
  return (await operationalGrades(ctx))[0] ?? null;
}

// Grade « confirmé » (atteint après passage) = grade opérationnel immédiatement
// au-dessus du grade en formation. Sert au libellé « jusqu'au passage … ».
async function formedGrade(ctx: QueryCtx | MutationCtx) {
  const trainee = await traineeGrade(ctx);
  if (!trainee) return null;
  const ops = await operationalGrades(ctx);
  return ops.find((g) => g.position > trainee.position) ?? null;
}

async function sheetDoc(ctx: QueryCtx | MutationCtx, agentId: Id<"agents">) {
  return await ctx.db.query("ftoSheets").withIndex("by_agent", (q) => q.eq("agentId", agentId)).unique();
}

// Membre de l'académie (instructeur / cadre) : porte un grade d'académie.
function isAcademy(viewer: Doc<"agents">): boolean {
  return !!viewer.academyRankId;
}

// Officier confirmé ou plus : grade opérationnel (non académie, non extérieur)
// placé au-dessus du grade en formation (Officier 1 Probatoire).
async function isOffi2Plus(ctx: QueryCtx | MutationCtx, viewer: Doc<"agents">): Promise<boolean> {
  if (!viewer.gradeId) return false;
  const g = await ctx.db.get(viewer.gradeId);
  if (!g || g.academyOnly || g.external) return false;
  const entry = await traineeGrade(ctx);
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

// Ajouter un RAPPORT DE PATROUILLE : permission dédiée `fto.patrol` (attribuée à
// partir d'Officier 1 Confirmé), en plus de ceux qui peuvent éditer la fiche.
async function canAddPatrol(ctx: QueryCtx | MutationCtx, viewer: Doc<"agents">, agentId: Id<"agents">): Promise<boolean> {
  return (await canEditSheet(ctx, viewer, agentId)) || (await can(ctx, viewer, "fto.patrol"));
}

// Gérer le MODÈLE (critères configurables) et l'encadrement : académie, owner,
// ou fto.manage.
async function assertManage(ctx: QueryCtx | MutationCtx, viewer: Doc<"agents">) {
  if (viewer.isOwner || isAcademy(viewer)) return;
  if (await can(ctx, viewer, "fto.manage")) return;
  throw new ConvexError("Réservé à l'encadrement de l'académie.");
}

// Aptitude (%) d'une fiche = moyenne pondérée des critères, pas un simple taux de
// remplissage. Un critère non noté OU noté « Exécrable » (niveau 0) ne vaut rien ;
// « Très Bien » (niveau 4) vaut 1. CHECK_TP : théorie et pratique valent 0,5
// chacune ; CHECK : validé = 1. Le % reflète l'aptitude à passer la First Lincoln.
async function sheetProgress(ctx: QueryCtx | MutationCtx, agentId: Id<"agents">, items: Doc<"ftoItems">[]): Promise<number> {
  if (items.length === 0) return 0;
  const entries = await ctx.db.query("ftoEntries").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect();
  const byItem = new Map(entries.map((e) => [e.itemId as string, e]));
  let score = 0;
  for (const it of items) {
    const e = byItem.get(it._id as string);
    if (!e) continue;
    if (it.kind === "SCALE") { if (typeof e.level === "number") score += e.level / 4; }
    else if (it.kind === "CHECK_TP") score += (e.theorie ? 0.5 : 0) + (e.pratique ? 0.5 : 0);
    else if (it.kind === "CHECK") { if (e.checked) score += 1; }
  }
  return Math.round((score / items.length) * 100);
}

// Libellés de la Formation Terrain : grade en formation + grade confirmé (pour
// l'en-tête, la description et le sélecteur de configuration).
export const context = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAgent(ctx);
    const trainee = await traineeGrade(ctx);
    const formed = await formedGrade(ctx);
    const cfg = await ctx.db.query("ftoConfig").first();
    const canManage = viewer.isOwner || isAcademy(viewer) || (await can(ctx, viewer, "fto.manage"));
    // Grades opérationnels proposables comme « grade en formation » (config).
    const grades = canManage ? (await operationalGrades(ctx)).map((g) => ({ _id: g._id, name: g.name })) : [];
    return {
      traineeGradeId: cfg?.traineeGradeId ?? trainee?._id ?? null,
      traineeGradeName: trainee?.name ?? "Officier 1 Probatoire",
      formedGradeName: formed?.name ?? "Officier 1 Confirmé",
      canManage,
      grades,
    };
  },
});

// ---------- Liste des officiers en formation ----------

export const listOffi1 = query({
  args: {},
  handler: async (ctx) => {
    // Ouvert à tout agent assermenté : la liste des officiers en formation est
    // visible de tous, sauf des cadets. Seul l'accès à une fiche est restreint
    // (référent ou fto.view), signalé par `canOpen` sur chaque ligne.
    const viewer = await requireAgent(ctx);
    const viewerGrade = viewer.gradeId ? await ctx.db.get(viewer.gradeId) : null;
    if (viewerGrade?.academyOnly) return [];
    const grade = await traineeGrade(ctx);
    if (!grade) return [];
    const hasFtoView = await hasFieldTraining(ctx, viewer);
    const items = (await ctx.db.query("ftoItems").withIndex("by_position").collect()).filter((i) => i.active !== false);

    const agents = (await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "ACTIVE")).collect())
      .filter((a) => a.gradeId === grade._id && !a.isOwner);

    const out = [];
    for (const a of agents) {
      const sheet = await sheetDoc(ctx, a._id);
      const tutor = sheet?.tutorId ? await ctx.db.get(sheet.tutorId) : null;
      const canOpen = hasFtoView || sheet?.tutorId === viewer._id;
      out.push({
        _id: a._id,
        name: `${a.prenomRP} ${a.nomRP}`,
        matricule: a.matricule ?? null,
        avatarUrl: a.avatarUrl ?? null,
        tutorName: tutor ? `${tutor.prenomRP} ${tutor.nomRP}` : null,
        canOpen,
        progress: await sheetProgress(ctx, a._id, items),
      });
    }
    // Classé par aptitude décroissante (les plus prêts pour la First Lincoln en tête).
    return out.sort((a, b) => b.progress - a.progress || a.name.localeCompare(b.name));
  },
});

// ---------- Historique : fiches des agents formés (promus au-dessus) ----------
// Une fiche « graduée » = un agent qui possède des données FTO (fiche, critères
// ou patrouilles) mais n'est plus au grade en formation. Calculé dynamiquement :
// aucune migration au moment de la promotion.
export const listGraduated = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAgent(ctx);
    const viewerGrade = viewer.gradeId ? await ctx.db.get(viewer.gradeId) : null;
    if (viewerGrade?.academyOnly) return [];
    const trainee = await traineeGrade(ctx);
    const hasFtoView = await hasFieldTraining(ctx, viewer);
    const items = (await ctx.db.query("ftoItems").withIndex("by_position").collect()).filter((i) => i.active !== false);

    // Agents ayant une fiche (en-tête) : point de départ des dossiers ouverts.
    const sheets = await ctx.db.query("ftoSheets").collect();
    const out = [];
    for (const s of sheets) {
      const a = await ctx.db.get(s.agentId);
      if (!a || a.isOwner || a.status !== "ACTIVE") continue;
      // Toujours au grade en formation → reste dans la liste active, pas ici.
      if (trainee && a.gradeId === trainee._id) continue;
      const g = a.gradeId ? await ctx.db.get(a.gradeId) : null;
      const tutor = s.tutorId ? await ctx.db.get(s.tutorId) : null;
      out.push({
        _id: a._id,
        name: `${a.prenomRP} ${a.nomRP}`,
        matricule: a.matricule ?? null,
        avatarUrl: a.avatarUrl ?? null,
        gradeName: g?.name ?? null,
        tutorName: tutor ? `${tutor.prenomRP} ${tutor.nomRP}` : null,
        canOpen: hasFtoView || s.tutorId === viewer._id,
        progress: await sheetProgress(ctx, a._id, items),
      });
    }
    return out.sort((a, b) => b.progress - a.progress || a.name.localeCompare(b.name));
  },
});

// Configurer le grade « en formation terrain » (grade formé). Réservé à
// l'encadrement (académie / fto.manage / owner).
export const setConfig = mutation({
  args: { traineeGradeId: v.union(v.id("grades"), v.null()) },
  handler: async (ctx, { traineeGradeId }) => {
    const viewer = await requireAgent(ctx);
    await assertManage(ctx, viewer);
    const cfg = await ctx.db.query("ftoConfig").first();
    const patch = { traineeGradeId: traineeGradeId ?? undefined, updatedBy: viewer._id, updatedAt: Date.now() };
    if (cfg) await ctx.db.patch(cfg._id, patch);
    else await ctx.db.insert("ftoConfig", patch);
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

    const trainee = await traineeGrade(ctx);
    const agentGrade = agent.gradeId ? await ctx.db.get(agent.gradeId) : null;
    const graduated = !!trainee && agent.gradeId !== trainee._id;

    return {
      agent: { _id: agent._id, prenomRP: agent.prenomRP, nomRP: agent.nomRP, matricule: agent.matricule ?? null, avatarUrl: agent.avatarUrl ?? null },
      tutor: tutor ? { _id: tutor._id, name: `${tutor.prenomRP} ${tutor.nomRP}`, matricule: tutor.matricule ?? null } : null,
      startAt: doc?.startAt ?? null,
      items: scored,
      patrols,
      graduated,
      traineeGradeName: trainee?.name ?? "Officier 1 Probatoire",
      currentGradeName: agentGrade?.name ?? null,
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
