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

  channels: {
    presence: optional("CHANNEL_PRESENCE"),
    daily: optional("CHANNEL_DAILY"),
    rollcall: optional("CHANNEL_ROLLCALL"),
  },

  dailySummaryAt: optional("DAILY_SUMMARY_AT", "23:30"),
  rollcallAt: optional("ROLLCALL_AT", "20:00"),

  brandIconUrl: optional("BRAND_ICON_URL"),
};
