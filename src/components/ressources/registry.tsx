import type { ComponentType } from "react";
import { DivisionsMajeures, DivisionsMineures, Specialites } from "./organisation";
import { CodesRadio, Indicatifs, CallsRadio, Lexique } from "./radio";
import { Equipement } from "./equipement";
import { Procedures, DroitsMiranda, TrafficStop, Signalements } from "./procedures";
import { Infractions, DelitsMineurs, DelitsMajeurs, Crimes } from "./gravites";

export type ResPage = { id: string; label: string; Component: ComponentType };
export type ResCat = { label: string; pages: ResPage[] };

export const RES_CATS: ResCat[] = [
  {
    label: "Organisation",
    pages: [
      { id: "div-maj", label: "Divisions majeures", Component: DivisionsMajeures },
      { id: "div-min", label: "Divisions mineures", Component: DivisionsMineures },
      { id: "specialites", label: "Spécialités & formations", Component: Specialites },
    ],
  },
  {
    label: "Radio & communication",
    pages: [
      { id: "codes", label: "Codes radio importants", Component: CodesRadio },
      { id: "indicatifs", label: "Indicatifs radio", Component: Indicatifs },
      { id: "calls", label: "Calls radio", Component: CallsRadio },
      { id: "lexique", label: "Lexique", Component: Lexique },
    ],
  },
  {
    label: "Équipement",
    pages: [{ id: "equipement", label: "Équipement classique", Component: Equipement }],
  },
  {
    label: "Procédures & juridique",
    pages: [
      { id: "procedures", label: "Procédures", Component: Procedures },
      { id: "miranda", label: "Droits Miranda", Component: DroitsMiranda },
      { id: "traffic", label: "Traffic stop", Component: TrafficStop },
      { id: "signalements", label: "Signalements", Component: Signalements },
    ],
  },
  {
    label: "Classification des infractions",
    pages: [
      { id: "infractions", label: "Infractions", Component: Infractions },
      { id: "delits-mineurs", label: "Délits mineurs", Component: DelitsMineurs },
      { id: "delits-majeurs", label: "Délits majeurs", Component: DelitsMajeurs },
      { id: "crimes", label: "Crimes", Component: Crimes },
    ],
  },
];

export const ALL_PAGES = RES_CATS.flatMap((c) => c.pages);
