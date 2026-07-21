import { useState } from "react";
import { useAction } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { KeyRound, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/providers/toast";
import { AuthShell } from "./AuthShell";

// Imposé après une réinitialisation par l'État-Major : le mot de passe
// temporaire ne donne accès qu'à cet écran tant qu'il n'a pas été remplacé.
export function ChangePasswordScreen() {
  const change = useAction(api.accounts.changeMyPassword);
  const { signOut } = useAuthActions();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && confirm !== next;
  const ready = current.length > 0 && next.length >= 8 && confirm === next;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    const r = await toast.guard(change({ current, next }), "Changement impossible");
    setBusy(false);
    if (r !== undefined) toast.success("Mot de passe mis à jour.");
  }

  const field = "h-11 w-full rounded-[10px] border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";

  return (
    <AuthShell>
      <div className="flex flex-col px-[30px] pb-[28px] pt-[34px]">
        <div className="mb-[18px] flex flex-col items-center text-center">
          <div
            className="mb-[16px] flex h-[58px] w-[58px] items-center justify-center rounded-[15px]"
            style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)" }}
          >
            <KeyRound className="h-[26px] w-[26px]" style={{ color: "var(--accent)" }} />
          </div>
          <h2 className="m-0 text-[19px] font-bold text-text">Nouveau mot de passe requis</h2>
          <div className="mt-[9px] max-w-[340px] text-[13px] leading-[1.55] text-muted">
            Votre accès a été réinitialisé par l'État-Major. Choisissez un mot de passe personnel pour continuer.
          </div>
        </div>

        <div className="flex flex-col gap-[12px]">
          <label className="flex flex-col gap-[5px]">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Mot de passe temporaire</span>
            <input
              type={show ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              className={`${field} font-data`}
            />
          </label>

          <label className="flex flex-col gap-[5px]">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Nouveau mot de passe</span>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                className={`${field} pr-[42px]`}
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-[10px] top-1/2 -translate-y-1/2 text-faint hover:text-muted"
              >
                {show ? <EyeOff className="h-[16px] w-[16px]" /> : <Eye className="h-[16px] w-[16px]" />}
              </button>
            </div>
            {tooShort && <span className="text-[11.5px]" style={{ color: "var(--danger)" }}>8 caractères minimum.</span>}
          </label>

          <label className="flex flex-col gap-[5px]">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Confirmation</span>
            <input
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              autoComplete="new-password"
              className={field}
            />
            {mismatch && <span className="text-[11.5px]" style={{ color: "var(--danger)" }}>Les deux saisies diffèrent.</span>}
          </label>

          <button
            onClick={submit}
            disabled={!ready || busy}
            className="mdt-press mt-[4px] h-11 rounded-[10px] text-[13.5px] font-bold text-accent-contrast disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {busy ? "Enregistrement…" : "Définir mon mot de passe"}
          </button>

          <button onClick={() => void signOut()} className="mt-[2px] text-[12.5px] text-faint hover:text-muted">
            Se déconnecter
          </button>
        </div>
      </div>
    </AuthShell>
  );
}
