import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/lib/api";
import { AuthShell } from "./AuthShell";
import { useApp } from "@/providers/app-state";

// État D : compte authentifié sans profil agent. Rejoindre via code, ou configurer l'owner.
export function Onboarding() {
  const completeRegistration = useMutation(api.agents.completeRegistration);
  const bootstrapOwner = useMutation(api.agents.bootstrapOwner);
  const ownerExists = useQuery(api.agents.ownerExists);
  const { signOut } = useAuthActions();
  const { requestEntry } = useApp();

  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hasCode = !!code.trim();
  const nameOk = !!prenom.trim() && !!nom.trim();

  // Logique contextuelle du bouton principal.
  let hint: string, hintTone: string, label: string, enabled: boolean;
  if (hasCode) {
    hint = "Avec un code d'invitation, votre compte est soumis à validation par un supérieur avant l'accès.";
    hintTone = "var(--accent)";
    label = "Rejoindre la station";
    enabled = true;
  } else if (ownerExists === false) {
    hint = "Aucun compte propriétaire n'existe encore : ce compte peut être configuré comme propriétaire (owner) de la station.";
    hintTone = "#ea8f1f";
    label = "Configurer le compte propriétaire";
    enabled = true;
  } else {
    hint = "Un code d'invitation est requis : un propriétaire existe déjà. Demandez un code à un membre de la station.";
    hintTone = "#dc2626";
    label = "Code d'invitation requis";
    enabled = false;
  }
  enabled = enabled && nameOk && ownerExists !== undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!enabled) return;
    setErr(null);
    setBusy(true);
    try {
      if (hasCode) {
        await completeRegistration({ code: code.trim(), nomRP: nom.trim(), prenomRP: prenom.trim() });
        // -> le compte part en validation (PendingScreen prendra le relais).
      } else {
        await bootstrapOwner({ nomRP: nom.trim(), prenomRP: prenom.trim() });
        requestEntry(); // l'owner entre : transition d'entrée.
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Une erreur est survenue.");
      setBusy(false);
    }
  }

  const inputCls =
    "h-[46px] w-full rounded-[10px] border border-border bg-surface-2 px-[14px] text-[14px] text-text outline-none focus:border-accent";

  return (
    <AuthShell maxWidth={440}>
      <form onSubmit={submit} className="px-[26px] pb-[26px] pt-[24px]">
        <div className="mb-[18px]">
          <div className="mb-[6px] text-[11px] font-bold uppercase tracking-[0.09em] text-accent">
            Compte créé · dernière étape
          </div>
          <h2 className="m-0 text-[18px] font-bold text-text">Complétez votre identité</h2>
          <div className="mt-1 text-[12.5px] text-muted">
            Ces informations constituent votre fiche agent RP.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-[7px] block text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Prénom RP</label>
            <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Alice" className={inputCls} />
          </div>
          <div>
            <label className="mb-[7px] block text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Nom RP</label>
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Kowalski" className={inputCls} />
          </div>
        </div>

        <label className="mb-[7px] mt-4 block text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
          Code d'invitation <span className="font-medium normal-case tracking-normal text-faint">· optionnel</span>
        </label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="STATION13-XXXX"
          autoCapitalize="characters"
          spellCheck={false}
          className={`${inputCls} font-data tracking-[0.05em]`}
        />

        <div
          className="mt-[14px] rounded-[9px] border border-border bg-surface-2 px-[14px] py-[12px] text-[12px] leading-[1.55] text-muted"
          style={{ borderLeft: `3px solid ${hintTone}` }}
        >
          {hint}
        </div>

        {err && <div className="mt-3 text-[12.5px] text-danger">{err}</div>}

        <button
          type="submit"
          disabled={!enabled || busy}
          className="mt-5 flex h-[46px] w-full items-center justify-center rounded-[10px] text-[14px] font-bold hover:brightness-[1.06] disabled:cursor-not-allowed"
          style={
            enabled
              ? { background: "var(--accent)", color: "#fff" }
              : { background: "var(--surface-2)", color: "var(--faint)", boxShadow: "inset 0 0 0 1px var(--border)" }
          }
        >
          {busy && (
            <span className="mr-2 inline-block h-[14px] w-[14px] rounded-full" style={{ border: "2px solid rgba(255,255,255,.45)", borderTopColor: "#fff", animation: "s13Spin .7s linear infinite" }} />
          )}
          {label}
        </button>

        <button
          type="button"
          onClick={() => signOut()}
          className="mt-[10px] w-full rounded-[10px] border border-border bg-surface-2 py-[11px] text-[13px] font-semibold text-muted hover:border-border-strong hover:text-text"
        >
          Se déconnecter
        </button>
      </form>
    </AuthShell>
  );
}
