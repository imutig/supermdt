import type { IncomingMessage, ServerResponse } from "node:http";
import { env } from "./env.js";

// Traite les requêtes du serveur HTTP unique du bot (créé dans index.ts) :
//   - healthcheck Railway (toute requête non /push) -> 200
//   - POST /push { secret } -> déclenche un traitement immédiat (onPush)
// On NE crée PAS de second serveur : Railway n'expose qu'un port, déjà occupé
// par le healthcheck. Sécurisé par le secret partagé (même BOT_SECRET que les
// requêtes Convex).
export function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  onPush: () => Promise<void> | void,
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
  // Tout le reste = healthcheck Railway.
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Station 13 bot OK");
}
