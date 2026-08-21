import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireCaseRead, requireCaseWrite } from "./lib/detectiveAccess";
import { writeAudit } from "./lib/audit";

// Tableau d'enquête (murder board). Chaque nœud référence une entité
// (personne, véhicule, pièce, preuve, gang, évènement, point stup) ou du texte
// libre, et stocke ses coords. Les liens relient deux nœuds (fils rouges).

const REF_TYPE = v.union(
  v.literal("PERSON"), v.literal("VEHICLE"), v.literal("ITEM"), v.literal("EVIDENCE"),
  v.literal("GANG"), v.literal("EVENT"), v.literal("DRUGSITE"), v.literal("TEXT"),
);

const ITEM_TYPE_LABEL: Record<string, string> = {
  REPORT: "Rapport", INTERROGATION: "Interrogatoire", AUDITION: "Audition",
  PHOTO: "Photo", LOCATION: "Lieu", NOTE: "Note",
};

// Résout un aperçu (titre + sous-titre + lien) pour un nœud selon son type.
async function resolveRef(ctx: QueryCtx, refType: string, refId?: string): Promise<{ title: string; subtitle: string; link: string | null; missing: boolean }> {
  if (!refId || refType === "TEXT") return { title: "", subtitle: "", link: null, missing: false };
  try {
    if (refType === "PERSON") {
      const p = await ctx.db.get(refId as Doc<"dbPersons">["_id"]);
      if (!p || p.deletedAt) return miss();
      return { title: p.name, subtitle: p.alias ? `alias « ${p.alias} »` : (p.role ?? "Personne"), link: `person:${p._id}`, missing: false };
    }
    if (refType === "VEHICLE") {
      const veh = await ctx.db.get(refId as Doc<"vehicles">["_id"]);
      if (!veh || veh.deletedAt) return miss();
      return { title: veh.plaque, subtitle: veh.modele ?? "Véhicule", link: `vehicle:${veh._id}`, missing: false };
    }
    if (refType === "ITEM") {
      const it = await ctx.db.get(refId as Doc<"dbItems">["_id"]);
      if (!it || it.deletedAt) return miss();
      return { title: it.title || ITEM_TYPE_LABEL[it.type] || "Pièce", subtitle: ITEM_TYPE_LABEL[it.type] ?? "", link: `item:${it._id}`, missing: false };
    }
    if (refType === "EVIDENCE") {
      const e = await ctx.db.get(refId as Doc<"dbEvidence">["_id"]);
      if (!e || e.deletedAt) return miss();
      return { title: e.label, subtitle: "Preuve", link: `evidence:${e._id}`, missing: false };
    }
    if (refType === "GANG") {
      const g = await ctx.db.get(refId as Doc<"dbGangs">["_id"]);
      if (!g || g.deletedAt) return miss();
      return { title: g.name, subtitle: g.orgType, link: `gang:${g._id}`, missing: false };
    }
    if (refType === "EVENT") {
      const ev = await ctx.db.get(refId as Doc<"dbTimeline">["_id"]);
      if (!ev || ev.deletedAt) return miss();
      return { title: ev.label, subtitle: "Chronologie", link: `event:${ev._id}`, missing: false };
    }
    if (refType === "DRUGSITE") {
      const d = await ctx.db.get(refId as Doc<"dbDrugSites">["_id"]);
      if (!d || d.deletedAt) return miss();
      return { title: d.name, subtitle: d.kind === "LABO" ? "Labo" : "Point de vente", link: `drugsite:${d._id}`, missing: false };
    }
  } catch {
    return miss();
  }
  return { title: "", subtitle: "", link: null, missing: false };
  function miss() { return { title: "(supprimé)", subtitle: "", link: null, missing: true }; }
}

export const board = query({
  args: { caseId: v.id("dbCases") },
  handler: async (ctx, { caseId }) => {
    await requireCaseRead(ctx, caseId);
    const nodes = await ctx.db.query("dbBoardNodes").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect();
    const edges = await ctx.db.query("dbBoardEdges").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect();
    const outNodes = [];
    for (const n of nodes) {
      const ref = await resolveRef(ctx, n.refType, n.refId);
      outNodes.push({
        _id: n._id, x: n.x, y: n.y, refType: n.refType, refId: n.refId ?? null,
        label: n.label ?? "", note: n.note ?? "", color: n.color ?? null,
        title: ref.title, subtitle: ref.subtitle, link: ref.link, missing: ref.missing,
      });
    }
    return {
      nodes: outNodes,
      edges: edges.map((e) => ({ _id: e._id, fromNodeId: e.fromNodeId, toNodeId: e.toNodeId, label: e.label ?? "", color: e.color ?? null })),
    };
  },
});

export const addNode = mutation({
  args: {
    caseId: v.id("dbCases"),
    x: v.number(), y: v.number(),
    refType: REF_TYPE,
    refId: v.optional(v.string()),
    label: v.optional(v.string()),
    note: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { agent } = await requireCaseWrite(ctx, args.caseId);
    const nodeId = await ctx.db.insert("dbBoardNodes", {
      caseId: args.caseId, x: args.x, y: args.y, refType: args.refType,
      refId: args.refId, label: args.label?.trim() || undefined,
      note: args.note?.trim() || undefined, color: args.color,
    });
    await writeAudit(ctx, agent, {
      action: "detective.board_node_add", resourceType: "dbBoardNode",
      resourceId: nodeId, resourceLabel: args.label?.trim() || undefined,
      metadata: { refType: args.refType },
    });
    return nodeId;
  },
});

// Déplacement fréquent : mutation légère dédiée.
export const moveNode = mutation({
  args: { id: v.id("dbBoardNodes"), x: v.number(), y: v.number() },
  handler: async (ctx, { id, x, y }) => {
    const n = await ctx.db.get(id);
    if (!n) return;
    const { agent } = await requireCaseWrite(ctx, n.caseId);
    await ctx.db.patch(id, { x, y });
    await writeAudit(ctx, agent, {
      action: "detective.board_node_move", resourceType: "dbBoardNode",
      resourceId: id, metadata: { x, y },
    });
  },
});

export const updateNode = mutation({
  args: {
    id: v.id("dbBoardNodes"),
    label: v.optional(v.string()),
    note: v.optional(v.string()),
    color: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { id, ...patch }) => {
    const n = await ctx.db.get(id);
    if (!n) return;
    const { agent } = await requireCaseWrite(ctx, n.caseId);
    const up: Record<string, unknown> = {};
    if (patch.label !== undefined) up.label = patch.label.trim() || undefined;
    if (patch.note !== undefined) up.note = patch.note.trim() || undefined;
    if (patch.color !== undefined) up.color = patch.color ?? undefined;
    await ctx.db.patch(id, up);
    await writeAudit(ctx, agent, {
      action: "detective.board_node_update", resourceType: "dbBoardNode",
      resourceId: id, resourceLabel: n.label || undefined,
    });
  },
});

export const removeNode = mutation({
  args: { id: v.id("dbBoardNodes") },
  handler: async (ctx, { id }) => {
    const n = await ctx.db.get(id);
    if (!n) return;
    const { agent } = await requireCaseWrite(ctx, n.caseId);
    // Supprime aussi les liens qui touchent ce nœud.
    const edges = await ctx.db.query("dbBoardEdges").withIndex("by_case", (x) => x.eq("caseId", n.caseId)).collect();
    for (const e of edges) if (e.fromNodeId === id || e.toNodeId === id) await ctx.db.delete(e._id);
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, {
      action: "detective.board_node_remove", resourceType: "dbBoardNode",
      resourceId: id, resourceLabel: n.label || undefined,
    });
  },
});

export const addEdge = mutation({
  args: {
    caseId: v.id("dbCases"),
    fromNodeId: v.id("dbBoardNodes"),
    toNodeId: v.id("dbBoardNodes"),
    label: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, { caseId, fromNodeId, toNodeId, label, color }) => {
    const { agent } = await requireCaseWrite(ctx, caseId);
    if (fromNodeId === toNodeId) throw new ConvexError("Un lien doit relier deux nœuds différents.");
    const existing = await ctx.db.query("dbBoardEdges").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect();
    if (existing.some((e) => (e.fromNodeId === fromNodeId && e.toNodeId === toNodeId) || (e.fromNodeId === toNodeId && e.toNodeId === fromNodeId))) {
      throw new ConvexError("Ces deux nœuds sont déjà reliés.");
    }
    const edgeId = await ctx.db.insert("dbBoardEdges", { caseId, fromNodeId, toNodeId, label: label?.trim() || undefined, color });
    await writeAudit(ctx, agent, {
      action: "detective.board_edge_add", resourceType: "dbBoardEdge",
      resourceId: edgeId, resourceLabel: label?.trim() || undefined,
    });
    return edgeId;
  },
});

export const updateEdge = mutation({
  args: { id: v.id("dbBoardEdges"), label: v.optional(v.string()), color: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { id, ...patch }) => {
    const e = await ctx.db.get(id);
    if (!e) return;
    const { agent } = await requireCaseWrite(ctx, e.caseId);
    const up: Record<string, unknown> = {};
    if (patch.label !== undefined) up.label = patch.label.trim() || undefined;
    if (patch.color !== undefined) up.color = patch.color ?? undefined;
    await ctx.db.patch(id, up);
    await writeAudit(ctx, agent, {
      action: "detective.board_edge_update", resourceType: "dbBoardEdge",
      resourceId: id, resourceLabel: e.label || undefined,
    });
  },
});

export const removeEdge = mutation({
  args: { id: v.id("dbBoardEdges") },
  handler: async (ctx, { id }) => {
    const e = await ctx.db.get(id);
    if (!e) return;
    const { agent } = await requireCaseWrite(ctx, e.caseId);
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, {
      action: "detective.board_edge_remove", resourceType: "dbBoardEdge",
      resourceId: id, resourceLabel: e.label || undefined,
    });
  },
});

// Aperçu détaillé d'un nœud au survol (chargé à la demande).
export const nodePreview = query({
  args: { id: v.id("dbBoardNodes") },
  handler: async (ctx, { id }) => {
    const n = await ctx.db.get(id);
    if (!n) return null;
    await requireCaseRead(ctx, n.caseId);
    if (n.refType === "PERSON" && n.refId) {
      const p = await ctx.db.get(n.refId as Doc<"dbPersons">["_id"]);
      if (p && !p.deletedAt) return { kind: "PERSON", name: p.name, alias: p.alias ?? "", role: p.role ?? "", notes: p.notes ?? "", photoUrl: p.photoUrl ?? null };
    }
    if (n.refType === "ITEM" && n.refId) {
      const it = await ctx.db.get(n.refId as Doc<"dbItems">["_id"]);
      if (it && !it.deletedAt) return { kind: "ITEM", type: it.type, title: it.title ?? "", body: it.body ?? "", authorName: it.authorName };
    }
    if (n.refType === "EVENT" && n.refId) {
      const ev = await ctx.db.get(n.refId as Doc<"dbTimeline">["_id"]);
      if (ev && !ev.deletedAt) return { kind: "EVENT", label: ev.label, body: ev.body ?? "", authorName: ev.authorName, at: ev.at };
    }
    return { kind: n.refType, label: n.label ?? "", note: n.note ?? "" };
  },
});

// Options de nœuds ajoutables depuis les entités déjà présentes dans l'enquête.
export const nodeOptions = query({
  args: { caseId: v.id("dbCases") },
  handler: async (ctx, { caseId }) => {
    await requireCaseRead(ctx, caseId);
    const persons = await ctx.db.query("dbCasePersons").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect();
    const personOpts = [];
    for (const cp of persons) {
      const p = await ctx.db.get(cp.personId);
      if (p && !p.deletedAt) personOpts.push({ refType: "PERSON" as const, refId: p._id as string, label: p.name, subtitle: cp.caseRole });
    }
    const items = (await ctx.db.query("dbItems").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect()).filter((i) => !i.deletedAt);
    const itemOpts = items.map((i) => ({ refType: "ITEM" as const, refId: i._id as string, label: i.title || ITEM_TYPE_LABEL[i.type], subtitle: ITEM_TYPE_LABEL[i.type] }));
    const vehicles = await ctx.db.query("dbCaseVehicles").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect();
    const vehOpts = [];
    for (const cv of vehicles) {
      const veh = cv.vehicleId ? await ctx.db.get(cv.vehicleId) : null;
      const plaque = veh && !veh.deletedAt ? veh.plaque : (cv.plaque ?? "");
      if (plaque) vehOpts.push({ refType: "VEHICLE" as const, refId: (cv.vehicleId ?? "") as string, label: plaque, subtitle: cv.label ?? "Véhicule" });
    }
    const evidence = (await ctx.db.query("dbEvidence").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect()).filter((e) => !e.deletedAt);
    const evOpts = evidence.map((e) => ({ refType: "EVIDENCE" as const, refId: e._id as string, label: e.label, subtitle: "Preuve" }));
    const gangsLinked = await ctx.db.query("dbCaseGangs").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect();
    const gangOpts = [];
    for (const cg of gangsLinked) {
      const g = await ctx.db.get(cg.gangId);
      if (g && !g.deletedAt) gangOpts.push({ refType: "GANG" as const, refId: g._id as string, label: g.name, subtitle: g.orgType });
    }
    const events = (await ctx.db.query("dbTimeline").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect())
      .filter((e) => !e.deletedAt).sort((a, b) => b.at - a.at).slice(0, 40);
    const eventOpts = events.map((e) => ({ refType: "EVENT" as const, refId: e._id as string, label: e.label, subtitle: "Chronologie" }));
    return { persons: personOpts, items: itemOpts, vehicles: vehOpts, evidence: evOpts, gangs: gangOpts, events: eventOpts };
  },
});
