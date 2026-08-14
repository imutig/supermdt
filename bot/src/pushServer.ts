import { createServer } from "node:http";
import { env } from "./env.js";

// Serveur HTTP minimal : Convex prévient le bot (« push ») quand il y a du
// travail (sanction, convocation, absence, invite, rôle, alerte…), au lieu que
// le bot sonde Convex en boucle. Le poll de sécurité reste actif en filet.
//
// POST /push  { secret }  -> déclenche un traitement immédiat (onPush()).
// Sécurisé par le secret partagé (même BOT_SECRET que les requêtes Convex).
export function startPushServer(onPush: () => Promise<void> | void) {
  if (!env.pushPort) {
    console.log("[push] serveur désactivé (PORT absent) : le bot reste en poll de sécurité.");
    return;
  }
  const server = createServer((req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    if (req.method !== "POST" || req.url !== "/push") {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 10_000) req.destroy(); });
    req.on("end", () => {
      let secret: string | undefined;
      try { secret = JSON.parse(body || "{}").secret; } catch { /* */ }
      if (secret !== env.botSecret) {
        res.writeHead(401).end();
        return;
      }
      res.writeHead(202, { "content-type": "application/json" });
      res.end('{"ok":true}');
      // Traitement après avoir répondu (Convex n'attend pas le résultat).
      void Promise.resolve(onPush()).catch((e) => console.error("[push] traitement :", e));
    });
  });
  server.listen(env.pushPort, () => console.log(`[push] serveur à l'écoute sur le port ${env.pushPort}.`));
  server.on("error", (e) => console.error("[push] serveur :", e));
}
