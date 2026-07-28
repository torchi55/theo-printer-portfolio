/* ============================================================
   SHEET UI — shared by the drawing-set project pages
   (pike.html, 115-almond.html). Scroll reveal + lightbox with
   pinch/double-tap zoom. Lifted verbatim out of pike.html when
   the second page needed the same behaviour.

   Page-specific extras (e.g. pike's callout-dot sync) stay
   inline on that page. Load with `defer`.
   ============================================================ */

/* REVEAL — stagger siblings within a section as it enters view */
(() => {
  const revealed = new WeakSet();
  const revObs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const section = entry.target.closest('section');
      const siblings = section ? [...section.querySelectorAll('.reveal')] : [entry.target];
      let d = 0;
      siblings.forEach(el => {
        if (!revealed.has(el)) {
          revealed.add(el);
          setTimeout(() => el.classList.add('visible'), d);
          d += 70;
        }
      });
      revObs.unobserve(entry.target);
    });
  }, { threshold: 0.05 });
  document.querySelectorAll('.reveal').forEach(el => revObs.observe(el));
})();

/* LIGHTBOX */
(() => {
  const lb        = document.getElementById('lightbox');
  if (!lb) return;
  const lbImg     = document.getElementById('lb-img');
  const lbCaption = document.getElementById('lb-caption');
  const lbItems   = [];
  document.querySelectorAll('[data-src]').forEach(el => {
    lbItems.push({ src: el.dataset.src, caption: el.dataset.caption });
    el.addEventListener('click', () => openLb(lbItems.findIndex(it => it.src === el.dataset.src)));
  });
  let lbIdx = 0;
  function openLb(i)  { lbIdx = i; setLb(); lb.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function setLb()    { const d = lbItems[lbIdx]; lbImg.src = d.src; lbImg.alt = d.caption; lbCaption.textContent = d.caption; window.lbResetZoom?.(); }
  function closeLb()  { lb.classList.remove('open'); document.body.style.overflow = ''; lbImg.src = ''; window.lbResetZoom?.(); }
  document.getElementById('lb-close').addEventListener('click', closeLb);
  lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });
  document.getElementById('lb-prev').addEventListener('click', () => { lbIdx = (lbIdx - 1 + lbItems.length) % lbItems.length; setLb(); });
  document.getElementById('lb-next').addEventListener('click', () => { lbIdx = (lbIdx + 1) % lbItems.length; setLb(); });
  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape')     closeLb();
    if (e.key === 'ArrowLeft')  { lbIdx = (lbIdx - 1 + lbItems.length) % lbItems.length; setLb(); }
    if (e.key === 'ArrowRight') { lbIdx = (lbIdx + 1) % lbItems.length; setLb(); }
  });

  /* LIGHTBOX ZOOM — pinch + one-finger pan on touch, double-tap/click toggle.
     Resets whenever the image changes or the lightbox closes. */
  const wrap = document.querySelector('.lb-img-wrap');
  let scale = 1, tx = 0, ty = 0;
  const ptrs = new Map();
  let pinch0 = null, pan0 = null, lastTap = 0, multi = false;

  function apply() { lbImg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; }
  function clamp() {
    const mx = (scale - 1) * lbImg.offsetWidth  / 2;
    const my = (scale - 1) * lbImg.offsetHeight / 2;
    tx = Math.max(-mx, Math.min(mx, tx));
    ty = Math.max(-my, Math.min(my, ty));
  }
  function resetZoom() { scale = 1; tx = ty = 0; apply(); }
  window.lbResetZoom = resetZoom;

  function toggleZoom(x, y) {
    const r = lbImg.getBoundingClientRect();
    if (scale > 1) { resetZoom(); return; }
    scale = 2.5;
    tx = (1 - scale) * (x - (r.left + r.width  / 2));
    ty = (1 - scale) * (y - (r.top  + r.height / 2));
    clamp(); apply();
  }

  wrap.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') e.preventDefault();
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (ptrs.size > 1) multi = true;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch0 = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale, tx, ty,
                 mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      pan0 = null;
    } else if (ptrs.size === 1 && scale > 1) {
      pan0 = { x: e.clientX, y: e.clientY, tx, ty };
    }
  });
  wrap.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    const start = ptrs.get(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: start.sx, sy: start.sy });
    if (ptrs.size === 2 && pinch0) {
      const [a, b] = [...ptrs.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      scale = Math.max(1, Math.min(4, pinch0.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinch0.dist));
      tx = mid.x - (pinch0.mid.x - pinch0.tx) * (scale / pinch0.scale);
      ty = mid.y - (pinch0.mid.y - pinch0.ty) * (scale / pinch0.scale);
      clamp(); apply();
    } else if (ptrs.size === 1 && pan0) {
      tx = pan0.tx + (e.clientX - pan0.x);
      ty = pan0.ty + (e.clientY - pan0.y);
      clamp(); apply();
    }
  });
  function lift(e) {
    const p0 = ptrs.get(e.pointerId);
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch0 = null;
    if (ptrs.size === 0) pan0 = null;
    /* double-tap (touch only; desktop uses dblclick). Pinch releases don't count. */
    if (e.type === 'pointerup' && e.pointerType === 'touch' && ptrs.size === 0 && p0 && !multi &&
        Math.hypot(e.clientX - p0.sx, e.clientY - p0.sy) < 12) {
      const now = Date.now();
      if (now - lastTap < 320) { toggleZoom(e.clientX, e.clientY); lastTap = 0; }
      else lastTap = now;
    }
    if (ptrs.size === 0) multi = false;
  }
  wrap.addEventListener('pointerup', lift);
  wrap.addEventListener('pointercancel', lift);
  wrap.addEventListener('dblclick', e => toggleZoom(e.clientX, e.clientY));

  /* iOS Safari: without these, pinching fires the NATIVE page zoom —
     the whole fixed-position page scales, HUD text slides into view,
     and our pointer events get cancelled mid-gesture. */
  lb.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  lb.addEventListener('gesturestart',  e => e.preventDefault());
  lb.addEventListener('gesturechange', e => e.preventDefault());
})();
