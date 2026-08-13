// Authentification Nexus paramétrée (par identifiants d'agent) + chiffrement
// réversible du mot de passe au repos. À n'utiliser que dans des ACTIONS
// (fetch réseau + Web Crypto ; indisponibles en query/mutation).
const BASE = "https://mdt.vizu-world.com";

// Login Nexus avec des identifiants fournis -> token Bearer.
export async function nexusLogin(email: string, password: string): Promise<string> {
  const path = process.env.VIZU_LOGIN_PATH || "/auth/login";
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login Nexus échoué (HTTP ${res.status}).`);
  const j: any = await res.json();
  const token = j.token || j.accessToken || j?.state?.token || j?.data?.token || j?.data?.accessToken;
  if (!token) throw new Error("Token introuvable dans la réponse de login Nexus.");
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
