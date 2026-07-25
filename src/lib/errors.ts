// Extraction du message lisible d'une erreur Convex.
//
// Convex enrobe les erreurs levées côté serveur :
//
//   [Request ID: 73f9…] Server Error
//   Uncaught Error: Code d'accès incorrect.
//       at handler (../convex/access.ts:46:43)
//
// Se contenter de la première ligne après le préfixe entre crochets affichait
// donc « Server Error » à la place du message réel. On va chercher la ligne
// « Uncaught … » quand elle existe, et on retombe sur la première ligne utile
// sinon (erreurs réseau, erreurs client).
export function readableError(e: unknown, fallback = "Action impossible."): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (!raw) return fallback;

  const thrown = raw.match(/Uncaught\s+(?:\w*Error):\s*(.+)/);
  if (thrown) return thrown[1].trim();

  const first = raw.replace(/^\[.*?\]\s*/, "").split("\n")[0].trim();
  if (!first || first === "Server Error") return fallback;
  return first;
}
