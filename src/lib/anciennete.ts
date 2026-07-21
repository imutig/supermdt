// Calcul et formatage de l'ancienneté d'un agent à partir de sa date d'arrivée.

// Convertit un timestamp (ms) en valeur pour <input type="date"> (yyyy-mm-dd, UTC).
export function tsToDateInput(ts: number | null | undefined): string {
  if (ts == null) return "";
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Convertit une valeur d'<input type="date"> en timestamp (ms, minuit UTC), ou null si vide.
export function dateInputToTs(value: string): number | null {
  if (!value) return null;
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(t) ? null : t;
}

// Formate l'ancienneté écoulée depuis `since` en texte court (ex. "2 ans 3 mois", "5 mois", "12 j").
export function fmtAnciennete(since: number | null | undefined): string {
  if (since == null) return "-";
  const now = Date.now();
  if (since > now) return "-";
  const days = Math.floor((now - since) / 86_400_000);
  if (days < 31) return `${days} j`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} mois`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  return remMonths > 0 ? `${years} an${years > 1 ? "s" : ""} ${remMonths} mois` : `${years} an${years > 1 ? "s" : ""}`;
}
