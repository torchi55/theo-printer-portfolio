# Handoff → Codex (local) — theojaneway.com, branch `cloud/portfolio-1`

Written by the cloud Claude session on 2026-11-04. Read `CLAUDE.md` (repo rules) first, then this, then `CLOUD-NOTES.md` (full evidence log).

## State right now
- Branch `cloud/portfolio-1` is pushed to `origin`. PR into `main` is open (title "Cloud pass 1: SEO, wheel bugs, Farm to Brick weight, images, mobile, a11y, perf").
- **NOT LIVE.** Vercel deploys `main` only. Theo merges; nobody else.
- 19 commits, all verified in headless Chromium at 375 / 390 / 1440 px (local clean-URL server). Nothing verified on a real phone or on the live Vercel preview yet. That is your first job.

## Get it locally
```bash
git fetch origin cloud/portfolio-1
git checkout cloud/portfolio-1
```
Local preview: `Run Locally.bat` (python http.server, port 5500) works for most pages, but it does NOT do Vercel `cleanUrls`, so links like `/pike` 404 there. Use the Vercel preview URL on the PR for true behaviour, or `npx vercel dev`.

## Your checklist (local / real-device work the cloud couldn't do)
1. **Vercel preview** of the PR: open every page, check nothing 404s (fonts are now in `/assets/fonts/`, sitemap/robots at root).
2. **Real iPhone + Android**: pinch viewer on 115-almond / pike / haldane / helioform / triangulated; tap targets; `/about` scrolls inside its sheet; no sideways scroll.
3. **Real desktop, mouse wheel**: open a lightbox on pike / helioform / triangulated and wheel → page behind must NOT move. Triangulated board: click to zoom, wheel pans but stays on the board, Ctrl+wheel/trackpad pinch zooms. 115-almond plates: click to magnify, then wheel-scroll → the lens follows the cursor.
4. **Keyboard**: Tab through pike → Enter on a drawing opens viewer → Tab stays inside → Esc returns focus. Ctrl+F a word near the bottom of pike → it scrolls into view.
5. **Laptop sizes** 1366×768 and 1440×900: `/about` and `/contact` reach their bottom rows (they were cut off before).
6. **Live Lighthouse** on the preview URL (mobile + desktop) and paste numbers into the PR. Local numbers are in `CLOUD-NOTES.md` → "Final results".
7. If all good → tell Theo it's ready to merge. Don't merge yourself.

## Decisions waiting on Theo (do NOT do these without a yes)
- `ai-review.html` content conflicts: Helioform "transit and service station" vs page's "weather station"; Pike description (SolidWorks / threshold) vs pike.html (riser + bar + stage for Pi Kappa Alpha); Arkitek listed only 2023 but 115-almond says Arkitek 2026.
- Forged Fungus title font: one line to get real Eurostile Extended (visible change) — see comment in `forged-fungus/index.html` @font-face.
- Helioform's deliberately ghosted greys (#2a2a2a / #3a3836 / #141412) fail contrast (a11y 96). Lift them or keep.
- Rename flagged files (table in CLOUD-NOTES Task 4): Farm `IMG_81xx`, `- Copy`, spaces; Helioform `1 image.webp`, `INVERTEDDDD`, UUID mp4s. Renaming = update every reference + data-pz/data-src.
- Delete dead weight (CLOUD-NOTES Task 7): `assets/printer.png`, `farm-to-brick/CHUNKS.png`, `forged-fungus/assets/site-plan.png` + `section.png` (all superseded by lossless WebP), unused redline/forged images. **Never** the `SECTIONS/PDFS (dont touch)` folder. **Check Theo OS** before touching `assets/icons/` + `assets/intake/` (probably loaded by /os).
- Git history is 569 MB (old 62 MB PDF, .mov files). Shrinking needs `git filter-repo` + force-push to main — Theo only.

## Optional next tasks (good for Codex, all on a NEW branch)
- **`srcset` pass for project pages** (Lighthouse "properly size images" 1.2–1.7 MB/page on mobile). Careful: the desktop magnifiers on 115/haldane/red-climb swap `img.src` (srcset overrides src → must update srcset too), and `pinch-zoom.js` falls back to `currentSrc` when an element has no `data-pz` → add `data-pz` with the full-res file before giving the page img a smaller candidate. Farm rotation frames: leave alone (Theo's call, see CLOUD-NOTES Task 3).
- Self-host Space Grotesk on `/redline` (only page still on Google Fonts).
- `/ai-review` is `noindex, nofollow` on purpose — leave unless Theo says otherwise.

## Gotchas introduced by this branch (don't break these)
- **`smooth-scroll.js` is now on every printer page** (also about, contact, farm, blank, helioform) even without Lenis. It holds (1) the overlay wheel guard — overlays listed in `OPEN`; if you add a new lightbox, add its open selector there; (2) the keyboard/find-in-page fix that folds any scroll of the clipped `#paper` into a window scroll. Pages without Lenis just skip the Lenis block.
- **Constants mirrored in CSS** (change both or the first-paint layout shift comes back):
  - `farm-to-brick/index.html`: `#rotationSpacer { height: 1378px }` = `ROTATION_PX (1500) − 122`.
  - `helioform-station/index.html`: `#sentinel` height `3 × (100svh − --bar-h)` = `(FRAME_VH 2 + 1)` viewports.
- **Fonts are self-hosted** and inlined per page (`@font-face` in each `<head>`, files in `assets/fonts/`). A page only gets the families it had before; farm keeps `font-display: block`. Adding a font = add its woff2 + `@font-face`, don't re-add the Google `<link>`.
- **Cache-busters**: `style.css?v=1104` on all pages, `script.js?v=1104b`, `contact.js?v=1104`. Bump when you edit those files. `smooth-scroll.js` / `lightbox-a11y.js` have none (Vercel revalidates).
- **`lightbox-a11y.js`** makes `[data-src]`, `.drawing-cell`, `.px img`, `#tecBoard` keyboard buttons and gives `#lightbox`/`#tecFullscreen` dialog focus handling. New triggers matching those selectors get it automatically.
- Tap targets: invisible `::after` hit areas (style.css block "TAP TARGETS"). Helioform's next-strip uses padding + negative margin instead (axe measures the box).
- `/about` and `/contact` desktop sheets are `overflow-y:auto` with hidden scrollbar (were `hidden` and cut content off).

## Testing recipe the cloud used (reproduce if needed)
- Node static server mimicking Vercel cleanUrls + gzip, Lighthouse 12.3 CLI, Playwright scripts for: wheel-over-overlay page scroll, zoom clamp, magnifier lens tracking, touch pinch (CDP two-finger), keyboard Tab trail, `scrollIntoView`, layout-box diff before/after, CLS via PerformanceObserver under 4× CPU + slow 4G. Scripts were in the cloud scratchpad (not committed); the method + numbers are in `CLOUD-NOTES.md` per task.
