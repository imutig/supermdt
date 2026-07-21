import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";

type Node = { _id: Id<"citizens">; name: string; sexe: string | null; dob: string | null; deceased: boolean };

async function node(ctx: QueryCtx, id: Id<"citizens">): Promise<Node | null> {
  const c = await ctx.db.get(id);
  if (!c) return null;
  return { _id: c._id, name: `${c.prenom} ${c.nom}`, sexe: c.sexe ?? null, dob: c.dateNaissance ?? null, deceased: c.deceased === true };
}

// Parents directs d'un citoyen (rows PARENT où toId = citizen).
async function parentsOf(ctx: QueryCtx, id: Id<"citizens">) {
  const rows = await ctx.db.query("citizenRelations").withIndex("by_to", (q) => q.eq("toId", id)).collect();
  return rows.filter((r) => r.kind === "PARENT");
}
// Enfants directs (rows PARENT où fromId = citizen).
async function childrenOf(ctx: QueryCtx, id: Id<"citizens">) {
  const rows = await ctx.db.query("citizenRelations").withIndex("by_from", (q) => q.eq("fromId", id)).collect();
  return rows.filter((r) => r.kind === "PARENT");
}

// Arbre familial : grands-parents, parents, fratrie, conjoints, self, enfants, petits-enfants.
export const family = query({
  args: { citizenId: v.id("citizens") },
  handler: async (ctx, { citizenId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "citoyens.view");
    const self = await node(ctx, citizenId);
    if (!self) return null;

    // Parents + grands-parents
    const parentRows = await parentsOf(ctx, citizenId);
    const parents = [];
    for (const pr of parentRows) {
      const p = await node(ctx, pr.fromId);
      if (!p) continue;
      const gpRows = await parentsOf(ctx, pr.fromId);
      const grandparents = [];
      for (const g of gpRows) { const gn = await node(ctx, g.fromId); if (gn) grandparents.push({ ...gn, relationId: g._id }); }
      parents.push({ ...p, relationId: pr._id, grandparents });
    }

    // Enfants + petits-enfants
    const childRows = await childrenOf(ctx, citizenId);
    const children = [];
    for (const cr of childRows) {
      const ch = await node(ctx, cr.toId);
      if (!ch) continue;
      const gcRows = await childrenOf(ctx, cr.toId);
      const grandchildren = [];
      for (const g of gcRows) { const gn = await node(ctx, g.toId); if (gn) grandchildren.push({ ...gn, relationId: g._id }); }
      children.push({ ...ch, relationId: cr._id, grandchildren });
    }

    // Fratrie : enfants des parents (hors self), dédupliqués.
    const siblingMap = new Map<string, { node: Node; relationId: Id<"citizenRelations"> }>();
    for (const pr of parentRows) {
      const co = await childrenOf(ctx, pr.fromId);
      for (const c of co) {
        if (c.toId === citizenId) continue;
        if (!siblingMap.has(c.toId)) {
          const n = await node(ctx, c.toId);
          if (n) siblingMap.set(c.toId, { node: n, relationId: c._id });
        }
      }
    }
    // Fratrie explicite (SIBLING)
    const sibRows = [
      ...(await ctx.db.query("citizenRelations").withIndex("by_from", (q) => q.eq("fromId", citizenId)).collect()),
      ...(await ctx.db.query("citizenRelations").withIndex("by_to", (q) => q.eq("toId", citizenId)).collect()),
    ].filter((r) => r.kind === "SIBLING");
    for (const sr of sibRows) {
      const otherId = sr.fromId === citizenId ? sr.toId : sr.fromId;
      if (!siblingMap.has(otherId)) {
        const n = await node(ctx, otherId);
        if (n) siblingMap.set(otherId, { node: n, relationId: sr._id });
      }
    }
    const siblings = [...siblingMap.values()].map((s) => ({ ...s.node, relationId: s.relationId }));

    // Conjoints (SPOUSE symétrique)
    const spouseRows = [
      ...(await ctx.db.query("citizenRelations").withIndex("by_from", (q) => q.eq("fromId", citizenId)).collect()),
      ...(await ctx.db.query("citizenRelations").withIndex("by_to", (q) => q.eq("toId", citizenId)).collect()),
    ].filter((r) => r.kind === "SPOUSE");
    const spouses = [];
    for (const sr of spouseRows) {
      const otherId = sr.fromId === citizenId ? sr.toId : sr.fromId;
      const n = await node(ctx, otherId);
      if (n) spouses.push({ ...n, relationId: sr._id });
    }

    return { self, parents, children, siblings, spouses };
  },
});

export const add = mutation({
  args: {
    citizenId: v.id("citizens"),
    otherId: v.id("citizens"),
    role: v.union(v.literal("parent"), v.literal("child"), v.literal("spouse"), v.literal("sibling")),
  },
  handler: async (ctx, { citizenId, otherId, role }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "citoyens.edit");
    if (citizenId === otherId) throw new Error("Un citoyen ne peut pas être en relation avec lui-même.");
    const other = await ctx.db.get(otherId);
    if (!other) throw new Error("Citoyen introuvable.");

    // Détermine l'arête à insérer.
    let fromId: Id<"citizens">, toId: Id<"citizens">, kind: "PARENT" | "SPOUSE" | "SIBLING";
    if (role === "parent") { fromId = otherId; toId = citizenId; kind = "PARENT"; }
    else if (role === "child") { fromId = citizenId; toId = otherId; kind = "PARENT"; }
    else if (role === "spouse") { fromId = citizenId; toId = otherId; kind = "SPOUSE"; }
    else { fromId = citizenId; toId = otherId; kind = "SIBLING"; }

    // Anti-doublon (dans les deux sens pour les liens symétriques).
    const existing = await ctx.db.query("citizenRelations").withIndex("by_from", (q) => q.eq("fromId", fromId)).collect();
    const rev = kind === "PARENT" ? [] : await ctx.db.query("citizenRelations").withIndex("by_from", (q) => q.eq("fromId", toId)).collect();
    const dup =
      existing.some((r) => r.toId === toId && r.kind === kind) ||
      rev.some((r) => r.toId === fromId && r.kind === kind);
    if (dup) return;

    await ctx.db.insert("citizenRelations", { fromId, toId, kind, byAgentId: agent._id, at: Date.now() });
    const self = await ctx.db.get(citizenId);
    await writeAudit(ctx, agent, {
      action: "citizen.relation_add",
      resourceType: "citizen",
      resourceId: citizenId,
      resourceLabel: self ? `${self.prenom} ${self.nom}` : "",
      metadata: { role, other: `${other.prenom} ${other.nom}` },
    });
  },
});

export const remove = mutation({
  args: { relationId: v.id("citizenRelations") },
  handler: async (ctx, { relationId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "citoyens.edit");
    const r = await ctx.db.get(relationId);
    if (!r) return;
    await ctx.db.delete(relationId);
    await writeAudit(ctx, agent, { action: "citizen.relation_remove", resourceType: "citizen", resourceId: r.toId });
  },
});
