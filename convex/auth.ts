import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import type { GenericMutationCtx, AnyDataModel } from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel";

// Auth par identifiant + mot de passe (Convex Auth).
// L'identifiant de connexion "prenom.nom" est passé dans le champ `email` (juste une chaîne unique).
// NOTE Phase 1 : la gestion des collisions "prenom.nom" (désambiguïsation au login, §6) est une
// évolution prévue - pour l'instant l'identifiant est unique. Le profil agent (statut PENDING) et la
// consommation du code d'invitation se font via la mutation `agents.completeRegistration` appelée
// juste après l'inscription (voir convex/agents.ts).
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        return {
          email: params.email as string, // = login "prenom.nom"
          name: (params.name as string) ?? "",
        };
      },
    }),
  ],

  // Anti-force brute. L'identifiant étant devinable (« prenom.nom »), c'est la
  // seule barrière entre un attaquant et un mot de passe faible. Le défaut de
  // la bibliothèque est de 10 essais par heure ; 5 laisse la même marge à un
  // agent qui se trompe, tout en divisant par deux le débit d'une attaque.
  signIn: { maxFailedAttempsPerHour: 5 },

  callbacks: {
    // Dernier verrou avant l'ouverture d'une session. Un mot de passe correct
    // ne suffit pas : le compte doit encore être en état de servir. Cela
    // couvre le cas d'un agent viré dont les identifiants restent valides.
    async beforeSessionCreation(ctx: GenericMutationCtx<AnyDataModel>, { userId }: { userId: Id<"users"> }) {
      // Le callback reçoit un contexte non typé (AnyDataModel) : on rétablit
      // le typage du schéma pour interroger la table des agents.
      const db = (ctx as unknown as GenericMutationCtx<DataModel>).db;
      const agent = await db
        .query("agents")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();

      // Pas encore de profil : inscription en cours, on laisse passer.
      if (!agent) return;

      if (agent.status === "INACTIVE" || agent.status === "SUSPENDED") {
        throw new Error("Ce compte a été désactivé. Contactez l'État-Major.");
      }
      if (typeof agent.lockedUntil === "number" && agent.lockedUntil > Date.now()) {
        const until = new Date(agent.lockedUntil).toLocaleString("fr-FR");
        throw new Error(`Compte verrouillé jusqu'au ${until}.`);
      }
    },
  },
});
