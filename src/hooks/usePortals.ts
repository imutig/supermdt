import { useCan } from "./useCan";
import { useMe } from "./useMe";

// Portails accessibles à l'agent courant.
//
// Un grade marqué `academyOnly` (le Cadet) n'ouvre QUE le portail de
// l'académie : un cadet n'est pas encore agent assermenté et n'a donc rien à
// faire dans le MDT. L'owner conserve l'accès à tout.
//
// Le portail de l'académie est ouvert à TOUT agent : ceux qui ne font pas
// partie de la Police Academy y voient simplement la liste des Officiers 1 et
// les fiches de ceux dont ils sont référents. Seul un cadet écarté de sa promo
// en est privé.
export function usePortals() {
  const me = useMe();
  const { ready } = useCan();
  const academyOnly = me?.grade?.academyOnly === true && !me.agent.isOwner;
  const blocked = me?.academyBlocked === true;
  // Membre de l'académie (encadrant) : voit tout le portail, pas seulement le FTO.
  const academyMember = me?.grade?.academyOnly === true || me?.academyRank != null || me?.agent.isOwner === true;
  return {
    ready: ready && me !== undefined && me !== null,
    canMdt: !academyOnly,
    canLspa: !blocked,
    academyMember: academyMember === true,
    academyOnly,
    academyBlocked: blocked,
  };
}
