import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";

export type NotifyEmbed = {
  title: string;
  description?: string;
  color?: number;
  url?: string;
  imageUrl?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: string;
};

// Couleurs Discord (entiers) alignées sur la palette du MDT.
export const NOTIFY_COLOR = {
  accent: 0x49a24a,
  danger: 0xd94040,
  warning: 0xe0a030,
  info: 0x3b82f6,
  muted: 0x8a8f98,
};

// URL profonde vers l'élément concerné, si l'adresse du MDT est configurée.
// Sans configuration on renvoie undefined : Discord ignore alors le lien.
export async function deepLink(ctx: MutationCtx, path: string) {
  const cfg = await ctx.db.query("integrationConfig").first();
  const base = cfg?.baseUrl?.trim().replace(/\/+$/, "");
  return base ? `${base}${path}` : undefined;
}

// Diffuse un événement vers tous les webhooks actifs qui y sont abonnés.
// Sans abonné, aucun travail n'est planifié : l'appel est gratuit.
export async function notify(ctx: MutationCtx, event: string, embed: NotifyEmbed) {
  const hooks = await ctx.db
    .query("webhooks")
    .withIndex("by_active", (q) => q.eq("active", true))
    .collect();
  const urls = hooks.filter((h) => h.events.includes(event)).map((h) => h.url);
  if (urls.length === 0) return;
  await ctx.scheduler.runAfter(0, internal.webhooks.post, { urls, embed });
}
