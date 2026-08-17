import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAgent, requirePermission, requireOwnOrPermission, agentLabel, can } from "./rbac";
import { writeAudit } from "./lib/audit";
import { touchStats } from "./stats";
import { notify, NOTIFY_COLOR, deepLink } from "./lib/notify";
import { computeCharge } from "./lib/calc";
import { chargeDisplayName } from "./lib/charges";
import { parisInfractionStamp } from "./citations";

// Officiers affichables d'une entrée, avec état de rattachement.
//  - `linked: true`  = relié à un compte du MDT (badge + nom à jour)
//  - `linked: false` = nom simplement écrit dans le rapport (import Nexus,
//    agent parti ou jamais créé) -> affiché tel quel, sans badge.
async function officerViews(
  ctx: QueryCtx,
  e: { officers?: { name: string; matricule?: string; agentId?: import("./_generated/dataModel").Id<"agents"> }[]; officerIds: import("./_generated/dataModel").Id<"agents">[] },
): Promise<{ name: string; matricule: number | null; linked: boolean }[]> {
  if (e.officers && e.officers.length) {
    const out = [];
    for (const o of e.officers) {
      if (o.agentId) {
        const l = await agentLabel(ctx, o.agentId);
        out.push({ name: l.name, matricule: l.matricule, linked: true });
      } else {
        // Non relié : on garde le matricule Nexus (chiffres) pour l'affichage.
        const d = (o.matricule ?? "").replace(/\D/g, "");
        out.push({ name: o.name, matricule: d ? Number(d) : null, linked: false });
      }
    }
    return out;
  }
  const out = [];
  for (const oid of e.officerIds) {
    const l = await agentLabel(ctx, oid);
    out.push({ name: l.name, matricule: l.matricule, linked: true });
  }
  return out;
}

// Type d'une charge saisie (casier / rapport / dossier), label tentative inclus.
type ChargeInput = {
  penalChargeId: import("./_generated/dataModel").Id<"penalCharges">;
  param?: number;
  isRecidive: boolean;
  attemptType?: "TENTATIVE" | "COMPLICITE";
};
type ChargeSnap = {
  penalChargeId: ChargeInput["penalChargeId"];
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
  attemptType?: "TENTATIVE" | "COMPLICITE";
  computedFine: number;
  computedJailSeconds: number;
  onDecision: boolean;
};

// Construit les snapshots + totaux d'une liste de chefs d'inculpation. Source de
// vérité partagée par addEntry et updateCharges. Valide aussi les bornes de
// quantité (§3). Le calcul est INCHANGÉ (tentative / complicité = label seul).
async function buildCharges(
  ctx: QueryCtx,
  defcon: { name: string; fineMultiplier: number; sensitiveFineMultiplier: number },
  charges: ChargeInput[],
): Promise<{ snaps: ChargeSnap[]; totalFine: number; totalJail: number; sanctions: string[]; dojRequired: boolean }> {
  // Validation des bornes de quantité (§3) : le paramètre doit être dans [min, max].
  for (const c of charges) {
    const pc = await ctx.db.get(c.penalChargeId);
    if (!pc) continue;
    if (pc.minParam != null && (c.param ?? 0) < pc.minParam)
      throw new ConvexError(`« ${pc.name} » : quantité minimale ${pc.minParam}.`);
    if (pc.maxParam != null && (c.param ?? 0) > pc.maxParam)
      throw new ConvexError(`« ${pc.name} » : quantité maximale ${pc.maxParam}.`);
  }

  let totalFine = 0;
  let totalJail = 0;
  const sanctions = new Set<string>();
  let dojRequired = false;
  const snaps: ChargeSnap[] = [];

  for (const c of charges) {
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
      attemptType: c.attemptType,
      computedFine: res.fine,
      computedJailSeconds: res.jailSeconds,
      onDecision: res.onDecision,
    });
  }

  return { snaps, totalFine, totalJail, sanctions: [...sanctions], dojRequired };
}

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
        officer: (await officerViews(ctx, e))[0] ?? { name: "-", matricule: null, linked: true },
        chargeCount: charges.length,
        charges: charges.map((c) => chargeDisplayName(c.snapshot.name, c.attemptType)),
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
    const officers = await officerViews(ctx, e);
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
      jugement: e.jugement ?? null,
      baremeAmende: e.baremeAmende ?? null,
      charges: charges.map((c) => ({
        // Nom brut + label d'affichage (tentative / complicité).
        name: c.snapshot.name,
        attemptType: c.attemptType ?? null,
        displayName: chargeDisplayName(c.snapshot.name, c.attemptType),
        category: c.snapshot.category,
        severity: c.snapshot.severity,
        sensitive: c.snapshot.sensitive,
        fineRaw: c.snapshot.fineRaw,
        computedFine: c.computedFine,
        computedJailSeconds: c.computedJailSeconds,
        isRecidive: c.isRecidive,
        onDecision: c.onDecision,
        formulaParam: c.formulaParam,
        penalChargeId: c.penalChargeId ?? null,
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
    if (!e) throw new ConvexError("Entrée introuvable.");
    // Un dossier clôturé n'est modifiable qu'avec la permission spéciale (item I).
    if (e.closed && !(await can(ctx, agent, "casier.editClosed"))) {
      throw new ConvexError("Ce dossier est clôturé. Seul un haut gradé peut le modifier.");
    }
    // Un rapport (pas dossier) ne porte pas les champs réservés au dossier.
    const patch =
      f.arrestType === "DOSSIER"
        ? f
        : { ...f, linkedReportId: undefined, vehicleIds: undefined, weaponIds: undefined, dossierStatus: undefined };
    // Suivi Discord : l'embed du salon de suivi doit refléter la modification.
    await ctx.db.patch(entryId, { ...patch, trackingDirty: true });
    const citizen = await ctx.db.get(e.citizenId);
    await writeAudit(ctx, agent, {
      action: "casier.arrest_update",
      resourceType: "casierEntry",
      resourceId: entryId,
      resourceLabel: citizen ? `${citizen.prenom} ${citizen.nom}` : "",
      metadata: { arrestType: f.arrestType },
    });
    await notify(ctx, "casier.update", {
      title: "Dossier d'arrestation modifié",
      description: citizen ? `**${citizen.prenom} ${citizen.nom}**` : undefined,
      color: NOTIFY_COLOR.muted,
      url: await deepLink(ctx, `/citoyen/${e.citizenId}`),
      footer: `Modifié par ${agent.prenomRP} ${agent.nomRP}`,
    });
    await ctx.scheduler.runAfter(0, internal.push.notify, {});
  },
});

// Clôture / réouverture d'un dossier d'arrestation (item I).
export const closeDossier = mutation({
  args: { entryId: v.id("casierEntries") },
  handler: async (ctx, { entryId }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "casier.edit");
    const e = await ctx.db.get(entryId);
    if (!e) throw new ConvexError("Entrée introuvable.");
    await ctx.db.patch(entryId, { closed: true, closedAt: Date.now(), closedBy: agent._id, trackingDirty: true });
    await writeAudit(ctx, agent, { action: "casier.dossier_close", resourceType: "casierEntry", resourceId: entryId });
    const closedCitizen = await ctx.db.get(e.citizenId);
    await notify(ctx, "casier.closed", {
      title: "Dossier d'arrestation clôturé",
      description: closedCitizen ? `**${closedCitizen.prenom} ${closedCitizen.nom}**` : undefined,
      color: NOTIFY_COLOR.muted,
      url: await deepLink(ctx, `/citoyen/${e.citizenId}`),
      footer: `Clôturé par ${agent.prenomRP} ${agent.nomRP}`,
    });
    await ctx.scheduler.runAfter(0, internal.push.notify, {});
  },
});
export const reopenDossier = mutation({
  args: { entryId: v.id("casierEntries") },
  handler: async (ctx, { entryId }) => {
    const agent = await requireAgent(ctx);
    // Rouvrir un dossier clos exige la permission spéciale (haut gradé).
    await requirePermission(ctx, agent, "casier.editClosed");
    const e = await ctx.db.get(entryId);
    if (!e) throw new ConvexError("Entrée introuvable.");
    await ctx.db.patch(entryId, { closed: false, closedAt: undefined, closedBy: undefined, trackingDirty: true });
    await writeAudit(ctx, agent, { action: "casier.dossier_reopen", resourceType: "casierEntry", resourceId: entryId });
    const reopenedCitizen = await ctx.db.get(e.citizenId);
    await notify(ctx, "casier.reopen", {
      title: "Dossier d'arrestation rouvert",
      description: reopenedCitizen ? `**${reopenedCitizen.prenom} ${reopenedCitizen.nom}**` : undefined,
      color: NOTIFY_COLOR.warning,
      url: await deepLink(ctx, `/citoyen/${e.citizenId}`),
      footer: `Rouvert par ${agent.prenomRP} ${agent.nomRP}`,
    });
    await ctx.scheduler.runAfter(0, internal.push.notify, {});
  },
});

// Suppression douce d'une entrée de casier (§18 : va en Archive, restaurable).
export const remove = mutation({
  args: { entryId: v.id("casierEntries") },
  handler: async (ctx, { entryId }) => {
    const agent = await requireAgent(ctx);
    const e = await ctx.db.get(entryId);
    if (!e) throw new ConvexError("Entrée introuvable.");
    if (e.deletedAt) return;
    // L'agent qui a établi l'acte peut l'annuler ; au-delà, la permission.
    await requireOwnOrPermission(ctx, agent, e.createdBy, "casier.annul");
    const citizen = await ctx.db.get(e.citizenId);
    // Suivi Discord : marquer sale pour que le bot retire/annule l'embed.
    await ctx.db.patch(entryId, { deletedAt: Date.now(), deletedBy: agent._id, trackingDirty: true });
    await writeAudit(ctx, agent, {
      action: "casier.entry_delete",
      resourceType: "casierEntry",
      resourceId: entryId,
      resourceLabel: citizen ? `${citizen.prenom} ${citizen.nom}` : "",
      metadata: { soft: true, totalFine: e.totalFine, lieu: e.lieu },
    });
    await touchStats(ctx);
    await notify(ctx, "casier.delete", {
      title: "Entrée de casier supprimée",
      description: citizen ? `**${citizen.prenom} ${citizen.nom}**` : undefined,
      color: NOTIFY_COLOR.danger,
      url: await deepLink(ctx, `/citoyen/${e.citizenId}`),
      footer: `Supprimée par ${agent.prenomRP} ${agent.nomRP}`,
    });
    await ctx.scheduler.runAfter(0, internal.push.notify, {});
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
        // Tentative / complicité (label seul ; n'affecte ni calcul ni Nexus).
        attemptType: v.optional(v.union(v.literal("TENTATIVE"), v.literal("COMPLICITE"))),
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
    if (!defcon) throw new ConvexError("DEFCON non configuré.");

    const { snaps, totalFine, totalJail, sanctions, dojRequired } = await buildCharges(ctx, defcon, args.charges);

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
      // Suivi Discord : à publier dans le salon de suivi (embed).
      trackingDirty: true,
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
    await notify(ctx, "casier.create", {
      title: isDossier ? "Dossier d'arrestation créé" : "Entrée de casier créée",
      description: citizen ? `**${citizen.prenom} ${citizen.nom}**` : undefined,
      color: NOTIFY_COLOR.warning,
      fields: [
        { name: "Chefs d'accusation", value: String(snaps.length), inline: true },
        ...(totalFine > 0 ? [{ name: "Amende", value: `$${totalFine.toLocaleString("fr-FR")}`, inline: true }] : []),
      ],
      url: await deepLink(ctx, `/citoyen/${args.citizenId}`),
      footer: `Établi par ${agent.prenomRP} ${agent.nomRP}`,
    });

    // Amende (entité pénalité financière) auto-créée depuis l'entrée de casier,
    // pré-remplie et poussée vers le Nexus (write-through asynchrone). Les agents
    // n'en modifieront ensuite que le statut. Pas d'amende si aucun montant dû.
    if (totalFine > 0) {
      const { date, heure } = parisInfractionStamp();
      // Si l'amende est déjà réglée à l'arrestation, l'amende naît « Payée ».
      const amendeStatut = args.finePaid ? "Payée" : "Notifiée";
      const amendeId = await ctx.db.insert("amendes", {
        citizenId: args.citizenId,
        sourceType: "CASIER",
        casierEntryId: entryId,
        typeAmende: "Amende de police",
        statut: amendeStatut,
        objet: snaps.map((s) => s.snapshot.name).join(" + ") || undefined,
        montant: totalFine,
        dateInfraction: date,
        heureInfraction: heure,
        lieuInfraction: args.lieu || undefined,
        autoriteCompetente: "LSPD - Los Santos Police Department",
        verbalisateurNom: `${agent.prenomRP} ${agent.nomRP}`,
        matriculeAgent: agent.matricule ?? undefined,
        description: (args.derouleFaits || args.reportBody || args.notes) || undefined,
        at: Date.now(),
        createdBy: agent._id,
      });
      await ctx.scheduler.runAfter(0, internal.nexusSync.pushAmende, { amendeId, agentId: agent._id });
      await notify(ctx, "amende.create", {
        title: "Amende émise",
        description: citizen ? `**${citizen.prenom} ${citizen.nom}**` : undefined,
        color: NOTIFY_COLOR.warning,
        fields: [
          { name: "Montant", value: `$${totalFine.toLocaleString("fr-FR")}`, inline: true },
          { name: "Statut", value: amendeStatut, inline: true },
        ],
        url: await deepLink(ctx, `/citoyen/${args.citizenId}`),
        footer: `Émise par ${agent.prenomRP} ${agent.nomRP}`,
      });
    }

    // Prévient le bot qu'il y a un embed de suivi à poster (best-effort).
    await ctx.scheduler.runAfter(0, internal.push.notify, {});
    return entryId;
  },
});

// Édition des chefs d'inculpation d'une entrée NON clôturée (item 2). Recalcule
// les totaux (logique de calcul INCHANGÉE), remplace les snapshots de charges et
// met à jour l'amende liée (montant + objet) localement, avec répercussion Nexus.
export const updateCharges = mutation({
  args: {
    entryId: v.id("casierEntries"),
    charges: v.array(
      v.object({
        penalChargeId: v.id("penalCharges"),
        param: v.optional(v.number()),
        isRecidive: v.boolean(),
        attemptType: v.optional(v.union(v.literal("TENTATIVE"), v.literal("COMPLICITE"))),
      }),
    ),
  },
  handler: async (ctx, { entryId, charges }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "casier.create");
    const e = await ctx.db.get(entryId);
    if (!e) throw new ConvexError("Entrée introuvable.");
    if (e.deletedAt) throw new ConvexError("Entrée archivée.");
    // Un dossier clôturé n'est modifiable qu'avec la permission spéciale (item I).
    if (e.closed && !(await can(ctx, agent, "casier.editClosed"))) {
      throw new ConvexError("Ce dossier est clôturé. Seul un haut gradé peut le modifier.");
    }
    const defcon = await currentDefcon(ctx);
    if (!defcon) throw new ConvexError("DEFCON non configuré.");

    const { snaps, totalFine, totalJail, sanctions, dojRequired } = await buildCharges(ctx, defcon, charges);

    // Remplace les snapshots de charges.
    const old = await ctx.db.query("casierCharges").withIndex("by_entry", (q) => q.eq("entryId", entryId)).collect();
    for (const c of old) await ctx.db.delete(c._id);
    for (const s of snaps) await ctx.db.insert("casierCharges", { entryId, ...s });

    // Patch des totaux (calcul inchangé, tentative / complicité = label seul).
    // Suivi Discord : l'embed du salon de suivi doit refléter les nouveaux chefs.
    await ctx.db.patch(entryId, { totalFine, totalJailSeconds: totalJail, dojRequired, sanctions, trackingDirty: true });

    const citizen = await ctx.db.get(e.citizenId);
    const objet = snaps.map((s) => s.snapshot.name).join(" + ") || undefined; // noms bruts (jamais préfixés, va vers Nexus)

    // Amende liée : mise à jour locale du montant + objet, puis répercussion Nexus.
    const amende = (await ctx.db.query("amendes").withIndex("by_casier", (q) => q.eq("casierEntryId", entryId)).collect())
      .find((a) => !a.deletedAt);
    if (amende) {
      await ctx.db.patch(amende._id, { montant: totalFine, objet });
      if (amende.nexusId) {
        await ctx.scheduler.runAfter(0, internal.nexusSync.patchAmende, { amendeId: amende._id, agentId: agent._id });
      }
    } else if (totalFine > 0) {
      // Pas d'amende à l'origine (montant nul à la création) et il y a désormais
      // un montant dû : on la crée (miroir du bloc de addEntry) et on la pousse.
      const { date, heure } = parisInfractionStamp();
      const amendeStatut = e.finePaid ? "Payée" : "Notifiée";
      const amendeId = await ctx.db.insert("amendes", {
        citizenId: e.citizenId,
        sourceType: "CASIER",
        casierEntryId: entryId,
        typeAmende: "Amende de police",
        statut: amendeStatut,
        objet,
        montant: totalFine,
        dateInfraction: date,
        heureInfraction: heure,
        lieuInfraction: e.lieu || undefined,
        autoriteCompetente: "LSPD - Los Santos Police Department",
        verbalisateurNom: `${agent.prenomRP} ${agent.nomRP}`,
        matriculeAgent: agent.matricule ?? undefined,
        description: (e.derouleFaits || e.reportBody || e.notes) || undefined,
        at: Date.now(),
        createdBy: agent._id,
      });
      await ctx.scheduler.runAfter(0, internal.nexusSync.pushAmende, { amendeId, agentId: agent._id });
    }

    await writeAudit(ctx, agent, {
      action: "casier.charges_update",
      resourceType: "casierEntry",
      resourceId: entryId,
      resourceLabel: citizen ? `${citizen.prenom} ${citizen.nom}` : "",
      metadata: { totalFine, charges: snaps.length },
    });
    await touchStats(ctx);
    await notify(ctx, "casier.update", {
      title: "Chefs d'inculpation modifiés",
      description: citizen ? `**${citizen.prenom} ${citizen.nom}**` : undefined,
      color: NOTIFY_COLOR.muted,
      fields: [
        { name: "Chefs d'accusation", value: String(snaps.length), inline: true },
        ...(totalFine > 0 ? [{ name: "Amende", value: `$${totalFine.toLocaleString("fr-FR")}`, inline: true }] : []),
      ],
      url: await deepLink(ctx, `/citoyen/${e.citizenId}`),
      footer: `Modifié par ${agent.prenomRP} ${agent.nomRP}`,
    });
    await ctx.scheduler.runAfter(0, internal.push.notify, {});

    return entryId;
  },
});
