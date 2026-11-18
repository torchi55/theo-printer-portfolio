/* ============================================================
   FRAME LOADER — bounded, progressive loading for the scroll-driven
   image sequences (Farm to Brick rotation, Helioform rotation + wall).

   Before: every frame was requested at page load (Farm 120 files /
   17.8 MB, Helioform 82 + 60 files / 11.1 MB, 119–142 at once).
   Now, same files, same resolution, but:
     1. COARSE pass first — `first` frames, then every `coarseStep`th
        and the last one — so a scrub anywhere lands near a loaded frame.
     2. FILL only after `fill()` is called (first scroll intent), and
        only frames within `window` of the frame the scroll position
        wants, nearest first, the wanted frame before anything else.
     3. Never more than `concurrency` requests in flight.
   The page draws `get(nearest(i))` so the canvas is never blank
   while a frame is still downloading.

   Plain script (no defer): the inline page scripts call it at parse.
   ============================================================ */
window.createFrameLoader = function (o) {
  'use strict';
  var n = o.count, conc = o.concurrency || 4, win = o.window == null ? 20 : o.window;
  var imgs = new Array(n), st = new Uint8Array(n);   /* 0 idle · 1 loading · 2 loaded · 3 failed */
  var inflight = 0, loaded = 0, started = false, filling = false, focus = 0, dir = 1;

  var coarse = [], seen = {};
  function add(i) { if (i >= 0 && i < n && !seen[i]) { seen[i] = 1; coarse.push(i); } }
  (o.first || [0]).forEach(add);
  for (var i = 0; i < n; i += (o.coarseStep || 8)) add(i);
  add(n - 1);

  function next() {
    if (filling && st[focus] === 0) return focus;            /* the frame on screen right now */
    for (var c = 0; c < coarse.length; c++) if (st[coarse[c]] === 0) return coarse[c];
    if (!filling) return -1;
    for (var d = 1; d <= win; d++) {                         /* nearest first, scroll direction first */
      var a = focus + d * dir, b = focus - d * dir;
      if (a >= 0 && a < n && st[a] === 0) return a;
      if (b >= 0 && b < n && st[b] === 0) return b;
    }
    return -1;
  }
  function done(i, ok, img) {
    st[i] = ok ? 2 : 3; inflight--;
    if (ok) { imgs[i] = img; loaded++; if (o.onload) o.onload(i, img); }
    else if (o.onerror) o.onerror(i);
    pump();
  }
  function load(i) {
    st[i] = 1; inflight++;
    var img = new Image();
    img.decoding = 'async';
    img.onload  = function () { done(i, true, img); };
    img.onerror = function () { done(i, false, img); };
    img.src = o.url(i);
  }
  function pump() {
    while (started && inflight < conc) { var i = next(); if (i < 0) return; load(i); }
  }
  return {
    coarse: coarse,
    start: function () { if (!started) { started = true; pump(); } },
    fill:  function () { if (!filling) { filling = true; pump(); } },
    focus: function (i) { if (i !== focus) { dir = i > focus ? 1 : -1; focus = i; } pump(); },
    get: function (i) { return st[i] === 2 ? imgs[i] : null; },
    /* index of the loaded frame closest to i (i itself when it is there), -1 if none yet */
    nearest: function (i) {
      if (st[i] === 2) return i;
      for (var d = 1; d < n; d++) {
        if (i - d >= 0 && st[i - d] === 2) return i - d;
        if (i + d < n  && st[i + d] === 2) return i + d;
      }
      return -1;
    },
    loaded: function () { return loaded; },
    inflight: function () { return inflight; }
  };
};
