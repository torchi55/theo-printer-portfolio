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

  let idleTimer = null;
  let lastY = 0;
  let maxScrollY = 0;

  /* ---- AUTO-SCROLL ---- */
  let isAutoScrolling = false;
  let autoScrollY     = 0;
  let autoStartT      = null;
  let autoExpectedY   = -999;

  function startAutoScroll(delayMs) {
    setTimeout(() => {
      if (window.scrollY > 50) return;
      isAutoScrolling = true;
      autoScrollY     = 0;
      autoStartT      = null;

      (function step(t) {
        if (!isAutoScrolling) return;
        if (!autoStartT) autoStartT = t;
        const DURATION_MS = 2400;
        const p     = Math.min(1, (t - autoStartT) / DURATION_MS);
        const eased = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
        maxScrollY    = extrudeScroll() * eased;
        autoScrollY   = maxScrollY;
        autoExpectedY = Math.round(autoScrollY);
        update();
        if (p < 1) requestAnimationFrame(step);
        else {
          isAutoScrolling = false;
          window.scrollTo(0, extrudeScroll());
        }
      })(performance.now());
    }, delayMs || 0);
  }

  function maxScroll() {
    return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }
  function paperLenCm() {
    return Math.round(inner.scrollHeight / 37.8);
  }
  function updatePrintbar() {
    const p   = Math.min(1, Math.max(0, Math.max(window.scrollY, maxScrollY) / maxScroll()));
    const pct = Math.round(p * 100);
    const tot = paperLenCm();

    pFill.style.width = pct + "%";
    pPct.textContent  = pct + "%";
    pLen.textContent  = Math.round(p * tot) + " / " + tot + " cm";

    const done   = pct >= 100;
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
  const getPrinterTop = () => parseFloat(cssVar("--printer-top")) || -10;
  const getExtrudeVH  = () => parseFloat(cssVar("--extrude-scroll")) || 1;

  function printerMetrics() {
    const r = printer.getBoundingClientRect();
    const h = r.height || r.width / getAspect();
    const top = r.height ? r.top : getPrinterTop();
    return { top, h };
  }
  function slotLinePx() {
    const m = printerMetrics();
    return m.top + m.h * getSlotY();
  }
  const fullPaperH    = () => Math.max(0, window.innerHeight - slotLinePx());
  const extrudeScroll = () => window.innerHeight * getExtrudeVH();

  function update() {
    maxScrollY = Math.max(maxScrollY, window.scrollY);
    const full = fullPaperH();
    const ex   = extrudeScroll();
    const y    = window.scrollY;

    if (maxScrollY <= ex) {
      const t = ex ? maxScrollY / ex : 1;
      paper.style.height = (t * full) + "px";
      inner.style.transform = "translateY(0px)";
    } else {
      paper.style.height = full + "px";
      inner.style.transform = "translateY(" + -Math.max(0, y - ex) + "px)";
    }

    updatePrintbar();
  }

  function layout() {
    /* Re-measure inner.scrollHeight every call — images may have loaded
       since the last measurement, making the content taller. */
    const phase2 = Math.max(0, inner.scrollHeight - fullPaperH());
    spacer.style.height =
      Math.ceil(window.innerHeight + extrudeScroll() + phase2 + window.innerHeight * 0.05) + "px";
    update();
  }

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (isAutoScrolling && Math.abs(window.scrollY - autoExpectedY) <= 2) return;
    isAutoScrolling = false;
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; update(); });
  }, { passive: true });
  window.addEventListener("resize", layout);
  window.addEventListener("orientationchange", layout);

  /* Re-run layout after all images load — images expand the content height */
  window.addEventListener("load", layout);

  /* Watch for any content-height changes (lazy images, fonts, etc.) */
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(layout).observe(inner);
  }

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
    const INTERACTIVE = "a, button, [role='button']";
    document.body.classList.add("has-custom-cursor");
    let entered = false;
    document.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      cur.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
      if (!entered) { entered = true; cur.style.opacity = "1"; }
      cur.classList.toggle("is-hovering", !!e.target.closest(INTERACTIVE));
    });
    document.addEventListener("mousedown", () => cur.classList.add("is-clicking"));
    document.addEventListener("mouseup",   () => cur.classList.remove("is-clicking"));
    document.documentElement.addEventListener("mouseleave", () => {
      cur.style.opacity = "0";
      cur.classList.remove("is-hovering", "is-clicking");
      entered = false;
    });
    document.documentElement.addEventListener("mouseenter", () => { entered = false; });
  })();

  layout();

  /* ---- BOOT SEQUENCE (mirrors index.html) ---- */
  (function initBoot() {
    const already     = sessionStorage.getItem("booted");
    const bootOverlay = document.getElementById("screenBoot");
    const glassScreen = document.querySelector(".screen");

    if (already) {
      if (bootOverlay) bootOverlay.style.display = "none";
      startAutoScroll(300);
      return;
    }

    document.body.classList.add("loading");

    const fillEl  = document.getElementById("screenBootFill");
    const pctEl   = document.getElementById("screenBootPct");
    const labelEl = document.getElementById("screenBootLabel");

    if (!bootOverlay || !fillEl) {
      document.body.classList.remove("loading");
      startAutoScroll(300);
      return;
    }

    const DURATION  = 3000;
    const BLOCK_N   = 10;
    const startTime = performance.now();

    (function animateFill(now) {
      const p     = Math.min(1, (now - startTime) / DURATION);
      const eased = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
      const pct   = Math.round(eased * 100);
      const litN  = Math.floor(eased * BLOCK_N);
      if (fillEl) {
        const spans = fillEl.children;
        for (let i = 0; i < spans.length; i++) spans[i].classList.toggle("lit", i < litN);
      }
      if (pctEl) pctEl.textContent = pct + "%";
      if (p < 1) { requestAnimationFrame(animateFill); }
      else { if (labelEl) labelEl.textContent = "READY"; setTimeout(doFlicker, 300); }
    })(startTime);

    function doFlicker() {
      const seq = [0.05, 1, 0, 0.8, 0.1, 0.6, 0, 1];
      let i = 0;
      const flicker = setInterval(() => {
        if (glassScreen) glassScreen.style.opacity = seq[i];
        i++;
        if (i >= seq.length) {
          clearInterval(flicker);
          if (glassScreen) glassScreen.style.opacity = "";
          revealMain();
        }
      }, 65);
    }

    function revealMain() {
      if (bootOverlay) bootOverlay.style.display = "none";
      document.body.classList.remove("loading");
      sessionStorage.setItem("booted", "1");
      startAutoScroll(700);
    }
  })();

  /* ============================================================
     GRID / LIGHTNING CANVAS BACKGROUND — identical to index.html
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
    document.addEventListener("click", e => {
      const sx = ORIGIN + Math.round((e.clientX-ORIGIN)/SPACING) * SPACING;
      const sy = ORIGIN + Math.round((e.clientY-ORIGIN)/SPACING) * SPACING;
      spawnBolt(sx, sy, 6 + Math.floor(Math.random()*4), 170, 130);
    });

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

      ctx.strokeStyle = "#c8860a"; ctx.lineWidth = BASE_LW; ctx.globalAlpha = BASE_A; ctx.beginPath();
      for (let i = iMin; i < iMax; i++)
        for (let j = jMin; j <= jMax; j++) { const gx=ORIGIN+i*SPACING, sy=ORIGIN+j*SPACING-scrollY; ctx.moveTo(gx,sy); ctx.lineTo(gx+SPACING,sy); }
      for (let i = iMin; i <= iMax; i++)
        for (let j = jMin; j < jMax; j++) { const gx=ORIGIN+i*SPACING, sy=ORIGIN+j*SPACING-scrollY; ctx.moveTo(gx,sy); ctx.lineTo(gx,sy+SPACING); }
      ctx.stroke();

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
