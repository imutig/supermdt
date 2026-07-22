import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Plus, Trash2, Send, X, Check } from "lucide-react";
import { api, type Id } from "@/lib/api";
import { useToast } from "@/providers/toast";

// Gestion des webhooks Discord : une URL, un jeu d'événements abonnés.
export function WebhooksEditor() {
  const hooks = useQuery(api.webhooks.list);
  const catalog = useQuery(api.webhooks.catalog);
  const remove = useMutation(api.webhooks.remove);
  const update = useMutation(api.webhooks.update);
  const test = useAction(api.webhooks.test);
  const toast = useToast();
  const [compose, setCompose] = useState<string | null>(null); // null = fermé, "" = création

  const groups = new Map<string, { slug: string; label: string }[]>();
  for (const e of catalog ?? []) {
    if (!groups.has(e.group)) groups.set(e.group, []);
    groups.get(e.group)!.push({ slug: e.slug, label: e.label });
  }

  const runTest = async (id: string) => {
    const res = await toast.guard(test({ id: id as Id<"webhooks"> }), "Test impossible");
    if (res === "ok") toast.success("Message de test envoyé.");
    else if (res) toast.error(`Échec : ${res}`);
  };

  return (
    <div className="flex flex-col gap-[14px]">
    <BaseUrlEditor />
    <BotConfigEditor />
    <div className="rounded-card border border-border bg-surface p-[16px]">
      <div className="mb-[4px] flex items-center gap-3">
        <h2 className="m-0 flex-1 text-[15px] font-bold">Webhooks Discord</h2>
        <button onClick={() => setCompose("")} className="mdt-press flex items-center gap-[6px] rounded-[8px] border border-border bg-surface-2 px-[11px] py-[6px] text-[12px] font-semibold text-muted hover:border-border-strong">
          <Plus className="h-[14px] w-[14px]" /> Ajouter
        </button>
      </div>
      <p className="mb-[14px] mt-0 text-[12.5px] text-muted">
        Chaque webhook relaie les événements cochés vers un salon Discord. L'URL se crée dans Discord : Paramètres du salon &gt; Intégrations &gt; Webhooks.
      </p>

      {hooks === undefined ? (
        <div className="text-[12.5px] text-faint">Chargement…</div>
      ) : hooks.length === 0 ? (
        <div className="rounded-[9px] border border-dashed border-border py-[22px] text-center text-[12.5px] text-faint">
          Aucun webhook configuré.
        </div>
      ) : (
        <div className="flex flex-col gap-[10px]">
          {hooks.map((h) => (
            <div key={h._id} className="rounded-[10px] border border-border bg-surface-2 p-[13px]">
              <div className="flex flex-wrap items-center gap-[9px]">
                <span className="text-[13.5px] font-bold">{h.name}</span>
                <span className="font-data text-[11px] text-faint">{h.urlMasked}</span>
                <span
                  className="rounded-[5px] px-[6px] py-[1px] text-[10px] font-bold uppercase tracking-[0.06em]"
                  style={h.active
                    ? { background: "var(--accent-soft)", color: "var(--accent)" }
                    : { background: "var(--surface)", color: "var(--faint)" }}
                >
                  {h.active ? "Actif" : "Inactif"}
                </span>
                <div className="flex-1" />
                <button onClick={() => runTest(h._id)} title="Envoyer un test" className="mdt-press flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border border-border bg-surface text-muted hover:border-border-strong"><Send className="h-[13px] w-[13px]" /></button>
                <button onClick={() => setCompose(h._id)} className="mdt-press rounded-[7px] border border-border bg-surface px-[9px] py-[4px] text-[11.5px] font-semibold text-muted hover:border-border-strong">Modifier</button>
                <button
                  onClick={() => toast.guard(update({ id: h._id as Id<"webhooks">, active: !h.active }), "Impossible")}
                  className="mdt-press rounded-[7px] border border-border bg-surface px-[9px] py-[4px] text-[11.5px] font-semibold text-muted hover:border-border-strong"
                >
                  {h.active ? "Désactiver" : "Activer"}
                </button>
                <button onClick={() => toast.guard(remove({ id: h._id as Id<"webhooks"> }), "Suppression impossible")} className="mdt-press flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border border-border bg-surface text-faint hover:border-danger hover:text-danger"><Trash2 className="h-[13px] w-[13px]" /></button>
              </div>
              <div className="mt-[7px] text-[11.5px] text-faint">
                {h.events.length} événement{h.events.length > 1 ? "s" : ""} abonné{h.events.length > 1 ? "s" : ""}
                {h.lastAt && ` · dernier envoi ${new Date(h.lastAt).toLocaleString("fr-FR")} (${h.lastStatus})`}
              </div>
            </div>
          ))}
        </div>
      )}

      {compose !== null && (
        <WebhookModal
          id={compose || null}
          initial={hooks?.find((h) => h._id === compose) ?? null}
          groups={groups}
          onClose={() => setCompose(null)}
        />
      )}
    </div>
    </div>
  );
}

// Configuration du bot Discord : salons et heure du récapitulatif. Le bot lit
// ces réglages en direct, un changement ici n'exige pas de le redémarrer.
function BotConfigEditor() {
  const current = useQuery(api.webhooks.botConfig);
  const save = useMutation(api.webhooks.setBotConfig);
  const toast = useToast();
  const [f, setF] = useState<null | { presenceChannel: string; dailyChannel: string; rollcallChannel: string; dailyAt: string; rollcallStartAt: string; rollcallEndAt: string }>(null);
  const shown = f ?? current ?? { presenceChannel: "", dailyChannel: "", rollcallChannel: "", dailyAt: "23:30", rollcallStartAt: "", rollcallEndAt: "" };

  const field = "flex-1 rounded-[9px] border border-border bg-surface-2 px-[11px] py-[9px] font-data text-[12.5px] outline-none focus:border-accent";
  const set = (k: keyof typeof shown) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...shown, [k]: e.target.value });

  const Row = ({ label, hint, k, mono = true, ph }: { label: string; hint: string; k: keyof typeof shown; mono?: boolean; ph: string }) => (
    <div>
      <div className="mb-[4px] text-[11px] font-bold uppercase tracking-[0.07em] text-faint">{label}</div>
      <div className="flex items-center gap-2">
        <input value={shown[k]} onChange={set(k)} placeholder={ph} className={mono ? field : field.replace(" font-data", "")} />
      </div>
      <div className="mt-[3px] text-[11px] text-faint">{hint}</div>
    </div>
  );

  return (
    <div className="rounded-card border border-border bg-surface p-[16px]">
      <h2 className="m-0 mb-[4px] text-[15px] font-bold">Bot Discord</h2>
      <p className="mb-[12px] mt-0 text-[12.5px] text-muted">
        Salons où le bot publie. L'identifiant d'un salon s'obtient par clic droit sur le salon &gt; Copier l'identifiant (mode développeur activé). Laisser vide pour désactiver une fonction.
      </p>
      <div className="flex flex-col gap-[12px]">
        <Row label="Salon de présence" k="presenceChannel" ph="123456789012345678" hint="Embed des agents en service, tenu à jour en continu." />
        <Row label="Salon du récapitulatif" k="dailyChannel" ph="123456789012345678" hint="Bilan quotidien automatique." />
        <Row label="Salon de l'appel de présence" k="rollcallChannel" ph="123456789012345678" hint="Appel quotidien : les agents indiquent Présent, En retard ou Absent." />
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[110px]">
            <div className="mb-[4px] text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Récap à</div>
            <input value={shown.dailyAt} onChange={set("dailyAt")} placeholder="23:30" className={field} />
          </div>
          <div className="w-[110px]">
            <div className="mb-[4px] text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Appel de</div>
            <input value={shown.rollcallStartAt} onChange={set("rollcallStartAt")} placeholder="20:00" className={field} />
          </div>
          <div className="w-[110px]">
            <div className="mb-[4px] text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Appel jusqu'à</div>
            <input value={shown.rollcallEndAt} onChange={set("rollcallEndAt")} placeholder="21:00" className={field} />
          </div>
          <button
            onClick={async () => {
              const ok = await toast.guard(save(shown), "Enregistrement impossible");
              if (ok !== undefined) { toast.success("Configuration du bot enregistrée."); setF(null); }
            }}
            className="mdt-press ml-auto rounded-[9px] px-4 py-[9px] text-[13px] font-bold text-accent-contrast"
            style={{ background: "var(--accent)" }}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// Adresse publique du MDT : sert à construire les liens cliquables des webhooks.
function BaseUrlEditor() {
  const current = useQuery(api.webhooks.baseUrl);
  const save = useMutation(api.webhooks.setBaseUrl);
  const toast = useToast();
  const [value, setValue] = useState<string | null>(null);
  const shown = value ?? current ?? "";

  return (
    <div className="rounded-card border border-border bg-surface p-[16px]">
      <h2 className="m-0 mb-[4px] text-[15px] font-bold">Adresse du MDT</h2>
      <p className="mb-[12px] mt-0 text-[12.5px] text-muted">
        Utilisée pour rendre les notifications Discord cliquables (lien vers le dossier citoyen, le rapport...). Laissez vide pour des notifications sans lien.
      </p>
      <div className="flex gap-2">
        <input
          value={shown}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://mdt.station13.fr"
          className="flex-1 rounded-[9px] border border-border bg-surface-2 px-[11px] py-[9px] font-data text-[12.5px] outline-none focus:border-accent"
        />
        <button
          onClick={async () => {
            const ok = await toast.guard(save({ url: shown }), "Enregistrement impossible");
            if (ok !== undefined) { toast.success("Adresse enregistrée."); setValue(null); }
          }}
          className="mdt-press rounded-[9px] px-4 py-[9px] text-[13px] font-bold text-accent-contrast"
          style={{ background: "var(--accent)" }}
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}

function WebhookModal({
  id, initial, groups, onClose,
}: {
  id: string | null;
  initial: { name: string; events: string[] } | null;
  groups: Map<string, { slug: string; label: string }[]>;
  onClose: () => void;
}) {
  const create = useMutation(api.webhooks.create);
  const update = useMutation(api.webhooks.update);
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(initial?.events ?? []);

  const toggle = (slug: string) =>
    setEvents((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  const toggleGroup = (list: { slug: string }[]) => {
    const all = list.every((e) => events.includes(e.slug));
    setEvents((prev) => (all ? prev.filter((s) => !list.some((e) => e.slug === s)) : [...new Set([...prev, ...list.map((e) => e.slug)])]));
  };

  const submit = async () => {
    if (id) {
      const ok = await toast.guard(
        update({ id: id as Id<"webhooks">, name, events, url: url.trim() || undefined }),
        "Enregistrement impossible",
      );
      if (ok !== undefined) { toast.success("Webhook mis à jour."); onClose(); }
    } else {
      const ok = await toast.guard(create({ name, url, events }), "Création impossible");
      if (ok !== undefined) { toast.success("Webhook créé."); onClose(); }
    }
  };

  const field = "w-full rounded-[9px] border border-border bg-surface-2 px-[11px] py-[9px] text-[13px] outline-none focus:border-accent";

  return (
    <div onClick={onClose} className="fixed inset-0 z-[85] flex items-center justify-center p-4" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)" }}>
      <div onClick={(e) => e.stopPropagation()} className="mdt-pop flex max-h-[86vh] w-[620px] max-w-[94vw] flex-col rounded-card border border-border-strong bg-elev shadow-[0_24px_70px_rgba(0,0,0,.4)]">
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-5 py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">{id ? "Modifier le webhook" : "Nouveau webhook Discord"}</h2>
          <button onClick={onClose} className="flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto p-5">
          <div>
            <label className="mb-[5px] block text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Nom</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Salon #dispatch" />
          </div>
          <div>
            <label className="mb-[5px] block text-[11px] font-bold uppercase tracking-[0.07em] text-faint">
              URL du webhook {id && <span className="normal-case tracking-normal text-faint">(laisser vide pour ne pas changer)</span>}
            </label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} className={`${field} font-data text-[12px]`} placeholder="https://discord.com/api/webhooks/…" />
          </div>

          <div>
            <div className="mb-[7px] text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Événements relayés</div>
            <div className="flex flex-col gap-[10px]">
              {[...groups.entries()].map(([group, list]) => (
                <div key={group} className="rounded-[9px] border border-border bg-surface-2 p-[11px]">
                  <button onClick={() => toggleGroup(list)} className="mb-[6px] flex items-center gap-[6px] text-[12px] font-bold text-muted hover:text-accent">
                    <Check className="h-[13px] w-[13px]" /> {group}
                  </button>
                  <div className="flex flex-wrap gap-[6px]">
                    {list.map((e) => {
                      const on = events.includes(e.slug);
                      return (
                        <button
                          key={e.slug}
                          onClick={() => toggle(e.slug)}
                          className="mdt-press rounded-[7px] border px-[9px] py-[5px] text-[11.5px] font-semibold"
                          style={on
                            ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" }
                            : { borderColor: "var(--border)", background: "var(--surface)", color: "var(--faint)" }}
                        >
                          {e.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-t border-border px-5 py-4">
          <span className="text-[12px] text-faint">{events.length} événement{events.length > 1 ? "s" : ""} sélectionné{events.length > 1 ? "s" : ""}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="mdt-press rounded-[9px] border border-border bg-surface-2 px-4 py-[9px] text-[13px] font-semibold text-muted hover:border-border-strong">Annuler</button>
            <button onClick={submit} className="mdt-press rounded-[9px] px-4 py-[9px] text-[13px] font-bold text-white" style={{ background: "var(--accent)" }}>{id ? "Enregistrer" : "Créer"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
