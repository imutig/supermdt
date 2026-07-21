// GÉNÉRÉ par data-source/gen-penal-seed.mjs - ne pas éditer à la main.
// Source : livret des peines SAST (278 charges).

export const SEVERITIES = ["Contravention","Délit mineur","Délit majeur","Crime"] as const;

export const CATEGORIES = [
  {
    "name": "DROGUE",
    "position": 0,
    "sensitive": true
  },
  {
    "name": "VIOLENCES - MENACES",
    "position": 1,
    "sensitive": true
  },
  {
    "name": "VOLS/BRAQUAGE",
    "position": 2,
    "sensitive": true
  },
  {
    "name": "ARMES",
    "position": 3,
    "sensitive": true
  },
  {
    "name": "HARCELEMENT MORAL",
    "position": 4,
    "sensitive": false
  },
  {
    "name": "ESCROQUERIE",
    "position": 5,
    "sensitive": false
  },
  {
    "name": "AUTORITE JUDICIAIRE",
    "position": 6,
    "sensitive": false
  },
  {
    "name": "ROUTIER",
    "position": 7,
    "sensitive": false
  },
  {
    "name": "PROPRIETE",
    "position": 8,
    "sensitive": false
  },
  {
    "name": "AERONEF",
    "position": 9,
    "sensitive": false
  },
  {
    "name": "NAVAL",
    "position": 10,
    "sensitive": false
  },
  {
    "name": "PÊCHE",
    "position": 11,
    "sensitive": false
  },
  {
    "name": "CHASSE",
    "position": 12,
    "sensitive": false
  },
  {
    "name": "DESTRUCTION ET VANDALISME",
    "position": 13,
    "sensitive": false
  },
  {
    "name": "ATTEINTE A LA VIE",
    "position": 14,
    "sensitive": true
  },
  {
    "name": "ATTEINTE A LA SURETE DE L'ETAT",
    "position": 15,
    "sensitive": true
  },
  {
    "name": "HAUTES AUTORITES POLITIQUE (HAP)",
    "position": 16,
    "sensitive": false
  },
  {
    "name": "ENVIRONNEMENT",
    "position": 17,
    "sensitive": false
  },
  {
    "name": "AFFAIRE ET ENTREPRISE",
    "position": 18,
    "sensitive": false
  },
  {
    "name": "CIVIL ET HERITAGE",
    "position": 19,
    "sensitive": false
  },
  {
    "name": "TRAVAIL",
    "position": 20,
    "sensitive": false
  },
  {
    "name": "ELECTION",
    "position": 21,
    "sensitive": false
  }
] as const;

export const SANCTIONS = [
  {
    "name": "(Si n'est pas natif de LS)",
    "position": 0
  },
  {
    "name": "Blâme/mise à pied",
    "position": 1
  },
  {
    "name": "Expulsion du territoire",
    "position": 2
  },
  {
    "name": "Fourrière",
    "position": 3
  },
  {
    "name": "Fourrière aéronef",
    "position": 4
  },
  {
    "name": "Fourrière bâteau",
    "position": 5
  },
  {
    "name": "Fourrière véhicule",
    "position": 6
  },
  {
    "name": "Mise à pied/licenciement",
    "position": 7
  },
  {
    "name": "Remise à l'eau",
    "position": 8
  },
  {
    "name": "Retrait permis",
    "position": 9
  },
  {
    "name": "Saisie arme",
    "position": 10
  },
  {
    "name": "Saisie arme + gibier",
    "position": 11
  },
  {
    "name": "Saisie des biens",
    "position": 12
  },
  {
    "name": "Saisie document",
    "position": 13
  },
  {
    "name": "Saisie labo/plante",
    "position": 14
  },
  {
    "name": "Saisie materiel",
    "position": 15
  },
  {
    "name": "Saisie outil",
    "position": 16
  },
  {
    "name": "Saisie pièce d'identité",
    "position": 17
  },
  {
    "name": "Saisie plante",
    "position": 18
  },
  {
    "name": "Saisie stupéfiants",
    "position": 19
  },
  {
    "name": "Saisie vol",
    "position": 20
  },
  {
    "name": "Saisie vol et arme",
    "position": 21
  },
  {
    "name": "Suspension si PPA",
    "position": 22
  },
  {
    "name": "Suspenssion permis",
    "position": 23
  },
  {
    "name": "destruction labo/équipement",
    "position": 24
  }
] as const;

export const CHARGES = [
  {
    "category": "DROGUE",
    "severity": "Délit mineur",
    "name": "Production de Skunk (- de 5 pousses)",
    "fine": {
      "kind": "FIXED",
      "amount": 22500,
      "raw": "$22 500"
    },
    "recidiveDays": 14,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants",
      "Saisie plante"
    ],
    "description": "Culture ou détention de skunk à l’état de pousse, en quantité inférieure à cinq plants, sans caractère industriel ou organisé.",
    "position": 0
  },
  {
    "category": "DROGUE",
    "severity": "Délit majeur",
    "name": "Production de Skunk (+ de 5 pousses)",
    "fine": {
      "kind": "FIXED",
      "amount": 35000,
      "raw": "$35 000"
    },
    "recidiveDays": 21,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants",
      "Saisie labo/plante"
    ],
    "description": "Culture ou détention de skunk à l’état de pousse, en quantité supérieur à cinq plants, sans caractère industriel ou organisé.",
    "position": 1
  },
  {
    "category": "DROGUE",
    "severity": "Délit majeur",
    "name": "Production de Weed (- de 5 pousses)",
    "fine": {
      "kind": "FIXED",
      "amount": 25000,
      "raw": "$25 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants",
      "Saisie plante"
    ],
    "description": "Culture ou détention de weed à l’état de pousse, en quantité inférieure à cinq plants, sans caractère industriel ou organisé.",
    "position": 2
  },
  {
    "category": "DROGUE",
    "severity": "Crime",
    "name": "Production de Weed (+ de 5 pousses)",
    "fine": {
      "kind": "FIXED",
      "amount": 60000,
      "raw": "$60 000"
    },
    "recidiveDays": 21,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie stupéfiants",
      "Saisie labo/plante"
    ],
    "description": "Culture ou détention de weed à l’état de pousse, en quantité inférieure à cinq plants, sans caractère industriel ou organisé.",
    "position": 3
  },
  {
    "category": "DROGUE",
    "severity": "Crime",
    "name": "Production/transformation de Cocaine",
    "fine": {
      "kind": "FIXED",
      "amount": 90000,
      "raw": "$90 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 7200,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie stupéfiants",
      "destruction labo/équipement"
    ],
    "description": "Mise en place ou exploitation d’un laboratoire destiné à la fabrication, l’extraction ou la transformation de cocaïne ou de ses dérivés, quel qu’en soit le stade d’avancement.",
    "position": 4
  },
  {
    "category": "DROGUE",
    "severity": "Crime",
    "name": "Production/transformation de Meth",
    "fine": {
      "kind": "FIXED",
      "amount": 90000,
      "raw": "$90 000"
    },
    "recidiveDays": 21,
    "jailSeconds": 5400,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie stupéfiants",
      "destruction labo/équipement"
    ],
    "description": "Mise en place ou exploitation d’un laboratoire destiné à la fabrication, la synthèse ou la transformation de méthamphétamine ou de ses dérivés, quel qu’en soit le stade d’avancement.",
    "position": 5
  },
  {
    "category": "DROGUE",
    "severity": "Délit majeur",
    "name": "Transport de stupéfiants 301 à 500",
    "fine": {
      "kind": "FORMULA",
      "raw": "Possession de \"drogue\" X 1,15"
    },
    "recidiveDays": 7,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Le fait de déplacer ou de faire circuler des drogues interdites dans un véhicule et que la quantité est comprise entre 301 et 500. (Si cette infraction est retenu vous ne pouvez pas ajouter \"possession de XXX\" en plus.",
    "position": 6
  },
  {
    "category": "DROGUE",
    "severity": "Crime",
    "name": "Transport de stupéfiants > 501",
    "fine": {
      "kind": "FORMULA",
      "raw": "Possession de \"drogue\" X 1,30"
    },
    "recidiveDays": 14,
    "jailSeconds": 5400,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Le fait de déplacer ou de faire circuler des drogues interdites dans un véhicule et que la quantité est supérieur à 501 pochons. (Si cette infraction est retenu vous ne pouvez pas ajouter \"possession de XXX\" en plus.",
    "position": 7
  },
  {
    "category": "DROGUE",
    "severity": "Crime",
    "name": "Importation de stupéfiants",
    "fine": {
      "kind": "FORMULA",
      "raw": "Possesion de \"drogue\" X 1,50"
    },
    "recidiveDays": 30,
    "jailSeconds": 7200,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Le fait d’introduire sur le territoire national des drogues interdites, peu importe la quantité.",
    "position": 8
  },
  {
    "category": "DROGUE",
    "severity": "Délit mineur",
    "name": "Possession de Skunk <= 100",
    "fine": {
      "kind": "FIXED",
      "amount": 3000,
      "raw": "$3 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Le fait de détenir ou transporter du skunk en quantité comprise entre 0 et 100, sur soi, constitue une infraction.",
    "position": 9
  },
  {
    "category": "DROGUE",
    "severity": "Délit mineur",
    "name": "Possession de Skunk <= 200",
    "fine": {
      "kind": "FIXED",
      "amount": 6000,
      "raw": "$6 000"
    },
    "recidiveDays": 1,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Le fait de détenir ou transporter du skunk en quantité comprise entre 101 et 200, sur soi, constitue une infraction.",
    "position": 10
  },
  {
    "category": "DROGUE",
    "severity": "Délit mineur",
    "name": "Possession de Skunk <= 300",
    "fine": {
      "kind": "FIXED",
      "amount": 9000,
      "raw": "$9 000"
    },
    "recidiveDays": 2,
    "jailSeconds": 1200,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Le fait de détenir ou transporter du skunk en quantité comprise entre 201 et 300, sur soi, constitue une infraction.",
    "position": 11
  },
  {
    "category": "DROGUE",
    "severity": "Délit majeur",
    "name": "Possession de Skunk >= 301",
    "fine": {
      "kind": "FIXED",
      "amount": 15000,
      "raw": "$15 000"
    },
    "recidiveDays": 3,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Le fait de détenir ou transporter du skunk en quantité égale ou supérieure à 301, sur soi, constitue une infraction.",
    "position": 12
  },
  {
    "category": "DROGUE",
    "severity": "Délit mineur",
    "name": "Vente de Skunk",
    "fine": {
      "kind": "FIXED",
      "amount": 1500,
      "raw": "$1 500"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Cession, transaction ou tentative de vente de skunk à un tiers, constatée uniquement sur preuve visuelle (photo ou observation à distance via jumelles).",
    "position": 13
  },
  {
    "category": "DROGUE",
    "severity": "Délit mineur",
    "name": "Possession de weed <= 100",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Le fait de détenir ou transporter de la weed en quantité comprise entre 0 et 100, sur soi, constitue une infraction.",
    "position": 14
  },
  {
    "category": "DROGUE",
    "severity": "Délit mineur",
    "name": "Possession de weed <= 200",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 1,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Le fait de détenir ou transporter de la weed en quantité comprise entre 101 et 200, sur soi, constitue une infraction.",
    "position": 15
  },
  {
    "category": "DROGUE",
    "severity": "Délit majeur",
    "name": "Possession de weed <= 300",
    "fine": {
      "kind": "FIXED",
      "amount": 15000,
      "raw": "$15 000"
    },
    "recidiveDays": 2,
    "jailSeconds": 1200,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Le fait de détenir ou transporter de la weed en quantité comprise entre 201 et 300, sur soi, constitue une infraction.",
    "position": 16
  },
  {
    "category": "DROGUE",
    "severity": "Délit majeur",
    "name": "Possession de weed >= 301",
    "fine": {
      "kind": "FIXED",
      "amount": 22500,
      "raw": "$22 500"
    },
    "recidiveDays": 3,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Le fait de détenir ou transporter de la weed en quantité égale ou supérieure à 301, sur soi, constitue une infraction.",
    "position": 17
  },
  {
    "category": "DROGUE",
    "severity": "Délit mineur",
    "name": "Vente de weed",
    "fine": {
      "kind": "FIXED",
      "amount": 2500,
      "raw": "$2 500"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Cession, transaction ou tentative de vente de stupéfiants de weed à un tiers, constatée uniquement sur preuve visuelle (photo ou observation à distance via jumelles).",
    "position": 18
  },
  {
    "category": "DROGUE",
    "severity": "Délit mineur",
    "name": "Possession de cocaine <= 10",
    "fine": {
      "kind": "FIXED",
      "amount": 750,
      "raw": "$750"
    },
    "recidiveDays": 1,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Le fait de détenir ou transporter de la cocaïne en quantité comprise entre 0 et 10, sur soi, constitue une infraction.",
    "position": 19
  },
  {
    "category": "DROGUE",
    "severity": "Délit majeur",
    "name": "Possession de cocaine <= 25",
    "fine": {
      "kind": "FIXED",
      "amount": 3750,
      "raw": "$3 750"
    },
    "recidiveDays": 2,
    "jailSeconds": 1200,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Le fait de détenir ou transporter de la cocaïne en quantité comprise entre 11 et 25, sur soi, constitue une infraction.",
    "position": 20
  },
  {
    "category": "DROGUE",
    "severity": "Délit majeur",
    "name": "Possession de cocaine <= 50",
    "fine": {
      "kind": "FIXED",
      "amount": 7500,
      "raw": "$7 500"
    },
    "recidiveDays": 3,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Le fait de détenir ou transporter de la cocaïne en quantité comprise entre 26 et 50, sur soi, constitue une infraction.",
    "position": 21
  },
  {
    "category": "DROGUE",
    "severity": "Crime",
    "name": "Possession de cocaine >= 51",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 4,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Le fait de détenir ou transporter de la cocaïne en quantité égale ou supérieure à 51, sur soi, constitue une infraction.",
    "position": 22
  },
  {
    "category": "DROGUE",
    "severity": "Délit mineur",
    "name": "Vente de cocaine",
    "fine": {
      "kind": "FIXED",
      "amount": 1000,
      "raw": "$1 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Cession, transaction ou tentative de vente de stupéfiants de cocaine à un tiers, constatée uniquement sur preuve visuelle (photo ou observation à distance via jumelles).",
    "position": 23
  },
  {
    "category": "DROGUE",
    "severity": "Délit mineur",
    "name": "Possession de meth <= 100",
    "fine": {
      "kind": "FIXED",
      "amount": 15000,
      "raw": "$15 000"
    },
    "recidiveDays": 1,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Le fait de détenir ou transporter de la meth en quantité comprise entre 0 et 100, sur soi, constitue une infraction.",
    "position": 24
  },
  {
    "category": "DROGUE",
    "severity": "Délit majeur",
    "name": "Possession de meth <= 200",
    "fine": {
      "kind": "FIXED",
      "amount": 30000,
      "raw": "$30 000"
    },
    "recidiveDays": 2,
    "jailSeconds": 1200,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Le fait de détenir ou transporter de la meth en quantité comprise entre 101 et 200, sur soi, constitue une infraction.",
    "position": 25
  },
  {
    "category": "DROGUE",
    "severity": "Délit majeur",
    "name": "Possession de meth <= 300",
    "fine": {
      "kind": "FIXED",
      "amount": 45000,
      "raw": "$45 000"
    },
    "recidiveDays": 3,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Le fait de détenir ou transporter de la meth en quantité comprise entre 201 et 300, sur soie, constitue une infraction.",
    "position": 26
  },
  {
    "category": "DROGUE",
    "severity": "Crime",
    "name": "Possession de meth >= 301",
    "fine": {
      "kind": "FIXED",
      "amount": 55000,
      "raw": "$55 000"
    },
    "recidiveDays": 4,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Le fait de détenir ou transporter de la meth en quantité égale ou supérieure à 301, sur soi, constitue une infraction.",
    "position": 27
  },
  {
    "category": "DROGUE",
    "severity": "Délit mineur",
    "name": "Vente de meth",
    "fine": {
      "kind": "FIXED",
      "amount": 7500,
      "raw": "$7 500"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Cession, transaction ou tentative de vente de stupéfiants de méthamphétamine à un tiers, constatée uniquement sur preuve visuelle (photo ou observation à distance via jumelles).",
    "position": 28
  },
  {
    "category": "DROGUE",
    "severity": "Délit mineur",
    "name": "Usage de stupéfiant en public",
    "fine": {
      "kind": "FIXED",
      "amount": 1000,
      "raw": "$1 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie stupéfiants"
    ],
    "description": "Le fait de consommer des drogues interdites dans un lieu public.",
    "position": 29
  },
  {
    "category": "VIOLENCES - MENACES",
    "severity": "Délit mineur",
    "name": "Violence commises à main nue",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait d’exercer des violences physiques sans arme.",
    "position": 30
  },
  {
    "category": "VIOLENCES - MENACES",
    "severity": "Délit majeur",
    "name": "Violences commises à main nue sur PDAP",
    "fine": {
      "kind": "FIXED",
      "amount": 20000,
      "raw": "$20 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait d’exercer des violences physiques sans arme sur agent dépositaire d'autorité public.",
    "position": 31
  },
  {
    "category": "VIOLENCES - MENACES",
    "severity": "Délit mineur",
    "name": "Violences commises avec arme par destination",
    "fine": {
      "kind": "FIXED",
      "amount": 12500,
      "raw": "$12 500"
    },
    "recidiveDays": 7,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Le fait de commettre des violences physiques en utilisant un objet non initialement destiné à être une arme (bouteille, clé, outil, etc.), mais qui, dans le contexte, est utilisé comme tel.",
    "position": 32
  },
  {
    "category": "VIOLENCES - MENACES",
    "severity": "Délit majeur",
    "name": "Violences commises avec arme par destination sur PDAP",
    "fine": {
      "kind": "FIXED",
      "amount": 25000,
      "raw": "$25 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Le fait de commettre des violences physiques en utilisant un objet non initialement destiné à être une arme (bouteille, clé, outil, etc.), mais qui, dans le contexte, est utilisé comme tel sur agent dépositaire d'autorité public.",
    "position": 33
  },
  {
    "category": "VIOLENCES - MENACES",
    "severity": "Délit mineur",
    "name": "Violence avec arme blanche",
    "fine": {
      "kind": "FIXED",
      "amount": 15000,
      "raw": "$15 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Le fait de commettre des violences physiques en utilisant une arme blanche (couteau, machette, épée, etc.).",
    "position": 34
  },
  {
    "category": "VIOLENCES - MENACES",
    "severity": "Délit majeur",
    "name": "Violence avec arme blanche sur PDAP",
    "fine": {
      "kind": "FIXED",
      "amount": 30000,
      "raw": "$30 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Le fait de commettre des violences physiques en utilisant une arme blanche (couteau, machette, épée, etc.) sur agent dépositaire d'autorité public.",
    "position": 35
  },
  {
    "category": "VIOLENCES - MENACES",
    "severity": "Délit majeur",
    "name": "Violence avec arme à feu",
    "fine": {
      "kind": "FORMULA",
      "raw": "Cat d'arme X1,2"
    },
    "recidiveDays": 7,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Le fait de commettre des violences physiques en utilisant une arme à feu (pistolet, fusil, carabine, etc.).",
    "position": 36
  },
  {
    "category": "VIOLENCES - MENACES",
    "severity": "Crime",
    "name": "Violence avec arme à feu sur PDAP",
    "fine": {
      "kind": "FORMULA",
      "raw": "Cat d'arme X1,5"
    },
    "recidiveDays": 14,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Le fait de commettre des violences physiques en utilisant une arme à feu sur un agent dépositaire de l’autorité publique.",
    "position": 37
  },
  {
    "category": "VIOLENCES - MENACES",
    "severity": "Délit mineur",
    "name": "Menace et intimidation",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de contraindre ou effrayer autrui par des menaces verbales, écrites ou comportementales.",
    "position": 38
  },
  {
    "category": "VIOLENCES - MENACES",
    "severity": "Délit majeur",
    "name": "Menace et intimidation sur PDAP",
    "fine": {
      "kind": "FIXED",
      "amount": 20000,
      "raw": "$20 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de contraindre ou effrayer autrui par des menaces graves verbales, écrites ou comportementales agent dépositaire d'autorité public.",
    "position": 39
  },
  {
    "category": "VIOLENCES - MENACES",
    "severity": "Délit mineur",
    "name": "Menace avec arme",
    "fine": {
      "kind": "FIXED",
      "amount": 20000,
      "raw": "$20 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Le fait de proférer des menaces en exhibant une arme ou en laissant entendre qu’on en possède une.",
    "position": 40
  },
  {
    "category": "VIOLENCES - MENACES",
    "severity": "Délit majeur",
    "name": "Menace de commettre un crime ou un délit contre PDAP",
    "fine": {
      "kind": "FIXED",
      "amount": 32500,
      "raw": "$32 500"
    },
    "recidiveDays": 14,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de menacer un agent public (policier, gendarme, etc.) de commettre un crime ou un délit à son encontre.",
    "position": 41
  },
  {
    "category": "VIOLENCES - MENACES",
    "severity": "Crime",
    "name": "Acte de barbarie / Torture",
    "fine": {
      "kind": "FIXED",
      "amount": 500000,
      "raw": "$500 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait d’infliger intentionnellement à une personne des actes d’une violence particulièrement grave et inhumaine, causant de grandes souffrances physiques ou morales.",
    "position": 42
  },
  {
    "category": "VIOLENCES - MENACES",
    "severity": "Délit mineur",
    "name": "Tentative d'enlèvement",
    "fine": {
      "kind": "FIXED",
      "amount": 8000,
      "raw": "$8 000"
    },
    "recidiveDays": 2,
    "jailSeconds": 2400,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait d’essayer de capturer ou déplacer une personne contre sa volonté, sans réussir totalement.",
    "position": 43
  },
  {
    "category": "VIOLENCES - MENACES",
    "severity": "Délit majeur",
    "name": "Enlèvement (Fleeca/Bijouterie)",
    "fine": {
      "kind": "FIXED",
      "amount": 20000,
      "raw": "$20 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de capturer ou déplacer une personne contre sa volonté et de la retenir à des fins de faire un braquage de bijouterie ou de fleeca.",
    "position": 44
  },
  {
    "category": "VIOLENCES - MENACES",
    "severity": "Crime",
    "name": "Enlèvement",
    "fine": {
      "kind": "FIXED",
      "amount": 25000,
      "raw": "$25 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 2400,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de capturer ou déplacer une personne contre sa volonté et de la retenir dans un lieu déterminé.",
    "position": 45
  },
  {
    "category": "VIOLENCES - MENACES",
    "severity": "Crime",
    "name": "Enlèvement sur PDAP",
    "fine": {
      "kind": "FIXED",
      "amount": 30000,
      "raw": "$30 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 3000,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de capturer ou déplacer un agent public EN SERVICE (policier, BSCO, DOJ, etc.) contre sa volonté et de le retenir dans un lieu déterminé.",
    "position": 46
  },
  {
    "category": "VIOLENCES - MENACES",
    "severity": "Délit majeur",
    "name": "Séquestration (Fleeca/Bijouterie)",
    "fine": {
      "kind": "FIXED",
      "amount": 25000,
      "raw": "$25 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de priver une personne de sa liberté de mouvement en la maintenant enfermée ou retenue contre sa volonté dans une bijouterie ou une fleeca.",
    "position": 47
  },
  {
    "category": "VIOLENCES - MENACES",
    "severity": "Crime",
    "name": "Séquestration",
    "fine": {
      "kind": "FIXED",
      "amount": 25000,
      "raw": "$25 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 3000,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de priver une personne de sa liberté de mouvement en la maintenant enfermée ou retenue contre sa volonté.",
    "position": 48
  },
  {
    "category": "VIOLENCES - MENACES",
    "severity": "Crime",
    "name": "Séquestration sur PDAP",
    "fine": {
      "kind": "FIXED",
      "amount": 30000,
      "raw": "$30 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 3000,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de priver un agent public (policier, gendarme, etc.) EN SERVICE de sa liberté de mouvement en le maintenant enfermé ou retenu contre sa volonté.",
    "position": 49
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Délit mineur",
    "name": "Vol simple",
    "fine": {
      "kind": "FIXED",
      "amount": 3000,
      "raw": "$3 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait de s’approprier frauduleusement un bien appartenant à autrui, sans usage de violence ni de menace.",
    "position": 50
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Délit majeur",
    "name": "Vol qualifié",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": null,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait de s’approprier frauduleusement un bien en recourant à des circonstances aggravantes, comme la violence, la menace, ou la réunion de plusieurs personnes.",
    "position": 51
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Délit mineur",
    "name": "Vol avec arme",
    "fine": {
      "kind": "FIXED",
      "amount": 3000,
      "raw": "$3 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie vol et arme"
    ],
    "description": "Le fait de s’approprier frauduleusement un bien en utilisant ou en exhibant une arme pour menacer ou contraindre la victime.",
    "position": 52
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Délit mineur",
    "name": "Vol de véhicule",
    "fine": {
      "kind": "FIXED",
      "amount": 3000,
      "raw": "$3 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Fourrière"
    ],
    "description": "Le fait de s’approprier frauduleusement un véhicule appartenant à autrui.",
    "position": 53
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Délit mineur",
    "name": "Braquage de parcmètres",
    "fine": {
      "kind": "FIXED",
      "amount": 1000,
      "raw": "$1 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait de voler l’argent d’un parcmètre en utilisant la force ou la menace.",
    "position": 54
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Délit mineur",
    "name": "Cambriolage de véhicule",
    "fine": {
      "kind": "FIXED",
      "amount": 2500,
      "raw": "$2 500"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait de forcer l’accès à un véhicule pour en voler le contenu.",
    "position": 55
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Délit mineur",
    "name": "Braquage de pharmacie/chantier",
    "fine": {
      "kind": "FIXED",
      "amount": 7500,
      "raw": "$7 500"
    },
    "recidiveDays": 2,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait de pénétrer et/ou voler des biens dans une pharmacie ou dans un chantier en utilsant la force ou la menace.",
    "position": 56
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Délit mineur",
    "name": "Cambriolage",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": null,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait de pénétrer par effraction dans un lieu (domicile, commerce, entrepôt, etc.) pour y commettre un vol.",
    "position": 57
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Délit mineur",
    "name": "Braquage d'ATM",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 1,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait de voler de l’argent dans un distributeur automatique de billets en utilisant la force ou la menace.",
    "position": 58
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Délit mineur",
    "name": "Braquage d'ATM (Tentative infructueuse)",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": 1,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait d’essayer de voler de l’argent dans un distributeur automatique de billets par la force ou la menace, sans parvenir à s’en emparer ou partiellement.",
    "position": 59
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Délit mineur",
    "name": "Braquage de supérette",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 1,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait de voler des biens ou de l’argent dans une supérette en utilisant la force ou la menace.",
    "position": 60
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Délit mineur",
    "name": "Braquage de Supérette (tentative infructueuse)",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": 1,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait d’essayer de voler des biens ou de l’argent dans une supérette en utilisant la force ou la menace, sans y parvenir.",
    "position": 61
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Délit mineur",
    "name": "Braquage d'AmmuNation",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 2,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait de voler des biens ou de l’argent dans une ammunition en utilisant la force ou la menace.",
    "position": 62
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Délit mineur",
    "name": "Braquage d'AmmuNation (tentative infructueuse)",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": 2,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait de voler des biens ou de l’argent dans une ammunition en utilisant la force ou la menace, sans y parvenir.",
    "position": 63
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Délit majeur",
    "name": "Braquage de convoyeur de fond",
    "fine": {
      "kind": "FIXED",
      "amount": 30000,
      "raw": "$30 000"
    },
    "recidiveDays": 5,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait de voler des biens ou de l’argent transportés par un convoyeur de fonds en utilisant la force ou la menace.",
    "position": 64
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Délit majeur",
    "name": "Braquage de convoyeur de fond (Tentative infructueuse)",
    "fine": {
      "kind": "FIXED",
      "amount": 15000,
      "raw": "$15 000"
    },
    "recidiveDays": 5,
    "jailSeconds": 1200,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait d’essayer de voler des biens ou de l’argent transportés par un convoyeur de fonds en utilisant la force ou la menace, sans réussir.",
    "position": 65
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Délit majeur",
    "name": "Braquage de bijouterie",
    "fine": {
      "kind": "FIXED",
      "amount": 30000,
      "raw": "$30 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait de voler des biens ou de l’argent dans une bijouterie en utilisant la force ou la menace.",
    "position": 66
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Délit majeur",
    "name": "Braquage de bijouterie (Tentative infructueuse)",
    "fine": {
      "kind": "FIXED",
      "amount": 12500,
      "raw": "$12 500"
    },
    "recidiveDays": 7,
    "jailSeconds": 1500,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait d’essayer de voler des biens ou de l’argent dans une bijouterie en utilisant la force ou la menace, sans y parvenir.",
    "position": 67
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Crime",
    "name": "Braquage de Fleeca",
    "fine": {
      "kind": "FIXED",
      "amount": 50000,
      "raw": "$50 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait de voler de l’argent ou des biens dans une agence bancaire Fleeca en utilisant la force ou la menace.",
    "position": 68
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Crime",
    "name": "Braquage de Fleeca (Tentative infructueuse)",
    "fine": {
      "kind": "FIXED",
      "amount": 30000,
      "raw": "$30 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait d’essayer de voler de l’argent ou des biens dans une agence bancaire Fleeca en utilisant la force ou la menace, sans réussir.",
    "position": 69
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Crime",
    "name": "Braquage de train",
    "fine": {
      "kind": "FIXED",
      "amount": 50000,
      "raw": "$50 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait de voler de l’argent ou des biens transportés par un train en utilisant la force ou la menace.",
    "position": 70
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Crime",
    "name": "Braquage de train (Tentative infructueuse)",
    "fine": {
      "kind": "FIXED",
      "amount": 25000,
      "raw": "$25 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait d’essayer de voler de l’argent ou des biens transportés par un train en utilisant la force ou la menace, sans y parvenir.",
    "position": 71
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Crime",
    "name": "Braquage de convoi de saisi",
    "fine": {
      "kind": "FORMULA",
      "raw": "Estimation saisie / 2"
    },
    "recidiveDays": 14,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait de voler de l’argent ou des biens transportés par un convoi de saisie en utilisant la force ou la menace.",
    "position": 72
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Crime",
    "name": "Braquage de convoi de saisi (Tentative infructueuse)",
    "fine": {
      "kind": "FORMULA",
      "raw": "Estimation saisie / 4"
    },
    "recidiveDays": 14,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait d’essayer de voler de l’argent ou des biens transportés par un convoi de saisie en utilisant la force ou la menace, sans réussir.",
    "position": 73
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Crime",
    "name": "Braquage BCSB",
    "fine": {
      "kind": "FIXED",
      "amount": 150000,
      "raw": "$150 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 6300,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait de voler de l’argent ou des biens dans une agence bancaire BCSB en utilisant la force ou la menace.",
    "position": 74
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Crime",
    "name": "Braquage BCSB (Tentative infructueuse)",
    "fine": {
      "kind": "FIXED",
      "amount": 75000,
      "raw": "$75 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 3150,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait d’essayer de voler de l’argent ou des biens dans une agence bancaire BCSB en utilisant la force ou la menace, sans y parvenir.",
    "position": 75
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Crime",
    "name": "Braquage galerie d'art",
    "fine": {
      "kind": "FIXED",
      "amount": 175000,
      "raw": "$175 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 7200,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait d’essayer de voler des biens ou de l’argent dans la gallerie d'art de vinewood en utilisant la force ou la menace.",
    "position": 76
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Crime",
    "name": "Braquage galerie d'art (Tentative infructueuse)",
    "fine": {
      "kind": "FIXED",
      "amount": 85000,
      "raw": "$85 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait d’essayer de voler des biens ou de l’argent dans la gallerie d'art de vinewood en utilisant la force ou la menace, sans y parvenir.",
    "position": 77
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Crime",
    "name": "Braquage Pacificbank",
    "fine": {
      "kind": "FIXED",
      "amount": 300000,
      "raw": "$300 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 14400,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait de voler de l’argent ou des biens dans une agence de la Pacific Bank en utilisant la force ou la menace.",
    "position": 78
  },
  {
    "category": "VOLS/BRAQUAGE",
    "severity": "Crime",
    "name": "Braquage Pacificbank (Tentative infructueuse)",
    "fine": {
      "kind": "FIXED",
      "amount": 150000,
      "raw": "$150 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 7200,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait d’essayer de voler de l’argent ou des biens dans une agence de la Pacific Bank en utilisant la force ou la menace, sans réussir.",
    "position": 79
  },
  {
    "category": "ARMES",
    "severity": "Délit mineur",
    "name": "Port d'arme à feu sans permis",
    "fine": {
      "kind": "FIXED",
      "amount": 3000,
      "raw": "$3 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Le fait de porter sur soi une arme à feu sans détenir l’autorisation ou le permis requis par la loi.",
    "position": 80
  },
  {
    "category": "ARMES",
    "severity": "Délit mineur",
    "name": "Détention d'arme CAT 1",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Le fait de posséder une arme de catégorie 1 sans autorisation légale.",
    "position": 81
  },
  {
    "category": "ARMES",
    "severity": "Délit majeur",
    "name": "Détention d'arme CAT 2",
    "fine": {
      "kind": "FIXED",
      "amount": 25000,
      "raw": "$25 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 1200,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Le fait de posséder une arme de catégorie 2 sans autorisation légale.",
    "position": 82
  },
  {
    "category": "ARMES",
    "severity": "Crime",
    "name": "Détention d'arme CAT 3",
    "fine": {
      "kind": "FIXED",
      "amount": 50000,
      "raw": "$50 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Le fait de posséder une arme de catégorie 3 sans autorisation légale.",
    "position": 83
  },
  {
    "category": "ARMES",
    "severity": "Crime",
    "name": "Détention d'arme CAT 4",
    "fine": {
      "kind": "FIXED",
      "amount": 100000,
      "raw": "$100 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Le fait de posséder une arme de catégorie 4 sans autorisation légale.",
    "position": 84
  },
  {
    "category": "ARMES",
    "severity": "Délit mineur",
    "name": "Usage illégal d'arme à feu CAT 1",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Suspension si PPA"
    ],
    "description": "Le fait de faire usage d’une arme à feu de catégorie 1 en dehors des conditions légales prévues par la loi.",
    "position": 85
  },
  {
    "category": "ARMES",
    "severity": "Délit mineur",
    "name": "Usage illégal d'arme à feu CAT 2",
    "fine": {
      "kind": "FIXED",
      "amount": 12500,
      "raw": "$12 500"
    },
    "recidiveDays": 7,
    "jailSeconds": 1200,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Suspension si PPA"
    ],
    "description": "Le fait de faire usage d’une arme à feu de catégorie 2 en dehors des conditions légales prévues par la loi.",
    "position": 86
  },
  {
    "category": "ARMES",
    "severity": "Crime",
    "name": "Usage illégal d'arme à feu CAT 3",
    "fine": {
      "kind": "FIXED",
      "amount": 25000,
      "raw": "$25 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Suspension si PPA"
    ],
    "description": "Le fait de faire usage d’une arme à feu de catégorie 3 en dehors des conditions légales prévues par la loi.",
    "position": 87
  },
  {
    "category": "ARMES",
    "severity": "Crime",
    "name": "Usage illégal d'arme à feu CAT 4",
    "fine": {
      "kind": "FIXED",
      "amount": 50000,
      "raw": "$50 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Suspension si PPA"
    ],
    "description": "Le fait de faire usage d’une arme à feu de catégorie 4 en dehors des conditions légales prévues par la loi.",
    "position": 88
  },
  {
    "category": "ARMES",
    "severity": "Crime",
    "name": "Vente ou trafic d'arme",
    "fine": {
      "kind": "FORMULA",
      "raw": "Cat arme x 1,3"
    },
    "recidiveDays": 30,
    "jailSeconds": 7200,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Le fait de vendre ou de faire circuler illégalement des armes.",
    "position": 89
  },
  {
    "category": "HARCELEMENT MORAL",
    "severity": "Délit mineur",
    "name": "Injure à caractère racial, sexuel ou religeux exclusivement.",
    "fine": {
      "kind": "FIXED",
      "amount": 15000,
      "raw": "$15 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de tenir des propos ou d’émettre des insultes visant spécifiquement une personne ou un groupe en raison de sa race, de son sexe ou de sa religion.",
    "position": 90
  },
  {
    "category": "HARCELEMENT MORAL",
    "severity": "Contravention",
    "name": "Injures publiques répétées",
    "fine": {
      "kind": "FIXED",
      "amount": 3000,
      "raw": "$3 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Propos insultants tenus de manière répétée ou en public, portant atteinte à l’honneur ou à la dignité d’une personne.",
    "position": 91
  },
  {
    "category": "HARCELEMENT MORAL",
    "severity": "Délit mineur",
    "name": "Calomnie",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Accusation mensongère portée contre une personne, en sachant que c’est faux, dans l’intention de lui porter atteinte à sa réputation, son honneur ou sa situation.",
    "position": 92
  },
  {
    "category": "HARCELEMENT MORAL",
    "severity": "Crime",
    "name": "Harcèlement moral ou sexuel",
    "fine": {
      "kind": "FIXED",
      "amount": 100000,
      "raw": "$100 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait d’adopter un comportement répété ou insistant à l’encontre d’une personne, portant atteinte à sa tranquillité ou à sa dignité.",
    "position": 93
  },
  {
    "category": "HARCELEMENT MORAL",
    "severity": "Délit majeur",
    "name": "Diffamation publique",
    "fine": {
      "kind": "FIXED",
      "amount": 20000,
      "raw": "$20 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 1200,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de porter atteinte à l’honneur ou à la réputation d’une personne en publiant ou en diffusant des propos ou des accusations mensongers.",
    "position": 94
  },
  {
    "category": "ESCROQUERIE",
    "severity": "Contravention",
    "name": "Détention d'outil de piratage",
    "fine": {
      "kind": "FIXED",
      "amount": 2500,
      "raw": "$2 500"
    },
    "recidiveDays": null,
    "jailSeconds": null,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie outil"
    ],
    "description": "Le fait de posséder un logiciel ou un matériel conçu pour contourner des systèmes de sécurité informatique ou accéder illégalement à des données.",
    "position": 95
  },
  {
    "category": "ESCROQUERIE",
    "severity": "Délit majeur",
    "name": "Recel d'un bien provenant d'un vol",
    "fine": {
      "kind": "FORMULA",
      "raw": "Estimation / 2"
    },
    "recidiveDays": null,
    "jailSeconds": 1200,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie vol"
    ],
    "description": "Le fait de détenir ou dissimuler un bien qu’on sait issu d’un vol.",
    "position": 96
  },
  {
    "category": "ESCROQUERIE",
    "severity": "Délit majeur",
    "name": "Escroquerie (Tentative)",
    "fine": {
      "kind": "FIXED",
      "amount": 30000,
      "raw": "$30 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de tromper une personne par des manœuvres ou des mensonges (par exemple : faux documents, fausse identité) dans le but d’obtenir un bien ou de l’argent de façon illégale sans y parvenir,",
    "position": 97
  },
  {
    "category": "ESCROQUERIE",
    "severity": "Crime",
    "name": "Escroquerie",
    "fine": {
      "kind": "FIXED",
      "amount": 300000,
      "raw": "$300 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de tromper une personne par des manœuvres ou des mensonges (par exemple : faux documents, fausse identité) dans le but d’obtenir un bien ou de l’argent de façon illégale.",
    "position": 98
  },
  {
    "category": "ESCROQUERIE",
    "severity": "Délit majeur",
    "name": "Abus de confiance",
    "fine": {
      "kind": "FIXED",
      "amount": 15000,
      "raw": "$15 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de détourner un bien ou une somme d’argent qui avait été confié à titre temporaire.",
    "position": 99
  },
  {
    "category": "ESCROQUERIE",
    "severity": "Délit majeur",
    "name": "Usurpation d'identité",
    "fine": {
      "kind": "FIXED",
      "amount": 8000,
      "raw": "$8 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie pièce d'identité"
    ],
    "description": "Le fait de prendre volontairement l’identité d’une autre personne, réelle ou fictive, dans un but frauduleux ou malveillant.",
    "position": 100
  },
  {
    "category": "ESCROQUERIE",
    "severity": "Délit majeur",
    "name": "Usurpation de fonction",
    "fine": {
      "kind": "FIXED",
      "amount": 25000,
      "raw": "$25 000"
    },
    "recidiveDays": 21,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de se faire passer pour un agent public, un professionnel ou un responsable sans en avoir la qualité légale.",
    "position": 101
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Contravention",
    "name": "Port du masque dans l'espace public",
    "fine": {
      "kind": "FIXED",
      "amount": 2000,
      "raw": "$2 000"
    },
    "recidiveDays": 5,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de couvrir une partie ou la totalité de son visage (avec un masque, une cagoule ou autre) dans des lieux publics tels que la rue, les bâtiments de la police, les EMS ou autres espaces similaires, sans motif médical ou autorisation légale.",
    "position": 102
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Contravention",
    "name": "Manifestation illégale",
    "fine": {
      "kind": "FIXED",
      "amount": 3500,
      "raw": "$3 500"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de participer à une manifestation qui n’a pas été déclarée ou autorisée par les autorités compétentes.",
    "position": 103
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Contravention",
    "name": "Appels abusif aux services d'urgence",
    "fine": {
      "kind": "FIXED",
      "amount": 3500,
      "raw": "$3 500"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de contacter volontairement et de façon répétée les services d’urgence sans raison valable.",
    "position": 104
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Contravention",
    "name": "Absence de pièce d'identité",
    "fine": {
      "kind": "FIXED",
      "amount": 1000,
      "raw": "$1 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 1200,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de ne pas présenter de pièce d’identité lors d’un contrôle ou d’une vérification d’identité exigée par la loi.",
    "position": 105
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Délit mineur",
    "name": "Fausse identité/document",
    "fine": {
      "kind": "FIXED",
      "amount": 35000,
      "raw": "$35 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie document"
    ],
    "description": "Le fait de présenter une fausse identité ou d’utiliser un document falsifié pour tromper les autorités ou autrui.",
    "position": 106
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Délit mineur",
    "name": "Outrage à PDAP",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait d’insulter, menacer ou tenir des propos ou comportements irrespectueux envers un agent public dans l’exercice de ses fonctions.",
    "position": 107
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Délit majeur",
    "name": "Rebellion",
    "fine": {
      "kind": "FIXED",
      "amount": 7000,
      "raw": "$7 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait d’opposer une résistance violente ou agressive à un agent dépositaire de l’autorité publique dans l’exercice de ses fonctions.",
    "position": 108
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Délit mineur",
    "name": "Fuite à pied",
    "fine": {
      "kind": "FIXED",
      "amount": 3000,
      "raw": "$3 000"
    },
    "recidiveDays": null,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Fait de prendre la fuite à pied afin d'échapper à un contrôle ou à une interpellation par les forces de l'ordre. NE SE CUMULE PAS AVEC REFUS D'OBTEMPERER",
    "position": 109
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Délit mineur",
    "name": "Refus de contrôle d'identité",
    "fine": {
      "kind": "FIXED",
      "amount": 2000,
      "raw": "$2 000"
    },
    "recidiveDays": null,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de ne pas se soumettre à une vérification d’identité demandée par un agent de l’autorité publique.",
    "position": 110
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Délit majeur",
    "name": "Refus de contrôle barrage",
    "fine": {
      "kind": "FIXED",
      "amount": 25000,
      "raw": "$25 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Refus de se soumettre aux vérifications mises en place lors d’un barrage sécuritaire.",
    "position": 111
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Délit majeur",
    "name": "Refus de contrôle douanier",
    "fine": {
      "kind": "FIXED",
      "amount": 40000,
      "raw": "$40 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Expulsion du territoire",
      "(Si n'est pas natif de LS)"
    ],
    "description": "Refus de se soumettre à un contrôle d’identité, une fouille ou une inspection de véhicule en zone douanière.",
    "position": 112
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Délit majeur",
    "name": "Clandestinité",
    "fine": {
      "kind": "FIXED",
      "amount": 50000,
      "raw": "$50 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Expulsion du territoire"
    ],
    "description": "Le fait de se maintenir sur le territoire de Los Santos sans disposer d’un passeport ou d’un titre de séjour valide, à la suite d’une annulation ou suspension administrative prononcée par une autorité compétente.",
    "position": 113
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Délit majeur",
    "name": "Parjure",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 2400,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de faire une fausse déclaration ou un faux serment devant une autorité judiciaire.",
    "position": 114
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Crime",
    "name": "Non présentation à une convocation judiciaire",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de ne pas se présenter volontairement à une convocation émise par une autorité judiciaire sans justification valable.",
    "position": 115
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Crime",
    "name": "Coupure de bracelet éléctronique",
    "fine": {
      "kind": "FIXED",
      "amount": 30000,
      "raw": "$30 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le faite de couper le bracelet éléctronique et de rompre la liberté conditionnelle.",
    "position": 116
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Délit mineur",
    "name": "Violation de liberté conditionnelle",
    "fine": {
      "kind": "FIXED",
      "amount": 15000,
      "raw": "$15 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Manquement isolé ou non aggravé aux obligations imposées par une liberté conditionnelle, sans volonté manifeste de fuite, de récidive grave ou de contournement du dispositif de surveillance.",
    "position": 117
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Crime",
    "name": "Violation de liberté conditionnelle Aggravée",
    "fine": {
      "kind": "FIXED",
      "amount": 45000,
      "raw": "$45 000"
    },
    "recidiveDays": 12,
    "jailSeconds": 5400,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Manquement grave ou répété aux obligations de la liberté conditionnelle, traduisant une volonté de fuite, de dissimulation, de récidive ou de neutralisation du contrôle exercé par les autorités.",
    "position": 118
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Délit majeur",
    "name": "Entrave à l'exercice de la justice",
    "fine": {
      "kind": "FIXED",
      "amount": 35000,
      "raw": "$35 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 1200,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Fourrière véhicule"
    ],
    "description": "Le fait d’entraver, par des actes ou des manœuvres, le bon déroulement d’une procédure judiciaire.",
    "position": 119
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Délit majeur",
    "name": "Entrave a une intervention médicale",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Fourrière véhicule"
    ],
    "description": "Le fait d’empêcher ou de gêner volontairement une équipe médicale dans l’exécution de ses soins ou interventions.",
    "position": 120
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Délit majeur",
    "name": "Entrave enquête/opération PDAP",
    "fine": {
      "kind": "FIXED",
      "amount": 25000,
      "raw": "$25 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 1200,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Fourrière véhicule"
    ],
    "description": "Le fait de gêner, empêcher ou perturber volontairement l’action d’un agent public dans l’exercice de ses fonctions.",
    "position": 121
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Délit majeur",
    "name": "Abus de pouvoir",
    "fine": {
      "kind": "FIXED",
      "amount": 75000,
      "raw": "$75 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Blâme/mise à pied"
    ],
    "description": "Usage injustifié ou excessif d’un pouvoir ou d’une fonction à des fins personnelles ou hors cadre légal.",
    "position": 122
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Crime",
    "name": "Abus de pouvoir FDO",
    "fine": {
      "kind": "FIXED",
      "amount": 200000,
      "raw": "$200 000"
    },
    "recidiveDays": 31,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Mise à pied/licenciement"
    ],
    "description": "Comportement inapproprié ou autoritaire d’un agent des forces de l’ordre excédant ses attributions.",
    "position": 123
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Crime",
    "name": "Manquement au serment d'agent",
    "fine": {
      "kind": "FIXED",
      "amount": 200000,
      "raw": "$200 000"
    },
    "recidiveDays": 31,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Mise à pied/licenciement"
    ],
    "description": "Manquement aux obligations liées au serment d’agent public, compromettant l’exemplarité ou la neutralité de la fonction.",
    "position": 124
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Crime",
    "name": "Evasion d'un site pénitencier",
    "fine": {
      "kind": "ON_DECISION",
      "raw": "Sur décision"
    },
    "recidiveDays": 14,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de s’enfuir ou tenter de s’enfuir d’un établissement pénitentiaire sans autorisation.",
    "position": 125
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Délit majeur",
    "name": "Tentative de corruption",
    "fine": {
      "kind": "FIXED",
      "amount": 4500,
      "raw": "$4 500"
    },
    "recidiveDays": 14,
    "jailSeconds": 1200,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait d’essayer d’obtenir ou d’offrir des avantages illégaux en échange d’une influence ou d’une faveur.",
    "position": 126
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Crime",
    "name": "Corruption",
    "fine": {
      "kind": "FIXED",
      "amount": 125000,
      "raw": "$125 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait d’obtenir ou d’offrir des avantages illégaux en échange d’une influence ou d’une faveur.",
    "position": 127
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Délit majeur",
    "name": "Faux témoignage",
    "fine": {
      "kind": "FIXED",
      "amount": 50000,
      "raw": "$50 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de mentir volontairement en déposant devant une autorité judiciaire.",
    "position": 128
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Crime",
    "name": "Attaque de convoi pénitentier",
    "fine": {
      "kind": "ON_DECISION",
      "raw": "Sur décision"
    },
    "recidiveDays": 30,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait d’attaquer un convoi transportant des détenus, en utilisant la force ou la menace.",
    "position": 129
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Délit majeur",
    "name": "Insolvabilité judicaire persistante Entre -100k et -300k",
    "fine": {
      "kind": "ON_DECISION",
      "raw": "Sur décision"
    },
    "recidiveDays": 30,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [
      "Saisie des biens"
    ],
    "description": "Le fait de maintenir volontairement un solde financier négatif entre -100,000$ et -300.000$, malgré les rappels officiels, les délais de régularisation et les mesures de saisie prononcées par le DOJ.",
    "position": 130
  },
  {
    "category": "AUTORITE JUDICIAIRE",
    "severity": "Crime",
    "name": "Insolvabilité judiciaire persistante aggravée <-300k",
    "fine": {
      "kind": "ON_DECISION",
      "raw": "Sur décision"
    },
    "recidiveDays": 60,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [
      "Saisie des biens"
    ],
    "description": "Le fait de maintenir volontairement un solde financier négatif excessif supérieur à -300.000$, malgré les rappels officiels, les délais de régularisation et les mesures de saisie prononcées par le DOJ.",
    "position": 131
  },
  {
    "category": "ROUTIER",
    "severity": "Délit mineur",
    "name": "Refus d'obtempérer",
    "fine": {
      "kind": "FIXED",
      "amount": 3000,
      "raw": "$3 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Fourrière véhicule"
    ],
    "description": "SEULEMENT CONDUCTEUR: Le fait pour un conducteur de ne pas se conformer aux injonctions d’un agent de l’autorité publique. Cela comprend déjà les infractions aux codes de la route tel que \"conduite à contre sens\", \"conduite sans feu\", \"excès de vitesse\", \"dégradation\" etc...",
    "position": 132
  },
  {
    "category": "ROUTIER",
    "severity": "Délit mineur",
    "name": "Délit de fuite suite à accident",
    "fine": {
      "kind": "FIXED",
      "amount": 7000,
      "raw": "$7 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Fourrière véhicule"
    ],
    "description": "SEULEMENT CONDUCTEUR: Le fait de s’éloigner volontairement après avoir causé un accident ou été impliqué dans une infraction, sans s’arrêter ni assister les victimes. Cela comprend déjà les infractions aux codes de la route tel que \"conduite à contre sens\", \"conduite sans feu\", \"excès de vitesse\",\"dégradation\" etc...",
    "position": 133
  },
  {
    "category": "ROUTIER",
    "severity": "Délit mineur",
    "name": "Conduite sans permis",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Fourrière véhicule"
    ],
    "description": "Le fait de conduire un véhicule sans détenir le permis de conduire requis par la loi. (Avertissement pour les nouveaux arrivant en ville)",
    "position": 134
  },
  {
    "category": "ROUTIER",
    "severity": "Contravention",
    "name": "Conduite dangereuse",
    "fine": {
      "kind": "FIXED",
      "amount": 2500,
      "raw": "$2 500"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Fourrière véhicule"
    ],
    "description": "Le fait de conduire un véhicule de manière imprudente ou mettant en danger la sécurité des personnes ou des biens.",
    "position": 135
  },
  {
    "category": "ROUTIER",
    "severity": "Délit mineur",
    "name": "Conduite sous influence",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": null,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Fourrière véhicule",
      "Retrait permis"
    ],
    "description": "Le fait de conduire un véhicule en étant sous l’emprise de l’alcool, de drogues ou de substances intoxicantes. Retrait de permis 3 à 7 jours.",
    "position": 136
  },
  {
    "category": "ROUTIER",
    "severity": "Contravention",
    "name": "Excès de vitesse avéré (Constaté par un agent)",
    "fine": {
      "kind": "FIXED",
      "amount": 1500,
      "raw": "$1 500"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "SEULEMENT CONDUCTEUR: Le conducteur circulait à une vitesse excessive constatée par un agent, sans besoin de radar. L'agent doit être dans un véhicule et circuler à vitesse maximal autoriser pour constater la vitesse excessive (dépassement par exemple)",
    "position": 137
  },
  {
    "category": "ROUTIER",
    "severity": "Contravention",
    "name": "Excès de vitesse <= 30 km/h",
    "fine": {
      "kind": "FIXED",
      "amount": 2000,
      "raw": "$2 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de dépasser la limite de vitesse autorisée de 30 kilomètres par heure ou moins. (RADAR A L'ARRET OBLIGATOIRE)",
    "position": 138
  },
  {
    "category": "ROUTIER",
    "severity": "Délit mineur",
    "name": "Excès de vitesse 31 km/h et 60 km/h",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Fourrière véhicule"
    ],
    "description": "Le fait de dépasser la limite de vitesse autorisée de 31 à 60 kilomètres par heure. (RADAR A L'ARRET OBLIGATOIRE)",
    "position": 139
  },
  {
    "category": "ROUTIER",
    "severity": "Délit majeur",
    "name": "Excès de vitesse >= 61 km/h",
    "fine": {
      "kind": "FIXED",
      "amount": 7000,
      "raw": "$7 000"
    },
    "recidiveDays": null,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Fourrière véhicule",
      "Retrait permis"
    ],
    "description": "Le fait de dépasser la limite de vitesse autorisée de 61 kilomètres par heure ou plus. Retrait de permis 3 à 7 jours. (RADAR A L'ARRET OBLIGATOIRE)",
    "position": 140
  },
  {
    "category": "ROUTIER",
    "severity": "Contravention",
    "name": "Utilisation du téléphone en conduisant",
    "fine": {
      "kind": "FIXED",
      "amount": 1000,
      "raw": "$1 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait d’utiliser un téléphone portable en conduisant, ce qui distrait le conducteur et augmente le risque d’accident.",
    "position": 141
  },
  {
    "category": "ROUTIER",
    "severity": "Contravention",
    "name": "Ivresse sur la voie publique",
    "fine": {
      "kind": "FIXED",
      "amount": 2000,
      "raw": "$2 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait d’être en état d’ivresse manifeste dans un lieu public, pouvant troubler l’ordre ou la sécurité.",
    "position": 142
  },
  {
    "category": "ROUTIER",
    "severity": "Contravention",
    "name": "Usage abusif du klaxon/gyrophare",
    "fine": {
      "kind": "FIXED",
      "amount": 1000,
      "raw": "$1 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait d’utiliser de manière excessive ou injustifiée le klaxon ou les gyrophares, perturbant la tranquillité publique.",
    "position": 143
  },
  {
    "category": "ROUTIER",
    "severity": "Contravention",
    "name": "Stationnement gênant",
    "fine": {
      "kind": "FIXED",
      "amount": 1000,
      "raw": "$1 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de se garer de manière à gêner la circulation, l’accès ou la visibilité des autres usagers.",
    "position": 144
  },
  {
    "category": "ROUTIER",
    "severity": "Contravention",
    "name": "Stationnement dangereux",
    "fine": {
      "kind": "FIXED",
      "amount": 2000,
      "raw": "$2 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de se garer dans un endroit présentant un risque pour la sécurité des personnes ou des biens.",
    "position": 145
  },
  {
    "category": "ROUTIER",
    "severity": "Contravention",
    "name": "Conduite sans feux",
    "fine": {
      "kind": "FIXED",
      "amount": 1000,
      "raw": "$1 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de circuler avec un véhicule sans allumer les feux obligatoires, réduisant la visibilité et augmentant les risques d’accident.",
    "position": 146
  },
  {
    "category": "ROUTIER",
    "severity": "Contravention",
    "name": "Circulation dans un véhicule très endommagé",
    "fine": {
      "kind": "FIXED",
      "amount": 2000,
      "raw": "$2 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de conduire un véhicule dont l’état présente un danger pour la sécurité routière ou les autres usagers.",
    "position": 147
  },
  {
    "category": "ROUTIER",
    "severity": "Contravention",
    "name": "Non respect d'un panneau de signalisation",
    "fine": {
      "kind": "FIXED",
      "amount": 1000,
      "raw": "$1 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait d’ignorer ou de ne pas respecter les indications données par les panneaux de signalisation routière.",
    "position": 148
  },
  {
    "category": "ROUTIER",
    "severity": "Contravention",
    "name": "Circulation à contre sens",
    "fine": {
      "kind": "FIXED",
      "amount": 2000,
      "raw": "$2 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de circuler dans le sens interdit de la voie de circulation.",
    "position": 149
  },
  {
    "category": "ROUTIER",
    "severity": "Contravention",
    "name": "Obstruction à un véhicule de secours en urgence",
    "fine": {
      "kind": "FIXED",
      "amount": 15000,
      "raw": "$15 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de gêner ou empêcher le passage d’un véhicule de secours en intervention urgente.",
    "position": 150
  },
  {
    "category": "ROUTIER",
    "severity": "Contravention",
    "name": "Utilisation illégale d'un véhicule personnel pour commerce",
    "fine": {
      "kind": "FIXED",
      "amount": 2000,
      "raw": "$2 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait d’employer un véhicule privé à des fins commerciales sans respecter les règles légales ou administratives en vigueur.",
    "position": 151
  },
  {
    "category": "ROUTIER",
    "severity": "Contravention",
    "name": "Abus d'autorisation temporaire",
    "fine": {
      "kind": "FIXED",
      "amount": 3100,
      "raw": "$3 100"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait d’utiliser une autorisation temporaire au-delà de ses limites ou à des fins non prévues par la loi.",
    "position": 152
  },
  {
    "category": "PROPRIETE",
    "severity": "Contravention",
    "name": "Déclaration frauduleuse de domicile",
    "fine": {
      "kind": "FIXED",
      "amount": 5500,
      "raw": "$5 500"
    },
    "recidiveDays": 7,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de fournir volontairement une fausse adresse de résidence aux autorités ou organismes officiels.",
    "position": 153
  },
  {
    "category": "PROPRIETE",
    "severity": "Contravention",
    "name": "Trouble de voisinnage manifeste",
    "fine": {
      "kind": "FIXED",
      "amount": 4000,
      "raw": "$4 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de causer volontairement des nuisances importantes ou répétées perturbant la tranquillité des voisins.",
    "position": 154
  },
  {
    "category": "PROPRIETE",
    "severity": "Délit mineur",
    "name": "Violation de propriété privée",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de pénétrer sans autorisation dans un lieu privé appartenant à autrui.",
    "position": 155
  },
  {
    "category": "PROPRIETE",
    "severity": "Délit majeur",
    "name": "Violation de propriété privée aggravée",
    "fine": {
      "kind": "FIXED",
      "amount": 20000,
      "raw": "$20 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 1200,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de pénétrer sans autorisation dans un lieu privé en commettant des actes violents, avec effraction ou en groupe.",
    "position": 156
  },
  {
    "category": "PROPRIETE",
    "severity": "Délit majeur",
    "name": "Occupation illégale d'un bien privé",
    "fine": {
      "kind": "FIXED",
      "amount": 20000,
      "raw": "$20 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de s’installer ou d’occuper un bien privé sans le consentement du propriétaire.",
    "position": 157
  },
  {
    "category": "PROPRIETE",
    "severity": "Délit majeur",
    "name": "Refus d'expropriation légale après indemnisation",
    "fine": {
      "kind": "FIXED",
      "amount": 20000,
      "raw": "$20 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de refuser de quitter un bien après une expropriation légalement prononcée et une indemnisation versée.",
    "position": 158
  },
  {
    "category": "PROPRIETE",
    "severity": "Crime",
    "name": "Usurpation de propriété par faux usage de prescription",
    "fine": {
      "kind": "FIXED",
      "amount": 30000,
      "raw": "$30 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de revendiquer illégalement la propriété d’un bien en se fondant sur une fausse prétendue prescription légale.",
    "position": 159
  },
  {
    "category": "AERONEF",
    "severity": "Délit majeur",
    "name": "Vol d'un aéronef",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Fourrière aéronef"
    ],
    "description": "SEULEMENT PILOTE: Le fait de s’approprier ou de prendre illégalement le contrôle d’un aéronef sans autorisation.",
    "position": 160
  },
  {
    "category": "AERONEF",
    "severity": "Délit mineur",
    "name": "Compagnie non homologuée",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait d’exercer une activité commerciale ou de transport sans être officiellement autorisé ou reconnu par les autorités compétentes.",
    "position": 161
  },
  {
    "category": "AERONEF",
    "severity": "Délit mineur",
    "name": "Aéronef non certifié",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Fourrière aéronef"
    ],
    "description": "SEULEMENT PILOTE: Le fait d’utiliser ou de faire voler un aéronef qui ne dispose pas des certifications de sécurité exigées par la réglementation.",
    "position": 162
  },
  {
    "category": "AERONEF",
    "severity": "Délit mineur",
    "name": "Pilotage d'un aéronef sans licence",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Fourrière aéronef"
    ],
    "description": "SEULEMENT PILOTE: Le fait de piloter un aéronef sans détenir la licence ou les autorisations nécessaires.",
    "position": 163
  },
  {
    "category": "AERONEF",
    "severity": "Délit majeur",
    "name": "Crash non déclaré ou fuite après accident",
    "fine": {
      "kind": "FIXED",
      "amount": 20000,
      "raw": "$20 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Fourrière aéronef",
      "Retrait permis"
    ],
    "description": "Le fait de ne pas signaler un accident d’aéronef ou de quitter les lieux sans informer les autorités compétentes.",
    "position": 164
  },
  {
    "category": "AERONEF",
    "severity": "Délit majeur",
    "name": "Pilotage dangereux d'un aéronef",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Fourrière aéronef"
    ],
    "description": "SEULEMENT PILOTE: Le fait de piloter un aéronef de manière imprudente ou mettant en danger la sécurité des personnes ou des biens.",
    "position": 165
  },
  {
    "category": "NAVAL",
    "severity": "Délit mineur",
    "name": "Vol d'une embarcation",
    "fine": {
      "kind": "FIXED",
      "amount": 3000,
      "raw": "$3 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Fourrière bâteau"
    ],
    "description": "SEULEMENT CONDUCTEUR: Le fait de s’approprier illégalement un bateau ou tout autre moyen de navigation sans l’autorisation du propriétaire.",
    "position": 166
  },
  {
    "category": "NAVAL",
    "severity": "Délit mineur",
    "name": "Navigation d'une embarcation sans licence",
    "fine": {
      "kind": "FIXED",
      "amount": 3000,
      "raw": "$3 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Fourrière bâteau"
    ],
    "description": "SEULEMENT CONDUCTEUR: Le fait de piloter un bateau ou une embarcation sans détenir la licence ou l’autorisation requise.",
    "position": 167
  },
  {
    "category": "NAVAL",
    "severity": "Délit mineur",
    "name": "Navigation sans immatriculation",
    "fine": {
      "kind": "FIXED",
      "amount": 1500,
      "raw": "$1 500"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Fourrière bâteau"
    ],
    "description": "SEULEMENT CONDUCTEUR: Le fait de faire naviguer une embarcation sans qu’elle soit immatriculée ou enregistrée conformément à la réglementation.",
    "position": 168
  },
  {
    "category": "NAVAL",
    "severity": "Délit mineur",
    "name": "Navigation dangereuse d'une embarcation",
    "fine": {
      "kind": "FIXED",
      "amount": 2000,
      "raw": "$2 000"
    },
    "recidiveDays": null,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Fourrière bâteau"
    ],
    "description": "SEULEMENT CONDUCTEUR: Le fait de piloter un bateau de manière imprudente, mettant en danger la sécurité des personnes ou des biens.",
    "position": 169
  },
  {
    "category": "NAVAL",
    "severity": "Contravention",
    "name": "Non respect de la priorité de la voile",
    "fine": {
      "kind": "FIXED",
      "amount": 1000,
      "raw": "$1 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "SEULEMENT CONDUCTEUR: Le fait de ne pas céder la priorité à un voilier conformément aux règles de navigation maritime.",
    "position": 170
  },
  {
    "category": "NAVAL",
    "severity": "Contravention",
    "name": "Absence d'équipement de sécurité à bord",
    "fine": {
      "kind": "FIXED",
      "amount": 1000,
      "raw": "$1 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de naviguer sans disposer des équipements de sécurité obligatoires sur l’embarcation.",
    "position": 171
  },
  {
    "category": "PÊCHE",
    "severity": "Contravention",
    "name": "Abandon d'espèce",
    "fine": {
      "kind": "FIXED",
      "amount": 3000,
      "raw": "$3 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie materiel"
    ],
    "description": "Le fait de capturer une espèce aquatique et de l’abandonner volontairement sur place sans la remettre à l’eau, la conserver ou la traiter conformément à la réglementation",
    "position": 172
  },
  {
    "category": "PÊCHE",
    "severity": "Délit mineur",
    "name": "Refus de présenter permis de haute mer",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": 3,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de refuser de montrer les prises effectuées lors d’un contrôle par les Park Rangers ou les forces de l’ordre",
    "position": 173
  },
  {
    "category": "PÊCHE",
    "severity": "Délit mineur",
    "name": "Refus de présenter prise",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": 3,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de refuser de montrer les prises effectuées lors d’un contrôle par les Park Rangers ou les forces de l’ordre",
    "position": 174
  },
  {
    "category": "PÊCHE",
    "severity": "Délit mineur",
    "name": "Pêche avec materiel interdit",
    "fine": {
      "kind": "FIXED",
      "amount": 4000,
      "raw": "$4 000"
    },
    "recidiveDays": 2,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie materiel"
    ],
    "description": "Le fait de pratiquer la pêche en utilisant des outils ou techniques prohibés par la réglementation.",
    "position": 175
  },
  {
    "category": "PÊCHE",
    "severity": "Délit mineur",
    "name": "Pêche dans une zone protégé",
    "fine": {
      "kind": "FIXED",
      "amount": 4000,
      "raw": "$4 000"
    },
    "recidiveDays": 2,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie materiel"
    ],
    "description": "Le fait de pratiquer la pêche dans un secteur interdit afin de préserver l’environnement ou les espèces protégées.",
    "position": 176
  },
  {
    "category": "PÊCHE",
    "severity": "Délit mineur",
    "name": "Pêche d'espèce protégée",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 2,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie materiel",
      "Remise à l'eau"
    ],
    "description": "Le fait de capturer, blesser ou conserver une espèce aquatique bénéficiant d’une protection légale",
    "position": 177
  },
  {
    "category": "PÊCHE",
    "severity": "Délit majeur",
    "name": "Pêche sans permis haute mer",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie materiel"
    ],
    "description": "Le fait de pratiquer la pêche sans être titulaire d’un permis de pêche valide, expiré, suspendu ou inexistant",
    "position": 178
  },
  {
    "category": "PÊCHE",
    "severity": "Délit majeur",
    "name": "Pêche avec materiel de plongée",
    "fine": {
      "kind": "FIXED",
      "amount": 25000,
      "raw": "$25 000"
    },
    "recidiveDays": 2,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie materiel"
    ],
    "description": "Le fait de pratiquer la pêche en utilisant des équipements de plongée, interdits dans certaines zones ou réglementations.",
    "position": 179
  },
  {
    "category": "PÊCHE",
    "severity": "Crime",
    "name": "Permis de pêche en haute mer falscifié",
    "fine": {
      "kind": "FIXED",
      "amount": 20000,
      "raw": "$20 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie materiel",
      "Remise à l'eau"
    ],
    "description": "Le fait de présenter ou d’utiliser un permis de pêche contrefait, modifié ou obtenu frauduleusement",
    "position": 180
  },
  {
    "category": "PÊCHE",
    "severity": "Crime",
    "name": "Braconnage individuel",
    "fine": {
      "kind": "FIXED",
      "amount": 50000,
      "raw": "$50 000"
    },
    "recidiveDays": 21,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme + gibier",
      "Suspenssion permis"
    ],
    "description": "Le fait de pratiquer de manière répétée ou volontaire la chasse illégale en dehors du cadre réglementaire, ou encore de transport d'animaux vivant, sans organisation structurée",
    "position": 181
  },
  {
    "category": "PÊCHE",
    "severity": "Crime",
    "name": "Braconnage organisé",
    "fine": {
      "kind": "FIXED",
      "amount": 75000,
      "raw": "$75 000"
    },
    "recidiveDays": 21,
    "jailSeconds": 4500,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme + gibier",
      "Suspenssion permis"
    ],
    "description": "Le fait de pratiquer de manière répétée ou volontaire la chasse illégale en dehors du cadre réglementaire, ou encore de transport d'animaux vivant, en groupe dans un but lucratif ou de revente",
    "position": 182
  },
  {
    "category": "CHASSE",
    "severity": "Contravention",
    "name": "Utilisation d'un véhicule non adéquate",
    "fine": {
      "kind": "FIXED",
      "amount": 3000,
      "raw": "$3 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait d’utiliser, pour la pratique de la chasse, un véhicule non autorisé par la réglementation en vigueur, notamment un deux-roues ou tout véhicule ne répondant pas aux exigences de sécurité et d’accès aux zones de chasse",
    "position": 183
  },
  {
    "category": "CHASSE",
    "severity": "Contravention",
    "name": "Abandon de carcasse",
    "fine": {
      "kind": "FIXED",
      "amount": 3000,
      "raw": "$3 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de chasser un animal et de laisser volontairement le cadavre de l'animal au sol sans le récuperer ou dépecer",
    "position": 184
  },
  {
    "category": "CHASSE",
    "severity": "Délit mineur",
    "name": "Refus de présenter permis de chasse",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": 3,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de ne pas présenter, lors d’un contrôle, un permis de chasse valide et en cours de validité par les Park Rangers ou les forces de l’ordre",
    "position": 185
  },
  {
    "category": "CHASSE",
    "severity": "Délit mineur",
    "name": "Refus de présenter gibier",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": 3,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de refuser de montrer le gibier abattu lors d’un contrôle effectué par les Park Rangers ou les forces de l’ordre",
    "position": 186
  },
  {
    "category": "CHASSE",
    "severity": "Délit mineur",
    "name": "Defaut de transport sécurisé de l'arme",
    "fine": {
      "kind": "FIXED",
      "amount": 7500,
      "raw": "$7 500"
    },
    "recidiveDays": 4,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de transporter une arme de chasse de manière non sécurisée, notamment chargée, visible ou non conforme aux règles de transport hors zone de chasse",
    "position": 187
  },
  {
    "category": "CHASSE",
    "severity": "Délit majeur",
    "name": "Chasse hors réserve",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de pratiquer la chasse en dehors des zones expressément autorisées par la réglementation en vigueur défini par les Park Rangers",
    "position": 188
  },
  {
    "category": "CHASSE",
    "severity": "Délit majeur",
    "name": "Chasse sans permis",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Le fait de pratiquer la chasse sans détenir l’autorisation administrative requise.",
    "position": 189
  },
  {
    "category": "CHASSE",
    "severity": "Délit majeur",
    "name": "Chasse d'espèce protégée",
    "fine": {
      "kind": "FIXED",
      "amount": 8000,
      "raw": "$8 000"
    },
    "recidiveDays": 3,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie arme + gibier",
      "Suspenssion permis"
    ],
    "description": "Le fait de chasser, blesser ou abattre une espèce bénéficiant d’une protection légale et représentant San Andreas",
    "position": 190
  },
  {
    "category": "CHASSE",
    "severity": "Délit majeur",
    "name": "Utilisation d'arme interdite (chasse)",
    "fine": {
      "kind": "FIXED",
      "amount": 15000,
      "raw": "$15 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [
      "Saisie arme + gibier",
      "Suspenssion permis"
    ],
    "description": "Le fait d’employer une arme non autorisée pour la chasse, en violation de la réglementation en vigueur.",
    "position": 191
  },
  {
    "category": "CHASSE",
    "severity": "Crime",
    "name": "Permis de chasse falscifié",
    "fine": {
      "kind": "FIXED",
      "amount": 20000,
      "raw": "$20 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme + gibier"
    ],
    "description": "Le fait de présenter ou d’utiliser un permis de chasse contrefait, modifié ou obtenu frauduleusement",
    "position": 192
  },
  {
    "category": "CHASSE",
    "severity": "Crime",
    "name": "Mise en danger d'autrui (Chasse)",
    "fine": {
      "kind": "FIXED",
      "amount": 50000,
      "raw": "$50 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 5400,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme + gibier",
      "Suspenssion permis"
    ],
    "description": "Le fait de pratiquer la chasse d’une manière susceptible de mettre en danger la vie ou l’intégrité physique d’autrui, notamment par des tirs à proximité de personnes, routes ou habitations",
    "position": 193
  },
  {
    "category": "CHASSE",
    "severity": "Crime",
    "name": "Chasse d'espèce protégée répété",
    "fine": {
      "kind": "FIXED",
      "amount": 25000,
      "raw": "$25 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme + gibier",
      "Suspenssion permis"
    ],
    "description": "Le fait de chasser, blesser ou abattre une espèce bénéficiant d’une protection légale et représentant San Andreas de manière répété (3 infractions dans le casier)",
    "position": 194
  },
  {
    "category": "CHASSE",
    "severity": "Crime",
    "name": "Braconnage individuel",
    "fine": {
      "kind": "FIXED",
      "amount": 50000,
      "raw": "$50 000"
    },
    "recidiveDays": 21,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme + gibier",
      "Suspenssion permis"
    ],
    "description": "Le fait de pratiquer de manière répétée ou volontaire la chasse illégale en dehors du cadre réglementaire, ou encore de transport d'animaux vivant, sans organisation structurée",
    "position": 195
  },
  {
    "category": "CHASSE",
    "severity": "Crime",
    "name": "Braconnage organisé",
    "fine": {
      "kind": "FIXED",
      "amount": 75000,
      "raw": "$75 000"
    },
    "recidiveDays": 21,
    "jailSeconds": 4500,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme + gibier",
      "Suspenssion permis"
    ],
    "description": "Le fait de pratiquer de manière répétée ou volontaire la chasse illégale en dehors du cadre réglementaire, ou encore de transport d'animaux vivant, en groupe dans un but lucratif ou de revente",
    "position": 196
  },
  {
    "category": "DESTRUCTION ET VANDALISME",
    "severity": "Délit mineur",
    "name": "Dégradation et vandalisme",
    "fine": {
      "kind": "FIXED",
      "amount": 8000,
      "raw": "$8 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de causer volontairement des dommages à des biens publics ou privés.",
    "position": 197
  },
  {
    "category": "DESTRUCTION ET VANDALISME",
    "severity": "Crime",
    "name": "Incendie volontaire",
    "fine": {
      "kind": "FIXED",
      "amount": 25000,
      "raw": "$25 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de provoquer intentionnellement un feu pouvant causer des dégâts matériels ou mettre en danger des personnes.",
    "position": 198
  },
  {
    "category": "ATTEINTE A LA VIE",
    "severity": "Délit majeur",
    "name": "Non assistance à personne en danger",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de ne pas porter secours à une personne en situation de danger alors que l’on peut le faire sans risque pour soi-même.",
    "position": 199
  },
  {
    "category": "ATTEINTE A LA VIE",
    "severity": "Crime",
    "name": "Tentative de meurtre",
    "fine": {
      "kind": "FIXED",
      "amount": 250000,
      "raw": "$250 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 7200,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Le fait de vouloir volontairement donner la mort à une personne sans y parvenir.",
    "position": 200
  },
  {
    "category": "ATTEINTE A LA VIE",
    "severity": "Crime",
    "name": "Tentative de meurtre sur PDAP",
    "fine": {
      "kind": "FIXED",
      "amount": 350000,
      "raw": "$350 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 10800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Le fait de vouloir volontairement donner la mort à un agent public (policier, gendarme, etc.) dans l’exercice de ses fonctions, sans y parvenir.",
    "position": 201
  },
  {
    "category": "ATTEINTE A LA VIE",
    "severity": "Crime",
    "name": "Meurtre",
    "fine": {
      "kind": "FIXED",
      "amount": 500000,
      "raw": "$500 000"
    },
    "recidiveDays": 30,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Le fait de donner volontairement la mort à une personne.",
    "position": 202
  },
  {
    "category": "ATTEINTE A LA VIE",
    "severity": "Crime",
    "name": "Meurtre sur PDAP",
    "fine": {
      "kind": "FIXED",
      "amount": 500000,
      "raw": "$500 000"
    },
    "recidiveDays": 30,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Le fait de donner volontairement la mort à un agent public (policier, gendarme, etc.) dans l’exercice de ses fonctions.",
    "position": 203
  },
  {
    "category": "ATTEINTE A LA VIE",
    "severity": "Crime",
    "name": "Homicide Involontaire",
    "fine": {
      "kind": "FIXED",
      "amount": 150000,
      "raw": "$150 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 7200,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Le fait de causer la mort d’une personne par imprudence, négligence ou maladresse, sans intention de la tuer.",
    "position": 204
  },
  {
    "category": "ATTEINTE A LA VIE",
    "severity": "Crime",
    "name": "Assassinat",
    "fine": {
      "kind": "FIXED",
      "amount": 600000,
      "raw": "$600 000"
    },
    "recidiveDays": 30,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Le fait de donner volontairement la mort à une personne avec préméditation ou guet-apens.",
    "position": 205
  },
  {
    "category": "ATTEINTE A LA VIE",
    "severity": "Crime",
    "name": "Commanditer un assassinat",
    "fine": {
      "kind": "FIXED",
      "amount": 250000,
      "raw": "$250 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 10800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de payer ou ordonner la mort préméditée d’une personne par un tiers.",
    "position": 206
  },
  {
    "category": "ATTEINTE A LA SURETE DE L'ETAT",
    "severity": "Délit majeur",
    "name": "Incitation à la haine",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 7,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de provoquer publiquement la haine ou la violence envers une personne ou un groupe en raison de leur origine, religion, sexe ou autre caractéristique.",
    "position": 207
  },
  {
    "category": "ATTEINTE A LA SURETE DE L'ETAT",
    "severity": "Crime",
    "name": "Menace d'un acte terroriste",
    "fine": {
      "kind": "FIXED",
      "amount": 35000,
      "raw": "$35 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de proférer des menaces crédibles visant à commettre un acte terroriste.",
    "position": 208
  },
  {
    "category": "ATTEINTE A LA SURETE DE L'ETAT",
    "severity": "Crime",
    "name": "Tentative d'un acte terroriste",
    "fine": {
      "kind": "FIXED",
      "amount": 500000,
      "raw": "$500 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait d’essayer de commettre un acte terroriste sans y parvenir.",
    "position": 209
  },
  {
    "category": "ATTEINTE A LA SURETE DE L'ETAT",
    "severity": "Crime",
    "name": "Acte de terrorisme",
    "fine": {
      "kind": "FIXED",
      "amount": 800000,
      "raw": "$800 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 7200,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de commettre des actes violents visant à semer la peur ou déstabiliser la société pour des motifs politiques, religieux ou idéologiques.",
    "position": 210
  },
  {
    "category": "ATTEINTE A LA SURETE DE L'ETAT",
    "severity": "Crime",
    "name": "Rébellion armée",
    "fine": {
      "kind": "FIXED",
      "amount": 500000,
      "raw": "$500 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 10800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de s’opposer par la force armée à l’autorité établie ou aux forces de l’ordre.",
    "position": 211
  },
  {
    "category": "ATTEINTE A LA SURETE DE L'ETAT",
    "severity": "Crime",
    "name": "Espionnage",
    "fine": {
      "kind": "FIXED",
      "amount": 500000,
      "raw": "$500 000"
    },
    "recidiveDays": 30,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de recueillir, transmettre ou utiliser des informations confidentielles au profit d’une puissance étrangère ou d’un tiers, sans autorisation.",
    "position": 212
  },
  {
    "category": "ATTEINTE A LA SURETE DE L'ETAT",
    "severity": "Crime",
    "name": "Haute trahison",
    "fine": {
      "kind": "FIXED",
      "amount": 3000000,
      "raw": "$3 000 000"
    },
    "recidiveDays": 30,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait d’agir contre les intérêts fondamentaux de l’État, notamment en aidant un ennemi ou en compromettant la sécurité nationale.",
    "position": 213
  },
  {
    "category": "HAUTES AUTORITES POLITIQUE (HAP)",
    "severity": "Délit majeur",
    "name": "Menace envers HAP",
    "fine": {
      "kind": "FIXED",
      "amount": 20000,
      "raw": "$20 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de proférer des menaces verbales, écrites ou numériques à l’encontre d’un représentant de haute autorité politique, pouvant faire craindre pour son intégrité physique ou sa sécurité.",
    "position": 214
  },
  {
    "category": "HAUTES AUTORITES POLITIQUE (HAP)",
    "severity": "Crime",
    "name": "Agression envers HAP",
    "fine": {
      "kind": "FIXED",
      "amount": 225000,
      "raw": "$225 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Usage volontaire de violence physique à l’encontre d’un HAP, sans emploi d’arme ou d’objet dangereux.",
    "position": 215
  },
  {
    "category": "HAUTES AUTORITES POLITIQUE (HAP)",
    "severity": "Crime",
    "name": "Agression armé envers HAP",
    "fine": {
      "kind": "FIXED",
      "amount": 300000,
      "raw": "$300 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 7200,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Usage de toute arme ou objet dangereux dans un acte de violence physique à l’encontre d’un HAP, même sans blessure grave.",
    "position": 216
  },
  {
    "category": "HAUTES AUTORITES POLITIQUE (HAP)",
    "severity": "Crime",
    "name": "Tentative de meutrre envers HAP",
    "fine": {
      "kind": "FIXED",
      "amount": 500000,
      "raw": "$500 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 10800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Acte volontaire visant à attenter à la vie d’un HAP, sans que la mort ne soit survenue. Toute attaque dirigée à cette fin, avec préméditation ou non, relève de cette infraction.",
    "position": 217
  },
  {
    "category": "HAUTES AUTORITES POLITIQUE (HAP)",
    "severity": "Crime",
    "name": "Meurtre envers HAP",
    "fine": {
      "kind": "FIXED",
      "amount": 600000,
      "raw": "$600 000"
    },
    "recidiveDays": null,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Homicide volontaire entraînant la mort d’un HAP. L’infraction est considérée comme un crime d’État, indépendamment des circonstances.",
    "position": 218
  },
  {
    "category": "HAUTES AUTORITES POLITIQUE (HAP)",
    "severity": "Crime",
    "name": "Enlèvement HAP",
    "fine": {
      "kind": "FIXED",
      "amount": 200000,
      "raw": "$200 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 5400,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Fait de capturer, transporter ou retenir un HAP contre sa volonté, avec ou sans demande de rançon, dans le but de nuire, d’exercer une pression ou de compromettre l’intégrité institutionnelle.",
    "position": 219
  },
  {
    "category": "HAUTES AUTORITES POLITIQUE (HAP)",
    "severity": "Crime",
    "name": "Séquestration HAP",
    "fine": {
      "kind": "FIXED",
      "amount": 200000,
      "raw": "$200 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 5400,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [
      "Saisie arme"
    ],
    "description": "Maintien illégal et prolongé d’un HAP dans un lieu contre sa volonté, sans déplacement, dans un contexte de menace, de chantage ou d’intimidation.",
    "position": 220
  },
  {
    "category": "ENVIRONNEMENT",
    "severity": "Contravention",
    "name": "Non-respect de la coopération entre autorités",
    "fine": {
      "kind": "FIXED",
      "amount": 3000,
      "raw": "$3 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de ne pas respecter ou entraver la collaboration entre différentes institutions ou forces de l’ordre dans l’exercice de leurs missions.",
    "position": 221
  },
  {
    "category": "ENVIRONNEMENT",
    "severity": "Contravention",
    "name": "Obstruction à l'alterne citoyenne",
    "fine": {
      "kind": "FIXED",
      "amount": 2000,
      "raw": "$2 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait d’empêcher ou de gêner volontairement les citoyens ou associations dans leur droit d’alerter, proposer ou participer à des consultations publiques sur des projets ayant un impact écologique.",
    "position": 222
  },
  {
    "category": "ENVIRONNEMENT",
    "severity": "Contravention",
    "name": "Camping sauvage",
    "fine": {
      "kind": "FIXED",
      "amount": 2500,
      "raw": "$2 500"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Installation ou occupation d’un campement en zone non autorisée par les autorités compétentes.",
    "position": 223
  },
  {
    "category": "ENVIRONNEMENT",
    "severity": "Délit mineur",
    "name": "Infraction en zone protégée",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de commettre une infraction dans un secteur soumis à des règles spéciales de protection environnementale ou patrimoniale.",
    "position": 224
  },
  {
    "category": "ENVIRONNEMENT",
    "severity": "Délit mineur",
    "name": "Circulation motorisée ou camping sans autorisation",
    "fine": {
      "kind": "FIXED",
      "amount": 2500,
      "raw": "$2 500"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de circuler avec un véhicule motorisé ou d’installer un campement dans une zone où ces activités sont interdites sans autorisation préalable.",
    "position": 225
  },
  {
    "category": "ENVIRONNEMENT",
    "severity": "Contravention",
    "name": "Dépôts sauvages",
    "fine": {
      "kind": "FIXED",
      "amount": 3000,
      "raw": "$3 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de jeter, déposer ou abandonner des déchets dans des lieux non prévus à cet effet, sans autorisation.",
    "position": 226
  },
  {
    "category": "ENVIRONNEMENT",
    "severity": "Délit mineur",
    "name": "Transport ou traitement illégal de déchets",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de déplacer ou de traiter des déchets sans respecter les règles légales en vigueur.",
    "position": 227
  },
  {
    "category": "ENVIRONNEMENT",
    "severity": "Délit majeur",
    "name": "Décharge sauvage ou pollution industrielle",
    "fine": {
      "kind": "FIXED",
      "amount": 7500,
      "raw": "$7 500"
    },
    "recidiveDays": null,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait de rejeter ou d’abandonner des déchets ou polluants dans l’environnement sans autorisation, causant une pollution nuisible.",
    "position": 228
  },
  {
    "category": "ENVIRONNEMENT",
    "severity": "Délit majeur",
    "name": "Altération illégale des eaux",
    "fine": {
      "kind": "FIXED",
      "amount": 25000,
      "raw": "$25 000"
    },
    "recidiveDays": null,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de modifier, polluer ou détourner des eaux (rivières, nappes phréatiques, etc.) sans respect des normes environnementales.",
    "position": 229
  },
  {
    "category": "ENVIRONNEMENT",
    "severity": "Délit mineur",
    "name": "Privation d'accès à l'eau potable",
    "fine": {
      "kind": "FIXED",
      "amount": 8000,
      "raw": "$8 000"
    },
    "recidiveDays": null,
    "jailSeconds": 1200,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": "Le fait d’empêcher ou de restreindre illégalement l’accès à une source d’eau potable à une personne ou à un groupe.",
    "position": 230
  },
  {
    "category": "ENVIRONNEMENT",
    "severity": "Crime",
    "name": "Pollution des eaux",
    "fine": {
      "kind": "FIXED",
      "amount": 20000,
      "raw": "$20 000"
    },
    "recidiveDays": null,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de contaminer les eaux (rivières, lacs, nappes souterraines) par des substances nocives, mettant en danger la santé et l’environnement.",
    "position": 231
  },
  {
    "category": "ENVIRONNEMENT",
    "severity": "Crime",
    "name": "Atteinte grave ou irréversible à l'environnement",
    "fine": {
      "kind": "FIXED",
      "amount": 45000,
      "raw": "$45 000"
    },
    "recidiveDays": null,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de causer des dommages importants et durables à un écosystème ou à la biodiversité.",
    "position": 232
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": "Délit mineur",
    "name": "Exercice d'une activité sans déclaration",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": null,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de pratiquer une activité commerciale ou professionnelle sans l’avoir déclarée aux autorités compétentes.",
    "position": 233
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": "Délit majeur",
    "name": "Non-obtention d'un EIN ou fraude fiscale initiale",
    "fine": {
      "kind": "FIXED",
      "amount": 8000,
      "raw": "$8 000"
    },
    "recidiveDays": null,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de ne pas obtenir un numéro d’identification fiscale (EIN) obligatoire ou de fournir de fausses informations lors de la déclaration fiscale initiale.",
    "position": 234
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": "Délit majeur",
    "name": "Fausse déclaration d'identité fiscal (EIN)",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": null,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de fournir de fausses informations ou d’utiliser une fausse identité lors de l’obtention d’un numéro d’identification fiscale.",
    "position": 235
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": "Contravention",
    "name": "Rupture abusive d'un contrat commercial",
    "fine": {
      "kind": "FIXED",
      "amount": 15000,
      "raw": "$15 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de mettre fin à un contrat commercial sans motif légitime ou sans respecter les conditions prévues.",
    "position": 236
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": "Délit mineur",
    "name": "Facturation fictive ou falsification de devis",
    "fine": {
      "kind": "FIXED",
      "amount": 6000,
      "raw": "$6 000"
    },
    "recidiveDays": null,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait d’émettre des factures ou devis faux ou trompeurs dans le but de frauder ou tromper un client ou une autorité.",
    "position": 237
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": "Délit mineur",
    "name": "Embauche non déclaré ou travail dissimulé",
    "fine": {
      "kind": "PER_UNIT",
      "amount": 20000,
      "unit": "employé",
      "raw": "$20 000/employé"
    },
    "recidiveDays": null,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait d’employer une personne sans la déclarer aux organismes sociaux ou fiscaux, pour éviter les cotisations ou obligations légales.",
    "position": 238
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": "Délit majeur",
    "name": "Fausse constitution de société/capital fictif",
    "fine": {
      "kind": "FIXED",
      "amount": 15000,
      "raw": "$15 000"
    },
    "recidiveDays": null,
    "jailSeconds": 3600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de créer une société avec de fausses informations, notamment en déclarant un capital inexistant ou fictif.",
    "position": 239
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": "Délit majeur",
    "name": "Abus de bien sociaux",
    "fine": {
      "kind": "FIXED",
      "amount": 100000,
      "raw": "$100 000"
    },
    "recidiveDays": null,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait d’utiliser les ressources ou biens d’une entreprise à des fins personnelles ou contraires à l’intérêt de la société.",
    "position": 240
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": "Délit majeur",
    "name": "Contrefaçon de document commerciaux",
    "fine": {
      "kind": "FIXED",
      "amount": 30000,
      "raw": "$30 000"
    },
    "recidiveDays": null,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de falsifier ou reproduire frauduleusement des documents liés à une activité commerciale.",
    "position": 241
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": "Contravention",
    "name": "Non-renouvellement volontaire de licence expiré",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de continuer une activité nécessitant une licence après son expiration, sans procéder à son renouvellement.",
    "position": 242
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": "Contravention",
    "name": "Non-respect des normes de sécurité, hygiène ou salubrité",
    "fine": {
      "kind": "FIXED",
      "amount": 30000,
      "raw": "$30 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de ne pas se conformer aux règles obligatoires garantissant la sécurité, l’hygiène ou la salubrité dans un établissement ou une activité.",
    "position": 243
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": "Délit mineur",
    "name": "Exercice d'une activité réglementée sans licence",
    "fine": {
      "kind": "FIXED",
      "amount": 50000,
      "raw": "$50 000"
    },
    "recidiveDays": null,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de pratiquer une activité soumise à autorisation ou licence sans en avoir obtenu légalement le droit.",
    "position": 244
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": "Délit mineur",
    "name": "Obstruction à un contrôle ou refus d'inespection",
    "fine": {
      "kind": "FIXED",
      "amount": 20000,
      "raw": "$20 000"
    },
    "recidiveDays": null,
    "jailSeconds": 600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de gêner, entraver ou refuser l’accès lors d’un contrôle ou d’une inspection officielle.",
    "position": 245
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": "Délit majeur",
    "name": "Non-respect d'un jugement du tribunal",
    "fine": {
      "kind": "FIXED",
      "amount": 100000,
      "raw": "$100 000"
    },
    "recidiveDays": null,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de ne pas se conformer aux décisions rendues par une autorité judiciaire.",
    "position": 246
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": "Délit majeur",
    "name": "Falsification de bilan ou obstruction à une procédure de faillite",
    "fine": {
      "kind": "ON_DECISION",
      "raw": "Sur décision"
    },
    "recidiveDays": null,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de modifier frauduleusement les comptes d’une entreprise ou de gêner le bon déroulement d’une procédure de faillite.",
    "position": 247
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": "Crime",
    "name": "Activité écran pour organisation criminelle",
    "fine": {
      "kind": "FIXED",
      "amount": 75000,
      "raw": "$75 000"
    },
    "recidiveDays": null,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de créer ou utiliser une entreprise fictive pour dissimuler des activités illégales liées à une organisation criminelle.",
    "position": 248
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": "Crime",
    "name": "Détournement de fonds",
    "fine": {
      "kind": "FORMULA",
      "raw": "X1,5 + remboursement"
    },
    "recidiveDays": null,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de s’approprier illégalement des sommes d’argent ou des biens appartenant à une organisation ou entreprise.",
    "position": 249
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": "Crime",
    "name": "Détournement de bien public",
    "fine": {
      "kind": "FORMULA",
      "raw": "x2"
    },
    "recidiveDays": null,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de s’approprier ou d’utiliser illégalement des biens appartenant à une administration ou à une collectivité publique.",
    "position": 250
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": "Crime",
    "name": "Investissement dans une activité criminelle",
    "fine": {
      "kind": "FORMULA",
      "raw": "x1.75"
    },
    "recidiveDays": null,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de placer des fonds dans une activité illégale dans le but d’en tirer profit ou de la financer.",
    "position": 251
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": null,
    "name": "Dissimulation d'actifs ou passsifs",
    "fine": {
      "kind": "FIXED",
      "amount": 125000,
      "raw": "$125 000"
    },
    "recidiveDays": null,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de cacher volontairement des biens, ressources ou dettes pour tromper les autorités ou partenaires financiers.",
    "position": 252
  },
  {
    "category": "AFFAIRE ET ENTREPRISE",
    "severity": "Crime",
    "name": "Blanchiment d'argent",
    "fine": {
      "kind": "FORMULA",
      "raw": "$50 000 + (x2)"
    },
    "recidiveDays": null,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de dissimuler l’origine illégale de fonds pour les rendre apparemment licites.",
    "position": 253
  },
  {
    "category": "CIVIL ET HERITAGE",
    "severity": "Délit mineur",
    "name": "Violation d'un droit de visite",
    "fine": {
      "kind": "FIXED",
      "amount": 2500,
      "raw": "$2 500"
    },
    "recidiveDays": 14,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de ne pas respecter les conditions légales permettant à une personne de voir ou garder contact avec un enfant ou un proche.",
    "position": 254
  },
  {
    "category": "CIVIL ET HERITAGE",
    "severity": "Délit majeur",
    "name": "Non respect d'une décision de divorce",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 900,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de ne pas se conformer aux termes fixés par le jugement de divorce, notamment en matière de garde, pension ou droits de visite.",
    "position": 255
  },
  {
    "category": "CIVIL ET HERITAGE",
    "severity": "Contravention",
    "name": "Inexécution d'une obligation contractuelle",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 14,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de ne pas respecter les engagements pris dans un contrat entre parties.",
    "position": 256
  },
  {
    "category": "CIVIL ET HERITAGE",
    "severity": "Délit majeur",
    "name": "Refus de partage d'héritage légal",
    "fine": {
      "kind": "FIXED",
      "amount": 125000,
      "raw": "$125 000"
    },
    "recidiveDays": null,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de ne pas respecter la répartition prévue par la loi des biens d’une succession entre les héritiers.",
    "position": 257
  },
  {
    "category": "CIVIL ET HERITAGE",
    "severity": "Délit majeur",
    "name": "Abandon de contribution parentale",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de ne pas verser les sommes dues pour l’entretien ou l’éducation d’un enfant, alors que c’est une obligation légale.",
    "position": 258
  },
  {
    "category": "CIVIL ET HERITAGE",
    "severity": "Crime",
    "name": "Falsification d'acte d'état civil",
    "fine": {
      "kind": "FIXED",
      "amount": 15000,
      "raw": "$15 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 5400,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de modifier ou contrefaire un document officiel d’état civil (naissance, mariage, décès, etc.) dans le but de tromper.",
    "position": 259
  },
  {
    "category": "CIVIL ET HERITAGE",
    "severity": "Crime",
    "name": "Fabrication ou usage de faux testament",
    "fine": {
      "kind": "FIXED",
      "amount": 125000,
      "raw": "$125 000"
    },
    "recidiveDays": 30,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de créer ou d’utiliser un testament falsifié pour influencer la répartition d’une succession.",
    "position": 260
  },
  {
    "category": "TRAVAIL",
    "severity": "Délit majeur",
    "name": "Travail dissimulé",
    "fine": {
      "kind": "FIXED",
      "amount": 15000,
      "raw": "$15 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait d’exercer ou de faire exercer une activité professionnelle sans la déclarer aux autorités compétentes.",
    "position": 261
  },
  {
    "category": "TRAVAIL",
    "severity": "Délit majeur",
    "name": "Discrimination à l'embauche ou en entreprise",
    "fine": {
      "kind": "FIXED",
      "amount": 8000,
      "raw": "$8 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de traiter une personne de manière défavorable lors de l’embauche ou dans le cadre professionnel en raison de son origine, sexe, âge, religion, handicap ou autre caractéristique protégée.",
    "position": 262
  },
  {
    "category": "TRAVAIL",
    "severity": "Contravention",
    "name": "Période d'essai non conforme",
    "fine": {
      "kind": "FIXED",
      "amount": 1500,
      "raw": "$1 500"
    },
    "recidiveDays": 30,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de fixer ou de prolonger une période d’essai en violation des règles légales ou contractuelles.",
    "position": 263
  },
  {
    "category": "TRAVAIL",
    "severity": "Contravention",
    "name": "Clause abusive",
    "fine": {
      "kind": "FIXED",
      "amount": 1500,
      "raw": "$1 500"
    },
    "recidiveDays": 30,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Une disposition d’un contrat qui crée un déséquilibre important au détriment d’une partie, et qui est donc réputée non valable.",
    "position": 264
  },
  {
    "category": "TRAVAIL",
    "severity": "Délit majeur",
    "name": "Violation d'une clause de confidentialité",
    "fine": {
      "kind": "FIXED",
      "amount": 30000,
      "raw": "$30 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de divulguer des informations confidentielles protégées par un contrat ou un accord.",
    "position": 265
  },
  {
    "category": "TRAVAIL",
    "severity": "Délit majeur",
    "name": "Abandon de poste",
    "fine": {
      "kind": "FIXED",
      "amount": 10000,
      "raw": "$10 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait pour un salarié de cesser son travail sans justification ni prévenir son employeur.",
    "position": 266
  },
  {
    "category": "TRAVAIL",
    "severity": "Délit mineur",
    "name": "Omission de déclaration d'ATT",
    "fine": {
      "kind": "FIXED",
      "amount": 2000,
      "raw": "$2 000"
    },
    "recidiveDays": 14,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de ne pas informer l’employeur ou les organismes compétents d’un arrêt de travail dans les délais légaux.",
    "position": 267
  },
  {
    "category": "TRAVAIL",
    "severity": "Délit mineur",
    "name": "Non versement du salaire",
    "fine": {
      "kind": "PER_UNIT",
      "amount": 10000,
      "unit": "J",
      "raw": "$10 000/J"
    },
    "recidiveDays": 14,
    "jailSeconds": 1200,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait pour un employeur de ne pas payer le salaire dû à un salarié selon les termes du contrat de travail.",
    "position": 268
  },
  {
    "category": "TRAVAIL",
    "severity": "Délit majeur",
    "name": "Entrave à la liberté syndicale",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 1800,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait d’empêcher ou de gêner l’exercice du droit des salariés à constituer ou rejoindre un syndicat.",
    "position": 269
  },
  {
    "category": "TRAVAIL",
    "severity": "Délit mineur",
    "name": "Refus injustifié de négociation collective",
    "fine": {
      "kind": "FIXED",
      "amount": 5000,
      "raw": "$5 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 0,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait pour un employeur de refuser sans raison valable de négocier avec les représentants des salariés.",
    "position": 270
  },
  {
    "category": "TRAVAIL",
    "severity": "Délit mineur",
    "name": "Refus de coopération avec l'inspection du travail",
    "fine": {
      "kind": "FIXED",
      "amount": 20000,
      "raw": "$20 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 600,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de gêner, entraver ou refuser l’accès aux agents de l’inspection du travail lors de leurs contrôles.",
    "position": 271
  },
  {
    "category": "TRAVAIL",
    "severity": "Crime",
    "name": "Travail dissimulé organisé (récidive ou reseau)",
    "fine": {
      "kind": "FIXED",
      "amount": 275000,
      "raw": "$275 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 2700,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de mettre en place ou de participer à un système organisé visant à dissimuler des activités professionnelles non déclarées, souvent de manière répétée ou en réseau.",
    "position": 272
  },
  {
    "category": "TRAVAIL",
    "severity": "Crime",
    "name": "Harcelement moral ou sexuel (entreprise)",
    "fine": {
      "kind": "FIXED",
      "amount": 75000,
      "raw": "$75 000"
    },
    "recidiveDays": 30,
    "jailSeconds": 3000,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait d’imposer de manière répétée des comportements ou paroles humiliantes, intimidantes ou à connotation sexuelle à un salarié, portant atteinte à sa dignité ou à sa santé.",
    "position": 273
  },
  {
    "category": "TRAVAIL",
    "severity": "Crime",
    "name": "Mise en danger délibérée des salariés",
    "fine": {
      "kind": "FIXED",
      "amount": 500000,
      "raw": "$500 000"
    },
    "recidiveDays": 30,
    "jailSeconds": null,
    "jailOnDecision": true,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait pour un employeur de ne pas prendre les mesures nécessaires pour protéger la sécurité ou la santé des salariés, exposant volontairement ces derniers à un risque.",
    "position": 274
  },
  {
    "category": "ELECTION",
    "severity": "Crime",
    "name": "Fraude électorale",
    "fine": {
      "kind": "ON_DECISION",
      "raw": "Sur décision"
    },
    "recidiveDays": null,
    "jailSeconds": 7200,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait de manipuler un scrutin ou un processus électoral pour fausser les résultats.",
    "position": 275
  },
  {
    "category": "ELECTION",
    "severity": "Crime",
    "name": "Violation de procédure électorale",
    "fine": {
      "kind": "ON_DECISION",
      "raw": "Sur décision"
    },
    "recidiveDays": null,
    "jailSeconds": 7200,
    "jailOnDecision": false,
    "dojRequest": false,
    "sanctions": [],
    "description": null,
    "position": 276
  },
  {
    "category": "ELECTION",
    "severity": "Crime",
    "name": "Influence illégale des électeurs",
    "fine": {
      "kind": "ON_DECISION",
      "raw": "Sur décision"
    },
    "recidiveDays": null,
    "jailSeconds": 7200,
    "jailOnDecision": false,
    "dojRequest": true,
    "sanctions": [],
    "description": "Le fait d’exercer des pressions ou de faire des promesses pour altérer le vote libre des électeurs.",
    "position": 277
  }
] as const;
