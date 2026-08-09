import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Bascule les mandats arrivés à échéance en EXPIRE (toutes les heures).
crons.hourly("expirer les mandats", { minuteUTC: 5 }, internal.mandats.expireDue);

// Synchro depuis le NexusMDT (vizu) : citoyens + armes + véhicules + code pénal.
// Reconnexion automatique (token frais par login). Reste inerte tant que
// VIZU_EMAIL / VIZU_PASSWORD ne sont pas configurés (voir migration.autoSync).
crons.interval("synchro nexus", { hours: 6 }, internal.migration.autoSync, {});

export default crons;
