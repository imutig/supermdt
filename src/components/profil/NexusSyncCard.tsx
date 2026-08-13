import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { RefreshCw, Link2Off, ShieldCheck, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/providers/toast";
import { useDialogs } from "@/components/detective/dialogs";

// Onboarding « Utiliser SuperMDT comme MDT principal » : l'agent enregistre ses
// identifiants Nexus (dédiés) pour poster en son nom. Le mot de passe est chiffré
// au repos mais réversible côté serveur -> on impose un mot de passe dédié.
export function NexusSyncCard() {
  const status = useQuery(api.nexusSync.myStatus);
  const saveCredential = useAction(api.nexusSync.saveCredential);
  const testCredential = useAction(api.nexusSync.testCredential);
  const removeCredential = useMutation(api.nexusSync.removeCredential);
  const toast = useToast();
  const dialogs = useDialogs();

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (status === undefined) return null;

  const configured = status.configured;

  async function submit() {
    if (!email.trim() || !password || !consent) return;
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
              <div className="rounded-sm border px-[10px] py-[8px] text-[12px]" style={{ borderColor: "var(--warning)", background: "color-mix(in srgb, var(--warning) 8%, transparent)", color: "var(--warning)" }}>
                ⚠️ Ton mot de passe sera stocké de façon <b>réversible</b> (chiffré, mais déchiffrable côté serveur pour la synchro). Utilise un <b>mot de passe dédié et unique</b> pour ce compte Nexus.
              </div>
              <div className="mt-3 grid gap-3">
                <div>
                  <div className="mb-[5px] text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">Email Nexus</div>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="off" className="h-9 w-full rounded-sm border border-border bg-surface px-2 text-[13px] outline-none focus:border-accent" />
                </div>
                <div>
                  <div className="mb-[5px] text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">Mot de passe dédié</div>
                  <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" className="h-9 w-full rounded-sm border border-border bg-surface px-2 text-[13px] outline-none focus:border-accent" />
                </div>
                <label className="flex items-start gap-2 text-[12px] text-muted">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-[2px]" />
                  <span>Je comprends que ce mot de passe est stocké de façon réversible et j'utilise un mot de passe dédié à ce compte.</span>
                </label>
                <div className="flex gap-2">
                  <button onClick={() => setOpen(false)} className="flex-1 rounded-sm border border-border bg-surface py-[8px] text-[12.5px] font-semibold hover:border-border-strong">Annuler</button>
                  <button onClick={submit} disabled={busy || !email.trim() || !password || !consent} className="flex-1 rounded-sm bg-accent py-[8px] text-[12.5px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "Test en cours…" : "Tester & activer"}</button>
                </div>
              </div>
            </div>
          ) : (
            <button onClick={() => setOpen(true)} className="mt-3 rounded-sm bg-accent px-4 py-[9px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]">Utiliser SuperMDT comme MDT principal</button>
          )}
        </div>
      ) : (
        <div className="p-4">
          <div className="text-[13px]">Compte lié : <span className="font-data">{status.email}</span></div>
          {status.status === "INVALID" && status.lastError && (
            <div className="mt-2 rounded-sm border px-[10px] py-[7px] text-[12px]" style={{ borderColor: "var(--danger)", background: "color-mix(in srgb, var(--danger) 8%, transparent)", color: "var(--danger)" }}>{status.lastError}</div>
          )}
          {status.lastCheckedAt && <div className="mt-1 text-[11px] text-faint">Vérifié le {new Date(status.lastCheckedAt).toLocaleString("fr-FR")}</div>}
          <div className="mt-3 flex gap-2">
            <button onClick={retest} disabled={busy} className="flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-[11px] py-[7px] text-[12.5px] font-semibold text-muted hover:border-border-strong disabled:opacity-50"><RefreshCw className="h-[14px] w-[14px]" /> Re-tester</button>
            <button onClick={unlink} className="flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-[11px] py-[7px] text-[12.5px] font-semibold hover:border-border-strong" style={{ color: "var(--danger)" }}><Link2Off className="h-[14px] w-[14px]" /> Débrancher</button>
          </div>
        </div>
      )}
    </div>
  );
}
