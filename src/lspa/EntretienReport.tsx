import { useRef, useState } from "react";
import { X, Download } from "lucide-react";
import { toPng } from "html-to-image";
import { Stamp, Info } from "@/components/docs/OfficialDoc";

type Snap = { text: string; explanation?: string; note?: number };

// Rapport d'entretien imprimable (image) à remettre au candidat. Il présente
// UNIQUEMENT les résultats (questions + notes + score), JAMAIS les explications
// / réponses attendues des questions.
export function EntretienReport({
  id, prenom, nom, dob, questions, scenario, score, createdByName, createdAt, onClose,
}: {
  id: string;
  prenom: string; nom: string; dob: string;
  questions: Snap[]; scenario: Snap | null; score: number | null;
  createdByName: string; createdAt: number;
  onClose: () => void;
}) {
  const docRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const ref = `ENT-${String(id).slice(-6).toUpperCase()}-${new Date().getFullYear()}`;

  const noted = questions.filter((q) => q.note != null);
  const verdict =
    score == null ? { label: "Non évalué", color: "#5c626e" }
      : score >= 70 ? { label: "Favorable", color: "#2E6B2F" }
        : score >= 40 ? { label: "À confirmer", color: "#b8860b" }
          : { label: "Défavorable", color: "#c02828" };

  async function download() {
    if (!docRef.current) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(docRef.current, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true, style: { margin: "0" } });
      const a = document.createElement("a");
      a.download = `${ref}-${nom}-${prenom}.png`;
      a.href = dataUrl;
      a.click();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="fixed inset-0 z-[85] flex flex-col" style={{ background: "rgba(0,0,0,.6)" }}>
      <div className="flex flex-shrink-0 items-center gap-3 bg-elev px-5 py-3 shadow">
        <span className="text-[13px] font-bold">Rapport d'entretien</span>
        <div className="flex-1" />
        <button onClick={download} disabled={busy} className="mdt-press flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">
          <Download className="h-[15px] w-[15px]" /> {busy ? "Génération…" : "Télécharger (image)"}
        </button>
        <button onClick={onClose} className="flex h-[34px] w-[34px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex flex-1 justify-center overflow-auto p-6">
        <div ref={docRef} className="h-fit bg-white p-[48px] text-[#0b0d10] shadow-[0_10px_40px_rgba(0,0,0,.3)]" style={{ width: 820, flexShrink: 0, fontFamily: "'Inter',system-ui,sans-serif" }}>
          {/* En-tête */}
          <div className="flex items-center gap-4 border-b-2 pb-4" style={{ borderColor: "#49A24A" }}>
            <img src="/logos/logo-badge-light.svg" alt="Station 13" style={{ width: 70, height: 70 }} />
            <div className="flex-1">
              <div className="text-[19px] font-extrabold tracking-tight">LSPD · Station 13</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.15em]" style={{ color: "#2E6B2F" }}>Los Santos Police Academy · Newton Street</div>
            </div>
            <div className="text-right text-[10.5px]" style={{ color: "#5c626e" }}>
              <div className="font-data font-semibold">{ref}</div>
              <div>Émis le {new Date().toLocaleDateString("fr-FR")}</div>
            </div>
          </div>

          <h1 className="mb-1 mt-6 text-center text-[22px] font-extrabold uppercase tracking-[0.06em]">Rapport d'entretien</h1>
          <div className="mb-6 text-center text-[11.5px]" style={{ color: "#5c626e" }}>Résultats de l'entretien de recrutement · Los Santos Police Academy</div>

          {/* Identité */}
          <div className="mb-5 rounded-[8px] border p-4" style={{ borderColor: "#e5e8ec", background: "#f7f8fa" }}>
            <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: "#2E6B2F" }}>Candidat</div>
            <div className="grid grid-cols-3 gap-3 text-[12.5px]">
              <Info label="Nom complet" value={`${prenom} ${nom}`} />
              <Info label="Date de naissance" value={dob || "-"} />
              <Info label="Date de l'entretien" value={new Date(createdAt).toLocaleDateString("fr-FR")} />
            </div>
          </div>

          {/* Score global + verdict */}
          <div className="mb-6 flex items-stretch gap-3">
            <div className="flex flex-1 flex-col items-center justify-center rounded-[8px] border p-4" style={{ borderColor: "#e5e8ec" }}>
              <div className="text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: "#5c626e" }}>Score global</div>
              <div className="font-data text-[38px] font-extrabold leading-none" style={{ color: verdict.color }}>{score != null ? `${score}%` : "-"}</div>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center rounded-[8px] border p-4" style={{ borderColor: "#e5e8ec" }}>
              <div className="text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: "#5c626e" }}>Avis</div>
              <div className="mt-1 rounded-full px-4 py-[5px] text-[15px] font-extrabold uppercase tracking-[0.04em]" style={{ background: `${verdict.color}18`, color: verdict.color }}>{verdict.label}</div>
            </div>
          </div>

          {/* Détail des questions (SANS explications) */}
          <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: "#2E6B2F" }}>Détail de l'évaluation</div>
          {questions.length === 0 ? (
            <div className="rounded-[8px] border p-6 text-center text-[13px]" style={{ borderColor: "#e5e8ec", color: "#5c626e" }}>Aucune question évaluée.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {questions.map((q, i) => <NoteRow key={i} index={i + 1} text={q.text} note={q.note} />)}
            </div>
          )}

          {scenario && (
            <div className="mt-4">
              <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: "#2E6B2F" }}>Mise en situation <span className="font-normal lowercase tracking-normal" style={{ color: "#98a0ab" }}>· 25% du score</span></div>
              <NoteRow index={null} text={scenario.text} note={scenario.note} />
            </div>
          )}

          {/* Pied */}
          <div className="mt-8 flex items-end justify-between border-t pt-4 text-[11px]" style={{ borderColor: "#e5e8ec", color: "#5c626e" }}>
            <div>
              <div>Entretien conduit par {createdByName}</div>
              <div>Los Santos Police Academy · Station 13</div>
              <div className="mt-1">{noted.length}/{questions.length} question(s) notée(s) · Fait à Los Santos, le {new Date().toLocaleDateString("fr-FR")}</div>
            </div>
            <div className="relative flex items-end gap-4">
              <div className="flex flex-col items-center">
                <div style={{ fontFamily: "'Dancing Script',cursive", fontSize: 28, fontWeight: 700, color: "#12233b", lineHeight: 1.15, whiteSpace: "nowrap" }}>{createdByName}</div>
                <div className="mt-1 h-[1px]" style={{ background: "#cfd4db", width: "max(170px, 100%)" }} />
                <div className="mt-1 whitespace-nowrap text-[10px] uppercase tracking-[0.08em]" style={{ color: "#98a0ab" }}>Signature de l'instructeur</div>
              </div>
              <Stamp />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function noteColor(note?: number): string {
  if (note == null) return "#98a0ab";
  if (note >= 4) return "#2E6B2F";
  if (note >= 3) return "#b8860b";
  return "#c02828";
}
function NoteRow({ index, text, note }: { index: number | null; text: string; note?: number }) {
  const color = noteColor(note);
  return (
    <div className="flex items-center gap-3 rounded-[8px] border p-3" style={{ borderColor: "#e5e8ec" }}>
      {index != null && <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: "#eaf5ea", color: "#2E6B2F" }}>{index}</span>}
      <span className="min-w-0 flex-1 text-[12.5px] font-medium leading-[1.4]">{text}</span>
      {/* Barre de note 1-5 */}
      <span className="flex flex-shrink-0 items-center gap-[3px]">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className="h-[9px] w-[9px] rounded-full" style={{ background: note != null && n <= note ? color : "#e5e8ec" }} />
        ))}
      </span>
      <span className="w-[46px] flex-shrink-0 text-right font-data text-[13px] font-bold" style={{ color }}>{note != null ? `${note}/5` : "-"}</span>
    </div>
  );
}
