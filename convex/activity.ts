import { query } from "./_generated/server";
import { requireAgent, requirePermission, agentLabel, can } from "./rbac";

// Historique combiné des entrées de casier ET des contraventions (§4),
// cliquable vers les dossiers. Sert la page "Historique".
export const casierAndCitations = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "casier.view");

    const out: {
      _id: string;
      kind: "casier" | "citation";
      citizenId: string;
      citizenName: string;
      motif: string;
      totalFine: number;
      officer: { matricule: number | null; name: string };
      status: string;
      at: number;
    }[] = [];

    // Le fil n'affiche qu'une quarantaine de lignes : en charger 120 pour en
    // jeter les deux tiers coûtait autant de requêtes de charges inutiles.
    const entries = await ctx.db.query("casierEntries").order("desc").take(25);
    for (const e of entries) {
      if (e.deletedAt) continue;
      const citizen = await ctx.db.get(e.citizenId);
      const charges = await ctx.db
        .query("casierCharges")
        .withIndex("by_entry", (q) => q.eq("entryId", e._id))
        .collect();
      out.push({
        _id: e._id,
        kind: "casier",
        citizenId: e.citizenId,
        citizenName: citizen ? `${citizen.prenom} ${citizen.nom}` : "-",
        motif: charges.map((c) => c.snapshot.name).join(", ") || "-",
        totalFine: e.totalFine,
        officer: await agentLabel(ctx, e.officerIds[0]),
        status: e.status,
        at: e.at,
      });
    }

    const citations = await ctx.db.query("citations").order("desc").take(25);
    for (const c of citations) {
      if (c.deletedAt) continue;
      const citizen = await ctx.db.get(c.citizenId);
      const charges = await ctx.db
        .query("citationCharges")
        .withIndex("by_citation", (q) => q.eq("citationId", c._id))
        .collect();
      out.push({
        _id: c._id,
        kind: "citation",
        citizenId: c.citizenId,
        citizenName: citizen ? `${citizen.prenom} ${citizen.nom}` : "-",
        motif: charges.map((x) => x.snapshot.name).join(", ") || "-",
        totalFine: c.totalFine,
        officer: await agentLabel(ctx, c.officerId),
        status: c.status,
        at: c.at,
      });
    }

    return out.sort((a, b) => b.at - a.at).slice(0, 40);
  },
});

// Flux d'accueil : dernières entrées de casier + derniers rapports (§14).
export const home = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    const canCasier = await can(ctx, agent, "casier.view");
    const canReports = await can(ctx, agent, "rapports.view");

    const out: {
      _id: string;
      kind: "casier" | "report";
      title: string;
      subtitle: string;
      citizenId: string | null;
      reportId: string | null;
      at: number;
    }[] = [];

    if (canCasier) {
      const entries = await ctx.db.query("casierEntries").order("desc").take(12);
      for (const e of entries) {
        if (e.deletedAt) continue;
        const citizen = await ctx.db.get(e.citizenId);
        const charges = await ctx.db
          .query("casierCharges")
          .withIndex("by_entry", (q) => q.eq("entryId", e._id))
          .collect();
        out.push({
          _id: e._id,
          kind: "casier",
          title: citizen ? `${citizen.prenom} ${citizen.nom}` : "-",
          subtitle: charges.map((c) => c.snapshot.name).join(", ") || "Entrée de casier",
          citizenId: e.citizenId,
          reportId: null,
          at: e.at,
        });
      }
    }
    if (canReports) {
      const reports = await ctx.db.query("reports").order("desc").take(12);
      for (const r of reports) {
        if (r.deletedAt) continue;
        const type = await ctx.db.get(r.typeId);
        out.push({
          _id: r._id,
          kind: "report",
          title: r.title,
          subtitle: type?.name ?? "Rapport",
          citizenId: null,
          reportId: r._id,
          at: r._creationTime,
        });
      }
    }
    return out.sort((a, b) => b.at - a.at).slice(0, 12);
  },
});
