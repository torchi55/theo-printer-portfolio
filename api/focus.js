// /api/focus — Focus Gate snapshot (Theo's PC productivity).
// POST: PC pushes the latest snapshot. Header "x-push" must match FOCUS_PUSH_TOKEN.
// GET:  owner-only read. Header "x-key" must match ANALYTICS_PASSWORD (same key as the visit log).
const crypto = require("crypto");
const { redis, clientIp, readBody } = require("./_lib");

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a || ""), sha(b));

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");

  if (req.method === "POST") {
    const token = process.env.FOCUS_PUSH_TOKEN;
    if (!token) return res.status(503).json({ error: "not configured" });
    if (!same(req.headers["x-push"], token)) return res.status(401).json({ error: "denied" });
    const body = readBody(req);
    const raw = body && JSON.stringify(body);
    if (!raw || raw.length > 100000) return res.status(400).json({ error: "bad body" });
    await redis([["SET", "focus:latest", raw]]);
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "GET") return res.status(405).end();
  const secret = process.env.ANALYTICS_PASSWORD;
  if (!secret) return res.status(503).json({ error: "not configured" });
  const failKey = "fail:" + clientIp(req);
  try {
    const [fails] = await redis([["GET", failKey]]);
    if (Number(fails) >= 8) return res.status(429).json({ error: "locked" });
    if (!same(req.headers["x-key"], secret)) {
      await redis([["INCR", failKey], ["EXPIRE", failKey, 900]]);
      return res.status(401).json({ error: "denied" });
    }
    const [snap] = await redis([["GET", "focus:latest"]]);
    if (!snap) return res.status(404).json({ error: "no data yet" });
    return res.status(200).send(snap);
  } catch {
    return res.status(503).json({ error: "storage offline" });
  }
};
