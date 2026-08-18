import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useMe } from "@/hooks/useMe";

// Bandeau d'avertissement : un agent actif sans IBAN in-game renseigné doit
// l'indiquer (nécessaire au versement des salaires). Masqué pour l'owner, les
// grades d'académie (cadets) et les grades extérieurs.
export function IbanBanner() {
  const me = useMe();
  const navigate = useNavigate();
  if (!me || me.agent.status !== "ACTIVE" || me.agent.isOwner) return null;
  if (me.grade?.academyOnly || me.grade?.external) return null;
  if (me.agent.iban) return null;

  return (
    <div
      className="flex flex-shrink-0 items-center gap-[10px] border-b px-[16px] py-[9px] text-[12.5px] font-semibold"
      style={{ background: "color-mix(in srgb, var(--warning) 14%, transparent)", borderColor: "color-mix(in srgb, var(--warning) 40%, var(--border))", color: "var(--warning)" }}
      role="alert"
    >
      <AlertTriangle className="h-[16px] w-[16px] flex-shrink-0" />
      <span className="min-w-0 flex-1">Tu n'as pas encore renseigné ton IBAN in-game (nécessaire pour ton salaire). Tu peux le retrouver avec <b>/id</b> en jeu.</span>
      <button
        onClick={() => navigate("/profil")}
        className="mdt-press flex-shrink-0 rounded-[8px] px-[12px] py-[6px] text-[12px] font-bold text-white"
        style={{ background: "var(--warning)" }}
      >
        Renseigner
      </button>
    </div>
  );
}
