import { type Client, type TextChannel, type Message } from "discord.js";
import { mdt } from "./convex.js";
import { parisWallToEpoch } from "./tickets.js";

// Services IN-GAME : lecture du salon « VIZU | Service Log ». Chaque embed = une
// prise de service (début, fin, Discord du joueur). On extrait, on envoie à
// Convex (dédup par messageId), avec un curseur pour ne relire que le nouveau.

// Concatène tout le texte brut de l'embed (mentions non rendues).
function embedBlob(msg: Message): string {
  const parts: string[] = [];
  for (const e of msg.embeds) {
    if (e.author?.name) parts.push(e.author.name);
    if (e.title) parts.push(e.title);
    if (e.description) parts.push(e.description);
    for (const f of e.fields ?? []) parts.push(f.name, f.value);
    if (e.footer?.text) parts.push(e.footer.text);
  }
  return parts.join("\n");
}

const DATE = String.raw`(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})`;

function toEpoch(m: RegExpMatchArray | null): number | null {
  if (!m) return null;
  return parisWallToEpoch(+m[1], +m[2], +m[3], +m[4], +m[5]) + +m[6] * 1000;
}

export function parseServiceLog(
  msg: Message,
): { discordId: string; startedAt: number; endedAt: number; ingameName?: string; ingameId?: string } | null {
  if (!msg.embeds.length) return null;
  const blob = embedBlob(msg);
  if (!/service/i.test(blob)) return null;
  const discord = blob.match(/<@!?(\d+)>/);
  const start = toEpoch(blob.match(new RegExp(String.raw`d[ée]but[^\d]*${DATE}`, "i")));
  const end = toEpoch(blob.match(new RegExp(String.raw`fin[^\d]*${DATE}`, "i")));
  if (!discord || start == null || end == null || end <= start) return null;
  const name = blob.match(/Nom\s*:?\s*([^\n|]+?)\s*(?:\n|$)/i);
  const uid = blob.match(/ID\s*unique\s*:?\s*(\d+)/i);
  return { discordId: discord[1], startedAt: start, endedAt: end, ingameName: name?.[1]?.trim(), ingameId: uid?.[1] };
}

let lastIncremental = 0;

// Synchronise les services in-game. Historique complet si resync demandé ou pas
// de curseur ; sinon uniquement les messages postérieurs au curseur (throttle
// 5 min pour l'incrémental, immédiat pour un resync). Idempotent (dédup Convex).
export async function syncInGameServices(client: Client): Promise<void> {
  const state = await mdt.ingameSyncState().catch(() => null);
  if (!state?.channelId) return;
  const full = state.resync || !state.lastMsgId;
  if (!full && Date.now() - lastIncremental < 5 * 60_000) return;
  if (!full) lastIncremental = Date.now();

  const chan = await client.channels.fetch(state.channelId).catch(() => null);
  if (!chan || !chan.isTextBased()) return;
  const tc = chan as TextChannel;

  let processed = 0, created = 0, newest: string | null = null;
  const handle = async (m: Message) => {
    const p = parseServiceLog(m);
    if (!p) return;
    processed++;
    const r = await mdt.ingameUpsert({ messageId: m.id, ...p }).catch(() => ({ created: false }));
    if (r?.created) created++;
  };

  try {
    if (full) {
      // Remonte l'historique par lots de 100 (borné pour éviter les rate limits).
      let before: string | undefined;
      for (let batch = 0; batch < 150; batch++) {
        const msgs = await tc.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        if (msgs.size === 0) break;
        const arr = [...msgs.values()]; // récent -> ancien
        if (!newest) newest = arr[0].id;
        for (const m of arr) await handle(m);
        before = arr[arr.length - 1].id;
        if (msgs.size < 100) break;
      }
      await mdt.ingameSetCursor({ lastMsgId: newest ?? undefined, clearResync: true }).catch(() => {});
    } else {
      let after = state.lastMsgId!;
      for (let batch = 0; batch < 50; batch++) {
        const msgs = await tc.messages.fetch({ limit: 100, after });
        if (msgs.size === 0) break;
        const arr = [...msgs.values()].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1)); // ancien -> récent
        for (const m of arr) await handle(m);
        after = arr[arr.length - 1].id;
        newest = after;
        if (msgs.size < 100) break;
      }
      if (newest) await mdt.ingameSetCursor({ lastMsgId: newest }).catch(() => {});
    }
  } catch (e) {
    console.error("[ingame] synchro échouée :", e);
    return;
  }
  if (processed) console.log(`[ingame] ${processed} log(s) traité(s), ${created} nouveau(x)${full ? " (historique complet)" : ""}.`);
}
