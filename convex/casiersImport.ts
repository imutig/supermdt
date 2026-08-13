import { internalAction, internalMutation, action, query } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { can } from "./rbac";

// ============================================================================
// Import des CASIERS (dossiers d'arrestation) depuis le MDT Nexus (vizu).
//
// Robustesse voulue (le format Nexus peut bouger) :
//  - accès défensif aux champs via pick() (plusieurs noms possibles),
//  - on stocke le JSON brut du dossier (importRaw) sur chaque casier importé,
//    donc un changement de format futur se corrige avec `remapCasiers` SANS
//    re-fetch (le Nexus peut être down),
//  - import idempotent par `importRef` (nexus:<numero>).
//
//   1) Token (voir migration.ts) :  npx convex env set VIZU_TOKEN "eyJ..."
//   2) Aperçu :   npx convex run casiersImport:casiersSync '{"dryRun":true}'
//      Import :    npx convex run casiersImport:casiersSync
//      Re-mapper l'existant (après amélioration du mapping / format changé) :
//                  npx convex run casiersImport:remapCasiers
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
const BASE = "https://mdt.vizu-world.com";

// ------------------------------ helpers -----------------------------------
function norm(s: string) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
function fmtMoney(n: number) {
  return "$" + Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
// Premier champ défini parmi plusieurs noms possibles (supporte "a.b").
function pick(o: any, ...keys: string[]): any {
  for (const k of keys) {
    const val = k.split(".").reduce((a: any, c: string) => (a == null ? undefined : a[c]), o);
    if (val !== undefined && val !== null && val !== "") return val;
  }
  return undefined;
}
function num(x: any): number | undefined {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}
// "HH:MM:SS" (ou "MM:SS") -> secondes ; "PERPÉTUITÉ" toléré (renvoie 0 + perp).
function parseJail(t: string): number {
  const s = (t || "").trim().toUpperCase();
  if (!s || s.includes("PERP")) return 0;
  const m = s.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return 0;
  return m[3] ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
}
function stripHtml(s: string): string {
  return (s || "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
function tzOffsetMs(tz: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour === 24 ? 0 : +p.hour, +p.minute, +p.second) - utcMs;
}
function parisWallToEpoch(y: number, mo: number, d: number, h: number, mi: number): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let e = guess - tzOffsetMs("Europe/Paris", guess);
  const o2 = tzOffsetMs("Europe/Paris", e);
  if (guess - o2 !== e) e = guess - o2;
  return e;
}
// "12/08/2026 A 04H18" -> epoch (Paris). Fallbacks : ISO createdAt, puis now.
function parseArrestDate(dateArr: string, createdAt: string): number {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2})\s*[hH:]\s*(\d{2})/.exec(dateArr || "");
  if (m) return parisWallToEpoch(+m[3], +m[2], +m[1], +m[4], +m[5]);
  const m2 = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(dateArr || "");
  if (m2) return parisWallToEpoch(+m2[3], +m2[2], +m2[1], 12, 0);
  const iso = Date.parse(createdAt || "");
  return Number.isNaN(iso) ? Date.now() : iso;
}

// ---------------------- mapping défensif du dossier ------------------------
function mapCharge(c: any) {
  const aggr = !!pick(c, "aggravationActive", "aggravation_active");
  const qty = Math.max(1, num(pick(c, "quantite", "quantity", "qty")) ?? 1);
  const amende = (num(aggr ? pick(c, "amendeAggravation", "amende") : pick(c, "amende", "fine", "montant")) ?? 0) * qty;
  const jail = parseJail(aggr ? pick(c, "tempsPrisonAggravation", "tempsPrison") : pick(c, "tempsPrison", "prison", "jail")) * qty;
  return {
    name: String(pick(c, "charge", "nom", "name", "charge.nom") ?? "").trim(),
    fineAmount: amende,
    jailSeconds: jail,
    quantite: qty,
    aggravation: aggr,
  };
}
export function mapDossier(d: any) {
  const chargesRaw = pick(d, "charges", "infractions") ?? [];
  const charges = (Array.isArray(chargesRaw) ? chargesRaw : []).map(mapCharge).filter((c: any) => c.name);
  const numero = pick(d, "numero", "number", "num");
  const agents = pick(d, "agents", "officiers") ?? [];
  const photos = pick(d, "photos", "images") ?? [];
  const avocats = pick(d, "avocats", "lawyers") ?? [];
  const rapport = String(pick(d, "rapport", "report", "compteRendu") ?? "");
  // Jugement (verdict/peine) : présent sur ~la moitié des dossiers Nexus.
  const jg = pick(d, "jugement", "judgment");
  const jugement = jg && typeof jg === "object" && (jg.statut || jg.statutFinal || jg.peine || jg.motivation || jg.juge)
    ? {
        statut: (String(pick(jg, "statut", "status") ?? "").trim()) || undefined,
        statutFinal: (String(pick(jg, "statutFinal", "final") ?? "").trim()) || undefined,
        peine: (String(pick(jg, "peine", "sentence") ?? "").trim()) || undefined,
        motivation: (stripHtml(String(pick(jg, "motivation", "motif") ?? ""))) || undefined,
        jugeNom: (String(pick(jg, "juge.nom", "judge.nom", "juge.name") ?? "").trim()) || undefined,
        avocat: (String(pick(jg, "avocat.nom", "avocat", "lawyer") ?? "").trim()) || undefined,
      }
    : undefined;
  return {
    importRef: `nexus:${numero ?? pick(d, "_id", "id")}`,
    nexusId: (String(pick(d, "_id", "id") ?? "")) || undefined,
    numero,
    arrestType: "DOSSIER" as const,
    peine: undefined as string | undefined,
    prenom: String(pick(d, "citoyen.prenom", "citizen.prenom", "prenom") ?? "").trim(),
    nom: String(pick(d, "citoyen.nom", "citizen.nom", "nom") ?? "").trim(),
    at: parseArrestDate(String(pick(d, "dateArrestation", "date_arrestation", "arrestDate") ?? ""), String(pick(d, "createdAt", "created_at") ?? "")),
    createdByMatricule: num(pick(d, "createdBy.matricule", "createdBy.badge")),
    createdByNom: String(pick(d, "createdBy.nom", "createdBy.name") ?? "").trim(),
    officers: (Array.isArray(agents) ? agents : []).map((a: any) => ({ matricule: num(pick(a, "matricule", "badge")), nom: String(pick(a, "nom", "name") ?? "").trim() })).filter((o: any) => o.matricule != null || o.nom),
    statut: (String(pick(d, "statut", "status") ?? "").trim()) || undefined,
    lieu: (String(pick(d, "postePolice", "lieu", "poste") ?? "").trim()) || undefined,
    forceUsed: !!pick(d, "forceUtilisee", "force"),
    mirandaAt: (String(pick(d, "dateLectureDroits", "miranda") ?? "").trim()) || undefined,
    cuffedAt: (String(pick(d, "dateArrestation") ?? "").trim()) || undefined,
    avocat: ((Array.isArray(avocats) ? avocats : []).map((a: any) => pick(a, "nom", "name") || a).filter(Boolean).join(", ")) || undefined,
    // Le Nexus n'a qu'un seul champ « rapport » : on le place dans le rapport
    // d'arrestation (reportBody) et on NE duplique PAS en « déroulé des faits ».
    reportBody: rapport.trim() || undefined,
    derouleFaits: undefined,
    jugement,
    baremeAmende: (String(pick(d, "baremeAmende", "bareme") ?? "").trim()) || undefined,
    imageUrls: (Array.isArray(photos) ? photos : []).filter((u: any) => typeof u === "string"),
    charges,
    totalFine: charges.reduce((s: number, c: any) => s + c.fineAmount, 0),
    totalJail: charges.reduce((s: number, c: any) => s + c.jailSeconds, 0),
  };
}

// "12/08/2026" + "01:46" -> epoch (Paris). Fallbacks : ISO createdAt, puis now.
function parseAmendeDate(dateStr: string, heureStr: string, createdAt: string): number {
  const md = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(dateStr || "");
  const mh = /(\d{1,2})\s*[hH:]\s*(\d{2})/.exec(heureStr || "");
  if (md) return parisWallToEpoch(+md[3], +md[2], +md[1], mh ? +mh[1] : 12, mh ? +mh[2] : 0);
  const iso = Date.parse(createdAt || "");
  return Number.isNaN(iso) ? Date.now() : iso;
}
// ---------------- mapping défensif d'une amende (contravention) -------------
export function mapAmende(a: any) {
  const numero = pick(a, "numero", "number", "_id");
  const statut = String(pick(a, "statut", "status") ?? "").trim();
  const montant = num(pick(a, "montant", "amount", "montantAmende", "fine")) ?? 0;
  const objet = String(pick(a, "objet", "motif", "libelle") ?? "").trim();
  return {
    importRef: `nexus-amende:${numero ?? pick(a, "_id", "id")}`,
    nexusId: (String(pick(a, "_id", "id") ?? "")) || undefined,
    numero: String(numero ?? ""),
    prenom: String(pick(a, "citoyen.prenom", "citizen.prenom", "prenom") ?? "").trim(),
    nom: String(pick(a, "citoyen.nom", "citizen.nom", "nom") ?? "").trim(),
    at: parseAmendeDate(String(pick(a, "dateInfraction", "date") ?? ""), String(pick(a, "heureInfraction", "heure") ?? ""), String(pick(a, "createdAt", "created_at") ?? "")),
    createdByMatricule: num(pick(a, "createdBy.matricule", "matriculeAgent", "createdBy.badge")),
    createdByNom: String(pick(a, "createdBy.nom", "verbalisateurNom", "createdBy.name") ?? "").trim(),
    montant,
    montantMajore: num(pick(a, "montantMajore", "montant_majore")),
    articleLoi: (String(pick(a, "articleLoi", "article") ?? "").trim()) || undefined,
    referenceJuridique: (String(pick(a, "referenceJuridique", "reference") ?? "").trim()) || undefined,
    statut: statut || undefined,
    finePaid: /pay/i.test(statut),
    annulee: /annul/i.test(statut),
    lieu: (String(pick(a, "lieuInfraction", "lieu", "adressePrecise") ?? "").trim()) || undefined,
    objet,
    typeAmende: String(pick(a, "typeAmende") ?? "").trim(),
    categorieAmende: String(pick(a, "categorieAmende") ?? "").trim(),
    description: stripHtml(String(pick(a, "description") ?? "")) || undefined,
    recidive: !!pick(a, "recidive"),
  };
}

// Rapport d'arrestation Nexus (/api/rapports) : plus léger qu'un dossier
// (pas de statut/jugement). Même forme de sortie que mapDossier + arrestType.
export function mapRapport(r: any) {
  // Les charges d'un rapport sont de simples chaînes (noms d'infraction), et le
  // rapport porte un montant/peine GLOBAUX (pas par charge).
  const chargesRaw = pick(r, "charges", "infractions") ?? [];
  const charges = (Array.isArray(chargesRaw) ? chargesRaw : [])
    .map((c: any) => (typeof c === "string" ? { name: c.trim(), fineAmount: 0, jailSeconds: 0, quantite: 1, aggravation: false } : mapCharge(c)))
    .filter((c: any) => c.name);
  const numero = pick(r, "numero", "number", "num");
  const agents = pick(r, "agentsImpliques", "agents", "officiers") ?? [];
  const photos = pick(r, "photos", "images") ?? [];
  const rapport = String(pick(r, "rapport", "report") ?? "");
  const avocats = pick(r, "avocat", "avocats", "partagesAvocat") ?? [];
  const chargeFine = charges.reduce((s: number, c: any) => s + c.fineAmount, 0);
  const amende = num(pick(r, "amende", "montant")) ?? 0;
  const jailFromPeine = parseJail(String(pick(r, "peine", "sentence") ?? ""));
  return {
    importRef: `nexus-rapport:${numero ?? pick(r, "_id", "id")}`,
    nexusId: (String(pick(r, "_id", "id") ?? "")) || undefined,
    numero,
    arrestType: "RAPPORT" as const,
    peine: undefined as string | undefined,
    prenom: String(pick(r, "citoyen.prenom", "citizen.prenom", "prenom") ?? "").trim(),
    nom: String(pick(r, "citoyen.nom", "citizen.nom", "nom") ?? "").trim(),
    at: parseArrestDate(String(pick(r, "date", "dateArrestation") ?? ""), String(pick(r, "createdAt", "created_at") ?? "")),
    createdByMatricule: num(pick(r, "createdBy.matricule", "createdBy.badge")),
    createdByNom: String(pick(r, "createdBy.nom", "createdBy.name") ?? "").trim(),
    officers: (Array.isArray(agents) ? agents : []).map((a: any) => ({ matricule: num(pick(a, "matricule", "badge")), nom: String(pick(a, "nom", "name") ?? "").trim() })).filter((o: any) => o.matricule != null || o.nom),
    statut: undefined as string | undefined,
    lieu: (String(pick(r, "postePolice", "lieu", "poste") ?? "").trim()) || undefined,
    forceUsed: false,
    mirandaAt: undefined as string | undefined,
    cuffedAt: (String(pick(r, "date") ?? "").trim()) || undefined,
    avocat: (typeof avocats === "string" ? avocats : (Array.isArray(avocats) ? avocats.map((a: any) => pick(a, "nom", "name") || a).filter(Boolean).join(", ") : "")) || undefined,
    reportBody: rapport.trim() || undefined,
    derouleFaits: undefined as string | undefined,
    jugement: undefined,
    baremeAmende: (String(pick(r, "baremeAmende", "bareme") ?? "").trim()) || undefined,
    imageUrls: (Array.isArray(photos) ? photos : []).filter((u: any) => typeof u === "string"),
    charges,
    totalFine: chargeFine || amende,
    totalJail: charges.reduce((s: number, c: any) => s + c.jailSeconds, 0) || jailFromPeine,
  };
}

// Mappe un raw importé selon son type (dossier ou rapport). Tolère l'ancien
// format (raw dossier brut, sans enveloppe) pour remapCasiers.
function mapCasierRaw(rawStr: string): any {
  const parsed = JSON.parse(rawStr);
  if (parsed && parsed._kind === "RAPPORT") return mapRapport(parsed.data);
  if (parsed && parsed._kind === "DOSSIER") return mapDossier(parsed.data);
  return mapDossier(parsed); // legacy : ancien importRaw = dossier brut
}

// ------------------------------- fetch ------------------------------------
async function apiGet(path: string, token: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new Error("Token invalide/expiré. npx convex env set VIZU_TOKEN \"...\"");
  if (!res.ok) throw new Error(`Erreur API ${res.status} sur ${path}`);
  return res.json();
}
async function fetchAllDossiers(token: string): Promise<any[]> {
  const first = await apiGet("/api/dossiers?entity=lspd&page=1&limit=100", token);
  let all = (first.dossiers || []).slice();
  const pages = first.pages || 1;
  for (let p = 2; p <= pages; p++) all = all.concat((await apiGet(`/api/dossiers?entity=lspd&page=${p}&limit=100`, token)).dossiers || []);
  return all;
}
async function fetchAllRapports(token: string): Promise<any[]> {
  const first = await apiGet("/api/rapports?entity=lspd&page=1&limit=100", token);
  let all = (first.rapports || []).slice();
  const pages = first.pages || 1;
  for (let p = 2; p <= pages; p++) all = all.concat((await apiGet(`/api/rapports?entity=lspd&page=${p}&limit=100`, token)).rapports || []);
  return all;
}
async function fetchAllAmendes(token: string): Promise<any[]> {
  const first = await apiGet("/api/amendes?entity=lspd&page=1&limit=100", token);
  let all = (first.amendes || []).slice();
  const pages = first.pages || 1;
  for (let p = 2; p <= pages; p++) all = all.concat((await apiGet(`/api/amendes?entity=lspd&page=${p}&limit=100`, token)).amendes || []);
  return all;
}

// =============================== ACTIONS ===================================
export const casiersSync = internalAction({
  args: { token: v.optional(v.string()), dryRun: v.optional(v.boolean()), limit: v.optional(v.number()), createMissing: v.optional(v.boolean()) },
  handler: async (ctx, { token, dryRun, limit, createMissing }): Promise<unknown> => {
    const tk = token || process.env.VIZU_TOKEN;
    if (!tk) throw new Error("Aucun token. npx convex env set VIZU_TOKEN \"...\" (ou {\"token\":\"...\"}).");
    // Dossiers ET rapports d'arrestation, dans un flux unique (chacun taggé) :
    // la réconciliation opère alors sur l'ensemble et ne supprime pas l'autre type.
    const dossiers = await fetchAllDossiers(tk);
    const rapports = await fetchAllRapports(tk);
    let wrapped = [
      ...dossiers.map((d) => JSON.stringify({ _kind: "DOSSIER", data: d })),
      ...rapports.map((r) => JSON.stringify({ _kind: "RAPPORT", data: r })),
    ];
    if (limit) wrapped = wrapped.slice(0, limit);
    return await ctx.runMutation(internal.casiersImport._upsertCasiers, { raws: wrapped, dryRun, createMissing });
  },
});

// Déclenchement manuel autorisé (owner / rbac.manage), pour l'UI Administration.
export const runCasiersSync = action({
  args: { dryRun: v.optional(v.boolean()), createMissing: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun, createMissing }): Promise<unknown> => {
    const ok = await ctx.runQuery(api.migration.canSync, {});
    if (!ok) throw new Error("Non autorisé.");
    if (!process.env.VIZU_TOKEN) throw new Error("VIZU_TOKEN non configuré côté Convex.");
    return await ctx.runAction(internal.casiersImport.casiersSync, { dryRun, createMissing });
  },
});

// Import des contraventions (amendes Nexus) — même modèle que les casiers.
export const contraventionsSync = internalAction({
  args: { token: v.optional(v.string()), dryRun: v.optional(v.boolean()), limit: v.optional(v.number()), createMissing: v.optional(v.boolean()) },
  handler: async (ctx, { token, dryRun, limit, createMissing }): Promise<unknown> => {
    const tk = token || process.env.VIZU_TOKEN;
    if (!tk) throw new Error("Aucun token. npx convex env set VIZU_TOKEN \"...\" (ou {\"token\":\"...\"}).");
    const raw = await fetchAllAmendes(tk);
    const sliced = limit ? raw.slice(0, limit) : raw;
    return await ctx.runMutation(internal.casiersImport._upsertContraventions, { raws: sliced.map((a) => JSON.stringify(a)), dryRun, createMissing });
  },
});

// =============================== UPSERT =====================================
async function resolveRefs(ctx: any) {
  const citizens = await ctx.db.query("citizens").collect();
  const byName = new Map<string, Id<"citizens">>();
  for (const c of citizens) { byName.set(norm(`${c.prenom} ${c.nom}`), c._id); byName.set(norm(`${c.nom} ${c.prenom}`), c._id); }
  const agents = await ctx.db.query("agents").collect();
  const byMat = new Map<number, Id<"agents">>();
  for (const a of agents) if (a.matricule != null) byMat.set(a.matricule, a._id);
  // Rattachement des officiers par nom de famille (le Nexus ne donne que le nom),
  // seulement si ce nom est unique dans l'effectif (sinon ambigu -> non rattaché).
  const lastCount = new Map<string, number>();
  for (const a of agents) lastCount.set(norm(a.nomRP), (lastCount.get(norm(a.nomRP)) ?? 0) + 1);
  const byLastName = new Map<string, Id<"agents">>();
  for (const a of agents) if (lastCount.get(norm(a.nomRP)) === 1) byLastName.set(norm(a.nomRP), a._id);
  const owner = agents.find((a: any) => a.isOwner);
  const cats = new Map((await ctx.db.query("penalCategories").collect()).map((c: any) => [c._id as string, c]));
  const sevs = new Map((await ctx.db.query("severityLevels").collect()).map((s: any) => [s._id as string, s]));
  const penalByName = new Map<string, any>();
  for (const p of await ctx.db.query("penalCharges").collect()) penalByName.set(norm(p.name), p);
  return { byName, byMat, byLastName, owner, cats, sevs, penalByName };
}

// Rattache un officier Nexus (matricule + nom) à un compte : matricule d'abord,
// sinon nom de famille unique. undefined si aucun.
function resolveOfficer(refs: any, mat?: number, nom?: string): Id<"agents"> | undefined {
  return (mat != null && refs.byMat.get(mat)) || (nom ? refs.byLastName.get(norm(nom)) : undefined) || undefined;
}

type OfficerLink = { name: string; matricule?: string; agentId?: Id<"agents"> };
// Liste ordonnée des officiers du dossier (créateur en 1er), chacun rattaché à un
// compte existant si possible (agentId). Recalculée à CHAQUE sync : un officier
// sans compte au 1er import se relie tout seul dès que son compte existe.
function buildOfficers(d: any, refs: any): OfficerLink[] {
  const seen = new Set<string>();
  const list: OfficerLink[] = [];
  const push = (mat?: number, nom?: string) => {
    const name = (nom || "").trim();
    if (!name && mat == null) return;
    const key = mat != null ? `m:${mat}` : `n:${norm(name)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const agentId = resolveOfficer(refs, mat, name);
    list.push({ name: name || `#${mat}`, matricule: mat != null ? String(mat) : undefined, agentId });
  };
  push(d.createdByMatricule, d.createdByNom); // le créateur du dossier d'abord
  for (const o of d.officers || []) push(o.matricule, o.nom);
  return list;
}
function linkedIds(officers: OfficerLink[]): Id<"agents">[] {
  return [...new Set(officers.filter((o) => o.agentId).map((o) => o.agentId as Id<"agents">))];
}

function buildCharges(d: any, refs: any) {
  return d.charges.map((c: any) => {
    const pc = refs.penalByName.get(norm(c.name));
    const cat = pc ? refs.cats.get(pc.categoryId as string) : undefined;
    const sev = pc?.severityId ? refs.sevs.get(pc.severityId as string) : undefined;
    return {
      penalChargeId: pc?._id as Id<"penalCharges"> | undefined,
      snapshot: { name: c.name, category: cat?.name ?? "Importé", severity: sev?.name ?? "", sensitive: cat?.sensitive ?? false, fineRaw: fmtMoney(c.fineAmount), jailSeconds: c.jailSeconds || undefined, dojRequest: false, sanctions: [] as string[] },
      formulaParam: c.quantite > 1 ? { quantite: c.quantite } : undefined,
      computedFine: c.fineAmount, computedJailSeconds: c.jailSeconds, linked: !!pc,
    };
  });
}

export const _upsertCasiers = internalMutation({
  args: { raws: v.array(v.string()), dryRun: v.optional(v.boolean()), createMissing: v.optional(v.boolean()) },
  handler: async (ctx, { raws, dryRun, createMissing }) => {
    const refs = await resolveRefs(ctx);
    if (!refs.owner) throw new Error("Aucun compte owner pour rattacher les casiers importés.");
    const allEntries = await ctx.db.query("casierEntries").collect();
    const existingByRef = new Map<string, (typeof allEntries)[number]>();
    // Orphelins write-through : casiers locaux sans importRef (POST Nexus réussi
    // mais tamponnage échoué) -> on les ADOPTE au lieu d'importer un doublon.
    const orphansByCitizen = new Map<string, (typeof allEntries)[number][]>();
    for (const e of allEntries) {
      if (e.importRef) existingByRef.set(e.importRef, e);
      else if (!e.deletedAt) {
        const k = e.citizenId as string;
        if (!orphansByCitizen.has(k)) orphansByCitizen.set(k, []);
        orphansByCitizen.get(k)!.push(e);
      }
    }
    // Références présentes dans le flux Nexus actuel (matchées ou non) : sert à
    // supprimer les casiers importés qui ont disparu du Nexus.
    const incomingRefs = new Set<string>();
    for (const rawStr of raws) { try { incomingRefs.add(mapCasierRaw(rawStr).importRef); } catch { /* compté plus bas */ } }

    let ajoutes = 0, dejaImporte = 0, sansCitoyen = 0, citoyensCrees = 0, chargesLiees = 0, chargesLibres = 0, officiersLies = 0, parseErr = 0;
    // Re-rattachement des casiers déjà importés (à chaque sync) :
    let casiersRelies = 0, officiersRelies = 0;
    const exemplesSansCitoyen: string[] = [];
    for (const rawStr of raws) {
      let d: any;
      try { d = mapCasierRaw(rawStr); } catch { parseErr++; continue; }
      const prev = existingByRef.get(d.importRef);
      if (prev) {
        // Casier déjà importé : on ne le recrée pas, mais on RE-RATTACHE ses
        // officiers si des comptes correspondants existent désormais (relink auto).
        dejaImporte++;
        if (!dryRun) {
          const officers = buildOfficers(d, refs);
          const prevLinked = new Set((prev.officers ?? []).filter((o) => o.agentId).map((o) => o.agentId as string));
          const nowLinked = officers.filter((o) => o.agentId && !prevLinked.has(o.agentId as string)).length;
          const patch: Record<string, unknown> = {};
          if (JSON.stringify(officers) !== JSON.stringify(prev.officers ?? null)) {
            patch.officers = officers;
            patch.officerIds = linkedIds(officers);
          }
          // createdBy : on remonte owner -> vrai agent dès qu'il est identifiable
          // (jamais l'inverse : un createdBy déjà relié n'est pas rétrogradé).
          const creator = officers[0]?.agentId;
          if (creator && prev.createdBy === refs.owner._id) patch.createdBy = creator;
          // Parité : rétro-remplit jugement / barème d'amende / id Nexus.
          if ((prev.nexusId ?? undefined) !== (d.nexusId ?? undefined)) patch.nexusId = d.nexusId;
          if (JSON.stringify(prev.jugement ?? null) !== JSON.stringify(d.jugement ?? null)) patch.jugement = d.jugement;
          if ((prev.baremeAmende ?? undefined) !== (d.baremeAmende ?? undefined)) patch.baremeAmende = d.baremeAmende;
          if (prev.importRaw !== rawStr) patch.importRaw = rawStr;
          if (Object.keys(patch).length) {
            await ctx.db.patch(prev._id, patch);
            casiersRelies++;
            officiersRelies += nowLinked;
          }
        }
        continue;
      }
      let citizenId = refs.byName.get(norm(`${d.prenom} ${d.nom}`));
      if (!citizenId) {
        // Citoyen absent (souvent supprimé du Nexus). On l'ignore, ou on crée une
        // fiche minimale (prénom+nom) pour ne perdre aucun casier.
        if (!createMissing || !d.prenom || !d.nom) {
          sansCitoyen++;
          if (exemplesSansCitoyen.length < 10) exemplesSansCitoyen.push(`${d.prenom} ${d.nom} (n°${d.numero})`);
          continue;
        }
        citoyensCrees++;
        if (!dryRun) {
          citizenId = await ctx.db.insert("citizens", { prenom: d.prenom, nom: d.nom, photoStorageIds: [], status: "ACTIVE" as const, searchText: norm(`${d.prenom} ${d.nom}`) });
          refs.byName.set(norm(`${d.prenom} ${d.nom}`), citizenId);
          refs.byName.set(norm(`${d.nom} ${d.prenom}`), citizenId);
        }
      }
      // Adoption d'un orphelin write-through du même citoyen (anti-doublon).
      const orphans = citizenId ? orphansByCitizen.get(citizenId as string) : undefined;
      if (orphans && orphans.length) {
        const orphan = orphans.shift()!;
        if (!dryRun) await ctx.db.patch(orphan._id, { importRef: d.importRef, nexusId: d.nexusId, importRaw: rawStr, arrestType: d.arrestType });
        dejaImporte++;
        continue;
      }
      ajoutes++;
      const charges = buildCharges(d, refs);
      for (const c of charges) (c.linked ? chargesLiees++ : chargesLibres++);
      const officers = buildOfficers(d, refs);
      const officerIds = linkedIds(officers);
      officiersLies += officerIds.length;
      if (dryRun) continue;
      const createdBy = officers[0]?.agentId || refs.owner._id;
      const entryId = await ctx.db.insert("casierEntries", {
        citizenId: citizenId as Id<"citizens">, at: d.at, officerIds, officers,
        defconSnapshot: { name: "Import", fineMultiplier: 1, sensitiveFineMultiplier: 1 },
        totalFine: d.totalFine, totalJailSeconds: d.totalJail, dojRequired: false, sanctions: [],
        derouleFaits: d.derouleFaits, lieu: d.lieu,
        notes: `Importé du MDT Nexus · ${d.arrestType === "RAPPORT" ? "rapport" : "dossier"} n°${d.numero}${d.peine ? ` · Peine : ${d.peine}` : ""}`,
        status: "EMISE" as const, arrestType: d.arrestType,
        reportBody: d.reportBody, imageUrls: d.imageUrls.length ? d.imageUrls : undefined,
        avocat: d.avocat, dossierStatus: d.statut, forceUsed: d.forceUsed,
        cuffedAt: d.cuffedAt, mirandaAt: d.mirandaAt,
        jugement: d.jugement, baremeAmende: d.baremeAmende,
        createdBy, importRef: d.importRef, nexusId: d.nexusId, importRaw: rawStr,
      });
      for (const c of charges) {
        await ctx.db.insert("casierCharges", { entryId, penalChargeId: c.penalChargeId, snapshot: c.snapshot, formulaParam: c.formulaParam, isRecidive: false, computedFine: c.computedFine, computedJailSeconds: c.computedJailSeconds, onDecision: false });
      }
    }

    // Réconciliation : les casiers IMPORTÉS (importRef) absents du flux Nexus
    // actuel = supprimés côté Nexus -> on les supprime aussi. Jamais les casiers
    // natifs du MDT. Sécurité : rien si le flux est vide (ex. erreur API).
    let supprimes = 0, chargesSupprimees = 0;
    const orphelins = raws.length > 0 ? allEntries.filter((e) => e.importRef && !e.deletedAt && !incomingRefs.has(e.importRef)) : [];
    for (const e of orphelins) {
      supprimes++;
      if (dryRun) continue;
      for (const c of await ctx.db.query("casierCharges").withIndex("by_entry", (q) => q.eq("entryId", e._id)).collect()) { await ctx.db.delete(c._id); chargesSupprimees++; }
      await ctx.db.delete(e._id);
    }

    return { source: raws.length, ajoutes, dejaImporte, casiersRelies, officiersRelies, sansCitoyen, citoyensCrees, exemplesSansCitoyen, chargesLiees, chargesLibres, officiersLies, parseErr, supprimes, chargesSupprimees };
  },
});

export const _upsertContraventions = internalMutation({
  args: { raws: v.array(v.string()), dryRun: v.optional(v.boolean()), createMissing: v.optional(v.boolean()) },
  handler: async (ctx, { raws, dryRun, createMissing }) => {
    const refs = await resolveRefs(ctx);
    if (!refs.owner) throw new Error("Aucun compte owner pour rattacher les contraventions importées.");
    const all = await ctx.db.query("citations").collect();
    const existingByRef = new Map<string, (typeof all)[number]>();
    const orphansByCitizen = new Map<string, (typeof all)[number][]>();
    for (const c of all) {
      if (c.importRef) existingByRef.set(c.importRef, c);
      else if (!c.deletedAt) {
        const k = c.citizenId as string;
        if (!orphansByCitizen.has(k)) orphansByCitizen.set(k, []);
        orphansByCitizen.get(k)!.push(c);
      }
    }
    const incomingRefs = new Set<string>();
    for (const rawStr of raws) { try { incomingRefs.add(mapAmende(JSON.parse(rawStr)).importRef); } catch { /* compté plus bas */ } }

    let ajoutes = 0, dejaImporte = 0, sansCitoyen = 0, citoyensCrees = 0, chargesLiees = 0, chargesLibres = 0, officiersLies = 0, parseErr = 0;
    let contravRelies = 0;
    const exemplesSansCitoyen: string[] = [];
    for (const rawStr of raws) {
      let a: any;
      try { a = mapAmende(JSON.parse(rawStr)); } catch { parseErr++; continue; }
      const status = a.annulee ? ("ANNULEE" as const) : ("EMISE" as const);
      const prev = existingByRef.get(a.importRef);
      if (prev) {
        dejaImporte++;
        if (!dryRun) {
          const officerId = resolveOfficer(refs, a.createdByMatricule, a.createdByNom);
          const patch: Record<string, unknown> = {};
          if (officerId && prev.officerId === refs.owner._id) { patch.officerId = officerId; contravRelies++; officiersLies++; }
          if ((prev.officerName ?? undefined) !== (a.createdByNom || undefined)) patch.officerName = a.createdByNom || undefined;
          if (prev.finePaid !== a.finePaid) patch.finePaid = a.finePaid;
          if (prev.status !== status) patch.status = status;
          // Parité : montant majoré + références juridiques + id Nexus.
          if ((prev.nexusId ?? undefined) !== (a.nexusId ?? undefined)) patch.nexusId = a.nexusId;
          if ((prev.montantMajore ?? undefined) !== (a.montantMajore ?? undefined)) patch.montantMajore = a.montantMajore;
          if ((prev.articleLoi ?? undefined) !== (a.articleLoi ?? undefined)) patch.articleLoi = a.articleLoi;
          if ((prev.referenceJuridique ?? undefined) !== (a.referenceJuridique ?? undefined)) patch.referenceJuridique = a.referenceJuridique;
          if (prev.importRaw !== rawStr) patch.importRaw = rawStr;
          if (Object.keys(patch).length) await ctx.db.patch(prev._id, patch);
        }
        continue;
      }
      let citizenId = refs.byName.get(norm(`${a.prenom} ${a.nom}`));
      if (!citizenId) {
        if (!createMissing || !a.prenom || !a.nom) {
          sansCitoyen++;
          if (exemplesSansCitoyen.length < 10) exemplesSansCitoyen.push(`${a.prenom} ${a.nom} (${a.numero})`);
          continue;
        }
        citoyensCrees++;
        if (!dryRun) {
          citizenId = await ctx.db.insert("citizens", { prenom: a.prenom, nom: a.nom, photoStorageIds: [], status: "ACTIVE" as const, searchText: norm(`${a.prenom} ${a.nom}`) });
          refs.byName.set(norm(`${a.prenom} ${a.nom}`), citizenId);
          refs.byName.set(norm(`${a.nom} ${a.prenom}`), citizenId);
        }
      }
      // Adoption d'un orphelin write-through du même citoyen (anti-doublon).
      const orphans = citizenId ? orphansByCitizen.get(citizenId as string) : undefined;
      if (orphans && orphans.length) {
        const orphan = orphans.shift()!;
        if (!dryRun) await ctx.db.patch(orphan._id, { importRef: a.importRef, nexusId: a.nexusId, importRaw: rawStr, montantMajore: a.montantMajore });
        dejaImporte++;
        continue;
      }
      ajoutes++;
      const officerId = resolveOfficer(refs, a.createdByMatricule, a.createdByNom);
      if (officerId) officiersLies++;
      const pc = refs.penalByName.get(norm(a.objet));
      const cat: any = pc ? refs.cats.get(pc.categoryId as string) : undefined;
      const sev: any = pc?.severityId ? refs.sevs.get(pc.severityId as string) : undefined;
      if (pc) chargesLiees++; else chargesLibres++;
      if (dryRun) continue;
      const notesParts = [a.typeAmende, a.categorieAmende].filter(Boolean).join(" · ");
      const citationId = await ctx.db.insert("citations", {
        citizenId: citizenId as Id<"citizens">, at: a.at,
        officerId: officerId || refs.owner._id,
        officerName: a.createdByNom || undefined,
        defconSnapshot: { name: "Import", fineMultiplier: 1, sensitiveFineMultiplier: 1 },
        totalFine: a.montant, status,
        finePaid: a.finePaid,
        montantMajore: a.montantMajore, articleLoi: a.articleLoi, referenceJuridique: a.referenceJuridique,
        notes: [notesParts, a.description].filter(Boolean).join("\n") || `Importé du MDT Nexus · ${a.numero}`,
        createdBy: officerId || refs.owner._id,
        importRef: a.importRef, nexusId: a.nexusId, importRaw: rawStr,
      });
      await ctx.db.insert("citationCharges", {
        citationId, penalChargeId: pc?._id as Id<"penalCharges"> | undefined,
        snapshot: { name: a.objet || "Contravention", category: cat?.name ?? "Importé", severity: sev?.name ?? "", sensitive: cat?.sensitive ?? false, fineRaw: fmtMoney(a.montant), dojRequest: false, sanctions: [] },
        isRecidive: a.recidive, computedFine: a.montant, onDecision: false,
      });
    }

    // Réconciliation : contraventions IMPORTÉES absentes du flux Nexus -> supprimées.
    let supprimes = 0, chargesSupprimees = 0;
    const orphelins = raws.length > 0 ? all.filter((c) => c.importRef && !c.deletedAt && !incomingRefs.has(c.importRef)) : [];
    for (const c of orphelins) {
      supprimes++;
      if (dryRun) continue;
      for (const ch of await ctx.db.query("citationCharges").withIndex("by_citation", (q) => q.eq("citationId", c._id)).collect()) { await ctx.db.delete(ch._id); chargesSupprimees++; }
      await ctx.db.delete(c._id);
    }

    return { source: raws.length, ajoutes, dejaImporte, contravRelies, sansCitoyen, citoyensCrees, exemplesSansCitoyen, chargesLiees, chargesLibres, officiersLies, parseErr, supprimes, chargesSupprimees };
  },
});

// Re-mappe les casiers déjà importés à partir de leur JSON brut (importRaw), sans
// re-fetch. À lancer après amélioration du mapping ou changement de format Nexus.
export const remapCasiers = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const refs = await resolveRefs(ctx);
    const entries = (await ctx.db.query("casierEntries").collect()).filter((e) => e.importRaw && !e.deletedAt);
    let updated = 0, skipped = 0;
    for (const e of entries) {
      let d: any;
      try { d = mapCasierRaw(e.importRaw!); } catch { skipped++; continue; }
      updated++;
      if (dryRun) continue;
      const charges = buildCharges(d, refs);
      const officers = buildOfficers(d, refs);
      const officerIds = linkedIds(officers);
      const creator = officers[0]?.agentId;
      await ctx.db.patch(e._id, {
        at: d.at, officers, officerIds, totalFine: d.totalFine, totalJailSeconds: d.totalJail,
        derouleFaits: d.derouleFaits, lieu: d.lieu, reportBody: d.reportBody,
        imageUrls: d.imageUrls.length ? d.imageUrls : undefined, avocat: d.avocat,
        dossierStatus: d.statut, forceUsed: d.forceUsed, cuffedAt: d.cuffedAt, mirandaAt: d.mirandaAt,
        jugement: d.jugement, baremeAmende: d.baremeAmende, arrestType: d.arrestType, nexusId: d.nexusId,
        ...(creator && e.createdBy === refs.owner?._id ? { createdBy: creator } : {}),
      });
      for (const old of await ctx.db.query("casierCharges").withIndex("by_entry", (q) => q.eq("entryId", e._id)).collect()) await ctx.db.delete(old._id);
      for (const c of charges) await ctx.db.insert("casierCharges", { entryId: e._id, penalChargeId: c.penalChargeId, snapshot: c.snapshot, formulaParam: c.formulaParam, isRecidive: false, computedFine: c.computedFine, computedJailSeconds: c.computedJailSeconds, onDecision: false });
    }
    return { entries: entries.length, updated, skipped };
  },
});

// Annule un import : supprime (dur) tous les casiers importés (importRef) + leurs
// charges. Pour repartir propre. `npx convex run casiersImport:clearImported`.
export const clearImported = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const imported = (await ctx.db.query("casierEntries").collect()).filter((e) => e.importRef);
    if (dryRun) return { aSupprimer: imported.length };
    let charges = 0;
    for (const e of imported) {
      for (const c of await ctx.db.query("casierCharges").withIndex("by_entry", (q) => q.eq("entryId", e._id)).collect()) { await ctx.db.delete(c._id); charges++; }
      await ctx.db.delete(e._id);
    }
    return { casiersSupprimes: imported.length, chargesSupprimees: charges };
  },
});

// Autorisation UI (réutilise la logique de migration).
export const canImport = query({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) return false;
    const agent = await ctx.db.query("agents").withIndex("by_userId", (q) => q.eq("userId", uid)).unique();
    if (!agent || agent.status !== "ACTIVE") return false;
    return agent.isOwner || (await can(ctx, agent, "rbac.manage"));
  },
});
