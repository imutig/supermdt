import type { ReactNode } from "react";
import { Gauge, Car, Users, Volume2, Ban, Pill, Swords, Skull, Package, VenetianMask, Bomb, Syringe } from "lucide-react";
import { Hero, Grid } from "./kit";

function GravityPage({ title, accent, color, definition, sanction, examples }: { title: string; accent: string; color: string; definition: ReactNode; sanction: ReactNode; examples: { icon: ReactNode; label: string }[] }) {
  return (
    <div>
      <Hero title={title} accent={accent} />
      <div className="mb-4 overflow-hidden rounded-card border mdt-reveal" style={{ borderColor: `color-mix(in srgb, ${color} 45%, var(--border))` }}>
        <div className="h-[4px]" style={{ background: color }} />
        <div className="p-4">
          <div className="text-[13.5px] leading-relaxed text-muted">{definition}</div>
          <div className="mt-3 rounded-sm border border-border bg-surface-2 p-3 text-[12.5px] leading-relaxed">
            <span className="font-bold uppercase tracking-[0.06em]" style={{ color }}>Sanction · </span>{sanction}
          </div>
        </div>
      </div>
      <div className="mb-[10px] text-[11px] font-bold uppercase tracking-[0.09em] text-faint">Exemples d'application</div>
      <Grid min={200}>
        {examples.map((e, i) => (
          <div key={i} className="mdt-lift flex flex-col items-center gap-[10px] rounded-card border border-border bg-surface px-4 py-6 text-center">
            <span className="flex h-[54px] w-[54px] items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>{e.icon}</span>
            <span className="text-[13px] font-bold uppercase tracking-[0.03em]">{e.label}</span>
          </div>
        ))}
      </Grid>
    </div>
  );
}

export function Infractions() {
  return (
    <GravityPage title="Les" accent="infractions" color="#3b82f6"
      definition={<>Une infraction est un non-respect « minime » de la loi, n'étant pas un danger immédiat et direct pour une tierce personne.</>}
      sanction={<>« Contravention », « Amende » ou « Traffic Ticket ».</>}
      examples={[{ icon: <Gauge className="h-6 w-6" />, label: "Vitesse" }, { icon: <Car className="h-6 w-6" />, label: "Circulation & gênes" }, { icon: <Users className="h-6 w-6" />, label: "Troubles publics" }, { icon: <Volume2 className="h-6 w-6" />, label: "Nuisances sonores" }]} />
  );
}
export function DelitsMineurs() {
  return (
    <GravityPage title="Les délits" accent="mineurs" color="#16a34a"
      definition={<>Un délit mineur est un non-respect « léger » de la loi, pouvant être un danger immédiat et direct pour une tierce personne.</>}
      sanction={<>« Rapport d'arrestation » et « Amende », voire « Garde à vue » — <b>constituent un casier judiciaire</b>.</>}
      examples={[{ icon: <Ban className="h-6 w-6" />, label: "Refus d'obtempérer" }, { icon: <Pill className="h-6 w-6" />, label: "Possession de stupéfiants" }, { icon: <Swords className="h-6 w-6" />, label: "Bagarres" }]} />
  );
}
export function DelitsMajeurs() {
  return (
    <GravityPage title="Les délits" accent="majeurs" color="#eab308"
      definition={<>Un délit majeur est un non-respect « important » de la loi, pouvant être un danger immédiat et direct pour une tierce personne.</>}
      sanction={<>« Dossier d'arrestation » et « Comparution devant un Procureur », voire « Prison » — casier judiciaire si le verdict est « Coupable ».</>}
      examples={[{ icon: <Skull className="h-6 w-6" />, label: "Homicides involontaires" }, { icon: <Package className="h-6 w-6" />, label: "Grande possession de stupéfiants" }, { icon: <VenetianMask className="h-6 w-6" />, label: "Braquages" }]} />
  );
}
export function Crimes() {
  return (
    <GravityPage title="Les" accent="crimes" color="#dc2626"
      definition={<>Un crime est un non-respect « très grave » de la loi, étant un danger immédiat et direct pour une tierce personne ou l'État.</>}
      sanction={<>« Dossier d'arrestation » et « Comparution au Tribunal », voire « Prison à vie » — casier judiciaire si le verdict est « Coupable ».</>}
      examples={[{ icon: <Syringe className="h-6 w-6" />, label: "Meurtres" }, { icon: <Package className="h-6 w-6" />, label: "Trafic de stupéfiants" }, { icon: <Bomb className="h-6 w-6" />, label: "Terrorisme" }]} />
  );
}
