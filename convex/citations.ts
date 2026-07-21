import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { requireAgent, requirePermission, requireOwnOrPermission, agentLabel } from "./rbac";
import { writeAudit } from "./lib/audit";
import { touchStats } from "./stats";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";
import { computeCharge } from "./lib/calc";

async function currentDefcon(ctx: QueryCtx) {
  const levels = await ctx.db.query("defconLevels").withIndex("by_position").collect();
  if (levels.length === 0) return null;
  const def = levels.find((l) => l.isDefault) ?? levels[0];
  const last = await ctx.db.query("defconChanges").withIndex("by_at").order("desc").first();
  if (!last) return def;
  if (last.until != null && last.until < Date.now()) return def;
  return (await ctx.db.get(last.levelId)) ?? def;
}

export const byCitizen = query({
  args: { citizenId: v.id("citizens") },
  handler: async (ctx, { citizenId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "contraventions.view");
    const rows = await ctx.db
      .query("citations")
      .withIndex("by_citizen", (q) => q.eq("citizenId", citizenId))
      .order("desc")
      .collect();
    const out = [];
    for (const c of rows) {
      if (c.deletedAt) continue;
      const charges = await ctx.db
        .query("citationCharges")
        .withIndex("by_citation", (q) => q.eq("citationId", c._id))
        .collect();
      out.push({
        _id: c._id,
        at: c.at,
        status: c.status,
        totalFine: c.totalFine,
        officer: await agentLabel(ctx, c.officerId),
        motif: charges.map((x) => x.snapshot.name).join(", ") || "-",
      });
    }
    return out;
  },
});

// Détail complet d'une contravention (modal, §6).
export const getEntry = query({
  args: { citationId: v.id("citations") },
  handler: async (ctx, { citationId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "contraventions.view");
    const c = await ctx.db.get(citationId);
    if (!c) return null;
    const citizen = await ctx.db.get(c.citizenId);
    const charges = await ctx.db
      .query("citationCharges")
      .withIndex("by_citation", (q) => q.eq("citationId", c._id))
      .collect();
    return {
      _id: c._id,
      at: c.at,
      status: c.status,
      annulReason: c.annulReason,
      citizenId: c.citizenId,
      citizenName: citizen ? `${citizen.prenom} ${citizen.nom}` : "-",
      mine: c.createdBy === agent._id,
      officer: await agentLabel(ctx, c.officerId),
      defcon: c.defconSnapshot,
      totalFine: c.totalFine,
      notes: c.notes,
      charges: charges.map((ch) => ({
        name: ch.snapshot.name,
        category: ch.snapshot.category,
        severity: ch.snapshot.severity,
        sensitive: ch.snapshot.sensitive,
        fineRaw: ch.snapshot.fineRaw,
        computedFine: ch.computedFine,
        isRecidive: ch.isRecidive,
        onDecision: ch.onDecision,
      })),
    };
  },
});

// Suppression douce d'une contravention (§18 : Archive, restaurable).
export const remove = mutation({
  args: { citationId: v.id("citations") },
  handler: async (ctx, { citationId }) => {
    const agent = await requireAgent(ctx);
    const c = await ctx.db.get(citationId);
    if (!c) throw new Error("Contravention introuvable.");
    if (c.deletedAt) return;
    // L'agent qui a établi l'acte peut l'annuler ; au-delà, la permission.
    await requireOwnOrPermission(ctx, agent, c.createdBy, "contraventions.annul");
    const citizen = await ctx.db.get(c.citizenId);
    await ctx.db.patch(citationId, { deletedAt: Date.now(), deletedBy: agent._id });
    await writeAudit(ctx, agent, {
      action: "citation.delete",
      resourceType: "citation",
      resourceId: citationId,
      resourceLabel: citizen ? `${citizen.prenom} ${citizen.nom}` : "",
      metadata: { soft: true, totalFine: c.totalFine },
    });
    await touchStats(ctx);
    await notify(ctx, "contravention.annul", {
      title: "Contravention annulée",
      description: citizen ? `**${citizen.prenom} ${citizen.nom}**` : undefined,
      color: NOTIFY_COLOR.muted,
      fields: [{ name: "Montant", value: `$${c.totalFine.toLocaleString("fr-FR")}`, inline: true }],
      url: await deepLink(ctx, `/citoyen/${c.citizenId}`),
      footer: `Annulée par ${agent.prenomRP} ${agent.nomRP}`,
    });
  },
});

export const recent = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "contraventions.view");
    const rows = await ctx.db.query("citations").order("desc").take(80);
    const out = [];
    for (const c of rows) {
      if (c.deletedAt) continue;
      const citizen = await ctx.db.get(c.citizenId);
      const charges = await ctx.db
        .query("citationCharges")
        .withIndex("by_citation", (q) => q.eq("citationId", c._id))
        .collect();
      out.push({
        _id: c._id,
        citizenId: c.citizenId,
        citizenName: citizen ? `${citizen.prenom} ${citizen.nom}` : "-",
        motif: charges.map((x) => x.snapshot.name).join(", ") || "-",
        totalFine: c.totalFine,
        officer: await agentLabel(ctx, c.officerId),
        status: c.status,
        at: c.at,
      });
    }
    return out;
  },
});

export const create = mutation({
  args: {
    citizenId: v.id("citizens"),
    vehicleId: v.optional(v.id("vehicles")),
    charges: v.array(
      v.object({
        penalChargeId: v.id("penalCharges"),
        param: v.optional(v.number()),
        isRecidive: v.boolean(),
      }),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "contraventions.create");
    const defcon = await currentDefcon(ctx);
    if (!defcon) throw new Error("DEFCON non configuré.");

    let totalFine = 0;
    const snaps = [];
    for (const c of args.charges) {
      const pc = await ctx.db.get(c.penalChargeId);
      if (!pc) continue;
      const cat = await ctx.db.get(pc.categoryId);
      const sev = pc.severityId ? await ctx.db.get(pc.severityId) : null;
      // Une contravention ne peut retenir que des infractions de sévérité "Contravention" (§4).
      if (sev?.name !== "Contravention") {
        throw new Error(`« ${pc.name} » n'est pas une contravention.`);
      }
      const sanctionNames: string[] = [];
      for (const sid of pc.sanctionIds) {
        const s = await ctx.db.get(sid);
        if (s) sanctionNames.push(s.name);
      }
      const res = computeCharge({
        fine: pc.fine,
        sensitive: cat?.sensitive ?? false,
        defcon,
        param: c.param,
        isRecidive: c.isRecidive,
      });
      totalFine += res.fine;
      snaps.push({
        penalChargeId: pc._id,
        snapshot: {
          name: pc.name,
          category: cat?.name ?? "",
          severity: sev?.name ?? "",
          sensitive: cat?.sensitive ?? false,
          fineRaw: pc.fine.raw,
          dojRequest: pc.dojRequest,
          sanctions: sanctionNames,
        },
        formulaParam: c.param,
        isRecidive: c.isRecidive,
        computedFine: res.fine,
        onDecision: res.onDecision,
      });
    }

    const id = await ctx.db.insert("citations", {
      citizenId: args.citizenId,
      vehicleId: args.vehicleId,
      at: Date.now(),
      officerId: agent._id,
      defconSnapshot: {
        name: defcon.name,
        fineMultiplier: defcon.fineMultiplier,
        sensitiveFineMultiplier: defcon.sensitiveFineMultiplier,
      },
      totalFine,
      notes: args.notes,
      status: "EMISE",
      createdBy: agent._id,
    });
    for (const s of snaps) await ctx.db.insert("citationCharges", { citationId: id, ...s });

    const citizen = await ctx.db.get(args.citizenId);
    await writeAudit(ctx, agent, {
      action: "citation.create",
      resourceType: "citation",
      resourceId: id,
      resourceLabel: citizen ? `${citizen.prenom} ${citizen.nom}` : "",
      metadata: { totalFine, charges: snaps.length },
    });
    await touchStats(ctx);
    return id;
  },
});
