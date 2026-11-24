// Security headers on Function responses (/api/*, /os), same as the vercel.json "headers" block.
// _headers covers static files only. _routes.json (written by build.mjs) limits Functions to /api/* and /os,
// so this middleware never runs for static files.
// Headers the handler or the /os upstream already set are kept. Permissions-Policy skips /os (vercel.json excluded it).
const BASE = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy-Report-Only": "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self' 'unsafe-inline' https:; connect-src 'self' https:; frame-src https:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
};
const PERMISSIONS = "camera=(), microphone=(), geolocation=(), payment=(), usb=()";

export async function onRequest({ request, next }) {
  const res = await next();
  const isOs = /^\/os(\/|$)/.test(new URL(request.url).pathname);
  const out = new Response(res.body, { status: res.status, statusText: res.statusText, headers: new Headers(res.headers) });
  for (const [k, v] of Object.entries(BASE)) if (!out.headers.has(k)) out.headers.set(k, v);
  if (!isOs && !out.headers.has("Permissions-Policy")) out.headers.set("Permissions-Policy", PERMISSIONS);
  return out;
}
