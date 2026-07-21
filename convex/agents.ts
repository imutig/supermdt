import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { assertOutranks, getCurrentAgent, requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";

function makeLogin(prenom: string, nom: string) {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  return `${norm(prenom)}.${norm(nom)}`;
}

// Agent courant + grade + divisions + statut de service.
export const me = query({
  args: {},
  handler: async (ctx) => {
    const agent = await getCurrentAgent(ctx);
    if (!agent) return null;
    const grade = agent.gradeId ? await ctx.db.get(agent.gradeId) : null;
    const divLinks = await ctx.db
      .query("agentDivisions")
      .withIndex("by_agent", (q) => q.eq("agentId", agent._id))
      .collect();
    const divisions = [];
    for (const l of divLinks) {
      const d = await ctx.db.get(l.divisionId);
      if (d) divisions.push(d);
    }
    const openSession = await ctx.db
      .query("serviceSessions")
      .withIndex("by_agent", (q) => q.eq("agentId", agent._id))
      .filter((q) => q.eq(q.field("endedAt"), undefined))
      .first();
    return {
      agent,
      grade,
      divisions,
      onDuty: !!openSession,
      dutySince: openSession?.startedAt,
    };
  },
});

// Ensemble des slugs de permission effectifs de l'agent courant (owner = tout).
// Sert au feedback UI (griser/désactiver les actions non autorisées).
export const myPermissions = query({
  args: {},
  handler: async (ctx) => {
    const agent = await getCurrentAgent(ctx);
    if (!agent) return [];
    if (agent.isOwner) {
      const all = await ctx.db.query("permissions").collect();
      return all.map((p) => p.slug);
    }
    if (agent.status !== "ACTIVE") return [];
    const slugs = new Set<string>();
    const permById = new Map<string, string>();
    for (const p of await ctx.db.query("permissions").collect()) permById.set(p._id, p.slug);

    if (agent.gradeId) {
      const gp = await ctx.db
        .query("gradePermissions")
        .withIndex("by_grade", (q) => q.eq("gradeId", agent.gradeId!))
        .collect();
      for (const x of gp) {
        const s = permById.get(x.permissionId);
        if (s) slugs.add(s);
      }
    }
    const divs = await ctx.db
      .query("agentDivisions")
      .withIndex("by_agent", (q) => q.eq("agentId", agent._id))
      .collect();
    for (const d of divs) {
      const dp = await ctx.db
        .query("divisionPermissions")
        .withIndex("by_division", (q) => q.eq("divisionId", d.divisionId))
        .collect();
      for (const x of dp) {
        const s = permById.get(x.permissionId);
        if (s) slugs.add(s);
      }
    }
    return [...slugs];
  },
});

// Indique si un compte propriétaire (owner) existe déjà (pour l'écran de finalisation).
export const ownerExists = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("agents").collect();
    return all.some((a) => a.isOwner);
  },
});

// Bootstrap unique de l'owner : le 1er compte peut se déclarer owner s'il n'en existe aucun.
export const bootstrapOwner = mutation({
  args: { nomRP: v.string(), prenomRP: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié.");
    const all = await ctx.db.query("agents").collect();
    if (all.some((a) => a.isOwner)) throw new Error("Un owner existe déjà.");

    let agent = all.find((a) => a.userId === userId) ?? null;
    if (agent) {
      await ctx.db.patch(agent._id, {
        isOwner: true,
        status: "ACTIVE",
        matricule: agent.matricule ?? 0,
      });
    } else {
      const id = await ctx.db.insert("agents", {
        userId,
        login: makeLogin(args.prenomRP, args.nomRP),
        nomRP: args.nomRP,
        prenomRP: args.prenomRP,
        matricule: 0, // owner : matricule spécial 00
        status: "ACTIVE",
        isOwner: true,
        dateEntree: Date.now(),
      });
      agent = await ctx.db.get(id);
    }
    await writeAudit(ctx, agent, {
      action: "agent.bootstrap_owner",
      resourceType: "agent",
      resourceId: agent!._id,
      resourceLabel: `${args.prenomRP} ${args.nomRP}`,
    });
    return agent!._id;
  },
});

// Inscription encadrée par code d'invitation → crée le profil agent (PENDING).
export const completeRegistration = mutation({
  args: { code: v.string(), nomRP: v.string(), prenomRP: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié.");
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existing) return existing._id;

    const invite = await ctx.db
      .query("invitations")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!invite || invite.revoked) throw new Error("Code d'invitation invalide.");
    if (invite.expiresAt && invite.expiresAt < Date.now()) throw new Error("Invitation expirée.");
    if (invite.usesCount >= invite.maxUses) throw new Error("Invitation épuisée.");
    await ctx.db.patch(invite._id, { usesCount: invite.usesCount + 1 });

    const agentId = await ctx.db.insert("agents", {
      userId,
      login: makeLogin(args.prenomRP, args.nomRP),
      nomRP: args.nomRP,
      prenomRP: args.prenomRP,
      status: "PENDING",
      isOwner: false,
    });
    const agent = await ctx.db.get(agentId);
    await writeAudit(ctx, agent, {
      action: "agent.register",
      resourceType: "agent",
      resourceId: agentId,
      resourceLabel: `${args.prenomRP} ${args.nomRP}`,
      metadata: { via: "invite", code: args.code },
    });
    await notify(ctx, "agent.pending", {
      title: "Nouvelle inscription en attente",
      description: `**${args.prenomRP} ${args.nomRP}** attend une validation de l'État-Major.`,
      color: NOTIFY_COLOR.warning,
      url: await deepLink(ctx, "/effectif"),
    });
    return agentId;
  },
});

// Annuaire de l'effectif (ACTIVE).
export const roster = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAgent(ctx);
    await requirePermission(ctx, viewer, "effectif.view");
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .collect();
    // Trois tables chargées d'un coup puis regroupées en mémoire : une requête
    // par agent multipliait les lectures par la taille de l'effectif.
    const gradeById = new Map((await ctx.db.query("grades").collect()).map((g) => [g._id as string, g]));
    const divCount = new Map<string, number>();
    for (const l of await ctx.db.query("agentDivisions").collect()) {
      divCount.set(l.agentId as string, (divCount.get(l.agentId as string) ?? 0) + 1);
    }
    const qualCount = new Map<string, number>();
    for (const l of await ctx.db.query("agentQualifications").collect()) {
      qualCount.set(l.agentId as string, (qualCount.get(l.agentId as string) ?? 0) + 1);
    }
    const onDutyIds = new Set(
      (await ctx.db.query("serviceSessions").withIndex("by_open", (q) => q.eq("endedAt", undefined)).collect())
        .map((x) => x.agentId as string),
    );

    const out = [];
    for (const a of agents) {
      if (a.isOwner) continue; // owner hors effectif RP
      const grade = a.gradeId ? gradeById.get(a.gradeId as string) ?? null : null;
      if (grade?.external) continue; // grade extérieur (ex. DOJ) hors effectif (item 8)
      out.push({
        _id: a._id,
        nomRP: a.nomRP,
        prenomRP: a.prenomRP,
        matricule: a.matricule,
        grade: grade?.name ?? null,
        gradePosition: grade?.position ?? -1,
        divisionCount: divCount.get(a._id as string) ?? 0,
        qualifications: qualCount.get(a._id as string) ?? 0,
        onDuty: onDutyIds.has(a._id as string),
        dateEntree: a.dateEntree ?? null,
      });
    }
    return out.sort((a, b) => b.gradePosition - a.gradePosition);
  },
});

// Photo de profil de l'agent courant (item 7).
// Préférences d'affichage de l'agent courant. Chacun ne règle que les siennes.
export const setUiPrefs = mutation({
  args: {
    sidebarCollapsible: v.optional(v.boolean()),
    sidebarHoverExpand: v.optional(v.boolean()),
    dispatchCompact: v.optional(v.boolean()),
  },
  handler: async (ctx, prefs) => {
    const agent = await requireAgent(ctx);
    await ctx.db.patch(agent._id, { uiPrefs: { ...(agent.uiPrefs ?? {}), ...prefs } });
  },
});

export const setAvatar = mutation({
  args: { url: v.optional(v.string()) },
  handler: async (ctx, { url }) => {
    const agent = await requireAgent(ctx);
    await ctx.db.patch(agent._id, { avatarUrl: url });
  },
});

// Organigramme : agents ACTIFS groupés par grade (ordre hiérarchique), hors owner et grades extérieurs (item 7/8).
export const organigramme = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAgent(ctx);
    await requirePermission(ctx, viewer, "effectif.view");
    const grades = await ctx.db.query("grades").withIndex("by_position").collect();
    const gradeById = new Map(grades.map((g) => [g._id, g]));
    const activeAgents = (await ctx.db.query("agents").withIndex("by_status", (q) => q.eq("status", "ACTIVE")).collect()).filter((a) => !a.isOwner);
    const byGrade = new Map<string, { _id: string; name: string; matricule: number | null; avatarUrl: string | null }[]>();
    for (const a of activeAgents) {
      const g = a.gradeId ? gradeById.get(a.gradeId) : null;
      if (!g || g.external) continue; // sans grade ou grade extérieur -> hors organigramme
      if (!byGrade.has(g._id)) byGrade.set(g._id, []);
      byGrade.get(g._id)!.push({ _id: a._id, name: `${a.prenomRP} ${a.nomRP}`, matricule: a.matricule ?? null, avatarUrl: a.avatarUrl ?? null });
    }
    return grades
      .filter((g) => !g.external)
      .sort((a, b) => b.position - a.position) // sommet de la hiérarchie en premier
      .map((g) => ({ _id: g._id, name: g.name, corps: g.corps, color: g.color ?? null, agents: (byGrade.get(g._id) ?? []).sort((x, y) => (x.matricule ?? 999) - (y.matricule ?? 999)) }))
      .filter((g) => g.agents.length > 0);
  },
});

// Inscriptions en attente de validation.
export const pending = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAgent(ctx);
    await requirePermission(ctx, viewer, "effectif.validate");
    const rows = await ctx.db
      .query("agents")
      .withIndex("by_status", (q) => q.eq("status", "PENDING"))
      .collect();
    return rows.map((a) => ({ _id: a._id, nomRP: a.nomRP, prenomRP: a.prenomRP, login: a.login }));
  },
});

export const validate = mutation({
  args: {
    agentId: v.id("agents"),
    gradeId: v.id("grades"),
    divisionIds: v.array(v.id("divisions")),
    matricule: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "effectif.validate");
    const target = await ctx.db.get(args.agentId);
    if (!target || target.status !== "PENDING") throw new Error("Agent introuvable ou déjà validé.");

    // Hiérarchie stricte : on ne peut assigner qu'un grade inférieur au sien (owner exempté).
    if (!actor.isOwner) {
      const actorGrade = actor.gradeId ? await ctx.db.get(actor.gradeId) : null;
      const newGrade = await ctx.db.get(args.gradeId);
      if (!actorGrade || !newGrade || newGrade.position >= actorGrade.position) {
        throw new Error("Vous ne pouvez assigner qu'un grade strictement inférieur au vôtre.");
      }
    }
    const dup = await ctx.db
      .query("agents")
      .withIndex("by_matricule", (q) => q.eq("matricule", args.matricule))
      .first();
    if (dup) throw new Error("Numéro de badge déjà attribué.");

    await ctx.db.patch(args.agentId, {
      status: "ACTIVE",
      gradeId: args.gradeId,
      matricule: args.matricule,
      dateEntree: Date.now(),
    });
    for (const divId of args.divisionIds) {
      await ctx.db.insert("agentDivisions", { agentId: args.agentId, divisionId: divId });
    }
    await ctx.db.insert("gradeHistory", {
      agentId: args.agentId,
      toGradeId: args.gradeId,
      byAgentId: actor._id,
      at: Date.now(),
      reason: "Validation",
    });
    await writeAudit(ctx, actor, {
      action: "agent.validate",
      resourceType: "agent",
      resourceId: args.agentId,
      resourceLabel: `${target.prenomRP} ${target.nomRP}`,
      metadata: { matricule: args.matricule },
    });
    await notify(ctx, "agent.validate", {
      title: "Nouvel agent validé",
      description: `**${target.prenomRP} ${target.nomRP}** rejoint la Station 13.`,
      color: NOTIFY_COLOR.accent,
      fields: [{ name: "Numéro de badge", value: String(args.matricule).padStart(5, "0"), inline: true }],
      footer: `Validé par ${actor.prenomRP} ${actor.nomRP}`,
    });
  },
});

export const reject = mutation({
  args: { agentId: v.id("agents"), reason: v.optional(v.string()) },
  handler: async (ctx, { agentId, reason }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "effectif.validate");
    const target = await ctx.db.get(agentId);
    if (!target) return;
    await ctx.db.patch(agentId, { status: "INACTIVE" });
    await writeAudit(ctx, actor, {
      action: "agent.reject",
      resourceType: "agent",
      resourceId: agentId,
      resourceLabel: `${target.prenomRP} ${target.nomRP}`,
      metadata: { reason },
    });
  },
});

// Fiche agent complète (§11).
export const getAgent = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const viewer = await requireAgent(ctx);
    await requirePermission(ctx, viewer, "effectif.view");
    const a = await ctx.db.get(agentId);
    if (!a) return null;
    const grade = a.gradeId ? await ctx.db.get(a.gradeId) : null;
    const divLinks = await ctx.db
      .query("agentDivisions")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .collect();
    const divisions = [];
    for (const l of divLinks) {
      const d = await ctx.db.get(l.divisionId);
      if (d) divisions.push({ _id: d._id, name: d.name });
    }
    const qualLinks = await ctx.db
      .query("agentQualifications")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .collect();
    const qualifications = [];
    for (const l of qualLinks) {
      const q = await ctx.db.get(l.qualificationId);
      if (q) qualifications.push({ _id: q._id, code: q.code, name: q.name, kind: q.kind, color: q.color ?? null });
    }
    const openSession = await ctx.db
      .query("serviceSessions")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .filter((q) => q.eq(q.field("endedAt"), undefined))
      .first();

    // Absence en cours
    const now = Date.now();
    const absences = await ctx.db
      .query("absences")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .collect();
    const currentAbsence = absences.find(
      (ab) => ab.status === "APPROUVEE" && ab.from <= now && ab.to >= now,
    );

    return {
      _id: a._id,
      login: a.login,
      prenomRP: a.prenomRP,
      nomRP: a.nomRP,
      matricule: a.matricule ?? (a.isOwner ? 0 : null),
      isOwner: a.isOwner,
      status: a.status,
      avatarUrl: a.avatarUrl ?? null,
      dateEntree: a.dateEntree ?? null,
      lockedUntil: a.lockedUntil ?? null,
      grade: grade ? { _id: grade._id, name: grade.name, position: grade.position } : null,
      divisions,
      qualifications,
      onDuty: !!openSession,
      dutySince: openSession?.startedAt ?? null,
      openSessionId: openSession?._id ?? null,
      currentAbsence: currentAbsence ? { from: currentAbsence.from, to: currentAbsence.to } : null,
    };
  },
});

// Logs récents d'un agent (actions qu'il a effectuées), enrichis pour navigation.
export const recentLogs = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const viewer = await requireAgent(ctx);
    await requirePermission(ctx, viewer, "effectif.view");
    const rows = await ctx.db
      .query("auditLog")
      .withIndex("by_actor", (q) => q.eq("actorId", agentId))
      .order("desc")
      .take(20);
    const out = [];
    for (const r of rows) {
      // Résout le citoyen concerné (pour rendre le nom cliquable).
      let citizenId: string | null = null;
      if (r.resourceId) {
        try {
          if (r.resourceType === "citizen") {
            citizenId = r.resourceId;
          } else if (r.resourceType === "casierEntry") {
            const e = await ctx.db.get(r.resourceId as import("./_generated/dataModel").Id<"casierEntries">);
            citizenId = e?.citizenId ?? null;
          } else if (r.resourceType === "citation") {
            const c = await ctx.db.get(r.resourceId as import("./_generated/dataModel").Id<"citations">);
            citizenId = c?.citizenId ?? null;
          } else if (r.resourceType === "mandat") {
            const m = await ctx.db.get(r.resourceId as import("./_generated/dataModel").Id<"mandats">);
            citizenId = m?.citizenId ?? null;
          }
        } catch {
          citizenId = null;
        }
      }
      out.push({
        _id: r._id,
        at: r.at,
        action: r.action,
        resourceType: r.resourceType,
        resourceLabel: r.resourceLabel ?? null,
        citizenId,
        metadata: r.metadata ?? null,
      });
    }
    return out;
  },
});

// Changer le grade d'un agent actif (hiérarchie stricte, §11).
export const updateGrade = mutation({
  args: { agentId: v.id("agents"), gradeId: v.id("grades") },
  handler: async (ctx, { agentId, gradeId }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "effectif.grade");
    const target = await ctx.db.get(agentId);
    if (!target) throw new Error("Agent introuvable.");
    // Contrôle sur le grade ACTUEL de la cible : sans lui, un sergent pouvait
    // rétrograder un lieutenant, le grade attribué étant bien inférieur au sien.
    await assertOutranks(ctx, actor, target);
    const newGrade = await ctx.db.get(gradeId);
    if (!newGrade) throw new Error("Grade introuvable.");
    if (!actor.isOwner) {
      const actorGrade = actor.gradeId ? await ctx.db.get(actor.gradeId) : null;
      if (!actorGrade || newGrade.position >= actorGrade.position) {
        throw new Error("Vous ne pouvez assigner qu'un grade strictement inférieur au vôtre.");
      }
    }
    const before = target.gradeId ? await ctx.db.get(target.gradeId) : null;
    await ctx.db.patch(agentId, { gradeId });
    await ctx.db.insert("gradeHistory", {
      agentId,
      fromGradeId: target.gradeId,
      toGradeId: gradeId,
      byAgentId: actor._id,
      at: Date.now(),
    });
    await writeAudit(ctx, actor, {
      action: "agent.grade_change",
      resourceType: "agent",
      resourceId: agentId,
      resourceLabel: `${target.prenomRP} ${target.nomRP}`,
      before: { grade: before?.name },
      after: { grade: newGrade.name },
    });
    await notify(ctx, "agent.grade", {
      title: "Changement de grade",
      description: `**${target.prenomRP} ${target.nomRP}**`,
      color: NOTIFY_COLOR.info,
      fields: [
        { name: "Avant", value: before?.name ?? "-", inline: true },
        { name: "Après", value: newGrade.name, inline: true },
      ],
      footer: `Décidé par ${actor.prenomRP} ${actor.nomRP}`,
    });
  },
});

export const setMatricule = mutation({
  args: { agentId: v.id("agents"), matricule: v.number() },
  handler: async (ctx, { agentId, matricule }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "effectif.edit");
    const target = await ctx.db.get(agentId);
    if (!target) throw new Error("Agent introuvable.");
    await assertOutranks(ctx, actor, target);
    const dup = await ctx.db
      .query("agents")
      .withIndex("by_matricule", (q) => q.eq("matricule", matricule))
      .first();
    if (dup && dup._id !== agentId) throw new Error("Numéro de badge déjà attribué.");
    await ctx.db.patch(agentId, { matricule });
    await writeAudit(ctx, actor, {
      action: "agent.matricule_change",
      resourceType: "agent",
      resourceId: agentId,
      resourceLabel: `${target.prenomRP} ${target.nomRP}`,
      after: { matricule },
    });
  },
});

// Formations / spécialités d'un agent (HNT, Police Academy, MRD, Dispatcher...).
export const setQualifications = mutation({
  args: { agentId: v.id("agents"), qualificationIds: v.array(v.id("qualifications")) },
  handler: async (ctx, { agentId, qualificationIds }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "effectif.qualification");
    const target = await ctx.db.get(agentId);
    if (!target) throw new Error("Agent introuvable.");
    await assertOutranks(ctx, actor, target);
    const existing = await ctx.db
      .query("agentQualifications")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .collect();
    const keep = new Set(qualificationIds as string[]);
    // On ne réécrit que le delta : la date d'obtention des acquis est conservée.
    for (const l of existing) {
      if (keep.has(l.qualificationId)) keep.delete(l.qualificationId);
      else await ctx.db.delete(l._id);
    }
    for (const qualificationId of keep) {
      await ctx.db.insert("agentQualifications", {
        agentId,
        qualificationId: qualificationId as import("./_generated/dataModel").Id<"qualifications">,
        at: Date.now(),
        byAgentId: actor._id,
      });
    }
    await writeAudit(ctx, actor, {
      action: "agent.qualifications_change",
      resourceType: "agent",
      resourceId: agentId,
      resourceLabel: `${target.prenomRP} ${target.nomRP}`,
    });
  },
});

export const setDivisions = mutation({
  args: { agentId: v.id("agents"), divisionIds: v.array(v.id("divisions")) },
  handler: async (ctx, { agentId, divisionIds }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "effectif.division");
    const target = await ctx.db.get(agentId);
    if (!target) throw new Error("Agent introuvable.");
    await assertOutranks(ctx, actor, target);
    const existing = await ctx.db
      .query("agentDivisions")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .collect();
    for (const l of existing) await ctx.db.delete(l._id);
    for (const divId of divisionIds) {
      await ctx.db.insert("agentDivisions", { agentId, divisionId: divId });
    }
    await writeAudit(ctx, actor, {
      action: "agent.divisions_change",
      resourceType: "agent",
      resourceId: agentId,
      resourceLabel: `${target.prenomRP} ${target.nomRP}`,
    });
  },
});

// Date d'arrivée éditable (ancienneté) : le MDT est neuf, des agents sont là depuis l'ancien.
export const setDateEntree = mutation({
  args: { agentId: v.id("agents"), dateEntree: v.union(v.number(), v.null()) },
  handler: async (ctx, { agentId, dateEntree }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "effectif.edit");
    const target = await ctx.db.get(agentId);
    if (!target) throw new Error("Agent introuvable.");
    await assertOutranks(ctx, actor, target);
    await ctx.db.patch(agentId, { dateEntree: dateEntree ?? undefined });
    await writeAudit(ctx, actor, {
      action: "agent.date_entree",
      resourceType: "agent",
      resourceId: agentId,
      resourceLabel: `${target.prenomRP} ${target.nomRP}`,
      metadata: { dateEntree },
    });
  },
});

export const setStatus = mutation({
  args: {
    agentId: v.id("agents"),
    status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE"), v.literal("SUSPENDED")),
  },
  handler: async (ctx, { agentId, status }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "effectif.deactivate");
    const target = await ctx.db.get(agentId);
    if (!target) throw new Error("Agent introuvable.");
    await assertOutranks(ctx, actor, target);
    await ctx.db.patch(agentId, { status });
    await writeAudit(ctx, actor, {
      action: status === "ACTIVE" ? "agent.reactivate" : "agent.deactivate",
      resourceType: "agent",
      resourceId: agentId,
      resourceLabel: `${target.prenomRP} ${target.nomRP}`,
      metadata: { status },
    });
    if (status !== "ACTIVE") {
      await notify(ctx, "agent.deactivate", {
        title: "Agent désactivé",
        description: `**${target.prenomRP} ${target.nomRP}**`,
        color: NOTIFY_COLOR.danger,
        fields: [{ name: "Nouveau statut", value: status, inline: true }],
        footer: `Décidé par ${actor.prenomRP} ${actor.nomRP}`,
      });
    }
  },
});

// Présence : agents ayant une session de service ouverte.
export const presence = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAgent(ctx);
    await requirePermission(ctx, viewer, "effectif.view");
    const open = await ctx.db
      .query("serviceSessions")
      .withIndex("by_open", (q) => q.eq("endedAt", undefined))
      .collect();
    const out = [];
    // Plusieurs agents partagent le même grade : sans cache, on le relit une
    // fois par agent en service.
    const gradeCache = new Map<string, Doc<"grades"> | null>();
    const gradeOf = async (a: Doc<"agents">) => {
      if (!a.gradeId) return null;
      const k = a.gradeId as string;
      if (!gradeCache.has(k)) gradeCache.set(k, await ctx.db.get(a.gradeId));
      return gradeCache.get(k)!;
    };
    for (const s of open) {
      const a = await ctx.db.get(s.agentId);
      if (!a || a.status !== "ACTIVE") continue;
      const grade = await gradeOf(a);
      out.push({
        _id: a._id,
        name: `${a.prenomRP.charAt(0)}. ${a.nomRP}`,
        matricule: a.matricule ?? (a.isOwner ? 0 : null),
        initials: `${a.prenomRP.charAt(0)}${a.nomRP.charAt(0)}`.toUpperCase(),
        grade: a.isOwner ? "Owner" : (grade?.name ?? "-"),
        gradeAbbrev: a.isOwner ? "OWN" : (grade?.abbrev?.trim() || grade?.name.slice(0, 3).toUpperCase() || null),
        gradeColor: grade?.color ?? null,
        callsign: s.callsignType ?? null,
      });
    }
    return out;
  },
});

// ---------------------------------------------------------------------------
// Gestion de compte (§ réinitialisation). Ces mutations internes portent les
// contrôles de permission ; l'action `accounts.*` ne fait que manipuler le
// secret Convex Auth, qui n'est accessible que depuis une action.
// ---------------------------------------------------------------------------
export const prepareReset = internalMutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "effectif.resetpw");
    const target = await ctx.db.get(agentId);
    if (!target) throw new Error("Agent introuvable.");
    await assertOutranks(ctx, actor, target);
    await ctx.db.patch(agentId, { mustChangePassword: true });
    await writeAudit(ctx, actor, {
      action: "agent.password_reset",
      resourceType: "agent",
      resourceId: agentId,
      resourceLabel: `${target.prenomRP} ${target.nomRP}`,
    });
    return { login: target.login, userId: target.userId, label: `${target.prenomRP} ${target.nomRP}` };
  },
});

export const prepareSelfChange = internalMutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireAgent(ctx);
    return { login: me.login };
  },
});

export const clearMustChange = internalMutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireAgent(ctx);
    await ctx.db.patch(me._id, { mustChangePassword: false });
    await writeAudit(ctx, me, {
      action: "agent.password_change",
      resourceType: "agent",
      resourceId: me._id,
      resourceLabel: `${me.prenomRP} ${me.nomRP}`,
    });
  },
});

// ---------------------------------------------------------------------------
// Sécurité des comptes.
// Convex Auth limite déjà les essais (5/heure ici) et refuse toute tentative,
// même correcte, une fois le quota épuisé : c'est la barrière anti-force
// brute. Ce qui suit ajoute le verrouillage décidé par l'État-Major et la
// visibilité sur les comptes en cours d'attaque.
// ---------------------------------------------------------------------------
export const setLock = mutation({
  args: {
    agentId: v.id("agents"),
    minutes: v.optional(v.number()), // absent ou 0 = déverrouiller
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { agentId, minutes, reason }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, "effectif.resetpw");
    const target = await ctx.db.get(agentId);
    if (!target) throw new Error("Agent introuvable.");
    await assertOutranks(ctx, actor, target);

    const lock = minutes && minutes > 0;
    await ctx.db.patch(agentId, {
      lockedUntil: lock ? Date.now() + minutes * 60_000 : undefined,
      lockedReason: lock ? reason?.trim() || undefined : undefined,
    });
    await writeAudit(ctx, actor, {
      action: lock ? "agent.lock" : "agent.unlock",
      resourceType: "agent",
      resourceId: agentId,
      resourceLabel: `${target.prenomRP} ${target.nomRP}`,
      metadata: { minutes, reason },
    });
  },
});

// Comptes actuellement freinés par la limitation d'essais : permet de repérer
// une attaque en cours plutôt que de la découvrir après coup.
export const loginThrottled = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAgent(ctx);
    await requirePermission(ctx, viewer, "audit.view");

    const limits = await ctx.db.query("authRateLimits").collect();
    if (limits.length === 0) return [];

    const agents = await ctx.db.query("agents").collect();
    const out = [];
    for (const l of limits) {
      // L'identifiant porté par la limite contient le login du compte visé.
      const a = agents.find((x) => l.identifier.includes(x.login));
      out.push({
        identifier: a ? `${a.prenomRP} ${a.nomRP}` : l.identifier,
        login: a?.login ?? null,
        agentId: a?._id ?? null,
        attemptsLeft: Math.max(0, Math.floor(l.attemptsLeft)),
        lastAttemptAt: l.lastAttemptTime,
        locked: a?.lockedUntil && a.lockedUntil > Date.now() ? a.lockedUntil : null,
      });
    }
    return out.sort((x, y) => y.lastAttemptAt - x.lastAttemptAt);
  },
});
