// Synthetic, no-network unit tests for the level-source Tier-2 brick.
//   node js/levelSources.test.mjs

import {
  LEVEL_SOURCES, collectLevels, clusterLevels,
  dailyOpenLevels, priorHighLowLevels, pivotLevels,
  volumeProfileLevels, swingSRLevels, roundNumberLevels, vwapAnchorLevels,
} from './levelSources.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ── Synthetic daily bars: 60 completed days, gently trending ──────────────────
const day0 = Date.UTC(2024, 0, 1) / 1000;
const dailyBars = [];
let px = 1.2000;
for (let i = 0; i < 60; i++) {
  const o = px, c = px * (1 + 0.0006 * Math.sin(i / 6));
  const hi = Math.max(o, c) * 1.0025, lo = Math.min(o, c) * 0.9975;
  dailyBars.push({ time: day0 + i * 86400, open: o, high: hi, low: lo, close: c });
  px = c;
}
const last = dailyBars[dailyBars.length - 1];
const instrument = 'EUR/USD';                            // pip 0.0001
const ctx = { dailyBars, instrument };

console.log('[daily_open]');
const dops = dailyOpenLevels({ ...ctx, params: { days: 5 } });
ok('emits one level per day', dops.length === 5);
ok('most-recent open = last bar open', near(dops[dops.length - 1].price, last.open));
ok('weights increase toward present', dops[4].weight > dops[0].weight);

console.log('[prior_hilo]');
const ph = priorHighLowLevels({ ...ctx, params: { prevDay: true, prevWeek: true, extremesDays: [20] } });
ok('PDH = last bar high', near(ph.find(l => l.kind === 'pdh').price, last.high));
ok('PDL = last bar low', near(ph.find(l => l.kind === 'pdl').price, last.low));
const rh = ph.find(l => l.kind === 'range_high');
let max20 = -Infinity; for (const b of dailyBars.slice(-20)) max20 = Math.max(max20, b.high);
ok('20d high = max high over last 20', near(rh.price, max20));

console.log('[pivots]');
const pc = pivotLevels({ ...ctx, params: { method: 'classic' } });
const PP = (last.high + last.low + last.close) / 3;
ok('classic PP = (H+L+C)/3', near(pc.find(l => l.meta.lvl === 'PP').price, PP));
ok('classic R1 = 2PP - L', near(pc.find(l => l.meta.lvl === 'R1').price, 2 * PP - last.low));
ok('classic S1 = 2PP - H', near(pc.find(l => l.meta.lvl === 'S1').price, 2 * PP - last.high));
const cam = pivotLevels({ ...ctx, params: { method: 'camarilla' } });
ok('camarilla emits R1..S4 (8 levels)', cam.length === 8);
ok('camarilla R3 = C + range*1.1/4', near(cam.find(l => l.meta.lvl === 'R3').price, last.close + (last.high - last.low) * 1.1 / 4));

console.log('[volume_profile]');
// Synthetic intraday: 3 days of bars clustered around a clear POC each day.
const intraday = [];
const id0 = last.time - 2 * 86400;
for (let d = 0; d < 3; d++) {
  const base = 1.2000 + d * 0.0010;
  for (let m = 0; m < 300; m++) {
    // heavy concentration near `base`, thin tails → POC ≈ base
    const offset = (m % 30 === 0 ? (m % 60 ? 8 : -8) : (m % 5 - 2)) * 0.0001;
    const o = base + offset, c = o + 0.00005;
    intraday.push({ time: id0 + d * 86400 + m * 60, open: o, high: Math.max(o, c) + 0.0001, low: Math.min(o, c) - 0.0001, close: c });
  }
}
// Reference: verbatim confluenceModules.vah_val body-midpoint algorithm on the composite window.
function refProfile(bars, pip, vaPct = 0.70) {
  const hist = new Map(); let total = 0;
  for (const b of bars) { const k = Math.round((b.open + b.close) / 2 / pip); hist.set(k, (hist.get(k) ?? 0) + 1); total++; }
  let pocKey = 0, pocCount = -1;
  for (const [k, c] of hist) if (c > pocCount) { pocCount = c; pocKey = k; }
  const sorted = [...hist.entries()].sort((a, b) => a[0] - b[0]);
  const target = total * vaPct;
  let pocIdx = sorted.findIndex(([k]) => k === pocKey); if (pocIdx < 0) pocIdx = Math.floor(sorted.length / 2);
  let lo = pocIdx, hi = pocIdx, cap = pocCount;
  while (cap < target && (lo > 0 || hi < sorted.length - 1)) {
    const aL = lo > 0 ? sorted[lo - 1][1] : -1, aH = hi < sorted.length - 1 ? sorted[hi + 1][1] : -1;
    if (aL >= aH && aL > 0) { lo--; cap += aL; } else if (aH > 0) { hi++; cap += aH; } else break;
  }
  return { poc: pocKey * pip, vah: sorted[hi][0] * pip, val: sorted[lo][0] * pip };
}
const vp = volumeProfileLevels({ ...ctx, intraday, params: { lookbackDays: 5, valueAreaPct: 0.70, binPips: 1, mode: 'composite' } });
const ref = refProfile(intraday.filter(b => b.time >= intraday[intraday.length - 1].time - 5 * 86400), 0.0001, 0.70);
ok('POC matches reference algorithm', near(vp.find(l => l.kind === 'poc').price, ref.poc, 1e-9), `got ${vp.find(l => l.kind === 'poc').price.toFixed(5)} ref ${ref.poc.toFixed(5)}`);
ok('VAH ≥ POC ≥ VAL', (() => { const o = {}; for (const l of vp) o[l.kind] = l.price; return o.vah >= o.poc && o.poc >= o.val; })());
ok('returns [] without intraday', volumeProfileLevels({ ...ctx, params: {} }).length === 0);
ok('perDay mode emits 3 days × 3 levels', volumeProfileLevels({ ...ctx, intraday, params: { lookbackDays: 5, mode: 'perDay' } }).length === 9);

console.log('[swing_sr]');
// Bars with engineered swing highs/lows.
const srBars = [];
for (let i = 0; i < 80; i++) {
  const base = 1.30 + 0.01 * Math.sin(i / 4);            // oscillation → clear pivots
  srBars.push({ time: day0 + i * 86400, open: base, high: base + 0.002, low: base - 0.002, close: base });
}
const sr = swingSRLevels({ dailyBars: srBars, instrument, params: { lookbackDays: 999, strength: 5, clusterPips: 30 } });
ok('finds swing S&R levels', sr.length > 0, `n=${sr.length}`);
ok('levels tagged support/resistance', sr.every(l => l.kind === 'support' || l.kind === 'resistance'));
ok('touch count carried in meta', sr.every(l => l.meta.touches >= 1));

console.log('[round_number]');
const rn = roundNumberLevels({ dailyBars, instrument, price: 1.2345, params: { spanPips: 200, halves: true } });
ok('includes 1.2300 and 1.2400 big figures', rn.some(l => near(l.price, 1.23)) && rn.some(l => near(l.price, 1.24)));
ok('includes a half figure 1.2350', rn.some(l => l.kind === 'round_half' && near(l.price, 1.235)));
ok('all within ±span of price', rn.every(l => Math.abs(l.price - 1.2345) <= 0.02 + 1e-9));

console.log('[vwap]');
const vw = vwapAnchorLevels({ ...ctx, intraday, params: { lookbackDays: 5 } });
ok('emits a VWAP anchor per day', vw.length >= 1 && vw.every(l => l.kind === 'vwap' || l.kind === 'vwap_anchor'));
ok('most recent VWAP flagged + heaviest', (() => { const r = vw.find(l => l.meta.recent); return r && r.kind === 'vwap' && r.weight >= Math.max(...vw.map(l => l.weight)); })());
ok('VWAP sits within the day price range', (() => {
  const dayBars = intraday.filter(b => b.time - (b.time % 86400) === intraday[intraday.length - 1].time - (intraday[intraday.length - 1].time % 86400));
  let lo = Infinity, hi = -Infinity; for (const b of dayBars) { lo = Math.min(lo, b.low); hi = Math.max(hi, b.high); }
  const today = vw.find(l => l.meta.recent); return today && today.price >= lo && today.price <= hi;
})());
ok('returns [] without intraday', vwapAnchorLevels({ ...ctx, params: {} }).length === 0);

console.log('[aggregator + clusterer]');
const all = collectLevels({ ...ctx, intraday, price: last.close }, 'all');
ok('collectLevels tags every level with source', all.length > 0 && all.every(l => l.source));
ok('collectLevels sorted by price', all.every((l, i) => i === 0 || l.price >= all[i - 1].price));
ok('registry exposes 7 sources', Object.keys(LEVEL_SOURCES).length === 7);
const zones = clusterLevels(all, 10, instrument);
ok('clusterLevels merges into scored zones', zones.length > 0 && zones.every(z => z.score > 0 && Array.isArray(z.sources)));
ok('zones sorted by score desc', zones.every((z, i) => i === 0 || z.score <= zones[i - 1].score));
ok('a multi-source zone aggregates sources', zones.some(z => z.count >= 2));

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
