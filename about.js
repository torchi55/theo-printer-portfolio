window.addEventListener("DOMContentLoaded", () => {

  /* ============================================================
     SCRAMBLE
     ============================================================ */
  const SCRAMBLE_CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#!/\\@%&$*?<>=+-—:;.~^|";
  const STEP_MS   = 40;
  const STAGGER   = 140;
  const noMotion  = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function scrambleTo(el, text) {
    if (!el) return;
    if (noMotion) { el.textContent = text; return; }
    const chars    = [...text];
    const nonSpace = chars.filter(c => !/\s/.test(c)).length || 1;
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

  function cascadeScramble() {
    if (noMotion) return;
    const targets = [...document.querySelectorAll("[data-orig]")];
    targets.forEach(el => {
      const tag = el.tagName;
      if (tag === "SPAN" || tag === "A") {
        const w = Math.ceil(el.getBoundingClientRect().width);
        if (w > 0) {
          el.style.display    = "inline-block";
          el.style.whiteSpace = "nowrap";
          el.style.width      = w + "px";
        }
      }
    });
    targets.forEach(el => {
      const text = el.dataset.orig;
      el.textContent = [...text]
        .map(c => /\s/.test(c) ? c : SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0])
        .join("");
    });
    targets.forEach((el, i) => {
      setTimeout(() => scrambleTo(el, el.dataset.orig), i * STAGGER);
    });
    const hoverEls = document.querySelectorAll('.ab-h1[data-orig]');
    hoverEls.forEach(el => {
      el.addEventListener("mouseenter", () => scrambleTo(el, el.dataset.orig));
    });
  }

  function scheduleCascade(delayMs) {
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
      setTimeout(cascadeScramble, delayMs || 600);
    });
  }

  /* ============================================================
     PAPER / SLOT MECHANICS
     ============================================================ */
  const paper      = document.getElementById("paper");
  const inner      = paper.querySelector(".paper__inner");
  const spacer     = document.getElementById("spacer");
  const printer    = document.getElementById("printer");
  const printerImg = printer.querySelector(".printer__img");

  const printbar = document.getElementById("printbar");
  const pLabel   = document.getElementById("printbarLabel");
  const pPct     = document.getElementById("printbarPct");
  const pFill    = document.getElementById("printbarFill");
  const pLen     = document.getElementById("printbarLen");
  const hudStat  = document.querySelector(".hud__status");
  const hudLeds  = document.querySelectorAll(".hud__statusbar .led");

  const cssVar        = n => getComputedStyle(document.body).getPropertyValue(n).trim();
  const getSlotY      = () => parseFloat(cssVar("--slot-y"))        || 0.5884;
  const getAspect     = () => parseFloat(cssVar("--printer-aspect")) || 5.397;
  const getPrinterTop = () => parseFloat(cssVar("--printer-top"))    || -10;

  function printerMetrics() {
    const r = printer.getBoundingClientRect();
    const h = r.height || r.width / getAspect();
    return { top: r.height ? r.top : getPrinterTop(), h };
  }
  const slotLinePx = () => { const m = printerMetrics(); return m.top + m.h * getSlotY(); };
  const fullPaperH = () => Math.max(0, window.innerHeight - slotLinePx());
  const paperLenCm = () => Math.round(inner.scrollHeight / 37.8);

  let animDone = false;
  let idleTimer = null;

  function layout() {
    if (animDone) paper.style.height = fullPaperH() + "px";
    spacer.style.height = "0px";
  }

  /* ---- animate paper out of the slot on load ---- */
  function animatePaper(delayMs) {
    setTimeout(() => {
      const DURATION_MS = 2400;
      const t0 = performance.now();
      printbar.classList.add("active");
      pLabel.textContent = "Printing";
      if (hudStat) hudStat.textContent = "PRINTING";
      hudLeds.forEach(l => l.classList.add("on"));

      (function step(now) {
        const p     = Math.min(1, (now - t0) / DURATION_MS);
        const eased = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;

        const full = fullPaperH();
        paper.style.height = (eased * full) + "px";

        const pct = Math.round(eased * 100);
        const tot = paperLenCm();
        pFill.style.width = pct + "%";
        pPct.textContent  = pct + "%";
        pLen.textContent  = Math.round(eased * tot) + " / " + tot + " cm";

        if (p < 1) {
          requestAnimationFrame(step);
        } else {
          animDone = true;
          paper.style.height = full + "px";
          printbar.classList.remove("active");
          pLabel.textContent = "Ready";
          if (hudStat) hudStat.textContent = "STANDBY";
          hudLeds.forEach(l => l.classList.remove("on"));
          pFill.style.width = "0%";
          pPct.textContent  = "0%";
          pLen.textContent  = "0 / " + tot + " cm";
          /* Switch paper to hidden-scrollbar scroll container */
          paper.classList.add("scrollable");
          /* Update printbar as user scrolls the paper */
          paper.addEventListener("scroll", onPaperScroll, { passive: true });
        }
      })(t0);
    }, delayMs || 0);
  }

  function onPaperScroll() {
    const maxScroll = paper.scrollHeight - paper.clientHeight;
    if (maxScroll <= 0) return;
    const pct = Math.round((paper.scrollTop / maxScroll) * 100);
    const tot = paperLenCm();
    pFill.style.width = pct + "%";
    pPct.textContent  = pct + "%";
    pLen.textContent  = Math.round((paper.scrollTop / maxScroll) * tot) + " / " + tot + " cm";

    const done = pct >= 100;
    if (!done) {
      printbar.classList.add("active");
      pLabel.textContent = "Printing";
      if (hudStat) hudStat.textContent = "PRINTING";
      hudLeds.forEach(l => l.classList.add("on"));
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        printbar.classList.remove("active");
        pLabel.textContent = paper.scrollTop <= 0 ? "Ready" : "Printing";
        if (hudStat) hudStat.textContent = paper.scrollTop <= 0 ? "STANDBY" : "PRINTING";
        hudLeds.forEach(l => l.classList.remove("on"));
      }, 360);
    } else {
      printbar.classList.remove("active");
      pLabel.textContent = "Complete";
      if (hudStat) hudStat.textContent = "COMPLETE";
      hudLeds.forEach(l => l.classList.remove("on"));
    }
  }

  /* Boot only runs on the home page (index.html). All other pages skip it. */
  const _bootOverlay = document.getElementById("screenBoot");
  if (_bootOverlay) _bootOverlay.style.display = "none";
  animatePaper(300);
  scheduleCascade(650);

  /* ---- event wiring ---- */
  window.addEventListener("resize", layout);
  window.addEventListener("orientationchange", layout);

  if (printerImg.complete) requestAnimationFrame(layout);
  else printerImg.addEventListener("load", layout);

  /* ============================================================
     NAV SCRAMBLE + PRESS FEEDBACK
     ============================================================ */
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    document.querySelectorAll(".nav-btn").forEach(btn => {
      const lbl = btn.querySelector(".nav-label");
      if (!lbl) return;
      lbl.__orig = lbl.textContent.trim();
      lbl.style.display    = "inline-block";
      lbl.style.width      = Math.ceil(lbl.getBoundingClientRect().width) + "px";
      lbl.style.textAlign  = "center";
      lbl.style.whiteSpace = "nowrap";
      btn.addEventListener("mouseenter", () => scrambleTo(lbl, lbl.__orig));
    });
  });

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("mousedown",  () => btn.classList.add("pressed"));
    btn.addEventListener("mouseup",    () => setTimeout(() => btn.classList.remove("pressed"), 120));
    btn.addEventListener("mouseleave", () => btn.classList.remove("pressed"));
    btn.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        btn.classList.add("pressed");
        setTimeout(() => btn.classList.remove("pressed"), 150);
      }
    });
  });

  /* ============================================================
     CUSTOM CURSOR
     ============================================================ */
  (function () {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const cur = document.getElementById("customCursor");
    if (!cur) return;
    const INTERACTIVE = "a, button, .nav-btn, [role='button']";
    document.body.classList.add("has-custom-cursor");
    let entered = false;
    document.addEventListener("pointermove", e => {
      if (e.pointerType !== "mouse") return;
      cur.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
      if (!entered) { entered = true; cur.style.opacity = "1"; }
      cur.classList.toggle("is-hovering", !!e.target.closest(INTERACTIVE));
    });
    document.addEventListener("mousedown",  () => cur.classList.add("is-clicking"));
    document.addEventListener("mouseup",    () => cur.classList.remove("is-clicking"));
    document.documentElement.addEventListener("mouseleave", () => {
      cur.style.opacity = "0";
      cur.classList.remove("is-hovering", "is-clicking");
      entered = false;
    });
    document.documentElement.addEventListener("mouseenter", () => { entered = false; });
  })();

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

    const DIRS  = [
      { dx: SPACING, dy: 0 }, { dx: -SPACING, dy: 0 },
      { dx: 0, dy: SPACING }, { dx: 0, dy: -SPACING }
    ];
    const PERPS = [[2,3],[2,3],[0,1],[0,1]];

    function generatePath(sx, sy, dirIdx, maxSteps, brightness) {
      const segs = []; let x = sx, y = sy, dir = dirIdx, bright = brightness;
      for (let s = 0; s < maxSteps && bright > 0.04 && segs.length < 600; s++) {
        const { dx, dy } = DIRS[dir]; const nx = x + dx, ny = y + dy;
        if (nx < -SPACING*8 || nx > W+SPACING*8 || ny < -SPACING*8 || ny > H+SPACING*8) break;
        segs.push({ x1: x, y1: y, x2: nx, y2: ny, bright });
        const r = Math.random();
        if (r < 0.12 && maxSteps - s > 12)
          segs.push(...generatePath(nx, ny, PERPS[dir][Math.random() < 0.5 ? 0 : 1],
            Math.floor((maxSteps-s)*(0.4+Math.random()*0.3)), bright*0.55));
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
      const sx = ORIGIN + Math.round((e.clientX-ORIGIN)/SPACING)*SPACING;
      const sy = ORIGIN + Math.round((e.clientY-ORIGIN)/SPACING)*SPACING;
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

      const scrollY  = window.scrollY;
      const cursorOn = bgMx > -100 && bgMx < W + 100;
      const iMin = Math.floor(-ORIGIN/SPACING)-1, iMax = Math.ceil((W-ORIGIN)/SPACING)+1;
      const jMin = Math.floor((scrollY-ORIGIN)/SPACING)-1, jMax = Math.ceil((scrollY+H-ORIGIN)/SPACING)+1;

      ctx.strokeStyle = "#c8860a"; ctx.lineWidth = BASE_LW; ctx.globalAlpha = BASE_A; ctx.beginPath();
      for (let i = iMin; i < iMax; i++)
        for (let j = jMin; j <= jMax; j++) {
          const gx = ORIGIN+i*SPACING, sy = ORIGIN+j*SPACING-scrollY;
          ctx.moveTo(gx,sy); ctx.lineTo(gx+SPACING,sy);
        }
      for (let i = iMin; i <= iMax; i++)
        for (let j = jMin; j < jMax; j++) {
          const gx = ORIGIN+i*SPACING, sy = ORIGIN+j*SPACING-scrollY;
          ctx.moveTo(gx,sy); ctx.lineTo(gx,sy+SPACING);
        }
      ctx.stroke();

      ctx.globalCompositeOperation = "source-over"; ctx.strokeStyle = "#c8860a";
      for (const bolt of bolts) {
        const fadeIn = Math.min(bolt.age/20,1), fadeOut = Math.exp(-bolt.age/55), fade = fadeIn*fadeOut;
        if (fade < 0.012) continue;
        for (const seg of bolt.segs) {
          const a = Math.min(seg.bright*fade*0.75,1), lw = BASE_LW + seg.bright*fade*1.6;
          if (a < 0.015) continue;
          ctx.globalAlpha = a; ctx.lineWidth = lw;
          ctx.beginPath(); ctx.moveTo(seg.x1,seg.y1); ctx.lineTo(seg.x2,seg.y2); ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = "source-over";

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

  layout();

});
