import type { IncomingMessage, ServerResponse } from "node:http";
import { env } from "./env.js";

// Traite les requêtes du serveur HTTP unique du bot (créé dans index.ts) :
//   - healthcheck Railway (toute requête non /push) -> 200 si la gateway Discord
//     est prête, 503 sinon (isReady) : un bot déconnecté doit échouer le
//     healthcheck pour que Railway redémarre le zombie au lieu de le laisser vivre.
//   - POST /push { secret } -> déclenche un traitement immédiat (onPush)
// On NE crée PAS de second serveur : Railway n'expose qu'un port, déjà occupé
// par le healthcheck. Sécurisé par le secret partagé (même BOT_SECRET que les
// requêtes Convex).
export function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  onPush: () => Promise<void> | void,
  isReady: () => boolean,
): void {
  if (req.method === "POST" && req.url === "/push") {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 10_000) req.destroy(); });
    req.on("end", () => {
      let secret: string | undefined;
      try { secret = JSON.parse(body || "{}").secret; } catch { /* corps illisible */ }
      if (secret !== env.botSecret) { res.writeHead(401).end(); return; }
      // On répond tout de suite : Convex n'attend pas le résultat du traitement.
      res.writeHead(202, { "content-type": "application/json" });
      res.end('{"ok":true}');
      void Promise.resolve(onPush()).catch((e) => console.error("[push] traitement :", e));
    });
    return;
  }
  // Tout le reste = healthcheck Railway : lié à l'état de la gateway Discord.
  // 503 tant que le client n'est pas connecté (Railway redémarre alors le bot).
  if (isReady()) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("Station 13 bot OK");
  } else {
    res.writeHead(503, { "content-type": "text/plain" });
    res.end("Station 13 bot indisponible (gateway non prête)");
  }
}
