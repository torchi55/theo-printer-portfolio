// GET /api/digest — weekly visit digest, emailed to Theo. Run by the Vercel cron in vercel.json.
// Vercel sends "Authorization: Bearer $CRON_SECRET". Needs RESEND_API_KEY; ALERT_TO defaults to janeway@usc.edu.
// Written to improve the site, not to watch firms: pages, drop-off, and how tagged links did, scanners left out.
const { redis, laDay } = require("./_lib");

// Mail-security sandboxes and cloud hosts open every link on delivery; they are not readers.
const SCANNER = /microsoft|azure|google|amazon|aws|proofpoint|mimecast|barracuda|cisco|ironport|forcepoint|zscaler|cloudflare|digitalocean|ovh|hetzner|linode|akamai/i;
const DAYS = 7;

const fmt = (ms) => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`; };
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const pad = (s, n) => String(s).padEnd(n).slice(0, n);

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== "Bearer " + secret) return res.status(401).end();
  if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: "RESEND_API_KEY not set" });

  const now = Date.now();
  const days = [...new Set(Array.from({ length: DAYS }, (_, i) => laDay(now - i * 864e5)))];
  const lists = await redis(days.map((d) => ["LRANGE", "day:" + d, 0, -1]));
  const ids = lists.flatMap((l) => l || []);
  const raw = ids.length ? await redis(ids.map((id) => ["HGETALL", "pv:" + id])) : [];
  const all = raw.map((arr) => {
    const o = {};
    for (let i = 0; arr && i < arr.length; i += 2) o[arr[i]] = arr[i + 1];
    o.ts = Number(o.ts); o.ms = Number(o.ms) || 0; o.sd = Number(o.sd) || 0;
    return o.p ? o : null;
  }).filter(Boolean).sort((a, b) => a.ts - b.ts);

  const isScanner = (v) => v.host === "1" || SCANNER.test(v.org || "");
  const views = all.filter((v) => !isScanner(v));
  const scanners = all.length - views.length;

  // Pages: how long people stay and how far they get
  const pages = {};
  for (const v of views) {
    const g = (pages[v.p] ||= { views: 0, people: new Set(), ms: [], sd: [], quick: 0 });
    g.views++; g.people.add(v.v); g.ms.push(v.ms); g.sd.push(v.sd);
    if (v.ms < 10000) g.quick++;
  }
  const pageRows = Object.entries(pages).sort((a, b) => b[1].people.size - a[1].people.size).map(([p, g]) =>
    `${pad(p, 22)} ${pad(g.people.size + " ppl", 7)} median ${pad(fmt(median(g.ms)), 7)} scroll ${pad(median(g.sd) + "%", 5)} left <10s ${Math.round((100 * g.quick) / g.views)}%`);

  // Sessions: where people land and where they stop
  const sessions = {};
  for (const v of views) (sessions[v.s] ||= []).push(v);
  const landings = {}, exits = {};
  for (const trail of Object.values(sessions)) {
    landings[trail[0].p] = (landings[trail[0].p] || 0) + 1;
    const last = trail[trail.length - 1];
    exits[last.p] = (exits[last.p] || 0) + 1;
  }
  const top = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, n]) => `${p} (${n})`).join(", ") || "none";

  // Tagged links (?ref=): did the path we sent them down work?
  const tagged = Object.values(sessions).filter((t) => t.some((v) => v.q)).map((t) => {
    const q = t.find((v) => v.q).q;
    const when = new Date(t[0].ts).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    return `${pad(q, 24)} ${when}  ${t.map((v) => `${v.p} ${fmt(v.ms)} ${v.sd}%`).join(" → ")}`;
  });

  const people = new Set(views.map((v) => v.v)).size;
  const range = `${days[days.length - 1]} to ${days[0]}`;
  const text = [
    `Week ${range}: ${people} people, ${views.length} page views, ${Object.keys(sessions).length} visits (${scanners} scanner hits left out).`,
    "",
    "PAGES",
    ...(pageRows.length ? pageRows : ["no human views"]),
    "",
    `Landed on: ${top(landings)}`,
    `Left from: ${top(exits)}`,
    "",
    "TAGGED LINKS (first page → next pages, time, scroll)",
    ...(tagged.length ? tagged : ["none this week"]),
    "",
    "Full trail: theojaneway.com/about#log",
  ].join("\n");

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.ALERT_FROM || "Visit log <onboarding@resend.dev>",
      to: [process.env.ALERT_TO || "janeway@usc.edu"],
      subject: `[visit digest] ${range}`,
      text,
    }),
  });
  res.status(r.ok ? 200 : 502).json({ sent: r.ok, people, views: views.length, scanners });
};
