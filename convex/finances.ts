import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission, agentLabel } from "./rbac";
import { writeAudit } from "./lib/audit";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";

// Recouvrement des amendes : agrège casiers (finePaid) + contraventions (finePaid).
// Une amende est "impayée" si elle a un montant > 0, est émise, non supprimée, et finePaid !== true.

export const byCitizen = query({
  args: { citizenId: v.id("citizens") },
  handler: async (ctx, { citizenId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "casier.view");

    const items: {
      kind: "casier" | "citation";
      _id: string;
      at: number;
      amount: number;
      paid: boolean;
      motif: string;
      officer: { matricule: number | null; name: string };
    }[] = [];

    const casiers = await ctx.db
      .query("casierEntries")
      .withIndex("by_citizen", (q) => q.eq("citizenId", citizenId))
      .order("desc")
      .collect();
    for (const e of casiers) {
      if (e.deletedAt || e.status === "ANNULEE" || e.totalFine <= 0) continue;
      const charges = await ctx.db
        .query("casierCharges")
        .withIndex("by_entry", (q) => q.eq("entryId", e._id))
        .collect();
      items.push({
        kind: "casier",
        _id: e._id,
        at: e.at,
        amount: e.totalFine,
        paid: e.finePaid === true,
        motif: charges.map((c) => c.snapshot.name).join(", ") || "Arrestation",
        officer: await agentLabel(ctx, e.officerIds[0] ?? e.createdBy),
      });
    }

    const citations = await ctx.db
      .query("citations")
      .withIndex("by_citizen", (q) => q.eq("citizenId", citizenId))
      .order("desc")
      .collect();
    for (const c of citations) {
      if (c.deletedAt || c.status === "ANNULEE" || c.totalFine <= 0) continue;
      const charges = await ctx.db
        .query("citationCharges")
        .withIndex("by_citation", (q) => q.eq("citationId", c._id))
        .collect();
      items.push({
        kind: "citation",
        _id: c._id,
        at: c.at,
        amount: c.totalFine,
        paid: c.finePaid === true,
        motif: charges.map((x) => x.snapshot.name).join(", ") || "Contravention",
        officer: await agentLabel(ctx, c.officerId),
      });
    }

    items.sort((a, b) => b.at - a.at);
    const unpaidTotal = items.filter((i) => !i.paid).reduce((s, i) => s + i.amount, 0);
    const paidTotal = items.filter((i) => i.paid).reduce((s, i) => s + i.amount, 0);
    const oldestUnpaid = items.filter((i) => !i.paid).reduce<number | null>((min, i) => (min == null || i.at < min ? i.at : min), null);
    return { items, unpaidTotal, paidTotal, unpaidCount: items.filter((i) => !i.paid).length, oldestUnpaid };
  },
});

// Notification commune aux deux origines d'amende (casier ou contravention).
async function notifyPaid(
  ctx: import("./_generated/server").MutationCtx,
  agent: { prenomRP: string; nomRP: string },
  citizenId: import("./_generated/dataModel").Id<"citizens">,
  amount: number,
) {
  const citizen = await ctx.db.get(citizenId);
  await notify(ctx, "amende.paid", {
    title: "Amende réglée",
    description: citizen ? `**${citizen.prenom} ${citizen.nom}**` : undefined,
    color: NOTIFY_COLOR.accent,
    fields: [{ name: "Montant", value: `$${amount.toLocaleString("fr-FR")}`, inline: true }],
    url: await deepLink(ctx, `/citoyen/${citizenId}`),
    footer: `Encaissé par ${agent.prenomRP} ${agent.nomRP}`,
  });
}

export const setPaid = mutation({
  args: {
    kind: v.union(v.literal("casier"), v.literal("citation")),
    id: v.string(),
    paid: v.boolean(),
  },
  handler: async (ctx, { kind, id, paid }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "finances.manage");
    if (kind === "casier") {
      const e = await ctx.db.get(id as import("./_generated/dataModel").Id<"casierEntries">);
      if (!e) throw new Error("Entrée introuvable.");
      await ctx.db.patch(e._id, { finePaid: paid });
      await writeAudit(ctx, agent, { action: paid ? "fine.paid" : "fine.unpaid", resourceType: "casierEntry", resourceId: e._id, metadata: { amount: e.totalFine } });
      if (paid) await notifyPaid(ctx, agent, e.citizenId, e.totalFine);
    } else {
      const c = await ctx.db.get(id as import("./_generated/dataModel").Id<"citations">);
      if (!c) throw new Error("Contravention introuvable.");
      await ctx.db.patch(c._id, { finePaid: paid });
      await writeAudit(ctx, agent, { action: paid ? "fine.paid" : "fine.unpaid", resourceType: "citation", resourceId: c._id, metadata: { amount: c.totalFine } });
      if (paid) await notifyPaid(ctx, agent, c.citizenId, c.totalFine);
    }
  },
});
