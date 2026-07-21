// Couleurs de patrouille : 5 teintes lisibles en dark comme en light (mélangées au fond).
export const PATROL_COLORS = ["#3b82f6", "#16a34a", "#d97706", "#e11d48", "#8b5cf6"];

// Fond de carte teinté par la couleur (faible opacité => marche sur les deux thèmes).
export function patrolBg(color: string | null): string {
  if (!color) return "var(--surface-2)";
  return `color-mix(in srgb, ${color} 12%, var(--surface-2))`;
}
export function patrolBorder(color: string | null): string {
  if (!color) return "var(--border)";
  return `color-mix(in srgb, ${color} 45%, var(--border))`;
}
