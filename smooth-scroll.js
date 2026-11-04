/* ============================================================
   SMOOTH SCROLL — Lenis (MIT, darkroomengineering/lenis)
   Vendored at assets/vendor/lenis-1.3.26.min.js.

   Lenis drives the real window scroll, so every page script that
   reads window.scrollY (paper extrusion, printbar, grid canvas,
   scroll hint) keeps working untouched — it just receives smoothed
   values. Mouse wheel only: touch stays native (iOS feel, pinch
   viewer). Skipped entirely for prefers-reduced-motion.
   Opt out on a page: <body data-no-smooth>.
   ============================================================ */
/* ------------------------------------------------------------
   OVERLAY WHEEL GUARD — runs on every page that loads this file,
   with or without Lenis (helioform-station loads it for this alone).

   Bug it fixes: with a lightbox open, the mouse wheel scrolled the
   PAGE behind it. `body{overflow:hidden}` can't stop that here,
   because style.css sets `html{overflow-x:hidden}`, so body overflow
   is never propagated to the viewport; and Lenis deliberately hands
   wheel events back to the browser while an overlay is open. Closing
   the lightbox then dropped you somewhere else on the page.

   Rule: while an overlay is open, a wheel tick may only scroll a
   scrollable box INSIDE that overlay that can still move in that
   direction (e.g. the Triangulated board viewer at 1x). Otherwise it
   is cancelled. Ctrl/pinch-wheel is left alone (browser zoom stays
   available); overlays that zoom on pinch handle it themselves.
   ------------------------------------------------------------ */
(function () {
  const OPEN = "#lightbox.open, #pz.is-open, #tecFullscreen.open";
  const LINE = 16;
  function canScroll(el, stop, dx, dy) {
    for (; el && el.nodeType === 1; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (dy && /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        if (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
        if (dy < 0 && el.scrollTop > 0) return true;
      }
      if (dx && /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) {
        if (dx > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
        if (dx < 0 && el.scrollLeft > 0) return true;
      }
      if (el === stop) break;
    }
    return false;
  }
  window.addEventListener("wheel", (e) => {
    if (e.ctrlKey) return;
    const ov = document.querySelector(OPEN);
    if (!ov) return;
    const k = e.deltaMode === 1 ? LINE : 1;
    if (!ov.contains(e.target) || !canScroll(e.target, ov, e.deltaX * k, e.deltaY * k)) e.preventDefault();
  }, { passive: false, capture: true });
})();

/* ------------------------------------------------------------
   KEYBOARD FOCUS FIX for the printer pages.
   The sheet (#paper) is position:fixed with overflow:hidden and is
   "scrolled" by a transform driven from window.scrollY. When Tab moves
   focus to a link further down, the browser scrolls #paper ITSELF
   (scrollTop up to ~8,700px measured) and leaves window.scrollY at 0:
   the printbar, reveals and scroll hint desync, and the next wheel
   double-offsets the sheet so the top can't be reached again.
   Fix: #paper is never allowed to scroll, and a focused element is
   brought into view by scrolling the WINDOW, which the engine follows.
   ------------------------------------------------------------ */
(function () {
  const paper = document.getElementById("paper");
  const inner = paper && paper.firstElementChild;
  if (!paper || !inner) return;
  /* Only for sheets that are clipped (overflow:hidden) and moved by the
     window scroll. Where the sheet is a real scroller (about.html on phones
     is overflow:auto) the browser's own focus scrolling is already right. */
  const clipped = () => /hidden|clip/.test(getComputedStyle(paper).overflowY);
  const scrollTo = (y) => {
    y = Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight));
    if (window.__lenis) window.__lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo({ top: y, behavior: "instant" });
  };
  /* A clipped sheet must never scroll itself. Whatever scrolled it (Tab focus,
     find-in-page, scrollIntoView) is turned into the same window scroll, which
     the page engine then follows, so the target stays where the browser put it. */
  let focusAt = -1e9;   // focus-driven scrolls are handled by reveal() below
  paper.addEventListener("scroll", () => {
    if (!clipped()) return;
    const dy = paper.scrollTop;
    paper.scrollTop = 0; paper.scrollLeft = 0;
    if (dy && performance.now() - focusAt > 300) scrollTo(window.scrollY + dy);
  }, { passive: true });
  /* Bring a focused element into the visible part of the sheet. Works from
     on-screen geometry only (the sheet moves 1px up per 1px of window
     scroll), so it doesn't need to know which page engine drives it. */
  function reveal(el) {
    paper.scrollTop = 0;
    const pr = paper.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    const top = Math.max(pr.top, 0) + 16, bottom = Math.min(pr.bottom, innerHeight) - 16;
    if (r.top >= top && r.bottom <= bottom) return;            // already visible
    const target = top + Math.max(0, (bottom - top - r.height) / 2);
    scrollTo(window.scrollY + (r.top - target));
  }
  paper.addEventListener("focusin", (e) => {
    if (!clipped()) return;
    focusAt = performance.now();
    const el = e.target;
    /* after the browser's own scroll-into-view, and after the engine's rAF */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (document.activeElement === el) reveal(el);
    }));
  });
})();

(function () {
  if (typeof Lenis === "undefined") return;
  if (document.body.hasAttribute("data-no-smooth")) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const css = document.createElement("style");
  css.textContent =
    "html.lenis,html.lenis body{height:auto}" +
    ".lenis.lenis-stopped{overflow:clip}" +
    ".lenis [data-lenis-prevent]{overscroll-behavior:contain}" +
    ".lenis.lenis-smooth iframe{pointer-events:none}";
  document.head.appendChild(css);

  /* Overlays that own the wheel (lightbox, pinch viewer, visit log). */
  const OVERLAYS = "#lightbox, #pz, #tecFullscreen, .vl, [data-lenis-prevent]";
  const overlayOpen = () =>
    document.body.style.overflow === "hidden" ||
    !!document.querySelector("#lightbox.open, #pz.is-open, #tecFullscreen.open");

  const lenis = new Lenis({
    lerp: 0.12,              // snappier than the 0.1 default — a printer, not a glide
    wheelMultiplier: 1,
    smoothWheel: true,
    syncTouch: false,
    autoRaf: true,
    prevent: (node) => !!(node.closest && node.closest(OVERLAYS)),
    virtualScroll: () => !overlayOpen(),
  });
  window.__lenis = lenis;
})();
