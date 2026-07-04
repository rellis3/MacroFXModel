/**
 * Unit tests for yieldCouplingCore — pure, synthetic, no network.
 * Run: node js/yieldCouplingCore.test.mjs
 */
import {
  standardize, alignByTime, buildSpread, pearson, rollingCorr,
  gapSeries, bestLag, directionSignal, computeCoupling,
  toReturns, sessionOfUTCHour, sessionBreakdown, computeReturnsCoupling,
} from './yieldCouplingCore.js';

let pass = 0, fail = 0;
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + name); } }

// ── standardize ───────────────────────────────────────────────────────────────
{
  const { z, mean, std } = standardize([1, 2, 3, 4, 5]);
  ok('standardize mean', approx(mean, 3));
  ok('standardize zero-centred', approx(z[2], 0));
  ok('standardize symmetric', approx(z[0], -z[4]));
  ok('standardize std>0', std > 0);
  const flat = standardize([7, 7, 7]);
  ok('standardize flat→0', flat.z.every(v => v === 0));
  const withNaN = standardize([1, NaN, 3]);
  ok('standardize passes NaN', Number.isNaN(withNaN.z[1]));
}

// ── alignByTime (inner join on common timestamps) ─────────────────────────────
{
  const A = [{ t: '01', v: 10 }, { t: '02', v: 20 }, { t: '03', v: 30 }];
  const B = [{ t: '02', v: 2 },  { t: '03', v: 3 },  { t: '04', v: 4 }];
  const { times, columns } = alignByTime([A, B]);
  ok('align common times', times.join(',') === '02,03');
  ok('align col A', columns[0].join(',') === '20,30');
  ok('align col B', columns[1].join(',') === '2,3');
  const withNaN = alignByTime([[{ t: '01', v: 1 }, { t: '02', v: NaN }], [{ t: '01', v: 9 }, { t: '02', v: 8 }]]);
  ok('align drops NaN timestamp', withNaN.times.join(',') === '01');
}

// ── buildSpread (signed bond-price legs) ──────────────────────────────────────
{
  // +USB10Y − DE10YB  →  [+1*10 −1*4, +1*11 −1*5] = [6, 6]
  const sp = buildSpread([{ price: [10, 11], k: +1 }, { price: [4, 5], k: -1 }]);
  ok('buildSpread signed sum', sp.join(',') === '6,6');
  const partial = buildSpread([{ price: [10, NaN], k: +1 }, { price: [4, 5], k: -1 }]);
  ok('buildSpread NaN propagates', partial[0] === 6 && Number.isNaN(partial[1]));
}

// ── pearson ───────────────────────────────────────────────────────────────────
{
  ok('pearson perfect +', approx(pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1));
  ok('pearson perfect −', approx(pearson([1, 2, 3, 4], [8, 6, 4, 2]), -1));
  ok('pearson flat→NaN', Number.isNaN(pearson([1, 1, 1], [1, 2, 3])));
  ok('pearson too-short→NaN', Number.isNaN(pearson([1], [2])));
}

// ── rollingCorr ───────────────────────────────────────────────────────────────
{
  const a = [1, 2, 3, 4, 5, 6];
  const b = [2, 4, 6, 8, 10, 12];
  const rc = rollingCorr(a, b, 3);
  ok('rollingCorr NaN before full', Number.isNaN(rc[0]) && Number.isNaN(rc[1]));
  ok('rollingCorr =1 for linear', approx(rc[2], 1) && approx(rc[5], 1));
}

// ── gapSeries ─────────────────────────────────────────────────────────────────
{
  const g = gapSeries([1, 2, 3], [0.5, 2, 5]);
  ok('gap subtracts', approx(g[0], 0.5) && approx(g[1], 0) && approx(g[2], -2));
}

// ── bestLag (recover a known lead) ────────────────────────────────────────────
{
  // Non-periodic random walk so the lead is unambiguous (a periodic signal would
  // also match at half-period shifts). b leads a by 2 bars: a[i] = b[i-2].
  let s = 0; const b = [];
  for (let i = 0; i < 120; i++) { s += ((i * 1103515245 + 12345) % 1000) / 1000 - 0.5; b.push(s); }
  const a = b.map((_, i) => (i - 2 >= 0 ? b[i - 2] : NaN));
  const { lag, corr } = bestLag(a, b, 5);
  ok('bestLag recovers +2 lead', lag === 2);
  ok('bestLag corr≈1 at lead', approx(corr, 1, 1e-9));
}

// ── directionSignal (gated by coupling) ───────────────────────────────────────
{
  const rising = [0, 1, 2, 3, 4, 5];
  ok('direction up when coupled+', directionSignal(rising, 0.8, { look: 6 }).sign === 1);
  ok('direction flat when decoupled', directionSignal(rising, 0.1, { look: 6 }).sign === 0);
  // Inverse coupling flips a rising spread to a DOWN price call.
  ok('direction flips on − coupling', directionSignal(rising, -0.8, { look: 6 }).sign === -1);
  const falling = [5, 4, 3, 2, 1, 0];
  ok('direction down when coupled+', directionSignal(falling, 0.8, { look: 6 }).sign === -1);
}

// ── computeCoupling (end-to-end on a coupled synthetic pair) ──────────────────
{
  // Price tracks spread with a small lag + noise; expect high coincident corr.
  const n = 200;
  const spread = Array.from({ length: n }, (_, i) => Math.sin(i / 8));
  const price  = spread.map((_, i) => (i - 1 >= 0 ? spread[i - 1] : 0) + 0.01 * ((i * 7) % 5 - 2));
  const r = computeCoupling(price, spread, { corrWindow: 40, maxLag: 6 });
  ok('computeCoupling high coincident', r.coincident > 0.9);
  ok('computeCoupling detects lead', r.lag.lag >= 1);
  ok('computeCoupling emits series', r.priceZ.length === n && r.corr.length === n && r.gap.length === n);
  ok('computeCoupling direction set', [-1, 0, 1].includes(r.direction.sign));
}

// ── toReturns ─────────────────────────────────────────────────────────────────
{
  const r = toReturns([10, 12, 11, 15]);
  ok('toReturns[0] NaN', Number.isNaN(r[0]));
  ok('toReturns diffs', approx(r[1], 2) && approx(r[2], -1) && approx(r[3], 4));
}

// ── sessionOfUTCHour ──────────────────────────────────────────────────────────
{
  ok('session Asia early', sessionOfUTCHour(3) === 'Asia');
  ok('session London', sessionOfUTCHour(9) === 'London');
  ok('session Overlap', sessionOfUTCHour(13) === 'Overlap');
  ok('session NY', sessionOfUTCHour(18) === 'NY');
  ok('session Asia late', sessionOfUTCHour(23) === 'Asia');
}

// ── sessionBreakdown (coupling concentrated in one session) ───────────────────
{
  // Build return pairs: London hours perfectly correlated, Asia hours anti-correlated.
  const times = [], a = [], b = [];
  for (let i = 0; i < 20; i++) {
    const hour = i < 10 ? 9 : 3;               // first 10 = London, next 10 = Asia
    times.push(`2026-01-05T${String(hour).padStart(2,'0')}:${String(i%60).padStart(2,'0')}:00Z`);
    const x = (i % 5) - 2;
    a.push(x); b.push(hour === 9 ? x : -x);    // London: b=+a; Asia: b=−a
  }
  const bd = sessionBreakdown(a, b, times);
  ok('sessionBreakdown London +1', approx(bd.London.corr, 1, 1e-9));
  ok('sessionBreakdown Asia −1', approx(bd.Asia.corr, -1, 1e-9));
  ok('sessionBreakdown counts', bd.London.n === 10 && bd.Asia.n === 10);
}

// ── computeReturnsCoupling (returns corr differs from level corr) ─────────────
{
  // A rising ramp + a rising ramp: levels correlate ~+1, but their returns are
  // both constant → returns correlation is NaN (no variance). Confirms returns ≠ levels.
  const n = 60;
  const price  = Array.from({ length: n }, (_, i) => i);
  const spread = Array.from({ length: n }, (_, i) => 2 * i);
  const times  = Array.from({ length: n }, (_, i) => `2026-01-05T${String(9 + (i % 6)).padStart(2,'0')}:00:00Z`);
  ok('level corr ~1 on ramps', approx(pearson(price, spread), 1, 1e-9));
  const rc = computeReturnsCoupling(price, spread, times, { corrWindow: 20, maxLag: 5 });
  ok('returns corr NaN on constant diffs', Number.isNaN(rc.coincident));
  ok('returns emits bySession', typeof rc.bySession.London === 'object');
}

console.log(`yieldCouplingCore: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
