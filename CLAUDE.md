# theojaneway.com — Project Context

## Owner
Theo Janeway, 3rd-year Architecture student at USC.
Computational design focus: Rhino, Grasshopper, Python scripting, AI-assisted workflows.
Side project: Axon (AI-assisted Rhino tool).

## Stack
- Plain HTML + CSS + JavaScript — no framework, no build step
- Cloudflare DNS → Vercel hosting (auto-deploys on `git push` to main)
- Domain: theojaneway.com
- This folder is canonical — it has the `.vercel` config linked to production. Edits to copies elsewhere never deploy.

## Pages
Each project is a standalone HTML file or subfolder. Full list = the nav in `index.html`. Main ones:
- `index.html` — home / nav
- `pike.html` — PIKE project (`pike-courtyard/` = its image/drawing assets, no page of its own)
- `triangulated-tectonic.html`, `haldane-house.html`, `115-almond.html`
- `farm-to-brick/`, `helioform-station/`, `forged-fungus/`, `axon-voice/`, `redline/` — subfolder sites
- `about.html`, `contact.html`, `ai-review.html`

## Design Direction
- Receipt-printer / terminal aesthetic
- Typography-first, monospace dominant
- No generic AI aesthetic — reference /design-taste-frontend for page design (it owns portfolio/landing work); /frontend-design only for app-like UI components
- Mobile-first responsive

## Rules
- Never commit secrets, API keys, or tokens
- Every page needs unique `<title>` + `<meta name="description">` for SEO
- Descriptive image filenames only (no IMG_0043.jpg)
- Alt text on every `<img>`
- Lighthouse target: 90+ on all four metrics (Performance, Accessibility, Best Practices, SEO)
- `vercel.json` has `cleanUrls: true` — subsites need `<base href="/subsite-name/">` or relative paths will 404

## Deploy
```
git add <files>
git commit -m "message"
git push
```
Vercel auto-deploys on push. For immediate prod deploy: `vercel --prod`

## Definition of Done (site/UI work)
Never say "done" until ALL three:
1. `git status` clean AND pushed — or explicitly label the work **LOCAL-ONLY**
2. Change verified where it runs: live URL or localhost screenshot, not just the source file
3. Final message states which: **LIVE** or **LOCAL-ONLY**
Mobile fixes: verify at the actual breakpoint width (Chrome device emulation ≠ real phone width — check the @media query fires at the test viewport).

## Skills
- `/portfolio-site` — project page structure and portfolio decisions
- `/design-taste-frontend` — page layout/redesign; `/frontend-design` — app-like UI components only
- `/web-design-guidelines` — accessibility and UX review
