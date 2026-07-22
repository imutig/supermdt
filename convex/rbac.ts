import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// ============ Catalogue des permissions (source de vérité - slugs FIXES) ============
// Seedé dans la table `permissions`. Voir §5.5 / §11.4 de PROJET-SAST-MDT.md.
export const PERMISSION_SLUGS: { slug: string; domain: string; description: string }[] = [
  // Effectif
  { slug: "effectif.view", domain: "effectif", description: "Consulter l'annuaire de l'effectif" },
  { slug: "effectif.validate", domain: "effectif", description: "Valider/rejeter les inscriptions PENDING" },
  { slug: "effectif.grade", domain: "effectif", description: "Promouvoir / rétrograder" },
  { slug: "effectif.division", domain: "effectif", description: "Affecter des divisions" },
  { slug: "effectif.qualification", domain: "effectif", description: "Attribuer des formations et spécialités" },
  { slug: "effectif.deactivate", domain: "effectif", description: "Désactiver / réactiver un agent" },
  { slug: "effectif.resetpw", domain: "effectif", description: "Réinitialiser un mot de passe" },
  { slug: "effectif.edit", domain: "effectif", description: "Éditer l'identité d'un agent" },
  // RBAC / config
  { slug: "rbac.manage", domain: "config", description: "Gérer grades, divisions et permissions" },
  { slug: "callsigns.manage", domain: "config", description: "Gérer les types de callsign" },
  { slug: "codepenal.view", domain: "codepenal", description: "Consulter le code pénal" },
  { slug: "codepenal.create", domain: "codepenal", description: "Ajouter une infraction / catégorie" },
  { slug: "codepenal.edit", domain: "codepenal", description: "Modifier une infraction / catégorie" },
  { slug: "codepenal.delete", domain: "codepenal", description: "Supprimer une infraction / catégorie" },
  { slug: "defcon.view", domain: "defcon", description: "Voir le DEFCON" },
  { slug: "defcon.manage", domain: "defcon", description: "Changer le DEFCON" },
  // Invitations
  { slug: "invites.manage", domain: "invites", description: "Générer / révoquer des invitations" },
  // Service
  { slug: "service.self", domain: "service", description: "Prendre / terminer son service" },
  { slug: "service.manage", domain: "service", description: "Gérer les sessions de service" },
  // Citoyens
  { slug: "citoyens.view", domain: "citoyens", description: "Consulter les dossiers citoyens" },
  { slug: "citoyens.create", domain: "citoyens", description: "Créer un dossier citoyen" },
  { slug: "citoyens.edit", domain: "citoyens", description: "Éditer l'identité d'un citoyen" },
  { slug: "citoyens.flag", domain: "citoyens", description: "Poser / retirer un flag" },
  { slug: "citoyens.licenses", domain: "citoyens", description: "Gérer les licences d'un citoyen" },
  // Véhicules
  { slug: "vehicules.view", domain: "vehicules", description: "Consulter les véhicules" },
  { slug: "vehicules.create", domain: "vehicules", description: "Créer un véhicule" },
  { slug: "vehicules.edit", domain: "vehicules", description: "Éditer un véhicule" },
  { slug: "vehicules.flag", domain: "vehicules", description: "Poser / retirer un flag véhicule" },
  // Flotte LSPD (véhicules de service)
  { slug: "flotte.view", domain: "flotte", description: "Consulter la flotte LSPD et les sorties" },
  { slug: "flotte.create", domain: "flotte", description: "Ajouter un véhicule à la flotte" },
  { slug: "flotte.edit", domain: "flotte", description: "Modifier un véhicule de la flotte" },
  { slug: "flotte.delete", domain: "flotte", description: "Retirer un véhicule de la flotte" },
  // Casier
  { slug: "casier.view", domain: "casier", description: "Consulter les casiers" },
  { slug: "casier.create", domain: "casier", description: "Créer une entrée de casier" },
  { slug: "casier.edit", domain: "casier", description: "Éditer une entrée de casier" },
  { slug: "casier.editClosed", domain: "casier", description: "Éditer un dossier d'arrestation clôturé (haut gradé)" },
  { slug: "casier.annul", domain: "casier", description: "Annuler une entrée de casier" },
  // Mandats
  { slug: "mandats.view", domain: "mandats", description: "Consulter les mandats" },
  { slug: "mandats.create", domain: "mandats", description: "Émettre un mandat" },
  { slug: "mandats.execute", domain: "mandats", description: "Exécuter un mandat" },
  { slug: "mandats.annul", domain: "mandats", description: "Annuler un mandat" },
  // Contraventions
  { slug: "contraventions.view", domain: "contraventions", description: "Consulter les contraventions" },
  { slug: "contraventions.create", domain: "contraventions", description: "Émettre une contravention" },
  { slug: "contraventions.annul", domain: "contraventions", description: "Annuler une contravention" },
  // Recouvrement des amendes
  { slug: "finances.manage", domain: "finances", description: "Marquer une amende payée / impayée" },
  // BOLO / avis de recherche
  { slug: "bolo.view", domain: "bolo", description: "Consulter les avis de recherche" },
  { slug: "bolo.manage", domain: "bolo", description: "Émettre et clore un avis de recherche" },
  // Intégrations
  { slug: "webhooks.manage", domain: "config", description: "Gérer les webhooks Discord" },
  // Statistiques
  { slug: "stats.view", domain: "stats", description: "Consulter les statistiques de la station" },
  // Dispatch
  { slug: "dispatch.view", domain: "dispatch", description: "Voir le dispatch (patrouilles en service)" },
  { slug: "dispatch.self", domain: "dispatch", description: "Créer/rejoindre une patrouille et changer son statut" },
  { slug: "dispatch.manage", domain: "dispatch", description: "Gérer les patrouilles des autres (dispatcher)" },
  { slug: "dispatch.operations", domain: "dispatch", description: "Créer et terminer une opération" },
  // Rapports
  { slug: "rapports.view", domain: "rapports", description: "Consulter les rapports" },
  { slug: "rapports.create", domain: "rapports", description: "Créer un rapport" },
  { slug: "rapports.contribute", domain: "rapports", description: "Contribuer au contenu d'un rapport" },
  { slug: "rapports.submit", domain: "rapports", description: "Soumettre un rapport" },
  { slug: "rapports.validate", domain: "rapports", description: "Valider un rapport" },
  { slug: "rapports.delete", domain: "rapports", description: "Supprimer (soft) un rapport" },
  // RH divers
  { slug: "formations.view", domain: "formations", description: "Consulter les formations" },
  { slug: "formations.create", domain: "formations", description: "Créer une formation / ressource" },
  { slug: "formations.edit", domain: "formations", description: "Modifier une formation / ressource" },
  { slug: "formations.delete", domain: "formations", description: "Supprimer une formation / ressource" },
  { slug: "discipline.view", domain: "discipline", description: "Consulter la discipline / IA" },
  { slug: "discipline.create", domain: "discipline", description: "Ouvrir une sanction / IA" },
  { slug: "discipline.edit", domain: "discipline", description: "Clôturer / modifier une sanction / IA" },
  { slug: "discipline.delete", domain: "discipline", description: "Supprimer une sanction / IA" },
  { slug: "absences.request", domain: "absences", description: "Demander une absence" },
  { slug: "absences.manage", domain: "absences", description: "Gérer les absences" },
  // Documentation
  { slug: "protocoles.view", domain: "protocoles", description: "Consulter les protocoles" },
  { slug: "protocoles.create", domain: "protocoles", description: "Créer un protocole" },
  { slug: "protocoles.edit", domain: "protocoles", description: "Modifier un protocole" },
  { slug: "protocoles.delete", domain: "protocoles", description: "Supprimer un protocole" },
  // Audit
  { slug: "audit.view", domain: "audit", description: "Consulter le journal d'audit" },
  // Archive (§18)
  { slug: "archive.view", domain: "archive", description: "Consulter les éléments archivés (supprimés)" },
  { slug: "archive.restore", domain: "archive", description: "Restaurer un élément archivé" },
  { slug: "archive.purge", domain: "archive", description: "Purger définitivement un élément archivé" },
  // Services (§10)
  { slug: "services.manage", domain: "services", description: "Gérer les services de tous les agents" },
  // Carte (§19)
  { slug: "carte.view", domain: "carte", description: "Consulter la carte de Los Santos" },
  { slug: "carte.create", domain: "carte", description: "Ajouter un lieu / secteur" },
  { slug: "carte.edit", domain: "carte", description: "Modifier le fond de carte" },
  { slug: "carte.delete", domain: "carte", description: "Supprimer un lieu / secteur" },
  // Calendrier (item 1)
  { slug: "calendrier.view", domain: "calendrier", description: "Consulter le calendrier" },
  { slug: "calendrier.create", domain: "calendrier", description: "Créer un évènement" },
  { slug: "calendrier.delete", domain: "calendrier", description: "Supprimer un évènement" },
  // Plaintes (item 2)
  { slug: "plaintes.view", domain: "plaintes", description: "Consulter les plaintes" },
  { slug: "plaintes.create", domain: "plaintes", description: "Déposer une plainte" },
  { slug: "plaintes.edit", domain: "plaintes", description: "Modifier une plainte" },
  { slug: "plaintes.delete", domain: "plaintes", description: "Supprimer une plainte" },
  // Armes (item 3)
  { slug: "armes.view", domain: "armes", description: "Consulter le registre des armes" },
  { slug: "armes.create", domain: "armes", description: "Encoder une arme" },
  { slug: "armes.edit", domain: "armes", description: "Modifier une arme" },
  { slug: "armes.delete", domain: "armes", description: "Supprimer une arme" },
  // Dépositions (item 7)
  { slug: "depositions.view", domain: "depositions", description: "Consulter les dépositions" },
  { slug: "depositions.create", domain: "depositions", description: "Ajouter une déposition" },
  { slug: "depositions.delete", domain: "depositions", description: "Supprimer une déposition" },
  // Saisies (item 10)
  { slug: "saisies.view", domain: "saisies", description: "Consulter le registre des saisies" },
  { slug: "saisies.create", domain: "saisies", description: "Enregistrer une saisie" },
  { slug: "saisies.delete", domain: "saisies", description: "Supprimer une saisie" },
];

// Slugs attribués par défaut à l'État-Major (seed).
export const ETAT_MAJOR_DEFAULT_SLUGS = PERMISSION_SLUGS.map((p) => p.slug);

// ============ Résolution de l'agent courant ============
export async function getCurrentAgent(ctx: QueryCtx): Promise<Doc<"agents"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  return await ctx.db
    .query("agents")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

export async function requireAgent(ctx: QueryCtx): Promise<Doc<"agents">> {
  const agent = await getCurrentAgent(ctx);
  if (!agent) throw new Error("Non authentifié.");
  return agent;
}

// ============ can() - SEULE interface de vérification (§ RBAC) ============
export async function can(ctx: QueryCtx, agent: Doc<"agents">, slug: string): Promise<boolean> {
  if (agent.isOwner) return true; // owner court-circuite tout
  if (agent.status !== "ACTIVE") return false;

  const perm = await ctx.db
    .query("permissions")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (!perm) return false;

  // Recherche ciblée sur l'index composé : charger toutes les permissions du
  // grade pour n'en tester qu'une coûtait ~85 lectures par requête, sur un
  // chemin emprunté par absolument toutes les requêtes de l'application.
  if (agent.gradeId) {
    const hit = await ctx.db
      .query("gradePermissions")
      .withIndex("by_grade_permission", (q) => q.eq("gradeId", agent.gradeId!).eq("permissionId", perm._id))
      .first();
    if (hit) return true;
  }

  const divs = await ctx.db
    .query("agentDivisions")
    .withIndex("by_agent", (q) => q.eq("agentId", agent._id))
    .collect();
  for (const d of divs) {
    const hit = await ctx.db
      .query("divisionPermissions")
      .withIndex("by_division_permission", (q) => q.eq("divisionId", d.divisionId).eq("permissionId", perm._id))
      .first();
    if (hit) return true;
  }
  return false;
}

export async function requirePermission(ctx: QueryCtx, agent: Doc<"agents">, slug: string) {
  if (!(await can(ctx, agent, slug))) {
    throw new Error(`Permission refusée : ${slug}`);
  }
}

// Libellé standardisé d'un agent : { matricule, name }. Owner -> matricule 0.
export async function agentLabel(
  ctx: QueryCtx,
  agentId: import("./_generated/dataModel").Id<"agents"> | undefined | null,
): Promise<{ matricule: number | null; name: string }> {
  if (!agentId) return { matricule: null, name: "-" };
  const a = await ctx.db.get(agentId);
  if (!a) return { matricule: null, name: "-" };
  return {
    matricule: a.matricule ?? (a.isOwner ? 0 : null),
    name: `${a.prenomRP} ${a.nomRP}`,
  };
}

// Snapshot de l'acteur pour l'audit (archive auto-suffisante).
export async function snapshotActor(ctx: QueryCtx, agent: Doc<"agents">) {
  const grade = agent.gradeId ? await ctx.db.get(agent.gradeId) : null;
  const divLinks = await ctx.db
    .query("agentDivisions")
    .withIndex("by_agent", (q) => q.eq("agentId", agent._id))
    .collect();
  const divisions: string[] = [];
  for (const l of divLinks) {
    const d = await ctx.db.get(l.divisionId);
    if (d) divisions.push(d.name);
  }
  return {
    login: agent.login,
    matricule: agent.matricule,
    gradeName: grade?.name,
    divisions,
    isOwner: agent.isOwner,
  };
}

// ============ Hiérarchie ============
// Règle unique : on n'agit que sur un agent de grade STRICTEMENT inférieur au
// sien. L'owner est au-dessus de tout et reste intouchable. Un grade extérieur
// (DOJ, EMS) n'a pas de place dans la hiérarchie LSPD : il ne peut agir sur
// personne de l'effectif, quelles que soient ses permissions.
//
// Sans ce contrôle, une permission suffisait à agir sur n'importe qui : un
// sergent disposant de `effectif.deactivate` pouvait virer un lieutenant.
export async function assertOutranks(
  ctx: QueryCtx,
  actor: Doc<"agents">,
  target: Doc<"agents">,
) {
  if (target.isOwner) throw new Error("Le compte propriétaire est intouchable.");
  if (actor.isOwner) return;
  if (actor._id === target._id) throw new Error("Vous ne pouvez pas effectuer cette action sur vous-même.");

  const actorGrade = actor.gradeId ? await ctx.db.get(actor.gradeId) : null;
  if (!actorGrade) throw new Error("Vous n'avez pas de grade : action impossible.");
  if (actorGrade.external) {
    throw new Error("Un grade extérieur ne peut pas agir sur l'effectif de la station.");
  }

  const targetGrade = target.gradeId ? await ctx.db.get(target.gradeId) : null;
  // Une cible sans grade (inscription en attente) est en bas de la hiérarchie.
  if (!targetGrade) return;

  if (targetGrade.position >= actorGrade.position) {
    throw new Error(
      `Hiérarchie : ${targetGrade.name} n'est pas strictement inférieur à votre grade (${actorGrade.name}).`,
    );
  }
}

// L'auteur d'un enregistrement peut le retirer sans détenir la permission
// dédiée ; celle-ci n'est exigée que pour agir sur celui d'un autre. Évite
// d'avoir à distribuer un droit de suppression global juste pour permettre à
// chacun de corriger sa propre saisie.
export async function requireOwnOrPermission(
  ctx: QueryCtx,
  agent: Doc<"agents">,
  ownerId: Id<"agents"> | undefined | null,
  slug: string,
) {
  if (ownerId && ownerId === agent._id) return;
  await requirePermission(ctx, agent, slug);
}
