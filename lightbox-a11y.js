/* ============================================================
   LIGHTBOX A11Y — keyboard access for the image viewers on
   pike, forged-fungus, helioform-station, triangulated-tectonic.

   Before: every trigger was a plain <div>/<article>/<img> with a
   click handler, so keyboard users could not open a single image,
   and three of the four overlays had no dialog semantics or focus
   handling (focus stayed on the page behind the viewer).

   This file only ADDS behaviour, nothing visual:
     · triggers become focusable buttons (Enter / Space = click)
     · overlays get role="dialog" + aria-modal + a label
     · opening moves focus to the viewer's close button, Tab is
       kept inside the viewer, closing returns focus to the trigger
   Escape / arrow keys were already handled by each page.
   Load with `defer`, after the page's own lightbox script.
   ============================================================ */
(() => {
  'use strict';
  const TRIGGERS = '[data-src], .drawing-cell, .px img, #tecBoard';
  const OVERLAYS = '#lightbox, #tecFullscreen';
  const NATIVE   = 'a[href], button, input, select, textarea, summary';

  /* ---- triggers ------------------------------------------- */
  document.querySelectorAll(TRIGGERS).forEach(el => {
    if (el.closest(OVERLAYS) || el.closest('#pz')) return;
    if (el.matches(NATIVE) || el.hasAttribute('tabindex')) return;
    /* contains its own buttons (pike's callout dots): can't nest a button in a button */
    if (el.querySelector(NATIVE)) return;
    /* an <img> inside a trigger that is itself a trigger: keep one tab stop */
    if (el.parentElement && el.parentElement.closest(TRIGGERS)) return;
    const img = el.tagName === 'IMG' ? el : el.querySelector('img');
    /* <article>/<section> may not take role="button": put the tab stop on its image */
    const stop = /^(ARTICLE|SECTION|ASIDE|NAV|HEADER|FOOTER|MAIN)$/.test(el.tagName) ? img : el;
    if (!stop || stop.hasAttribute('tabindex')) return;
    stop.tabIndex = 0;
    if (!stop.hasAttribute('role')) stop.setAttribute('role', 'button');
    if (!stop.hasAttribute('aria-label')) {
      const name = el.dataset.caption || (img && img.getAttribute('alt')) || 'image';
      stop.setAttribute('aria-label', 'Open ' + name + ' full screen');
    }
    stop.addEventListener('keydown', e => {
      if (e.target !== stop || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      el.click();
    });
  });

  /* ---- overlays ------------------------------------------- */
  const FOCUSABLE = 'button, [href], [tabindex]:not([tabindex="-1"])';
  const visible = x => !x.hidden && getComputedStyle(x).display !== 'none' &&
                       getComputedStyle(x).visibility !== 'hidden' &&
                       !x.classList.contains('lb-hide');

  document.querySelectorAll(OVERLAYS).forEach(ov => {
    if (!ov.hasAttribute('role')) ov.setAttribute('role', 'dialog');
    if (!ov.hasAttribute('aria-modal')) ov.setAttribute('aria-modal', 'true');
    if (!ov.hasAttribute('aria-label') && !ov.hasAttribute('aria-labelledby'))
      ov.setAttribute('aria-label', ov.id === 'tecFullscreen' ? 'Presentation board viewer' : 'Image viewer');

    const isOpen = () => ov.classList.contains('open');
    const stops  = () => [...ov.querySelectorAll(FOCUSABLE)].filter(visible);
    let back = null;

    new MutationObserver(() => {
      if (isOpen() && !back) {
        back = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
        back = back || document.body;
        const first = stops()[0];
        if (first) first.focus({ preventScroll: true });
      } else if (!isOpen() && back) {
        const b = back; back = null;
        if (b !== document.body && b.focus && document.contains(b)) b.focus({ preventScroll: true });
      }
    }).observe(ov, { attributes: true, attributeFilter: ['class'] });

    document.addEventListener('keydown', e => {
      if (e.key !== 'Tab' || !isOpen()) return;
      const f = stops();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1], a = document.activeElement;
      if (!ov.contains(a)) { e.preventDefault(); first.focus({ preventScroll: true }); }
      else if (e.shiftKey && a === first) { e.preventDefault(); last.focus({ preventScroll: true }); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus({ preventScroll: true }); }
    });
  });
})();
