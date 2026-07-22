// Génération d'images de graphique via QuickChart : on construit une URL qui
// renvoie un PNG, posée dans setImage() de l'embed. Aucune dépendance ni
// génération locale, et le rendu est une vraie courbe, pas un sparkline.
//
// La configuration suit le format Chart.js. Les couleurs reprennent la charte.
const GREEN = "#49A24A";
const GRID = "rgba(255,255,255,0.08)";
const TEXT = "#c8ccd2";

function url(config: object, opts?: { width?: number; height?: number }): string {
  const c = encodeURIComponent(JSON.stringify(config));
  const w = opts?.width ?? 640;
  const h = opts?.height ?? 260;
  return `https://quickchart.io/chart?bkg=%23151a21&w=${w}&h=${h}&c=${c}`;
}

// Courbe de présence sur la journée (nombre d'agents présents par heure).
export function dailyPresenceChart(hourly: number[]): string {
  const labels = hourly.map((_, h) => `${String(h).padStart(2, "0")}h`);
  return url({
    type: "line",
    data: {
      labels,
      datasets: [{
        data: hourly,
        borderColor: GREEN,
        backgroundColor: "rgba(73,162,74,0.18)",
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        borderWidth: 2,
      }],
    },
    options: {
      plugins: { legend: { display: false }, title: { display: true, text: "Présence au fil de la journée", color: TEXT, font: { size: 14 } } },
      scales: {
        x: { ticks: { color: TEXT, maxTicksLimit: 12, font: { size: 10 } }, grid: { color: GRID } },
        y: { beginAtZero: true, ticks: { color: TEXT, precision: 0 }, grid: { color: GRID } },
      },
    },
  });
}

// Barres des heures de service d'un agent sur la semaine.
export function weeklyHoursChart(perDayMinutes: number[]): string {
  const labels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const hours = perDayMinutes.map((m) => +(m / 60).toFixed(2));
  return url({
    type: "bar",
    data: {
      labels,
      datasets: [{ data: hours, backgroundColor: GREEN, borderRadius: 6 }],
    },
    options: {
      plugins: { legend: { display: false }, title: { display: true, text: "Heures de service — semaine en cours", color: TEXT, font: { size: 14 } } },
      scales: {
        x: { ticks: { color: TEXT }, grid: { display: false } },
        // QuickChart évalue les chaînes ressemblant à une fonction Chart.js.
        y: { beginAtZero: true, ticks: { color: TEXT, callback: "function(v){return v+'h'}" }, grid: { color: GRID } },
      },
    },
  });
}
