import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { hasPerm } from "./lib/divisionAccess";
import {
  agentName, requireDivView, requireDivPerm, loadCase,
  requireCaseRead, requireCaseWrite, addTimeline, notify,
} from "./lib/detectiveAccess";
import { writeAudit } from "./lib/audit";

// Detective Bureau - enquêtes connectées (GND + HRD). Voir SPEC-DETECTIVE-BUREAU.md.
// Les helpers d'accès vivent dans ./lib/detectiveAccess (partagés avec les autres
// modules detective*.ts).

// ============ ENQUÊTES ============

const STATUS = v.union(
  v.literal("OPEN"), v.literal("IN_PROGRESS"), v.literal("SUSPENDED"),
  v.literal("COLD"), v.literal("SOLVED"), v.literal("CLOSED"),
);
const PRIORITY = v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH"), v.literal("CRITICAL"));
const SUBDIV = v.union(v.literal("GND"), v.literal("HRD"));

export const listCases = query({
  args: {
    divisionId: v.id("divisions"),
    status: v.optional(STATUS),
    subDivision: v.optional(SUBDIV),
    q: v.optional(v.string()),
  },
  handler: async (ctx, { divisionId, status, subDivision, q }) => {
    const { agent, division } = await requireDivView(ctx, divisionId);
    const canSensitive = await hasPerm(ctx, agent, division, "db.sensitive");
    const query = (q ?? "").trim().toLowerCase();
    let rows = (await ctx.db.query("dbCases").withIndex("by_division", (x) => x.eq("divisionId", divisionId)).take(2000))
      .filter((c) => !c.deletedAt)
      .filter((c) => canSensitive || !c.confidential);
    if (status) rows = rows.filter((c) => c.status === status);
    if (subDivision) rows = rows.filter((c) => c.subDivision === subDivision);
    if (query) rows = rows.filter((c) => `${c.number} ${c.title}`.toLowerCase().includes(query));
    rows.sort((a, b) => b.at - a.at);
    const leadIds = [...new Set(rows.map((c) => c.leadAgentId).filter(Boolean))] as Id<"agents">[];
    const leads = new Map<string, Doc<"agents">>();
    for (const id of leadIds) { const a = await ctx.db.get(id); if (a) leads.set(id as string, a); }
    return rows.map((c) => {
      const lead = c.leadAgentId ? leads.get(c.leadAgentId as string) : null;
      return {
        _id: c._id, number: c.number, title: c.title, status: c.status, priority: c.priority,
        subDivision: c.subDivision ?? null, confidential: !!c.confidential, at: c.at,
        lead: lead ? { name: agentName(lead), matricule: lead.matricule ?? null } : null,
      };
    });
  },
});

export const getCase = query({
  args: { caseId: v.id("dbCases") },
  handler: async (ctx, { caseId }) => {
    const { agent, division, case: c } = await requireCaseRead(ctx, caseId);
    const lead = c.leadAgentId ? await ctx.db.get(c.leadAgentId) : null;
    const teamRows = await ctx.db.query("dbCaseTeam").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect();
    const team = [];
    for (const t of teamRows) {
      const a = await ctx.db.get(t.agentId);
      if (a) team.push({ _id: t._id, agentId: a._id, name: agentName(a), matricule: a.matricule ?? null });
    }
    return {
      _id: c._id, divisionId: c.divisionId, number: c.number, title: c.title,
      status: c.status, priority: c.priority, subDivision: c.subDivision ?? null,
      confidential: !!c.confidential, synthesis: c.synthesis ?? "", authorName: c.authorName, at: c.at,
      lead: lead ? { agentId: lead._id, name: agentName(lead), matricule: lead.matricule ?? null } : null,
      team,
      canWrite: await hasPerm(ctx, agent, division, "db.cases"),
      canDelete: await hasPerm(ctx, agent, division, "db.delete"),
      canSensitive: await hasPerm(ctx, agent, division, "db.sensitive"),
    };
  },
});

export const createCase = mutation({
  args: {
    divisionId: v.id("divisions"),
    title: v.string(),
    subDivision: v.optional(SUBDIV),
    priority: v.optional(PRIORITY),
    confidential: v.optional(v.boolean()),
    leadAgentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const { agent } = await requireDivPerm(ctx, args.divisionId, "db.cases");
    if (!args.title.trim()) throw new ConvexError("Titre requis.");
    const all = await ctx.db.query("dbCases").withIndex("by_division", (x) => x.eq("divisionId", args.divisionId)).collect();
    const number = all.reduce((m, c) => Math.max(m, c.number), 0) + 1;
    const caseId = await ctx.db.insert("dbCases", {
      divisionId: args.divisionId, number, title: args.title.trim(),
      subDivision: args.subDivision, status: "OPEN", priority: args.priority ?? "MEDIUM",
      leadAgentId: args.leadAgentId, confidential: args.confidential,
      createdBy: agent._id, authorName: agentName(agent), at: Date.now(),
    });
    await addTimeline(ctx, caseId, agent, `Enquête ouverte (#${number})`);
    if (args.leadAgentId && args.leadAgentId !== agent._id) {
      await notify(ctx, args.divisionId, args.leadAgentId, "case_lead", `Vous êtes référent de l'enquête #${number} - ${args.title.trim()}`, caseId);
    }
    await writeAudit(ctx, agent, {
      action: "detective.case_create", resourceType: "dbCase",
      resourceId: caseId, resourceLabel: `#${number} - ${args.title.trim()}`,
    });
    return caseId;
  },
});

export const updateCase = mutation({
  args: {
    caseId: v.id("dbCases"),
    title: v.optional(v.string()),
    subDivision: v.optional(v.union(SUBDIV, v.null())),
    priority: v.optional(PRIORITY),
    confidential: v.optional(v.boolean()),
    leadAgentId: v.optional(v.union(v.id("agents"), v.null())),
  },
  handler: async (ctx, { caseId, ...patch }) => {
    const { agent, case: c } = await requireCaseWrite(ctx, caseId);
    const up: Record<string, unknown> = {};
    if (patch.title !== undefined) { if (!patch.title.trim()) throw new ConvexError("Titre requis."); up.title = patch.title.trim(); }
    if (patch.subDivision !== undefined) up.subDivision = patch.subDivision ?? undefined;
    if (patch.priority !== undefined) up.priority = patch.priority;
    if (patch.confidential !== undefined) up.confidential = patch.confidential;
    if (patch.leadAgentId !== undefined) {
      up.leadAgentId = patch.leadAgentId ?? undefined;
      if (patch.leadAgentId && patch.leadAgentId !== c.leadAgentId && patch.leadAgentId !== agent._id) {
        await notify(ctx, c.divisionId, patch.leadAgentId, "case_lead", `Vous êtes référent de l'enquête #${c.number}`, caseId);
      }
    }
    await ctx.db.patch(caseId, up);
    await writeAudit(ctx, agent, {
      action: "detective.case_update", resourceType: "dbCase",
      resourceId: caseId, resourceLabel: `#${c.number} - ${c.title}`,
    });
  },
});

export const setStatus = mutation({
  args: { caseId: v.id("dbCases"), status: STATUS },
  handler: async (ctx, { caseId, status }) => {
    const { agent, case: c } = await requireCaseWrite(ctx, caseId);
    if (c.status === status) return;
    const LABEL: Record<string, string> = {
      OPEN: "Ouverte", IN_PROGRESS: "En cours", SUSPENDED: "Suspendue",
      COLD: "Classée sans suite (cold case)", SOLVED: "Résolue", CLOSED: "Clôturée",
    };
    await ctx.db.patch(caseId, { status });
    await addTimeline(ctx, caseId, agent, `Statut : ${LABEL[status]}`);
    await writeAudit(ctx, agent, {
      action: "detective.case_status", resourceType: "dbCase",
      resourceId: caseId, resourceLabel: `#${c.number} - ${c.title}`,
      before: c.status, after: status,
    });
  },
});

export const setSynthesis = mutation({
  args: { caseId: v.id("dbCases"), synthesis: v.string() },
  handler: async (ctx, { caseId, synthesis }) => {
    const { agent, case: c } = await requireCaseWrite(ctx, caseId);
    await ctx.db.patch(caseId, { synthesis });
    await writeAudit(ctx, agent, {
      action: "detective.case_synthesis", resourceType: "dbCase",
      resourceId: caseId, resourceLabel: `#${c.number} - ${c.title}`,
    });
  },
});

export const removeCase = mutation({
  args: { caseId: v.id("dbCases") },
  handler: async (ctx, { caseId }) => {
    const c = await loadCase(ctx, caseId);
    const { agent } = await requireDivPerm(ctx, c.divisionId, "db.delete");
    await ctx.db.patch(caseId, { deletedAt: Date.now(), deletedBy: agent._id });
    await writeAudit(ctx, agent, {
      action: "detective.case_delete", resourceType: "dbCase",
      resourceId: caseId, resourceLabel: `#${c.number} - ${c.title}`,
    });
  },
});

// ---------- Équipe ----------

export const addTeamMember = mutation({
  args: { caseId: v.id("dbCases"), agentId: v.id("agents") },
  handler: async (ctx, { caseId, agentId }) => {
    const { agent, case: c } = await requireCaseWrite(ctx, caseId);
    const existing = await ctx.db.query("dbCaseTeam").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect();
    if (existing.some((t) => t.agentId === agentId)) return;
    await ctx.db.insert("dbCaseTeam", { caseId, agentId });
    const a = await ctx.db.get(agentId);
    await addTimeline(ctx, caseId, agent, `${a ? agentName(a) : "Un agent"} ajouté à l'équipe`);
    if (agentId !== agent._id) await notify(ctx, c.divisionId, agentId, "case_team", `Vous êtes assigné à l'enquête #${c.number} - ${c.title}`, caseId);
    await writeAudit(ctx, agent, {
      action: "detective.team_add", resourceType: "dbCase",
      resourceId: caseId, resourceLabel: `#${c.number} - ${c.title}`,
      metadata: { agent: a ? agentName(a) : null },
    });
  },
});

export const removeTeamMember = mutation({
  args: { teamId: v.id("dbCaseTeam") },
  handler: async (ctx, { teamId }) => {
    const row = await ctx.db.get(teamId);
    if (!row) return;
    const { agent } = await requireCaseWrite(ctx, row.caseId);
    await ctx.db.delete(teamId);
    await writeAudit(ctx, agent, {
      action: "detective.team_remove", resourceType: "dbCaseTeam",
      resourceId: teamId,
    });
  },
});

// ---------- Chronologie ----------

export const timeline = query({
  args: { caseId: v.id("dbCases") },
  handler: async (ctx, { caseId }) => {
    await requireCaseRead(ctx, caseId);
    return (await ctx.db.query("dbTimeline").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect())
      .filter((t) => !t.deletedAt)
      .sort((a, b) => b.at - a.at)
      .map((t) => ({ _id: t._id, at: t.at, type: t.type, label: t.label, body: t.body ?? "", authorName: t.authorName }));
  },
});

export const addTimelineEvent = mutation({
  args: { caseId: v.id("dbCases"), label: v.string(), body: v.optional(v.string()) },
  handler: async (ctx, { caseId, label, body }) => {
    const { agent } = await requireCaseWrite(ctx, caseId);
    if (!label.trim()) throw new ConvexError("Intitulé requis.");
    await addTimeline(ctx, caseId, agent, label.trim(), "event", body);
    await writeAudit(ctx, agent, {
      action: "detective.timeline_add", resourceType: "dbTimeline",
      resourceId: caseId, resourceLabel: label.trim(),
    });
  },
});

export const removeTimelineEvent = mutation({
  args: { id: v.id("dbTimeline") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row) return;
    const { agent } = await requireCaseWrite(ctx, row.caseId);
    await ctx.db.patch(id, { deletedAt: Date.now(), deletedBy: agent._id });
    await writeAudit(ctx, agent, {
      action: "detective.timeline_remove", resourceType: "dbTimeline",
      resourceId: id, resourceLabel: row.label,
    });
  },
});

// ---------- To-do / pistes ----------

export const todos = query({
  args: { caseId: v.id("dbCases") },
  handler: async (ctx, { caseId }) => {
    await requireCaseRead(ctx, caseId);
    const rows = (await ctx.db.query("dbTodos").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect())
      .sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || a.order - b.order);
    const out = [];
    for (const t of rows) {
      const a = t.assigneeId ? await ctx.db.get(t.assigneeId) : null;
      out.push({ _id: t._id, text: t.text, done: t.done, order: t.order, assignee: a ? { agentId: a._id, name: agentName(a) } : null });
    }
    return out;
  },
});

export const addTodo = mutation({
  args: { caseId: v.id("dbCases"), text: v.string(), assigneeId: v.optional(v.id("agents")) },
  handler: async (ctx, { caseId, text, assigneeId }) => {
    const { agent, case: c } = await requireCaseWrite(ctx, caseId);
    if (!text.trim()) throw new ConvexError("Texte requis.");
    const all = await ctx.db.query("dbTodos").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect();
    const order = all.reduce((m, t) => Math.max(m, t.order), -1) + 1;
    const todoId = await ctx.db.insert("dbTodos", { caseId, text: text.trim(), done: false, assigneeId, order, createdBy: agent._id, at: Date.now() });
    if (assigneeId && assigneeId !== agent._id) await notify(ctx, c.divisionId, assigneeId, "todo", `Nouvelle piste sur l'enquête #${c.number} : ${text.trim()}`, caseId);
    await writeAudit(ctx, agent, {
      action: "detective.todo_add", resourceType: "dbTodo",
      resourceId: todoId, resourceLabel: text.trim(),
    });
  },
});

export const toggleTodo = mutation({
  args: { id: v.id("dbTodos") },
  handler: async (ctx, { id }) => {
    const t = await ctx.db.get(id);
    if (!t) return;
    const { agent } = await requireCaseWrite(ctx, t.caseId);
    await ctx.db.patch(id, { done: !t.done, doneAt: !t.done ? Date.now() : undefined });
    await writeAudit(ctx, agent, {
      action: "detective.todo_toggle", resourceType: "dbTodo",
      resourceId: id, resourceLabel: t.text, before: t.done, after: !t.done,
    });
  },
});

export const removeTodo = mutation({
  args: { id: v.id("dbTodos") },
  handler: async (ctx, { id }) => {
    const t = await ctx.db.get(id);
    if (!t) return;
    const { agent } = await requireCaseWrite(ctx, t.caseId);
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, {
      action: "detective.todo_remove", resourceType: "dbTodo",
      resourceId: id, resourceLabel: t.text,
    });
  },
});

// ---------- Sous-dossiers ----------

export const folders = query({
  args: { caseId: v.id("dbCases") },
  handler: async (ctx, { caseId }) => {
    await requireCaseRead(ctx, caseId);
    return (await ctx.db.query("dbFolders").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect())
      .sort((a, b) => a.order - b.order)
      .map((f) => ({ _id: f._id, name: f.name, order: f.order }));
  },
});

export const addFolder = mutation({
  args: { caseId: v.id("dbCases"), name: v.string() },
  handler: async (ctx, { caseId, name }) => {
    const { agent } = await requireCaseWrite(ctx, caseId);
    if (!name.trim()) throw new ConvexError("Nom requis.");
    const all = await ctx.db.query("dbFolders").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect();
    const order = all.reduce((m, f) => Math.max(m, f.order), -1) + 1;
    const folderId = await ctx.db.insert("dbFolders", { caseId, name: name.trim(), order, createdBy: agent._id, at: Date.now() });
    await writeAudit(ctx, agent, {
      action: "detective.folder_add", resourceType: "dbFolder",
      resourceId: folderId, resourceLabel: name.trim(),
    });
    return folderId;
  },
});

export const renameFolder = mutation({
  args: { id: v.id("dbFolders"), name: v.string() },
  handler: async (ctx, { id, name }) => {
    const f = await ctx.db.get(id);
    if (!f) return;
    const { agent } = await requireCaseWrite(ctx, f.caseId);
    if (!name.trim()) throw new ConvexError("Nom requis.");
    await ctx.db.patch(id, { name: name.trim() });
    await writeAudit(ctx, agent, {
      action: "detective.folder_rename", resourceType: "dbFolder",
      resourceId: id, before: f.name, after: name.trim(),
    });
  },
});

export const removeFolder = mutation({
  args: { id: v.id("dbFolders") },
  handler: async (ctx, { id }) => {
    const f = await ctx.db.get(id);
    if (!f) return;
    const { agent } = await requireCaseWrite(ctx, f.caseId);
    // Les pièces du dossier repassent à la racine de l'enquête.
    const items = await ctx.db.query("dbItems").withIndex("by_folder", (x) => x.eq("folderId", id)).collect();
    for (const it of items) await ctx.db.patch(it._id, { folderId: undefined });
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, {
      action: "detective.folder_remove", resourceType: "dbFolder",
      resourceId: id, resourceLabel: f.name,
    });
  },
});

// ---------- Pièces (rapports, interrogatoires, auditions, photos, lieux, notes) ----------

const ITEM_TYPE = v.union(
  v.literal("REPORT"), v.literal("INTERROGATION"), v.literal("AUDITION"),
  v.literal("PHOTO"), v.literal("LOCATION"), v.literal("NOTE"),
);

export const items = query({
  args: { caseId: v.id("dbCases"), folderId: v.optional(v.union(v.id("dbFolders"), v.null())) },
  handler: async (ctx, { caseId, folderId }) => {
    await requireCaseRead(ctx, caseId);
    let rows = (await ctx.db.query("dbItems").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect())
      .filter((i) => !i.deletedAt);
    if (folderId !== undefined) rows = rows.filter((i) => (i.folderId ?? null) === (folderId ?? null));
    rows.sort((a, b) => b.at - a.at);
    const out = [];
    for (const i of rows) {
      const subject = i.subjectPersonId ? await ctx.db.get(i.subjectPersonId) : null;
      out.push({
        _id: i._id, type: i.type, folderId: i.folderId ?? null, title: i.title ?? "",
        body: i.body ?? "", mediaUrls: i.mediaUrls ?? [], locX: i.locX ?? null, locY: i.locY ?? null,
        locNote: i.locNote ?? "", authorName: i.authorName, at: i.at,
        subject: subject && !subject.deletedAt ? { _id: subject._id, name: subject.name } : null,
      });
    }
    return out;
  },
});

export const addItem = mutation({
  args: {
    caseId: v.id("dbCases"),
    type: ITEM_TYPE,
    folderId: v.optional(v.id("dbFolders")),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    subjectPersonId: v.optional(v.id("dbPersons")),
    mediaUrls: v.optional(v.array(v.string())),
    locX: v.optional(v.number()),
    locY: v.optional(v.number()),
    locNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { agent } = await requireCaseWrite(ctx, args.caseId);
    const TYPE_LABEL: Record<string, string> = {
      REPORT: "Rapport", INTERROGATION: "Interrogatoire", AUDITION: "Audition",
      PHOTO: "Photo", LOCATION: "Lieu", NOTE: "Note",
    };
    const id = await ctx.db.insert("dbItems", {
      caseId: args.caseId, folderId: args.folderId, type: args.type,
      title: args.title?.trim() || undefined, body: args.body,
      subjectPersonId: args.subjectPersonId, mediaUrls: args.mediaUrls,
      locX: args.locX, locY: args.locY, locNote: args.locNote,
      createdBy: agent._id, authorName: agentName(agent), at: Date.now(),
    });
    await addTimeline(ctx, args.caseId, agent, `${TYPE_LABEL[args.type]} ajouté${args.title ? ` : ${args.title.trim()}` : ""}`);
    await writeAudit(ctx, agent, {
      action: "detective.item_add", resourceType: "dbItem",
      resourceId: id, resourceLabel: args.title?.trim() || TYPE_LABEL[args.type],
      metadata: { type: args.type },
    });
    return id;
  },
});

export const updateItem = mutation({
  args: {
    id: v.id("dbItems"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    folderId: v.optional(v.union(v.id("dbFolders"), v.null())),
    subjectPersonId: v.optional(v.union(v.id("dbPersons"), v.null())),
    mediaUrls: v.optional(v.array(v.string())),
    locX: v.optional(v.number()),
    locY: v.optional(v.number()),
    locNote: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const it = await ctx.db.get(id);
    if (!it || it.deletedAt) return;
    const { agent } = await requireCaseWrite(ctx, it.caseId);
    const up: Record<string, unknown> = {};
    if (patch.title !== undefined) up.title = patch.title.trim() || undefined;
    if (patch.body !== undefined) up.body = patch.body;
    if (patch.folderId !== undefined) up.folderId = patch.folderId ?? undefined;
    if (patch.subjectPersonId !== undefined) up.subjectPersonId = patch.subjectPersonId ?? undefined;
    if (patch.mediaUrls !== undefined) up.mediaUrls = patch.mediaUrls;
    if (patch.locX !== undefined) up.locX = patch.locX;
    if (patch.locY !== undefined) up.locY = patch.locY;
    if (patch.locNote !== undefined) up.locNote = patch.locNote;
    await ctx.db.patch(id, up);
    await writeAudit(ctx, agent, {
      action: "detective.item_update", resourceType: "dbItem",
      resourceId: id, resourceLabel: it.title || undefined,
    });
  },
});

export const removeItem = mutation({
  args: { id: v.id("dbItems") },
  handler: async (ctx, { id }) => {
    const it = await ctx.db.get(id);
    if (!it) return;
    const { agent } = await requireCaseWrite(ctx, it.caseId);
    await ctx.db.patch(id, { deletedAt: Date.now(), deletedBy: agent._id });
    await writeAudit(ctx, agent, {
      action: "detective.item_remove", resourceType: "dbItem",
      resourceId: id, resourceLabel: it.title || undefined,
    });
  },
});

// ---------- Casier de preuves ----------

const EVIDENCE_TYPE = v.union(v.literal("PHYSIQUE"), v.literal("NUMERIQUE"), v.literal("TEMOIGNAGE"), v.literal("AUTRE"));

export const evidence = query({
  args: { caseId: v.id("dbCases") },
  handler: async (ctx, { caseId }) => {
    await requireCaseRead(ctx, caseId);
    return (await ctx.db.query("dbEvidence").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect())
      .filter((e) => !e.deletedAt)
      .sort((a, b) => b.at - a.at)
      .map((e) => ({
        _id: e._id, label: e.label, evidenceType: e.evidenceType ?? null, description: e.description ?? "",
        sealNumber: e.sealNumber ?? "", storageLoc: e.storageLoc ?? "", mediaUrls: e.mediaUrls ?? [],
        authorName: e.authorName, at: e.at,
      }));
  },
});

export const addEvidence = mutation({
  args: {
    caseId: v.id("dbCases"),
    label: v.string(),
    evidenceType: v.optional(EVIDENCE_TYPE),
    description: v.optional(v.string()),
    sealNumber: v.optional(v.string()),
    storageLoc: v.optional(v.string()),
    mediaUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { agent } = await requireCaseWrite(ctx, args.caseId);
    if (!args.label.trim()) throw new ConvexError("Libellé requis.");
    const id = await ctx.db.insert("dbEvidence", {
      caseId: args.caseId, label: args.label.trim(), evidenceType: args.evidenceType,
      description: args.description, sealNumber: args.sealNumber?.trim() || undefined,
      storageLoc: args.storageLoc?.trim() || undefined, mediaUrls: args.mediaUrls,
      createdBy: agent._id, authorName: agentName(agent), at: Date.now(),
    });
    await addTimeline(ctx, args.caseId, agent, `Preuve scellée : ${args.label.trim()}`);
    await writeAudit(ctx, agent, {
      action: "detective.evidence_add", resourceType: "dbEvidence",
      resourceId: id, resourceLabel: args.label.trim(),
    });
    return id;
  },
});

export const updateEvidence = mutation({
  args: {
    id: v.id("dbEvidence"),
    label: v.optional(v.string()),
    evidenceType: v.optional(v.union(EVIDENCE_TYPE, v.null())),
    description: v.optional(v.string()),
    sealNumber: v.optional(v.string()),
    storageLoc: v.optional(v.string()),
    mediaUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { id, ...patch }) => {
    const e = await ctx.db.get(id);
    if (!e || e.deletedAt) return;
    const { agent } = await requireCaseWrite(ctx, e.caseId);
    const up: Record<string, unknown> = {};
    if (patch.label !== undefined) { if (!patch.label.trim()) throw new ConvexError("Libellé requis."); up.label = patch.label.trim(); }
    if (patch.evidenceType !== undefined) up.evidenceType = patch.evidenceType ?? undefined;
    if (patch.description !== undefined) up.description = patch.description;
    if (patch.sealNumber !== undefined) up.sealNumber = patch.sealNumber.trim() || undefined;
    if (patch.storageLoc !== undefined) up.storageLoc = patch.storageLoc.trim() || undefined;
    if (patch.mediaUrls !== undefined) up.mediaUrls = patch.mediaUrls;
    await ctx.db.patch(id, up);
    await writeAudit(ctx, agent, {
      action: "detective.evidence_update", resourceType: "dbEvidence",
      resourceId: id, resourceLabel: e.label,
    });
  },
});

export const removeEvidence = mutation({
  args: { id: v.id("dbEvidence") },
  handler: async (ctx, { id }) => {
    const e = await ctx.db.get(id);
    if (!e) return;
    const { agent } = await requireCaseWrite(ctx, e.caseId);
    await ctx.db.patch(id, { deletedAt: Date.now(), deletedBy: agent._id });
    await writeAudit(ctx, agent, {
      action: "detective.evidence_remove", resourceType: "dbEvidence",
      resourceId: id, resourceLabel: e.label,
    });
  },
});

// ---------- Véhicules liés à l'enquête ----------

export const caseVehicles = query({
  args: { caseId: v.id("dbCases") },
  handler: async (ctx, { caseId }) => {
    await requireCaseRead(ctx, caseId);
    const rows = await ctx.db.query("dbCaseVehicles").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect();
    const out = [];
    for (const r of rows) {
      const veh = r.vehicleId ? await ctx.db.get(r.vehicleId) : null;
      out.push({
        _id: r._id, vehicleId: r.vehicleId ?? null,
        plaque: veh && !veh.deletedAt ? veh.plaque : (r.plaque ?? ""),
        label: r.label ?? (veh && !veh.deletedAt ? veh.modele : ""),
        note: r.note ?? "",
      });
    }
    return out;
  },
});

export const addCaseVehicle = mutation({
  args: {
    caseId: v.id("dbCases"),
    vehicleId: v.optional(v.id("vehicles")),
    plaque: v.optional(v.string()),
    label: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { caseId, vehicleId, plaque, label, note }) => {
    const { agent } = await requireCaseWrite(ctx, caseId);
    if (!vehicleId && !plaque?.trim()) throw new ConvexError("Véhicule ou plaque requis.");
    const vehRowId = await ctx.db.insert("dbCaseVehicles", {
      caseId, vehicleId, plaque: plaque?.trim() || undefined,
      label: label?.trim() || undefined, note: note?.trim() || undefined,
    });
    await writeAudit(ctx, agent, {
      action: "detective.vehicle_add", resourceType: "dbCaseVehicle",
      resourceId: vehRowId, resourceLabel: plaque?.trim() || label?.trim() || undefined,
    });
    return vehRowId;
  },
});

export const removeCaseVehicle = mutation({
  args: { id: v.id("dbCaseVehicles") },
  handler: async (ctx, { id }) => {
    const r = await ctx.db.get(id);
    if (!r) return;
    const { agent } = await requireCaseWrite(ctx, r.caseId);
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, {
      action: "detective.vehicle_remove", resourceType: "dbCaseVehicle",
      resourceId: id, resourceLabel: r.plaque || r.label || undefined,
    });
  },
});
