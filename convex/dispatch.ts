import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAgent, requirePermission, can, agentLabel } from "./rbac";
import { notify, NOTIFY_COLOR } from "./lib/notify";
import { openTrip, closeTrip, tripAddMember, tripRemoveMember, roofToNumber } from "./fleet";

async function myOpenMembership(ctx: QueryCtx, agentId: Id<"agents">) {
  const memberships = await ctx.db.query("patrolMembers").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect();
  for (const m of memberships) {
    const p = await ctx.db.get(m.patrolId);
    if (p && !p.endedAt) return { membership: m, patrol: p };
  }
  return null;
}

// Catalogue fixe des champs obligatoires liés à un statut (cf. dispatchStatuses.requires).
export const FIELD_LABELS: Record<string, string> = {
  secteur: "Secteur",
  vehiculeType: "Type de véhicule",
  vehiculeCouleur: "Couleur du véhicule",
  occupants: "Nombre d'occupants",
  suspects: "Nombre de suspects",
  raison: "Raison",
};

const FIELDS_V = v.object({
  secteur: v.optional(v.string()),
  vehiculeType: v.optional(v.string()),
  vehiculeCouleur: v.optional(v.string()),
  occupants: v.optional(v.string()),
  suspects: v.optional(v.string()),
  raison: v.optional(v.string()),
});
type PatrolFields = { secteur?: string; vehiculeType?: string; vehiculeCouleur?: string; occupants?: string; suspects?: string; raison?: string };

// Vérifie que tous les champs requis par le statut sont renseignés.
function assertRequired(status: { name: string; requires?: string[] }, fields: PatrolFields | undefined) {
  for (const key of status.requires ?? []) {
    const val = (fields ?? {})[key as keyof PatrolFields];
    if (!val || !val.trim()) {
      throw new Error(`« ${FIELD_LABELS[key] ?? key} » est obligatoire pour le statut « ${status.name} ».`);
    }
  }
}

// Ne conserve que les champs pertinents pour le statut visé (évite de traîner d'anciennes valeurs).
function pickFields(status: { requires?: string[] }, fields: PatrolFields | undefined): PatrolFields | undefined {
  const keys = status.requires ?? [];
  if (keys.length === 0) return undefined;
  const out: PatrolFields = {};
  for (const k of keys) {
    const val = (fields ?? {})[k as keyof PatrolFields];
    if (val && val.trim()) out[k as keyof PatrolFields] = val.trim();
  }
  return out;
}

// Cache de lecture valable le temps d'UNE exécution de requête. Le board relit
// sinon plusieurs fois les mêmes agents, grades et statuts : un agent était
// chargé deux fois (get + agentLabel), son grade deux fois (abréviation +
// couleur), et chaque statut de patrouille une fois de plus alors que la liste
// complète venait d'être chargée.
type Lookup = {
  agent: (id: Id<"agents">) => Promise<Doc<"agents"> | null>;
  grade: (agent: Doc<"agents">) => Promise<Doc<"grades"> | null>;
  status: (id: Id<"dispatchStatuses"> | undefined) => Promise<StatusView | null>;
};
type StatusView = { _id: Id<"dispatchStatuses">; name: string; color: string | null; icon: string | null; group: string | null; requires: string[] };

function statusOf(s: Doc<"dispatchStatuses">): StatusView {
  return { _id: s._id, name: s.name, color: s.color ?? null, icon: s.icon ?? null, group: s.group ?? null, requires: s.requires ?? [] };
}

function makeLookup(ctx: QueryCtx, preloadedStatuses?: Doc<"dispatchStatuses">[]): Lookup {
  const agents = new Map<string, Doc<"agents"> | null>();
  const grades = new Map<string, Doc<"grades"> | null>();
  const statuses = new Map<string, StatusView>();
  for (const st of preloadedStatuses ?? []) statuses.set(st._id, statusOf(st));

  return {
    async agent(id) {
      if (!agents.has(id)) agents.set(id, await ctx.db.get(id));
      return agents.get(id)!;
    },
    async grade(agent) {
      if (!agent.gradeId) return null;
      const k = agent.gradeId as string;
      if (!grades.has(k)) grades.set(k, await ctx.db.get(agent.gradeId));
      return grades.get(k)!;
    },
    async status(id) {
      if (!id) return null;
      if (statuses.has(id)) return statuses.get(id)!;
      const s = await ctx.db.get(id);
      if (!s) return null;
      const view = statusOf(s);
      statuses.set(id, view);
      return view;
    },
  };
}

// Abréviation et couleur de grade, dérivées d'un agent déjà chargé.
async function gradeTag(lk: Lookup, agent: Doc<"agents">) {
  if (agent.isOwner) return { gradeAbbrev: "OWN", gradeColor: null as string | null };
  const g = await lk.grade(agent);
  if (!g) return { gradeAbbrev: null as string | null, gradeColor: null as string | null };
  return { gradeAbbrev: g.abbrev?.trim() || g.name.slice(0, 3).toUpperCase(), gradeColor: g.color ?? null };
}

async function patrolView(ctx: QueryCtx, patrol: Doc<"patrols">, lk: Lookup = makeLookup(ctx)) {
  const memberLinks = await ctx.db.query("patrolMembers").withIndex("by_patrol", (q) => q.eq("patrolId", patrol._id)).collect();
  const members = [];
  for (const m of memberLinks) {
    const a = await lk.agent(m.agentId);
    const tag = a ? await gradeTag(lk, a) : { gradeAbbrev: null, gradeColor: null };
    members.push({
      matricule: a ? (a.matricule ?? (a.isOwner ? 0 : null)) : null,
      name: a ? `${a.prenomRP} ${a.nomRP}` : "-",
      agentId: m.agentId,
      ...tag,
    });
  }
  const fleetVeh = patrol.fleetVehicleId ? await ctx.db.get(patrol.fleetVehicleId) : null;
  return {
    _id: patrol._id,
    label: patrol.label,
    indicator: patrol.indicator,
    vehicleNumber: patrol.vehicleNumber,
    fleetVehicleId: patrol.fleetVehicleId ?? null,
    fleetVehicleLabel: fleetVeh ? `${fleetVeh.modele} · ${fleetVeh.plaque}` : null,
    color: patrol.color ?? null,
    callsignTypeId: patrol.callsignTypeId ?? null,
    operationId: patrol.operationId ?? null,
    status: await lk.status(patrol.statusId),
    detail: patrol.detail ?? null,
    fields: (patrol.fields ?? null) as PatrolFields | null,
    statusSince: patrol.statusSince,
    startedAt: patrol.startedAt,
    createdBy: patrol.createdBy,
    members,
  };
}

// Couleurs de patrouille (dark + light).
export const PATROL_COLORS = ["#3b82f6", "#16a34a", "#d97706", "#e11d48", "#8b5cf6"];

// Indicateur classique selon l'effectif : 1=L, 2=A, 3=T, 4+=X.
function indicatorForCount(n: number): string {
  return ["L", "A", "T", "X"][Math.min(Math.max(n, 1), 4) - 1];
}

async function activeStatuses(ctx: QueryCtx) {
  return (await ctx.db.query("dispatchStatuses").withIndex("by_position").collect()).filter((s) => s.active);
}

// Le board : statuts (= colonnes) + patrouilles actives.
export const board = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "dispatch.view");
    const statusDocs = await activeStatuses(ctx);
    const lk = makeLookup(ctx, statusDocs);
    const statuses = statusDocs.map(statusOf);
    const openPatrols = await ctx.db.query("patrols").withIndex("by_open", (q) => q.eq("endedAt", undefined)).collect();
    const patrols = [];
    for (const p of openPatrols) patrols.push(await patrolView(ctx, p, lk));
    patrols.sort((a, b) => a.label.localeCompare(b.label));

    // Colonne "En service" : agents en service qui ne sont dans aucune patrouille.
    const inPatrol = new Set<string>();
    for (const p of patrols) for (const m of p.members) inPatrol.add(m.agentId as string);
    const openSessions = await ctx.db.query("serviceSessions").withIndex("by_open", (q) => q.eq("endedAt", undefined)).collect();
    const onDuty = [];
    const seen = new Set<string>();
    for (const s of openSessions) {
      if (inPatrol.has(s.agentId as string) || seen.has(s.agentId as string)) continue;
      const a = await lk.agent(s.agentId);
      if (!a || a.status !== "ACTIVE") continue;
      seen.add(s.agentId as string);
      onDuty.push({
        agentId: a._id,
        name: `${a.prenomRP} ${a.nomRP}`,
        matricule: a.matricule ?? (a.isOwner ? 0 : null),
        ...(await gradeTag(lk, a)),
      });
    }
    onDuty.sort((a, b) => a.name.localeCompare(b.name));

    const sectors = (await ctx.db.query("dispatchSectors").withIndex("by_position").collect()).filter((s) => s.active).map((s) => s.name);
    // Opérations en cours (la colonne Opération n'apparaît que s'il y en a).
    const openOps = await ctx.db.query("operations").withIndex("by_open", (q) => q.eq("endedAt", undefined)).collect();
    const operations = [];
    for (const o of openOps) {
      const creator = await lk.agent(o.createdBy);
      operations.push({ _id: o._id, name: o.name, createdBy: o.createdBy, startedAt: o.startedAt, creator: creator ? `${creator.prenomRP} ${creator.nomRP}` : "-" });
    }
    operations.sort((a, b) => a.startedAt - b.startedAt);
    return { statuses, patrols, onDuty, sectors, operations };
  },
});

export const myPatrol = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "dispatch.view");
    const found = await myOpenMembership(ctx, agent._id);
    if (!found) return null;
    return { ...(await patrolView(ctx, found.patrol)) };
  },
});

// Statuts seuls (widget TopBar, léger).
export const statusOptions = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "dispatch.view");
    const statuses = (await activeStatuses(ctx)).map((s) => ({ _id: s._id, name: s.name, color: s.color ?? null, icon: s.icon ?? null, group: s.group ?? null, requires: s.requires ?? [], isDefault: s.isDefault === true }));
    const sectors = (await ctx.db.query("dispatchSectors").withIndex("by_position").collect()).filter((s) => s.active).map((s) => s.name);
    return { statuses, sectors };
  },
});

// Types de callsign (indicateur) pour forcer une spécialité à la création.
export const callsigns = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "dispatch.view");
    return (await ctx.db.query("callsignTypes").collect())
      .filter((c) => c.active)
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ _id: c._id, code: c.code, label: c.label, indicator: c.code.charAt(0).toUpperCase() }));
  },
});

async function defaultStatusId(ctx: MutationCtx): Promise<Id<"dispatchStatuses"> | undefined> {
  const statuses = await activeStatuses(ctx);
  return (statuses.find((s) => s.isDefault) ?? statuses[0])?._id;
}

async function recomputeLabel(ctx: MutationCtx, patrolId: Id<"patrols">) {
  const p = await ctx.db.get(patrolId);
  if (!p) return;
  let indicator = p.indicator;
  if (p.callsignTypeId) {
    const cs = await ctx.db.get(p.callsignTypeId);
    indicator = (cs?.code.charAt(0) ?? indicator).toUpperCase();
  } else {
    const count = (await ctx.db.query("patrolMembers").withIndex("by_patrol", (q) => q.eq("patrolId", patrolId)).collect()).length;
    indicator = indicatorForCount(count);
  }
  await ctx.db.patch(patrolId, { indicator, label: `13${indicator}${p.vehicleNumber}` });
}

async function detachAgent(ctx: MutationCtx, agentId: Id<"agents">) {
  const existing = await myOpenMembership(ctx, agentId);
  if (existing) await leaveInternal(ctx, existing.membership._id, existing.patrol);
}

// Journalise une action sur une patrouille (affiché dans son historique).
async function logPatrol(ctx: MutationCtx, patrolId: Id<"patrols">, byAgentId: Id<"agents"> | undefined, kind: string, label: string) {
  await ctx.db.insert("patrolEvents", { patrolId, at: Date.now(), byAgentId, kind, label });
}

async function agentName(ctx: MutationCtx, agentId: Id<"agents">) {
  const a = await ctx.db.get(agentId);
  return a ? `${a.prenomRP} ${a.nomRP}` : "un agent";
}

// Retire un agent de sa patrouille (appelé quand il termine son service).
export async function releaseAgentFromPatrol(ctx: MutationCtx, agentId: Id<"agents">) {
  const found = await myOpenMembership(ctx, agentId);
  if (!found) return;
  const patrolId = found.patrol._id;
  await logPatrol(ctx, patrolId, agentId, "member_remove", `${await agentName(ctx, agentId)} retiré (fin de service)`);
  await leaveInternal(ctx, found.membership._id, found.patrol);
  await recomputeLabel(ctx, patrolId);
}

// Seuls les agents en service peuvent faire partie d'une patrouille.
async function assertOnDuty(ctx: MutationCtx, agentId: Id<"agents">) {
  const open = await ctx.db
    .query("serviceSessions")
    .withIndex("by_agent", (q) => q.eq("agentId", agentId))
    .filter((q) => q.eq(q.field("endedAt"), undefined))
    .first();
  if (!open) {
    const a = await ctx.db.get(agentId);
    throw new Error(`${a ? `${a.prenomRP} ${a.nomRP}` : "Cet agent"} n'est pas en service.`);
  }
}

// Statut par son nom (les colonnes sont fixes : En patrouille, En poursuite, En procédure, Opération, Indisponible).
async function statusByName(ctx: MutationCtx, name: string) {
  return (await ctx.db.query("dispatchStatuses").collect()).find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? null;
}

// Peut éditer : membre de la patrouille, créateur, ou dispatcher (manage).
async function ensureCanEdit(ctx: MutationCtx, agentId: Id<"agents">, patrol: import("./_generated/dataModel").Doc<"patrols">) {
  const mine = await myOpenMembership(ctx, agentId);
  if (mine?.patrol._id === patrol._id) return;
  if (patrol.createdBy === agentId) return;
  const agent = await ctx.db.get(agentId);
  if (agent && (await can(ctx, agent, "dispatch.manage"))) return;
  throw new Error("Action réservée à la patrouille, à son créateur ou à un dispatcher.");
}

export const create = mutation({
  args: {
    vehicleNumber: v.string(), // suffixe (véhicule non enregistré) — ignoré si fleetVehicleId fourni
    fleetVehicleId: v.optional(v.id("fleetVehicles")),
    memberIds: v.array(v.id("agents")), // agents présents (le créateur n'est PAS ajouté d'office)
    callsignTypeId: v.optional(v.id("callsignTypes")),
    color: v.optional(v.string()),
    detail: v.optional(v.string()),
    fields: v.optional(FIELDS_V),
  },
  handler: async (ctx, { vehicleNumber, fleetVehicleId, memberIds, callsignTypeId, color, detail, fields }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "dispatch.self");
    const members = [...new Set(memberIds)];
    if (members.length === 0) throw new Error("Sélectionnez au moins un agent présent.");
    // Le numéro vient du véhicule LSPD (2 derniers chiffres du toit), sinon
    // d'une saisie libre pour un véhicule non enregistré.
    let numPadded: string;
    if (fleetVehicleId) {
      const veh = await ctx.db.get(fleetVehicleId);
      if (!veh) throw new Error("Véhicule LSPD introuvable.");
      numPadded = roofToNumber(veh.roofNumber);
    } else {
      const num = vehicleNumber.replace(/[^0-9]/g, "").slice(0, 2);
      if (!num) throw new Error("Numéro de véhicule requis.");
      numPadded = num.padStart(2, "0");
    }

    let indicator: string;
    if (callsignTypeId) {
      const cs = await ctx.db.get(callsignTypeId);
      if (!cs) throw new Error("Type de patrouille introuvable.");
      indicator = cs.code.charAt(0).toUpperCase();
    } else {
      indicator = indicatorForCount(members.length);
    }
    const now = Date.now();
    // Le statut initial peut exiger des champs (ex. secteur pour « En patrouille »).
    const initialStatusId = await defaultStatusId(ctx);
    const initialStatus = initialStatusId ? await ctx.db.get(initialStatusId) : null;
    if (initialStatus) assertRequired(initialStatus, fields);
    const patrolId = await ctx.db.insert("patrols", {
      callsignTypeId, indicator, vehicleNumber: numPadded, fleetVehicleId, label: `13${indicator}${numPadded}`, color,
      statusId: initialStatusId, detail: detail?.trim() || undefined,
      fields: initialStatus ? pickFields(initialStatus, fields) : undefined,
      statusSince: now, startedAt: now, createdBy: agent._id,
    });
    for (const id of members) await assertOnDuty(ctx, id);
    // Chaque membre est sorti de son ancienne unité.
    for (let i = 0; i < members.length; i++) {
      await detachAgent(ctx, members[i]);
      await ctx.db.insert("patrolMembers", { patrolId, agentId: members[i], at: now });
    }
    // Une patrouille prenant un véhicule LSPD ouvre une sortie.
    if (fleetVehicleId) await openTrip(ctx, patrolId, fleetVehicleId, agent._id, members);
    await logPatrol(ctx, patrolId, agent._id, "created", `Patrouille créée (${members.length} agent${members.length > 1 ? "s" : ""})`);
    return patrolId;
  },
});

// Plus petit numéro de véhicule libre (01..99) parmi les patrouilles ouvertes.
async function nextFreeVehicleNumber(ctx: MutationCtx): Promise<string> {
  const open = await ctx.db.query("patrols").withIndex("by_open", (q) => q.eq("endedAt", undefined)).collect();
  const used = new Set(open.map((p) => p.vehicleNumber));
  for (let i = 1; i <= 99; i++) {
    const n = String(i).padStart(2, "0");
    if (!used.has(n)) return n;
  }
  return "00";
}

// Glisser un agent "En service" vers une colonne : crée une patrouille solo (Lincoln) avec ce statut.
export const createForAgent = mutation({
  args: { agentId: v.id("agents"), statusId: v.id("dispatchStatuses"), fields: v.optional(FIELDS_V) },
  handler: async (ctx, { agentId, statusId, fields }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "dispatch.self");
    const target = await ctx.db.get(agentId);
    if (!target) throw new Error("Agent introuvable.");
    if (await myOpenMembership(ctx, agentId)) throw new Error("Cet agent est déjà dans une patrouille.");
    await assertOnDuty(ctx, agentId);
    const status = await ctx.db.get(statusId);
    if (!status || !status.active) throw new Error("Statut invalide.");
    assertRequired(status, fields);
    const vehicleNumber = await nextFreeVehicleNumber(ctx);
    const indicator = indicatorForCount(1);
    const now = Date.now();
    const patrolId = await ctx.db.insert("patrols", {
      indicator, vehicleNumber, label: `13${indicator}${vehicleNumber}`,
      statusId, fields: pickFields(status, fields), statusSince: now, startedAt: now, createdBy: agent._id,
    });
    await ctx.db.insert("patrolMembers", { patrolId, agentId, at: now });
    await logPatrol(ctx, patrolId, agent._id, "created", `Patrouille créée avec ${await agentName(ctx, agentId)}`);
    return patrolId;
  },
});

export const addMember = mutation({
  args: { patrolId: v.id("patrols"), agentId: v.id("agents") },
  handler: async (ctx, { patrolId, agentId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "dispatch.self");
    const patrol = await ctx.db.get(patrolId);
    if (!patrol || patrol.endedAt) throw new Error("Patrouille introuvable.");
    await ensureCanEdit(ctx, agent._id, patrol);
    const links = await ctx.db.query("patrolMembers").withIndex("by_patrol", (q) => q.eq("patrolId", patrolId)).collect();
    if (links.some((m) => m.agentId === agentId)) return;
    await assertOnDuty(ctx, agentId);
    await detachAgent(ctx, agentId);
    await ctx.db.insert("patrolMembers", { patrolId, agentId, at: Date.now() });
    await tripAddMember(ctx, patrolId, agentId);
    await logPatrol(ctx, patrolId, agent._id, "member_add", `${await agentName(ctx, agentId)} ajouté`);
    await recomputeLabel(ctx, patrolId);
  },
});

export const removeMember = mutation({
  args: { patrolId: v.id("patrols"), agentId: v.id("agents") },
  handler: async (ctx, { patrolId, agentId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "dispatch.self");
    const patrol = await ctx.db.get(patrolId);
    if (!patrol || patrol.endedAt) return;
    await ensureCanEdit(ctx, agent._id, patrol);
    const link = (await ctx.db.query("patrolMembers").withIndex("by_patrol", (q) => q.eq("patrolId", patrolId)).collect()).find((m) => m.agentId === agentId);
    if (!link) return;
    await logPatrol(ctx, patrolId, agent._id, "member_remove", `${await agentName(ctx, agentId)} retiré`);
    await leaveInternal(ctx, link._id, patrol);
    await recomputeLabel(ctx, patrolId);
  },
});

export const update = mutation({
  args: {
    patrolId: v.id("patrols"),
    vehicleNumber: v.optional(v.string()),
    // null = repasser en véhicule non enregistré ; un id = changer de véhicule LSPD.
    fleetVehicleId: v.optional(v.union(v.id("fleetVehicles"), v.null())),
    color: v.optional(v.union(v.string(), v.null())),
    callsignTypeId: v.optional(v.union(v.id("callsignTypes"), v.null())),
  },
  handler: async (ctx, { patrolId, vehicleNumber, fleetVehicleId, color, callsignTypeId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "dispatch.self");
    const patrol = await ctx.db.get(patrolId);
    if (!patrol || patrol.endedAt) throw new Error("Patrouille introuvable.");
    await ensureCanEdit(ctx, agent._id, patrol);
    const patch: Record<string, unknown> = {};

    // Changement de véhicule LSPD : clôt la sortie courante et en ouvre une
    // nouvelle avec les membres présents. La lettre L/A/T/X ne change pas, seul
    // le numéro suit le nouveau véhicule.
    if (fleetVehicleId !== undefined && fleetVehicleId !== (patrol.fleetVehicleId ?? null)) {
      await closeTrip(ctx, patrolId);
      if (fleetVehicleId) {
        const veh = await ctx.db.get(fleetVehicleId);
        if (!veh) throw new Error("Véhicule LSPD introuvable.");
        patch.fleetVehicleId = fleetVehicleId;
        patch.vehicleNumber = roofToNumber(veh.roofNumber);
        const members = (await ctx.db.query("patrolMembers").withIndex("by_patrol", (q) => q.eq("patrolId", patrolId)).collect()).map((m) => m.agentId);
        await openTrip(ctx, patrolId, fleetVehicleId, agent._id, members);
        await logPatrol(ctx, patrolId, agent._id, "vehicle", `Véhicule ${veh.modele} · ${veh.plaque} (13x${roofToNumber(veh.roofNumber)})`);
      } else {
        patch.fleetVehicleId = undefined;
      }
    }

    if (vehicleNumber !== undefined && patch.vehicleNumber === undefined) {
      const num = vehicleNumber.replace(/[^0-9]/g, "").slice(0, 2);
      if (!num) throw new Error("Numéro de véhicule requis.");
      patch.vehicleNumber = num.padStart(2, "0");
    }
    if (color !== undefined) patch.color = color ?? undefined;
    if (callsignTypeId !== undefined) patch.callsignTypeId = callsignTypeId ?? undefined;
    await ctx.db.patch(patrolId, patch);
    if (patch.vehicleNumber && fleetVehicleId === undefined) await logPatrol(ctx, patrolId, agent._id, "vehicle", `Véhicule n° ${patch.vehicleNumber}`);
    if (color !== undefined) await logPatrol(ctx, patrolId, agent._id, "color", color ? "Couleur modifiée" : "Couleur retirée");
    await recomputeLabel(ctx, patrolId);
  },
});

// Détail libre affiché sur la carte (remplace l'ancienne "raison").
export const setDetail = mutation({
  args: { patrolId: v.id("patrols"), detail: v.string() },
  handler: async (ctx, { patrolId, detail }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "dispatch.self");
    const patrol = await ctx.db.get(patrolId);
    if (!patrol || patrol.endedAt) throw new Error("Patrouille introuvable.");
    await ensureCanEdit(ctx, agent._id, patrol);
    await ctx.db.patch(patrolId, { detail: detail.trim() || undefined });
    await logPatrol(ctx, patrolId, agent._id, "detail", detail.trim() ? `Détail : ${detail.trim()}` : "Détail effacé");
  },
});

async function leaveInternal(ctx: MutationCtx, membershipId: Id<"patrolMembers">, patrol: import("./_generated/dataModel").Doc<"patrols">) {
  const membership = await ctx.db.get(membershipId);
  await ctx.db.delete(membershipId);
  const rest = await ctx.db.query("patrolMembers").withIndex("by_patrol", (q) => q.eq("patrolId", patrol._id)).collect();
  if (rest.length === 0) {
    // Dernier membre parti : la patrouille se termine, sa sortie aussi (rentrée).
    await ctx.db.patch(patrol._id, { endedAt: Date.now() });
    await closeTrip(ctx, patrol._id);
  } else if (membership) {
    await tripRemoveMember(ctx, patrol._id, membership.agentId);
  }
}

export const join = mutation({
  args: { patrolId: v.id("patrols") },
  handler: async (ctx, { patrolId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "dispatch.self");
    const patrol = await ctx.db.get(patrolId);
    if (!patrol || patrol.endedAt) throw new Error("Patrouille introuvable.");
    await assertOnDuty(ctx, agent._id);
    const current = await myOpenMembership(ctx, agent._id);
    if (current) {
      if (current.patrol._id === patrolId) return;
      await leaveInternal(ctx, current.membership._id, current.patrol);
    }
    await ctx.db.insert("patrolMembers", { patrolId, agentId: agent._id, at: Date.now() });
    await tripAddMember(ctx, patrolId, agent._id);
    await logPatrol(ctx, patrolId, agent._id, "member_add", `${await agentName(ctx, agent._id)} a rejoint`);
    await recomputeLabel(ctx, patrolId);
  },
});

export const leave = mutation({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "dispatch.self");
    const found = await myOpenMembership(ctx, agent._id);
    if (!found) return;
    const pid = found.patrol._id;
    await logPatrol(ctx, pid, agent._id, "member_remove", `${await agentName(ctx, agent._id)} a quitté`);
    await leaveInternal(ctx, found.membership._id, found.patrol);
    await recomputeLabel(ctx, pid);
  },
});

export const setStatus = mutation({
  args: { patrolId: v.id("patrols"), statusId: v.id("dispatchStatuses"), fields: v.optional(FIELDS_V) },
  handler: async (ctx, { patrolId, statusId, fields }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "dispatch.self");
    const patrol = await ctx.db.get(patrolId);
    if (!patrol || patrol.endedAt) throw new Error("Patrouille introuvable.");
    await ensureCanEdit(ctx, agent._id, patrol);
    const status = await ctx.db.get(statusId);
    if (!status || !status.active) throw new Error("Statut invalide.");
    // Si on reste sur le même statut sans nouveaux champs, on garde les valeurs existantes.
    const merged = fields ?? (patrol.statusId === statusId ? (patrol.fields as PatrolFields | undefined) : undefined);
    assertRequired(status, merged);
    // Sortir d'une zone d'opération dès qu'on change pour un autre statut.
    await ctx.db.patch(patrolId, { statusId, fields: pickFields(status, merged), operationId: undefined, statusSince: Date.now() });
    const summary = (status.requires ?? []).map((k) => (merged ?? {})[k as keyof PatrolFields]).filter(Boolean).join(" · ");
    await logPatrol(ctx, patrolId, agent._id, "status", `Statut : ${status.name}${summary ? ` (${summary})` : ""}`);
  },
});

// ============ OPÉRATIONS ============
export const operationCreate = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "dispatch.operations");
    const clean = name.trim();
    if (!clean) throw new Error("Nom de l'opération requis.");
    const opId = await ctx.db.insert("operations", { name: clean, createdBy: agent._id, startedAt: Date.now() });
    await notify(ctx, "operation.start", {
      title: `Opération lancée · ${clean}`,
      color: NOTIFY_COLOR.info,
      footer: `Ouverte par ${agent.prenomRP} ${agent.nomRP}`,
    });
    return opId;
  },
});

// Fin d'opération : les patrouilles engagées repassent en « Indisponible » avec le motif « Fin d'opération ».
export const operationEnd = mutation({
  args: { operationId: v.id("operations") },
  handler: async (ctx, { operationId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "dispatch.operations");
    const op = await ctx.db.get(operationId);
    if (!op || op.endedAt) return;
    if (op.createdBy !== agent._id && !(await can(ctx, agent, "dispatch.manage"))) {
      throw new Error("Seul le créateur de l'opération ou un dispatcher peut la terminer.");
    }
    const indispo = await statusByName(ctx, "Indisponible");
    const now = Date.now();
    for (const p of await ctx.db.query("patrols").withIndex("by_open", (q) => q.eq("endedAt", undefined)).collect()) {
      if (p.operationId !== operationId) continue;
      await ctx.db.patch(p._id, {
        operationId: undefined,
        statusId: indispo?._id ?? p.statusId,
        fields: { raison: "Fin d'opération" },
        detail: undefined,
        statusSince: now,
      });
      await logPatrol(ctx, p._id, agent._id, "operation", `Fin de l'opération « ${op.name} » - repli en Indisponible`);
    }
    await ctx.db.patch(operationId, { endedAt: now });
    await notify(ctx, "operation.end", {
      title: `Opération terminée · ${op.name}`,
      description: `Durée : ${Math.max(1, Math.round((now - op.startedAt) / 60000))} min.`,
      color: NOTIFY_COLOR.muted,
      footer: `Clôturée par ${agent.prenomRP} ${agent.nomRP}`,
    });
  },
});

// Affecte une patrouille à une opération (statut « Opération »).
export const assignToOperation = mutation({
  args: { patrolId: v.id("patrols"), operationId: v.id("operations") },
  handler: async (ctx, { patrolId, operationId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "dispatch.self");
    const patrol = await ctx.db.get(patrolId);
    if (!patrol || patrol.endedAt) throw new Error("Patrouille introuvable.");
    await ensureCanEdit(ctx, agent._id, patrol);
    const op = await ctx.db.get(operationId);
    if (!op || op.endedAt) throw new Error("Opération introuvable.");
    const opStatus = await statusByName(ctx, "Opération");
    await ctx.db.patch(patrolId, {
      operationId,
      statusId: opStatus?._id ?? patrol.statusId,
      fields: undefined,
      statusSince: Date.now(),
    });
    await logPatrol(ctx, patrolId, agent._id, "operation", `Engagée dans l'opération « ${op.name} »`);
  },
});

export const dissolve = mutation({
  args: { patrolId: v.id("patrols") },
  handler: async (ctx, { patrolId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "dispatch.self");
    const patrol = await ctx.db.get(patrolId);
    if (!patrol || patrol.endedAt) return;
    await ensureCanEdit(ctx, agent._id, patrol);
    const members = await ctx.db.query("patrolMembers").withIndex("by_patrol", (q) => q.eq("patrolId", patrolId)).collect();
    await logPatrol(ctx, patrolId, agent._id, "ended", "Patrouille dissoute");
    for (const m of members) await ctx.db.delete(m._id);
    await ctx.db.patch(patrolId, { endedAt: Date.now() });
    // Dissolution manuelle : la sortie se clôt aussi (rentrée).
    await closeTrip(ctx, patrolId);
  },
});

// ============ CONFIG (statuts) ============
export const configList = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rbac.manage");
    const statuses = (await ctx.db.query("dispatchStatuses").withIndex("by_position").collect()).map((s) => ({ _id: s._id, name: s.name, color: s.color ?? null, isDefault: s.isDefault === true, group: s.group ?? "", icon: s.icon ?? "", requires: (s.requires ?? []).join(", "), active: s.active }));
    const sectors = (await ctx.db.query("dispatchSectors").withIndex("by_position").collect()).map((s) => ({ _id: s._id, name: s.name, active: s.active }));
    return { statuses, sectors };
  },
});

export const statusUpsert = mutation({
  args: {
    id: v.optional(v.id("dispatchStatuses")), name: v.string(), color: v.optional(v.string()),
    isDefault: v.boolean(), active: v.boolean(),
    group: v.optional(v.string()), icon: v.optional(v.string()), requires: v.optional(v.string()),
  },
  handler: async (ctx, { id, name, color, isDefault, active, group, icon, requires }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rbac.manage");
    if (isDefault) {
      for (const s of await ctx.db.query("dispatchStatuses").collect()) {
        if (s.isDefault && s._id !== id) await ctx.db.patch(s._id, { isDefault: false });
      }
    }
    // `requires` est saisi en liste séparée par des virgules dans l'éditeur de config.
    const reqList = (requires ?? "").split(",").map((x) => x.trim()).filter((x) => x && x in FIELD_LABELS);
    const common = { name, color, isDefault, active, group: group?.trim() || undefined, icon: icon?.trim() || undefined, requires: reqList };
    if (id) { await ctx.db.patch(id, common); return id; }
    const count = (await ctx.db.query("dispatchStatuses").collect()).length;
    return await ctx.db.insert("dispatchStatuses", { ...common, position: count });
  },
});

export const sectorUpsert = mutation({
  args: { id: v.optional(v.id("dispatchSectors")), name: v.string(), active: v.boolean() },
  handler: async (ctx, { id, name, active }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rbac.manage");
    if (id) { await ctx.db.patch(id, { name, active }); return id; }
    const count = (await ctx.db.query("dispatchSectors").collect()).length;
    return await ctx.db.insert("dispatchSectors", { name, active, position: count });
  },
});

export const sectorRemove = mutation({
  args: { id: v.id("dispatchSectors") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rbac.manage");
    await ctx.db.delete(id);
  },
});

export const statusRemove = mutation({
  args: { id: v.id("dispatchStatuses") },
  handler: async (ctx, { id }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rbac.manage");
    for (const p of await ctx.db.query("patrols").withIndex("by_open", (q) => q.eq("endedAt", undefined)).collect()) {
      if (p.statusId === id) await ctx.db.patch(p._id, { statusId: undefined });
    }
    await ctx.db.delete(id);
  },
});

// ============ HISTORIQUE ============
// Patrouilles terminées (les plus récentes d'abord).
export const history = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "dispatch.view");
    const all = await ctx.db.query("patrols").order("desc").take(300);
    const ended = all.filter((p) => p.endedAt != null).slice(0, 60);
    const out = [];
    for (const p of ended) {
      // Les membres sont supprimés à la dissolution : on repasse par le journal.
      const events = await ctx.db.query("patrolEvents").withIndex("by_patrol", (q) => q.eq("patrolId", p._id)).collect();
      out.push({
        _id: p._id,
        label: p.label,
        color: p.color ?? null,
        startedAt: p.startedAt,
        endedAt: p.endedAt!,
        eventCount: events.length,
      });
    }
    out.sort((a, b) => b.endedAt - a.endedAt);
    return out;
  },
});

// Journal d'une patrouille (active ou terminée).
export const events = query({
  args: { patrolId: v.id("patrols") },
  handler: async (ctx, { patrolId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "dispatch.view");
    const rows = await ctx.db.query("patrolEvents").withIndex("by_patrol", (q) => q.eq("patrolId", patrolId)).collect();
    rows.sort((a, b) => b.at - a.at);
    const out = [];
    for (const r of rows.slice(0, 100)) {
      out.push({
        _id: r._id,
        at: r.at,
        kind: r.kind,
        label: r.label,
        by: r.byAgentId ? (await agentLabel(ctx, r.byAgentId)).name : null,
      });
    }
    return out;
  },
});
