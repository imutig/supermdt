import { Hero, SectionTitle, Callout, RadioBox, Explain, DefRow, Grid } from "./kit";

/* ---------------- Codes radio importants ---------------- */
export function CodesRadio() {
  return (
    <div>
      <Hero title="Les codes" accent="importants" subtitle="Les ordres radio globaux qui priment sur toute communication en cours." />
      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-card border border-border bg-surface mdt-reveal">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3" style={{ borderLeft: "4px solid #eab308" }}>
            <span className="font-data text-[16px] font-extrabold" style={{ color: "#eab308" }}>CODE 100</span>
            <span className="text-[13px] font-semibold italic text-muted">Silence total radio</span>
          </div>
          <div className="flex flex-col gap-3 p-4 text-[13px] leading-relaxed text-muted">
            <p className="m-0">Ordre radio global demandant le silence en cas d'intervention le nécessitant. Jusqu'à contre-ordre ou fin de l'opération, seuls certains calls peuvent encore être faits :</p>
            <ul className="m-0 list-disc space-y-1 pl-5 marker:text-faint">
              <li>Les urgences absolues</li>
              <li>Les calls de la Supervision et du Command Staff</li>
              <li>Les calls des Leads de l'opération en cours</li>
              <li>Les calls du Négociateur de l'opération en cours</li>
            </ul>
            <Callout color="#eab308">Le 10-12 et le Code 100 ne peuvent être décrétés que par le Dispatcher, le Supervisor ou le Watch-Commander.</Callout>
          </div>
        </div>

        <div className="overflow-hidden rounded-card border border-border bg-surface mdt-reveal">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3" style={{ borderLeft: "4px solid #dc2626" }}>
            <span className="font-data text-[16px] font-extrabold" style={{ color: "#dc2626" }}>CODE 99</span>
            <span className="text-[13px] font-semibold italic text-muted">Agent en danger</span>
          </div>
          <div className="flex flex-col gap-3 p-4 text-[13px] leading-relaxed text-muted">
            <p className="m-0">Ordre radio global demandant l'intervention de toutes les unités sur le lieu indiqué. Toute action doit être rompue, sauf :</p>
            <ul className="m-0 list-disc space-y-1 pl-5 marker:text-faint">
              <li>Les grosses opérations</li>
              <li>Une procédure avec un magistrat</li>
              <li>Une protection d'un VIP important</li>
            </ul>
            <Callout color="#dc2626" title="Sanction">Un agent qui ne se présente pas sur un code 99 sans raison est licencié pour non-assistance à personne en danger, et poursuivi.</Callout>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Indicatifs radio ---------------- */
function Ind({ code, letter, children, color = "var(--accent)" }: { code: string; letter: string; children: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-[9px] last:border-0">
      <span className="flex h-[30px] min-w-[30px] items-center justify-center rounded-[8px] font-data text-[12px] font-bold" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>{letter}</span>
      <span className="min-w-[80px] text-[13px] font-bold">{code}</span>
      <span className="flex-1 text-[12.5px] text-muted">{children}</span>
    </div>
  );
}
export function Indicatifs() {
  return (
    <div>
      <Hero title="Les indicatifs" accent="radio" subtitle="Reconnaître d'un coup la composition et le type d'une patrouille." />
      <Grid min={340} className="!gap-[18px]">
        <div className="rounded-card border border-border bg-surface p-4">
          <SectionTitle color="#16a34a">Patrouilleuses classiques</SectionTitle>
          <Ind code="Lincoln" letter="L" color="#16a34a">Patrouille composée d'un officier</Ind>
          <Ind code="Adam" letter="A" color="#16a34a">Patrouille composée de 2 officiers</Ind>
          <Ind code="Tango" letter="T" color="#16a34a">Patrouille composée de 3 officiers</Ind>
          <Ind code="Queen" letter="Q" color="#16a34a">Patrouille composée de 4 officiers</Ind>
          <SectionTitle color="#9ca3af">Patrouilleuses typées civiles</SectionTitle>
          <Ind code="William" letter="N" color="#9ca3af">Patrouille banalisée (DB)</Ind>
          <Ind code="Robert" letter="R" color="#9ca3af">Metro</Ind>
          <Ind code="David" letter="D" color="#9ca3af">Banalisée / sérigraphiée du SWAT</Ind>
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <SectionTitle color="#3b82f6">Véhicules spéciaux</SectionTitle>
          <Ind code="Henry" letter="H" color="#3b82f6">Patrouille aérienne</Ind>
          <Ind code="Romeo" letter="R" color="#3b82f6">Véhicule rapide (TD)</Ind>
          <Ind code="Mary" letter="M" color="#3b82f6">Patrouille moto</Ind>
          <Ind code="Victor" letter="V" color="#3b82f6">Patrouille cycliste</Ind>
          <Ind code="Hubert" letter="H" color="#3b82f6">Patrouille maritime</Ind>
          <Ind code="King" letter="K" color="#3b82f6">Patrouille avec chien</Ind>
          <Ind code="Georges" letter="G" color="#3b82f6">Anti-drogues (véhicule slicktop)</Ind>
          <Ind code="V.I.P" letter="VP" color="#3b82f6">Avec 1 VIP ou porteuse de convoi</Ind>
          <Ind code="FL" letter="FL" color="#3b82f6">Avec un rookie en First Lincoln</Ind>
        </div>
      </Grid>
    </div>
  );
}

/* ---------------- Calls radio ---------------- */
function Call({ label, color, box, explain }: { label: string; color: string; box: React.ReactNode; explain: [string, React.ReactNode][] }) {
  return (
    <div className="mdt-reveal">
      <SectionTitle color={color}>{label}</SectionTitle>
      <div className="grid gap-[14px] lg:grid-cols-[1.7fr_1fr]">
        <RadioBox>{box}</RadioBox>
        <Explain items={explain} />
      </div>
    </div>
  );
}
export function CallsRadio() {
  return (
    <div>
      <Hero title="Les calls" accent="radio" subtitle="La structure d'un call type : unité qui parle · état de la patrouille · complément d'information." />
      <div className="flex flex-col gap-6">
        <Call label="Début de patrouille" color="#16a34a"
          box={<>Dispatch de "13 - <b className="text-white">Lincoln-XX</b> - <span style={{ color: "#4ade80" }}>Début de patrouille</span> - <span style={{ color: "#f87171" }}>avec un [véhicule] sérigraphiée/banalisée, sur [secteur], armé et opérationnel</span>"</>}
          explain={[["Nombre", <><b>1</b> (Lincoln)</>], ["N° véhicule", "XX"], ["État", "Début de patrouille"], ["Position", "Vespucci"]]} />
        <Call label="Prise d'intervention" color="#eab308"
          box={<>"13 - <b className="text-white">Adam-XX</b> - <span style={{ color: "#facc15" }}>on prend le dernier appel</span> - <span style={{ color: "#f87171" }}>[type d'appel], nous sommes à [distance], réponse en CODE2/CODE3</span>"</>}
          explain={[["Nombre", <><b>2</b> (Adam)</>], ["N° véhicule", "XX"], ["État", "Se dirige vers"], ["Position", "Braquage Rockford Drive"]]} />
        <Call label="État d'intervention" color="#3b82f6"
          box={<>"13 - <b className="text-white">Lincoln XX</b> - <span style={{ color: "#4ade80" }}>CODE 4</span> - <span style={{ color: "#f87171" }}>sur les [type] [secteur]</span>"<br />"13 - <b className="text-white">Lincoln XX</b> - <span style={{ color: "#4ade80" }}>CODE 6</span> - <span style={{ color: "#f87171" }}>sur les [type] [secteur], RAS pour le moment</span>"</>}
          explain={[["Type", "Lincoln"], ["Véhicule", "XX"], ["État", "CODE 4 (retour normal) / CODE 6 (surveillance)"], ["Position", "Ventes Mirror Park"]]} />
        <Call label="Début de poursuite" color="#dc2626"
          box={<>"13 - <b className="text-white">Lincoln XX</b> - <span style={{ color: "#4ade80" }}>Début d'une course poursuite</span> - <span style={{ color: "#f87171" }}>sur Alta Street vers le Benny's d'une primo bleue occupée 2 fois, besoin de renfort</span>"</>}
          explain={[["Type", "Lincoln"], ["Véhicule", "XX"], ["État", "Refus d'obtempérer"], ["Position", "En route vers Benny's"]]} />
      </div>
    </div>
  );
}

/* ---------------- Lexique ---------------- */
export function Lexique() {
  return (
    <div>
      <Hero title="Le lexique" accent="à connaître" subtitle="Abréviations de terrain, jargon professionnel et codes d'état." />
      <Grid min={340} className="!gap-[18px]">
        <div className="rounded-card border border-border bg-surface p-4">
          <SectionTitle>Lexique de base</SectionTitle>
          <DefRow term="R.A.S">Rien à signaler</DefRow>
          <DefRow term="AVP">Accident de la voie publique</DefRow>
          <DefRow term="VL">Véhicule léger</DefRow>
          <DefRow term="PL">Poids lourd</DefRow>
          <DefRow term="PIE">Pistolet à impulsion électrique</DefRow>
          <DefRow term="AFI">Arme de force intermédiaire</DefRow>
          <DefRow term="ACR">Arrêt cardio-respiratoire</DefRow>
          <DefRow term="PC">Permis de conduire</DefRow>
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-card border border-border bg-surface p-4">
            <SectionTitle color="#3b82f6">Lexique professionnel</SectionTitle>
            <div className="text-[12.5px] leading-relaxed text-muted"><b className="text-text">SITREP</b> : quand un opérateur (souvent le dispatcher) demande un SITREP, déclarez votre situation — indicatif de patrouille + code CODE 4/5/6. Sans réponse après trois appels, l'unité est considérée disparue et recherchée par toutes les unités.</div>
          </div>
          <div className="rounded-card border border-border bg-surface p-4">
            <SectionTitle color="#eab308">Les codes purs</SectionTitle>
            <DefRow term="CODE 1">Sans gyrophares</DefRow>
            <DefRow term="CODE 2">Avertisseurs lumineux uniquement</DefRow>
            <DefRow term="CODE 3">Avertisseurs lumineux et sonores</DefRow>
            <DefRow term="CODE 4">Zone clear / intervention terminée</DefRow>
            <DefRow term="CODE 5">Investigation sur zone à pied</DefRow>
            <DefRow term="CODE 6">Investigation dans le secteur (en voiture)</DefRow>
          </div>
        </div>
      </Grid>
    </div>
  );
}
