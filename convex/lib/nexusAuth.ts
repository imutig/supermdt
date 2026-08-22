// Authentification Nexus paramétrée (par identifiants d'agent) + chiffrement
// réversible du mot de passe au repos. À n'utiliser que dans des ACTIONS
// (fetch réseau + Web Crypto ; indisponibles en query/mutation).
const BASE = "https://mdt.vizu-world.com";

// Échec de login Nexus qualifié : « AUTH » = identifiants réellement refusés
// (401/403) ; « TRANSIENT » = panne passagère (réseau, timeout, 429, 5xx, réponse
// inattendue). On ne doit invalider un compte QUE sur un échec AUTH — un échec
// TRANSIENT est temporaire et ne doit ni bloquer le compte ni déclencher d'alerte.
export class NexusLoginError extends Error {
  readonly kind: "AUTH" | "TRANSIENT";
  readonly status?: number;
  constructor(message: string, kind: "AUTH" | "TRANSIENT", status?: number) {
    super(message);
    this.name = "NexusLoginError";
    this.kind = kind;
    this.status = status;
  }
}

// Vrai uniquement pour un échec d'authentification AVÉRÉ (mauvais identifiants).
export function isNexusAuthFailure(e: unknown): boolean {
  // instanceof + repli canard : robuste si l'erreur traverse une frontière de module.
  return e instanceof NexusLoginError ? e.kind === "AUTH" : !!e && typeof e === "object" && (e as { kind?: string }).kind === "AUTH";
}

const LOGIN_TIMEOUT_MS = 20_000;

// Login Nexus avec des identifiants fournis -> token Bearer. Lève une
// NexusLoginError qualifiée (AUTH vs TRANSIENT) en cas d'échec.
export async function nexusLogin(email: string, password: string): Promise<string> {
  const path = process.env.VIZU_LOGIN_PATH || "/auth/login";
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), LOGIN_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: ac.signal,
    });
  } catch (e) {
    // Réseau injoignable / timeout / DNS… : passager, jamais un vrai refus.
    throw new NexusLoginError(`Nexus injoignable (${e instanceof Error ? e.message : String(e)}).`, "TRANSIENT");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    // Seuls 401/403 sont un refus d'identifiants ; tout le reste (429, 5xx, 404…)
    // est traité comme passager pour ne pas invalider un compte à tort.
    const kind = res.status === 401 || res.status === 403 ? "AUTH" : "TRANSIENT";
    throw new NexusLoginError(`Login Nexus échoué (HTTP ${res.status}).`, kind, res.status);
  }
  const j: any = await res.json().catch(() => null);
  const token = j && (j.token || j.accessToken || j?.state?.token || j?.data?.token || j?.data?.accessToken);
  // Réponse OK mais sans token : anomalie serveur, pas un mauvais mot de passe.
  if (!token) throw new NexusLoginError("Réponse de login Nexus inattendue (token absent).", "TRANSIENT");
  return token as string;
}

// ----- Chiffrement AES-GCM (clé serveur NEXUS_ENC_KEY, base64 de 32 octets) -----
async function getKey(): Promise<CryptoKey> {
  const b64 = process.env.NEXUS_ENC_KEY;
  if (!b64) throw new Error("NEXUS_ENC_KEY non configurée (clé de chiffrement 32 octets en base64).");
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("NEXUS_ENC_KEY invalide : 32 octets attendus (base64).");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
function b64(bytes: Uint8Array): string {
  let s = "";
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export async function encryptSecret(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
  return `${b64(iv)}:${b64(ct)}`;
}

export async function decryptSecret(enc: string): Promise<string> {
  const key = await getKey();
  const [ivb, ctb] = enc.split(":");
  const iv = unb64(ivb) as unknown as BufferSource;
  const ct = unb64(ctb) as unknown as BufferSource;
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}
