/**
 * Unit tests for yieldCouplingCore — pure, synthetic, no network.
 * Run: node js/yieldCouplingCore.test.mjs
 */
import {
  standardize, alignByTime, buildSpread, pearson, rollingCorr,
  gapSeries, bestLag, directionSignal, computeCoupling,
  toReturns, sessionOfUTCHour, sessionBreakdown, computeReturnsCoupling,
  laggedAutocorr, computeCouplingPersistence, couplingState,
  computePriorDayProjection, computeDailyLeadLag, computeDivergenceEvents,
  backtestDivergenceFade,
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

// ── laggedAutocorr ────────────────────────────────────────────────────────────
{
  const ramp = Array.from({ length: 50 }, (_, i) => i);   // monotone → high short-lag autocorr
  ok('laggedAutocorr high on ramp', laggedAutocorr(ramp, 1) > 0.99);
  const alt = Array.from({ length: 50 }, (_, i) => (i % 2 ? 1 : -1));
  ok('laggedAutocorr −1 on alternating', approx(laggedAutocorr(alt, 1), -1, 1e-9));
}

// ── computeCouplingPersistence (sticky regime + structure) ────────────────────
{
  // Two regimes: first half strongly coupled (b=+a moves), second half decoupled
  // (independent). Rolling coupling should be persistent within each half.
  const n = 800;
  const price = [0], spread = [0];
  for (let i = 1; i < n; i++) {
    const step = ((i * 2654435761) % 1000) / 1000 - 0.5;       // deterministic pseudo-noise
    price.push(price[i-1] + step);
    const coupled = i < n/2;
    const sStep = coupled ? step : (((i * 40503) % 1000)/1000 - 0.5);
    spread.push(spread[i-1] + sStep);
  }
  const times = Array.from({ length: n }, (_, i) => `2026-01-05T${String(9 + (i % 6)).padStart(2,'0')}:00:00Z`);
  const p = computeCouplingPersistence(price, spread, times, { corrWindow: 40, fwdBars: 20, autocorrLags: [5, 20] });
  ok('persistence emits autocorr', p.autocorr.length === 2 && Number.isFinite(p.autocorr[0].corr));
  ok('persistence coupling is sticky', p.autocorr[0].corr > 0.3);
  ok('persistence forward buckets', p.forwardCoupling.coupled.n > 0 && p.forwardCoupling.decoupled.n > 0);
  ok('persistence coupled fwd > decoupled fwd', p.forwardCoupling.coupled.mean > p.forwardCoupling.decoupled.mean);
  ok('persistence directional buckets', Number.isFinite(p.directional.coupled.hit));
}

// ── couplingState (live confirmation reading) ─────────────────────────────────
{
  const n = 120;
  const times = Array.from({ length: n }, (_, i) => `2026-01-05T13:${String(i%60).padStart(2,'0')}:00Z`); // Overlap
  // Coupled + both rising over the last `look` → confirmed.
  const price = Array.from({ length: n }, (_, i) => i + (((i*7)%3)-1)*0.1);
  const spread = Array.from({ length: n }, (_, i) => 2*i + (((i*7)%3)-1)*0.2);
  const st = couplingState(price, spread, times, { corrWindow: 30, look: 10 });
  ok('couplingState coupled', st.coupled === true);
  ok('couplingState session Overlap', st.session === 'Overlap');
  ok('couplingState confirmed', st.state === 'confirmed');
  // Decoupled: spread is flat noise, price trends → low coupling.
  const flatSpread = Array.from({ length: n }, (_, i) => (((i*13)%5)-2)*0.01);
  const st2 = couplingState(price, flatSpread, times, { corrWindow: 30, look: 10 });
  ok('couplingState decoupled state', st2.state === 'decoupled' || st2.coupled === false);
}

// ── computePriorDayProjection (today price = yesterday yield ⇒ perfect) ───────
{
  const T = 50, D = 8;
  const yieldPaths = [];
  for (let d = 0; d < D; d++) { const path = []; let v = 0; for (let t = 0; t < T; t++) { v += ((d*7 + t*13) % 5) - 2; path.push(v); } yieldPaths.push(path); }
  const times = [], price = [], spread = [];
  for (let d = 0; d < D; d++) for (let t = 0; t < T; t++) {
    times.push(`2026-01-${String(d+1).padStart(2,'0')}T00:${String(t).padStart(2,'0')}:00Z`);
    spread.push(yieldPaths[d][t]);
    price.push(d > 0 ? yieldPaths[d-1][t] : 0);   // today's price = yesterday's yield path
  }
  const proj = computePriorDayProjection(price, spread, times, { minBarsPerDay: 20 });
  ok('priorDay shape pooled high', proj.shapeCorr.pooled > 0.9);
  ok('priorDay pctPositive high', proj.shapeCorr.pctPositive > 0.8);
  ok('priorDay dirHit high', proj.dailyDirHit.hit > 0.8);
  ok('priorDay nDays counted', proj.shapeCorr.nDays >= 6);
}
// null case: price independent of yesterday's yield ⇒ dirHit not near-perfect
{
  const T = 50, D = 12, times = [], price = [], spread = [];
  for (let d = 0; d < D; d++) { let pv = 0, sv = 0; for (let t = 0; t < T; t++) {
    times.push(`2026-02-${String(d+1).padStart(2,'0')}T00:${String(t).padStart(2,'0')}:00Z`);
    pv += ((d*31 + t*17) % 7) - 3; sv += ((d*13 + t*29) % 7) - 3;   // unrelated walks
    price.push(pv); spread.push(sv);
  } }
  const proj = computePriorDayProjection(price, spread, times, { minBarsPerDay: 20 });
  ok('priorDay null dirHit not perfect', !(proj.dailyDirHit.hit > 0.9));
}

// ── computeDailyLeadLag (spread leads price by a known lag) ────────────────────
{
  // Deterministic spread random-walk; fx follows it with a 3-day lag: fx[t]=spread[t-3].
  let s = 0; const spread = [];
  for (let i = 0; i < 400; i++) { s += ((i * 2654435761) % 1000) / 1000 - 0.5; spread.push(s); }
  const fx = spread.map((_, i) => (i - 3 >= 0 ? spread[i - 3] : spread[0]));
  const ll = computeDailyLeadLag(fx, spread, { maxLagDays: 10, lookback: 3, horizon: 3 });
  ok('dailyLeadLag finds +3 lead', ll.bestLag === 3);
  ok('dailyLeadLag strong at lead', Math.abs(ll.bestCorr) > 0.9);
  ok('dailyLeadLag momentum predicts', ll.momentum.hitRate > 0.8 && ll.momentum.n > 50);
  ok('dailyLeadLag profile length', ll.profile.length === 11);
}

// ── computeDivergenceEvents (big gap ⇒ FX converges; edge rises with size) ─────
{
  // fx ≈ spread + small noise, with periodic LARGE divergences injected that then
  // revert to spread over 8 bars. Large |gap| days (the injections) should show a
  // high forward convergence hit-rate; small-gap (noise) days ≈ chance.
  const n = 1000; const spread = [], fx = [];
  let sp = 0;
  for (let i = 0; i < n; i++) { sp += (((i * 2654435761) % 100) / 100 - 0.5); spread.push(sp); }
  for (let i = 0; i < n; i++) fx.push(spread[i] + (((i * 40503) % 100) / 100 - 0.5) * 0.3);
  for (let t = 40; t < n - 15; t += 30) {
    const mag = 8 * (((t / 30) % 2) ? 1 : -1);          // alternate up/down divergences
    for (let k = 0; k < 8; k++) if (t + k < n) fx[t + k] = spread[t + k] + mag * (1 - k / 8);
  }
  const de = computeDivergenceEvents(fx, spread, { window: 8, horizons: [6], buckets: 4 });
  ok('divEvents has buckets', de.buckets.length === 4);
  const small = de.buckets[0].horizons[6].hit;
  const largeMax = Math.max(de.buckets[2].horizons[6].hit, de.buckets[3].horizons[6].hit);
  ok('divEvents large-gap converges', largeMax > 0.6);
  ok('divEvents edge rises with size', largeMax > small);
  ok('divEvents counts present', de.buckets[3].horizons[6].n > 20);
}

// ── backtestDivergenceFade (reverting series ⇒ positive OOS; structure sane) ───
{
  const n = 1200; const spread = [], fx = [], times = [];
  let sp = 0;
  for (let i = 0; i < n; i++) { sp += (((i * 2654435761) % 100) / 100 - 0.5); spread.push(sp);
    const d = new Date(Date.UTC(2010, 0, 1) + i * 86400000).toISOString().slice(0, 10); times.push(d); }
  for (let i = 0; i < n; i++) fx.push(spread[i] + (((i * 40503) % 100) / 100 - 0.5) * 0.3);
  for (let t = 40; t < n - 15; t += 25) {
    const mag = 8 * (((t / 25) % 2) ? 1 : -1);
    for (let k = 0; k < 8; k++) if (t + k < n) fx[t + k] = spread[t + k] + mag * (1 - k / 8);
  }
  const bt = backtestDivergenceFade(fx, spread, times, { window: 8, gapQuantile: 0.8, horizon: 6, costPct: 0, isFrac: 0.6 });
  ok('backtest produces trades', bt.nTrades > 10);
  ok('backtest has IS+OOS', bt.is.trades > 0 && bt.oos.trades > 0);
  ok('backtest OOS positive expectancy', bt.oos.expectancy > 0);
  ok('backtest cost-stress present', bt.costStress.length === 3);
  ok('backtest R:R computed', Number.isFinite(bt.oos.rr));
}

console.log(`yieldCouplingCore: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
