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
  db.calls.push(cmds.map((c) => c[0]));
  const out = cmds.map(([op, , a, b]) => {
    if (op === "GET") return { result: db.phone };
    if (op === "LINDEX") return { result: db.list[a] ?? null };
    if (op === "LLEN") return { result: db.list.length };
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

// newest first, like LPUSH: 1500 events, at = 1..1500 (+ a big base), ~95 bytes each
const BASE = 1763900000000;
const ev = (i) => JSON.stringify({ k: "app", at: BASE + i, a: "Instagram", o: i % 2 === 0, pad: "x".repeat(40) });
for (let i = 1500; i >= 1; i--) db.list.push(ev(i));
db.phone = JSON.stringify({ day: "2026-11-23", mindful_min: 10, at: BASE });

(async () => {
  // 1. no since -> old full answer (back-compat), plus cursor
  let r = await get({});
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.body.events.length, 1500);
  assert.strictEqual(r.body.cursor, BASE + 1500);
  assert.strictEqual(r.body.full, true);
  assert.deepStrictEqual(r.body.phone, JSON.parse(db.phone));
  const fullBytes = r.bytes;

  // 2. since = newest -> tiny answer, one pipeline, no LRANGE
  r = await get({ since: String(BASE + 1500) });
  assert.strictEqual(r.code, 200);
  assert.deepStrictEqual(r.body.events, []);
  assert.strictEqual(r.body.cursor, BASE + 1500);
  assert.strictEqual(r.body.n, 1500);
  assert.ok(r.body.phone && r.body.phone.mindful_min === 10, "phone still comes through");
  assert.deepStrictEqual(db.calls, [["GET", "LINDEX", "LLEN"]]);
  const emptyBytes = r.bytes;
  assert.ok(emptyBytes < 200, "empty answer under 200 bytes, got " + emptyBytes);

  // 3. three new events (a note among them) -> only those three, newest first, cursor moves
  db.list.unshift(ev(1503), JSON.stringify({ k: "note", at: BASE + 1502, t: "buy basswood" }), ev(1501));
  r = await get({ since: String(BASE + 1500) });
  assert.deepStrictEqual(r.body.events.map((e) => e.at), [BASE + 1503, BASE + 1502, BASE + 1501]);
  assert.strictEqual(r.body.events[1].t, "buy basswood");
  assert.strictEqual(r.body.cursor, BASE + 1503);
  assert.strictEqual(r.body.full, undefined);
  assert.deepStrictEqual(db.calls, [["GET", "LINDEX", "LLEN"], ["LRANGE"]]);

  // 4. exactly 200 new -> incremental; 201 new -> full list (no event lost after a long PC sleep)
  r = await get({ since: String(BASE + 1503 - 200) });
  assert.strictEqual(r.body.events.length, 200);
  assert.strictEqual(r.body.full, undefined);
  r = await get({ since: String(BASE + 1503 - 201) });
  assert.strictEqual(r.body.full, true);
  assert.strictEqual(r.body.events.length, 1500);

  // 5. bad since -> old behaviour; empty list -> tiny answer
  r = await get({ since: "abc" });
  assert.strictEqual(r.body.full, true);
  const saved = db.list; db.list = [];
  r = await get({ since: "0" });
  assert.deepStrictEqual([r.body.events, r.body.cursor, r.body.n], [[], 0, 0]);
  db.list = saved;

  // 6. no push token -> not the PC branch (owner check answers instead)
  r = await get({ since: "0" }, "wrong");
  assert.strictEqual(r.code, 503);   // ANALYTICS_PASSWORD unset in the test -> "not configured", no events
  assert.strictEqual(r.body.events, undefined);

  console.log(`ok - focus ?since: full ${fullBytes} B, empty ${emptyBytes} B, 6 cases pass`);
})().catch((e) => { console.error(e); process.exit(1); });
