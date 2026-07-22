import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// Schéma complet du MDT SAST - miroir de §10 de PROJET-SAST-MDT.md.
// Convex ajoute d'office _id et _creationTime. authTables = tables de Convex Auth (users, sessions…).
export default defineSchema({
  ...authTables,

  // ============ FONDATIONS (§10.1) ============
  agents: defineTable({
    userId: v.id("users"),
    login: v.string(), // "prenom.nom" auto-généré, NON unique (désambiguïsation au login)
    nomRP: v.string(),
    prenomRP: v.string(),
    matricule: v.optional(v.number()), // 01–99, assigné à la validation, unique
    gradeId: v.optional(v.id("grades")),
    status: v.union(
      v.literal("PENDING"),
      v.literal("ACTIVE"),
      v.literal("INACTIVE"),
      v.literal("SUSPENDED"),
    ),
    isOwner: v.boolean(),
    avatarStorageId: v.optional(v.id("_storage")),
    avatarUrl: v.optional(v.string()),
    dateEntree: v.optional(v.number()),
    // Mot de passe temporaire remis par l'État-Major : impose un changement
    // au prochain accès tant qu'il n'a pas été renouvelé par l'agent.
    mustChangePassword: v.optional(v.boolean()),
    // Verrouillage du compte : aucune session ne peut être ouverte tant que
    // l'échéance n'est pas passée. Posé à la main par l'État-Major.
    lockedUntil: v.optional(v.number()),
    lockedReason: v.optional(v.string()),
    // Préférences d'affichage, rattachées à l'agent pour le suivre d'un
    // navigateur à l'autre plutôt que de rester dans un stockage local.
    uiPrefs: v.optional(
      v.object({
        sidebarCollapsible: v.optional(v.boolean()),
        sidebarHoverExpand: v.optional(v.boolean()),
        dispatchCompact: v.optional(v.boolean()),
      }),
    ),
  })
    .index("by_userId", ["userId"])
    .index("by_login", ["login"])
    .index("by_matricule", ["matricule"])
    .index("by_status", ["status"]),

  agentDivisions: defineTable({
    agentId: v.id("agents"),
    divisionId: v.id("divisions"),
  })
    .index("by_agent", ["agentId"])
    .index("by_division", ["divisionId"]),

  grades: defineTable({
    name: v.string(),
    abbrev: v.optional(v.string()), // abréviation configurable (tags dispatch), ex. "Sgt"
    corps: v.union(v.literal("OPERATIONNEL"), v.literal("SUPERVISION"), v.literal("ETAT_MAJOR")),
    position: v.number(),
    color: v.optional(v.string()),
    // Grade extérieur (ex. DOJ) : peut se connecter avec ses permissions mais hors effectif/organigramme (item 8).
    external: v.optional(v.boolean()),
  }).index("by_position", ["position"]),

  divisions: defineTable({
    name: v.string(),
    tier: v.union(v.literal("PRINCIPALE"), v.literal("SECONDAIRE")),
    color: v.optional(v.string()),
  }),

  // Formations et spécialités (HNT, Police Academy, MRD, Dispatcher...).
  // Attribuées par agent comme les divisions, mais purement déclaratives :
  // elles n'ouvrent aucun droit, elles qualifient l'agent.
  qualifications: defineTable({
    code: v.string(), // sigle affiché (HNT, PA, MRD...)
    name: v.string(),
    kind: v.union(v.literal("FORMATION"), v.literal("SPECIALITE")),
    color: v.optional(v.string()),
    position: v.number(),
    active: v.boolean(),
  }).index("by_position", ["position"]),

  agentQualifications: defineTable({
    agentId: v.id("agents"),
    qualificationId: v.id("qualifications"),
    at: v.number(),
    byAgentId: v.optional(v.id("agents")),
  })
    .index("by_agent", ["agentId"])
    .index("by_qualification", ["qualificationId"]),

  permissions: defineTable({
    slug: v.string(),
    domain: v.string(),
    description: v.string(),
  }).index("by_slug", ["slug"]),

  gradePermissions: defineTable({
    gradeId: v.id("grades"),
    permissionId: v.id("permissions"),
  })
    .index("by_grade", ["gradeId"])
    // Vérifier UN droit sans charger tous ceux du grade : le contrôle de
    // permission s'exécute à chaque requête, c'est le chemin le plus chaud.
    .index("by_grade_permission", ["gradeId", "permissionId"]),

  divisionPermissions: defineTable({
    divisionId: v.id("divisions"),
    permissionId: v.id("permissions"),
  })
    .index("by_division", ["divisionId"])
    .index("by_division_permission", ["divisionId", "permissionId"]),

  invitations: defineTable({
    code: v.string(),
    type: v.union(v.literal("SINGLE"), v.literal("MULTI")),
    maxUses: v.number(),
    usesCount: v.number(),
    expiresAt: v.optional(v.number()),
    createdBy: v.id("agents"),
    revoked: v.boolean(),
  }).index("by_code", ["code"]),

  serviceSessions: defineTable({
    agentId: v.id("agents"),
    source: v.union(v.literal("MANUAL"), v.literal("IN_GAME")),
    callsignType: v.optional(v.string()),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index("by_agent", ["agentId"])
    .index("by_open", ["endedAt"]),

  callsignTypes: defineTable({
    code: v.string(),
    label: v.string(),
    position: v.number(),
    active: v.boolean(),
  }),

  // ============ FLOTTE LSPD (véhicules de service + sorties) ============
  // Véhicules de la station. Le numéro de toit fixe l'indicatif de patrouille :
  // ses deux derniers chiffres deviennent le suffixe (toit 509 -> 13x09).
  fleetVehicles: defineTable({
    modele: v.string(),
    plaque: v.string(),
    roofNumber: v.string(), // numéro de toit complet (ex. "509")
    photoUrls: v.optional(v.array(v.string())),
    searchText: v.string(), // toit + plaque + modèle, normalisés (recherche)
    active: v.boolean(),
    createdBy: v.optional(v.id("agents")),
  }).searchIndex("search", { searchField: "searchText" }),

  // Une sortie = une patrouille roulant avec un véhicule LSPD donné. Changer de
  // véhicule clôt la sortie courante et en ouvre une nouvelle.
  fleetTrips: defineTable({
    fleetVehicleId: v.id("fleetVehicles"),
    patrolId: v.id("patrols"),
    roofNumber: v.string(), // snapshot, l'historique survit à la suppression du véhicule
    vehicleLabel: v.string(), // "Modèle · Plaque", snapshot
    startedBy: v.id("agents"),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index("by_vehicle", ["fleetVehicleId"])
    .index("by_patrol_open", ["patrolId", "endedAt"])
    .index("by_open", ["endedAt"]),

  // Passage d'un agent dans une sortie : entrées et sorties horodatées, pour
  // retracer tous ceux ayant composé la patrouille, même partis.
  fleetTripMembers: defineTable({
    tripId: v.id("fleetTrips"),
    agentId: v.id("agents"),
    joinedAt: v.number(),
    leftAt: v.optional(v.number()),
  })
    .index("by_trip", ["tripId"])
    .index("by_trip_agent_open", ["tripId", "agentId", "leftAt"]),

  // ============ DISPATCH (patrouilles + statuts) ============
  // Statuts configurables = colonnes du board. Les statuts partageant un même `group`
  // sont rassemblés dans UNE colonne, en sections empilées.
  dispatchStatuses: defineTable({
    name: v.string(),
    color: v.optional(v.string()),
    isDefault: v.optional(v.boolean()), // statut initial d'une nouvelle patrouille
    group: v.optional(v.string()), // colonne de regroupement (vide = colonne dédiée)
    icon: v.optional(v.string()), // clé d'icône affichée en filigrane sur la carte
    requires: v.optional(v.array(v.string())), // champs obligatoires (catalogue: secteur, vehiculeType…)
    position: v.number(),
    active: v.boolean(),
  }).index("by_position", ["position"]),

  // Opérations en cours : chaque opération ouverte crée une zone dans la colonne Opération.
  operations: defineTable({
    name: v.string(),
    createdBy: v.id("agents"),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  }).index("by_open", ["endedAt"]),

  // Secteurs de patrouille prédéfinis (configurables). « Autre » est toujours proposé en plus.
  dispatchSectors: defineTable({
    name: v.string(),
    position: v.number(),
    active: v.boolean(),
  }).index("by_position", ["position"]),

  // Patrouilles actives. label = "13" + indicateur + n° véhicule (2 chiffres).
  // Indicateur : auto selon l'effectif (1=L, 2=A, 3=T, 4=X) si callsignTypeId absent, sinon 1re lettre du callsign spécialité.
  patrols: defineTable({
    callsignTypeId: v.optional(v.id("callsignTypes")), // spécialité optionnelle ; absent = classique (auto)
    indicator: v.string(), // lettre dérivée (snapshot)
    vehicleNumber: v.string(), // "09" — 2 derniers chiffres du numéro de toit, ou saisie libre
    fleetVehicleId: v.optional(v.id("fleetVehicles")), // véhicule LSPD pris (absent = non enregistré)
    label: v.string(), // "13T09"
    color: v.optional(v.string()), // couleur de la patrouille (teinte le fond de la carte)
    statusId: v.optional(v.id("dispatchStatuses")),
    operationId: v.optional(v.id("operations")), // zone d'opération courante
    detail: v.optional(v.string()), // détail libre affiché sur la carte
    // Champs obligatoires liés au statut courant (catalogue fixe, cf. dispatchStatuses.requires).
    fields: v.optional(
      v.object({
        secteur: v.optional(v.string()),
        vehiculeType: v.optional(v.string()),
        vehiculeCouleur: v.optional(v.string()),
        occupants: v.optional(v.string()),
        suspects: v.optional(v.string()),
        raison: v.optional(v.string()),
      }),
    ),
    statusSince: v.number(),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    createdBy: v.id("agents"),
  }).index("by_open", ["endedAt"]),

  patrolMembers: defineTable({
    patrolId: v.id("patrols"),
    agentId: v.id("agents"),
    at: v.number(),
  })
    .index("by_patrol", ["patrolId"])
    .index("by_agent", ["agentId"]),

  // Journal d'actions d'une patrouille (statut, membres, couleur, véhicule, opération…).
  patrolEvents: defineTable({
    patrolId: v.id("patrols"),
    at: v.number(),
    byAgentId: v.optional(v.id("agents")), // auteur de l'action (absent = système)
    kind: v.string(), // created | status | member_add | member_remove | detail | color | vehicle | operation | ended
    label: v.string(), // texte lisible affiché dans le journal
  }).index("by_patrol", ["patrolId"]),

  auditLog: defineTable({
    at: v.number(),
    actorId: v.optional(v.id("agents")),
    actorSnapshot: v.optional(
      v.object({
        login: v.string(),
        matricule: v.optional(v.number()),
        gradeName: v.optional(v.string()),
        divisions: v.optional(v.array(v.string())),
        isOwner: v.boolean(),
      }),
    ),
    action: v.string(),
    resourceType: v.string(),
    resourceId: v.optional(v.string()),
    resourceLabel: v.optional(v.string()),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    metadata: v.optional(v.any()),
  })
    .index("by_at", ["at"])
    .index("by_actor", ["actorId"])
    .index("by_resource", ["resourceType", "resourceId"])
    .index("by_action", ["action"]),

  accessLog: defineTable({
    at: v.number(),
    actorId: v.id("agents"),
    kind: v.union(v.literal("SEARCH"), v.literal("LOOKUP"), v.literal("EXPORT")),
    query: v.optional(v.string()),
    resourceType: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_at", ["at"])
    .index("by_actor", ["actorId"]),

  // ============ EFFECTIF (§10.2) ============
  gradeHistory: defineTable({
    agentId: v.id("agents"),
    fromGradeId: v.optional(v.id("grades")),
    toGradeId: v.id("grades"),
    byAgentId: v.optional(v.id("agents")),
    reason: v.optional(v.string()),
    at: v.number(),
  }).index("by_agent", ["agentId"]),

  // ============ CODE PÉNAL (§10.3) ============
  severityLevels: defineTable({
    name: v.string(),
    position: v.number(),
    color: v.optional(v.string()),
  }).index("by_position", ["position"]),

  penalCategories: defineTable({
    name: v.string(),
    position: v.number(),
    sensitive: v.boolean(),
  }).index("by_position", ["position"]),

  sanctionTypes: defineTable({
    name: v.string(),
    position: v.number(),
    active: v.boolean(),
  }),

  penalCharges: defineTable({
    categoryId: v.id("penalCategories"),
    severityId: v.optional(v.id("severityLevels")),
    name: v.string(),
    fine: v.object({
      kind: v.union(
        v.literal("FIXED"),
        v.literal("FORMULA"),
        v.literal("ON_DECISION"),
        v.literal("PER_UNIT"),
        v.literal("UNSPECIFIED"),
      ),
      amount: v.optional(v.number()),
      unit: v.optional(v.string()),
      formula: v.optional(v.string()),
      raw: v.string(),
    }),
    recidiveDays: v.optional(v.number()),
    jailSeconds: v.optional(v.number()),
    jailOnDecision: v.boolean(),
    dojRequest: v.boolean(),
    sanctionIds: v.array(v.id("sanctionTypes")),
    description: v.optional(v.string()),
    // Bornes de quantité (§3) : bloque la validation si le paramètre est hors [min,max].
    minParam: v.optional(v.number()),
    maxParam: v.optional(v.number()),
    active: v.boolean(),
    position: v.number(),
  })
    .index("by_category", ["categoryId"])
    .index("by_severity", ["severityId"])
    .index("by_name", ["name"])
    .searchIndex("search", { searchField: "name" }),

  // ============ DOSSIER CITOYEN (§10.4) ============
  citizens: defineTable({
    empreinte: v.optional(v.string()), // retiré de l'UI (item 8), conservé pour données existantes
    nom: v.string(),
    prenom: v.string(),
    dateNaissance: v.optional(v.string()), // JJ/MM/AAAA
    sexe: v.optional(v.string()),
    nationalite: v.optional(v.string()),
    lieuNaissance: v.optional(v.string()),
    // Description physique (item 8) - options configurables
    taille: v.optional(v.string()),
    poids: v.optional(v.string()),
    ethnie: v.optional(v.string()),
    cheveux: v.optional(v.string()),
    yeux: v.optional(v.string()),
    descriptionPhysique: v.optional(v.string()),
    // Situation
    adresse: v.optional(v.string()),
    groupe: v.optional(v.string()),
    metier: v.optional(v.string()),
    employeur: v.optional(v.string()),
    // Contact
    telephone: v.optional(v.string()),
    email: v.optional(v.string()),
    deceased: v.optional(v.boolean()),
    photoStorageIds: v.array(v.id("_storage")),
    mugshotUrl: v.optional(v.string()),
    status: v.union(v.literal("ACTIVE"), v.literal("MERGED"), v.literal("ARCHIVED")),
    mergedInto: v.optional(v.id("citizens")),
    createdBy: v.optional(v.id("agents")),
    searchText: v.string(),
  })
    .index("by_empreinte", ["empreinte"])
    .index("by_nom", ["nom"])
    .index("by_telephone", ["telephone"])
    .searchIndex("search", { searchField: "searchText" }),

  // Liens de parenté entre citoyens enregistrés (arbre généalogique).
  // PARENT : fromId est le parent de toId (dirigé). SPOUSE / SIBLING : symétriques.
  citizenRelations: defineTable({
    fromId: v.id("citizens"),
    toId: v.id("citizens"),
    kind: v.union(v.literal("PARENT"), v.literal("SPOUSE"), v.literal("SIBLING")),
    byAgentId: v.optional(v.id("agents")),
    at: v.number(),
  })
    .index("by_from", ["fromId"])
    .index("by_to", ["toId"]),

  licenseTypes: defineTable({ name: v.string(), position: v.number(), active: v.boolean() }),

  citizenLicenses: defineTable({
    citizenId: v.id("citizens"),
    licenseTypeId: v.id("licenseTypes"),
    status: v.union(
      v.literal("VALIDE"),
      v.literal("SUSPENDU"),
      v.literal("RETIRE"),
      v.literal("AUCUN"),
    ),
    note: v.optional(v.string()),
    until: v.optional(v.number()),
    updatedBy: v.optional(v.id("agents")),
    updatedAt: v.number(),
  }).index("by_citizen", ["citizenId"]),

  flagTypes: defineTable({
    name: v.string(),
    color: v.optional(v.string()),
    position: v.number(),
    active: v.boolean(),
  }),

  citizenFlags: defineTable({
    citizenId: v.id("citizens"),
    flagTypeId: v.id("flagTypes"),
    note: v.optional(v.string()),
    active: v.boolean(),
    byAgentId: v.optional(v.id("agents")),
    at: v.number(),
  })
    .index("by_citizen", ["citizenId"])
    .index("by_active", ["active"]),

  dossierViews: defineTable({
    citizenId: v.id("citizens"),
    agentId: v.id("agents"),
    at: v.number(),
  }).index("by_citizen", ["citizenId"]),

  // ============ VÉHICULES (§10.5) ============
  vehicles: defineTable({
    plaque: v.string(),
    modele: v.optional(v.string()),
    couleur: v.optional(v.string()),
    type: v.optional(v.string()),
    ownerId: v.optional(v.id("citizens")),
    notes: v.optional(v.string()),
    photoStorageIds: v.array(v.id("_storage")),
    photoUrls: v.optional(v.array(v.string())),
    searchText: v.string(),
    createdBy: v.optional(v.id("agents")),
  })
    .index("by_plaque", ["plaque"])
    .index("by_owner", ["ownerId"])
    .searchIndex("search", { searchField: "searchText" }),

  vehicleFlagTypes: defineTable({
    name: v.string(),
    color: v.optional(v.string()),
    position: v.number(),
    active: v.boolean(),
  }),

  vehicleFlags: defineTable({
    vehicleId: v.id("vehicles"),
    flagTypeId: v.id("vehicleFlagTypes"),
    note: v.optional(v.string()),
    active: v.boolean(),
    byAgentId: v.optional(v.id("agents")),
    at: v.number(),
  })
    .index("by_vehicle", ["vehicleId"])
    .index("by_active", ["active"]),

  // ============ DEFCON + CASIER (§10.6) ============
  defconLevels: defineTable({
    name: v.string(),
    position: v.number(),
    color: v.optional(v.string()),
    fineMultiplier: v.number(),
    sensitiveFineMultiplier: v.number(),
    isDefault: v.boolean(),
  }).index("by_position", ["position"]),

  defconChanges: defineTable({
    levelId: v.id("defconLevels"),
    byAgentId: v.optional(v.id("agents")),
    at: v.number(),
    until: v.optional(v.number()),
  }).index("by_at", ["at"]),

  casierEntries: defineTable({
    citizenId: v.id("citizens"),
    at: v.number(),
    officerIds: v.array(v.id("agents")),
    defconSnapshot: v.object({
      name: v.string(),
      fineMultiplier: v.number(),
      sensitiveFineMultiplier: v.number(),
    }),
    totalFine: v.number(),
    totalJailSeconds: v.number(),
    dojRequired: v.boolean(),
    sanctions: v.array(v.string()),
    derouleFaits: v.optional(v.string()),
    lieu: v.optional(v.string()),
    notes: v.optional(v.string()),
    reportId: v.optional(v.id("reports")),
    status: v.union(v.literal("EMISE"), v.literal("ANNULEE")),
    annulReason: v.optional(v.string()),
    // Champs arrestation (§3)
    cuffedAt: v.optional(v.string()),
    mirandaAt: v.optional(v.string()),
    rightsLawyer: v.optional(v.boolean()),
    rightsFood: v.optional(v.boolean()),
    rightsMedical: v.optional(v.boolean()),
    // Rapport vs Dossier d'arrestation (items 6, 10)
    arrestType: v.optional(v.union(v.literal("RAPPORT"), v.literal("DOSSIER"))),
    reportBody: v.optional(v.string()),
    imageUrls: v.optional(v.array(v.string())),
    avocat: v.optional(v.string()),
    linkedReportId: v.optional(v.id("reports")), // dossier uniquement
    vehicleIds: v.optional(v.array(v.id("vehicles"))),
    weaponIds: v.optional(v.array(v.id("weapons"))),
    dossierStatus: v.optional(v.string()), // dossier uniquement (configurable)
    forceUsed: v.optional(v.boolean()),
    // Statut de l'amende (item 4) : peut ne pas être payée sur le moment.
    finePaid: v.optional(v.boolean()),
    // Clôture d'un dossier d'arrestation : non modifiable sauf permission spéciale.
    closed: v.optional(v.boolean()),
    closedAt: v.optional(v.number()),
    closedBy: v.optional(v.id("agents")),
    // Soft-delete (§18)
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
    createdBy: v.id("agents"),
  })
    .index("by_citizen", ["citizenId"])
    .index("by_deleted", ["deletedAt"]),

  casierCharges: defineTable({
    entryId: v.id("casierEntries"),
    penalChargeId: v.optional(v.id("penalCharges")),
    snapshot: v.object({
      name: v.string(),
      category: v.string(),
      severity: v.string(),
      sensitive: v.boolean(),
      fineRaw: v.string(),
      jailSeconds: v.optional(v.number()),
      dojRequest: v.boolean(),
      sanctions: v.array(v.string()),
    }),
    formulaParam: v.optional(v.any()),
    isRecidive: v.boolean(),
    computedFine: v.number(),
    computedJailSeconds: v.number(),
    onDecision: v.boolean(),
  }).index("by_entry", ["entryId"]),

  // ============ MANDATS (§10.7) ============
  mandatTypes: defineTable({
    name: v.string(),
    position: v.number(),
    marksWanted: v.boolean(),
    active: v.boolean(),
  }),

  mandats: defineTable({
    citizenId: v.id("citizens"),
    typeId: v.id("mandatTypes"),
    motif: v.string(),
    status: v.union(v.literal("ACTIF"), v.literal("EXECUTE"), v.literal("ANNULE"), v.literal("EXPIRE")),
    expiresAt: v.optional(v.number()),
    casierEntryId: v.optional(v.id("casierEntries")),
    notes: v.optional(v.string()),
    issuedBy: v.id("agents"),
    issuedAt: v.number(),
    executedBy: v.optional(v.id("agents")),
    executedAt: v.optional(v.number()),
    annulReason: v.optional(v.string()),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
  })
    .index("by_citizen", ["citizenId"])
    .index("by_status", ["status"])
    .index("by_deleted", ["deletedAt"]),

  // ============ RAPPORTS (§10.8) ============
  reportTypes: defineTable({
    name: v.string(),
    position: v.number(),
    active: v.boolean(),
  }),

  reports: defineTable({
    typeId: v.id("reportTypes"),
    title: v.string(),
    leadId: v.id("agents"), // lead opé
    scribeId: v.optional(v.id("agents")),
    negotiatorId: v.optional(v.id("agents")),
    status: v.union(v.literal("BROUILLON"), v.literal("SOUMIS"), v.literal("VALIDE")),
    lieu: v.optional(v.string()),
    mapX: v.optional(v.number()), // position sur la carte (§19)
    mapY: v.optional(v.number()),
    citizenIds: v.array(v.id("citizens")), // suspects impliqués
    vehicleIds: v.array(v.id("vehicles")),
    weaponIds: v.optional(v.array(v.id("weapons"))), // armes utilisées (item 6)
    // Douilles ramassées (item 9)
    casings: v.optional(
      v.array(
        v.object({
          serial: v.optional(v.string()),
          time: v.optional(v.string()),
          caliber: v.optional(v.string()),
          location: v.optional(v.string()),
          notes: v.optional(v.string()),
        }),
      ),
    ),
    imageUrls: v.optional(v.array(v.string())), // galerie
    casierEntryId: v.optional(v.id("casierEntries")),
    attachmentStorageIds: v.array(v.id("_storage")),
    createdBy: v.id("agents"),
    submittedAt: v.optional(v.number()),
    validatedBy: v.optional(v.id("agents")),
    validatedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
  })
    .index("by_status", ["status"])
    .index("by_lead", ["leadId"])
    .index("by_deleted", ["deletedAt"])
    .searchIndex("search", { searchField: "title" }),

  reportContributors: defineTable({
    reportId: v.id("reports"),
    agentId: v.id("agents"),
    at: v.number(),
    manual: v.optional(v.boolean()), // true = ajouté manuellement (§7), sinon contributeur auto
  }).index("by_report", ["reportId"]).index("by_agent", ["agentId"]),

  // Notes personnelles par agent (max 2000 caractères), alimentent le brouillon (§7).
  reportNotes: defineTable({
    reportId: v.id("reports"),
    agentId: v.id("agents"),
    text: v.string(),
    updatedAt: v.number(),
  })
    .index("by_report", ["reportId"])
    .index("by_report_agent", ["reportId", "agentId"]),

  // ============ NOTES CITOYEN ============
  citizenNotes: defineTable({
    citizenId: v.id("citizens"),
    text: v.string(),
    tone: v.optional(v.string()),
    byAgentId: v.optional(v.id("agents")),
    at: v.number(),
  }).index("by_citizen", ["citizenId"]),

  // ============ PROTOCOLES / SOP ============
  protocols: defineTable({
    title: v.string(),
    category: v.optional(v.string()),
    content: v.string(),
    imageUrls: v.optional(v.array(v.string())),
    position: v.number(),
    updatedBy: v.optional(v.id("agents")),
    updatedAt: v.number(),
  }).index("by_position", ["position"]),

  // ============ ABSENCES / LOA ============
  absences: defineTable({
    agentId: v.id("agents"),
    reason: v.string(),
    from: v.number(),
    to: v.number(),
    status: v.union(
      v.literal("EN_ATTENTE"),
      v.literal("APPROUVEE"),
      v.literal("REFUSEE"),
      v.literal("ANNULEE"),
    ),
    decidedBy: v.optional(v.id("agents")),
    at: v.number(),
  })
    .index("by_agent", ["agentId"])
    .index("by_status", ["status"]),

  // ============ DISCIPLINE ============
  // Types de sanction disciplinaire prédéfinis, configurables (§12).
  disciplineSanctionTypes: defineTable({
    name: v.string(),
    position: v.number(),
    active: v.boolean(),
  }).index("by_position", ["position"]),

  disciplines: defineTable({
    agentId: v.id("agents"),
    motif: v.string(),
    sanction: v.string(),
    status: v.union(v.literal("OUVERTE"), v.literal("CLOSE")),
    imageUrls: v.optional(v.array(v.string())),
    byAgentId: v.optional(v.id("agents")),
    at: v.number(),
  }).index("by_agent", ["agentId"]),

  // ============ RESSOURCES (livret cadets, §9) ============
  resourceCategories: defineTable({
    name: v.string(),
    position: v.number(),
  }).index("by_position", ["position"]),

  resources: defineTable({
    categoryId: v.id("resourceCategories"),
    title: v.string(),
    content: v.string(),
    imageUrls: v.optional(v.array(v.string())),
    position: v.number(),
    updatedBy: v.optional(v.id("agents")),
    updatedAt: v.number(),
  })
    .index("by_category", ["categoryId"])
    .index("by_position", ["position"]),

  // ============ CARTE DE LOS SANTOS (§19) ============
  // Réglages de la carte (image de fond, etc.), singleton.
  mapConfig: defineTable({
    imageUrl: v.optional(v.string()),
    updatedBy: v.optional(v.id("agents")),
    updatedAt: v.number(),
  }),

  // Lieux et secteurs définis sur la carte (x/y en pourcentage 0-100).
  mapLocations: defineTable({
    name: v.string(),
    kind: v.union(v.literal("LIEU"), v.literal("SECTEUR")),
    x: v.number(),
    y: v.number(),
    color: v.optional(v.string()),
    // Délimitation d'un secteur : polygone en % (0-100).
    points: v.optional(v.array(v.object({ x: v.number(), y: v.number() }))),
    note: v.optional(v.string()),
    createdBy: v.optional(v.id("agents")),
  }),

  // Instantané des statistiques, singleton. Le calcul balaie plusieurs tables :
  // le laisser en requête réactive le rejouait à chaque écriture ET pour chaque
  // client abonné. Il est désormais recalculé au plus une fois par fenêtre.
  statsSnapshot: defineTable({
    data: v.any(),
    computedAt: v.number(),
  }),

  // ============ INTÉGRATIONS (webhooks Discord) ============
  // Réglages d'intégration, singleton. baseUrl sert à construire les liens
  // profonds envoyés dans les webhooks (le serveur ignore l'URL du client).
  integrationConfig: defineTable({
    baseUrl: v.optional(v.string()),
    updatedBy: v.optional(v.id("agents")),
    updatedAt: v.number(),
  }),

  webhooks: defineTable({
    name: v.string(),
    url: v.string(), // URL de webhook Discord
    events: v.array(v.string()), // slugs du catalogue (voir convex/webhooks.ts)
    active: v.boolean(),
    lastStatus: v.optional(v.string()), // résultat du dernier envoi (diagnostic)
    lastAt: v.optional(v.number()),
  }).index("by_active", ["active"]),

  // ============ BOLO / AVIS DE RECHERCHE ============
  bolos: defineTable({
    kind: v.union(v.literal("PERSONNE"), v.literal("VEHICULE")),
    title: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    citizenId: v.optional(v.id("citizens")),
    vehicleId: v.optional(v.id("vehicles")),
    danger: v.optional(v.boolean()), // « armé et dangereux » : met l'avis en tête
    active: v.boolean(),
    createdBy: v.id("agents"),
    at: v.number(),
    closedAt: v.optional(v.number()),
    closedBy: v.optional(v.id("agents")),
  }).index("by_active", ["active"]),

  // ============ CONTRAVENTIONS (§10.9) ============
  citations: defineTable({
    citizenId: v.id("citizens"),
    vehicleId: v.optional(v.id("vehicles")),
    at: v.number(),
    officerId: v.id("agents"),
    defconSnapshot: v.object({
      name: v.string(),
      fineMultiplier: v.number(),
      sensitiveFineMultiplier: v.number(),
    }),
    totalFine: v.number(),
    notes: v.optional(v.string()),
    status: v.union(v.literal("EMISE"), v.literal("ANNULEE")),
    annulReason: v.optional(v.string()),
    finePaid: v.optional(v.boolean()), // statut de paiement de l'amende (recouvrement)
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
    createdBy: v.id("agents"),
  })
    .index("by_citizen", ["citizenId"])
    .index("by_vehicle", ["vehicleId"])
    .index("by_deleted", ["deletedAt"]),

  citationCharges: defineTable({
    citationId: v.id("citations"),
    penalChargeId: v.optional(v.id("penalCharges")),
    snapshot: v.object({
      name: v.string(),
      category: v.string(),
      severity: v.string(),
      sensitive: v.boolean(),
      fineRaw: v.string(),
      dojRequest: v.boolean(),
      sanctions: v.array(v.string()),
    }),
    formulaParam: v.optional(v.any()),
    isRecidive: v.boolean(),
    computedFine: v.number(),
    onDecision: v.boolean(),
  }).index("by_citation", ["citationId"]),

  // ============ RÉFÉRENTIELS CONFIGURABLES (phase 2) ============
  // Listes "nommées" génériques : name / position / active.
  weaponTypes: defineTable({ name: v.string(), position: v.number(), active: v.boolean() }).index("by_position", ["position"]),
  complaintStatuses: defineTable({ name: v.string(), position: v.number(), active: v.boolean() }).index("by_position", ["position"]),
  dossierStatuses: defineTable({ name: v.string(), position: v.number(), active: v.boolean() }).index("by_position", ["position"]),
  ethnies: defineTable({ name: v.string(), position: v.number(), active: v.boolean() }).index("by_position", ["position"]),
  hairColors: defineTable({ name: v.string(), position: v.number(), active: v.boolean() }).index("by_position", ["position"]),
  eyeColors: defineTable({ name: v.string(), position: v.number(), active: v.boolean() }).index("by_position", ["position"]),
  citizenGroups: defineTable({ name: v.string(), position: v.number(), active: v.boolean() }).index("by_position", ["position"]),

  // Origine d'une arme (légale, militaire, marché noir...), configurable.
  weaponOrigins: defineTable({ name: v.string(), position: v.number(), active: v.boolean() }).index("by_position", ["position"]),

  // ============ CALENDRIER (item 1) ============
  calendarEvents: defineTable({
    at: v.number(), // début du jour concerné (timestamp)
    title: v.string(),
    lieu: v.optional(v.string()),
    startTime: v.optional(v.string()), // "HH:MM"
    endTime: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdBy: v.optional(v.id("agents")),
  }).index("by_at", ["at"]),

  // ============ PLAINTES (item 2) ============
  complaints: defineTable({
    plaignantId: v.id("citizens"),
    defendantCitizenId: v.optional(v.id("citizens")), // OU
    defendantName: v.optional(v.string()), // personne non recensée
    agentIds: v.array(v.id("agents")), // agents en charge
    motif: v.string(),
    status: v.string(), // configurable
    avocat: v.optional(v.string()),
    body: v.string(),
    at: v.number(),
    createdBy: v.optional(v.id("agents")),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
  })
    .index("by_plaignant", ["plaignantId"])
    .index("by_defendant", ["defendantCitizenId"])
    .index("by_deleted", ["deletedAt"]),

  // ============ ARMES (item 3) ============
  weapons: defineTable({
    typeId: v.optional(v.id("weaponTypes")),
    typeName: v.optional(v.string()), // snapshot lisible
    modele: v.string(),
    serial: v.string(),
    motif: v.optional(v.string()),
    origine: v.optional(v.string()), // catégorie issue de weaponOrigins
    ownerId: v.optional(v.id("citizens")),
    status: v.union(
      v.literal("ACTIVE"),
      v.literal("ENREGISTREE"),
      v.literal("SAISIE"),
      v.literal("DETRUITE"),
    ),
    at: v.number(),
    createdBy: v.optional(v.id("agents")),
    searchText: v.string(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_serial", ["serial"])
    .searchIndex("search", { searchField: "searchText" }),

  // ============ DÉPOSITIONS (item 7) ============
  depositions: defineTable({
    citizenId: v.id("citizens"),
    linkType: v.union(v.literal("COMPLAINT"), v.literal("DOSSIER"), v.literal("REPORT")),
    complaintId: v.optional(v.id("complaints")),
    casierEntryId: v.optional(v.id("casierEntries")), // legacy
    reportId: v.optional(v.id("reports")),
    title: v.optional(v.string()),
    body: v.string(),
    at: v.number(),
    createdBy: v.optional(v.id("agents")),
  }).index("by_citizen", ["citizenId"]),

  // ============ FICHE DE RENSEIGNEMENT AGENT (item 11) ============
  agentSheets: defineTable({
    agentId: v.id("agents"),
    submittedAt: v.optional(v.number()),
    data: v.any(), // contenu du formulaire (structure flexible)
  }).index("by_agent", ["agentId"]),

  // ============ SAISIES (item 10) ============
  saisieObjectTypes: defineTable({ name: v.string(), position: v.number(), active: v.boolean() }),
  saisies: defineTable({
    at: v.number(),
    agentId: v.id("agents"),
    matricule: v.optional(v.number()), // snapshot
    agentName: v.string(), // snapshot
    enquete: v.optional(v.string()), // enquête liée (libre)
    quantity: v.number(),
    objectType: v.string(), // nom du type OU "Autre"
    otherLabel: v.optional(v.string()), // saisi librement si "Autre"
  }).index("by_at", ["at"]),
});
