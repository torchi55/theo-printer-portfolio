/* ============================================================
   PIKE PAGE — printer scroll logic (no project grid)
   ============================================================ */

window.addEventListener("DOMContentLoaded", () => {
  const paper      = document.getElementById("paper");
  const inner      = paper.querySelector(".paper__inner");
  const spacer     = document.getElementById("spacer");
  const printer    = document.getElementById("printer");
  const printerImg = printer.querySelector(".printer__img");

  /* ---- print-bar ---- */
  const pbar    = document.getElementById("printbar");
  const pLabel  = document.getElementById("printbarLabel");
  const pPct    = document.getElementById("printbarPct");
  const pFill   = document.getElementById("printbarFill");
  const pLen    = document.getElementById("printbarLen");
  const hudStat = document.querySelector(".hud__status");
  const hudLeds = document.querySelectorAll(".hud__statusbar .led");

  /* ---- TEXT SCRAMBLE (nav hover) ---- */
  const SCRAMBLE_CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#!/\\@%&$*?<>=+-—:;.~^|";
  const STEP_MS = 75;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function scrambleTo(el, text) {
    if (!el) return;
    if (reduceMotion) { el.textContent = text; return; }
    const chars    = [...text];
    const nonSpace = chars.filter((c) => !/\s/.test(c)).length || 1;
    const steps    = Math.max(1, nonSpace - 1);
    const dur      = steps * STEP_MS;
    const t0       = performance.now();
    let last = -1;
    cancelAnimationFrame(el.__raf || 0);
    (function tick(now) {
      const p = Math.min(1, (now - t0) / dur);
      let f = Math.floor(p * steps);
      if (p === 1) f = steps + 1;
      if (f !== last) {
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

  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      const lbl = btn.querySelector(".nav-label");
      if (!lbl) return;
      lbl.__orig = lbl.textContent.trim();
      lbl.style.display = "inline-block";
      lbl.style.width = Math.ceil(lbl.getBoundingClientRect().width) + "px";
      lbl.style.textAlign = "center";
      lbl.style.whiteSpace = "nowrap";
      btn.addEventListener("mouseenter", () => scrambleTo(lbl, lbl.__orig));
    });
  });

  /* ============================================================
     PRINT (paper extrusion)
     The sheet feeds out of the slot as a 1.6 s animation and is
     never tied to the scroll position. Scrolling only ever moves
     the content, so scrolling back up never hits a dead zone and
     the sheet can never retract. A wheel tick before the auto-print
     fires just starts it early.
     ============================================================ */
  let printProgress = 0;      // 0 -> 1, how far the sheet is out
  let printStarted  = false;
  let printing      = false;
  let bootDone      = false;

  function markPrinted() {
    try { sessionStorage.setItem("printed", "1"); } catch (e) {}
  }
  function printPaper() {
    if (printStarted) return;
    printStarted = true;
    printing = true;
    if (typeof centerText !== "undefined" && centerText) centerText.style.opacity = "0";
    const DURATION_MS = 1600;
    const t0 = performance.now();
    (function step(t) {
      const p = Math.min(1, (t - t0) / DURATION_MS);
      printProgress = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
      update();
      if (p < 1) requestAnimationFrame(step);
      else { printing = false; printProgress = 1; markPrinted(); update(); }
    })(t0);
  }
  /* Came back from a project page: sheet is out from the first frame. */
  function printInstantly() {
    printStarted = true; printing = false; printProgress = 1;
    if (typeof centerText !== "undefined" && centerText) centerText.style.opacity = "0";
    update();
  }
  function startAutoScroll(delayMs) {
    bootDone = true;
    setTimeout(() => { if (!printStarted) printPaper(); }, delayMs || 0);
  }

  let idleTimer = null;
  let lastY = 0;

  /* Cached in layout() so scroll frames never force a layout read. */
  let paperLen    = 0;   // px, full sheet length
  let fullH       = 0;   // px, visible sheet height below the slot
  let scrollRange = 1;   // px, total scrollable distance

  /* px -> a believable receipt length. ~37.8px/cm. */
  function paperLenCm() {
    return Math.round(paperLen / 37.8);
  }

  function updatePrintbar() {
    const y   = window.scrollY;
    const fed = printProgress * fullH + y;
    const p   = Math.min(1, Math.max(0, fed / (fullH + scrollRange)));
    const pct = Math.round(p * 100);
    const tot = paperLenCm();

    pFill.style.width = pct + "%";
    pPct.textContent  = pct + "%";
    pLen.textContent  = Math.round(p * tot) + " / " + tot + " cm";

    const done   = pct >= 100;
    const moving = printing || y !== lastY;
    lastY = y;

    if (moving && !done) {
      pbar.classList.add("active");
      pLabel.textContent = "Printing";
      if (hudStat) hudStat.textContent = "PRINTING";
      hudLeds.forEach((l) => l.classList.add("on"));

      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        pbar.classList.remove("active");
        const finished = window.scrollY >= scrollRange - 1;
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

  /* Measure the REAL printer element so any CSS - including the
     mobile breakpoints - drives the slot/paper math automatically.
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
  const fullPaperH = () => Math.max(0, window.innerHeight - slotLinePx());

  /* ---- feed: clip = print progress, transform = scroll ---- */
  function update() {
    const y = window.scrollY;
    paper.style.height = fullH + "px";
    paper.style.clipPath = printProgress >= 1
      ? "none"
      : "inset(0 0 " + ((1 - printProgress) * fullH) + "px 0)";
    inner.style.transform = "translateY(" + -y + "px)";

    updatePrintbar();
  }

  function layout() {
    fullH    = fullPaperH();
    paperLen = inner.scrollHeight;
    // Total scroll length = room to scroll all the content up past the slot.
    const phase2 = Math.max(0, paperLen - fullH);
    spacer.style.height =
      Math.ceil(window.innerHeight + phase2 + window.innerHeight * 0.05) + "px";
    scrollRange = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    update();
  }

  let ticking = false;
  window.addEventListener("scroll", () => {
    // A wheel tick before the auto-print fires just prints now.
    if (bootDone && !printStarted && window.scrollY > 0) printPaper();
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; update(); });
  }, { passive: true });
  window.addEventListener("resize", layout);
  window.addEventListener("orientationchange", layout);
  /* Images expand the content height as they load - re-measure. */
  window.addEventListener("load", layout);
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(layout).observe(inner);
  }
  // The printer image controls the slot line; recompute once it loads.
  if (printerImg.complete) requestAnimationFrame(layout);
  else printerImg.addEventListener("load", layout);


  /* ---- Nav button press feedback ----
     Home button (href="./") navigates normally.
     About and Contact are placeholders — block for now. */
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("mousedown", () => btn.classList.add("pressed"));
    btn.addEventListener("mouseup",   () => setTimeout(() => btn.classList.remove("pressed"), 120));
    btn.addEventListener("mouseleave", () => btn.classList.remove("pressed"));
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        btn.classList.add("pressed");
        setTimeout(() => btn.classList.remove("pressed"), 150);
      }
    });
  });

  /* ---- CUSTOM CURSOR ---- */
  (function () {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const cur = document.getElementById("customCursor");
    if (!cur) return;
    const INTERACTIVE = "a, button, [data-src], [role='button']";
    document.body.classList.add("has-custom-cursor");
    let entered = false;
    document.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      cur.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
      if (!entered) { entered = true; cur.style.opacity = "1"; }
      const onPdf = !!e.target.closest(".pdf-pages");
      cur.classList.toggle("is-zooming", onPdf);
      cur.classList.toggle("is-hovering", !onPdf && !!e.target.closest(INTERACTIVE));
    });
    document.addEventListener("mousedown", () => cur.classList.add("is-clicking"));
    document.addEventListener("mouseup",   () => cur.classList.remove("is-clicking"));
    document.documentElement.addEventListener("mouseleave", () => {
      cur.style.opacity = "0";
      cur.classList.remove("is-hovering", "is-clicking");
      entered = false;
    });
    document.documentElement.addEventListener("mouseenter", () => { entered = false; });

    /* ---- IDLE SCROLL HINT ----
       Quiet: shows once, after 3 s of total stillness, and only until
       the visitor scrolls for the first time. Never flips while
       scrolling - the arrow stays an arrow. ---- */
    const hintLabel = cur.querySelector(".c-scroll-label");
    if (hintLabel) {
      const IDLE_MS = 3000;
      let idleTimer = 0, retired = false;
      const canScrollDown = () =>
        window.scrollY + window.innerHeight <
        document.documentElement.scrollHeight - 60;
      const showHint = () => {
        if (!retired && entered && canScrollDown()) cur.classList.add("is-idle");
      };
      const wake = (e) => {
        clearTimeout(idleTimer);
        cur.classList.remove("is-idle");
        if (e && (e.type === "wheel" || e.type === "scroll") && window.scrollY > 0) {
          retired = true;            // they found the scroll - never nag again
          return;
        }
        if (!retired) idleTimer = setTimeout(showHint, IDLE_MS);
      };
      ["pointermove", "wheel", "scroll", "mousedown", "keydown"]
        .forEach(ev => window.addEventListener(ev, wake, { passive: true }));
      document.documentElement.addEventListener("mouseleave",
        () => { clearTimeout(idleTimer); cur.classList.remove("is-idle"); });
      wake();
    }
  })();

  layout();

  /* Boot only runs on the home page (index.html). All other pages skip it. */
  const _bootOverlay = document.getElementById("screenBoot");
  if (_bootOverlay) _bootOverlay.style.display = "none";
  startAutoScroll(300);

  /* ============================================================
     GRID / LIGHTNING CANVAS BACKGROUND — identical to index.html
     ============================================================ */
  (function () {
    const canvas = document.getElementById("dotCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let W = 0, H = 0;
    let lastPaintY = -1, lastPaintMx = -1, lastPaintMy = -1;
    function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; lastPaintY = -1; }
    resize();
    window.addEventListener("resize", resize);

    const SPACING = 18, ORIGIN = 9, BASE_LW = 0.35, BASE_A = 0.09;
    const CURSOR_R = 100, CURSOR_LW = 0.7, CURSOR_A = 0.22;

    /* Phones: draw the grid once and stop — no bolts, no cursor glow, no
       rAF loop. The animated effects are invisible behind the paper on a
       phone and the constant full-canvas redraw makes scrolling choppy. */
    if (window.matchMedia("(pointer: coarse)").matches) {
      const drawStatic = () => {
        ctx.clearRect(0, 0, W, H);
        ctx.strokeStyle = "#c8860a"; ctx.lineWidth = BASE_LW; ctx.globalAlpha = BASE_A;
        ctx.beginPath();
        for (let x = ORIGIN; x < W; x += SPACING) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
        for (let y = ORIGIN; y < H; y += SPACING) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
        ctx.stroke(); ctx.globalAlpha = 1;
      };
      drawStatic();
      window.addEventListener("resize", drawStatic);
      return;
    }

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
    document.addEventListener("click", e => {
      const sx = ORIGIN + Math.round((e.clientX-ORIGIN)/SPACING) * SPACING;
      const sy = ORIGIN + Math.round((e.clientY-ORIGIN)/SPACING) * SPACING;
      spawnBolt(sx, sy, 6 + Math.floor(Math.random()*4), 170, 130);
    });

    let gridCache = null;
    let bgFrame = 0, nextAmbient = 180;
    const MAX_AMBIENT = 2;

    function bgLoop() {
      bgFrame++;
      if (bgFrame >= nextAmbient && bolts.length < MAX_AMBIENT + 2) {
        spawnAmbient();
        nextAmbient = bgFrame + 140 + Math.floor(Math.random()*200);
      }
      /* idle skip — only repaint when a bolt is live or scroll/cursor moved */
      if (!bolts.length && window.scrollY === lastPaintY && bgMx === lastPaintMx && bgMy === lastPaintMy) {
        requestAnimationFrame(bgLoop);
        return;
      }
      lastPaintY = window.scrollY; lastPaintMx = bgMx; lastPaintMy = bgMy;
      if (!W || !H) { requestAnimationFrame(bgLoop); return; }
      ctx.clearRect(0, 0, W, H);
      for (let i = bolts.length-1; i >= 0; i--)
        if (++bolts[i].age >= bolts[i].life) bolts.splice(i, 1);
      const scrollY = window.scrollY;
      const cursorOn = bgMx > -100 && bgMx < W + 100;
      // Base grid: periodic, so stroke it ONCE into an offscreen canvas one
      // period taller than the screen and blit with a scroll offset - one
      // drawImage per frame instead of ~16k line segments (wheel stutter).
      if (!gridCache || gridCache.width !== W || gridCache.height !== H + SPACING) {
        gridCache = document.createElement("canvas");
        gridCache.width = W; gridCache.height = H + SPACING;
        const g = gridCache.getContext("2d");
        g.strokeStyle = "#c8860a"; g.lineWidth = BASE_LW; g.globalAlpha = BASE_A; g.beginPath();
        for (let x = ORIGIN; x < W + SPACING; x += SPACING) { g.moveTo(x, 0); g.lineTo(x, H + SPACING); }
        for (let y = ORIGIN; y < H + SPACING * 2; y += SPACING) { g.moveTo(0, y); g.lineTo(W, y); }
        g.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.drawImage(gridCache, 0, -(((scrollY % SPACING) + SPACING) % SPACING));

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
