# CLOUD-NOTES — cloud/portfolio-1

Working notes from the cloud session. One section per task: what changed, what I was unsure about.
Nothing here is live until Theo merges the PR.

## Method
- Local server: small Node static server that mimics Vercel `cleanUrls` + `trailingSlash:false` + gzip
  (Vercel also serves brotli + HTTP/2 + CDN, so local Lighthouse perf numbers are a *pessimistic* proxy).
- Lighthouse 12.3 CLI, headless Chromium. "m" = mobile preset (Moto G Power, 4× CPU, slow 4G), "d" = desktop preset.
- Screenshots via Playwright at 375 / 390 / 1440 px.

## Baseline Lighthouse (mobile, before any change)
| page | perf | a11y | best | seo | LCP |
|---|---|---|---|---|---|
| / | 77 | 100 | 100 | 100 | 4.2 s |
| /about | 77 | 100 | 96 | 100 | 4.6 s |
| /contact | 88 | 100 | 96 | 91 | 3.2 s |
| /ai-review | 100 | 89 | 96 | 50 | 1.1 s |
| /haldane-house | 85 | 100 | 96 | 100 | 3.7 s |
| /115-almond | 70 | 100 | 100 | 100 | 7.1 s |
| /the-red-climb | 72 | 100 | 100 | 100 | 5.9 s |
| /triangulated-tectonic | 69 | 100 | 100 | 91 | 9.6 s |
| /pike | 82 | 100 | 100 | 100 | 3.8 s |
| /farm-to-brick | 67 | 100 | 96 | 91 | 12.5 s |
| /helioform-station | 68 | 95 | 93 | 91 | 19.2 s |
| /forged-fungus | 74 | 100 | 93 | 100 | 5.5 s |
| /axon-voice | 100 | 87 | 100 | 90 | 1.1 s |
| /redline | 89 | 95 | 100 | 100 | 3.0 s |
| /redline/annotator | 100 | 71 | 86 | 80 | 0.8 s |
| /blank | 91 | 100 | 96 | 100 | 3.0 s |

## Task 1 — SEO basics
Changed
- `<meta name="description">` added to: contact, ai-review, triangulated-tectonic, farm-to-brick, helioform-station, redline/annotator
  (the other pages already had one; every title was already unique).
- Open Graph (`og:title/description/url/type/image`), `twitter:card` and `<link rel="canonical">` added wherever missing:
  about, contact, ai-review, pike, 115-almond, triangulated-tectonic, farm-to-brick, helioform-station, forged-fungus, axon-voice, redline/annotator.
  `og:image` = that project's existing grid-card image (no new images made). About/contact use the existing `assets/og-image.jpg`.
  Forged Fungus uses `forged-fungus/assets/presentation-board.webp` because its card is AVIF (Facebook/LinkedIn don't read AVIF).
- favicon link added to helioform-station (was missing).
- `sitemap.xml` (14 URLs, clean URLs, `lastmod` = last git commit of each page) and `robots.txt` (allows all; disallows `/desk-593457`, `/os`, `/api/`; points to sitemap).
- `llms.txt`: candidate-profile link changed to the clean URL `/ai-review`; added a "Projects" section listing every project page with a one-line, page-sourced summary (it only mentioned Pike and Helioform before).
- `redline/annotator.html` was an HTML fragment (no doctype / `<html lang>` / `<head>` / `<title>`) → quirks mode. Wrapped it in a proper document.
  Screenshot before vs after at 1280px: pixel-identical. The "END OF FILE - v2" marker is kept.
- `script.js`: Helioform grid card linked to `./helioform-station.html`, a file that does not exist (the page is `helioform-station/index.html`).
  It 404s under `python -m http.server` (Run Locally.bat) and depends on Vercel redirect behaviour live. Changed to `./helioform-station`. Bumped `script.js?v=` to `1104a`.

Unsure / left alone
- `/ai-review` has `<meta name="robots" content="noindex, nofollow">`. That is why its Lighthouse SEO is 50. Kept it, because it looks deliberate
  (AI-readable page, not for Google), and left it out of the sitemap. If you *want* it in Google, delete that one line and add it to `sitemap.xml`.
- `/blank` is the unlinked new-project template. Left out of the sitemap but did NOT add `noindex`, because a copy of the template would inherit it and hide the new project.
- `/axon-voice` has no `og:image` (its only image is an SVG, which social cards don't render). `twitter:card` set to `summary`.
- Content conflicts I noticed but did not edit (your voice, your call):
  - `ai-review.html` calls Helioform "a transit and service station"; the Helioform page and llms.txt say "weather station".
  - `ai-review.html` describes Pike as "threshold conditions between interior and exterior … SolidWorks modeling … physical model being built";
    `pike.html` describes a built riser / king tower / performer-platform system for Pi Kappa Alpha.
  - `ai-review.html` / `about.html` list Arkitek only for Feb–Jun 2023, but `115-almond.html` says the project was done at Arkitek in 2026.
