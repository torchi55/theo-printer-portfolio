// /api/focus — Focus Gate (Theo's productivity dashboard).
// POST, header "x-push" = FOCUS_PUSH_TOKEN  -> PC pushes its snapshot.
// POST, header "x-key"  = ANALYTICS_PASSWORD, body {mindful_min, day?} -> iPhone Shortcut logs meditation.
// GET,  header "x-key"  -> owner read: snapshot + latest phone data.
// POST, header "x-key", body {event: "bed"|"wake"|"meal", rating?: "good"|"ok"|"junk"} -> iPhone Shortcuts log sleep + meals.
//       body {event: "sleep", asleep_min, start, end} -> watch sleep read from Apple Health (Garmin) by a Shortcut.
//       body {event: "app", app, state: "open"|"close"} -> phone app opened/closed automations (Screen Time can't be read).
//       body {event: "screen", app?, minutes} -> a minutes total from any source (e.g. a Habits First Shortcuts action).
// GET,  header "x-push" -> PC reads phone data back (meditation + the last 400 events).
// Kept server-side from each PC push: the life score over the last ~day (for "+3 in the last hour")
// and one row per day (for the Month/Year graphs). Owner reads also get Google Calendar events
// when GCAL_ICS_URL (the calendar's secret iCal address) is set.
const crypto = require("crypto");
const { redis, clientIp, readBody, laDay } = require("./_lib");
const { eventsBetween, zoned } = require("./_ics");

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a || ""), sha(b));

// Owner-key check with the visit log's lockout: 8 wrong tries per IP -> 15 min.
async function ownerOk(req, res) {
  const secret = process.env.ANALYTICS_PASSWORD;
  if (!secret) { res.status(503).json({ error: "not configured" }); return false; }
  const failKey = "fail:" + clientIp(req);
  const [fails] = await redis([["GET", failKey]]);
  if (Number(fails) >= 8) { res.status(429).json({ error: "locked" }); return false; }
  if (!same(req.headers["x-key"], secret)) {
    await redis([["INCR", failKey], ["EXPIRE", failKey, 900]]);
    res.status(401).json({ error: "denied" });
    return false;
  }
  return true;
}

const SCORE_KEEP = 720;   // pushes kept; plenty for a day at one push every 2-5 min
const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : undefined);

// Redis writes that record this push's score and the week's daily totals.
function historyWrites(b) {
  const out = [];
  const L = (b && b.life) || {}, score = num(L.today && L.today.score) ?? num(b && b.score);
  if (score !== undefined) out.push(["LPUSH", "focus:scores", JSON.stringify({ at: Date.now(), s: score })], ["LTRIM", "focus:scores", 0, SCORE_KEEP - 1]);
  for (const w of (b && Array.isArray(b.week) ? b.week : [])) {
    if (!w || !/^\d{4}-\d{2}-\d{2}$/.test(w.date || "")) continue;
    const row = { productive_min: num(w.productive_min), distracting_min: num(w.distracting_min), sleep_min: num(w.sleep_min), total_min: num(w.total_min) };
    if (w.date === b.date && score !== undefined) row.score = score;
    if (w.date === b.date && num(b.goal_min) !== undefined) row.goal_min = num(b.goal_min);
    out.push(["HSET", "focus:days", w.date, JSON.stringify(row)]);
  }
  return out;
}

// Today's and tomorrow's Google Calendar events (LA days, 4am rollover), cached 10 min in Redis.
async function calendar(cached) {
  const url = process.env.GCAL_ICS_URL;
  if (!url) return null;
  const c = safeJson(cached);
  if (c && Date.now() - c.at < 600e3) return c;
  try {
    const r = await fetch(url, { headers: { Accept: "text/calendar" }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error("ics " + r.status);
    const [y, m, d] = laDay(Date.now() - 4 * 36e5).split("-").map(Number);
    const from = zoned(Date.UTC(y, m - 1, d, 4), "America/Los_Angeles");
    const events = eventsBetween(await r.text(), from, from + 2 * 864e5).slice(0, 60);
    const out = { at: Date.now(), events };
    await redis([["SET", "focus:gcal", JSON.stringify(out), "EX", 3600]]);
    return out;
  } catch {
    return c ? { ...c, stale: true } : { at: Date.now(), events: [], error: "calendar unreachable" };
  }
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  const token = process.env.FOCUS_PUSH_TOKEN;
  const isPC = !!token && !!req.headers["x-push"] && same(req.headers["x-push"], token);

  try {
    if (req.method === "POST" && isPC) {
      const body = readBody(req), raw = JSON.stringify(body || null);
      if (raw === "null" || raw.length > 100000) return res.status(400).json({ error: "bad body" });
      await redis([["SET", "focus:latest", raw], ...historyWrites(body)]);
      return res.status(200).json({ ok: true });
    }

    if (req.method === "POST") {
      if (!(await ownerOk(req, res))) return;
      const b = readBody(req) || {};
      if (b.event) {  // iPhone Shortcuts: Sleep Focus on ("bed"), alarm stopped ("wake"), meal button ("meal" + rating)
        const kind = String(b.event).toLowerCase().trim();
        if (!["bed", "wake", "meal", "sleep", "app", "screen"].includes(kind)) return res.status(400).json({ error: "event must be bed, wake, meal, sleep, app or screen" });
        const ev = { k: kind, at: Date.now() };
        if (kind === "app" || kind === "screen") {  // phone time: app opened/closed automations, or a minutes total (e.g. Habits First "App time")
          // one-field form for Shortcuts: app = "Instagram opened" / "Instagram closed"
          const m = String(b.app || "Phone").trim().match(/^(.*?)\s+(opened|open|closed|close)$/i);
          ev.a = (m ? m[1] : String(b.app || "Phone")).slice(0, 40);
          // no state at all (one automation for "Opened or Closed") -> the PC toggles open/close per app
          const stt = b.state || (m && m[2]);
          if (kind === "app") { if (stt) ev.o = !/^(close|closed|0|false)$/i.test(String(stt).trim()); }
          else {
            const min = Math.round(Number(String(b.minutes ?? "").replace(/[^\d.]/g, "")));
            if (!Number.isFinite(min) || min < 0 || min > 1440) return res.status(400).json({ error: "minutes must be 0-1440" });
            ev.min = min;
          }
        }
        if (kind === "sleep") {  // watch sleep from Apple Health: minutes asleep + first/last sample times
          const min = Math.round(Number(String(b.asleep_min ?? "").replace(/[^\d.]/g, "")));
          const s = Date.parse(b.start), e = Date.parse(b.end);
          if (!Number.isFinite(min) || min < 30 || min > 1080) return res.status(400).json({ error: "asleep_min must be minutes (30-1080)" });
          Object.assign(ev, { min }, Number.isFinite(s) ? { s } : {}, Number.isFinite(e) ? { e } : {});
        }
        if (kind === "meal") {
          const r = String(b.rating || "ok").toLowerCase().trim();
          ev.r = r.startsWith("g") ? 2 : r.startsWith("j") || r.startsWith("b") ? 0 : 1;
        }
        await redis([["LPUSH", "focus:events", JSON.stringify(ev)], ["LTRIM", "focus:events", 0, 399]]);
        return res.status(200).json({ ok: true, ...ev });
      }
      const min = Math.round(Number(String(b.mindful_min ?? "").replace(/[^\d.]/g, "")));
      if (!Number.isFinite(min) || min < 0 || min > 1440) return res.status(400).json({ error: "mindful_min must be a number of minutes" });
      const day = /^\d{4}-\d{2}-\d{2}$/.test(b.day || "") ? b.day : laDay();
      const phone = { day, mindful_min: min, at: Date.now() };
      await redis([["SET", "focus:phone", JSON.stringify(phone)]]);
      return res.status(200).json({ ok: true, ...phone });
    }

    if (req.method !== "GET") return res.status(405).end();

    if (isPC) {
      const [phone, events] = await redis([["GET", "focus:phone"], ["LRANGE", "focus:events", 0, 399]]);
      return res.status(200).json({ phone: phone ? JSON.parse(phone) : null, events: (events || []).map((e) => JSON.parse(e)) });
    }

    if (!(await ownerOk(req, res))) return;
    const [snap, phone, scores, days, cal] = await redis([["GET", "focus:latest"], ["GET", "focus:phone"],
      ["LRANGE", "focus:scores", 0, SCORE_KEEP - 1], ["HGETALL", "focus:days"], ["GET", "focus:gcal"]]);
    if (!snap) return res.status(404).json({ error: "no data yet" });
    const cutoff = Date.now() - 26 * 36e5;
    const score_hist = (scores || []).map(safeJson).filter((x) => x && x.at >= cutoff).sort((a, b) => a.at - b.at);
    const history = [];
    for (let i = 0; i + 1 < (days || []).length; i += 2) { const v = safeJson(days[i + 1]); if (v) history.push({ date: days[i], ...v }); }
    history.sort((a, b) => (a.date < b.date ? -1 : 1));
    return res.status(200).json({ ...JSON.parse(snap), phone: phone ? JSON.parse(phone) : null,
      score_hist, history: history.slice(-400), calendar: await calendar(cal) });
  } catch {
    return res.status(503).json({ error: "storage offline" });
  }
};
