import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, X, Plus, Check, Search } from "lucide-react";
import { api, type Id } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { ImageUpload } from "@/components/common/ImageUpload";

// Bandeau des avis de recherche actifs : élément principal de l'accueil dès qu'un avis est ouvert.
export function BoloBanner() {
  const { can } = useCan();
  const canView = can("bolo.view");
  const list = useQuery(api.bolos.active, canView ? {} : "skip");
  const close = useMutation(api.bolos.close);
  const toast = useToast();
  const nav = useNavigate();
  const [compose, setCompose] = useState(false);
  const canManage = can("bolo.manage");

  if (!canView) return null;
  const rows = list ?? [];
  if (rows.length === 0) {
    // Rien d'actif : on n'occupe pas la place, juste un accès discret à l'émission.
    return canManage ? (
      <>
        <button
          onClick={() => setCompose(true)}
          className="mdt-press mb-[18px] flex w-full items-center justify-center gap-2 rounded-card border border-dashed border-border py-[10px] text-[12.5px] font-semibold text-faint hover:border-border-strong hover:text-muted"
        >
          <Plus className="h-[15px] w-[15px]" /> Émettre un avis de recherche
        </button>
        {compose && <BoloCompose onClose={() => setCompose(false)} />}
      </>
    ) : null;
  }

  return (
    <div className="mb-[20px] flex flex-col gap-[12px]">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-[17px] w-[17px]" style={{ color: "var(--danger)" }} />
        <h2 className="m-0 text-[13px] font-bold uppercase tracking-[0.09em]" style={{ color: "var(--danger)" }}>
          Avis de recherche · {rows.length} actif{rows.length > 1 ? "s" : ""}
        </h2>
        <div className="h-px flex-1" style={{ background: "var(--danger)", opacity: 0.3 }} />
        {canManage && (
          <button
            onClick={() => setCompose(true)}
            className="mdt-press flex items-center gap-[6px] rounded-[8px] border border-border bg-surface-2 px-[11px] py-[6px] text-[12px] font-semibold text-muted hover:border-border-strong"
          >
            <Plus className="h-[14px] w-[14px]" /> Émettre
          </button>
        )}
      </div>

      {rows.map((b) => (
        <div
          key={b._id}
          className="mdt-reveal flex gap-[16px] overflow-hidden rounded-card border p-[16px]"
          style={{
            borderColor: b.danger ? "var(--danger)" : "var(--border-strong)",
            background: b.danger ? "color-mix(in srgb, var(--danger) 8%, var(--surface))" : "var(--surface)",
          }}
        >
          {b.imageUrl && (
            <img
              src={b.imageUrl}
              alt=""
              className="h-[128px] w-[128px] flex-shrink-0 rounded-[10px] border border-border object-cover"
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-[6px] flex flex-wrap items-center gap-[8px]">
              <span
                className="rounded-[5px] px-[7px] py-[2px] text-[10px] font-bold uppercase tracking-[0.08em] text-white"
                style={{ background: b.danger ? "var(--danger)" : "var(--warning)" }}
              >
                {b.danger ? "Armé et dangereux" : b.kind === "PERSONNE" ? "Personne recherchée" : "Véhicule recherché"}
              </span>
              <span className="text-[11px] text-faint">
                Émis par {b.author} · {new Date(b.at).toLocaleString("fr-FR")}
              </span>
            </div>
            <div className="text-[17px] font-bold leading-tight">{b.title}</div>
            {b.description && (
              <p className="mt-[6px] mb-0 whitespace-pre-wrap text-[13px] leading-[1.55] text-muted">{b.description}</p>
            )}
            <div className="mt-auto flex flex-wrap gap-[8px] pt-[12px]">
              {b.citizenId && (
                <button
                  onClick={() => nav(`/citoyens/${b.citizenId}`)}
                  className="mdt-press rounded-[8px] border border-border bg-surface-2 px-[11px] py-[6px] text-[12px] font-semibold text-muted hover:border-border-strong"
                >
                  Ouvrir le dossier
                </button>
              )}
              {canManage && (
                <button
                  onClick={() => toast.guard(close({ id: b._id as Id<"bolos"> }), "Clôture impossible")}
                  className="mdt-press flex items-center gap-[6px] rounded-[8px] border border-border bg-surface-2 px-[11px] py-[6px] text-[12px] font-semibold text-muted hover:border-border-strong"
                >
                  <Check className="h-[14px] w-[14px]" /> Clore l'avis
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      {compose && <BoloCompose onClose={() => setCompose(false)} />}
    </div>
  );
}

function BoloCompose({ onClose }: { onClose: () => void }) {
  const create = useMutation(api.bolos.create);
  const toast = useToast();
  const [kind, setKind] = useState<"PERSONNE" | "VEHICULE">("PERSONNE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [danger, setDanger] = useState(false);
  const [citizen, setCitizen] = useState<{ _id: string; label: string } | null>(null);
  const [q, setQ] = useState("");
  const results = useQuery(api.citizens.search, q.trim().length >= 2 ? { q } : "skip");

  const submit = async () => {
    if (!title.trim()) return toast.error("Intitulé requis.");
    const ok = await toast.guard(
      create({
        kind,
        title,
        description: description.trim() || undefined,
        imageUrl: imageUrl ?? undefined,
        citizenId: (citizen?._id as Id<"citizens">) ?? undefined,
        danger: danger || undefined,
      }),
      "Émission impossible",
    );
    if (ok !== undefined) { toast.success("Avis de recherche émis."); onClose(); }
  };

  const field = "w-full rounded-[9px] border border-border bg-surface-2 px-[11px] py-[9px] text-[13px] outline-none focus:border-accent";

  return (
    <div onClick={onClose} className="fixed inset-0 z-[85] flex items-center justify-center p-4" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)" }}>
      <div onClick={(e) => e.stopPropagation()} className="mdt-pop flex max-h-[86vh] w-[560px] max-w-[94vw] flex-col rounded-card border border-border-strong bg-elev shadow-[0_24px_70px_rgba(0,0,0,.4)]">
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-5 py-4">
          <AlertTriangle className="h-[17px] w-[17px]" style={{ color: "var(--danger)" }} />
          <h2 className="m-0 flex-1 text-[15px] font-bold">Émettre un avis de recherche</h2>
          <button onClick={onClose} className="flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto p-5">
          <div className="flex gap-2">
            {(["PERSONNE", "VEHICULE"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className="mdt-press flex-1 rounded-[9px] border px-3 py-[9px] text-[12.5px] font-semibold"
                style={kind === k
                  ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" }
                  : { borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--muted)" }}
              >
                {k === "PERSONNE" ? "Personne" : "Véhicule"}
              </button>
            ))}
          </div>

          <div>
            <label className="mb-[5px] block text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Intitulé</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder={kind === "PERSONNE" ? "John Doe - homicide sur agent" : "Sultan RS noire - plaque 12ABC345"} />
          </div>

          <div>
            <label className="mb-[5px] block text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Signalement</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className={`${field} resize-y`} placeholder="Description, dernière localisation, consignes d'approche…" />
          </div>

          {kind === "PERSONNE" && (
            <div>
              <label className="mb-[5px] block text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Dossier citoyen lié (optionnel)</label>
              {citizen ? (
                <div className="flex items-center gap-2 rounded-[9px] border border-border bg-surface-2 px-[11px] py-[8px] text-[13px]">
                  <span className="flex-1">{citizen.label}</span>
                  <button onClick={() => setCitizen(null)} className="text-faint hover:text-danger"><X className="h-[15px] w-[15px]" /></button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-[10px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-faint" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} className={`${field} pl-[32px]`} placeholder="Rechercher un citoyen…" />
                  </div>
                  {(results ?? []).length > 0 && (
                    <div className="mt-[6px] max-h-[150px] overflow-y-auto rounded-[9px] border border-border">
                      {(results ?? []).map((c) => (
                        <button key={c._id} onClick={() => { setCitizen({ _id: c._id, label: `${c.prenom} ${c.nom}` }); setQ(""); }} className="block w-full border-b border-border px-[11px] py-[7px] text-left text-[12.5px] last:border-0 hover:bg-surface-2">
                          {c.prenom} {c.nom}{c.dateNaissance ? <span className="text-faint"> · {c.dateNaissance}</span> : null}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div>
            <label className="mb-[5px] block text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Photo (optionnelle)</label>
            <ImageUpload value={imageUrl} onChange={setImageUrl} aspect="square" className="w-[140px]" />
          </div>

          <label className="flex cursor-pointer items-center gap-[9px] text-[13px]">
            <input type="checkbox" checked={danger} onChange={(e) => setDanger(e.target.checked)} className="h-[15px] w-[15px] accent-[var(--danger)]" />
            Armé et dangereux (avis prioritaire)
          </label>
        </div>

        <div className="flex flex-shrink-0 justify-end gap-2 border-t border-border px-5 py-4">
          <button onClick={onClose} className="mdt-press rounded-[9px] border border-border bg-surface-2 px-4 py-[9px] text-[13px] font-semibold text-muted hover:border-border-strong">Annuler</button>
          <button onClick={submit} className="mdt-press rounded-[9px] px-4 py-[9px] text-[13px] font-bold text-white" style={{ background: "var(--danger)" }}>Émettre l'avis</button>
        </div>
      </div>
    </div>
  );
}
