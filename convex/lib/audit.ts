import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { snapshotActor } from "../rbac";

// Journalisation EXHAUSTIVE (§11). Toute mutation métier appelle writeAudit après son travail.
// (Un wrapper `auditedMutation` pourra être ajouté ensuite via convex-helpers ; ce helper suffit et
//  garde le contrôle explicite sur before/after.)
export async function writeAudit(
  ctx: MutationCtx,
  actor: Doc<"agents"> | null,
  entry: {
    action: string;
    resourceType: string;
    resourceId?: string;
    resourceLabel?: string;
    before?: unknown;
    after?: unknown;
    metadata?: unknown;
  },
) {
  await ctx.db.insert("auditLog", {
    at: Date.now(),
    actorId: actor?._id,
    actorSnapshot: actor ? await snapshotActor(ctx, actor) : undefined,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    resourceLabel: entry.resourceLabel,
    before: entry.before,
    after: entry.after,
    metadata: entry.metadata,
  });
}

// Journalisation des lectures sensibles (§11.3).
export async function logAccess(
  ctx: MutationCtx,
  actor: Doc<"agents">,
  entry: {
    kind: "SEARCH" | "LOOKUP" | "EXPORT";
    query?: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: unknown;
  },
) {
  await ctx.db.insert("accessLog", {
    at: Date.now(),
    actorId: actor._id,
    ...entry,
  });
}
