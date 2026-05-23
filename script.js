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

  /* ============================================================
     AUTO-SCROLL
     Paper prints out automatically after boot. Speed eases in
     from 25 → 280 px/s over 2 s. window.scrollTo keeps the
     real scroll position in sync so user takeover is seamless.
     ============================================================ */
  let isAutoScrolling = false;
  let autoScrollY     = 0;
  let autoLastT       = null;
  let autoStartT      = null;
  let autoExpectedY   = -999;

  function startAutoScroll(delayMs) {
    setTimeout(() => {
      if (window.scrollY > 50) return; // user already scrolled
      isAutoScrolling = true;
      autoScrollY     = window.scrollY;
      autoLastT       = null;
      autoStartT      = null;
      requestAnimationFrame(autoScrollStep);
    }, delayMs || 0);
  }

  function autoScrollStep(t) {
    if (!isAutoScrolling) return;
    if (!autoStartT) { autoStartT = t; autoLastT = t; }
    const elapsed = (t - autoStartT) / 1000;
    const dt      = Math.min((t - autoLastT) / 1000, 0.1);
    autoLastT     = t;
    const speed   = Math.min(280, 25 + 255 * Math.min(1, elapsed / 2));
    autoScrollY   = Math.min(autoScrollY + speed * dt, extrudeScroll());
    autoExpectedY = Math.round(autoScrollY);
    window.scrollTo(0, autoExpectedY);
    update();
    if (autoScrollY < extrudeScroll()) requestAnimationFrame(autoScrollStep);
    else isAutoScrolling = false;
  }

  /* ============================================================
     BOOT SEQUENCE
     Printer is always visible (boot screen z:10, printer z:50).
     Only canvas + center-text are hidden via body.loading CSS.
     sessionStorage prevents re-running on back-navigation.
     ============================================================ */
  (function initBoot() {
    const already  = sessionStorage.getItem("booted");
    const screen   = document.getElementById("boot-screen");

    if (already) {
      if (screen) screen.style.display = "none";
      startAutoScroll(300);
      return;
    }

    document.body.classList.add("loading");
    const blocksEl = document.getElementById("bootBlocks");
    const pctEl    = document.getElementById("bootPct");
    if (!screen || !blocksEl) {
      document.body.classList.remove("loading");
      startAutoScroll(300);
      return;
    }

    const BLOCK_COUNT = 20;
    for (let i = 0; i < BLOCK_COUNT; i++) {
      const b = document.createElement("div");
      b.className = "boot__block";
      blocksEl.appendChild(b);
    }
    const blockEls = blocksEl.querySelectorAll(".boot__block");
    let filled = 0;

    const fillInterval = setInterval(() => {
      if (filled < BLOCK_COUNT) {
        blockEls[filled].classList.add("on");
        filled++;
        pctEl.textContent = Math.round((filled / BLOCK_COUNT) * 100) + "%";
      } else {
        clearInterval(fillInterval);
        doFlicker();
      }
    }, 40);

    function doFlicker() {
      const seq = [0, 1, 0, 0.7, 0, 0.4, 0, 0];
      let i = 0;
      const flicker = setInterval(() => {
        screen.style.opacity = seq[i];
        i++;
        if (i >= seq.length) {
          clearInterval(flicker);
          revealMain();
        }
      }, 55);
    }

    function revealMain() {
      screen.style.display = "none";
      document.body.classList.remove("loading");
      sessionStorage.setItem("booted", "1");
      startAutoScroll(600); // 600ms for canvas fade-in before paper moves
    }
  })();

  const paper   = document.getElementById("paper");
  const inner   = paper.querySelector(".paper__inner");
  const spacer  = document.getElementById("spacer");
  const printer = document.getElementById("printer");
  const printerImg = printer.querySelector(".printer__img");

  /* ---- PROJECT DATA ------------------------------------------------ */
  const PROJECTS = [
    { name: "Helioform Station",            img: "assets/helioform-station.png",     order: 4, year: "25" },
    { name: "Triangulated Tectonic Design", img: "assets/triangulated-tectonic.png", order: 3, url: "./triangulated-tectonic.html", year: "25" },
    { name: "Pike Courtyard",               img: "assets/pike-courtyard.png",        order: 2, url: "./pike.html", year: "25" },
    { name: "Farmed Brick",                 img: "assets/farm-to-brick.jpeg",        order: 1, url: "./farm-to-brick", year: "25" },
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

    const projectCards = sorted.map(p => {
      const tag   = p.url ? "a" : "div";
      const href  = p.url ? ` href="${p.url}"` : "";
      return `
      <${tag}${href} class="project-card">
        <div class="card__img-wrap">
          <img class="card__img" src="${p.img}" alt="${p.name}" draggable="false" />
          <div class="card__view"><span>VIEW &#8594;</span></div>
        </div>
        <div class="card__meta">
          <div class="card__label">${p.name.toUpperCase()}</div>
          <span class="card__year">'${p.year}</span>
        </div>
      </${tag}>`;
    }).join("");

    const phCards = Array.from({ length: PLACEHOLDER_COUNT }, () => `
      <div class="project-card placeholder">
        <div class="card__img-wrap">
          <div class="card__ph-text">—— ——</div>
        </div>
        <div class="card__meta">
          <div class="card__label">COMING SOON</div>
        </div>
      </div>`).join("");

    grid.innerHTML = projectCards + phCards;
  }

  // Sort buttons
  document.querySelectorAll(".sort-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const grid = document.getElementById("projectGrid");
      grid.style.opacity = "0";
      setTimeout(() => {
        document.querySelectorAll(".sort-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderGrid(btn.dataset.sort);
        layout();
        requestAnimationFrame(() => { grid.style.opacity = "1"; });
      }, 140);
    });
  });

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

    if (centerText) {
      centerText.style.opacity = Math.max(0, 1 - y / 200);
    }
  }

  function layout() {
    // Total scroll length = extrude phase + room to scroll all the
    // content up past the slot.
    const phase2 = Math.max(0, inner.scrollHeight - fullPaperH());
    spacer.style.height =
      Math.ceil(window.innerHeight + extrudeScroll() + phase2 + window.innerHeight * 0.05) + "px";
    update();
  }

  /* ---- Center-text fade on scroll ---- */
  const centerText = document.getElementById("centerText");

  let ticking = false;
  window.addEventListener("scroll", () => {
    // Ignore scroll events we triggered ourselves during auto-scroll
    if (isAutoScrolling && Math.abs(window.scrollY - autoExpectedY) <= 2) return;
    isAutoScrolling = false; // real user scroll — take control
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

  /* ---- CUSTOM CURSOR ------------------------------------------ */
  (function () {
    // Skip on touch-only devices (no hardware pointer)
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const cur = document.getElementById("customCursor");
    if (!cur) return;

    const INTERACTIVE =
      "a, button, .sort-btn, .project-card, .card__img-wrap, [role='button']";

    document.body.classList.add("has-custom-cursor");
    let entered = false;

    // pointermove fires for every mouse movement — update position +
    // hover state in one handler so there is never a state mismatch.
    document.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      cur.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
      if (!entered) { entered = true; cur.style.opacity = "1"; }
      cur.classList.toggle("is-hovering", !!e.target.closest(INTERACTIVE));
    });

    document.addEventListener("mousedown",
      () => cur.classList.add("is-clicking"));
    document.addEventListener("mouseup",
      () => cur.classList.remove("is-clicking"));

    // Hide while the pointer is outside the viewport
    document.documentElement.addEventListener("mouseleave", () => {
      cur.style.opacity = "0";
      cur.classList.remove("is-hovering", "is-clicking");
      entered = false;
    });
    // pointermove will re-show it at the correct position on re-entry
    document.documentElement.addEventListener("mouseenter",
      () => { entered = false; });
  })();

  renderGrid("newest");
  layout();

  /* ============================================================
     GRID / LIGHTNING CANVAS BACKGROUND
     ============================================================ */
  (function () {
    const canvas = document.getElementById("dotCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let W = 0, H = 0;
    function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
    resize();
    window.addEventListener("resize", resize);

    const SPACING = 18, ORIGIN = 9, BASE_LW = 0.35, BASE_A = 0.09;
    const CURSOR_R = 100, CURSOR_LW = 0.7, CURSOR_A = 0.22;

    let bgMx = -9999, bgMy = -9999;
    document.addEventListener("pointermove", e => {
      if (e.pointerType !== "mouse") return;
      bgMx = e.clientX; bgMy = e.clientY;
    });
    document.documentElement.addEventListener("mouseleave", () => { bgMx = -9999; bgMy = -9999; });

    const DIRS = [
      { dx: SPACING, dy: 0 }, { dx: -SPACING, dy: 0 },
      { dx: 0, dy: SPACING }, { dx: 0, dy: -SPACING },
    ];
    const PERPS = [[2,3],[2,3],[0,1],[0,1]];

    function generatePath(sx, sy, dirIdx, maxSteps, brightness) {
      const segs = []; let x = sx, y = sy, dir = dirIdx, bright = brightness;
      for (let s = 0; s < maxSteps && bright > 0.04 && segs.length < 600; s++) {
        const { dx, dy } = DIRS[dir]; const nx = x + dx, ny = y + dy;
        if (nx < -SPACING*8 || nx > W+SPACING*8 || ny < -SPACING*8 || ny > H+SPACING*8) break;
        segs.push({ x1: x, y1: y, x2: nx, y2: ny, bright });
        const r = Math.random();
        if (r < 0.12 && maxSteps - s > 12) {
          const pDir = PERPS[dir][Math.random() < 0.5 ? 0 : 1];
          segs.push(...generatePath(nx, ny, pDir, Math.floor((maxSteps-s)*(0.4+Math.random()*0.3)), bright*0.55));
        }
        if (r < 0.20) dir = PERPS[dir][Math.random() < 0.5 ? 0 : 1];
        bright *= 0.93 + Math.random() * 0.05; x = nx; y = ny;
      }
      return segs;
    }

    const bolts = [];
    function spawnBolt(sx, sy, numArms, maxSteps, life) {
      const allSegs = [];
      for (let a = 0; a < numArms; a++)
        allSegs.push(...generatePath(sx, sy, Math.floor(Math.random()*4), maxSteps, 1.0));
      if (allSegs.length) bolts.push({ segs: allSegs, age: 0, life });
    }
    function spawnAmbient() {
      const sx = ORIGIN + Math.floor(Math.random() * Math.floor(W/SPACING)) * SPACING;
      const sy = ORIGIN + Math.floor(Math.random() * Math.floor(H/SPACING)) * SPACING;
      spawnBolt(sx, sy, 5 + Math.floor(Math.random()*3), 160, 160);
    }
    function spawnClick(cx, cy) {
      const sx = ORIGIN + Math.round((cx-ORIGIN)/SPACING) * SPACING;
      const sy = ORIGIN + Math.round((cy-ORIGIN)/SPACING) * SPACING;
      spawnBolt(sx, sy, 6 + Math.floor(Math.random()*4), 170, 130);
    }
    document.addEventListener("click", e => spawnClick(e.clientX, e.clientY));

    let bgFrame = 0, nextAmbient = 180;
    const MAX_AMBIENT = 2;

    function bgLoop() {
      bgFrame++;
      ctx.clearRect(0, 0, W, H);

      for (let i = bolts.length-1; i >= 0; i--)
        if (++bolts[i].age >= bolts[i].life) bolts.splice(i, 1);

      if (bgFrame >= nextAmbient && bolts.length < MAX_AMBIENT + 2) {
        spawnAmbient();
        nextAmbient = bgFrame + 140 + Math.floor(Math.random()*200);
      }

      const scrollY = window.scrollY;
      const cursorOn = bgMx > -100 && bgMx < W + 100;
      const iMin = Math.floor(-ORIGIN/SPACING)-1, iMax = Math.ceil((W-ORIGIN)/SPACING)+1;
      const jMin = Math.floor((scrollY-ORIGIN)/SPACING)-1, jMax = Math.ceil((scrollY+H-ORIGIN)/SPACING)+1;

      // Pass 1: base grid (single draw call)
      ctx.strokeStyle = "#c8860a"; ctx.lineWidth = BASE_LW; ctx.globalAlpha = BASE_A; ctx.beginPath();
      for (let i = iMin; i < iMax; i++)
        for (let j = jMin; j <= jMax; j++) { const gx=ORIGIN+i*SPACING, sy=ORIGIN+j*SPACING-scrollY; ctx.moveTo(gx,sy); ctx.lineTo(gx+SPACING,sy); }
      for (let i = iMin; i <= iMax; i++)
        for (let j = jMin; j < jMax; j++) { const gx=ORIGIN+i*SPACING, sy=ORIGIN+j*SPACING-scrollY; ctx.moveTo(gx,sy); ctx.lineTo(gx,sy+SPACING); }
      ctx.stroke();

      // Pass 2: lightning — amber on black
      ctx.globalCompositeOperation = "source-over"; ctx.strokeStyle = "#c8860a";
      for (const bolt of bolts) {
        const fadeIn = Math.min(bolt.age/20, 1), fadeOut = Math.exp(-bolt.age/55), fade = fadeIn*fadeOut;
        if (fade < 0.012) continue;
        for (const seg of bolt.segs) {
          const a = Math.min(seg.bright*fade*0.75, 1), lw = BASE_LW + seg.bright*fade*1.6;
          if (a < 0.015) continue;
          ctx.globalAlpha = a; ctx.lineWidth = lw;
          ctx.beginPath(); ctx.moveTo(seg.x1,seg.y1); ctx.lineTo(seg.x2,seg.y2); ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = "source-over";

      // Pass 3: cursor glow
      if (cursorOn) {
        ctx.strokeStyle = "#c8860a";
        const ci = Math.round((bgMx-ORIGIN)/SPACING), cj = Math.round((bgMy-ORIGIN)/SPACING);
        const cspan = Math.ceil(CURSOR_R/SPACING)+1;
        for (let i = ci-cspan; i <= ci+cspan; i++) {
          for (let j = cj-cspan; j <= cj+cspan; j++) {
            const gx = ORIGIN+i*SPACING, gy = ORIGIN+j*SPACING-scrollY;
            const dhx = Math.hypot(gx+SPACING*0.5-bgMx, gy-bgMy);
            if (dhx < CURSOR_R) {
              const p=1-dhx/CURSOR_R, cf=p*p*(3-2*p);
              ctx.globalAlpha=cf*CURSOR_A; ctx.lineWidth=BASE_LW+cf*CURSOR_LW;
              ctx.beginPath(); ctx.moveTo(gx,gy); ctx.lineTo(gx+SPACING,gy); ctx.stroke();
            }
            const dvx = Math.hypot(gx-bgMx, gy+SPACING*0.5-bgMy);
            if (dvx < CURSOR_R) {
              const p=1-dvx/CURSOR_R, cf=p*p*(3-2*p);
              ctx.globalAlpha=cf*CURSOR_A; ctx.lineWidth=BASE_LW+cf*CURSOR_LW;
              ctx.beginPath(); ctx.moveTo(gx,gy); ctx.lineTo(gx,gy+SPACING); ctx.stroke();
            }
          }
        }
      }

      ctx.globalAlpha = 1;
      requestAnimationFrame(bgLoop);
    }
    bgLoop();
  })();

});
