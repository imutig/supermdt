import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission, requireOwnOrPermission, agentLabel } from "./rbac";
import { writeAudit } from "./lib/audit";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";

export const byCitizen = query({
  args: { citizenId: v.id("citizens") },
  handler: async (ctx, { citizenId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "depositions.view");
    const rows = (await ctx.db
      .query("depositions")
      .withIndex("by_citizen", (q) => q.eq("citizenId", citizenId))
      .order("desc")
      .collect()).filter((d) => !d.deletedAt);
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
      } else if (d.linkType === "STANDALONE") {
        linkLabel = d.title ? `Déposition · ${d.title}` : "Déposition";
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
    await notify(ctx, "deposition.create", {
      title: "Déposition enregistrée",
      description: c ? `**${c.prenom} ${c.nom}**` : undefined,
      color: NOTIFY_COLOR.info,
      fields: args.title?.trim() ? [{ name: "Titre", value: args.title.trim() }] : undefined,
      url: await deepLink(ctx, `/citoyen/${args.citizenId}`),
      footer: `Recueillie par ${agent.prenomRP} ${agent.nomRP}`,
    });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("depositions") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    const d = await ctx.db.get(id);
    if (!d || d.deletedAt) return;
    await requireOwnOrPermission(ctx, agent, d.createdBy, "depositions.delete");
    await ctx.db.patch(id, { deletedAt: Date.now(), deletedBy: agent._id });
    await writeAudit(ctx, agent, { action: "deposition.delete", resourceType: "deposition", resourceId: id });
    const c = await ctx.db.get(d.citizenId);
    await notify(ctx, "deposition.delete", {
      title: "Déposition supprimée",
      description: c ? `**${c.prenom} ${c.nom}**` : undefined,
      color: NOTIFY_COLOR.danger,
      url: await deepLink(ctx, `/citoyen/${d.citizenId}`),
      footer: `Supprimée par ${agent.prenomRP} ${agent.nomRP}`,
    });
  },
});
