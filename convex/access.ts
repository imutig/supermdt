import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Verrou d'accès au MDT, en amont de toute connexion.
//
// Le code vit dans la variable d'environnement Convex MDT_ACCESS_CODE, jamais
// dans le bundle : une variable VITE_* serait lisible par quiconque ouvre les
// sources de la page. La vérification se fait donc côté serveur.
//
// Portée de ce verrou : c'est un rideau, pas une serrure. Il empêche de tomber
// sur le MDT en arrivant sur le site ; il ne remplace pas l'authentification,
// qui reste le seul contrôle sur les données. Une fois le code validé, le
// déverrouillage est retenu par le navigateur et un utilisateur déterminé peut
// le forger : rien de sensible ne doit dépendre de ce seul verrou.
//
// Le portail LSPA n'est jamais concerné : il reste ouvert.

const UNLOCK_DAYS = 7;

function accessCode(): string {
  return (process.env.MDT_ACCESS_CODE ?? "").trim();
}

// Comparaison à durée constante : une comparaison naïve s'arrête au premier
// caractère différent et laisse mesurer le préfixe correct.
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Le MDT est-il protégé ? Aucune information sur le code lui-même n'est
// renvoyée. Sans code configuré, pas de verrou : c'est le comportement le plus
// prévisible, et il évite de s'enfermer dehors sur un déploiement neuf.
export const status = query({
  args: {},
  handler: async () => ({ mdtLocked: accessCode().length > 0 }),
});

export const unlock = mutation({
  args: { code: v.string() },
  handler: async (_ctx, { code }) => {
    const expected = accessCode();
    if (!expected) return { ok: true as const, expiresAt: null };
    if (!sameSecret(code.trim(), expected)) throw new Error("Code d'accès incorrect.");
    return { ok: true as const, expiresAt: Date.now() + UNLOCK_DAYS * 24 * 3600 * 1000 };
  },
});
