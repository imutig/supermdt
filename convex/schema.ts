import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// Embed Discord riche, réutilisé par le panneau de candidature, le message
// d'ouverture et les templates : auteur, titre, description, couleur, miniature,
// grande image, pied, et champs multiples.
const richEmbed = v.object({
  authorName: v.optional(v.string()),
  authorIcon: v.optional(v.string()),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  color: v.optional(v.string()),
  thumbnail: v.optional(v.string()),
  image: v.optional(v.string()),
  footer: v.optional(v.string()),
  footerIcon: v.optional(v.string()),
  fields: v.optional(v.array(v.object({ name: v.string(), value: v.string(), inline: v.optional(v.boolean()) }))),
});

// Événement dans le journal d'un ticket de candidature : création, changement de
// statut, présence/absence, fermeture, réouverture. `by` = auteur (pseudo Discord).
const ticketEvent = v.object({
  at: v.number(),
  type: v.string(), // created | status | presence | absence | close | reopen
  label: v.string(),
  by: v.optional(v.string()),
});

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
    // Compte Discord relié (liaison via invitation ciblée) : facilite l'attribution
    // de grades/divisions et l'exécution des montées en grade côté Discord.
    discordId: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
    avatarUrl: v.optional(v.string()),
    dateEntree: v.optional(v.number()),
    // Grade d'académie, cumulé au grade LSPD (Instructor, Supervisor, Director).
    academyRankId: v.optional(v.id("academyRanks")),
    // Mot de passe temporaire remis par l'État-Major : impose un changement
    // au prochain accès tant qu'il n'a pas été renouvelé par l'agent.
    mustChangePassword: v.optional(v.boolean()),
    // Verrouillage du compte : aucune session ne peut être ouverte tant que
    // l'échéance n'est pas passée. Posé à la main par l'État-Major.
    lockedUntil: v.optional(v.number()),
    lockedReason: v.optional(v.string()),
    // Mise à pied disciplinaire : le compte passe SUSPENDED jusqu'à suspendedUntil
    // (levée auto quand la date passe). suspendedUntil null = suspension jusqu'à
    // nouvel ordre. Affiché en rouge dans l'effectif, connexion bloquée.
    suspendedUntil: v.optional(v.number()),
    suspendedReason: v.optional(v.string()),
    suspendedBy: v.optional(v.id("agents")),
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
    .index("by_status", ["status"])
    .index("by_discord", ["discordId"]),

  agentDivisions: defineTable({
    agentId: v.id("agents"),
    divisionId: v.id("divisions"),
    // Grade interne de l'agent dans cette division (espace division).
    rankId: v.optional(v.id("divisionRanks")),
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
    // Grade d'académie (ex. Cadet) : n'ouvre que le portail LSPA, pas le MDT.
    academyOnly: v.optional(v.boolean()),
    // Rôle Discord correspondant : sert aux montées en grade automatiques (bot).
    discordRoleId: v.optional(v.string()),
  }).index("by_position", ["position"]),

  divisions: defineTable({
    name: v.string(),
    tier: v.union(v.literal("PRINCIPALE"), v.literal("SECONDAIRE")),
    color: v.optional(v.string()),
    // Espace division : présentation + Lead (accès « owner » de la division).
    description: v.optional(v.string()),
    leadAgentId: v.optional(v.id("agents")),
    logoUrl: v.optional(v.string()), // logo affiché en sidebar + en-tête
    // Modules spécifiques activés (catalogue DIVISION_MODULES). Ex. "detective".
    modules: v.optional(v.array(v.string())),
  }),

  // Grades internes à une division (échelle propre, gérée par le Lead).
  divisionRanks: defineTable({
    divisionId: v.id("divisions"),
    name: v.string(),
    position: v.number(),
    color: v.optional(v.string()),
  }).index("by_division", ["divisionId"]),

  // Permissions internes portées par un grade de division (catalogue dédié,
  // distinct des permissions globales ; le Lead les a toutes).
  divisionRankPermissions: defineTable({
    rankId: v.id("divisionRanks"),
    perm: v.string(),
  }).index("by_rank", ["rankId"]),

  // Annonces de la division (fil épinglable, texte riche + images).
  divisionAnnouncements: defineTable({
    divisionId: v.id("divisions"),
    authorId: v.optional(v.id("agents")),
    authorName: v.string(),
    title: v.string(),
    body: v.string(),
    imageUrls: v.optional(v.array(v.string())),
    pinned: v.optional(v.boolean()),
    at: v.number(),
  }).index("by_division", ["divisionId"]),

  // Chat interne de la division (texte riche + images).
  divisionMessages: defineTable({
    divisionId: v.id("divisions"),
    authorId: v.optional(v.id("agents")),
    authorName: v.string(),
    body: v.string(),
    imageUrls: v.optional(v.array(v.string())),
    at: v.number(),
  }).index("by_division", ["divisionId"]),

  // ============ DETECTIVE BUREAU (module "detective") ============
  // Voir SPEC-DETECTIVE-BUREAU.md. Espace d'enquête connecté (GND + HRD).

  // Enquêtes.
  dbCases: defineTable({
    divisionId: v.id("divisions"),
    number: v.number(), // n° d'affaire auto-incrémenté par division
    title: v.string(),
    subDivision: v.optional(v.union(v.literal("GND"), v.literal("HRD"))),
    status: v.union(
      v.literal("OPEN"), v.literal("IN_PROGRESS"), v.literal("SUSPENDED"),
      v.literal("COLD"), v.literal("SOLVED"), v.literal("CLOSED"),
    ),
    priority: v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH"), v.literal("CRITICAL")),
    leadAgentId: v.optional(v.id("agents")),
    synthesis: v.optional(v.string()), // HTML riche
    confidential: v.optional(v.boolean()), // accès db.sensitive
    createdBy: v.optional(v.id("agents")),
    authorName: v.string(),
    at: v.number(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
  })
    .index("by_division", ["divisionId"])
    .index("by_deleted", ["deletedAt"]),

  dbCaseTeam: defineTable({
    caseId: v.id("dbCases"),
    agentId: v.id("agents"),
  })
    .index("by_case", ["caseId"])
    .index("by_agent", ["agentId"]),

  dbTimeline: defineTable({
    caseId: v.id("dbCases"),
    at: v.number(),
    type: v.union(v.literal("event"), v.literal("auto")),
    label: v.string(),
    body: v.optional(v.string()), // HTML riche
    authorId: v.optional(v.id("agents")),
    authorName: v.string(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
  })
    .index("by_case", ["caseId"])
    .index("by_deleted", ["deletedAt"]),

  dbTodos: defineTable({
    caseId: v.id("dbCases"),
    text: v.string(),
    done: v.boolean(),
    doneAt: v.optional(v.number()),
    assigneeId: v.optional(v.id("agents")),
    order: v.number(),
    createdBy: v.optional(v.id("agents")),
    at: v.number(),
  }).index("by_case", ["caseId"]),

  dbFolders: defineTable({
    caseId: v.id("dbCases"),
    name: v.string(),
    order: v.number(),
    createdBy: v.optional(v.id("agents")),
    at: v.number(),
  }).index("by_case", ["caseId"]),

  // Pièces d'une enquête : rapports, interrogatoires, auditions, photos, lieux, notes.
  dbItems: defineTable({
    caseId: v.id("dbCases"),
    folderId: v.optional(v.id("dbFolders")),
    type: v.union(
      v.literal("REPORT"), v.literal("INTERROGATION"), v.literal("AUDITION"),
      v.literal("PHOTO"), v.literal("LOCATION"), v.literal("NOTE"),
    ),
    title: v.optional(v.string()),
    body: v.optional(v.string()), // HTML riche
    subjectPersonId: v.optional(v.id("dbPersons")), // interro/audition
    mediaUrls: v.optional(v.array(v.string())),
    locX: v.optional(v.number()), // LOCATION : coords carte 0–100
    locY: v.optional(v.number()),
    locNote: v.optional(v.string()),
    createdBy: v.optional(v.id("agents")),
    authorName: v.string(),
    at: v.number(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
  })
    .index("by_case", ["caseId"])
    .index("by_folder", ["folderId"])
    .index("by_deleted", ["deletedAt"]),

  // Casier de preuves (rattaché à l'enquête).
  dbEvidence: defineTable({
    caseId: v.id("dbCases"),
    label: v.string(),
    evidenceType: v.optional(v.union(
      v.literal("PHYSIQUE"), v.literal("NUMERIQUE"), v.literal("TEMOIGNAGE"), v.literal("AUTRE"),
    )),
    description: v.optional(v.string()), // HTML riche
    sealNumber: v.optional(v.string()),
    storageLoc: v.optional(v.string()),
    mediaUrls: v.optional(v.array(v.string())),
    createdBy: v.optional(v.id("agents")),
    authorName: v.string(),
    at: v.number(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
  })
    .index("by_case", ["caseId"])
    .index("by_deleted", ["deletedAt"]),

  // Registre des personnes du bureau (suspects, témoins, victimes, membres de gang).
  dbPersons: defineTable({
    divisionId: v.id("divisions"),
    name: v.string(),
    alias: v.optional(v.string()),
    citizenId: v.optional(v.id("citizens")), // lien encodage (ou saisie manuelle)
    role: v.optional(v.union(
      v.literal("SUSPECT"), v.literal("WITNESS"), v.literal("VICTIM"),
      v.literal("GANG_MEMBER"), v.literal("POI"),
    )),
    notes: v.optional(v.string()), // HTML riche
    photoUrl: v.optional(v.string()),
    mediaUrls: v.optional(v.array(v.string())),
    gangId: v.optional(v.id("dbGangs")),
    gangRankId: v.optional(v.id("dbGangRanks")),
    gangRoleLabel: v.optional(v.string()),
    wantedLevel: v.optional(v.string()),
    // Fiche victime enrichie (HRD).
    deceased: v.optional(v.boolean()),
    victimCause: v.optional(v.string()),
    victimAutopsy: v.optional(v.string()), // HTML riche
    victimNextOfKin: v.optional(v.string()),
    createdBy: v.optional(v.id("agents")),
    authorName: v.string(),
    at: v.number(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
  })
    .index("by_division", ["divisionId"])
    .index("by_citizen", ["citizenId"])
    .index("by_gang", ["gangId"])
    .index("by_deleted", ["deletedAt"]),

  dbCasePersons: defineTable({
    caseId: v.id("dbCases"),
    personId: v.id("dbPersons"),
    caseRole: v.union(
      v.literal("SUSPECT"), v.literal("VICTIM"), v.literal("WITNESS"), v.literal("POI"),
    ),
    note: v.optional(v.string()),
  })
    .index("by_case", ["caseId"])
    .index("by_person", ["personId"]),

  dbCaseVehicles: defineTable({
    caseId: v.id("dbCases"),
    vehicleId: v.optional(v.id("vehicles")),
    plaque: v.optional(v.string()),
    label: v.optional(v.string()),
    note: v.optional(v.string()),
  }).index("by_case", ["caseId"]),

  dbCaseGangs: defineTable({
    caseId: v.id("dbCases"),
    gangId: v.id("dbGangs"),
    note: v.optional(v.string()),
  })
    .index("by_case", ["caseId"])
    .index("by_gang", ["gangId"]),

  // Gangs / organisations (GND).
  dbGangs: defineTable({
    divisionId: v.id("divisions"),
    name: v.string(),
    orgType: v.union(
      v.literal("GANG"), v.literal("MC"), v.literal("ORGANISATION"),
      v.literal("PF"), v.literal("AUTRE"),
    ),
    subDivision: v.optional(v.union(v.literal("GND"), v.literal("HRD"))),
    color: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    description: v.optional(v.string()), // HTML riche
    territoryText: v.optional(v.string()),
    hqX: v.optional(v.number()), // QG sur carte 0–100
    hqY: v.optional(v.number()),
    createdBy: v.optional(v.id("agents")),
    authorName: v.string(),
    at: v.number(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
  })
    .index("by_division", ["divisionId"])
    .index("by_deleted", ["deletedAt"]),

  dbGangRanks: defineTable({
    gangId: v.id("dbGangs"),
    name: v.string(),
    position: v.number(),
  }).index("by_gang", ["gangId"]),

  dbGangRelations: defineTable({
    gangId: v.id("dbGangs"),
    otherGangId: v.id("dbGangs"),
    kind: v.union(v.literal("RIVAL"), v.literal("ALLY")),
  }).index("by_gang", ["gangId"]),

  dbGangTerritories: defineTable({
    gangId: v.id("dbGangs"),
    name: v.optional(v.string()),
    points: v.array(v.object({ x: v.number(), y: v.number() })), // polygone 0–100
    color: v.optional(v.string()),
  }).index("by_gang", ["gangId"]),

  // Stupéfiants (GND) : points de vente, labos.
  dbDrugSites: defineTable({
    divisionId: v.id("divisions"),
    name: v.string(),
    kind: v.union(v.literal("POINT_VENTE"), v.literal("LABO"), v.literal("CARAVANE")),
    gangId: v.optional(v.id("dbGangs")),
    drugTypes: v.optional(v.string()),
    note: v.optional(v.string()), // HTML riche
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    mediaUrls: v.optional(v.array(v.string())),
    createdBy: v.optional(v.id("agents")),
    authorName: v.string(),
    at: v.number(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
  })
    .index("by_division", ["divisionId"])
    .index("by_gang", ["gangId"])
    .index("by_deleted", ["deletedAt"]),

  // Journal de surveillance (bureau).
  dbSurveillance: defineTable({
    divisionId: v.id("divisions"),
    caseId: v.optional(v.id("dbCases")),
    title: v.optional(v.string()),
    members: v.array(v.id("agents")),
    locationText: v.optional(v.string()),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    date: v.number(), // date/heure de la surveillance
    durationMin: v.optional(v.number()),
    observations: v.optional(v.string()), // HTML riche
    mediaUrls: v.optional(v.array(v.string())),
    createdBy: v.optional(v.id("agents")),
    authorName: v.string(),
    at: v.number(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
  })
    .index("by_division", ["divisionId"])
    .index("by_case", ["caseId"])
    .index("by_deleted", ["deletedAt"]),

  // Tableau d'enquête (murder board) : nœuds + liens.
  dbBoardNodes: defineTable({
    caseId: v.id("dbCases"),
    x: v.number(),
    y: v.number(),
    refType: v.union(
      v.literal("PERSON"), v.literal("VEHICLE"), v.literal("ITEM"), v.literal("EVIDENCE"),
      v.literal("GANG"), v.literal("EVENT"), v.literal("DRUGSITE"), v.literal("TEXT"),
    ),
    refId: v.optional(v.string()), // id de l'entité référencée
    label: v.optional(v.string()),
    note: v.optional(v.string()),
    color: v.optional(v.string()),
  }).index("by_case", ["caseId"]),

  dbBoardEdges: defineTable({
    caseId: v.id("dbCases"),
    fromNodeId: v.id("dbBoardNodes"),
    toNodeId: v.id("dbBoardNodes"),
    label: v.optional(v.string()),
    color: v.optional(v.string()),
  }).index("by_case", ["caseId"]),

  // Notifications intra-bureau.
  dbNotifications: defineTable({
    divisionId: v.id("divisions"),
    agentId: v.id("agents"),
    type: v.string(),
    text: v.string(),
    caseId: v.optional(v.id("dbCases")),
    read: v.optional(v.boolean()),
    at: v.number(),
  }).index("by_agent", ["agentId"]),

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
    // Optionnel : les invitations de cadet créées par le bot (bouton du ticket)
    // n'ont pas d'agent créateur.
    createdBy: v.optional(v.id("agents")),
    revoked: v.boolean(),
    // Rattachement à une promo : à l'inscription, le compte devient cadet de
    // cette promo, actif d'emblée (voir agents.completeRegistration).
    promotionId: v.optional(v.id("promotions")),
    // Invitation ciblée « Envoyer un compte » : le compte créé avec ce code sera
    // relié à ce membre Discord. `dmPending` : le bot doit encore envoyer le MP.
    discordId: v.optional(v.string()),
    discordUsername: v.optional(v.string()),
    dmPending: v.optional(v.boolean()),
    dmSentAt: v.optional(v.number()),
    // Pré-remplissage de la page « Rejoindre » : détecté depuis le pseudo serveur
    // Discord (ex. "56420 | D. Carter" -> matricule 56420, nom Carter, initiale D).
    prefillNom: v.optional(v.string()),
    prefillMatricule: v.optional(v.number()),
    prefillPrenomInitial: v.optional(v.string()),
    // Prénom complet pré-rempli (cadets : connu via le ticket de candidature).
    prefillPrenom: v.optional(v.string()),
    // Grade détecté depuis le rôle Discord du membre (grades.discordRoleId) :
    // affecté automatiquement au compte créé.
    prefillGradeId: v.optional(v.id("grades")),
    // Invitation ciblée d'un membre vérifié (rôle LSPD) : le compte est actif
    // d'emblée, sans passer par la validation de l'État-Major.
    autoActivate: v.optional(v.boolean()),
  }).index("by_code", ["code"]).index("by_dm_pending", ["dmPending"]),

  // Membres du rôle LSPD synchronisés depuis Discord par le bot (pour l'écran
  // de liaison des comptes dans Effectif).
  discordMembers: defineTable({
    discordId: v.string(),
    username: v.string(),
    displayName: v.string(),
    // Rôles Discord du membre : sert à détecter automatiquement son grade (via
    // grades.discordRoleId) à l'envoi d'un compte.
    roleIds: v.optional(v.array(v.string())),
    syncedAt: v.number(),
  }).index("by_discord", ["discordId"]),

  // Contrôle d'accès des commandes Discord : par grade minimum (compte lié) et/ou
  // liste d'IDs de rôle Discord autorisés. Vide = commande ouverte à tous.
  discordCommandAccess: defineTable({
    command: v.string(),
    minGradeId: v.optional(v.id("grades")),
    roleIds: v.array(v.string()),
  }).index("by_command", ["command"]),

  // File de tâches de rôle Discord exécutées par le bot (montées en grade) :
  // retire des rôles, ajoute un rôle, sur un membre.
  discordRoleJobs: defineTable({
    discordId: v.string(),
    addRoleId: v.optional(v.string()),
    removeRoleIds: v.array(v.string()),
    reason: v.optional(v.string()),
    status: v.union(v.literal("PENDING"), v.literal("DONE"), v.literal("ERROR")),
    attempts: v.optional(v.number()), // nombre d'échecs (retry jusqu'à un plafond avant ERROR définitif)
    error: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_status", ["status"]),

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

  // ============ LSPA (Los Santos Police Academy) ============
  // Grades de l'académie. Ils se CUMULENT au grade LSPD (un Sergent peut être
  // Academy Instructor) et portent leurs propres permissions, car deux agents
  // de même grade LSPD n'ont pas les mêmes droits à l'académie.
  academyRanks: defineTable({
    name: v.string(),
    abbrev: v.optional(v.string()),
    color: v.optional(v.string()),
    position: v.number(),
    active: v.boolean(),
  }).index("by_position", ["position"]),

  // Promotions : cohortes de cadets, avec un début et une fin. Un code
  // d'invitation peut y être rattaché (voir invitations.promotionId).
  promotions: defineTable({
    name: v.string(),
    startAt: v.number(),
    endAt: v.optional(v.number()),
    status: v.union(v.literal("OPEN"), v.literal("CLOSED")),
    createdBy: v.optional(v.id("agents")), // absent = créée automatiquement par le bot
    // Rattachement Discord : catégorie de la promo + date de la Police Academy
    // (clé de rapprochement avec l'annonce du bot).
    discordCategoryId: v.optional(v.string()),
    paDate: v.optional(v.number()), // jour de la PA (minuit)
    paTime: v.optional(v.string()),
    paPlace: v.optional(v.string()),
    // Suppression demandée sur le site : le bot nettoie la catégorie Discord
    // (déplace les tickets vers la catégorie classique) puis supprime la promo.
    deleting: v.optional(v.boolean()),
  }).index("by_status", ["status"]),

  // Appartenance d'un cadet à une promo. ACTIVE = en formation ; REJECTED =
  // écarté (le compte reste, mais perd l'accès LSPA tant qu'il n'a aucune
  // appartenance active) ; GRADUATED = diplômé (passé agent).
  promotionMembers: defineTable({
    promotionId: v.id("promotions"),
    agentId: v.id("agents"),
    status: v.union(v.literal("ACTIVE"), v.literal("REJECTED"), v.literal("GRADUATED")),
    group: v.optional(v.string()), // Groupe A / B pendant la Police Academy
    joinedAt: v.number(),
    decidedAt: v.optional(v.number()),
    decidedBy: v.optional(v.id("agents")),
  })
    .index("by_promotion", ["promotionId"])
    .index("by_agent", ["agentId"])
    .index("by_promotion_agent", ["promotionId", "agentId"]),

  // Fiche de notation des cadets : modèle configurable (une ligne par critère).
  // Tout est réglable par les instructeurs : sections, barèmes, paliers de temps,
  // catégories de quiz notées.
  gradingItems: defineTable({
    section: v.string(), // regroupement d'affichage (Tir, Conduite, Comportement…)
    label: v.string(),
    // MANUAL : l'instructeur saisit les points · TIME : il saisit un temps, les
    // points se calculent · QUIZ_CATEGORY : points auto d'après les quiz.
    kind: v.union(v.literal("MANUAL"), v.literal("TIME"), v.literal("QUIZ_CATEGORY")),
    maxPoints: v.number(),
    position: v.number(),
    active: v.boolean(),
    allowEliminate: v.optional(v.boolean()), // MANUAL : propose l'élimination (ex. otage touché)
    // TIME : paliers ordonnés. maxSeconds absent = dernier palier (au-delà).
    timeBrackets: v.optional(v.array(v.object({
      maxSeconds: v.optional(v.number()),
      points: v.number(),
      eliminate: v.optional(v.boolean()),
    }))),
    categoryId: v.optional(v.id("quizCategories")), // QUIZ_CATEGORY
  }).index("by_position", ["position"]),

  // Valeurs saisies pour un cadet, un critère. Remplissage concurrent : chaque
  // critère est un document indépendant.
  gradingEntries: defineTable({
    agentId: v.id("agents"),
    itemId: v.id("gradingItems"),
    points: v.optional(v.number()), // MANUAL
    seconds: v.optional(v.number()), // TIME
    eliminated: v.optional(v.boolean()),
    updatedBy: v.id("agents"),
    updatedAt: v.number(),
  })
    .index("by_agent", ["agentId"])
    .index("by_agent_item", ["agentId", "itemId"]),

  // Notes libres des instructeurs sur un cadet : chacun ajoute les siennes, elles
  // s'affichent en direct pour tous, signées de leur auteur.
  cadetNotes: defineTable({
    agentId: v.id("agents"),
    authorId: v.id("agents"),
    authorName: v.string(),
    text: v.string(),
    at: v.number(),
  }).index("by_agent", ["agentId"]),

  // Conclusion du recrutement : un texte partagé par cadet, rempli par tous.
  cadetConclusions: defineTable({
    agentId: v.id("agents"),
    text: v.string(),
    updatedBy: v.id("agents"),
    updatedByName: v.string(),
    updatedAt: v.number(),
  }).index("by_agent", ["agentId"]),

  // Points bonus (ou malus si négatif) ajoutés au score total d'un cadet, en
  // plus des critères. Un document par cadet.
  cadetBonus: defineTable({
    agentId: v.id("agents"),
    points: v.number(),
    reason: v.optional(v.string()),
    updatedBy: v.id("agents"),
    updatedByName: v.string(),
    updatedAt: v.number(),
  }).index("by_agent", ["agentId"]),

  // ---- FTO : formation terrain des Officiers 1 ----
  // Modèle de fiche FTO, configurable. SCALE = critère noté sur une échelle
  // (Très Bien … Exécrable) · CHECK_TP = case Théorie + case Pratique ·
  // CHECK = validation unique.
  ftoItems: defineTable({
    section: v.string(),
    label: v.string(),
    kind: v.union(v.literal("SCALE"), v.literal("CHECK_TP"), v.literal("CHECK")),
    position: v.number(),
    active: v.boolean(),
  }).index("by_position", ["position"]),

  // En-tête d'une fiche FTO : le tuteur (officier référent) et le début de forma.
  ftoSheets: defineTable({
    agentId: v.id("agents"),
    tutorId: v.optional(v.id("agents")),
    startAt: v.optional(v.number()),
  }).index("by_agent", ["agentId"]),

  // Valeurs saisies pour un Officier 1, un critère. Remplissage concurrent.
  ftoEntries: defineTable({
    agentId: v.id("agents"),
    itemId: v.id("ftoItems"),
    level: v.optional(v.number()), // SCALE : 0 (Exécrable) … 4 (Très Bien)
    theorie: v.optional(v.boolean()),
    pratique: v.optional(v.boolean()),
    checked: v.optional(v.boolean()),
    updatedBy: v.id("agents"),
    updatedAt: v.number(),
  })
    .index("by_agent", ["agentId"])
    .index("by_agent_item", ["agentId", "itemId"]),

  // Rapports de patrouille d'un Officier 1 dans le cadre du FTO.
  ftoPatrols: defineTable({
    agentId: v.id("agents"),
    startAt: v.number(),
    endAt: v.optional(v.number()),
    lacunes: v.optional(v.string()),
    progres: v.optional(v.string()),
    general: v.optional(v.string()),
    authorId: v.id("agents"),
    authorName: v.string(),
    at: v.number(),
  }).index("by_agent", ["agentId"]),

  // Configuration de la Formation Terrain (singleton). `traineeGradeId` = grade
  // « en formation » (Officier 1 Probatoire) dont les agents apparaissent dans la
  // liste ; à défaut, le plus bas grade opérationnel. Un agent promu au-dessus de
  // ce grade bascule automatiquement dans l'historique.
  ftoConfig: defineTable({
    traineeGradeId: v.optional(v.id("grades")),
    updatedBy: v.optional(v.id("agents")),
    updatedAt: v.number(),
  }),

  // ---------- First Lincoln : évaluation de la première patrouille encadrée ----------
  // Grille configurable de critères d'évaluation d'un « First Lincoln ».
  flCriteria: defineTable({
    section: v.string(),
    label: v.string(),
    kind: v.union(v.literal("SCALE"), v.literal("CHECK")),
    position: v.number(),
    active: v.boolean(),
  }).index("by_position", ["position"]),

  // Une évaluation First Lincoln d'un rookie, conduite par un évaluateur.
  flEvaluations: defineTable({
    agentId: v.id("agents"), // le rookie évalué
    evaluatorId: v.id("agents"),
    evaluatorName: v.string(),
    at: v.number(), // date/heure de la patrouille évaluée
    sector: v.optional(v.string()),
    vehicle: v.optional(v.string()),
    verdict: v.union(v.literal("EN_COURS"), v.literal("VALIDE"), v.literal("A_REVOIR"), v.literal("ECHEC")),
    pointsForts: v.optional(v.string()),
    axes: v.optional(v.string()),
    conclusion: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_agent", ["agentId"]),

  // Score d'un critère pour une évaluation First Lincoln donnée.
  flScores: defineTable({
    evaluationId: v.id("flEvaluations"),
    criterionId: v.id("flCriteria"),
    level: v.optional(v.number()), // SCALE : 0 (Exécrable) … 4 (Très Bien)
    checked: v.optional(v.boolean()),
  }).index("by_evaluation", ["evaluationId"]),

  // Seuils d'appréciation First Lincoln (singleton). Un score >= passThreshold =
  // « Passage » ; entre potentialThreshold et passThreshold = « Passage potentiel
  // selon l'instructeur » ; en dessous = « FL ratée ».
  flConfig: defineTable({
    passThreshold: v.number(),
    potentialThreshold: v.number(),
    updatedBy: v.optional(v.id("agents")),
    updatedAt: v.number(),
  }),

  academyRankPermissions: defineTable({
    rankId: v.id("academyRanks"),
    permissionId: v.id("permissions"),
  })
    .index("by_rank", ["rankId"])
    .index("by_rank_permission", ["rankId", "permissionId"]),

  // ---- Quiz de l'académie ----
  // Un quiz est un modèle réutilisable ; on le fait passer en ouvrant une
  // « session ». Le barème vit sur les questions, le quiz n'en porte que le
  // seuil de réussite et le temps global.
  // Catégories de quiz, configurables. La fiche du cadet portera une note par
  // catégorie plutôt qu'une note globale.
  quizCategories: defineTable({
    name: v.string(),
    color: v.optional(v.string()),
    position: v.number(),
    active: v.boolean(),
  }).index("by_position", ["position"]),

  quizzes: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    categoryId: v.optional(v.id("quizCategories")),
    passPercent: v.optional(v.number()), // seuil de réussite en % ; absent = pas de seuil (score seul)
    durationSeconds: v.optional(v.number()), // temps global ; absent = illimité
    shuffleQuestions: v.optional(v.boolean()),
    status: v.union(v.literal("DRAFT"), v.literal("PUBLISHED"), v.literal("ARCHIVED")),
    createdBy: v.id("agents"),
    updatedAt: v.number(),
  }).index("by_status", ["status"]),

  quizQuestions: defineTable({
    quizId: v.id("quizzes"),
    position: v.number(),
    // SINGLE : une seule bonne réponse · MULTI : plusieurs · TEXT : champ libre.
    kind: v.union(v.literal("SINGLE"), v.literal("MULTI"), v.literal("TEXT")),
    prompt: v.string(), // texte riche (HTML)
    mediaUrls: v.optional(v.array(v.string())), // illustrations de l'énoncé
    points: v.number(),
    timeLimitSeconds: v.optional(v.number()), // temps propre à la question
    // Sur une question à choix, réclame en plus une justification écrite : c'est
    // ce qui permet d'avoir « les deux » sur une même question. Elle bascule
    // alors en correction manuelle, comme une question libre.
    requireJustification: v.optional(v.boolean()),
    expectedAnswer: v.optional(v.string()), // repère de correction, jamais montré au cadet
    explanation: v.optional(v.string()), // affichée à la publication des résultats
  }).index("by_quiz", ["quizId", "position"]),

  quizChoices: defineTable({
    questionId: v.id("quizQuestions"),
    quizId: v.id("quizzes"), // dénormalisé : charge toutes les options d'un quiz d'un coup
    position: v.number(),
    label: v.string(),
    imageUrl: v.optional(v.string()),
    correct: v.boolean(),
  })
    .index("by_question", ["questionId", "position"])
    .index("by_quiz", ["quizId"]),

  // ---- Passage : sessions live ----
  // Le cadet ne voit rien tant qu'aucune session n'est ouverte. LOBBY = salle
  // d'attente, RUNNING = épreuve en cours, CLOSED = terminée mais non corrigée,
  // PUBLISHED = résultats visibles des cadets (décision de l'instructeur).
  quizSessions: defineTable({
    quizId: v.id("quizzes"),
    title: v.string(), // instantané : le quiz peut être renommé après coup
    status: v.union(
      v.literal("LOBBY"),
      v.literal("RUNNING"),
      v.literal("CLOSED"),
      v.literal("PUBLISHED"),
    ),
    openedBy: v.id("agents"),
    openedAt: v.number(),
    startedAt: v.optional(v.number()),
    endsAt: v.optional(v.number()), // startedAt + durationSeconds, si temps global
    closedAt: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_quiz", ["quizId"]),

  quizParticipants: defineTable({
    sessionId: v.id("quizSessions"),
    agentId: v.id("agents"),
    name: v.string(), // instantané pour l'affichage live
    joinedAt: v.number(),
    submittedAt: v.optional(v.number()),
    answeredCount: v.number(), // progression suivie en direct par l'instructeur
    autoScore: v.number(), // points attribués automatiquement
    manualScore: v.optional(v.number()), // points ajoutés à la correction
    needsGrading: v.boolean(), // reste au moins une réponse libre non corrigée
    gradedAt: v.optional(v.number()),
    // Verrou souple de correction : quand un instructeur ouvre une copie, il la
    // « réserve » le temps de la noter. Plusieurs correcteurs peuvent ainsi
    // travailler en parallèle sans se marcher dessus. Le verrou expire seul.
    gradingBy: v.optional(v.id("agents")),
    gradingByName: v.optional(v.string()),
    gradingAt: v.optional(v.number()),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_agent", ["sessionId", "agentId"])
    .index("by_agent", ["agentId"]),

  // Une ligne par question répondue. Écrite à chaque changement : c'est elle qui
  // assure la reprise après actualisation de la page.
  quizAnswers: defineTable({
    participantId: v.id("quizParticipants"),
    sessionId: v.id("quizSessions"),
    questionId: v.id("quizQuestions"),
    choiceIds: v.optional(v.array(v.id("quizChoices"))),
    text: v.optional(v.string()),
    answeredAt: v.number(),
    awarded: v.optional(v.number()), // points retenus (auto ou après correction)
    gradedBy: v.optional(v.id("agents")),
    gradedAt: v.optional(v.number()),
    comment: v.optional(v.string()),
  })
    .index("by_participant", ["participantId"])
    .index("by_participant_question", ["participantId", "questionId"])
    .index("by_session", ["sessionId"]),

  // ============ FLOTTE LSPD (véhicules de service + sorties) ============
  // Véhicules de la station. Le numéro de toit fixe l'indicatif de patrouille :
  // ses deux derniers chiffres deviennent le suffixe (toit 509 -> 13x09).
  fleetVehicles: defineTable({
    modele: v.string(),
    plaque: v.string(),
    // Type de véhicule : PATROUILLE | SWAT | METRO | DB (banalisé) | SUPERVISOR
    // | COMMAND_STAFF | AUTRE. Optionnel (les fiches existantes = PATROUILLE).
    type: v.optional(v.string()),
    roofNumber: v.string(), // numéro de toit complet (ex. "509") ; vide pour un banalisé (DB)
    photoUrls: v.optional(v.array(v.string())),
    searchText: v.string(), // toit + plaque + modèle, normalisés (recherche)
    active: v.boolean(),
    createdBy: v.optional(v.id("agents")),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
  })
    .index("by_deleted", ["deletedAt"])
    .searchIndex("search", { searchField: "searchText" }),

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
    vehicleNumber: v.string(), // "09" - 2 derniers chiffres du numéro de toit, ou saisie libre
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
    // Recherche de l'historique : indicatif + noms/matricules des agents présents,
    // figé TANT QUE la patrouille vit (ses membres sont supprimés à la dissolution).
    searchText: v.optional(v.string()),
  })
    .index("by_open", ["endedAt"])
    .searchIndex("search", { searchField: "searchText" }),

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
    // Parité NexusMDT : retrait de points de permis, type et instruction de la charge.
    pointsPermis: v.optional(v.number()),
    chargeType: v.optional(v.string()),
    instruction: v.optional(v.string()),
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
    aliases: v.optional(v.array(v.string())), // alias / AKA (inclus dans searchText)
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
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
    // Parité NexusMDT : référence d'import (numéro) + id Mongo Nexus (pour poster
    // des dossiers/amendes qui référencent le citoyen) + champs médicaux/divers.
    importRef: v.optional(v.string()),
    nexusId: v.optional(v.string()),
    groupeSanguin: v.optional(v.string()),
    allergies: v.optional(v.string()),
    antecedents: v.optional(v.string()),
    traitements: v.optional(v.string()),
    ppaChasse: v.optional(v.boolean()),
    contactUrgence: v.optional(
      v.object({ nom: v.optional(v.string()), prenom: v.optional(v.string()), telephone: v.optional(v.string()) }),
    ),
  })
    .index("by_empreinte", ["empreinte"])
    .index("by_nom", ["nom"])
    .index("by_telephone", ["telephone"])
    .index("by_deleted", ["deletedAt"])
    .index("by_import", ["importRef"])
    .index("by_nexus", ["nexusId"]) // id Mongo Nexus : clé STABLE (les numero se réutilisent)
    .searchIndex("search", { searchField: "searchText" }),

  // Liens de parenté entre citoyens enregistrés (arbre généalogique).
  // PARENT : fromId est le parent de toId (dirigé). SPOUSE / SIBLING : symétriques.
  citizenRelations: defineTable({
    fromId: v.id("citizens"),
    toId: v.id("citizens"),
    kind: v.union(v.literal("PARENT"), v.literal("SPOUSE"), v.literal("SIBLING")),
    byAgentId: v.optional(v.id("agents")),
    at: v.number(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
  })
    .index("by_from", ["fromId"])
    .index("by_to", ["toId"])
    .index("by_deleted", ["deletedAt"]),

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
    nexusStatut: v.optional(v.string()), // statut Nexus (Normal / Volé / Recherché…)
    photoStorageIds: v.array(v.id("_storage")),
    photoUrls: v.optional(v.array(v.string())),
    searchText: v.string(),
    createdBy: v.optional(v.id("agents")),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
    nexusId: v.optional(v.string()), // _id Mongo Nexus (edit/delete par id)
    importRef: v.optional(v.string()),
  })
    .index("by_plaque", ["plaque"])
    .index("by_owner", ["ownerId"])
    .index("by_deleted", ["deletedAt"])
    .index("by_import", ["importRef"])
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
    // Officiers du rapport avec état de rattachement (import Nexus surtout) :
    // `agentId` présent = relié à un compte existant ; absent = nom simplement
    // écrit dans le rapport (pas de compte). Le créateur est en 1re position.
    officers: v.optional(
      v.array(
        v.object({
          name: v.string(),
          matricule: v.optional(v.string()),
          agentId: v.optional(v.id("agents")),
        }),
      ),
    ),
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
    // Import depuis le MDT Nexus : référence source (idempotence) + JSON brut du
    // dossier d'origine (robustesse : re-mappable sans re-fetch si le format change).
    importRef: v.optional(v.string()),
    importRaw: v.optional(v.string()),
    // Id Mongo Nexus (pour éditer/supprimer côté Nexus par _id).
    nexusId: v.optional(v.string()),
    // Parité NexusMDT : jugement (verdict/peine) + barème d'amende du dossier.
    jugement: v.optional(
      v.object({
        statut: v.optional(v.string()),
        statutFinal: v.optional(v.string()),
        peine: v.optional(v.string()),
        motivation: v.optional(v.string()),
        jugeNom: v.optional(v.string()),
        avocat: v.optional(v.string()),
      }),
    ),
    baremeAmende: v.optional(v.string()),
    // Suivi Discord (salon de suivi) : id du message posté (édité en place),
    // salon où il a été posté, et drapeau « à (re)publier / mettre à jour ».
    trackingMessageId: v.optional(v.string()),
    trackingChannelId: v.optional(v.string()),
    trackingDirty: v.optional(v.boolean()),
  })
    .index("by_citizen", ["citizenId"])
    .index("by_deleted", ["deletedAt"])
    .index("by_import", ["importRef"])
    // Tri par date d'arrestation (les imports arrivent tous en même temps, donc
    // _creationTime ne reflète plus la chronologie réelle).
    .index("by_at", ["at"])
    // Casiers créés par un agent (compteurs perso sans scanner toute la table).
    .index("by_creator", ["createdBy"])
    // Casiers VIVANTS triés par date : q.eq("deletedAt", undefined).order("desc").
    // Évite de lire les casiers archivés dans les listes chaudes (accueil, historique).
    .index("by_live_at", ["deletedAt", "at"])
    // Suivi Discord : le bot ne draine QUE les entrées à mettre à jour (jamais un
    // scan de toute la table). q.eq("trackingDirty", true).
    .index("by_tracking_dirty", ["trackingDirty"]),

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
    // Tentative / complicité (label SuperMDT ; n'affecte pas le calcul ni Nexus).
    attemptType: v.optional(v.union(v.literal("TENTATIVE"), v.literal("COMPLICITE"))),
    computedFine: v.number(),
    computedJailSeconds: v.number(),
    onDecision: v.boolean(),
  }).index("by_entry", ["entryId"]),

  // Table de jointure « agents impliqués » d'une arrestation (dossier / rapport).
  // Une ligne par (entrée, officier) : permet de CRÉDITER les stats d'un agent
  // impliqué via un INDEX par agent (by_officer), sans jamais scanner la table
  // casierEntries en filtrant sur le tableau officerIds (impossible à indexer).
  // `at` = date de l'arrestation (copiée de l'entrée) pour borner la plage sans
  // db.get. Le créateur a aussi sa ligne (il est toujours un agent impliqué).
  casierOfficers: defineTable({
    entryId: v.id("casierEntries"),
    officerId: v.id("agents"),
    at: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_officer", ["officerId", "at"])
    .index("by_entry", ["entryId"]),

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
    // Famille de rapport : OPERATION (rapports d'opérations, défaut) ou PERSONNEL
    // (rapports individuels : usage de la force, tirs…). Absent = OPERATION.
    category: v.optional(v.union(v.literal("OPERATION"), v.literal("PERSONNEL"))),
  }),

  reports: defineTable({
    typeId: v.id("reportTypes"),
    // Famille dénormalisée à la création (contrôle d'accès + filtrage rapide).
    // Absent = OPERATION (rapports existants).
    category: v.optional(v.union(v.literal("OPERATION"), v.literal("PERSONNEL"))),
    title: v.string(),
    leadId: v.id("agents"), // lead opé
    scribeId: v.optional(v.id("agents")),
    negotiatorId: v.optional(v.id("agents")),
    status: v.union(v.literal("BROUILLON"), v.literal("SOUMIS"), v.literal("VALIDE")),
    // Rapports personnels : date/heure des faits + lien bodycam optionnel.
    factsAt: v.optional(v.number()),
    bodycamUrl: v.optional(v.string()),
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
    .index("by_creator", ["createdBy"])
    .index("by_deleted", ["deletedAt"])
    .searchIndex("search", { searchField: "title" }),

  // Otages d'un rapport d'opération. Si lié à un citoyen encodé, une déposition
  // est créée sur le NexusMDT (fiche de l'otage) via le write-through.
  reportHostages: defineTable({
    reportId: v.id("reports"),
    citizenId: v.optional(v.id("citizens")), // encodage lié (crée une déposition)
    name: v.string(),
    phone: v.optional(v.string()),
    dob: v.optional(v.string()),
    deposition: v.optional(v.string()), // déposition de l'otage
    frisk: v.optional(v.string()), // objets trouvés lors de la palpation
    photoUrl: v.optional(v.string()), // photo de l'otage
    friskPhotoUrl: v.optional(v.string()), // photo de la palpation
    depositionNexusId: v.optional(v.string()), // id de la déposition créée côté Nexus
    at: v.number(),
    createdBy: v.optional(v.id("agents")),
    deletedAt: v.optional(v.number()),
  }).index("by_report", ["reportId"]),

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
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
  })
    .index("by_citizen", ["citizenId"])
    .index("by_deleted", ["deletedAt"]),

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
    announced: v.optional(v.boolean()), // publiée dans le salon Discord des absences
  })
    .index("by_agent", ["agentId"])
    .index("by_status", ["status"]),

  // ============ DISCIPLINE ============
  // Types de sanction disciplinaire prédéfinis, configurables (§12).
  disciplineSanctionTypes: defineTable({
    name: v.string(),
    position: v.number(),
    active: v.boolean(),
    // Ce type de sanction entraîne une mise à pied (suspension du compte).
    suspends: v.optional(v.boolean()),
  }).index("by_position", ["position"]),

  disciplines: defineTable({
    agentId: v.id("agents"),
    motif: v.string(),
    sanction: v.string(),
    status: v.union(v.literal("OUVERTE"), v.literal("CLOSE")),
    imageUrls: v.optional(v.array(v.string())),
    byAgentId: v.optional(v.id("agents")),
    at: v.number(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
    // Numéro de référence unique (affiché dans l'embed Discord, ex. SANC-0042).
    reference: v.optional(v.number()),
    // Gravité : AVERTISSEMENT | BLAME | MISE_A_PIED | RADIATION | CUSTOM.
    level: v.optional(v.string()),
    // Mise à pied : échéance de fin (null = jusqu'à nouvel ordre) posée sur l'agent.
    suspendedUntil: v.optional(v.number()),
    suspends: v.optional(v.boolean()),
    // File d'annonce Discord (embed + ping) : le bot dépile via sanctionsToAnnounce.
    discordAnnounced: v.optional(v.boolean()),
  })
    .index("by_agent", ["agentId"])
    .index("by_deleted", ["deletedAt"])
    .index("by_announce", ["discordAnnounced"]),

  // Convocations d'un agent devant la hiérarchie / IA (ping Discord + motif).
  convocations: defineTable({
    agentId: v.optional(v.id("agents")), // agent recensé (ping via son discordId)
    discordId: v.optional(v.string()), // OU un ID Discord saisi à la main
    agentLabel: v.optional(v.string()), // libellé lisible (nom / ID)
    motif: v.string(),
    convokedAt: v.optional(v.number()), // date/heure de la convocation
    lieu: v.optional(v.string()),
    byAgentId: v.optional(v.id("agents")),
    at: v.number(),
    reference: v.optional(v.number()),
    discordAnnounced: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
  })
    .index("by_agent", ["agentId"])
    .index("by_deleted", ["deletedAt"])
    .index("by_announce", ["discordAnnounced"]),

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
    // Salons Discord où le bot poste (id de salon). Vide = fonction désactivée.
    botPresenceChannel: v.optional(v.string()),
    botDailyChannel: v.optional(v.string()),
    botRollcallChannel: v.optional(v.string()),
    botAbsenceChannel: v.optional(v.string()), // salon où publier les absences (embed)
    botDailyAt: v.optional(v.string()), // "HH:MM" (fuseau du serveur bot)
    botRollcallStartAt: v.optional(v.string()), // ouverture de l'appel
    botRollcallEndAt: v.optional(v.string()), // clôture : plus de vote possible (heure affichée dans le message)
    botCeremonyAt: v.optional(v.string()), // heure de la cérémonie du dimanche (affichée dans le message)
    botRollcallPingRole: v.optional(v.string()), // rôle Discord ping à l'ouverture du roll call
    botRollcallPingEnabled: v.optional(v.boolean()), // active le ping du rôle (désactivé par défaut)
    botPresenceMessageId: v.optional(v.string()), // message de présence édité en boucle
    // Discipline : salon où poster les sanctions ET convocations (embed) + rôle
    // à ping pour les sanctions (les convocations pinguent l'agent concerné).
    botSanctionsChannel: v.optional(v.string()),
    botSanctionsPingRole: v.optional(v.string()),
    // Cérémonies : salon où poster l'annonce ET le résultat de cérémonie.
    botCeremonyChannel: v.optional(v.string()),
    // Suivi des dossiers/contraventions : salon unique où chaque dossier
    // d'arrestation et contravention est posté en embed, édité en place à chaque
    // changement (chefs, clôture, statut d'amende). Vide = fonction désactivée.
    botTrackingChannel: v.optional(v.string()),
    // Date (YYYY-MM-DD, Paris) du dernier récap quotidien envoyé : persiste
    // l'anti-doublon au-delà d'un redéploiement du bot.
    botLastDailyRecap: v.optional(v.string()),
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

  // Appel de présence quotidien piloté par le bot Discord. Le bot est le seul
  // à écrire ici, via des mutations protégées par le secret partagé.
  rollcalls: defineTable({
    date: v.string(), // "YYYY-MM-DD" : un appel par jour
    channelId: v.string(),
    messageId: v.string(),
    startedAt: v.number(),
    endsAt: v.number(),
    closed: v.boolean(),
    ceremony: v.optional(v.boolean()), // le dimanche : appel à la cérémonie
    ceremonyTime: v.optional(v.string()), // heure affichée dans le message de cérémonie
    startTime: v.optional(v.string()), // (déprécié) ancienne heure d'ouverture affichée
    displayTime: v.optional(v.string()), // heure de présence affichée (= clôture des votes)
    remindersSent: v.optional(v.array(v.string())), // créneaux de relance déjà envoyés ("HH:MM")
    reminderMsgIds: v.optional(v.array(v.string())), // messages de relance (à supprimer avec le roll call)
  }).index("by_date", ["date"]),

  rollcallVotes: defineTable({
    rollcallId: v.id("rollcalls"),
    discordUserId: v.string(),
    discordName: v.string(),
    status: v.union(v.literal("PRESENT"), v.literal("ABSENT"), v.literal("RETARD")),
    at: v.number(),
  })
    .index("by_rollcall", ["rollcallId"])
    .index("by_rollcall_user", ["rollcallId", "discordUserId"]),

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
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
  })
    .index("by_active", ["active"])
    .index("by_deleted", ["deletedAt"]),

  // ============ FICHES 911 (opérateurs) ============
  // Fiche d'appel remplie par un opérateur 911 : trace l'appel, puis est
  // consultée (lecture seule) par les agents. Statut : en cours -> attribué à
  // une patrouille -> résolu. Seul le créateur peut modifier.
  calls911: defineTable({
    number: v.number(), // n° séquentiel de fiche ("fiche numéro 2")
    status: v.union(v.literal("EN_COURS"), v.literal("ATTRIBUE"), v.literal("RESOLU")),
    // Informations de l'appel
    callerName: v.optional(v.string()),
    callerPhone: v.optional(v.string()),
    location: v.optional(v.string()),
    locX: v.optional(v.number()), // point sur la carte (%, 0-100)
    locY: v.optional(v.number()),
    nature: v.optional(v.string()), // nature / motif de l'appel
    priority: v.optional(v.string()), // P1 / P2 / P3
    info: v.string(), // récit / informations recueillies
    peopleInvolved: v.optional(v.string()),
    weapons: v.optional(v.boolean()),
    weaponType: v.optional(v.string()), // type d'arme signalée (si weapons)
    vehicle: v.optional(v.string()),
    citizenId: v.optional(v.id("citizens")), // appelant relié à une fiche citoyen (optionnel)
    // Attribution
    assignedPatrol: v.optional(v.string()), // indicatif de la patrouille attribuée
    createdBy: v.id("agents"),
    at: v.number(),
    updatedAt: v.optional(v.number()),
    resolvedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
  })
    .index("by_status", ["status"])
    .index("by_number", ["number"])
    .index("by_creator", ["createdBy"])
    .index("by_deleted", ["deletedAt"]),

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
    // Officier verbalisateur : nom (+ matricule) écrit dans le rapport quand pas
    // de compte relié (ancien agent, ou compte pas encore créé côté MDT).
    officerName: v.optional(v.string()),
    officerMatricule: v.optional(v.number()),
    // Import depuis le MDT Nexus (/api/amendes) : idempotence + JSON brut.
    importRef: v.optional(v.string()),
    importRaw: v.optional(v.string()),
    // Id Mongo Nexus (pour éditer/supprimer côté Nexus par _id).
    nexusId: v.optional(v.string()),
    // Parité NexusMDT : montant majoré (impayé) + références juridiques.
    montantMajore: v.optional(v.number()),
    articleLoi: v.optional(v.string()),
    referenceJuridique: v.optional(v.string()),
    // Suivi Discord (salon de suivi) : id du message posté (édité en place),
    // salon où il a été posté, et drapeau « à (re)publier / mettre à jour ».
    trackingMessageId: v.optional(v.string()),
    trackingChannelId: v.optional(v.string()),
    trackingDirty: v.optional(v.boolean()),
  })
    .index("by_citizen", ["citizenId"])
    .index("by_vehicle", ["vehicleId"])
    .index("by_deleted", ["deletedAt"])
    .index("by_import", ["importRef"])
    .index("by_at", ["at"])
    // Contraventions d'un officier (compteurs perso sans scanner toute la table).
    .index("by_officer", ["officerId"])
    // Contraventions VIVANTES triées par date (listes chaudes sans lignes archivées).
    .index("by_live_at", ["deletedAt", "at"])
    // Suivi Discord : le bot ne draine QUE les contraventions à mettre à jour
    // (jamais un scan de toute la table). q.eq("trackingDirty", true).
    .index("by_tracking_dirty", ["trackingDirty"]),

  // Amendes : entité « argent » (miroir de l'amende NexusMDT /api/amendes).
  // AUTO-créée à la création d'un casier (dossier/rapport d'arrestation) ou d'une
  // contravention ; pré-remplie depuis la source. Les agents ne changent QUE le
  // statut. Écrite en write-through sur le Nexus. Non rétroactif.
  amendes: defineTable({
    citizenId: v.id("citizens"),
    // Source SuperMDT (une seule renseignée) + lien affiché.
    sourceType: v.optional(v.union(v.literal("CASIER"), v.literal("CONTRAVENTION"), v.literal("IMPORT"))),
    casierEntryId: v.optional(v.id("casierEntries")),
    citationId: v.optional(v.id("citations")),
    // Contenu (parité NexusMDT).
    numero: v.optional(v.string()),
    typeAmende: v.optional(v.string()),
    categorieAmende: v.optional(v.string()),
    statut: v.string(), // Notifiée / Payée / En attente / Contestée / Annulée
    objet: v.optional(v.string()),
    montant: v.number(),
    montantMajore: v.optional(v.number()),
    paiementEchelonne: v.optional(v.boolean()),
    sursisApplicable: v.optional(v.boolean()),
    dateInfraction: v.optional(v.string()),
    heureInfraction: v.optional(v.string()),
    lieuInfraction: v.optional(v.string()),
    adressePrecise: v.optional(v.string()),
    autoriteCompetente: v.optional(v.string()),
    verbalisateurNom: v.optional(v.string()),
    matriculeAgent: v.optional(v.number()),
    modeNotification: v.optional(v.string()),
    dateNotification: v.optional(v.string()),
    dateLimitePaiement: v.optional(v.string()),
    dateLimiteContestation: v.optional(v.string()),
    referenceJuridique: v.optional(v.string()),
    articleLoi: v.optional(v.string()),
    description: v.optional(v.string()),
    circonstancesAggravantes: v.optional(v.string()),
    circonstancesAttenuantes: v.optional(v.string()),
    temoins: v.optional(v.string()),
    preuves: v.optional(v.string()),
    // Métadonnées locales.
    at: v.number(),
    createdBy: v.optional(v.id("agents")),
    // Nexus write-through / import.
    nexusId: v.optional(v.string()),
    importRef: v.optional(v.string()),
    nexusError: v.optional(v.string()), // dernière erreur de push (diagnostic)
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
  })
    .index("by_citizen", ["citizenId"])
    .index("by_nexus", ["nexusId"])
    .index("by_import", ["importRef"])
    .index("by_casier", ["casierEntryId"])
    .index("by_citation", ["citationId"]),

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
    // Tentative / complicité (label SuperMDT ; n'affecte pas le calcul ni Nexus).
    attemptType: v.optional(v.union(v.literal("TENTATIVE"), v.literal("COMPLICITE"))),
    computedFine: v.number(),
    onDecision: v.boolean(),
  }).index("by_citation", ["citationId"]),

  // ============ RÉFÉRENTIELS CONFIGURABLES (phase 2) ============
  // Documents du site (règlement…) : un PDF par clé, stocké dans Convex storage.
  siteDocuments: defineTable({
    key: v.string(), // "reglement"
    storageId: v.id("_storage"),
    fileName: v.string(),
    uploadedBy: v.optional(v.id("agents")),
    uploadedAt: v.number(),
  }).index("by_key", ["key"]),

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

  // ============ PLANS DE CARTE (perso, partageables par code) ============
  // Chaque agent crée ses propres plans sur la carte (dessins libres). Un plan
  // peut être partagé en lecture via son `shareCode` unique. `shapes` = JSON des
  // formes (coordonnées en % 0-100, indépendantes des tuiles).
  mapPlans: defineTable({
    agentId: v.id("agents"),
    name: v.string(),
    shapes: v.string(), // JSON.stringify(Shape[])
    shareCode: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_agent", ["agentId"])
    .index("by_code", ["shareCode"]),

  // ============ CÉRÉMONIES ============
  // Une cérémonie planifie une date/heure (ajoutée au calendrier, 1 h), porte des
  // rappels (un par un) et des montées en grade (agent + grade futur), génère un
  // document officiel et peut exécuter les montées en grade Discord (file de rôles).
  ceremonies: defineTable({
    title: v.string(),
    at: v.number(), // jour concerné (minuit UTC)
    startTime: v.string(), // "HH:MM" (heure de Paris affichée)
    lieu: v.optional(v.string()),
    notes: v.optional(v.string()),
    calendarEventId: v.optional(v.id("calendarEvents")),
    createdBy: v.optional(v.id("agents")),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()), // soft-delete universel
  }).index("by_at", ["at"]),

  ceremonyReminders: defineTable({
    ceremonyId: v.id("ceremonies"),
    text: v.string(),
    createdAt: v.number(),
  }).index("by_ceremony", ["ceremonyId"]),

  ceremonyPromotions: defineTable({
    ceremonyId: v.id("ceremonies"),
    agentId: v.id("agents"),
    fromGradeId: v.optional(v.id("grades")), // grade au moment de l'ajout (snapshot)
    toGradeId: v.id("grades"),
    mdtAppliedAt: v.optional(v.number()), // grade appliqué dans le MDT
    discordAppliedAt: v.optional(v.number()), // rôle Discord mis en file
    createdAt: v.number(),
  }).index("by_ceremony", ["ceremonyId"]),

  // Licenciements annoncés lors d'une cérémonie (agent recensé ou simple nom).
  ceremonyDismissals: defineTable({
    ceremonyId: v.id("ceremonies"),
    agentId: v.optional(v.id("agents")),
    name: v.string(), // snapshot du nom (obligatoire, même si agent relié)
    fromGradeName: v.optional(v.string()), // grade quitté (snapshot texte)
    createdAt: v.number(),
  }).index("by_ceremony", ["ceremonyId"]),

  // File d'annonces de cérémonie postées par le bot dans le salon configuré :
  // ANNONCE (avant) ou RESULT (montées en grade + licenciements). Le contenu est
  // pré-rendu côté MDT (mentions Discord incluses).
  ceremonyPosts: defineTable({
    ceremonyId: v.id("ceremonies"),
    kind: v.union(v.literal("ANNOUNCE"), v.literal("RESULT")),
    content: v.string(),
    sent: v.boolean(),
    at: v.number(),
  }).index("by_sent", ["sent"]),

  // ============ PLAINTES (item 2) ============
  complaints: defineTable({
    // Plaignant : citoyen recensé (id) OU simple nom (import Nexus sans fiche).
    plaignantId: v.optional(v.id("citizens")),
    plaignantName: v.optional(v.string()),
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
    // Parité NexusMDT (sync write-through). Côté Nexus le « contre » est un texte
    // libre (nom/groupe/« X »), les avocats une liste, plus un statut détaillé.
    contre: v.optional(v.string()), // défendeur en texte libre (miroir Nexus)
    avocats: v.optional(v.array(v.string())),
    raisonStatut: v.optional(v.string()),
    photos: v.optional(v.array(v.string())),
    officiers: v.optional(v.array(v.object({ matricule: v.optional(v.string()), nom: v.string() }))),
    numero: v.optional(v.number()), // numéro séquentiel Nexus
    nexusId: v.optional(v.string()), // _id Mongo (edit/delete par id)
    importRef: v.optional(v.string()), // clé d'anti-doublon (= numero)
  })
    .index("by_plaignant", ["plaignantId"])
    .index("by_defendant", ["defendantCitizenId"])
    .index("by_deleted", ["deletedAt"])
    .index("by_import", ["importRef"]),

  // ============ ARMES (item 3) ============
  weapons: defineTable({
    typeId: v.optional(v.id("weaponTypes")),
    typeName: v.optional(v.string()), // snapshot lisible
    modele: v.string(),
    serial: v.string(),
    motif: v.optional(v.string()),
    origine: v.optional(v.string()), // catégorie issue de weaponOrigins
    dateEnregistrement: v.optional(v.string()), // date d'enregistrement Nexus
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
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
    nexusId: v.optional(v.string()), // _id Mongo Nexus (edit/delete par id)
    importRef: v.optional(v.string()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_serial", ["serial"])
    .index("by_deleted", ["deletedAt"])
    .index("by_import", ["importRef"])
    .searchIndex("search", { searchField: "searchText" }),

  // ============ SYNCHRO NEXUS (write-through) ============
  // Coffre d'identifiants Nexus par agent, pour poster en son nom (createdBy
  // correct). Le mot de passe est chiffré au repos (AES-GCM, clé NEXUS_ENC_KEY),
  // mais réversible côté serveur : imposer un mot de passe DÉDIÉ et unique.
  nexusCredentials: defineTable({
    agentId: v.id("agents"),
    email: v.string(),
    secretEnc: v.string(), // mot de passe chiffré (iv:ciphertext base64)
    status: v.union(v.literal("UNTESTED"), v.literal("OK"), v.literal("INVALID")),
    lastCheckedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    // Cache du token (évite un login à chaque écriture) + expiration (epoch ms).
    tokenCache: v.optional(v.string()),
    tokenExpiry: v.optional(v.number()),
  }).index("by_agent", ["agentId"]),

  // File d'alertes de synchro à envoyer en MP Discord (échecs répétés, comptes
  // invalides…). Le bot dépile via bot.nexusAlertQueue / markNexusAlertSent.
  nexusAlerts: defineTable({
    at: v.number(),
    message: v.string(),
    targetDiscordId: v.string(),
    sent: v.boolean(),
  }).index("by_sent", ["sent"]),

  // Journal des opérations de synchro Nexus (imports + écritures write-through),
  // pour la page de monitoring (graphiques, taux de succès, appels API).
  nexusSyncLog: defineTable({
    at: v.number(),
    direction: v.union(v.literal("IMPORT"), v.literal("WRITE"), v.literal("AUTH")),
    entity: v.string(), // "citoyen" | "casier" | "amende" | "import-complet" | "login"…
    op: v.string(), // "POST" | "SYNC" | "LOGIN"…
    ok: v.boolean(),
    httpStatus: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    agentId: v.optional(v.id("agents")),
    detail: v.optional(v.string()),
    error: v.optional(v.string()),
  }).index("by_at", ["at"]),

  // ============ DÉPOSITIONS (item 7) ============
  depositions: defineTable({
    citizenId: v.id("citizens"),
    // STANDALONE : déposition sans rattachement (format NexusMDT).
    linkType: v.union(v.literal("COMPLAINT"), v.literal("DOSSIER"), v.literal("REPORT"), v.literal("STANDALONE")),
    complaintId: v.optional(v.id("complaints")),
    casierEntryId: v.optional(v.id("casierEntries")), // legacy
    reportId: v.optional(v.id("reports")),
    title: v.optional(v.string()), // = « objet » côté Nexus
    body: v.string(),
    at: v.number(),
    createdBy: v.optional(v.id("agents")),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
    // Parité NexusMDT (sync write-through).
    officiers: v.optional(v.array(v.object({ matricule: v.optional(v.string()), nom: v.string() }))),
    numero: v.optional(v.number()),
    nexusId: v.optional(v.string()),
    importRef: v.optional(v.string()),
  })
    .index("by_citizen", ["citizenId"])
    .index("by_deleted", ["deletedAt"])
    .index("by_import", ["importRef"]),

  // ============ ENTRETIENS (portail LSPA) ============
  // Banque configurable de questions et de mises en situation. Chaque élément a
  // un intitulé et l'explication de la réponse attendue.
  interviewItems: defineTable({
    kind: v.union(v.literal("QUESTION"), v.literal("SCENARIO")),
    text: v.string(),
    explanation: v.optional(v.string()),
    position: v.number(),
    active: v.boolean(),
  })
    .index("by_position", ["position"])
    .index("by_kind", ["kind"]),

  // Un entretien passé : identité du candidat, questions notées (snapshot) et
  // une mise en situation tirée au hasard. Score final calculé (0-100).
  interviews: defineTable({
    prenom: v.string(),
    nom: v.string(),
    dateNaissance: v.optional(v.string()),
    // Snapshot : le contenu survit aux changements de la banque, et reste
    // éditable dans la fiche.
    questions: v.array(v.object({ text: v.string(), explanation: v.optional(v.string()), note: v.optional(v.number()) })),
    scenario: v.optional(v.object({ text: v.string(), explanation: v.optional(v.string()), note: v.optional(v.number()) })),
    score: v.optional(v.number()), // pourcentage 0-100
    createdBy: v.optional(v.id("agents")),
    createdByName: v.string(),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
  })
    .index("by_created", ["createdAt"])
    .index("by_deleted", ["deletedAt"]),

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
    // Agent créateur : optionnel car les saisies importées du NexusMDT n'ont pas
    // de compte local (seul un nom d'officier libre est renvoyé).
    agentId: v.optional(v.id("agents")),
    matricule: v.optional(v.number()), // snapshot
    agentName: v.optional(v.string()), // snapshot (ou officier Nexus à l'import)
    // ---- Champs NexusMDT (source de vérité, write-through) ----
    type: v.optional(v.string()), // Véhicule / Arme / Argent / Stupéfiants / Objet
    objet: v.optional(v.string()), // objet saisi (requis à la création)
    quantite: v.optional(v.string()), // ex. « x1, 250g »
    montant: v.optional(v.number()), // Valeur ($)
    statut: v.optional(v.string()), // Sous scellés / Confisqué / Restitué / Détruit
    misEnCause: v.optional(v.string()), // « Mis en cause » (nom libre)
    date: v.optional(v.string()), // « YYYY-MM-DD »
    lieu: v.optional(v.string()),
    notes: v.optional(v.string()),
    nexusId: v.optional(v.string()), // _id Mongo Nexus (idempotence, edit/delete par id)
    importRef: v.optional(v.string()),
    // ---- Anciens champs (compat des lignes existantes ; obsolètes) ----
    enquete: v.optional(v.string()), // enquête liée (libre)
    quantity: v.optional(v.number()),
    objectType: v.optional(v.string()), // nom du type OU "Autre"
    otherLabel: v.optional(v.string()), // saisi librement si "Autre"
    searchText: v.optional(v.string()), // objet+misEnCause+type+agent+lieu+notes (recherche)
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("agents")),
  })
    .index("by_at", ["at"])
    .index("by_deleted", ["deletedAt"])
    .index("by_nexus", ["nexusId"])
    .index("by_import", ["importRef"])
    .searchIndex("search", { searchField: "searchText" }),

  // ============ BOT : tickets de candidature (Police Academy) ============
  // Configuration du système, singleton. Tout est réglable depuis Discord via la
  // commande centrale du bot.
  ticketConfig: defineTable({
    categoryId: v.optional(v.string()), // catégorie Discord où sont créés les tickets
    panelChannelId: v.optional(v.string()), // salon du panneau « Soumettre ma candidature »
    panelMessageId: v.optional(v.string()),
    candidaturesOpen: v.boolean(), // le bouton de candidature n'agit que si ouvert
    // Panneau public + message d'ouverture : embeds riches.
    panelEmbed: v.optional(richEmbed),
    openEmbed: v.optional(richEmbed),
    // Anciens champs à plat (compat, `*Embed` prime).
    panelTitle: v.optional(v.string()),
    panelText: v.optional(v.string()),
    openTitle: v.optional(v.string()),
    openText: v.optional(v.string()),
    openColor: v.optional(v.string()),
    // Nomenclature du salon (placeholders {prenom} {nom} {date}). Défaut prenom-nom.
    nomenclature: v.optional(v.string()),
    renameNick: v.optional(v.boolean()), // renommer le pseudo Discord en Prénom Nom RP
    // Rôles qui voient les catégories de promo (créées par le bot).
    promoRoleIds: v.optional(v.array(v.string())),
    cadetRoleId: v.optional(v.string()), // rôle @Cadet (ping annonce + attribué par /validation)
    // Rôles recruteurs : seuls à voir les tickets et à utiliser !r / !a / /validation.
    recruiterRoleIds: v.optional(v.array(v.string())),
    // Textes configurables de la candidature par MP (une ligne par élément).
    importantInfo: v.optional(v.string()), // « Informations importantes »
    conditionsRP: v.optional(v.string()), // « Conditions RP » à accepter
    // Annonce officielle : embed riche avec placeholders ({date} {heure} {lieu}
    // {promo} {cadet}) substitués à l'envoi.
    announceEmbed: v.optional(richEmbed),
    // Anciens champs à plat de l'annonce (compat, `announceEmbed` prime).
    announceText: v.optional(v.string()),
    announceItems: v.optional(v.string()), // « à prévoir », une ligne par item
    // Catégorie Discord par statut (déplacement du salon). Sans entrée pour un
    // statut : le ticket reste dans la catégorie d'arrivée (categoryId).
    statusCategories: v.optional(v.array(v.object({ status: v.string(), categoryId: v.string() }))),
    updatedAt: v.number(),
  }),

  // Votes pour/contre sous une candidature (statut « Vote en cours »). Un vote
  // par personne, modifiable ; on garde le nom pour l'afficher.
  ticketVotes: defineTable({
    ticketId: v.id("tickets"),
    discordUserId: v.string(),
    discordName: v.string(),
    choice: v.union(v.literal("FOR"), v.literal("AGAINST")),
    at: v.number(),
  })
    .index("by_ticket", ["ticketId"])
    .index("by_ticket_user", ["ticketId", "discordUserId"]),

  // Modèles de message (embeds) à envoyer dans un ticket.
  ticketTemplates: defineTable({
    name: v.string(),
    pingOwner: v.boolean(), // ping le propriétaire du ticket à l'envoi
    embed: v.optional(richEmbed),
    // Champs à plat conservés pour les anciens templates ; `embed` prime.
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_name", ["name"]),

  // Tickets ouverts : lie un salon Discord à son candidat (pour le ping et le suivi).
  tickets: defineTable({
    channelId: v.string(),
    ownerId: v.string(), // id Discord du candidat
    ownerName: v.string(),
    prenom: v.string(),
    nom: v.string(),
    dateNaissance: v.optional(v.string()),
    motivations: v.optional(v.string()),
    experiences: v.optional(v.string()), // expériences professionnelles RP
    status: v.union(v.literal("OPEN"), v.literal("CLOSED")),
    // Statut de la candidature (cycle de vie) : NEW 🆕 · VOTE 🗳️ · ACCEPTED 📋 ·
    // INTERVIEW 📅 · PASSED 🎓 · ACADEMY ⭐ · REJECTED ❌.
    // (EVALUATING / FAILED / PASSED_ABSENT : anciennes valeurs, conservées pour l'existant.)
    integrationStatus: v.optional(v.union(
      v.literal("NEW"), v.literal("VOTE"), v.literal("ACCEPTED"), v.literal("INTERVIEW"),
      v.literal("PASSED"), v.literal("ACADEMY"), v.literal("PRESENT"), v.literal("REJECTED"),
      v.literal("EVALUATING"), v.literal("FAILED"), v.literal("PASSED_ABSENT"),
    )),
    interviewAt: v.optional(v.number()), // date/heure d'entretien (statut INTERVIEW), epoch UTC
    interviewById: v.optional(v.string()), // id Discord de l'instructeur qui a programmé l'entretien
    interviewRemindedFor: v.optional(v.number()), // interviewAt déjà rappelé (anti-doublon)
    interviewPresence: v.optional(v.union(v.literal("CONFIRMED"), v.literal("DECLINED"))), // réponse du candidat
    interviewMsgId: v.optional(v.string()), // message d'entretien dans le ticket
    voteMsgId: v.optional(v.string()), // message de vote pour/contre (statut VOTE)
    scheduledCloseAt: v.optional(v.number()), // !close <délai> : fermeture auto sans réponse du candidat
    // Abonnements aux pings sur réponse du candidat (ids Discord des recruteurs).
    // pingOnce : ping à la PROCHAINE réponse puis retiré. pingAlways : à chaque réponse.
    pingOnce: v.optional(v.array(v.string())),
    pingAlways: v.optional(v.array(v.string())),
    promotionId: v.optional(v.id("promotions")), // promo rejointe (après « Présent »)
    createdAt: v.number(),
    // Journal du ticket + raison de fermeture (repris dans l'archive).
    events: v.optional(v.array(ticketEvent)),
    closeReason: v.optional(v.string()),
    closedBy: v.optional(v.string()),
  })
    .index("by_channel", ["channelId"])
    .index("by_owner", ["ownerId"])
    // Les sondages du bot (rappels d'entretien, fermetures dues) ne concernent
    // que les tickets OUVERTS : cet index évite de relire tous les tickets clos.
    .index("by_status", ["status"])
    // Sondages bot ciblés : ne lire QUE les tickets réellement dus, au lieu de
    // scanner tous les tickets ouverts toutes les 5 min (fermeture / rappel).
    .index("by_close", ["status", "scheduledCloseAt"])
    .index("by_interview", ["status", "interviewAt"]),

  // Archives des tickets de candidature (Police Academy) : conservées à la
  // fermeture définitive, consultables sur le portail LSPA. Journal complet +
  // historique des messages du salon.
  ticketArchives: defineTable({
    channelId: v.string(),
    channelName: v.string(),
    ownerId: v.string(), // id Discord du candidat
    ownerName: v.string(),
    prenom: v.string(),
    nom: v.string(),
    dateNaissance: v.optional(v.string()),
    motivations: v.optional(v.string()),
    experiences: v.optional(v.string()),
    promotionName: v.optional(v.string()),
    integrationStatus: v.optional(v.string()),
    finalStatus: v.string(),
    closeReason: v.optional(v.string()),
    events: v.array(ticketEvent),
    messages: v.array(v.object({
      authorId: v.string(),
      authorName: v.string(),
      bot: v.optional(v.boolean()),
      content: v.string(),
      at: v.number(),
      attachments: v.optional(v.array(v.string())),
    })),
    createdAt: v.number(),
    archivedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_archivedAt", ["archivedAt"]),

  // Armes de service LSPD : chaque agent enregistre sa/ses arme(s) (photo avec
  // n° de série visible, n° de série, modèle). Distinct du registre citoyen
  // (table `weapons`, synchronisé Nexus). Une même série peut être enregistrée
  // par deux agents différents (arme réattribuée après un licenciement) : pas
  // d'unicité globale du numéro de série. Soft-delete (`deletedAt`).
  serviceWeapons: defineTable({
    agentId: v.id("agents"),
    serial: v.string(),
    model: v.string(),
    photoUrl: v.string(),
    createdBy: v.id("agents"),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_agent", ["agentId"])
    .index("by_serial", ["serial"]),

  // State Code du serveur RP (source : site officiel), importé pour l'assistant
  // juridique. Une ligne = une section (un « code »). Recherche par mots-clés
  // côté action ; pas de wiki, c'est la base de connaissance de l'assistant.
  stateCodeSections: defineTable({
    slug: v.string(), // identifiant stable pour l'upsert (ex. "code-de-l-armement")
    code: v.string(), // nom du code (ex. "Code de l'armement")
    title: v.string(), // titre de la section (souvent = code)
    order: v.number(),
    body: v.string(), // texte juridique intégral
    searchText: v.string(), // normalisé (sans accents, minuscule) pour le scoring
    sourceUrl: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_order", ["order"]),

  // Journal des questions à l'assistant State Code : sert au rate-limiting par
  // agent (anti-boucle / épuisement de tokens).
  stateCodeAsks: defineTable({
    agentId: v.id("agents"),
    at: v.number(),
  }).index("by_agent", ["agentId", "at"]),
});
