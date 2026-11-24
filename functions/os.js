// /os on Cloudflare Pages: same as the Vercel rewrite /os -> https://theo-os-phone.vercel.app/os.
// Pages _redirects cannot proxy an external host, so this Function fetches the page and passes it through.
// OS_ORIGIN (optional env var) moves the upstream when theo-os-phone leaves Vercel; unset = the old address.
export async function onRequest({ request, env }) {
  const origin = String((env && env.OS_ORIGIN) || "https://theo-os-phone.vercel.app").replace(/\/$/, "");
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete("host");
  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.arrayBuffer();
  try {
    return await fetch(origin + "/os" + url.search, init);
  } catch {
    return new Response("Theo OS is offline.", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
}
