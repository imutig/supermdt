// Helpers de temps en fuseau Europe/Paris, corrects vis-à-vis de l'heure d'été.
// (Le serveur Convex tourne en UTC : sans ces helpers, les bornes de jour et les
// libellés seraient décalés d'une à deux heures.)
const TZ = "Europe/Paris";

function tzOffsetMs(utcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour === 24 ? 0 : +p.hour, +p.minute, +p.second) - utcMs;
}

// Heure murale Paris (y, mo 1-12, d, h, mi) -> epoch ms.
export function parisWallToEpoch(y: number, mo: number, d: number, h: number, mi: number): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let e = guess - tzOffsetMs(guess);
  const o2 = tzOffsetMs(e);
  if (guess - o2 !== e) e = guess - o2;
  return e;
}

// Décomposition d'un epoch en composantes murales Paris.
export function parisParts(ts: number): { y: number; mo: number; d: number; h: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(ts))) p[part.type] = part.value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour === 24 ? 0 : +p.hour };
}

// Nombre de jours calendaires (heure de Paris) de `from` à `to`, bornes
// INCLUSES (du 15 au 17 = 3 jours). Robuste à l'heure de la journée des epochs.
export function inclusiveDaysParis(from: number, to: number): number {
  const a = parisParts(from), b = parisParts(to);
  const da = Date.UTC(a.y, a.mo - 1, a.d);
  const db = Date.UTC(b.y, b.mo - 1, b.d);
  return Math.round((db - da) / 86_400_000) + 1;
}
