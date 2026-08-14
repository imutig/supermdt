import { ProsemirrorSync } from "@convex-dev/prosemirror-sync";
import { ConvexError } from "convex/values";
import { components } from "./_generated/api";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAgent, requirePermission } from "./rbac";

const prosemirrorSync = new ProsemirrorSync(components.prosemirrorSync);

// API de synchronisation collaborative (éditeur de rapports). Le docId de synchro
// EST l'id du rapport (cf. RapportEditor : docId={reportId}). On exige donc un
// agent + la permission rapports adéquate, et on refuse un rapport supprimé.
// Sans ce contrôle, tout compte authentifié pourrait lire/écrire n'importe quel
// rapport en devinant son id (IDOR).
async function assertReportAccess(ctx: QueryCtx, id: string, write: boolean) {
  const agent = await requireAgent(ctx);
  await requirePermission(ctx, agent, write ? "rapports.contribute" : "rapports.view");
  const report = await ctx.db.get(id as Id<"reports">);
  if (report && report.deletedAt) throw new ConvexError("Rapport indisponible.");
}

export const { getSnapshot, submitSnapshot, latestVersion, getSteps, submitSteps } =
  prosemirrorSync.syncApi({
    // Le ctx des callbacks est typé génériquement par la lib : c'est bien notre
    // ctx à l'exécution, on rétablit donc le typage du schéma.
    checkRead: async (ctx, id) => { await assertReportAccess(ctx as unknown as QueryCtx, id, false); },
    checkWrite: async (ctx, id) => { await assertReportAccess(ctx as unknown as QueryCtx, id, true); },
  });
