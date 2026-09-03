/* ============================================================
   PINCH ZOOM — touch-only image viewer shared by the project pages.

   Desktop is untouched: on a mouse/trackpad this file returns on
   line one and every page keeps its own click-to-magnify code.

   On phones it takes over any element carrying `data-pz` or
   `data-src` (drawings, plates, model photos, the TT board):
     · tap            → opens the image full-screen
     · pinch          → zooms about the fingers, 1×–6×
     · one finger     → pans (with a fling on release)
     · double-tap     → 2.6× at the tap point, again to reset
     · swipe down     → closes (at 1×), so does the ×, the
                        backdrop, Escape, and the Android back key
     · pinching an image on the PAGE opens the viewer mid-gesture —
       the pinch carries straight through, no extra tap.

   Native page zoom is blocked only inside the viewer and on the
   image targets themselves (touch-action: pan-y + gesturestart),
   so the fixed-position printer layout never gets pinched by
   accident and the rest of the page keeps accessibility zoom.

   Image source: data-pz, else data-src, else the <img> inside.
   Caption: data-caption, else the element's `.tag` text.
   ============================================================ */
(() => {
  'use strict';
  const touch  = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (!touch || !coarse) return;                 /* desktop: inert */

  const SEL   = '[data-pz], [data-src]';
  const MAX   = 6;
  const DTAP  = 2.6;
  const EASE  = 'transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)';

  document.documentElement.classList.add('pz-touch');

  /* ---- DOM ------------------------------------------------- */
  const root = document.createElement('div');
  root.id = 'pz';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Image viewer');
  root.innerHTML =
    '<div class="pz__stage"><img class="pz__img" alt="" draggable="false"></div>' +
    '<div class="pz__bar"><span class="pz__cap"></span><span class="pz__zoom">1.0×</span></div>' +
    '<button class="pz__close" type="button" aria-label="Close viewer">×</button>' +
    '<div class="pz__hint">pinch to zoom · double-tap · swipe down to close</div>';
  document.body.appendChild(root);

  const stage    = root.querySelector('.pz__stage');
  const img      = root.querySelector('.pz__img');
  const cap      = root.querySelector('.pz__cap');
  const zoomLbl  = root.querySelector('.pz__zoom');
  const hint     = root.querySelector('.pz__hint');
  const closeBtn = root.querySelector('.pz__close');

  /* ---- state ----------------------------------------------- */
  let isOpen = false;
  let s = 1, tx = 0, ty = 0;                     /* current transform */
  let base = { w: 0, h: 0 };                     /* layout size at 1× */
  const ptrs = new Map();                        /* pointerId → {x,y,sx,sy,t} */
  let pinch = null, pan = null, swipe = null;
  let multi = false, lastTap = 0, openedAt = 0, token = 0;
  let fling = 0, vx = 0, vy = 0, vt = 0;
  let lastFocus = null, hintTimer = 0;

  const vw = () => window.innerWidth;
  const vh = () => window.innerHeight;

  function measure() { base.w = img.offsetWidth; base.h = img.offsetHeight; }

  function apply() {
    img.style.transform = 'translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0) scale(' + s.toFixed(4) + ')';
    zoomLbl.textContent = s.toFixed(1) + '×';
  }
  function anim(on) { img.style.transition = on ? EASE : 'none'; }

  function bounds() {
    return { mx: Math.max(0, (base.w * s - vw()) / 2), my: Math.max(0, (base.h * s - vh()) / 2) };
  }
  function clamp() {
    const b = bounds();
    tx = Math.min(b.mx, Math.max(-b.mx, tx));
    ty = Math.min(b.my, Math.max(-b.my, ty));
  }
  /* soft edges while a finger is down — resist, don't stop */
  function rubber(v, lim) {
    if (v >  lim) return lim + (v - lim) * 0.28;
    if (v < -lim) return -lim + (v + lim) * 0.28;
    return v;
  }

  /* zoom to `ns` keeping the image point under (cx,cy) fixed */
  function zoomAbout(ns, cx, cy, s0, tx0, ty0) {
    const ux = cx - vw() / 2, uy = cy - vh() / 2;
    const k  = ns / s0;
    s  = ns;
    tx = ux - (ux - tx0) * k;
    ty = uy - (uy - ty0) * k;
  }

  function settle() {
    /* after any gesture: scale back into [1, MAX], edges back in view */
    anim(true);
    if (s < 1) { s = 1; tx = 0; ty = 0; }
    else if (s > MAX) { const c = { x: vw() / 2 + tx, y: vh() / 2 + ty }; zoomAbout(MAX, c.x, c.y, s, tx, ty); }
    clamp(); apply();
    root.classList.toggle('is-zoomed', s > 1.02);
  }

  /* ---- open / close ---------------------------------------- */
  function srcOf(el) {
    if (el.dataset.pz)  return el.dataset.pz;
    if (el.dataset.src) return el.dataset.src;
    const im = el.tagName === 'IMG' ? el : el.querySelector('img');
    return im ? (im.currentSrc || im.src) : '';
  }
  function lowOf(el) {
    const im = el.tagName === 'IMG' ? el : el.querySelector('img');
    return im ? (im.currentSrc || im.src) : '';
  }
  function captionOf(el) {
    if (el.dataset.caption) return el.dataset.caption;
    const t = el.querySelector('.tag');
    if (t) return [...t.childNodes].map(n => n.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
    const im = el.tagName === 'IMG' ? el : el.querySelector('img');
    const alt = im && im.getAttribute('alt') || '';
    return alt.length <= 48 ? alt : '';
  }

  function openFrom(el) {
    if (isOpen) return;
    const hi = srcOf(el), lo = lowOf(el);
    if (!hi && !lo) return;
    const my = ++token;
    isOpen = true; openedAt = Date.now();
    lastFocus = document.activeElement;
    cancelAnimationFrame(fling); fling = 0;
    s = 1; tx = 0; ty = 0;
    anim(false); apply();
    root.classList.remove('is-zoomed', 'is-loading');
    cap.textContent = captionOf(el);
    img.alt = (el.querySelector && el.querySelector('img') || {}).alt || '';

    /* show the already-decoded page image instantly, swap in the
       big one once it has decoded — no blank screen on a 4 MB plan */
    img.src = lo || hi;
    img.onload = () => { measure(); if (s === 1) { tx = 0; ty = 0; apply(); } };
    if (hi && hi !== lo) {
      root.classList.add('is-loading');
      const pre = new Image();
      pre.src = hi;
      let swapped = false;
      const done = () => { if (my !== token || swapped) return; swapped = true; root.classList.remove('is-loading'); img.src = hi; };
      pre.onerror = done;
      if (pre.decode) pre.decode().then(done, done); else pre.onload = done;
      /* decode() can stall on a throttled tab — never leave the low tier up for good */
      pre.onload = () => setTimeout(done, 2500);
    }

    root.hidden = false;
    void root.offsetWidth;                       /* flush so the opacity transition runs */
    root.classList.add('is-open');
    measure(); apply();
    try { history.pushState({ pz: 1 }, ''); } catch (e) {}
    closeBtn.focus({ preventScroll: true });

    /* hint: long the first time this session, a flash after that */
    let seen = false;
    try { seen = sessionStorage.getItem('pz-hint') === '1'; sessionStorage.setItem('pz-hint', '1'); } catch (e) {}
    clearTimeout(hintTimer);
    hint.classList.add('show');
    hintTimer = setTimeout(() => hint.classList.remove('show'), seen ? 900 : 2400);
  }

  function hide() {
    if (!isOpen) return;
    isOpen = false; token++;
    cancelAnimationFrame(fling); fling = 0;
    ptrs.clear(); pinch = pan = swipe = null; multi = false;
    root.classList.remove('is-open', 'is-zoomed', 'is-loading');
    root.style.setProperty('--pz-dim', '1');
    setTimeout(() => { if (!isOpen) { root.hidden = true; img.removeAttribute('src'); } }, 200);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }
  function close() {
    if (!isOpen) return;
    if (history.state && history.state.pz) { try { history.back(); return; } catch (e) {} }
    hide();
  }
  window.addEventListener('popstate', () => { if (isOpen) hide(); });
  /* a reload / bfcache return can land on the viewer's own history entry —
     drop it, or the next close() would navigate away from the page */
  if (history.state && history.state.pz) { try { history.replaceState(null, ''); } catch (e) {} }

  /* ---- taps on the page ------------------------------------ */
  document.addEventListener('click', e => {
    if (isOpen) return;
    const el = e.target.closest(SEL);
    if (!el || el.closest('#pz')) return;
    e.preventDefault();
    e.stopImmediatePropagation();               /* the page's own click-to-magnify never runs on touch */
    if (multi || Date.now() - openedAt < 400) return;
    openFrom(el);
  }, true);

  /* ---- pointer gestures ------------------------------------ */
  function pointOf(e) { return { x: e.clientX, y: e.clientY }; }

  function beginPinch() {
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s, tx, ty,
              mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    pan = null; swipe = null;
    anim(false);
  }

  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    const inViewer = isOpen && e.target.closest('#pz');
    const onTarget = !isOpen && e.target.closest(SEL);
    if (!inViewer && !onTarget) return;
    if (isOpen && e.target.closest('.pz__close')) return;

    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: e.timeStamp, el: onTarget || null });
    if (ptrs.size > 1) multi = true;

    if (!isOpen) {
      /* two fingers landing on the same image: open and hand the pinch over */
      if (ptrs.size === 2) {
        const [p, q] = [...ptrs.values()];
        if (p.el && p.el === q.el) { openFrom(p.el); beginPinch(); }
        else ptrs.clear();
      }
      return;
    }
    cancelAnimationFrame(fling); fling = 0;
    anim(false);
    if (ptrs.size === 2) beginPinch();
    else if (ptrs.size === 1) {
      if (s > 1.02) pan = { x: e.clientX, y: e.clientY, tx, ty };
      else swipe = { y: e.clientY, x: e.clientX, live: false };
      vx = vy = 0; vt = e.timeStamp;
    }
  }, { passive: true });

  document.addEventListener('pointermove', e => {
    if (!isOpen || !ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId);
    const cur  = { x: e.clientX, y: e.clientY, sx: prev.sx, sy: prev.sy, t: e.timeStamp, el: prev.el };
    ptrs.set(e.pointerId, cur);

    if (ptrs.size === 2 && pinch) {
      const [a, b] = [...ptrs.values()];
      const d   = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let ns = pinch.s * d / pinch.d;
      if (ns < 1)   ns = 1 - (1 - ns) * 0.55;             /* resist below 1× */
      if (ns > MAX) ns = MAX + (ns - MAX) * 0.35;          /* and above MAX */
      /* keep the image point that was under the first midpoint under the current one */
      const k = ns / pinch.s;
      const ux0 = pinch.mid.x - vw() / 2, uy0 = pinch.mid.y - vh() / 2;
      s  = ns;
      tx = (mid.x - vw() / 2) - (ux0 - pinch.tx) * k;
      ty = (mid.y - vh() / 2) - (uy0 - pinch.ty) * k;
      const bnd = bounds(); tx = rubber(tx, bnd.mx); ty = rubber(ty, bnd.my);
      apply();
      root.classList.toggle('is-zoomed', s > 1.02);
    } else if (ptrs.size === 1 && pan) {
      const dt = Math.max(1, e.timeStamp - vt);
      vx = (e.clientX - prev.x) / dt; vy = (e.clientY - prev.y) / dt; vt = e.timeStamp;
      tx = pan.tx + (e.clientX - pan.x);
      ty = pan.ty + (e.clientY - pan.y);
      const bnd = bounds(); tx = rubber(tx, bnd.mx); ty = rubber(ty, bnd.my);
      apply();
    } else if (ptrs.size === 1 && swipe) {
      const dy = e.clientY - swipe.y, dx = e.clientX - swipe.x;
      if (!swipe.live && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) swipe.live = true;
      if (swipe.live) {
        ty = dy; tx = dx * 0.3;
        const dim = Math.max(0.15, 1 - Math.abs(dy) / 420);
        root.style.setProperty('--pz-dim', dim.toFixed(3));
        apply();
      }
    }
  }, { passive: true });

  function lift(e) {
    const p0 = ptrs.get(e.pointerId);
    if (!p0) return;
    ptrs.delete(e.pointerId);
    if (!isOpen) { if (ptrs.size === 0) multi = false; return; }

    if (ptrs.size < 2 && pinch) {
      pinch = null;
      settle();
      /* the remaining finger continues as a pan */
      if (ptrs.size === 1 && s > 1.02) { const r = [...ptrs.values()][0]; pan = { x: r.x, y: r.y, tx, ty }; anim(false); }
    }
    if (ptrs.size === 0) {
      if (pan) {
        pan = null;
        const bnd = bounds();
        /* an axis pushed past its edge snaps back and does not fling */
        if (tx > bnd.mx || tx < -bnd.mx) vx = 0;
        if (ty > bnd.my || ty < -bnd.my) vy = 0;
        const speed = Math.hypot(vx, vy);
        if (speed < 0.05 || e.type === 'pointercancel') settle();
        else {
          clamp();
          /* fling: decay the release velocity, stop at the edges */
          anim(false);
          let fx = vx, fy = vy, last = performance.now();
          const step = now => {
            const dt = Math.min(40, now - last); last = now;
            tx += fx * dt; ty += fy * dt;
            fx *= Math.pow(0.94, dt / 16); fy *= Math.pow(0.94, dt / 16);
            const b = bounds();
            if (tx >  b.mx) { tx =  b.mx; fx = 0; }
            if (tx < -b.mx) { tx = -b.mx; fx = 0; }
            if (ty >  b.my) { ty =  b.my; fy = 0; }
            if (ty < -b.my) { ty = -b.my; fy = 0; }
            apply();
            if (Math.hypot(fx, fy) > 0.02) fling = requestAnimationFrame(step); else fling = 0;
          };
          fling = requestAnimationFrame(step);
        }
      }
      if (swipe) {
        const dy = ty;
        swipe = null;
        if (Math.abs(dy) > 80 && e.type !== 'pointercancel') { close(); }
        else { root.style.setProperty('--pz-dim', '1'); settle(); }
      }
      /* double-tap — single finger, barely moved, no pinch in this touch */
      const moved = Math.hypot(e.clientX - p0.sx, e.clientY - p0.sy);
      if (e.type === 'pointerup' && !multi && moved < 12) {
        const now = Date.now();
        if (now - lastTap < 320) {
          lastTap = 0;
          anim(true);
          if (s > 1.02) { s = 1; tx = 0; ty = 0; }
          else zoomAbout(DTAP, e.clientX, e.clientY, s, tx, ty);
          clamp(); apply();
          root.classList.toggle('is-zoomed', s > 1.02);
        } else lastTap = now;
      }
      multi = false;
    }
  }
  document.addEventListener('pointerup', lift, { passive: true });
  document.addEventListener('pointercancel', lift, { passive: true });

  /* backdrop tap (single, unmoved, at 1×) closes; the × always does */
  closeBtn.addEventListener('click', e => { e.stopPropagation(); close(); });
  stage.addEventListener('click', e => {
    if (!isOpen || multi || s > 1.02) return;
    if (Date.now() - openedAt < 400) return;
    if (e.target !== stage) return;             /* the <img> is pointer-events:none, so a tap on it lands here too */
    const r = img.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
    close();
  });

  document.addEventListener('keydown', e => { if (isOpen && e.key === 'Escape') close(); });

  /* ---- keep the browser out of it ---------------------------- */
  /* inside the viewer: no scroll, no native pinch, no double-tap zoom */
  document.addEventListener('touchmove', e => {
    if (isOpen) { e.preventDefault(); return; }
    /* a two-finger gesture that started on an image: stop native page zoom */
    if (e.touches.length > 1 && ptrs.size > 1) e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchstart', e => {
    if (isOpen) { if (e.touches.length > 1) e.preventDefault(); return; }
    if (e.touches.length === 2) {
      const a = e.touches[0].target.closest && e.touches[0].target.closest(SEL);
      const b = e.touches[1].target.closest && e.touches[1].target.closest(SEL);
      if (a && a === b) e.preventDefault();
    }
  }, { passive: false });
  /* iOS: gesture events are the only thing Safari reliably honours for pinch */
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t =>
    document.addEventListener(t, e => {
      if (isOpen || (e.target.closest && e.target.closest(SEL))) e.preventDefault();
    }, { passive: false }));

  window.addEventListener('resize', () => { if (!isOpen) return; measure(); anim(false); clamp(); apply(); });

  /* read-only state for tests */
  window.__pz = () => ({ isOpen, s, tx, ty, multi, lastTap, ptrs: [...ptrs.keys()], pan: !!pan, swipe: !!swipe, pinch: !!pinch, fling: !!fling });
})();
