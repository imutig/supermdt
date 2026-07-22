import { EmbedBuilder, type ColorResolvable } from "discord.js";
import { env } from "./env.js";

// Charte visuelle commune à tous les embeds : couleur trèfle de la Station 13,
// pied de page signé et horodaté. Aucun message texte simple n'est envoyé,
// tout passe par un embed construit ici.
export const BRAND = {
  green: 0x49a24a as ColorResolvable,
  danger: 0xd94040 as ColorResolvable,
  warning: 0xe0a030 as ColorResolvable,
  info: 0x3b82f6 as ColorResolvable,
  muted: 0x8a929c as ColorResolvable,
};

export function baseEmbed(color: ColorResolvable = BRAND.green): EmbedBuilder {
  const e = new EmbedBuilder()
    .setColor(color)
    .setFooter({ text: "LSPD · Station 13 · Mobile Data Terminal" })
    .setTimestamp(new Date());
  if (env.brandIconUrl) e.setThumbnail(env.brandIconUrl);
  return e;
}

// Sparkline en blocs Unicode : un mini-graphique lisible dans un embed, sans
// générer d'image ni dépendance externe.
const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
export function sparkline(values: number[]): string {
  const max = Math.max(1, ...values);
  return values.map((v) => BLOCKS[Math.min(BLOCKS.length - 1, Math.round((v / max) * (BLOCKS.length - 1)))]).join("");
}

// « il y a 1h23 » à partir d'un timestamp.
export function ago(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

export function badge(matricule: number | null): string {
  return matricule == null ? "" : `#${String(matricule).padStart(5, "0")}`;
}
