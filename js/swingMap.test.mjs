// Swing Map engine: parity with the Python look-back and the shape of the picture.
//   node js/swingMap.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSwingMap, zigzag, sigmaSeries, BASE_RATES, pullByBucket, signalCheck } from './swingMap.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'analysis/output/swing-leg-baserates');
let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };

const readBars = f => fs.readFileSync(f, 'utf8').trim().split('\n').slice(1).map(l => { const [d, , , , c] = l.split(','); return { date: d, close: +c }; })
  .filter(b => ![0, 6].includes(new Date(`${b.date}T12:00:00Z`).getUTCDay()));

console.log('[parity: zigzag legs match analyse.py on the committed OANDA bars]');
for (const inst of ['XAUUSD', 'EURUSD', 'NAS100']) {
  // analyse.py's glitch filter (|r| < 0.25) also drops the first bar (its return is NaN), so start one bar later
  const bars = readBars(path.join(OUT, 'daily_m15', `${inst}.csv`)).slice(1);
  const sig = sigmaSeries(bars.map(b => b.close));
  const i0 = sig.findIndex(Number.isFinite);
  const { legs } = zigzag(bars.slice(i0), sig.slice(i0));
  const py = fs.readFileSync(path.join(OUT, 'legs_m15.csv'), 'utf8').trim().split('\n').slice(1).map(l => l.split(','))
    .filter(r => r[r.length - 1] === inst).map(r => ({ start: r[0].slice(0, 10), end: r[1].slice(0, 10), sigma: +r[4] }));
  const same = legs.length === py.length && legs.every((l, i) => l.start === py[i].start && l.end === py[i].end && Math.abs(l.sigma - py[i].sigma) < 1e-6);
  ok(`${inst}: ${legs.length} legs identical to Python`, same, `${legs.length} vs ${py.length}`);
}

console.log('[base rates copied from the frozen results file]');
{
  const r = JSON.parse(fs.readFileSync(path.join(OUT, 'results_m15.json'), 'utf8'));
  const s = r.states['down_1.0'], b = r.baseline_every_5th_day.down;
  const a = BASE_RATES.afterFall;
  ok('after-fall numbers match', a.n === s.n && a.ret20 === s.ret20_mean && a.pBounceFirst === s.p_bounce_first && a.ret20Ci[0] === s.ret20_mean_ci[0]);
  ok('baseline numbers match', a.baseline.ret20 === b.ret20_mean && a.baseline.pBounceFirst === b.p_bounce_first);
  ok('leg medians match', BASE_RATES.legs.down.median === r.legs.down.sigma_units.median && BASE_RATES.legs.up.median === r.legs.up.sigma_units.median);
}

console.log('[the picture for gold]');
{
  const bars = readBars(path.join(OUT, 'daily', 'XAUUSD.csv'));
  const lad = { oh: { p50: 2, p75: 3, p90: 4.5 }, ol: { p50: 2.1, p75: 3.2, p90: 4.6 }, sigma_used_pct: 3, half_life_days: 20 };
  const m = buildSwingMap(bars, { ladderWeeklyRev: lad, ladderMonthlyRev: { oh: { p50: 4, p75: 6, p90: 9 }, ol: { p50: 4, p75: 6, p90: 9 } },
    expiries: [{ expiry: '2026-11-24', dte: 25, zones: [{ px: 4000, oi: 900 }, { px: 3000, oi: 50 }] }] });
  ok('ok', m.ok);
  ok('current leg is the 24 Aug down leg', m.live?.dir === 'down' && m.live.start === '2026-08-24', JSON.stringify(m.live));
  ok('fall signal on (as the look-back reported)', m.state.fallSignal === true);
  ok('weekly band from the ladder, priced off the close', Math.abs(m.bands[0].p90.down - m.state.close * (1 - 0.046)) < 1e-6 && m.bands[0].proof === 'VALIDATED');
  ok('zone inside / outside the weekly p90', m.expiries[0].zones[0].inWeeklyP90 === true && m.expiries[0].zones[1].inWeeklyP90 === false);
  ok('expiries tagged UNTESTED', m.expiries[0].proof === 'UNTESTED');
  ok('bounce barrier above, flush below', m.barriers.bounce > m.state.close && m.barriers.flush < m.state.close);
  ok('two paths, odds sum to 1, condition-on uses the look-back share', m.paths.length === 2 && Math.abs(m.paths[0].prob + m.paths[1].prob - 1) < 1e-9 && m.paths[0].prob === BASE_RATES.afterFall.pBounceFirst);
  ok('path A climbs to the bounce barrier then the monthly p75 high', m.paths[0].points[1].px === m.barriers.bounce && m.paths[0].points[2].px === m.bands[1].p75.up);
  ok('path B waypoint dates are weekdays after the last close', m.paths[1].points.slice(1).every(p => p.date > m.state.date && ![0, 6].includes(new Date(p.date + 'T12:00:00Z').getUTCDay())));
  ok('pull summary present (empty book is fine)', m.pull && Array.isArray(m.pull.buckets));
  ok('pivots alternate high/low and include the 24 Aug major high', m.pivots.some(p => p.date === '2026-08-24' && p.type === 'high' && p.major) && m.pivots.every((p, i) => i === 0 || p.date > m.pivots[i - 1].date), String(m.pivots.length));
  ok('minor pivots outnumber major ones', m.pivots.filter(p => !p.major).length > 0);
  ok('too few bars refused', buildSwingMap(bars.slice(0, 100)).ok === false);
}

console.log('[pull by DTE bucket: lean and where it changes side]');
{
  const e = (expiry, dte, shareAbove, totalOI, hist = []) => ({ expiry, dte, shareAbove, pullPct: (shareAbove - 0.5) * 4, totalOI, buildAbove: 10, buildBelow: 5, history: hist });
  const p = pullByBucket([e('2026-11-06', 5, 0.3, 1000, [['d', 5, 0, 0.3, 50, 200, 1000, 0]]), e('2026-11-20', 19, 0.48, 500), e('2026-12-24', 53, 0.7, 2000, [['d', 53, 0, 0.7, 300, 20, 2000, 0], ['e', 52, 0, 0.7, 0, 0, 2000, 1]])]);
  ok('near bucket leans down, far bucket leans up', p.buckets[0].lean === 'down' && p.buckets[2].lean === 'up' && p.buckets[1].lean === 'balanced');
  ok('one flip, down to up', p.flips.length === 1 && p.flips[0].from === 'down' && p.flips[0].to === 'up' && p.flips[0].firstExpiry === '2026-12-24');
  ok('recent build sums skip stale nights', p.buckets[2].recentBuildAbove === 300 && p.buckets[0].buildLean === 'down');
  ok('empty bucket has no lean', p.buckets[3].n === 0 && p.buckets[3].lean === null);
}

console.log('[thin books and the agreement line]');
{
  const ex = [
    { expiry: '2026-11-03', dte: 3, totalOI: 7770, shareAbove: 0.59, greeks: { charm1d: -13, charmNotional: -7.4e6 } },
    { expiry: '2026-11-10', dte: 10, totalOI: 1588, shareAbove: 0.78, greeks: { charm1d: -8 } },
    { expiry: '2026-11-12', dte: 11, totalOI: 261, shareAbove: 0.38 },
    { expiry: '2026-11-21', dte: 21, totalOI: 24433, shareAbove: 0.69 },
  ].map(e => ({ ...e, thin: e.totalOI < 0.1 * 34052 }));
  const sg = signalCheck(ex, { dir: 'down' });
  ok('a 261-contract book is thin; the 7,770 one is not', ex[2].thin && !ex[0].thin && ex[1].thin);
  ok('near lean up while near charm sells -> they disagree', sg.nearLean === 'up' && sg.charm === 'sell' && sg.agree === false, sg.text);
  ok('thin books are left out of the buckets', pullByBucket(ex).buckets[1].n === 1);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
