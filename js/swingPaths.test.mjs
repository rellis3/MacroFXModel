// Swing Map Monte Carlo: reproducible, random walk when k = 0, and the pull does what it says.
//   node js/swingPaths.test.mjs
import { simulatePaths, touchShare, mulberry32, driftSegments, zoneWalk, gammaPullScores, HEDGE_W } from './swingPaths.js';
import { bsGamma } from './gammaGreeks.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };

console.log('[reproducible and sane]');
{
  const a = simulatePaths({ close: 100, sigma: 0.01, sessions: 20, n: 1500, seed: 7 });
  const b = simulatePaths({ close: 100, sigma: 0.01, sessions: 20, n: 1500, seed: 7 });
  ok('same seed, same answer', JSON.stringify(a.quantiles) === JSON.stringify(b.quantiles));
  ok('k = 0 median stays near the start', Math.abs(a.quantiles[20].p50 / 100 - 1) < 0.01, String(a.quantiles[20].p50));
  const spread = Math.log(a.quantiles[20].p90 / a.quantiles[20].p10);
  ok('p10-p90 spread ~ 2 x 1.2816 x sigma x sqrt(20)', Math.abs(spread - 2 * 1.2816 * 0.01 * Math.sqrt(20)) < 0.01, spread.toFixed(4));
  ok('no expiries, no drift', a.drift.every(d => d.d === 0));
  ok('bad input -> null', simulatePaths({ close: 0, sigma: 0.01 }) === null);
  const r = mulberry32(1); const xs = Array.from({ length: 1000 }, r);
  ok('rng in [0,1)', xs.every(x => x >= 0 && x < 1));
}

console.log('[the pull: near expiry down, far expiry up]');
{
  const ex = [{ s: 5, target: 97, oi: 1000 }, { s: 15, target: 104, oi: 1000 }];
  const p = simulatePaths({ close: 100, sigma: 0.005, sessions: 15, expiries: ex, k: 1, n: 3000, seed: 3 });
  ok('median dips toward the 5-session target first', p.quantiles[5].p50 < 99, String(p.quantiles[5].p50));
  ok('then turns up toward the 15-session target', p.quantiles[15].p50 > p.quantiles[5].p50 + 2, `${p.quantiles[5].p50} -> ${p.quantiles[15].p50}`);
  ok('most-touched path follows the same shape', p.modal[5].px < 99.5 && p.modal[15].px > 101, `${p.modal[5].px} ${p.modal[15].px}`);
  ok('drift switches sign as the near expiry rolls off', p.drift[0].d < 0 && p.drift[10].d > 0);
  const flat = simulatePaths({ close: 100, sigma: 0.005, sessions: 15, expiries: ex, k: 0, n: 3000, seed: 3 });
  ok('k = 0 with the same expiries is a plain walk', Math.abs(flat.quantiles[15].p50 - 100) < 0.6);
  ok('touch share of the far target higher with the pull', touchShare(p, 104) > touchShare(flat, 104));
}

console.log('[drift segments in words]');
{
  const d = [-1, -1, -1, 1, 1, 1, 1, -0.1, 1, 1].map((x, t) => ({ t, d: x }));
  const sg = driftSegments(d);
  ok('down then up, a one-day wobble folded in', sg.text === 'down days 1-3, up days 4-10', sg.text);
}

console.log('[zone walk: north, south, north by expiry date]');
{
  const z = (px, oi, b = 0) => ({ px, oi, buildStreak: b });
  const ex = [
    { expiry: '2026-11-06', dte: 4, totalOI: 3000, maxPain: 3850, centrePx: 3860, zones: [z(3850, 900, 3), z(4000, 400)] },
    { expiry: '2026-11-04', dte: 2, totalOI: 3000, maxPain: 3950, centrePx: 3940, zones: [z(3900, 500), z(4000, 1000)] },
    { expiry: '2026-11-24', dte: 22, totalOI: 9000, maxPain: 4000, centrePx: 3990, zones: [z(4100, 3000)] },
    { expiry: '2026-11-12', dte: 10, totalOI: 100, thin: true, maxPain: 3500, centrePx: 3500, zones: [z(3500, 100)] },
  ];
  const w = zoneWalk(ex, { close: 3876 });
  ok('date order, thin book skipped', w.points.map(p => p.expiry).join() === '2026-11-04,2026-11-06,2026-11-24');
  ok('each step goes to that expiry\'s biggest strike', w.points.map(p => p.px).join() === '4000,3850,4100');
  ok('north, south, north', w.points.map(p => p.dir).join() === 'up,down,up' && w.runs.length === 3);
  ok('each step starts where the last ended', w.points[1].from === 4000 && w.points[0].from === 3876);
  ok('strength is share of all OI, building flag', Math.abs(w.points[1].strength - 900 / 15100) < 1e-12 && w.points[1].building);
  const mp = zoneWalk(ex, { close: 3876, anchor: 'maxPain' });
  ok('max-pain anchor', mp.points.map(p => p.px).join() === '3950,3850,4000');
  const up = zoneWalk([ex[1], ex[2]], { close: 3876 });
  ok('same-way steps merge into one run', up.runs.length === 1 && up.runs[0].px === 4100, up.text);
  ok('no close, no walk', zoneWalk(ex, {}).points.length === 0);
  const th = zoneWalk(ex, { close: 3876, includeThin: true });
  ok('includeThin keeps the thin book, flagged', th.points.length === 4 && th.points[2].expiry === '2026-11-12' && th.points[2].thin && !th.points[0].thin);
}

console.log('[zone walk: the reach limit]');
{
  const z = (px, oi) => ({ px, oi });
  // NQ-like: 28,110 close, ~1.4% a day; the 3 Nov book's biggest strike is 24,878 (-11.5% in a day)
  const ex = [
    { expiry: '2026-11-03', dte: 1, totalOI: 8000, zones: [z(24878, 3000), z(28000, 1200), z(28500, 900)] },
    { expiry: '2026-11-05', dte: 3, totalOI: 6000, maxPain: 33000, zones: [z(30378, 2000)] },
    { expiry: '2026-11-21', dte: 19, totalOI: 24000, zones: [z(29878, 5000)] },
  ];
  const raw = zoneWalk(ex, { close: 28110 });
  const w = zoneWalk(ex, { close: 28110, sigma: 0.014, date: '2026-11-02' });
  ok('without a limit the walk drops to 24,878 in a day', raw.points[0].px === 24878);
  ok('with it, the 3 Nov step goes to the biggest strike in reach (28,000), flagged not-the-biggest', w.points[0].px === 28000 && w.points[0].notBiggest, JSON.stringify(w.points[0]));
  ok('a book with nothing in reach is skipped and listed (30,378 is +8.5% in 2 days)', w.skipped.some(s => s.expiry === '2026-11-05') && !w.points.some(p => p.expiry === '2026-11-05'), JSON.stringify(w.skipped));
  ok('a far expiry with more time can still take a bigger step', w.points.some(p => p.expiry === '2026-11-21' && p.px === 29878));
  ok('every step within its range', w.points.every(p => Math.abs(p.movePct) <= p.capPct + 1e-9));
  ok('max pain out of range is skipped too', zoneWalk(ex, { close: 28110, sigma: 0.014, date: '2026-11-02', anchor: 'maxPain' }).skipped.some(s => s.expiry === '2026-11-05'));
}

console.log('[zone walk: gamma pull]');
{
  // NQ-like, 28,110 close: the 3 Nov book holds 3,000 puts at 24,878 (protection, -11.5%) and 1,200 at 28,000
  const ex = [
    { expiry: '2026-11-03', dte: 1, totalOI: 8000, ladder: [[24878, 0, 3000], [28000, 600, 600], [28500, 900, 0]] },
    { expiry: '2026-11-20', dte: 18, totalOI: 30000, ladder: [[28000, 500, 500], [29500, 6000, 0], [24000, 0, 9000]] },
  ];
  const w = zoneWalk(ex, { close: 28110, anchor: 'gamma', vol: 0.014, date: '2026-11-02' });
  ok('a 1-day book pulls to the big strike next to price, not the far protection', w.points[0].px === 28000, JSON.stringify(w.points[0]));
  ok('and says where the biggest strike really is', w.points[0].biggest?.px === 24878 && w.points[0].notBiggest);
  ok('an 18-day book can still pull to a big zone 5% away', w.points[1].px === 29500, JSON.stringify(w.points[1]));
  ok('pullShare is a share', w.points.every(p => p.pullShare > 0 && p.pullShare <= 1));
  const sc = gammaPullScores([[27000, 0, 1000], [29200, 0, 1000]], 28110, 5 / 252, 0.014 * Math.sqrt(252));
  ok('far puts below count at HEDGE_W against the same puts above', Math.abs(sc[0].score / sc[1].score - HEDGE_W * bsGamma(28110, 27000, 5 / 252, 0.014 * Math.sqrt(252)) / bsGamma(28110, 29200, 5 / 252, 0.014 * Math.sqrt(252))) < 1e-9);
  ok('no ladder: falls back to the top zones', zoneWalk([{ expiry: '2026-11-03', dte: 1, totalOI: 1, zones: [{ px: 28000, oi: 5 }] }], { close: 28110, anchor: 'gamma', vol: 0.014, date: '2026-11-02' }).points[0]?.px === 28000);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
