// GET /api/stats?days=1|7|30 — owner-only visit log. Header "x-key" must match ANALYTICS_PASSWORD.
const crypto = require("crypto");
const { redis, laDay, clientIp } = require("./_lib");

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  const secret = process.env.ANALYTICS_PASSWORD;
  if (!secret) return res.status(503).json({ error: "not configured" });

  // Lock out an IP after 8 wrong passwords for 15 minutes
  const failKey = "fail:" + clientIp(req);
  try {
    const [fails] = await redis([["GET", failKey]]);
    if (Number(fails) >= 8) return res.status(429).json({ error: "locked" });
    if (!crypto.timingSafeEqual(sha(req.headers["x-key"] || ""), sha(secret))) {
      await redis([["INCR", failKey], ["EXPIRE", failKey, 900]]);
      return res.status(401).json({ error: "denied" });
    }
  } catch {
    return res.status(503).json({ error: "storage offline" });
  }

  const days = Math.max(1, Math.min(Number(req.query.days) || 1, 90));
  const now = Date.now();
  const dayList = [];
  for (let i = days - 1; i >= 0; i--) dayList.push(laDay(now - i * 864e5));
  // DST edges can repeat/skip a date — dedupe and make sure today is present
  const uniqDays = [...new Set([...dayList, laDay(now)])];

  const lists = await redis(uniqDays.map((d) => ["LRANGE", "day:" + d, 0, -1]));
  const ids = lists.flatMap((l) => l || []);
  const raw = ids.length ? await redis(ids.map((id) => ["HGETALL", "pv:" + id])) : [];

  const views = raw
    .map((arr) => {
      if (!arr || !arr.length) return null;
      const o = {};
      for (let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i + 1];
      o.ts = Number(o.ts); o.ms = Number(o.ms) || 0; o.sd = Number(o.sd) || 0;
      return o.p ? o : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts);

  const visitorIds = [...new Set(views.map((v) => v.v))];
  const firsts = visitorIds.length ? await redis(visitorIds.map((v) => ["GET", "first:" + v])) : [];
  const firstSeen = Object.fromEntries(visitorIds.map((v, i) => [v, Number(firsts[i]) || now]));
  const [allViews] = await redis([["HGETALL", "all:views"]]);

  // ── aggregate ──
  const pages = {};
  for (const v of views) {
    const g = (pages[v.p] ||= { path: v.p, views: 0, visitors: new Set(), ms: [], sd: [] });
    g.views++; g.visitors.add(v.v);
    if (v.ms > 0) g.ms.push(v.ms);
    g.sd.push(v.sd);
  }
  const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
  const pageRows = Object.values(pages)
    .map((g) => ({ path: g.path, views: g.views, visitors: g.visitors.size, avgMs: avg(g.ms), medMs: median(g.ms), totalMs: g.ms.reduce((x, y) => x + y, 0), scroll: avg(g.sd) }))
    .sort((a, b) => b.visitors - a.visitors || b.totalMs - a.totalMs);

  const sessions = {};
  for (const v of views) {
    const s = (sessions[v.s] ||= {
      start: v.ts, end: v.ts, v: v.v, city: v.city, reg: v.reg, ctry: v.ctry, org: v.org, host: v.host === "1",
      ref: v.ref || "direct", q: v.q, dev: v.dev, os: v.os, br: v.br, trail: [],
      returning: firstSeen[v.v] < v.ts - 30 * 60e3,
    });
    s.end = Math.max(s.end, v.ts + v.ms);
    if (!s.q && v.q) s.q = v.q;
    s.trail.push({ p: v.p, ms: v.ms, sd: v.sd, ts: v.ts });
  }
  const sessionRows = Object.values(sessions)
    .map((s) => ({ ...s, place: [s.city, s.reg, s.ctry].filter(Boolean).join(", "), ms: s.trail.reduce((x, t) => x + t.ms, 0) }))
    .sort((a, b) => b.start - a.start);

  const count = (key) => {
    const m = {};
    for (const s of sessionRows) { const k = s[key] || "—"; m[k] = (m[k] || 0) + 1; }
    return Object.entries(m).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
  };

  const byDay = uniqDays.map((d) => {
    const vs = views.filter((v) => laDay(v.ts) === d);
    return { day: d, views: vs.length, visitors: new Set(vs.map((v) => v.v)).size };
  });

  const today = laDay(now);
  const todayViews = views.filter((v) => laDay(v.ts) === today);

  res.status(200).json({
    generated: now,
    days,
    summary: {
      views: views.length,
      visitors: visitorIds.length,
      sessions: sessionRows.length,
      newVisitors: sessionRows.filter((s) => !s.returning).map((s) => s.v).filter((v, i, a) => a.indexOf(v) === i).length,
      avgSessionMs: avg(sessionRows.map((s) => s.ms)),
      liveNow: new Set(views.filter((v) => v.ts + v.ms > now - 5 * 60e3).map((v) => v.v)).size,
      todayVisitors: new Set(todayViews.map((v) => v.v)).size,
      todayViews: todayViews.length,
    },
    byDay,
    pages: pageRows,
    sessions: sessionRows.slice(0, 150),
    referrers: count("ref"),
    places: count("place"),
    devices: count("dev"),
    allTime: Object.fromEntries(
      (allViews || []).reduce((acc, x, i, a) => (i % 2 ? acc : acc.concat([[x, Number(a[i + 1])]])), [])
    ),
  });
};
