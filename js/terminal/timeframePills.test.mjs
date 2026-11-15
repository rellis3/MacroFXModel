import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TF_KEYS, DEFAULT_TF, loadTf, saveTf, barsUrl, refreshMs, pillsHtml, chipsHtml, dailyChip, mountTfBar } from './timeframePills.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };

test('the choice is remembered per family, falls back to 1h, and a blocked store never throws', () => {
  const s = mem();
  assert.equal(loadTf('pair', s), DEFAULT_TF);
  saveTf('pair', '15m', s); saveTf('asset', '4h', s);
  assert.equal(loadTf('pair', s), '15m');
  assert.equal(loadTf('asset', s), '4h');
  saveTf('pair', 'bogus', s); assert.equal(loadTf('pair', s), '15m');            // an unknown value is never stored
  s.setItem('deskTf:pair', 'junk'); assert.equal(loadTf('pair', s), DEFAULT_TF);  // nor trusted when read back
  assert.equal(loadTf('pair', blocked), DEFAULT_TF);
  assert.doesNotThrow(() => saveTf('pair', '5m', blocked));
});

test('url, refresh cadence and pills markup', () => {
  assert.equal(barsUrl('EURUSD', '5m'), '/api/desk-bars?inst=EURUSD&tf=5m');
  assert.equal(barsUrl('NQ', '1h', 8), '/api/desk-bars?inst=NQ&tf=1h&days=8');
  assert.equal(refreshMs('5m'), 60_000);
  assert.equal(refreshMs('4h'), 600_000);
  const html = pillsHtml('30m');
  assert.equal((html.match(/<button/g) ?? []).length, 5);
  assert.match(html, /data-tf="30m" aria-pressed="true"/);
  assert.match(html, /data-tf="5m" aria-pressed="false"/);
  assert.match(html, /role="group" aria-label="Candle size"/);
});

test('chips: forming while the last candle is open, closed while the week is shut, and the daily chip says why there are no pills', () => {
  const info = { forming: true, lastOpen: Date.parse('2026-11-12T10:15:00Z') / 1000, lastClose: Date.parse('2026-11-12T10:20:00Z') / 1000 };
  assert.match(chipsHtml(info, { open: true }), /forming · opened 10:15 UTC/);
  assert.doesNotMatch(chipsHtml({ ...info, forming: false }, { open: true }), /forming/);
  assert.match(chipsHtml(null, { open: false, short: 'closed · as at Fri 22:00 UTC', label: 'Markets closed' }), /closed · as at Fri 22:00 UTC/);
  assert.doesNotMatch(chipsHtml(null, { open: true, short: null }), /closed/);
  assert.match(chipsHtml(null, null, { error: 'No price bars' }), /err.*No price bars/);
  assert.match(chipsHtml(null, null, { error: '<b>x</b>' }), /&lt;b&gt;/);                // never raw html from a message
  assert.match(dailyChip(), /daily data/);
});

// a host the size of what mountTfBar touches
function fakeHost() {
  const handlers = {}, buttons = TF_KEYS.map(k => ({ dataset: { tf: k }, attrs: {}, setAttribute(a, v) { this.attrs[a] = v; }, focus() { host.focused = k; } })), chips = { innerHTML: '' };
  const host = {
    isConnected: true, innerHTML: '', focused: null, handlers,
    querySelector: sel => (sel === '.tfp-chips' ? chips : (/data-tf="(\w+)"/.exec(sel) ? buttons.find(b => b.dataset.tf === /data-tf="(\w+)"/.exec(sel)[1]) : null)),
    querySelectorAll: () => buttons,
    addEventListener: (t, fn) => { handlers[t] = fn; },
    click: k => handlers.click({ target: { closest: () => buttons.find(b => b.dataset.tf === k) } }),
    key: key => { let prevented = false; handlers.keydown({ key, preventDefault: () => { prevented = true; } }); return prevented; },
    buttons, chips,
  };
  return host;
}
const bars = n => Array.from({ length: n }, (_, i) => ({ time: 1_700_000_000 + i * 300, open: 1, high: 2, low: 0.5, close: 1.5 }));
const tick = () => new Promise(r => setImmediate(r));

test('mount: first load fits, a pill pick reloads that size and refits, the choice is saved, a refresh keeps the view', async () => {
  const host = fakeHost(), store = mem(), urls = [], applied = [];
  const fetchJson = async u => { urls.push(u); return { ok: true, bars: bars(5) }; };
  const m = mountTfBar(host, { family: 'pair', inst: 'EURUSD', days: { '1h': 8 }, fetchJson, apply: (b, o) => applied.push({ n: b.length, tf: o.tf, fit: o.fit }), store, now: () => Date.parse('2026-11-12T12:00:00Z') });
  await tick();
  assert.deepEqual(urls, ['/api/desk-bars?inst=EURUSD&tf=1h&days=8']);
  assert.deepEqual(applied, [{ n: 5, tf: '1h', fit: true }]);
  assert.equal(host.buttons.find(b => b.dataset.tf === '1h').attrs['aria-pressed'], 'true');
  host.click('15m'); await tick();
  assert.equal(urls[1], '/api/desk-bars?inst=EURUSD&tf=15m');
  assert.deepEqual(applied[1], { n: 5, tf: '15m', fit: true });
  assert.equal(loadTf('pair', store), '15m');
  assert.equal(m.tf, '15m');
  host.click('15m'); await tick();                                                         // the same pill again does nothing
  assert.equal(urls.length, 2);
  await m.reload(); assert.deepEqual(applied.at(-1), { n: 5, tf: '15m', fit: false });      // a refresh keeps the user's zoom
  m.stop();
});

test('mount: remembered size is used at start, arrows step between pills, and a stale answer from an old pick is ignored', async () => {
  const store = mem(); saveTf('asset', '4h', store);
  const host = fakeHost(), applied = [], resolvers = {};
  const fetchJson = u => new Promise(res => { resolvers[/tf=(\w+)/.exec(u)[1]] = () => res({ ok: true, bars: bars(3) }); });
  const m = mountTfBar(host, { family: 'asset', inst: 'NQ', fetchJson, apply: (b, o) => applied.push(o.tf), store });
  assert.equal(m.tf, '4h');
  assert.equal(host.key('ArrowLeft'), true);                                               // 4h -> 1h
  assert.equal(m.tf, '1h'); assert.equal(host.focused, '1h');
  assert.equal(host.key('ArrowRight'), true); assert.equal(m.tf, '4h');
  assert.equal(host.key('ArrowRight'), false);                                             // already last: no move, no preventDefault
  host.key('ArrowLeft'); host.key('ArrowLeft'); host.key('ArrowLeft'); host.key('ArrowLeft'); host.key('ArrowLeft');
  assert.equal(m.tf, '5m');
  resolvers['4h']?.(); resolvers['1h']?.(); resolvers['5m']?.(); await tick();            // the slow 4h/1h answers arrive after the 5m pick
  assert.deepEqual(applied, ['5m']);                                                       // only the latest pick draws
  m.stop();
});

test('mount: an empty or failed answer paints the reason, tells the chart, and a stopped bar draws nothing more', async () => {
  const host = fakeHost(), errs = [], applied = [];
  let mode = 'empty';
  const fetchJson = async () => (mode === 'empty' ? { ok: false, error: 'unknown instrument XYZ' } : mode === 'throw' ? (() => { throw new Error('offline'); })() : { ok: true, bars: bars(2) });
  const m = mountTfBar(host, { family: 'pair', inst: 'XYZ', fetchJson, apply: b => applied.push(b.length), onError: (e, tf) => errs.push([e, tf]), store: mem() });
  await tick();
  assert.deepEqual(errs, [['unknown instrument XYZ', '1h']]);
  assert.match(host.chips.innerHTML, /unknown instrument XYZ/);
  mode = 'throw'; host.click('5m'); await tick();
  assert.equal(errs.at(-1)[0], 'offline');
  mode = 'ok'; host.click('30m'); await tick();
  assert.deepEqual(applied, [2]);
  assert.doesNotMatch(host.chips.innerHTML, /offline|unknown/);
  m.stop(); mode = 'ok'; await m.reload();
  assert.deepEqual(applied, [2]);                                                          // stopped: reload() after stop() does not draw
});

test('the charts are wired: the Pair tab and the asset card mount the bar, and no chart hard-codes the old hourly fetch', () => {
  const tabs = readFileSync(new URL('./terminalTabs.js', import.meta.url), 'utf8'), html = readFileSync(new URL('../../desk-terminal.html', import.meta.url), 'utf8');
  assert.match(tabs, /mountTfBar\(el\('tt-tf'\)/);
  assert.match(tabs, /id="tt-tf"/);
  assert.match(html, /mountTfBar\(document\.getElementById\('achart-tf'\)/);
  assert.match(html, /id="achart-tf"/);
  assert.doesNotMatch(tabs, /desk-bars\?inst=\$\{n\}&days=8/);                             // the old fixed-H1 call is gone
});
