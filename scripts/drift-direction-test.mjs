/**
 * drift-direction-test — does the currency drift predict DIRECTION?
 *
 * The one question `driftCrossSection` deliberately does not answer. That module
 * decomposes a move that already happened; this asks whether the decomposition
 * carries forward information, which is a different claim needing its own evidence.
 *
 * PRE-REGISTERED before the first run, so a null cannot be quietly reframed:
 *
 *   Signal    s_c(t), the currency drift from the causal 14-day window.
 *   Return    r_c(t -> t+h), currency c's own tradeable basket: the equal-weighted
 *             mean log return of every pair it appears in, signed + when c is base.
 *             NOT the refitted drift, which would be circular.
 *   Test A    Cross-sectional rank IC between s_c(t) and r_c(t -> t+h), per day.
 *   Test B    Long the top 2 currencies by drift, short the bottom 2, equal weight.
 *   Horizons  h = 1, 5, 20 trading days.
 *   Sampling  NON-OVERLAPPING: sample every h days. A 14-day signal refit daily
 *             overlaps 13/14 with its neighbour, so overlapping windows would
 *             manufacture a t-stat out of the same fortnight counted many times.
 *   Split     60% IS / 40% OOS, time-ordered, no shuffling.
 *   PASS      OOS |t| > 2 on the long-short spread AND the same sign as IS.
 *             Anything else is NULL and is reported as NULL.
 *
 * Run: node scripts/drift-direction-test.mjs
 */
import fs from 'fs'; import path from 'path';
import { parquetRead, parquetMetadataAsync } from 'hyparquet';
import { yangZhangVolSeries } from '../js/volForecast.js';
import { decomposeCurrencyDrift } from '../js/driftCrossSection.js';

const DIR = new URL('../VolRangeForecaster/data/m1/', import.meta.url).pathname;
const PAIRS = ['eurusd','gbpusd','audusd','nzdusd','usdjpy','usdcad','usdchf',
  'eurgbp','eurjpy','eurchf','eurcad','euraud','eurnzd','gbpjpy','gbpchf','gbpcad',
  'gbpaud','gbpnzd','audjpy','audchf','audcad','audnzd','cadjpy','chfjpy','nzdjpy'];
const WIN = 14, WARMUP = 50, HORIZONS = [1, 5, 20], SPLIT = 0.60;

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
function spearman(x, y) {
  const rank = v => { const s = v.map((q, i) => [q, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(v.length); s.forEach(([, i], k) => r[i] = k); return r; };
  const rx = rank(x), ry = rank(y), n = x.length;
  const mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return (dx && dy) ? num / Math.sqrt(dx * dy) : 0;
}

// ── load ─────────────────────────────────────────────────────────────────────
console.log('loading M1 caches...');
const D = {}, S = {};
for (const p of PAIRS) {
  const file = path.join(DIR, p + '_m1.parquet');
  if (!fs.existsSync(file)) { console.error('missing', p); continue; }
  const d1 = await daily(file); if (d1.length < 200) continue;
  D[p] = d1; S[p] = yangZhangVolSeries(d1);
}
const live = PAIRS.filter(p => D[p]);
// Align every pair on a common date index so a currency basket return never mixes
// one pair's Tuesday with another's Wednesday.
const common = live.map(p => new Set(D[p].map(b => b.date)))
  .reduce((a, b) => new Set([...a].filter(x => b.has(x))));
const DATES = [...common].sort();
const IDX = {}; for (const p of live) IDX[p] = new Map(D[p].map((b, i) => [b.date, i]));
console.log(`${live.length} pairs, ${DATES.length} common sessions ${DATES[0]} -> ${DATES.at(-1)}\n`);

const CCYS = [...new Set(live.flatMap(p => [p.slice(0,3).toUpperCase(), p.slice(3,6).toUpperCase()]))].sort();

/** Causal signal as of common-date index di. */
function signalAt(di) {
  const obs = [];
  for (const p of live) {
    const i = IDX[p].get(DATES[di]); if (i == null || i < WIN + 35) continue;
    const sigma = S[p][i]; const mu = Math.log(D[p][i].close / D[p][i - WIN].close) / WIN;
    if (!(sigma > 0) || !Number.isFinite(mu)) continue;
    obs.push({ pair: p.toUpperCase(), base: p.slice(0,3).toUpperCase(),
               quote: p.slice(3,6).toUpperCase(), mu: mu * 100, sigma: sigma * 100 });
  }
  if (obs.length < 15) return null;
  const f = decomposeCurrencyDrift(obs, { win: WIN });
  return (f && !f.error) ? f.currencies : null;
}

/** Forward basket return per currency, di -> di+h, in %. */
function fwdAt(di, h) {
  const acc = {}, cnt = {};
  for (const p of live) {
    const a = IDX[p].get(DATES[di]), b = IDX[p].get(DATES[di + h]);
    if (a == null || b == null) continue;
    const r = Math.log(D[p][b].close / D[p][a].close) * 100;
    if (!Number.isFinite(r)) continue;
    const B = p.slice(0,3).toUpperCase(), Q = p.slice(3,6).toUpperCase();
    acc[B] = (acc[B] ?? 0) + r; cnt[B] = (cnt[B] ?? 0) + 1;
    acc[Q] = (acc[Q] ?? 0) - r; cnt[Q] = (cnt[Q] ?? 0) + 1;
  }
  const out = {};
  for (const c of CCYS) if (cnt[c]) out[c] = acc[c] / cnt[c];
  return out;
}

// ── run ──────────────────────────────────────────────────────────────────────
const report = [];
for (const h of HORIZONS) {
  const ics = [], ls = [], dates = [];
  // NON-OVERLAPPING: step by h.
  for (let di = WARMUP; di + h < DATES.length; di += h) {
    const sig = signalAt(di); if (!sig) continue;
    const fwd = fwdAt(di, h);
    const cs = CCYS.filter(c => sig[c] && fwd[c] != null);
    if (cs.length < 6) continue;
    const x = cs.map(c => sig[c].drift), y = cs.map(c => fwd[c]);
    ics.push(spearman(x, y));
    const ranked = cs.map((c, i) => ({ c, s: x[i], r: y[i] })).sort((a, b) => b.s - a.s);
    const top = ranked.slice(0, 2), bot = ranked.slice(-2);
    ls.push(mean(top.map(o => o.r)) - mean(bot.map(o => o.r)));
    dates.push(DATES[di]);
  }
  const cut = Math.floor(ls.length * SPLIT);
  const isL = ls.slice(0, cut), osL = ls.slice(cut);
  const isI = ics.slice(0, cut), osI = ics.slice(cut);
  report.push({ h, n: ls.length, split: dates[cut],
    isIC: mean(isI), osIC: mean(osI),
    isMean: mean(isL), osMean: mean(osL),
    isT: tstat(isL), osT: tstat(osL),
    osHit: osL.filter(v => v > 0).length / osL.length });
}

console.log('CROSS-SECTIONAL DRIFT -> DIRECTION   (non-overlapping, 60/40 time split)');
console.log('  h   n     rank IC (IS/OOS)    long-short %/period (IS/OOS)      t (IS/OOS)    OOS win%');
for (const r of report) {
  const f = (v, d = 3) => (v >= 0 ? '+' : '') + v.toFixed(d);
  console.log(`  ${String(r.h).padStart(2)}  ${String(r.n).padStart(4)}   `
    + `${f(r.isIC)} / ${f(r.osIC)}      `
    + `${f(r.isMean)} / ${f(r.osMean)}          `
    + `${f(r.isT,2).padStart(6)} / ${f(r.osT,2).padStart(6)}    ${(r.osHit*100).toFixed(1)}%`);
}

console.log('\nPRE-REGISTERED VERDICT (OOS |t| > 2 AND same sign as IS):');
let anyPass = false;
for (const r of report) {
  const pass = Math.abs(r.osT) > 2 && Math.sign(r.osT) === Math.sign(r.isT);
  if (pass) anyPass = true;
  console.log(`  h=${String(r.h).padStart(2)}  ${pass ? 'PASS' : 'NULL'}`
    + `  (OOS t ${r.osT.toFixed(2)}${Math.abs(r.osT) > 2 ? '' : ', under the bar'}`
    + `${Math.sign(r.osT) === Math.sign(r.isT) ? '' : '; sign flips vs IS'})`);
}
console.log(anyPass
  ? '\n>> At least one horizon cleared the bar. Treat as a LEAD, not a result: it needs\n'
    + '   its own costed, per-pair replication before anything is built on it.'
  : '\n>> NULL at every horizon. The currency drift decomposes direction that already\n'
    + '   happened; it does not forecast the next move. Keep it descriptive.');
