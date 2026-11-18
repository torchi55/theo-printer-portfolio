/* ============================================================
   NEXT PROJECT — the roll keeps printing.
   After a project's last line comes a perforation and the header of
   the next receipt (title, course/place, year, first image). Scrolling
   on feeds that header up to the printer slot; when the tear line
   reaches the slot the browser goes to that project.

   · The next project is read from the page's own footer link
     (.next-strip a.ns-next, else the last link in .next-strip /
     .proj-footer), so the
     order lives in the markup. NEXT below only describes each target.
   · The stub is a real <a>: click / tap / Enter always works, and the
     footer link above it is untouched.
   · Progress is pure geometry (tear line vs. slot), so it does not care
     which engine moves the sheet (pike-script.js, Farm's inline engine,
     Helioform's native flow) or whether Lenis is smoothing the wheel.
   · Never navigates on a jump (End key, scrollbar, focus, restored
     scroll): the feed has to be scrolled through, or pushed once more.
   · prefers-reduced-motion: a plain link card, no feed, no auto-advance.
   Load with `defer`, after the page engine. CSS: next-project.css.
   ============================================================ */
(function () {
  'use strict';

  /* target path (clean URL) -> what its receipt header prints.
     img: an image the target page already uses (w/h = its pixel size, for the
     aspect box). pos/bg are optional: object-position and ground colour. */
  var NEXT = {
    '/the-red-climb':         { title: 'The Red Climb',         meta: 'ARCH 302A · Los Angeles · 2026',            img: '/p2-low-rise/images/p2-circulation-exploded-axon.webp', w: 1600, h: 2422 },
    '/haldane-house':         { title: 'Haldane House',         meta: 'Lot 32 · Oak Valley · Talent, Oregon · 2026', img: '/haldane/images/haldane-plan-level-1.webp',            w: 1970, h: 1950 },
    '/115-almond':            { title: '115 Almond',            meta: 'Ashland, Oregon · Arkitek · 2026',          img: '/almond/images/almond-exterior-approach-v1.webp',       w: 1536, h: 1024 },
    '/helioform-station':     { title: 'Helioform Station',     meta: 'Weather Station · Page, Arizona · 2026',    img: '/helioform-station/rotation/Frame_00049.webp',          w: 3330, h: 2440, pos: '50% 50%', bg: '#000' },
    '/forged-fungus':         { title: 'Forged Fungus',         meta: 'Arkitek IDP · Kharkiv, Ukraine · 2023',     img: '/forged-fungus/assets/presentation-board.webp',         w: 2500, h: 1667 },
    '/farm-to-brick':         { title: 'Farm to Brick',         meta: 'Studio 105B · Spring 2025',                 img: '/farm-to-brick/rotation-frames/frame_000.webp',         w: 1920, h: 1406, pos: '50% 50%', bg: '#000' },
    '/pike':                  { title: 'Pike Courtyard',        meta: 'Pi Kappa Alpha · USC · Summer 2025 · As-Built', img: '/pike-courtyard/drawings/pike-lineweights-full.webp', w: 2182, h: 1449 },
    '/triangulated-tectonic': { title: 'Triangulated Tectonic', meta: 'ARCH 202A · Altadena, CA · Fall 2025',      img: '/assets/triangulated-tectonic-board.webp',              w: 1600, h: 2337 }
  };

  var norm = function (p) {
    return p.replace(/\/index\.html$/, '').replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  };

  var strip = document.querySelector('.next-strip, .proj-footer');   /* .proj-footer = Forged Fungus */
  if (!strip) return;
  var links = strip.querySelectorAll('a[href]');
  var link = strip.querySelector('a.ns-next') || links[links.length - 1];
  if (!link) return;
  var target = new URL(link.getAttribute('href'), location.href);
  var key = norm(target.pathname);
  var next = NEXT[key];
  if (!next || key === norm(location.pathname)) return;
  var href = key;                                   /* same-origin clean URL, also on previews/localhost */

  var paper  = document.getElementById('paper');    /* printer pages: the clipped sheet */
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var here   = (document.querySelector('h1') || {}).textContent || document.title;
  here = here.replace(/\s+/g, ' ').trim();

  /* ---- stub ------------------------------------------------ */
  var stub = document.createElement('a');
  stub.className = 'np' + (reduce ? ' np--static' : '');
  stub.href = href;
  stub.setAttribute('aria-label', 'Next project: ' + next.title);
  stub.innerHTML =
    '<span class="np__tear" aria-hidden="true"><span>End of receipt</span><span>Tear here</span></span>' +
    '<span class="np__head"><span class="np__kicker">Next receipt</span><span class="np__feedpct" aria-hidden="true"></span></span>' +
    '<span class="np__title"></span>' +
    '<span class="np__meta"></span>' +
    '<span class="np__imgwrap"><img class="np__img" alt="" decoding="async" loading="lazy"></span>' +
    '<span class="np__feed" aria-hidden="true"><span class="np__track"><i class="np__fill"></i></span><span class="np__hint">Keep scrolling to print</span></span>';
  stub.querySelector('.np__title').textContent = next.title;
  stub.querySelector('.np__meta').textContent  = next.meta;
  var img = stub.querySelector('.np__img');
  img.width = next.w; img.height = next.h; img.src = next.img;
  if (next.pos) img.style.objectPosition = next.pos;          /* default: top of the image (next-project.css) */
  if (next.bg)  img.parentNode.style.background = next.bg;   /* ground behind a frame that is still loading */
  var inner = paper && paper.querySelector('.paper__inner');
  if (inner) inner.appendChild(stub);               /* printer pages: last thing on the roll, full sheet width */
  else strip.parentNode.insertBefore(stub, strip.nextSibling);   /* Helioform: end of #flow */
  if (reduce) return;                               /* static card only */

  var pctEl  = stub.querySelector('.np__feedpct');
  var fill   = stub.querySelector('.np__fill');
  var hint   = stub.querySelector('.np__hint');

  /* ---- geometry -------------------------------------------- */
  var barH = function () {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-h')) || 0;
  };
  var slotTop = function () { return paper ? paper.getBoundingClientRect().top : barH(); };
  var viewH   = function () { return paper ? paper.clientHeight : window.innerHeight - barH(); };
  function size() {
    var h = Math.round(viewH());
    if (h > 0 && stub.style.minHeight !== h + 'px') {
      stub.style.minHeight = h + 'px';
      /* the page engines re-measure the sheet on resize (their ResizeObserver
         does not always see content growth), so tell them the roll got longer */
      window.dispatchEvent(new Event('resize'));
    }
  }
  function progress() {
    var vh = viewH();
    if (!vh) return 0;
    return Math.max(0, Math.min(1, 1 - (stub.getBoundingClientRect().top - slotTop()) / vh));
  }
  function jumpTo(y) {
    y = Math.max(0, y);
    var L = window.__lenis;
    if (L) { if (L.resize) L.resize(); L.scrollTo(y, { immediate: true, force: true }); }   /* resize(): Lenis' cached limit may predate the stub */
    else window.scrollTo({ top: y, behavior: 'instant' });
  }

  /* ---- state ----------------------------------------------- */
  var ARM_AT = 0.02, DONE_AT = 0.995, DWELL_MS = 300, HOLD_MS = 350;
  var armed = false, enterT = 0, heldT = 0, going = false, warmed = false, userMoved = false;

  function warm() {
    if (warmed) return;
    warmed = true;
    var c = navigator.connection;
    if (c && c.saveData) return;
    var l = document.createElement('link');
    l.rel = 'prefetch'; l.href = href; l.as = 'document';
    document.head.appendChild(l);
    img.loading = 'eager';
  }
  function overlayOpen() {
    return !!document.querySelector('#lightbox.open, #pz.is-open, #tecFullscreen.open');
  }
  function go() {
    if (going || overlayOpen()) return;
    going = true;
    stub.classList.add('is-going');
    hint.textContent = 'Printing';
    try { sessionStorage.setItem('tj_np', JSON.stringify({ to: key, t: Date.now() })); } catch (e) {}
    setTimeout(function () { location.assign(href); }, 90);
  }

  var raf = 0, again = false;
  function frame() {
    raf = 0;
    if (going) return;
    /* the page engine moves the sheet in its own rAF, which can run after
       this one: every scroll event gets a second read one frame later */
    if (again) { again = false; raf = requestAnimationFrame(frame); }
    var p = progress(), now = performance.now();
    stub.style.setProperty('--np-p', p.toFixed(4));
    fill.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    pctEl.textContent = p > 0 ? 'Feed ' + Math.round(p * 100) + '%' : '';
    if (p > 0) warm();

    if (!userMoved && p > ARM_AT) { settle(); return; }   /* restored / programmatic scroll into the feed */
    if (p <= ARM_AT) { armed = true; enterT = 0; heldT = 0; stub.classList.remove('is-held'); hint.textContent = 'Keep scrolling to print'; return; }
    if (!armed) return;                              /* arrived inside the feed (back button, anchor): wait for a reset */
    if (!enterT) enterT = now;
    if (p >= DONE_AT) {
      if (now - enterT >= DWELL_MS) go();            /* scrolled through it */
      else if (!heldT) {                             /* jumped to the end: ask for one more push */
        heldT = now; stub.classList.add('is-held'); hint.textContent = 'Scroll once more · or press Enter';
      }
    } else if (heldT) { heldT = 0; stub.classList.remove('is-held'); hint.textContent = 'Keep scrolling to print'; }
  }
  function tick() { again = true; if (!raf) raf = requestAnimationFrame(frame); }

  /* one more push at the very end (no scroll events fire there) */
  function push() { if (heldT && performance.now() - heldT >= HOLD_MS && progress() >= DONE_AT) go(); }
  window.addEventListener('wheel', function (e) { userMoved = true; if (e.deltaY > 0 && !e.ctrlKey) push(); }, { passive: true });
  var ty = null;
  window.addEventListener('touchstart', function (e) { userMoved = true; ty = e.touches.length === 1 ? e.touches[0].clientY : null; }, { passive: true });
  window.addEventListener('touchmove', function (e) { if (ty !== null && ty - e.touches[0].clientY > 36) { ty = null; push(); } }, { passive: true });
  window.addEventListener('pointerdown', function () { userMoved = true; }, { passive: true });
  window.addEventListener('keydown', function (e) {
    userMoved = true;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) push();
  });

  window.addEventListener('scroll', tick, { passive: true });
  window.addEventListener('resize', function () { size(); tick(); });
  if (typeof ResizeObserver !== 'undefined' && paper) new ResizeObserver(function () { size(); tick(); }).observe(paper);

  /* Back button / restored scroll: never land inside the feed. Put the
     reader just above the tear line, disarmed until they scroll again. */
  function settle() {
    size();
    going = false; armed = false; enterT = 0; heldT = 0;
    stub.classList.remove('is-going', 'is-held');
    var p = progress();
    if (p > ARM_AT) jumpTo(window.scrollY - p * viewH() - 8);
    tick();
  }
  window.addEventListener('pageshow', function (e) { if (e.persisted) settle(); });
  window.addEventListener('load', function () { if (!userMoved) settle(); else { size(); tick(); } });
  size(); tick();
})();
