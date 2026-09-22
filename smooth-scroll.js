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
  const OVERLAYS = "#lightbox, #pz, .vl, [data-lenis-prevent]";
  const overlayOpen = () =>
    document.body.style.overflow === "hidden" ||
    !!document.querySelector("#lightbox.open, #pz.is-open");

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
