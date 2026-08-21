import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { requireAgent, requirePermission, agentLabel, can } from "./rbac";
import { writeAudit } from "./lib/audit";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";

type AnyCtx = QueryCtx | MutationCtx;

// Famille d'un rapport (rétro-compatible : absent = OPERATION).
export function reportCategory(r: { category?: "OPERATION" | "PERSONNEL" }): "OPERATION" | "PERSONNEL" {
  return r.category ?? "OPERATION";
}

// Lecture : rapport d'opération = permission rapports.view ; rapport personnel =
// son auteur, ou un agent habilité Effectif (consultation seule depuis la fiche).
export async function canReadReport(ctx: AnyCtx, agent: Doc<"agents">, r: Doc<"reports">): Promise<boolean> {
  if (reportCategory(r) === "PERSONNEL") {
    if (r.createdBy === agent._id || agent.isOwner) return true;
    return await can(ctx, agent, "effectif.view");
  }
  return await can(ctx, agent, "rapports.view");
}

// Écriture : rapport d'opération = rapports.contribute ; rapport personnel = son
// auteur uniquement.
export async function canWriteReport(ctx: AnyCtx, agent: Doc<"agents">, r: Doc<"reports">): Promise<boolean> {
  if (reportCategory(r) === "PERSONNEL") return r.createdBy === agent._id || !!agent.isOwner;
  return await can(ctx, agent, "rapports.contribute");
}

// Garde d'écriture mutualisée : charge le rapport, vérifie l'accès selon la famille.
async function requireReportWrite(ctx: MutationCtx, reportId: Id<"reports">): Promise<{ agent: Doc<"agents">; report: Doc<"reports"> }> {
  const agent = await requireAgent(ctx);
  const r = await ctx.db.get(reportId);
  if (!r || r.deletedAt) throw new ConvexError("Rapport introuvable.");
  if (!(await canWriteReport(ctx, agent, r))) throw new ConvexError("Modification non autorisée.");
  return { agent, report: r };
}

export const listTypes = query({
  args: {},
  handler: async (ctx) => {
    await requireAgent(ctx);
    return (await ctx.db.query("reportTypes").collect())
      .filter((t) => t.active)
      .map((t) => ({ _id: t._id, name: t.name, position: t.position, category: t.category ?? "OPERATION" as const }));
  },
});

// Cache local (par requête) pour éviter les N+1 : types de rapport + agents leads.
function makeCache(ctx: QueryCtx) {
  const types = new Map<string, string>(); // typeId -> name
  const agents = new Map<string, string>(); // agentId -> "Prénom Nom"
  return {
    async typeName(id: import("./_generated/dataModel").Id<"reportTypes">) {
      const k = id as string;
      if (!types.has(k)) { const t = await ctx.db.get(id); types.set(k, t?.name ?? ""); }
      return types.get(k) ?? "";
    },
    async agentName(id: import("./_generated/dataModel").Id<"agents">) {
      const k = id as string;
      if (!agents.has(k)) { const a = await ctx.db.get(id); agents.set(k, a ? `${a.prenomRP} ${a.nomRP}` : "-"); }
      return agents.get(k) ?? "-";
    },
  };
}

export const list = query({
  args: { category: v.optional(v.union(v.literal("OPERATION"), v.literal("PERSONNEL"))) },
  handler: async (ctx, { category }) => {
    const agent = await requireAgent(ctx);
    const cat = category ?? "OPERATION";
    let reports: Doc<"reports">[];
    if (cat === "PERSONNEL") {
      // Rapports personnels : strictement les miens (l'auteur seul y accède ici).
      reports = (await ctx.db.query("reports").withIndex("by_creator", (q) => q.eq("createdBy", agent._id)).order("desc").take(120))
        .filter((r) => reportCategory(r) === "PERSONNEL");
    } else {
      await requirePermission(ctx, agent, "rapports.view");
      reports = (await ctx.db.query("reports").order("desc").take(120)).filter((r) => reportCategory(r) === "OPERATION");
    }
    const cache = makeCache(ctx);
    const out = [];
    for (const r of reports) {
      if (r.deletedAt) continue;
      out.push({
        _id: r._id,
        title: r.title,
        typeName: await cache.typeName(r.typeId),
        status: r.status,
        lead: await cache.agentName(r.leadId),
        at: r._creationTime,
      });
    }
    return out;
  },
});

// Rapports personnels d'un agent (lecture seule depuis la fiche Effectif).
export const byAgentPersonal = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const viewer = await requireAgent(ctx);
    // Le titulaire, un habilité Effectif, ou le propriétaire peuvent consulter.
    if (viewer._id !== agentId && !viewer.isOwner && !(await can(ctx, viewer, "effectif.view"))) return [];
    const reports = (await ctx.db.query("reports").withIndex("by_creator", (q) => q.eq("createdBy", agentId)).order("desc").take(100))
      .filter((r) => reportCategory(r) === "PERSONNEL" && !r.deletedAt);
    const cache = makeCache(ctx);
    const out = [];
    for (const r of reports) {
      out.push({ _id: r._id, title: r.title, typeName: await cache.typeName(r.typeId), status: r.status, at: r._creationTime });
    }
    return out;
  },
});

// Rapports impliquant un citoyen (onglet Rapports du dossier, §2).
export const byCitizen = query({
  args: { citizenId: v.id("citizens") },
  handler: async (ctx, { citizenId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.view");
    const reports = await ctx.db.query("reports").order("desc").take(200);
    const cache = makeCache(ctx);
    const out = [];
    for (const r of reports) {
      if (r.deletedAt) continue;
      if (!r.citizenIds.includes(citizenId)) continue;
      out.push({
        _id: r._id,
        title: r.title,
        typeName: await cache.typeName(r.typeId),
        status: r.status,
        lead: await cache.agentName(r.leadId),
        at: r._creationTime,
      });
    }
    return out;
  },
});

export const get = query({
  args: { id: v.id("reports") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    const r = await ctx.db.get(id);
    if (!r || r.deletedAt) return null;
    if (!(await canReadReport(ctx, agent, r))) throw new ConvexError("Accès refusé à ce rapport.");
    const category = reportCategory(r);
    const canWrite = (await canWriteReport(ctx, agent, r)) && r.status !== "VALIDE";
    const type = await ctx.db.get(r.typeId);

    // Otages (rapports d'opération).
    const hostageRows = await ctx.db.query("reportHostages").withIndex("by_report", (q) => q.eq("reportId", id)).collect();
    const hostages = [];
    for (const h of hostageRows) {
      if (h.deletedAt) continue;
      hostages.push({
        _id: h._id, citizenId: h.citizenId ?? null, name: h.name, phone: h.phone ?? "", dob: h.dob ?? "",
        deposition: h.deposition ?? "", frisk: h.frisk ?? "", photoUrl: h.photoUrl ?? null, friskPhotoUrl: h.friskPhotoUrl ?? null,
        depositionLinked: !!h.depositionNexusId,
      });
    }

    const suspects = [];
    for (const cid of r.citizenIds) {
      const c = await ctx.db.get(cid);
      if (c) suspects.push({ _id: c._id, name: `${c.prenom} ${c.nom}`, dob: c.dateNaissance ?? "" });
    }
    const contribLinks = await ctx.db
      .query("reportContributors")
      .withIndex("by_report", (q) => q.eq("reportId", id))
      .collect();
    const contributors = [];
    for (const l of contribLinks) contributors.push({ ...(await agentLabel(ctx, l.agentId)), agentId: l.agentId, manual: l.manual === true });

    const vehicles = [];
    for (const vid of r.vehicleIds ?? []) {
      const veh = await ctx.db.get(vid);
      if (veh) vehicles.push({ _id: veh._id, label: `${veh.plaque} · ${veh.modele ?? ""}`.trim() });
    }
    const weapons = [];
    for (const wid of r.weaponIds ?? []) {
      const w = await ctx.db.get(wid);
      if (w) weapons.push({ _id: w._id, label: `${w.typeName ?? ""} ${w.modele} · ${w.serial}`.trim() });
    }

    return {
      _id: r._id,
      category,
      canWrite,
      title: r.title,
      typeName: type?.name ?? "",
      status: r.status,
      lieu: r.lieu ?? "",
      factsAt: r.factsAt ?? null,
      bodycamUrl: r.bodycamUrl ?? "",
      mapX: r.mapX ?? null,
      mapY: r.mapY ?? null,
      imageUrls: r.imageUrls ?? [],
      lead: await agentLabel(ctx, r.leadId),
      leadId: r.leadId,
      scribe: r.scribeId ? await agentLabel(ctx, r.scribeId) : null,
      scribeId: r.scribeId ?? null,
      negotiator: r.negotiatorId ? await agentLabel(ctx, r.negotiatorId) : null,
      negotiatorId: r.negotiatorId ?? null,
      suspects,
      contributors,
      vehicles,
      vehicleIds: r.vehicleIds ?? [],
      weapons,
      weaponIds: r.weaponIds ?? [],
      casings: r.casings ?? [],
      hostages,
    };
  },
});

const CASING = v.object({
  serial: v.optional(v.string()),
  time: v.optional(v.string()),
  caliber: v.optional(v.string()),
  location: v.optional(v.string()),
  notes: v.optional(v.string()),
});

export const setVehicles = mutation({
  args: { reportId: v.id("reports"), vehicleIds: v.array(v.id("vehicles")) },
  handler: async (ctx, { reportId, vehicleIds }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.contribute");
    await ctx.db.patch(reportId, { vehicleIds });
    const r = await ctx.db.get(reportId);
    await writeAudit(ctx, agent, { action: "report.content_update", resourceType: "report", resourceId: reportId, resourceLabel: r?.title, metadata: { field: "vehicles" } });
  },
});

export const setWeapons = mutation({
  args: { reportId: v.id("reports"), weaponIds: v.array(v.id("weapons")) },
  handler: async (ctx, { reportId, weaponIds }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.contribute");
    await ctx.db.patch(reportId, { weaponIds });
    const r = await ctx.db.get(reportId);
    await writeAudit(ctx, agent, { action: "report.content_update", resourceType: "report", resourceId: reportId, resourceLabel: r?.title, metadata: { field: "weapons" } });
  },
});

export const setCasings = mutation({
  args: { reportId: v.id("reports"), casings: v.array(CASING) },
  handler: async (ctx, { reportId, casings }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.contribute");
    await ctx.db.patch(reportId, { casings });
    const r = await ctx.db.get(reportId);
    await writeAudit(ctx, agent, { action: "report.content_update", resourceType: "report", resourceId: reportId, resourceLabel: r?.title, metadata: { field: "casings" } });
  },
});

// Marque l'agent courant comme contributeur (agents impliqués auto, §7).
export const open = mutation({
  args: { id: v.id("reports") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.view");
    const existing = await ctx.db
      .query("reportContributors")
      .withIndex("by_report", (q) => q.eq("reportId", id))
      .collect();
    if (!existing.some((c) => c.agentId === agent._id)) {
      await ctx.db.insert("reportContributors", { reportId: id, agentId: agent._id, at: Date.now() });
    }
    const r = await ctx.db.get(id);
    await writeAudit(ctx, agent, { action: "report.open", resourceType: "report", resourceId: id, resourceLabel: r?.title });
  },
});

// Ajoute manuellement un agent aux agents impliqués (§7).
export const addContributor = mutation({
  args: { reportId: v.id("reports"), agentId: v.id("agents") },
  handler: async (ctx, { reportId, agentId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.contribute");
    const existing = await ctx.db
      .query("reportContributors")
      .withIndex("by_report", (q) => q.eq("reportId", reportId))
      .collect();
    if (!existing.some((c) => c.agentId === agentId)) {
      await ctx.db.insert("reportContributors", { reportId, agentId, at: Date.now(), manual: true });
    }
    const r = await ctx.db.get(reportId);
    await writeAudit(ctx, agent, { action: "report.contributor_add", resourceType: "report", resourceId: reportId, resourceLabel: r?.title, metadata: { agentId } });
  },
});

// Retire un agent des agents impliqués (§7).
export const removeContributor = mutation({
  args: { reportId: v.id("reports"), agentId: v.id("agents") },
  handler: async (ctx, { reportId, agentId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.contribute");
    const links = await ctx.db
      .query("reportContributors")
      .withIndex("by_report", (q) => q.eq("reportId", reportId))
      .collect();
    for (const l of links) {
      if (l.agentId === agentId) await ctx.db.delete(l._id);
    }
    const r = await ctx.db.get(reportId);
    await writeAudit(ctx, agent, { action: "report.contributor_remove", resourceType: "report", resourceId: reportId, resourceLabel: r?.title, metadata: { agentId } });
  },
});

// Ma note personnelle (privée), max 2000 caractères.
export const myNote = query({
  args: { reportId: v.id("reports") },
  handler: async (ctx, { reportId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.view");
    const note = await ctx.db
      .query("reportNotes")
      .withIndex("by_report_agent", (q) => q.eq("reportId", reportId).eq("agentId", agent._id))
      .unique();
    return note?.text ?? "";
  },
});

// Notes de tous les agents : le Lead s'en sert pour rédiger le rapport final.
export const allNotes = query({
  args: { reportId: v.id("reports") },
  handler: async (ctx, { reportId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.view");
    const rows = await ctx.db
      .query("reportNotes")
      .withIndex("by_report", (q) => q.eq("reportId", reportId))
      .collect();
    const out = [];
    for (const n of rows) {
      if (!n.text.trim()) continue;
      out.push({
        _id: n._id,
        text: n.text,
        updatedAt: n.updatedAt,
        mine: n.agentId === agent._id,
        author: await agentLabel(ctx, n.agentId),
      });
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const setNote = mutation({
  args: { reportId: v.id("reports"), text: v.string() },
  handler: async (ctx, { reportId, text }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.contribute");
    const clipped = text.slice(0, 2000);
    const existing = await ctx.db
      .query("reportNotes")
      .withIndex("by_report_agent", (q) => q.eq("reportId", reportId).eq("agentId", agent._id))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { text: clipped, updatedAt: Date.now() });
    else await ctx.db.insert("reportNotes", { reportId, agentId: agent._id, text: clipped, updatedAt: Date.now() });
    // Contribuer ajoute aux agents impliqués.
    const contribs = await ctx.db
      .query("reportContributors")
      .withIndex("by_report", (q) => q.eq("reportId", reportId))
      .collect();
    if (!contribs.some((c) => c.agentId === agent._id)) {
      await ctx.db.insert("reportContributors", { reportId, agentId: agent._id, at: Date.now() });
    }
    const r = await ctx.db.get(reportId);
    await writeAudit(ctx, agent, { action: "report.content_update", resourceType: "report", resourceId: reportId, resourceLabel: r?.title, metadata: { field: "note" } });
  },
});

export const addSuspect = mutation({
  args: { reportId: v.id("reports"), citizenId: v.id("citizens") },
  handler: async (ctx, { reportId, citizenId }) => {
    const { agent, report: r } = await requireReportWrite(ctx, reportId);
    if (!r.citizenIds.includes(citizenId)) {
      await ctx.db.patch(reportId, { citizenIds: [...r.citizenIds, citizenId] });
    }
    await writeAudit(ctx, agent, { action: "report.suspect_add", resourceType: "report", resourceId: reportId, resourceLabel: r.title, metadata: { citizenId } });
  },
});

export const removeSuspect = mutation({
  args: { reportId: v.id("reports"), citizenId: v.id("citizens") },
  handler: async (ctx, { reportId, citizenId }) => {
    const { agent, report: r } = await requireReportWrite(ctx, reportId);
    await ctx.db.patch(reportId, { citizenIds: r.citizenIds.filter((c) => c !== citizenId) });
    await writeAudit(ctx, agent, { action: "report.suspect_remove", resourceType: "report", resourceId: reportId, resourceLabel: r.title, metadata: { citizenId } });
  },
});

export const setLieu = mutation({
  args: { reportId: v.id("reports"), lieu: v.string() },
  handler: async (ctx, { reportId, lieu }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.contribute");
    await ctx.db.patch(reportId, { lieu });
    const r = await ctx.db.get(reportId);
    await writeAudit(ctx, agent, { action: "report.content_update", resourceType: "report", resourceId: reportId, resourceLabel: r?.title, metadata: { field: "lieu" } });
  },
});

export const setMapPos = mutation({
  args: { reportId: v.id("reports"), x: v.number(), y: v.number() },
  handler: async (ctx, { reportId, x, y }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.contribute");
    await ctx.db.patch(reportId, { mapX: x, mapY: y });
    const r = await ctx.db.get(reportId);
    await writeAudit(ctx, agent, { action: "report.content_update", resourceType: "report", resourceId: reportId, resourceLabel: r?.title, metadata: { field: "mapPos" } });
  },
});

export const setGallery = mutation({
  args: { reportId: v.id("reports"), imageUrls: v.array(v.string()) },
  handler: async (ctx, { reportId, imageUrls }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.contribute");
    await ctx.db.patch(reportId, { imageUrls });
    const r = await ctx.db.get(reportId);
    await writeAudit(ctx, agent, { action: "report.content_update", resourceType: "report", resourceId: reportId, resourceLabel: r?.title, metadata: { field: "gallery" } });
  },
});

export const setRole = mutation({
  args: {
    reportId: v.id("reports"),
    role: v.union(v.literal("lead"), v.literal("scribe"), v.literal("negotiator")),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, { reportId, role, agentId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.contribute");
    const patch =
      role === "lead"
        ? { leadId: agentId }
        : role === "scribe"
          ? { scribeId: agentId }
          : { negotiatorId: agentId };
    if (role === "lead" && !agentId) throw new ConvexError("Le lead opé est obligatoire.");
    await ctx.db.patch(reportId, patch);
    const r = await ctx.db.get(reportId);
    await writeAudit(ctx, agent, { action: "report.role_set", resourceType: "report", resourceId: reportId, resourceLabel: r?.title, metadata: { role, agentId } });
  },
});

export const remove = mutation({
  args: { id: v.id("reports") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.delete");
    const r = await ctx.db.get(id);
    if (!r || r.deletedAt) return;
    await ctx.db.patch(id, { deletedAt: Date.now(), deletedBy: agent._id });
    await writeAudit(ctx, agent, { action: "report.delete", resourceType: "report", resourceId: id, resourceLabel: r.title, metadata: { soft: true } });
  },
});

export const create = mutation({
  args: { typeId: v.id("reportTypes"), title: v.string() },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.create");
    const type = await ctx.db.get(args.typeId);
    if (!type) throw new ConvexError("Type de rapport introuvable.");
    const category = type.category ?? "OPERATION";
    const id = await ctx.db.insert("reports", {
      typeId: args.typeId,
      category,
      title: args.title,
      leadId: agent._id,
      status: "BROUILLON",
      citizenIds: [],
      vehicleIds: [],
      attachmentStorageIds: [],
      createdBy: agent._id,
    });
    await writeAudit(ctx, agent, { action: "report.create", resourceType: "report", resourceId: id, resourceLabel: args.title });
    return id;
  },
});

// Champs propres aux rapports personnels : date/heure des faits + lien bodycam.
export const setFacts = mutation({
  args: { reportId: v.id("reports"), factsAt: v.optional(v.number()), bodycamUrl: v.optional(v.string()) },
  handler: async (ctx, { reportId, factsAt, bodycamUrl }) => {
    const { agent, report: r } = await requireReportWrite(ctx, reportId);
    await ctx.db.patch(reportId, { factsAt, bodycamUrl: bodycamUrl?.trim() || undefined });
    await writeAudit(ctx, agent, { action: "report.content_update", resourceType: "report", resourceId: reportId, resourceLabel: r.title, metadata: { field: "facts" } });
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("reports"),
    status: v.union(v.literal("BROUILLON"), v.literal("SOUMIS"), v.literal("VALIDE")),
  },
  handler: async (ctx, { id, status }) => {
    const agent = await requireAgent(ctx);
    if (status === "VALIDE") await requirePermission(ctx, agent, "rapports.validate");
    else await requirePermission(ctx, agent, "rapports.submit");
    const patch: Record<string, unknown> = { status };
    if (status === "SOUMIS") patch.submittedAt = Date.now();
    if (status === "VALIDE") {
      patch.validatedBy = agent._id;
      patch.validatedAt = Date.now();
    }
    await ctx.db.patch(id, patch);
    await writeAudit(ctx, agent, {
      action: status === "VALIDE" ? "report.validate" : status === "SOUMIS" ? "report.submit" : "report.reopen",
      resourceType: "report",
      resourceId: id,
    });
    if (status !== "BROUILLON") {
      const r = await ctx.db.get(id);
      const type = r?.typeId ? await ctx.db.get(r.typeId) : null;
      await notify(ctx, status === "VALIDE" ? "rapport.validate" : "rapport.submit", {
        title: status === "VALIDE" ? "Rapport validé" : "Rapport soumis",
        description: r ? `**${r.title}**` : undefined,
        color: status === "VALIDE" ? NOTIFY_COLOR.accent : NOTIFY_COLOR.warning,
        fields: type ? [{ name: "Type", value: type.name, inline: true }] : undefined,
        url: await deepLink(ctx, `/rapport/${id}`),
        footer: `${status === "VALIDE" ? "Validé" : "Soumis"} par ${agent.prenomRP} ${agent.nomRP}`,
      });
    }
  },
});

// ---- Otages (rapports d'opération) ----
const HOSTAGE_FIELDS = {
  name: v.string(),
  citizenId: v.optional(v.id("citizens")),
  phone: v.optional(v.string()),
  dob: v.optional(v.string()),
  deposition: v.optional(v.string()),
  frisk: v.optional(v.string()),
  photoUrl: v.optional(v.string()),
  friskPhotoUrl: v.optional(v.string()),
};
function cleanHostage(a: Record<string, unknown>) {
  const t = (x: unknown) => (typeof x === "string" ? x.trim() || undefined : (x as undefined));
  return {
    name: String(a.name ?? "").trim(),
    citizenId: a.citizenId as Id<"citizens"> | undefined,
    phone: t(a.phone), dob: t(a.dob), deposition: t(a.deposition), frisk: t(a.frisk),
    photoUrl: t(a.photoUrl), friskPhotoUrl: t(a.friskPhotoUrl),
  };
}

export const addHostage = mutation({
  args: { reportId: v.id("reports"), ...HOSTAGE_FIELDS },
  handler: async (ctx, { reportId, ...a }) => {
    const { agent, report: r } = await requireReportWrite(ctx, reportId);
    const f = cleanHostage(a);
    if (!f.name) throw new ConvexError("Le nom de l'otage est requis.");
    const hostageId = await ctx.db.insert("reportHostages", { reportId, ...f, at: Date.now(), createdBy: agent._id });
    await writeAudit(ctx, agent, { action: "report.hostage_add", resourceType: "report", resourceId: reportId, resourceLabel: r.title, metadata: { hostageId, name: f.name } });
    return hostageId;
  },
});

export const updateHostage = mutation({
  args: { hostageId: v.id("reportHostages"), ...HOSTAGE_FIELDS },
  handler: async (ctx, { hostageId, ...a }) => {
    const h = await ctx.db.get(hostageId);
    if (!h || h.deletedAt) throw new ConvexError("Otage introuvable.");
    const { agent, report: r } = await requireReportWrite(ctx, h.reportId);
    const f = cleanHostage(a);
    if (!f.name) throw new ConvexError("Le nom de l'otage est requis.");
    await ctx.db.patch(hostageId, f);
    await writeAudit(ctx, agent, { action: "report.hostage_update", resourceType: "report", resourceId: h.reportId, resourceLabel: r.title, metadata: { hostageId, name: f.name } });
  },
});

export const removeHostage = mutation({
  args: { hostageId: v.id("reportHostages") },
  handler: async (ctx, { hostageId }) => {
    const h = await ctx.db.get(hostageId);
    if (!h || h.deletedAt) return;
    const { agent, report: r } = await requireReportWrite(ctx, h.reportId);
    await ctx.db.patch(hostageId, { deletedAt: Date.now() });
    await writeAudit(ctx, agent, { action: "report.hostage_remove", resourceType: "report", resourceId: h.reportId, resourceLabel: r.title, metadata: { hostageId, name: h.name } });
  },
});

// Enregistre l'id de la déposition Nexus créée pour cet otage (write-through client).
export const setHostageDeposition = mutation({
  args: { hostageId: v.id("reportHostages"), depositionNexusId: v.string() },
  handler: async (ctx, { hostageId, depositionNexusId }) => {
    const h = await ctx.db.get(hostageId);
    if (!h || h.deletedAt) return;
    const { agent, report: r } = await requireReportWrite(ctx, h.reportId);
    await ctx.db.patch(hostageId, { depositionNexusId });
    await writeAudit(ctx, agent, { action: "report.hostage_deposition", resourceType: "report", resourceId: h.reportId, resourceLabel: r.title, metadata: { hostageId } });
  },
});

// Recherche de rapports par titre (barre de recherche globale).
export const search = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.view");
    if (!q.trim()) return [];
    const rows = await ctx.db
      .query("reports")
      .withSearchIndex("search", (s) => s.search("title", q.trim()))
      .take(20);
    const cache = makeCache(ctx);
    const out = [];
    for (const r of rows) {
      if (r.deletedAt) continue;
      out.push({ _id: r._id, title: r.title, typeName: await cache.typeName(r.typeId), status: r.status });
    }
    return out.slice(0, 8);
  },
});
