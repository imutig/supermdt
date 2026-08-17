import { internalAction } from "./_generated/server";

// Prévient le bot qu'il y a du travail (« push »), au lieu qu'il sonde Convex en
// boucle. Le bot déclenche alors un traitement immédiat (files d'annonce, MP,
// rôles…). Best-effort : si l'appel échoue ou que BOT_PUSH_URL n'est pas
// configuré, le poll de sécurité (5 min) rattrapera - rien n'est perdu.
//
// Configuration :
//   npx convex env set BOT_PUSH_URL "https://<bot>.up.railway.app" --prod
// (BOT_SECRET est déjà partagé avec le bot.)
export const notify = internalAction({
  args: {},
  handler: async (): Promise<void> => {
    const raw = process.env.BOT_PUSH_URL;
    const secret = process.env.BOT_SECRET;
    if (!raw || !secret) return; // push non configuré : le poll de sécurité s'en charge.
    // Tolère une URL sans schéma (ex. "superbot.up.railway.app") : fetch() exige
    // http(s):// sinon il jette et le push est perdu.
    const base = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = base.replace(/\/$/, "") + "/push";
    // 2 tentatives immédiates ; en cas d'échec, le poll de sécurité prendra le relais.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ secret }),
        });
        if (res.ok) return;
      } catch { /* réessaie / laisse le filet agir */ }
    }
  },
});
