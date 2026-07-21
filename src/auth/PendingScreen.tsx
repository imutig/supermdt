import { useAuthActions } from "@convex-dev/auth/react";
import { AuthShell } from "./AuthShell";

// État E : accès restreint (en attente de validation, ou compte suspendu/désactivé).
export function PendingScreen({ suspended = false }: { suspended?: boolean }) {
  const { signOut } = useAuthActions();
  const stroke = suspended ? "#c02828" : "#c47612";
  const bg = suspended ? "rgba(220,38,38,.1)" : "rgba(234,143,31,.1)";
  const border = suspended ? "rgba(220,38,38,.3)" : "rgba(234,143,31,.32)";

  return (
    <AuthShell>
      <div className="flex flex-col items-center px-[30px] pb-[28px] pt-[34px] text-center">
        <div
          className="mb-[18px] flex h-[58px] w-[58px] items-center justify-center rounded-[15px]"
          style={{ background: bg, border: `1px solid ${border}` }}
        >
          <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            {suspended ? <path d="M5.64 5.64l12.72 12.72" /> : <path d="M12 7.5V12l3 1.8" />}
          </svg>
        </div>

        <h2 className="m-0 text-[19px] font-bold text-text">
          {suspended ? "Accès refusé" : "Compte en attente de validation"}
        </h2>
        <div className="mt-[9px] max-w-[340px] text-[13px] leading-[1.55] text-muted">
          {suspended
            ? "Ce compte a été désactivé ou suspendu. Contactez un responsable de la Station 13 si vous pensez qu'il s'agit d'une erreur."
            : "Votre compte a bien été créé et transmis à la Station 13. Un supérieur doit valider votre accès. Vous pourrez vous connecter dès qu'il sera approuvé."}
        </div>

        {!suspended && (
          <div
            className="mt-[18px] flex items-center gap-[9px] rounded-[20px] px-[14px] py-[9px] text-[12px] font-semibold"
            style={{ background: "rgba(234,143,31,.1)", border: "1px solid rgba(234,143,31,.32)", color: "#c47612" }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: "#ea8f1f", animation: "s13Pulse 1.6s ease-in-out infinite" }} />
            En attente de validation
          </div>
        )}

        <button
          onClick={() => signOut()}
          className="mt-6 rounded-[10px] border border-border bg-surface-2 px-5 py-[11px] text-[13px] font-semibold text-muted hover:border-accent hover:text-text"
        >
          Se déconnecter
        </button>
      </div>
    </AuthShell>
  );
}
