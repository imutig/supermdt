import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission, agentLabel } from "./rbac";
import { writeAudit } from "./lib/audit";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";

export const listTypes = query({
  args: {},
  handler: async (ctx) => {
    await requireAgent(ctx);
    return (await ctx.db.query("reportTypes").collect()).filter((t) => t.active);
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
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.view");
    const reports = await ctx.db.query("reports").order("desc").take(60);
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
    await requirePermission(ctx, agent, "rapports.view");
    const r = await ctx.db.get(id);
    if (!r || r.deletedAt) return null;
    const type = await ctx.db.get(r.typeId);

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
      title: r.title,
      typeName: type?.name ?? "",
      status: r.status,
      lieu: r.lieu ?? "",
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
  },
});

export const setWeapons = mutation({
  args: { reportId: v.id("reports"), weaponIds: v.array(v.id("weapons")) },
  handler: async (ctx, { reportId, weaponIds }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.contribute");
    await ctx.db.patch(reportId, { weaponIds });
  },
});

export const setCasings = mutation({
  args: { reportId: v.id("reports"), casings: v.array(CASING) },
  handler: async (ctx, { reportId, casings }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.contribute");
    await ctx.db.patch(reportId, { casings });
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
  },
});

export const addSuspect = mutation({
  args: { reportId: v.id("reports"), citizenId: v.id("citizens") },
  handler: async (ctx, { reportId, citizenId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.contribute");
    const r = await ctx.db.get(reportId);
    if (!r) throw new Error("Rapport introuvable.");
    if (!r.citizenIds.includes(citizenId)) {
      await ctx.db.patch(reportId, { citizenIds: [...r.citizenIds, citizenId] });
    }
  },
});

export const removeSuspect = mutation({
  args: { reportId: v.id("reports"), citizenId: v.id("citizens") },
  handler: async (ctx, { reportId, citizenId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.contribute");
    const r = await ctx.db.get(reportId);
    if (!r) return;
    await ctx.db.patch(reportId, { citizenIds: r.citizenIds.filter((c) => c !== citizenId) });
  },
});

export const setLieu = mutation({
  args: { reportId: v.id("reports"), lieu: v.string() },
  handler: async (ctx, { reportId, lieu }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.contribute");
    await ctx.db.patch(reportId, { lieu });
  },
});

export const setMapPos = mutation({
  args: { reportId: v.id("reports"), x: v.number(), y: v.number() },
  handler: async (ctx, { reportId, x, y }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.contribute");
    await ctx.db.patch(reportId, { mapX: x, mapY: y });
  },
});

export const setGallery = mutation({
  args: { reportId: v.id("reports"), imageUrls: v.array(v.string()) },
  handler: async (ctx, { reportId, imageUrls }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rapports.contribute");
    await ctx.db.patch(reportId, { imageUrls });
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
    if (role === "lead" && !agentId) throw new Error("Le lead opé est obligatoire.");
    await ctx.db.patch(reportId, patch);
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
    const id = await ctx.db.insert("reports", {
      typeId: args.typeId,
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
