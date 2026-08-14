import { useState } from "react";
import { X } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useToast } from "@/providers/toast";
import { ImageGallery } from "@/components/common/ImageGallery";

const FIELD = "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";

// Modal d'ajout de sanction disciplinaire, réutilisable (§12).
// `initialAgentId` : agent pré-sélectionné (depuis la fiche agent).
export function SanctionModal({
  initialAgentId,
  onClose,
}: {
  initialAgentId?: Id<"agents">;
  onClose: () => void;
}) {
  const roster = useQuery(api.agents.roster);
  const sanctionTypes = useQuery(api.disciplines.sanctionTypes);
  const create = useMutation(api.disciplines.create);
  const toast = useToast();
  const [agentId, setAgentId] = useState<string>(initialAgentId ?? "");
  const [typeId, setTypeId] = useState(""); // id du type catalogue, ou "__custom__"
  const [customSanction, setCustomSanction] = useState("");
  const [level, setLevel] = useState("AVERTISSEMENT");
  const [motif, setMotif] = useState("");
  const [evidence, setEvidence] = useState<string[]>([]);
  const [untilOrder, setUntilOrder] = useState(false); // mise à pied jusqu'à nouvel ordre
  const [untilWall, setUntilWall] = useState(""); // datetime-local de fin
  const [busy, setBusy] = useState(false);

  const isCustom = typeId === "__custom__";
  const selectedType = (sanctionTypes ?? []).find((t) => t._id === typeId);
  const sanction = isCustom ? customSanction.trim() : (selectedType?.name ?? "");
  // Mise à pied si le type coché suspend, ou si le niveau est « Mise à pied ».
  const suspends = level === "MISE_A_PIED" || !!selectedType?.suspends;

  async function submit() {
    if (!agentId || !sanction || !motif.trim()) return;
    setBusy(true);
    const r = await toast.guard(create({
      agentId: agentId as Id<"agents">,
      sanction,
      level,
      motif: motif.trim(),
      imageUrls: evidence.length ? evidence : undefined,
      suspends: suspends || undefined,
      suspendedUntilWall: suspends && !untilOrder && untilWall ? untilWall : undefined,
    }), "Ajout impossible");
    setBusy(false);
    if (r !== undefined) {
      toast.success(suspends ? "Sanction ajoutée · agent mis à pied." : "Sanction ajoutée.");
      onClose();
    }
  }

  return (
    <div onClick={(e) => { e.stopPropagation(); onClose(); }} className="fixed inset-0 z-[70] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[460px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">Nouvelle sanction</h2>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-4">
          <L label="Agent">
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={FIELD}>
              <option value="">Sélectionner…</option>
              {(roster ?? []).map((a) => (
                <option key={a._id} value={a._id}>
                  {a.matricule != null ? `#${String(a.matricule).padStart(5, "0")} ` : ""}{a.prenomRP} {a.nomRP}
                </option>
              ))}
            </select>
          </L>
          <div className="grid grid-cols-2 gap-3">
            <L label="Niveau">
              <select value={level} onChange={(e) => setLevel(e.target.value)} className={FIELD}>
                <option value="AVERTISSEMENT">Avertissement</option>
                <option value="BLAME">Blâme</option>
                <option value="MISE_A_PIED">Mise à pied</option>
                <option value="RADIATION">Radiation</option>
                <option value="AUTRE">Autre</option>
              </select>
            </L>
            <L label="Sanction">
              <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className={FIELD}>
                <option value="">Sélectionner…</option>
                {(sanctionTypes ?? []).map((t) => (
                  <option key={t._id} value={t._id}>{t.name}{t.suspends ? " (mise à pied)" : ""}</option>
                ))}
                <option value="__custom__">Personnalisée…</option>
              </select>
            </L>
          </div>
          {isCustom && (
            <L label="Sanction personnalisée">
              <input value={customSanction} onChange={(e) => setCustomSanction(e.target.value)} placeholder="Ex. Mise à pied jusqu'au prochain dispatch" className={FIELD} />
            </L>
          )}
          {suspends && (
            <div className="rounded-sm border border-border bg-surface-2 p-3" style={{ borderColor: "color-mix(in srgb, var(--danger) 35%, var(--border))" }}>
              <div className="mb-[8px] flex items-center gap-2 text-[12px] font-semibold" style={{ color: "var(--danger)" }}>Mise à pied — le compte sera suspendu</div>
              <label className="mb-2 flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" checked={untilOrder} onChange={(e) => setUntilOrder(e.target.checked)} />
                Jusqu'à nouvel ordre (pas de date de fin)
              </label>
              {!untilOrder && (
                <div>
                  <div className="mb-[5px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Fin de la mise à pied (heure de Paris)</div>
                  <input type="datetime-local" value={untilWall} onChange={(e) => setUntilWall(e.target.value)} className={FIELD} />
                </div>
              )}
            </div>
          )}
          <L label="Motif">
            <textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={4} className="w-full resize-y rounded-sm border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-accent" />
          </L>
          <L label="Preuves">
            <ImageGallery urls={evidence} onChange={setEvidence} emptyLabel="Aucune preuve jointe." />
          </L>
        </div>
        <div className="flex flex-shrink-0 gap-2 border-t border-border px-[18px] py-4">
          <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
          <button onClick={submit} disabled={busy || !agentId || !sanction || !motif.trim()} className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">
            {busy ? "…" : "Enregistrer"}
          </button>
        </div>
      </div>
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
