import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAgent, requirePermission, agentLabel } from "./rbac";
import { writeAudit } from "./lib/audit";
import { notify, NOTIFY_COLOR } from "./lib/notify";

// Cérémonies : planification (ajoutée au calendrier, 1 h), rappels un par un,
// montées en grade (agent + grade futur), document officiel, et exécution des
// montées en grade Discord (file de rôles drainée par le bot). Tout est gardé
// par la permission `ceremonies.manage`.

const PERM = "ceremonies.manage";

// Ajoute une heure à un "HH:MM" -> "HH:MM" (borné à 23:59, pas de passage au lendemain).
function plusOneHour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(h * 60 + m + 60, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Liste des cérémonies non supprimées, plus récentes d'abord, avec les compteurs.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, PERM);
    const rows = (await ctx.db.query("ceremonies").withIndex("by_at").collect())
      .filter((c) => !c.deletedAt)
      .sort((a, b) => b.at - a.at || b.createdAt - a.createdAt);
    const out = [];
    for (const c of rows) {
      const reminders = await ctx.db.query("ceremonyReminders").withIndex("by_ceremony", (q) => q.eq("ceremonyId", c._id)).collect();
      const promos = await ctx.db.query("ceremonyPromotions").withIndex("by_ceremony", (q) => q.eq("ceremonyId", c._id)).collect();
      out.push({
        _id: c._id,
        title: c.title,
        at: c.at,
        startTime: c.startTime,
        lieu: c.lieu ?? null,
        reminderCount: reminders.length,
        promotionCount: promos.length,
        by: await agentLabel(ctx, c.createdBy),
      });
    }
    return out;
  },
});

// Détail d'une cérémonie : rappels + montées en grade enrichies.
export const get = query({
  args: { ceremonyId: v.id("ceremonies") },
  handler: async (ctx, { ceremonyId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, PERM);
    const c = await ctx.db.get(ceremonyId);
    if (!c || c.deletedAt) return null;

    const reminders = (await ctx.db.query("ceremonyReminders").withIndex("by_ceremony", (q) => q.eq("ceremonyId", ceremonyId)).collect())
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => ({ _id: r._id, text: r.text }));

    const promoRows = (await ctx.db.query("ceremonyPromotions").withIndex("by_ceremony", (q) => q.eq("ceremonyId", ceremonyId)).collect())
      .sort((a, b) => a.createdAt - b.createdAt);
    const promotions = [];
    for (const p of promoRows) {
      const ag = await ctx.db.get(p.agentId);
      const from = p.fromGradeId ? await ctx.db.get(p.fromGradeId) : null;
      const to = await ctx.db.get(p.toGradeId);
      promotions.push({
        _id: p._id,
        agentId: p.agentId,
        agentName: ag ? `${ag.prenomRP} ${ag.nomRP}` : "Agent supprimé",
        matricule: ag?.matricule ?? null,
        discordId: ag?.discordId ?? null,
        fromGrade: from?.name ?? null,
        toGrade: to?.name ?? "-",
        toGradeHasDiscord: !!to?.discordRoleId,
        mdtApplied: !!p.mdtAppliedAt,
        discordApplied: !!p.discordAppliedAt,
      });
    }

    const dismissals = (await ctx.db.query("ceremonyDismissals").withIndex("by_ceremony", (q) => q.eq("ceremonyId", ceremonyId)).collect())
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((d) => ({ _id: d._id, name: d.name, fromGradeName: d.fromGradeName ?? null }));

    const posts = (await ctx.db.query("ceremonyPosts").withIndex("by_sent").collect())
      .filter((p) => p.ceremonyId === ceremonyId);

    return {
      _id: c._id,
      title: c.title,
      at: c.at,
      startTime: c.startTime,
      lieu: c.lieu ?? null,
      notes: c.notes ?? null,
      calendarEventId: c.calendarEventId ?? null,
      by: await agentLabel(ctx, c.createdBy),
      reminders,
      promotions,
      dismissals,
      announceSent: posts.some((p) => p.kind === "ANNOUNCE" && p.sent),
      resultSent: posts.some((p) => p.kind === "RESULT" && p.sent),
    };
  },
});

// Crée une cérémonie et l'ajoute au calendrier (durée 1 h).
export const create = mutation({
  args: {
    title: v.string(),
    at: v.number(), // jour (minuit UTC)
    startTime: v.string(), // "HH:MM"
    lieu: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, PERM);
    const title = args.title.trim();
    if (!title) throw new Error("Le titre est requis.");
    if (!/^\d{1,2}:\d{2}$/.test(args.startTime)) throw new Error("Heure invalide.");
    const lieu = args.lieu?.trim() || undefined;
    const endTime = plusOneHour(args.startTime);

    // Évènement de calendrier (1 h) rattaché à la cérémonie.
    const calendarEventId = await ctx.db.insert("calendarEvents", {
      at: args.at,
      title: `Cérémonie : ${title}`,
      lieu,
      startTime: args.startTime,
      endTime,
      notes: args.notes?.trim() || undefined,
      createdBy: agent._id,
    });

    const id = await ctx.db.insert("ceremonies", {
      title,
      at: args.at,
      startTime: args.startTime,
      lieu,
      notes: args.notes?.trim() || undefined,
      calendarEventId,
      createdBy: agent._id,
      createdAt: Date.now(),
    });
    await writeAudit(ctx, agent, { action: "ceremony.create", resourceType: "ceremony", resourceId: id, resourceLabel: title });
    return id;
  },
});

// Modifie la cérémonie et garde l'évènement de calendrier synchronisé.
export const update = mutation({
  args: {
    ceremonyId: v.id("ceremonies"),
    title: v.optional(v.string()),
    at: v.optional(v.number()),
    startTime: v.optional(v.string()),
    lieu: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { ceremonyId, ...patch }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, PERM);
    const c = await ctx.db.get(ceremonyId);
    if (!c || c.deletedAt) throw new Error("Cérémonie introuvable.");
    if (patch.startTime !== undefined && !/^\d{1,2}:\d{2}$/.test(patch.startTime)) throw new Error("Heure invalide.");

    const next = {
      title: patch.title !== undefined ? patch.title.trim() || c.title : c.title,
      at: patch.at ?? c.at,
      startTime: patch.startTime ?? c.startTime,
      lieu: patch.lieu !== undefined ? (patch.lieu.trim() || undefined) : c.lieu,
      notes: patch.notes !== undefined ? (patch.notes.trim() || undefined) : c.notes,
    };
    await ctx.db.patch(ceremonyId, next);
    if (c.calendarEventId) {
      await ctx.db.patch(c.calendarEventId, {
        title: `Cérémonie : ${next.title}`,
        at: next.at,
        startTime: next.startTime,
        endTime: plusOneHour(next.startTime),
        lieu: next.lieu,
        notes: next.notes,
      });
    }
    await writeAudit(ctx, agent, { action: "ceremony.update", resourceType: "ceremony", resourceId: ceremonyId, resourceLabel: next.title });
  },
});

// Soft-delete de la cérémonie + suppression de l'évènement de calendrier associé.
export const remove = mutation({
  args: { ceremonyId: v.id("ceremonies") },
  handler: async (ctx, { ceremonyId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, PERM);
    const c = await ctx.db.get(ceremonyId);
    if (!c || c.deletedAt) return;
    await ctx.db.patch(ceremonyId, { deletedAt: Date.now() });
    if (c.calendarEventId) await ctx.db.delete(c.calendarEventId).catch(() => {});
    await writeAudit(ctx, agent, { action: "ceremony.remove", resourceType: "ceremony", resourceId: ceremonyId, resourceLabel: c.title });
  },
});

// --- Rappels (un par un) ---
export const addReminder = mutation({
  args: { ceremonyId: v.id("ceremonies"), text: v.string() },
  handler: async (ctx, { ceremonyId, text }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, PERM);
    const t = text.trim();
    if (!t) throw new Error("Le rappel est vide.");
    const c = await ctx.db.get(ceremonyId);
    if (!c || c.deletedAt) throw new Error("Cérémonie introuvable.");
    await ctx.db.insert("ceremonyReminders", { ceremonyId, text: t, createdAt: Date.now() });
  },
});

export const removeReminder = mutation({
  args: { reminderId: v.id("ceremonyReminders") },
  handler: async (ctx, { reminderId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, PERM);
    await ctx.db.delete(reminderId);
  },
});

// --- Montées en grade (agent + grade futur) ---
export const addPromotion = mutation({
  args: { ceremonyId: v.id("ceremonies"), agentId: v.id("agents"), toGradeId: v.id("grades") },
  handler: async (ctx, { ceremonyId, agentId, toGradeId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, PERM);
    const c = await ctx.db.get(ceremonyId);
    if (!c || c.deletedAt) throw new Error("Cérémonie introuvable.");
    const target = await ctx.db.get(agentId);
    if (!target) throw new Error("Agent introuvable.");
    const toGrade = await ctx.db.get(toGradeId);
    if (!toGrade) throw new Error("Grade introuvable.");
    // Contrôle hiérarchique dès l'ajout (comme applyGrades) : sauf owner, on ne
    // promeut que vers un grade STRICTEMENT inférieur au sien, sur une cible
    // qu'on surclasse. Empêche d'octroyer un rôle Discord élevé via la cérémonie.
    if (!agent.isOwner) {
      const actorGrade = agent.gradeId ? await ctx.db.get(agent.gradeId) : null;
      const targetGrade = target.gradeId ? await ctx.db.get(target.gradeId) : null;
      if (!actorGrade || toGrade.position >= actorGrade.position || (targetGrade && targetGrade.position >= actorGrade.position)) {
        throw new Error("Cette promotion est hors de votre portée hiérarchique.");
      }
    }
    // Un même agent n'apparaît qu'une fois dans une cérémonie.
    const existing = (await ctx.db.query("ceremonyPromotions").withIndex("by_ceremony", (q) => q.eq("ceremonyId", ceremonyId)).collect())
      .find((p) => p.agentId === agentId);
    if (existing) {
      await ctx.db.patch(existing._id, { toGradeId, fromGradeId: target.gradeId, mdtAppliedAt: undefined, discordAppliedAt: undefined });
      return existing._id;
    }
    return await ctx.db.insert("ceremonyPromotions", {
      ceremonyId, agentId, fromGradeId: target.gradeId, toGradeId, createdAt: Date.now(),
    });
  },
});

export const removePromotion = mutation({
  args: { promotionId: v.id("ceremonyPromotions") },
  handler: async (ctx, { promotionId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, PERM);
    await ctx.db.delete(promotionId);
  },
});

// Exécute les montées en grade Discord : met en file un job de rôle par agent
// relié (ajoute le rôle du grade cible, retire les autres rôles de grade). Le
// bot draine la file. Marque chaque promotion traitée.
export const executeDiscordPromotions = mutation({
  args: { ceremonyId: v.id("ceremonies") },
  handler: async (ctx, { ceremonyId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, PERM);
    const c = await ctx.db.get(ceremonyId);
    if (!c || c.deletedAt) throw new Error("Cérémonie introuvable.");
    const allGradeRoles = (await ctx.db.query("grades").collect()).map((g) => g.discordRoleId).filter((r): r is string => !!r);
    const promos = await ctx.db.query("ceremonyPromotions").withIndex("by_ceremony", (q) => q.eq("ceremonyId", ceremonyId)).collect();

    let queued = 0;
    const skipped: string[] = [];
    for (const p of promos) {
      const target = await ctx.db.get(p.agentId);
      const to = await ctx.db.get(p.toGradeId);
      const name = target ? `${target.prenomRP} ${target.nomRP}` : "Agent";
      if (!target?.discordId) { skipped.push(`${name} (non relié au Discord)`); continue; }
      const addRoleId = to?.discordRoleId ?? undefined;
      if (!addRoleId) { skipped.push(`${name} (grade sans rôle Discord)`); continue; }
      const removeRoleIds = allGradeRoles.filter((r) => r !== addRoleId);
      await ctx.db.insert("discordRoleJobs", {
        discordId: target.discordId, addRoleId, removeRoleIds,
        reason: `Cérémonie : ${to?.name ?? "-"}`, status: "PENDING", createdAt: Date.now(),
      });
      await ctx.db.patch(p._id, { discordAppliedAt: Date.now() });
      queued++;
    }
    await writeAudit(ctx, agent, { action: "ceremony.discord_promote", resourceType: "ceremony", resourceId: ceremonyId, resourceLabel: c.title, metadata: { queued, skipped: skipped.length } });
    return { queued, skipped };
  },
});

// Applique les montées en grade dans le MDT (change le grade des agents). Chaque
// promotion respecte la hiérarchie : on n'attribue qu'un grade strictement
// inférieur à celui de l'acteur (owner excepté). Les promotions hors de portée
// sont ignorées et rapportées.
export const applyGrades = mutation({
  args: { ceremonyId: v.id("ceremonies") },
  handler: async (ctx, { ceremonyId }) => {
    const actor = await requireAgent(ctx);
    await requirePermission(ctx, actor, PERM);
    const c = await ctx.db.get(ceremonyId);
    if (!c || c.deletedAt) throw new Error("Cérémonie introuvable.");
    const actorGrade = actor.gradeId ? await ctx.db.get(actor.gradeId) : null;
    const promos = await ctx.db.query("ceremonyPromotions").withIndex("by_ceremony", (q) => q.eq("ceremonyId", ceremonyId)).collect();

    let applied = 0;
    const skipped: string[] = [];
    for (const p of promos) {
      const target = await ctx.db.get(p.agentId);
      const newGrade = await ctx.db.get(p.toGradeId);
      const name = target ? `${target.prenomRP} ${target.nomRP}` : "Agent";
      if (!target || target.status !== "ACTIVE") { skipped.push(`${name} (inactif)`); continue; }
      if (!newGrade) { skipped.push(`${name} (grade introuvable)`); continue; }
      // Contrôle hiérarchie : l'acteur ne peut attribuer qu'un grade inférieur au sien.
      if (!actor.isOwner) {
        const targetGrade = target.gradeId ? await ctx.db.get(target.gradeId) : null;
        if (!actorGrade || newGrade.position >= actorGrade.position || (targetGrade && targetGrade.position >= actorGrade.position)) {
          skipped.push(`${name} (hors de votre portée hiérarchique)`);
          continue;
        }
      }
      const before = target.gradeId ? await ctx.db.get(target.gradeId) : null;
      await ctx.db.patch(p.agentId, { gradeId: p.toGradeId });
      await ctx.db.insert("gradeHistory", { agentId: p.agentId, fromGradeId: target.gradeId, toGradeId: p.toGradeId, byAgentId: actor._id, at: Date.now() });
      await ctx.db.patch(p._id, { mdtAppliedAt: Date.now() });
      await notify(ctx, "agent.grade", {
        title: "Montée en grade (cérémonie)",
        description: `**${name}**`,
        color: NOTIFY_COLOR.info,
        fields: [
          { name: "Avant", value: before?.name ?? "-", inline: true },
          { name: "Après", value: newGrade.name, inline: true },
        ],
        footer: `Cérémonie ${c.title} · ${actor.prenomRP} ${actor.nomRP}`,
      });
      applied++;
    }
    await writeAudit(ctx, actor, { action: "ceremony.apply_grades", resourceType: "ceremony", resourceId: ceremonyId, resourceLabel: c.title, metadata: { applied, skipped: skipped.length } });
    return { applied, skipped };
  },
});

// --- Licenciements (annoncés dans le résultat de cérémonie) ---
export const addDismissal = mutation({
  args: { ceremonyId: v.id("ceremonies"), agentId: v.optional(v.id("agents")), name: v.optional(v.string()), fromGradeName: v.optional(v.string()) },
  handler: async (ctx, { ceremonyId, agentId, name, fromGradeName }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, PERM);
    const c = await ctx.db.get(ceremonyId);
    if (!c || c.deletedAt) throw new Error("Cérémonie introuvable.");
    let finalName = name?.trim() || "";
    let finalGrade = fromGradeName?.trim() || undefined;
    if (agentId) {
      const target = await ctx.db.get(agentId);
      if (!target) throw new Error("Agent introuvable.");
      finalName = `${target.prenomRP} ${target.nomRP}`;
      if (!finalGrade && target.gradeId) finalGrade = (await ctx.db.get(target.gradeId))?.name ?? undefined;
    }
    if (!finalName) throw new Error("Nom requis.");
    return await ctx.db.insert("ceremonyDismissals", { ceremonyId, agentId, name: finalName, fromGradeName: finalGrade, createdAt: Date.now() });
  },
});

export const removeDismissal = mutation({
  args: { dismissalId: v.id("ceremonyDismissals") },
  handler: async (ctx, { dismissalId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, PERM);
    await ctx.db.delete(dismissalId);
  },
});

// Date murale "dimanche 2 août 2026" à partir du jour + heure de la cérémonie.
function ceremonyDateStr(at: number): string {
  return new Date(at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// Mention Discord d'un agent promu (nickname si relié, sinon "matricule | Nom").
function promoMention(discordId: string | null, matricule: number | null, name: string): string {
  if (discordId) return `<@${discordId}>`;
  return `${matricule != null ? `${matricule} | ` : ""}${name}`;
}

async function ceremonyChannelOrThrow(ctx: MutationCtx): Promise<string> {
  const cfg = await ctx.db.query("integrationConfig").first();
  const channel = cfg?.botCeremonyChannel;
  if (!channel) throw new Error("Aucun salon de cérémonie configuré (Configuration > Bot Discord).");
  return channel;
}

// Poste (via le bot) l'ANNONCE de cérémonie : date, heure, présence obligatoire.
export const announce = mutation({
  args: { ceremonyId: v.id("ceremonies") },
  handler: async (ctx, { ceremonyId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, PERM);
    const c = await ctx.db.get(ceremonyId);
    if (!c || c.deletedAt) throw new Error("Cérémonie introuvable.");
    await ceremonyChannelOrThrow(ctx);
    const lines = [
      "📌 **ANNONCE DE CÉRÉMONIE**",
      "",
      `Une cérémonie${c.title ? ` (**${c.title}**)` : ""} se tiendra le **${ceremonyDateStr(c.at)}** à **${c.startTime}**${c.lieu ? ` — ${c.lieu}` : ""}.`,
      "",
      "La présence est **obligatoire**, sauf empêchement. En cas d'empêchement, merci de l'indiquer dans le roll call du jour.",
    ];
    if (c.notes) { lines.push("", c.notes); }
    await ctx.db.insert("ceremonyPosts", { ceremonyId, kind: "ANNOUNCE", content: lines.join("\n"), sent: false, at: Date.now() });
    await ctx.scheduler.runAfter(0, internal.push.notify, {});
    await writeAudit(ctx, agent, { action: "ceremony.announce", resourceType: "ceremony", resourceId: ceremonyId, resourceLabel: c.title });
  },
});

// Poste (via le bot) le RÉSULTAT de cérémonie : montées en grade + licenciements.
export const announceResult = mutation({
  args: { ceremonyId: v.id("ceremonies") },
  handler: async (ctx, { ceremonyId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, PERM);
    const c = await ctx.db.get(ceremonyId);
    if (!c || c.deletedAt) throw new Error("Cérémonie introuvable.");
    await ceremonyChannelOrThrow(ctx);

    const promoRows = (await ctx.db.query("ceremonyPromotions").withIndex("by_ceremony", (q) => q.eq("ceremonyId", ceremonyId)).collect())
      .sort((a, b) => a.createdAt - b.createdAt);
    const dismissals = (await ctx.db.query("ceremonyDismissals").withIndex("by_ceremony", (q) => q.eq("ceremonyId", ceremonyId)).collect())
      .sort((a, b) => a.createdAt - b.createdAt);
    if (promoRows.length === 0 && dismissals.length === 0) throw new Error("Aucune montée en grade ni licenciement à annoncer.");

    const lines: string[] = ["📌 **ANNONCE CÉRÉMONIE**", ""];
    if (promoRows.length) {
      lines.push(`__Voici les montées en grade à la cérémonie du ${ceremonyDateStr(c.at)} :__`, "");
      for (const p of promoRows) {
        const ag = await ctx.db.get(p.agentId);
        const from = p.fromGradeId ? await ctx.db.get(p.fromGradeId) : null;
        const to = await ctx.db.get(p.toGradeId);
        const name = ag ? `${ag.prenomRP} ${ag.nomRP}` : "Agent";
        lines.push(`${from?.name ?? "?"} à ${to?.name ?? "-"} ➡️ ${promoMention(ag?.discordId ?? null, ag?.matricule ?? null, name)}`);
      }
      lines.push("");
    }
    if (dismissals.length) {
      lines.push("__Voici les licenciements de cette semaine :__", "");
      for (const d of dismissals) lines.push(`${d.fromGradeName ?? "?"} à civil ➡️ ${d.name}`);
      lines.push("");
    }
    lines.push("Félicitations à chacun pour cette évolution. Ces promotions récompensent leur investissement, leur sérieux et leur engagement au sein de la Station 13.");

    await ctx.db.insert("ceremonyPosts", { ceremonyId, kind: "RESULT", content: lines.join("\n"), sent: false, at: Date.now() });
    await ctx.scheduler.runAfter(0, internal.push.notify, {});
    await writeAudit(ctx, agent, { action: "ceremony.announce_result", resourceType: "ceremony", resourceId: ceremonyId, resourceLabel: c.title });
  },
});
