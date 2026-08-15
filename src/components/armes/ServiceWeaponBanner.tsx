import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { useMe } from "@/hooks/useMe";

// Bandeau d'avertissement : un agent opérationnel actif sans aucune arme de
// service enregistrée doit en enregistrer une au plus vite. Masqué pour l'owner,
// les grades d'académie (cadets) et les grades extérieurs.
export function ServiceWeaponBanner() {
  const me = useMe();
  const navigate = useNavigate();
  const mine = useQuery(api.serviceWeapons.mine, me ? {} : "skip");
  if (!me || me.agent.status !== "ACTIVE" || me.agent.isOwner) return null;
  if (me.grade?.academyOnly || me.grade?.external) return null;
  if (mine === undefined || mine.length > 0) return null;

  return (
    <div
      className="flex flex-shrink-0 items-center gap-[10px] border-b px-[16px] py-[9px] text-[12.5px] font-semibold"
      style={{ background: "color-mix(in srgb, var(--warning) 14%, transparent)", borderColor: "color-mix(in srgb, var(--warning) 40%, var(--border))", color: "var(--warning)" }}
      role="alert"
    >
      <AlertTriangle className="h-[16px] w-[16px] flex-shrink-0" />
      <span className="min-w-0 flex-1">Tu n'as pas encore enregistré ton arme de service. Enregistre-la au plus vite (photo + n° de série).</span>
      <button
        onClick={() => navigate("/armes?section=lspd")}
        className="mdt-press flex-shrink-0 rounded-[8px] px-[12px] py-[6px] text-[12px] font-bold text-white"
        style={{ background: "var(--warning)" }}
      >
        Enregistrer
      </button>
    </div>
  );
}
