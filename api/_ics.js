// Minimal iCalendar reader for Focus Gate: the events that touch a time window, repeats expanded.
// Handles what Google Calendar's private iCal feed emits: DTSTART/DTEND (UTC, TZID or all-day),
// DURATION, RRULE (DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY),
// EXDATE, RECURRENCE-ID overrides and cancelled events. Files starting with "_" are not routes.

const HOME_TZ = "America/Los_Angeles";
const DAY = 864e5;
const WD = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// "2026-10-05 14:00 in tz" -> epoch ms. Two passes so DST edges land right.
const fmts = {};
function tzOffset(ts, tz) {
  const f = fmts[tz] || (fmts[tz] = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  const p = Object.fromEntries(f.formatToParts(ts).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ts / 1000) * 1000;
}
function zoned(wall, tz) {  // wall = Date.UTC(...) of the local wall-clock time
  try {
    let t = wall - tzOffset(wall, tz);
    t = wall - tzOffset(t, tz);
    return t;
  } catch { return tz === HOME_TZ ? wall : zoned(wall, HOME_TZ); }   // unknown TZID: assume home
}

// One property value -> {wall, tz, allDay, utc}; wall is the wall-clock time as a UTC timestamp.
function parseTime(val, params) {
  const m = String(val).trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  if (!m[4] || params.VALUE === "DATE") return { wall, tz: HOME_TZ, allDay: true, utc: zoned(wall, HOME_TZ) };
  if (m[7]) return { wall, tz: "UTC", allDay: false, utc: wall };
  const tz = params.TZID || HOME_TZ;
  return { wall, tz, allDay: false, utc: zoned(wall, tz) };
}
const durMs = (s) => {  // -P1DT2H30M / PT45M
  const m = String(s || "").match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const v = (+(m[2] || 0)) * 7 * DAY + (+(m[3] || 0)) * DAY + (+(m[4] || 0)) * 36e5 + (+(m[5] || 0)) * 6e4 + (+(m[6] || 0)) * 1e3;
  return m[1] === "-" ? -v : v;
};
const unescape = (s) => String(s || "").replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();

function parseEvents(text) {
  const lines = String(text).replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const out = []; let ev = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { ev = { exdates: [] }; continue; }
    if (line === "END:VEVENT") { if (ev && ev.start) out.push(ev); ev = null; continue; }
    if (!ev) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const [name, ...ps] = line.slice(0, i).split(";"), val = line.slice(i + 1);
    const params = Object.fromEntries(ps.map((p) => { const j = p.indexOf("="); return [p.slice(0, j).toUpperCase(), p.slice(j + 1).replace(/^"|"$/g, "")]; }));
    switch (name.toUpperCase()) {
      case "UID": ev.uid = val; break;
      case "SUMMARY": ev.title = unescape(val); break;
      case "LOCATION": ev.where = unescape(val); break;
      case "STATUS": ev.status = val.toUpperCase(); break;
      case "TRANSP": ev.transp = val.toUpperCase(); break;
      case "DTSTART": ev.start = parseTime(val, params); break;
      case "DTEND": ev.end = parseTime(val, params); break;
      case "DURATION": ev.dur = durMs(val); break;
      case "RRULE": ev.rrule = Object.fromEntries(val.split(";").map((kv) => kv.split("=")).map(([k, v]) => [k.toUpperCase(), v])); break;
      case "EXDATE": for (const v of val.split(",")) { const t = parseTime(v, params); if (t) ev.exdates.push(t.utc); } break;
      case "RECURRENCE-ID": ev.recurId = parseTime(val, params); break;
    }
  }
  return out;
}

// Wall-clock day helpers (all on UTC timestamps that stand for local dates).
const dayIdx = (wall) => Math.floor(wall / DAY);
const ymd = (wall) => { const d = new Date(wall); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCDay()]; };

// Does the repeat rule hit this local date? (start's own date always counts)
function hits(rule, s, wallDay) {
  const iv = Math.max(1, parseInt(rule.INTERVAL || "1", 10));
  const [sy, sm, sd, sw] = ymd(s), [y, m, d, w] = ymd(wallDay);
  const byday = rule.BYDAY ? rule.BYDAY.split(",") : null;
  const bymd = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(",").map(Number) : null;
  const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  switch ((rule.FREQ || "").toUpperCase()) {
    case "DAILY":
      return (dayIdx(wallDay) - dayIdx(s)) % iv === 0 && (!byday || byday.some((b) => b.slice(-2) === WD[w]));
    case "WEEKLY": {
      const wkst = WD.indexOf((rule.WKST || "MO").toUpperCase());
      const weekOf = (t, wd) => dayIdx(t) - ((wd - wkst + 7) % 7);
      if ((weekOf(wallDay, w) - weekOf(s, sw)) / 7 % iv !== 0) return false;
      return byday ? byday.some((b) => b.slice(-2) === WD[w]) : w === sw;
    }
    case "MONTHLY": {
      if (((y - sy) * 12 + (m - sm)) % iv !== 0) return false;
      if (bymd) return bymd.some((n) => (n > 0 ? n : dim + 1 + n) === d);
      if (byday) return byday.some((b) => {
        const mm = b.match(/^([+-]?\d+)?([A-Z]{2})$/); if (!mm || WD[w] !== mm[2]) return false;
        if (!mm[1]) return true;
        const n = +mm[1], nth = Math.ceil(d / 7), fromEnd = Math.ceil((dim - d + 1) / 7);
        return n > 0 ? nth === n : fromEnd === -n;
      });
      return d === sd;
    }
    case "YEARLY":
      return (y - sy) % iv === 0 && m === sm && d === sd;
  }
  return false;
}

// Every occurrence [from, to) touches: [{start, end, title, where, all_day}], sorted.
function eventsBetween(text, from, to) {
  const evs = parseEvents(text), overrides = new Map(), out = [];
  for (const e of evs) if (e.recurId) overrides.set(e.uid + "|" + e.recurId.utc, e);
  const push = (e, s) => {
    if (e.status === "CANCELLED") return;
    const len = e.end ? e.end.utc - e.start.utc : e.dur != null ? e.dur : e.start.allDay ? DAY : 0;
    const end = s + Math.max(0, len);
    if (end > from && s < to || (len === 0 && s >= from && s < to))
      out.push({ start: s, end, title: (e.title || "Busy").slice(0, 80), where: (e.where || "").slice(0, 80), all_day: !!e.start.allDay });
  };
  for (const e of evs) {
    if (e.recurId) { push(e, e.start.utc); continue; }   // a moved or edited single occurrence
    if (!e.rrule) { push(e, e.start.utc); continue; }
    const r = e.rrule, count = r.COUNT ? parseInt(r.COUNT, 10) : Infinity;
    const until = r.UNTIL ? (parseTime(r.UNTIL, {}) || {}).utc : Infinity;
    const s0 = e.start, timeOfDay = s0.wall - dayIdx(s0.wall) * DAY;
    const lastDay = dayIdx(Math.min(to + 2 * DAY, until + 2 * DAY) + 14 * 36e5);
    let n = 0;
    for (let di = dayIdx(s0.wall); di <= lastDay && n < count; di++) {
      const wallDay = di * DAY;
      if (di !== dayIdx(s0.wall) && !hits(r, s0.wall, wallDay)) continue;
      const wall = wallDay + timeOfDay, s = s0.tz === "UTC" ? wall : zoned(wall, s0.tz);
      if (s > until) break;
      n++;
      if (s < from - 2 * DAY) continue;
      if (e.exdates.some((x) => Math.abs(x - s) < 6e4)) continue;
      if (overrides.has(e.uid + "|" + s)) continue;        // replaced by its RECURRENCE-ID copy
      push(e, s);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

module.exports = { eventsBetween, parseEvents, zoned, HOME_TZ };
