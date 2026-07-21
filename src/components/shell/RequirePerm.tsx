import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCan } from "@/hooks/useCan";
import { LoadingScreen } from "@/components/common/Loader";

// Garde de route : affiche un message d'accès refusé au lieu d'une page blanche (§17).
export function RequirePerm({ perm, children }: { perm?: string; children: ReactNode }) {
  const { can, ready } = useCan();
  if (!perm) return <>{children}</>;
  if (!ready) return <LoadingScreen label="Vérification des accès…" />;
  if (!can(perm)) return <PermissionDenied />;
  return <>{children}</>;
}

export function PermissionDenied() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 py-24 text-center mdt-reveal">
      <span className="flex h-[64px] w-[64px] items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--danger) 14%, transparent)", color: "var(--danger)" }}>
        <ShieldAlert className="h-8 w-8" />
      </span>
      <div>
        <div className="text-[18px] font-extrabold">Accès refusé</div>
        <div className="mt-[6px] max-w-[420px] text-[13px] leading-relaxed text-muted">
          Vous n'avez pas la permission d'accéder à cette section. Contactez l'État-Major si vous pensez que c'est une erreur.
        </div>
      </div>
      <button onClick={() => navigate("/")} className="mdt-press rounded-[9px] bg-accent px-[16px] py-[9px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]">
        Retour à l'accueil
      </button>
    </div>
  );
}
