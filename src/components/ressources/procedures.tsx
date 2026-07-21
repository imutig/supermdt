import { ChevronRight, ArrowDown } from "lucide-react";
import { Hero, SectionTitle, Callout, Grid, Pill } from "./kit";

/* ---------------- Procédures ---------------- */
function StepChip({ n, children, color = "var(--accent)" }: { n: number; children: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-center gap-[9px] rounded-sm border border-border bg-surface-2 px-[12px] py-[9px]">
      <span className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: color }}>{n}</span>
      <span className="text-[12.5px] font-semibold">{children}</span>
    </div>
  );
}
function Phase({ title, color, steps, note }: { title: string; color: string; steps: string[]; note?: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface mdt-reveal">
      <div className="px-4 py-[10px] text-[12px] font-bold uppercase tracking-[0.08em] text-white" style={{ background: color }}>{title}</div>
      <div className="flex flex-wrap items-center gap-[8px] p-4">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-[8px]">
            <StepChip n={i + 1} color={color}>{s}</StepChip>
            {i < steps.length - 1 && <ChevronRight className="h-4 w-4 text-faint" />}
          </div>
        ))}
      </div>
      {note && <div className="border-t border-border px-4 py-3 text-[12px] leading-relaxed text-muted">{note}</div>}
    </div>
  );
}

export function Procedures() {
  return (
    <div>
      <Hero title="Les" accent="procédures" subtitle="Le déroulé complet d'une interpellation, du terrain jusqu'à la sortie de cellule." />

      <SectionTitle>Sur le terrain</SectionTitle>
      <Grid min={280}>
        <div className="mdt-lift rounded-card border border-border bg-surface p-4"><Pill color="#9ca3af">1</Pill><div className="mt-2 text-[14px] font-bold">Menotter l'individu</div></div>
        <div className="mdt-lift rounded-card border border-border bg-surface p-4"><Pill color="#eab308">2</Pill><div className="mt-2 text-[14px] font-bold">Palpation de l'individu</div><div className="text-[12px] italic text-muted">Toujours AVANT de rentrer dans le véhicule (valable ambulance).</div></div>
        <div className="mdt-lift rounded-card border border-border bg-surface p-4"><Pill color="#3b82f6">3</Pill><div className="mt-2 text-[14px] font-bold">Placer à l'arrière du véhicule</div><div className="text-[12px] italic text-muted">Droits Miranda à l'arrivée au commissariat.</div></div>
      </Grid>

      <div className="mt-6 flex flex-col gap-[14px]">
        <Phase title="Arrestation" color="#7f1d1d" steps={["Menottes", "Palpation", "Transport"]}
          note={<>Un suspect représente une menace jusqu'à ce qu'il soit pincé. Gardez une couverture létale si l'individu a une arme à feu, placez-le contre un mur/véhicule avant de menotter, et pensez à la deadzone. À partir du menottage, vous avez <b>dix minutes</b> pour lire les droits.</>} />
        <div className="flex justify-center"><ArrowDown className="h-5 w-5 text-faint" /></div>
        <Phase title="Au poste" color="#166534" steps={["Droits Miranda", "Démenotter + fouille", "Carte d'identité (photo)", "Vérification MDT"]}
          note={<>Les droits à boire, manger et aux soins sont des droits civiques (à énoncer, mais distincts des droits Miranda). Au-delà de <b>3 lectures</b>, les droits sont considérés comme compris. Les effets personnels sont déposés dans les casiers <b>avant</b> la mise en cellule. Sans carte : lisez les droits au nom de John Doe, puis relisez au bon nom une fois l'identité acquise.</>} />
        <div className="flex justify-center"><ArrowDown className="h-5 w-5 text-faint" /></div>
        <Phase title="Mise en cellule → Délit ou Crime" color="#4b5563" steps={["Mise en cellule", "Délit / Crime ?", "Contact avocats + DOJ", "Dossier d'arrestation", "APC si disponibles"]}
          note={<>Si un avocat est demandé, ou pour un délit majeur/crime : contact avocats + DOJ, puis <b>dossier d'arrestation</b>. Si les magistrats sont disponibles → Accord de Plaider Coupable (APC) ; sinon → transmission des infos dans les comparutions.</>} />
        <div className="flex justify-center"><ArrowDown className="h-5 w-5 text-faint" /></div>
        <Phase title="Sortie de cellule" color="#1d4ed8" steps={["Amende", "Solvable ?", "Libération / Convocation", "Bracelet", "Saisies"]}
          note={<>Amende → si <b>solvable</b> : libération. Sinon : convocation, bracelet, puis libération. Les objets confisqués passent en <b>Saisies</b>.</>} />
      </div>

      <div className="mt-6">
        <SectionTitle color="#166534">Procédure Standard (P.S) vs Comparution Immédiate (C.I)</SectionTitle>
        <Grid min={320}>
          <Callout color="#16a34a" title="Procédure Standard (délits mineurs)">L'agent amende et met lui-même l'individu en détention selon la loi. Une PS peut basculer en comparution immédiate si l'individu demande un avocat, est mineur, ou conteste les infractions.</Callout>
          <Callout color="#eab308" title="Comparution Immédiate (délits majeurs)">Appel du Procureur qui se déplace au poste pour un APC. Un dossier d'intervention doit être fait avant son arrivée (template MDT).</Callout>
          <Callout color="#dc2626" title="Crime">Passage devant le juge. L'individu est maintenu en garde à vue le temps du jugement ; sous aval du procureur/juge, il peut être libéré sous bracelet en attendant.</Callout>
        </Grid>
      </div>
    </div>
  );
}

/* ---------------- Droits Miranda ---------------- */
export function DroitsMiranda() {
  const lines = [
    "Monsieur / Madame, nous sommes le … (indiquer la date et l'heure).",
    "Vous êtes en état d'arrestation pour les chefs d'accusation suivants : … (citer les faits).",
    "D'autres faits pourront vous être ajoutés durant la procédure.",
    "Vous avez le droit de garder le silence. Tout ce que vous direz pourra et sera retenu contre vous devant une cour de justice.",
    "Vous avez le droit à un avocat et d'en avoir un présent lors de votre interrogatoire. Si vous n'en avez pas les moyens, un avocat vous sera commis d'office.",
    "Vous avez le droit à de la nourriture, à boire ainsi qu'à demander l'assistance d'un médecin.",
    "Vous pouvez décider à n'importe quel moment d'exercer vos droits et de ne faire aucune déposition.",
    "Avez-vous bien compris les droits que je viens de vous lire ?",
    "Voulez-vous exercer un de ces droits ?",
  ];
  return (
    <div>
      <Hero title="Les droits" accent="Miranda" subtitle="Deux sujets doivent absolument être mentionnés : le droit de garder le silence et le droit à un avocat." />
      <div className="overflow-hidden rounded-card border border-border bg-surface mdt-reveal">
        <div className="flex flex-col">
          {lines.map((l, i) => (
            <div key={i} className="flex gap-3 border-b border-border px-4 py-[11px] last:border-0">
              <span className="font-data text-[12px] font-bold text-accent">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-[13px] leading-relaxed">{l}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <Callout color="var(--accent)">À la troisième énonciation, si l'individu ne comprend toujours pas, les droits sont considérés comme compris. Vous avez 15 minutes après l'arrestation pour citer les droits.</Callout>
        <Callout color="#dc2626" title="Vice de procédure">La lecture peut se faire dès la mise en arrestation. Par sécurité, faites-la au poste <b>avant</b> de passer les grilles et avant la fouille, sinon vice de procédure.</Callout>
      </div>
    </div>
  );
}

/* ---------------- Traffic stop ---------------- */
export function TrafficStop() {
  return (
    <div>
      <Hero title="Le traffic" accent="stop" subtitle="Dans quelles conditions un contrôle routier est-il justifié ?" />
      <Grid min={340}>
        <div className="rounded-card border border-border bg-surface p-4">
          <SectionTitle color="#eab308">Suspicion raisonnable</SectionTitle>
          <div className="mb-2 text-[12px] italic text-faint">Raison logique pouvant entraîner le contrôle</div>
          <ul className="m-0 list-disc space-y-[6px] pl-5 text-[12.5px] text-muted marker:text-faint">
            <li>Vitesse ou conduite potentiellement dangereuse (sans radar)</li>
            <li>Véhicule vu plus d'une fois sur des lieux à risques</li>
            <li>Véhicule en mauvais état</li>
            <li>Conducteur connu des services pour absence de permis</li>
            <li>Véhicule / personne correspondant à un <b>signalement partiel</b> pour un fait à dangerosité minime</li>
            <li>Individu masqué à bord</li>
          </ul>
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <SectionTitle color="#dc2626">Infraction avérée</SectionTitle>
          <div className="mb-2 text-[12px] italic text-faint">Raison constatée pouvant entraîner le contrôle</div>
          <ul className="m-0 list-disc space-y-[6px] pl-5 text-[12.5px] text-muted marker:text-faint">
            <li>Vitesse ou conduite dangereuse (prise au radar)</li>
            <li>Absence de feux de croisement de nuit ou par temps de pluie</li>
            <li>Véhicule non homologué pour la route pratiquée</li>
            <li>Véhicule sans plaque d'immatriculation</li>
            <li>Véhicule / personne correspondant à un <b>signalement total</b> pour un fait à dangerosité minime</li>
          </ul>
        </div>
      </Grid>
    </div>
  );
}

/* ---------------- Signalements ---------------- */
function SigTable({ title, rows }: { title: string; rows: [string, boolean][] }) {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="border-b border-border bg-surface-2 px-4 py-[9px] text-[11.5px] font-bold uppercase tracking-[0.06em]">{title}</div>
      {rows.map(([label, req], i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-[9px] last:border-0">
          <span className="flex-1 text-[12.5px]">{label}</span>
          <span className="inline-flex items-center gap-[6px] text-[11px] font-bold" style={{ color: req ? "var(--success)" : "var(--danger)" }}>
            <span className="h-[8px] w-[8px] rounded-full" style={{ background: req ? "var(--success)" : "var(--danger)" }} />
            {req ? "OUI" : "NON"}
          </span>
        </div>
      ))}
    </div>
  );
}
export function Signalements() {
  return (
    <div>
      <Hero title="Les" accent="signalements" subtitle="Éléments nécessaires pour diffuser un signalement partiel ou total." />
      <Grid min={330} className="!gap-[18px]">
        <div className="flex flex-col gap-4">
          <SectionTitle color="#eab308">Signalement partiel</SectionTitle>
          <SigTable title="Véhicule · 3 éléments nécessaires" rows={[["Type (classe / marque)", false], ["Couleur", false], ["Immatriculation complète", false], ["Nom véhicule", false], ["Stickers / livery", false]]} />
          <SigTable title="Individu · 3 éléments nécessaires" rows={[["Ethnie / couleur de peau", true], ["Nom prénom", false], ["Visage", false], ["Coiffure", false], ["Vêtements", false]]} />
        </div>
        <div className="flex flex-col gap-4">
          <SectionTitle color="#dc2626">Signalement total</SectionTitle>
          <SigTable title="Véhicule · 3 éléments nécessaires" rows={[["Couleur", false], ["Immatriculation complète", true], ["Stickers / livery", false], ["Nom véhicule", false], ["Type (classe / marque)", false]]} />
          <SigTable title="Individu · 4 éléments nécessaires" rows={[["Ethnie / couleur de peau", true], ["Nom prénom", true], ["Visage", false], ["Coiffure", false], ["Vêtements", false]]} />
        </div>
      </Grid>
    </div>
  );
}
