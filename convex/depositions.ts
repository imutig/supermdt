import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission, agentLabel } from "./rbac";
import { writeAudit } from "./lib/audit";

export const byCitizen = query({
  args: { citizenId: v.id("citizens") },
  handler: async (ctx, { citizenId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "depositions.view");
    const rows = await ctx.db
      .query("depositions")
      .withIndex("by_citizen", (q) => q.eq("citizenId", citizenId))
      .order("desc")
      .collect();
    const out = [];
    for (const d of rows) {
      let linkLabel = "-";
      if (d.linkType === "COMPLAINT" && d.complaintId) {
        const c = await ctx.db.get(d.complaintId);
        linkLabel = c ? `Plainte · ${c.motif}` : "Plainte";
      } else if (d.linkType === "REPORT" && d.reportId) {
        const r = await ctx.db.get(d.reportId);
        linkLabel = r ? `Rapport · ${r.title}` : "Rapport";
      } else if (d.linkType === "DOSSIER" && d.casierEntryId) {
        linkLabel = "Dossier d'arrestation";
      }
      out.push({
        _id: d._id,
        at: d.at,
        title: d.title ?? null,
        body: d.body,
        linkType: d.linkType,
        linkLabel,
        by: await agentLabel(ctx, d.createdBy),
      });
    }
    return out;
  },
});

// Options de rattachement (plaintes du citoyen + dossiers d'arrestation).
export const linkOptions = query({
  args: { citizenId: v.id("citizens") },
  handler: async (ctx, { citizenId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "depositions.view");
    const complaintsFiled = await ctx.db
      .query("complaints")
      .withIndex("by_plaignant", (q) => q.eq("plaignantId", citizenId))
      .collect();
    const complaintsAgainst = await ctx.db
      .query("complaints")
      .withIndex("by_defendant", (q) => q.eq("defendantCitizenId", citizenId))
      .collect();
    const complaints = [...complaintsFiled, ...complaintsAgainst]
      .filter((c) => !c.deletedAt)
      .map((c) => ({ _id: c._id, label: c.motif }));

    // Rapports impliquant le citoyen (suspect).
    const allReports = await ctx.db.query("reports").collect();
    const reports = allReports
      .filter((r) => r.citizenIds.includes(citizenId))
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((r) => ({ _id: r._id, label: r.title }));

    return { complaints, reports };
  },
});

export const create = mutation({
  args: {
    citizenId: v.id("citizens"),
    linkType: v.union(v.literal("COMPLAINT"), v.literal("REPORT")),
    complaintId: v.optional(v.id("complaints")),
    reportId: v.optional(v.id("reports")),
    title: v.optional(v.string()),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "depositions.create");
    const id = await ctx.db.insert("depositions", { ...args, at: Date.now(), createdBy: agent._id });
    const c = await ctx.db.get(args.citizenId);
    await writeAudit(ctx, agent, { action: "deposition.create", resourceType: "deposition", resourceId: id, resourceLabel: c ? `${c.prenom} ${c.nom}` : "" });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("depositions") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "depositions.delete");
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, { action: "deposition.delete", resourceType: "deposition", resourceId: id });
  },
});
