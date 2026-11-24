// Offline test for api/focus.js light polling (2026-11-24): PC GET ?cmds=1 is also the Theo OS alive pulse,
// ?cmds=1&since= carries the phone events, owner GET ?lite=1 is the small widget answer. Fake Upstash, no network.
// Run: node tools/test-focus-light.cjs
const assert = require("assert");
const path = require("path");

process.env.KV_REST_API_URL = "https://fake-redis.test";
process.env.KV_REST_API_TOKEN = "fake";
process.env.FOCUS_PUSH_TOKEN = "push-test-token";
process.env.ANALYTICS_PASSWORD = "owner-test-key";

const kv = {}, lists = { "focus:events": [] }, hashes = { "focus:cmds": {} };
global.fetch = async (url, opts) => {
  assert.ok(String(url).startsWith("https://fake-redis.test"), "only the fake redis is called");
  const out = JSON.parse(opts.body).map(([op, k, a, b]) => {
    if (op === "GET") return { result: kv[k] ?? null };
    if (op === "SET") { kv[k] = a; return { result: "OK" }; }
    if (op === "LRANGE") return { result: (lists[k] || []).slice(a, b + 1) };
    if (op === "HGETALL") return { result: Object.entries(hashes[k] || {}).flat() };
    if (op === "HKEYS") return { result: Object.keys(hashes[k] || {}) };
    if (op === "INCR" || op === "EXPIRE") return { result: 1 };
    throw new Error("unexpected op " + op);
  });
  return { ok: true, json: async () => out };
};
const handler = require(path.join(__dirname, "..", "api", "focus.js"));

async function get(query, headers) {
  const res = { code: 0, body: undefined, headers: {},
    setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
    json(b) { this.body = b; this.bytes = JSON.stringify(b).length; return this; }, end() { return this; } };
  await handler({ method: "GET", headers, query, socket: {} }, res);
  return res;
}
const PC = { "x-push": "push-test-token" }, OWNER = { "x-key": "owner-test-key" };

const NOW = Date.now();
for (let i = 0; i < 1500; i++) lists["focus:events"].push(JSON.stringify({ k: "app", at: NOW - i * 300e3, a: "Instagram" }));
kv["focus:phone"] = JSON.stringify({ day: "2026-11-24", mindful_min: 5, at: NOW });

(async () => {
  // 1. ?cmds=1 alone: commands + alive, stamps focus:osat, no events (old PCs keep their own phone GET)
  hashes["focus:cmds"]["act:x"] = JSON.stringify({ k: "inbox_act", id: "x", action: "send", at: NOW });
  let r = await get({ cmds: "1" }, PC);
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.body.alive, true);
  assert.deepStrictEqual(r.body.cmds.map((c) => c.cid), ["act:x"]);
  assert.strictEqual(r.body.events, undefined);
  assert.ok(Math.abs(Number(kv["focus:osat"]) - Date.now()) < 5000, "cmds GET stamps focus:osat");
  delete hashes["focus:cmds"]["act:x"];

  // 2. ?cmds=1&since=<newest>: also phone + only the newest event; quiet answer is tiny
  r = await get({ cmds: "1", since: String(NOW) }, PC);
  assert.deepStrictEqual(r.body.events.map((e) => e.at), [NOW]);
  assert.strictEqual(r.body.cursor, NOW);
  assert.strictEqual(r.body.phone.mindful_min, 5);
  const quiet = r.bytes;
  assert.ok(quiet < 300, "quiet cmds+since answer under 300 B, got " + quiet);

  // 3. ?cmds=1&since=0 after a long sleep: falls back to the full list, nothing lost
  r = await get({ cmds: "1", since: "0" }, PC);
  assert.strictEqual(r.body.full, true);
  assert.strictEqual(r.body.events.length, 1500);

  // 4. plain PC GET (no cmds) still answers the phone data
  r = await get({ since: String(NOW) }, PC);
  assert.deepStrictEqual(r.body.events.map((e) => e.at), [NOW]);

  // 5. owner ?lite=1: no history / Log / chats / ICS calendar; Inbox count, brief, school, today's calendar kept
  const day = (t) => new Date(t).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const days = [];
  for (let i = -14; i < 42; i++) days.push({ date: day(NOW + i * 864e5), events: [{ title: "x".repeat(200) }] });
  kv["focus:latest"] = JSON.stringify({ date: day(NOW), productive_min: 90, pushed: NOW, pad: "y".repeat(40000) });
  kv["focus:os"] = JSON.stringify({ at: NOW - 600e3, items: [{ id: "a", body: "z".repeat(8000) }, { id: "b", body: "z".repeat(8000) }],
    log: Array(100).fill({ tx: "w".repeat(200) }), chats: { general: { messages: [{ text: "q".repeat(1800) }] } },
    brief: { text: "Brief" }, school: { due: [] }, cal: { days } });
  r = await get({}, OWNER);
  const full = r.bytes;
  assert.ok(r.body.os.log && r.body.score_hist, "normal owner GET unchanged");
  r = await get({ lite: "1" }, OWNER);
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.body.lite, true);
  assert.strictEqual(r.body.productive_min, 90);
  assert.deepStrictEqual(r.body.os.items, [{ id: "a" }, { id: "b" }]);
  assert.strictEqual(r.body.os.brief.text, "Brief");
  assert.ok(r.body.os.cal.days.some((d) => d.date === day(NOW)) && r.body.os.cal.days.length <= 3, "today's calendar kept, the rest dropped");
  assert.ok(Number(r.body.os.at) >= Number(kv["focus:osat"]) - 1, "lite os.at carries the alive pulse");
  for (const k of ["history", "score_hist", "calendar", "pays", "pending"]) assert.strictEqual(r.body[k], undefined, k + " dropped");
  assert.strictEqual(r.body.os.log, undefined);
  assert.strictEqual(r.body.os.chats, undefined);
  assert.ok(r.body.ver, "lite answer has ver");
  console.log(`ok - focus light: quiet cmds+since ${quiet} B, owner full ${full} B vs lite ${r.bytes} B, 5 cases pass`);
})().catch((e) => { console.error(e); process.exit(1); });
