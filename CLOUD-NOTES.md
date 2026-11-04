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

## Task 4 — Image discipline
Audit of 107 static `<img>` tags on 13 public pages (desk-593457 excluded, it is private):
- **Alt text: present on all 107.** (Many are generic, e.g. Farm to Brick "Exterior render" / "Chunks diagram". Fine for now, but could be more descriptive.)
- **width/height added to 52 images** (intrinsic size read from the file, AVIF/SVG included), including every printer image (same attrs index.html already had).
  Verified: rendered box of every image before vs after at 375×812 and 1440×900 (after scrolling the whole page): identical (±1px) for all edited images.
  The only differences measured were the 4 Red Climb stacked-plan layers, which I did not edit. They live in a scroll-driven scaled sheet, so their measured size depends on timing.
- **loading="lazy" added** to images more than 1.6 screens deep at both widths that had no loading attribute: triangulated model photos (4) and helioform Ladybug analysis (6),
  plus the 11 Farm to Brick images from Task 3. First-screen images stay eager (lazy inside the extruding paper could pop in late).
- Not changed: images created by JS (home grid cards); empty-`src` lightbox `<img>`s.

Bad filenames: flagged only, NOT renamed (renaming means touching links and maybe external references; your call):
| file | suggestion |
|---|---|
| `farm-to-brick/Model Photos/IMG_8104.webp`, `IMG_8109`, `IMG_8150`, `IMG_8159` | `model-exterior-elevation.webp`, `model-interior-ground-right`, `model-floating-corner`, `model-exterior-three-quarter` |
| `farm-to-brick/AI RENDERS/… - Copy.webp` (×2) | `ai-render-exterior.webp`, `ai-render-interior.webp` |
| `farm-to-brick/Grid evolution 6.webp`, `Plans drawings.webp`, `SECTIONS/left side section cut.webp` etc. | spaces in names → kebab-case |
| `farm-to-brick/CHUNKS.png` (now unreferenced, replaced by `chunks-iso-diagram.webp`) | keep or delete, your call |
| `farm-to-brick/GALLAGHER_S25_105B_JANEWAY_THEO_ASSIGNMENT1_VIDEO4.MP4_1.mp4` | `grasshopper-mesh-experimental.mp4` |
| `helioform-station/assets/1 image.webp`, `2 image.webp`, `3 image.webp` | describe the model photos |
| `helioform-station/diagrams/ARCH 2.2A FINAL (Theo&Marcus) INVERTEDDDD.webp`, `First 211 DRAWING INVERTED.webp` | `sheet-2-isometric-section.webp`, `sheet-1-211-materials.webp` (`&` and spaces in URLs are fragile) |
| `helioform-station/assets/copy_0E8FC0A0-….mp4`, `copy_DB39653E-….mp4` | UUID names |

## Task 5 — Mobile pass (375 and 390 px)
Scripted sweep of 16 pages at both widths (mobile emulation, touch). Each page was scrolled top to bottom and every visible element checked:
- **Horizontal scroll: none** on any page at either width (`scrollWidth == innerWidth`). No element overflows the viewport unclipped.
- **Text overflow: none found.**
- **Nav:** printer pages use the `.mbar` mobile HUD bar. Home/About/Contact icons are tappable and none were flagged.
- **Tap targets under 24 px tall (WCAG 2.2 AA target size), fixed:**
  home SORT buttons (17 px), about school/link rows (11), contact rows (12, the main contact links!), "← Portfolio" next-strip links on
  pike / 115 / haldane / red climb / triangulated / farm (12), forged-fungus footer links (16), helioform next-strip (9) and lightbox `[ close ]` (10),
  forged lightbox close (13), blank back link (11), ai-review site link (16).
  Fix: an invisible absolutely positioned `::after` on each link that extends the hit area (`style.css` block "TAP TARGETS", plus small inline rules in
  helioform, ai-review, redline). No layout or visual change: the link box itself is untouched. Insets were sized from the measured row pitch, so neighbouring
  hit areas don't overlap (e.g. about rows are 32 px apart, forged footer rows 26 px apart).
  Measured effective hit height after (elementFromPoint sweep): 25–27 px on every one.
  Left alone (WCAG inline-text exception): links inside sentences (115-almond "REDLINE", about "Axon Voice", axon-voice / redline "built by Theo Janeway").
  Left alone: about's 16×24 lock icon (visit-log entry) is deliberately tiny.
- **Broken assets found during the sweep, fixed:**
  - `/blank`: `href="blank.css"` resolved to `/blank.css` (404) under cleanUrls, so the template rendered unstyled. Added `<base href="/blank/">`, per CLAUDE.md's subsite rule.
  - `/forged-fungus`: `@font-face` pointed at `../fonts/EurostileExtended.ttf` → `/fonts/…`, which doesn't exist (404 on every visit, console error).
    The title has therefore *always* rendered in the Michroma fallback. I removed the dead URL (keeps today's look exactly). **Your call:** if you want the real
    Eurostile Extended there (as on Helioform), set `src: url('/helioform-station/fonts/EurostileExtended.ttf')`. That is a visible change, so I did not make it.
- `style.css` cache-buster unified to `?v=1104` on all 11 pages that load it (some had `?v=717`, `?v=904` or none), so phones pick up the new rules.

## Task 6 — Accessibility + Best Practices
**Keyboard access to the lightboxes (new `lightbox-a11y.js`, loaded on pike, forged-fungus, helioform-station, triangulated-tectonic).**
Before: every image trigger was a plain `div` / `article` / `img` with a click handler. Not one could be reached or opened from the keyboard, and only Pike's
overlay had `role="dialog"`. Focus stayed on the page behind an open viewer.
Now (behaviour only, nothing visual): triggers get `tabindex=0`, `role=button`, an "Open … full screen" label and Enter/Space handling;
`<article>` triggers put the tab stop on their image (an article may not take role=button). Overlays get `role=dialog` + `aria-modal` + a label.
Opening moves focus to the viewer's first control, Tab/Shift+Tab stay inside, and closing returns focus to the trigger.
Verified with real keystrokes on all four pages: Tab → trigger → Enter opens → focus inside dialog → 6× Tab never leaves → Esc closes → focus back on the trigger.
Not covered: Pike's `#barCard` contains its own callout-dot buttons, so it can't become a button itself (it would nest buttons); it is still mouse/touch only.
The wheel regression tests from Task 2 were re-run after this change: still pass.

**Contrast (WCAG AA 4.5:1), only the elements Lighthouse/axe flagged:**
| page | element | before → after |
|---|---|---|
| ai-review | section h2, exp-org, project-year, skill-note, AI note | #888 / #999 / #aaa / #bbb on #fafaf8 (1.8–3.4:1) → #727272 (4.6:1) |
| helioform | s1 `.credit`, `.ml` meta labels, drawing `.d-name` | #555 on black (2.8:1) → #767676 (4.6:1) |
| helioform | `.s2-kicker` | #4a4844 (2.3:1) → #787673 (4.6:1) |
| axon-voice | comparison table `.no` cells | #55606f (3.0:1) → #747d89 (4.6:1) |
| axon-voice, redline | footer "Theo Janeway" link | now underlined (it was distinguished from surrounding text by colour alone) |
Left as is, on purpose (deliberately ghosted type, part of the look): helioform `.d-author` #2a2a2a, `.section-label` #3a3836, scroll hint #141412.
Helioform a11y is 96 because of these. Say the word and I'll lift them too.

**Landmarks / headings / names**
- `<main>` added to helioform, redline, axon-voice (wrapping existing content; no layout change, verified page height and element positions identical at 375/1440);
  ai-review wrapper gets `role="main"`.
- `<h1>`: ai-review's name `div` → `h1` (same class, same look). Index, about and triangulated had no h1: added a visually hidden h1
  (`.visually-hidden` utility in style.css). Triangulated's visible eyebrow is `aria-hidden` so the title isn't read twice.
- axon-voice: the demo's tab buttons get a `role="tablist"` parent (wrapper is `display:contents`, no layout change); the empty corner `<th>` of the
  comparison table gets hidden text "Feature" (fixes td-has-header).
- contact form: inputs had only placeholders as names and `outline:none` with no replacement focus style.
  Added `aria-label`s, and the dotted rule under a field turns amber while it has focus.

**Console / network:** 0 console errors, 0 failed requests on all 16 pages, desktop, full scroll. Mixed content: none (no `http://` asset URLs).

**Not done (would change the design):** Lighthouse "legible font sizes" (Best Practices, mobile) flags the 8–10 px monospace UI text on most printer pages.
Best Practices is still 96 there. Fixing it means bigger type, which is a design decision.

**Known pre-existing limitation:** on the printer pages the paper is `position:fixed` and scrolled by transform, so a keyboard user Tab-ing
to a link far down the sheet does not get it scrolled into view (the browser can't scroll a transform). Worth a dedicated fix
(`focusin` → map the element's offset to `window.scrollTo`), but it touches the core scroll engine, so I left it alone.

Note on Helioform page height: `main` measures 8.4k px at load and grows to 14.2k px as the lazy drawings arrive (layout shift).
With the Task 4 width/height the full height is reserved up front. Final layout identical.

## Task 7 — Dead weight report (REPORT ONLY, nothing deleted)
Repo: 587 tracked files, 118.1 MB working tree; `.git` history 569 MB.
Method: every tracked file's name (raw + URL-encoded) searched across all HTML/CSS/JS/JSON/TXT in the repo. Frame sequences built in JS
(`frame_###`, `Frame_#####`, tile `-rN-cN`) checked against their templates. Matches by hand-check, not just grep.

**Unreferenced: nothing on the site links to these** (≈ 9.6 MB once the false positives are removed):
| size | file | note |
|---|---|---|
| 4613.8 KB | `farm-to-brick/SECTIONS/PDFS (dont touch)/Y1-P3_storage-building_illustrator_section-right-side.pdf` | "dont touch" folder. Note `.gitignore` has `*.pdf`, yet these 3 are tracked (added before the rule), so they deploy |
| 1171.0 KB | `farm-to-brick/SECTIONS/PDFS (dont touch)/left side normal - Copy.pdf` | same |
| 972.0 KB | `farm-to-brick/SECTIONS/PDFS (dont touch)/left side section cut - Copy.pdf` | same |
| 1111.1 KB | `assets/printer.png` | superseded by `assets/printer.webp` (111 KB), which every page uses |
| 760.0 KB | `farm-to-brick/CHUNKS.png` | superseded in Task 3 by lossless `chunks-iso-diagram.webp` |
| 2.9 MB total | `assets/icons/*.png` (34 files, 57–120 KB each) + `assets/intake/*.png` (3) | not referenced in this repo. **Probably used by Theo OS** (`/os` is rewritten to the theo-os-phone project, which may load them from this domain). Check before touching |
| 189.8 + 139.2 KB | `redline/img/pavilion-court-redlined.jpg`, `pavilion-court-grey-model.jpg` | REDLINE page uses the pavilion-*entry* pair only |
| 116.8 KB | `assets/focus-gate-card.jpg` | old card; home uses `theo-os-card.jpg` |
| 105.5 KB | `forged-fungus/assets/lebbeus-woods-ref.jpg` | |
| 59.3 KB | `forged-fungus/assets/site-context.jpg` | |
| 3.1 KB | `assets/blank.svg` | blank card was removed from the grid 2026-09-03 |
| 2.5 / 0.8 KB | `remove_bg.py`, `rembg_bg.py` | local tooling at repo root, deployed as static files. Harmless but public |
False positives I checked and excluded: `helioform-station/rotation/Frame_*.webp` (120) and `helioform-station/wall/Frame_*.png` (60) are loaded by JS templates.

**Exact duplicates** (md5):
| size | files |
|---|---|
| 124.8 KB | `farm-to-brick/rotation-frames/frame_000.webp` == `frame_119.webp` (loop closure. Intentional? 1 request could be saved) |
| ~125 KB | `helioform-station/rotation/Frame_00000.webp` == `Frame_00119.webp` (same pattern) |
| 27.6 KB | `assets/arkitek-idp.avif` == `forged-fungus/assets/digital-collage.avif` (home card + project page; cached separately) |

**Largest tracked files** (all referenced unless noted): `assets/triangulated-tectonic-board-uhq.webp` 10.3 MB (desktop board viewer, loaded on click only),
FD1–FD4 drawings 1.0–1.5 MB each, `assets/triangulated-tectonic-board-hq.webp` 3.0 MB, `ascii-art.mp4` 2.0 MB, helioform `copy_0E8F….mp4` 2.0 MB,
almond `*-zoom2.webp` 0.8–1.9 MB (second magnify tier, loaded on click), `forged-fungus/assets/site-plan.png` 720 KB (a lossless WebP would likely halve it, same as CHUNKS).

**Git history (why a clone is 569 MB):** deleted-but-still-in-history blobs: `assets/triangulated-tectonic.pdf` 62.1 MB + 11.8 MB, two helioform `.mov` 25.9 + 16.8 MB,
`assets/triangulated-tectonic.png` 17.9 MB, an old 15.1 MB version of the Gallagher mp4, `farm-to-brick/Frame_1.mp4` 7.9 MB, plus multi-MB JPG/PNG masters.
Shrinking that means rewriting history (`git filter-repo`) and force-pushing main. Only you can decide that. It doesn't affect the live site.

## Never-idle audit, round 1
**Broken-link / missing-asset crawl:** 223 unique internal paths referenced from 18 pages (href, src, poster, data-src, data-pz, data-zoom*, CSS url()),
each requested from the clean-URL server. 0 broken (after the Task 5 fixes). Console sweep: 0 errors on all pages.

**JS review: bugs found and fixed**
1. **Home page blank when browser storage is blocked** (`script.js`). `localStorage.getItem("booted")` was the only unguarded storage call on
   the site. With site data blocked (Chrome "block all cookies", some privacy modes) it throws, and the whole home-page script dies.
   Reproduced on `main`: paper height 0, 0 project cards, one uncaught SecurityError. After: renders normally (8 cards). Both calls wrapped. `script.js?v=1104b`.
2. **Keyboard Tab desynced the printer pages' scroll** (`smooth-scroll.js`). The sheet is `position:fixed; overflow:hidden` and moved by a transform
   from `window.scrollY`. When Tab focused a link further down, the browser scrolled `#paper` itself (scrollTop measured up to 8,723 px on 115-almond)
   while `window.scrollY` stayed 0. Printbar and reveals desynced, and the next wheel double-offset the sheet.
   Fix: a clipped sheet is never allowed to scroll itself; on `focusin` the focused element is brought into view by scrolling the *window*
   (computed from on-screen geometry, so it works with every page engine). Only applies when the sheet is `overflow:hidden`.
   Phones' about page (`overflow:auto`) is untouched; verified it still swipe-scrolls.
   `smooth-scroll.js` is now also loaded on about, contact, farm-to-brick, blank for this (those pages have no Lenis, so only the guard + this fix run).
   Verified: 45–49 Tab stops on home / pike / 115-almond, 0 focused elements left off-screen, `paper.scrollTop` stays 0.
3. **`/about` on laptop screens cut off the bottom of the sheet with no way to reach it** (pre-existing on `main`).
   Desktop CSS had `.paper{overflow:hidden !important}` (a one-screen design), but the content is 924 px tall and the sheet is 759 px at 1440×900
   (596 px at 1280×720). The young-building photo and "← BACK TO HOME" were unreachable at 1280×720, 1440×900 and 1536×864 (fine at 1920×1080).
   Fix: the sheet scrolls inside itself on desktop too (as it already did on phones), with the scrollbar hidden. At 1920×1080 the first screen is
   pixel-identical. At 1440 the only diff is sub-pixel text anti-aliasing. After: wheel reaches the back link at 1280 / 1440 / 1920.
