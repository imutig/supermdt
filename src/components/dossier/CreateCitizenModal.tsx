import { useState } from "react";
import { X } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/api";
import { ImageUpload } from "@/components/common/ImageUpload";
import { DateField } from "@/components/common/DateField";

const FIELD =
  "h-[46px] w-full rounded-[10px] border border-border bg-surface-2 px-[14px] text-[13px] text-text outline-none focus:border-accent";

type Form = {
  prenom: string; nom: string; dateNaissance: string; sexe: string; nationalite: string;
  telephone: string; email: string;
  taille: string; poids: string; ethnie: string; cheveux: string; yeux: string;
  adresse: string; groupe: string; metier: string;
};

// Création d'un dossier citoyen (item 8). Plus d'empreinte.
export function CreateCitizenModal({
  prenom: prenom0,
  nom: nom0,
  onClose,
  onCreated,
}: {
  prenom: string;
  nom: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const create = useMutation(api.citizens.create);
  const opts = useQuery(api.configEditors.options);
  const [busy, setBusy] = useState(false);
  const [mugshotUrl, setMugshotUrl] = useState<string | null>(null);
  const [f, setF] = useState<Form>({
    prenom: prenom0, nom: nom0, dateNaissance: "", sexe: "", nationalite: "",
    telephone: "", email: "", taille: "", poids: "", ethnie: "", cheveux: "", yeux: "",
    adresse: "", groupe: "", metier: "",
  });
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const valid = f.prenom.trim() && f.nom.trim();

  async function submit() {
    if (!valid) return;
    setBusy(true);
    try {
      const trim = (s: string) => s.trim() || undefined;
      const id = await create({
        prenom: f.prenom.trim(), nom: f.nom.trim(),
        dateNaissance: trim(f.dateNaissance), sexe: trim(f.sexe), nationalite: trim(f.nationalite),
        telephone: trim(f.telephone), email: trim(f.email),
        taille: trim(f.taille), poids: trim(f.poids), ethnie: trim(f.ethnie), cheveux: trim(f.cheveux), yeux: trim(f.yeux),
        adresse: trim(f.adresse), groupe: trim(f.groupe), metier: trim(f.metier),
        mugshotUrl: mugshotUrl ?? undefined,
      });
      onCreated(id);
    } finally {
      setBusy(false);
    }
  }

  const sel = (list: { _id: string; name: string }[] | undefined, k: keyof Form) => (
    <select value={f[k]} onChange={set(k)} className={FIELD}>
      <option value="">-</option>
      {(list ?? []).map((o) => <option key={o._id} value={o.name}>{o.name}</option>)}
    </select>
  );

  return (
    <div onClick={onClose} className="fixed inset-0 z-[70] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[620px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">Nouveau dossier citoyen</h2>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex min-h-0 flex-1 gap-4 overflow-y-auto px-[18px] py-4">
          <div className="w-[118px] flex-shrink-0">
            <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Mugshot</div>
            <ImageUpload value={mugshotUrl} onChange={setMugshotUrl} aspect="portrait" />
          </div>
          <div className="flex-1 space-y-4">
            <Group title="Identité">
              <L label="Prénom *"><input value={f.prenom} onChange={set("prenom")} autoFocus className={FIELD} /></L>
              <L label="Nom *"><input value={f.nom} onChange={set("nom")} className={FIELD} /></L>
              <L label="Date de naissance"><DateField value={f.dateNaissance} onChange={(v) => setF({ ...f, dateNaissance: v })} /></L>
              <L label="Sexe">
                <select value={f.sexe} onChange={set("sexe")} className={FIELD}><option value="">-</option><option value="H">Homme</option><option value="F">Femme</option></select>
              </L>
              <L label="Nationalité"><input value={f.nationalite} onChange={set("nationalite")} className={FIELD} /></L>
              <L label="Téléphone"><input value={f.telephone} onChange={set("telephone")} className={`${FIELD} font-data`} /></L>
              <L label="Email (optionnel)"><input value={f.email} onChange={set("email")} className={FIELD} /></L>
            </Group>

            <Group title="Description physique">
              <L label="Taille"><input value={f.taille} onChange={set("taille")} placeholder="ex. 1m80" className={FIELD} /></L>
              <L label="Poids"><input value={f.poids} onChange={set("poids")} placeholder="ex. 78 kg" className={FIELD} /></L>
              <L label="Ethnie">{sel(opts?.ethnies, "ethnie")}</L>
              <L label="Cheveux">{sel(opts?.hairColors, "cheveux")}</L>
              <L label="Yeux">{sel(opts?.eyeColors, "yeux")}</L>
            </Group>

            <Group title="Situation">
              <L label="Adresse"><input value={f.adresse} onChange={set("adresse")} className={FIELD} /></L>
              <L label="Groupe / appartenance">{sel(opts?.citizenGroups, "groupe")}</L>
              <L label="Emploi"><input value={f.metier} onChange={set("metier")} className={FIELD} /></L>
            </Group>
          </div>
        </div>

        <div className="flex flex-shrink-0 gap-2 border-t border-border px-[18px] py-4">
          <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold text-text hover:border-border-strong">Annuler</button>
          <button onClick={submit} disabled={busy || !valid} className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "…" : "Créer le dossier"}</button>
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
