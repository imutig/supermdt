import { internalAction, internalMutation, action, query } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { can } from "./rbac";

// ============================================================================
// Synchronisation depuis l'ancien MDT (NEXUS / vizu-world) vers Station 13.
//
// UN SEUL lancement récupère citoyens + code pénal + armes en direct via l'API,
// ajoute les nouveaux (idempotent), et renvoie un rapport.
//
//   1) Récupérer un token (une fois, il dure quelques heures) :
//      - se connecter sur https://mdt.vizu-world.com (service LSPD Station 13)
//      - console du navigateur (F12) :  JSON.parse(localStorage.auth).state.token
//      - le stocker côté Convex :  npx convex env set VIZU_TOKEN "eyJ..."
//
//   2) Lancer la synchro :          npx convex run migration:sync
//      Aperçu sans écrire :         npx convex run migration:sync '{"dryRun":true}'
//      Reconstruire le code pénal :  npx convex run migration:sync '{"resetPenal":true}'
//      Token en direct (sans env) :  npx convex run migration:sync '{"token":"eyJ..."}'
// ============================================================================

const BASE = "https://mdt.vizu-world.com";

type CitRep = { source: number; presents: number; ajoutes: number; permisAjoutes: number; enrichis: number };
type WpnRep = { source: number; presents: number; ajoutes: number; proprietairesNonTrouves: number; originesAjoutees: number; enrichis?: number };
type ChRep = { source: number; presents: number; ajoutes: number; enrichis: number; mode: string };

// ---------------------------- helpers de mapping ----------------------------
function norm(s: string) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
function fmtMoney(n: number) {
  return "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
function mapSexe(s: string) {
  return s === "Homme" ? "H" : s === "Femme" ? "F" : (s || "");
}
function parseJail(t: string): { seconds?: number; perpetuity: boolean } {
  const s = (t || "").trim().toUpperCase();
  if (!s) return { seconds: undefined, perpetuity: false };
  if (s.includes("PERP")) return { seconds: undefined, perpetuity: true };
  const m = s.match(/^(\d{1,3}):(\d{2}):(\d{2})$/);
  if (!m) return { seconds: undefined, perpetuity: false };
  return { seconds: +m[1] * 3600 + +m[2] * 60 + +m[3], perpetuity: false };
}
function mapWeaponStatus(s: string): "ACTIVE" | "ENREGISTREE" | "SAISIE" | "DETRUITE" {
  const n = norm(s);
  if (n.includes("sais")) return "SAISIE";
  if (n.includes("detru")) return "DETRUITE";
  if (n.includes("enreg")) return "ENREGISTREE";
  return "ACTIVE";
}

// Gravités (= catégories, l'ancien MDT n'ayant pas de catégories distinctes).
const SEVERITIES = [
  { name: "Contravention", color: "#6b7280", sensitive: false },
  { name: "Délit mineur", color: "#eab308", sensitive: false },
  { name: "Délit majeur", color: "#f97316", sensitive: true },
  { name: "Crime", color: "#ef4444", sensitive: true },
  { name: "Délit d'entreprise", color: "#3b82f6", sensitive: false },
];
const sevOrder = new Map(SEVERITIES.map((s, i) => [s.name, i]));

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapCharge(c: any) {
  const jail = parseJail(c.tempsPrison);
  const amende = Number(c.amende) || 0;
  const instr = (c.instruction || "").trim();
  const aggr = (c.aggravation || "").trim();
  const fine =
    amende > 0
      ? { kind: "FIXED" as const, amount: amende, raw: fmtMoney(amende) }
      : { kind: "UNSPECIFIED" as const, raw: instr || "Non spécifié" };
  const desc: string[] = [];
  if (aggr) desc.push("Aggravation : " + aggr);
  if (amende > 0 && instr) desc.push(instr);
  if (jail.perpetuity) desc.push("Peine : perpétuité");
  return {
    name: (c.nom || "").trim(),
    severity: c.type,
    fine,
    jailSeconds: jail.seconds,
    description: desc.join(" · ") || undefined,
    // Parité NexusMDT
    pointsPermis: Number(c.pointsPermis) > 0 ? Number(c.pointsPermis) : undefined,
    chargeType: (c.type || "").trim() || undefined,
    instruction: instr || undefined,
  };
}
export function mapCitizen(c: any) {
  const numero = c.numero ?? c._id;
  const cu = c.contactUrgence;
  const hasCu = cu && (cu.nom || cu.prenom || cu.telephone);
  return {
    prenom: c.prenom,
    nom: c.nom,
    dateNaissance: c.dateNaissance || undefined,
    lieuNaissance: c.lieuNaissance || undefined,
    sexe: mapSexe(c.sexe),
    taille: c.taille ? String(c.taille) : undefined,
    poids: c.poids ? String(c.poids) : undefined,
    ethnie: c.ethnie || undefined,
    cheveux: c.couleurCheveux || undefined,
    yeux: c.couleurYeux || undefined,
    adresse: c.adresse || undefined,
    groupe: c.appartenance || undefined,
    metier: c.emploi || undefined,
    telephone: c.telephone || undefined,
    email: c.email || undefined,
    deceased: !!c.decede,
    mugshotUrl: c.photoUrl || undefined,
    permisConduire: !!c.permisConduire,
    // Parité NexusMDT
    importRef: numero != null ? `nexus-citoyen:${numero}` : undefined,
    nexusId: (c._id || c.id) ? String(c._id || c.id) : undefined,
    groupeSanguin: c.groupeSanguin || undefined,
    allergies: c.allergies || undefined,
    antecedents: c.antecedents || undefined,
    traitements: c.traitements || undefined,
    ppaChasse: !!c.ppaChasse,
    contactUrgence: hasCu
      ? { nom: cu.nom || undefined, prenom: cu.prenom || undefined, telephone: cu.telephone || undefined }
      : undefined,
  };
}
function mapWeapon(w: any) {
  // L'origine est une catégorie à part entière, pas un bout de motif.
  const parts = [
    (w.motifs || "").trim(),
    w.utiliseDelit ? "Utilisée dans un délit" : "",
  ].filter(Boolean);
  return {
    serial: (w.numeroSerie || "").trim(),
    modele: (w.modele || "").trim() || "Inconnu",
    motif: parts.join(" · ") || undefined,
    origine: (w.origine || "").trim() || undefined,
    dateEnregistrement: (w.dateEnregistrement || "").trim() || undefined,
    status: mapWeaponStatus(w.statut),
    ownerName: w.citoyenLie?.nom || "",
  };
}

// Mapping véhicule (champs confirmés via HAR : marque+modele, categorie, notes,
// proprietaire.nom = nom complet).
function mapVehicle(v: any) {
  return {
    plaque: (v.plaque || "").trim().toUpperCase(),
    modele: [(v.marque || "").trim(), (v.modele || "").trim()].filter(Boolean).join(" ") || undefined,
    couleur: (v.couleur || "").trim() || undefined,
    type: (v.categorie || "").trim() || undefined,
    notes: (v.notes || "").trim() || undefined,
    nexusStatut: (v.statut || "").trim() || undefined,
    ownerName: (v.proprietaire?.nom || "").trim(),
  };
}

// ------------------------------- fetch API ----------------------------------
async function apiGet(path: string, token: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401)
    throw new Error("Token invalide ou expiré. Récupère un nouveau token (localStorage.auth) puis: npx convex env set VIZU_TOKEN \"...\"");
  if (!res.ok) throw new Error(`Erreur API ${res.status} sur ${path}`);
  return res.json();
}
async function fetchAllPaged(path: string, key: string, token: string): Promise<any[]> {
  const first = await apiGet(`${path}&page=1&limit=100`, token);
  let all = (first[key] || []).slice();
  const pages = first.pages || 1;
  for (let p = 2; p <= pages; p++) {
    const j = await apiGet(`${path}&page=${p}&limit=100`, token);
    all = all.concat(j[key] || []);
  }
  return all;
}

// =============================== ACTION SYNC =================================
export const sync = internalAction({
  args: { token: v.optional(v.string()), dryRun: v.optional(v.boolean()), resetPenal: v.optional(v.boolean()), createMissingCitizens: v.optional(v.boolean()) },
  handler: async (ctx, { token, dryRun, resetPenal, createMissingCitizens }) => {
    const t0 = Date.now();
    const tk = token || process.env.VIZU_TOKEN;
    if (!tk)
      throw new Error("Aucun token. Définis-le: npx convex env set VIZU_TOKEN \"<token>\"  (token = JSON.parse(localStorage.auth).state.token sur mdt.vizu-world.com), ou passe {\"token\":\"...\"}.");

    // Récupération en direct
    const [citoyens, armes, chargesRaw] = await Promise.all([
      fetchAllPaged("/api/citoyens?entity=lspd&search=", "citoyens", tk),
      fetchAllPaged("/api/armes?entity=lspd", "armes", tk),
      apiGet("/api/charges?entity=lspd", tk).then((j) => j.charges || []),
    ]);

    const citRows = citoyens.map(mapCitizen);
    const wRows = armes.map(mapWeapon);
    const chRows = chargesRaw.map(mapCharge);

    const citoyensRep: CitRep = await ctx.runMutation(internal.migration._upsertCitizens, { rows: citRows, dryRun });
    const armesRep: WpnRep = await ctx.runMutation(internal.migration._upsertWeapons, { rows: wRows, dryRun });
    const codePenalRep: ChRep = await ctx.runMutation(internal.migration._upsertCharges, { rows: chRows, dryRun, reset: resetPenal });

    // Véhicules : uniquement si l'endpoint est configuré (VIZU_VEHICLES_PATH,
    // ex. "/api/vehicules?entity=lspd"). Clé de réponse « vehicules » à confirmer.
    let vehiculesRep: unknown = null;
    const vehPath = process.env.VIZU_VEHICLES_PATH;
    if (vehPath) {
      const vehsRaw = await fetchAllPaged(vehPath, "vehicules", tk);
      vehiculesRep = await ctx.runMutation(internal.migration._upsertVehicles, { rows: vehsRaw.map(mapVehicle), dryRun });
    }

    // Casiers (dossiers d'arrestation) : après les citoyens/code pénal, pour un
    // meilleur rattachement. Import robuste (voir casiersImport.ts).
    const casiersRep: unknown = await ctx.runAction(internal.casiersImport.casiersSync, { token: tk, dryRun, createMissing: createMissingCitizens });
    // Contraventions (amendes Nexus) : même modèle que les casiers.
    const contraventionsRep: unknown = await ctx.runAction(internal.casiersImport.contraventionsSync, { token: tk, dryRun, createMissing: createMissingCitizens });

    // Journalise l'import pour la page de monitoring (sauf aperçu).
    if (!dryRun) {
      const cit = citoyensRep as CitRep;
      const cas = casiersRep as { ajoutes?: number; supprimes?: number };
      const con = contraventionsRep as { ajoutes?: number; supprimes?: number };
      await ctx.runMutation(internal.nexusSync._log, {
        direction: "IMPORT", entity: "import-complet", op: "SYNC", ok: true,
        durationMs: Date.now() - t0,
        detail: `citoyens +${cit.ajoutes}/enr ${cit.enrichis} · casiers +${cas.ajoutes ?? 0}/-${cas.supprimes ?? 0} · contraventions +${con.ajoutes ?? 0}/-${con.supprimes ?? 0}`,
      });
    }

    return {
      ok: true,
      mode: dryRun ? "APERÇU (rien écrit)" : "SYNCHRONISÉ",
      duree_s: ((Date.now() - t0) / 1000).toFixed(1),
      citoyens: citoyensRep,
      armes: armesRep,
      codePenal: codePenalRep,
      vehicules: vehiculesRep,
      casiers: casiersRep,
      contraventions: contraventionsRep,
    };
  },
});

// =============================== AUTO-SYNC ==================================
// Reconnexion automatique : le cron obtient un token frais par login (le token
// vizu expire après quelques heures), puis lance la synchro. Reste INERTE tant
// que VIZU_EMAIL / VIZU_PASSWORD ne sont pas configurés.
//
//   npx convex env set VIZU_EMAIL "..."      (compte de service vizu)
//   npx convex env set VIZU_PASSWORD "..."
//   npx convex env set VIZU_LOGIN_PATH "/api/auth/login"   (à confirmer)
//   npx convex env set VIZU_VEHICLES_PATH "/api/vehicules?entity=lspd"  (à confirmer)
async function vizuLogin(): Promise<string> {
  const email = process.env.VIZU_EMAIL;
  const password = process.env.VIZU_PASSWORD;
  const path = process.env.VIZU_LOGIN_PATH || "/auth/login";
  if (!email || !password) throw new Error("VIZU_EMAIL / VIZU_PASSWORD non configurés.");
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login vizu échoué (${res.status}).`);
  const j: any = await res.json();
  // Formats tolérés ; à ajuster selon la vraie réponse de l'API vizu.
  const token = j.token || j.accessToken || j?.state?.token || j?.data?.token || j?.data?.accessToken;
  if (!token) throw new Error("Token introuvable dans la réponse de login vizu.");
  return token;
}

export const autoSync = internalAction({
  args: { retry: v.optional(v.number()) },
  handler: async (ctx, { retry }): Promise<unknown> => {
    try {
      // Priorité à un compte Nexus LIÉ et valide (write-through) : son mot de
      // passe est à jour dans le coffre. Sinon le compte de service VIZU_*.
      let token: string | null = await ctx.runAction(internal.nexusSync.anyLinkedToken, {});
      if (!token) {
        if (!process.env.VIZU_EMAIL || !process.env.VIZU_PASSWORD) {
          console.log("[autoSync] aucun compte lié et VIZU_EMAIL/PASSWORD absents : synchro ignorée.");
          return { skipped: true };
        }
        token = await vizuLogin();
      }
      const rep = await ctx.runAction(internal.migration.sync, { token });
      console.log("[autoSync] synchro terminée :", JSON.stringify(rep));
      return rep;
    } catch (err) {
      const attempt = retry ?? 0;
      console.error(`[autoSync] échec (tentative ${attempt + 1}) :`, err);
      // Retry avec backoff (Nexus peut être brièvement down) : 2 réessais à 3 min,
      // puis 6 min. On ne journalise l'échec (et donc l'alerte) qu'à l'épuisement.
      if (attempt < 2) {
        await ctx.scheduler.runAfter((attempt + 1) * 3 * 60_000, internal.migration.autoSync, { retry: attempt + 1 });
        return { ok: false, retrying: true, attempt: attempt + 1 };
      }
      await ctx.runMutation(internal.nexusSync._log, { direction: "IMPORT", entity: "import-complet", op: "SYNC", ok: false, error: String(err).slice(0, 200) }).catch(() => {});
      return { ok: false, error: String(err) };
    }
  },
});

// Autorisation de la synchro manuelle : owner ou détenteur de rbac.manage.
export const canSync = query({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) return false;
    const agent = await ctx.db.query("agents").withIndex("by_userId", (q) => q.eq("userId", uid)).unique();
    if (!agent || agent.status !== "ACTIVE") return false;
    return agent.isOwner || (await can(ctx, agent, "rbac.manage"));
  },
});

// Synchro déclenchée à la main depuis l'Administration.
export const runSync = action({
  args: {},
  handler: async (ctx): Promise<unknown> => {
    const ok = await ctx.runQuery(api.migration.canSync, {});
    if (!ok) throw new Error("Vous n'êtes pas autorisé à lancer la synchronisation.");
    // Priorité au compte Nexus lié de l'admin (write-through, testé OK) ; sinon
    // le compte de service VIZU_EMAIL/PASSWORD.
    const agentId = await ctx.runQuery(api.nexusSync.myAgentId, {});
    let token: string | null = agentId ? await ctx.runAction(internal.nexusSync.tokenFor, { agentId }) : null;
    // Sinon n'importe quel compte lié valide, puis le compte de service.
    if (!token) token = await ctx.runAction(internal.nexusSync.anyLinkedToken, {});
    if (!token) {
      if (!process.env.VIZU_EMAIL || !process.env.VIZU_PASSWORD)
        throw new Error("Aucun identifiant Nexus : lie ton compte dans Mon profil (Utiliser SuperMDT comme MDT principal), ou configure VIZU_EMAIL / VIZU_PASSWORD.");
      token = await vizuLogin();
    }
    // Ne PAS recréer les fiches de citoyens supprimés du Nexus : ce qui est
    // supprimé côté Nexus ne doit pas réapparaître (réconciliation stricte).
    return await ctx.runAction(internal.migration.sync, { token, createMissingCitizens: false });
  },
});

// ============================ MUTATIONS UPSERT ==============================
export const _upsertCitizens = internalMutation({
  args: { rows: v.array(v.any()), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { rows, dryRun }): Promise<CitRep> => {
    const existing = await ctx.db.query("citizens").collect();
    const byKey = new Map(existing.map((c) => [norm(`${c.prenom}|${c.nom}|${c.dateNaissance ?? ""}`), c]));
    const permis = (await ctx.db.query("licenseTypes").collect()).find((l) => norm(l.name).includes("permis de conduire"));
    // Champs de parité Nexus : on les rétro-remplit sur les fiches existantes,
    // sans écraser une valeur déjà renseignée côté SuperMDT.
    const parityFields = ["importRef", "nexusId", "lieuNaissance", "groupeSanguin", "allergies", "antecedents", "traitements", "contactUrgence"] as const;

    let ajoutes = 0, permisAjoutes = 0, enrichis = 0;
    const seen = new Set<string>();
    for (const c of rows) {
      const key = norm(`${c.prenom}|${c.nom}|${c.dateNaissance ?? ""}`);
      const ex = byKey.get(key);
      if (ex || seen.has(key)) {
        if (ex && !dryRun) {
          const patch: Record<string, unknown> = {};
          for (const f of parityFields) if ((ex as any)[f] == null && (c as any)[f] != null) patch[f] = (c as any)[f];
          if (ex.ppaChasse == null && c.ppaChasse) patch.ppaChasse = true;
          if (Object.keys(patch).length) { await ctx.db.patch(ex._id, patch); enrichis++; }
        }
        continue;
      }
      seen.add(key);
      ajoutes++;
      if (c.permisConduire && permis) permisAjoutes++;
      if (dryRun) continue;
      const id = await ctx.db.insert("citizens", {
        prenom: c.prenom, nom: c.nom, dateNaissance: c.dateNaissance, lieuNaissance: c.lieuNaissance, sexe: c.sexe,
        taille: c.taille, poids: c.poids, ethnie: c.ethnie, cheveux: c.cheveux, yeux: c.yeux,
        adresse: c.adresse, groupe: c.groupe, metier: c.metier, telephone: c.telephone,
        email: c.email, deceased: c.deceased, mugshotUrl: c.mugshotUrl,
        importRef: c.importRef, nexusId: c.nexusId, groupeSanguin: c.groupeSanguin, allergies: c.allergies,
        antecedents: c.antecedents, traitements: c.traitements, ppaChasse: c.ppaChasse || undefined,
        contactUrgence: c.contactUrgence,
        photoStorageIds: [], status: "ACTIVE" as const,
        searchText: norm(`${c.prenom} ${c.nom} ${c.telephone ?? ""}`),
      });
      if (c.permisConduire && permis)
        await ctx.db.insert("citizenLicenses", { citizenId: id, licenseTypeId: permis._id, status: "VALIDE" as const, updatedAt: Date.now() });
    }
    return { source: rows.length, presents: existing.length, ajoutes, permisAjoutes, enrichis };
  },
});

export const _upsertWeapons = internalMutation({
  args: { rows: v.array(v.any()), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { rows, dryRun }): Promise<WpnRep> => {
    const existing = await ctx.db.query("weapons").collect();
    const bySerial = new Map(existing.map((w) => [norm(w.serial), w]));

    // table prénom+nom -> citizen (pour rattacher le propriétaire par nom)
    const citizens = await ctx.db.query("citizens").collect();
    const byName = new Map<string, Id<"citizens">>();
    for (const c of citizens) {
      byName.set(norm(`${c.prenom} ${c.nom}`), c._id);
      byName.set(norm(`${c.nom} ${c.prenom}`), c._id);
    }

    // Le référentiel des origines doit suivre les armes importées, sinon
    // l'origine existe sur la fiche mais reste absente de la liste déroulante.
    const originRows = await ctx.db.query("weaponOrigins").collect();
    const knownOrigins = new Set(originRows.map((o) => o.name.toLowerCase()));
    let originPos = originRows.length;
    let originesAjoutees = 0;

    let ajoutes = 0, sansProprietaire = 0;
    const seen = new Set<string>();
    let enrichis = 0;
    for (const w of rows) {
      const s = norm(w.serial);
      if (!s) continue;
      const exW = bySerial.get(s);
      if (exW || seen.has(s)) {
        if (exW && !dryRun && exW.dateEnregistrement == null && w.dateEnregistrement) {
          await ctx.db.patch(exW._id, { dateEnregistrement: w.dateEnregistrement }); enrichis++;
        }
        continue;
      }
      seen.add(s);
      ajoutes++;
      const ownerId = w.ownerName ? byName.get(norm(w.ownerName)) : undefined;
      if (w.ownerName && !ownerId) sansProprietaire++;
      if (w.origine && !knownOrigins.has(String(w.origine).toLowerCase())) {
        knownOrigins.add(String(w.origine).toLowerCase());
        originesAjoutees++;
        if (!dryRun) await ctx.db.insert("weaponOrigins", { name: w.origine, position: originPos++, active: true });
      }
      if (dryRun) continue;
      await ctx.db.insert("weapons", {
        modele: w.modele, serial: w.serial, motif: w.motif, origine: w.origine, ownerId,
        dateEnregistrement: w.dateEnregistrement,
        status: w.status, at: Date.now(),
        searchText: norm(`${w.serial} ${w.modele} ${w.ownerName ?? ""}`),
      });
    }
    return { source: rows.length, presents: existing.length, ajoutes, proprietairesNonTrouves: sansProprietaire, originesAjoutees, enrichis };
  },
});

export const _upsertVehicles = internalMutation({
  args: { rows: v.array(v.any()), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { rows, dryRun }) => {
    const existing = await ctx.db.query("vehicles").collect();
    const byPlate = new Map(existing.map((x) => [norm(x.plaque), x]));
    const citizens = await ctx.db.query("citizens").collect();
    const byName = new Map<string, Id<"citizens">>();
    for (const c of citizens) {
      byName.set(norm(`${c.prenom} ${c.nom}`), c._id);
      byName.set(norm(`${c.nom} ${c.prenom}`), c._id);
    }
    let ajoutes = 0, sansProprietaire = 0, enrichis = 0;
    const seen = new Set<string>();
    for (const v0 of rows) {
      const p = norm(v0.plaque);
      if (!p) continue;
      const exV = byPlate.get(p);
      if (exV || seen.has(p)) {
        if (exV && !dryRun && exV.nexusStatut == null && v0.nexusStatut) {
          await ctx.db.patch(exV._id, { nexusStatut: v0.nexusStatut }); enrichis++;
        }
        continue;
      }
      seen.add(p);
      ajoutes++;
      const ownerId = v0.ownerName ? byName.get(norm(v0.ownerName)) : undefined;
      if (v0.ownerName && !ownerId) sansProprietaire++;
      if (dryRun) continue;
      await ctx.db.insert("vehicles", {
        plaque: v0.plaque, modele: v0.modele, couleur: v0.couleur, type: v0.type, notes: v0.notes, ownerId,
        nexusStatut: v0.nexusStatut,
        photoStorageIds: [],
        searchText: norm(`${v0.plaque} ${v0.modele ?? ""} ${v0.couleur ?? ""} ${v0.type ?? ""}`),
      });
    }
    return { source: rows.length, presents: existing.length, ajoutes, proprietairesNonTrouves: sansProprietaire, enrichis };
  },
});

export const _upsertCharges = internalMutation({
  args: { rows: v.array(v.any()), dryRun: v.optional(v.boolean()), reset: v.optional(v.boolean()) },
  handler: async (ctx, { rows, dryRun, reset }): Promise<ChRep> => {
    // dédup source (nom+gravité) + tri
    const seen = new Set<string>();
    const charges = [];
    for (const c of rows) {
      const key = norm(c.name) + "|" + c.severity;
      if (seen.has(key)) continue;
      seen.add(key);
      charges.push(c);
    }
    charges.sort((a, b) => {
      const so = (sevOrder.get(a.severity) ?? 99) - (sevOrder.get(b.severity) ?? 99);
      return so !== 0 ? so : a.name.localeCompare(b.name, "fr");
    });

    if (reset && !dryRun) {
      for (const t of ["penalCharges", "penalCategories", "severityLevels"] as const)
        for (const row of await ctx.db.query(t).collect()) await ctx.db.delete(row._id);
    }

    // gravités + catégories (créées si absentes)
    const sevByName = new Map<string, Id<"severityLevels">>();
    const catByName = new Map<string, Id<"penalCategories">>();
    for (const s of await ctx.db.query("severityLevels").collect()) sevByName.set(s.name, s._id);
    for (const c of await ctx.db.query("penalCategories").collect()) catByName.set(c.name, c._id);
    if (!dryRun) {
      for (let i = 0; i < SEVERITIES.length; i++) {
        const s = SEVERITIES[i];
        if (!sevByName.has(s.name)) sevByName.set(s.name, await ctx.db.insert("severityLevels", { name: s.name, position: i, color: s.color }));
        if (!catByName.has(s.name)) catByName.set(s.name, await ctx.db.insert("penalCategories", { name: s.name, position: i, sensitive: s.sensitive }));
      }
    }

    const existing = await ctx.db.query("penalCharges").collect();
    const byName = new Map(existing.map((p) => [norm(p.name), p]));
    let ajoutes = 0, enrichis = 0;
    let pos = existing.length;
    for (const c of charges) {
      const exC = byName.get(norm(c.name));
      if (exC) {
        // Rétro-remplit les champs de parité sur une charge existante.
        if (!dryRun) {
          const patch: Record<string, unknown> = {};
          if (exC.pointsPermis == null && c.pointsPermis != null) patch.pointsPermis = c.pointsPermis;
          if (exC.chargeType == null && c.chargeType) patch.chargeType = c.chargeType;
          if (exC.instruction == null && c.instruction) patch.instruction = c.instruction;
          if (Object.keys(patch).length) { await ctx.db.patch(exC._id, patch); enrichis++; }
        }
        continue;
      }
      ajoutes++;
      if (dryRun) continue;
      const categoryId = catByName.get(c.severity);
      if (!categoryId) continue;
      await ctx.db.insert("penalCharges", {
        categoryId, severityId: sevByName.get(c.severity), name: c.name, fine: c.fine,
        recidiveDays: undefined, jailSeconds: c.jailSeconds, jailOnDecision: false,
        dojRequest: false, sanctionIds: [], description: c.description, active: true, position: pos++,
        pointsPermis: c.pointsPermis, chargeType: c.chargeType, instruction: c.instruction,
      });
    }
    return { source: charges.length, presents: existing.length, ajoutes, enrichis, mode: reset ? "reset complet" : "ajout" };
  },
});

// ---------------------------------------------------------------------------
// Reprise des armes importées : le motif concaténait « LSPD · Origine : X · … ».
// On isole l'origine dans son propre champ et on alimente le référentiel.
// Une fois exécutée, cette mutation est idempotente (les motifs déjà propres
// ne contiennent plus « Origine : »).
// ---------------------------------------------------------------------------
export const splitWeaponOrigins = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const weapons = await ctx.db.query("weapons").collect();
    const origins = new Set<string>();
    let touched = 0;

    for (const w of weapons) {
      if (!w.motif || !w.motif.includes("Origine :")) continue;
      // Le séparateur d'import est « · » ; on tolère aussi « - » par sécurité.
      const parts = w.motif.split(/\s*[·-]\s*/).map((p) => p.trim()).filter(Boolean);
      const originPart = parts.find((p) => p.startsWith("Origine :"));
      const origine = originPart?.slice("Origine :".length).trim() || undefined;
      const motif = parts.filter((p) => !p.startsWith("Origine :")).join(" · ") || undefined;
      if (origine) origins.add(origine);
      touched++;
      if (!dryRun) await ctx.db.patch(w._id, { motif, origine });
    }

    // Alimente le référentiel avec les origines rencontrées.
    const existing = await ctx.db.query("weaponOrigins").collect();
    const known = new Set(existing.map((o) => o.name.toLowerCase()));
    let created = 0;
    let position = existing.length;
    for (const name of [...origins].sort()) {
      if (known.has(name.toLowerCase())) continue;
      created++;
      if (!dryRun) await ctx.db.insert("weaponOrigins", { name, position: position++, active: true });
    }

    return `${touched} arme(s) corrigée(s), ${created} origine(s) ajoutée(s) au référentiel${dryRun ? " (simulation)" : ""}.`;
  },
});
