// Bascules de fonctionnalités du site.
//
// Le MDT opérationnel (dossiers, dispatch, casiers, etc.) est pour l'instant
// DÉSACTIVÉ : le code reste en place mais le site ouvre uniquement le portail
// LSPA. Aucun écran de choix, aucune route MDT accessible, aucun lien visible.
//
// Pour réactiver le MDT : repasser cette constante à true, ou définir la
// variable d'environnement VITE_MDT_ENABLED=true au build.
export const MDT_ENABLED = import.meta.env.VITE_MDT_ENABLED === "true";
