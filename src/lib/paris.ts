// Conversion « heure murale de Paris » -> epoch UTC (correcte vis-à-vis de l'heure
// d'été/hiver). Sert à ce qu'une date saisie au jour (input date) couvre bien la
// journée en heure de Paris, quel que soit le fuseau du navigateur.

function tzOffsetMs(tz: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour === 24 ? 0 : +p.hour, +p.minute, +p.second);
  return asUTC - utcMs;
}

export function parisWallToEpoch(year: number, mon: number, day: number, hr: number, min: number, sec = 0, ms = 0): number {
  const guess = Date.UTC(year, mon - 1, day, hr, min, sec, ms);
  let epoch = guess - tzOffsetMs("Europe/Paris", guess);
  const off2 = tzOffsetMs("Europe/Paris", epoch); // correction DST
  const epoch2 = guess - off2;
  if (epoch2 !== epoch) epoch = epoch2;
  return epoch;
}

// "YYYY-MM-DD" -> début (00:00:00) de la journée, heure de Paris.
export function parisDayStart(dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  return m ? parisWallToEpoch(+m[1], +m[2], +m[3], 0, 0, 0, 0) : null;
}

// "YYYY-MM-DD" -> fin de la journée (23:59), heure de Paris.
export function parisDayEnd(dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  return m ? parisWallToEpoch(+m[1], +m[2], +m[3], 23, 59, 0, 0) : null;
}
