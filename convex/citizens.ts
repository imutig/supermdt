import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";
import { touchStats } from "./stats";

function buildSearchText(c: { nom: string; prenom: string; telephone?: string; email?: string; dateNaissance?: string }) {
  // La date de naissance est indexée telle quelle ET sans séparateurs (01/08/1994 et 01081994).
  const dob = c.dateNaissance ?? "";
  return `${c.prenom} ${c.nom} ${c.telephone ?? ""} ${c.email ?? ""} ${dob} ${dob.replace(/[^0-9]/g, "")}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Le flag « Recherché » est DÉRIVÉ des mandats actifs marksWanted (§9.9).
async function isWanted(ctx: import("./_generated/server").QueryCtx, citizenId: import("./_generated/dataModel").Id<"citizens">) {
  const mandats = await ctx.db
    .query("mandats")
    .withIndex("by_citizen", (q) => q.eq("citizenId", citizenId))
    .collect();
  const now = Date.now();
  for (const m of mandats) {
    if (m.deletedAt) continue;
    if (m.status !== "ACTIF") continue;
    if (m.expiresAt != null && m.expiresAt < now) continue;
    const type = await ctx.db.get(m.typeId);
    if (type?.marksWanted) return true;
  }
  return false;
}

// Types de flag citoyen disponibles (pour le sélecteur du dossier).
export const flagTypes = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "citoyens.view");
    return (await ctx.db.query("flagTypes").collect())
      .filter((t) => t.active)
      .sort((a, b) => a.position - b.position)
      .map((t) => ({ _id: t._id, name: t.name, color: t.color ?? null }));
  },
});

// Pose (ou réactive) un flag sur un citoyen.
export const setFlag = mutation({
  args: { citizenId: v.id("citizens"), flagTypeId: v.id("flagTypes"), note: v.optional(v.string()) },
  handler: async (ctx, { citizenId, flagTypeId, note }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "citoyens.flag");
    const existing = (
      await ctx.db.query("citizenFlags").withIndex("by_citizen", (q) => q.eq("citizenId", citizenId)).collect()
    ).find((f) => f.flagTypeId === flagTypeId);
    if (existing) {
      await ctx.db.patch(existing._id, { active: true, note, byAgentId: agent._id, at: Date.now() });
    } else {
      await ctx.db.insert("citizenFlags", { citizenId, flagTypeId, note, active: true, byAgentId: agent._id, at: Date.now() });
    }
    const c = await ctx.db.get(citizenId);
    const t = await ctx.db.get(flagTypeId);
    await writeAudit(ctx, agent, {
      action: "citizen.flag_set",
      resourceType: "citizen",
      resourceId: citizenId,
      resourceLabel: c ? `${c.prenom} ${c.nom}` : "",
      metadata: { flag: t?.name },
    });
  },
});

export const removeFlag = mutation({
  args: { id: v.id("citizenFlags") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "citoyens.flag");
    const f = await ctx.db.get(id);
    if (!f) return;
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, { action: "citizen.flag_remove", resourceType: "citizen", resourceId: f.citizenId });
  },
});

export const getById = query({
  args: { id: v.id("citizens") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "citoyens.view");
    const citizen = await ctx.db.get(id);
    if (!citizen) return null;

    const flagLinks = await ctx.db
      .query("citizenFlags")
      .withIndex("by_citizen", (q) => q.eq("citizenId", id))
      .collect();
    const flags = [];
    for (const f of flagLinks.filter((x) => x.active)) {
      const t = await ctx.db.get(f.flagTypeId);
      if (t) flags.push({ _id: f._id, flagTypeId: f.flagTypeId, name: t.name, color: t.color, note: f.note ?? null });
    }

    const licenseLinks = await ctx.db
      .query("citizenLicenses")
      .withIndex("by_citizen", (q) => q.eq("citizenId", id))
      .collect();
    const licenses = [];
    for (const l of licenseLinks) {
      const t = await ctx.db.get(l.licenseTypeId);
      if (t) licenses.push({ _id: l._id, licenseTypeId: l.licenseTypeId, name: t.name, status: l.status, note: l.note ?? null });
    }

    return { citizen, wanted: await isWanted(ctx, id), flags, licenses };
  },
});

// Enregistre la consultation (traçabilité §11.3). Appelée à l'ouverture d'un dossier.
export const logView = mutation({
  args: { id: v.id("citizens") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "citoyens.view");
    await ctx.db.insert("dossierViews", { citizenId: id, agentId: agent._id, at: Date.now() });
  },
});

// Historique de consultation (onglet Historique).
export const viewsByCitizen = query({
  args: { citizenId: v.id("citizens") },
  handler: async (ctx, { citizenId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "citoyens.view");
    const rows = await ctx.db
      .query("dossierViews")
      .withIndex("by_citizen", (q) => q.eq("citizenId", citizenId))
      .order("desc")
      .take(30);
    const out = [];
    for (const r of rows) {
      const a = await ctx.db.get(r.agentId);
      out.push({
        _id: r._id,
        at: r.at,
        agent: a ? `${a.prenomRP} ${a.nomRP}` : "-",
        matricule: a?.matricule ?? null,
      });
    }
    return out;
  },
});

export const search = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "citoyens.view");
    if (!q.trim()) return [];
    const needle = q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    const rows = await ctx.db
      .query("citizens")
      .withSearchIndex("search", (s) => s.search("searchText", needle))
      .take(40);
    // Priorise les correspondances de sous-chaîne (searchText contient la requête), puis pertinence.
    return rows
      .filter((c) => c.status === "ACTIVE")
      .map((c) => ({ c, idx: c.searchText.indexOf(needle) }))
      .sort((a, b) => {
        const am = a.idx >= 0;
        const bm = b.idx >= 0;
        if (am !== bm) return am ? -1 : 1;
        if (am && bm) return a.idx - b.idx;
        return 0;
      })
      .slice(0, 20)
      .map(({ c }) => ({
        _id: c._id,
        nom: c.nom,
        prenom: c.prenom,
        dateNaissance: c.dateNaissance ?? null,
        deceased: c.deceased ?? false,
      }));
  },
});

// Champs partagés du dossier citoyen (item 8). Empreinte retirée.
const CITIZEN_FIELDS = {
  nom: v.string(),
  prenom: v.string(),
  dateNaissance: v.optional(v.string()), // JJ/MM/AAAA
  sexe: v.optional(v.string()), // H / F
  nationalite: v.optional(v.string()),
  lieuNaissance: v.optional(v.string()),
  telephone: v.optional(v.string()),
  email: v.optional(v.string()),
  // Description physique
  taille: v.optional(v.string()),
  poids: v.optional(v.string()),
  ethnie: v.optional(v.string()),
  cheveux: v.optional(v.string()),
  yeux: v.optional(v.string()),
  descriptionPhysique: v.optional(v.string()),
  // Situation
  adresse: v.optional(v.string()),
  groupe: v.optional(v.string()),
  metier: v.optional(v.string()),
  employeur: v.optional(v.string()),
  mugshotUrl: v.optional(v.string()),
};

export const create = mutation({
  args: CITIZEN_FIELDS,
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "citoyens.create");
    const id = await ctx.db.insert("citizens", {
      ...args,
      photoStorageIds: [],
      status: "ACTIVE",
      createdBy: agent._id,
      searchText: buildSearchText(args),
    });
    await writeAudit(ctx, agent, {
      action: "citizen.create",
      resourceType: "citizen",
      resourceId: id,
      resourceLabel: `${args.prenom} ${args.nom}`,
    });
    await touchStats(ctx);
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("citizens"), ...CITIZEN_FIELDS },
  handler: async (ctx, { id, ...fields }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "citoyens.edit");
    const before = await ctx.db.get(id);
    if (!before) throw new Error("Dossier introuvable.");
    await ctx.db.patch(id, { ...fields, searchText: buildSearchText(fields) });
    await writeAudit(ctx, agent, {
      action: "citizen.update",
      resourceType: "citizen",
      resourceId: id,
      resourceLabel: `${fields.prenom} ${fields.nom}`,
      before: { nom: before.nom, prenom: before.prenom, dateNaissance: before.dateNaissance, telephone: before.telephone, adresse: before.adresse, metier: before.metier },
      after: { nom: fields.nom, prenom: fields.prenom, dateNaissance: fields.dateNaissance, telephone: fields.telephone, adresse: fields.adresse, metier: fields.metier },
    });
  },
});

// Statut décédé (item 8).
export const setDeceased = mutation({
  args: { id: v.id("citizens"), deceased: v.boolean() },
  handler: async (ctx, { id, deceased }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "citoyens.edit");
    const c = await ctx.db.get(id);
    if (!c) throw new Error("Dossier introuvable.");
    await ctx.db.patch(id, { deceased });
    await writeAudit(ctx, agent, {
      action: deceased ? "citizen.deceased" : "citizen.revived",
      resourceType: "citizen",
      resourceId: id,
      resourceLabel: `${c.prenom} ${c.nom}`,
    });
  },
});

// ---- Gestion des licences / permis (§2, bloc B) ----
const LICENSE_STATUS = v.union(
  v.literal("VALIDE"),
  v.literal("SUSPENDU"),
  v.literal("RETIRE"),
  v.literal("AUCUN"),
);

export const licenseOptions = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "citoyens.view");
    return (await ctx.db.query("licenseTypes").collect())
      .filter((t) => t.active)
      .sort((a, b) => a.position - b.position)
      .map((t) => ({ _id: t._id, name: t.name }));
  },
});

// Ajoute ou met à jour le statut d'une licence pour un citoyen.
export const licenseSet = mutation({
  args: {
    citizenId: v.id("citizens"),
    licenseTypeId: v.id("licenseTypes"),
    status: LICENSE_STATUS,
    note: v.optional(v.string()),
  },
  handler: async (ctx, { citizenId, licenseTypeId, status, note }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "citoyens.licenses");
    const existing = (
      await ctx.db
        .query("citizenLicenses")
        .withIndex("by_citizen", (q) => q.eq("citizenId", citizenId))
        .collect()
    ).find((l) => l.licenseTypeId === licenseTypeId);
    const type = await ctx.db.get(licenseTypeId);
    const citizen = await ctx.db.get(citizenId);
    if (existing) {
      await ctx.db.patch(existing._id, { status, note, updatedBy: agent._id, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("citizenLicenses", {
        citizenId,
        licenseTypeId,
        status,
        note,
        updatedBy: agent._id,
        updatedAt: Date.now(),
      });
    }
    await writeAudit(ctx, agent, {
      action: "citizen.license_set",
      resourceType: "citizen",
      resourceId: citizenId,
      resourceLabel: citizen ? `${citizen.prenom} ${citizen.nom}` : "",
      metadata: { license: type?.name, status },
    });
  },
});

export const licenseRemove = mutation({
  args: { id: v.id("citizenLicenses") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "citoyens.licenses");
    const l = await ctx.db.get(id);
    if (!l) return;
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, {
      action: "citizen.license_remove",
      resourceType: "citizen",
      resourceId: l.citizenId,
    });
  },
});

// Archivage d'un dossier citoyen (point 2). Soft-delete : sort des recherches.
export const archive = mutation({
  args: { id: v.id("citizens") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "citoyens.edit");
    const c = await ctx.db.get(id);
    if (!c) throw new Error("Dossier introuvable.");
    await ctx.db.patch(id, { status: "ARCHIVED" });
    await writeAudit(ctx, agent, {
      action: "citizen.archive",
      resourceType: "citizen",
      resourceId: id,
      resourceLabel: `${c.prenom} ${c.nom}`,
    });
    await touchStats(ctx);
  },
});

// Reconstruit searchText pour tous les citoyens (après ajout de la date de naissance à l'index).
// À lancer une fois : `npx convex run citizens:rebuildSearch`.
export const rebuildSearch = internalMutation({
  args: {},
  handler: async (ctx) => {
    let n = 0;
    for (const c of await ctx.db.query("citizens").collect()) {
      const next = buildSearchText(c);
      if (next !== c.searchText) { await ctx.db.patch(c._id, { searchText: next }); n++; }
    }
    return `${n} citoyen(s) réindexé(s).`;
  },
});
