import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "convex/react";
import { Phone, Clock } from "lucide-react";
import { api, type Id } from "@/lib/api";
import { fmtMatricule } from "./AgentTag";
import { fmtAnciennete } from "@/lib/anciennete";
import { SkeletonRows } from "./Skeleton";

// Ouvre une « carte profil » flottante ancrée à l'élément cliqué (façon carte de
// profil Twitter, mais version MDT). Réutilisable sur n'importe quelle photo.
type Opener = (agentId: string, anchor: DOMRect) => void;
const Ctx = createContext<Opener | null>(null);
export function useAgentCard() { return useContext(Ctx); }

export function AgentCardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ agentId: string; anchor: DOMRect } | null>(null);
  const open = useCallback<Opener>((agentId, anchor) => setState({ agentId, anchor }), []);
  return (
    <Ctx.Provider value={open}>
      {children}
      {state && <FloatingCard agentId={state.agentId} anchor={state.anchor} onClose={() => setState(null)} />}
    </Ctx.Provider>
  );
}

const W = 290;
function FloatingCard({ agentId, anchor, onClose }: { agentId: string; anchor: DOMRect; onClose: () => void }) {
  const card = useQuery(api.agents.card, { agentId: agentId as Id<"agents"> });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const left = Math.min(Math.max(anchor.left, 8), window.innerWidth - W - 8);
  // La photo pro est un portrait : la carte peut être haute. On l'ouvre du côté
  // (dessous / dessus) qui offre le plus de place, et on borne sa hauteur à
  // l'espace disponible (défilement interne si besoin) pour ne jamais déborder.
  const spaceBelow = window.innerHeight - anchor.bottom - 12;
  const spaceAbove = anchor.top - 12;
  const below = spaceBelow >= spaceAbove;
  const maxHeight = Math.max(220, Math.floor(below ? spaceBelow : spaceAbove));
  const vpos: React.CSSProperties = below ? { top: anchor.bottom + 6 } : { bottom: window.innerHeight - anchor.top + 6 };
  const initials = (card?.name ?? "").split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  const grade = card?.grade;

  return createPortal(
    <>
      {/* Voile invisible : ferme au clic extérieur sans assombrir (feel « hovercard »). */}
      <div className="fixed inset-0 z-[95]" onClick={onClose} onPointerDown={onClose} />
      <div
        className="fixed z-[96] overflow-y-auto overflow-x-hidden rounded-card border border-border-strong bg-elev shadow-[0_20px_60px_rgba(0,0,0,.42)]"
        style={{ left, ...vpos, width: W, maxHeight, animation: "mdtFade .12s ease" }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {card === undefined ? (
          <div className="p-5"><SkeletonRows rows={3} /></div>
        ) : card === null ? (
          <div className="p-4 text-[13px] text-muted">Agent introuvable.</div>
        ) : (
          <>
            {/* Photo mise en valeur en tête : affichée en entier (aspect naturel). */}
            <div className="relative">
              {card.avatarUrl ? (
                <img src={card.avatarUrl} alt="" className="block h-auto w-full object-contain" />
              ) : (
                <div className="flex aspect-[3/4] w-full items-center justify-center bg-surface-2 text-[54px] font-bold text-muted">{initials}</div>
              )}
              <div className="absolute inset-x-0 bottom-0 h-[60px]" style={{ background: "linear-gradient(to top, rgba(0,0,0,.55), transparent)" }} />
              <span
                className="absolute left-[12px] top-[12px] inline-flex items-center gap-[5px] rounded-[6px] px-[8px] py-[3px] text-[11px] font-bold"
                style={{ background: card.onDuty ? "rgba(22,163,74,.9)" : "rgba(0,0,0,.5)", color: "#fff" }}
              >
                <span className="h-[7px] w-[7px] rounded-full" style={{ background: card.onDuty ? "#8ef0a0" : "#cbd5e1" }} />
                {card.suspended ? "Mis à pied" : card.onDuty ? "En service" : "Hors service"}
              </span>
            </div>

            <div className="p-[14px]">
              <div className="flex items-center gap-[7px]">
                {grade && (
                  <span className="rounded-[5px] border px-[6px] py-[2px] text-[10px] font-bold uppercase tracking-[0.05em]" style={grade.color ? { borderColor: grade.color, color: grade.color } : { borderColor: "var(--border)", color: "var(--muted)" }}>{grade.name}</span>
                )}
                {fmtMatricule(card.matricule) && <span className="font-data text-[12px] font-semibold text-accent">{fmtMatricule(card.matricule)}</span>}
              </div>
              <h3 className="m-0 mt-[5px] truncate text-[16px] font-bold">{card.name}</h3>

              <div className="mt-[10px] flex flex-col gap-[7px] text-[12.5px]">
                <div className="flex items-center gap-[8px]">
                  <Phone className="h-[14px] w-[14px] flex-shrink-0 text-faint" />
                  <span className="font-data">{card.phone ?? <span className="text-faint">Téléphone non renseigné</span>}</span>
                </div>
                {card.dateEntree != null && (
                  <div className="flex items-center gap-[8px] text-muted">
                    <Clock className="h-[14px] w-[14px] flex-shrink-0 text-faint" />
                    <span>{fmtAnciennete(card.dateEntree)} de service</span>
                  </div>
                )}
                {card.divisions.length > 0 && (
                  <div className="flex flex-wrap gap-[5px] pt-[2px]">
                    {card.divisions.map((d, i) => (
                      <span key={i} className="rounded-[5px] border border-border bg-surface-2 px-[8px] py-[2px] text-[11px] font-semibold text-muted">{d}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}
