import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Bascule les mandats arrivés à échéance en EXPIRE (toutes les heures).
crons.hourly("expirer les mandats", { minuteUTC: 5 }, internal.mandats.expireDue);

// Synchro depuis le NexusMDT (vizu) : citoyens + armes + véhicules + code pénal.
// Reconnexion automatique (token frais par login). Reste inerte tant que
// VIZU_EMAIL / VIZU_PASSWORD ne sont pas configurés (voir migration.autoSync).
crons.interval("synchro nexus", { minutes: 30 }, internal.migration.autoSync, {});

// Nettoie les comptes d'authentification orphelins (inscription abandonnée avant
// la création de la fiche agent), avec 30 min de grâce. Évite les « un compte
// existe déjà » persistants.
crons.hourly("nettoyer les comptes orphelins", { minuteUTC: 20 }, internal.maintenance.cleanupOrphanAuth, {});

export default crons;
