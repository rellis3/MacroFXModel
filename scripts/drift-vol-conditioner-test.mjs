/**
 * drift-vol-conditioner-test — does |drift| inform future VOLATILITY?
 *
 * Direction is dead: `drift-direction-test.mjs` is null at every horizon. This asks
 * the other question. Not "which way" but "how much" — whether the MAGNITUDE of the
 * drift reading carries information about future realised volatility that a standard
 * vol model does not already have.
 *
 * The prior is reasonable rather than hopeful: a fortnight in which price travelled a
 * long way in one direction is a fortnight in which something was repricing, and
 * repricing regimes are not volatility-neutral. That is a claim about the second
 * moment, and it survives the first-moment nulls untouched.
 *
 * ## The confound, stated before the result
 *
 * The page shows d = mu/sigma. Sigma is in the DENOMINATOR, and sigma is most of what
 * a vol model already uses, so |d| is mechanically entangled with the baseline: a low
 * -vol fortnight inflates |d| by construction. A naive test would rediscover vol
 * mean-reversion and call it a drift finding. So the primary treatment is |mu|, the
 * RAW drift magnitude, which has no sigma in it. |d| is reported alongside as the
 * quantity actually on the page, with the entanglement flagged rather than hidden.
 *
 * PRE-REGISTERED before the first run:
 *
 *   Baseline  HAR: log RV_fwd ~ log RV_1 + log RV_5 + log RV_22, all causal at t.
 *             Daily variance proxy is Parkinson (1/(4 ln2))(ln H/L)^2 -- far less
 *             noisy than r^2 and available from the OHLC already loaded.
 *   Target    RV_fwd(t,h) = mean Parkinson variance over t+1 .. t+h. Excludes day t.
 *   Treatment |mu(t)| (primary) and |d(t)| = |mu/sigma_YZ| (secondary), causal.
 *   Fit       Per pair, OLS on IS, evaluated on OOS. 60/40 time split, no shuffling.
 *             PER PAIR, not pooled: 25 FX pairs share risk-on and liquidity factors,
 *             so a pooled t-stat would count one market many times.
 *   Aggregate Cross-pair t on the treatment coefficient, plus the count of pairs whose
 *             OOS R^2 improves. The coefficient t is over 25 pair-level estimates,
 *             which is the honest unit of independence here (and still generous).
 *   Horizons  h = 1, 5, 20 trading days, NON-OVERLAPPING (step h).
 *   PASS      mean OOS dR^2 > 0 AND >= 18/25 pairs improve AND cross-pair |t| > 2 on
 *             the coefficient with a consistent sign. Anything else is NULL.
 *
 * ## MEASURED 2026-09-18 -- NULL, and significance was never the problem
 *
 * 25 pairs, per-pair OOS R^2, HAR baseline vs baseline + treatment:
 *
 *   h   treat    base -> +treat     mean dR^2   improved   cross-pair coef t
 *    1  absMu   0.1479 -> 0.1481     +0.0002     14/25          +8.31
 *    1  absD    0.1479 -> 0.1476     -0.0003     11/25          +7.85
 *    5  absMu   0.4281 -> 0.4252     -0.0029      9/25          +6.36
 *   20  absMu   0.4177 -> 0.3978     -0.0199      4/25          +4.30
 *
 * The coefficient is positive, large and consistent -- 24 of 25 pairs at h=1, t=+8.31.
 * The forecast does not improve, and at h=20 it degrades by two R^2 points. That gap
 * is the whole lesson: |mu| IS associated with future vol, and the association is
 * already inside the HAR terms. Measured directly, corr(|mu|, log RV_22) runs
 * 0.33-0.50 across majors. Adding a redundant, noisily-estimated regressor buys
 * nothing and costs out-of-sample accuracy.
 *
 * |d| is worse and for a reason worth keeping: corr(|d|, log RV_22) is ~0.00
 * (-0.035 to +0.098 across majors). Dividing mu by sigma removes the volatility
 * information deliberately. The page's own d cannot condition vol because d is
 * constructed to be scale-free in exactly the quantity being forecast.
 *
 * A significant coefficient is not a forecast. That is the same lesson the page's
 * t-stat tile teaches about the first moment, arriving here in the second.
 *
 * Run: node scripts/drift-vol-conditioner-test.mjs
 */
import fs from 'fs'; import path from 'path';
import { parquetRead, parquetMetadataAsync } from 'hyparquet';
import { yangZhangVolSeries } from '../js/volForecast.js';

const DIR = new URL('../VolRangeForecaster/data/m1/', import.meta.url).pathname;
const PAIRS = ['eurusd','gbpusd','audusd','nzdusd','usdjpy','usdcad','usdchf',
  'eurgbp','eurjpy','eurchf','eurcad','euraud','eurnzd','gbpjpy','gbpchf','gbpcad',
  'gbpaud','gbpnzd','audjpy','audchf','audcad','audnzd','cadjpy','chfjpy','nzdjpy'];
const WIN = 14, HORIZONS = [1, 5, 20], SPLIT = 0.60, MINPAIR = 18;

async function daily(file) {
  const ab = fs.readFileSync(file);
  const buf = ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength);
  const f = { byteLength: buf.byteLength, slice: (s, e) => Promise.resolve(buf.slice(s, e)) };
  const meta = await parquetMetadataAsync(f);
  let rows; await parquetRead({ file: f, metadata: meta,
    columns: ['open','high','low','close','datetime'], rowFormat: 'object', onComplete: d => rows = d });
  const days = new Map();
  for (const r of rows) {
    const t = r.datetime instanceof Date ? r.datetime : new Date(r.datetime);
    const k = t.toISOString().slice(0, 10);
    let d = days.get(k);
    if (!d) { d = { open: r.open, high: r.high, low: r.low, close: r.close }; days.set(k, d); }
    else { if (r.high > d.high) d.high = r.high; if (r.low < d.low) d.low = r.low; d.close = r.close; }
  }
  return [...days.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([date, d]) => ({ date, ...d }));
}

const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1 || 1)); };
const tstat = a => a.length < 3 ? NaN : mean(a) / (sd(a) / Math.sqrt(a.length));

/** OLS via normal equations with partial pivoting. X includes its own intercept column. */
function ols(X, y) {
  const n = X.length, k = X[0].length;
  const A = Array.from({ length: k }, () => new Float64Array(k + 1));
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      for (let b = 0; b < k; b++) A[a][b] += X[i][a] * X[i][b];
      A[a][k] += X[i][a] * y[i];
    }
  }
  for (let c = 0; c < k; c++) {
    let piv = c; for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let b = c; b <= k; b++) A[r][b] -= f * A[c][b];
    }
  }
  return Array.from({ length: k }, (_, i) => A[i][k] / A[i][i]);
}
const predict = (b, row) => b.reduce((s, v, i) => s + v * row[i], 0);
/** Out-of-sample R^2 against the IS mean -- the honest benchmark for a forecast. */
function oosR2(yTrue, yHat, isMean) {
  let ss = 0, tt = 0;
  for (let i = 0; i < yTrue.length; i++) { ss += (yTrue[i] - yHat[i]) ** 2; tt += (yTrue[i] - isMean) ** 2; }
  return tt > 0 ? 1 - ss / tt : NaN;
}

console.log('loading M1 caches...');
const PK = {}, D = {}, S = {};
for (const p of PAIRS) {
  const file = path.join(DIR, p + '_m1.parquet');
  if (!fs.existsSync(file)) { console.error('missing', p); continue; }
  const d1 = await daily(file); if (d1.length < 400) continue;
  D[p] = d1;
  S[p] = yangZhangVolSeries(d1);
  // Parkinson daily variance proxy.
  PK[p] = d1.map(b => (b.high > 0 && b.low > 0) ? (Math.log(b.high / b.low) ** 2) / (4 * Math.LN2) : null);
}
const live = PAIRS.filter(p => D[p]);
console.log(`${live.length} pairs\n`);

const avg = (arr, i, n) => {           // causal mean of the n values ending at i
  let s = 0, c = 0;
  for (let j = i - n + 1; j <= i; j++) { const v = arr[j]; if (v > 0) { s += v; c++; } }
  return c === n ? s / n : null;
};
const fwdAvg = (arr, i, h) => {        // mean over i+1 .. i+h
  let s = 0, c = 0;
  for (let j = i + 1; j <= i + h; j++) { const v = arr[j]; if (v > 0) { s += v; c++; } }
  return c === h ? s / h : null;
};

const results = [];
for (const h of HORIZONS) {
  for (const treat of ['absMu', 'absD']) {
    const coefT = [], dR2 = [], baseR2 = [], fullR2 = [];
    for (const p of live) {
      const bars = D[p], pk = PK[p], sig = S[p];
      const rows = [];
      for (let i = 35; i + h < bars.length; i += h) {          // non-overlapping
        const r1 = pk[i], r5 = avg(pk, i, 5), r22 = avg(pk, i, 22), fw = fwdAvg(pk, i, h);
        if (!(r1 > 0) || !(r5 > 0) || !(r22 > 0) || !(fw > 0)) continue;
        const s0 = sig[i]; if (!(s0 > 0)) continue;
        const mu = Math.log(bars[i].close / bars[i - WIN].close) / WIN;
        if (!Number.isFinite(mu)) continue;
        const absMu = Math.abs(mu) * 100;
        const absD = absMu / (s0 * 100);
        rows.push({ x: [1, Math.log(r1), Math.log(r5), Math.log(r22)],
                    t: treat === 'absMu' ? absMu : absD, y: Math.log(fw) });
      }
      if (rows.length < 80) continue;
      const cut = Math.floor(rows.length * SPLIT);
      const IS = rows.slice(0, cut), OS = rows.slice(cut);
      const yIS = IS.map(r => r.y), yOS = OS.map(r => r.y);
      const isMean = mean(yIS);

      const bB = ols(IS.map(r => r.x), yIS);
      const bF = ols(IS.map(r => [...r.x, r.t]), yIS);
      if (!bB || !bF) continue;

      const r2B = oosR2(yOS, OS.map(r => predict(bB, r.x)), isMean);
      const r2F = oosR2(yOS, OS.map(r => predict(bF, [...r.x, r.t])), isMean);
      if (!Number.isFinite(r2B) || !Number.isFinite(r2F)) continue;

      baseR2.push(r2B); fullR2.push(r2F); dR2.push(r2F - r2B);
      coefT.push(bF[4]);                                        // the treatment coefficient
    }
    results.push({ h, treat, nPairs: dR2.length,
      meanBase: mean(baseR2), meanFull: mean(fullR2), meanD: mean(dR2),
      nImproved: dR2.filter(v => v > 0).length,
      coefMean: mean(coefT), coefT: tstat(coefT),
      coefPos: coefT.filter(v => v > 0).length });
  }
}

const f = (v, d = 4) => (v >= 0 ? '+' : '') + v.toFixed(d);
console.log('|DRIFT| -> FUTURE REALISED VOL, incremental over HAR   (per pair, 60/40 time split)\n');
console.log('  h  treat    pairs   OOS R2 base -> +treat     mean dR2   improved   coef (mean / cross-pair t)');
for (const r of results) {
  console.log(`  ${String(r.h).padStart(2)}  ${r.treat.padEnd(6)}   ${String(r.nPairs).padStart(3)}    `
    + `${r.meanBase.toFixed(4)} -> ${r.meanFull.toFixed(4)}      ${f(r.meanD)}    `
    + `${String(r.nImproved).padStart(2)}/${r.nPairs}     `
    + `${f(r.coefMean,4).padStart(9)} / ${f(r.coefT,2).padStart(6)}  (${r.coefPos}/${r.nPairs} +ve)`);
}

console.log('\nPRE-REGISTERED VERDICT (mean dR2 > 0 AND >= ' + MINPAIR + '/25 improve AND |cross-pair t| > 2):');
let anyPass = false;
for (const r of results) {
  const pass = r.meanD > 0 && r.nImproved >= MINPAIR && Math.abs(r.coefT) > 2;
  if (pass) anyPass = true;
  const miss = [];
  if (!(r.meanD > 0)) miss.push('dR2 <= 0');
  if (!(r.nImproved >= MINPAIR)) miss.push(`only ${r.nImproved} pairs improve`);
  if (!(Math.abs(r.coefT) > 2)) miss.push(`coef t ${r.coefT.toFixed(2)}`);
  console.log(`  h=${String(r.h).padStart(2)} ${r.treat.padEnd(6)}  ${pass ? 'PASS' : 'NULL'}`
    + (miss.length ? `  (${miss.join('; ')})` : ''));
}
console.log(anyPass
  ? '\n>> Something cleared the bar. Read |absD| results against the stated confound before\n'
    + '   believing them: sigma sits in its denominator and in the HAR baseline both.\n'
    + '   |absMu| passing is the cleaner claim -- it has no sigma in it.'
  : '\n>> NULL. |drift| adds nothing to a HAR baseline. The drift readout stays a first-moment\n'
    + '   description with no second-moment content either.');
