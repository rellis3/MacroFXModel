// node --test js/terminal/exportView.test.mjs: the Export bars and the EXPORT hooks over the stand-in DOM: a bar appears on a card with a table, CSV makes a file with the rows
// and a UTC name, nothing is fetched, an empty table says so. PNG drawing needs a real browser canvas and is NOT covered here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePage, makeWin } from './feelFakeDom.fixtures.mjs';
import { mountExport, saveBlob } from './exportView.js';

const T0 = Date.parse('2026-11-16T10:30:00Z');
function setup({ rows = '<tr><td>EURUSD</td><td>1.1</td></tr><tr><td>NQ</td><td>25,000.5</td></tr>' } = {}) {
  const doc = makePage();
  doc.querySelector('main').innerHTML += `<section id="monitor"><div class="card"><div class="ch"><span class="lbl">Monitor</span></div><table><thead><tr><th>Market</th><th>Last</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  const saved = [], fetched = [];
  const win = makeWin(doc, { fetch: async u => { fetched.push(u); return {}; }, Blob: class { constructor(parts, o) { this.parts = parts; this.type = o?.type; } }, URL: { createObjectURL: b => { saved.push(b); return 'blob:x'; }, revokeObjectURL() {} }, setTimeout: fn => { fn(); return 1; }, clearTimeout() {} });
  const m = mountExport({ doc, win, now: () => T0, scopes: ['monitor'] });
  return { doc, win, m, saved, fetched };
}

test('a card that holds a table gets one Export bar (CSV, no PNG); mounting twice adds no second', () => {
  const { doc, m } = setup();
  assert.equal(doc.querySelectorAll('.ex-bar').length, 1); assert.ok(doc.querySelector('[data-ex="csv"]')); assert.equal(doc.querySelector('[data-ex="png"]'), null);
  m.decorate(); assert.equal(doc.querySelectorAll('.ex-bar').length, 1);
});
test('CSV button: the rows as drawn go into a file named for the board and the UTC minute; nothing is fetched', async () => {
  const { doc, saved, fetched } = setup();
  const a0 = []; const orig = doc.createElement.bind(doc);
  doc.createElement = t => { const e = orig(t); if (t === 'a') a0.push(e); return e; };
  doc.querySelector('[data-ex="csv"]').click();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].parts[0], '﻿Market,Last\r\nEURUSD,1.1\r\nNQ,"25,000.5"\r\n');
  assert.equal(a0[0].download, 'desk-monitor-2026-11-16-1030.csv');
  assert.deepEqual(fetched, []); assert.match(doc.getElementById('ex-note').textContent, /Saved 2 rows/);
});
test('the EXPORT command hook saves the open tab\'s biggest table; with no table it says so and saves nothing', () => {
  const { doc, win, saved } = setup(); doc.getElementById('monitor').hidden = false;
  assert.equal(win.deskExport.csv(), true); assert.equal(saved.length, 1);
  const e = setup({ rows: '' }); e.doc.getElementById('monitor').hidden = false;
  assert.equal(e.win.deskExport.csv(), false); assert.equal(e.saved.length, 0); assert.match(e.doc.getElementById('ex-note').textContent, /no table/);
  assert.equal(e.doc.querySelectorAll('.ex-bar').length, 0, 'an empty table has no bar');
});
test('saveBlob reports a blocked download instead of throwing', () => {
  const doc = makePage(), win = makeWin(doc, { URL: { createObjectURL() { throw new Error('blocked'); } } });
  assert.equal(saveBlob({}, 'x.csv', doc, win), false);
});
test('no scope on the page = nothing mounted', () => { assert.equal(mountExport({ doc: makePage(), win: makeWin(makePage()), scopes: ['zzz'] }), null); });
