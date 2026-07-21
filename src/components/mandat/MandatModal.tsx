import { useState } from "react";
import { X } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useApp } from "@/providers/app-state";

export function MandatModal() {
  const { mandatOpen, closeMandat, mandatCitizenId } = useApp();
  const citizenId = mandatCitizenId as Id<"citizens"> | null;
  const types = useQuery(api.mandats.listTypes, mandatOpen ? {} : "skip");
  const citizen = useQuery(api.citizens.getById, citizenId ? { id: citizenId } : "skip");
  const create = useMutation(api.mandats.create);
  const [typeId, setTypeId] = useState("");
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);

  if (!mandatOpen) return null;

  const effectiveTypeId = typeId || types?.[0]?._id || "";

  async function submit() {
    if (!citizenId || !effectiveTypeId || !motif.trim()) return;
    setBusy(true);
    try {
      await create({ citizenId, typeId: effectiveTypeId as Id<"mandatTypes">, motif: motif.trim() });
      setMotif("");
      setTypeId("");
      closeMandat();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={closeMandat}
      className="absolute inset-0 z-50 flex justify-end"
      style={{
        background: "var(--scrim)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        animation: "mdtFade .15s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-[480px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]"
        style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}
      >
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <div className="flex-1">
            <h2 className="m-0 text-[15px] font-bold">Émettre un mandat</h2>
            <div className="mt-[2px] text-[12px] text-muted">
              {citizen ? `${citizen.citizen.prenom} ${citizen.citizen.nom}` : "…"} ·{" "}
              <span className="font-data">{citizen?.citizen.dateNaissance ?? ""}</span>
            </div>
          </div>
          <button
            onClick={closeMandat}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[18px] py-4">
          <div>
            <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
              Type de mandat
            </div>
            <select
              value={effectiveTypeId}
              onChange={(e) => setTypeId(e.target.value)}
              className="h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] text-text outline-none focus:border-accent"
            >
              {(types ?? []).map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                  {t.marksWanted ? " (marque « Recherché »)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
              Motif
            </div>
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              rows={4}
              placeholder="Motif du mandat…"
              className="w-full resize-y rounded-sm border border-border bg-surface-2 px-3 py-2 text-[13px] text-text outline-none focus:border-accent"
            />
          </div>
          <div className="text-[11.5px] text-faint">
            Un mandat actif de type « arrêt » marque automatiquement le citoyen comme « Recherché ».
          </div>
        </div>

        <div className="flex flex-shrink-0 gap-2 border-t border-border px-[18px] py-4">
          <button
            onClick={closeMandat}
            className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold text-text hover:border-border-strong"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={busy || !motif.trim() || !citizenId}
            className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50"
          >
            {busy ? "…" : "Émettre le mandat"}
          </button>
        </div>
      </div>
    </div>
  );
}
