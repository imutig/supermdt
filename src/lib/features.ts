// Bascules de fonctionnalités du site.
//
// Le MDT opérationnel (dossiers, dispatch, casiers, etc.) est ACTIF : le site
// propose de nouveau le choix entre le MDT et le portail LSPA.
//
// Pour le désactiver (n'ouvrir que la LSPA), définir VITE_MDT_ENABLED=false au
// build.
export const MDT_ENABLED = import.meta.env.VITE_MDT_ENABLED !== "false";
