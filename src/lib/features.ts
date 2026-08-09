// Bascules de fonctionnalités du site.
//
// Le MDT opérationnel (dossiers, dispatch, casiers, etc.) est ACTIF : le site
// propose de nouveau le choix entre le MDT et le portail LSPA.
//
// Pour le désactiver (n'ouvrir que la LSPA), définir VITE_MDT_ENABLED=false au
// build.
export const MDT_ENABLED = import.meta.env.VITE_MDT_ENABLED !== "false";

// Cohabitation avec le NexusMDT du serveur RP : celui-ci garde l'autorité sur
// les données citoyennes et judiciaires. On DÉSACTIVE donc ici (sans supprimer)
// certaines fonctions. Repasser une valeur à `true` pour réactiver.
//
//  - service            : prise de service + page Services
//  - dispatch           : dispatch + création de patrouille (topbar + page)
//  - citizenWrite       : création / modification des fiches citoyens
//  - judicialWrite      : création de casiers / dossiers d'arrestation
//  - ficheRenseignement : fiche de renseignement agent
//
// Les fiches citoyens et l'historique judiciaire restent CONSULTABLES (lecture
// seule) : seule l'écriture bascule vers le NexusMDT.
export const FEATURES = {
  service: false,
  dispatch: false,
  citizenWrite: false,
  judicialWrite: false,
  ficheRenseignement: false,
} as const;

// Message affiché quand une action d'écriture citoyenne/judiciaire est tentée.
export const NEXUS_MSG =
  "Pour la création et la modification de citoyen, ou la création de rapports d'arrestations, rendez-vous sur le NexusMDT.";
