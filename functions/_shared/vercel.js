// Runs an unchanged Vercel Node handler (req, res) as a Cloudflare Pages Function.
// The api/*.js files stay the single source of logic: Vercel and Cloudflare run the same code.
// Needs the nodejs_compat flag (wrangler.toml): the handlers use require("crypto"), Buffer and process.env.
// Files under functions/_shared export no onRequest, so Pages makes no route from them.

// Vercel's geo and IP headers, filled from Cloudflare's request.cf and CF-Connecting-IP.
function vercelHeaders(request) {
  const h = {};
  for (const [k, v] of request.headers) h[k] = v;
  const cf = request.cf || {};
  const ip = h["cf-connecting-ip"];
  if (ip) { h["x-forwarded-for"] = ip; h["x-real-ip"] = ip; }
  if (cf.country) h["x-vercel-ip-country"] = cf.country;
  if (cf.regionCode) h["x-vercel-ip-country-region"] = cf.regionCode;
  if (cf.city) h["x-vercel-ip-city"] = encodeURIComponent(cf.city);   // Vercel sends the city URL-encoded
  return h;
}

// Vercel parses a JSON body only for Content-Type application/json; other bodies stay a string.
function vercelBody(text, type) {
  if (/application\/json/i.test(type || "")) { try { return JSON.parse(text); } catch { return text; } }
  return text;
}

export function adapt(handler) {
  return async ({ request, env }) => {
    if (typeof process !== "undefined" && process.env && env) {
      for (const [k, v] of Object.entries(env)) if (typeof v === "string") process.env[k] = v;
    }
    const url = new URL(request.url);
    const headers = vercelHeaders(request);
    const query = {};
    for (const [k, v] of url.searchParams) query[k] = k in query ? [].concat(query[k], v) : v;
    const req = { method: request.method, url: url.pathname + url.search, headers, query, body: undefined };
    if (request.method !== "GET" && request.method !== "HEAD") req.body = vercelBody(await request.text(), headers["content-type"]);

    let code = 200, body = null;
    const out = new Headers();
    const res = {
      status(n) { code = n; return res; },
      setHeader(k, v) { out.set(k, String(v)); return res; },
      getHeader(k) { return out.get(k); },
      json(o) { out.set("Content-Type", "application/json; charset=utf-8"); body = JSON.stringify(o); return res; },
      send(b) { body = b == null ? null : typeof b === "object" ? JSON.stringify(b) : String(b); return res; },
      end(b) { if (b != null) body = String(b); return res; },
    };
    await handler(req, res);
    const empty = code === 204 || code === 304 || request.method === "HEAD";
    return new Response(empty ? null : body, { status: code, headers: out });
  };
}
