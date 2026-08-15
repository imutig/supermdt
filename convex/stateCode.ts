import { v, ConvexError } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAgent } from "./rbac";

// ---------- Helpers ----------
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Découpe un corps de code en blocs (article / chapitre / paragraphe) pour une
// récupération fine : on ne renvoie à l'IA que les passages pertinents.
function splitBlocks(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const blocks: string[] = [];
  let cur: string[] = [];
  const isHeader = (l: string) =>
    /^(article|art\.|chapitre|titre|livre|section|préambule|preambule|sous-titre)\b/i.test(l.trim()) ||
    /^[A-ZÀ-ÖØ-Þ0-9 .,'’—\-]{8,}$/.test(l.trim()); // ligne toute en majuscules = titre
  for (const line of lines) {
    if (line.trim() === "") {
      if (cur.length) { blocks.push(cur.join("\n").trim()); cur = []; }
      continue;
    }
    if (isHeader(line) && cur.length) {
      blocks.push(cur.join("\n").trim());
      cur = [line];
    } else {
      cur.push(line);
    }
  }
  if (cur.length) blocks.push(cur.join("\n").trim());
  return blocks.filter((b) => b.length > 0);
}

const STOP = new Set([
  "le","la","les","un","une","des","de","du","dans","et","ou","a","à","au","aux","en","sur","pour","par",
  "que","qui","quoi","est","il","elle","on","ce","cette","ces","se","sa","son","ses","mon","ma","mes",
  "je","tu","nous","vous","ils","elles","avec","sans","pas","ne","plus","moins","peut","peut-on","est-ce",
  "quel","quelle","quels","quelles","combien","comment","quand","pourquoi","si","the","what","how","can",
]);

function keywords(q: string): string[] {
  return norm(q)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

// ---------- Ingestion (via HTTP, voir http.ts) ----------
export const upsertSection = internalMutation({
  args: {
    slug: v.string(),
    code: v.string(),
    title: v.string(),
    order: v.number(),
    body: v.string(),
    sourceUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("stateCodeSections")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    const searchText = norm(`${args.code} ${args.title} ${args.body}`);
    const doc = { ...args, searchText, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return { updated: true };
    }
    await ctx.db.insert("stateCodeSections", doc);
    return { updated: false };
  },
});

// Maintenance : retirer une section par slug (nettoyage / ré-import).
export const _removeSlug = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const rows = await ctx.db
      .query("stateCodeSections")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    const remaining = (await ctx.db.query("stateCodeSections").collect()).length;
    return { deleted: rows.length, remaining };
  },
});

// ---------- Lecture ----------
// Résumé public (pour afficher l'état de l'index côté UI).
export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireAgent(ctx);
    const rows = await ctx.db.query("stateCodeSections").collect();
    return {
      count: rows.length,
      codes: rows
        .sort((a, b) => a.order - b.order)
        .map((r) => ({ code: r.code, title: r.title, chars: r.body.length })),
      updatedAt: rows.reduce((m, r) => Math.max(m, r.updatedAt), 0),
    };
  },
});

// Interne : tout le corpus (bodies) pour la récupération dans l'action.
export const _all = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireAgent(ctx); // l'identité de l'agent est propagée depuis l'action
    const rows = await ctx.db.query("stateCodeSections").collect();
    return rows
      .sort((a, b) => a.order - b.order)
      .map((r) => ({ code: r.code, title: r.title, body: r.body, sourceUrl: r.sourceUrl ?? null }));
  },
});

// ---------- Assistant juridique ----------
const CHAR_BUDGET = 48000; // ~14-16k tokens de contexte : confortable pour un free tier

type Retrieved = { code: string; sourceUrl: string | null; passages: string[] };

function retrieve(
  sections: { code: string; title: string; body: string; sourceUrl: string | null }[],
  question: string,
): { context: string; sources: { code: string; sourceUrl: string | null }[] } {
  const kws = keywords(question);
  type Scored = { code: string; sourceUrl: string | null; block: string; score: number };
  const scored: Scored[] = [];
  for (const s of sections) {
    for (const block of splitBlocks(s.body)) {
      const nb = norm(block);
      let score = 0;
      for (const k of kws) {
        let idx = nb.indexOf(k), c = 0;
        while (idx !== -1 && c < 5) { score++; c++; idx = nb.indexOf(k, idx + k.length); }
      }
      // Léger bonus si le nom du code matche un mot-clé (question ciblée).
      if (kws.some((k) => norm(s.code).includes(k))) score += 1;
      if (score > 0) scored.push({ code: s.code, sourceUrl: s.sourceUrl, block, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);

  const byCode = new Map<string, Retrieved>();
  let used = 0;
  for (const s of scored) {
    if (used + s.block.length > CHAR_BUDGET) continue;
    used += s.block.length;
    if (!byCode.has(s.code)) byCode.set(s.code, { code: s.code, sourceUrl: s.sourceUrl, passages: [] });
    byCode.get(s.code)!.passages.push(s.block);
    if (used >= CHAR_BUDGET) break;
  }

  const groups = [...byCode.values()];
  const context = groups
    .map((g) => `### ${g.code}\n${g.passages.join("\n\n")}`)
    .join("\n\n");
  return { context, sources: groups.map((g) => ({ code: g.code, sourceUrl: g.sourceUrl })) };
}

const SYSTEM = `Tu es l'assistant juridique interne de la LSPD (Los Santos Police Department) pour un serveur GTA RP.
Tu réponds UNIQUEMENT à partir des extraits du State Code fournis dans le contexte. Règles STRICTES :
- N'invente RIEN. N'utilise aucune connaissance juridique extérieure au contexte fourni.
- Si la réponse n'est pas dans les extraits, dis-le clairement : « Le State Code fourni ne couvre pas ce point » et n'invente pas.
- Cite toujours les articles précis sur lesquels tu t'appuies (ex. « Article CA. 13-2 », « Article 1-6 »).
- Réponds en français, de façon concise et opérationnelle (tu t'adresses à des officiers). Donne les sanctions exactes (amende, peine) quand elles figurent dans les extraits.
- Rappelle si besoin que ta réponse est une aide et que l'agent reste responsable de la vérification.`;

export const ask = action({
  args: { question: v.string() },
  handler: async (ctx, { question }): Promise<{ answer: string; sources: { code: string; sourceUrl: string | null }[] }> => {
    const q = question.trim();
    if (q.length < 3) throw new ConvexError("Pose une question un peu plus précise.");

    const sections = await ctx.runQuery(internal.stateCode._all, {});
    if (sections.length === 0) {
      throw new ConvexError("Le State Code n'est pas encore indexé. Contacte un administrateur.");
    }

    const { context, sources } = retrieve(sections, q);
    if (!context) {
      return {
        answer: "Je n'ai trouvé aucun passage du State Code correspondant à cette question. Reformule avec d'autres termes (nom du code, type d'infraction, mot-clé juridique).",
        sources: [],
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ConvexError(
        "La clé IA n'est pas configurée. Un administrateur doit définir GEMINI_API_KEY (clé gratuite Google AI Studio) dans les variables d'environnement Convex.",
      );
    }
    // Défaut : Gemini 3.5 Flash Lite — 500 req/jour en free tier (vs 20 pour les
    // Flash « pleins »), largement suffisant pour de la Q&A ancrée. Surchargé par
    // STATECODE_MODEL si besoin (coller l'id exact depuis Google AI Studio).
    const model = process.env.STATECODE_MODEL || "gemini-3.5-flash-lite";

    const prompt = `Contexte (extraits du State Code) :\n\n${context}\n\n---\nQuestion de l'agent : ${q}\n\nRéponds selon les règles, en citant les articles.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
        }),
      },
    );

    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new ConvexError(
        resp.status === 429
          ? "Limite du quota gratuit atteinte, réessaie dans un moment."
          : `Erreur du service IA (${resp.status}).${t ? " " + t.slice(0, 180) : ""}`,
      );
    }
    const data = await resp.json();
    const answer =
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("").trim() ||
      "Je n'ai pas pu produire de réponse à partir du State Code.";

    return { answer, sources };
  },
});
