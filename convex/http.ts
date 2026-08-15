import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

// Routes d'authentification Convex Auth.
auth.addHttpRoutes(http);

// ---- Ingestion du State Code (import ponctuel depuis le site source) ----
// Protégé par un secret partagé. Sert à pousser chaque section directement en
// base sans transiter par un client (voir stateCode.ts).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-ingest-secret",
};

http.route({
  path: "/statecode/ingest",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: CORS })),
});

http.route({
  path: "/statecode/ingest",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = req.headers.get("x-ingest-secret");
    if (!process.env.STATECODE_INGEST_SECRET || secret !== process.env.STATECODE_INGEST_SECRET) {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
        status: 403,
        headers: { ...CORS, "content-type": "application/json" },
      });
    }
    let payload: { slug?: string; code?: string; title?: string; order?: number; body?: string; sourceUrl?: string };
    try {
      payload = await req.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "bad json" }), {
        status: 400,
        headers: { ...CORS, "content-type": "application/json" },
      });
    }
    const { slug, code, title, order, body, sourceUrl } = payload;
    if (!slug || !code || !body) {
      return new Response(JSON.stringify({ ok: false, error: "missing fields" }), {
        status: 400,
        headers: { ...CORS, "content-type": "application/json" },
      });
    }
    const res = await ctx.runMutation(internal.stateCode.upsertSection, {
      slug,
      code,
      title: title || code,
      order: order ?? 0,
      body,
      sourceUrl,
    });
    return new Response(JSON.stringify({ ok: true, ...res, len: body.length }), {
      headers: { ...CORS, "content-type": "application/json" },
    });
  }),
});

export default http;
