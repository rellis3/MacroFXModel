// END-TO-END: processOIData through a minimal DOM stub.
//   node js/oiProcess.test.mjs
//
// WHY THIS EXISTS. `processOIData` is the function that actually writes every level
// the bot trades and the indicator draws, and it was the ONLY part of the pipeline
// with no test — because it needs a DOM. I flagged it as unverified three times and
// then shipped a change that broke it outright: `futEl` is declared in openOIModal,
// not in processOIData, so referencing it there threw ReferenceError on every Analyse
// click (optional chaining guards a NULL value, not an UNDECLARED identifier), and the
// .catch on the window binding turned the throw into a silent no-op. Clicking Analyse
// did nothing at all, and nothing on screen said why.
//
// A stub is enough to catch that entire class of fault — undeclared identifiers, bad
// call order, throws on the happy path — without a browser. It does not verify layout
// or event wiring; that still needs a real page.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const fx = n => readFileSync(join(HERE, 'fixtures', n), 'utf8');

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };

// ── the stub ────────────────────────────────────────────────────────────────
const FIELDS = {
  oiPairSelect: 'EUR/USD',
  oiRawData: fx('oi-eurusd-heatmap-matrix.txt'),
  oiChangeData: '',
  oiVolumeData: '',
  oiIVData: fx('oi-eurusd-mo4n6-settlements.txt'),
  oiIVTermData: fx('oi-eurusd-settlements-term.txt'),
  oiSpotPrice: '1.13800',
  oiFuturesPrice: '1.14060',
  oiDTE: '',
  oiExpiryLabel: '',
  oiNumLevels: '30',
  oiMinOI: '20',
};

const els = {};
const TOASTS = [];
const lastToast = () => TOASTS.map(t=>t.textContent||t.innerHTML).filter(Boolean).pop() || '(none)';
function el(id) {
  if (!els[id]) els[id] = {
    id, value: FIELDS[id] ?? '', textContent: '', innerHTML: '',
    dataset: {}, style: {}, classList: { add() {}, remove() {}, contains: () => false },
    focus() {}, addEventListener() {}, appendChild() {}, remove() {},
  };
  return els[id];
}
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
globalThis.document = {
  getElementById: el,
  querySelectorAll: () => [],
  createElement: () => { const e = el('_tmp_' + Math.random()); TOASTS.push(e); return e; },
  body: { appendChild() {}, removeChild() {} },
  addEventListener() {},
};
let kvWrites = 0, quoteHits = 0, lastKvBody = null;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('/api/futures-quote')) quoteHits++;
  if (u.includes('/api/kv/set') && opts?.body) { try { lastKvBody = JSON.parse(opts.body); } catch {} }
  // paired futures+spot quote — the live leg processOIData now awaits
  if (u.includes('/api/futures-quote')) return { ok: true, json: async () => ({
    ok: true, price: 1.14065, symbol: '6E=F', kind: 'future', source: 'yahoo',
    spot: 1.13805, spotSymbol: 'EUR_USD', spotSource: 'oanda',
    basis: 0.0026, at: 1753700000000 }) };
  if (u.includes('/api/kv/set')) { kvWrites++; return { ok: true, json: async () => ({ ok: true }) }; }
  if (u.includes('/api/kv/get')) return { ok: true, json: async () => ({ data: {} }) };
  return { ok: false, status: 404, json: async () => ({}) };
};
globalThis.window = { _latestQuote: { price: 1.13800 }, renderAll() {} };

const oi = await import('./oi.js');

// oiSaveStore is fired-and-not-awaited inside processOIData (KV union-merge first,
// then the localStorage cache), so the write lands a few microtasks later. Give it a
// beat before asserting, otherwise the test reads an empty store and blames the code.
// A successful Analyse CLEARS the input boxes (the modal closes and openOIModal
// repopulates from storage next time). So every run must re-seed the form, otherwise
// run 2 parses an empty textarea and bails — which looks exactly like a code fault.
const seed = (over = {}) => {
  for (const [id, v] of Object.entries({ ...FIELDS, ...over })) el(id).value = v;
};
const run = async (over = {}) => {
  seed(over);
  let err = null;
  try { await oi.processOIData(); } catch (e) { err = e; }
  await new Promise(r => setTimeout(r, 120));
  return err;
};
const readInst = () => JSON.parse(localStorage.getItem('oi_store') || '{}')['EUR/USD'];

// ── the happy path must not throw, and must actually store ──────────────────
console.log('[processOIData — happy path]');
let threw = await run();
ok('does not throw on a full valid paste', !threw, threw ? `${threw.name}: ${threw.message}` : '');

const saved = JSON.parse(localStorage.getItem('oi_store') || '{}');
const inst = saved['EUR/USD'];
ok('wrote a record for the pair', !!inst, Object.keys(saved).join(',') || '(store empty)');

if (inst) {
  // The paired live quote must WIN over the pre-filled field, and be labelled as such.
  ok('futures came from the live paired quote', inst.futuresSource === 'live-yahoo', `${inst.futuresSource}`);
  ok('records WHICH contract', inst.futuresSymbol === '6E=F', `${inst.futuresSymbol}`);
  ok('spot came from the same request (legs paired)', inst.spotSource === 'live-paired', `${inst.spotSource}`);
  ok('spot is the paired value, not the stale field', Math.abs(inst.spot - 1.13805) < 1e-9, `${inst.spot}`);
  ok('quote timestamp stored', Number.isFinite(inst.quoteAt), `${inst.quoteAt}`);
  ok('basis is futures − spot from ONE instant',
    Math.abs(inst.basis - (1.14065 - 1.13805)) < 1e-9, `${inst.basis}`);

  // The levels the bot/indicator consume must all be present and sane.
  ok('levels computed', [inst.maxPain, inst.callWall, inst.putWall].every(Number.isFinite),
    `mp ${inst.maxPain} cw ${inst.callWall} pw ${inst.putWall}`);
  ok('expiry resolved from the matrix', inst.primaryExpiry?.code === 'EUUQ6' && inst.primaryExpiry?.dte === 11,
    `${inst.primaryExpiry?.code} / ${inst.primaryExpiry?.dte}`);
  ok('anchor validated, near-money scoring ran',
    inst.primaryExpiry?.anchorValid === true && inst.primaryExpiry?.scoredOn === 'nearMoneyOI');
  ok('reference move present', Number.isFinite(inst.refMove?.move), JSON.stringify(inst.refMove));
  ok('full matrix retained in storage', /C\tP\tC\tP/.test(inst.rawOI || ''), `${(inst.rawOI||'').length} chars`);
  ok('per-expiry term structure built', (inst.termStructure || []).length >= 10, `${(inst.termStructure||[]).length}`);
  ok('GEX flip computed', Number.isFinite(inst.gexFlip), `${inst.gexFlip}`);
}

// ── a typed value must outrank the live quote ───────────────────────────────
console.log('[a genuinely typed futures price wins]');
el('oiFuturesPrice').dataset.manual = '1';
// 1.14100 vs spot 1.13800 = ~30 pips: a realistic basis. A wilder number trips
// basisImplausible (>5% of spot) and is correctly refused, which is a different test.
threw = await run({ oiFuturesPrice: '1.14100' });
ok('no throw on the manual path', !threw, threw ? threw.message : '');
{
  const i2 = readInst();
  ok('typed value used, not the live quote',
    i2?.futuresSource === 'manual' && Math.abs(i2.futures - 1.141) < 1e-9,
    `${i2?.futuresSource} ${i2?.futures}`);
  ok('and the basis reflects the typed leg, not the live one',
    Math.abs(i2.basis - (1.141 - 1.138)) < 1e-6, `${i2?.basis}`);
}

// ── the live quote failing must degrade, not throw ──────────────────────────
console.log('[quote endpoint down → graceful fallback]');
el('oiFuturesPrice').dataset.manual = '0';
globalThis.fetch = async (url) => String(url).includes('/api/futures-quote')
  ? { ok: false, status: 503, json: async () => ({ ok: false }) }
  : { ok: true, json: async () => ({ ok: true, data: {} }) };
threw = await run({ oiFuturesPrice: '' });
ok('no throw when the quote endpoint fails', !threw, threw ? threw.message : '');
{
  const i3 = readInst();
  ok('falls back to a paste-derived futures price', !!i3?.futuresSource, `${i3?.futuresSource}`);
  ok('and marks the legs as NOT paired', i3?.spotSource !== 'live-paired', `${i3?.spotSource}`);
  ok('levels still computed on the fallback path', Number.isFinite(i3?.maxPain), `${i3?.maxPain}`);
}

// ── an empty paste must be refused politely, not crash ──────────────────────
console.log('[empty paste]');
threw = await run({ oiRawData: '' });
ok('no throw on an empty OI box', !threw, threw ? threw.message : '');

// ── inverted-pair call/put swap: a SWITCH, verified in both positions ───────
// The mechanism (a 6J call pays when USD/JPY falls, so a 6J call wall is USD/JPY
// support) is unproven against a reference, so it ships default-OFF and gets flipped
// per pair while paper trading. What IS testable: the flag reaches the derived levels,
// off changes nothing, and it can never fire on a normally-quoted pair.
console.log('[inverted-pair C/P swap]');
{
  FIELDS.oiPairSelect = 'USD/JPY';
  FIELDS.oiSpotPrice = '163.500';
  FIELDS.oiFuturesPrice = '';
  el('oiPairSelect').value = 'USD/JPY';
  el('oiSwapCP').checked = false;
  globalThis.fetch = async (url) => String(url).includes('/api/futures-quote')
    ? { ok: true, json: async () => ({ ok: true, price: 0.0061315, symbol: '6J=F', kind: 'future',
        source: 'yahoo', spot: 163.500, spotSource: 'oanda', at: 1 }) }
    : { ok: true, json: async () => ({ ok: true, data: {} }) };

  await run();
  const off = JSON.parse(localStorage.getItem('oi_store') || '{}')['USD/JPY'];
  ok('unswapped run records the flag as false', off && off.cpSwapped === false, `${off?.cpSwapped}`);

  el('oiSwapCP').checked = true;
  await run();
  const on = JSON.parse(localStorage.getItem('oi_store') || '{}')['USD/JPY'];
  ok('swapped run records the flag as true', on?.cpSwapped === true, `${on?.cpSwapped}`);
  ok('call and put OI totals exchange places',
    on && off && on.totalCallOI === off.totalPutOI && on.totalPutOI === off.totalCallOI,
    `off ${off?.totalCallOI}/${off?.totalPutOI} → on ${on?.totalCallOI}/${on?.totalPutOI}`);
  ok('the derived walls move as a result',
    on && off && (on.callWall !== off.callWall || on.putWall !== off.putWall),
    `cw ${off?.callWall} → ${on?.callWall}`);

  // Must be impossible to fire on a normally-quoted pair, even with the box ticked.
  FIELDS.oiPairSelect = 'EUR/USD'; el('oiPairSelect').value = 'EUR/USD';
  FIELDS.oiSpotPrice = '1.13800';
  el('oiSwapCP').checked = true;
  await run();
  const eur = JSON.parse(localStorage.getItem('oi_store') || '{}')['EUR/USD'];
  ok('a non-inverted pair ignores the flag entirely', eur?.cpSwapped === false, `${eur?.cpSwapped}`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
