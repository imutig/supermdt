"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { modifyAccountCredentials, invalidateSessions, retrieveAccount } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";

// Gestion des comptes : réinitialisation par l'État-Major et changement par
// l'agent. Ces opérations touchent le secret stocké par Convex Auth, ce qui
// n'est possible que depuis une action (d'où ce fichier séparé des mutations).

// Mot de passe temporaire lisible à dicter en jeu : pas d'ambiguïté visuelle
// (ni O/0 ni I/l), assez long pour ne pas être devinable.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function tempPassword() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const body = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${body.slice(0, 5)}-${body.slice(5)}`;
}

// Réinitialisation par un gradé. Retourne le mot de passe temporaire UNE fois :
// il n'est stocké nulle part en clair, seul le hash de Convex Auth est conservé.
export const resetPassword = action({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }): Promise<string> => {
    const target: { login: string; userId: Id<"users">; label: string } =
      await ctx.runMutation(internal.agents.prepareReset, { agentId });

    const password = tempPassword();
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: target.login, secret: password },
    });
    // Les sessions ouvertes deviennent caduques : un compte réinitialisé ne
    // doit pas rester utilisable sur une machine déjà connectée.
    await invalidateSessions(ctx, { userId: target.userId });
    return password;
  },
});

// Changement par l'agent lui-même (écran imposé après une réinitialisation).
export const changeMyPassword = action({
  args: { current: v.string(), next: v.string() },
  handler: async (ctx, { current, next }): Promise<null> => {
    if (next.length < 8) throw new Error("Le nouveau mot de passe doit faire au moins 8 caractères.");
    if (next === current) throw new Error("Le nouveau mot de passe doit être différent de l'ancien.");

    const me: { login: string } = await ctx.runMutation(internal.agents.prepareSelfChange, {});
    // retrieveAccount valide le secret fourni : c'est notre contrôle du mot de
    // passe actuel, sans jamais le comparer nous-mêmes.
    try {
      await retrieveAccount(ctx, { provider: "password", account: { id: me.login, secret: current } });
    } catch {
      throw new Error("Mot de passe actuel incorrect.");
    }

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: me.login, secret: next },
    });
    await ctx.runMutation(internal.agents.clearMustChange, {});
    return null;
  },
});
