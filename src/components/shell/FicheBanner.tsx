import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { useMe } from "@/hooks/useMe";
import { FicheRenseignementModal } from "@/components/effectif/FicheRenseignementModal";

// Bandeau rouge tant que l'agent n'a pas rempli sa fiche de renseignement (item 11).
export function FicheBanner() {
  const mine = useQuery(api.fiche.mine);
  const me = useMe();
  const [open, setOpen] = useState(false);
  // Le compte propriétaire est un compte technique, hors effectif RP : lui
  // réclamer une fiche de renseignement n'a pas de sens.
  if (me?.agent.isOwner) return null;
  if (!mine || mine.submitted) return null;
  return (
    <>
      <div className="flex flex-shrink-0 items-center gap-[10px] px-[18px] py-[9px] text-white" style={{ background: "var(--danger)" }}>
        <AlertTriangle className="h-[16px] w-[16px] flex-shrink-0" />
        <span className="flex-1 text-[12.5px] font-semibold">Votre fiche de renseignement individuel n'est pas remplie. Merci de la compléter rapidement.</span>
        <button onClick={() => setOpen(true)} className="mdt-press rounded-[7px] bg-white/20 px-[12px] py-[5px] text-[12px] font-bold hover:bg-white/30">Remplir maintenant</button>
      </div>
      {open && <FicheRenseignementModal onClose={() => setOpen(false)} />}
    </>
  );
}
