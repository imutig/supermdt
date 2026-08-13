import { action, mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getCurrentAgent, requireAgent, requirePermission, agentLabel } from "./rbac";
import { nexusLogin, encryptSecret, decryptSecret } from "./lib/nexusAuth";
import { mapCitizen } from "./migration";

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

// Lecture interne du secret chiffré (pour login à la demande).
export const _credFor = internalQuery({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const row = await ctx.db.query("nexusCredentials").withIndex("by_agent", (q) => q.eq("agentId", agentId)).unique();
    return row ? { email: row.email, secretEnc: row.secretEnc } : null;
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
      importRef: c.importRef, groupeSanguin: c.groupeSanguin, allergies: c.allergies,
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

    const password = await decryptSecret(cred.secretEnc);
    const token = await nexusLogin(cred.email, password);
    const payload: Record<string, unknown> = {
      entity: "lspd",
      prenom: a.prenom.trim(), nom: a.nom.trim(),
      dateNaissance: a.dateNaissance ?? "", lieuNaissance: a.lieuNaissance ?? "",
      sexe: a.sexe === "H" ? "Homme" : a.sexe === "F" ? "Femme" : (a.sexe ?? ""),
      telephone: a.telephone ?? "", email: a.email ?? "", adresse: a.adresse ?? "",
      ethnie: a.ethnie ?? "", couleurCheveux: a.cheveux ?? "", couleurYeux: a.yeux ?? "",
      taille: a.taille ?? "", poids: a.poids ?? "", appartenance: a.groupe ?? "", emploi: a.metier ?? "",
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
