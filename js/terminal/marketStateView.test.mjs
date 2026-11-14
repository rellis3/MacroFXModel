// The shell's market-closed chip and the data-market stamp (js/terminal/marketStateView.js), against a stub document. Run: node js/terminal/marketStateView.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { paint, start } from './marketStateView.js';

const stubDoc = () => { const chip = { hidden: true, className: '', textContent: '', title: '' }; return { chip, documentElement: { dataset: {} }, getElementById: id => (id === 'mktchip' ? chip : null) }; };

test('shut over the weekend: html is stamped closed and the chip names the close', () => {
  const d = stubDoc(), r = paint(d, Date.parse('2026-11-14T17:56:00Z'));
  assert.equal(d.documentElement.dataset.market, 'closed'); assert.equal(r.st.open, false);
  assert.equal(d.chip.hidden, false); assert.match(d.chip.className, /gold/);
  assert.equal(d.chip.textContent, 'closed · as at Fri 22:00 UTC');
  assert.match(d.chip.title, /showing the close, Fri 22:00 UTC \(London 22:00\) · reopens Sun 22:00 UTC/);
});

test('mid-week the chip is hidden and html says open', () => {
  const d = stubDoc(); paint(d, Date.parse('2026-11-18T12:00:00Z'));
  assert.equal(d.documentElement.dataset.market, 'open'); assert.equal(d.chip.hidden, true); assert.equal(d.chip.textContent, '');
});

test('a holiday is a note on an open market, never the closed state', () => {
  const d = stubDoc(); paint(d, Date.parse('2026-11-26T15:00:00Z'));          // Thanksgiving
  assert.equal(d.documentElement.dataset.market, 'open'); assert.equal(d.chip.hidden, false);
  assert.match(d.chip.textContent, /US stock market closed today \(Thanksgiving\)/); assert.doesNotMatch(d.chip.className, /gold/);
});

test('the flip at the Sunday reopen is reported once, with no manual refresh', () => {
  const d = stubDoc();
  const a = paint(d, Date.parse('2026-11-15T21:59:00Z'));
  const b = paint(d, Date.parse('2026-11-15T22:00:00Z'), a.st);
  const c = paint(d, Date.parse('2026-11-15T22:00:30Z'), b.st);
  assert.equal(a.st.open, false); assert.equal(b.flipped, true); assert.equal(b.st.open, true); assert.equal(c.flipped, false);
  assert.equal(d.documentElement.dataset.market, 'open');
  const f = paint(d, Date.parse('2026-11-20T22:00:00Z'), c.st);                  // the Friday close flips it back
  assert.equal(f.flipped, true); assert.equal(d.documentElement.dataset.market, 'closed');
});

test('start() paints now, repaints on a timer and dispatches the marketstate event on a flip', () => {
  const d = stubDoc(), events = []; let timer = null;
  const win = { CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail; } }, dispatchEvent: e => events.push(e), setInterval: fn => { timer = fn; return 1; } };
  const real = Date.now; let now = Date.parse('2026-11-15T21:59:30Z'); Date.now = () => now;
  try { start(d, win); assert.equal(d.documentElement.dataset.market, 'closed'); assert.equal(events.length, 0);
    now = Date.parse('2026-11-15T22:00:10Z'); timer(); assert.equal(events.length, 1); assert.equal(events[0].type, 'marketstate'); assert.equal(events[0].detail.open, true); }
  finally { Date.now = real; }
});

test('the chip text is last prints only: no forecast or direction wording', () => {
  const d = stubDoc(); paint(d, Date.parse('2026-11-14T17:56:00Z'));
  assert.doesNotMatch(`${d.chip.textContent} ${d.chip.title}`, /will|expect|forecast|bull|bear|long|short|buy|sell/i);
});
