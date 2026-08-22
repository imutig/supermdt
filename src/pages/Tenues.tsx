import { useMemo, useState } from "react";
import { X, Pencil, Trash2, Search, Copy, Shirt } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { ImageUpload } from "@/components/common/ImageUpload";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/common/Skeleton";
import { Clover } from "@/components/common/Clover";

type Tenue = {
  _id: string; name: string; category: string | null; tags: string[];
  photoUrl: string | null; code: string; position: number;
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Tenues() {
  const list = useQuery(api.tenues.list);
  const remove = useMutation(api.tenues.remove);
  const { can } = useCan();
  const toast = useToast();
  const canManage = can("tenues.manage");
  const [modal, setModal] = useState<{ t: Tenue | null } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = norm(q.trim());
    if (!needle) return list ?? [];
    return (list ?? []).filter((t) =>
      norm(`${t.name} ${t.category ?? ""} ${t.tags.join(" ")}`).includes(needle),
    );
  }, [list, q]);

  async function copyCode(t: Tenue) {
    try {
      await navigator.clipboard.writeText(t.code);
      toast.success(`Code de « ${t.name} » copié.`);
    } catch {
      toast.error("Copie impossible.");
    }
  }

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[16px] flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Tenues</h1>
        <div className="flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-sm border border-border bg-surface-2 px-3">
          <Search className="h-4 w-4 flex-shrink-0 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (nom, catégorie, tag)…" className="h-full flex-1 bg-transparent text-[13px] outline-none" />
          {q && <button onClick={() => setQ("")} className="text-faint hover:text-text"><X className="h-[15px] w-[15px]" /></button>}
        </div>
        {canManage && (
          <button onClick={() => setModal({ t: null })} className="mdt-press flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]">
            <Clover color="#fff" size={17} /> Tenue
          </button>
        )}
      </div>

      <div className="mb-[14px] text-[12.5px] text-muted">Clique sur une tenue pour copier son code automatiquement.</div>

      {list === undefined ? (
        <div className="grid grid-cols-2 gap-[14px] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} style={{ height: 260 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-card border border-border bg-surface">
          <EmptyState title={q ? "Aucun résultat" : "Aucune tenue"} message={q ? "Aucune tenue ne correspond à la recherche." : "Ajoute une première tenue au référentiel."} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-[14px] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((t) => (
            <div key={t._id} className="group flex flex-col overflow-hidden rounded-card border border-border bg-surface transition-shadow hover:shadow-[0_4px_16px_var(--shadow)]">
              {/* Photo cliquable : copie le code */}
              <button
                onClick={() => copyCode(t)}
                title="Copier le code de la tenue"
                className="relative aspect-[3/4] w-full overflow-hidden bg-surface-2"
              >
                {t.photoUrl ? (
                  <img src={t.photoUrl} alt="" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-faint"><Shirt className="h-10 w-10" /></div>
                )}
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-[5px] bg-black/55 py-[5px] text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <Copy className="h-[12px] w-[12px]" /> Copier le code
                </span>
              </button>
              <div className="flex flex-1 flex-col gap-[6px] p-[10px]">
                <button onClick={() => copyCode(t)} className="text-left text-[13.5px] font-bold leading-tight hover:text-accent" title="Copier le code">{t.name}</button>
                {t.category && (
                  <span className="w-fit rounded-[5px] bg-surface-2 px-[7px] py-[2px] text-[10px] font-bold uppercase tracking-[0.06em] text-muted">{t.category}</span>
                )}
                {t.tags.length > 0 && (
                  <div className="flex flex-wrap gap-[4px]">
                    {t.tags.map((tag) => (
                      <span key={tag} className="rounded-[4px] border border-border px-[5px] py-px text-[9.5px] font-semibold text-faint">#{tag}</span>
                    ))}
                  </div>
                )}
                {canManage && (
                  <div className="mt-auto flex items-center gap-2 pt-[6px]">
                    <button onClick={() => setModal({ t })} className="flex h-[26px] w-[26px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><Pencil className="h-[13px] w-[13px]" /></button>
                    {confirmDel === t._id ? (
                      <span className="flex items-center gap-1">
                        <button onClick={async () => { const r = await toast.guard(remove({ id: t._id as Id<"tenues"> }), "Suppression impossible"); setConfirmDel(null); if (r !== undefined) toast.success("Tenue supprimée."); }} className="rounded-[4px] px-[7px] py-[3px] text-[11px] font-semibold text-white" style={{ background: "var(--danger)" }}>Ok</button>
                        <button onClick={() => setConfirmDel(null)} className="flex h-[22px] w-[22px] items-center justify-center rounded-sm border border-border text-muted"><X className="h-[12px] w-[12px]" /></button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmDel(t._id)} className="flex h-[26px] w-[26px] items-center justify-center rounded-sm border border-border bg-surface-2 text-faint hover:text-danger"><Trash2 className="h-[13px] w-[13px]" /></button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <TenueModal t={modal.t} onClose={() => setModal(null)} />}
    </div>
  );
}

function TenueModal({ t, onClose }: { t: Tenue | null; onClose: () => void }) {
  const upsert = useMutation(api.tenues.upsert);
  const toast = useToast();
  const [name, setName] = useState(t?.name ?? "");
  const [category, setCategory] = useState(t?.category ?? "");
  const [tags, setTags] = useState((t?.tags ?? []).join(", "));
  const [photoUrl, setPhotoUrl] = useState<string | null>(t?.photoUrl ?? null);
  const [code, setCode] = useState(t?.code ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim() || !code.trim()) return;
    setBusy(true);
    const r = await toast.guard(
      upsert({
        id: (t?._id as Id<"tenues">) ?? undefined,
        name: name.trim(),
        category: category.trim() || undefined,
        tags: tags.split(",").map((x) => x.trim()).filter(Boolean),
        photoUrl,
        code: code.trim(),
      }),
      "Enregistrement impossible",
    );
    setBusy(false);
    if (r !== undefined) { toast.success("Tenue enregistrée."); onClose(); }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[480px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">{t ? "Éditer la tenue" : "Nouvelle tenue"}</h2>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto px-[18px] py-4">
          <L label="Nom">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Tenue de patrouille" className={FIELD} />
          </L>
          <L label="Catégorie">
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex. Patrouille, SWAT, Cérémonie…" className={FIELD} />
          </L>
          <L label="Tags (séparés par des virgules)">
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="hiver, moto, féminin…" className={FIELD} />
          </L>
          <L label="Photo">
            <div className="w-[180px]"><ImageUpload value={photoUrl} onChange={setPhotoUrl} aspect="portrait" /></div>
          </L>
          <L label="Code de la tenue">
            <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={3} placeholder="Colle ici le code à copier" className="w-full resize-y rounded-sm border border-border bg-surface-2 px-3 py-2 font-data text-[13px] outline-none focus:border-accent" />
          </L>
        </div>
        <div className="flex flex-shrink-0 gap-2 border-t border-border px-[18px] py-4">
          <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
          <button onClick={save} disabled={busy || !name.trim() || !code.trim()} className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "…" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}

const FIELD = "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">{label}</div>
      {children}
    </div>
  );
}
