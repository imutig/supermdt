import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { requireAgent, requirePermission, requireOwnOrPermission, agentLabel, can } from "./rbac";
import { writeAudit } from "./lib/audit";
import { touchStats } from "./stats";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";
import { computeCharge } from "./lib/calc";

// DEFCON courant (dupliqué de defcon.ts pour usage interne).
async function currentDefcon(ctx: QueryCtx) {
  const levels = await ctx.db.query("defconLevels").withIndex("by_position").collect();
  if (levels.length === 0) return null;
  const def = levels.find((l) => l.isDefault) ?? levels[0];
  const last = await ctx.db.query("defconChanges").withIndex("by_at").order("desc").first();
  if (!last) return def;
  if (last.until != null && last.until < Date.now()) return def;
  return (await ctx.db.get(last.levelId)) ?? def;
}

export const byCitizen = query({
  args: { citizenId: v.id("citizens") },
  handler: async (ctx, { citizenId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "casier.view");
    const entries = await ctx.db
      .query("casierEntries")
      .withIndex("by_citizen", (q) => q.eq("citizenId", citizenId))
      .order("desc")
      .collect();
    const out = [];
    for (const e of entries) {
      if (e.deletedAt) continue;
      const charges = await ctx.db
        .query("casierCharges")
        .withIndex("by_entry", (q) => q.eq("entryId", e._id))
        .collect();
      out.push({
        _id: e._id,
        at: e.at,
        status: e.status,
        arrestType: e.arrestType ?? "RAPPORT",
        dossierStatus: e.dossierStatus ?? null,
        closed: e.closed ?? false,
        finePaid: e.finePaid ?? false,
        totalFine: e.totalFine,
        totalJailSeconds: e.totalJailSeconds,
        dojRequired: e.dojRequired,
        lieu: e.lieu,
        officer: await agentLabel(ctx, e.officerIds[0]),
        chargeCount: charges.length,
        charges: charges.map((c) => c.snapshot.name),
      });
    }
    return out;
  },
});

// Détail complet d'une entrée de casier (modal, point 5).
export const getEntry = query({
  args: { entryId: v.id("casierEntries") },
  handler: async (ctx, { entryId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "casier.view");
    const e = await ctx.db.get(entryId);
    if (!e) return null;
    const citizen = await ctx.db.get(e.citizenId);
    const charges = await ctx.db
      .query("casierCharges")
      .withIndex("by_entry", (q) => q.eq("entryId", e._id))
      .collect();
    const officers = [];
    for (const oid of e.officerIds) officers.push(await agentLabel(ctx, oid));
    // Rapport lié (dossier)
    let linkedReport: { _id: string; title: string } | null = null;
    if (e.linkedReportId) {
      const r = await ctx.db.get(e.linkedReportId);
      if (r) linkedReport = { _id: r._id, title: r.title };
    }
    // Véhicules
    const vehicles = [];
    for (const vid of e.vehicleIds ?? []) {
      const veh = await ctx.db.get(vid);
      if (veh) vehicles.push({ _id: veh._id, label: `${veh.plaque} · ${veh.modele ?? ""}`.trim() });
    }
    // Armes
    const weapons = [];
    for (const wid of e.weaponIds ?? []) {
      const w = await ctx.db.get(wid);
      if (w) weapons.push({ _id: w._id, label: `${w.typeName ?? ""} ${w.modele} · ${w.serial}`.trim() });
    }
    return {
      _id: e._id,
      at: e.at,
      status: e.status,
      annulReason: e.annulReason,
      citizenId: e.citizenId,
      citizenName: citizen ? `${citizen.prenom} ${citizen.nom}` : "-",
      // Vrai si l'agent courant a établi cette entrée : il peut l'annuler
      // sans détenir la permission dédiée.
      mine: e.createdBy === agent._id,
      officers,
      defcon: e.defconSnapshot,
      totalFine: e.totalFine,
      totalJailSeconds: e.totalJailSeconds,
      dojRequired: e.dojRequired,
      sanctions: e.sanctions,
      derouleFaits: e.derouleFaits,
      lieu: e.lieu,
      notes: e.notes,
      cuffedAt: e.cuffedAt ?? null,
      mirandaAt: e.mirandaAt ?? null,
      rightsLawyer: e.rightsLawyer ?? false,
      rightsFood: e.rightsFood ?? false,
      rightsMedical: e.rightsMedical ?? false,
      // Rapport / dossier d'arrestation (items 6, 10)
      arrestType: e.arrestType ?? "RAPPORT",
      reportBody: e.reportBody ?? "",
      imageUrls: e.imageUrls ?? [],
      avocat: e.avocat ?? "",
      linkedReport,
      linkedReportId: e.linkedReportId ?? null,
      vehicles,
      vehicleIds: e.vehicleIds ?? [],
      weapons,
      weaponIds: e.weaponIds ?? [],
      dossierStatus: e.dossierStatus ?? "",
      forceUsed: e.forceUsed ?? false,
      finePaid: e.finePaid ?? false,
      closed: e.closed ?? false,
      charges: charges.map((c) => ({
        name: c.snapshot.name,
        category: c.snapshot.category,
        severity: c.snapshot.severity,
        sensitive: c.snapshot.sensitive,
        fineRaw: c.snapshot.fineRaw,
        computedFine: c.computedFine,
        computedJailSeconds: c.computedJailSeconds,
        isRecidive: c.isRecidive,
        onDecision: c.onDecision,
        formulaParam: c.formulaParam,
      })),
    };
  },
});

// Édition du volet arrestation (rapport / dossier) d'une entrée de casier (items 6, 10).
export const updateArrest = mutation({
  args: {
    entryId: v.id("casierEntries"),
    arrestType: v.union(v.literal("RAPPORT"), v.literal("DOSSIER")),
    reportBody: v.optional(v.string()),
    imageUrls: v.optional(v.array(v.string())),
    avocat: v.optional(v.string()),
    linkedReportId: v.optional(v.id("reports")),
    vehicleIds: v.optional(v.array(v.id("vehicles"))),
    weaponIds: v.optional(v.array(v.id("weapons"))),
    dossierStatus: v.optional(v.string()),
    forceUsed: v.optional(v.boolean()),
    finePaid: v.optional(v.boolean()),
  },
  handler: async (ctx, { entryId, ...f }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "casier.edit");
    const e = await ctx.db.get(entryId);
    if (!e) throw new Error("Entrée introuvable.");
    // Un dossier clôturé n'est modifiable qu'avec la permission spéciale (item I).
    if (e.closed && !(await can(ctx, agent, "casier.editClosed"))) {
      throw new Error("Ce dossier est clôturé. Seul un haut gradé peut le modifier.");
    }
    // Un rapport (pas dossier) ne porte pas les champs réservés au dossier.
    const patch =
      f.arrestType === "DOSSIER"
        ? f
        : { ...f, linkedReportId: undefined, vehicleIds: undefined, weaponIds: undefined, dossierStatus: undefined };
    await ctx.db.patch(entryId, patch);
    const citizen = await ctx.db.get(e.citizenId);
    await writeAudit(ctx, agent, {
      action: "casier.arrest_update",
      resourceType: "casierEntry",
      resourceId: entryId,
      resourceLabel: citizen ? `${citizen.prenom} ${citizen.nom}` : "",
      metadata: { arrestType: f.arrestType },
    });
  },
});

// Clôture / réouverture d'un dossier d'arrestation (item I).
export const closeDossier = mutation({
  args: { entryId: v.id("casierEntries") },
  handler: async (ctx, { entryId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "casier.edit");
    const e = await ctx.db.get(entryId);
    if (!e) throw new Error("Entrée introuvable.");
    await ctx.db.patch(entryId, { closed: true, closedAt: Date.now(), closedBy: agent._id });
    await writeAudit(ctx, agent, { action: "casier.dossier_close", resourceType: "casierEntry", resourceId: entryId });
    const closedCitizen = await ctx.db.get(e.citizenId);
    await notify(ctx, "casier.closed", {
      title: "Dossier d'arrestation clôturé",
      description: closedCitizen ? `**${closedCitizen.prenom} ${closedCitizen.nom}**` : undefined,
      color: NOTIFY_COLOR.muted,
      url: await deepLink(ctx, `/citoyen/${e.citizenId}`),
      footer: `Clôturé par ${agent.prenomRP} ${agent.nomRP}`,
    });
  },
});
export const reopenDossier = mutation({
  args: { entryId: v.id("casierEntries") },
  handler: async (ctx, { entryId }) => {
    const agent = await requireAgent(ctx);
    // Rouvrir un dossier clos exige la permission spéciale (haut gradé).
    await requirePermission(ctx, agent, "casier.editClosed");
    const e = await ctx.db.get(entryId);
    if (!e) throw new Error("Entrée introuvable.");
    await ctx.db.patch(entryId, { closed: false, closedAt: undefined, closedBy: undefined });
    await writeAudit(ctx, agent, { action: "casier.dossier_reopen", resourceType: "casierEntry", resourceId: entryId });
  },
});

// Suppression douce d'une entrée de casier (§18 : va en Archive, restaurable).
export const remove = mutation({
  args: { entryId: v.id("casierEntries") },
  handler: async (ctx, { entryId }) => {
    const agent = await requireAgent(ctx);
    const e = await ctx.db.get(entryId);
    if (!e) throw new Error("Entrée introuvable.");
    if (e.deletedAt) return;
    // L'agent qui a établi l'acte peut l'annuler ; au-delà, la permission.
    await requireOwnOrPermission(ctx, agent, e.createdBy, "casier.annul");
    const citizen = await ctx.db.get(e.citizenId);
    await ctx.db.patch(entryId, { deletedAt: Date.now(), deletedBy: agent._id });
    await writeAudit(ctx, agent, {
      action: "casier.entry_delete",
      resourceType: "casierEntry",
      resourceId: entryId,
      resourceLabel: citizen ? `${citizen.prenom} ${citizen.nom}` : "",
      metadata: { soft: true, totalFine: e.totalFine, lieu: e.lieu },
    });
    await touchStats(ctx);
  },
});

export const addEntry = mutation({
  args: {
    citizenId: v.id("citizens"),
    charges: v.array(
      v.object({
        penalChargeId: v.id("penalCharges"),
        param: v.optional(v.number()),
        isRecidive: v.boolean(),
      }),
    ),
    derouleFaits: v.optional(v.string()),
    lieu: v.optional(v.string()),
    notes: v.optional(v.string()),
    // Arrestation (§3)
    cuffedAt: v.optional(v.string()),
    mirandaAt: v.optional(v.string()),
    rightsLawyer: v.optional(v.boolean()),
    rightsFood: v.optional(v.boolean()),
    rightsMedical: v.optional(v.boolean()),
    finePaid: v.optional(v.boolean()),
    // Champs dossier/rapport saisissables directement à la création (item H).
    reportBody: v.optional(v.string()),
    imageUrls: v.optional(v.array(v.string())),
    avocat: v.optional(v.string()),
    linkedReportId: v.optional(v.id("reports")),
    vehicleIds: v.optional(v.array(v.id("vehicles"))),
    weaponIds: v.optional(v.array(v.id("weapons"))),
    dossierStatus: v.optional(v.string()),
    forceUsed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "casier.create");
    const defcon = await currentDefcon(ctx);
    if (!defcon) throw new Error("DEFCON non configuré.");

    // Validation des bornes de quantité (§3) : le paramètre doit être dans [min, max].
    for (const c of args.charges) {
      const pc = await ctx.db.get(c.penalChargeId);
      if (!pc) continue;
      if (pc.minParam != null && (c.param ?? 0) < pc.minParam)
        throw new Error(`« ${pc.name} » : quantité minimale ${pc.minParam}.`);
      if (pc.maxParam != null && (c.param ?? 0) > pc.maxParam)
        throw new Error(`« ${pc.name} » : quantité maximale ${pc.maxParam}.`);
    }

    let totalFine = 0;
    let totalJail = 0;
    const sanctions = new Set<string>();
    let dojRequired = false;
    const snaps: {
      penalChargeId: (typeof args.charges)[number]["penalChargeId"];
      snapshot: {
        name: string;
        category: string;
        severity: string;
        sensitive: boolean;
        fineRaw: string;
        jailSeconds?: number;
        dojRequest: boolean;
        sanctions: string[];
      };
      formulaParam?: number;
      isRecidive: boolean;
      computedFine: number;
      computedJailSeconds: number;
      onDecision: boolean;
    }[] = [];

    for (const c of args.charges) {
      const pc = await ctx.db.get(c.penalChargeId);
      if (!pc) continue;
      const cat = await ctx.db.get(pc.categoryId);
      const sev = pc.severityId ? await ctx.db.get(pc.severityId) : null;
      const sanctionNames: string[] = [];
      for (const sid of pc.sanctionIds) {
        const s = await ctx.db.get(sid);
        if (s) sanctionNames.push(s.name);
      }
      const res = computeCharge({
        fine: pc.fine,
        jailSeconds: pc.jailSeconds ?? 0,
        sensitive: cat?.sensitive ?? false,
        defcon,
        param: c.param,
        isRecidive: c.isRecidive,
      });
      totalFine += res.fine;
      totalJail += res.jailSeconds;
      sanctionNames.forEach((s) => sanctions.add(s));
      if (pc.dojRequest) dojRequired = true;
      snaps.push({
        penalChargeId: pc._id,
        snapshot: {
          name: pc.name,
          category: cat?.name ?? "",
          severity: sev?.name ?? "",
          sensitive: cat?.sensitive ?? false,
          fineRaw: pc.fine.raw,
          jailSeconds: pc.jailSeconds ?? undefined,
          dojRequest: pc.dojRequest,
          sanctions: sanctionNames,
        },
        formulaParam: c.param,
        isRecidive: c.isRecidive,
        computedFine: res.fine,
        computedJailSeconds: res.jailSeconds,
        onDecision: res.onDecision,
      });
    }

    // Dossier d'arrestation pour délit majeur / crime, sinon simple rapport (item 6).
    const isDossier = snaps.some((s) => s.snapshot.severity === "Crime" || s.snapshot.severity === "Délit majeur");

    const entryId = await ctx.db.insert("casierEntries", {
      citizenId: args.citizenId,
      at: Date.now(),
      officerIds: [agent._id],
      arrestType: isDossier ? "DOSSIER" : "RAPPORT",
      defconSnapshot: {
        name: defcon.name,
        fineMultiplier: defcon.fineMultiplier,
        sensitiveFineMultiplier: defcon.sensitiveFineMultiplier,
      },
      totalFine,
      totalJailSeconds: totalJail,
      dojRequired,
      sanctions: [...sanctions],
      derouleFaits: args.derouleFaits,
      lieu: args.lieu,
      notes: args.notes,
      cuffedAt: args.cuffedAt,
      mirandaAt: args.mirandaAt,
      rightsLawyer: args.rightsLawyer,
      rightsFood: args.rightsFood,
      rightsMedical: args.rightsMedical,
      finePaid: args.finePaid ?? false,
      // Rapport / images / avocat sur les deux ; champs réservés au dossier sinon ignorés.
      reportBody: args.reportBody,
      imageUrls: args.imageUrls,
      avocat: args.avocat,
      linkedReportId: isDossier ? args.linkedReportId : undefined,
      vehicleIds: isDossier ? args.vehicleIds : undefined,
      weaponIds: isDossier ? args.weaponIds : undefined,
      dossierStatus: isDossier ? args.dossierStatus : undefined,
      forceUsed: isDossier ? args.forceUsed : undefined,
      status: "EMISE",
      createdBy: agent._id,
    });
    for (const s of snaps) await ctx.db.insert("casierCharges", { entryId, ...s });

    const citizen = await ctx.db.get(args.citizenId);
    await writeAudit(ctx, agent, {
      action: "casier.entry_add",
      resourceType: "casierEntry",
      resourceId: entryId,
      resourceLabel: citizen ? `${citizen.prenom} ${citizen.nom}` : "",
      metadata: { totalFine, totalJail, charges: snaps.length, defcon: defcon.name },
    });
    await touchStats(ctx);
    return entryId;
  },
});
