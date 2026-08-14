import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { AuthShell } from "./AuthShell";
import { readableError } from "@/lib/errors";
import { useApp } from "@/providers/app-state";
import { usePortal } from "@/portal/portal-context";

// Normalisation de l'identifiant (même règle que makeLogin côté serveur).
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Page « Rejoindre » : ouverte via le lien unique envoyé en MP (Envoyer un
// compte). Le matricule et le nom sont pré-remplis depuis le pseudo serveur ;
// il ne reste qu'à indiquer le prénom et choisir un mot de passe. Un seul compte
// par lien, relié automatiquement au Discord. C'est une page distincte de la
// création de compte classique.
export function JoinPage() {
  const { code = "" } = useParams();
  const preview = useQuery(api.invitations.previewByCode, { code });
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const completeRegistration = useMutation(api.agents.completeRegistration);
  const { requestEntry } = useApp();
  const { choose } = usePortal();
  const navigate = useNavigate();

  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [matricule, setMatricule] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState(false);
  // Étape 2 (création du profil) : lancée seulement une fois la session
  // d'authentification réellement établie, sinon completeRegistration part sans
  // token et échoue « Non authentifié ».
  const [awaitingAuth, setAwaitingAuth] = useState(false);
  const pending = useRef<{ prenomRP: string; nomRP: string; matricule?: number } | null>(null);
  const finishing = useRef(false);

  // Pré-remplissage une fois l'aperçu chargé (sans écraser une saisie en cours).
  useEffect(() => {
    if (seeded || !preview || preview.status !== "ok") return;
    if (preview.prefillNom) setNom(preview.prefillNom);
    if (preview.prefillMatricule != null) setMatricule(String(preview.prefillMatricule));
    setSeeded(true);
  }, [preview, seeded]);

  const inputCls = "h-[46px] w-full rounded-[10px] border border-border bg-surface-2 px-[14px] text-[14px] text-text outline-none focus:border-accent";
  const loginValid = norm(prenom).length >= 2 && norm(nom).length >= 2;
  const pwValid = pw.length >= 8;
  const canSubmit = loginValid && pwValid && !busy;

  function fail(e: unknown) {
    const raw = e instanceof Error ? e.message : "";
    if (/Invalid password/i.test(raw)) {
      setErr("Mot de passe trop court : au moins 8 caractères.");
    } else if (/already exists|InvalidAccountId/i.test(raw)) {
      setErr("Un compte existe déjà avec cet identifiant. Connecte-toi depuis la page d'accueil.");
    } else {
      setErr(readableError(e, "Impossible de créer le compte. Réessaie ou contacte l'État-Major."));
    }
    setBusy(false);
    setAwaitingAuth(false);
    pending.current = null;
    finishing.current = false;
  }

  // Étape 1 : créer le compte d'authentification (prénom.nom + mot de passe).
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setErr(null);
    setBusy(true);
    pending.current = {
      prenomRP: prenom.trim(),
      nomRP: nom.trim(),
      matricule: matricule.trim() ? Number(matricule.trim()) : undefined,
    };
    try {
      const login = `${norm(prenom)}.${norm(nom)}`;
      await signIn("password", { email: login, password: pw, name: login, flow: "signUp" });
      // On attend que la session soit propagée (useConvexAuth) avant l'étape 2.
      setAwaitingAuth(true);
    } catch (e) {
      fail(e);
    }
  }

  // Étape 2 : une fois authentifié, créer le profil agent puis entrer.
  useEffect(() => {
    if (!awaitingAuth || !isAuthenticated || finishing.current || !pending.current) return;
    finishing.current = true;
    (async () => {
      try {
        await completeRegistration({ code, ...pending.current! });
        choose("mdt");
        requestEntry();
        navigate("/", { replace: true });
      } catch (e) {
        fail(e);
      }
    })();
  }, [awaitingAuth, isAuthenticated]);

  // États du lien.
  if (preview === undefined) {
    return (
      <AuthShell maxWidth={440} subtitle="Rejoindre la Station">
        <div className="px-[26px] py-[40px] text-center text-[13px] text-muted">Vérification du lien…</div>
      </AuthShell>
    );
  }
  if (preview.status !== "ok") {
    const msg =
      preview.status === "used" ? "Ce lien a déjà été utilisé pour créer un compte."
      : preview.status === "expired" ? "Ce lien a expiré. Demande un nouvel envoi à l'État-Major."
      : preview.status === "revoked" ? "Ce lien a été révoqué."
      : "Ce lien est invalide.";
    return (
      <AuthShell maxWidth={440} subtitle="Rejoindre la Station">
        <div className="px-[26px] py-[34px] text-center">
          <div className="mx-auto mb-[14px] flex h-[46px] w-[46px] items-center justify-center rounded-full" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
            <ShieldAlert className="h-[22px] w-[22px]" />
          </div>
          <div className="text-[14px] font-semibold">{msg}</div>
          <button onClick={() => navigate("/", { replace: true })} className="mt-[18px] w-full rounded-[10px] border border-border bg-surface-2 py-[11px] text-[13px] font-semibold text-muted hover:border-border-strong hover:text-text">
            Aller à l'accueil
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell maxWidth={440} subtitle="Rejoindre la Station">
      <form onSubmit={submit} className="px-[26px] pb-[26px] pt-[24px]">
        <div className="mb-[18px] flex items-center gap-[11px]">
          <span className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-[11px] bg-surface-2 text-accent">
            <BadgeCheck className="h-[19px] w-[19px]" />
          </span>
          <div>
            <h2 className="m-0 text-[17px] font-bold text-text">Crée ton compte</h2>
            <div className="mt-[2px] text-[12.5px] text-muted">
              {preview.discordUsername ? `Lien pour @${preview.discordUsername}.` : "Lien personnel."} Complète ton prénom et choisis un mot de passe.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-[7px] block text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Prénom RP</label>
            <input autoFocus value={prenom} onChange={(e) => { setPrenom(e.target.value); setErr(null); }} placeholder="Daniel" className={inputCls} />
          </div>
          <div>
            <label className="mb-[7px] block text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Nom RP</label>
            <input value={nom} onChange={(e) => { setNom(e.target.value); setErr(null); }} placeholder="Carter" className={inputCls} />
          </div>
        </div>

        <label className="mb-[7px] mt-4 block text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
          N° de badge <span className="font-medium normal-case tracking-normal text-faint">· pré-rempli, modifiable</span>
        </label>
        <input
          value={matricule}
          onChange={(e) => setMatricule(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
          placeholder="Détecté depuis ton pseudo"
          className={`${inputCls} font-data tracking-[0.06em]`}
        />

        {preview.prefillGradeName && (
          <div className="mt-[10px] flex items-center gap-[8px] rounded-[9px] border border-border bg-surface-2 px-[13px] py-[10px] text-[12px] text-muted">
            <BadgeCheck className="h-[15px] w-[15px] text-accent" />
            <span>Grade détecté : <b className="text-text">{preview.prefillGradeName}</b> · attribué automatiquement.</span>
          </div>
        )}

        <label className="mb-[7px] mt-4 block text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Mot de passe</label>
        <div className="flex h-[46px] items-center gap-[9px] rounded-[10px] border border-border bg-surface-2 px-[14px]">
          <input
            value={pw}
            onChange={(e) => { setPw(e.target.value); setErr(null); }}
            type={showPw ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="new-password"
            className="flex-1 border-none bg-transparent text-[14px] text-text outline-none"
          />
          <button type="button" onClick={() => setShowPw((v) => !v)} className="border-none bg-transparent text-[11px] font-semibold tracking-[0.04em] text-faint hover:text-muted">
            {showPw ? "MASQUER" : "AFFICHER"}
          </button>
        </div>
        <div className="mt-[6px] text-[11px]" style={{ color: pw.length === 0 ? "var(--faint)" : pwValid ? "var(--success)" : "var(--warning)" }}>
          Au moins 8 caractères{pw.length > 0 && !pwValid ? ` (encore ${8 - pw.length})` : ""}.
        </div>

        {loginValid && (
          <div className="mt-[10px] text-[11.5px] text-faint">
            Ton identifiant de connexion sera <b className="font-data text-muted">{norm(prenom)}.{norm(nom)}</b>.
          </div>
        )}

        {err && (
          <div role="alert" className="mt-4 flex items-center gap-[9px] rounded-[9px] px-[13px] py-[10px] text-[12.5px]" style={{ background: "rgba(220,38,38,.09)", border: "1px solid rgba(220,38,38,.3)", color: "#c02828" }}>
            <span className="flex-shrink-0">⚠</span>
            {err}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-5 flex h-[46px] w-full items-center justify-center rounded-[10px] bg-accent text-[14px] font-bold text-accent-contrast hover:brightness-[1.06] disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-faint disabled:shadow-[inset_0_0_0_1px_var(--border)]"
        >
          {busy && <span className="mr-2 inline-block h-[14px] w-[14px] rounded-full" style={{ border: "2px solid rgba(255,255,255,.45)", borderTopColor: "#fff", animation: "s13Spin .7s linear infinite" }} />}
          Créer mon compte
        </button>

        <div className="mt-[14px] rounded-[9px] border border-border bg-surface-2 px-[13px] py-[11px] text-[11.5px] leading-[1.5] text-muted">
          Ce lien crée <b className="text-text">un seul compte</b>, relié automatiquement à ton Discord. Garde ton mot de passe : tu te connecteras ensuite avec <b className="font-data text-muted">prénom.nom</b>.
        </div>
      </form>
    </AuthShell>
  );
}
