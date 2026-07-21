import { Hero, Callout } from "./kit";

type Eq = { name: string; type: string; purpose: string; color: string; reco: string };
const EQUIP: Eq[] = [
  { name: "Pepper-spray", type: "Gaz au poivre", purpose: "Dissuasion", color: "#16a34a", reco: "Recommandé pour la dispersion et pour troubler la vue d'individus." },
  { name: "Matraque", type: "Contondante", purpose: "Défense", color: "#3b82f6", reco: "Recommandée pour le combat de près (close combat)." },
  { name: "Taser", type: "Pistolet à Impulsion Électrique (P.I.E)", purpose: "Force intermédiaire", color: "#eab308", reco: "Recommandé pour l'immobilisation. Peut comporter un risque en surcharge ou sur une personne à risque cardiaque." },
  { name: "Glock-17", type: "Arme de poing", purpose: "Létal", color: "#dc2626", reco: "Recommandé en cas de danger immédiat pour sa vie ou si une arme est présente sur un individu. Ne peut pas être utilisé en non-létal." },
  { name: "Gilet", type: "Gilet pare-balles / pare-couteaux", purpose: "Défense", color: "#9ca3af", reco: "Recommandé en cas de menace, de manière appropriée." },
  { name: "Uniforme", type: "Tenue réglementaire", purpose: "Réglementaire", color: "#2f6df0", reco: "Port obligatoire durant toute la patrouille." },
];

export function Equipement() {
  return (
    <div>
      <Hero title="Équipement" accent="« classique »" subtitle="La dotation portée en patrouille, de la simple dissuasion à l'usage létal." />
      <div className="flex flex-col gap-[12px] mdt-stagger">
        {EQUIP.map((e) => (
          <div key={e.name} className="mdt-lift flex items-stretch overflow-hidden rounded-card border border-border bg-surface">
            <div className="w-[6px] flex-shrink-0" style={{ background: e.color }} />
            <div className="flex flex-1 flex-col gap-[6px] p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-[220px] items-center gap-[12px]">
                <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] text-[15px] font-extrabold" style={{ background: `color-mix(in srgb, ${e.color} 16%, transparent)`, color: e.color }}>
                  {e.name.charAt(0)}
                </span>
                <div>
                  <div className="text-[15px] font-bold">{e.name}</div>
                  <div className="text-[11.5px] text-faint">{e.type}</div>
                </div>
              </div>
              <div className="flex-shrink-0">
                <span className="inline-flex items-center rounded-full px-[11px] py-[4px] text-[11px] font-bold uppercase tracking-[0.05em]" style={{ background: `color-mix(in srgb, ${e.color} 15%, transparent)`, color: e.color }}>
                  {e.purpose}
                </span>
              </div>
              <div className="flex-1 text-[12.5px] italic leading-relaxed text-muted">{e.reco}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5"><Callout color="var(--accent)" title="Rappel">Port obligatoire de tous les éléments de dotation durant la patrouille.</Callout></div>
    </div>
  );
}
