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

## Task 2 — Lightbox / zoom wheel bugs
Reproduced in headless Chromium at 1440×900 with real wheel events (scripts in the session scratchpad, not committed).
`pinch-zoom.js` has no wheel code (it is touch-only and returns on desktop), so the wheel bugs live in the desktop viewers:

**Bug A: wheel over an open lightbox scrolled the page behind it.** Measured page `scrollY` before/after 6 wheel ticks over the open overlay:
| page / overlay | before fix | after fix |
|---|---|---|
| pike `#lightbox` (sheet-ui.js) | 1200 → 2700 | 1200 → 1200 |
| helioform `.drawing-cell` lightbox | 1200 → 2700 | 1200 → 1200 |
| helioform model-photo lightbox | 1200 → 2700 | 1200 → 1200 |
| triangulated board viewer `#tecFullscreen` | 1200 → 1450 (leaks once the overlay hits its end) | 1200 → 1200 |
| forged-fungus `#lightbox` | ok already | ok |
Root cause: `sheet-ui.js` sets `body.style.overflow='hidden'`, but `style.css` has `html{overflow-x:hidden}`, so body overflow
never reaches the viewport and the page keeps scrolling. Lenis deliberately ignores wheel while an overlay is open, so the
browser's native scroll ran. Helioform has no lock at all.
Fix: `smooth-scroll.js` now starts with an overlay wheel guard that runs with or without Lenis. While `#lightbox.open`, `#pz.is-open`
or `#tecFullscreen.open` is up, a wheel tick is cancelled unless it can scroll a box inside the overlay (so the triangulated board
still scrolls natively at 1×). Ctrl+wheel is never blocked (browser zoom). Helioform now loads `/smooth-scroll.js` for the guard only
(it has no Lenis, so the smooth-scroll part exits immediately and its scrolling is unchanged). `#tecFullscreen` added to Lenis's overlay lists.

**Bug B: triangulated board, zoomed, wheel panned without limits.** 40 wheel ticks pushed the board to `top:-17060px`, fully off-screen (black).
Fix: `fsClamp()` keeps the zoomed board covering the viewport (centred if smaller), applied on wheel, drag and click-zoom.
Ctrl+wheel / trackpad pinch now zooms about the cursor (1×–8×; verified the image point under the cursor stays fixed to <1px), and returning to 1× exits zoom.
Wheel deltas are normalised for line-mode wheels (Firefox).

**Bug C: in-place magnifier lost the cursor on wheel** (115-almond, haldane-house, the-red-climb plates + the climb frame).
Wheel-scrolling moves the plate under a still mouse with no `pointermove`, so the magnified spot froze:
115-almond cursor at 59.3 % of plate height, lens still at 43.1 %. After fix: lens 59.2 %. Scrolling the plate fully away now drops the zoom
(before: stayed zoomed off-screen). Keyboard-started zooms (Enter) are left centred and not touched by the re-aim.

Touch regression check (iPhone 13 emulation, CDP two-finger pinch): pinch viewer opens and pinches to 2.78× on 115-almond, pike, haldane,
helioform, triangulated. Page scroll after open/close still works on all Lenis pages + helioform.

Unsure: the live site serves `smooth-scroll.js` without a `?v=` cache-buster; Vercel's default `max-age=0, must-revalidate` means browsers re-check it, so no bump added.

## Task 3 — Farm to Brick weight (hero untouched)
Folder is 30 MB on disk: rotation frames 18 MB (120 files, not 119), 3 PDFs 6.6 MB (in `SECTIONS/PDFS (dont touch)`, not linked from any page, untouched),
2 mp4s 3.2 MB, the rest images.

**Rotation frames: NOT re-encoded.** They are already lossy WebP at roughly q88. Tested 3 frames (000, 040, 078):
| re-encode | size vs original | PSNR | max pixel diff |
|---|---|---|---|
| q85 | −12 % | 46–47.5 dB | 15–21 / 255 |
| q90 | +1–3 % (bigger) | 50–51 dB | 11–12 |
| q95 | +15 % | 54–55 dB | 7 |
Only q85 saves anything, and that is a second lossy generation on the hero you love: probably invisible, but not provably so. Per the brief, skipped.
**`srcset` for frames: also skipped.** The canvas cover-fits frames to paper-width × (100vh − slot). On a portrait phone that means the
1920×1406 frame is upscaled about 1.5× (height-bound) and only the centre ~40 % of its width shows. A smaller phone file would visibly soften it.
So `_originals/` was not needed and not created.

Changed (no visible change to the first screen; screenshot diff at 1440 and iPhone 13 = only the random background lightning + HUD flicker):
- The 5 looping videos (4× `ascii-art.mp4`, 1× Grasshopper mesh) were `autoplay`, so about 3.2 MB (5 requests) were fetched at page load,
  *before* the hero frames. Now `preload="none"` + `poster` and an IntersectionObserver plays them within about 1 screen of view, pausing them when far away.
  Posters (new, `farm-to-brick/posters/`, first frame of each loop at its stagger offset): 0.8 + 28.8 + 39.3 + 65.1 + 9.5 KB = 143 KB.
- `CHUNKS.png` 760.0 KB → `chunks-iso-diagram.webp` 505.4 KB, **lossless** (verified pixel-identical, every channel). The PNG is still in the repo, unreferenced.
- All 11 content `<img>` below the rotation: `loading="lazy" decoding="async"`. Printer image: `width/height` + `fetchpriority="high"` (as on index).
- Frame load order: frames 0–7 first, then coarse-to-fine (every 32nd, 16th …), so an early fast scrub lands near a loaded frame. Same files, same bytes.

Measured (local, first 4 s, no scrolling):
| | before | after |
|---|---|---|
| desktop bytes requested | 23.9 MB / 144 req | 20.0 MB / 140 req |
| iPhone 13 bytes requested | 23.9 MB / 144 req | 19.1 MB / 136 req |
| Lighthouse mobile LCP | 12.5 s | 5.0 s |
| Lighthouse mobile perf | 67 | 68 |
Perf stays in the 60s on simulated slow 4G because the 18 MB of hero frames are still fetched up front, by design. The only way past that without
touching quality is to stream frames on demand (e.g. load every 4th frame first and fill in during idle). That changes how the scrub feels
on first visit, so I'm leaving it for you to decide.
After a full scroll: every image loaded and all 5 videos reached readyState 4 (verified).
