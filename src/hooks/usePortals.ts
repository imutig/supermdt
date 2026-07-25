import { useCan } from "./useCan";
import { useMe } from "./useMe";

// Portails accessibles à l'agent courant.
//
// Un grade marqué `academyOnly` (le Cadet) n'ouvre QUE le portail de
// l'académie : un cadet n'est pas encore agent assermenté et n'a donc rien à
// faire dans le MDT. L'owner conserve l'accès à tout.
export function usePortals() {
  const me = useMe();
  const { can, ready } = useCan();
  const academyOnly = me?.grade?.academyOnly === true && !me.agent.isOwner;
  return {
    ready: ready && me !== undefined && me !== null,
    canMdt: !academyOnly,
    canLspa: can("lspa.view"),
    academyOnly,
  };
}
