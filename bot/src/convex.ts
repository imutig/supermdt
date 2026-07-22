import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { env } from "./env.js";

// Le bot n'a pas les types générés du MDT (dépôt séparé) : anyApi construit des
// références de fonction non typées vers le module convex/bot.ts. Toutes les
// fonctions appelées sont en lecture seule et protégées par le secret partagé.
const client = new ConvexHttpClient(env.convexUrl);

type OnDutyAgent = {
  name: string;
  matricule: number | null;
  grade: string;
  since: number;
  callsign: string | null;
};

type DayStats = {
  date: number;
  onDutyNow: number;
  workedMinutes: number;
  distinctAgents: number;
  patrolsToday: number;
  casier: number;
  citations: number;
  top: { name: string; minutes: number }[];
  hourly: number[];
};

type Overview = { totalAgents: number; onDuty: number; openPatrols: number };

export const mdt = {
  agentsOnDuty: () => client.query(anyApi.bot.agentsOnDuty, { secret: env.botSecret }) as Promise<OnDutyAgent[]>,
  dayStats: () => client.query(anyApi.bot.dayStats, { secret: env.botSecret }) as Promise<DayStats>,
  overview: () => client.query(anyApi.bot.overview, { secret: env.botSecret }) as Promise<Overview>,
};

export type { OnDutyAgent, DayStats, Overview };
