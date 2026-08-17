import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, internalMutation } from "./_generated/server";
import { requireAgent, requirePermission } from "./rbac";

// Archives des tickets de candidature (Police Academy), consultables sur le
// portail LSPA. Alimentées par le bot à la fermeture définitive d'un ticket
// (voir bot.ticketArchiveSave). Lecture réservée à l'encadrement académie.

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Liste paginée avec recherche (pseudo, prénom/nom RP ou id Discord) via l'index
// de recherche, plutôt qu'un chargement intégral filtré côté client.
export const list = query({
  args: { paginationOpts: paginationOptsValidator, search: v.optional(v.string()) },
  handler: async (ctx, { paginationOpts, search }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.effectif.view");
    const needle = norm((search ?? "").trim());
    const res = needle
      ? await ctx.db.query("ticketArchives").withSearchIndex("search", (s) => s.search("searchText", needle)).paginate(paginationOpts)
      : await ctx.db.query("ticketArchives").withIndex("by_archivedAt").order("desc").paginate(paginationOpts);
    return {
      ...res,
      page: res.page.map((r) => ({
        _id: r._id,
        ownerName: r.ownerName,
        ownerId: r.ownerId,
        name: `${r.prenom} ${r.nom}`,
        promotionName: r.promotionName ?? null,
        integrationStatus: r.integrationStatus ?? null,
        finalStatus: r.finalStatus,
        messageCount: r.messages.length,
        createdAt: r.createdAt,
        archivedAt: r.archivedAt,
      })),
    };
  },
});

// Backfill idempotent du texte de recherche des archives existantes.
export const backfillSearch = internalMutation({
  args: {},
  handler: async (ctx) => {
    let updated = 0;
    for (const r of await ctx.db.query("ticketArchives").collect()) {
      const next = norm(`${r.ownerName} ${r.prenom} ${r.nom} ${r.ownerId}`);
      if (r.searchText !== next) { await ctx.db.patch(r._id, { searchText: next }); updated++; }
    }
    return { updated };
  },
});

// Détail complet d'une archive : infos, journal et historique des messages.
export const get = query({
  args: { id: v.id("ticketArchives") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.effectif.view");
    const a = await ctx.db.get(id);
    if (!a) return null;
    return {
      _id: a._id,
      channelName: a.channelName,
      ownerName: a.ownerName,
      ownerId: a.ownerId,
      prenom: a.prenom,
      nom: a.nom,
      dateNaissance: a.dateNaissance ?? null,
      motivations: a.motivations ?? null,
      experiences: a.experiences ?? null,
      promotionName: a.promotionName ?? null,
      integrationStatus: a.integrationStatus ?? null,
      finalStatus: a.finalStatus,
      closeReason: a.closeReason ?? null,
      events: [...a.events].sort((x, y) => x.at - y.at),
      messages: [...a.messages].sort((x, y) => x.at - y.at),
      createdAt: a.createdAt,
      archivedAt: a.archivedAt,
    };
  },
});
