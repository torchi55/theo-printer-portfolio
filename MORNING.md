# MORNING: move theojaneway.com to Cloudflare Pages

Prepared 2026-11-24 on branch `hosting/cf-pages` (worktree `_cf-pages`). Local commits only.
Nothing is pushed, deployed or changed in DNS yet.

## What this branch adds
- `build.mjs`: the Pages build. It copies only the public site into `dist/`. Notes (`*.md`), `api/` and `functions/` source, `tools/`, scripts, configs and dot-files stay out.
- `_headers`: the vercel.json security headers + cache rules (fonts 1 year, images/video 1 day, HTML/CSS/JS revalidate).
- `_redirects`: the vercel.json redirects, also in their `/x/`, `/x/index` and `/x/index.html` forms.
- `functions/api/focus.js`, `feed.js`, `stats.js`: run the SAME `api/*.js` code as Vercel, through `functions/_shared/vercel.js`.
- `functions/os.js`: the `/os` proxy (Pages `_redirects` cannot proxy another host).
- `functions/_middleware.js`: the vercel.json security headers on `/api/*` and `/os` answers.
- `_routes.json` (written by `build.mjs`): Functions run only on `/api/*` and `/os`. Static files never use the daily Functions quota.
- `wrangler.toml`: output dir = `dist`, `nodejs_compat` on.
- Vercel files stay. A rollback to Vercel needs no code change.

## Step 0: Claude does this first (needs your YES)
1. Claude merges `hosting/cf-pages` into `main` and pushes. Cloudflare can only build a branch that is on GitHub.
2. Warning: this also brings the `?since=` focus fix (branch `fix/focus-cursor`) to `main`.

## Step 1: save the old DNS (1 min)
1. Open dash.cloudflare.com and sign in.
2. Open the `theojaneway.com` zone > DNS > Records.
3. Take a screenshot of all records. You need it for a rollback.

## Step 2: create the Pages project (5 min)
1. In the left menu, click Workers & Pages.
2. Click Create > Pages tab > Connect to Git.
3. Pick GitHub account `torchi55`, repo `theo-printer-portfolio`. Click Begin setup.
4. Project name: `theo-printer-portfolio`. Production branch: `main`.
5. Framework preset: None.
6. Build command: `node build.mjs`
7. Build output directory: `dist`
8. Click Save and Deploy. Wait for "Success". The build log ends with `build: <number> files`.

## Step 3: add the environment variables (3 min)
1. Open the project > Settings > Variables and Secrets.
2. For each name below, click Add. Set Type = Secret. Paste the value from Vercel (project > Settings > Environment Variables).

| Name | Needed for |
|---|---|
| `KV_REST_API_URL` | all three APIs (Upstash) |
| `KV_REST_API_TOKEN` | all three APIs (Upstash) |
| `ANALYTICS_PASSWORD` | visit log panel, Theo OS owner key |
| `FOCUS_PUSH_TOKEN` | the PC gate pushes and reads |
| `GCAL_ICS_URL` | calendar on the desk |
| `CLOUD_NOTIFY_TOKEN` | cloud tasks -> Theo OS Inbox |
| `OS_ORIGIN` (optional) | new address of the Theo OS phone app, once it leaves Vercel |

3. Go to Deployments. On the newest one, click the three dots > Retry deployment. Variables apply only to new deployments.

## Step 4: check the pages.dev address (2 min)
1. Open `https://theo-printer-portfolio.pages.dev` on your phone.
2. Check the home page and one project page (for example `/pike`).
3. Tell Claude. Claude checks it at 390 px and 1440 px.

## Step 5: move the domain (5 min)
Warning: steps 2-3 take the old Vercel address offline. It shows a 402 page now, so nothing is lost.
1. Check CAA records: in DNS > Records, look for type `CAA`. If there are any, tell Claude before you continue. A CAA record that does not allow Cloudflare's certificate authorities blocks the HTTPS certificate. No CAA records = continue.
2. Delete the A record `theojaneway.com -> 76.76.21.21` (Vercel).
3. Delete the CNAME record `www -> cname.vercel-dns.com` (Vercel).
4. In the Pages project, open Custom domains > Set up a custom domain.
5. Type `theojaneway.com`. Click Continue > Activate domain.
6. Repeat steps 4-5 for `www.theojaneway.com`.
7. Wait 1-5 minutes, until both domains show "Active". Tell Claude. Claude checks `https://theojaneway.com`.

## Step 6: www -> theojaneway.com (2 min)
Pages `_redirects` cannot match a host name, so this is a zone rule.
1. Open the `theojaneway.com` zone > Rules > Overview > Create rule > Redirect Rule.
2. Pick the template "Redirect from WWW to Root". Keep status 301 and "Preserve query string" on.
3. Click Deploy.

## Rollback (back to Vercel, about 5 min)
1. Pages project > Custom domains: remove `theojaneway.com` and `www.theojaneway.com`.
2. DNS > Records: add back the records from your Step 1 screenshot: apex A `76.76.21.21` and `www` CNAME `cname.vercel-dns.com`, both DNS only (grey cloud).
3. Rules > Redirect Rules: turn off the WWW rule only if Vercel handles www again.
4. No code change: `vercel.json` and `api/` are still in the repo.
Note: Vercel is paused until 12/23 or a Pro upgrade, so a rollback brings back the 402 page.

## What stays broken or changes
- `/os` and the Theo OS phone app: they live on the paused Vercel project `theo-os-phone`. `/os` shows Vercel's 402 until that app moves; then set `OS_ORIGIN`.
- Theo OS relay (`/api/focus`): works once Step 3 is done, IF Upstash still answers. Assumption: the Upstash store keeps running while Vercel is paused. Not checked.
- Do not restart the gate before `gate.py phone_tick` uses `?since=` (plan rank 3, fix D1). Free Functions limit: 100,000 requests per day.
- Unknown URLs (for example `/typo`) show the home page with status 200, not a 404. Cause: no top-level `404.html`. Fix: add a `404.html` page (needs your design call).
- Subsite folders get a trailing slash (`/farm-to-brick` -> `/farm-to-brick/`). Vercel did the opposite. The pages work: they use `<base href>`.
- Source and note files (`*.md`, `api/`, `functions/`, `tools/`, `*.py`, `*.bat`, configs) are NOT on the site: `build.mjs` leaves them out of `dist/`. The repo itself is public on GitHub.
- The old desk page `/desk-593457/` is left out of `dist/`; every form of that URL goes to `/os`, as on Vercel.
- Visit log: city/region now come from Cloudflare geo data. Labels can differ a little from Vercel's.
- `x-vercel-*` headers no longer exist; the shim fills the ones the code reads.

## Test run (2026-11-24, local, fake tokens)
- `node build.mjs <scratch>/dist`, then `wrangler pages dev <dist>` 4.167.0 + an in-memory Upstash mock.
- Base suite: 41 checks PASS (static, headers, cache, redirects, /os proxy, feed, stats, focus incl. `?since=`, 204 version, lockout).
- Gap suite: 83 checks PASS (54 private paths incl. case and %-encoded forms, dist contents, Function security headers, 204 bodies, /os upstream headers, 14 redirect forms).
- Playwright home page at 390 px and 1440 px: status 200, 0 JS errors.
