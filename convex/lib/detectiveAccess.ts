import type { QueryCtx, MutationCtx } from "../_generated/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { requireAgent } from "../rbac";
import { loadDivision, assertMember, hasPerm, assertPerm, hasModule } from "./divisionAccess";

// Accès partagé du Detective Bureau (voir SPEC-DETECTIVE-BUREAU.md), réutilisé par
// tous les modules detective*.ts. L'accès repose sur les permissions INTERNES de
// division : db.view / db.cases / db.registry / db.gangs / db.drugs /
// db.surveillance / db.delete / db.sensitive.

export const agentName = (a: Doc<"agents">) => `${a.prenomRP} ${a.nomRP}`;

// Accès à l'espace DB d'une division : membre + module actif + db.view.
export async function requireDivView(ctx: QueryCtx | MutationCtx, divisionId: Id<"divisions">) {
  const agent = await requireAgent(ctx);
  const division = await loadDivision(ctx, divisionId);
  if (!hasModule(division, "detective")) throw new ConvexError("Module Detective Bureau non activé.");
  await assertMember(ctx, agent, division);
  if (!(await hasPerm(ctx, agent, division, "db.view"))) throw new ConvexError("Accès au Detective Bureau refusé.");
  return { agent, division };
}

// Accès en écriture avec une permission précise.
export async function requireDivPerm(ctx: MutationCtx, divisionId: Id<"divisions">, slug: string) {
  const { agent, division } = await requireDivView(ctx, divisionId);
  await assertPerm(ctx, agent, division, slug);
  return { agent, division };
}

export async function loadCase(ctx: QueryCtx | MutationCtx, caseId: Id<"dbCases">) {
  const c = await ctx.db.get(caseId);
  if (!c || c.deletedAt) throw new ConvexError("Enquête introuvable.");
  return c;
}

// Consultation d'une enquête : accès DB + confidentialité (db.sensitive).
export async function requireCaseRead(ctx: QueryCtx | MutationCtx, caseId: Id<"dbCases">) {
  const c = await loadCase(ctx, caseId);
  const { agent, division } = await requireDivView(ctx, c.divisionId);
  if (c.confidential && !(await hasPerm(ctx, agent, division, "db.sensitive"))) {
    throw new ConvexError("Enquête confidentielle : accès restreint.");
  }
  return { agent, division, case: c };
}

export async function requireCaseWrite(ctx: MutationCtx, caseId: Id<"dbCases">) {
  const { agent, division, case: c } = await requireCaseRead(ctx, caseId);
  await assertPerm(ctx, agent, division, "db.cases");
  return { agent, division, case: c };
}

export async function addTimeline(ctx: MutationCtx, caseId: Id<"dbCases">, agent: Doc<"agents">, label: string, type: "event" | "auto" = "auto", body?: string) {
  await ctx.db.insert("dbTimeline", { caseId, at: Date.now(), type, label, body, authorId: agent._id, authorName: agentName(agent) });
}

export async function notify(ctx: MutationCtx, divisionId: Id<"divisions">, agentId: Id<"agents">, type: string, text: string, caseId?: Id<"dbCases">) {
  await ctx.db.insert("dbNotifications", { divisionId, agentId, type, text, caseId, read: false, at: Date.now() });
}
