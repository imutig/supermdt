import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Bascule les mandats arrivés à échéance en EXPIRE (toutes les heures).
crons.hourly("expirer les mandats", { minuteUTC: 5 }, internal.mandats.expireDue);

export default crons;
