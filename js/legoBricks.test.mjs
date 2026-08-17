// Synthetic, no-network unit tests for the new lego bricks. Each test compares
// the extracted brick against a verbatim copy of the original inline logic to
// prove the extraction changed no numbers, plus a few invariant checks.
//
//   node js/legoBricks.test.mjs

import { bisect, extractBars, resampleTo, bodyRange, calcATR } from './barUtils.js';
import { rollingZScore, rollingPercentile, rollingZAt, linregSlope, ewma, stdev, rankData, spearman, rankIC, mulberry32, blockResample, blockBootstrapIC } from './statsCore.js';
import { atrWilder, adxWilder, ema, rsiWilder } from './indicatorCore.js';
import { summarizeTrades, sharpeRatio, maxDrawdownFromPnls, profitFactor, winRate, sharpeStdError, minTrackRecordLength, skewness, excessKurtosis, histVaR, histCVaR } from './metricsCore.js';
import { FIB_LEVELS, calcFibs } from './fibProjection.js';
import { instrument, pipSize, resolveKey, INSTRUMENT_KEYS } from './instrumentRegistry.js';
import { summarize } from './honestForecastEngine.js';
import { labelOutcome, OUTCOME_LABELERS } from './dayTypeCore.js';
import { createTouchFeatures, TOUCH_DEFAULTS } from './touchFeatures.js';
import { extractTouches, buildPolicy, tradePnl, pnlFor, runPerLine, runRigor, runSensitivity, costForPair, buildSurvivors } from './perLineStrategy.js';
import { backtestStats, portfolioStats, deflatedSharpe } from './backtestStats.js';
import { computeBands } from './forecastCore.js';
import { buildVolatilityPlan } from './volatilityBotPlan.js';
import { refreshVolatilityPlan } from './volatilityBotProducer.js';
import { bucketM1IntoSessions } from './forecastAnalyser.js';
import { londonMidnightSec } from './volBacktestEngine.js';
import { buildOILevelText } from './oiLevelExport.js';
import { computeExpiryLevels, pickNearExpiry, buildOIEntry, oiDayBandFrac, oiBandSelect, oiReprojectBasis, oiRegimeBands } from './oi.js';
import { oiStoreToLevels } from './oiConfluence.js';
import { trailingRangeDistribution, quantile, percentileOf, rangeExhaustionRead } from './rangePercentileCore.js';

let failures = 0;
const ok   = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ── Deterministic synthetic M1 packed series (no Math.random) ────────────────
const N = 6 * 60 * 3;                         // 3h of M1 bars
const times = new Float64Array(N), opens = new Float64Array(N), highs = new Float64Array(N),
      lows = new Float64Array(N), closes = new Float64Array(N);
let px = 1.1000;
const t0 = Date.UTC(2024, 0, 8, 0, 0, 0) / 1000;   // a Monday 00:00 UTC
for (let i = 0; i < N; i++) {
  const drift = 0.00002 * Math.sin(i / 40) + 0.000005;
  const o = px, c = px * (1 + drift), hi = Math.max(o, c) * 1.0001, lo = Math.min(o, c) * 0.9999;
  times[i] = t0 + i * 60; opens[i] = o; highs[i] = hi; lows[i] = lo; closes[i] = c; px = c;
}
const packed = { n: N, times, opens, highs, lows, closes };

console.log('[barUtils]');
// Reference copies (verbatim from asiaRangeEngine.js / rangeFibEngine.js)
function refBisect(t, target) { let lo = 0, hi = t.length; while (lo < hi) { const m = (lo + hi) >>> 1; if (t[m] < target) lo = m + 1; else hi = m; } return lo; }
function refExtract(p, a, b) { const { n, times, opens, highs, lows, closes } = p; const s = refBisect(times, a); const out = []; for (let i = s; i < n && times[i] < b; i++) out.push({ time: times[i], open: opens[i], high: highs[i], low: lows[i], close: closes[i] }); return out; }
function refResample(bars, minutes) { const secs = minutes * 60; const mp = new Map(); for (const bar of bars) { const bk = bar.time - (bar.time % secs); if (!mp.has(bk)) mp.set(bk, { time: bk, open: bar.open, high: bar.high, low: bar.low, close: bar.close }); else { const b = mp.get(bk); b.high = Math.max(b.high, bar.high); b.low = Math.min(b.low, bar.low); b.close = bar.close; } } return [...mp.values()].sort((a, b) => a.time - b.time); }
function refBodyRange(m1, minutes) { if (!m1.length) return null; const bars = refResample(m1, minutes); let high = -Infinity, low = Infinity; for (const bar of bars) { high = Math.max(high, Math.max(bar.open, bar.close)); low = Math.min(low, Math.min(bar.open, bar.close)); } if (!isFinite(high) || !isFinite(low) || low >= high) return null; return { high, low, range: high - low }; }
function refATR(m1, tf, period = 14) { const bars = refResample(m1, tf); if (bars.length < 2) return null; const trs = []; for (let i = 1; i < bars.length; i++) { const b = bars[i], p = bars[i - 1]; trs.push(Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close))); } const sl = trs.slice(-Math.max(period, 1)); return sl.length ? sl.reduce((a, b) => a + b, 0) / sl.length : null; }

ok('bisect matches reference', [t0, t0 + 3600, t0 + 99999].every(tg => bisect(times, tg) === refBisect(times, tg)));
const asiaWin = extractBars(packed, t0, t0 + 6 * 3600);
ok('extractBars matches reference', JSON.stringify(asiaWin) === JSON.stringify(refExtract(packed, t0, t0 + 6 * 3600)));
ok('resampleTo(5m) matches reference', JSON.stringify(resampleTo(asiaWin, 5)) === JSON.stringify(refResample(asiaWin, 5)));
const br = bodyRange(asiaWin, 5), brRef = refBodyRange(asiaWin, 5);
ok('bodyRange matches reference', JSON.stringify(br) === JSON.stringify(brRef), `range=${br && br.range.toExponential(3)}`);
ok('calcATR(30m) matches reference', near(calcATR(asiaWin, 30), refATR(asiaWin, 30), 1e-15));

console.log('[statsCore]');
const arr = Array.from({ length: 300 }, (_, i) => Math.sin(i / 7) * 3 + Math.cos(i / 3));
function refRZ(a, period, clipAt = null) { const out = new Array(a.length).fill(NaN); for (let i = 0; i < a.length; i++) { if (i + 1 < period || !Number.isFinite(a[i])) continue; const win = a.slice(i - period + 1, i + 1).filter(Number.isFinite); if (win.length < period) continue; const m = win.reduce((x, y) => x + y, 0) / win.length; const sd = Math.sqrt(win.reduce((x, y) => x + (y - m) ** 2, 0) / win.length); let z = sd > 0 ? (a[i] - m) / sd : 0; if (clipAt != null) z = Math.max(-clipAt, Math.min(clipAt, z)); out[i] = z; } return out; }
function refRP(a, period) { const out = new Array(a.length).fill(NaN); for (let i = 0; i < a.length; i++) { if (i + 1 < period || !Number.isFinite(a[i])) continue; const win = a.slice(i - period + 1, i + 1).filter(Number.isFinite); if (win.length < period) continue; out[i] = win.filter(v => v <= a[i]).length / win.length * 100; } return out; }
const z = rollingZScore(arr, 50, 3), zRef = refRZ(arr, 50, 3);
ok('rollingZScore matches nasdaqTransforms ref', z.every((v, i) => (Number.isNaN(v) && Number.isNaN(zRef[i])) || near(v, zRef[i], 1e-12)));
const p = rollingPercentile(arr, 50), pRef = refRP(arr, 50);
ok('rollingPercentile matches ref', p.every((v, i) => (Number.isNaN(v) && Number.isNaN(pRef[i])) || near(v, pRef[i], 1e-12)));
function refRZAt(a, idx, period = 200) { const start = Math.max(0, idx - period + 1); const n = idx - start + 1; if (n < 5) return 0; let m = 0; for (let i = start; i <= idx; i++) m += a[i]; m /= n; let v = 0; for (let i = start; i <= idx; i++) { const d = a[i] - m; v += d * d; } const sd = Math.sqrt(v / n); return sd < 1e-12 ? 0 : (a[idx] - m) / sd; }
ok('rollingZAt matches hmm5m ref', [10, 100, 250].every(i => near(rollingZAt(arr, i, 200), refRZAt(arr, i, 200), 1e-12)));
ok('linregSlope sign (rising)', linregSlope([1, 2, 3, 4, 5]) > 0 && near(linregSlope([1, 2, 3, 4, 5]), 1, 1e-9));
ok('ewma seeded + bounded', ewma([1, 1, 1, 1]).every(v => near(v, 1, 1e-12)));
ok('stdev pop vs sample differ', stdev([1, 2, 3], 0) !== stdev([1, 2, 3], 1));

// ── Spearman / rank-IC (rank-IC diagnostic brick) ────────────────────────────
// Reference Spearman via a naive dense-rank-with-ties implementation.
function refRank(a){ const n=a.length; const idx=[...Array(n).keys()].sort((i,j)=>a[i]-a[j]); const r=new Array(n); let i=0; while(i<n){ let j=i; while(j+1<n && a[idx[j+1]]===a[idx[i]]) j++; const avg=(i+j)/2+1; for(let k=i;k<=j;k++) r[idx[k]]=avg; i=j+1; } return r; }
function refSpear(x,y){ const rx=refRank(x), ry=refRank(y); const m=a=>a.reduce((s,v)=>s+v,0)/a.length; const mx=m(rx),my=m(ry); let n=0,dx=0,dy=0; for(let i=0;i<x.length;i++){const a=rx[i]-mx,b=ry[i]-my; n+=a*b; dx+=a*a; dy+=b*b;} return n/Math.sqrt(dx*dy); }
ok('rankData average-rank ties', JSON.stringify(rankData([10, 20, 20, 40])) === JSON.stringify([1, 2.5, 2.5, 4]));
ok('spearman perfect monotonic (nonlinear) = 1', near(spearman([1, 2, 3, 4, 5], [1, 4, 9, 16, 25]), 1, 1e-12));
ok('spearman perfect inverse = -1', near(spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1, 1e-12));
const sx = Array.from({ length: 120 }, (_, i) => Math.sin(i / 5) + i * 0.01);
const sy = Array.from({ length: 120 }, (_, i) => Math.cos(i / 4) - i * 0.008);
ok('spearman matches naive ref', near(spearman(sx, sy), refSpear(sx, sy), 1e-12));
ok('spearman ignores non-finite pairs', near(spearman([1, 2, NaN, 4, 5], [5, 4, 100, 2, 1]), spearman([1, 2, 4, 5], [5, 4, 2, 1]), 1e-12));
ok('spearman constant score → 0', spearman([3, 3, 3, 3], [1, 2, 3, 4]) === 0);
const ric = rankIC([1, 2, 3, 4, 5, 6, 7, 8], [2, 1, 4, 3, 6, 5, 8, 7]);
ok('rankIC reports n + positive t on rising pair', ric.n === 8 && ric.ic > 0 && ric.tStat > 0);
ok('rankIC null pair ≈ 0', Math.abs(rankIC(Array.from({length:200},(_,i)=>i%7), Array.from({length:200},(_,i)=>(i*13)%5)).ic) < 0.2);

// ── mulberry32 / blockResample (2026-07-28: promoted here from backtestStats.js's
// private helpers, which now import these instead of carrying their own copy) —
// bit-compared against a verbatim reference copy of the original private version.
function refMulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function refBlockResample(a, rng, meanBlock) { const n = a.length, out = new Array(n); if (!n) return out; const p = 1 / Math.max(1, meanBlock); let idx = (rng() * n) | 0; for (let i = 0; i < n; i++) { out[i] = a[idx]; idx = (rng() < p) ? (rng() * n) | 0 : (idx + 1) % n; } return out; }
{
  const seq = mulberry32(42), refSeq = refMulberry32(42);
  const draws = Array.from({ length: 20 }, () => seq()), refDraws = Array.from({ length: 20 }, () => refSeq());
  ok('mulberry32 matches original inline PRNG bit-for-bit', JSON.stringify(draws) === JSON.stringify(refDraws));

  const bArr = Array.from({ length: 400 }, (_, i) => Math.sin(i / 11));
  const br = blockResample(bArr, mulberry32(7), 15), brRef = refBlockResample(bArr, refMulberry32(7), 15);
  ok('blockResample matches original inline algorithm bit-for-bit', JSON.stringify(br) === JSON.stringify(brRef));
  ok('blockResample same length as input, all values drawn from input', br.length === bArr.length && br.every(v => bArr.includes(v)));
}

// ── blockBootstrapIC — significance test for two autocorrelated series ──────
{
  const n = 500;
  const xIndep = Array.from({ length: n }, (_, i) => Math.sin(i / 9) + Math.cos(i / 3.3));   // autocorrelated, unrelated to y
  const yIndep = Array.from({ length: n }, (_, i) => Math.sin(i / 5.7 + 2) - i * 0.0003);
  const rIndep = blockBootstrapIC(xIndep, yIndep, { meanBlock: 20, nBoot: 300, seed: 1 });
  ok('blockBootstrapIC runs on two unrelated autocorrelated series', rIndep.ok === true);
  ok('blockBootstrapIC pValue in [0,1]', rIndep.pValue > 0 && rIndep.pValue <= 1);

  const xDep = Array.from({ length: n }, (_, i) => Math.sin(i / 9));
  const yDep = xDep.map(v => v * 2 + 0.001);   // near-perfect monotonic dependence
  const rDep = blockBootstrapIC(xDep, yDep, { meanBlock: 20, nBoot: 300, seed: 1 });
  ok('blockBootstrapIC finds strong dependence significant (p<0.05)', rDep.ic > 0.9 && rDep.pValue < 0.05, `ic=${rDep.ic} p=${rDep.pValue}`);
  ok('blockBootstrapIC deterministic under fixed seed', JSON.stringify(blockBootstrapIC(xDep, yDep, { meanBlock: 20, nBoot: 300, seed: 1 })) === JSON.stringify(rDep));
  ok('blockBootstrapIC too-short series → clean error', blockBootstrapIC([1, 2, 3], [1, 2, 3]).ok === false);
}

console.log('[indicatorCore]');
const bars = resampleTo(extractBars(packed, t0, t0 + 3 * 3600), 5);
function refATRWilder(bars, n = 20) { const out = new Float64Array(bars.length); if (!bars.length) return out; out[0] = Math.abs(+bars[0].high - +bars[0].low); const k = 1 / n; for (let i = 1; i < bars.length; i++) { const h = +bars[i].high, l = +bars[i].low, pc = +bars[i - 1].close; const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)); out[i] = (Number.isFinite(tr) && tr > 0) ? k * tr + (1 - k) * out[i - 1] : out[i - 1]; } return out; }
const aw = atrWilder(bars, 20), awRef = refATRWilder(bars, 20);
ok('atrWilder matches hmm5m ref', aw.every((v, i) => near(v, awRef[i], 1e-15)));
ok('adxWilder in [0,100]', Array.from(adxWilder(bars, 14)).every(v => v >= 0 && v <= 100));
ok('ema responds to step', (() => { const e = ema([0, 0, 0, 10, 10, 10, 10, 10, 10, 10], 3); return e[e.length - 1] > 5 && e[0] === 0; })());
const rsi = rsiWilder(closes.slice(0, 200), 14).filter(Number.isFinite);
ok('rsiWilder in [0,100]', rsi.length > 0 && rsi.every(v => v >= 0 && v <= 100));

console.log('[metricsCore]');
// FROZEN reference: the ORIGINAL honestForecastEngine.summarize body, copied
// verbatim. This keeps the golden test honest even after summarize() is rewired
// to delegate to the brick — both must still equal this frozen baseline.
function refSummarize(records) {
  const filled = records.filter(r => r.filled);
  const n = filled.length;
  if (!n) return { trades: 0, winRate: 0, profitFactor: 0, expectancy: 0, sharpe: 0, maxDD: 0, totalPnl: 0 };
  let wins = 0, grossWin = 0, grossLoss = 0, sumPnl = 0, sumSq = 0, cum = 0, peak = 0, maxDD = 0;
  for (const r of filled) {
    const x = r.pnl_pct; sumPnl += x; sumSq += x * x;
    if (x > 0) { wins++; grossWin += x; } else { grossLoss += -x; }
    cum += x; if (cum > peak) peak = cum; const dd = cum - peak; if (dd < maxDD) maxDD = dd;
  }
  const m = sumPnl / n, variance = Math.max(sumSq / n - m * m, 0), std = Math.sqrt(variance);
  const dates = filled.map(r => r.date).sort();
  const yrs = Math.max((Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / (365.25 * 864e5), 0.25);
  const tradesPerYr = n / yrs, perTradeSharpe = std > 1e-9 ? m / std : 0;
  return { trades: n, tradesPerYr: +tradesPerYr.toFixed(1), winRate: +(wins / n * 100).toFixed(1),
    profitFactor: grossLoss > 1e-9 ? +(grossWin / grossLoss).toFixed(3) : (grossWin > 0 ? 99 : 0),
    expectancy: +m.toFixed(4), sharpe: +(perTradeSharpe * Math.sqrt(tradesPerYr)).toFixed(3),
    maxDD: +maxDD.toFixed(3), totalPnl: +sumPnl.toFixed(3) };
}
const recs = [];
let d = Date.UTC(2022, 0, 3);
for (let i = 0; i < 120; i++) {
  const pnl = +(Math.sin(i / 5) * 0.4 + 0.05).toFixed(4);
  recs.push({ filled: true, pnl_pct: pnl, date: new Date(d).toISOString().slice(0, 10) });
  d += (i % 3 + 1) * 3 * 864e5;
}
const refSummary = refSummarize(recs);                                   // frozen baseline
const liveSummary = summarize(recs);                                     // current (possibly rewired) module
const got = summarizeTrades(recs.map(r => r.pnl_pct), recs.map(r => r.date));
const keys = ['trades', 'tradesPerYr', 'winRate', 'profitFactor', 'expectancy', 'sharpe', 'maxDD', 'totalPnl'];
ok('summarizeTrades == frozen original (golden)', keys.every(k => near(got[k], refSummary[k], 1e-9)),
   keys.filter(k => !near(got[k], refSummary[k], 1e-9)).map(k => `${k}:${got[k]}≠${refSummary[k]}`).join(' '));
ok('honestForecast.summarize == frozen original (rewire-safe)', keys.every(k => near(liveSummary[k], refSummary[k], 1e-9)),
   keys.filter(k => !near(liveSummary[k], refSummary[k], 1e-9)).map(k => `${k}:${liveSummary[k]}≠${refSummary[k]}`).join(' '));
ok('sharpeRatio 0 for <2 pts', sharpeRatio([1]) === 0);
ok('maxDrawdownFromPnls ≤ 0', maxDrawdownFromPnls([1, -2, 1, -3, 1]) < 0);
ok('profitFactor noLoss fallback', profitFactor([1, 2, 3]) === 99);
ok('winRate fraction', near(winRate([1, -1, 1, 1]), 0.75));

console.log('[fibProjection]');
ok('FIB_LEVELS has 45 levels', FIB_LEVELS.length === 45);
const fibs = calcFibs(100, 10);
ok('calcFibs projects low+range*level', near(fibs.find(f => f.level === 0).price, 100) && near(fibs.find(f => f.level === 1).price, 110));
ok('calcFibs marks key levels', fibs.find(f => f.level === 0.5).isKey === true && fibs.find(f => f.level === 2).isKey === false);

console.log('[instrumentRegistry]');
ok('resolveKey aliases → eurusd', ['EUR/USD', 'EUR_USD', 'EURUSD', 'eurusd', 'EURUSD=X'].every(s => resolveKey(s) === 'eurusd'));
ok('pip sizes correct', pipSize('EUR/USD') === 0.0001 && pipSize('USD/JPY') === 0.01 && pipSize('XAU/USD') === 1.0);
ok('gold canonical pip = 1.0 (not the 0.1 drift)', pipSize('gold') === 1.0);
ok('NQ resolves via OANDA + assetClass index', instrument('NAS100_USD').key === 'nq' && instrument('nq').assetClass === 'index');
ok('index short-name aliases resolve (us30/uk100/us2000 were missing from EXTRA_ALIASES)',
  resolveKey('us30') === 'dow' && resolveKey('uk100') === 'ftse' && resolveKey('us2000') === 'rut' && resolveKey('rus2000') === 'rut');
ok('unknown instrument throws', (() => { try { instrument('ZZZ/ZZZ'); return false; } catch { return true; } })());
ok('registry covers ≥30 instruments', INSTRUMENT_KEYS.length >= 30);

console.log('[dayTypeCore]');
ok('labelOutcome default = closeVsOcMed (continuation when |close−open| > ocMed)',
  labelOutcome({ open: 100, close: 101, ocMedFrac: 0.005, hl50Frac: 0.012 }) === 'CONTINUATION' &&
  labelOutcome({ open: 100, close: 100.2, ocMedFrac: 0.005, hl50Frac: 0.012 }) === 'REVERSION');
ok('labelOutcome closeVsHl50 is stricter than default',
  labelOutcome({ open: 100, close: 100.8, ocMedFrac: 0.005, hl50Frac: 0.012 }) === 'CONTINUATION' &&
  labelOutcome({ open: 100, close: 100.8, ocMedFrac: 0.005, hl50Frac: 0.012 }, 'closeVsHl50') === 'REVERSION');
ok('labelOutcome dayEfficiency uses net÷range', OUTCOME_LABELERS.dayEfficiency({ open: 100, high: 101, low: 99.9, close: 100.9 }) === 'CONTINUATION');
ok('labelOutcome null-guards bad input', labelOutcome({ open: 0, close: 1, ocMedFrac: 0.01 }) === null);

console.log('[touchFeatures]');
{
  const tf = createTouchFeatures({ erWin: 5, velWin: 5 });
  // A clean one-directional drive into the line → high efficiency ('3·driven').
  const drive = Array.from({ length: 12 }, (_, i) => ({ time: i, open: 100 + i * 0.1, high: 100 + i * 0.1, low: 100 + i * 0.1, close: 100 + i * 0.1 }));
  const fDrive = tf.compute({ bars: drive, touchIdx: 11, open: 100, sigma: 0.005, side: 'up', wt1: null });
  ok('approachEfficiency = driven on a clean drive', fDrive.approachER.bucket === '3·driven' && fDrive.approachER.value > 0.9);
  // A round-trip (up then back) → low efficiency ('1·choppy').
  const chop = [100,100.2,100.4,100.2,100.0,100.2,100.4,100.2,100.0,100.2,100.4,100.2].map((c, i) => ({ time: i, open: c, high: c, low: c, close: c }));
  ok('approachEfficiency = choppy on a round-trip', tf.compute({ bars: chop, touchIdx: 11, open: 100, sigma: 0.005, side: 'up', wt1: null }).approachER.bucket === '1·choppy');
  // Velocity: a big fast move in σ-units → spike; null-guards on short history.
  ok('approachVelocity = spike on a fast move', tf.compute({ bars: drive, touchIdx: 11, open: 100, sigma: 0.0005, side: 'up', wt1: null }).approachVel.bucket === '3·spike');
  ok('touch features null-guard short history', tf.compute({ bars: drive, touchIdx: 2, open: 100, sigma: 0.005, side: 'up', wt1: null }).approachER.bucket === null);
  // WaveTrend extension reads the precomputed series in the touch direction.
  ok('wtState extended when overbought at an up-line', tf.compute({ bars: drive, touchIdx: 11, open: 100, sigma: 0.005, side: 'up', wt1: drive.map(() => 60) }).wtState.bucket === '3·extended');
  ok('createTouchFeatures merges config (erWin override, wt default kept)', tf.cfg.erWin === 5 && tf.cfg.wt.n1 === TOUCH_DEFAULTS.wt.n1);
  // Volume climax: touch bar at 5× the flat baseline → surge.
  const volBars = Array.from({ length: 40 }, (_, i) => ({ time: i, open: 100, high: 100.1, low: 99.9, close: 100, volume: i === 39 ? 500 : 100 }));
  ok('volumeClimax = surge on a volume spike', createTouchFeatures({ volWin: 30 }).compute({ bars: volBars, touchIdx: 39, open: 100, sigma: 0.005, side: 'up' }).volClimax.bucket === '3·surge');
  ok('volumeClimax null without volume', tf.compute({ bars: drive, touchIdx: 11, open: 100, sigma: 0.005, side: 'up' }).volClimax.bucket === null);
  // Candle rejection: big upper wick at an up-line touch → reject.
  const rejBar = [{ time: 0, open: 100, high: 101, low: 99.95, close: 100.05 }];
  ok('candleRejection = reject on a big upper wick (up-line)', createTouchFeatures().compute({ bars: rejBar, touchIdx: 0, open: 100, sigma: 0.005, side: 'up' }).candleReject.bucket === '3·reject');
  // Round-number proximity: 1.1000 sits ON a figure; 1.1037 is off.
  ok('roundNumber on-figure at 1.1000', createTouchFeatures().compute({ bars: rejBar, touchIdx: 0, open: 1.1, sigma: 0.005, side: 'up', level: 1.1000, pip: 0.0001 }).roundNum.bucket === '3·on-figure');
  ok('roundNumber off at 1.1080 (20 pips from 1.1100)', createTouchFeatures().compute({ bars: rejBar, touchIdx: 0, open: 1.1, sigma: 0.005, side: 'up', level: 1.1080, pip: 0.0001 }).roundNum.bucket === '1·off');
}

console.log('[perLineStrategy]');
{
  // One window with a decided fade-favoured touch: HL50_up reverted, spike, with
  // inner/outer barriers priced.
  const mkWin = (date, reverted, vel='3·spike') => ({ date, open: 1.10, lines: [
    { name:'HL50', side:'up', outcome: reverted?'reverted':'continued', level:1.1050, innerLvl:1.1030, outerLvl:1.1070, approachVel:vel, budgetBucket:'3·exhausted' },
  ]});
  const touches = extractTouches([mkWin('2020-01-01',true)], {});
  ok('extractTouches builds cell key from line + condition', touches[0].cell === 'HL50_up|3·spike' && touches[0].reverted === true);
  ok('extractTouches drops missing-condition touches', extractTouches([{date:'x',open:1,lines:[{name:'HL50',side:'up',outcome:'reverted',level:1,innerLvl:0.9,outerLvl:1.1,approachVel:null}]}], {}).length === 0);
  // Policy: 70% reversion over n=100 → fade; 50/50 → skip.
  const isT = [];
  for (let i=0;i<100;i++) isT.push(...extractTouches([mkWin('2020-01-0'+(i%9+1), i<70)], {}));
  const pol = buildPolicy(isT, { minN: 50 });
  ok('buildPolicy → fade on a significant reversion cell', pol['HL50_up|3·spike'].decision === 'fade');
  const coin = []; for (let i=0;i<100;i++) coin.push(...extractTouches([mkWin('2020-02-01', i%2===0)], {}));
  ok('buildPolicy → skip on a coin-flip cell', buildPolicy(coin,{minN:50})['HL50_up|3·spike'].decision === 'skip');
  ok('buildPolicy → skip on thin sample', buildPolicy(isT.slice(0,10),{minN:50})['HL50_up|3·spike'].decision === 'skip');
  // tradePnl: fade win = +distToInner − cost; fade loss = −distToOuter − cost.
  const win  = tradePnl(touches[0], pol, { costPct: 0.01, slipPct: 0 });
  const loss = tradePnl(extractTouches([mkWin('2020-01-01', false)],{})[0], pol, { costPct: 0.01, slipPct: 0 });
  ok('tradePnl fade win ≈ +distToInner − cost', near(win, (Math.abs(1.1050-1.1030)/1.10*100) - 0.01, 1e-4));
  ok('tradePnl fade loss ≈ −distToOuter − cost', near(loss, -(Math.abs(1.1070-1.1050)/1.10*100) - 0.01, 1e-4));
  ok('tradePnl skips an unknown/skip cell', tradePnl({...touches[0], cell:'ZZ'}, pol, {}) === null);
  // runPerLine: IS-learned fade applied OOS where the edge persists → positive book.
  const byPair = { eurusd: [] };
  for (let d=1; d<=200; d++){ const date = `2020-${String(Math.ceil(d/28)).padStart(2,'0')}-${String(d%28+1).padStart(2,'0')}`;
    byPair.eurusd.push(...extractTouches([mkWin(date, d%10<7)], {})); }   // 70% revert throughout
  const run = runPerLine(byPair, { splitFrac: 0.6, minN: 30, costByPair:{eurusd:0.01}, slipByPair:{eurusd:0} });
  ok('runPerLine produces an OOS book with trades + daily equity', run.nTrades > 0 && run.equity.length > 0 && run.equity.length <= run.nTrades);
  ok('runPerLine book is profitable when the IS edge persists OOS', run.book.totalPnl > 0 && run.coverage.fadeCells >= 1);

  // buildSurvivors: keep pairs whose net OOS expectancy clears their own cost by
  // the margin (and have enough trades); re-aggregate ONLY their daily PnL.
  ok('runPerLine attaches a survivors block', !!run.survivors && Array.isArray(run.survivors.pairs));
  const svPerPair = { rich: { expectancy: 0.05, trades: 100 }, thin: { expectancy: 0.001, trades: 100 }, few: { expectancy: 0.05, trades: 5 } };
  const svPnl     = { rich: [{ date:'2020-01-01', pnl:0.05 }], thin: [{ date:'2020-01-01', pnl:0.001 }], few: [{ date:'2020-01-01', pnl:0.05 }] };
  const svCost    = { rich: 0.01, thin: 0.04, few: 0.01 };
  const sv = buildSurvivors(svPerPair, svPnl, svCost, { survivorMargin: 0.5, minSurvivorTrades: 30 });
  ok('buildSurvivors keeps a pair that clears cost by the margin', sv.pairs.includes('rich'));
  ok('buildSurvivors drops a pair whose expectancy is below the cost margin', !sv.pairs.includes('thin') && sv.excluded.some(e => e.pair==='thin' && e.reason==='expectancy below cost margin'));
  ok('buildSurvivors drops a pair with too few trades (regardless of edge)', !sv.pairs.includes('few') && sv.excluded.some(e => e.pair==='few' && e.reason==='too few trades'));
  ok('buildSurvivors re-aggregates only survivor PnL', sv.count===1 && sv.nTrades===1 && sv.equity.length===1);

  // Phase C — missed-trades summary: skipped OOS touches are counted with a reason.
  ok('runPerLine attaches a missed summary with reasons', !!run.missed && run.missed.total >= 0 && typeof run.missed.byReason === 'object');
  ok('runPerLine takenRate is a sane percentage', run.missed.takenRate >= 0 && run.missed.takenRate <= 100);

  // Phase C — sensitivity grid: OAT sweeps + per-observation trial Sharpes.
  const sens = runSensitivity(byPair, { base: { splitFrac:0.6, minN:30, marginPct:0, survivorMargin:0.5 },
    costByPair:{eurusd:0.01}, slipByPair:{eurusd:0} });
  ok('runSensitivity returns OAT sweeps for each knob', !!sens && Array.isArray(sens.sweeps.minN) && Array.isArray(sens.sweeps.splitFrac) && Array.isArray(sens.sweeps.marginPct) && Array.isArray(sens.sweeps.survivorMargin));
  ok('runSensitivity emits distinct per-observation trial Sharpes', sens.nTrials >= 2 && sens.trialSharpesRaw.length === sens.nTrials);
}

console.log('[deflatedSharpe]');
{
  // A series with a real edge, evaluated against a handful of noisy trials, should
  // deflate toward a probability in [0,1]; more/noisier trials → harder to clear.
  const daily = Array.from({ length: 300 }, (_, i) => (i % 4 === 0 ? -0.4 : 0.35));   // +ve drift
  const fewTrials  = [0.05, 0.06, 0.04];
  const manyTrials = [0.05, 0.06, 0.04, 0.20, 0.18, 0.22, 0.15, 0.19];                // wider spread, more trials
  const dFew  = deflatedSharpe(daily, fewTrials);
  const dMany = deflatedSharpe(daily, manyTrials);
  ok('deflatedSharpe returns dsr in [0,1] with sr0 and nTrials', dFew && dFew.dsr >= 0 && dFew.dsr <= 1 && dFew.nTrials === 3 && Number.isFinite(dFew.sr0));
  ok('deflatedSharpe sr0 (expected max) rises with more/noisier trials', dMany.sr0 > dFew.sr0);
  ok('deflatedSharpe needs >=2 trials', deflatedSharpe(daily, [0.1]) === null);

  // FIX 1 — honest mark-to-close: an undecided outcome (no barrier hit) is scored
  // by the actual close, NOT credited the full target. A 1-pip drift ≠ a full win.
  const closeT = { date:'2020-01-01', open:1.10, side:'up', reverted:true, decidedBy:'close', closePx:1.10490, level:1.10500, innerLvl:1.10300, outerLvl:1.10700 };
  const pClose = pnlFor(closeT, 'fade', { costPct:0, slipPct:0 });
  ok('pnlFor marks undecided to close, not the full target', near(pClose, (1.10500-1.10490)/1.10*100, 1e-4) && pClose < 0.05);
  ok('pnlFor barrier win still credits the full target', near(pnlFor({...closeT, decidedBy:'barrier'}, 'fade', {costPct:0,slipPct:0}), (1.10500-1.10300)/1.10*100, 1e-4));

  // FIX 2 — expectancy gate: a cell that is STATISTICALLY significant (z>1.96, ~58%
  // reversion) but whose tiny TP/SL can't beat costs is SKIPPED (old z-only gate
  // would have traded it). "Significant ≠ profitable."
  const tight = [];
  for (let i=0;i<200;i++) tight.push({ date:'2020-01-0'+(i%9+1), open:1.10, side:'up', reverted:i<116, decidedBy:'barrier',
    closePx:1.10, level:1.10500, innerLvl:1.10486, outerLvl:1.10514, cell:'TIGHT', cost:0.012, slip:0.006 });
  const polTight = buildPolicy(tight, { minN:50 });
  ok('buildPolicy skips a significant cell whose edge < costs', polTight.TIGHT.decision==='skip' && polTight.TIGHT.z>1.96 && polTight.TIGHT.revRate>50);
}

console.log('[backtestStats]');
{
  const dates = Array.from({ length: 200 }, (_, i) => `20${20 + Math.floor(i/50)}-0${1+(i%9)}-0${1+(i%9)}`);
  const pnls  = Array.from({ length: 200 }, (_, i) => (i % 3 === 0 ? -0.5 : 0.4));   // ~67% win, +ve edge
  const s = backtestStats(pnls, dates, { mcRuns: 200, bootRuns: 200, seed: 1 });
  ok('backtestStats core fields present', ['sharpe','sortino','calmar','cagr','maxDD','profitFactor','payoff','winRate','expectancy','totalPnl'].every(k => k in s));
  ok('backtestStats winRate ≈ 0.667', near(s.winRate, 2/3, 0.02));
  ok('backtestStats totalPnl matches sum', near(s.totalPnl, pnls.reduce((a,b)=>a+b,0), 1e-6));
  ok('backtestStats maxDD ≤ 0 and DD duration ≥ 0', s.maxDD <= 0 && s.maxDDdur >= 0);
  ok('backtestStats bootstrap CI ordered (p5 ≤ p50 ≤ p95)', s.bootstrap.total.p5 <= s.bootstrap.total.p50 && s.bootstrap.total.p50 <= s.bootstrap.total.p95);
  ok('backtestStats MC drawdown percentiles present', 'p50' in s.montecarlo.maxDD && 'p95' in s.montecarlo.maxDD);
  ok('backtestStats deterministic under same seed', JSON.stringify(backtestStats(pnls, dates, { mcRuns: 200, bootRuns: 200, seed: 1 })) === JSON.stringify(s));
  ok('backtestStats empty → {trades:0}', backtestStats([], []).trades === 0);
  // portfolioStats: daily Sharpe ×√252; vol-target rescales but Sharpe is invariant.
  const daily = Array.from({ length: 252 }, (_, i) => (i % 4 === 0 ? -0.2 : 0.15));   // ~+ve daily series
  const ps = portfolioStats(daily, { targetVol: 10 });
  ok('portfolioStats Sharpe = mean/sd×√252', near(ps.sharpe, (daily.reduce((a,b)=>a+b,0)/daily.length)/Math.sqrt(daily.reduce((a,b)=>a+(b-(daily.reduce((x,y)=>x+y,0)/daily.length))**2,0)/daily.length)*Math.sqrt(252), 0.02));
  ok('portfolioStats Sharpe invariant to vol target (scale-free)', portfolioStats(daily,{targetVol:5}).sharpe === portfolioStats(daily,{targetVol:20}).sharpe);
  ok('portfolioStats annVol > 0 and vol-target set', ps.annVol > 0 && ps.volTarget.target === 10);
  ok('portfolioStats empty → {days:0}', portfolioStats([]).days === 0);
  ok('portfolioStats PSR present & in [0,1]', ps.psr >= 0 && ps.psr <= 1);
}

console.log('[runRigor]');
{
  // A persistent ~70%-reversion edge across pairs and time → walk-forward holds,
  // IS≈OOS, cost-stress decays but stays positive at 1×, per-year present.
  const mk=(date,rev)=>({date,open:1.10,line:'HL50_up',name:'HL50',side:'up',reverted:rev,decidedBy:'barrier',closePx:1.10,level:1.1050,innerLvl:1.1030,outerLvl:1.1070,cell:'HL50_up|3·spike'});
  const byPair={};
  for(const p of ['eurusd','gbpusd','usdjpy']){ const a=[];
    for(let d=0; d<900; d++){ const yr=2020+Math.floor(d/300); const mo=String(1+(Math.floor(d/25)%12)).padStart(2,'0'); const dd=String(1+(d%25)).padStart(2,'0');
      a.push(mk(`${yr}-${mo}-${dd}`, (d*7)%10<7)); } byPair[p]=a; }
  const rg=runRigor(byPair,{splitFrac:0.6,minN:30,folds:4,costByPair:{eurusd:0.005,gbpusd:0.005,usdjpy:0.005},slipByPair:{eurusd:0,gbpusd:0,usdjpy:0}});
  ok('runRigor returns walk-forward folds', rg.walkForward.folds.length>=1 && rg.walkForward.overall.days>0);
  ok('runRigor IS vs OOS with degradation ratio', rg.isVsOos.is.sharpe!==undefined && rg.isVsOos.oos.sharpe!==undefined && rg.isVsOos.degradation!=null);
  ok('runRigor cost-sensitivity decays with cost', rg.costSensitivity.length===3 && rg.costSensitivity[0].sharpe >= rg.costSensitivity[2].sharpe);
  ok('runRigor per-year present', rg.perYear.length>=1 && rg.perYear[0].year);
  // realistic per-pair costs: majors cheap, exotic crosses much wider, fallback works
  ok('costForPair: major < exotic cross', costForPair('eurusd') < costForPair('gbpnzd'));
  ok('costForPair: exotic cross widest tier', costForPair('gbpnzd') >= 0.04);
  ok('costForPair: unknown pair falls back to asset-class default', costForPair('zzzxxx','fx') === 0.012);
}

console.log('[volatilityBotPlan]');
{
  const book = {
    horizon: 'daily', conditions: ['approachVel'], marginPct: 0.01, survivorMargin: 0.5,
    survivors: { pairs: ['eurusd', 'usdjpy', 'gbpcad'] },           // gbpcad has no live vol → dropped
    policy: {
      'HL50_up|3·spike': { decision: 'fade',   n: 400 },
      'OC50_up|1·grind': { decision: 'skip',   n: 900, reason: 'belowMargin' },
      'HL75_dn|2·med':   { decision: 'follow', n: 300 },
    },
  };
  const volByPair = {
    eurusd: { open: 1.10, sigma: 0.006, assetClass: 'fx', pip: 0.0001 },
    usdjpy: { open: 150,  sigma: 0.007, assetClass: 'fx', pip: 0.01 },
    // gbpcad intentionally omitted
  };
  const plan = buildVolatilityPlan(book, volByPair);
  ok('volatility plan: universe = survivors WITH live vol only', plan.universe.length === 2 && plan.universe.includes('eurusd') && !plan.universe.includes('gbpcad'));
  ok('volatility plan: drops skip cells, keeps fade/follow', plan.policy['HL50_up|3·spike']?.decision === 'fade' && plan.policy['HL75_dn|2·med']?.decision === 'follow' && !('OC50_up|1·grind' in plan.policy));
  const b = computeBands(1.10, 0.006, 'fx');
  ok('volatility plan: band fractions match canonical computeBands', near(plan.pairs.eurusd.hl50, +b.hl50.toFixed(8), 1e-9) && near(plan.pairs.eurusd.ocMed, +b.ocMed.toFixed(8), 1e-9));
  ok('volatility plan: carries locked config (margin 0.01, approachVel)', plan.marginPct === 0.01 && plan.conditions[0] === 'approachVel');
  ok('volatility plan: throws without a book', (() => { try { buildVolatilityPlan(null, {}); return false; } catch { return true; } })());
}

console.log('[volatilityBotProducer]');
await (async () => {
  const book = { horizon:'daily', conditions:['approachVel'], marginPct:0.01, survivorMargin:0.5,
    survivors:{ pairs:['eurusd','usdjpy'] }, policy:{ 'HL50_up|3·spike':{ decision:'fade' } } };
  let written = null;
  const plan = await refreshVolatilityPlan({
    getBook: async () => book,
    fetchD1: async (sym) => [{ open: sym.includes('JPY') ? 150 : 1.10, high: 1, low: 1, close: 1 }],  // open = last bar
    // Float64Array — the REAL volSigmaSeries returns a typed array; the producer
    // must take its last element (Array.isArray() is false for typed arrays).
    sigmaSeries: () => Float64Array.from([0.005, 0.006]),
    kvPut: async (k, v) => { written = { k, v }; },
    resolveInstrument: (p) => ({ oanda: p.toUpperCase().replace(/(...)(...)/, '$1_$2'), assetClass: 'fx', pip: p.includes('jpy') ? 0.01 : 0.0001 }),
    now: () => '2026-06-29T00:00:00Z', stamp: () => 123,
  });
  ok('producer writes the volatility_bot_plan KV key', written?.k === 'volatility_bot_plan');
  ok('producer prices a typed-array (Float64Array) sigma series', plan.universe.length === 2 && plan.pairs.eurusd?.sigma === 0.006);
  ok('producer plan prices both survivor pairs', plan.universe.length === 2 && plan.universe.includes('usdjpy'));
  ok('producer stamps generatedAt + wraps {data,timestamp}', plan.generatedAt === '2026-06-29T00:00:00Z' && JSON.parse(written.v).timestamp === 123);
  // Open anchor: when fetchSessionOpen (London-midnight) is provided it MUST win over
  // the D1 open; the D1 open is only the fallback. (The 4018.65-vs-4013.x bug.)
  {
    const lonPlan = await refreshVolatilityPlan({
      getBook: async () => book,
      fetchD1: async () => [{ open: 4018.65, high: 1, low: 1, close: 1 }],   // stale 22:00-UTC D1 open
      fetchSessionOpen: async () => 4013.28,                                  // live London-midnight open
      sigmaSeries: () => Float64Array.from([0.005, 0.006]),
      kvPut: async () => {},
      resolveInstrument: () => ({ oanda: 'X', assetClass: 'fx', pip: 0.0001 }),
      now: () => '2026-06-29T00:00:00Z', stamp: () => 1,
    });
    ok('producer anchors open at London-midnight when fetchSessionOpen given (not the D1 open)',
       lonPlan.pairs.eurusd?.open === 4013.28);
    // Fallback: a failing/zero session-open call drops back to the D1 open, not a skip.
    const fbPlan = await refreshVolatilityPlan({
      getBook: async () => book,
      fetchD1: async () => [{ open: 4018.65, high: 1, low: 1, close: 1 }],
      fetchSessionOpen: async () => { throw new Error('oanda 502'); },
      sigmaSeries: () => Float64Array.from([0.006]),
      kvPut: async () => {},
      resolveInstrument: () => ({ oanda: 'X', assetClass: 'fx', pip: 0.0001 }),
      now: () => '2026-06-29T00:00:00Z', stamp: () => 1,
    });
    ok('producer falls back to D1 open when the session-open fetch fails',
       fbPlan.pairs.eurusd?.open === 4018.65);
  }
  let threw = false;
  try { await refreshVolatilityPlan({ getBook: async () => ({ survivors:{ pairs:[] } }), fetchD1: async()=>[], sigmaSeries:()=>[], kvPut: async()=>{} }); } catch { threw = true; }
  ok('producer fails loud on an empty/absent book', threw);

  // Survivor names that aren't already lowercase (e.g. upper-case R2 parquet names)
  // must still price — buildVolatilityPlan lowercases its lookup, so the producer
  // has to key volByPair by the lowercased pair or the whole universe drops.
  let writtenUC = null;
  const planUC = await refreshVolatilityPlan({
    getBook: async () => ({ ...book, survivors:{ pairs:['EURUSD','USDJPY'] } }),
    fetchD1: async (sym) => [{ open: sym.includes('JPY') ? 150 : 1.10, high: 1, low: 1, close: 1 }],
    sigmaSeries: () => Float64Array.from([0.006]),
    kvPut: async (k, v) => { writtenUC = { k, v }; },
    resolveInstrument: (p) => ({ oanda: p.toUpperCase().replace(/(...)(...)/, '$1_$2'), assetClass: 'fx', pip: p.toLowerCase().includes('jpy') ? 0.01 : 0.0001 }),
    now: () => '2026-06-29T00:00:00Z', stamp: () => 123,
  });
  ok('producer is case-insensitive on survivor names', planUC.universe.length === 2 && planUC.universe.includes('eurusd') && planUC.universe.includes('usdjpy'));

  // A book with survivors but where every pair fails to price must NOT publish an
  // empty universe (that silently strands the bot) — it throws instead.
  let threwEmpty = false, wroteEmpty = false;
  try {
    await refreshVolatilityPlan({
      getBook: async () => book,
      fetchD1: async () => [],                       // no bars → every pair skipped
      sigmaSeries: () => [0.006],
      kvPut: async () => { wroteEmpty = true; },
      resolveInstrument: (p) => ({ oanda: p.toUpperCase(), assetClass: 'fx', pip: 0.0001 }),
    });
  } catch { threwEmpty = true; }
  ok('producer refuses to publish a 0-pair plan', threwEmpty && !wroteEmpty);

  // Two survivor names for the SAME instrument (e.g. 'us30' + 'dow', 'spx' +
  // 'spx500') must collapse to one universe entry — otherwise the bot double-trades it.
  const planDup = await refreshVolatilityPlan({
    getBook: async () => ({ ...book, survivors:{ pairs:['us30','dow','spx','spx500'] } }),
    fetchD1: async () => [{ open: 50000, high: 1, low: 1, close: 1 }],
    sigmaSeries: () => Float64Array.from([0.01]),
    kvPut: async () => {},
    resolveInstrument: (p) => ({ oanda: (p === 'us30' || p === 'dow') ? 'US30_USD' : 'SPX500_USD', assetClass: 'index', pip: 1 }),
    now: () => '2026-06-29T00:00:00Z', stamp: () => 1,
  });
  ok('producer dedups aliases of one instrument', planDup.universe.length === 2 &&
     planDup.universe.includes('us30') && planDup.universe.includes('spx') &&
     !planDup.universe.includes('dow') && !planDup.universe.includes('spx500'));
})();

console.log('[bucketM1IntoSessions — midnight Europe/London]');
{
  const mk = iso => Math.floor(Date.parse(iso) / 1000);
  // BST (summer): midnight London = 23:00 UTC. Split must fall at 23:00Z, not 22:00Z.
  const bst = bucketM1IntoSessions({ n: 4,
    times:  [mk('2026-06-29T22:30:00Z'), mk('2026-06-29T22:59:00Z'), mk('2026-06-29T23:00:00Z'), mk('2026-06-29T23:30:00Z')],
    opens:  [1, 2, 3, 4], highs: [1, 2, 3, 4], lows: [1, 2, 3, 4], closes: [1, 2, 3, 4] }, 'Europe/London');
  ok('BST: 22:30/22:59Z stay in the prior London day', (bst.get('2026-06-29') || []).map(b => b.open).join(',') === '1,2');
  ok('BST: 23:00Z opens the new London day (session open=3)', (bst.get('2026-06-30') || [])[0]?.open === 3);
  // GMT (winter): midnight London = 00:00 UTC.
  const gmt = bucketM1IntoSessions({ n: 3,
    times:  [mk('2026-01-14T23:30:00Z'), mk('2026-01-15T00:00:00Z'), mk('2026-01-15T08:00:00Z')],
    opens:  [9, 10, 11], highs: [9, 10, 11], lows: [9, 10, 11], closes: [9, 10, 11] }, 'Europe/London');
  ok('GMT: 00:00Z opens the new London day (session open=10)', (gmt.get('2026-01-15') || [])[0]?.open === 10);
  // Default (number) boundary unchanged — still the 22:00 UTC broker day.
  const utc = bucketM1IntoSessions({ n: 2,
    times: [mk('2026-06-29T21:59:00Z'), mk('2026-06-29T22:00:00Z')],
    opens: [1, 2], highs: [1, 2], lows: [1, 2], closes: [1, 2] });
  ok('default 22:00-UTC boundary still splits at 22:00Z', (utc.get('2026-06-30') || [])[0]?.open === 2);
}

console.log('[backtestStats — drawdown honesty]');
{
  // +5% peak, then -9% over three days (trough), then recovery. The compounded
  // max drawdown is the peak-to-trough fall as a % of the peak equity.
  const daily = [1, 1, 1, 1, 1, -3, -3, -3, 2, 2, 2, 2, 2, 2];
  const ps = portfolioStats(daily, { mc: true });
  ok('portfolio maxDD is compounded peak-to-trough (~-8.7%)', ps.maxDD < -8 && ps.maxDD > -9.5);
  ok('CAGR and maxDD share the compounded basis (calmar = cagr/|maxDD|)',
     Math.abs(ps.calmar - ps.cagr / Math.abs(ps.maxDD)) < 0.1);
  ok('portfolio MC drawdown deepens p50→p95→p99 (worst-case correct)',
     ps.volTarget.mcMaxDD.p99 <= ps.volTarget.mcMaxDD.p95 + 1e-9 &&
     ps.volTarget.mcMaxDD.p95 <= ps.volTarget.mcMaxDD.p50 + 1e-9);
  ok('portfolio MC absent unless requested', portfolioStats(daily).volTarget.mcMaxDD === undefined);

  const bs = backtestStats(daily, [], { mcRuns: 500, bootRuns: 200 });
  ok('per-trade MC drawdown deepens p50→p99 (inversion fixed)',
     bs.montecarlo.maxDD.p99 <= bs.montecarlo.maxDD.p50 + 1e-9);
  ok('per-trade MC worst-case is at least the historical maxDD depth',
     Math.abs(bs.montecarlo.maxDD.p99) >= Math.abs(bs.maxDD) - 1e-9);
}

// Block bootstrap — the regime-clustering answer to "IID understates tails".
{
  // Strongly clustered returns: long calm up-drifts punctuated by clustered down-runs.
  // IID shuffle scatters the down days; the stationary block bootstrap keeps them
  // clumped, so its typical (and tail) drawdown must be AT LEAST as deep as IID.
  const clustered = [];
  for (let k = 0; k < 6; k++) { for (let i = 0; i < 12; i++) clustered.push(0.8); for (let i = 0; i < 6; i++) clustered.push(-2.5); }
  const pc = portfolioStats(clustered, { mc: true });
  const blk = pc.volTarget.mcMaxDDBlock, iid = pc.volTarget.mcMaxDD;
  ok('block-bootstrap MC present + deepens p50→p95→p99',
     blk && blk.p99 <= blk.p95 + 1e-9 && blk.p95 <= blk.p50 + 1e-9);
  ok('block bootstrap reports its mean block length (≥1)', blk && blk.blockMean >= 1);
  ok('block bootstrap median tail ≥ IID on clustered returns (clustering preserved)',
     Math.abs(blk.p50) >= Math.abs(iid.p50) - 1e-9);
  ok('block MC absent unless requested', portfolioStats(clustered).volTarget.mcMaxDDBlock === undefined);
  ok('portfolioStats deterministic under fixed seed (block MC included)',
     JSON.stringify(portfolioStats(clustered, { mc: true })) === JSON.stringify(pc));
  ok('clustered (positive dependence) → acf1 > 0', pc.acf1 > 0, `acf1=${pc.acf1}`);
  // Raw (unscaled) MC is reported alongside the vol-scaled one; when realised vol
  // exceeds the 10% target, scaling shrinks the DD, so raw must be DEEPER than scaled.
  ok('raw (unscaled) MC drawdowns reported when mc requested', !!pc.raw?.mcMaxDD && !!pc.raw?.mcMaxDDBlock);
  ok('raw MC deeper than vol-scaled MC when annVol > target',
     pc.annVol > 10 && Math.abs(pc.raw.mcMaxDD.p95) > Math.abs(iid.p95), `raw=${pc.raw.mcMaxDD.p95} scaled=${iid.p95} annVol=${pc.annVol}`);
}

// Mean-reversion is WHY block can be SHALLOWER than IID (the reviewer's question).
{
  // Strictly alternating returns (up, down, up, …) with a mild net drift: strongly
  // NEGATIVELY autocorrelated. IID shuffle can clump the downs → deeper tail; the
  // block bootstrap preserves the self-correcting alternation → shallower tail.
  const rev = [];
  for (let i = 0; i < 120; i++) rev.push(i % 2 === 0 ? 1.4 : -1.1);
  const pr = portfolioStats(rev, { mc: true });
  ok('mean-reverting series → acf1 < 0', pr.acf1 < 0, `acf1=${pr.acf1}`);
  ok('mean-reverting series → block tail ≤ IID tail (block shallower, not a bug)',
     Math.abs(pr.volTarget.mcMaxDDBlock.p95) <= Math.abs(pr.volTarget.mcMaxDD.p95) + 1e-9,
     `block=${pr.volTarget.mcMaxDDBlock.p95} iid=${pr.volTarget.mcMaxDD.p95}`);
}

// londonMidnightSec — the session-open anchor. DST-safe, 23:00 UTC in BST / 00:00
// UTC in GMT (the recurring "midnight is London, not 22:00 UTC" bug).
console.log('[volBacktestEngine — londonMidnightSec]');
{
  const s = (y, mo, d, h) => Date.UTC(y, mo, d, h, 0, 0) / 1000;
  // Summer (BST, +1): 2026-07-01 13:00Z → London day 07-01, midnight = 06-30 23:00Z.
  ok('BST: London midnight is 23:00 UTC of the prior calendar day',
     londonMidnightSec(new Date('2026-07-01T13:00:00Z')) === s(2026, 5, 30, 23));
  // Just past London midnight in BST: 2026-07-01 23:30Z = 00:30 London 07-02.
  ok('BST: just-after-midnight rolls to the new London day',
     londonMidnightSec(new Date('2026-07-01T23:30:00Z')) === s(2026, 6, 1, 23));
  // Winter (GMT, 0): 2026-01-15 13:00Z → midnight = 01-15 00:00Z.
  ok('GMT: London midnight is 00:00 UTC same day',
     londonMidnightSec(new Date('2026-01-15T13:00:00Z')) === s(2026, 0, 15, 0));
}

// sharpeStdError / minTrackRecordLength — the Sharpe-honesty brick. Hand-checked
// against the Lo (2002) / Bailey-López de Prado (2012) formulas.
console.log('[metricsCore — Sharpe honesty]');
{
  // SR_ann 0.5 over 1y of daily data: SE = √((252 + 0.125)/252) ≈ 1.0002.
  ok('sharpeStdError matches hand calc (SR 0.5, 1y daily)',
     near(sharpeStdError(0.5, 252, 252), Math.sqrt(252.125 / 252), 1e-12));
  // 16y of daily data quarters the 1y error (√16): the "SR 0.5 needs ~16y" fact.
  ok('SE shrinks with √T', near(sharpeStdError(0.5, 16 * 252, 252), sharpeStdError(0.5, 252, 252) / 4, 1e-12));
  ok('SE is Infinity on degenerate inputs', sharpeStdError(1, 1) === Infinity && sharpeStdError(1, 100, 0) === Infinity);

  // MinTRL hand calc, Gaussian: sr_p = 0.5/√252; periods = 1 + (1 + sr_p²/2)(1.645/sr_p)²
  const srp = 0.5 / Math.sqrt(252);
  const handYears = (1 + (1 + srp * srp / 2) * Math.pow(1.645 / srp, 2)) / 252;
  ok('minTrackRecordLength matches hand calc (SR 0.5 vs 0, 95%)',
     near(minTrackRecordLength(0.5), handYears, 1e-9), `≈${handYears.toFixed(1)}y`);
  ok('MinTRL ≈ 10.8y for SR 0.5 (the sobering headline number)',
     Math.abs(minTrackRecordLength(0.5) - 10.8) < 0.2, `=${minTrackRecordLength(0.5).toFixed(1)}y`);
  ok('higher Sharpe needs less data', minTrackRecordLength(1.0) < minTrackRecordLength(0.5));
  ok('SR ≤ benchmark → Infinity (no data can confirm a non-edge)',
     minTrackRecordLength(0.3, { benchmark: 0.3 }) === Infinity && minTrackRecordLength(-0.2) === Infinity);
  ok('negative skew / fat tails lengthen the required track record',
     minTrackRecordLength(0.5, { skew: -1, kurt: 6 }) > minTrackRecordLength(0.5));
}

// skewness / excessKurtosis / histVaR / histCVaR — distribution shape & tail.
console.log('[metricsCore — distribution shape / tail]');
{
  // Symmetric series → skew ~0. A [-2,-1,0,1,2]-style symmetric set is exactly 0.
  ok('skewness ~0 on a symmetric series', near(skewness([-2, -1, 0, 1, 2]), 0, 1e-12));
  // Right-skewed (one big positive outlier) → skew > 0; left-skewed mirror < 0.
  ok('skewness > 0 for right tail', skewness([1, 1, 1, 1, 10]) > 0);
  ok('skewness < 0 for left tail', skewness([-10, -1, -1, -1, -1]) < 0);
  ok('skewness sign flips under negation',
     near(skewness([1, 1, 1, 1, 10]), -skewness([-1, -1, -1, -1, -10]), 1e-12));
  ok('skewness 0 for n<3 / flat', skewness([1, 2]) === 0 && skewness([5, 5, 5, 5]) === 0);

  // Hand calc: uniform [-2,-1,0,1,2], population m2=2, m4=(16+1+0+1+16)/5=6.8,
  // excess kurt = m4/m2² − 3 = 6.8/4 − 3 = −1.3 (platykurtic, as a uniform is).
  ok('excessKurtosis matches hand calc (uniform → −1.3)',
     near(excessKurtosis([-2, -1, 0, 1, 2]), 6.8 / 4 - 3, 1e-12), `=${excessKurtosis([-2, -1, 0, 1, 2]).toFixed(3)}`);
  ok('excessKurtosis > 0 for a fat-tailed set', excessKurtosis([0, 0, 0, 0, 0, 0, 0, 0, -8, 8]) > 0);
  ok('excessKurtosis 0 for n<4 / flat', excessKurtosis([1, 2, 3]) === 0 && excessKurtosis([5, 5, 5, 5]) === 0);

  // histVaR type-7 quantile hand check. xs = 0..100 by 1 (n=101). 5% quantile:
  // pos = 0.05*(100) = 5 → exactly the 6th order stat = 5. (returns in-series sign.)
  const ramp = Array.from({ length: 101 }, (_, i) => i);
  ok('histVaR(95%) matches type-7 hand calc', near(histVaR(ramp, 0.95), 5, 1e-12), `=${histVaR(ramp, 0.95)}`);
  // Interpolation check: [0,10], 95% → 1−p=0.05, pos=0.05 → 0 + 0.05*(10−0)=0.5.
  ok('histVaR interpolates between order stats', near(histVaR([0, 10], 0.95), 0.5, 1e-12));
  // A loss-bearing series returns a negative VaR.
  ok('histVaR negative for a loss tail', histVaR([-5, -3, -1, 0, 1, 2, 3], 0.90) < 0);
  // CVaR ≤ VaR (mean of the tail is worse than the threshold), and equals the
  // mean of the sub-threshold points. For the ramp, tail = {0..5} mean = 2.5.
  ok('histCVaR ≤ histVaR', histCVaR(ramp, 0.95) <= histVaR(ramp, 0.95));
  ok('histCVaR = mean of the bad tail (ramp)', near(histCVaR(ramp, 0.95), (0 + 1 + 2 + 3 + 4 + 5) / 6, 1e-12), `=${histCVaR(ramp, 0.95)}`);
  ok('VaR/CVaR 0 on empty', histVaR([], 0.95) === 0 && histCVaR([], 0.95) === 0);

  // summarizeTrades exposes the additive shape fields without breaking goldens
  // (verified above); sanity-check they're present and finite.
  const st = summarizeTrades(recs.map(r => r.pnl_pct), recs.map(r => r.date));
  ok('summarizeTrades carries skew/excessKurt/var95/cvar95',
     ['skew', 'excessKurt', 'var95', 'cvar95'].every(k => Number.isFinite(st[k])),
     `skew=${st.skew} exKurt=${st.excessKurt} var95=${st.var95} cvar95=${st.cvar95}`);
  ok('summarizeTrades var95 ≥ cvar95 (tail is worse than threshold)', st.var95 >= st.cvar95);
}

// ── oiLevelExport: the OI-walls paste-block builder ──────────────────────────
// Synthetic oi_store: one FX pair with headline + ranked walls + max pain, one
// index (2dp), and one empty entry (no levels → skipped). Proves the block emits
// the right canonical headers, decimals, tier tags and staleness line, and reuses
// oiStoreToLevels (so the numbers match /api/oi-levels and the bots).
console.log('\n[oiLevelExport]');
{
  const store = {
    'EUR/USD': {
      pair: 'EUR/USD', spot: 1.0955, dte: 4, savedAt: '7/21/2026, 08:15:00',
      maxPain: 1.0948,
      callWall: 1.1000, putWall: 1.0900,
      callWalls: [{ strike: 1.1000, oi: 9000, tier: 3 }, { strike: 1.1050, oi: 4000, tier: 2 }],
      putWalls:  [{ strike: 1.0900, oi: 8000, tier: 3 }, { strike: 1.0850, oi: 3000, tier: 1 }],
      exposures: { gex: 1200 },                          // positive net GEX → PIN
      volumeMagnets: [{ strike: 1.1025, volume: 5000 }], // today's heaviest volume
      gexProfile: [                                       // gamma-heat source: peak near spot/max-pain
        { strike: 1.0850, callGex: 10, putGex: 40 },
        { strike: 1.0900, callGex: 200, putGex: 800 },
        { strike: 1.0950, callGex: 1500, putGex: 1800 }, // peak → hot
        { strike: 1.1000, callGex: 60, putGex: 20 },     // far → cold
        { strike: 1.1050, callGex: 15, putGex: 8 },
      ],
    },
    'NAS100_USD': {
      pair: 'NAS100_USD', spot: 20000, savedAt: '7/21/2026, 08:20:00',
      maxPain: 20050, callWall: 20200, putWall: 19800,
      callWalls: [{ strike: 20200, oi: 5000, tier: 2 }],
      putWalls:  [{ strike: 19800, oi: 6000, tier: 3 }],
      exposures: { gex: -800 },                          // negative net GEX → BREAKOUT
    },
    'EUR/GBP': { pair: 'EUR/GBP' },   // no walls → must be skipped entirely
  };
  const text = buildOILevelText(store, { generated: '2026-07-21 08:30 UTC' });
  ok('OI export has the block header', text.includes('OI WALLS & MAX PAIN'));
  ok('OI export stamps Generated', text.includes('Generated: 2026-07-21 08:30 UTC'));
  ok('OI export uses canonical FX header (EUR/USD → EURUSD)', /\nEURUSD\n/.test(text));
  ok('OI export uses canonical index header (NAS100_USD → NQ)', /\nNQ\n/.test(text));
  ok('OI export skips a pair with no levels (EUR/GBP absent)', !text.includes('EURGBP') && !text.includes('EUR/GBP'));
  ok('OI export emits FX walls at 5dp with tier', text.includes('OI 1.10000 : call_wall t3'));
  ok('OI export emits put_wall with tier', text.includes('OI 1.09000 : put_wall t3'));
  ok('OI export emits max_pain (no tier) at 5dp', text.includes('OI 1.09480 : max_pain'));
  ok('OI export emits index walls at 2dp', text.includes('OI 20200.00 : call_wall t2'));
  ok('OI export stamps the per-pair staleness line', text.includes('saved 7/21/2026, 08:15:00') && text.includes('spot 1.0955') && text.includes('DTE 4'));
  ok('OI export tags PIN regime from +GEX', text.includes('regime PIN'));
  ok('OI export tags BREAKOUT regime from -GEX', text.includes('regime BREAKOUT'));
  // GEX regime bands line (the format the Pine indicator parses into price-zoned shading):
  // "· gex-bands base=<r> <price>=<r> …" — base = regime below the lowest crossing, each
  // price = the regime ABOVE that crossing.
  {
    const bandStore = { 'EUR/USD': { pair: 'EUR/USD', spot: 1.0955, basis: 0, dte: 4,
      exposures: { gex: 500 }, refMove: { move: 0.006 }, gexFlips: [{ price: 1.0930, dir: 'long->short' }],
      callWalls: [{ strike: 1.1000, oi: 9000, tier: 'strong' }], putWalls: [{ strike: 1.0900, oi: 8000, tier: 'strong' }],
      maxPain: 1.0948, callWall: 1.1000, putWall: 1.0900 } };
    const bt = buildOILevelText(bandStore, { generated: 'x' });
    ok('OI export emits the gex-bands line (PIN below / BREAKOUT above the crossing)',
      bt.includes('· gex-bands base=pin 1.09300=breakout'));
  }
  ok('OI export emits volume magnet as oi_volume', text.includes('OI 1.10250 : oi_volume'));
  // Gamma heat (levelHeat): appended as a SECOND ' . ' segment, AFTER the expectation,
  // so the indicator's index-1 note read is undisturbed. Only when a gexProfile exists.
  {
    const lines = text.split('\n');
    const mpLine = lines.find(l => l.startsWith('OI 1.09480 : max_pain'));
    ok('OI export tags heat AFTER the expectation (max_pain near the peak → hot/warm)',
      / \. [^.\n]+ \. (hot|warm|cold)\s*$/.test(mpLine || ''), mpLine);
    ok('OI export marks a far level cold (call_wall 1.1000 away from the gamma peak)',
      (lines.find(l => l.startsWith('OI 1.10000 : call_wall')) || '').endsWith(' . cold'));
    const nqLine = lines.find(l => l.startsWith('OI 20200.00 : call_wall'));
    ok('OI export adds NO heat segment when there is no gexProfile (NQ block)',
      !/ \. (hot|warm|cold)\s*$/.test(nqLine || ''), nqLine);
  }
  // P(touch) as a THIRD ' . ' segment (index 3), keyed by exact price. Appended after the
  // expectation (1) and heat (2); a '-' placeholder holds heat's slot if heat were absent.
  {
    const reachByPair = { 'EUR/USD': { '1.094800': '82%~2h' } };
    const textR = buildOILevelText(store, { generated: 'x', reachByPair });
    const mpR = textR.split('\n').find(l => l.startsWith('OI 1.09480 : max_pain'));
    ok('OI export appends P(touch) after expectation + heat',
      / \. [^.\n]+ \. (hot|warm|cold|-) \. 82%~2h\s*$/.test(mpR || ''), mpR);
    ok('OI export omits P(touch) for levels with no reach entry',
      !/82%~2h/.test(textR.split('\n').find(l => l.startsWith('OI 1.10000 : call_wall')) || ''));
  }
  // SELF-HEAL: an entry whose gexProfile was shed by the localStorage quota-trim
  // (dropped FIRST as "rebuildable") still gets heat + P(touch), because the export
  // rebuilds the profile from the stored raw paste. This is the EUR/USD "no gex
  // profile in the morning" case — the profile is reconstructed, not lost.
  {
    const rawOI = [
      '1.0850\t100\t400',
      '1.0900\t2000\t8000',
      '1.0950\t15000\t18000',   // heaviest OI, nearest spot → gamma peak → hot
      '1.1000\t600\t200',       // light + off-peak → cold
      '1.1050\t150\t80',
    ].join('\n');
    const trimmed = {
      'EUR/USD': {
        pair: 'EUR/USD', spot: 1.0955, dte: 4, basis: 0, savedAt: '7/21/2026, 08:15:00',
        maxPain: 1.0948, callWall: 1.1000, putWall: 1.0900,
        callWalls: [{ strike: 1.1000, oi: 9000, tier: 3 }],
        putWalls:  [{ strike: 1.0900, oi: 8000, tier: 3 }],
        exposures: { gex: 1200 },
        rawOI,                    // gexProfile DELIBERATELY ABSENT (quota-trimmed)
      },
    };
    const th = buildOILevelText(trimmed, { generated: 'x' });
    const mp = th.split('\n').find(l => l.startsWith('OI 1.09480 : max_pain'));
    ok('OI export self-heals heat from rawOI when gexProfile was quota-trimmed',
      / \. (hot|warm|cold)\s*$/.test(mp || ''), mp);
    const cw = th.split('\n').find(l => l.startsWith('OI 1.10000 : call_wall'));
    // Walls now also carry the trailing hold token (`hNN`, segment 4, '-' placeholders
    // keeping earlier slots stable) — the heat read itself is unchanged.
    ok('OI export self-heal marks the far call_wall cold', /\. cold( \. [^.]*)*$/.test(cw || '') && / \. cold/.test(cw || ''), cw);
    ok('OI export walls carry the hold token (hNN, segment 4)', / \. h\d+\s*$/.test(cw || ''), cw);
    // Rebuild + reach compose: the heat placeholder never eats the touch slot.
    const thr = buildOILevelText(trimmed, { generated: 'x', reachByPair: { 'EUR/USD': { '1.094800': '82%~2h' } } });
    const mpr = thr.split('\n').find(l => l.startsWith('OI 1.09480 : max_pain'));
    ok('OI export self-heal composes with P(touch)',
      / \. (hot|warm|cold|-) \. 82%~2h( \. h\d+)?\s*$/.test(mpr || ''), mpr);
  }
  ok('OI export parser lines all start with "OI "',
     text.split('\n').filter(l => /^\d|^-?\d/.test(l.trim())).every(l => l.startsWith('OI ')));
  // Empty store → graceful placeholder, never a throw.
  ok('OI export handles empty store gracefully', buildOILevelText({}).includes('no OI data'));
}

// ── near-dated "day" expiry: bricks + dual-expiry export ─────────────────────
console.log('\n[oi day-expiry]');
{
  // computeExpiryLevels — walls/max-pain/regime from one spot-equivalent ladder.
  const cel = computeExpiryLevels(
    [1.08, 1.09, 1.10, 1.11, 1.12],
    [100, 500, 3000, 800, 200],       // calls
    [200, 4000, 3500, 300, 100],      // puts
    1.10, 'EUR/USD', { dte: 2, minOI: 20 });
  ok('computeExpiryLevels returns walls both sides', cel && cel.callWalls.length > 0 && cel.putWalls.length > 0);
  ok('computeExpiryLevels carries its DTE', cel.dte === 2, `${cel?.dte}`);
  ok('computeExpiryLevels tags a regime from GEX sign', cel.regime === 'PIN' || cel.regime === 'BREAKOUT', cel.regime);
  ok('computeExpiryLevels max pain is finite', Number.isFinite(cel.maxPain), `${cel.maxPain}`);
  ok('computeExpiryLevels builds a per-strike profile', Array.isArray(cel.gexProfile) && cel.gexProfile.length === 5);

  // pickNearExpiry — the SHORTEST expiry that still has real near-money OI.
  const legs = [
    { dte: 2,  strikes: [1.09, 1.10, 1.11], calls: [2000, 3000, 1500], puts: [1800, 2800, 1400] },
    { dte: 14, strikes: [1.09, 1.10, 1.11], calls: [3000, 5000, 2500], puts: [2800, 4800, 2400] },
  ];
  ok('pickNearExpiry picks the nearer expiry when it has real OI', pickNearExpiry(legs, 1.10, { belowDte: 14 })?.leg?.dte === 2);
  const thin = [
    { dte: 1,  strikes: [1.10, 1.11], calls: [5, 3], puts: [5, 2] },   // near but ~empty (15 lots — under both floors)
    { dte: 14, strikes: [1.09, 1.10, 1.11], calls: [3000, 5000, 2500], puts: [2800, 4800, 2400] },
  ];
  const thinPick = pickNearExpiry(thin, 1.10, { belowDte: 14 });
  ok('pickNearExpiry skips a too-thin front expiry (no day set)', thinPick.leg === null);
  ok('pickNearExpiry says WHY it skipped (thin near spot)', /thin near spot/i.test(thinPick.reason), thinPick.reason);
  // Absolute floor: a near expiry that is a small FRACTION of a huge monthly still
  // qualifies if it clears the absolute lots floor (the gold case — dailies dwarfed by
  // the monthly but still tradeable).
  const goldLegs = [
    { dte: 1,  strikes: [4040, 4050, 4060], calls: [300, 400, 250], puts: [280, 350, 220] },   // ~1800 lots near spot
    { dte: 24, strikes: [4040, 4050, 4060], calls: [40000, 50000, 30000], puts: [38000, 48000, 28000] },  // huge monthly
  ];
  const gp = pickNearExpiry(goldLegs, 4050, { belowDte: 24 });
  ok('pickNearExpiry surfaces a near expiry dwarfed by the monthly (absolute floor)', gp.leg?.dte === 1, `${gp.reason}`);

  // Dual-expiry store → oiStoreToLevels emits BOTH sets, DTE-tagged.
  const dual = {
    'EUR/USD': {
      pair: 'EUR/USD', spot: 1.0955, dte: 14, savedAt: '7/21/2026, 08:15:00',
      maxPain: 1.0948, callWall: 1.1000, putWall: 1.0900,
      callWalls: [{ strike: 1.1000, oi: 9000, tier: 'strong' }],
      putWalls:  [{ strike: 1.0900, oi: 8000, tier: 'strong' }],
      exposures: { gex: 1200 },                          // primary (far) → PIN
      dayExpiry: {
        dte: 2, maxPain: 1.0950,
        callWalls: [{ strike: 1.0980, oi: 4000, tier: 'strong' }],
        putWalls:  [{ strike: 1.0920, oi: 3500, tier: 'strong' }],
        callWall: 1.0980, putWall: 1.0920,
        exposures: { gex: -500 },                        // near-dated (day) → BREAKOUT
        gexProfile: [{ strike: 1.0940, callGex: 50, putGex: 80 }, { strike: 1.0950, callGex: 600, putGex: 900 }, { strike: 1.0980, callGex: 40, putGex: 20 }],
        gammaFlip: 1.0955, regime: 'BREAKOUT',
      },
    },
  };
  const dlevels = oiStoreToLevels(dual['EUR/USD']);
  ok('oiStoreToLevels tags the far set with the primary DTE', dlevels.some(l => l.price === 1.1000 && l.dte === 14));
  ok('oiStoreToLevels emits the near-dated day walls tagged with their DTE', dlevels.some(l => l.price === 1.0980 && l.dte === 2 && l.type === 'call_wall'));
  ok('oiStoreToLevels emits the day max_pain', dlevels.some(l => l.price === 1.0950 && l.dte === 2 && l.type === 'max_pain'));

  const dtext = buildOILevelText(dual, { generated: 'x' });
  ok('dual export tags far walls with 14dte', /OI 1\.10000 : call_wall[^\n]* 14dte/.test(dtext), dtext.split('\n').find(l => l.startsWith('OI 1.10000')));
  ok('dual export emits day walls tagged 2dte', /OI 1\.09800 : call_wall[^\n]* 2dte/.test(dtext), dtext.split('\n').find(l => l.startsWith('OI 1.09800')));
  ok('dual export tints the NEAR-DATED regime (BREAKOUT), far book shown as long/short-gamma',
    /regime BREAKOUT/.test(dtext) && /(long-gamma|short-gamma)/.test(dtext) && !/regime PIN/.test(dtext),
    dtext.split('\n').find(l => l.includes('regime')));
  // Single-expiry (no dayExpiry) → NO dte tags, byte-identical shape.
  const single = { 'EUR/USD': { ...dual['EUR/USD'], dayExpiry: undefined } };
  ok('no dayExpiry → no dte tag on any line', !/\ddte/.test(buildOILevelText(single, { generated: 'x' })));

  // buildOIEntry (what /api/oi/reanalyse calls per stored pair) wires dayExpiry through
  // end-to-end, HEADLESS + pinned to the stored basis (skipLiveQuote → no network).
  const M = [
    '\t6EU6', '1.0955\t6EU6', 'Strike\tNEAR', '2 DTE\tFAR', '30 DTE\tX', 'C\tP\tC\tP',
    '1.0850\t120\t900\t400\t1500',
    '1.0900\t3000\t6000\t5000\t7000',
    '1.0950\t9000\t9500\t12000\t13000',
    '1.1000\t2500\t1200\t6000\t3000',
    '1.1050\t300\t150\t2000\t900',
  ].join('\n');
  const re = await buildOIEntry({ pair: 'EUR/USD', rawOI: M, spotRaw: 1.0955, futuresRaw: 1.0955, manualFutures: true, skipLiveQuote: true });
  ok('buildOIEntry runs headless + pins the stored spot (skipLiveQuote)', !re.error && Math.abs(re.inst.spot - 1.0955) < 1e-9, re.error || `${re.inst?.spot}`);
  ok('buildOIEntry populates the near-dated dayExpiry from a multi-expiry matrix', !!re.inst?.dayExpiry && re.inst.dayExpiry.dte === 2, `${re.inst?.dayExpiry?.dte}`);
  ok('re-analysed dayExpiry carries its own walls + regime', re.inst?.dayExpiry
    && Number.isFinite(re.inst.dayExpiry.callWall) && Number.isFinite(re.inst.dayExpiry.putWall)
    && (re.inst.dayExpiry.regime === 'PIN' || re.inst.dayExpiry.regime === 'BREAKOUT'));

  // Per-expiry SPOT-terms breakdown — for cross-desk comparison / calc verification. A
  // LONGER expiry whose OI is centred below a rallied spot shows max-pain/walls below spot
  // (exactly the "colleague's max pain is under our spot" case), while near expiries sit at
  // spot. Proves the raw-OI calc is per-expiry and deterministic.
  const cmpOI = [
    '\t6EU6', '1.1545\t6EU6', 'Strike\tA', '1 DTE\tB', '30 DTE\tC', 'C\tP\tC\tP',
    '1.1450\t50\t200\t8000\t9000',   // far expiry's heavy OI, below spot
    '1.1545\t3000\t3500\t3000\t2500',
    '1.1580\t2500\t600\t1500\t400',
  ].join('\n');
  const cmp = await buildOIEntry({ pair: 'EUR/USD', rawOI: cmpOI, spotRaw: 1.1545, futuresRaw: 1.1545, manualFutures: true, skipLiveQuote: true });
  const pe = cmp.inst?.perExpiry || [];
  ok('perExpiry has a row per expiry', pe.length === 2 && pe[0].dte === 1 && pe[1].dte === 30, pe.map(e => e.dte).join(','));
  ok('a far expiry shows max pain BELOW spot (the cross-desk case)', pe.find(e => e.dte === 30)?.maxPain < 1.1545, `${pe.find(e => e.dte === 30)?.maxPain}`);
  ok('a near expiry maxPain sits at/near spot', Math.abs((pe.find(e => e.dte === 1)?.maxPain ?? 0) - 1.1545) < 0.005);
  // A near-EMPTY expiry column (no wall ≥ minOI → garbage max pain, e.g. 0.908 on EUR/USD)
  // is dropped, so neither the text table nor an all-expiry line draws junk.
  const emptyCol = [
    '\t6EU6', '1.1532\t6EU6', 'Strike\tA', '1 DTE\tB', '9 DTE\tC', 'C\tP\tC\tP',
    '1.1450\t3000\t5000\t2\t3', '1.1500\t2000\t2500\t1\t2', '1.1550\t2500\t600\t3\t1',
  ].join('\n');
  const ec = await buildOIEntry({ pair: 'EUR/USD', rawOI: emptyCol, spotRaw: 1.1532, futuresRaw: 1.1532, manualFutures: true, skipLiveQuote: true });
  ok('perExpiry drops a near-empty column (no walls → junk max pain)',
    (ec.inst.perExpiry || []).every(e => e.dte !== 9) && (ec.inst.perExpiry || []).some(e => e.dte === 1),
    (ec.inst.perExpiry || []).map(e => e.dte).join(','));

  // Inverted-pair (6J/6C/6S) call/put swap now defaults ON — a 6J CALL wall reads as a
  // USD/JPY PUT wall (dealer-hedging convention; matches external CME OI dashboards). The
  // un-flipped labels put every put wall ABOVE spot, which is backwards.
  const jpyOI = [
    '\t6J', '0.006337\t6J', 'Strike\tA', '30 DTE\tB', 'C\tP',
    '0.006300\t500\t400', '0.006337\t9000\t800', '0.006370\t600\t7000',   // heavy CALL at 0.006337 (=USD/JPY 157.80)
  ].join('\n');
  const jf = await buildOIEntry({ pair: 'USD/JPY', rawOI: jpyOI, spotRaw: 157.8, futuresRaw: 0.006337, manualFutures: true, skipLiveQuote: true });
  const jn = await buildOIEntry({ pair: 'USD/JPY', rawOI: jpyOI, spotRaw: 157.8, futuresRaw: 0.006337, manualFutures: true, skipLiveQuote: true, swapCP: false });
  ok('inverted pair flips call/put by DEFAULT', jf.inst.cpSwapped === true);
  ok('swapCP:false forces the flip OFF (escape hatch)', jn.inst.cpSwapped === false);
  ok('flipped: the heavy-CALL 6J strike reads as a USD/JPY PUT wall',
    jf.inst.putWalls.some(w => Math.abs(w.strike - 157.80) < 0.05 && w.oi === 9000),
    jf.inst.putWalls.map(w => w.strike.toFixed(2) + ':' + w.oi).join(' '));
  ok('un-flipped: the same strike reads as a CALL wall',
    jn.inst.callWalls.some(w => Math.abs(w.strike - 157.80) < 0.05 && w.oi === 9000));
  const eu = await buildOIEntry({ pair: 'EUR/USD', rawOI: '\t6E\n1.15\t6E\nStrike\tA\n30 DTE\tB\nC\tP\n1.1450\t500\t900\n1.1500\t3000\t2500\n1.1550\t2000\t400', spotRaw: 1.15, futuresRaw: 1.15, manualFutures: true, skipLiveQuote: true, swapCP: true });
  ok('non-inverted pair never flips (swapCP:true ignored on EUR/USD)', eu.inst.cpSwapped === false);

  // The day's trading band (from annualised vol, K=3 ≈ beyond the 99th-pct day) + catch level.
  ok('oiDayBandFrac: gold ~18% vol → ~3.4% band', Math.abs(oiDayBandFrac(18, 'XAU/USD') - 0.034) < 0.002, `${oiDayBandFrac(18, 'XAU/USD')}`);
  ok('oiDayBandFrac: EUR/USD ~7.5% vol → ~1.4% band', Math.abs(oiDayBandFrac(7.5, 'EUR/USD') - 0.0142) < 0.002, `${oiDayBandFrac(7.5, 'EUR/USD')}`);
  ok('oiDayBandFrac: bigger K → wider band', oiDayBandFrac(10, 'USD/JPY', { k: 4 }) > oiDayBandFrac(10, 'USD/JPY', { k: 3 }));
  ok('oiDayBandFrac: no vol → sane flat-vol fallback', oiDayBandFrac(null, 'EUR/USD') > 0.005 && oiDayBandFrac(null, 'EUR/USD') < 0.05);
  {
    const lv = [90, 98, 99, 101, 102, 110].map(p => ({ price: p, type: 'x' }));
    const sel = oiBandSelect(lv, 100, 0.03);   // band [97, 103]
    ok('oiBandSelect: keeps in-band levels', sel.inBand.map(l => l.price).join(',') === '98,99,101,102');
    ok('oiBandSelect: catch = nearest beyond band each side', sel.catch.map(l => l.price).sort((a, b) => a - b).join(',') === '90,110'
      && sel.catch.every(l => l.catch === true));
    ok('oiBandSelect: no band → everything in-band, no catch', (() => { const s = oiBandSelect(lv, 100, 0); return s.inBand.length === 6 && s.catch.length === 0; })());
  }
  // Band-bounded export: a mid-expiry wall inside the band draws; the default export without a
  // band is unchanged (no per-expiry lines unless allExpiry).
  {
    const many = [   // distinct per-expiry peaks: 1d cw1.1560, 5d cw1.1575/pw1.1520 (in band), 30d far
      '\t6E', '1.1545\t6E', 'Strike\tA', '1 DTE\tB', '5 DTE\tC', '30 DTE\tD', 'C\tP\tC\tP\tC\tP',
      '1.1450\t20\t50\t20\t60\t200\t9000', '1.1520\t100\t200\t300\t8000\t400\t500', '1.1530\t400\t9000\t200\t300\t300\t400',
      '1.1560\t9000\t300\t500\t400\t600\t300', '1.1575\t300\t100\t8000\t200\t500\t200', '1.1650\t100\t50\t200\t40\t9000\t100',
    ].join('\n');
    const m = await buildOIEntry({ pair: 'EUR/USD', rawOI: many, spotRaw: 1.1545, futuresRaw: 1.1545, manualFutures: true, skipLiveQuote: true });
    const band = oiDayBandFrac(7.5, 'EUR/USD');
    const noBand = buildOILevelText({ 'EUR/USD': m.inst }, { generated: 'x' }).split('\n').filter(l => l.startsWith('OI '));
    const withBand = buildOILevelText({ 'EUR/USD': m.inst }, { generated: 'x', bandByPair: { 'EUR/USD': band } }).split('\n').filter(l => l.startsWith('OI '));
    ok('band export adds the in-band mid-expiry (5dte) walls', withBand.some(l => /5dte/.test(l)) && !noBand.some(l => /5dte/.test(l)), `${noBand.length}→${withBand.length}`);
  }

  // Live basis re-projection: EVERY spot-equivalent level moves by −Δbasis (the light intraday
  // "basis control"); distances and OI-derived structure stay put; spot/futures/basis freshen.
  {
    const inst = {
      pair: 'EUR/USD', spot: 1.1500, daySpot: 1.1490, daySpotAt: 111, futures: 1.1503, basis: 0.0003,
      maxPain: 1.1450, callWall: 1.1600, putWall: 1.1400, gammaFlip: 1.1480, gexFlip: 1.1470,
      callWalls: [{ strike: 1.1600, oi: 9000 }], putWalls: [{ strike: 1.1400, oi: 8000 }],
      gexFlips: [{ price: 1.1470 }], volumeMagnets: [{ strike: 1.1550 }], clusters: [{ center: 1.1590 }],
      perExpiry: [{ dte: 2, maxPain: 1.1455, callWall: 1.1605, putWall: 1.1405 }],
      expectedMove: { upper: 1.1650, lower: 1.1350, move: 0.0300 },
      dayExpiry: { dte: 1, maxPain: 1.1452, callWall: 1.1590, putWall: 1.1410, callWalls: [{ strike: 1.1590, oi: 3000 }] },
    };
    const rp = oiReprojectBasis(inst, { newBasis: 0.0008, newSpot: 1.1502, newFutures: 1.1510 });   // Δ=+0.0005 → −0.0005 shift
    const d = 0.0005, close = (a, b) => Math.abs(a - b) < 1e-9;
    ok('reproject shifts headline levels by −Δbasis', close(rp.maxPain, 1.1450 - d) && close(rp.callWall, 1.1600 - d) && close(rp.gammaFlip, 1.1480 - d));
    ok('reproject shifts nested wall/flip/cluster/perExpiry/dayExpiry levels', close(rp.callWalls[0].strike, 1.1600 - d)
      && close(rp.gexFlips[0].price, 1.1470 - d) && close(rp.clusters[0].center, 1.1590 - d)
      && close(rp.perExpiry[0].callWall, 1.1605 - d) && close(rp.dayExpiry.putWall, 1.1410 - d) && close(rp.dayExpiry.callWalls[0].strike, 1.1590 - d));
    ok('reproject leaves DISTANCE fields (expectedMove.move) untouched', close(rp.expectedMove.move, 0.0300) && close(rp.expectedMove.upper, 1.1650 - d));
    ok('reproject freshens spot/futures/basis', close(rp.spot, 1.1502) && close(rp.futures, 1.1510) && close(rp.basis, 0.0008));
    ok('reproject preserves the day-anchor (daySpot fixed while spot moves)', close(rp.daySpot, 1.1490) && rp.daySpotAt === 111);
    const same = oiReprojectBasis(inst, { newBasis: 0.0003, newSpot: 1.1501, newFutures: 1.1504 });   // Δ=0 → no level move
    ok('reproject with zero Δbasis moves no levels', close(same.maxPain, 1.1450) && close(same.spot, 1.1501));
    ok('reproject preserves day-anchor even with zero Δbasis', close(same.daySpot, 1.1490) && same.daySpotAt === 111);
  }

  // Day-anchor spot: buildOIEntry stamps daySpot/daySpotAt, and a same-day re-analyse carries
  // the ORIGINAL anchor forward (so "drift from start of day" doesn't reset when the chain is
  // re-derived or the basis refreshes intraday).
  {
    const oi = ['\t6EU6', '1.1545\t6EU6', 'Strike\tC\tP', '1.1500\t100\t9000', '1.1600\t9000\t100'].join('\n');
    const first = await buildOIEntry({ pair: 'EUR/USD', rawOI: oi, spotRaw: 1.1545, futuresRaw: 1.1545, manualFutures: true, skipLiveQuote: true });
    ok('buildOIEntry stamps a day-anchor spot', Math.abs(first.inst.daySpot - 1.1545) < 1e-9 && Number.isFinite(first.inst.daySpotAt));
    const again = await buildOIEntry({ pair: 'EUR/USD', rawOI: oi, spotRaw: 1.1560, futuresRaw: 1.1560, manualFutures: true, skipLiveQuote: true, priorEntry: first.inst });
    ok('same-day re-analyse keeps the original day-anchor', Math.abs(again.inst.daySpot - 1.1545) < 1e-9 && again.inst.daySpotAt === first.inst.daySpotAt && Math.abs(again.inst.spot - 1.1560) < 1e-9);
  }
  // GEX regime bands: the LOCAL PIN/BREAKOUT map from the zero-gamma crossings, so fade/follow
  // can key off where price sits, not the net-GEX scalar. Each band's regime = the crossing's own dir.
  {
    // Two crossings: long->short at 1.1500 (so below it = long/pin), short->long at 1.1600
    // (so between = short/breakout, above = long/pin again).
    const inst = { spot: 1.1550, exposures: { gex: 500 }, refMove: { move: 0.0100 },
      gexFlips: [{ price: 1.1500, dir: 'long->short' }, { price: 1.1600, dir: 'short->long' }] };
    const bands = oiRegimeBands(inst, { lo: 1.1400, hi: 1.1700 });
    ok('regime bands split the range at every crossing', bands.length === 3
      && Math.abs(bands[0].hi - 1.1500) < 1e-9 && Math.abs(bands[1].hi - 1.1600) < 1e-9);
    ok('regime bands read PIN below / BREAKOUT between / PIN above from each crossing dir',
      bands[0].regime === 'pin' && bands[1].regime === 'breakout' && bands[2].regime === 'pin');
    // No crossings in range → one band from the net-GEX sign.
    const flat = oiRegimeBands({ spot: 1.1550, exposures: { gex: -10 }, refMove: { move: 0.0100 }, gexFlips: [] }, { lo: 1.15, hi: 1.16 });
    ok('regime bands fall back to the net-GEX sign with no crossings', flat.length === 1 && flat[0].regime === 'breakout');
    // Crossing outside the window is ignored; window defaults from spot ± 4×refMove when absent.
    const dflt = oiRegimeBands(inst);
    ok('regime bands default their window from spot ± 4×refMove', dflt.length >= 1
      && dflt[0].lo < 1.1550 && dflt[dflt.length - 1].hi > 1.1550);
  }

  const cmpTxt = buildOILevelText({ 'EUR/USD': cmp.inst }, { generated: 'x' });
  ok('export renders the per-expiry breakdown block', /per-expiry \(mp = max pain/.test(cmpTxt) && /30DTE  mp /.test(cmpTxt));

  // allExpiry: draw EVERY expiry's max-pain/walls as DTE-tagged OI lines, filling in the
  // expiries the primary+day sets don't already cover. Default export must NOT gain them.
  const many = [   // distinct per-expiry peaks so a middle expiry draws its own lines
    '\t6EU6', '1.1545\t6EU6', 'Strike\tA', '1 DTE\tB', '5 DTE\tC', '30 DTE\tD', 'C\tP\tC\tP\tC\tP',
    '1.1450\t20\t50\t20\t60\t200\t9000', '1.1520\t100\t200\t300\t8000\t400\t500', '1.1530\t400\t9000\t200\t300\t300\t400',
    '1.1560\t9000\t300\t500\t400\t600\t300', '1.1575\t300\t100\t8000\t200\t500\t200', '1.1650\t100\t50\t200\t40\t9000\t100',
  ].join('\n');
  const mr = await buildOIEntry({ pair: 'EUR/USD', rawOI: many, spotRaw: 1.1545, futuresRaw: 1.1545, manualFutures: true, skipLiveQuote: true });
  const defLines = buildOILevelText({ 'EUR/USD': mr.inst }, { generated: 'x' }).split('\n').filter(l => l.startsWith('OI '));
  const allLines = buildOILevelText({ 'EUR/USD': mr.inst }, { generated: 'x', allExpiry: true }).split('\n').filter(l => l.startsWith('OI '));
  ok('allExpiry adds OI lines beyond the default set', allLines.length > defLines.length, `${defLines.length} → ${allLines.length}`);
  const coveredDtes = new Set([mr.inst.dte, mr.inst.dayExpiry?.dte].filter(Number.isFinite));
  const midDte = (mr.inst.perExpiry || []).map(e => e.dte).find(d => !coveredDtes.has(d));
  ok('allExpiry draws the uncovered middle expiry as lines', midDte != null && allLines.some(l => l.includes(`max_pain ${midDte}dte`)), `mid=${midDte}`);
  ok('default export does NOT include that middle expiry', !defLines.some(l => l.includes(`max_pain ${midDte}dte`)));

  // terms:'futures' adds the stored basis back so the lines overlay a FUTURES chart
  // (a colleague on CME/COMEX). Default 'spot' is unchanged.
  const goldStore = {
    'XAU/USD': {
      pair: 'XAU/USD', spot: 4110, basis: 4, dte: 1, savedAt: 'x',
      maxPain: 4150, callWall: 4300, putWall: 3900,
      callWalls: [{ strike: 4300, oi: 9000, tier: 'strong' }],
      putWalls:  [{ strike: 3900, oi: 8000, tier: 'strong' }],
      exposures: { gex: 500 },
    },
  };
  const spotTxt = buildOILevelText(goldStore, { generated: 'x' });
  const futTxt  = buildOILevelText(goldStore, { generated: 'x', terms: 'futures' });
  ok('spot export draws the call wall at the spot strike (4300)', /OI 4300\.00 : call_wall/.test(spotTxt), spotTxt.split('\n').find(l => l.includes('call_wall')));
  ok('futures export adds the basis back (+4 → 4304)', /OI 4304\.00 : call_wall/.test(futTxt), futTxt.split('\n').find(l => l.includes('call_wall')));
  ok('futures export flags the terms on a context line', /futures\/CME terms/i.test(futTxt));
  ok('spot export carries NO futures-terms note', !/futures\/CME terms/i.test(spotTxt));
}

// ── Range Percentile core (js/rangePercentileCore.js, 2026-08-17) ────────────
{
  // 20 synthetic daily bars, open=100 fixed, H-L range widening linearly from
  // 1% to 20% of open so the trailing distribution and quantiles are hand-checkable.
  const daily = Array.from({ length: 20 }, (_, i) => ({ open: 100, high: 100 + (i + 1) / 2, low: 100 - (i + 1) / 2 }));
  // dist for uptoIdx=20 (all 20 days): H-L% = (i+1)/100 for i=0..19 → 0.01..0.20
  const dist = trailingRangeDistribution(daily, 20, 20);
  ok('trailingRangeDistribution: correct count', dist.length === 20, `n=${dist.length}`);
  ok('trailingRangeDistribution: sorted ascending', dist.every((v, i) => i === 0 || v >= dist[i - 1]));
  ok('trailingRangeDistribution: min/max match hand calc', near(dist[0], 0.01, 1e-9) && near(dist[19], 0.20, 1e-9), `min=${dist[0]} max=${dist[19]}`);
  ok('trailingRangeDistribution: lookback trims to the last N', trailingRangeDistribution(daily, 20, 5).length === 5);
  ok('trailingRangeDistribution: excludes uptoIdx itself (no lookahead)', trailingRangeDistribution(daily, 10, 20).length === 10);

  ok('quantile: median of 0.01..0.20 step 0.01 ≈ 0.105', near(quantile(dist, 0.5), 0.105, 1e-9), `${quantile(dist, 0.5)}`);
  ok('quantile: q=0 returns the min', near(quantile(dist, 0), 0.01, 1e-9));
  ok('quantile: q=1 returns the max', near(quantile(dist, 1), 0.20, 1e-9));
  ok('percentileOf: value below all of dist → 0', percentileOf(dist, 0.001) === 0);
  ok('percentileOf: value above all of dist → 1', percentileOf(dist, 1) === 1);
  ok('percentileOf/quantile round-trip at the median', near(percentileOf(dist, quantile(dist, 0.5)), 0.5, 0.05));

  const read = rangeExhaustionRead(daily, 20, 100, 100 + 0.105 * 100 / 2, 100 - 0.105 * 100 / 2, 20);
  ok('rangeExhaustionRead: live == median → usedFracOfMedian ≈ 1', near(read.usedFracOfMedian, 1, 1e-6), `${read.usedFracOfMedian}`);
  ok('rangeExhaustionRead: sessions reported == lookback used', read.sessions === 20);
  const readTight = rangeExhaustionRead(daily, 20, 100, 100.005, 99.995, 20);   // tiny live range
  ok('rangeExhaustionRead: a tiny live range reads far below median', readTight.usedFracOfMedian < 0.2, `${readTight.usedFracOfMedian}`);
  ok('rangeExhaustionRead: null on too little trailing history', rangeExhaustionRead(daily, 3, 100, 101, 99, 20, 5) === null);
  ok('rangeExhaustionRead: null on degenerate sessionOpen', rangeExhaustionRead(daily, 20, 0, 101, 99, 20) === null);
}

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
