import { internalMutation } from "./_generated/server";

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Insère quelques citoyens / véhicules / mandats de démo pour tester le câblage.
// Usage : npx convex run dev:seedDemo
export const seedDemo = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await ctx.db.query("citizens").first()) return "Des citoyens existent déjà.";
    const owner = await ctx.db.query("agents").first();
    const mandatArret = (await ctx.db.query("mandatTypes").collect()).find((t) => t.marksWanted);
    const licenseTypes = await ctx.db.query("licenseTypes").collect();

    const people = [
      { empreinte: "A4F9-22C1", prenom: "Marcus", nom: "Delacroix", dateNaissance: "1991-03-14", sexe: "Masculin", nationalite: "États-Unis", telephone: "555-0142", adresse: "114 Forum Dr., Davis" },
      { empreinte: "B7K2-9931", prenom: "Yara", nom: "Bennani", dateNaissance: "1996-09-22", sexe: "Féminin", nationalite: "États-Unis", telephone: "555-0199", adresse: "3 Vespucci Blvd" },
      { empreinte: "C1P8-4420", prenom: "Liam", nom: "Ferreira", dateNaissance: "1988-01-05", sexe: "Masculin", nationalite: "Portugal", telephone: "555-0231", adresse: "Sandy Shores" },
    ];
    const ids = [];
    for (const p of people) {
      const id = await ctx.db.insert("citizens", {
        ...p,
        photoStorageIds: [],
        status: "ACTIVE" as const,
        searchText: norm(`${p.prenom} ${p.nom} ${p.empreinte} ${p.telephone}`),
      });
      ids.push(id);
    }

    await ctx.db.insert("vehicles", {
      plaque: "SA-88KZ", modele: "Bravado Banshee", couleur: "Noir", type: "voiture",
      ownerId: ids[0], photoStorageIds: [], searchText: norm("sa-88kz bravado banshee marcus delacroix"),
    });
    await ctx.db.insert("vehicles", {
      plaque: "42XVLT", modele: "Declasse Sabre", couleur: "Rouge", type: "voiture",
      ownerId: ids[0], photoStorageIds: [], searchText: norm("42xvlt declasse sabre marcus delacroix"),
    });

    if (licenseTypes[0]) {
      await ctx.db.insert("citizenLicenses", { citizenId: ids[0], licenseTypeId: licenseTypes[0]._id, status: "VALIDE" as const, updatedAt: Date.now() });
    }
    if (licenseTypes[1]) {
      await ctx.db.insert("citizenLicenses", { citizenId: ids[0], licenseTypeId: licenseTypes[1]._id, status: "SUSPENDU" as const, updatedAt: Date.now() });
    }

    if (mandatArret && owner) {
      await ctx.db.insert("mandats", {
        citizenId: ids[0], typeId: mandatArret._id, motif: "Trafic de stupéfiants - non-présentation",
        status: "ACTIF" as const, issuedBy: owner._id, issuedAt: Date.now() - 34 * 60_000,
      });
      await ctx.db.insert("mandats", {
        citizenId: ids[2], typeId: mandatArret._id, motif: "Évasion",
        status: "ACTIF" as const, issuedBy: owner._id, issuedAt: Date.now() - 2 * 3600_000,
      });
    }
    return `Démo seedée - ${ids.length} citoyens, 2 véhicules, 2 mandats.`;
  },
});

// Agents de démonstration (pour peupler l'effectif / la présence). Usage : npx convex run dev:seedAgents
export const seedAgents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const agents = await ctx.db.query("agents").collect();
    if (agents.length > 1) return "Agents démo déjà présents.";
    const grades = await ctx.db.query("grades").collect();
    const divisions = await ctx.db.query("divisions").collect();
    const gradeByName = (n: string) => grades.find((g) => g.name === n);
    const divByName = (n: string) => divisions.find((d) => d.name === n);

    const demo = [
      { prenom: "Rita", nom: "Moreau", grade: "Lieutenant 1", matricule: 11, divs: ["CID"], onDuty: true },
      { prenom: "Jae", nom: "Diaz", grade: "Trooper", matricule: 12, divs: ["Highway Patrol", "Park Rangers"], onDuty: true },
      { prenom: "Sam", nom: "Chen", grade: "Senior Trooper", matricule: 13, divs: [], onDuty: false },
    ];
    for (const d of demo) {
      const userId = await ctx.db.insert("users", { name: `${d.prenom} ${d.nom}` });
      const g = gradeByName(d.grade);
      const agentId = await ctx.db.insert("agents", {
        userId,
        login: `${norm(d.prenom)}.${norm(d.nom)}`,
        nomRP: d.nom,
        prenomRP: d.prenom,
        matricule: d.matricule,
        gradeId: g?._id,
        status: "ACTIVE",
        isOwner: false,
        dateEntree: Date.now(),
      });
      for (const dn of d.divs) {
        const div = divByName(dn);
        if (div) await ctx.db.insert("agentDivisions", { agentId, divisionId: div._id });
      }
      if (d.onDuty) {
        await ctx.db.insert("serviceSessions", { agentId, source: "MANUAL", startedAt: Date.now() - 3600_000 });
      }
    }
    return `${demo.length} agents démo créés.`;
  },
});

// Réinitialise les données de démo (citoyens, véhicules, mandats, casiers, contraventions, annonces).
// Usage : npx convex run dev:resetDemo   (puis re-seed)
export const resetDemo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tables = [
      "citationCharges",
      "citations",
      "casierCharges",
      "casierEntries",
      "mandats",
      "vehicleFlags",
      "vehicles",
      "citizenLicenses",
      "citizenFlags",
      "dossierViews",
      "citizens",
    ];
    let total = 0;
    for (const name of tables) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = await ctx.db.query(name as any).collect();
        for (const r of rows) {
          await ctx.db.delete(r._id);
          total++;
        }
      } catch {
        // table absente - on ignore
      }
    }
    return `Démo réinitialisée - ${total} documents supprimés.`;
  },
});

// Attribue le matricule 00 à l'owner s'il n'en a pas (point 9). Usage : npx convex run dev:fixMatricules
export const fixMatricules = internalMutation({
  args: {},
  handler: async (ctx) => {
    const agents = await ctx.db.query("agents").collect();
    let n = 0;
    for (const a of agents) {
      if (a.isOwner && a.matricule == null) {
        await ctx.db.patch(a._id, { matricule: 0 });
        n++;
      }
    }
    return `${n} owner(s) corrigé(s).`;
  },
});

// Seed des nouveaux référentiels (§12, §9). Idempotent. Usage : npx convex run dev:seedExtras
export const seedExtras = internalMutation({
  args: {},
  handler: async (ctx) => {
    let n = 0;
    if (!(await ctx.db.query("disciplineSanctionTypes").first())) {
      const sanctions = ["Avertissement", "Blâme", "Mise à pied", "Rétrogradation", "Renvoi"];
      for (let i = 0; i < sanctions.length; i++) {
        await ctx.db.insert("disciplineSanctionTypes", { name: sanctions[i], position: i, active: true });
        n++;
      }
    }
    if (!(await ctx.db.query("resourceCategories").first())) {
      const cats = ["Codes radio", "Procédures", "Cartographie", "Droits & lois", "Formation"];
      for (let i = 0; i < cats.length; i++) {
        await ctx.db.insert("resourceCategories", { name: cats[i], position: i });
        n++;
      }
    }
    return `${n} référentiels seedés.`;
  },
});

// Seed des référentiels phase 2 (armes, plaintes, dossiers, description physique). Idempotent.
export const seedPhase2 = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sets: Record<string, string[]> = {
      weaponTypes: ["Pistolet", "Revolver", "Fusil à pompe", "Fusil d'assaut", "Fusil de précision", "Arme blanche", "Taser"],
      complaintStatuses: ["Ouverte", "En cours", "Classée sans suite", "Résolue", "Rejetée"],
      dossierStatuses: ["En attente de jugement", "En cellule", "Jugé", "Libéré", "Evadé"],
      ethnies: ["Caucasien", "Afro-américain", "Hispanique", "Asiatique", "Moyen-oriental", "Autre"],
      hairColors: ["Noir", "Brun", "Châtain", "Blond", "Roux", "Gris", "Blanc", "Chauve"],
      eyeColors: ["Marron", "Bleu", "Vert", "Gris", "Noisette", "Noir"],
      citizenGroups: ["Aucun", "Civil", "Gang", "Entreprise", "Gouvernement", "LSPD"],
    };
    let n = 0;
    for (const [table, names] of Object.entries(sets)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (await ctx.db.query(table as any).first()) continue;
      for (let i = 0; i < names.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ctx.db.insert(table as any, { name: names[i], position: i, active: true } as any);
        n++;
      }
    }
    return `${n} entrées de référentiel phase 2 seedées.`;
  },
});

// Définit le fond de carte Los Santos par défaut. Usage : npx convex run dev:seedMap
export const seedMap = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("mapConfig").first();
    if (existing) {
      await ctx.db.patch(existing._id, { imageUrl: "/map/los-santos.jpg", updatedAt: Date.now() });
    } else {
      await ctx.db.insert("mapConfig", { imageUrl: "/map/los-santos.jpg", updatedAt: Date.now() });
    }
    return "Fond de carte Los Santos défini.";
  },
});

// Réinitialise les 5 niveaux DEFCON avec les couleurs Vert/Jaune/Orange/Rouge/Noir.
// Amende non impactée (multiplicateurs à 1). Usage : npx convex run dev:resetDefcon
export const resetDefcon = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const l of await ctx.db.query("defconLevels").collect()) await ctx.db.delete(l._id);
    const levels = [
      { name: "Vert", color: "#16a34a" },
      { name: "Jaune", color: "#eab308" },
      { name: "Orange", color: "#f97316" },
      { name: "Rouge", color: "#dc2626" },
      { name: "Noir", color: "#111318" },
    ];
    for (let i = 0; i < levels.length; i++) {
      await ctx.db.insert("defconLevels", {
        name: levels[i].name,
        position: i,
        color: levels[i].color,
        fineMultiplier: 1,
        sensitiveFineMultiplier: 1,
        isDefault: i === 0,
      });
    }
    return `${levels.length} niveaux DEFCON réinitialisés.`;
  },
});

// Types d'objets saisissables par défaut (item 10). Idempotent.
export const seedSaisieTypes = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await ctx.db.query("saisieObjectTypes").first()) return "Types de saisie déjà présents.";
    const names = ["Arme à feu", "Arme blanche", "Stupéfiants", "Argent liquide", "Véhicule", "Téléphone", "Document", "Matériel"];
    for (let i = 0; i < names.length; i++) await ctx.db.insert("saisieObjectTypes", { name: names[i], position: i, active: true });
    return `${names.length} types de saisie seedés.`;
  },
});

// Outils de DEV - à retirer en production.
// Réinitialise les comptes (auth + profils agents) sans toucher aux référentiels seedés.
// Usage : npx convex run dev:resetAccounts
export const resetAccounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tables = [
      "authRefreshTokens",
      "authSessions",
      "authVerificationCodes",
      "authVerifiers",
      "authAccounts",
      "authRateLimits",
      "users",
      "agentDivisions",
      "gradeHistory",
      "serviceSessions",
      "dossierViews",
      "agents",
    ];
    let total = 0;
    for (const name of tables) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = await ctx.db.query(name as any).collect();
        for (const r of rows) {
          await ctx.db.delete(r._id);
          total++;
        }
      } catch {
        // table absente - on ignore
      }
    }
    return `Comptes réinitialisés - ${total} documents supprimés.`;
  },
});
