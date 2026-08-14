import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireAgent, requirePermission, agentLabel, can } from "./rbac";

// Historique d'activité PERSONNEL de l'agent courant (page « Mon profil »).
// S'appuie sur le journal d'audit (by_actor) : toute action tracée du MDT
// (casiers, contraventions, rapports, citoyens, armes, véhicules, plaintes…).
export const myActivity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const agent = await requireAgent(ctx);
    const cap = Math.min(Math.max(limit ?? 100, 10), 400);
    const rows = await ctx.db
      .query("auditLog")
      .withIndex("by_actor", (q) => q.eq("actorId", agent._id))
      .order("desc")
      .take(cap);
    const out = [];
    for (const r of rows) {
      // Citoyen concerné (nom cliquable) selon le type de ressource.
      let citizenId: string | null = null;
      if (r.resourceId) {
        try {
          if (r.resourceType === "citizen") citizenId = r.resourceId;
          else if (r.resourceType === "casierEntry") citizenId = (await ctx.db.get(r.resourceId as Id<"casierEntries">))?.citizenId ?? null;
          else if (r.resourceType === "citation") citizenId = (await ctx.db.get(r.resourceId as Id<"citations">))?.citizenId ?? null;
          else if (r.resourceType === "mandat") citizenId = (await ctx.db.get(r.resourceId as Id<"mandats">))?.citizenId ?? null;
        } catch { citizenId = null; }
      }
      out.push({
        _id: r._id,
        at: r.at,
        action: r.action,
        resourceType: r.resourceType,
        resourceLabel: r.resourceLabel ?? null,
        citizenId,
      });
    }
    return out;
  },
});

// Historique combiné des entrées de casier ET des contraventions (§4),
// cliquable vers les dossiers. Sert la page "Historique".
export const casierAndCitations = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "casier.view");

    // Page d'historique dédiée : on montre bien plus qu'un simple fil.
    // Plafond configurable (défaut 250) pour couvrir plusieurs semaines et
    // pas seulement les tout derniers jours.
    const cap = Math.min(Math.max(limit ?? 250, 20), 1000);

    const out: {
      _id: string;
      kind: "casier" | "citation";
      arrestType?: "RAPPORT" | "DOSSIER";
      citizenId: string;
      citizenName: string;
      motif: string;
      totalFine: number;
      officer: { matricule: number | null; name: string };
      // false = officier issu du Nexus non rattaché à un compte local (ancien
      // agent, ou compte pas encore créé) : à styliser côté UI.
      officerDetected: boolean;
      status: string;
      at: number;
    }[] = [];
    const digits = (s?: string) => { const d = (s ?? "").replace(/\D/g, ""); return d ? Number(d) : null; };

    // Tri par date d'arrestation (by_at) et non par _creationTime : les casiers
    // importés du Nexus sont tous créés au même instant, leur ordre d'insertion
    // ne reflète pas la chronologie. On en charge un peu plus que le plafond
    // pour absorber les fiches supprimées filtrées ensuite.
    const entries = (await ctx.db.query("casierEntries").withIndex("by_at").order("desc").take(cap + 40)).filter((e) => !e.deletedAt).slice(0, cap);
    for (const e of entries) {
      const citizen = await ctx.db.get(e.citizenId);
      const charges = await ctx.db
        .query("casierCharges")
        .withIndex("by_entry", (q) => q.eq("entryId", e._id))
        .collect();
      // Officier créateur : compte relié si possible, sinon nom + matricule
      // relevés dans le Nexus (officier non détecté -> stylisé côté UI).
      const snap = e.officers?.[0];
      let officer: { matricule: number | null; name: string };
      let officerDetected: boolean;
      if (snap?.agentId) {
        officer = await agentLabel(ctx, snap.agentId);
        officerDetected = true;
      } else if (snap && (snap.name || snap.matricule)) {
        officer = { matricule: digits(snap.matricule), name: snap.name || "-" };
        officerDetected = false;
      } else {
        officer = await agentLabel(ctx, e.officerIds[0]);
        officerDetected = e.officerIds.length > 0;
      }
      out.push({
        _id: e._id,
        kind: "casier",
        arrestType: e.arrestType ?? "DOSSIER",
        citizenId: e.citizenId,
        citizenName: citizen ? `${citizen.prenom} ${citizen.nom}` : "-",
        motif: charges.map((c) => c.snapshot.name).join(", ") || "-",
        totalFine: e.totalFine,
        officer,
        officerDetected,
        status: e.status,
        at: e.at,
      });
    }

    const citations = (await ctx.db.query("citations").withIndex("by_at").order("desc").take(cap + 40)).filter((c) => !c.deletedAt).slice(0, cap);
    for (const c of citations) {
      const citizen = await ctx.db.get(c.citizenId);
      const charges = await ctx.db
        .query("citationCharges")
        .withIndex("by_citation", (q) => q.eq("citationId", c._id))
        .collect();
      // Verbalisateur non relié (import Nexus) : officerId retombe sur l'owner,
      // on affiche alors le nom + matricule relevés dans le Nexus (non détecté).
      let officer = await agentLabel(ctx, c.officerId);
      let officerDetected = true;
      if (c.officerName) {
        const a = await ctx.db.get(c.officerId);
        if (a?.isOwner) { officer = { matricule: c.officerMatricule ?? null, name: c.officerName }; officerDetected = false; }
      }
      out.push({
        _id: c._id,
        kind: "citation",
        citizenId: c.citizenId,
        citizenName: citizen ? `${citizen.prenom} ${citizen.nom}` : "-",
        motif: charges.map((x) => x.snapshot.name).join(", ") || "-",
        totalFine: c.totalFine,
        officer,
        officerDetected,
        status: c.status,
        at: c.at,
      });
    }

    return out.sort((a, b) => b.at - a.at).slice(0, cap);
  },
});

// Flux d'accueil : dernières entrées de casier + derniers rapports (§14).
export const home = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    const canCasier = await can(ctx, agent, "casier.view");
    const canContraventions = await can(ctx, agent, "contraventions.view");
    const canReports = await can(ctx, agent, "rapports.view");

    const out: {
      _id: string;
      kind: "casier" | "citation" | "report";
      arrestType?: "RAPPORT" | "DOSSIER";
      title: string;
      subtitle: string;
      citizenId: string | null;
      reportId: string | null;
      at: number;
    }[] = [];

    if (canCasier) {
      // Tri par date d'arrestation (voir casierAndCitations) : les imports Nexus
      // partagent le même _creationTime, seul `at` donne le bon ordre.
      const entries = (await ctx.db.query("casierEntries").withIndex("by_at").order("desc").take(40)).filter((e) => !e.deletedAt).slice(0, 12);
      for (const e of entries) {
        const citizen = await ctx.db.get(e.citizenId);
        const charges = await ctx.db
          .query("casierCharges")
          .withIndex("by_entry", (q) => q.eq("entryId", e._id))
          .collect();
        out.push({
          _id: e._id,
          kind: "casier",
          arrestType: e.arrestType ?? "DOSSIER",
          title: citizen ? `${citizen.prenom} ${citizen.nom}` : "-",
          subtitle: charges.map((c) => c.snapshot.name).join(", ") || "Entrée de casier",
          citizenId: e.citizenId,
          reportId: null,
          at: e.at,
        });
      }
    }
    if (canContraventions) {
      const cits = (await ctx.db.query("citations").withIndex("by_at").order("desc").take(40)).filter((c) => !c.deletedAt).slice(0, 12);
      for (const c of cits) {
        const citizen = await ctx.db.get(c.citizenId);
        const charges = await ctx.db
          .query("citationCharges")
          .withIndex("by_citation", (q) => q.eq("citationId", c._id))
          .collect();
        out.push({
          _id: c._id,
          kind: "citation",
          title: citizen ? `${citizen.prenom} ${citizen.nom}` : "-",
          subtitle: charges.map((x) => x.snapshot.name).join(", ") || "Contravention",
          citizenId: c.citizenId,
          reportId: null,
          at: c.at,
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
