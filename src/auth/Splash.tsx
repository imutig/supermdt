import { AuthShell } from "./AuthShell";

// État A : vérification de la session au démarrage.
export function Splash({ label = "Vérification de la session…" }: { label?: string }) {
  return (
    <AuthShell>
      <div className="flex flex-col items-center gap-5 px-[34px] py-[46px]">
        <div className="flex items-center gap-[9px]">
          <span className="h-[9px] w-[9px] rounded-full bg-accent" style={{ animation: "s13Dot 1.2s ease-in-out infinite" }} />
          <span className="h-[9px] w-[9px] rounded-full bg-accent" style={{ animation: "s13Dot 1.2s ease-in-out .2s infinite" }} />
          <span className="h-[9px] w-[9px] rounded-full bg-accent" style={{ animation: "s13Dot 1.2s ease-in-out .4s infinite" }} />
        </div>
        <div className="text-center">
          <div className="text-[15px] font-semibold text-text">{label}</div>
          <div className="mt-1 text-[12.5px] text-muted">
            Connexion sécurisée au terminal de la Station 13
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
