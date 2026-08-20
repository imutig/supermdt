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
  absenceChannel: string | null;
  dailyAt: string;
  rollcallStartAt: string | null;
  rollcallEndAt: string | null;
  ceremonyAt: string | null;
  rollcallPingRole: string | null;
  rollcallPingEnabled: boolean;
  sanctionsChannel: string | null;
  sanctionsPingRole: string | null;
  trackingChannel: string | null;
  lastDailyRecap: string | null;
};

// Un dossier d'arrestation / une contravention à (re)publier dans le salon de
// suivi (embed édité en place).
export type TrackingItem = {
  kind: "casier" | "citation";
  id: string;
  trackingMessageId: string | null;
  trackingChannelId: string | null;
  citizenId: string;
  citizenName: string;
  label: string;
  charges: string[];
  officer: string;
  totalFine: number;
  amendeStatut: string | null;
  closed: boolean;
  at: number;
  deleted: boolean;
  url: string | null;
};

export type SanctionAnnounce = {
  id: string; reference: number | null;
  agentName: string; agentMatricule: number | null; agentDiscordId: string | null;
  motif: string; sanction: string; level: string | null;
  suspends: boolean; suspendedUntil: number | null;
  byName: string | null; byMatricule: number | null; at: number;
};
export type ConvocationAnnounce = {
  id: string; reference: number | null;
  agentName: string | null; agentMatricule: number | null; pingDiscordId: string | null;
  motif: string; convokedAt: number | null; lieu: string | null;
  byName: string | null; byMatricule: number | null; at: number;
};

export type RollStatus = "PRESENT" | "ABSENT" | "RETARD";
type RollcallRef = { _id: string; channelId: string; messageId: string; endsAt: number; closed: boolean; remindersSent: string[] };
type RollcallState = { endsAt: number; closed: boolean; ceremony: boolean; ceremonyTime: string | null; displayTime: string | null; present: string[]; retard: string[]; absent: string[] };

type VehicleInfo = { plaque: string; modele: string; couleur: string; type: string; owner: string | null; notes: string | null; flags: string[] };
type CasierInfo =
  | { found: false }
  | { found: true; name: string; dateNaissance: string | null; sexe: string | null; nationalite: string | null; totalFine: number; totalJailSeconds: number; count: number; rows: { at: number; type: string; charges: string; fine: number; jailSeconds: number }[] };

type CitizenInfo = {
  prenom: string; nom: string;
  dateNaissance: string | null; sexe: string | null; telephone: string | null; nationalite: string | null;
  deceased: boolean; wanted: boolean;
  casierCount: number; citationCount: number; vehicleCount: number;
  bolo: { title: string; danger: boolean } | null;
};

type WeeklyHours =
  | { found: false }
  | { found: true; name: string; matricule: number | null; grade: string; totalMinutes: number; perDay: number[] };

// Résultat AGRÉGÉ d'un tick : une seule Function Call Convex regroupe toutes les
// lectures que le bot interrogeait séparément à chaque passage. Les tranches
// coûteuses/temporelles (roll call, récap quotidien) sont null hors de leur
// fenêtre horaire. Les mutations restent des appels séparés (écritures ponctuelles).
export type TickResult = {
  config: BotConfig;
  ticketConfig: TicketConfig;
  rollcall: RollcallRef | null;
  dayStats: DayStats | null;
  agentsOnDuty: OnDutyAgent[] | null;
  ticketsDueForClose: { channelId: string; ownerId: string; prenom: string; nom: string }[];
  interviewReminders: { channelId: string; ownerId: string; interviewById: string | null; interviewAt: number; prenom: string; nom: string; interviewPresence: "CONFIRMED" | "DECLINED" | null }[];
  accountDMQueue: { code: string; discordId: string; baseUrl: string }[];
  nexusAlertQueue: { id: string; message: string; discordId: string }[];
  roleJobsPending: { _id: string; discordId: string; addRoleId: string | null; removeRoleIds: string[]; reason: string | null }[];
  ceremonyPosts: { channel: string | null; posts: { id: string; content: string }[] };
  ftoAnnouncements: { id: string; channelId: string; pingContent: string | null; description: string | null; tutorCount: number; traineeCount: number; content: string | null }[];
  absencesToAnnounce: { id: string; name: string; matricule: number | null; discordId: string | null; from: number; to: number; reason: string }[];
  absenceMsgOps: { id: string; op: "edit" | "delete"; channelId: string; messageId: string; name: string; matricule: number | null; discordId: string | null; from: number; to: number; reason: string }[];
  sanctionsToAnnounce: SanctionAnnounce[];
  convocationsToAnnounce: ConvocationAnnounce[];
  trackingPending: TrackingItem[];
};

export const mdt = {
  // UNE requête agrégée par tick (remplace ~15 requêtes séparées). Voir tasks.ts.
  tick: (now: number) => client.query(anyApi.bot.tick, { secret: env.botSecret, now }) as Promise<TickResult>,
  agentsOnDuty: () => client.query(anyApi.bot.agentsOnDuty, { secret: env.botSecret }) as Promise<OnDutyAgent[]>,
  dayStats: () => client.query(anyApi.bot.dayStats, { secret: env.botSecret }) as Promise<DayStats>,
  overview: () => client.query(anyApi.bot.overview, { secret: env.botSecret }) as Promise<Overview>,
  config: () => client.query(anyApi.bot.config, { secret: env.botSecret }) as Promise<BotConfig>,
  markDailyRecapSent: (day: string) => client.mutation(anyApi.bot.markDailyRecapSent, { secret: env.botSecret, day }) as Promise<void>,
  weeklyHours: (query: string) => client.query(anyApi.bot.agentWeeklyHours, { secret: env.botSecret, query }) as Promise<WeeklyHours>,

  rollcallToday: (date: string) => client.query(anyApi.bot.rollcallToday, { secret: env.botSecret, date }) as Promise<RollcallRef | null>,
  rollcallPrevious: (date: string) => client.query(anyApi.bot.rollcallPrevious, { secret: env.botSecret, date }) as Promise<{ channelId: string; messageId: string; reminderMsgIds: string[] } | null>,
  rollcallReserve: (date: string, channelId: string, endsAt: number, ceremony?: boolean, ceremonyTime?: string | null, displayTime?: string | null) =>
    client.mutation(anyApi.bot.rollcallReserve, { secret: env.botSecret, date, channelId, endsAt, ceremony, ceremonyTime: ceremonyTime ?? undefined, displayTime: displayTime ?? undefined }) as Promise<{ _id: string; created: boolean }>,
  rollcallSetMessage: (rollcallId: string, messageId: string) =>
    client.mutation(anyApi.bot.rollcallSetMessage, { secret: env.botSecret, rollcallId, messageId }) as Promise<void>,
  rollcallState: (rollcallId: string) => client.query(anyApi.bot.rollcallState, { secret: env.botSecret, rollcallId }) as Promise<RollcallState | null>,
  rollcallVote: (rollcallId: string, discordUserId: string, discordName: string, status: RollStatus) =>
    client.mutation(anyApi.bot.rollcallVote, { secret: env.botSecret, rollcallId, discordUserId, discordName, status }) as Promise<{ ok: boolean; reason?: string }>,
  rollcallClose: (rollcallId: string) => client.mutation(anyApi.bot.rollcallClose, { secret: env.botSecret, rollcallId }) as Promise<void>,
  rollcallVoters: (rollcallId: string) => client.query(anyApi.bot.rollcallVoters, { secret: env.botSecret, rollcallId }) as Promise<string[]>,
  rollcallMarkReminders: (rollcallId: string, slots: string[]) => client.mutation(anyApi.bot.rollcallMarkReminders, { secret: env.botSecret, rollcallId, slots }) as Promise<void>,
  rollcallAddReminderMsgs: (rollcallId: string, messageIds: string[]) => client.mutation(anyApi.bot.rollcallAddReminderMsgs, { secret: env.botSecret, rollcallId, messageIds }) as Promise<void>,

  syncDiscordMembers: (members: { discordId: string; username: string; displayName: string; roleIds?: string[] }[]) => client.mutation(anyApi.bot.syncDiscordMembers, { secret: env.botSecret, members }) as Promise<{ count: number }>,
  accountDMQueue: () => client.query(anyApi.bot.accountDMQueue, { secret: env.botSecret }) as Promise<{ code: string; discordId: string; baseUrl: string }[]>,
  markAccountDMSent: (code: string) => client.mutation(anyApi.bot.markAccountDMSent, { secret: env.botSecret, code }) as Promise<void>,
  nexusAlertQueue: () => client.query(anyApi.bot.nexusAlertQueue, { secret: env.botSecret }) as Promise<{ id: string; message: string; discordId: string }[]>,
  markNexusAlertSent: (id: string) => client.mutation(anyApi.bot.markNexusAlertSent, { secret: env.botSecret, id }) as Promise<void>,
  sanctionsToAnnounce: () => client.query(anyApi.bot.sanctionsToAnnounce, { secret: env.botSecret }) as Promise<SanctionAnnounce[]>,
  markSanctionAnnounced: (id: string) => client.mutation(anyApi.bot.markSanctionAnnounced, { secret: env.botSecret, id }) as Promise<void>,
  convocationsToAnnounce: () => client.query(anyApi.bot.convocationsToAnnounce, { secret: env.botSecret }) as Promise<ConvocationAnnounce[]>,
  markConvocationAnnounced: (id: string) => client.mutation(anyApi.bot.markConvocationAnnounced, { secret: env.botSecret, id }) as Promise<void>,
  trackingPending: () => client.query(anyApi.bot.trackingPending, { secret: env.botSecret }) as Promise<TrackingItem[]>,
  trackingMark: (kind: "casier" | "citation", id: string, messageId: string, channelId: string) =>
    client.mutation(anyApi.bot.trackingMark, { secret: env.botSecret, kind, id, messageId, channelId }) as Promise<void>,
  trackingClear: (kind: "casier" | "citation", id: string) =>
    client.mutation(anyApi.bot.trackingClear, { secret: env.botSecret, kind, id }) as Promise<void>,
  ceremonyPostsToSend: () => client.query(anyApi.bot.ceremonyPostsToSend, { secret: env.botSecret }) as Promise<{ channel: string | null; posts: { id: string; content: string }[] }>,
  markCeremonyPostSent: (id: string) => client.mutation(anyApi.bot.markCeremonyPostSent, { secret: env.botSecret, id }) as Promise<void>,
  markFtoAnnouncement: (id: string) => client.mutation(anyApi.bot.markFtoAnnouncement, { secret: env.botSecret, id }) as Promise<void>,

  // Services in-game (salon « VIZU | Service Log »).
  ingameSyncState: () => client.query(anyApi.ingameService.syncState, { secret: env.botSecret }) as Promise<{ channelId: string | null; lastMsgId: string | null; resync: boolean }>,
  ingameUpsert: (a: { messageId: string; discordId: string; startedAt: number; endedAt: number; ingameName?: string; ingameId?: string }) =>
    client.mutation(anyApi.ingameService.upsert, { secret: env.botSecret, ...a }) as Promise<{ created: boolean }>,
  ingameSetCursor: (a: { lastMsgId?: string; clearResync?: boolean }) =>
    client.mutation(anyApi.ingameService.setCursor, { secret: env.botSecret, ...a }) as Promise<void>,
  roleJobsPending: () => client.query(anyApi.bot.roleJobsPending, { secret: env.botSecret }) as Promise<{ _id: string; discordId: string; addRoleId: string | null; removeRoleIds: string[]; reason: string | null }[]>,
  markRoleJob: (jobId: string, status: "DONE" | "ERROR", error?: string) => client.mutation(anyApi.bot.markRoleJob, { secret: env.botSecret, jobId, status, error }) as Promise<void>,

  vehicleByPlate: (plaque: string) => client.query(anyApi.bot.vehicleByPlate, { secret: env.botSecret, plaque }) as Promise<VehicleInfo | null>,
  casierByName: (query: string) => client.query(anyApi.bot.casierByName, { secret: env.botSecret, query }) as Promise<CasierInfo>,
  citizenByName: (query: string) => client.query(anyApi.bot.citizenByName, { secret: env.botSecret, query }) as Promise<CitizenInfo | null>,
  requestAbsence: (discordId: string, query: string | undefined, from: number, to: number, reason: string, discordName: string) =>
    client.mutation(anyApi.bot.requestAbsence, { secret: env.botSecret, discordId, query, from, to, reason, discordName }) as Promise<{ ok: boolean; reason?: string; name?: string }>,
  absentDiscordIds: () => client.query(anyApi.bot.absentDiscordIds, { secret: env.botSecret }) as Promise<string[]>,
  commandAllowed: (command: string, discordId: string, roleIds: string[], isLspd: boolean) => client.query(anyApi.bot.commandAllowed, { secret: env.botSecret, command, discordId, roleIds, isLspd }) as Promise<boolean>,
  absencesCurrent: () => client.query(anyApi.bot.absencesCurrent, { secret: env.botSecret }) as Promise<{ name: string; matricule: number | null; until: number; reason: string }[]>,
  absencesToAnnounce: () => client.query(anyApi.bot.absencesToAnnounce, { secret: env.botSecret }) as Promise<{ id: string; name: string; matricule: number | null; discordId: string | null; from: number; to: number; reason: string }[]>,
  markAbsenceAnnounced: (id: string, messageId?: string, channelId?: string) => client.mutation(anyApi.bot.markAbsenceAnnounced, { secret: env.botSecret, id, messageId, channelId }) as Promise<void>,
  markAbsenceMsgOpDone: (id: string) => client.mutation(anyApi.bot.markAbsenceMsgOpDone, { secret: env.botSecret, id }) as Promise<void>,
  presenceMessageGet: () => client.query(anyApi.bot.presenceMessageGet, { secret: env.botSecret }) as Promise<string | null>,
  presenceMessageSet: (messageId: string) => client.mutation(anyApi.bot.presenceMessageSet, { secret: env.botSecret, messageId }) as Promise<void>,

  // ---- Tickets de candidature ----
  ticketConfigGet: () => client.query(anyApi.bot.ticketConfigGet, { secret: env.botSecret }) as Promise<TicketConfig>,
  ticketConfigSet: (patch: Partial<TicketConfig>) => client.mutation(anyApi.bot.ticketConfigSet, { secret: env.botSecret, patch }) as Promise<void>,
  ticketTemplateList: () => client.query(anyApi.bot.ticketTemplateList, { secret: env.botSecret }) as Promise<TicketTemplate[]>,
  ticketTemplateUpsert: (t: { id?: string; name: string; pingOwner: boolean; embed: RichEmbed }) =>
    client.mutation(anyApi.bot.ticketTemplateUpsert, { secret: env.botSecret, ...t }) as Promise<string>,
  ticketTemplateDelete: (id: string) => client.mutation(anyApi.bot.ticketTemplateDelete, { secret: env.botSecret, id }) as Promise<void>,
  ticketTemplateByName: (name: string) => client.query(anyApi.bot.ticketTemplateByName, { secret: env.botSecret, name }) as Promise<TicketTemplate | null>,
  ticketCreate: (t: { channelId: string; ownerId: string; ownerName: string; prenom: string; nom: string; dateNaissance?: string; motivations?: string; experiences?: string }) =>
    client.mutation(anyApi.bot.ticketCreate, { secret: env.botSecret, ...t }) as Promise<void>,
  ticketSetDossier: (channelId: string, motivations?: string, experiences?: string) =>
    client.mutation(anyApi.bot.ticketSetDossier, { secret: env.botSecret, channelId, motivations, experiences }) as Promise<void>,
  ticketByChannel: (channelId: string) => client.query(anyApi.bot.ticketByChannel, { secret: env.botSecret, channelId }) as Promise<TicketOwner | null>,
  ticketClose: (channelId: string, reason?: string, by?: string) => client.mutation(anyApi.bot.ticketClose, { secret: env.botSecret, channelId, reason, by }) as Promise<{ ownerId: string; ownerName: string } | null>,
  ticketReopen: (channelId: string, by?: string) => client.mutation(anyApi.bot.ticketReopen, { secret: env.botSecret, channelId, by }) as Promise<{ ownerId: string } | null>,
  ticketScheduleClose: (channelId: string, closeAt: number, by?: string) => client.mutation(anyApi.bot.ticketScheduleClose, { secret: env.botSecret, channelId, closeAt, by }) as Promise<{ ownerId: string; prenom: string; nom: string } | null>,
  ticketPingSubscribe: (channelId: string, userId: string, mode: "ONCE" | "ALWAYS" | "OFF") => client.mutation(anyApi.bot.ticketPingSubscribe, { secret: env.botSecret, channelId, userId, mode }) as Promise<{ mode: "ONCE" | "ALWAYS" | "OFF" } | null>,
  ticketPingConsume: (channelId: string) => client.mutation(anyApi.bot.ticketPingConsume, { secret: env.botSecret, channelId }) as Promise<string[]>,
  ticketCancelScheduledClose: (channelId: string) => client.mutation(anyApi.bot.ticketCancelScheduledClose, { secret: env.botSecret, channelId }) as Promise<{ cancelled: boolean }>,
  ticketsDueForClose: (now: number) => client.query(anyApi.bot.ticketsDueForClose, { secret: env.botSecret, now }) as Promise<{ channelId: string; ownerId: string; prenom: string; nom: string }[]>,
  ticketAutoClose: (channelId: string) => client.mutation(anyApi.bot.ticketAutoClose, { secret: env.botSecret, channelId }) as Promise<{ ownerId: string; prenom: string; nom: string } | null>,
  ticketLogEvent: (channelId: string, event: { type: string; label: string; by?: string }) => client.mutation(anyApi.bot.ticketLogEvent, { secret: env.botSecret, channelId, event }) as Promise<void>,
  ticketFull: (channelId: string) => client.query(anyApi.bot.ticketFull, { secret: env.botSecret, channelId }) as Promise<TicketFull | null>,
  ticketArchiveSave: (channelId: string, channelName: string, messages: ArchiveMessage[]) =>
    client.mutation(anyApi.bot.ticketArchiveSave, { secret: env.botSecret, channelId, channelName, messages }) as Promise<void>,
  ticketByOwner: (ownerId: string) => client.query(anyApi.bot.ticketByOwner, { secret: env.botSecret, ownerId }) as Promise<{ channelId: string; prenom: string; nom: string; integrationStatus: IntegStatus | null } | null>,
  ticketSetStatus: (channelId: string, status: IntegStatus, by?: string, interviewAt?: number | null, byId?: string) => client.mutation(anyApi.bot.ticketSetStatus, { secret: env.botSecret, channelId, status, by, byId, interviewAt: interviewAt ?? undefined }) as Promise<{ prenom: string; nom: string } | null>,
  interviewReminders: (now: number) => client.query(anyApi.bot.interviewReminders, { secret: env.botSecret, now }) as Promise<{ channelId: string; ownerId: string; interviewById: string | null; interviewAt: number; prenom: string; nom: string; interviewPresence: "CONFIRMED" | "DECLINED" | null }[]>,
  markInterviewReminded: (channelId: string) => client.mutation(anyApi.bot.markInterviewReminded, { secret: env.botSecret, channelId }) as Promise<void>,
  ticketSetPresence: (ownerId: string, presence: "CONFIRMED" | "DECLINED") => client.mutation(anyApi.bot.ticketSetPresence, { secret: env.botSecret, ownerId, presence }) as Promise<{ channelId: string; interviewById: string | null; interviewAt: number; prenom: string; nom: string } | null>,
  ticketCancelInterview: (channelId: string, by?: string) => client.mutation(anyApi.bot.ticketCancelInterview, { secret: env.botSecret, channelId, by }) as Promise<{ ownerId: string; prenom: string; nom: string; interviewMsgId: string | null } | null>,
  ticketSetVoteMsg: (channelId: string, messageId: string) => client.mutation(anyApi.bot.ticketSetVoteMsg, { secret: env.botSecret, channelId, messageId }) as Promise<void>,
  ticketSetInterviewMsg: (channelId: string, messageId: string) => client.mutation(anyApi.bot.ticketSetInterviewMsg, { secret: env.botSecret, channelId, messageId }) as Promise<void>,
  ticketVote: (channelId: string, discordUserId: string, discordName: string, choice: "FOR" | "AGAINST") => client.mutation(anyApi.bot.ticketVote, { secret: env.botSecret, channelId, discordUserId, discordName, choice }) as Promise<{ ok: boolean }>,
  ticketVoteState: (channelId: string) => client.query(anyApi.bot.ticketVoteState, { secret: env.botSecret, channelId }) as Promise<{ for: string[]; against: string[] } | null>,
  ticketSetPromotion: (channelId: string, promotionId: string) => client.mutation(anyApi.bot.ticketSetPromotion, { secret: env.botSecret, channelId, promotionId }) as Promise<void>,
  cadetRoleOwners: () => client.query(anyApi.bot.cadetRoleOwners, { secret: env.botSecret }) as Promise<string[]>,
  ticketProvisionAccount: (channelId: string, by?: string) => client.mutation(anyApi.bot.ticketProvisionAccount, { secret: env.botSecret, channelId, by }) as Promise<{ ok: true; code: string } | { ok: false; reason: "notfound" | "notpresent" | "linked" | "nograde" }>,

  promoUpsertByDate: (paDate: number, name: string | undefined, paTime: string | undefined, paPlace: string | undefined) =>
    client.mutation(anyApi.bot.promoUpsertByDate, { secret: env.botSecret, paDate, name, paTime, paPlace }) as Promise<{ promotionId: string; name: string; discordCategoryId: string | null; created: boolean }>,
  promoSetCategory: (promotionId: string, categoryId: string) => client.mutation(anyApi.bot.promoSetCategory, { secret: env.botSecret, promotionId, categoryId }) as Promise<void>,
  promoGet: (promotionId: string) => client.query(anyApi.bot.promoGet, { secret: env.botSecret, promotionId }) as Promise<{ name: string; discordCategoryId: string | null } | null>,
  promosNeedingCategory: () => client.query(anyApi.bot.promosNeedingCategory, { secret: env.botSecret }) as Promise<{ promotionId: string; name: string }[]>,
  promosPendingDeletion: () => client.query(anyApi.bot.promosPendingDeletion, { secret: env.botSecret }) as Promise<{ promotionId: string; name: string; discordCategoryId: string | null }[]>,
  promoFinalizeDeletion: (promotionId: string) => client.mutation(anyApi.bot.promoFinalizeDeletion, { secret: env.botSecret, promotionId }) as Promise<void>,
};

export type TicketEvent = { at: number; type: string; label: string; by?: string };
export type ArchiveMessage = { authorId: string; authorName: string; bot?: boolean; content: string; at: number; attachments?: string[] };
export type TicketFull = {
  channelId: string; ownerId: string; ownerName: string;
  prenom: string; nom: string; dateNaissance: string | null; motivations: string | null; experiences: string | null;
  status: string; integrationStatus: IntegStatus | null;
  promotionName: string | null; closeReason: string | null;
  events: TicketEvent[]; createdAt: number;
};

export type IntegStatus = "NEW" | "VOTE" | "ACCEPTED" | "INTERVIEW" | "PASSED" | "ACADEMY" | "PRESENT" | "REJECTED";
export type EmbedField = { name: string; value: string; inline?: boolean };
export type RichEmbed = {
  authorName?: string; authorIcon?: string;
  title?: string; description?: string; color?: string;
  thumbnail?: string; image?: string;
  footer?: string; footerIcon?: string;
  fields?: EmbedField[];
};
export type TicketConfig = {
  categoryId: string | null; panelChannelId: string | null; panelMessageId: string | null;
  candidaturesOpen: boolean;
  panelEmbed: RichEmbed; openEmbed: RichEmbed;
  nomenclature: string; renameNick: boolean;
  promoRoleIds: string[]; cadetRoleId: string | null;
  recruiterRoleIds: string[];
  importantInfo: string; conditionsRP: string;
  announceEmbed: RichEmbed;
  statusCategories: { status: string; categoryId: string }[];
  autoTplAccuse: string | null; autoTplRefus: string | null; autoTplAccept: string | null;
};
export type TicketTemplate = { _id: string; name: string; pingOwner: boolean; embed: RichEmbed };
export type TicketOwner = { ownerId: string; ownerName: string; prenom: string; nom: string; status: string; integrationStatus: IntegStatus | null; interviewAt: number | null; interviewById: string | null; interviewPresence: "CONFIRMED" | "DECLINED" | null; interviewMsgId: string | null; voteMsgId: string | null };

export type { OnDutyAgent, DayStats, Overview, BotConfig, WeeklyHours, RollcallState, VehicleInfo, CasierInfo, CitizenInfo };
