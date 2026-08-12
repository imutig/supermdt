import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Verrou d'accès aux portails (MDT et LSPA), en amont de toute connexion.
//
// Les codes vivent dans les variables d'environnement Convex MDT_ACCESS_CODE et
// LSPA_ACCESS_CODE, jamais dans le bundle : une variable VITE_* serait lisible
// par quiconque ouvre les sources de la page. La vérification se fait donc côté
// serveur.
//
// Portée de ces verrous : c'est un rideau, pas une serrure. Il empêche de tomber
// sur un portail en arrivant sur le site ; il ne remplace pas l'authentification,
// qui reste le seul contrôle sur les données. Une fois le code validé, le
// déverrouillage est retenu par le navigateur et un utilisateur déterminé peut
// le forger : rien de sensible ne doit dépendre de ce seul verrou.
//
// Chaque portail a son propre code, indépendant. Sans code configuré pour un
// portail, il reste ouvert (comportement prévisible, évite de s'enfermer dehors).

const UNLOCK_DAYS = 7;
const PORTAL = v.union(v.literal("mdt"), v.literal("lspa"));

function accessCode(which: "mdt" | "lspa"): string {
  return ((which === "lspa" ? process.env.LSPA_ACCESS_CODE : process.env.MDT_ACCESS_CODE) ?? "").trim();
}

// Comparaison à durée constante : une comparaison naïve s'arrête au premier
// caractère différent et laisse mesurer le préfixe correct.
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Quels portails sont protégés ? Aucune information sur les codes eux-mêmes.
export const status = query({
  args: {},
  handler: async () => ({
    mdtLocked: accessCode("mdt").length > 0,
    lspaLocked: accessCode("lspa").length > 0,
  }),
});

export const unlock = mutation({
  args: { code: v.string(), portal: v.optional(PORTAL) },
  handler: async (_ctx, { code, portal }) => {
    const expected = accessCode(portal ?? "mdt");
    if (!expected) return { ok: true as const, expiresAt: null };
    if (!sameSecret(code.trim(), expected)) throw new Error("Code d'accès incorrect.");
    return { ok: true as const, expiresAt: Date.now() + UNLOCK_DAYS * 24 * 3600 * 1000 };
  },
});
