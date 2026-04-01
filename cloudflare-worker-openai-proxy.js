/**
 * Cloudflare Worker: OpenAI CORS proxy for static sites.
 *
 * Deploy:
 * - Create a Worker
 * - Set a secret in Cloudflare: OPENAI_API_KEY (optional if you want server-side key)
 * - Bind it as an environment variable
 *
 * This proxy supports two modes:
 * 1) Server-side key (recommended): client sends NO Authorization header; worker adds it.
 * 2) Bring-your-own-key: client sends Authorization: Bearer ...; worker forwards it.
 *
 * It enables CORS so browser fetch works from GitHub Pages.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    // Serve as /v1/responses to match client default
    const upstream = "https://api.openai.com" + url.pathname;

    const headers = new Headers(request.headers);
    headers.set("Content-Type", "application/json");

    const hasAuth = headers.has("Authorization");
    if (!hasAuth) {
      const serverKey = env.OPENAI_API_KEY || env.OPENAI_APIKEY;
      if (!serverKey) {
        return new Response("Missing Authorization header and no OPENAI_API_KEY/OPENAI_APIKEY configured.", {
          status: 400,
          headers: CORS_HEADERS
        });
      }
      headers.set("Authorization", `Bearer ${serverKey}`);
    }

    const upstreamRes = await fetch(upstream, {
      method: "POST",
      headers,
      body: request.body
    });

    const resHeaders = new Headers(upstreamRes.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) resHeaders.set(k, v);
    return new Response(upstreamRes.body, { status: upstreamRes.status, headers: resHeaders });
  }
};

