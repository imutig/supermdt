import { ProsemirrorSync } from "@convex-dev/prosemirror-sync";
import { getAuthUserId } from "@convex-dev/auth/server";
import { components } from "./_generated/api";

const prosemirrorSync = new ProsemirrorSync(components.prosemirrorSync);

// API de synchronisation collaborative (éditeur de rapports).
// On exige un utilisateur authentifié pour lire/écrire un document.
export const { getSnapshot, submitSnapshot, latestVersion, getSteps, submitSteps } =
  prosemirrorSync.syncApi({
    checkRead: async (ctx) => {
      if (!(await getAuthUserId(ctx))) throw new Error("Non authentifié.");
    },
    checkWrite: async (ctx) => {
      if (!(await getAuthUserId(ctx))) throw new Error("Non authentifié.");
    },
  });
