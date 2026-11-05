const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../script.js'), 'utf8');
const start = source.indexOf('  let printProgress =');
const end = source.indexOf('  (function initBoot()', start);
assert.ok(start >= 0 && end > start);
const scrollHandler = source.match(/  window\.addEventListener\("scroll", \(\) => \{[\s\S]*?\n  \}, \{ passive: true \}\);/);
assert.ok(scrollHandler);
let now = 0, id = 0;
const frames = new Map();
const context = {
  performance: { now: () => now },
  requestAnimationFrame: callback => { frames.set(++id, callback); return id; },
  cancelAnimationFrame: key => frames.delete(key),
  centerText: { style: {} }, update() {}, setTimeout() {},
  sessionStorage: { setItem() {} },
  window: { scrollY: 100, addEventListener: (name, callback) => { context.onScroll = callback; } },
};
vm.createContext(context);
vm.runInContext(source.slice(start, end) + '\nlet ticking = false;\n' + scrollHandler[0] + '\nthis.print = { printPaper, progress: () => printProgress, boot: () => { bootDone = true; } };', context);
const tick = time => {
  now = time;
  const pending = [...frames]; frames.clear();
  pending.forEach(([, callback]) => callback(now));
};
context.print.printPaper();
tick(800);
assert.equal(context.print.progress(), 0.5, 'Uninterrupted print still animates');
context.print.boot();
context.onScroll();
assert.equal(context.print.progress(), 1);
tick(1000);
assert.equal(context.print.progress(), 1, 'A queued animation frame must not retract a completed print');
assert.equal(frames.size, 0);
console.log('PASS: print animates normally; completing it cancels stale animation frames');
