import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";

// Éditeurs config-as-data (goal.md §16). Toutes les écritures exigent rbac.manage.

async function guard(ctx: QueryCtx) {
  const agent = await requireAgent(ctx);
  await requirePermission(ctx, agent, "rbac.manage");
  return agent;
}

// ---- Vue globale de tous les référentiels pour la page Configuration ----
export const all = query({
  args: {},
  handler: async (ctx) => {
    await guard(ctx);
    const byPos = <T extends { position: number }>(a: T[]) =>
      [...a].sort((x, y) => x.position - y.position);
    return {
      grades: byPos(await ctx.db.query("grades").collect()),
      qualifications: byPos(await ctx.db.query("qualifications").collect()),
      divisions: await ctx.db.query("divisions").collect(),
      mandatTypes: byPos(await ctx.db.query("mandatTypes").collect()),
      vehicleFlagTypes: byPos(await ctx.db.query("vehicleFlagTypes").collect()),
      flagTypes: byPos(await ctx.db.query("flagTypes").collect()),
      licenseTypes: byPos(await ctx.db.query("licenseTypes").collect()),
      sanctionTypes: byPos(await ctx.db.query("sanctionTypes").collect()),
      callsignTypes: byPos(await ctx.db.query("callsignTypes").collect()),
      defconLevels: byPos(await ctx.db.query("defconLevels").collect()),
      reportTypes: byPos(await ctx.db.query("reportTypes").collect()),
      disciplineSanctionTypes: byPos(await ctx.db.query("disciplineSanctionTypes").collect()),
      resourceCategories: byPos(await ctx.db.query("resourceCategories").collect()),
      weaponTypes: byPos(await ctx.db.query("weaponTypes").collect()),
      complaintStatuses: byPos(await ctx.db.query("complaintStatuses").collect()),
      dossierStatuses: byPos(await ctx.db.query("dossierStatuses").collect()),
      ethnies: byPos(await ctx.db.query("ethnies").collect()),
      hairColors: byPos(await ctx.db.query("hairColors").collect()),
      eyeColors: byPos(await ctx.db.query("eyeColors").collect()),
      citizenGroups: byPos(await ctx.db.query("citizenGroups").collect()),
      weaponOrigins: byPos(await ctx.db.query("weaponOrigins").collect()),
      saisieObjectTypes: byPos(await ctx.db.query("saisieObjectTypes").collect()),
    };
  },
});

// Listes d'options actives pour les formulaires (accessible à tout agent).
export const options = query({
  args: {},
  handler: async (ctx) => {
    await requireAgent(ctx);
    const opts = async (table: "ethnies" | "hairColors" | "eyeColors" | "citizenGroups" | "weaponTypes" | "weaponOrigins" | "complaintStatuses" | "dossierStatuses" | "saisieObjectTypes") =>
      (await ctx.db.query(table).collect())
        .filter((x) => x.active)
        .sort((a, b) => a.position - b.position)
        .map((x) => ({ _id: x._id, name: x.name }));
    return {
      ethnies: await opts("ethnies"),
      hairColors: await opts("hairColors"),
      eyeColors: await opts("eyeColors"),
      citizenGroups: await opts("citizenGroups"),
      weaponTypes: await opts("weaponTypes"),
      weaponOrigins: await opts("weaponOrigins"),
      complaintStatuses: await opts("complaintStatuses"),
      dossierStatuses: await opts("dossierStatuses"),
      saisieObjectTypes: await opts("saisieObjectTypes"),
    };
  },
});

async function nextPos(ctx: QueryCtx, table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await ctx.db.query(table as any).collect();
  return rows.reduce((m: number, r: { position?: number }) => Math.max(m, (r.position ?? 0) + 1), 0);
}

async function log(
  ctx: MutationCtx,
  agent: Doc<"agents">,
  table: string,
  op: string,
  label: string,
) {
  await writeAudit(ctx, agent, {
    action: `config.${table}.${op}`,
    resourceType: "config",
    resourceLabel: `${table}: ${label}`,
  });
}

// ================= GRADES =================
// ---- Formations & spécialités ----
export const qualificationCreate = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    kind: v.union(v.literal("FORMATION"), v.literal("SPECIALITE")),
    color: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const agent = await guard(ctx);
    const code = a.code.trim().toUpperCase();
    if (!code || !a.name.trim()) throw new Error("Sigle et intitulé requis.");
    const id = await ctx.db.insert("qualifications", {
      ...a, code, name: a.name.trim(), active: true, position: await nextPos(ctx, "qualifications"),
    });
    await log(ctx, agent, "qualification", "create", a.name);
    return id;
  },
});

export const qualificationUpdate = mutation({
  args: {
    id: v.id("qualifications"),
    code: v.string(),
    name: v.string(),
    kind: v.union(v.literal("FORMATION"), v.literal("SPECIALITE")),
    color: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...f }) => {
    const agent = await guard(ctx);
    await ctx.db.patch(id, { ...f, code: f.code.trim().toUpperCase(), name: f.name.trim() });
    await log(ctx, agent, "qualification", "update", f.name);
  },
});

export const qualificationRemove = mutation({
  args: { id: v.id("qualifications") },
  handler: async (ctx, { id }) => {
    const agent = await guard(ctx);
    const doc = await ctx.db.get(id);
    // Les attributions suivent la suppression, sinon elles pendouillent.
    for (const l of await ctx.db.query("agentQualifications").withIndex("by_qualification", (q) => q.eq("qualificationId", id)).collect()) {
      await ctx.db.delete(l._id);
    }
    await ctx.db.delete(id);
    await log(ctx, agent, "qualification", "remove", doc?.name ?? "");
  },
});

// Déplace un grade dans la hiérarchie en échangeant sa position avec son
// voisin. La position gouverne désormais qui peut agir sur qui : sans ce
// réordonnancement, un grade créé après coup restait bloqué au sommet.
export const gradeMove = mutation({
  args: { id: v.id("grades"), direction: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, { id, direction }) => {
    const agent = await guard(ctx);
    const grades = (await ctx.db.query("grades").collect()).sort((a, b) => a.position - b.position);
    const i = grades.findIndex((g) => g._id === id);
    if (i === -1) throw new Error("Grade introuvable.");
    // « up » = monter dans la liste = position plus basse = grade moins élevé.
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= grades.length) return;
    const a = grades[i];
    const b = grades[j];
    await ctx.db.patch(a._id, { position: b.position });
    await ctx.db.patch(b._id, { position: a.position });
    await log(ctx, agent, "grade", "update", `${a.name} <-> ${b.name}`);
  },
});

export const gradeCreate = mutation({
  args: {
    name: v.string(),
    abbrev: v.optional(v.string()),
    corps: v.union(v.literal("OPERATIONNEL"), v.literal("SUPERVISION"), v.literal("ETAT_MAJOR")),
    color: v.optional(v.string()),
    // Grade extérieur (DOJ, EMS...) : accès au MDT mais hors effectif et organigramme.
    external: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const agent = await guard(ctx);
    const id = await ctx.db.insert("grades", { ...a, external: !!a.external, position: await nextPos(ctx, "grades") });
    await log(ctx, agent, "grade", "create", a.name);
    return id;
  },
});
export const gradeUpdate = mutation({
  args: {
    id: v.id("grades"),
    name: v.string(),
    abbrev: v.optional(v.string()),
    corps: v.union(v.literal("OPERATIONNEL"), v.literal("SUPERVISION"), v.literal("ETAT_MAJOR")),
    color: v.optional(v.string()),
    external: v.optional(v.boolean()),
    position: v.optional(v.number()),
  },
  handler: async (ctx, { id, ...f }) => {
    const agent = await guard(ctx);
    await ctx.db.patch(id, { ...f, external: !!f.external });
    await log(ctx, agent, "grade", "update", f.name);
  },
});
export const gradeRemove = mutation({
  args: { id: v.id("grades") },
  handler: async (ctx, { id }) => {
    const agent = await guard(ctx);
    const used = await ctx.db
      .query("agents")
      .filter((q) => q.eq(q.field("gradeId"), id))
      .first();
    if (used) throw new Error("Grade utilisé par un agent : réaffectez-le d'abord.");
    const g = await ctx.db.get(id);
    await ctx.db.delete(id);
    await log(ctx, agent, "grade", "remove", g?.name ?? "");
  },
});

// ================= DIVISIONS =================
export const divisionCreate = mutation({
  args: {
    name: v.string(),
    tier: v.union(v.literal("PRINCIPALE"), v.literal("SECONDAIRE")),
    color: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const agent = await guard(ctx);
    const id = await ctx.db.insert("divisions", a);
    await log(ctx, agent, "division", "create", a.name);
    return id;
  },
});
export const divisionUpdate = mutation({
  args: {
    id: v.id("divisions"),
    name: v.string(),
    tier: v.union(v.literal("PRINCIPALE"), v.literal("SECONDAIRE")),
    color: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...f }) => {
    const agent = await guard(ctx);
    await ctx.db.patch(id, f);
    await log(ctx, agent, "division", "update", f.name);
  },
});
export const divisionRemove = mutation({
  args: { id: v.id("divisions") },
  handler: async (ctx, { id }) => {
    const agent = await guard(ctx);
    const used = await ctx.db
      .query("agentDivisions")
      .withIndex("by_division", (q) => q.eq("divisionId", id))
      .first();
    if (used) throw new Error("Division utilisée par un agent : retirez-la d'abord.");
    const d = await ctx.db.get(id);
    await ctx.db.delete(id);
    await log(ctx, agent, "division", "remove", d?.name ?? "");
  },
});

// ================= Référentiels "liste nommée" génériques =================
// mandatTypes, vehicleFlagTypes, flagTypes, licenseTypes, sanctionTypes,
// disciplineSanctionTypes, resourceCategories, callsignTypes.

export const namedCreate = mutation({
  args: {
    table: v.string(),
    name: v.string(),
    code: v.optional(v.string()),
    color: v.optional(v.string()),
    marksWanted: v.optional(v.boolean()),
  },
  handler: async (ctx, { table, name, code, color, marksWanted }) => {
    const agent = await guard(ctx);
    const base: Record<string, unknown> = { position: await nextPos(ctx, table) };
    switch (table) {
      case "callsignTypes":
        Object.assign(base, { code: code ?? name, label: name, active: true });
        break;
      case "mandatTypes":
        Object.assign(base, { name, marksWanted: marksWanted ?? false, active: true });
        break;
      case "vehicleFlagTypes":
      case "flagTypes":
        Object.assign(base, { name, color, active: true });
        break;
      case "licenseTypes":
      case "sanctionTypes":
      case "disciplineSanctionTypes":
      case "weaponTypes":
      case "complaintStatuses":
      case "dossierStatuses":
      case "ethnies":
      case "hairColors":
      case "eyeColors":
      case "citizenGroups":
      case "weaponOrigins":
      case "saisieObjectTypes":
        Object.assign(base, { name, active: true });
        break;
      case "resourceCategories":
        Object.assign(base, { name });
        break;
      default:
        throw new Error(`Table non gérée : ${table}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = await ctx.db.insert(table as any, base as any);
    await log(ctx, agent, table, "create", name);
    return id;
  },
});

export const namedUpdate = mutation({
  args: {
    table: v.string(),
    id: v.string(),
    name: v.string(),
    code: v.optional(v.string()),
    color: v.optional(v.string()),
    marksWanted: v.optional(v.boolean()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, { table, id, name, code, color, marksWanted, active }) => {
    const agent = await guard(ctx);
    const patch: Record<string, unknown> = {};
    switch (table) {
      case "callsignTypes":
        Object.assign(patch, { code: code ?? name, label: name });
        break;
      case "mandatTypes":
        Object.assign(patch, { name, marksWanted });
        break;
      case "vehicleFlagTypes":
      case "flagTypes":
        Object.assign(patch, { name, color });
        break;
      case "licenseTypes":
      case "sanctionTypes":
      case "disciplineSanctionTypes":
      case "resourceCategories":
      case "weaponTypes":
      case "complaintStatuses":
      case "dossierStatuses":
      case "ethnies":
      case "hairColors":
      case "eyeColors":
      case "citizenGroups":
      case "weaponOrigins":
      case "saisieObjectTypes":
        Object.assign(patch, { name });
        break;
      default:
        throw new Error(`Table non gérée : ${table}`);
    }
    if (active !== undefined && table !== "resourceCategories") patch.active = active;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.db.patch(id as any, patch as any);
    await log(ctx, agent, table, "update", name);
  },
});

export const namedRemove = mutation({
  args: { table: v.string(), id: v.string() },
  handler: async (ctx, { table, id }) => {
    const agent = await guard(ctx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await ctx.db.get(id as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.db.delete(id as any);
    await log(ctx, agent, table, "remove", (doc as { name?: string })?.name ?? "");
  },
});

// ================= DEFCON levels =================
export const defconCreate = mutation({
  args: {
    name: v.string(),
    color: v.optional(v.string()),
    fineMultiplier: v.number(),
    sensitiveFineMultiplier: v.number(),
  },
  handler: async (ctx, a) => {
    const agent = await guard(ctx);
    const id = await ctx.db.insert("defconLevels", {
      ...a,
      isDefault: false,
      position: await nextPos(ctx, "defconLevels"),
    });
    await log(ctx, agent, "defcon", "create", a.name);
    return id;
  },
});
export const defconUpdate = mutation({
  args: {
    id: v.id("defconLevels"),
    name: v.string(),
    color: v.optional(v.string()),
    fineMultiplier: v.number(),
    sensitiveFineMultiplier: v.number(),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, isDefault, ...f }) => {
    const agent = await guard(ctx);
    if (isDefault) {
      // un seul niveau par défaut
      for (const l of await ctx.db.query("defconLevels").collect()) {
        if (l.isDefault) await ctx.db.patch(l._id, { isDefault: false });
      }
    }
    await ctx.db.patch(id, { ...f, ...(isDefault !== undefined ? { isDefault } : {}) });
    await log(ctx, agent, "defcon", "update", f.name);
  },
});
export const defconRemove = mutation({
  args: { id: v.id("defconLevels") },
  handler: async (ctx, { id }) => {
    const agent = await guard(ctx);
    const l = await ctx.db.get(id);
    if (l?.isDefault) throw new Error("Impossible de supprimer le niveau par défaut.");
    await ctx.db.delete(id);
    await log(ctx, agent, "defcon", "remove", l?.name ?? "");
  },
});

// ================= Report types (templates) =================
export const reportTypeCreate = mutation({
  args: { name: v.string() },
  handler: async (ctx, a) => {
    const agent = await guard(ctx);
    const id = await ctx.db.insert("reportTypes", {
      ...a,
      active: true,
      position: await nextPos(ctx, "reportTypes"),
    });
    await log(ctx, agent, "reportType", "create", a.name);
    return id;
  },
});
export const reportTypeUpdate = mutation({
  args: {
    id: v.id("reportTypes"),
    name: v.string(),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...f }) => {
    const agent = await guard(ctx);
    await ctx.db.patch(id, f);
    await log(ctx, agent, "reportType", "update", f.name);
  },
});
export const reportTypeRemove = mutation({
  args: { id: v.id("reportTypes") },
  handler: async (ctx, { id }) => {
    const agent = await guard(ctx);
    const r = await ctx.db.get(id);
    await ctx.db.delete(id);
    await log(ctx, agent, "reportType", "remove", r?.name ?? "");
  },
});
