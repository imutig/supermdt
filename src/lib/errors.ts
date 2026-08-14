import { ConvexError } from "convex/values";

// Extraction du message lisible d'une erreur Convex.
//
// En PRODUCTION, Convex masque le message des `Error` classiques (« Server
// Error ») : seul le contenu d'un `ConvexError` (son `.data`) traverse jusqu'au
// client. On lit donc `.data` en priorité. Pour les `Error` classiques (dev,
// réseau, client) on retombe sur l'ancien parsing du message enrobé :
//
//   [Request ID: 73f9…] Server Error
//   Uncaught Error: Code d'accès incorrect.
export function readableError(e: unknown, fallback = "Action impossible."): string {
  // ConvexError : le message métier voyage dans `.data`.
  if (e instanceof ConvexError) {
    const d: unknown = e.data;
    if (typeof d === "string" && d.trim()) return d.trim();
    if (d && typeof d === "object" && "message" in d && typeof (d as { message?: unknown }).message === "string") {
      return ((d as { message: string }).message).trim();
    }
  }

  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (!raw) return fallback;

  const thrown = raw.match(/Uncaught\s+(?:\w*Error):\s*(.+)/);
  if (thrown) return thrown[1].trim();

  const first = raw.replace(/^\[.*?\]\s*/, "").split("\n")[0].trim();
  if (!first || first === "Server Error") return fallback;
  return first;
}
