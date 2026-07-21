import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";
import { touchStats } from "./stats";

function buildVehicleSearch(veh: {
  plaque: string;
  modele?: string;
  couleur?: string;
  type?: string;
}) {
  return `${veh.plaque} ${veh.modele ?? ""} ${veh.couleur ?? ""} ${veh.type ?? ""}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export const byOwner = query({
  args: { citizenId: v.id("citizens") },
  handler: async (ctx, { citizenId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "vehicules.view");
    const vehicles = await ctx.db
      .query("vehicles")
      .withIndex("by_owner", (q) => q.eq("ownerId", citizenId))
      .collect();
    const out = [];
    for (const veh of vehicles) {
      const flagLinks = await ctx.db
        .query("vehicleFlags")
        .withIndex("by_vehicle", (q) => q.eq("vehicleId", veh._id))
        .collect();
      const flags: string[] = [];
      for (const f of flagLinks.filter((x) => x.active)) {
        const t = await ctx.db.get(f.flagTypeId);
        if (t) flags.push(t.name);
      }
      out.push({
        _id: veh._id,
        plaque: veh.plaque,
        modele: veh.modele ?? "-",
        couleur: veh.couleur ?? "-",
        type: veh.type ?? "-",
        photoUrl: veh.photoUrls?.[0] ?? null,
        flags,
      });
    }
    return out;
  },
});

// Registre complet des véhicules (page dédiée), avec recherche optionnelle.
export const list = query({
  args: { q: v.optional(v.string()) },
  handler: async (ctx, { q }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "vehicules.view");
    const needle = (q ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    let rows;
    if (needle) {
      rows = await ctx.db.query("vehicles").withSearchIndex("search", (s) => s.search("searchText", needle)).take(200);
    } else {
      rows = await ctx.db.query("vehicles").order("desc").take(300);
    }
    const out = [];
    for (const veh of rows) {
      const owner = veh.ownerId ? await ctx.db.get(veh.ownerId) : null;
      const flagLinks = await ctx.db
        .query("vehicleFlags")
        .withIndex("by_vehicle", (qq) => qq.eq("vehicleId", veh._id))
        .collect();
      const flags: string[] = [];
      for (const f of flagLinks.filter((x) => x.active)) {
        const t = await ctx.db.get(f.flagTypeId);
        if (t) flags.push(t.name);
      }
      out.push({
        _id: veh._id,
        plaque: veh.plaque,
        modele: veh.modele ?? "-",
        couleur: veh.couleur ?? "-",
        type: veh.type ?? "-",
        ownerId: veh.ownerId ?? null,
        ownerName: owner ? `${owner.prenom} ${owner.nom}` : null,
        photoUrl: veh.photoUrls?.[0] ?? null,
        flags,
      });
    }
    return out;
  },
});

// Pagination serveur (curseur) pour le registre en mode navigation (sans recherche).
export const page = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "vehicules.view");
    const res = await ctx.db.query("vehicles").order("desc").paginate(paginationOpts);
    const rows = [];
    for (const veh of res.page) {
      const owner = veh.ownerId ? await ctx.db.get(veh.ownerId) : null;
      const flagLinks = await ctx.db.query("vehicleFlags").withIndex("by_vehicle", (qq) => qq.eq("vehicleId", veh._id)).collect();
      const flags: string[] = [];
      for (const f of flagLinks.filter((x) => x.active)) { const t = await ctx.db.get(f.flagTypeId); if (t) flags.push(t.name); }
      rows.push({ _id: veh._id, plaque: veh.plaque, modele: veh.modele ?? "-", couleur: veh.couleur ?? "-", type: veh.type ?? "-", ownerId: veh.ownerId ?? null, ownerName: owner ? `${owner.prenom} ${owner.nom}` : null, photoUrl: veh.photoUrls?.[0] ?? null, flags });
    }
    return { ...res, page: rows };
  },
});

// Fiche véhicule complète (modal, point 7).
export const get = query({
  args: { id: v.id("vehicles") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "vehicules.view");
    const veh = await ctx.db.get(id);
    if (!veh) return null;
    const owner = veh.ownerId ? await ctx.db.get(veh.ownerId) : null;
    const flagLinks = await ctx.db
      .query("vehicleFlags")
      .withIndex("by_vehicle", (q) => q.eq("vehicleId", veh._id))
      .collect();
    const flags = [];
    for (const fl of flagLinks.filter((x) => x.active)) {
      const t = await ctx.db.get(fl.flagTypeId);
      if (t) flags.push({ _id: fl._id, flagTypeId: fl.flagTypeId, name: t.name, color: t.color ?? null });
    }
    return {
      _id: veh._id,
      plaque: veh.plaque,
      modele: veh.modele ?? "",
      couleur: veh.couleur ?? "",
      type: veh.type ?? "",
      notes: veh.notes ?? "",
      ownerId: veh.ownerId ?? null,
      ownerName: owner ? `${owner.prenom} ${owner.nom}` : null,
      photoUrl: veh.photoUrls?.[0] ?? null,
      flags,
    };
  },
});

// Où ce véhicule a participé : dossiers d'arrestation + rapports (item 6).
export const participation = query({
  args: { id: v.id("vehicles") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "vehicules.view");
    const dossiers = [];
    const entries = await ctx.db.query("casierEntries").order("desc").take(400);
    for (const e of entries) {
      if (e.deletedAt || !(e.vehicleIds ?? []).includes(id)) continue;
      const c = await ctx.db.get(e.citizenId);
      dossiers.push({ _id: e._id, citizenId: e.citizenId, label: c ? `${c.prenom} ${c.nom}` : "-", at: e.at });
    }
    const reports = [];
    const reps = await ctx.db.query("reports").order("desc").take(400);
    for (const r of reps) {
      if (r.deletedAt || !(r.vehicleIds ?? []).includes(id)) continue;
      reports.push({ _id: r._id, title: r.title, at: r._creationTime });
    }
    return { dossiers, reports };
  },
});

// Résumé pour les pickers (dossiers, rapports).
export const pickerList = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "vehicules.view");
    const rows = await ctx.db.query("vehicles").order("desc").take(300);
    return rows.map((v) => ({ _id: v._id, label: `${v.plaque} · ${v.modele ?? ""}`.trim() }));
  },
});

// Types de flag véhicule disponibles.
export const flagTypes = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "vehicules.view");
    return (await ctx.db.query("vehicleFlagTypes").collect())
      .filter((t) => t.active)
      .sort((a, b) => a.position - b.position)
      .map((t) => ({ _id: t._id, name: t.name, color: t.color ?? null }));
  },
});

export const setFlag = mutation({
  args: { vehicleId: v.id("vehicles"), flagTypeId: v.id("vehicleFlagTypes"), note: v.optional(v.string()) },
  handler: async (ctx, { vehicleId, flagTypeId, note }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "vehicules.flag");
    const existing = (
      await ctx.db
        .query("vehicleFlags")
        .withIndex("by_vehicle", (q) => q.eq("vehicleId", vehicleId))
        .collect()
    ).find((f) => f.flagTypeId === flagTypeId);
    if (existing) {
      await ctx.db.patch(existing._id, { active: true, note });
    } else {
      await ctx.db.insert("vehicleFlags", { vehicleId, flagTypeId, note, active: true, byAgentId: agent._id, at: Date.now() });
    }
    const veh = await ctx.db.get(vehicleId);
    const t = await ctx.db.get(flagTypeId);
    await writeAudit(ctx, agent, {
      action: "vehicle.flag_set",
      resourceType: "vehicle",
      resourceId: vehicleId,
      resourceLabel: veh?.plaque,
      metadata: { flag: t?.name },
    });
  },
});

export const removeFlag = mutation({
  args: { id: v.id("vehicleFlags") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "vehicules.flag");
    const f = await ctx.db.get(id);
    if (!f) return;
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, { action: "vehicle.flag_remove", resourceType: "vehicle", resourceId: f.vehicleId });
  },
});

// Recherche véhicule par plaque (barre de recherche globale, point 7).
export const search = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "vehicules.view");
    if (!q.trim()) return [];
    const needle = q
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
    const rows = await ctx.db
      .query("vehicles")
      .withSearchIndex("search", (s) => s.search("searchText", needle))
      .take(10);
    const out = [];
    for (const veh of rows) {
      const owner = veh.ownerId ? await ctx.db.get(veh.ownerId) : null;
      out.push({
        _id: veh._id,
        plaque: veh.plaque,
        modele: veh.modele ?? "-",
        ownerId: veh.ownerId ?? null,
        ownerName: owner ? `${owner.prenom} ${owner.nom}` : null,
      });
    }
    return out;
  },
});

export const create = mutation({
  args: {
    plaque: v.string(),
    modele: v.optional(v.string()),
    couleur: v.optional(v.string()),
    type: v.optional(v.string()),
    ownerId: v.id("citizens"), // propriétaire obligatoire (§6)
    notes: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "vehicules.create");
    const plaque = args.plaque.trim().toUpperCase();
    const existing = await ctx.db
      .query("vehicles")
      .withIndex("by_plaque", (q) => q.eq("plaque", plaque))
      .unique();
    if (existing) return existing._id;
    const id = await ctx.db.insert("vehicles", {
      plaque,
      modele: args.modele,
      couleur: args.couleur,
      type: args.type,
      ownerId: args.ownerId,
      notes: args.notes,
      photoStorageIds: [],
      photoUrls: args.photoUrl ? [args.photoUrl] : undefined,
      searchText: buildVehicleSearch({ ...args, plaque }),
      createdBy: agent._id,
    });
    await writeAudit(ctx, agent, {
      action: "vehicle.create",
      resourceType: "vehicle",
      resourceId: id,
      resourceLabel: plaque,
      metadata: { modele: args.modele, ownerId: args.ownerId },
    });
    await touchStats(ctx);
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("vehicles"),
    plaque: v.string(),
    modele: v.optional(v.string()),
    couleur: v.optional(v.string()),
    type: v.optional(v.string()),
    ownerId: v.optional(v.id("citizens")),
    notes: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
  },
  handler: async (ctx, { id, photoUrl, ...fields }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "vehicules.edit");
    const before = await ctx.db.get(id);
    if (!before) throw new Error("Véhicule introuvable.");
    const plaque = fields.plaque.trim().toUpperCase();
    await ctx.db.patch(id, {
      ...fields,
      photoUrls: photoUrl ? [photoUrl] : [],
      plaque,
      searchText: buildVehicleSearch({ ...fields, plaque }),
    });
    await writeAudit(ctx, agent, {
      action: "vehicle.update",
      resourceType: "vehicle",
      resourceId: id,
      resourceLabel: plaque,
      before: { plaque: before.plaque, modele: before.modele, couleur: before.couleur },
      after: { plaque, modele: fields.modele, couleur: fields.couleur },
    });
  },
});

export const remove = mutation({
  args: { id: v.id("vehicles") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "vehicules.edit");
    const veh = await ctx.db.get(id);
    if (!veh) throw new Error("Véhicule introuvable.");
    const flags = await ctx.db
      .query("vehicleFlags")
      .withIndex("by_vehicle", (q) => q.eq("vehicleId", id))
      .collect();
    for (const f of flags) await ctx.db.delete(f._id);
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, {
      action: "vehicle.delete",
      resourceType: "vehicle",
      resourceId: id,
      resourceLabel: veh.plaque,
    });
    await touchStats(ctx);
  },
});
