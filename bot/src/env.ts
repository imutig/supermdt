// Lecture et validation des variables d'environnement au démarrage : le bot
// refuse de démarrer plutôt que d'échouer plus tard sur une variable oubliée.
function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`[config] Variable manquante : ${name}`);
    process.exit(1);
  }
  return v.trim();
}

function optional(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

export const env = {
  discordToken: required("DISCORD_BOT_TOKEN"),
  discordAppId: required("DISCORD_BOT_ID"),
  guildId: required("DISCORD_GUILD_ID"),

  convexUrl: required("CONVEX_URL"),
  botSecret: required("BOT_SECRET"),

  // Salons et heures ne sont PAS ici : ils se règlent sur le site (page
  // Configuration > Intégrations) et sont lus en direct via Convex.
  brandIconUrl: optional("BRAND_ICON_URL"),
};
