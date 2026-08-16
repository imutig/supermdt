// Moteur de calcul d'amende partagé. Source de vérité unique du calcul.
// amende = base   [le DEFCON n'affecte plus l'amende - item 4 ; la récidive a été retirée]
// prison = jailSeconds.

export interface FineSpec {
  kind: "FIXED" | "FORMULA" | "ON_DECISION" | "PER_UNIT" | "UNSPECIFIED";
  amount?: number;
  unit?: string;
}

export interface DefconMult {
  fineMultiplier: number;
  sensitiveFineMultiplier: number;
}

export function computeCharge(opts: {
  fine: FineSpec;
  jailSeconds?: number;
  sensitive: boolean;
  defcon: DefconMult;
  /** qty pour PER_UNIT, ou montant résolu pour FORMULA (saisi au moment de l'amende) */
  param?: number;
  /** Conservé pour compatibilité de signature ; ignoré (récidive retirée - item 6). */
  isRecidive?: boolean;
}): { fine: number; jailSeconds: number; onDecision: boolean } {
  const { fine, param } = opts;

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

  // Item 4 : plus de multiplicateur DEFCON. Item 6 : plus de facteur récidive.
  const fineAmount = Math.round(base);

  return { fine: fineAmount, jailSeconds: opts.jailSeconds ?? 0, onDecision: false };
}
