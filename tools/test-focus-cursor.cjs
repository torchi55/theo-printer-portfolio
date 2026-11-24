// Offline test for api/focus.js PC GET ?since= (2026-11-23). Fake Upstash pipeline via a mocked fetch: no network, no secrets.
// Run: node tools/test-focus-cursor.cjs
const assert = require("assert");
const path = require("path");

process.env.KV_REST_API_URL = "https://fake-redis.test";
process.env.KV_REST_API_TOKEN = "fake";
process.env.FOCUS_PUSH_TOKEN = "push-test-token";

const db = { list: [], phone: null, calls: [] };
global.fetch = async (url, opts) => {
  assert.ok(String(url).startsWith("https://fake-redis.test"), "only the fake redis is called");
  const cmds = JSON.parse(opts.body);
  db.calls.push(cmds.map((c) => c[0] + (c[0] === "LRANGE" ? ":" + c[3] : "")));
  const out = cmds.map(([op, , a, b]) => {
    if (op === "GET") return { result: db.phone };
    if (op === "LRANGE") return { result: db.list.slice(a, b + 1) };
    throw new Error("unexpected op " + op);
  });
  return { ok: true, json: async () => out };
};

const handler = require(path.join(__dirname, "..", "api", "focus.js"));

async function get(query, push = "push-test-token") {
  const res = { code: 0, body: undefined, headers: {},
    setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
    json(b) { this.body = b; this.bytes = JSON.stringify(b).length; return this; }, end() { return this; } };
  db.calls = [];
  await handler({ method: "GET", headers: { "x-push": push }, query }, res);
  return res;
}

// newest first, like LPUSH: 1500 events 5 min apart, ~95 bytes each
const BASE = 1763900000000, MIN = 60e3;
const ev = (at, k = "app") => JSON.stringify({ k, at, a: "Instagram", pad: "x".repeat(40) });
for (let i = 1500; i >= 1; i--) db.list.push(ev(BASE + i * 5 * MIN));
const NEWEST = BASE + 1500 * 5 * MIN;
db.phone = JSON.stringify({ day: "2026-11-23", mindful_min: 10, at: BASE });
const ats = (r) => r.body.events.map((e) => e.at);

(async () => {
  // 1. no since -> old full answer (back-compat), plus cursor
  let r = await get({});
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.body.events.length, 1500);
  assert.strictEqual(r.body.cursor, NEWEST);
  assert.strictEqual(r.body.full, true);
  assert.deepStrictEqual(r.body.phone, JSON.parse(db.phone));
  const fullBytes = r.bytes;

  // 2. quiet: since = newest -> only the newest (10 s overlap), one pipeline, a 16-item peek
  r = await get({ since: String(NEWEST) });
  assert.deepStrictEqual(ats(r), [NEWEST]);
  assert.strictEqual(r.body.cursor, NEWEST);
  assert.ok(r.body.phone && r.body.phone.mindful_min === 10, "phone still comes through");
  assert.deepStrictEqual(db.calls, [["LRANGE:15", "GET"]]);
  const quietBytes = r.bytes;
  assert.ok(quietBytes < 300, "quiet answer under 300 bytes, got " + quietBytes);
  // since 3 min past the newest -> nothing in the window -> empty
  r = await get({ since: String(NEWEST + 3 * MIN) });
  assert.deepStrictEqual([ats(r), r.body.cursor], [[], NEWEST + 3 * MIN]);
  const emptyBytes = r.bytes;

  // 3. same-ms tie: a second event with the cursor's exact "at" arrives after the PC read -> still sent
  db.list.unshift(ev(NEWEST, "note"));
  r = await get({ since: String(NEWEST) });
  assert.deepStrictEqual(r.body.events.map((e) => [e.k, e.at]), [["note", NEWEST], ["app", NEWEST]]);

  // 4. out of order (clock skew): head is OLDER than an event below it, and older than the cursor -> both sent,
  //    cursor = max of what was returned, never the head
  db.list.unshift(ev(NEWEST + 1000), ev(NEWEST + 2000));   // head = +1 s, below it +2 s
  r = await get({ since: String(NEWEST + 2000) });
  assert.deepStrictEqual(ats(r), [NEWEST + 1000, NEWEST + 2000, NEWEST, NEWEST]);
  assert.strictEqual(r.body.cursor, NEWEST + 2000);
  db.list.splice(0, 3);   // back to 1500 + nothing extra at the head except the original newest

  // 5. 30 new (> 16 peek) -> one wider LRANGE (a single atomic read), all 30 + overlap, cursor = newest returned
  const before = db.list.slice();
  for (let i = 1; i <= 30; i++) db.list.unshift(ev(NEWEST + i * 1000));
  r = await get({ since: String(NEWEST) });
  assert.deepStrictEqual(db.calls, [["LRANGE:15", "GET"], ["LRANGE:200"]]);
  assert.strictEqual(r.body.events.length, 31);
  assert.strictEqual(r.body.cursor, NEWEST + 30000);
  assert.strictEqual(r.body.full, undefined);
  // 5b. a corrupt head item is not trusted as "older than the window": still widens and returns all 30
  db.list.unshift("{not json");
  r = await get({ since: String(NEWEST) });
  assert.deepStrictEqual(db.calls, [["LRANGE:15", "GET"], ["LRANGE:200"]]);
  assert.strictEqual(r.body.events.length, 31);
  db.list.shift();

  // 6. 201+ in the window -> full list (no event lost after a long PC sleep)
  db.list = before.slice();
  for (let i = 1; i <= 205; i++) db.list.unshift(ev(NEWEST + i * 100));
  r = await get({ since: String(NEWEST) });
  assert.strictEqual(r.body.full, true);
  assert.strictEqual(r.body.events.length, 1500);   // LRANGE 0..1499, like the live LTRIM
  db.list = before.slice();

  // 7. bad since -> old behaviour; empty list -> tiny answer
  r = await get({ since: "abc" });
  assert.strictEqual(r.body.full, true);
  db.list = [];
  r = await get({ since: "0" });
  assert.deepStrictEqual([r.body.events, r.body.cursor, r.body.n], [[], 0, 0]);
  db.list = before;

  // 8. no push token -> not the PC branch (owner check answers instead)
  r = await get({ since: "0" }, "wrong");
  assert.strictEqual(r.code, 503);   // ANALYTICS_PASSWORD unset in the test -> "not configured", no events
  assert.strictEqual(r.body.events, undefined);

  console.log(`ok - focus ?since: full ${fullBytes} B, quiet ${quietBytes} B, empty ${emptyBytes} B, 9 cases pass`);
})().catch((e) => { console.error(e); process.exit(1); });
