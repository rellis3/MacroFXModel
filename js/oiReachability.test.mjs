// OI-WALL REACHABILITY — the calibration is the point, so it is what gets tested.
//   node js/oiReachability.test.mjs
//
// The raw pTouch from forecastPathCore is over-confident by ~9pp on real EUR/USD data
// (a "94%" touches 68% of the time). These assertions pin the correction's SHAPE, so a
// future change to the cone cannot quietly reintroduce the over-confidence.

import { REACH_CALIB, calibrateTouch, wallReachability, firstTouchRace, visitDensity } from './oiReachability.js';
import { buildIntradayContext } from './forecastPathCore.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };

// Synthetic random walk — enough bars to warm the context up, deterministic.
function bars(n = 700, s0 = 1.1000, vol = 0.0004) {
  let seed = 12345, s = s0, t = 1780000000;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = (rnd() - 0.5) * vol * 2, c = s * (1 + d);
    const hi = Math.max(s, c) * (1 + rnd() * vol * 0.5), lo = Math.min(s, c) * (1 - rnd() * vol * 0.5);
    out.push({ time: t, open: s, high: hi, low: lo, close: c });
    s = c; t += 300;
  }
  return out;
}

console.log('[calibration map]');
{
  ok('monotonic non-decreasing', REACH_CALIB.every((p, i) => i === 0 || p[1] >= REACH_CALIB[i - 1][1]),
    REACH_CALIB.map(p => p[1]).join(' '));
  // The whole reason this exists: high raw values must be pulled DOWN hard.
  ok('raw 94% is corrected down to ~68%', Math.abs(calibrateTouch(0.94) - 0.68) < 0.01, `${calibrateTouch(0.94)}`);
  ok('raw 74% is corrected down to ~59%', Math.abs(calibrateTouch(0.74) - 0.59) < 0.01, `${calibrateTouch(0.74)}`);
  // …and low ones nudged UP, which is the other half of the measured miss.
  ok('raw 5% is corrected up to ~11%', Math.abs(calibrateTouch(0.05) - 0.11) < 0.01, `${calibrateTouch(0.05)}`);
  ok('mid-range is barely touched (24% → 23%)', Math.abs(calibrateTouch(0.24) - 0.23) < 0.01, `${calibrateTouch(0.24)}`);
  ok('interpolates between fitted points', (() => {
    const v = calibrateTouch(0.295);                      // between 0.24→0.23 and 0.34→0.31
    return v > 0.23 && v < 0.31;
  })(), `${calibrateTouch(0.295)}`);
  // No extrapolation past the data: the model must never claim near-certainty, because
  // nothing in six months of bars touched more often than ~69% at this horizon.
  ok('never returns more than the observed ceiling', calibrateTouch(1.0) <= 0.69 && calibrateTouch(0.999) <= 0.69,
    `${calibrateTouch(1.0)}`);
  ok('stays monotonic across the whole input range', (() => {
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.01) { const v = calibrateTouch(p); if (v < prev - 1e-9) return false; prev = v; }
    return true;
  })());
  ok('garbage in → null', calibrateTouch(null) === null && calibrateTouch(NaN) === null);
}

console.log('[wall reachability]');
{
  const b = bars(), ctx = buildIntradayContext(b, {});
  const i = b.length, spot = b[i - 1].close;
  const walls = [
    { price: spot * 1.0008, type: 'call_wall', label: 'near call' },
    { price: spot * 1.0100, type: 'call_wall', label: 'far call' },
    { price: spot * 0.9992, type: 'put_wall',  label: 'near put' },
  ];
  const rows = wallReachability(ctx, i, walls, 12, { nPaths: 200 });
  ok('one row per wall', rows.length === 3, `${rows.length}`);
  ok('sorted nearest-first', Math.abs(rows[0].distFrac) <= Math.abs(rows[rows.length - 1].distFrac));
  ok('every row carries BOTH raw and calibrated', rows.every(r => Number.isFinite(r.raw) && Number.isFinite(r.calibrated)));
  ok('a far wall is less reachable than a near one', (() => {
    const near = rows.find(r => r.label === 'near call'), far = rows.find(r => r.label === 'far call');
    return near.calibrated > far.calibrated;
  })(), rows.map(r => r.label + ':' + r.calibrated).join(' '));
  ok('calibrated never exceeds the ceiling', rows.every(r => r.calibrated <= 0.69));
  ok('side is labelled correctly', rows.find(r => r.label === 'near put').side === 'down');
  ok('provenance of the correction is recorded', rows.every(r => r.calibSource === 'eurusd-m5-1h' && r.calibExact === true && r.calibOosErrPp === 1.7));
  ok('empty / junk input → []', wallReachability(ctx, i, [], 12).length === 0
    && wallReachability(null, i, walls, 12).length === 0);
}

console.log('[first-touch race]');
{
  const b = bars(), ctx = buildIntradayContext(b, {});
  const i = b.length, spot = b[i - 1].close;
  const r = firstTouchRace(ctx, i, spot * 1.002, spot * 0.998, 12, { nPaths: 200 });
  ok('returns a result', !!r);
  ok('the three outcomes sum to 1', Math.abs(r.upFirst + r.downFirst + r.neither - 1) < 1e-6,
    `${r.upFirst}+${r.downFirst}+${r.neither}`);
  // A race is not two independent touch probabilities — it must answer ORDER.
  ok('a much nearer downside target wins the race', (() => {
    const skew = firstTouchRace(ctx, i, spot * 1.02, spot * 0.999, 12, { nPaths: 200 });
    return skew.downFirst > skew.upFirst;
  })());
  ok('one-sided target still works', (() => {
    const one = firstTouchRace(ctx, i, spot * 1.002, 0, 12, { nPaths: 200 });
    return one && one.downFirst === 0 && one.upFirst > 0;
  })());
  ok('labelled as uncorrected, since the barrier calibration does not transfer',
    /uncorrected/i.test(r.note || ''));
  ok('no targets at all → null', firstTouchRace(ctx, i, 0, 0, 12) === null);
}

console.log('[visit density]');
{
  const b = bars(), ctx = buildIntradayContext(b, {});
  const i = b.length, spot = b[i - 1].close;
  const d = visitDensity(ctx, i, 12, { bins: 20, nPaths: 150 });
  ok('returns a histogram', !!d && d.bins.length === 20, `${d?.bins.length}`);
  ok('shares sum to 1', Math.abs(d.bins.reduce((s, x) => s + x.share, 0) - 1) < 0.01);
  ok('range brackets the anchor', d.lo < spot && d.hi > spot, `${d.lo} < ${spot} < ${d.hi}`);
  // The reason "most touched PATH" is the wrong question: mass piles up around spot,
  // so a modal path would be flat for every instrument, every time.
  ok('density peaks near the anchor, not at an extreme', (() => {
    const peak = d.bins.reduce((m, x) => (x.count > m.count ? x : m));
    return Math.abs(peak.mid - spot) < (d.hi - d.lo) * 0.3;
  })());
  ok('rel is normalised to the peak', Math.abs(Math.max(...d.bins.map(x => x.rel)) - 1) < 1e-9);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
