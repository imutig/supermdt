// Moteur de calcul d'amende partagé. Source de vérité unique du calcul.
// amende = base × (récidive ? facteur : 1)   [le DEFCON n'affecte plus l'amende - item 4]
// prison = jailSeconds (la récidive n'affecte PAS la prison).

export interface FineSpec {
  kind: "FIXED" | "FORMULA" | "ON_DECISION" | "PER_UNIT" | "UNSPECIFIED";
  amount?: number;
  unit?: string;
}

export interface DefconMult {
  fineMultiplier: number;
  sensitiveFineMultiplier: number;
}

export const RECIDIVE_FACTOR = 2; // configurable ultérieurement

export function computeCharge(opts: {
  fine: FineSpec;
  jailSeconds?: number;
  sensitive: boolean;
  defcon: DefconMult;
  /** qty pour PER_UNIT, ou montant résolu pour FORMULA (saisi au moment de l'amende) */
  param?: number;
  isRecidive: boolean;
}): { fine: number; jailSeconds: number; onDecision: boolean } {
  const { fine, param, isRecidive } = opts;

  if (fine.kind === "ON_DECISION") {
    return { fine: 0, jailSeconds: opts.jailSeconds ?? 0, onDecision: true };
  }

  let base = 0;
  switch (fine.kind) {
    case "FIXED":
      base = fine.amount ?? 0;
      break;
    case "PER_UNIT":
      base = (fine.amount ?? 0) * (param ?? 1);
      break;
    case "FORMULA":
      // Le montant résolu (drogue/cat. arme/estimation) est saisi côté UI et passé en `param`.
      base = param ?? 0;
      break;
    default:
      base = 0;
  }

  // Item 4 : plus de multiplicateur DEFCON. Amende à 100% (× récidive si applicable).
  const fineAmount = Math.round(base * (isRecidive ? RECIDIVE_FACTOR : 1));

  return { fine: fineAmount, jailSeconds: opts.jailSeconds ?? 0, onDecision: false };
}
