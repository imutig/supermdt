import { action, mutation, query, internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getCurrentAgent, requireAgent, requirePermission, agentLabel } from "./rbac";
import { nexusLogin, encryptSecret, decryptSecret } from "./lib/nexusAuth";
import { mapCitizen } from "./migration";
import { parisParts } from "./lib/paris";

const pad2 = (n: number) => String(n).padStart(2, "0");
// Date/heure Paris au format Nexus (JJ/MM/AAAA, HH:MM).
function nowParis(): { date: string; heure: string } {
  const p = parisParts(Date.now());
  return { date: `${pad2(p.d)}/${pad2(p.mo)}/${p.y}`, heure: `${pad2(p.h)}:00` };
}
function nowArrest(): string {
  const p = parisParts(Date.now());
  return `${pad2(p.d)}/${pad2(p.mo)}/${p.y} A ${pad2(p.h)}H00`;
}
function fmtHMS(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
}
// Nexus attend taille/poids en NOMBRE (une chaîne « 1m80 » provoque une 500).
// On extrait la partie numérique ; vide -> "" (accepté).
function toNexusNum(s?: string): number | "" {
  const digits = (s || "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : "";
}

// Expiration d'un JWT (claim exp, en ms) ou null si indéchiffrable.
function jwtExp(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch { return null; }
}

type Cred = { email: string; secretEnc: string; tokenCache: string | null; tokenExpiry: number | null };
// Token Nexus de l'agent : réutilise le cache tant qu'il est valide, sinon login
// (et met en cache). Évite un login à chaque écriture.
async function getToken(ctx: ActionCtx, agentId: Id<"agents">, cred: Cred, force = false): Promise<string> {
  if (!force && cred.tokenCache && cred.tokenExpiry && cred.tokenExpiry > Date.now() + 60_000) return cred.tokenCache;
  const password = await decryptSecret(cred.secretEnc);
  const token = await nexusLogin(cred.email, password);
  const exp = jwtExp(token) ?? Date.now() + 50 * 60_000;
  await ctx.runMutation(internal.nexusSync._cacheToken, { agentId, token, expiry: exp });
  return token;
}

const BASE = "https://mdt.vizu-world.com";

const NEXUS_TIMEOUT_MS = 20_000;
// Appel HTTP unique vers NexusMDT : Authorization + timeout + auto-relogin sur 401.
async function nexusFetch(
  ctx: ActionCtx, agentId: Id<"agents">, cred: Cred, path: string,
  opts: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Promise<Response> {
  const run = async (token: string): Promise<Response> => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), NEXUS_TIMEOUT_MS);
    try {
      return await fetch(`${BASE}${path}`, {
        method: opts.method ?? "GET",
        body: opts.body,
        signal: ac.signal,
        headers: { ...(opts.headers ?? {}), Authorization: `Bearer ${token}` },
      });
    } finally { clearTimeout(timer); }
  };
  let res = await run(await getToken(ctx, agentId, cred));
  if (res.status === 401) {
    // Session Nexus révoquée avant l'expiration du JWT : invalider + relogin + 1 retry.
    await ctx.runMutation(internal.nexusSync._invalidateToken, { agentId });
    res = await run(await getToken(ctx, agentId, { ...cred, tokenCache: null, tokenExpiry: null }, true));
  }
  return res;
}

function norm(s: string) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// ============================================================================
// Write-through Nexus — Phase 1 : coffre d'identifiants par agent.
// Chaque agent qui veut « utiliser SuperMDT comme MDT principal » enregistre ses
// identifiants Nexus (email + mot de passe DÉDIÉ). On teste le login, on chiffre
// le mot de passe au repos, et on s'en servira pour poster en son nom.
// ============================================================================

// Journalise une opération de synchro (imports + écritures) pour le monitoring.
export const _log = internalMutation({
  args: {
    direction: v.union(v.literal("IMPORT"), v.literal("WRITE"), v.literal("AUTH")),
    entity: v.string(), op: v.string(), ok: v.boolean(),
    httpStatus: v.optional(v.number()), durationMs: v.optional(v.number()),
    agentId: v.optional(v.id("agents")), detail: v.optional(v.string()), error: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const now = Date.now();
    await ctx.db.insert("nexusSyncLog", { at: now, ...a });
    if (a.ok) return;
    // Détection d'incident sur FENÊTRE TEMPORELLE (et non « 3 échecs consécutifs
    // dans les 6 derniers logs », qui ratait les pannes en trafic mixte et
    // n'alertait qu'une seule fois) : on alerte si ≥ 3 échecs de la même direction
    // dans les 30 dernières minutes. Anti-spam : une seule alerte non envoyée à la
    // fois, et un cooldown d'1 h entre deux alertes.
    const WINDOW = 30 * 60_000, THRESHOLD = 3, COOLDOWN = 60 * 60_000;
    const recent = await ctx.db.query("nexusSyncLog").withIndex("by_at", (q) => q.gte("at", now - WINDOW)).collect();
    const failures = recent.filter((r) => r.direction === a.direction && !r.ok).length;
    if (failures < THRESHOLD) return;
    const alerts = await ctx.db.query("nexusAlerts").withIndex("by_sent").collect();
    if (alerts.some((al) => !al.sent)) return; // une alerte est déjà en attente d'envoi
    const lastAt = alerts.reduce((m, x) => Math.max(m, x.at), 0);
    if (now - lastAt < COOLDOWN) return; // cooldown : pas de re-spam
    await ctx.db.insert("nexusAlerts", {
      at: now,
      message: `⚠️ **Synchro NexusMDT** — ${failures} échecs (${a.direction}) en 30 min.\nDernière erreur : ${a.error ?? a.httpStatus ?? "inconnue"}`,
      targetDiscordId: process.env.NEXUS_ALERT_DISCORD_ID || "263679048712978432",
      sent: false,
    });
    await ctx.scheduler.runAfter(0, internal.push.notify, {}); // prévient le bot (alerte synchro)
  },
});

// Tous les identifiants liés (pour le cron de re-validation).
export const _allCreds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("nexusCredentials").collect();
    const out = [];
    for (const r of rows) {
      const agent = await ctx.db.get(r.agentId);
      out.push({ agentId: r.agentId, email: r.email, secretEnc: r.secretEnc, status: r.status, agentName: agent ? `${agent.prenomRP} ${agent.nomRP}` : r.email });
    }
    return out;
  },
});
export const _setCredStatus = internalMutation({
  args: { agentId: v.id("agents"), status: v.union(v.literal("OK"), v.literal("INVALID")), error: v.optional(v.string()) },
  handler: async (ctx, { agentId, status, error }) => {
    const row = await ctx.db.query("nexusCredentials").withIndex("by_agent", (q) => q.eq("agentId", agentId)).unique();
    if (row) await ctx.db.patch(row._id, { status, lastCheckedAt: Date.now(), lastError: error, ...(status === "INVALID" ? { tokenCache: undefined, tokenExpiry: undefined } : {}) });
  },
});

// Cron : re-teste tous les comptes Nexus liés ; alerte quand l'un devient invalide
// (mot de passe changé côté Nexus…).
export const revalidateCredentials = internalAction({
  args: {},
  handler: async (ctx): Promise<{ checked: number }> => {
    const creds: { agentId: Id<"agents">; email: string; secretEnc: string; status: string; agentName: string }[] = await ctx.runQuery(internal.nexusSync._allCreds, {});
    for (const c of creds) {
      let status: "OK" | "INVALID" = "OK";
      let err: string | undefined;
      try { const pw = await decryptSecret(c.secretEnc); await nexusLogin(c.email, pw); }
      catch (e) { status = "INVALID"; err = e instanceof Error ? e.message : String(e); }
      if (status !== c.status) {
        await ctx.runMutation(internal.nexusSync._setCredStatus, { agentId: c.agentId, status, error: err });
        if (status === "INVALID") await ctx.runMutation(internal.nexusSync._alert, { message: `⚠️ **Compte NexusMDT invalide** — ${c.agentName}. Le mot de passe a probablement changé côté Nexus ; la synchro de cet agent est suspendue.` });
      }
    }
    return { checked: creds.length };
  },
});

// Enqueue une alerte MP Discord (utilisé aussi par le cron de re-validation).
export const _alert = internalMutation({
  args: { message: v.string() },
  handler: async (ctx, { message }) => {
    await ctx.db.insert("nexusAlerts", {
      at: Date.now(), message,
      targetDiscordId: process.env.NEXUS_ALERT_DISCORD_ID || "263679048712978432",
      sent: false,
    });
    await ctx.scheduler.runAfter(0, internal.push.notify, {}); // prévient le bot (alerte MP)
  },
});

const DAY = 86_400_000;

// Données de la page de monitoring de synchro (réservé rbac.manage).
export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rbac.manage");
    const now = Date.now();

    // Journal récent (200 dernières opérations) + labels agents.
    const rows = await ctx.db.query("nexusSyncLog").withIndex("by_at").order("desc").take(200);
    const recent = [];
    for (const r of rows) {
      const who = r.agentId ? await agentLabel(ctx, r.agentId) : null;
      recent.push({
        _id: r._id, at: r.at, direction: r.direction, entity: r.entity, op: r.op,
        ok: r.ok, httpStatus: r.httpStatus ?? null, durationMs: r.durationMs ?? null,
        agent: who?.name ?? null, detail: r.detail ?? null, error: r.error ?? null,
      });
    }

    // Agrégats 30 jours (le journal complet, borné par by_at).
    const since = now - 30 * DAY;
    const win = await ctx.db.query("nexusSyncLog").withIndex("by_at", (q) => q.gte("at", since)).collect();
    const total = win.length;
    const okCount = win.filter((r) => r.ok).length;
    const errCount = total - okCount;
    const byDirection: Record<string, number> = {};
    const byEntity: Record<string, number> = {};
    for (const r of win) {
      byDirection[r.direction] = (byDirection[r.direction] ?? 0) + 1;
      byEntity[r.entity] = (byEntity[r.entity] ?? 0) + 1;
    }
    // Série journalière (14 j) pour le graphique.
    const days: { day: string; ok: number; err: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const start = new Date(now - i * DAY); start.setHours(0, 0, 0, 0);
      const s = start.getTime(), e = s + DAY;
      const inDay = win.filter((r) => r.at >= s && r.at < e);
      days.push({ day: start.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }), ok: inDay.filter((r) => r.ok).length, err: inDay.filter((r) => !r.ok).length });
    }

    // Agents liés à Nexus.
    const creds = await ctx.db.query("nexusCredentials").collect();
    const linked = [];
    for (const c of creds) {
      const who = await agentLabel(ctx, c.agentId);
      linked.push({ name: who.name, matricule: who.matricule, email: c.email, status: c.status, lastCheckedAt: c.lastCheckedAt ?? null, lastError: c.lastError ?? null });
    }

    return {
      totals: { total, okCount, errCount, successRate: total ? Math.round((okCount / total) * 100) : null, byDirection, byEntity },
      days,
      recent,
      linked,
    };
  },
});

// Id de l'agent courant (pour les actions, qui n'ont pas requireAgent).
export const myAgentId = query({
  args: {},
  handler: async (ctx) => {
    const agent = await getCurrentAgent(ctx);
    return agent?._id ?? null;
  },
});

// Statut de la liaison Nexus de l'agent courant (jamais le secret).
export const myStatus = query({
  args: {},
  handler: async (ctx) => {
    const agent = await getCurrentAgent(ctx);
    if (!agent) return { configured: false as const };
    const row = await ctx.db.query("nexusCredentials").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).unique();
    if (!row) return { configured: false as const };
    return { configured: true as const, email: row.email, status: row.status, lastCheckedAt: row.lastCheckedAt ?? null, lastError: row.lastError ?? null };
  },
});

// Écriture interne du coffre (les actions ne peuvent pas écrire directement).
export const _store = internalMutation({
  args: { agentId: v.id("agents"), email: v.string(), secretEnc: v.string(), status: v.union(v.literal("UNTESTED"), v.literal("OK"), v.literal("INVALID")), lastError: v.optional(v.string()) },
  handler: async (ctx, { agentId, email, secretEnc, status, lastError }) => {
    const existing = await ctx.db.query("nexusCredentials").withIndex("by_agent", (q) => q.eq("agentId", agentId)).unique();
    const data = { agentId, email, secretEnc, status, lastCheckedAt: Date.now(), lastError };
    if (existing) await ctx.db.patch(existing._id, data);
    else await ctx.db.insert("nexusCredentials", data);
  },
});

// Lecture interne du secret chiffré + token en cache (pour login à la demande).
export const _credFor = internalQuery({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const row = await ctx.db.query("nexusCredentials").withIndex("by_agent", (q) => q.eq("agentId", agentId)).unique();
    return row ? { email: row.email, secretEnc: row.secretEnc, tokenCache: row.tokenCache ?? null, tokenExpiry: row.tokenExpiry ?? null } : null;
  },
});
// Premier compte Nexus lié et VALIDE (pour la synchro auto : lecture seule, un
// compte lié quelconque suffit à obtenir un token). null si aucun.
export const _anyLinkedCred = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = (await ctx.db.query("nexusCredentials").collect()).find((r) => r.status === "OK");
    return row ? { agentId: row.agentId, email: row.email, secretEnc: row.secretEnc, tokenCache: row.tokenCache ?? null, tokenExpiry: row.tokenExpiry ?? null } : null;
  },
});
export const anyLinkedToken = internalAction({
  args: {},
  handler: async (ctx): Promise<string | null> => {
    const cred = await ctx.runQuery(internal.nexusSync._anyLinkedCred, {});
    if (!cred) return null;
    return await getToken(ctx, cred.agentId, cred);
  },
});

// Token Nexus d'un agent lié (pour que le bouton « Synchroniser » réutilise le
// compte de l'admin plutôt qu'un compte de service séparé). null si non lié.
export const tokenFor = internalAction({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }): Promise<string | null> => {
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    if (!cred) return null;
    return await getToken(ctx, agentId, cred);
  },
});
export const _cacheToken = internalMutation({
  args: { agentId: v.id("agents"), token: v.string(), expiry: v.number() },
  handler: async (ctx, { agentId, token, expiry }) => {
    const row = await ctx.db.query("nexusCredentials").withIndex("by_agent", (q) => q.eq("agentId", agentId)).unique();
    if (row) await ctx.db.patch(row._id, { tokenCache: token, tokenExpiry: expiry });
  },
});
// Invalide le token en cache (session Nexus révoquée) : force un relogin au prochain appel.
export const _invalidateToken = internalMutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const row = await ctx.db.query("nexusCredentials").withIndex("by_agent", (q) => q.eq("agentId", agentId)).unique();
    if (row) await ctx.db.patch(row._id, { tokenCache: undefined, tokenExpiry: undefined });
  },
});

// Enregistre (ou met à jour) les identifiants Nexus de l'agent courant :
// teste le login, chiffre le mot de passe, stocke. Ne renvoie jamais le secret.
export const saveCredential = action({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, { email, password }): Promise<{ ok: boolean; error: string | null }> => {
    const agentId = await ctx.runQuery(api.nexusSync.myAgentId, {});
    if (!agentId) throw new ConvexError("Non authentifié.");
    const mail = email.trim();
    if (!mail || !password) throw new ConvexError("Email et mot de passe requis.");

    let status: "OK" | "INVALID" = "OK";
    let lastError: string | undefined;
    try {
      await nexusLogin(mail, password); // test réel
    } catch (e) {
      status = "INVALID";
      lastError = e instanceof Error ? e.message : String(e);
    }
    const secretEnc = await encryptSecret(password);
    await ctx.runMutation(internal.nexusSync._store, { agentId, email: mail, secretEnc, status, lastError });
    return { ok: status === "OK", error: lastError ?? null };
  },
});

// Re-teste la liaison existante (login avec le secret stocké).
export const testCredential = action({
  args: {},
  handler: async (ctx): Promise<{ ok: boolean; error: string | null }> => {
    const agentId = await ctx.runQuery(api.nexusSync.myAgentId, {});
    if (!agentId) throw new ConvexError("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    if (!cred) throw new ConvexError("Aucun identifiant enregistré.");
    let status: "OK" | "INVALID" = "OK";
    let lastError: string | undefined;
    try {
      const password = await decryptSecret(cred.secretEnc);
      await nexusLogin(cred.email, password);
    } catch (e) {
      status = "INVALID";
      lastError = e instanceof Error ? e.message : String(e);
    }
    await ctx.runMutation(internal.nexusSync._store, { agentId, email: cred.email, secretEnc: cred.secretEnc, status, lastError });
    return { ok: status === "OK", error: lastError ?? null };
  },
});

// Débranche la synchro pour l'agent courant (supprime ses identifiants).
export const removeCredential = mutation({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    const row = await ctx.db.query("nexusCredentials").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).unique();
    if (row) await ctx.db.delete(row._id);
  },
});

// ============================================================================
// WRITE-THROUGH — création de citoyen (Nexus = source de vérité).
// On POST vers Nexus avec le token de l'agent (createdBy correct), puis on
// insère localement la fiche renvoyée. Si le POST échoue, RIEN n'est créé.
// ============================================================================

// Un citoyen déjà importé localement (par son importRef nexus-citoyen:<numero>) ?
// Sert à la récupération d'un POST 5xx : on ne « récupère » que des fiches
// nouvelles pour nous, jamais un homonyme déjà présent.
export const _citizenIdByNexusId = internalQuery({
  args: { nexusId: v.string() },
  handler: async (ctx, { nexusId }) => {
    const row = await ctx.db.query("citizens").withIndex("by_nexus", (q) => q.eq("nexusId", nexusId)).first();
    return row?._id ?? null;
  },
});

// Recherche de citoyens sur Nexus par nom (récupération après un POST en échec).
async function fetchNexusCitizensByName(ctx: ActionCtx, agentId: Id<"agents">, cred: Cred, nom: string): Promise<any[]> {
  try {
    const res = await nexusFetch(ctx, agentId, cred, `/api/citoyens?entity=lspd&search=${encodeURIComponent(nom)}&page=1&limit=100`);
    if (!res.ok) return [];
    const j: any = await res.json();
    return j.citoyens ?? j.data ?? [];
  } catch { return []; }
}

export const _insertCitizenFromNexus = internalMutation({
  args: { raw: v.string(), createdBy: v.id("agents"), mugshotUrl: v.optional(v.string()) },
  handler: async (ctx, { raw, createdBy, mugshotUrl }): Promise<Id<"citizens">> => {
    const c = mapCitizen(JSON.parse(raw));
    // Dédup par l'id Mongo Nexus (STABLE) en priorité. Les `numero` Nexus se
    // réutilisent : dédupliquer sur importRef (nexus-citoyen:<numero>) renvoyait
    // parfois un ANCIEN citoyen homonyme de numéro et la nouvelle fiche n'était
    // jamais insérée (elle n'apparaissait qu'après une synchro manuelle).
    if (c.nexusId) {
      const dup = await ctx.db.query("citizens").withIndex("by_nexus", (q) => q.eq("nexusId", c.nexusId)).first();
      if (dup) return dup._id;
    } else if (c.importRef) {
      const dup = await ctx.db.query("citizens").withIndex("by_import", (q) => q.eq("importRef", c.importRef)).first();
      if (dup) return dup._id;
    }
    return await ctx.db.insert("citizens", {
      prenom: c.prenom, nom: c.nom, dateNaissance: c.dateNaissance, lieuNaissance: c.lieuNaissance, sexe: c.sexe,
      taille: c.taille, poids: c.poids, ethnie: c.ethnie, cheveux: c.cheveux, yeux: c.yeux,
      adresse: c.adresse, groupe: c.groupe, metier: c.metier, telephone: c.telephone, email: c.email,
      deceased: c.deceased, mugshotUrl: mugshotUrl ?? c.mugshotUrl,
      importRef: c.importRef, nexusId: c.nexusId, groupeSanguin: c.groupeSanguin, allergies: c.allergies,
      antecedents: c.antecedents, traitements: c.traitements, ppaChasse: c.ppaChasse || undefined,
      contactUrgence: c.contactUrgence,
      photoStorageIds: [], status: "ACTIVE" as const, createdBy,
      searchText: norm(`${c.prenom} ${c.nom} ${c.telephone ?? ""}`),
    });
  },
});

export const createCitizen = action({
  args: {
    prenom: v.string(), nom: v.string(),
    dateNaissance: v.optional(v.string()), lieuNaissance: v.optional(v.string()), sexe: v.optional(v.string()),
    nationalite: v.optional(v.string()), telephone: v.optional(v.string()), email: v.optional(v.string()),
    taille: v.optional(v.string()), poids: v.optional(v.string()), ethnie: v.optional(v.string()),
    cheveux: v.optional(v.string()), yeux: v.optional(v.string()), adresse: v.optional(v.string()),
    groupe: v.optional(v.string()), metier: v.optional(v.string()), mugshotUrl: v.optional(v.string()),
  },
  handler: async (ctx, a): Promise<Id<"citizens">> => {
    const agentId = await ctx.runQuery(api.nexusSync.myAgentId, {});
    if (!agentId) throw new ConvexError("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    if (!cred) throw new ConvexError("Compte NexusMDT non lié : reliez-le dans Mon profil > Paramètres pour créer des fiches (elles sont écrites en votre nom sur le NexusMDT).");

    const payload: Record<string, unknown> = {
      entity: "lspd",
      prenom: a.prenom.trim(), nom: a.nom.trim(),
      dateNaissance: a.dateNaissance ?? "", lieuNaissance: a.lieuNaissance ?? "",
      sexe: a.sexe === "H" ? "Homme" : a.sexe === "F" ? "Femme" : (a.sexe ?? ""),
      telephone: a.telephone ?? "", email: a.email ?? "", adresse: a.adresse ?? "",
      ethnie: a.ethnie ?? "", couleurCheveux: a.cheveux ?? "", couleurYeux: a.yeux ?? "",
      taille: toNexusNum(a.taille), poids: toNexusNum(a.poids), appartenance: a.groupe ?? "", emploi: a.metier ?? "",
      // On n'envoie que des URLs http (les data: URLs cassent Nexus) ; sinon le
      // mugshot reste local.
      photoUrl: a.mugshotUrl && /^https?:/.test(a.mugshotUrl) ? a.mugshotUrl : "",
    };
    const t0 = Date.now();
    let res: Response;
    try {
      res = await nexusFetch(ctx, agentId, cred, `/api/citoyens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "citoyen", op: "POST", ok: false, durationMs: Date.now() - t0, agentId, error: e instanceof Error ? e.message : String(e) });
      throw new ConvexError("NexusMDT injoignable, citoyen non créé.");
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "citoyen", op: "POST", ok: false, httpStatus: res.status, durationMs: Date.now() - t0, agentId, error: txt.slice(0, 160) });
      // Récupération : NexusMDT renvoie parfois un 5xx TOUT EN ayant créé la fiche.
      // Plutôt que d'attendre la synchro, on la recherche par nom : si elle existe
      // sur Nexus sans équivalent local, on l'importe aussitôt (write-through
      // récupéré). Sûr : si Nexus n'a rien créé, on ne trouve rien et on lève
      // l'erreur comme avant (aucun effet de bord).
      if (res.status >= 500) {
        const wantP = norm(a.prenom.trim()); const wantN = norm(a.nom.trim());
        const matches = (await fetchNexusCitizensByName(ctx, agentId, cred, a.nom.trim()))
          .filter((c) => norm(String(c.prenom ?? "")) === wantP && norm(String(c.nom ?? "")) === wantN)
          .sort((x, y) => Number(y.numero ?? 0) - Number(x.numero ?? 0));
        for (const m of matches) {
          const nexusId = String(m._id ?? m.id ?? "");
          // Déjà en local (par id Mongo stable) : homonyme préexistant, pas notre fiche.
          if (nexusId && await ctx.runQuery(internal.nexusSync._citizenIdByNexusId, { nexusId })) continue;
          const citizenId = await ctx.runMutation(internal.nexusSync._insertCitizenFromNexus, { raw: JSON.stringify(m), createdBy: agentId, mugshotUrl: a.mugshotUrl });
          await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "citoyen", op: "POST", ok: true, httpStatus: res.status, durationMs: Date.now() - t0, agentId, detail: `RECUP apres ${res.status} · ${a.prenom} ${a.nom} · Nexus n°${m.numero ?? "?"} · local ${citizenId}` });
          return citizenId;
        }
      }
      throw new ConvexError(`Création côté NexusMDT échouée (HTTP ${res.status}). ${txt.slice(0, 120)}`);
    }
    const j: any = await res.json();
    const created = j.citoyen ?? j.data ?? j;
    const citizenId = await ctx.runMutation(internal.nexusSync._insertCitizenFromNexus, {
      raw: JSON.stringify(created), createdBy: agentId, mugshotUrl: a.mugshotUrl,
    });
    await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "citoyen", op: "POST", ok: true, httpStatus: res.status, durationMs: Date.now() - t0, agentId, detail: `${a.prenom} ${a.nom} · Nexus n°${created?.numero ?? "?"} · local ${citizenId}` });
    return citizenId;
  },
});

// ---------------------- Contravention (amende) write-through ----------------------
export const _citationForPush = internalQuery({
  args: { citationId: v.id("citations") },
  handler: async (ctx, { citationId }) => {
    const c = await ctx.db.get(citationId);
    if (!c) return null;
    const citizen = await ctx.db.get(c.citizenId);
    const charges = await ctx.db.query("citationCharges").withIndex("by_citation", (q) => q.eq("citationId", citationId)).collect();
    return {
      nexusId: citizen?.nexusId ?? null,
      nom: citizen?.nom ?? "", prenom: citizen?.prenom ?? "",
      objet: charges.map((x) => x.snapshot.name).join(" + "),
      montant: c.totalFine, finePaid: c.finePaid ?? false,
      recidive: charges.some((x) => x.isRecidive),
    };
  },
});
export const _stampCitationImport = internalMutation({
  args: { citationId: v.id("citations"), importRef: v.string(), nexusId: v.optional(v.string()) },
  handler: async (ctx, { citationId, importRef, nexusId }) => { await ctx.db.patch(citationId, { importRef, nexusId }); },
});
export const _rollbackCitation = internalMutation({
  args: { citationId: v.id("citations") },
  handler: async (ctx, { citationId }) => {
    for (const ch of await ctx.db.query("citationCharges").withIndex("by_citation", (q) => q.eq("citationId", citationId)).collect()) await ctx.db.delete(ch._id);
    await ctx.db.delete(citationId);
  },
});

export const createContravention = action({
  args: {
    citizenId: v.id("citizens"), vehicleId: v.optional(v.id("vehicles")),
    charges: v.array(v.object({ penalChargeId: v.id("penalCharges"), param: v.optional(v.number()), isRecidive: v.boolean() })),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, a): Promise<Id<"citations">> => {
    const agentId = await ctx.runQuery(api.nexusSync.myAgentId, {});
    if (!agentId) throw new ConvexError("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    if (!cred) throw new ConvexError("Compte NexusMDT non lié : reliez-le dans Mon profil > Paramètres pour créer des fiches (elles sont écrites en votre nom sur le NexusMDT).");

    // 1) Création locale (calcul des amendes/charges par la logique existante).
    const citationId = await ctx.runMutation(api.citations.create, { citizenId: a.citizenId, vehicleId: a.vehicleId, charges: a.charges, notes: a.notes });
    const info = await ctx.runQuery(internal.nexusSync._citationForPush, { citationId });
    if (!info) { throw new ConvexError("Contravention introuvable après création."); }
    if (!info.nexusId) {
      await ctx.runMutation(internal.nexusSync._rollbackCitation, { citationId });
      throw new ConvexError("Ce citoyen n'existe pas encore côté NexusMDT (resync nécessaire).");
    }

    // 2) Push vers Nexus (rollback local si échec).
    const t0 = Date.now();
    try {
      const { date, heure } = nowParis();
      const payload = {
        entity: "lspd", citoyen: { id: info.nexusId, nom: info.nom, prenom: info.prenom },
        objet: info.objet || "Contravention", montant: info.montant,
        statut: info.finePaid ? "Payée" : "En attente", recidive: info.recidive,
        dateInfraction: date, heureInfraction: heure,
        typeAmende: "Amende de police", categorieAmende: "Montant personnalisé",
      };
      const res = await nexusFetch(ctx, agentId, cred, `/api/amendes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        await ctx.runMutation(internal.nexusSync._rollbackCitation, { citationId });
        await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "amende", op: "POST", ok: false, httpStatus: res.status, durationMs: Date.now() - t0, agentId, error: txt.slice(0, 160) });
        throw new ConvexError(`Émission côté NexusMDT échouée (HTTP ${res.status}). Contravention annulée.`);
      }
      const j: any = await res.json();
      const created = j.amende ?? j.data ?? j;
      // On ne tamponne qu'avec le vrai `numero` (même clé que l'import) ; sinon
      // l'orphelin sera adopté au prochain sync (anti-doublon).
      const numero = created?.numero;
      if (numero != null) await ctx.runMutation(internal.nexusSync._stampCitationImport, { citationId, importRef: `nexus-amende:${numero}`, nexusId: created?._id });
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "amende", op: "POST", ok: true, httpStatus: res.status, durationMs: Date.now() - t0, agentId, detail: `${info.prenom} ${info.nom} · $${info.montant}` });
      return citationId;
    } catch (e) {
      // Erreur réseau / login : on annule la création locale.
      await ctx.runMutation(internal.nexusSync._rollbackCitation, { citationId }).catch(() => {});
      if (e instanceof Error && e.message.includes("échouée")) throw e;
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "amende", op: "POST", ok: false, durationMs: Date.now() - t0, agentId, error: e instanceof Error ? e.message : String(e) });
      throw new ConvexError("NexusMDT injoignable, contravention annulée.");
    }
  },
});

// ---------------------- Casier (dossier / rapport) write-through ----------------------
export const _casierForPush = internalQuery({
  args: { entryId: v.id("casierEntries") },
  handler: async (ctx, { entryId }) => {
    const e = await ctx.db.get(entryId);
    if (!e) return null;
    const citizen = await ctx.db.get(e.citizenId);
    const charges = await ctx.db.query("casierCharges").withIndex("by_entry", (q) => q.eq("entryId", entryId)).collect();
    const agent = await ctx.db.get(e.createdBy);
    return {
      nexusId: citizen?.nexusId ?? null,
      nom: citizen?.nom ?? "", prenom: citizen?.prenom ?? "",
      arrestType: e.arrestType ?? "DOSSIER",
      reportBody: e.reportBody ?? "",
      dossierStatus: e.dossierStatus ?? "",
      totalFine: e.totalFine, totalJail: e.totalJailSeconds,
      agentMatricule: agent?.matricule ?? null, agentNom: agent ? `${agent.prenomRP} ${agent.nomRP}` : "",
      charges: charges.map((c) => ({ name: c.snapshot.name, amende: c.computedFine, jailSeconds: c.computedJailSeconds })),
    };
  },
});
export const _stampCasierImport = internalMutation({
  args: { entryId: v.id("casierEntries"), importRef: v.string(), nexusId: v.optional(v.string()) },
  handler: async (ctx, { entryId, importRef, nexusId }) => { await ctx.db.patch(entryId, { importRef, nexusId }); },
});
export const _rollbackCasier = internalMutation({
  args: { entryId: v.id("casierEntries") },
  handler: async (ctx, { entryId }) => {
    for (const ch of await ctx.db.query("casierCharges").withIndex("by_entry", (q) => q.eq("entryId", entryId)).collect()) await ctx.db.delete(ch._id);
    await ctx.db.delete(entryId);
  },
});

export const createCasier = action({
  args: {
    citizenId: v.id("citizens"),
    charges: v.array(v.object({ penalChargeId: v.id("penalCharges"), param: v.optional(v.number()), isRecidive: v.boolean() })),
    derouleFaits: v.optional(v.string()), lieu: v.optional(v.string()),
    cuffedAt: v.optional(v.string()), mirandaAt: v.optional(v.string()),
    rightsLawyer: v.optional(v.boolean()), rightsFood: v.optional(v.boolean()), rightsMedical: v.optional(v.boolean()),
    finePaid: v.optional(v.boolean()), reportBody: v.optional(v.string()), imageUrls: v.optional(v.array(v.string())),
    avocat: v.optional(v.string()), linkedReportId: v.optional(v.id("reports")),
    vehicleIds: v.optional(v.array(v.id("vehicles"))), weaponIds: v.optional(v.array(v.id("weapons"))),
    dossierStatus: v.optional(v.string()), forceUsed: v.optional(v.boolean()),
  },
  handler: async (ctx, a): Promise<Id<"casierEntries">> => {
    const agentId = await ctx.runQuery(api.nexusSync.myAgentId, {});
    if (!agentId) throw new ConvexError("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    if (!cred) throw new ConvexError("Compte NexusMDT non lié : reliez-le dans Mon profil > Paramètres pour créer des fiches (elles sont écrites en votre nom sur le NexusMDT).");

    const entryId = await ctx.runMutation(api.casier.addEntry, a);
    const info = await ctx.runQuery(internal.nexusSync._casierForPush, { entryId });
    if (!info) throw new ConvexError("Casier introuvable après création.");
    if (!info.nexusId) {
      await ctx.runMutation(internal.nexusSync._rollbackCasier, { entryId });
      throw new ConvexError("Ce citoyen n'existe pas encore côté NexusMDT (resync nécessaire).");
    }

    const t0 = Date.now();
    try {
      const citoyen = { id: info.nexusId, nom: info.nom, prenom: info.prenom };
      const officer = { matricule: info.agentMatricule != null ? String(info.agentMatricule) : "", nom: info.agentNom };
      const isDossier = info.arrestType === "DOSSIER";
      const path = isDossier ? "/api/dossiers" : "/api/rapports";
      const entity = isDossier ? "dossier" : "rapport";
      const payload: Record<string, unknown> = isDossier
        ? {
            entity: "lspd", citoyen, agents: [officer],
            charges: info.charges.map((c) => ({ charge: c.name, amende: c.amende, tempsPrison: fmtHMS(c.jailSeconds) })),
            statut: info.dossierStatus || "En cours", dateArrestation: nowArrest(),
            rapport: info.reportBody || a.derouleFaits || "",
          }
        : {
            entity: "lspd", citoyen, agentsImpliques: [officer],
            charges: info.charges.map((c) => c.name),
            rapport: info.reportBody || "", amende: info.totalFine, peine: fmtHMS(info.totalJail),
            date: nowArrest(),
          };
      const res = await nexusFetch(ctx, agentId, cred, path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        await ctx.runMutation(internal.nexusSync._rollbackCasier, { entryId });
        await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity, op: "POST", ok: false, httpStatus: res.status, durationMs: Date.now() - t0, agentId, error: txt.slice(0, 160) });
        throw new ConvexError(`Création côté NexusMDT échouée (HTTP ${res.status}). ${entity} annulé.`);
      }
      const j: any = await res.json();
      const created = j.dossier ?? j.rapport ?? j.data ?? j;
      const numero = typeof created === "object" ? created?.numero : undefined;
      if (numero != null) await ctx.runMutation(internal.nexusSync._stampCasierImport, { entryId, importRef: `${isDossier ? "nexus" : "nexus-rapport"}:${numero}`, nexusId: created?._id });
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity, op: "POST", ok: true, httpStatus: res.status, durationMs: Date.now() - t0, agentId, detail: `${info.prenom} ${info.nom}` });
      return entryId;
    } catch (e) {
      await ctx.runMutation(internal.nexusSync._rollbackCasier, { entryId }).catch(() => {});
      if (e instanceof Error && e.message.includes("annulé")) throw e;
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "casier", op: "POST", ok: false, durationMs: Date.now() - t0, agentId, error: e instanceof Error ? e.message : String(e) });
      throw new ConvexError("NexusMDT injoignable, casier annulé.");
    }
  },
});

// Édition d'un casier / rapport d'arrestation : PATCH partiel (fusion) des seuls
// champs modifiables côté Nexus (corps du rapport, statut du dossier) ; le reste
// (charges, date d'arrestation) est préservé. Puis application locale.
export const updateArrest = action({
  args: {
    entryId: v.id("casierEntries"),
    arrestType: v.union(v.literal("RAPPORT"), v.literal("DOSSIER")),
    reportBody: v.optional(v.string()),
    imageUrls: v.optional(v.array(v.string())),
    avocat: v.optional(v.string()),
    linkedReportId: v.optional(v.id("reports")),
    vehicleIds: v.optional(v.array(v.id("vehicles"))),
    weaponIds: v.optional(v.array(v.id("weapons"))),
    dossierStatus: v.optional(v.string()),
    forceUsed: v.optional(v.boolean()),
    finePaid: v.optional(v.boolean()),
  },
  handler: async (ctx, a): Promise<void> => {
    const agentId = await ctx.runQuery(api.nexusSync.myAgentId, {});
    if (!agentId) throw new ConvexError("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    const rec = await ctx.runQuery(internal.nexusSync._recordNexusInfo, { kind: "casier", localId: a.entryId });
    const { entryId, ...fields } = a;

    // Non synchronisé (aucun compte lié ou casier non lié) : édition locale simple.
    if (!cred || !rec?.nexusId) { await ctx.runMutation(api.casier.updateArrest, { entryId, ...fields }); return; }

    const isRapport = rec.arrestType === "RAPPORT";
    const path = isRapport ? "/api/rapports" : "/api/dossiers";
    const entity = isRapport ? "rapport" : "dossier";
    const payload: Record<string, unknown> = { entity: "lspd" };
    if (a.reportBody !== undefined) payload.rapport = a.reportBody;
    if (!isRapport && a.dossierStatus !== undefined) payload.statut = a.dossierStatus;

    const t0 = Date.now();
    const res = await nexusFetch(ctx, agentId, cred, `${path}/${rec.nexusId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity, op: "PATCH", ok: false, httpStatus: res.status, durationMs: Date.now() - t0, agentId, error: txt.slice(0, 160) });
      throw new ConvexError(`Édition côté NexusMDT échouée (HTTP ${res.status}). Modification non enregistrée.`);
    }
    await ctx.runMutation(api.casier.updateArrest, { entryId, ...fields });
    await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity, op: "PATCH", ok: true, httpStatus: res.status, durationMs: Date.now() - t0, agentId });
  },
});

// ---------------------- Suppression / édition write-through ----------------------
export const _citizenNexus = internalQuery({
  args: { citizenId: v.id("citizens") },
  handler: async (ctx, { citizenId }) => {
    const c = await ctx.db.get(citizenId);
    return c ? { nexusId: c.nexusId ?? null, nom: c.nom, prenom: c.prenom } : null;
  },
});
const DELETE_KIND = v.union(v.literal("casier"), v.literal("amende"), v.literal("plainte"), v.literal("deposition"), v.literal("arme"), v.literal("vehicule"));
export const _recordNexusInfo = internalQuery({
  args: { kind: DELETE_KIND, localId: v.string() },
  handler: async (ctx, { kind, localId }) => {
    if (kind === "casier") {
      const e = await ctx.db.get(localId as Id<"casierEntries">);
      return e ? { nexusId: e.nexusId ?? null, arrestType: e.arrestType ?? "DOSSIER" } : null;
    }
    if (kind === "amende") {
      const c = await ctx.db.get(localId as Id<"citations">);
      return c ? { nexusId: c.nexusId ?? null, arrestType: null as string | null } : null;
    }
    if (kind === "plainte") {
      const p = await ctx.db.get(localId as Id<"complaints">);
      return p ? { nexusId: p.nexusId ?? null, arrestType: null as string | null } : null;
    }
    if (kind === "arme") {
      const w = await ctx.db.get(localId as Id<"weapons">);
      return w ? { nexusId: w.nexusId ?? null, arrestType: null as string | null } : null;
    }
    if (kind === "vehicule") {
      const ve = await ctx.db.get(localId as Id<"vehicles">);
      return ve ? { nexusId: ve.nexusId ?? null, arrestType: null as string | null } : null;
    }
    const d = await ctx.db.get(localId as Id<"depositions">);
    return d ? { nexusId: d.nexusId ?? null, arrestType: null as string | null } : null;
  },
});

// Supprime un casier/contravention : d'abord sur Nexus (si synchronisé), puis en
// local. Si la suppression Nexus échoue, RIEN n'est supprimé localement.
export const deleteRecord = action({
  args: { kind: DELETE_KIND, localId: v.string() },
  handler: async (ctx, { kind, localId }): Promise<{ synced: boolean }> => {
    const agentId = await ctx.runQuery(api.nexusSync.myAgentId, {});
    if (!agentId) throw new ConvexError("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    const info = await ctx.runQuery(internal.nexusSync._recordNexusInfo, { kind, localId });

    const localRemove = async () => {
      if (kind === "casier") await ctx.runMutation(api.casier.remove, { entryId: localId as Id<"casierEntries"> });
      else if (kind === "amende") await ctx.runMutation(api.citations.remove, { citationId: localId as Id<"citations"> });
      else if (kind === "plainte") await ctx.runMutation(api.complaints.remove, { id: localId as Id<"complaints"> });
      else if (kind === "arme") await ctx.runMutation(api.weapons.remove, { id: localId as Id<"weapons"> });
      else if (kind === "vehicule") await ctx.runMutation(api.vehicles.remove, { id: localId as Id<"vehicles"> });
      else await ctx.runMutation(api.depositions.remove, { id: localId as Id<"depositions"> });
    };

    // Non synchronisé (aucun compte lié ou fiche non liée à Nexus) : suppression locale simple.
    if (!cred || !info?.nexusId) { await localRemove(); return { synced: false }; }

    const t0 = Date.now();
    const path = kind === "amende" ? "/api/amendes"
      : kind === "plainte" ? "/api/plaintes"
      : kind === "deposition" ? "/api/depositions"
      : kind === "arme" ? "/api/armes"
      : kind === "vehicule" ? "/api/vehicules"
      : info.arrestType === "RAPPORT" ? "/api/rapports" : "/api/dossiers";
    let res: Response;
    try {
      res = await nexusFetch(ctx, agentId, cred, `${path}/${info.nexusId}`, { method: "DELETE" });
    } catch (e) {
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: kind, op: "DELETE", ok: false, durationMs: Date.now() - t0, agentId, error: e instanceof Error ? e.message : String(e) });
      throw new ConvexError("NexusMDT injoignable, suppression annulée.");
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: kind, op: "DELETE", ok: false, httpStatus: res.status, durationMs: Date.now() - t0, agentId, error: txt.slice(0, 160) });
      throw new ConvexError(res.status === 403 ? "Ton compte NexusMDT n'a pas le droit de supprimer. Suppression annulée." : `Suppression côté NexusMDT échouée (HTTP ${res.status}).`);
    }
    await localRemove();
    await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: kind, op: "DELETE", ok: true, httpStatus: res.status, durationMs: Date.now() - t0, agentId });
    return { synced: true };
  },
});

// Édite un citoyen : PUT vers Nexus (si synchronisé) puis application locale.
export const updateCitizen = action({
  args: {
    citizenId: v.id("citizens"),
    prenom: v.string(), nom: v.string(),
    dateNaissance: v.optional(v.string()), lieuNaissance: v.optional(v.string()), sexe: v.optional(v.string()),
    nationalite: v.optional(v.string()), telephone: v.optional(v.string()), email: v.optional(v.string()),
    taille: v.optional(v.string()), poids: v.optional(v.string()), ethnie: v.optional(v.string()),
    cheveux: v.optional(v.string()), yeux: v.optional(v.string()), adresse: v.optional(v.string()),
    groupe: v.optional(v.string()), metier: v.optional(v.string()),
    descriptionPhysique: v.optional(v.string()), mugshotUrl: v.optional(v.string()),
  },
  handler: async (ctx, a): Promise<void> => {
    const agentId = await ctx.runQuery(api.nexusSync.myAgentId, {});
    if (!agentId) throw new ConvexError("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    const citizen = await ctx.runQuery(internal.nexusSync._citizenNexus, { citizenId: a.citizenId });
    const { citizenId, ...fields } = a;

    // Non synchronisé : édition locale simple.
    if (!cred || !citizen?.nexusId) { await ctx.runMutation(api.citizens.update, { id: citizenId, ...fields }); return; }

    const t0 = Date.now();
    const payload = {
      entity: "lspd", prenom: a.prenom.trim(), nom: a.nom.trim(),
      dateNaissance: a.dateNaissance ?? "", lieuNaissance: a.lieuNaissance ?? "",
      sexe: a.sexe === "H" ? "Homme" : a.sexe === "F" ? "Femme" : (a.sexe ?? ""),
      telephone: a.telephone ?? "", email: a.email ?? "", adresse: a.adresse ?? "",
      ethnie: a.ethnie ?? "", couleurCheveux: a.cheveux ?? "", couleurYeux: a.yeux ?? "",
      taille: toNexusNum(a.taille), poids: toNexusNum(a.poids), appartenance: a.groupe ?? "", emploi: a.metier ?? "",
    };
    const res = await nexusFetch(ctx, agentId, cred, `/api/citoyens/${citizen.nexusId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "citoyen", op: "PUT", ok: false, httpStatus: res.status, durationMs: Date.now() - t0, agentId, error: txt.slice(0, 160) });
      throw new ConvexError(`Édition côté NexusMDT échouée (HTTP ${res.status}). Modification non enregistrée.`);
    }
    await ctx.runMutation(api.citizens.update, { id: citizenId, ...fields });
    await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "citoyen", op: "PUT", ok: true, httpStatus: res.status, durationMs: Date.now() - t0, agentId, detail: `${a.prenom} ${a.nom}` });
  },
});

// ============================================================================
// Plaintes & Dépositions — write-through (POST/PATCH). Comme le reste : si
// l'écriture Nexus échoue, RIEN n'est écrit localement. DELETE via deleteRecord.
// ============================================================================
const OFFICER = v.object({ matricule: v.optional(v.string()), nom: v.string() });

// Résout, pour une plainte : le plaignant (nexusId + noms), le « contre » (texte
// libre : citoyen recensé -> « Prénom Nom », sinon nom saisi) et les officiers.
export const _complaintPushCtx = internalQuery({
  args: {
    plaignantId: v.optional(v.id("citizens")),
    defendantCitizenId: v.optional(v.id("citizens")),
    defendantName: v.optional(v.string()),
    agentIds: v.array(v.id("agents")),
  },
  handler: async (ctx, a) => {
    const p = a.plaignantId ? await ctx.db.get(a.plaignantId) : null;
    let contre = (a.defendantName ?? "").trim();
    if (a.defendantCitizenId) {
      const d = await ctx.db.get(a.defendantCitizenId);
      if (d) contre = `${d.prenom} ${d.nom}`.trim();
    }
    const officiers: { matricule?: string; nom: string }[] = [];
    for (const id of a.agentIds) {
      const ag = await ctx.db.get(id);
      if (ag) officiers.push({ matricule: ag.matricule != null ? String(ag.matricule) : undefined, nom: ag.nomRP });
    }
    return {
      plaignant: p ? { nexusId: p.nexusId ?? null, nom: p.nom, prenom: p.prenom } : null,
      contre,
      officiers,
    };
  },
});
const nexusOfficiers = (list: { matricule?: string; nom: string }[]) => list.map((o) => ({ matricule: o.matricule ?? "", nom: o.nom }));

export const _insertComplaintFromWrite = internalMutation({
  args: {
    plaignantId: v.id("citizens"),
    defendantCitizenId: v.optional(v.id("citizens")),
    defendantName: v.optional(v.string()),
    contre: v.string(),
    agentIds: v.array(v.id("agents")),
    officiers: v.array(OFFICER),
    motif: v.string(), status: v.string(), avocat: v.optional(v.string()), avocats: v.array(v.string()),
    body: v.string(), createdBy: v.id("agents"),
    nexusId: v.string(), numero: v.optional(v.number()),
  },
  handler: async (ctx, a): Promise<Id<"complaints">> => {
    return await ctx.db.insert("complaints", {
      plaignantId: a.plaignantId,
      defendantCitizenId: a.defendantCitizenId,
      defendantName: a.defendantName,
      contre: a.contre || undefined,
      agentIds: a.agentIds,
      officiers: a.officiers,
      motif: a.motif, status: a.status, avocat: a.avocat, avocats: a.avocats,
      body: a.body, at: Date.now(), createdBy: a.createdBy,
      nexusId: a.nexusId, numero: a.numero, importRef: a.numero != null ? String(a.numero) : undefined,
    });
  },
});
export const _complaintNexusId = internalQuery({
  args: { id: v.id("complaints") },
  handler: async (ctx, { id }) => { const c = await ctx.db.get(id); return c ? { nexusId: c.nexusId ?? null } : null; },
});
export const _applyComplaintLocal = internalMutation({
  args: {
    id: v.id("complaints"),
    defendantCitizenId: v.optional(v.id("citizens")), defendantName: v.optional(v.string()), contre: v.string(),
    agentIds: v.array(v.id("agents")), officiers: v.array(OFFICER),
    motif: v.string(), status: v.string(), avocat: v.optional(v.string()), avocats: v.array(v.string()), body: v.string(),
  },
  handler: async (ctx, { id, ...f }) => {
    await ctx.db.patch(id, {
      defendantCitizenId: f.defendantCitizenId, defendantName: f.defendantName, contre: f.contre || undefined,
      agentIds: f.agentIds, officiers: f.officiers,
      motif: f.motif, status: f.status, avocat: f.avocat, avocats: f.avocats, body: f.body,
    });
  },
});

export const createComplaint = action({
  args: {
    plaignantId: v.id("citizens"),
    defendantCitizenId: v.optional(v.id("citizens")), defendantName: v.optional(v.string()),
    agentIds: v.array(v.id("agents")),
    motif: v.string(), status: v.string(), avocat: v.optional(v.string()), body: v.string(),
  },
  handler: async (ctx, a): Promise<Id<"complaints">> => {
    const agentId = await ctx.runQuery(api.nexusSync.myAgentId, {});
    if (!agentId) throw new ConvexError("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    if (!cred) throw new ConvexError("Compte NexusMDT non lié : reliez-le dans Mon profil > Paramètres pour créer des fiches (elles sont écrites en votre nom sur le NexusMDT).");
    const cx = await ctx.runQuery(internal.nexusSync._complaintPushCtx, { plaignantId: a.plaignantId, defendantCitizenId: a.defendantCitizenId, defendantName: a.defendantName, agentIds: a.agentIds });
    if (!cx?.plaignant?.nexusId) throw new ConvexError("Le plaignant n'existe pas encore côté NexusMDT (resync nécessaire).");

    const avocats = a.avocat?.trim() ? [a.avocat.trim()] : [];
    const statut = a.status || "En cours";
    const t0 = Date.now();
    const { date } = nowParis();
    const payload = {
      entity: "lspd",
      citoyen: { id: cx.plaignant.nexusId, nom: cx.plaignant.nom, prenom: cx.plaignant.prenom },
      date, officiers: nexusOfficiers(cx.officiers), avocats,
      raison: a.motif, contre: cx.contre, statut, corps: a.body, photos: [] as string[],
    };
    let res: Response;
    try {
      res = await nexusFetch(ctx, agentId, cred, `/api/plaintes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } catch (e) {
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "plainte", op: "POST", ok: false, durationMs: Date.now() - t0, agentId, error: e instanceof Error ? e.message : String(e) });
      throw new ConvexError("NexusMDT injoignable, plainte non créée.");
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "plainte", op: "POST", ok: false, httpStatus: res.status, durationMs: Date.now() - t0, agentId, error: txt.slice(0, 160) });
      throw new ConvexError(`Création côté NexusMDT échouée (HTTP ${res.status}). ${txt.slice(0, 120)}`);
    }
    const j: any = await res.json();
    const created = j.plainte ?? j.data ?? j;
    const id = await ctx.runMutation(internal.nexusSync._insertComplaintFromWrite, {
      plaignantId: a.plaignantId, defendantCitizenId: a.defendantCitizenId, defendantName: a.defendantName,
      contre: cx.contre, agentIds: a.agentIds, officiers: cx.officiers,
      motif: a.motif, status: statut, avocat: a.avocat?.trim() || undefined, avocats,
      body: a.body, createdBy: agentId, nexusId: String(created._id), numero: typeof created.numero === "number" ? created.numero : undefined,
    });
    await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "plainte", op: "POST", ok: true, httpStatus: res.status, durationMs: Date.now() - t0, agentId, detail: `${a.motif} · Nexus n°${created?.numero ?? "?"} · local ${id}` });
    return id;
  },
});

export const updateComplaint = action({
  args: {
    id: v.id("complaints"),
    defendantCitizenId: v.optional(v.id("citizens")), defendantName: v.optional(v.string()),
    agentIds: v.array(v.id("agents")),
    motif: v.string(), status: v.string(), avocat: v.optional(v.string()), body: v.string(),
  },
  handler: async (ctx, a): Promise<void> => {
    const agentId = await ctx.runQuery(api.nexusSync.myAgentId, {});
    if (!agentId) throw new ConvexError("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    const info = await ctx.runQuery(internal.nexusSync._complaintNexusId, { id: a.id });
    const cx = await ctx.runQuery(internal.nexusSync._complaintPushCtx, { defendantCitizenId: a.defendantCitizenId, defendantName: a.defendantName, agentIds: a.agentIds });
    const avocats = a.avocat?.trim() ? [a.avocat.trim()] : [];
    const statut = a.status || "En cours";
    const local = { id: a.id, defendantCitizenId: a.defendantCitizenId, defendantName: a.defendantName, contre: cx.contre, agentIds: a.agentIds, officiers: cx.officiers, motif: a.motif, status: statut, avocat: a.avocat?.trim() || undefined, avocats, body: a.body };

    if (!cred || !info?.nexusId) { await ctx.runMutation(internal.nexusSync._applyComplaintLocal, local); return; }

    const t0 = Date.now();
    const payload = { entity: "lspd", raison: a.motif, statut, contre: cx.contre, corps: a.body, avocats, officiers: nexusOfficiers(cx.officiers) };
    const res = await nexusFetch(ctx, agentId, cred, `/api/plaintes/${info.nexusId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "plainte", op: "PATCH", ok: false, httpStatus: res.status, durationMs: Date.now() - t0, agentId, error: txt.slice(0, 160) });
      throw new ConvexError(`Édition côté NexusMDT échouée (HTTP ${res.status}). Modification non enregistrée.`);
    }
    await ctx.runMutation(internal.nexusSync._applyComplaintLocal, local);
    await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "plainte", op: "PATCH", ok: true, httpStatus: res.status, durationMs: Date.now() - t0, agentId, detail: a.motif });
  },
});

// ---------------------- Dépositions (standalone, format Nexus) ----------------------
export const _depositionPushCtx = internalQuery({
  args: { citizenId: v.id("citizens"), agentIds: v.array(v.id("agents")) },
  handler: async (ctx, a) => {
    const c = await ctx.db.get(a.citizenId);
    const officiers: { matricule?: string; nom: string }[] = [];
    for (const id of a.agentIds) {
      const ag = await ctx.db.get(id);
      if (ag) officiers.push({ matricule: ag.matricule != null ? String(ag.matricule) : undefined, nom: ag.nomRP });
    }
    return { citoyen: c ? { nexusId: c.nexusId ?? null, nom: c.nom, prenom: c.prenom } : null, officiers };
  },
});
export const _insertDepositionFromWrite = internalMutation({
  args: {
    citizenId: v.id("citizens"), title: v.string(), body: v.string(),
    officiers: v.array(OFFICER), createdBy: v.id("agents"),
    nexusId: v.string(), numero: v.optional(v.number()),
  },
  handler: async (ctx, a): Promise<Id<"depositions">> => {
    return await ctx.db.insert("depositions", {
      citizenId: a.citizenId, linkType: "STANDALONE", title: a.title, body: a.body,
      officiers: a.officiers, at: Date.now(), createdBy: a.createdBy,
      nexusId: a.nexusId, numero: a.numero, importRef: a.numero != null ? String(a.numero) : undefined,
    });
  },
});
export const _depositionNexusId = internalQuery({
  args: { id: v.id("depositions") },
  handler: async (ctx, { id }) => { const d = await ctx.db.get(id); return d ? { nexusId: d.nexusId ?? null } : null; },
});
export const _applyDepositionLocal = internalMutation({
  args: { id: v.id("depositions"), title: v.string(), body: v.string(), officiers: v.array(OFFICER) },
  handler: async (ctx, { id, ...f }) => { await ctx.db.patch(id, { title: f.title, body: f.body, officiers: f.officiers }); },
});

export const createDeposition = action({
  args: { citizenId: v.id("citizens"), title: v.string(), body: v.string(), agentIds: v.array(v.id("agents")) },
  handler: async (ctx, a): Promise<Id<"depositions">> => {
    const agentId = await ctx.runQuery(api.nexusSync.myAgentId, {});
    if (!agentId) throw new ConvexError("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    if (!cred) throw new ConvexError("Compte NexusMDT non lié : reliez-le dans Mon profil > Paramètres pour créer des fiches (elles sont écrites en votre nom sur le NexusMDT).");
    if (!a.title.trim()) throw new ConvexError("L'objet de la déposition est requis.");
    const cx = await ctx.runQuery(internal.nexusSync._depositionPushCtx, { citizenId: a.citizenId, agentIds: a.agentIds });
    if (!cx?.citoyen?.nexusId) throw new ConvexError("Ce citoyen n'existe pas encore côté NexusMDT (resync nécessaire).");

    const t0 = Date.now();
    const { date } = nowParis();
    const payload = {
      entity: "lspd",
      citoyen: { id: cx.citoyen.nexusId, nom: cx.citoyen.nom, prenom: cx.citoyen.prenom },
      date, officiers: nexusOfficiers(cx.officiers), objet: a.title.trim(), corps: a.body,
    };
    let res: Response;
    try {
      res = await nexusFetch(ctx, agentId, cred, `/api/depositions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } catch (e) {
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "deposition", op: "POST", ok: false, durationMs: Date.now() - t0, agentId, error: e instanceof Error ? e.message : String(e) });
      throw new ConvexError("NexusMDT injoignable, déposition non créée.");
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "deposition", op: "POST", ok: false, httpStatus: res.status, durationMs: Date.now() - t0, agentId, error: txt.slice(0, 160) });
      throw new ConvexError(`Création côté NexusMDT échouée (HTTP ${res.status}). ${txt.slice(0, 120)}`);
    }
    const j: any = await res.json();
    const created = j.deposition ?? j.data ?? j;
    const id = await ctx.runMutation(internal.nexusSync._insertDepositionFromWrite, {
      citizenId: a.citizenId, title: a.title.trim(), body: a.body, officiers: cx.officiers,
      createdBy: agentId, nexusId: String(created._id), numero: typeof created.numero === "number" ? created.numero : undefined,
    });
    await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "deposition", op: "POST", ok: true, httpStatus: res.status, durationMs: Date.now() - t0, agentId, detail: `${a.title.trim()} · Nexus n°${created?.numero ?? "?"} · local ${id}` });
    return id;
  },
});

export const updateDeposition = action({
  args: { id: v.id("depositions"), title: v.string(), body: v.string(), agentIds: v.array(v.id("agents")) },
  handler: async (ctx, a): Promise<void> => {
    const agentId = await ctx.runQuery(api.nexusSync.myAgentId, {});
    if (!agentId) throw new ConvexError("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    const info = await ctx.runQuery(internal.nexusSync._depositionNexusId, { id: a.id });
    const citizenId = await ctx.runQuery(internal.nexusSync._depositionCitizen, { id: a.id });
    if (!citizenId) throw new ConvexError("Déposition introuvable.");
    const cx = await ctx.runQuery(internal.nexusSync._depositionPushCtx, { citizenId, agentIds: a.agentIds });
    const local = { id: a.id, title: a.title.trim(), body: a.body, officiers: cx.officiers };

    if (!cred || !info?.nexusId) { await ctx.runMutation(internal.nexusSync._applyDepositionLocal, local); return; }

    const t0 = Date.now();
    const payload = { entity: "lspd", objet: a.title.trim(), corps: a.body, officiers: nexusOfficiers(cx.officiers) };
    const res = await nexusFetch(ctx, agentId, cred, `/api/depositions/${info.nexusId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "deposition", op: "PATCH", ok: false, httpStatus: res.status, durationMs: Date.now() - t0, agentId, error: txt.slice(0, 160) });
      throw new ConvexError(`Édition côté NexusMDT échouée (HTTP ${res.status}). Modification non enregistrée.`);
    }
    await ctx.runMutation(internal.nexusSync._applyDepositionLocal, local);
    await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "deposition", op: "PATCH", ok: true, httpStatus: res.status, durationMs: Date.now() - t0, agentId, detail: a.title.trim() });
  },
});
export const _depositionCitizen = internalQuery({
  args: { id: v.id("depositions") },
  handler: async (ctx, { id }): Promise<Id<"citizens"> | null> => { const d = await ctx.db.get(id); return d ? d.citizenId : null; },
});

// ============================================================================
// Armes & Véhicules — write-through (POST/PUT). Même invariant : si l'écriture
// Nexus échoue, RIEN localement. DELETE via deleteRecord (kinds arme/vehicule).
// ============================================================================
const WEAPON_STATUS = v.union(v.literal("ACTIVE"), v.literal("ENREGISTREE"), v.literal("SAISIE"), v.literal("DETRUITE"));
// Statut local -> libellé Nexus (français). ACTIVE = état neutre « Enregistrée ».
function weaponStatutLabel(s: string): string {
  return s === "SAISIE" ? "Saisie" : s === "DETRUITE" ? "Détruite" : "Enregistrée";
}
// "DD/MM HH:MM" en heure de Paris (format dateEnregistrement Nexus).
function nowWeaponDate(): string {
  const dtf = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date())) p[part.type] = part.value;
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

export const _citizenNexusRef = internalQuery({
  args: { citizenId: v.optional(v.id("citizens")) },
  handler: async (ctx, { citizenId }) => {
    if (!citizenId) return null;
    const c = await ctx.db.get(citizenId);
    return c ? { nexusId: c.nexusId ?? null, nom: `${c.prenom} ${c.nom}`.trim() } : null;
  },
});
export const _weaponNexus = internalQuery({
  args: { id: v.id("weapons") },
  handler: async (ctx, { id }) => { const w = await ctx.db.get(id); return w ? { nexusId: w.nexusId ?? null } : null; },
});
export const _weaponTypeName = internalQuery({
  args: { typeId: v.optional(v.id("weaponTypes")) },
  handler: async (ctx, { typeId }) => { if (!typeId) return null; const t = await ctx.db.get(typeId); return t?.name ?? null; },
});
export const _insertWeaponFromWrite = internalMutation({
  args: {
    typeId: v.optional(v.id("weaponTypes")), typeName: v.optional(v.string()),
    modele: v.string(), serial: v.string(), motif: v.optional(v.string()), origine: v.optional(v.string()),
    ownerId: v.optional(v.id("citizens")), status: WEAPON_STATUS,
    createdBy: v.id("agents"), nexusId: v.string(),
  },
  handler: async (ctx, a): Promise<Id<"weapons">> => {
    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return await ctx.db.insert("weapons", {
      typeId: a.typeId, typeName: a.typeName ?? undefined,
      modele: a.modele, serial: a.serial, motif: a.motif, origine: a.origine, ownerId: a.ownerId,
      status: a.status, at: Date.now(), createdBy: a.createdBy, nexusId: a.nexusId,
      searchText: norm(`${a.typeName ?? ""} ${a.modele} ${a.serial}`),
    });
  },
});

function weaponPayload(a: { modele: string; serial: string; motif?: string; origine?: string; status: string }, owner: { nexusId: string | null; nom: string } | null) {
  return {
    entity: "lspd", dateEnregistrement: nowWeaponDate(),
    origine: a.origine ?? "", modele: a.modele, numeroSerie: a.serial, motifs: a.motif ?? "",
    utiliseDelit: false, statut: weaponStatutLabel(a.status),
    citoyenLie: owner?.nexusId ? { id: owner.nexusId, nom: owner.nom } : null,
  };
}

export const createWeapon = action({
  args: {
    typeId: v.optional(v.id("weaponTypes")), modele: v.string(), serial: v.string(),
    motif: v.optional(v.string()), origine: v.optional(v.string()), ownerId: v.optional(v.id("citizens")), status: WEAPON_STATUS,
  },
  handler: async (ctx, a): Promise<Id<"weapons">> => {
    const agentId = await ctx.runQuery(api.nexusSync.myAgentId, {});
    if (!agentId) throw new ConvexError("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    if (!cred) throw new ConvexError("Compte NexusMDT non lié : reliez-le dans Mon profil > Paramètres pour créer des fiches (elles sont écrites en votre nom sur le NexusMDT).");
    const owner = await ctx.runQuery(internal.nexusSync._citizenNexusRef, { citizenId: a.ownerId });
    const typeName = await ctx.runQuery(internal.nexusSync._weaponTypeName, { typeId: a.typeId });
    const t0 = Date.now();
    let res: Response;
    try {
      res = await nexusFetch(ctx, agentId, cred, `/api/armes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(weaponPayload(a, owner)) });
    } catch (e) {
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "arme", op: "POST", ok: false, durationMs: Date.now() - t0, agentId, error: e instanceof Error ? e.message : String(e) });
      throw new ConvexError("NexusMDT injoignable, arme non créée.");
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "arme", op: "POST", ok: false, httpStatus: res.status, durationMs: Date.now() - t0, agentId, error: txt.slice(0, 160) });
      throw new ConvexError(`Création côté NexusMDT échouée (HTTP ${res.status}). ${txt.slice(0, 120)}`);
    }
    const j: any = await res.json();
    const created = j.arme ?? j.data ?? j;
    const id = await ctx.runMutation(internal.nexusSync._insertWeaponFromWrite, {
      typeId: a.typeId, typeName: typeName ?? undefined, modele: a.modele, serial: a.serial,
      motif: a.motif, origine: a.origine, ownerId: a.ownerId, status: a.status, createdBy: agentId, nexusId: String(created._id),
    });
    await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "arme", op: "POST", ok: true, httpStatus: res.status, durationMs: Date.now() - t0, agentId, detail: `${a.modele} ${a.serial} · local ${id}` });
    return id;
  },
});

export const updateWeapon = action({
  args: {
    id: v.id("weapons"), typeId: v.optional(v.id("weaponTypes")), modele: v.string(), serial: v.string(),
    motif: v.optional(v.string()), origine: v.optional(v.string()), ownerId: v.optional(v.id("citizens")), status: WEAPON_STATUS,
  },
  handler: async (ctx, a): Promise<void> => {
    const agentId = await ctx.runQuery(api.nexusSync.myAgentId, {});
    if (!agentId) throw new ConvexError("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    const info = await ctx.runQuery(internal.nexusSync._weaponNexus, { id: a.id });
    const owner = await ctx.runQuery(internal.nexusSync._citizenNexusRef, { citizenId: a.ownerId });
    const { id, ...fields } = a;

    if (!cred || !info?.nexusId) { await ctx.runMutation(api.weapons.update, { id, ...fields }); return; }

    const t0 = Date.now();
    const res = await nexusFetch(ctx, agentId, cred, `/api/armes/${info.nexusId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(weaponPayload(a, owner)) });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "arme", op: "PUT", ok: false, httpStatus: res.status, durationMs: Date.now() - t0, agentId, error: txt.slice(0, 160) });
      throw new ConvexError(`Édition côté NexusMDT échouée (HTTP ${res.status}). Modification non enregistrée.`);
    }
    await ctx.runMutation(api.weapons.update, { id, ...fields });
    await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "arme", op: "PUT", ok: true, httpStatus: res.status, durationMs: Date.now() - t0, agentId, detail: `${a.modele} ${a.serial}` });
  },
});

// ---------------------- Véhicules ----------------------
export const _vehicleNexus = internalQuery({
  args: { id: v.id("vehicles") },
  handler: async (ctx, { id }) => { const w = await ctx.db.get(id); return w ? { nexusId: w.nexusId ?? null } : null; },
});
export const _stampVehicleNexus = internalMutation({
  args: { id: v.id("vehicles"), nexusId: v.string() },
  handler: async (ctx, { id, nexusId }) => { await ctx.db.patch(id, { nexusId }); },
});

function vehiclePayload(a: { plaque: string; modele?: string; couleur?: string; type?: string; notes?: string }, statut: string | undefined, owner: { nexusId: string | null; nom: string } | null) {
  return {
    entity: "lspd", plaque: a.plaque.trim().toUpperCase(), categorie: a.type ?? "",
    modele: a.modele ?? "", couleur: a.couleur ?? "", statut: statut ?? "", notes: a.notes ?? "",
    proprietaire: owner?.nexusId ? { id: owner.nexusId, nom: owner.nom } : null,
  };
}

export const createVehicle = action({
  args: {
    plaque: v.string(), modele: v.optional(v.string()), couleur: v.optional(v.string()),
    type: v.optional(v.string()), ownerId: v.id("citizens"), notes: v.optional(v.string()), photoUrl: v.optional(v.string()),
  },
  handler: async (ctx, a): Promise<Id<"vehicles">> => {
    const agentId = await ctx.runQuery(api.nexusSync.myAgentId, {});
    if (!agentId) throw new ConvexError("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    if (!cred) throw new ConvexError("Compte NexusMDT non lié : reliez-le dans Mon profil > Paramètres pour créer des fiches (elles sont écrites en votre nom sur le NexusMDT).");
    const owner = await ctx.runQuery(internal.nexusSync._citizenNexusRef, { citizenId: a.ownerId });
    const t0 = Date.now();
    let res: Response;
    try {
      res = await nexusFetch(ctx, agentId, cred, `/api/vehicules`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vehiclePayload(a, undefined, owner)) });
    } catch (e) {
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "vehicule", op: "POST", ok: false, durationMs: Date.now() - t0, agentId, error: e instanceof Error ? e.message : String(e) });
      throw new ConvexError("NexusMDT injoignable, véhicule non créé.");
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "vehicule", op: "POST", ok: false, httpStatus: res.status, durationMs: Date.now() - t0, agentId, error: txt.slice(0, 160) });
      throw new ConvexError(`Création côté NexusMDT échouée (HTTP ${res.status}). ${txt.slice(0, 120)}`);
    }
    const j: any = await res.json();
    const created = j.vehicule ?? j.data ?? j;
    // Création locale (dédup par plaque) puis tamponnage du nexusId.
    const id = await ctx.runMutation(api.vehicles.create, { plaque: a.plaque, modele: a.modele, couleur: a.couleur, type: a.type, ownerId: a.ownerId, notes: a.notes, photoUrl: a.photoUrl });
    if (created?._id) await ctx.runMutation(internal.nexusSync._stampVehicleNexus, { id, nexusId: String(created._id) });
    await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "vehicule", op: "POST", ok: true, httpStatus: res.status, durationMs: Date.now() - t0, agentId, detail: `${a.plaque} · local ${id}` });
    return id;
  },
});

export const updateVehicle = action({
  args: {
    id: v.id("vehicles"), plaque: v.string(), modele: v.optional(v.string()), couleur: v.optional(v.string()),
    type: v.optional(v.string()), ownerId: v.optional(v.id("citizens")), notes: v.optional(v.string()), photoUrl: v.optional(v.string()),
  },
  handler: async (ctx, a): Promise<void> => {
    const agentId = await ctx.runQuery(api.nexusSync.myAgentId, {});
    if (!agentId) throw new ConvexError("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    const info = await ctx.runQuery(internal.nexusSync._vehicleNexus, { id: a.id });
    const owner = await ctx.runQuery(internal.nexusSync._citizenNexusRef, { citizenId: a.ownerId });
    const { id, ...fields } = a;

    if (!cred || !info?.nexusId) { await ctx.runMutation(api.vehicles.update, { id, ...fields }); return; }

    const t0 = Date.now();
    const res = await nexusFetch(ctx, agentId, cred, `/api/vehicules/${info.nexusId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vehiclePayload(a, undefined, owner)) });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "vehicule", op: "PUT", ok: false, httpStatus: res.status, durationMs: Date.now() - t0, agentId, error: txt.slice(0, 160) });
      throw new ConvexError(`Édition côté NexusMDT échouée (HTTP ${res.status}). Modification non enregistrée.`);
    }
    await ctx.runMutation(api.vehicles.update, { id, ...fields });
    await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "vehicule", op: "PUT", ok: true, httpStatus: res.status, durationMs: Date.now() - t0, agentId, detail: a.plaque });
  },
});
