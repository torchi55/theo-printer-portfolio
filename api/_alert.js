// Visit alert: one email per tagged view once a real person has stayed 15 s.
// Needs RESEND_API_KEY (and ALERT_TO, default janeway@usc.edu). Without the key it does nothing.
const { redis } = require("./_lib");

const MIN_MS = 15000;
// Mail-security sandboxes and cloud hosts open every link on delivery; they are not readers.
const SCANNER = /microsoft|azure|google|amazon|aws|proofpoint|mimecast|barracuda|cisco|ironport|forcepoint|zscaler|cloudflare|digitalocean|ovh|hetzner|linode|akamai/i;

const fmt = (ms) => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`; };

async function maybeAlert(id, ms, sd) {
  const key = process.env.RESEND_API_KEY;
  if (!key || ms < MIN_MS) return;
  const [arr] = await redis([["HGETALL", "pv:" + id]]);
  const v = {};
  for (let i = 0; arr && i < arr.length; i += 2) v[arr[i]] = arr[i + 1];
  if (!v.q || v.host === "1" || SCANNER.test(v.org || "")) return;
  const [fresh] = await redis([["SET", "alert:" + id, "1", "NX", "EX", 60 * 60 * 24 * 7]]);
  if (!fresh) return;

  const place = [v.city, v.reg].filter(Boolean).join(", ") || v.ctry || "unknown place";
  const when = new Date(Number(v.ts) || Date.now()).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" });
  const subject = `[visit] ${v.q} · ${v.p} · ${fmt(ms)}+`;
  const text = [
    `${v.q} opened ${v.p}`,
    `when: ${when} PT`,
    `time on page so far: ${fmt(ms)} · scrolled ${sd}%`,
    `from: ${place} · ${v.org || "unknown network"}`,
    `device: ${v.dev} · ${v.os} · ${v.br}`,
    "",
    "Full trail: theojaneway.com/about#log",
  ].join("\n");

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.ALERT_FROM || "Visit log <onboarding@resend.dev>",
      to: [process.env.ALERT_TO || "janeway@usc.edu"],
      subject, text,
    }),
  });
}

module.exports = { maybeAlert, SCANNER };
