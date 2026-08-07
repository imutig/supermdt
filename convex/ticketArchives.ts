import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAgent, requirePermission } from "./rbac";

// Archives des tickets de candidature (Police Academy), consultables sur le
// portail LSPA. Alimentées par le bot à la fermeture définitive d'un ticket
// (voir bot.ticketArchiveSave). Lecture réservée à l'encadrement académie.

// Liste (résumé) avec recherche par pseudo, prénom/nom RP ou id Discord.
export const list = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, { search }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "lspa.effectif.view");
    const rows = await ctx.db.query("ticketArchives").withIndex("by_archivedAt").order("desc").take(400);
    const q = (search ?? "").trim().toLowerCase();
    return rows
      .filter((r) => !q || `${r.ownerName} ${r.prenom} ${r.nom} ${r.ownerId}`.toLowerCase().includes(q))
      .slice(0, 200)
      .map((r) => ({
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
      }));
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
