import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { AuthShell } from "./AuthShell";
import { useApp } from "@/providers/app-state";

const ID_RE = /^[a-zà-öø-ÿ'-]{2,}\.[a-zà-öø-ÿ'-]{2,}$/i;

export function LoginPage() {
  const { signIn } = useAuthActions();
  const { requestEntry } = useApp();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isLogin = mode === "login";
  const idValid = ID_RE.test(id.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!idValid) {
      setErr("Identifiant invalide · utilisez le format prénom.nom.");
      return;
    }
    if (!pw) {
      setErr("Veuillez saisir votre mot de passe.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const login = id.trim().toLowerCase();
      await signIn("password", { email: login, password: pw, name: login, flow: isLogin ? "signIn" : "signUp" });
      // Connexion réussie -> déclenche la transition d'entrée (l'inscription passe par la finalisation).
      if (isLogin) requestEntry();
    } catch (e) {
      // Convex enrobe ses erreurs ; on extrait le message lisible quand il y en
      // a un. Sans cela, une panne de configuration serveur se présentait comme
      // un simple conflit d'identifiant, ce qui envoie chercher au mauvais endroit.
      const raw = e instanceof Error ? e.message : "";
      const clean = raw.replace(/^\[.*?\]\s*/, "").split("\n")[0].trim();
      const known = /InvalidAccountId|already exists|Invalid password|InvalidSecret/i.test(raw);
      setErr(
        known || !clean
          ? isLogin
            ? "Identifiant ou mot de passe incorrect."
            : "Impossible de créer le compte (identifiant déjà utilisé ?)."
          : clean,
      );
      setBusy(false);
    }
  }

  const tab = (active: boolean) =>
    `flex-1 rounded-[8px] py-[9px] text-[13px] font-semibold transition-colors ${active ? "bg-accent text-accent-contrast" : "text-muted hover:text-text"}`;

  return (
    <AuthShell>
      {/* Onglets */}
      <div className="mx-4 mt-4 flex gap-[3px] rounded-[11px] border border-border bg-surface-2 p-[5px]">
        <button onClick={() => { setMode("login"); setErr(null); }} className={tab(isLogin)}>Se connecter</button>
        <button onClick={() => { setMode("signup"); setErr(null); }} className={tab(!isLogin)}>Créer un compte</button>
      </div>

      <form onSubmit={submit} className="px-[26px] pb-[26px] pt-[22px]">
        <div className="mb-[18px]">
          <h2 className="m-0 text-[18px] font-bold text-text">
            {isLogin ? "Connexion au terminal" : "Créer un compte"}
          </h2>
          <div className="mt-1 text-[12.5px] text-muted">
            {isLogin ? "Accédez au MDT de la Station 13." : "Ouvrez votre accès au MDT."}
          </div>
        </div>

        {/* Identifiant */}
        <label className="mb-[7px] block text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Identifiant</label>
        <div
          className="flex h-[46px] items-center gap-[9px] rounded-[10px] border bg-surface-2 px-[14px]"
          style={{ borderColor: idValid ? "var(--accent)" : "var(--border)" }}
        >
          <span className="flex-shrink-0 font-data text-[13px] text-faint">@</span>
          <input
            value={id}
            onChange={(e) => { setId(e.target.value); setErr(null); }}
            placeholder="prénom.nom"
            autoCapitalize="none"
            autoComplete="username"
            spellCheck={false}
            className="flex-1 border-none bg-transparent font-data text-[14px] text-text outline-none"
          />
          {idValid && <span className="text-[14px] text-accent">✓</span>}
        </div>
        <div className="mt-[6px] text-[11px] text-faint">
          Format <b className="font-data text-muted">prénom.nom</b> · jamais d'adresse e-mail.
        </div>

        {/* Mot de passe */}
        <label className="mb-[7px] mt-4 block text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Mot de passe</label>
        <div className="flex h-[46px] items-center gap-[9px] rounded-[10px] border border-border bg-surface-2 px-[14px]">
          <input
            value={pw}
            onChange={(e) => { setPw(e.target.value); setErr(null); }}
            type={showPw ? "text" : "password"}
            placeholder="••••••••"
            autoComplete={isLogin ? "current-password" : "new-password"}
            className="flex-1 border-none bg-transparent text-[14px] text-text outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="border-none bg-transparent text-[11px] font-semibold tracking-[0.04em] text-faint hover:text-muted"
          >
            {showPw ? "MASQUER" : "AFFICHER"}
          </button>
        </div>

        {err && (
          <div
            className="mt-4 flex items-center gap-[9px] rounded-[9px] px-[13px] py-[10px] text-[12.5px]"
            style={{ background: "rgba(220,38,38,.09)", border: "1px solid rgba(220,38,38,.3)", color: "#c02828", animation: "s13Rise .25s ease" }}
          >
            <span className="flex-shrink-0">⚠</span>
            {err}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 flex h-[46px] w-full items-center justify-center rounded-[10px] bg-accent text-[14px] font-bold text-accent-contrast hover:brightness-[1.06] disabled:opacity-70"
        >
          {busy && (
            <span
              className="mr-2 inline-block h-[14px] w-[14px] rounded-full"
              style={{ border: "2px solid rgba(255,255,255,.45)", borderTopColor: "#fff", animation: "s13Spin .7s linear infinite" }}
            />
          )}
          {isLogin ? "Se connecter" : "Créer le compte"}
        </button>

        {!isLogin && (
          <div className="mt-[14px] rounded-[9px] border border-border bg-surface-2 px-[13px] py-[11px] text-[11.5px] leading-[1.5] text-muted">
            <b className="text-text">Après création</b>, vous compléterez votre identité RP. Un{" "}
            <b className="text-accent">code d'invitation</b> envoie le compte en validation ; sans code, seul le tout premier compte peut se configurer en propriétaire.
          </div>
        )}

        <div className="mt-[18px] text-center text-[12.5px] text-muted">
          {isLogin ? "Pas encore de compte ?" : "Vous avez déjà un compte ?"}{" "}
          <span
            onClick={() => { setMode(isLogin ? "signup" : "login"); setErr(null); }}
            className="cursor-pointer font-semibold text-accent hover:underline"
          >
            {isLogin ? "Créer un compte" : "Se connecter"}
          </span>
        </div>
      </form>
    </AuthShell>
  );
}
