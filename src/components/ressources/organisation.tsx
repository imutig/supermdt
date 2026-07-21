import { Crosshair, Search, Car, Building2, Dog, Plane, MessagesSquare, GraduationCap, Megaphone, Headphones } from "lucide-react";
import { Hero, Grid, UnitCard, Pill, Callout } from "./kit";

export function DivisionsMajeures() {
  return (
    <div>
      <Hero title="Divisions" accent="majeures" subtitle="Le cœur opérationnel de la Station 13. Chaque agent en choisit une seule parmi les trois." />
      <div className="mb-5"><Callout color="var(--accent)" title="Règle">1 division majeure au choix parmi les 3 disponibles.</Callout></div>
      <Grid min={280}>
        <UnitCard icon={<Crosshair className="h-7 w-7" />} code="S.W.A.T" en="Special Weapons And Tactics" color="#dc2626">
          Unité d'intervention chargée des opérations armées sur les lieux à risques.
        </UnitCard>
        <UnitCard icon={<Search className="h-7 w-7" />} code="D.B" en="Detective Bureau" color="#eab308">
          Division d'enquêtes et de prises d'informations liées aux groupuscules criminels et à leurs activités.
        </UnitCard>
        <UnitCard icon={<Car className="h-7 w-7" />} code="T.D" en="Traffic Division" color="#3b82f6">
          Division spécialisée dans la sécurité routière, les poursuites à grande vitesse et les connaissances automobiles.
        </UnitCard>
      </Grid>
    </div>
  );
}

export function DivisionsMineures() {
  return (
    <div>
      <Hero title="Divisions" accent="mineures" subtitle="Des unités de spécialisation complémentaires. Deux au choix parmi celles disponibles." />
      <div className="mb-5"><Callout color="var(--accent)" title="Règle">2 divisions mineures au choix parmi celles disponibles.</Callout></div>
      <Grid min={260}>
        <UnitCard icon={<Building2 className="h-7 w-7" />} code="Metro" en="Metropolitan Division" color="#2f6df0">
          Unité d'intervention chargée des opérations armées sur les lieux à risques.
        </UnitCard>
        <UnitCard icon={<Dog className="h-7 w-7" />} code="K-9" en="Canine Services Detail" color="#8b5cf6">
          Division chargée des deputies canins, du pistage des drogues et des bombes.
        </UnitCard>
        <UnitCard icon={<Plane className="h-7 w-7" />} code="A.S.D" en="Air Support Division" color="#0ea5e9">
          Division chargée des appareils aériens, du circuit aérien et de sa réglementation.
        </UnitCard>
      </Grid>
    </div>
  );
}

export function Specialites() {
  return (
    <div>
      <Hero title="Spécialités &" accent="formations" subtitle="Disponibles en plus de vos divisions, selon votre grade." />
      <Grid min={240}>
        <UnitCard icon={<MessagesSquare className="h-7 w-7" />} code="HNT" en="Hostage Negotiation Team" color="#eab308" footer={<Pill color="#eab308">À partir de OFF III</Pill>}>
          Négocier sur des interventions avec un forcené.
        </UnitCard>
        <UnitCard icon={<GraduationCap className="h-7 w-7" />} code="PA" en="Police Academy" color="#16a34a" footer={<Pill color="#16a34a">À partir de OFF III</Pill>}>
          Former et accompagner les nouveaux du LSPD.
        </UnitCard>
        <UnitCard icon={<Megaphone className="h-7 w-7" />} code="MRD" en="Media Relations Division" color="#3b82f6" footer={<Pill color="#3b82f6">À partir de OFF II</Pill>}>
          Rejoindre l'équipe de la communication du département.
        </UnitCard>
        <UnitCard icon={<Headphones className="h-7 w-7" />} code="Dispatcher" en="Dispatcher radio" color="#dc2626" footer={<Pill color="#dc2626">À partir de OFF III</Pill>}>
          Guider et donner des directives en radio aux agents de terrain.
        </UnitCard>
      </Grid>
    </div>
  );
}
