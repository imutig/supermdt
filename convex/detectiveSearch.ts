import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireDivView } from "./lib/detectiveAccess";
import { hasPerm } from "./lib/divisionAccess";

// Recherche du bureau : recherche globale (barre) + endpoint de mentions "@"
// (branché sur l'éditeur riche pour insérer des chips cliquables).

// ---------- Recherche globale ----------

export const global = query({
  args: { divisionId: v.id("divisions"), q: v.string() },
  handler: async (ctx, { divisionId, q }) => {
    const { agent, division } = await requireDivView(ctx, divisionId);
    const query = q.trim().toLowerCase();
    if (!query) return { cases: [], persons: [], gangs: [], drugSites: [] };
    const canSensitive = await hasPerm(ctx, agent, division, "db.sensitive");

    const cases = (await ctx.db.query("dbCases").withIndex("by_division", (x) => x.eq("divisionId", divisionId)).collect())
      .filter((c) => !c.deletedAt && (canSensitive || !c.confidential))
      .filter((c) => `${c.number} ${c.title}`.toLowerCase().includes(query))
      .slice(0, 8)
      .map((c) => ({ _id: c._id, number: c.number, title: c.title, status: c.status }));

    const persons = (await ctx.db.query("dbPersons").withIndex("by_division", (x) => x.eq("divisionId", divisionId)).collect())
      .filter((p) => !p.deletedAt && `${p.name} ${p.alias ?? ""}`.toLowerCase().includes(query))
      .slice(0, 8)
      .map((p) => ({ _id: p._id, name: p.name, alias: p.alias ?? "", role: p.role ?? null }));

    const gangs = (await ctx.db.query("dbGangs").withIndex("by_division", (x) => x.eq("divisionId", divisionId)).collect())
      .filter((g) => !g.deletedAt && g.name.toLowerCase().includes(query))
      .slice(0, 8)
      .map((g) => ({ _id: g._id, name: g.name, orgType: g.orgType, color: g.color ?? null }));

    const drugSites = (await ctx.db.query("dbDrugSites").withIndex("by_division", (x) => x.eq("divisionId", divisionId)).collect())
      .filter((d) => !d.deletedAt && `${d.name} ${d.drugTypes ?? ""}`.toLowerCase().includes(query))
      .slice(0, 8)
      .map((d) => ({ _id: d._id, name: d.name, kind: d.kind }));

    return { cases, persons, gangs, drugSites };
  },
});

// ---------- Mentions "@" ----------
// Renvoie une liste plate typée : le front insère un chip cliquable.
// kind : citizen | vehicle | case | person | gang | drugsite

export const mentions = query({
  args: { divisionId: v.id("divisions"), q: v.string() },
  handler: async (ctx, { divisionId, q }) => {
    const { agent, division } = await requireDivView(ctx, divisionId);
    const query = q.trim();
    if (query.length < 1) return [];
    const lower = query.toLowerCase();
    const canSensitive = await hasPerm(ctx, agent, division, "db.sensitive");
    const out: { kind: string; id: string; label: string; sub: string }[] = [];

    // Personnes du registre.
    const persons = (await ctx.db.query("dbPersons").withIndex("by_division", (x) => x.eq("divisionId", divisionId)).collect())
      .filter((p) => !p.deletedAt && `${p.name} ${p.alias ?? ""}`.toLowerCase().includes(lower)).slice(0, 5);
    for (const p of persons) out.push({ kind: "person", id: p._id as string, label: p.name, sub: p.alias ? `alias ${p.alias}` : "Personne" });

    // Enquêtes.
    const cases = (await ctx.db.query("dbCases").withIndex("by_division", (x) => x.eq("divisionId", divisionId)).collect())
      .filter((c) => !c.deletedAt && (canSensitive || !c.confidential) && `${c.number} ${c.title}`.toLowerCase().includes(lower)).slice(0, 5);
    for (const c of cases) out.push({ kind: "case", id: c._id as string, label: `#${c.number} ${c.title}`, sub: "Enquête" });

    // Gangs / organisations.
    const gangs = (await ctx.db.query("dbGangs").withIndex("by_division", (x) => x.eq("divisionId", divisionId)).collect())
      .filter((g) => !g.deletedAt && g.name.toLowerCase().includes(lower)).slice(0, 5);
    for (const g of gangs) out.push({ kind: "gang", id: g._id as string, label: g.name, sub: g.orgType });

    // Points stupéfiants (lieux connus).
    const drugSites = (await ctx.db.query("dbDrugSites").withIndex("by_division", (x) => x.eq("divisionId", divisionId)).collect())
      .filter((d) => !d.deletedAt && d.name.toLowerCase().includes(lower)).slice(0, 4);
    for (const d of drugSites) out.push({ kind: "drugsite", id: d._id as string, label: d.name, sub: d.kind === "LABO" ? "Labo" : "Point de vente" });

    // Citoyens (encodage NexusMDT) + véhicules (plaque) via index de recherche.
    const citizens = await ctx.db.query("citizens").withSearchIndex("search", (s) => s.search("searchText", query)).take(5);
    for (const c of citizens) {
      if (c.deletedAt || c.status !== "ACTIVE") continue;
      out.push({ kind: "citizen", id: c._id as string, label: `${c.prenom} ${c.nom}`, sub: "Citoyen" });
    }
    const vehicles = await ctx.db.query("vehicles").withSearchIndex("search", (s) => s.search("searchText", query)).take(5);
    for (const veh of vehicles) {
      if (veh.deletedAt) continue;
      out.push({ kind: "vehicle", id: veh._id as string, label: veh.plaque, sub: veh.modele ?? "Véhicule" });
    }

    return out.slice(0, 20);
  },
});
