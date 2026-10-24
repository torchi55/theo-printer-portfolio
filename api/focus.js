// /api/focus — Focus Gate (Theo's productivity dashboard).
// POST, header "x-push" = FOCUS_PUSH_TOKEN  -> PC pushes its snapshot.
// POST, header "x-key"  = ANALYTICS_PASSWORD, body {mindful_min, day?} -> iPhone Shortcut logs meditation.
// GET,  header "x-key"  -> owner read: snapshot + latest phone data.
// POST, header "x-key", body {event: "bed"|"wake"|...} -> iPhone Shortcuts log sleep.
//       body {event: "sleep", asleep_min, start, end} -> watch sleep read from Apple Health (Garmin) by a Shortcut.
//       body {event: "app", app, state: "open"|"close"} -> phone app opened/closed automations (Screen Time can't be read).
//       body {event: "screen", app?, minutes} -> a minutes total from any source (e.g. a Habits First Shortcuts action).
//       body {event: "pay", amount, merchant?, card?} -> an Apple Pay tap (Shortcuts "Transaction" automation); the desk shows it at once.
//       body {event: "note", text} -> the Capture Shortcut (Action Button, dictated); the PC files it into today's Daily note.
// GET ?v=<ver> -> 204 when nothing changed since that version (one Redis read; the desk polls every 5 s while open).
// GET,  header "x-push" -> PC reads phone data back (meditation + the last 400 events).
// Theo OS (/os): PC push {__os:{items,log,at}} -> focus:os; PC GET ?cmds=1 -> queued phone commands, PC POST {ack:[ids]} clears them.
//       Owner POST {event:"capture", text, cid?} / {event:"inbox_act", id, action:"send"|"skip", body?} -> queued in focus:cmds (HSETNX = double tap acts once).
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

// The next 7 days of Google Calendar events (LA days, 4am rollover; the desk's day wheel scrolls through the week), cached 10 min in Redis.
// Deadlines ("DUE ..." titles) are kept for 9 days so the desk can list what's due this week.
// GCAL_ICS_URL = one or more secret iCal addresses (space, comma or newline separated), one per Google calendar;
// each event is tagged with its calendar's name (X-WR-CALNAME: School, Workout, Meals...) so the desk picks its icon.
const DUE = /^DUE\s/i;
async function calendar(cached) {
  const urls = (process.env.GCAL_ICS_URL || "").split(/[\s,]+/).filter((u) => /^https:\/\//.test(u));
  if (!urls.length) return null;
  const c = safeJson(cached);
  if (c && Date.now() - c.at < 600e3) return c;
  const [y, m, d] = laDay(Date.now() - 4 * 36e5).split("-").map(Number);
  const from = zoned(Date.UTC(y, m - 1, d, 4), "America/Los_Angeles");
  const got = await Promise.all(urls.map(async (url) => {
    try {
      const r = await fetch(url, { headers: { Accept: "text/calendar" }, signal: AbortSignal.timeout(6000) });
      if (!r.ok) return null;
      const text = await r.text(), cal = ((text.match(/^X-WR-CALNAME:(.*)$/m) || [])[1] || "").trim().slice(0, 40);
      return eventsBetween(text, from, from + 9 * 864e5).filter((e) => e.start < from + 7 * 864e5 || DUE.test(e.title))
        .map((e) => (cal ? { ...e, cal } : e));
    } catch { return null; }
  }));
  if (got.every((g) => g === null)) return c ? { ...c, stale: true } : { at: Date.now(), events: [], error: "calendar unreachable" };
  const all = got.flat().filter(Boolean).sort((a, b) => a.start - b.start);
  const events = [...all.filter((e) => e.start < from + 7 * 864e5).slice(0, 220), ...all.filter((e) => e.start >= from + 7 * 864e5).slice(0, 40)];
  const out = { at: Date.now(), events, ...(got.includes(null) ? { partial: true } : {}) };
  await redis([["SET", "focus:gcal", JSON.stringify(out), "EX", 3600]]);
  return out;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  const token = process.env.FOCUS_PUSH_TOKEN;
  const isPC = !!token && !!req.headers["x-push"] && same(req.headers["x-push"], token);

  try {
    if (req.method === "POST" && isPC) {
      const body = readBody(req);
      if (body && Array.isArray(body.ack)) {  // PC finished these phone commands
        const ids = body.ack.slice(0, 50).map((i) => String(i).slice(0, 100));
        if (ids.length) await redis([["HDEL", "focus:cmds", ...ids], ["SET", "focus:ver", String(Date.now())]]);
        return res.status(200).json({ ok: true });
      }
      if (body && body.__os) {  // Theo OS snapshot: open Inbox cards (full text) + the Log
        const osRaw = JSON.stringify(body.__os);
        if (osRaw.length > 250000) return res.status(400).json({ error: "os too big" });
        await redis([["SET", "focus:os", osRaw], ["SET", "focus:ver", String(Date.now())]]);
        return res.status(200).json({ ok: true });
      }
      const raw = JSON.stringify(body || null);
      if (raw === "null" || raw.length > 100000) return res.status(400).json({ error: "bad body" });
      // "quick" = a push-on-change between the PC's 2-min heartbeats: skip the per-day history writes
      await redis([["SET", "focus:latest", raw], ["SET", "focus:ver", String(Date.now())], ...(body.quick ? [] : historyWrites(body))]);
      return res.status(200).json({ ok: true });
    }

    if (req.method === "POST") {
      if (!(await ownerOk(req, res))) return;
      const b = readBody(req) || {};
      if (b.event === "capture" || b.event === "inbox_act") {  // Theo OS page: queued for the PC (polls ~15 s)
        let id, cmd;
        if (b.event === "capture") {
          const t = String(b.text || "").replace(/\s+/g, " ").trim().slice(0, 2000);
          if (!t) return res.status(400).json({ error: "text is empty" });
          id = "cap:" + (String(b.cid || "").replace(/[^\w.-]/g, "").slice(0, 40) || crypto.randomUUID());
          cmd = { k: "capture", t, at: Date.now() };
        } else {
          const cid = String(b.id || "").slice(0, 80), action = String(b.action || "");
          if (!cid || !["send", "skip"].includes(action)) return res.status(400).json({ error: "id and action (send|skip) required" });
          id = "act:" + cid;
          cmd = { k: "inbox_act", id: cid, action, at: Date.now(), ...(action === "send" && typeof b.body === "string" ? { body: b.body.slice(0, 4000) } : {}) };
        }
        const [fresh] = await redis([["HSETNX", "focus:cmds", id, JSON.stringify(cmd)], ["EXPIRE", "focus:cmds", 604800], ["SET", "focus:ver", String(Date.now())]]);
        return res.status(200).json({ ok: true, queued: true, dup: !fresh, id });
      }
      if (b.event) {  // iPhone Shortcuts: Sleep Focus on ("bed"), alarm stopped ("wake")
        const kind = String(b.event).toLowerCase().trim();
        if (!["bed", "wake", "sleep", "app", "screen", "pay", "note"].includes(kind)) return res.status(400).json({ error: "event must be bed, wake, sleep, app, screen, pay or note" });
        const ev = { k: kind, at: Date.now() };
        if (kind === "note") {  // Capture Shortcut: dictated text; the PC files it into today's Daily note
          const t = String(b.text || "").replace(/\s+/g, " ").trim().slice(0, 2000);
          if (!t) return res.status(400).json({ error: "text is empty" });
          ev.t = t;
        }
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
        if (kind === "pay") {  // Shortcuts passes amounts like "$12.34" or "12,34"
          const amt = Math.round(Number(String(b.amount ?? "").replace(/,/g, ".").replace(/[^\d.]/g, "")) * 100) / 100;
          if (!Number.isFinite(amt) || amt <= 0 || amt > 20000) return res.status(400).json({ error: "amount must be a positive number" });
          Object.assign(ev, { amt, m: String(b.merchant || "").trim().slice(0, 60), card: String(b.card || "").trim().slice(0, 40) });
        }
        if (kind === "sleep") {  // watch sleep from Apple Health: minutes asleep + first/last sample times
          const min = Math.round(Number(String(b.asleep_min ?? "").replace(/[^\d.]/g, "")));
          const s = Date.parse(b.start), e = Date.parse(b.end);
          if (!Number.isFinite(min) || min < 30 || min > 1080) return res.status(400).json({ error: "asleep_min must be minutes (30-1080)" });
          Object.assign(ev, { min }, Number.isFinite(s) ? { s } : {}, Number.isFinite(e) ? { e } : {});
        }
        await redis([["LPUSH", "focus:events", JSON.stringify(ev)], ["LTRIM", "focus:events", 0, 399], ["SET", "focus:ver", String(Date.now())]]);
        return res.status(200).json({ ok: true, ...ev });
      }
      const min = Math.round(Number(String(b.mindful_min ?? "").replace(/[^\d.]/g, "")));
      if (!Number.isFinite(min) || min < 0 || min > 1440) return res.status(400).json({ error: "mindful_min must be a number of minutes" });
      const day = /^\d{4}-\d{2}-\d{2}$/.test(b.day || "") ? b.day : laDay();
      const phone = { day, mindful_min: min, at: Date.now() };
      await redis([["SET", "focus:phone", JSON.stringify(phone)], ["SET", "focus:ver", String(Date.now())]]);
      return res.status(200).json({ ok: true, ...phone });
    }

    if (req.method !== "GET") return res.status(405).end();

    if (isPC && req.query && req.query.cmds) {
      const [h] = await redis([["HGETALL", "focus:cmds"]]);
      const cmds = [];
      for (let i = 0; i + 1 < (h || []).length; i += 2) { const v = safeJson(h[i + 1]); if (v) cmds.push({ ...v, cid: h[i] }); }
      return res.status(200).json({ cmds: cmds.sort((a, b) => a.at - b.at) });
    }

    if (isPC) {
      const [phone, events] = await redis([["GET", "focus:phone"], ["LRANGE", "focus:events", 0, 399]]);
      return res.status(200).json({ phone: phone ? JSON.parse(phone) : null, events: (events || []).map((e) => JSON.parse(e)) });
    }

    if (!(await ownerOk(req, res))) return;
    // version = last write + a 10-min bucket, so a quiet PC still lets fresh calendar events through
    const v = String(req.query && req.query.v || "");
    const [stamp] = await redis([["GET", "focus:ver"]]);
    const ver = `${stamp || 0}.${Math.floor(Date.now() / 600e3)}`;
    if (v && v === ver) return res.status(204).end();
    const [snap, phone, scores, days, cal, evs, osRaw, cmdH] = await redis([["GET", "focus:latest"], ["GET", "focus:phone"],
      ["LRANGE", "focus:scores", 0, SCORE_KEEP - 1], ["HGETALL", "focus:days"], ["GET", "focus:gcal"], ["LRANGE", "focus:events", 0, 399],
      ["GET", "focus:os"], ["HKEYS", "focus:cmds"]]);
    if (!snap) return res.status(404).json({ error: "no data yet" });
    const pays = (evs || []).map(safeJson).filter((e) => e && e.k === "pay" && e.at > Date.now() - 4 * 864e5).slice(0, 40);
    const cutoff = Date.now() - 26 * 36e5;
    const score_hist = (scores || []).map(safeJson).filter((x) => x && x.at >= cutoff).sort((a, b) => a.at - b.at);
    const history = [];
    for (let i = 0; i + 1 < (days || []).length; i += 2) { const v = safeJson(days[i + 1]); if (v) history.push({ date: days[i], ...v }); }
    history.sort((a, b) => (a.date < b.date ? -1 : 1));
    return res.status(200).json({ ...JSON.parse(snap), phone: phone ? JSON.parse(phone) : null,
      score_hist, history: history.slice(-400), calendar: await calendar(cal), pays, ver,
      os: safeJson(osRaw), pending: cmdH || [] });
  } catch {
    return res.status(503).json({ error: "storage offline" });
  }
};
