// POST /api/collect — receives beacons from /analytics.js
const { redis, laDay, clientIp, readBody, normPath } = require("./_lib");

const TTL = 60 * 60 * 24 * 120; // raw views kept 120 days
const HEX = /^[0-9a-f]{16}$/;
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|monitor|curl|wget|python|axios|node-fetch|go-http/i;

function device(ua, w) {
  const os = /iphone|ipad|ipod/i.test(ua) ? "iOS" : /android/i.test(ua) ? "Android" : /windows/i.test(ua) ? "Windows"
    : /mac os/i.test(ua) ? "macOS" : /cros/i.test(ua) ? "ChromeOS" : /linux/i.test(ua) ? "Linux" : "Other";
  const br = /edg\//i.test(ua) ? "Edge" : /opr\/|opera/i.test(ua) ? "Opera" : /firefox|fxios/i.test(ua) ? "Firefox"
    : /crios|chrome/i.test(ua) ? "Chrome" : /safari/i.test(ua) ? "Safari" : "Other";
  const type = /ipad|tablet/i.test(ua) ? "tablet" : /mobi|iphone|android/i.test(ua) || (w && w < 700) ? "mobile" : "desktop";
  return { os, br, dev: type };
}

function refHost(r) {
  if (!r) return "";
  try { return new URL(r).hostname.replace(/^www\./, "").replace(/^(l|lm|m)\.(facebook|linkedin|instagram)\./, "$2."); }
  catch { return ""; }
}

// Network owner of the IP (e.g. a firm or university on its own network). No key, 45 req/min.
async function lookupOrg(ip) {
  if (!ip || /^(127\.|10\.|192\.168\.|::1)/.test(ip)) return {};
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 900);
    const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,org,isp,hosting`, { signal: ctl.signal });
    clearTimeout(t);
    const j = await r.json();
    return j.status === "success" ? { org: j.org || j.isp || "", host: j.hosting ? "1" : "" } : {};
  } catch { return {}; }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  const b = readBody(req);
  const ua = String(req.headers["user-agent"] || "");
  if (!b || !HEX.test(b.id || "") || BOT.test(ua)) return res.status(204).end();

  try {
    if (b.t === "time") {
      const key = "pv:" + b.id;
      const ms = Math.max(0, Math.min(Number(b.ms) || 0, 4 * 3600e3)) | 0;
      const sd = Math.max(0, Math.min(Number(b.sd) || 0, 100)) | 0;
      const [exists] = await redis([["EXISTS", key]]);
      if (exists) await redis([["HSET", key, "ms", ms, "sd", sd]]);
      return res.status(204).end();
    }

    if (b.t !== "view" || !HEX.test(b.v || "") || !HEX.test(b.s || "")) return res.status(204).end();

    const now = Date.now();
    const day = laDay(now);
    const p = normPath(b.p);
    const geo = (h) => { try { return decodeURIComponent(req.headers[h] || ""); } catch { return ""; } };
    const sessKey = "sess:" + b.s;

    // Org lookup once per session
    const [known] = await redis([["HGET", sessKey, "org"]]);
    const net = known !== null ? { org: known } : await lookupOrg(clientIp(req));

    const d = device(ua, Number(b.w));
    const fields = {
      p, v: b.v, s: b.s, ts: now, ms: 0, sd: 0,
      ctry: geo("x-vercel-ip-country"), reg: geo("x-vercel-ip-country-region"), city: geo("x-vercel-ip-city"),
      ref: refHost(b.r), q: String(b.q || "").slice(0, 60), org: net.org || "", host: net.host || "", ...d,
    };
    const key = "pv:" + b.id;
    await redis([
      ["HSET", key, ...Object.entries(fields).flat().map(String)],
      ["EXPIRE", key, TTL],
      ["RPUSH", "day:" + day, b.id],
      ["EXPIRE", "day:" + day, TTL],
      ["HSET", sessKey, "org", fields.org],
      ["EXPIRE", sessKey, 60 * 60 * 6],
      ["SET", "first:" + b.v, now, "NX"], // first-ever visit (returning check)
      ["HINCRBY", "all:views", p, 1], // all-time page counter, never expires
    ]);
    res.status(204).end();
  } catch (e) {
    res.status(204).end(); // never surface errors to visitors
  }
};
