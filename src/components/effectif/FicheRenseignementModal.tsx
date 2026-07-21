import { useEffect, useState, type ReactNode } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/api";
import { useMe } from "@/hooks/useMe";
import { useToast } from "@/providers/toast";
import { fmtBadge } from "@/components/common/AgentTag";

type Enfant = { nom: string; ddn: string };
type Data = Record<string, string>;
type Field = { k: string; l: string; ph?: string; opts?: string[] };
type Item =
  | { t: "field"; f: Field }
  | { t: "bool"; flag: string; q: string; fields: Field[] }
  | { t: "enfants"; flag: string; q: string };

const SEXE = ["Homme", "Femme", "Autre"];
const ETAT = ["Célibataire", "En couple", "Pacsé(e)", "Marié(e)", "Divorcé(e)", "Veuf / Veuve"];
const SANG = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const PERMIS = ["Oui", "Non", "Suspendu"];

const SECTIONS: { title: string; items: Item[] }[] = [
  { title: "Information personnelle", items: [
    { t: "field", f: { k: "nomComplet", l: "Nom complet" } },
    { t: "field", f: { k: "prenom", l: "Prénom" } },
    { t: "field", f: { k: "nomFamille", l: "Nom de famille" } },
    { t: "field", f: { k: "dateNaissance", l: "Date de naissance", ph: "JJ/MM/AAAA" } },
    { t: "field", f: { k: "lieuNaissance", l: "Lieu de naissance" } },
    { t: "field", f: { k: "nationalite", l: "Nationalité" } },
    { t: "field", f: { k: "sexe", l: "Sexe", opts: SEXE } },
    { t: "field", f: { k: "etatCivil", l: "État civil", opts: ETAT } },
    { t: "field", f: { k: "telephone", l: "Téléphone mobile" } },
  ] },
  { title: "Informations médicales", items: [
    { t: "field", f: { k: "groupeSanguin", l: "Groupe sanguin", opts: SANG } },
    { t: "bool", flag: "hasAllergies", q: "Avez-vous des allergies ?", fields: [{ k: "allergies", l: "Précisez" }] },
    { t: "bool", flag: "hasConditions", q: "Avez-vous des conditions médicales ?", fields: [{ k: "conditions", l: "Précisez" }] },
    { t: "bool", flag: "hasMedicaments", q: "Prenez-vous des médicaments ?", fields: [{ k: "medicaments", l: "Lesquels" }] },
    { t: "bool", flag: "hasMedecin", q: "Avez-vous un médecin traitant ?", fields: [{ k: "medecin", l: "Nom du médecin" }] },
    { t: "bool", flag: "hasUrgence", q: "Avez-vous un contact d'urgence ?", fields: [{ k: "urgenceNom", l: "Nom" }, { k: "urgenceLien", l: "Lien de parenté" }, { k: "urgenceTel", l: "Téléphone" }] },
  ] },
  { title: "Informations familiales", items: [
    { t: "bool", flag: "hasConjoint", q: "Avez-vous un conjoint ?", fields: [{ k: "conjointNom", l: "Nom du conjoint" }, { k: "conjointDDN", l: "Date de naissance", ph: "JJ/MM/AAAA" }] },
    { t: "enfants", flag: "hasEnfants", q: "Avez-vous des enfants ?" },
    { t: "field", f: { k: "pereNom", l: "Nom et prénom du père" } },
    { t: "field", f: { k: "mereNom", l: "Nom et prénom de la mère" } },
  ] },
  { title: "Autres informations", items: [
    { t: "field", f: { k: "langues", l: "Langues parlées" } },
    { t: "field", f: { k: "matricule", l: "Numéro de badge" } },
    { t: "field", f: { k: "codeCasier", l: "Code casier" } },
    { t: "field", f: { k: "permisConduire", l: "Permis de conduire", opts: PERMIS } },
    { t: "bool", flag: "hasVehicule", q: "Possédez-vous un véhicule ?", fields: [{ k: "vehiculeMarque", l: "Marque" }, { k: "vehiculeModele", l: "Modèle" }, { k: "vehiculeAnnee", l: "Année" }, { k: "vehiculeImmat", l: "Immatriculation" }] },
  ] },
];

export function FicheRenseignementModal({ onClose }: { onClose: () => void }) {
  const mine = useQuery(api.fiche.mine);
  const save = useMutation(api.fiche.save);
  const me = useMe();
  const toast = useToast();
  const [d, setD] = useState<Data>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [enfants, setEnfants] = useState<Enfant[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showErr, setShowErr] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loaded || mine === undefined) return;
    setLoaded(true);
    const raw = (mine.data ?? {}) as Record<string, unknown>;
    const base: Data = {};
    for (const [k, val] of Object.entries(raw)) if (typeof val === "string") base[k] = val;
    if (me) {
      base.matricule ??= fmtBadge(me.agent.matricule) ?? "";
      base.prenom ??= me.agent.prenomRP;
      base.nomFamille ??= me.agent.nomRP;
    }
    const savedFlags = (raw.flags as Record<string, boolean>) ?? {};
    const kids = Array.isArray(raw.enfants) ? (raw.enfants as Enfant[]) : [];
    // Rétro-compat : si pas de flags, on déduit de la présence des valeurs.
    const inferred: Record<string, boolean> = {};
    for (const s of SECTIONS) for (const it of s.items) {
      if (it.t === "bool") inferred[it.flag] = savedFlags[it.flag] ?? it.fields.some((f) => (base[f.k] ?? "").trim());
      if (it.t === "enfants") inferred[it.flag] = savedFlags[it.flag] ?? kids.length > 0;
    }
    setD(base);
    setFlags(inferred);
    setEnfants(kids);
  }, [mine, loaded, me]);

  const set = (k: string) => (v: string) => setD((p) => ({ ...p, [k]: v }));
  const setFlag = (flag: string, v: boolean) => setFlags((p) => ({ ...p, [flag]: v }));
  const setEnfant = (i: number, k: keyof Enfant, v: string) => setEnfants((p) => p.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

  // Champs requis = tous les "field" + les sous-champs des groupes activés.
  const requiredKeys: string[] = [];
  for (const s of SECTIONS) for (const it of s.items) {
    if (it.t === "field") requiredKeys.push(it.f.k);
    if (it.t === "bool" && flags[it.flag]) for (const f of it.fields) requiredKeys.push(f.k);
  }
  const missing = requiredKeys.filter((k) => !(d[k] ?? "").trim());
  const enfantsBad = flags.hasEnfants && (enfants.length === 0 || enfants.some((c) => !c.nom.trim() || !c.ddn.trim()));
  const incomplete = missing.length > 0 || !!enfantsBad;

  async function submit() {
    if (incomplete) { setShowErr(true); toast.error("Complétez tous les champs requis."); return; }
    setBusy(true);
    const r = await toast.guard(save({ data: { ...d, flags, enfants: flags.hasEnfants ? enfants : [] } }), "Envoi impossible");
    setBusy(false);
    if (r !== undefined) { toast.success("Fiche de renseignement enregistrée."); onClose(); }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-[85] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[620px] max-w-[96vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <div className="flex-1">
            <h2 className="m-0 text-[15px] font-bold">Fiche de renseignement individuel</h2>
            <div className="mt-[2px] text-[12px] text-muted">Répondez aux questions ; les champs affichés sont obligatoires.</div>
          </div>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-[18px] py-4">
          {SECTIONS.map((s) => (
            <div key={s.title} className="flex flex-col gap-[10px]">
              <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-accent">{s.title}</div>
              {(() => {
                // Regroupe les "field" consécutifs dans une grille 2 colonnes.
                const out: ReactNode[] = [];
                let buf: Item[] = [];
                const flush = (key: string) => {
                  if (!buf.length) return;
                  out.push(
                    <div key={key} className="grid grid-cols-2 gap-[10px]">
                      {buf.map((it) => it.t === "field" && <F key={it.f.k} f={it.f} v={d[it.f.k]} onChange={set(it.f.k)} bad={showErr && !(d[it.f.k] ?? "").trim()} />)}
                    </div>,
                  );
                  buf = [];
                };
                s.items.forEach((it, i) => {
                  if (it.t === "field") { buf.push(it); return; }
                  flush("g" + i);
                  if (it.t === "bool") {
                    const on = !!flags[it.flag];
                    out.push(
                      <div key={it.flag} className="rounded-sm border border-border bg-surface-2 px-[12px] py-[10px]">
                        <BoolRow q={it.q} on={on} onChange={(v) => setFlag(it.flag, v)} />
                        {on && (
                          <div className="mt-[10px] grid grid-cols-2 gap-[10px]">
                            {it.fields.map((f) => <F key={f.k} f={f} v={d[f.k]} onChange={set(f.k)} bad={showErr && !(d[f.k] ?? "").trim()} />)}
                          </div>
                        )}
                      </div>,
                    );
                  } else {
                    const on = !!flags[it.flag];
                    out.push(
                      <div key={it.flag} className="rounded-sm border border-border bg-surface-2 px-[12px] py-[10px]">
                        <BoolRow q={it.q} on={on} onChange={(v) => setFlag(it.flag, v)} />
                        {on && (
                          <div className="mt-[10px] flex flex-col gap-2">
                            {enfants.map((c, ci) => (
                              <div key={ci} className="flex items-end gap-2">
                                <div className="flex-1"><F f={{ k: "n", l: "Nom et prénom" }} v={c.nom} onChange={(v) => setEnfant(ci, "nom", v)} bad={showErr && !c.nom.trim()} /></div>
                                <div className="w-[150px]"><F f={{ k: "d", l: "Date de naissance", ph: "JJ/MM/AAAA" }} v={c.ddn} onChange={(v) => setEnfant(ci, "ddn", v)} bad={showErr && !c.ddn.trim()} /></div>
                                <button onClick={() => setEnfants((p) => p.filter((_, j) => j !== ci))} className="mb-[6px] text-faint hover:text-danger"><Trash2 className="h-4 w-4" /></button>
                              </div>
                            ))}
                            <button onClick={() => setEnfants((p) => [...p, { nom: "", ddn: "" }])} className="flex w-fit items-center gap-1 rounded-[6px] border border-border bg-surface px-[8px] py-[4px] text-[11.5px] font-semibold hover:border-border-strong"><Plus className="h-3 w-3" /> Ajouter un enfant</button>
                            {showErr && enfants.length === 0 && <span className="text-[11.5px] text-danger">Ajoutez au moins un enfant.</span>}
                          </div>
                        )}
                      </div>,
                    );
                  }
                });
                flush("end");
                return out;
              })()}
            </div>
          ))}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 border-t border-border px-[18px] py-4">
          {showErr && incomplete && <span className="text-[12px] font-semibold text-danger">{missing.length + (enfantsBad ? 1 : 0)} champ(s) manquant(s)</span>}
          <div className="flex-1" />
          <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Fermer</button>
          <button onClick={submit} disabled={busy} className="rounded-sm bg-accent px-5 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "…" : "Enregistrer & envoyer"}</button>
        </div>
      </div>
    </div>
  );
}

function BoolRow({ q, on, onChange }: { q: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex-1 text-[13px] font-semibold">{q}</span>
      <div className="flex overflow-hidden rounded-[7px] border border-border">
        {([["Oui", true], ["Non", false]] as const).map(([label, val]) => (
          <button key={label} onClick={() => onChange(val)} className="px-[14px] py-[5px] text-[12px] font-semibold" style={on === val ? { background: val ? "var(--accent)" : "var(--surface-2)", color: val ? "var(--accent-contrast)" : "var(--muted)" } : { background: "transparent", color: "var(--muted)" }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function F({ f, v, onChange, bad }: { f: Field; v?: string; onChange: (v: string) => void; bad?: boolean }) {
  const cls = "h-9 w-full rounded-sm border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";
  const style = { borderColor: bad ? "var(--danger)" : "var(--border)" };
  return (
    <label className="block">
      <span className="mb-[4px] block text-[11px] text-muted">{f.l}</span>
      {f.opts ? (
        <select value={v ?? ""} onChange={(e) => onChange(e.target.value)} className={cls} style={style}>
          <option value="">- Sélectionner -</option>
          {f.opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input value={v ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={f.ph} className={cls} style={style} />
      )}
    </label>
  );
}
