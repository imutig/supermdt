import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { PERMISSION_SLUGS } from "./rbac";
import { SEVERITIES, CATEGORIES, SANCTIONS, CHARGES } from "./seedData/penalCode";

// Statuts de dispatch par défaut. Les statuts d'un même `group` forment UNE colonne à sections.
type StatusDefault = { name: string; color: string; isDefault?: boolean; group?: string; icon?: string; requires?: string[] };
const DISPATCH_DEFAULTS: StatusDefault[] = [
  { name: "En patrouille", color: "#16a34a", isDefault: true, group: "Terrain", icon: "shield", requires: ["secteur"] },
  { name: "En poursuite", color: "#dc2626", group: "Terrain", icon: "siren", requires: ["vehiculeType", "vehiculeCouleur", "occupants"] },
  { name: "En procédure", color: "#f59e0b", group: "Terrain", icon: "clipboard", requires: ["suspects"] },
  { name: "Opération", color: "#3b82f6", icon: "target" },
  { name: "Indisponible", color: "#6b7280", icon: "pause", requires: ["raison"] },
];

// Secteurs de patrouille par défaut (configurables ; « Autre » toujours proposé en plus).
const SECTOR_DEFAULTS = [
  "Downtown", "Vinewood", "Rockford Hills", "Del Perro", "Vespucci",
  "Mirror Park", "Sandy Shores", "Paleto Bay", "Autoroute",
];

async function insertDispatchDefaults(ctx: MutationCtx) {
  for (let i = 0; i < DISPATCH_DEFAULTS.length; i++) {
    const d = DISPATCH_DEFAULTS[i];
    await ctx.db.insert("dispatchStatuses", {
      name: d.name, color: d.color, isDefault: d.isDefault ?? false,
      group: d.group, icon: d.icon, requires: d.requires ?? [], position: i, active: true,
    });
  }
  await insertSectorDefaults(ctx);
}

async function insertSectorDefaults(ctx: MutationCtx) {
  for (let i = 0; i < SECTOR_DEFAULTS.length; i++) {
    await ctx.db.insert("dispatchSectors", { name: SECTOR_DEFAULTS[i], position: i, active: true });
  }
}

// Seed idempotent des statuts de dispatch sur une base déjà existante.
// À lancer une fois : `npx convex run seed:seedDispatch`.
export const seedDispatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("dispatchStatuses").first();
    if (existing) return "Déjà seedé.";
    await insertDispatchDefaults(ctx);
    return "Dispatch seedé.";
  },
});

// Migration v6 : ajoute group/icon/requires aux statuts existants, crée « En poursuite » si absent,
// et seede les secteurs. NE SUPPRIME PAS les patrouilles en cours.
// À lancer une fois : `npx convex run seed:upgradeDispatch`.
export const upgradeDispatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("dispatchStatuses").collect();
    const byName = new Map(existing.map((s) => [s.name.toLowerCase(), s]));
    let patched = 0, added = 0;
    for (let i = 0; i < DISPATCH_DEFAULTS.length; i++) {
      const d = DISPATCH_DEFAULTS[i];
      const cur = byName.get(d.name.toLowerCase());
      if (cur) {
        await ctx.db.patch(cur._id, { group: d.group, icon: d.icon, requires: d.requires ?? [], color: cur.color ?? d.color, position: i });
        patched++;
      } else {
        await ctx.db.insert("dispatchStatuses", {
          name: d.name, color: d.color, isDefault: d.isDefault ?? false,
          group: d.group, icon: d.icon, requires: d.requires ?? [], position: i, active: true,
        });
        added++;
      }
    }
    let sectors = 0;
    if (!(await ctx.db.query("dispatchSectors").first())) {
      await insertSectorDefaults(ctx);
      sectors = SECTOR_DEFAULTS.length;
    }
    return `${patched} statut(s) mis à jour, ${added} ajouté(s), ${sectors} secteur(s) seedé(s).`;
  },
});

// Remise à zéro du dispatch (modèle v3 : statuts plats). Supprime patrouilles + anciens statuts/catégories, reseed.
// À lancer une fois : `npx convex run seed:resetDispatch`.
export const resetDispatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const m of await ctx.db.query("patrolMembers").collect()) await ctx.db.delete(m._id);
    for (const p of await ctx.db.query("patrols").collect()) await ctx.db.delete(p._id);
    for (const s of await ctx.db.query("dispatchStatuses").collect()) await ctx.db.delete(s._id);
    for (const s of await ctx.db.query("dispatchSectors").collect()) await ctx.db.delete(s._id);
    await insertDispatchDefaults(ctx);
    return "Dispatch réinitialisé (statuts plats).";
  },
});

// Ajoute les slugs de permission manquants sur une base déjà seedée, et les accorde
// aux grades État-Major (owner bypass de toute façon). Idempotent.
// À lancer après ajout de nouveaux slugs : `npx convex run seed:syncPermissions`.
export const syncPermissions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const catalog = new Set(PERMISSION_SLUGS.map((p) => p.slug));
    const existing = await ctx.db.query("permissions").collect();
    const existingSlugs = new Set(existing.map((p) => p.slug));

    // 1) Purge des permissions obsolètes (retirées du catalogue) + leurs attributions.
    const gradePerms = await ctx.db.query("gradePermissions").collect();
    const divPerms = await ctx.db.query("divisionPermissions").collect();
    let removed = 0;
    for (const p of existing) {
      if (catalog.has(p.slug)) continue;
      for (const gp of gradePerms) if (gp.permissionId === p._id) await ctx.db.delete(gp._id);
      for (const dp of divPerms) if (dp.permissionId === p._id) await ctx.db.delete(dp._id);
      await ctx.db.delete(p._id);
      removed++;
    }

    // 2) Ajout des nouveaux slugs, accordés à l'État-Major.
    const emGrades = (await ctx.db.query("grades").collect()).filter((g) => g.corps === "ETAT_MAJOR");
    const missing = PERMISSION_SLUGS.filter((p) => !existingSlugs.has(p.slug));
    for (const p of missing) {
      const permId = await ctx.db.insert("permissions", p);
      for (const g of emGrades) await ctx.db.insert("gradePermissions", { gradeId: g._id, permissionId: permId });
    }
    return `+${missing.length} ajoutée(s), -${removed} obsolète(s) supprimée(s).`;
  },
});

// Seed idempotent des données de configuration & référentiels.
// À lancer une fois : `npx convex run seed:seed`.
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await ctx.db.query("grades").first()) {
      return "Déjà seedé - rien à faire.";
    }

    // ---- Grades (10, en 3 corps) ----
    const grades: { name: string; corps: "OPERATIONNEL" | "SUPERVISION" | "ETAT_MAJOR" }[] = [
      { name: "Cadet", corps: "OPERATIONNEL" },
      { name: "Trooper", corps: "OPERATIONNEL" },
      { name: "Trooper First Class", corps: "OPERATIONNEL" },
      { name: "Senior Trooper", corps: "OPERATIONNEL" },
      { name: "Master Trooper", corps: "OPERATIONNEL" },
      { name: "Sergent", corps: "SUPERVISION" },
      { name: "Sergent-chef", corps: "SUPERVISION" },
      { name: "Lieutenant 1", corps: "ETAT_MAJOR" },
      { name: "Lieutenant 2", corps: "ETAT_MAJOR" },
      { name: "Capitaine", corps: "ETAT_MAJOR" },
    ];
    const gradeIds: Id<"grades">[] = [];
    for (let i = 0; i < grades.length; i++) {
      gradeIds.push(await ctx.db.insert("grades", { ...grades[i], position: i }));
    }

    // ---- Divisions ----
    const divisions: { name: string; tier: "PRINCIPALE" | "SECONDAIRE" }[] = [
      { name: "SWAT", tier: "PRINCIPALE" },
      { name: "CID", tier: "PRINCIPALE" },
      { name: "Park Rangers", tier: "PRINCIPALE" },
      { name: "Training Division", tier: "SECONDAIRE" },
      { name: "PIO", tier: "SECONDAIRE" },
      { name: "Highway Patrol", tier: "SECONDAIRE" },
    ];
    for (const d of divisions) await ctx.db.insert("divisions", d);

    // ---- Permissions (catalogue) ----
    // On réutilise l'existant : `syncPermissions` a pu être lancé avant, et une
    // insertion aveugle dupliquerait tout le catalogue.
    const permIdBySlug = new Map<string, Id<"permissions">>();
    for (const p of await ctx.db.query("permissions").collect()) {
      if (!permIdBySlug.has(p.slug)) permIdBySlug.set(p.slug, p._id);
    }
    for (const p of PERMISSION_SLUGS) {
      if (permIdBySlug.has(p.slug)) continue;
      permIdBySlug.set(p.slug, await ctx.db.insert("permissions", p));
    }

    // Défaut : l'État-Major reçoit TOUTES les permissions.
    const etatMajorGradeIds = gradeIds.filter((_, i) => grades[i].corps === "ETAT_MAJOR");
    for (const gid of etatMajorGradeIds) {
      for (const permId of permIdBySlug.values()) {
        await ctx.db.insert("gradePermissions", { gradeId: gid, permissionId: permId });
      }
    }
    // Base opérationnelle : tous les grades peuvent travailler sur le terrain.
    const OPERATIONAL_BASE = [
      "citoyens.view", "citoyens.create", "citoyens.edit", "citoyens.flag",
      "vehicules.view", "vehicules.create", "vehicules.edit", "vehicules.flag",
      "casier.view", "casier.create", "mandats.view", "mandats.create",
      "contraventions.view", "contraventions.create", "rapports.view", "rapports.create",
      "rapports.contribute", "codepenal.view", "defcon.view", "service.self",
      "effectif.view", "protocoles.view", "formations.view", "absences.request",
      "carte.view", "calendrier.view", "depositions.view", "depositions.create",
      "dispatch.view", "dispatch.self", "bolo.view",
    ];
    for (let i = 0; i < gradeIds.length; i++) {
      if (grades[i].corps === "ETAT_MAJOR") continue; // déjà tout
      for (const slug of OPERATIONAL_BASE) {
        const permId = permIdBySlug.get(slug);
        if (permId) await ctx.db.insert("gradePermissions", { gradeId: gradeIds[i], permissionId: permId });
      }
    }

    // ---- Callsign types ----
    const callsigns = [
      ["Lincoln", "Patrouille seul"], ["Adam", "À deux"], ["Tango", "À trois"], ["Xray", "À quatre"],
      ["Walker", "À pied"], ["Nora", "Patrouille banalisée"], ["Viktor", "Vélo"], ["Mary", "Moto"],
      ["Sierra", "Patrouille en V.I.R"], ["Wilson", "Bateau"], ["Henry", "Hélicoptère"],
    ];
    for (let i = 0; i < callsigns.length; i++) {
      await ctx.db.insert("callsignTypes", { code: callsigns[i][0], label: callsigns[i][1], position: i, active: true });
    }

    // ---- Dispatch : statuts + secteurs par défaut ----
    // `seedDispatch` a pu être lancé avant : sans ce garde-fou, on obtient un
    // second jeu complet de statuts, donc des colonnes en double sur le board.
    if (!(await ctx.db.query("dispatchStatuses").first())) {
      await insertDispatchDefaults(ctx);
    }

    // ---- License types ----
    const licenses = ["Permis de conduire", "Port d'arme (PPA)", "Licence de chasse", "Licence de pêche", "Permis bateau", "Licence de pilote", "Permis haute mer"];
    for (let i = 0; i < licenses.length; i++) {
      await ctx.db.insert("licenseTypes", { name: licenses[i], position: i, active: true });
    }

    // ---- Flag types citoyen (Recherché = dérivé, PAS ici) ----
    const flags = [["Armé et dangereux", "var(--critical)"], ["Liberté conditionnelle", "var(--warning)"], ["Sous surveillance", "var(--muted)"]];
    for (let i = 0; i < flags.length; i++) {
      await ctx.db.insert("flagTypes", { name: flags[i][0], color: flags[i][1], position: i, active: true });
    }

    // ---- Vehicle flag types ----
    const vflags = [["Volé", "var(--danger)"], ["Recherché", "var(--warning)"], ["Saisi (fourrière)", "var(--muted)"]];
    for (let i = 0; i < vflags.length; i++) {
      await ctx.db.insert("vehicleFlagTypes", { name: vflags[i][0], color: vflags[i][1], position: i, active: true });
    }

    // ---- Mandat types ----
    const mandatTypes: [string, boolean][] = [["Mandat d'arrêt", true], ["Mandat de perquisition", false], ["Mandat d'amener", true]];
    for (let i = 0; i < mandatTypes.length; i++) {
      await ctx.db.insert("mandatTypes", { name: mandatTypes[i][0], marksWanted: mandatTypes[i][1], position: i, active: true });
    }

    // ---- DEFCON levels (valeurs de seed - éditables ; interprétation à confirmer) ----
    const defcons = [
      { name: "Vert", color: "var(--success)", fineMultiplier: 0.5, sensitiveFineMultiplier: 0.5, isDefault: true },
      { name: "Orange", color: "var(--warning)", fineMultiplier: 0.7, sensitiveFineMultiplier: 0.7, isDefault: false },
      { name: "Rouge", color: "var(--danger)", fineMultiplier: 1.0, sensitiveFineMultiplier: 2.25, isDefault: false },
      { name: "One", color: "var(--critical)", fineMultiplier: 1.5, sensitiveFineMultiplier: 1.75, isDefault: false },
    ];
    for (let i = 0; i < defcons.length; i++) {
      await ctx.db.insert("defconLevels", { ...defcons[i], position: i });
    }

    // ---- Report types ----
    const reportTypes = [
      "Rapport d'arrestation",
      "Rapport d'incident",
      "Rapport de terrain",
      "Usage de la force",
    ];
    for (let i = 0; i < reportTypes.length; i++) {
      await ctx.db.insert("reportTypes", {
        name: reportTypes[i],
        position: i,
        active: true,
      });
    }

    // ---- Code pénal : severities, catégories, sanctions, charges ----
    const sevIdByName = new Map<string, Id<"severityLevels">>();
    for (let i = 0; i < SEVERITIES.length; i++) {
      sevIdByName.set(SEVERITIES[i], await ctx.db.insert("severityLevels", { name: SEVERITIES[i], position: i }));
    }
    const catIdByName = new Map<string, Id<"penalCategories">>();
    for (const c of CATEGORIES) {
      catIdByName.set(c.name, await ctx.db.insert("penalCategories", { name: c.name, position: c.position, sensitive: c.sensitive }));
    }
    const sanctionIdByName = new Map<string, Id<"sanctionTypes">>();
    for (const s of SANCTIONS) {
      sanctionIdByName.set(s.name, await ctx.db.insert("sanctionTypes", { name: s.name, position: s.position, active: true }));
    }
    for (const c of CHARGES) {
      const categoryId = catIdByName.get(c.category);
      if (!categoryId) continue;
      const severityId = c.severity ? sevIdByName.get(c.severity) : undefined;
      const sanctionIds = c.sanctions
        .map((s) => sanctionIdByName.get(s))
        .filter((x): x is Id<"sanctionTypes"> => x != null);
      await ctx.db.insert("penalCharges", {
        categoryId,
        severityId,
        name: c.name,
        fine: {
          kind: c.fine.kind as "FIXED" | "FORMULA" | "ON_DECISION" | "PER_UNIT" | "UNSPECIFIED",
          amount: "amount" in c.fine ? (c.fine as { amount?: number }).amount : undefined,
          unit: "unit" in c.fine ? (c.fine as { unit?: string }).unit : undefined,
          raw: c.fine.raw,
        },
        recidiveDays: c.recidiveDays ?? undefined,
        jailSeconds: c.jailSeconds ?? undefined,
        jailOnDecision: c.jailOnDecision,
        dojRequest: c.dojRequest,
        sanctionIds,
        description: c.description ?? undefined,
        active: true,
        position: c.position,
      });
    }

    return `Seed OK - ${grades.length} grades, ${divisions.length} divisions, ${PERMISSION_SLUGS.length} permissions, ${CHARGES.length} charges pénales.`;
  },
});

// Formations et spécialités de la Station 13. Idempotent : on n'ajoute que
// les sigles absents, les entrées existantes ne sont pas écrasées.
export const seedQualifications = internalMutation({
  args: {},
  handler: async (ctx) => {
    const ROWS: { code: string; name: string; kind: "FORMATION" | "SPECIALITE"; color: string }[] = [
      { code: "HNT", name: "Hostage Negotiation Team", kind: "FORMATION", color: "#D94040" },
      { code: "PA", name: "Police Academy", kind: "SPECIALITE", color: "#3B82F6" },
      { code: "MRD", name: "Media Relations Division", kind: "SPECIALITE", color: "#8B5CF6" },
      { code: "DISPATCH", name: "Dispatcher", kind: "SPECIALITE", color: "#E0A030" },
    ];
    const existing = await ctx.db.query("qualifications").collect();
    const known = new Set(existing.map((q) => q.code.toUpperCase()));
    let position = existing.length;
    let created = 0;
    for (const r of ROWS) {
      if (known.has(r.code)) continue;
      await ctx.db.insert("qualifications", { ...r, position: position++, active: true });
      created++;
    }
    return `${created} formation(s)/spécialité(s) ajoutée(s).`;
  },
});

// Fusionne les permissions dupliquées (même slug présent plusieurs fois).
// Survient si `seed:seed` a été lancé après `syncPermissions` : l'ancien seed
// insérait tout le catalogue sans vérifier l'existant.
// Les attributions des doublons sont reportées sur l'exemplaire conservé, donc
// aucun droit accordé n'est perdu.
export const dedupePermissions = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const perms = await ctx.db.query("permissions").collect();
    const gradeLinks = await ctx.db.query("gradePermissions").collect();
    const divLinks = await ctx.db.query("divisionPermissions").collect();

    const bySlug = new Map<string, typeof perms>();
    for (const p of perms) {
      if (!bySlug.has(p.slug)) bySlug.set(p.slug, []);
      bySlug.get(p.slug)!.push(p);
    }

    let fusionnees = 0;
    let liensReportes = 0;
    let liensDoublons = 0;

    for (const [, group] of bySlug) {
      if (group.length < 2) continue;
      // On garde l'exemplaire le plus utilisé : il porte déjà les attributions.
      const countOf = (id: string) =>
        gradeLinks.filter((l) => l.permissionId === id).length +
        divLinks.filter((l) => l.permissionId === id).length;
      const keeper = [...group].sort((a, b) => countOf(b._id) - countOf(a._id))[0];

      // Attributions déjà portées par l'exemplaire conservé, pour ne pas les recréer.
      const keptGrades = new Set(gradeLinks.filter((l) => l.permissionId === keeper._id).map((l) => l.gradeId as string));
      const keptDivs = new Set(divLinks.filter((l) => l.permissionId === keeper._id).map((l) => l.divisionId as string));

      for (const dup of group) {
        if (dup._id === keeper._id) continue;
        for (const l of gradeLinks.filter((x) => x.permissionId === dup._id)) {
          if (keptGrades.has(l.gradeId as string)) {
            liensDoublons++;
            if (!dryRun) await ctx.db.delete(l._id);
          } else {
            keptGrades.add(l.gradeId as string);
            liensReportes++;
            if (!dryRun) await ctx.db.patch(l._id, { permissionId: keeper._id });
          }
        }
        for (const l of divLinks.filter((x) => x.permissionId === dup._id)) {
          if (keptDivs.has(l.divisionId as string)) {
            liensDoublons++;
            if (!dryRun) await ctx.db.delete(l._id);
          } else {
            keptDivs.add(l.divisionId as string);
            liensReportes++;
            if (!dryRun) await ctx.db.patch(l._id, { permissionId: keeper._id });
          }
        }
        fusionnees++;
        if (!dryRun) await ctx.db.delete(dup._id);
      }
    }

    return `${fusionnees} doublon(s) supprimé(s), ${liensReportes} attribution(s) reportée(s), ${liensDoublons} attribution(s) redondante(s) nettoyée(s)${dryRun ? " (simulation)" : ""}.`;
  },
});

// Fusionne les statuts et secteurs de dispatch dupliqués (même nom).
// Même origine que pour les permissions : `seed:seed` insérait les valeurs par
// défaut sans vérifier ce que `seedDispatch` avait déjà créé.
// Les patrouilles pointant vers un doublon sont réaffectées à l'exemplaire
// conservé avant suppression, pour ne laisser aucune référence morte.
export const dedupeDispatch = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const statuses = await ctx.db.query("dispatchStatuses").collect();
    const patrols = await ctx.db.query("patrols").collect();

    const byName = new Map<string, typeof statuses>();
    for (const st of statuses) {
      const k = st.name.toLowerCase();
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k)!.push(st);
    }

    let statutsSupprimes = 0;
    let patrouillesReaffectees = 0;
    for (const [, group] of byName) {
      if (group.length < 2) continue;
      // On garde le plus ancien : c'est celui que le board utilise déjà.
      const sorted = [...group].sort((a, b) => a._creationTime - b._creationTime);
      const keeper = sorted[0];
      for (const dup of sorted.slice(1)) {
        for (const p of patrols) {
          if (p.statusId !== dup._id) continue;
          patrouillesReaffectees++;
          if (!dryRun) await ctx.db.patch(p._id, { statusId: keeper._id });
        }
        statutsSupprimes++;
        if (!dryRun) await ctx.db.delete(dup._id);
      }
    }

    const sectors = await ctx.db.query("dispatchSectors").collect();
    const seenSector = new Set<string>();
    let secteursSupprimes = 0;
    for (const sec of [...sectors].sort((a, b) => a._creationTime - b._creationTime)) {
      const k = sec.name.toLowerCase();
      if (!seenSector.has(k)) {
        seenSector.add(k);
        continue;
      }
      secteursSupprimes++;
      if (!dryRun) await ctx.db.delete(sec._id);
    }

    return `${statutsSupprimes} statut(s) et ${secteursSupprimes} secteur(s) dupliqués supprimés, ${patrouillesReaffectees} patrouille(s) réaffectée(s)${dryRun ? " (simulation)" : ""}.`;
  },
});
