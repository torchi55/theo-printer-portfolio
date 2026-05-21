/* ============================================================
   PRINTER HEADER
   The printer is a FIXED banner bolted to the top of the screen.
   The paper is anchored at the slot line, also fixed:
     · scroll 0      → height 0 (NO paper at the slot)
     · scroll 0→1vh  → paper extrudes down out of the slot
     · scroll beyond → content scrolls up, clipped back into the
                        slot (continuous feed behind the printer)
   No libraries.
   ============================================================ */

window.addEventListener("DOMContentLoaded", () => {
  const paper   = document.getElementById("paper");
  const inner   = paper.querySelector(".paper__inner");
  const spacer  = document.getElementById("spacer");
  const printer = document.getElementById("printer");
  const printerImg = printer.querySelector(".printer__img");

  /* ---- PROJECT DATA ------------------------------------------------ */
  const PROJECTS = [
    { name: "Helioform Station",            img: "assets/helioform-station.png",     order: 4 },
    { name: "Triangulated Tectonic Design", img: "assets/triangulated-tectonic.png", order: 3 },
    { name: "Pike Courtyard",               img: "assets/pike-courtyard.png",        order: 2 },
    { name: "Farmed Brick",                 img: "assets/farm-to-brick.jpeg",        order: 1 },
  ];
  const PLACEHOLDER_COUNT = 4;

  function renderGrid(sortMode) {
    const grid = document.getElementById("projectGrid");
    if (!grid) return;

    const sorted = [...PROJECTS];
    if      (sortMode === "newest") sorted.sort((a, b) => b.order - a.order);
    else if (sortMode === "oldest") sorted.sort((a, b) => a.order - b.order);
    else if (sortMode === "az")     sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortMode === "za")     sorted.sort((a, b) => b.name.localeCompare(a.name));

    const projectCards = sorted.map(p => `
      <div class="project-card">
        <div class="card__label">${p.name.toUpperCase()}</div>
        <div class="card__img-wrap">
          <img class="card__img" src="${p.img}" alt="${p.name}" draggable="false" />
          <div class="card__view"><span>VIEW &#8594;</span></div>
        </div>
      </div>`).join("");

    const phCards = Array.from({ length: PLACEHOLDER_COUNT }, () => `
      <div class="project-card placeholder">
        <div class="card__label">PLACEHOLDER</div>
        <div class="card__img-wrap">
          <div class="card__ph-text">—</div>
        </div>
      </div>`).join("");

    grid.innerHTML = projectCards + phCards;
    // re-measure scroll length now that inner height is real
    layout();
  }

  // Sort buttons
  document.querySelectorAll(".sort-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".sort-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderGrid(btn.dataset.sort);
    });
  });

  renderGrid("newest");

  /* ---- print-bar (top-left feed readout) ---- */
  const pbar   = document.getElementById("printbar");
  const pLabel = document.getElementById("printbarLabel");
  const pPct   = document.getElementById("printbarPct");
  const pFill  = document.getElementById("printbarFill");
  const pLen   = document.getElementById("printbarLen");
  const hudStat = document.querySelector(".hud__status");
  const hudLeds = document.querySelectorAll(".hud__statusbar .led");

  /* ---- TEXT SCRAMBLE / DECODE (nav hover ONLY) ----------------
     Exact replica of carlesfaus.com's hover scramble (class Xt in
     their d.js): charset is A–Z, the word reveals left-to-right,
     and the unrevealed tail re-randomises ONCE PER STEP (not every
     frame) — that step-gating is what makes it read calm, not
     noisy. Site uses a 60ms step; we use 75ms so it's a touch
     slower as requested. Fires only on Home/About/Contact hover. */
  const SCRAMBLE_CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#!/\\@%&$*?<>=+-—:;.~^|";
  const STEP_MS = 75;
  const reduceMotion =
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  function scrambleTo(el, text) {
    if (!el) return;
    if (reduceMotion) { el.textContent = text; return; }
    const chars    = [...text];
    const nonSpace = chars.filter((c) => !/\s/.test(c)).length || 1;
    const steps    = Math.max(1, nonSpace - 1);   // (chars-1), per site
    const dur      = steps * STEP_MS;
    const t0       = performance.now();
    let last = -1;
    cancelAnimationFrame(el.__raf || 0);
    (function tick(now) {
      const p = Math.min(1, (now - t0) / dur);
      let f = Math.floor(p * steps);
      if (p === 1) f = steps + 1;
      if (f !== last) {                            // only re-render on a step
        last = f;
        const reveal = Math.floor((f / nonSpace) * chars.length);
        el.textContent = chars
          .map((c, o) =>
            /\s/.test(c) || o < reveal
              ? c
              : SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0]
          )
          .join("");
      }
      if (p < 1) el.__raf = requestAnimationFrame(tick);
      else el.textContent = text;
    })(t0);
  }

  // Lock each nav label to its real rendered width (measured AFTER
  // the web font loads) so swapping glyphs can never reflow / shake
  // the icon above it. Hover = re-decode that label.
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      const lbl = btn.querySelector(".nav-label");
      if (!lbl) return;
      lbl.__orig = lbl.textContent.trim();
      lbl.style.display = "inline-block";
      lbl.style.width = Math.ceil(lbl.getBoundingClientRect().width) + "px";
      lbl.style.textAlign = "center";
      lbl.style.whiteSpace = "nowrap";
      btn.addEventListener("mouseenter", () =>
        scrambleTo(lbl, lbl.__orig)
      );
    });
  });

  let idleTimer = null;
  let lastY = 0;

  function maxScroll() {
    return Math.max(
      1,
      document.documentElement.scrollHeight - window.innerHeight
    );
  }

  /* px → a believable receipt length. ~37.8px/cm. */
  function paperLenCm() {
    return Math.round(inner.scrollHeight / 37.8);
  }

  function updatePrintbar() {
    const p   = Math.min(1, Math.max(0, window.scrollY / maxScroll()));
    const pct = Math.round(p * 100);
    const tot = paperLenCm();

    pFill.style.width = pct + "%";
    pPct.textContent  = pct + "%";
    pLen.textContent  = Math.round(p * tot) + " / " + tot + " cm";

    const done = pct >= 100;
    const moving = window.scrollY !== lastY;
    lastY = window.scrollY;

    if (moving && !done) {
      pbar.classList.add("active");
      pLabel.textContent = "Printing";
      if (hudStat) hudStat.textContent = "PRINTING";
      hudLeds.forEach((l) => l.classList.add("on"));

      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        pbar.classList.remove("active");
        const finished = window.scrollY >= maxScroll() - 1;
        pLabel.textContent = finished ? "Complete" : "Ready";
        if (hudStat) hudStat.textContent = finished ? "COMPLETE" : "STANDBY";
        hudLeds.forEach((l) => l.classList.remove("on"));
      }, 360);
    } else if (done) {
      pbar.classList.remove("active");
      pLabel.textContent = "Complete";
      if (hudStat) hudStat.textContent = "COMPLETE";
      hudLeds.forEach((l) => l.classList.remove("on"));
    }
  }

  const cssVar = (name) =>
    getComputedStyle(document.body).getPropertyValue(name).trim();

  const getSlotY      = () => parseFloat(cssVar("--slot-y")) || 0.5884;
  const getAspect     = () => parseFloat(cssVar("--printer-aspect")) || 5.397;
  const getPrinterTop = () => parseFloat(cssVar("--printer-top")) || -10; // px
  const getExtrudeVH  = () => parseFloat(cssVar("--extrude-scroll")) || 1;

  /* Measure the REAL printer element so any CSS — including the
     mobile breakpoints — drives the slot/paper math automatically.
     Fall back to width/aspect if the image hasn't loaded yet. */
  function printerMetrics() {
    const r = printer.getBoundingClientRect();
    const h = r.height || r.width / getAspect();
    const top = r.height ? r.top : getPrinterTop();
    return { top, h };
  }
  /* viewport-Y where the paper emerges (mirrors the CSS calc) */
  function slotLinePx() {
    const m = printerMetrics();
    return m.top + m.h * getSlotY();
  }
  const fullPaperH    = () => Math.max(0, window.innerHeight - slotLinePx());
  const extrudeScroll = () => window.innerHeight * getExtrudeVH();

  /* ---- scroll-driven extrusion ---- */
  function update() {
    const full = fullPaperH();
    const ex   = extrudeScroll();
    const y    = window.scrollY;

    if (y <= ex) {
      // Phase 1: grow out of the slot. 0 → full.
      const t = ex ? y / ex : 1;
      paper.style.height = (t * full) + "px";
      inner.style.transform = "translateY(0px)";
    } else {
      // Phase 2: full height, content scrolls up into the slot.
      paper.style.height = full + "px";
      inner.style.transform = "translateY(" + -(y - ex) + "px)";
    }

    updatePrintbar();
  }

  function layout() {
    // Total scroll length = extrude phase + room to scroll all the
    // content up past the slot.
    const phase2 = Math.max(0, inner.scrollHeight - fullPaperH());
    spacer.style.height =
      Math.ceil(extrudeScroll() + phase2 + window.innerHeight * 0.05) + "px";
    update();
  }

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; update(); });
  }, { passive: true });
  window.addEventListener("resize", layout);
  window.addEventListener("orientationchange", layout);
  // The printer image controls the slot line; recompute once it loads.
  if (printerImg.complete) requestAnimationFrame(layout);
  else printerImg.addEventListener("load", layout);

  /* ---- Nav button press feedback ---- */
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("mousedown", () => btn.classList.add("pressed"));
    btn.addEventListener("mouseup", () =>
      setTimeout(() => btn.classList.remove("pressed"), 120)
    );
    btn.addEventListener("mouseleave", () => btn.classList.remove("pressed"));
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        btn.classList.add("pressed");
        setTimeout(() => btn.classList.remove("pressed"), 150);
      }
    });
    btn.addEventListener("click", (e) => e.preventDefault()); // prototype
  });

  layout();
});
