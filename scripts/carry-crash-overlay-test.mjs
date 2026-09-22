/**
 * carry-crash-overlay-test — does "excess over carry" protect a carry book?
 *
 * The one drift on `drift.html` that is a PRICE rather than an estimate is the carry,
 * and the carry premium is a real institutional return: the empirical failure of
 * uncovered interest parity. It is also famously short a crash. Carry grinds up for
 * years and gives it back in weeks, and the weeks it gives it back in are repricing
 * weeks — exactly what the page's "excess over carry" measures.
 *
 * So the question is not whether carry predicts (it does not; it is compensation for
 * bearing crash risk). It is whether the page's SECOND number times the exit. This is
 * a RISK OVERLAY, not a signal: it can only remove exposure, never add it, so the
 * worst case is that it costs return and the test says so.
 *
 * PRE-REGISTERED before the first run:
 *
 *   Carry     mu_RN = r_quote - r_base from IR3TIB01*M156N 3-month interbank rates,
 *             the same series `server.js`'s CARRY_RATE_SPECS already uses -- one
 *             table, not two. Retail never receives the interbank differential, so
 *             this is an UPPER BOUND on tradeable carry and the report says so.
 *   Lag       Rates are MONTHLY and published after the month they describe, so a
 *             month-M rate is applied from month M+1 onward. Using month M inside
 *             month M would be a lookahead of up to 30 days.
 *   Baseline  Classic G10 cross-sectional carry: long the top-2 currencies by rate,
 *             short the bottom-2, equal weight, rebalanced every h days, held via the
 *             equal-weighted basket return of every pair each currency appears in.
 *   Overlay   REPRICING(t) = median_P |excess_P(t)|  /  median_P |carry_P(t)|,
 *             where excess_P = mu_P(14-day, causal) - carryDrift_P, both %/day.
 *             Ratio OF MEDIANS, not median of ratios: per-pair ratios explode when a
 *             pair's carry is near zero, which is most pairs in a ZIRP decade.
 *   Gate      FLAT when REPRICING(t) exceeds its own trailing 80th percentile over an
 *             expanding causal window (min 250 observations). Nothing else changes.
 *   Split     60% IS / 40% OOS, time-ordered, no shuffling.
 *   PASS      OOS Sharpe improves AND OOS max drawdown shrinks AND the gate is active
 *             on < 40% of OOS periods (a filter, not a different strategy).
 *             Improving return alone is NOT a pass: this is sold as crash protection,
 *             so it has to show up in the crash statistics.
 *
 * DATA. Needs 8 FRED CSVs this environment cannot fetch (fred.stlouisfed.org is
 * blocked by the egress policy, and the keyless fredgraph endpoint with it). Drop them
 * in --rates=<dir> named <CCY>.csv, from:
 *
 *   https://fred.stlouisfed.org/graph/fredgraph.csv?id=IR3TIB01USM156N   -> USD.csv
 *   ...EZM156N -> EUR.csv   ...GBM156N -> GBP.csv   ...JPM156N -> JPY.csv
 *   ...CHM156N -> CHF.csv   ...AUM156N -> AUD.csv   ...CAM156N -> CAD.csv
 *   ...NZM156N -> NZD.csv
 *
 * Run: node scripts/carry-crash-overlay-test.mjs --rates=./rates
 */
import fs from 'fs'; import path from 'path';
import { parquetRead, parquetMetadataAsync } from 'hyparquet';

const DIR = new URL('../VolRangeForecaster/data/m1/', import.meta.url).pathname;
const PAIRS = ['eurusd','gbpusd','audusd','nzdusd','usdjpy','usdcad','usdchf',
  'eurgbp','eurjpy','eurchf','eurcad','euraud','eurnzd','gbpjpy','gbpchf','gbpcad',
  'gbpaud','gbpnzd','audjpy','audchf','audcad','audnzd','cadjpy','chfjpy','nzdjpy'];
const CCYS = ['USD','EUR','GBP','JPY','CHF','AUD','CAD','NZD'];
const WIN = 14, WARMUP = 60, SPLIT = 0.60, HOLD = 20, GATE_PCT = 0.80, MIN_HIST = 250;

const argv = process.argv.slice(2);
const RATES_DIR = (argv.find(a => a.startsWith('--rates=')) ?? '').split('=')[1];
if (!RATES_DIR) { console.error('need --rates=<dir> (see header for the 8 FRED CSVs)'); process.exit(2); }

/** FRED CSV -> Map('YYYY-MM' -> percent), tolerant of both the old and new headers. */
function loadRates(dir, ccy) {
  const file = path.join(dir, ccy + '.csv');
  if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
  const out = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n').slice(1)) {
    const [d, v] = line.trim().split(',');
    if (!d || v == null || v === '.' || v === '') continue;
    const x = Number(v); if (!Number.isFinite(x)) continue;
    out.set(d.slice(0, 7), x);
  }
  if (out.size < 60) throw new Error(`${ccy}: only ${out.size} monthly observations`);
  return out;
}
/** Rate in force on `date`, applying the ONE-MONTH publication lag (see header). */
function rateOn(map, date) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - 1);
  for (let back = 0; back < 6; back++) {                // tolerate a late print
    const k = d.toISOString().slice(0, 7);
    if (map.has(k)) return map.get(k);
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return null;
}

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
    if (!d) { d = { close: r.close }; days.set(k, d); } else { d.close = r.close; }
  }
  return [...days.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([date, d]) => ({ date, ...d }));
}

const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1 || 1)); };
const median = a => { const s = [...a].sort((x, y) => x - y); const n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
function maxDD(rets) {                                   // on the cumulative sum, in %
  let cum = 0, peak = 0, dd = 0;
  for (const r of rets) { cum += r; if (cum > peak) peak = cum; if (peak - cum > dd) dd = peak - cum; }
  return dd;
}
const stats = (r, perYear) => ({
  mean: mean(r) * perYear, vol: sd(r) * Math.sqrt(perYear),
  sharpe: sd(r) > 0 ? mean(r) / sd(r) * Math.sqrt(perYear) : NaN,
  maxDD: maxDD(r), skew: (() => { const m = mean(r), s = sd(r);
    return s > 0 ? mean(r.map(v => ((v - m) / s) ** 3)) : NaN; })(),
});

console.log('loading rates...');
const RATES = {}; for (const c of CCYS) RATES[c] = loadRates(RATES_DIR, c);
console.log('loading M1 caches...');
const D = {};
for (const p of PAIRS) {
  const file = path.join(DIR, p + '_m1.parquet');
  if (!fs.existsSync(file)) continue;
  const d1 = await daily(file); if (d1.length >= 400) D[p] = d1;
}
const live = PAIRS.filter(p => D[p]);
const common = live.map(p => new Set(D[p].map(b => b.date)))
  .reduce((a, b) => new Set([...a].filter(x => b.has(x))));
const DATES = [...common].sort();
const IDX = {}; for (const p of live) IDX[p] = new Map(D[p].map((b, i) => [b.date, i]));
const UP = s => s.toUpperCase();
console.log(`${live.length} pairs, ${DATES.length} sessions ${DATES[0]} -> ${DATES.at(-1)}\n`);

/** Basket return per currency, di -> di+h, %. */
function fwdBaskets(di, h) {
  const acc = {}, cnt = {};
  for (const p of live) {
    const a = IDX[p].get(DATES[di]), b = IDX[p].get(DATES[di + h]);
    if (a == null || b == null) continue;
    const r = Math.log(D[p][b].close / D[p][a].close) * 100;
    if (!Number.isFinite(r)) continue;
    const B = UP(p.slice(0,3)), Q = UP(p.slice(3,6));
    acc[B] = (acc[B] ?? 0) + r; cnt[B] = (cnt[B] ?? 0) + 1;
    acc[Q] = (acc[Q] ?? 0) - r; cnt[Q] = (cnt[Q] ?? 0) + 1;
  }
  const out = {}; for (const c of CCYS) if (cnt[c]) out[c] = acc[c] / cnt[c];
  return out;
}

/** REPRICING(t): ratio of medians, see header. */
function repricingAt(di) {
  const date = DATES[di], ex = [], ca = [];
  for (const p of live) {
    const i = IDX[p].get(date); if (i == null || i < WIN) continue;
    const B = UP(p.slice(0,3)), Q = UP(p.slice(3,6));
    const rb = rateOn(RATES[B], date), rq = rateOn(RATES[Q], date);
    if (rb == null || rq == null) continue;
    const carry = (rq - rb) / 252;                       // %/trading day, CIP sign
    const mu = Math.log(D[p][i].close / D[p][i - WIN].close) / WIN * 100;
    if (!Number.isFinite(mu)) continue;
    ex.push(Math.abs(mu - carry)); ca.push(Math.abs(carry));
  }
  if (ex.length < 15) return null;
  const mc = median(ca);
  return mc > 1e-9 ? median(ex) / mc : null;
}

// ── run ──────────────────────────────────────────────────────────────────────
const raw = [], gated = [], regime = [], dates = [];
const hist = [];
for (let di = WARMUP; di + HOLD < DATES.length; di += HOLD) {
  const date = DATES[di];
  const rates = {}; let ok = true;
  for (const c of CCYS) { const v = rateOn(RATES[c], date); if (v == null) { ok = false; break; } rates[c] = v; }
  if (!ok) continue;
  const rep = repricingAt(di); if (rep == null) continue;
  const fwd = fwdBaskets(di, HOLD);
  const cs = CCYS.filter(c => fwd[c] != null);
  if (cs.length < 6) continue;

  const ranked = cs.map(c => ({ c, r: rates[c], f: fwd[c] })).sort((a, b) => b.r - a.r);
  const ret = mean(ranked.slice(0, 2).map(o => o.f)) - mean(ranked.slice(-2).map(o => o.f));

  // Causal gate: threshold from history STRICTLY BEFORE this observation.
  const thr = hist.length >= MIN_HIST ? pct(hist, GATE_PCT) : null;
  const flat = thr != null && rep > thr;
  hist.push(rep);

  raw.push(ret); gated.push(flat ? 0 : ret); regime.push(flat ? 1 : 0); dates.push(date);
}

const perYear = 252 / HOLD;
const cut = Math.floor(raw.length * SPLIT);
const slice = (a, o) => o === 'is' ? a.slice(0, cut) : a.slice(cut);
console.log(`CARRY CRASH OVERLAY   hold=${HOLD}d, n=${raw.length} periods, split at ${dates[cut]}`);
console.log(`gate: flat when REPRICING > trailing ${(GATE_PCT*100).toFixed(0)}th pct (min ${MIN_HIST} obs)\n`);
console.log('  window  book      ann.ret   ann.vol   Sharpe   maxDD    skew    flat%');
const rows = [];
for (const w of ['is', 'os']) {
  for (const [name, series] of [['carry', raw], ['gated', gated]]) {
    const s = stats(slice(series, w), perYear);
    rows.push({ w, name, ...s, flat: mean(slice(regime, w)) });
    console.log(`  ${w.toUpperCase().padEnd(6)}  ${name.padEnd(8)}  `
      + `${s.mean.toFixed(2).padStart(7)}%  ${s.vol.toFixed(2).padStart(7)}%  `
      + `${s.sharpe.toFixed(2).padStart(6)}   ${s.maxDD.toFixed(2).padStart(6)}%  `
      + `${s.skew.toFixed(2).padStart(6)}  ${name === 'gated' ? (mean(slice(regime, w))*100).toFixed(1)+'%' : '-'}`);
  }
}

const g = (w, n) => rows.find(r => r.w === w && r.name === n);
const osFlat = mean(slice(regime, 'os'));
const pass = g('os','gated').sharpe > g('os','carry').sharpe
          && g('os','gated').maxDD < g('os','carry').maxDD
          && osFlat < 0.40;
console.log('\nPRE-REGISTERED VERDICT (OOS Sharpe up AND OOS maxDD down AND flat < 40%):');
console.log(`  Sharpe ${g('os','carry').sharpe.toFixed(2)} -> ${g('os','gated').sharpe.toFixed(2)}`
  + `   maxDD ${g('os','carry').maxDD.toFixed(2)}% -> ${g('os','gated').maxDD.toFixed(2)}%`
  + `   flat ${(osFlat*100).toFixed(1)}%`);
console.log(`  ${pass ? 'PASS' : 'NULL'}`);
console.log(pass
  ? '\n>> The overlay earns its place on the CRASH statistics, which is what it was sold on.\n'
    + '   Still an upper bound: interbank rates, no financing spread, no costs.'
  : '\n>> NULL. "Excess over carry" does not time the carry book. Carry stays a premium you\n'
    + '   hold through the drawdown or not at all -- which is the honest institutional answer.');
