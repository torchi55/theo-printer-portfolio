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
