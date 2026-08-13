import { action, mutation, query, internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";
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
async function getToken(ctx: ActionCtx, agentId: Id<"agents">, cred: Cred): Promise<string> {
  if (cred.tokenCache && cred.tokenExpiry && cred.tokenExpiry > Date.now() + 60_000) return cred.tokenCache;
  const password = await decryptSecret(cred.secretEnc);
  const token = await nexusLogin(cred.email, password);
  const exp = jwtExp(token) ?? Date.now() + 50 * 60_000;
  await ctx.runMutation(internal.nexusSync._cacheToken, { agentId, token, expiry: exp });
  return token;
}

const BASE = "https://mdt.vizu-world.com";

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
    await ctx.db.insert("nexusSyncLog", { at: Date.now(), ...a });
    if (a.ok) return;
    // Alerte au 3e échec consécutif de la même direction (anti-spam : une seule
    // alerte non envoyée à la fois).
    const recent = await ctx.db.query("nexusSyncLog").withIndex("by_at").order("desc").take(6);
    let consec = 0;
    for (const r of recent) { if (r.direction !== a.direction) continue; if (!r.ok) consec++; else break; }
    if (consec === 3) {
      const pending = await ctx.db.query("nexusAlerts").withIndex("by_sent", (q) => q.eq("sent", false)).first();
      if (!pending) {
        await ctx.db.insert("nexusAlerts", {
          at: Date.now(),
          message: `⚠️ **Synchro NexusMDT** — ${consec} échecs consécutifs (${a.direction}).\nDernière erreur : ${a.error ?? a.httpStatus ?? "inconnue"}`,
          targetDiscordId: process.env.NEXUS_ALERT_DISCORD_ID || "263679048712978432",
          sent: false,
        });
      }
    }
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

// Enregistre (ou met à jour) les identifiants Nexus de l'agent courant :
// teste le login, chiffre le mot de passe, stocke. Ne renvoie jamais le secret.
export const saveCredential = action({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, { email, password }): Promise<{ ok: boolean; error: string | null }> => {
    const agentId = await ctx.runQuery(api.nexusSync.myAgentId, {});
    if (!agentId) throw new Error("Non authentifié.");
    const mail = email.trim();
    if (!mail || !password) throw new Error("Email et mot de passe requis.");

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
    if (!agentId) throw new Error("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    if (!cred) throw new Error("Aucun identifiant enregistré.");
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

export const _insertCitizenFromNexus = internalMutation({
  args: { raw: v.string(), createdBy: v.id("agents"), mugshotUrl: v.optional(v.string()) },
  handler: async (ctx, { raw, createdBy, mugshotUrl }): Promise<Id<"citizens">> => {
    const c = mapCitizen(JSON.parse(raw));
    if (c.importRef) {
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
    if (!agentId) throw new Error("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    if (!cred) throw new Error("Synchronisation Nexus non configurée (voir Mon profil).");

    const token = await getToken(ctx, agentId, cred);
    const payload: Record<string, unknown> = {
      entity: "lspd",
      prenom: a.prenom.trim(), nom: a.nom.trim(),
      dateNaissance: a.dateNaissance ?? "", lieuNaissance: a.lieuNaissance ?? "",
      sexe: a.sexe === "H" ? "Homme" : a.sexe === "F" ? "Femme" : (a.sexe ?? ""),
      telephone: a.telephone ?? "", email: a.email ?? "", adresse: a.adresse ?? "",
      ethnie: a.ethnie ?? "", couleurCheveux: a.cheveux ?? "", couleurYeux: a.yeux ?? "",
      taille: toNexusNum(a.taille), poids: toNexusNum(a.poids), appartenance: a.groupe ?? "", emploi: a.metier ?? "",
      photoUrl: a.mugshotUrl ?? "",
    };
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(`${BASE}/api/citoyens`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "citoyen", op: "POST", ok: false, durationMs: Date.now() - t0, agentId, error: e instanceof Error ? e.message : String(e) });
      throw new Error("NexusMDT injoignable, citoyen non créé.");
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "citoyen", op: "POST", ok: false, httpStatus: res.status, durationMs: Date.now() - t0, agentId, error: txt.slice(0, 160) });
      throw new Error(`Création côté NexusMDT échouée (HTTP ${res.status}). ${txt.slice(0, 120)}`);
    }
    const j: any = await res.json();
    const created = j.citoyen ?? j.data ?? j;
    const citizenId = await ctx.runMutation(internal.nexusSync._insertCitizenFromNexus, {
      raw: JSON.stringify(created), createdBy: agentId, mugshotUrl: a.mugshotUrl,
    });
    await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "citoyen", op: "POST", ok: true, httpStatus: res.status, durationMs: Date.now() - t0, agentId, detail: `${a.prenom} ${a.nom}` });
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
    if (!agentId) throw new Error("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    if (!cred) throw new Error("Synchronisation Nexus non configurée (voir Mon profil).");

    // 1) Création locale (calcul des amendes/charges par la logique existante).
    const citationId = await ctx.runMutation(api.citations.create, { citizenId: a.citizenId, vehicleId: a.vehicleId, charges: a.charges, notes: a.notes });
    const info = await ctx.runQuery(internal.nexusSync._citationForPush, { citationId });
    if (!info) { throw new Error("Contravention introuvable après création."); }
    if (!info.nexusId) {
      await ctx.runMutation(internal.nexusSync._rollbackCitation, { citationId });
      throw new Error("Ce citoyen n'existe pas encore côté NexusMDT (resync nécessaire).");
    }

    // 2) Push vers Nexus (rollback local si échec).
    const t0 = Date.now();
    try {
      const token = await getToken(ctx, agentId, cred);
      const { date, heure } = nowParis();
      const payload = {
        entity: "lspd", citoyen: { id: info.nexusId, nom: info.nom, prenom: info.prenom },
        objet: info.objet || "Contravention", montant: info.montant,
        statut: info.finePaid ? "Payée" : "En attente", recidive: info.recidive,
        dateInfraction: date, heureInfraction: heure,
        typeAmende: "Amende de police", categorieAmende: "Montant personnalisé",
      };
      const res = await fetch(`${BASE}/api/amendes`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        await ctx.runMutation(internal.nexusSync._rollbackCitation, { citationId });
        await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "amende", op: "POST", ok: false, httpStatus: res.status, durationMs: Date.now() - t0, agentId, error: txt.slice(0, 160) });
        throw new Error(`Émission côté NexusMDT échouée (HTTP ${res.status}). Contravention annulée.`);
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
      throw new Error("NexusMDT injoignable, contravention annulée.");
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
    if (!agentId) throw new Error("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    if (!cred) throw new Error("Synchronisation Nexus non configurée (voir Mon profil).");

    const entryId = await ctx.runMutation(api.casier.addEntry, a);
    const info = await ctx.runQuery(internal.nexusSync._casierForPush, { entryId });
    if (!info) throw new Error("Casier introuvable après création.");
    if (!info.nexusId) {
      await ctx.runMutation(internal.nexusSync._rollbackCasier, { entryId });
      throw new Error("Ce citoyen n'existe pas encore côté NexusMDT (resync nécessaire).");
    }

    const t0 = Date.now();
    try {
      const token = await getToken(ctx, agentId, cred);
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
      const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        await ctx.runMutation(internal.nexusSync._rollbackCasier, { entryId });
        await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity, op: "POST", ok: false, httpStatus: res.status, durationMs: Date.now() - t0, agentId, error: txt.slice(0, 160) });
        throw new Error(`Création côté NexusMDT échouée (HTTP ${res.status}). ${entity} annulé.`);
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
      throw new Error("NexusMDT injoignable, casier annulé.");
    }
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
export const _recordNexusInfo = internalQuery({
  args: { kind: v.union(v.literal("casier"), v.literal("amende")), localId: v.string() },
  handler: async (ctx, { kind, localId }) => {
    if (kind === "casier") {
      const e = await ctx.db.get(localId as Id<"casierEntries">);
      return e ? { nexusId: e.nexusId ?? null, arrestType: e.arrestType ?? "DOSSIER" } : null;
    }
    const c = await ctx.db.get(localId as Id<"citations">);
    return c ? { nexusId: c.nexusId ?? null, arrestType: null as string | null } : null;
  },
});

// Supprime un casier/contravention : d'abord sur Nexus (si synchronisé), puis en
// local. Si la suppression Nexus échoue, RIEN n'est supprimé localement.
export const deleteRecord = action({
  args: { kind: v.union(v.literal("casier"), v.literal("amende")), localId: v.string() },
  handler: async (ctx, { kind, localId }): Promise<{ synced: boolean }> => {
    const agentId = await ctx.runQuery(api.nexusSync.myAgentId, {});
    if (!agentId) throw new Error("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    const info = await ctx.runQuery(internal.nexusSync._recordNexusInfo, { kind, localId });

    const localRemove = async () => {
      if (kind === "casier") await ctx.runMutation(api.casier.remove, { entryId: localId as Id<"casierEntries"> });
      else await ctx.runMutation(api.citations.remove, { citationId: localId as Id<"citations"> });
    };

    // Non synchronisé (aucun compte lié ou fiche non liée à Nexus) : suppression locale simple.
    if (!cred || !info?.nexusId) { await localRemove(); return { synced: false }; }

    const t0 = Date.now();
    const token = await getToken(ctx, agentId, cred);
    const path = kind === "amende" ? "/api/amendes" : info.arrestType === "RAPPORT" ? "/api/rapports" : "/api/dossiers";
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}/${info.nexusId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    } catch (e) {
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: kind, op: "DELETE", ok: false, durationMs: Date.now() - t0, agentId, error: e instanceof Error ? e.message : String(e) });
      throw new Error("NexusMDT injoignable, suppression annulée.");
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: kind, op: "DELETE", ok: false, httpStatus: res.status, durationMs: Date.now() - t0, agentId, error: txt.slice(0, 160) });
      throw new Error(res.status === 403 ? "Ton compte NexusMDT n'a pas le droit de supprimer. Suppression annulée." : `Suppression côté NexusMDT échouée (HTTP ${res.status}).`);
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
  },
  handler: async (ctx, a): Promise<void> => {
    const agentId = await ctx.runQuery(api.nexusSync.myAgentId, {});
    if (!agentId) throw new Error("Non authentifié.");
    const cred = await ctx.runQuery(internal.nexusSync._credFor, { agentId });
    const citizen = await ctx.runQuery(internal.nexusSync._citizenNexus, { citizenId: a.citizenId });
    const { citizenId, ...fields } = a;

    // Non synchronisé : édition locale simple.
    if (!cred || !citizen?.nexusId) { await ctx.runMutation(api.citizens.update, { id: citizenId, ...fields }); return; }

    const t0 = Date.now();
    const token = await getToken(ctx, agentId, cred);
    const payload = {
      entity: "lspd", prenom: a.prenom.trim(), nom: a.nom.trim(),
      dateNaissance: a.dateNaissance ?? "", lieuNaissance: a.lieuNaissance ?? "",
      sexe: a.sexe === "H" ? "Homme" : a.sexe === "F" ? "Femme" : (a.sexe ?? ""),
      telephone: a.telephone ?? "", email: a.email ?? "", adresse: a.adresse ?? "",
      ethnie: a.ethnie ?? "", couleurCheveux: a.cheveux ?? "", couleurYeux: a.yeux ?? "",
      taille: toNexusNum(a.taille), poids: toNexusNum(a.poids), appartenance: a.groupe ?? "", emploi: a.metier ?? "",
    };
    const res = await fetch(`${BASE}/api/citoyens/${citizen.nexusId}`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "citoyen", op: "PUT", ok: false, httpStatus: res.status, durationMs: Date.now() - t0, agentId, error: txt.slice(0, 160) });
      throw new Error(`Édition côté NexusMDT échouée (HTTP ${res.status}). Modification non enregistrée.`);
    }
    await ctx.runMutation(api.citizens.update, { id: citizenId, ...fields });
    await ctx.runMutation(internal.nexusSync._log, { direction: "WRITE", entity: "citoyen", op: "PUT", ok: true, httpStatus: res.status, durationMs: Date.now() - t0, agentId, detail: `${a.prenom} ${a.nom}` });
  },
});
