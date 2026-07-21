import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAgent, requirePermission, agentLabel } from "./rbac";
import { writeAudit } from "./lib/audit";

const KIND = v.union(
  v.literal("casier"),
  v.literal("citation"),
  v.literal("mandat"),
  v.literal("report"),
  v.literal("agent"),
);
type Kind = "casier" | "citation" | "mandat" | "report" | "agent";

async function citizenName(ctx: QueryCtx, id: Id<"citizens">) {
  const c = await ctx.db.get(id);
  return c ? `${c.prenom} ${c.nom}` : "-";
}

// Liste des éléments archivés (soft-deleted), tous types confondus ou filtré (§18).
export const list = query({
  args: { kind: v.optional(KIND) },
  handler: async (ctx, { kind }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "archive.view");
    const out: {
      _id: string;
      kind: Kind;
      at: number;
      label: string;
      summary: string;
      deletedBy: { matricule: number | null; name: string };
    }[] = [];

    const want = (k: Kind) => !kind || kind === k;

    if (want("casier")) {
      const rows = await ctx.db
        .query("casierEntries")
        .withIndex("by_deleted")
        .filter((q) => q.neq(q.field("deletedAt"), undefined))
        .collect();
      for (const e of rows) {
        out.push({
          _id: e._id,
          kind: "casier",
          at: e.deletedAt!,
          label: await citizenName(ctx, e.citizenId),
          summary: `Entrée de casier - $${e.totalFine.toLocaleString("fr-FR")}`,
          deletedBy: await agentLabel(ctx, e.deletedBy),
        });
      }
    }
    if (want("citation")) {
      const rows = await ctx.db
        .query("citations")
        .withIndex("by_deleted")
        .filter((q) => q.neq(q.field("deletedAt"), undefined))
        .collect();
      for (const c of rows) {
        out.push({
          _id: c._id,
          kind: "citation",
          at: c.deletedAt!,
          label: await citizenName(ctx, c.citizenId),
          summary: `Contravention - $${c.totalFine.toLocaleString("fr-FR")}`,
          deletedBy: await agentLabel(ctx, c.deletedBy),
        });
      }
    }
    if (want("mandat")) {
      const rows = await ctx.db
        .query("mandats")
        .withIndex("by_deleted")
        .filter((q) => q.neq(q.field("deletedAt"), undefined))
        .collect();
      for (const m of rows) {
        out.push({
          _id: m._id,
          kind: "mandat",
          at: m.deletedAt!,
          label: await citizenName(ctx, m.citizenId),
          summary: `Mandat - ${m.motif}`,
          deletedBy: await agentLabel(ctx, m.deletedBy),
        });
      }
    }
    if (want("report")) {
      const rows = await ctx.db
        .query("reports")
        .withIndex("by_deleted")
        .filter((q) => q.neq(q.field("deletedAt"), undefined))
        .collect();
      for (const r of rows) {
        out.push({
          _id: r._id,
          kind: "report",
          at: r.deletedAt!,
          label: r.title,
          summary: "Rapport",
          deletedBy: await agentLabel(ctx, r.deletedBy),
        });
      }
    }

    if (want("agent")) {
      const disabled = (await ctx.db.query("agents").collect()).filter((a) => a.status === "INACTIVE" || a.status === "SUSPENDED");
      for (const a of disabled) {
        out.push({
          _id: a._id,
          kind: "agent",
          at: a._creationTime,
          label: `${a.prenomRP} ${a.nomRP}`,
          summary: a.status === "SUSPENDED" ? "Compte suspendu" : "Compte désactivé (viré)",
          deletedBy: { matricule: a.matricule ?? null, name: `Matricule ${a.matricule ?? "-"}` },
        });
      }
    }

    return out.sort((a, b) => b.at - a.at);
  },
});

export const counts = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "archive.view");
    const count = async (table: "casierEntries" | "citations" | "mandats" | "reports") =>
      (
        await ctx.db
          .query(table)
          .withIndex("by_deleted")
          .filter((q) => q.neq(q.field("deletedAt"), undefined))
          .collect()
      ).length;
    const disabledAgents = (await ctx.db.query("agents").collect()).filter((a) => a.status === "INACTIVE" || a.status === "SUSPENDED").length;
    return {
      casier: await count("casierEntries"),
      citation: await count("citations"),
      mandat: await count("mandats"),
      report: await count("reports"),
      agent: disabledAgents,
    };
  },
});

async function resolve(ctx: QueryCtx, kind: Kind, id: string) {
  switch (kind) {
    case "casier":
      return await ctx.db.get(id as Id<"casierEntries">);
    case "citation":
      return await ctx.db.get(id as Id<"citations">);
    case "mandat":
      return await ctx.db.get(id as Id<"mandats">);
    case "report":
      return await ctx.db.get(id as Id<"reports">);
    case "agent":
      return await ctx.db.get(id as Id<"agents">);
  }
}

export const restore = mutation({
  args: { kind: KIND, id: v.string() },
  handler: async (ctx, { kind, id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "archive.restore");
    // Réactivation d'un compte agent viré/suspendu (item 2).
    if (kind === "agent") {
      const a = await ctx.db.get(id as Id<"agents">);
      if (!a) throw new Error("Compte introuvable.");
      await ctx.db.patch(a._id, { status: "ACTIVE" });
      await writeAudit(ctx, agent, { action: "agent.reactivate", resourceType: "agent", resourceId: id, resourceLabel: `${a.prenomRP} ${a.nomRP}` });
      return;
    }
    const doc = await resolve(ctx, kind, id);
    if (!doc) throw new Error("Élément introuvable.");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.db.patch(doc._id as any, { deletedAt: undefined, deletedBy: undefined });
    await writeAudit(ctx, agent, {
      action: "archive.restore",
      resourceType: kind,
      resourceId: id,
      resourceLabel: "label" in doc ? undefined : undefined,
      metadata: { kind },
    });
  },
});

export const purge = mutation({
  args: { kind: KIND, id: v.string() },
  handler: async (ctx, { kind, id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "archive.purge");
    if (kind === "agent") throw new Error("Un compte agent ne peut pas être purgé ici.");
    const doc = await resolve(ctx, kind, id);
    if (!doc) throw new Error("Élément introuvable.");
    if (!("deletedAt" in doc) || !doc.deletedAt) throw new Error("Seul un élément archivé peut être purgé.");

    // Purge des enfants selon le type.
    if (kind === "casier") {
      const charges = await ctx.db
        .query("casierCharges")
        .withIndex("by_entry", (q) => q.eq("entryId", doc._id as Id<"casierEntries">))
        .collect();
      for (const c of charges) await ctx.db.delete(c._id);
    } else if (kind === "citation") {
      const charges = await ctx.db
        .query("citationCharges")
        .withIndex("by_citation", (q) => q.eq("citationId", doc._id as Id<"citations">))
        .collect();
      for (const c of charges) await ctx.db.delete(c._id);
    } else if (kind === "report") {
      const contribs = await ctx.db
        .query("reportContributors")
        .withIndex("by_report", (q) => q.eq("reportId", doc._id as Id<"reports">))
        .collect();
      for (const c of contribs) await ctx.db.delete(c._id);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.db.delete(doc._id as any);
    await writeAudit(ctx, agent, {
      action: "archive.purge",
      resourceType: kind,
      resourceId: id,
      metadata: { kind },
    });
  },
});
