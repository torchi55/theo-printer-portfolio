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

  function maxScroll() {
    return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }
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
    const full = fullPaperH();
    const ex   = extrudeScroll();
    const y    = window.scrollY;

    if (y <= ex) {
      const t = ex ? y / ex : 1;
      paper.style.height = (t * full) + "px";
      inner.style.transform = "translateY(0px)";
    } else {
      paper.style.height = full + "px";
      inner.style.transform = "translateY(" + -(y - ex) + "px)";
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
    /* Let Home navigate; block prototype links */
    if (btn.getAttribute("href") !== "./") {
      btn.addEventListener("click", (e) => e.preventDefault());
    }
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
});
