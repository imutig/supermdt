import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireDivView, requireDivPerm, requireCaseRead, requireCaseWrite, agentName } from "./lib/detectiveAccess";
import { hasPerm } from "./lib/divisionAccess";
import { writeAudit } from "./lib/audit";

// Registre des personnes du bureau : suspects, témoins, victimes, membres de gang
// (entrés par la GND). Reliables aux enquêtes via dbCasePersons. Fiche victime
// enrichie pour la HRD (cause du décès, autopsie, proches).

const PERSON_ROLE = v.union(
  v.literal("SUSPECT"), v.literal("WITNESS"), v.literal("VICTIM"),
  v.literal("GANG_MEMBER"), v.literal("POI"),
);
const CASE_ROLE = v.union(v.literal("SUSPECT"), v.literal("VICTIM"), v.literal("WITNESS"), v.literal("POI"));

// ============ REGISTRE ============

export const listPersons = query({
  args: {
    divisionId: v.id("divisions"),
    role: v.optional(PERSON_ROLE),
    gangId: v.optional(v.id("dbGangs")),
    q: v.optional(v.string()),
  },
  handler: async (ctx, { divisionId, role, gangId, q }) => {
    await requireDivView(ctx, divisionId);
    const query = (q ?? "").trim().toLowerCase();
    let rows = (await ctx.db.query("dbPersons").withIndex("by_division", (x) => x.eq("divisionId", divisionId)).take(2000))
      .filter((p) => !p.deletedAt);
    if (role) rows = rows.filter((p) => p.role === role);
    if (gangId) rows = rows.filter((p) => p.gangId === gangId);
    if (query) rows = rows.filter((p) => `${p.name} ${p.alias ?? ""}`.toLowerCase().includes(query));
    rows.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    const gangs = new Map<string, string>();
    for (const p of rows) if (p.gangId && !gangs.has(p.gangId as string)) { const g = await ctx.db.get(p.gangId); if (g) gangs.set(p.gangId as string, g.name); }
    return rows.map((p) => ({
      _id: p._id, name: p.name, alias: p.alias ?? "", role: p.role ?? null,
      photoUrl: p.photoUrl ?? null, wantedLevel: p.wantedLevel ?? "", deceased: !!p.deceased,
      gangId: p.gangId ?? null, gangName: p.gangId ? (gangs.get(p.gangId as string) ?? null) : null,
      gangRoleLabel: p.gangRoleLabel ?? "", citizenId: p.citizenId ?? null,
    }));
  },
});

export const getPerson = query({
  args: { personId: v.id("dbPersons") },
  handler: async (ctx, { personId }) => {
    const p = await ctx.db.get(personId);
    if (!p || p.deletedAt) throw new ConvexError("Personne introuvable.");
    const { agent, division } = await requireDivView(ctx, p.divisionId);
    const canSensitive = await hasPerm(ctx, agent, division, "db.sensitive");
    const gang = p.gangId ? await ctx.db.get(p.gangId) : null;
    const gangRank = p.gangRankId ? await ctx.db.get(p.gangRankId) : null;
    // Enquêtes liées (masque les confidentielles si non habilité).
    const links = await ctx.db.query("dbCasePersons").withIndex("by_person", (x) => x.eq("personId", personId)).collect();
    const cases = [];
    for (const l of links) {
      const c = await ctx.db.get(l.caseId);
      if (!c || c.deletedAt) continue;
      if (c.confidential && !canSensitive) continue;
      cases.push({ caseId: c._id, number: c.number, title: c.title, status: c.status, caseRole: l.caseRole });
    }
    return {
      _id: p._id, divisionId: p.divisionId, name: p.name, alias: p.alias ?? "",
      citizenId: p.citizenId ?? null, role: p.role ?? null, notes: p.notes ?? "",
      photoUrl: p.photoUrl ?? null, mediaUrls: p.mediaUrls ?? [], wantedLevel: p.wantedLevel ?? "",
      gangId: p.gangId ?? null, gang: gang && !gang.deletedAt ? { _id: gang._id, name: gang.name } : null,
      gangRankId: p.gangRankId ?? null, gangRankName: gangRank?.name ?? null, gangRoleLabel: p.gangRoleLabel ?? "",
      deceased: !!p.deceased, victimCause: p.victimCause ?? "", victimAutopsy: p.victimAutopsy ?? "", victimNextOfKin: p.victimNextOfKin ?? "",
      authorName: p.authorName, at: p.at, cases,
      canWrite: await hasPerm(ctx, agent, division, "db.registry"),
      canDelete: await hasPerm(ctx, agent, division, "db.delete"),
    };
  },
});

const PERSON_FIELDS = {
  name: v.string(),
  alias: v.optional(v.string()),
  citizenId: v.optional(v.union(v.id("citizens"), v.null())),
  role: v.optional(v.union(PERSON_ROLE, v.null())),
  notes: v.optional(v.string()),
  photoUrl: v.optional(v.union(v.string(), v.null())),
  mediaUrls: v.optional(v.array(v.string())),
  gangId: v.optional(v.union(v.id("dbGangs"), v.null())),
  gangRankId: v.optional(v.union(v.id("dbGangRanks"), v.null())),
  gangRoleLabel: v.optional(v.string()),
  wantedLevel: v.optional(v.string()),
  deceased: v.optional(v.boolean()),
  victimCause: v.optional(v.string()),
  victimAutopsy: v.optional(v.string()),
  victimNextOfKin: v.optional(v.string()),
};

export const createPerson = mutation({
  args: { divisionId: v.id("divisions"), ...PERSON_FIELDS },
  handler: async (ctx, { divisionId, ...f }) => {
    const { agent } = await requireDivPerm(ctx, divisionId, "db.registry");
    if (!f.name.trim()) throw new ConvexError("Nom requis.");
    const id = await ctx.db.insert("dbPersons", {
      divisionId, name: f.name.trim(), alias: f.alias?.trim() || undefined,
      citizenId: f.citizenId ?? undefined, role: f.role ?? undefined, notes: f.notes,
      photoUrl: f.photoUrl ?? undefined, mediaUrls: f.mediaUrls,
      gangId: f.gangId ?? undefined, gangRankId: f.gangRankId ?? undefined, gangRoleLabel: f.gangRoleLabel?.trim() || undefined,
      wantedLevel: f.wantedLevel?.trim() || undefined, deceased: f.deceased,
      victimCause: f.victimCause, victimAutopsy: f.victimAutopsy, victimNextOfKin: f.victimNextOfKin,
      createdBy: agent._id, authorName: agentName(agent), at: Date.now(),
    });
    await writeAudit(ctx, agent, { action: "detective.person_create", resourceType: "dbPerson", resourceId: id, resourceLabel: f.name.trim() });
    return id;
  },
});

export const updatePerson = mutation({
  args: { personId: v.id("dbPersons"), ...PERSON_FIELDS, name: v.optional(v.string()) },
  handler: async (ctx, { personId, ...patch }) => {
    const p = await ctx.db.get(personId);
    if (!p || p.deletedAt) return;
    const { agent } = await requireDivPerm(ctx, p.divisionId, "db.registry");
    const up: Record<string, unknown> = {};
    const t = (s?: string) => (s === undefined ? undefined : (s.trim() || undefined));
    if (patch.name !== undefined) { if (!patch.name.trim()) throw new ConvexError("Nom requis."); up.name = patch.name.trim(); }
    if (patch.alias !== undefined) up.alias = t(patch.alias);
    if (patch.citizenId !== undefined) up.citizenId = patch.citizenId ?? undefined;
    if (patch.role !== undefined) up.role = patch.role ?? undefined;
    if (patch.notes !== undefined) up.notes = patch.notes;
    if (patch.photoUrl !== undefined) up.photoUrl = patch.photoUrl ?? undefined;
    if (patch.mediaUrls !== undefined) up.mediaUrls = patch.mediaUrls;
    if (patch.gangId !== undefined) up.gangId = patch.gangId ?? undefined;
    if (patch.gangRankId !== undefined) up.gangRankId = patch.gangRankId ?? undefined;
    if (patch.gangRoleLabel !== undefined) up.gangRoleLabel = t(patch.gangRoleLabel);
    if (patch.wantedLevel !== undefined) up.wantedLevel = t(patch.wantedLevel);
    if (patch.deceased !== undefined) up.deceased = patch.deceased;
    if (patch.victimCause !== undefined) up.victimCause = patch.victimCause;
    if (patch.victimAutopsy !== undefined) up.victimAutopsy = patch.victimAutopsy;
    if (patch.victimNextOfKin !== undefined) up.victimNextOfKin = patch.victimNextOfKin;
    await ctx.db.patch(personId, up);
    await writeAudit(ctx, agent, { action: "detective.person_update", resourceType: "dbPerson", resourceId: personId, resourceLabel: p.name });
  },
});

export const removePerson = mutation({
  args: { personId: v.id("dbPersons") },
  handler: async (ctx, { personId }) => {
    const p = await ctx.db.get(personId);
    if (!p) return;
    const { agent } = await requireDivPerm(ctx, p.divisionId, "db.delete");
    await ctx.db.patch(personId, { deletedAt: Date.now(), deletedBy: agent._id });
    await writeAudit(ctx, agent, { action: "detective.person_delete", resourceType: "dbPerson", resourceId: personId, resourceLabel: p.name });
  },
});

// ============ PERSONNES LIÉES À UNE ENQUÊTE ============

export const casePersons = query({
  args: { caseId: v.id("dbCases") },
  handler: async (ctx, { caseId }) => {
    await requireCaseRead(ctx, caseId);
    const links = await ctx.db.query("dbCasePersons").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect();
    const out = [];
    for (const l of links) {
      const p = await ctx.db.get(l.personId);
      if (!p || p.deletedAt) continue;
      out.push({
        _id: l._id, personId: p._id, caseRole: l.caseRole, note: l.note ?? "",
        name: p.name, alias: p.alias ?? "", photoUrl: p.photoUrl ?? null,
        citizenId: p.citizenId ?? null, deceased: !!p.deceased, wantedLevel: p.wantedLevel ?? "",
      });
    }
    const order: Record<string, number> = { SUSPECT: 0, VICTIM: 1, POI: 2, WITNESS: 3 };
    return out.sort((a, b) => (order[a.caseRole] ?? 9) - (order[b.caseRole] ?? 9) || a.name.localeCompare(b.name, "fr"));
  },
});

// Lie une personne à une enquête. Soit une personne existante (personId), soit
// une création à la volée (name + citizenId? + role?) qui alimente le registre.
export const addCasePerson = mutation({
  args: {
    caseId: v.id("dbCases"),
    caseRole: CASE_ROLE,
    note: v.optional(v.string()),
    personId: v.optional(v.id("dbPersons")),
    name: v.optional(v.string()),
    citizenId: v.optional(v.id("citizens")),
    alias: v.optional(v.string()),
  },
  handler: async (ctx, { caseId, caseRole, note, personId, name, citizenId, alias }) => {
    const { agent, case: c } = await requireCaseWrite(ctx, caseId);
    let pid = personId;
    if (!pid) {
      if (!name?.trim()) throw new ConvexError("Sélectionnez une personne ou saisissez un nom.");
      // Créer une personne à la volée alimente le REGISTRE de la division : exige
      // la permission dédiée (au-delà du simple droit d'écriture sur l'enquête).
      await requireDivPerm(ctx, c.divisionId, "db.registry");
      const roleFromCase = caseRole === "POI" ? "POI" : caseRole;
      pid = await ctx.db.insert("dbPersons", {
        divisionId: c.divisionId, name: name.trim(), alias: alias?.trim() || undefined,
        citizenId, role: roleFromCase, authorName: agentName(agent), createdBy: agent._id, at: Date.now(),
      });
    } else {
      const p = await ctx.db.get(pid);
      if (!p || p.deletedAt) throw new ConvexError("Personne introuvable.");
    }
    const existing = await ctx.db.query("dbCasePersons").withIndex("by_case", (x) => x.eq("caseId", caseId)).collect();
    if (existing.some((l) => l.personId === pid)) throw new ConvexError("Cette personne est déjà liée à l'enquête.");
    const linkId = await ctx.db.insert("dbCasePersons", { caseId, personId: pid, caseRole, note: note?.trim() || undefined });
    const p = await ctx.db.get(pid);
    await ctx.db.insert("dbTimeline", { caseId, at: Date.now(), type: "auto", label: `${caseRole === "VICTIM" ? "Victime" : caseRole === "WITNESS" ? "Témoin" : caseRole === "SUSPECT" ? "Suspect" : "Personne"} ajouté${caseRole === "VICTIM" ? "e" : ""} : ${p?.name ?? ""}`, authorId: agent._id, authorName: agentName(agent) });
    await writeAudit(ctx, agent, { action: "detective.case_person_add", resourceType: "dbCasePerson", resourceId: linkId, resourceLabel: p?.name, metadata: { caseId, caseRole } });
    return linkId;
  },
});

export const updateCasePerson = mutation({
  args: { id: v.id("dbCasePersons"), caseRole: v.optional(CASE_ROLE), note: v.optional(v.string()) },
  handler: async (ctx, { id, caseRole, note }) => {
    const l = await ctx.db.get(id);
    if (!l) return;
    const { agent } = await requireCaseWrite(ctx, l.caseId);
    const up: Record<string, unknown> = {};
    if (caseRole !== undefined) up.caseRole = caseRole;
    if (note !== undefined) up.note = note.trim() || undefined;
    await ctx.db.patch(id, up);
    await writeAudit(ctx, agent, { action: "detective.case_person_update", resourceType: "dbCasePerson", resourceId: id, metadata: { caseId: l.caseId, caseRole } });
  },
});

export const removeCasePerson = mutation({
  args: { id: v.id("dbCasePersons") },
  handler: async (ctx, { id }) => {
    const l = await ctx.db.get(id);
    if (!l) return;
    const { agent } = await requireCaseWrite(ctx, l.caseId);
    await ctx.db.delete(id);
    await writeAudit(ctx, agent, { action: "detective.case_person_remove", resourceType: "dbCasePerson", resourceId: id, metadata: { caseId: l.caseId, personId: l.personId } });
  },
});

// Options du registre pour lier rapidement (recherche par nom/alias).
export const personOptions = query({
  args: { divisionId: v.id("divisions"), q: v.optional(v.string()) },
  handler: async (ctx, { divisionId, q }) => {
    await requireDivView(ctx, divisionId);
    const query = (q ?? "").trim().toLowerCase();
    let rows = (await ctx.db.query("dbPersons").withIndex("by_division", (x) => x.eq("divisionId", divisionId)).take(2000))
      .filter((p) => !p.deletedAt);
    if (query) rows = rows.filter((p) => `${p.name} ${p.alias ?? ""}`.toLowerCase().includes(query));
    return rows.sort((a, b) => a.name.localeCompare(b.name, "fr")).slice(0, 20)
      .map((p) => ({ _id: p._id, name: p.name, alias: p.alias ?? "", role: p.role ?? null }));
  },
});
