import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { RefreshCw, Link2Off, ShieldCheck, TriangleAlert, Copy, Dices, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/providers/toast";
import { useDialogs } from "@/components/detective/dialogs";

// Mot de passe dédié généré (sans caractères ambigus).
function genPassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = crypto.getRandomValues(new Uint8Array(22));
  return Array.from(arr, (b) => alphabet[b % alphabet.length]).join("");
}

// Onboarding « Utiliser SuperMDT comme MDT principal » : SuperMDT GÉNÈRE un mot de
// passe dédié ; l'agent change son mot de passe Nexus pour celui-ci, puis on teste
// et on le stocke (chiffré, réversible côté serveur pour poster en son nom).
export function NexusSyncCard() {
  const status = useQuery(api.nexusSync.myStatus);
  const saveCredential = useAction(api.nexusSync.saveCredential);
  const testCredential = useAction(api.nexusSync.testCredential);
  const removeCredential = useMutation(api.nexusSync.removeCredential);
  const revealPassword = useAction(api.nexusSync.revealMyNexusPassword);
  const toast = useToast();
  const dialogs = useDialogs();

  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealBusy, setRevealBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (status === undefined) return null;

  const configured = status.configured;

  async function submit() {
    if (!email.trim() || !password || !consent) return;
    if (!/@lspd\.ls$/i.test(email.trim())) { toast.error("L'email du compte Nexus doit se terminer par @lspd.ls."); return; }
    setBusy(true);
    const r = await toast.guard(saveCredential({ email: email.trim(), password }), "Enregistrement impossible");
    setBusy(false);
    if (r === undefined) return;
    if (r.ok) {
      toast.success("Connexion Nexus vérifiée. Synchro activée.");
      setOpen(false); setEmail(""); setPassword(""); setConsent(false);
    } else {
      toast.error(`Connexion refusée : ${r.error ?? "identifiants invalides"}`);
    }
  }

  async function retest() {
    setBusy(true);
    const r = await toast.guard(testCredential({}), "Test impossible");
    setBusy(false);
    if (r === undefined) return;
    if (r.ok) toast.success("Connexion Nexus OK.");
    else toast.error(`Connexion KO : ${r.error ?? "invalide"}`);
  }

  async function toggleReveal() {
    if (revealed !== null) { setRevealed(null); return; }
    setRevealBusy(true);
    const pw = await toast.guard(revealPassword({}), "Récupération impossible");
    setRevealBusy(false);
    if (typeof pw === "string") setRevealed(pw);
  }

  async function unlink() {
    const ok = await dialogs.confirm({ title: "Débrancher la synchro Nexus", message: "Tes identifiants Nexus seront supprimés. Tu ne pourras plus créer de fiches synchronisées.", confirmLabel: "Débrancher", danger: true });
    if (!ok) return;
    await toast.guard(removeCredential({}), "Action impossible");
    toast.success("Synchro Nexus débranchée.");
  }

  const statusStyle: Record<string, { color: string; label: string; Icon: typeof ShieldCheck }> = {
    OK: { color: "var(--success)", label: "Connectée", Icon: ShieldCheck },
    INVALID: { color: "var(--danger)", label: "Identifiants invalides", Icon: TriangleAlert },
    UNTESTED: { color: "var(--warning)", label: "Non testée", Icon: TriangleAlert },
  };

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-4 py-[13px]">
        <h2 className="m-0 flex-1 text-[13.5px] font-bold">Synchronisation NexusMDT</h2>
        {configured && (() => {
          const s = statusStyle[status.status] ?? statusStyle.UNTESTED;
          return <span className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: s.color }}><s.Icon className="h-[14px] w-[14px]" /> {s.label}</span>;
        })()}
      </div>

      {!configured ? (
        <div className="p-4">
          <p className="m-0 text-[13px] text-muted">Lie ton compte NexusMDT pour créer citoyens, casiers et amendes depuis SuperMDT : ils seront écrits sur le NexusMDT <b>en ton nom</b>, puis relus ici.</p>
          {open ? (
            <div className="mt-3 rounded-sm border border-border bg-surface-2 p-[13px]">
              <div className="mb-[10px] text-[12.5px] font-semibold">Marche à suivre</div>
              <ol className="m-0 mb-3 list-decimal space-y-[6px] pl-[18px] text-[12.5px] text-muted">
                <li><b>Copie</b> le mot de passe généré ci-dessous.</li>
                <li>Va sur <b>NexusMDT → ton compte</b> et <b>change ton mot de passe</b> pour celui-ci.</li>
                <li>Renseigne ton <b>email Nexus</b> et valide.</li>
              </ol>

              <div className="mb-[5px] text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">Mot de passe dédié généré</div>
              <div className="flex gap-2">
                <input readOnly value={password} className="h-9 flex-1 rounded-sm border border-border bg-surface px-2 font-data text-[13px] outline-none" onFocus={(e) => e.target.select()} />
                <button onClick={() => { void navigator.clipboard?.writeText(password); toast.success("Mot de passe copié."); }} className="flex items-center gap-1 rounded-sm border border-border bg-surface px-2 text-[12px] font-semibold text-muted hover:border-border-strong" title="Copier"><Copy className="h-[14px] w-[14px]" /></button>
                <button onClick={() => setPassword(genPassword())} className="flex items-center gap-1 rounded-sm border border-border bg-surface px-2 text-[12px] font-semibold text-muted hover:border-border-strong" title="Régénérer"><Dices className="h-[14px] w-[14px]" /></button>
              </div>
              <div className="mt-[6px] rounded-sm border px-[10px] py-[7px] text-[11.5px]" style={{ borderColor: "var(--warning)", background: "color-mix(in srgb, var(--warning) 8%, transparent)", color: "var(--warning)" }}>
                Ce mot de passe est <b>dédié</b> à la synchro et stocké de façon réversible côté serveur. Ne réutilise jamais ton mot de passe personnel.
              </div>

              <div className="mt-3">
                <div className="mb-[5px] text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">Email du compte Nexus (@lspd.ls)</div>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="off" placeholder="prenom.nom@lspd.ls" className="h-9 w-full rounded-sm border border-border bg-surface px-2 text-[13px] outline-none focus:border-accent" />
              </div>
              <label className="mt-3 flex items-start gap-2 text-[12px] text-muted">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-[2px]" />
                <span>J'ai bien changé mon mot de passe NexusMDT pour celui affiché ci-dessus.</span>
              </label>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setOpen(false)} className="flex-1 rounded-sm border border-border bg-surface py-[8px] text-[12.5px] font-semibold hover:border-border-strong">Annuler</button>
                <button onClick={submit} disabled={busy || !email.trim() || !consent} className="flex-1 rounded-sm bg-accent py-[8px] text-[12.5px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "Test en cours…" : "Tester & activer"}</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setPassword(genPassword()); setConsent(false); setOpen(true); }} className="mt-3 rounded-sm bg-accent px-4 py-[9px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]">Utiliser SuperMDT comme MDT principal</button>
          )}
        </div>
      ) : (
        <div className="p-4">
          <div className="text-[13px]">Compte lié : <span className="font-data">{status.email}</span></div>
          {status.status === "INVALID" && status.lastError && (
            <div className="mt-2 rounded-sm border px-[10px] py-[7px] text-[12px]" style={{ borderColor: "var(--danger)", background: "color-mix(in srgb, var(--danger) 8%, transparent)", color: "var(--danger)" }}>{status.lastError}</div>
          )}
          {status.lastCheckedAt && <div className="mt-1 text-[11px] text-faint">Vérifié le {new Date(status.lastCheckedAt).toLocaleString("fr-FR")}</div>}

          {revealed !== null && (
            <div className="mt-3">
              <div className="mb-[5px] text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">Mot de passe Nexus (dédié)</div>
              <div className="flex gap-2">
                <input readOnly value={revealed} className="h-9 flex-1 rounded-sm border border-border bg-surface-2 px-2 font-data text-[13px] outline-none" onFocus={(e) => e.target.select()} />
                <button onClick={() => { void navigator.clipboard?.writeText(revealed); toast.success("Mot de passe copié."); }} className="flex items-center rounded-sm border border-border bg-surface-2 px-2 text-muted hover:border-border-strong" title="Copier"><Copy className="h-[14px] w-[14px]" /></button>
              </div>
              <div className="mt-[6px] text-[11px] text-faint">C'est le mot de passe dédié que tu as défini côté NexusMDT. Ne le partage pas.</div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={retest} disabled={busy} className="flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-[11px] py-[7px] text-[12.5px] font-semibold text-muted hover:border-border-strong disabled:opacity-50"><RefreshCw className="h-[14px] w-[14px]" /> Re-tester</button>
            <button onClick={toggleReveal} disabled={revealBusy} className="flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-[11px] py-[7px] text-[12.5px] font-semibold text-muted hover:border-border-strong disabled:opacity-50">{revealed !== null ? <><EyeOff className="h-[14px] w-[14px]" /> Masquer</> : <><Eye className="h-[14px] w-[14px]" /> {revealBusy ? "…" : "Voir mon mot de passe"}</>}</button>
            <button onClick={unlink} className="flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-[11px] py-[7px] text-[12.5px] font-semibold hover:border-border-strong" style={{ color: "var(--danger)" }}><Link2Off className="h-[14px] w-[14px]" /> Débrancher</button>
          </div>
        </div>
      )}
    </div>
  );
}
