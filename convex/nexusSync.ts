import { action, mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";
import { getCurrentAgent, requireAgent } from "./rbac";
import { nexusLogin, encryptSecret, decryptSecret } from "./lib/nexusAuth";

// ============================================================================
// Write-through Nexus — Phase 1 : coffre d'identifiants par agent.
// Chaque agent qui veut « utiliser SuperMDT comme MDT principal » enregistre ses
// identifiants Nexus (email + mot de passe DÉDIÉ). On teste le login, on chiffre
// le mot de passe au repos, et on s'en servira pour poster en son nom.
// ============================================================================

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
