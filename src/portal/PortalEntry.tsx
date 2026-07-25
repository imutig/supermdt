import { useState } from "react";
import { useMutation } from "convex/react";
import { Sun, Moon, Lock, ArrowRight, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { readableError } from "@/lib/errors";
import { useApp } from "@/providers/app-state";
import { usePortal } from "./portal-context";

// Premier écran du site, avant toute connexion : on choisit la surface à
// ouvrir. Le MDT peut demander un code d'accès ; le portail de l'académie est
// toujours ouvert, l'authentification restant le contrôle réel dans les deux
// cas.
export function PortalEntry({
  onChosen,
  mdtDenied = false,
}: {
  /** Appelé une fois le portail retenu : sert à naviguer quand on est déjà connecté. */
  onChosen?: (p: "mdt" | "lspa") => void;
  /** Un cadet n'a pas d'accès au MDT : la carte est présentée verrouillée. */
  mdtDenied?: boolean;
}) {
  const { mode, toggleMode } = useApp();
  const { mdtLocked, mdtUnlocked, choose, markUnlocked } = usePortal();
  const [asking, setAsking] = useState(false);

  function pick(p: "mdt" | "lspa") {
    choose(p);
    onChosen?.(p);
  }

  function openMdt() {
    if (mdtDenied) return;
    if (!mdtLocked || mdtUnlocked) pick("mdt");
    else setAsking(true);
  }

  return (
    <div className="relative flex h-full items-center justify-center overflow-y-auto bg-bg p-6">
      <button
        onClick={toggleMode}
        title={mode === "dark" ? "Passer en clair" : "Passer en sombre"}
        className="absolute right-5 top-5 flex h-[36px] w-[36px] items-center justify-center rounded-[10px] border border-border bg-surface text-muted hover:border-border-strong hover:text-text"
      >
        {mode === "dark" ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
      </button>

      <div className="w-full max-w-[720px]" style={{ animation: "s13Rise .45s cubic-bezier(.16,1,.3,1)" }}>
        <div className="mb-[26px] flex flex-col items-center gap-[13px]">
          <img src="/logos/logo-badge.svg" alt="LSPD Station 13" className="h-[76px] w-[76px]" />
          <div className="text-center">
            <div className="text-[20px] font-bold leading-none tracking-[-0.01em] text-text">LSPD · Station 13</div>
            <div className="mt-[7px] text-[10.5px] font-bold uppercase tracking-[0.2em] text-accent">
              Newton Street · Los Santos
            </div>
          </div>
        </div>

        {asking ? (
          <UnlockCard onBack={() => setAsking(false)} onUnlocked={(exp) => { markUnlocked(exp); pick("mdt"); }} />
        ) : (
          <>
            <div className="mb-[18px] text-center text-[13.5px] text-muted">
              Choisissez l'accès à ouvrir.
            </div>
            <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
              <Card
                logo="/logos/logo-badge.svg"
                tint="#49A24A"
                title="MDT · Station 13"
                subtitle="Mobile Data Terminal"
                lines={["Dossiers citoyens et casiers", "Dispatch et patrouilles", "Rapports, mandats, véhicules"]}
                cta={mdtDenied ? "Réservé aux agents assermentés" : mdtLocked && !mdtUnlocked ? "Code d'accès requis" : "Entrer"}
                locked={mdtDenied || (mdtLocked && !mdtUnlocked)}
                disabled={mdtDenied}
                onOpen={openMdt}
              />
              <Card
                logo="/logos/lspa-badge.svg"
                tint="#C4A24A"
                title="Portail LSPA"
                subtitle="Los Santos Police Academy"
                lines={["Formation des cadets", "Quiz et évaluations", "Suivi de promotion"]}
                cta="Entrer"
                onOpen={() => pick("lspa")}
              />
            </div>
          </>
        )}

        <div className="mt-[20px] text-center text-[11px] tracking-[0.03em] text-faint">
          Accès réservé au personnel assermenté · Lucky Thirteen · Newton Street
        </div>
      </div>
    </div>
  );
}

function Card({
  logo, tint, title, subtitle, lines, cta, locked, disabled, onOpen,
}: {
  logo: string;
  tint: string;
  title: string;
  subtitle: string;
  lines: string[];
  cta: string;
  locked?: boolean;
  disabled?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={disabled ? undefined : onOpen}
      disabled={disabled}
      className={`group mdt-reveal flex flex-col rounded-[14px] border p-[19px] text-left transition-all ${
        disabled ? "cursor-not-allowed" : "mdt-press cursor-pointer hover:shadow-[0_14px_44px_var(--shadow)]"
      }`}
      style={{
        borderColor: disabled ? "var(--border)" : "var(--border-strong)",
        background: disabled ? "var(--surface)" : `color-mix(in srgb, ${tint} 5%, var(--surface))`,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div className="mb-[13px] flex items-center gap-[12px]">
        <img src={logo} alt="" className="h-[48px] w-[48px] flex-shrink-0" style={{ filter: disabled ? "grayscale(1)" : undefined }} />
        <div className="min-w-0">
          <div className="text-[15.5px] font-bold leading-tight">{title}</div>
          <div className="mt-[2px] text-[10.5px] font-semibold uppercase tracking-[0.1em] text-faint">{subtitle}</div>
        </div>
      </div>

      <ul className="m-0 mb-[15px] flex list-none flex-col gap-[6px] p-0">
        {lines.map((l) => (
          <li key={l} className="flex items-center gap-[8px] text-[12.5px] text-muted">
            <span className="h-[4px] w-[4px] flex-shrink-0 rounded-full" style={{ background: tint }} />
            {l}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex items-center gap-[7px] text-[12.5px] font-semibold" style={{ color: disabled ? "var(--faint)" : tint }}>
        {locked ? <Lock className="h-[14px] w-[14px]" /> : null}
        {cta}
        {!locked && <ArrowRight className="h-[15px] w-[15px] transition-transform group-hover:translate-x-[3px]" />}
      </div>
    </button>
  );
}

function UnlockCard({ onBack, onUnlocked }: { onBack: () => void; onUnlocked: (expiresAt: number | null) => void }) {
  const unlock = useMutation(api.access.unlock);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await unlock({ code });
      onUnlocked(r.expiresAt);
    } catch (e) {
      setErr(readableError(e, "Code d'accès incorrect."));
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-[400px] overflow-hidden rounded-[14px] border border-border bg-surface p-[24px]"
      style={{ boxShadow: "0 12px 40px var(--shadow)", animation: "s13Rise .3s cubic-bezier(.16,1,.3,1)" }}
    >
      <div className="mb-[16px] flex items-center gap-[11px]">
        <span className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-[11px] bg-surface-2 text-accent">
          <Lock className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h2 className="m-0 text-[16px] font-bold">Accès au MDT</h2>
          <div className="mt-[2px] text-[12.5px] text-muted">Saisissez le code d'accès du terminal.</div>
        </div>
      </div>

      <label className="mb-[7px] block text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Code d'accès</label>
      <input
        autoFocus
        value={code}
        onChange={(e) => { setCode(e.target.value); setErr(null); }}
        type="password"
        placeholder="••••••••"
        autoComplete="off"
        className="h-[46px] w-full rounded-[10px] border border-border bg-surface-2 px-[14px] font-data text-[14px] tracking-[0.1em] text-text outline-none focus:border-accent"
      />

      {err && (
        <div
          className="mt-[14px] flex items-center gap-[9px] rounded-[9px] px-[13px] py-[10px] text-[12.5px]"
          style={{ background: "rgba(220,38,38,.09)", border: "1px solid rgba(220,38,38,.3)", color: "#c02828", animation: "s13Rise .25s ease" }}
        >
          <span className="flex-shrink-0">⚠</span>
          {err}
        </div>
      )}

      <button
        type="submit"
        disabled={busy || !code.trim()}
        className="mt-[18px] flex h-[46px] w-full items-center justify-center rounded-[10px] bg-accent text-[14px] font-bold text-accent-contrast hover:brightness-[1.06] disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-faint disabled:shadow-[inset_0_0_0_1px_var(--border)]"
      >
        {busy && (
          <span
            className="mr-2 inline-block h-[14px] w-[14px] rounded-full"
            style={{ border: "2px solid rgba(255,255,255,.45)", borderTopColor: "#fff", animation: "s13Spin .7s linear infinite" }}
          />
        )}
        Déverrouiller
      </button>

      <button
        type="button"
        onClick={onBack}
        className="mt-[14px] flex w-full items-center justify-center gap-[6px] border-none bg-transparent text-[12.5px] font-semibold text-muted hover:text-text"
      >
        <ArrowLeft className="h-[14px] w-[14px]" />
        Choisir un autre accès
      </button>
    </form>
  );
}
