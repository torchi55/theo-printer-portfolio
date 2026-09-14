// Shared helpers for the visit log. Files starting with "_" are not deployed as routes.

const REDIS_URL = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// Upstash REST pipeline: [["HSET","k","f","v"], ...] -> [result, ...]
async function redis(commands) {
  const url = REDIS_URL(), token = REDIS_TOKEN();
  if (!url || !token) throw new Error("redis not configured");
  const r = await fetch(url.replace(/\/$/, "") + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error("redis " + r.status);
  const out = await r.json();
  return out.map((x) => (x.error ? null : x.result));
}

// Calendar day in LA, e.g. "2026-09-14"
function laDay(ts = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(ts);
}

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  return (xff ? String(xff).split(",")[0] : req.headers["x-real-ip"] || "").trim();
}

function readBody(req) {
  let b = req.body;
  if (Buffer.isBuffer(b)) b = b.toString("utf8");
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  return b && typeof b === "object" ? b : null;
}

// "/pike.html" "/pike/" "/index.html" -> "/pike" "/pike" "/"
function normPath(p) {
  p = String(p || "/").split(/[?#]/)[0].slice(0, 120);
  p = p.replace(/\/index\.html$/, "/").replace(/\.html$/, "").replace(/\/+$/, "");
  return p || "/";
}

module.exports = { redis, laDay, clientIp, readBody, normPath };
