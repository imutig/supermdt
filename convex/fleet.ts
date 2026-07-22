import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAgent, requirePermission, agentLabel } from "./rbac";
import { writeAudit } from "./lib/audit";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Deux derniers chiffres du numéro de toit : suffixe de l'indicatif de
// patrouille (toit « 509 » -> « 09 »).
export function roofToNumber(roof: string): string {
  const digits = roof.replace(/[^0-9]/g, "");
  return digits.slice(-2).padStart(2, "0");
}

function searchText(v: { roofNumber: string; plaque: string; modele: string }) {
  return norm(`${v.roofNumber} ${v.plaque} ${v.modele}`);
}

function shape(v: Doc<"fleetVehicles">) {
  return {
    _id: v._id,
    modele: v.modele,
    plaque: v.plaque,
    roofNumber: v.roofNumber,
    number: roofToNumber(v.roofNumber),
    photoUrl: v.photoUrls?.[0] ?? null,
    active: v.active,
  };
}

// ============ Consultation ============
export const list = query({
  args: { q: v.optional(v.string()) },
  handler: async (ctx, { q }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "flotte.view");
    const rows =
      q && q.trim()
        ? await ctx.db.query("fleetVehicles").withSearchIndex("search", (s) => s.search("searchText", norm(q))).take(50)
        : await ctx.db.query("fleetVehicles").order("desc").take(200);
    return rows.map(shape);
  },
});

export const get = query({
  args: { id: v.id("fleetVehicles") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "flotte.view");
    const v = await ctx.db.get(id);
    return v ? shape(v) : null;
  },
});

// Véhicules disponibles pour créer une patrouille : recherche par toit ou plaque.
export const pick = query({
  args: { q: v.optional(v.string()) },
  handler: async (ctx, { q }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "dispatch.self");
    const rows =
      q && q.trim()
        ? await ctx.db.query("fleetVehicles").withSearchIndex("search", (s) => s.search("searchText", norm(q))).take(20)
        : await ctx.db.query("fleetVehicles").order("desc").take(20);
    // Véhicules déjà pris par une sortie ouverte : signalés, pas masqués.
    const openTrips = await ctx.db.query("fleetTrips").withIndex("by_open", (t) => t.eq("endedAt", undefined)).collect();
    const busy = new Set(openTrips.map((t) => t.fleetVehicleId as string));
    return rows
      .filter((r) => r.active)
      .map((r) => ({ ...shape(r), inUse: busy.has(r._id as string) }));
  },
});

// ============ Gestion (flotte.create / edit / delete) ============
export const create = mutation({
  args: {
    modele: v.string(),
    plaque: v.string(),
    roofNumber: v.string(),
    photoUrl: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "flotte.create");
    const modele = a.modele.trim();
    const plaque = a.plaque.trim().toUpperCase();
    const roofNumber = a.roofNumber.trim();
    if (!modele || !plaque || !roofNumber) throw new Error("Modèle, plaque et numéro de toit requis.");
    const id = await ctx.db.insert("fleetVehicles", {
      modele, plaque, roofNumber,
      photoUrls: a.photoUrl ? [a.photoUrl] : undefined,
      searchText: searchText({ modele, plaque, roofNumber }),
      active: true,
      createdBy: agent._id,
    });
    await writeAudit(ctx, agent, { action: "flotte.create", resourceType: "fleetVehicle", resourceId: id, resourceLabel: `${modele} · ${plaque}` });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("fleetVehicles"),
    modele: v.string(),
    plaque: v.string(),
    roofNumber: v.string(),
    photoUrl: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...a }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "flotte.edit");
    const cur = await ctx.db.get(id);
    if (!cur) throw new Error("Véhicule introuvable.");
    const modele = a.modele.trim();
    const plaque = a.plaque.trim().toUpperCase();
    const roofNumber = a.roofNumber.trim();
    if (!modele || !plaque || !roofNumber) throw new Error("Modèle, plaque et numéro de toit requis.");
    await ctx.db.patch(id, {
      modele, plaque, roofNumber,
      photoUrls: a.photoUrl ? [a.photoUrl] : [],
      searchText: searchText({ modele, plaque, roofNumber }),
      active: a.active ?? cur.active,
    });
    await writeAudit(ctx, agent, { action: "flotte.edit", resourceType: "fleetVehicle", resourceId: id, resourceLabel: `${modele} · ${plaque}` });
  },
});

export const remove = mutation({
  args: { id: v.id("fleetVehicles") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "flotte.delete");
    const v = await ctx.db.get(id);
    // Les sorties conservent leur snapshot (roofNumber, vehicleLabel) : leur
    // historique reste lisible après la suppression du véhicule.
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, { action: "flotte.delete", resourceType: "fleetVehicle", resourceId: id, resourceLabel: v ? `${v.modele} · ${v.plaque}` : "" });
  },
});

// ============ Sorties ============
export const trips = query({
  args: { vehicleId: v.optional(v.id("fleetVehicles")) },
  handler: async (ctx, { vehicleId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "flotte.view");
    const rows = vehicleId
      ? await ctx.db.query("fleetTrips").withIndex("by_vehicle", (t) => t.eq("fleetVehicleId", vehicleId)).order("desc").take(100)
      : await ctx.db.query("fleetTrips").order("desc").take(100);
    const out = [];
    for (const t of rows) {
      out.push({
        _id: t._id,
        roofNumber: t.roofNumber,
        vehicleLabel: t.vehicleLabel,
        startedBy: (await agentLabel(ctx, t.startedBy)).name,
        startedAt: t.startedAt,
        endedAt: t.endedAt ?? null,
        ongoing: t.endedAt == null,
        memberCount: (await ctx.db.query("fleetTripMembers").withIndex("by_trip", (m) => m.eq("tripId", t._id)).collect()).length,
      });
    }
    return out;
  },
});

// Détail d'une sortie : tous les agents passés, avec leurs horaires.
export const tripMembers = query({
  args: { tripId: v.id("fleetTrips") },
  handler: async (ctx, { tripId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "flotte.view");
    const rows = await ctx.db.query("fleetTripMembers").withIndex("by_trip", (m) => m.eq("tripId", tripId)).collect();
    const out = [];
    for (const m of rows) {
      out.push({
        _id: m._id,
        ...(await agentLabel(ctx, m.agentId)),
        joinedAt: m.joinedAt,
        leftAt: m.leftAt ?? null,
      });
    }
    return out.sort((a, b) => a.joinedAt - b.joinedAt);
  },
});

// ============ Cycle de vie, appelé depuis le dispatch ============
// Ouvre une sortie pour une patrouille prenant un véhicule LSPD, et y inscrit
// les membres présents.
export async function openTrip(
  ctx: MutationCtx,
  patrolId: Id<"patrols">,
  fleetVehicleId: Id<"fleetVehicles">,
  startedBy: Id<"agents">,
  memberIds: Id<"agents">[],
) {
  const veh = await ctx.db.get(fleetVehicleId);
  if (!veh) return;
  const now = Date.now();
  const tripId = await ctx.db.insert("fleetTrips", {
    fleetVehicleId,
    patrolId,
    roofNumber: veh.roofNumber,
    vehicleLabel: `${veh.modele} · ${veh.plaque}`,
    startedBy,
    startedAt: now,
  });
  for (const agentId of memberIds) {
    await ctx.db.insert("fleetTripMembers", { tripId, agentId, joinedAt: now });
  }
}

async function openTripOf(ctx: MutationCtx, patrolId: Id<"patrols">) {
  return await ctx.db
    .query("fleetTrips")
    .withIndex("by_patrol_open", (t) => t.eq("patrolId", patrolId).eq("endedAt", undefined))
    .first();
}

export async function tripAddMember(ctx: MutationCtx, patrolId: Id<"patrols">, agentId: Id<"agents">) {
  const trip = await openTripOf(ctx, patrolId);
  if (!trip) return;
  // Ne pas rouvrir une ligne déjà ouverte pour le même agent.
  const already = await ctx.db
    .query("fleetTripMembers")
    .withIndex("by_trip_agent_open", (m) => m.eq("tripId", trip._id).eq("agentId", agentId).eq("leftAt", undefined))
    .first();
  if (already) return;
  await ctx.db.insert("fleetTripMembers", { tripId: trip._id, agentId, joinedAt: Date.now() });
}

export async function tripRemoveMember(ctx: MutationCtx, patrolId: Id<"patrols">, agentId: Id<"agents">) {
  const trip = await openTripOf(ctx, patrolId);
  if (!trip) return;
  const open = await ctx.db
    .query("fleetTripMembers")
    .withIndex("by_trip_agent_open", (m) => m.eq("tripId", trip._id).eq("agentId", agentId).eq("leftAt", undefined))
    .first();
  if (open) await ctx.db.patch(open._id, { leftAt: Date.now() });
}

// Clôture la sortie d'une patrouille (rentrée) : ferme le trip et solde les
// membres encore présents.
export async function closeTrip(ctx: MutationCtx, patrolId: Id<"patrols">) {
  const trip = await openTripOf(ctx, patrolId);
  if (!trip) return;
  const now = Date.now();
  const openMembers = await ctx.db.query("fleetTripMembers").withIndex("by_trip", (m) => m.eq("tripId", trip._id)).collect();
  for (const m of openMembers) {
    if (m.leftAt == null) await ctx.db.patch(m._id, { leftAt: now });
  }
  await ctx.db.patch(trip._id, { endedAt: now });
}

// Membres actuellement présents dans la patrouille : sert à repeupler une
// nouvelle sortie lors d'un changement de véhicule.
export async function currentPatrolMembers(ctx: QueryCtx, patrolId: Id<"patrols">) {
  const links = await ctx.db.query("patrolMembers").withIndex("by_patrol", (m) => m.eq("patrolId", patrolId)).collect();
  return links.map((l) => l.agentId);
}
