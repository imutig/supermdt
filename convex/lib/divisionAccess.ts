import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { can } from "../rbac";

// Accès aux espaces de division, partagé entre divisionSpace.ts et les modules
// spécifiques (detective.ts…). Deux couches : permissions internes COMMUNES à
// toutes les divisions, et permissions apportées par les MODULES activés.

// Permissions internes communes. Le Lead les a toutes.
export const DIVISION_PERMS: { slug: string; label: string }[] = [
  { slug: "members", label: "Gérer les membres et leurs grades" },
  { slug: "ranks", label: "Gérer les grades internes" },
  { slug: "announcements", label: "Publier et gérer les annonces" },
  { slug: "chat", label: "Modérer le chat (supprimer les messages)" },
  { slug: "config", label: "Éditer la présentation de la division" },
];

// Modules spécifiques : chacun ajoute son propre catalogue de permissions internes,
// visibles uniquement pour les divisions qui l'ont activé.
export const DIVISION_MODULES: { slug: string; label: string; perms: { slug: string; label: string }[] }[] = [
  {
    slug: "detective",
    label: "Detective Bureau",
    perms: [
      { slug: "db.view", label: "Accéder à l'espace Detective Bureau" },
      { slug: "db.cases", label: "Créer et éditer les enquêtes et leurs pièces" },
      { slug: "db.registry", label: "Gérer le registre des personnes" },
      { slug: "db.gangs", label: "Gérer les gangs, organisations et territoires" },
      { slug: "db.drugs", label: "Gérer la section stupéfiants" },
      { slug: "db.surveillance", label: "Gérer le journal de surveillance" },
      { slug: "db.delete", label: "Supprimer des enquêtes et éléments" },
      { slug: "db.sensitive", label: "Accéder aux éléments sensibles / confidentiels" },
    ],
  },
];

export function modulePermsOf(division: Doc<"divisions">): { slug: string; label: string }[] {
  const active = new Set(division.modules ?? []);
  return DIVISION_MODULES.filter((m) => active.has(m.slug)).flatMap((m) => m.perms);
}

// Catalogue complet des permissions internes proposées pour cette division
// (communes + modules actifs) - utilisé par l'éditeur de grades internes.
export function permCatalogFor(division: Doc<"divisions">): { slug: string; label: string }[] {
  return [...DIVISION_PERMS, ...modulePermsOf(division)];
}

export function hasModule(division: Doc<"divisions">, slug: string): boolean {
  return (division.modules ?? []).includes(slug);
}

export async function loadDivision(ctx: QueryCtx | MutationCtx, divisionId: Id<"divisions">) {
  const d = await ctx.db.get(divisionId);
  if (!d) throw new Error("Division introuvable.");
  return d;
}

export async function membershipOf(ctx: QueryCtx | MutationCtx, agentId: Id<"agents">, divisionId: Id<"divisions">) {
  return (await ctx.db.query("agentDivisions").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect())
    .find((l) => l.divisionId === divisionId) ?? null;
}

export function isLeadOf(agent: Doc<"agents">, division: Doc<"divisions">) {
  return agent.isOwner || division.leadAgentId === agent._id;
}

// Permissions internes effectives de l'agent dans cette division. Le Lead a tout
// (communes + modules actifs).
export async function permsOf(ctx: QueryCtx | MutationCtx, agent: Doc<"agents">, division: Doc<"divisions">): Promise<Set<string>> {
  if (isLeadOf(agent, division)) return new Set(permCatalogFor(division).map((p) => p.slug));
  const m = await membershipOf(ctx, agent._id, division._id);
  if (!m || !m.rankId) return new Set();
  const rows = await ctx.db.query("divisionRankPermissions").withIndex("by_rank", (q) => q.eq("rankId", m.rankId!)).collect();
  return new Set(rows.map((r) => r.perm));
}

// Membre de la division (ou owner) : requis pour consulter l'espace.
export async function assertMember(ctx: QueryCtx | MutationCtx, agent: Doc<"agents">, division: Doc<"divisions">) {
  if (agent.isOwner) return;
  if (!(await membershipOf(ctx, agent._id, division._id))) throw new Error("Vous ne faites pas partie de cette division.");
}

export async function hasPerm(ctx: QueryCtx | MutationCtx, agent: Doc<"agents">, division: Doc<"divisions">, slug: string): Promise<boolean> {
  if (isLeadOf(agent, division)) return true;
  return (await permsOf(ctx, agent, division)).has(slug);
}

export async function assertPerm(ctx: QueryCtx | MutationCtx, agent: Doc<"agents">, division: Doc<"divisions">, slug: string) {
  if (await hasPerm(ctx, agent, division, slug)) return;
  throw new Error("Action non autorisée dans cette division.");
}

// Désigner le Lead / gérer les divisions / activer les modules : droit global.
export async function assertGlobalManage(ctx: QueryCtx | MutationCtx, agent: Doc<"agents">) {
  if (agent.isOwner || (await can(ctx, agent, "rbac.manage"))) return;
  throw new Error("Réservé à l'administration.");
}
