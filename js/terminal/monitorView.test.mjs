// node --test js/terminal/monitorView.test.mjs: the Monitor tab over the stand-in DOM (js/terminal/feelFakeDom.fixtures.mjs): it draws a row per market with the
// joined columns, sorts, adds and removes, selects a row, and survives every source failing. It does NOT prove the look (themes, phone width) in a real browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePage, makeWin, memStore } from './feelFakeDom.fixtures.mjs';
import { loadBars, httpApi } from './monitorView.js';

const nowMs = Date.parse('2026-11-16T10:00:00Z');
const bars = c => ({ ok: true, asOf: nowMs - 120000, bars: [{ time: nowMs / 1000 - 90000, close: c * 0.99 }, { time: nowMs / 1000 - 600, close: c }] });
function fetchStub(fail = false) {
  const calls = [];
  const f = async url => {
    calls.push(url);
    if (fail) throw new Error('down');
    const j = url.startsWith('/api/desk-bars') ? bars(url.includes('NQ') ? 25000 : 1.1)
      : url === '/api/vol-clock' ? { ok: true, tiles: [{ sym: 'EURUSD', ratio: 1.3, tag: 'continue', clock: { mode: 'live', used: 0.6 } }] }
      : url === '/api/global-read' ? { cards: { EURUSD: { direction: { story: { nLive: 2, pUp: 0.7 } } } } }
      : url === '/api/calendar-ahead' ? { rows: [{ country: 'US', event: 'CPI', impact: 'High', ms: nowMs + 3 * 3600000 }] }
      : { ok: true, lists: [] };
    return { ok: true, status: 200, json: async () => j };
  };
  f.calls = calls; return f;
}
async function mounted({ fail = false } = {}) {
  const { mountMonitor } = await import('./monitorView.js');
  const doc = makePage();
  doc.querySelector('main').innerHTML += '<section id="monitor" hidden></section>';
  doc.getElementById('tabs').innerHTML += '<button data-t="monitor" aria-selected="false">Monitor</button>';
  const f = fetchStub(fail), win = makeWin(doc, { fetch: f, setInterval: () => 1, clearInterval: () => {}, deskSelection: { set(p, s) { this.last = [p, s]; }, subscribe: () => () => {} } });
  const api = { list: async () => ({ ok: true, lists: [] }), post: async () => ({ ok: true, lists: [] }) };
  const m = mountMonitor({ doc, win, api, store: memStore(), now: () => nowMs, ask: () => null, sure: () => true });
  await new Promise(r => setTimeout(r, 5));
  doc.querySelector('#tabs [data-t="monitor"]').click(); win.flush();
  await new Promise(r => setTimeout(r, 30));
  return { doc, win, m, f };
}

test('loadBars asks for every market with a small pool and keeps only good answers', async () => {
  const seen = []; let live = 0, peak = 0;
  const win = { fetch: async url => { seen.push(url); live++; peak = Math.max(peak, live); await new Promise(r => setTimeout(r, 2)); live--; return { ok: !url.includes('BAD'), json: async () => bars(1) }; } };
  const out = await loadBars(win, ['EURUSD', 'GBPUSD', 'BAD', 'NQ', 'GOLD', 'WTI', 'SILVER', 'COPPER'], 3);
  assert.deepEqual(Object.keys(out).sort(), ['COPPER', 'EURUSD', 'GBPUSD', 'GOLD', 'NQ', 'SILVER', 'WTI']);
  assert.ok(peak <= 3, `pool of 3, saw ${peak}`);
  assert.ok(seen.every(u => u.includes('tf=1h') && u.includes('days=4')));
});
test('httpApi sends the shapes the server expects and turns a non-JSON answer into a plain error', async () => {
  const sent = [];
  const win = { fetch: async (u, i) => { sent.push([u, i]); return { status: 502, json: async () => { throw new Error('html'); } }; } };
  const a = httpApi(win);
  const r = await a.post({ action: 'save', name: 'X', items: ['NQ'] });
  assert.equal(sent[0][0], '/api/desk-monitors'); assert.equal(sent[0][1].method, 'POST'); assert.match(sent[0][1].body, /"save"/);
  assert.equal(r.ok, false); assert.match(r.error, /502/);
});
test('the view module loads and exports the mount function the loader calls', async () => {
  const m = await import('./monitorView.js');
  assert.equal(typeof m.mountMonitor, 'function'); assert.ok(m.REFRESH_MS >= 30000);
  const win = makeWin(makePage());
  assert.equal(m.mountMonitor({ doc: makePage(), win, api: { list: async () => ({ ok: true, lists: [] }), post: async () => ({ ok: false }) }, store: memStore() }), null, 'no #monitor section on the page = nothing mounted');
});

test('opening the tab draws a row per market with the joined columns (price, change, range used, IV/sigma, morning read, next release, age)', async () => {
  const { doc, f } = await mounted();
  const html = doc.getElementById('mon-t').innerHTML;
  assert.ok(html.includes('data-inst="EURUSD"'), 'the first starter is FX majors');
  assert.ok(html.includes('1.10000'), 'last price from the bars'); assert.ok(html.includes('60%'), 'range used from the vol clock');
  assert.ok(html.includes('1.30'), 'IV over sigma'); assert.ok(/Up 70%/.test(html), 'the morning read'); assert.ok(html.includes('CPI'), 'next release');
  assert.ok(f.calls.some(u => u === '/api/vol-clock') && f.calls.some(u => u === '/api/calendar-ahead'));
  assert.match(html, /Direction is context only/, 'the morning read says what it is');
});
test('every source failing leaves a table of dashes, never a crash', async () => {
  const { doc } = await mounted({ fail: true });
  const html = doc.getElementById('mon-t').innerHTML;
  assert.ok(html.includes('data-inst="EURUSD"')); assert.ok(html.includes('–'));
});
test('clicking a row selects the market through linked selection; remove and add change the table', async () => {
  const { doc, win } = await mounted();
  doc.querySelector('#mon-t tr[data-inst="GBPUSD"]').click();
  assert.deepEqual(win.deskSelection.last, [{ inst: 'GBPUSD' }, 'monitor']);
  doc.querySelector('[data-rm="GBPUSD"]').click(); win.flush();
  assert.ok(!doc.getElementById('mon-t').innerHTML.includes('data-inst="GBPUSD"'));
  doc.getElementById('mon-add').value = 'gold'; doc.querySelector('[data-mon="add"]').click(); win.flush();
  await new Promise(r => setTimeout(r, 20));
  assert.ok(doc.getElementById('mon-t').innerHTML.includes('data-inst="GOLD"'));
  doc.querySelector('[data-sort="chg"]').click();
  assert.ok(doc.getElementById('mon-t').innerHTML.includes('aria-sort="descending"'));
});
