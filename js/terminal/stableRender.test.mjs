import test from 'node:test';
import assert from 'node:assert/strict';
import { installStableRender, MIN_LEN, HOLD_MS } from './stableRender.js';

function rig() {
  const sets = []; let t = 1000;
  class El { constructor(id) { this.id = id; this.tagName = 'SECTION'; this.className = ''; this._h = ''; this.isConnected = true; this.firstChild = null; this.offsetHeight = 500; this.style = { minHeight: '' }; }
    get innerHTML() { return this._h; } set innerHTML(v) { this._h = v; sets.push([this.id, v.length]); this.firstChild = v ? {} : null; } }
  const handlers = {}, laters = [], rafs = [], scrolls = [];
  const win = { scrollY: 300, scrollX: 0, addEventListener: (e, f) => { handlers[e] = f; }, scrollTo: (x, y) => { scrolls.push(y); win.scrollY = y; } };
  const ok = installStableRender(El.prototype, { win, now: () => t, raf: f => rafs.push(f), later: (f, ms) => laters.push([f, ms]) });
  return { El, sets, win, handlers, laters, rafs, scrolls, ok, tick: ms => { t += ms; } };
}
const big = c => c.repeat(MIN_LEN + 10), small = 'x';

test('installs once and exposes deskRenderStats', () => {
  const r = rig(); assert.equal(r.ok, true); assert.equal(typeof r.win.deskRenderStats, 'function');
  assert.equal(installStableRender(r.El.prototype, { win: r.win }), false);
});
test('rule 1: identical big HTML into the same populated element is skipped; small HTML and changed HTML are not', () => {
  const r = rig(), a = new r.El('a');
  a.innerHTML = big('a'); a.innerHTML = big('a'); a.innerHTML = big('a');
  assert.equal(r.sets.length, 1, 'the second and third identical assignments should be skipped');
  a.innerHTML = big('b'); assert.equal(r.sets.length, 2);
  a.innerHTML = small; a.innerHTML = small; assert.equal(r.sets.length, 4, 'small assignments are never skipped');
  const stat = r.win.deskRenderStats().find(x => x.element.startsWith('section#a')); assert.equal(stat.skippedAsIdentical, 2);
});
test('an element that has lost its content is always redrawn (never skip into an empty box)', () => {
  const r = rig(), a = new r.El('a'); a.innerHTML = big('a'); a.firstChild = null; a.innerHTML = big('a'); assert.equal(r.sets.length, 2);
});
test('rule 2: a real change holds the height, then releases it', () => {
  const r = rig(), a = new r.El('a'); a.innerHTML = big('a'); a.innerHTML = big('b');
  assert.equal(a.style.minHeight, '500px'); assert.ok(r.laters.some(([, ms]) => ms === HOLD_MS));
  for (const [f] of r.laters) f(); assert.equal(a.style.minHeight, '');
});
test('rule 3: scroll is put back after a redraw, but never if the user scrolled just now', () => {
  const r = rig(), a = new r.El('a'); r.win.scrollY = 300;
  a.innerHTML = big('a'); r.win.scrollY = 40; r.rafs.shift()(); assert.deepEqual(r.scrolls, [300]);
  r.scrolls.length = 0; a.innerHTML = big('b'); r.win.scrollY = 40; r.handlers.wheel(); r.rafs.shift()(); assert.deepEqual(r.scrolls, [], 'the user scrolled: leave it');
  r.tick(1000); a.innerHTML = big('c'); r.win.scrollY = 10; r.rafs.shift()(); assert.deepEqual(r.scrolls, [40]);
});

test('an element inside [data-sr-off] (the Helix HUD) is never skipped and never height-held', () => {
  const r = rig(), a = new r.El('a'); a.closest = sel => (sel === '[data-sr-off]' ? {} : null);
  a.innerHTML = big('a'); a.innerHTML = big('a'); assert.equal(r.sets.length, 2, 'identical HTML is still written');
  a.innerHTML = big('b'); assert.equal(a.style.minHeight, '', 'no height hold'); assert.equal(r.laters.length, 0);
});
