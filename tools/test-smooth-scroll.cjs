const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function sheet(overflow = 'hidden', lenis = false) {
  let now = 0, renderedY = 0, frames = [];
  const listeners = {};
  const paper = {
    firstElementChild: {}, scrollTop: 0, scrollLeft: 0,
    getBoundingClientRect: () => ({ top: 140, bottom: 900 }),
    addEventListener: (name, callback) => { listeners[name] = callback; },
  };
  const target = { getBoundingClientRect: () => ({
    top: 1640 - renderedY - paper.scrollTop,
    bottom: 1680 - renderedY - paper.scrollTop, width: 100, height: 40,
  }) };
  const window = {
    scrollY: 0, addEventListener() {},
    scrollTo({ top }) {
      window.scrollY = top;
      frames.push(() => { renderedY = window.scrollY; });
    },
  };
  const document = {
    activeElement: target, documentElement: { scrollHeight: 10000 },
    getElementById: id => id === 'paper' ? paper : null,
  };
  if (lenis) window.__lenis = { scrollTo(y, options) {
    assert.equal(options.immediate, true);
    assert.equal(options.force, true);
    window.scrollTo({ top: y });
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../smooth-scroll.js'), 'utf8'), {
    window, document, innerHeight: 900,
    performance: { now: () => now },
    getComputedStyle: () => ({ overflowY: overflow }),
    requestAnimationFrame: cb => frames.push(cb),
  });
  return {
    paper, target, window,
    focus: () => listeners.focusin({ target }),
    scroll: () => listeners.scroll(),
    delay: ms => { now += ms; },
    frame: () => { const pending = frames; frames = []; pending.forEach(cb => cb()); },
  };
}

// A background tab can delay scroll events beyond the former 300 ms guard.
for (const lenis of [false, true]) for (const delay of [0, 1000]) {
  const s = sheet('hidden', lenis);
  s.paper.scrollTop = 1180;
  s.focus();
  s.frame();
  s.delay(delay);
  s.scroll();
  s.frame();
  s.frame();
  assert.equal(s.paper.scrollTop, 0);
  const r = s.target.getBoundingClientRect();
  assert.ok(r.top >= 156 && r.bottom <= 884, `Focus must remain visible after ${delay} ms; got ${r.top}`);
}

// Find-in-page still transfers native sheet scrolling into the page engine.
const find = sheet();
find.paper.scrollTop = 1180;
find.scroll();
find.frame();
assert.equal(find.window.scrollY, 1180);
assert.equal(find.paper.scrollTop, 0);

// About/contact keep their real internal scroller.
const native = sheet('auto');
native.paper.scrollTop = 1180;
native.focus(); native.scroll(); native.frame(); native.frame();
assert.equal(native.paper.scrollTop, 1180);
assert.equal(native.window.scrollY, 0);
console.log('PASS: immediate/delayed focus, find-in-page, native sheet scrolling');
