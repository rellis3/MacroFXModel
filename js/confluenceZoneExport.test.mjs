// Synthetic tests for the confluence-zone export. No network.
//   node js/confluenceZoneExport.test.mjs
//
// Written after a live outage: BTCUSD had no ROUND_GRID entry, inherited the 0.01 FX
// grid meant for prices near 1.0, and asked roundNumberLevels for ~1,000,000 levels.
// `all.push(...levels)` then threw "Maximum call stack size exceeded" — a 500 on the
// WHOLE /api/vol-forecast/zones export, including the OI section that has its own
// try/catch and would have succeeded on its own.
import { buildConfluenceZoneText } from './confluenceZoneExport.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

// Deterministic bars with real intrabar range, so the level generators have something
// to find (a flat series yields no pivots and the test would pass vacuously).
const mkBars = (px, n = 60) => Array.from({ length: n }, (_, i) => ({
  time: 1700000000 + i * 86400,
  open:  px * (1 + Math.sin(i) / 50),
  high:  px * 1.012,
  low:   px * 0.988,
  close: px * (1 + Math.cos(i) / 60),
  volume: 1000,
}));
const FC = { hl_median: 2.0, hl_75: 2.6, oc_median: 1.2, oc_75: 1.6 };
const run = (name, px, fc = FC) => buildConfluenceZoneText(
  { [name]: mkBars(px) }, { session_date: '2026-08-25', instruments: { [name]: fc } });
const zonesOf = (txt, name) => txt.split('\n')
  .slice(txt.split('\n').indexOf(name) + 1)
  .filter(l => l.startsWith('CZ '));

console.log('[REGRESSION — a high-priced instrument must not blow the call stack]');
{
  // The exact failure: BTC's real hl_75, across the price range it has traded.
  const btcFc = { hl_median: 2.82, hl_75: 3.48 };
  for (const px of [1000, 30000, 60000, 100000, 250000]) {
    let threw = null;
    try { run('BTCUSD', px, btcFc); } catch (e) { threw = e.message; }
    ok(`BTCUSD @ ${px} does not throw`, threw === null, threw || '');
  }
}

console.log('[Every instrument stays bounded — a missing grid entry must degrade, not explode]');
{
  // An instrument NOT in ROUND_GRID and not a JPY pair inherits the 0.01 FX grid. That is
  // only sane near 1.0; at any real index/crypto price it asks for a colossal ladder.
  // MAX_ROUND_STEPS must turn that into "no round levels", never a throw and never a
  // wall of junk that swamps the clustering.
  for (const px of [5000, 50000, 500000]) {
    let threw = null, txt = '';
    try { txt = run('NEWTHING_NOT_IN_ANY_MAP', px); } catch (e) { threw = e.message; }
    ok(`unknown instrument @ ${px} does not throw`, threw === null, threw || '');
    if (!threw) {
      const zs = zonesOf(txt, 'NEWTHING_NOT_IN_ANY_MAP');
      ok(`  …and stays bounded (${zs.length} zones)`, zs.length <= 12, `${zs.length}`);
      ok('  …and emits no round levels (grid known to be wrong)', !zs.some(l => /\bround\b/.test(l)));
    }
  }
}

console.log('[Configured instruments still work and DO get round levels]');
{
  for (const [name, px] of [['GOLD', 4646], ['NQ', 29158], ['SPX500', 7667], ['BTCUSD', 102000]]) {
    const txt = run(name, px);
    const zs = zonesOf(txt, name);
    ok(`${name} produces zones`, zs.length > 0, `${zs.length}`);
    ok(`  …including round-number confluence`, zs.some(l => /\bround\b/.test(l)));
  }
}

console.log('[Price formatting matches the instrument scale]');
{
  ok('GOLD prints 2dp',   /CZ \d+\.\d{2} /.test(run('GOLD', 4646)));
  ok('BTCUSD prints 2dp', /CZ \d+\.\d{2} /.test(run('BTCUSD', 102000)));
  ok('EURUSD prints 5dp', /CZ \d+\.\d{5} /.test(run('EURUSD', 1.1682)));
  ok('NZDJPY prints 3dp (JPY pair, not FX)', /CZ \d+\.\d{3} /.test(run('NZDJPY', 95.2)));
}

console.log('[JPY crosses are classified as JPY]');
{
  // NZDJPY was absent from JPY_PAIRS, so it took the 0.01 FX grid on a ~95 price: 326
  // round levels 1 pip apart, plus a 0.0005 cluster threshold (0.05 JPY pips) that
  // merged nothing. Bounded, so it never crashed — it just quietly produced garbage.
  for (const n of ['USDJPY', 'GBPJPY', 'EURJPY', 'AUDJPY', 'CADJPY', 'NZDJPY']) {
    const zs = zonesOf(run(n, n.endsWith('JPY') && n.startsWith('GBP') ? 198 : 95.2), n);
    ok(`${n} clusters like a JPY pair (≤12 zones, 3dp)`, zs.length > 0 && zs.length <= 12
      && zs.every(l => /CZ \d+\.\d{3} /.test(l)), `${zs.length} zones`);
  }
}

console.log('[Guards]');
{
  ok('too few bars → instrument skipped, no throw', run('GOLD', 4646).length > 0
    && !buildConfluenceZoneText({ GOLD: mkBars(4646, 3) }, { instruments: { GOLD: FC } }).includes('CZ '));
  ok('empty cache → header only, no throw', !buildConfluenceZoneText({}, { instruments: {} }).includes('CZ '));
  ok('missing forecast fields → no throw', (() => {
    try { run('GOLD', 4646, {}); return true; } catch { return false; } })());
}

console.log(failures ? `\n${failures} CHECK(S) FAILED ✗` : '\nALL PASSED ✓');
process.exit(failures ? 1 : 0);
