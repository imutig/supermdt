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

type BotConfig = {
  presenceChannel: string | null;
  dailyChannel: string | null;
  rollcallChannel: string | null;
  dailyAt: string;
  rollcallStartAt: string | null;
  rollcallEndAt: string | null;
};

export type RollStatus = "PRESENT" | "ABSENT" | "RETARD";
type RollcallRef = { _id: string; channelId: string; messageId: string; endsAt: number; closed: boolean };
type RollcallState = { endsAt: number; closed: boolean; present: string[]; retard: string[]; absent: string[] };

type VehicleInfo = { plaque: string; modele: string; couleur: string; type: string; owner: string | null; notes: string | null; flags: string[] };
type CasierInfo =
  | { found: false }
  | { found: true; name: string; dateNaissance: string | null; sexe: string | null; nationalite: string | null; totalFine: number; totalJailSeconds: number; count: number; rows: { at: number; type: string; charges: string; fine: number; jailSeconds: number }[] };

type WeeklyHours =
  | { found: false }
  | { found: true; name: string; matricule: number | null; grade: string; totalMinutes: number; perDay: number[] };

export const mdt = {
  agentsOnDuty: () => client.query(anyApi.bot.agentsOnDuty, { secret: env.botSecret }) as Promise<OnDutyAgent[]>,
  dayStats: () => client.query(anyApi.bot.dayStats, { secret: env.botSecret }) as Promise<DayStats>,
  overview: () => client.query(anyApi.bot.overview, { secret: env.botSecret }) as Promise<Overview>,
  config: () => client.query(anyApi.bot.config, { secret: env.botSecret }) as Promise<BotConfig>,
  weeklyHours: (query: string) => client.query(anyApi.bot.agentWeeklyHours, { secret: env.botSecret, query }) as Promise<WeeklyHours>,

  rollcallToday: (date: string) => client.query(anyApi.bot.rollcallToday, { secret: env.botSecret, date }) as Promise<RollcallRef | null>,
  rollcallOpen: (date: string, channelId: string, messageId: string, endsAt: number) =>
    client.mutation(anyApi.bot.rollcallOpen, { secret: env.botSecret, date, channelId, messageId, endsAt }) as Promise<{ _id: string; duplicate: boolean }>,
  rollcallState: (rollcallId: string) => client.query(anyApi.bot.rollcallState, { secret: env.botSecret, rollcallId }) as Promise<RollcallState | null>,
  rollcallVote: (rollcallId: string, discordUserId: string, discordName: string, status: RollStatus) =>
    client.mutation(anyApi.bot.rollcallVote, { secret: env.botSecret, rollcallId, discordUserId, discordName, status }) as Promise<{ ok: boolean; reason?: string }>,
  rollcallClose: (rollcallId: string) => client.mutation(anyApi.bot.rollcallClose, { secret: env.botSecret, rollcallId }) as Promise<void>,

  vehicleByPlate: (plaque: string) => client.query(anyApi.bot.vehicleByPlate, { secret: env.botSecret, plaque }) as Promise<VehicleInfo | null>,
  casierByName: (query: string) => client.query(anyApi.bot.casierByName, { secret: env.botSecret, query }) as Promise<CasierInfo>,
  requestAbsence: (query: string, from: number, to: number, reason: string, discordName: string) =>
    client.mutation(anyApi.bot.requestAbsence, { secret: env.botSecret, query, from, to, reason, discordName }) as Promise<{ ok: boolean; reason?: string; name?: string }>,
  presenceMessageGet: () => client.query(anyApi.bot.presenceMessageGet, { secret: env.botSecret }) as Promise<string | null>,
  presenceMessageSet: (messageId: string) => client.mutation(anyApi.bot.presenceMessageSet, { secret: env.botSecret, messageId }) as Promise<void>,
};

export type { OnDutyAgent, DayStats, Overview, BotConfig, WeeklyHours, RollcallState, VehicleInfo, CasierInfo };
