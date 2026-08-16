import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Bascule les mandats arrivés à échéance en EXPIRE (toutes les heures).
crons.hourly("expirer les mandats", { minuteUTC: 5 }, internal.mandats.expireDue);

// Synchro depuis le NexusMDT (vizu) : citoyens + armes + véhicules + code pénal.
// Reconnexion automatique (token frais par login). Reste inerte tant que
// VIZU_EMAIL / VIZU_PASSWORD ne sont pas configurés (voir migration.autoSync).
// Chaque passage relit tout le dataset (coûteux en Database I/O). Le write-through
// gère déjà le temps réel : cet import n'est qu'un filet (changements hors-MDT +
// réconciliation), donc espacé à 6 h. La synchro manuelle reste dispo à tout moment.
crons.interval("synchro nexus", { hours: 6 }, internal.migration.autoSync, {});

// Synchro CIBLÉE des saisies toutes les 30 min : légère (une seule entité), pour
// capter les saisies créées/modifiées/supprimées directement sur le Nexus. Le
// write-through gère déjà le temps réel côté MDT ; l'import complet reste à 6 h.
crons.interval("synchro saisies nexus", { minutes: 30 }, internal.migration.autoSyncSaisies, {});

// Re-valide les comptes Nexus liés (write-through) toutes les 6 h : détecte les
// mots de passe changés côté Nexus et alerte en MP.
crons.interval("revalider comptes nexus", { hours: 6 }, internal.nexusSync.revalidateCredentials, {});

// Nettoie les comptes d'authentification orphelins (inscription abandonnée avant
// la création de la fiche agent), avec 30 min de grâce. Évite les « un compte
// existe déjà » persistants.
crons.hourly("nettoyer les comptes orphelins", { minuteUTC: 20 }, internal.maintenance.cleanupOrphanAuth, {});

// Lève automatiquement les mises à pied dont l'échéance est passée (réactive le
// compte). Filet en plus de la levée à la connexion.
crons.interval("lever mises a pied echues", { minutes: 15 }, internal.disciplines.liftExpiredSuspensions, {});

export default crons;
