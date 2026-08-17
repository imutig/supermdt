// Libellé d'affichage d'un chef d'inculpation, préfixé selon la tentative /
// complicité. La tentative et la complicité ne changent PAS la peine (même
// amende / prison que l'infraction de base, cf. state code) : c'est un simple
// label SuperMDT, jamais envoyé au Nexus.
export type AttemptType = "TENTATIVE" | "COMPLICITE" | undefined;

export function chargeDisplayName(name: string, attemptType?: AttemptType): string {
  if (attemptType === "TENTATIVE") return `Tentative de : ${name}`;
  if (attemptType === "COMPLICITE") return `Complicité de : ${name}`;
  return name;
}
