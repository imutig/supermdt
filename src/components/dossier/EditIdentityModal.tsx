import { useState } from "react";
import { X, Trash2, Skull } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Doc } from "@/lib/api";
import { ImageUpload } from "@/components/common/ImageUpload";
import { DateField } from "@/components/common/DateField";
import { useToast } from "@/providers/toast";

const FIELD =
  "h-[46px] w-full rounded-[10px] border border-border bg-surface-2 px-[14px] text-[13px] text-text outline-none focus:border-accent";

export function EditIdentityModal({
  citizen,
  onClose,
  onArchived,
}: {
  citizen: Doc<"citizens">;
  onClose: () => void;
  onArchived: () => void;
}) {
  const update = useMutation(api.citizens.update);
  const archive = useMutation(api.citizens.archive);
  const setDeceased = useMutation(api.citizens.setDeceased);
  const opts = useQuery(api.configEditors.options);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [mugshotUrl, setMugshotUrl] = useState<string | null>(citizen.mugshotUrl ?? null);

  const [f, setF] = useState({
    prenom: citizen.prenom, nom: citizen.nom,
    dateNaissance: citizen.dateNaissance ?? "",
    sexe: citizen.sexe === "H" || citizen.sexe === "F" ? citizen.sexe : "",
    nationalite: citizen.nationalite ?? "", telephone: citizen.telephone ?? "", email: citizen.email ?? "",
    taille: citizen.taille ?? "", poids: citizen.poids ?? "", ethnie: citizen.ethnie ?? "", cheveux: citizen.cheveux ?? "", yeux: citizen.yeux ?? "",
    adresse: citizen.adresse ?? "", groupe: citizen.groupe ?? "", metier: citizen.metier ?? "",
    descriptionPhysique: citizen.descriptionPhysique ?? "",
  });
  type FK = keyof typeof f;
  const set = (k: FK) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const valid = f.prenom.trim() && f.nom.trim();

  async function save() {
    if (!valid) return;
    setBusy(true);
    try {
      const t = (s: string) => s.trim() || undefined;
      await update({
        id: citizen._id, prenom: f.prenom.trim(), nom: f.nom.trim(),
        dateNaissance: t(f.dateNaissance), sexe: t(f.sexe), nationalite: t(f.nationalite),
        telephone: t(f.telephone), email: t(f.email),
        taille: t(f.taille), poids: t(f.poids), ethnie: t(f.ethnie), cheveux: t(f.cheveux), yeux: t(f.yeux),
        descriptionPhysique: t(f.descriptionPhysique),
        adresse: t(f.adresse), groupe: t(f.groupe), metier: t(f.metier),
        mugshotUrl: mugshotUrl ?? undefined,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const sel = (list: { _id: string; name: string }[] | undefined, k: FK) => (
    <select value={f[k]} onChange={set(k)} className={FIELD}>
      <option value="">-</option>
      {(list ?? []).map((o) => <option key={o._id} value={o.name}>{o.name}</option>)}
    </select>
  );

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[640px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <div className="flex-1">
            <h2 className="m-0 text-[15px] font-bold">Éditer l'identité</h2>
            <div className="mt-[2px] text-[12px] text-muted">{citizen.prenom} {citizen.nom}</div>
          </div>
          <button
            onClick={async () => { const r = await toast.guard(setDeceased({ id: citizen._id, deceased: !citizen.deceased }), "Action impossible"); if (r !== undefined) toast.success(citizen.deceased ? "Marqué vivant." : "Marqué décédé."); }}
            className="flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-[10px] py-[7px] text-[12px] font-semibold hover:border-border-strong"
            style={{ color: citizen.deceased ? "var(--muted)" : "var(--danger)" }}
            title="Basculer le statut décédé"
          >
            <Skull className="h-[14px] w-[14px]" /> {citizen.deceased ? "Décédé" : "Marquer décédé"}
          </button>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex min-h-0 flex-1 gap-4 overflow-y-auto px-[18px] py-4">
          <div className="w-[110px] flex-shrink-0">
            <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Mugshot</div>
            <ImageUpload value={mugshotUrl} onChange={setMugshotUrl} aspect="portrait" />
          </div>
          <div className="flex-1 space-y-4">
            <Group title="Identité">
              <L label="Prénom *"><input value={f.prenom} onChange={set("prenom")} className={FIELD} /></L>
              <L label="Nom *"><input value={f.nom} onChange={set("nom")} className={FIELD} /></L>
              <L label="Date de naissance"><DateField value={f.dateNaissance} onChange={(v) => setF({ ...f, dateNaissance: v })} /></L>
              <L label="Sexe"><select value={f.sexe} onChange={set("sexe")} className={FIELD}><option value="">-</option><option value="H">Homme</option><option value="F">Femme</option></select></L>
              <L label="Nationalité"><input value={f.nationalite} onChange={set("nationalite")} className={FIELD} /></L>
              <L label="Téléphone"><input value={f.telephone} onChange={set("telephone")} className={`${FIELD} font-data`} /></L>
              <L label="Email"><input value={f.email} onChange={set("email")} className={FIELD} /></L>
            </Group>
            <Group title="Description physique">
              <L label="Taille"><input value={f.taille} onChange={set("taille")} className={FIELD} /></L>
              <L label="Poids"><input value={f.poids} onChange={set("poids")} className={FIELD} /></L>
              <L label="Ethnie">{sel(opts?.ethnies, "ethnie")}</L>
              <L label="Cheveux">{sel(opts?.hairColors, "cheveux")}</L>
              <L label="Yeux">{sel(opts?.eyeColors, "yeux")}</L>
              <L label="Signes distinctifs"><input value={f.descriptionPhysique} onChange={set("descriptionPhysique")} className={FIELD} /></L>
            </Group>
            <Group title="Situation">
              <L label="Adresse"><input value={f.adresse} onChange={set("adresse")} className={FIELD} /></L>
              <L label="Groupe / appartenance">{sel(opts?.citizenGroups, "groupe")}</L>
              <L label="Emploi"><input value={f.metier} onChange={set("metier")} className={FIELD} /></L>
            </Group>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 border-t border-border px-[18px] py-4">
          {confirm ? (
            <>
              <span className="flex-1 text-[12.5px] text-muted">Archiver ce dossier ?</span>
              <button onClick={() => setConfirm(false)} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold text-text hover:border-border-strong">Annuler</button>
              <button onClick={async () => { setBusy(true); try { await archive({ id: citizen._id }); onArchived(); } finally { setBusy(false); } }} disabled={busy} className="rounded-sm px-4 py-[10px] text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--danger)" }}>{busy ? "…" : "Archiver"}</button>
            </>
          ) : (
            <>
              <button onClick={() => setConfirm(true)} className="flex items-center gap-[7px] rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong" style={{ color: "var(--danger)" }}><Trash2 className="h-4 w-4" /> Supprimer le dossier</button>
              <div className="flex-1" />
              <button onClick={save} disabled={busy || !valid} className="rounded-sm bg-accent px-5 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "…" : "Enregistrer"}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-accent">{title}</div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">{label}</div>
      {children}
    </div>
  );
}
