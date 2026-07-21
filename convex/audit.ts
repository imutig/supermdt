import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission, agentLabel } from "./rbac";

export const recent = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "audit.view");
    const rows = await ctx.db.query("auditLog").withIndex("by_at").order("desc").take(80);
    const out = [];
    for (const r of rows) {
      const snap = r.actorSnapshot;
      // Nom courant de l'acteur si l'agent existe encore, sinon repli sur le snapshot.
      let actorName = snap?.login ?? (r.actorId ? "?" : "système");
      let actorMatricule = snap?.matricule ?? (snap?.isOwner ? 0 : null);
      if (r.actorId) {
        const lbl = await agentLabel(ctx, r.actorId);
        if (lbl.name !== "-") {
          actorName = lbl.name;
          actorMatricule = lbl.matricule ?? actorMatricule;
        }
      }
      out.push({
        _id: r._id,
        at: r.at,
        action: r.action,
        actorMatricule,
        actorName,
        resourceType: r.resourceType,
        resourceLabel: r.resourceLabel ?? null,
        hasDiff: r.before !== undefined || r.after !== undefined,
      });
    }
    return out;
  },
});

// Détail complet d'une entrée de journal (modal, point 10).
export const get = query({
  args: { id: v.id("auditLog") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "audit.view");
    const r = await ctx.db.get(id);
    if (!r) return null;
    const snap = r.actorSnapshot;
    let actorName = snap?.login ?? (r.actorId ? "?" : "système");
    let actorMatricule = snap?.matricule ?? (snap?.isOwner ? 0 : null);
    if (r.actorId) {
      const lbl = await agentLabel(ctx, r.actorId);
      if (lbl.name !== "-") {
        actorName = lbl.name;
        actorMatricule = lbl.matricule ?? actorMatricule;
      }
    }
    return {
      _id: r._id,
      at: r.at,
      action: r.action,
      actor: r.actorSnapshot ?? null,
      actorName,
      actorMatricule,
      resourceType: r.resourceType,
      resourceId: r.resourceId ?? null,
      resourceLabel: r.resourceLabel ?? null,
      before: r.before ?? null,
      after: r.after ?? null,
      metadata: r.metadata ?? null,
    };
  },
});

// Journal des consultations (accessLog) : qui a cherché / consulté quoi.
export const accessRecent = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "audit.view");
    const rows = await ctx.db.query("accessLog").withIndex("by_at").order("desc").take(80);
    const out = [];
    for (const r of rows) {
      const lbl = await agentLabel(ctx, r.actorId);
      // Résout le libellé du citoyen consulté quand c'est possible.
      let label: string | null = null;
      if (r.resourceType === "citizen" && r.resourceId) {
        const c = await ctx.db.get(r.resourceId as import("./_generated/dataModel").Id<"citizens">);
        if (c) label = `${c.prenom} ${c.nom}`;
      }
      out.push({
        _id: r._id,
        at: r.at,
        kind: r.kind,
        actorName: lbl.name,
        actorMatricule: lbl.matricule,
        query: r.query ?? null,
        resourceType: r.resourceType ?? null,
        resourceId: r.resourceId ?? null,
        resourceLabel: label,
      });
    }
    return out;
  },
});
