import { useRef, useState } from "react";
import { X, Download } from "lucide-react";
import { toPng } from "html-to-image";
import { useQuery } from "convex/react";
import { api, type Doc, type Id } from "@/lib/api";
import { useMe } from "@/hooks/useMe";
import { fmtMatricule } from "@/components/common/AgentTag";
import { Stamp, Info, Stat } from "@/components/docs/OfficialDoc";

function sexeLabel(s?: string) {
  return s === "H" ? "Homme" : s === "F" ? "Femme" : s ?? "-";
}
function fmtDur(seconds: number) {
  if (!seconds) return "Aucune";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [h ? `${h}h` : "", m ? `${m}min` : ""].filter(Boolean).join(" ") || `${seconds}s`;
}

// Extrait de casier judiciaire imprimable (item 5) - document officiel Station 13.
export function CasierExtract({ citizen, onClose }: { citizen: Doc<"citizens">; onClose: () => void }) {
  const casier = useQuery(api.casier.byCitizen, { citizenId: citizen._id as Id<"citizens"> });
  const me = useMe();
  const active = (casier ?? []).filter((e) => e.status !== "ANNULEE");
  const totalFine = active.reduce((s, e) => s + e.totalFine, 0);
  const totalJail = active.reduce((s, e) => s + e.totalJailSeconds, 0);
  const ref = `EXT-${String(citizen._id).slice(-6).toUpperCase()}-${new Date().getFullYear()}`;
  const officerName = me ? `${fmtMatricule(me.agent.matricule) ?? ""} ${me.agent.prenomRP} ${me.agent.nomRP}`.trim() : "-";
  const docRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  async function download() {
    if (!docRef.current) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(docRef.current, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true, style: { margin: "0" } });
      const a = document.createElement("a");
      a.download = `${ref}-${citizen.nom}-${citizen.prenom}.png`;
      a.href = dataUrl;
      a.click();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col" style={{ background: "rgba(0,0,0,.6)" }}>
      {/* Barre d'outils */}
      <div className="flex flex-shrink-0 items-center gap-3 bg-elev px-5 py-3 shadow">
        <span className="text-[13px] font-bold">Extrait de casier judiciaire</span>
        <div className="flex-1" />
        <button onClick={download} disabled={busy} className="mdt-press flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">
          <Download className="h-[15px] w-[15px]" /> {busy ? "Génération…" : "Télécharger (image)"}
        </button>
        <button onClick={onClose} className="flex h-[34px] w-[34px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
      </div>

      {/* Zone du document */}
      <div className="flex flex-1 justify-center overflow-auto p-6">
        <div ref={docRef} className="h-fit bg-white p-[48px] text-[#0b0d10] shadow-[0_10px_40px_rgba(0,0,0,.3)]" style={{ width: 820, flexShrink: 0, fontFamily: "'Inter',system-ui,sans-serif" }}>
          {/* En-tête */}
          <div className="flex items-center gap-4 border-b-2 pb-4" style={{ borderColor: "#49A24A" }}>
            <img src="/logos/logo-badge-light.svg" alt="Station 13" style={{ width: 70, height: 70 }} />
            <div className="flex-1">
              <div className="text-[19px] font-extrabold tracking-tight">LSPD · Station 13</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.15em]" style={{ color: "#2E6B2F" }}>Los Santos Police Department · Newton Street</div>
            </div>
            <div className="text-right text-[10.5px]" style={{ color: "#5c626e" }}>
              <div className="font-data font-semibold">{ref}</div>
              <div>Émis le {new Date().toLocaleDateString("fr-FR")}</div>
            </div>
          </div>

          <h1 className="mb-1 mt-6 text-center text-[22px] font-extrabold uppercase tracking-[0.06em]">Extrait de casier judiciaire</h1>
          <div className="mb-6 text-center text-[11.5px]" style={{ color: "#5c626e" }}>Document officiel · délivré par le département de police de Los Santos</div>

          {/* Identité */}
          <div className="mb-5 rounded-[8px] border p-4" style={{ borderColor: "#e5e8ec", background: "#f7f8fa" }}>
            <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: "#2E6B2F" }}>Identité du concerné</div>
            <div className="grid grid-cols-3 gap-3 text-[12.5px]">
              <Info label="Nom complet" value={`${citizen.prenom} ${citizen.nom}`} />
              <Info label="Date de naissance" value={citizen.dateNaissance ?? "-"} />
              <Info label="Sexe" value={sexeLabel(citizen.sexe)} />
              <Info label="Nationalité" value={citizen.nationalite ?? "-"} />
              <Info label="Téléphone" value={citizen.telephone ?? "-"} />
              <Info label="Adresse" value={citizen.adresse ?? "-"} />
            </div>
          </div>

          {/* Synthèse */}
          <div className="mb-5 grid grid-cols-3 gap-3">
            <Stat label="Entrées au casier" value={String(active.length)} />
            <Stat label="Total amendes" value={`$${totalFine.toLocaleString("fr-FR")}`} />
            <Stat label="Total peine" value={fmtDur(totalJail)} />
          </div>

          {/* Détail */}
          <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: "#2E6B2F" }}>Antécédents judiciaires</div>
          {active.length === 0 ? (
            <div className="rounded-[8px] border p-6 text-center text-[13px]" style={{ borderColor: "#e5e8ec", color: "#5c626e" }}>Aucun antécédent judiciaire enregistré.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {active.map((e) => (
                <div key={e._id} className="rounded-[8px] border p-3" style={{ borderColor: "#e5e8ec" }}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded-[4px] px-[7px] py-[2px] text-[10px] font-bold uppercase" style={{ background: e.arrestType === "DOSSIER" ? "#fde8e8" : "#eaf5ea", color: e.arrestType === "DOSSIER" ? "#c02828" : "#2E6B2F" }}>{e.arrestType === "DOSSIER" ? "Dossier" : "Rapport"}</span>
                    <span className="flex-1 text-[12.5px] font-semibold">{e.charges.join(", ") || "-"}</span>
                    <span className="font-data text-[11px]" style={{ color: "#5c626e" }}>{new Date(e.at).toLocaleDateString("fr-FR")}</span>
                  </div>
                  <div className="flex gap-5 text-[11.5px]" style={{ color: "#5c626e" }}>
                    <span>Amende <b style={{ color: "#0b0d10" }}>${e.totalFine.toLocaleString("fr-FR")}</b></span>
                    <span>Peine <b style={{ color: "#0b0d10" }}>{fmtDur(e.totalJailSeconds)}</b></span>
                    {e.lieu && <span>Lieu {e.lieu}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pied */}
          <div className="mt-8 flex items-end justify-between border-t pt-4 text-[11px]" style={{ borderColor: "#e5e8ec", color: "#5c626e" }}>
            <div>
              <div>Délivré par {officerName}</div>
              <div>LSPD · Station 13 · Lucky Thirteen</div>
              <div className="mt-1">Fait à Los Santos, le {new Date().toLocaleDateString("fr-FR")}</div>
            </div>
            <div className="relative flex items-end gap-4">
              {/* Signature (auto) */}
              <div className="text-center">
                <div
                  className="leading-none"
                  style={{ fontFamily: "'Dancing Script',cursive", fontSize: 30, fontWeight: 700, color: "#12233b" }}
                >
                  {me ? `${me.agent.prenomRP} ${me.agent.nomRP}` : "Station 13"}
                </div>
                <div className="mt-1 h-[1px] w-[170px]" style={{ background: "#cfd4db" }} />
                <div className="mt-1 text-[10px] uppercase tracking-[0.08em]" style={{ color: "#98a0ab" }}>Signature de l'agent</div>
              </div>
              {/* Cachet officiel (auto) */}
              <Stamp />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
