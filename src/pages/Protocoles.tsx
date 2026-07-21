import { useState } from "react";
import { X, Pencil, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Doc, type Id } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { RichTextEditor } from "@/components/common/RichTextEditor";
import { ImageGallery } from "@/components/common/ImageGallery";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/common/Skeleton";
import { Clover } from "@/components/common/Clover";

export function Protocoles() {
  const list = useQuery(api.protocols.list);
  const remove = useMutation(api.protocols.remove);
  const { can } = useCan();
  const toast = useToast();
  const canManage = can("protocoles.create") || can("protocoles.edit") || can("protocoles.delete");
  const [modal, setModal] = useState<{ p: Doc<"protocols"> | null } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px] flex items-center gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Protocoles</h1>
        <div className="flex-1" />
        {canManage && (
          <button onClick={() => setModal({ p: null })} className="mdt-press flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06]">
            <Clover color="#fff" size={17} /> Protocole
          </button>
        )}
      </div>

      <div className="flex flex-col gap-[14px]">
        {list === undefined ? (
          <div className="flex flex-col gap-[14px]">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} style={{ height: 90 }} />)}
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-card border border-border bg-surface"><EmptyState title="Aucun protocole" message="Documentez une première procédure." /></div>
        ) : (
          list.map((p) => (
            <div key={p._id} className="rounded-card border border-border bg-surface p-4">
              <div className="flex items-center gap-2">
                {p.category && (
                  <span className="rounded-[5px] bg-surface-2 px-[7px] py-[2px] text-[10px] font-bold uppercase tracking-[0.06em] text-muted">{p.category}</span>
                )}
                <span className="text-[14px] font-bold">{p.title}</span>
                <div className="flex-1" />
                {canManage && (
                  <>
                    <button onClick={() => setModal({ p })} className="flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><Pencil className="h-[14px] w-[14px]" /></button>
                    {confirmDel === p._id ? (
                      <span className="flex items-center gap-1">
                        <button onClick={async () => { const r = await toast.guard(remove({ id: p._id }), "Suppression impossible"); setConfirmDel(null); if (r !== undefined) toast.success("Supprimé."); }} className="rounded-[4px] px-[7px] py-[4px] text-[11px] font-semibold text-white" style={{ background: "var(--danger)" }}>Ok</button>
                        <button onClick={() => setConfirmDel(null)} className="flex h-[24px] w-[24px] items-center justify-center rounded-sm border border-border text-muted"><X className="h-[13px] w-[13px]" /></button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmDel(p._id)} className="flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface-2 text-faint hover:text-danger"><Trash2 className="h-[14px] w-[14px]" /></button>
                    )}
                  </>
                )}
              </div>
              <div className="mt-2">
                <RichTextEditor value={p.content} editable={false} />
              </div>
              {p.imageUrls && p.imageUrls.length > 0 && (
                <div className="mt-3">
                  <ImageGallery urls={p.imageUrls} />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {modal && <ProtocolModal p={modal.p} onClose={() => setModal(null)} />}
    </div>
  );
}

function ProtocolModal({ p, onClose }: { p: Doc<"protocols"> | null; onClose: () => void }) {
  const upsert = useMutation(api.protocols.upsert);
  const toast = useToast();
  const [title, setTitle] = useState(p?.title ?? "");
  const [category, setCategory] = useState(p?.category ?? "");
  const [content, setContent] = useState(p?.content ?? "");
  const [images, setImages] = useState<string[]>(p?.imageUrls ?? []);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setBusy(true);
    const r = await toast.guard(
      upsert({ id: (p?._id as Id<"protocols">) ?? undefined, title: title.trim(), category: category.trim() || undefined, content, imageUrls: images }),
      "Enregistrement impossible",
    );
    setBusy(false);
    if (r !== undefined) {
      toast.success("Protocole enregistré.");
      onClose();
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[620px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">{p ? "Éditer le protocole" : "Nouveau protocole"}</h2>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-4">
          <div className="grid grid-cols-[2fr_1fr] gap-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre" className="h-10 rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent" />
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Catégorie" className="h-10 rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent" />
          </div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Contenu</div>
          <RichTextEditor value={content} onChange={setContent} />
          <div className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Images</div>
          <ImageGallery urls={images} onChange={setImages} />
        </div>
        <div className="flex flex-shrink-0 gap-2 border-t border-border px-[18px] py-4">
          <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
          <button onClick={save} disabled={busy || !title.trim()} className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "…" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}
