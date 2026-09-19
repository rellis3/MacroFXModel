/**
 * drift-residual-reversion-test — does the PAIR-SPECIFIC residual revert?
 *
 * `drift-direction-test.mjs` asked whether the currency LEGS forecast direction and
 * got null at every horizon. This asks a different question of the same fit: not
 * about the legs, but about what is left over once the legs are removed.
 *
 * When EUR/USD drifts more than its EUR and USD legs imply, the excess is the
 * pair-specific residual — the part of the move that is about the cross itself
 * rather than about either currency. The hypothesis is that this component is
 * transient: a pair cannot stay dislocated from its own two legs, because the
 * triangular relationships pull it back. That is a RELATIVE-VALUE claim and it is
 * logically independent of the leg-momentum claim that already failed.
 *
 * PRE-REGISTERED before the first run, so a null cannot be quietly reframed:
 *
 *   Signal    e_P(t) = residZ, the pair-specific residual standardised by the SE of
 *             the drift estimate, from the CAUSAL 14-day cross-section at t.
 *   Return    HEDGED forward return, di -> di+h:
 *                 r_P  -  [ basket_base  -  basket_quote ]
 *             where basket_c is the equal-weighted mean log return of every pair c
 *             appears in, signed + when c is base. This is the residual's own
 *             tradeable analogue: long the pair, short its two-leg replication.
 *             Using the RAW pair return would re-test leg momentum, which is null.
 *   EXCLUSION Pair P is REMOVED from both of its own baskets. Left in, the hedge
 *             contains r_P at roughly +0.28, so any short-horizon negative
 *             autocorrelation in the pair itself (bid/ask bounce) would arrive
 *             disguised as residual reversion. The replication must be built from
 *             OTHER pairs or it is not a replication.
 *   Test A    Cross-sectional rank IC between e_P(t) and the hedged return.
 *             Reversion predicts a NEGATIVE IC.
 *   Test B    Long the bottom quintile by e_P, short the top quintile, equal weight,
 *             both hedged. Reversion predicts a POSITIVE spread.
 *   Horizons  h = 1, 5, 20 trading days.
 *   Sampling  NON-OVERLAPPING: step by h. A 14-day window refit daily overlaps 13/14
 *             with its neighbour and would manufacture a t-stat from one fortnight
 *             counted many times.
 *   Split     60% IS / 40% OOS, time-ordered, no shuffling.
 *   PASS      OOS t > +2 on the spread AND IS t > 0. A significant NEGATIVE spread is
 *             residual MOMENTUM — the opposite of the hypothesis — and is reported as
 *             null for this test rather than rebadged as a finding.
 *
 * ## Three controls, because a pass here is suspicious by default
 *
 * 1. GAP. The signal ends on close(di) and the forward return STARTS at close(di),
 *    so the same tick enters the signal positively and the return negatively. Pure
 *    bid/ask bounce would then show up as "reversion", strongest at h=1 and decaying.
 *    `--gap N` starts the return at di+N instead. A real dislocation-correction
 *    survives a one-day gap; a microstructure artefact does not.
 * 2. NEWEY-WEST. At h=1 the 14-day signal window is refit daily, so consecutive
 *    spreads share 13/14 of their signal and the naive t-stat counts one fortnight
 *    many times. The reported t_NW uses Bartlett weights with L = ceil(WIN/h) — the
 *    exact number of consecutive samples that share a window.
 * 3. SHUFFLE. `--shuffle` permutes the residuals across pairs within each day,
 *    keeping the distribution and the return panel intact. Anything that survives
 *    that is arithmetic, not signal.
 *
 * Costs are NOT modelled. This is a screen for whether an effect exists at all; the
 * hedge is 3+ legs per pair, so a gross effect smaller than a few spreads is dead on
 * arrival and the report says so.
 *
 * ## MEASURED 2026-09-18 -- NULL, and the controls are the whole story
 *
 * 25 pairs, 3,302 sessions (2016-01-04 -> 2026-08-20). OOS Newey-West t on the
 * bottom-minus-top spread:
 *
 *              h=1     h=5    h=20
 *   gap=0     +8.11   +3.70   +1.46      <- would have "passed" at h=1 and h=5
 *   gap=1     +1.44   +0.49   -1.32      <- NULL everywhere
 *   shuffle   -1.12   +0.93   -0.61      <- placebo clean, so the machinery is sound
 *
 * The entire effect lived in the close the signal and the return SHARE at di. One
 * day of separation removes it. That is bid/ask bounce, not a dislocation that
 * corrects: a real correction cannot care whether you start measuring it at today's
 * close or tomorrow's. The gap=0 column is what this test would have reported
 * without the control, at t=+8.11, with a clean placebo and a consistent IS/OOS sign
 * -- every surface marker of a real result.
 *
 * Even taken at face value the gap=0 spread was +0.006%/period OOS at h=1 against a
 * hedge of roughly 30 legs per rebalance. At ~1bp a leg that is ~60bp of cost to
 * collect 0.6bp of gross edge. It was two orders of magnitude from tradeable before
 * the statistics were even settled.
 *
 * GAP DEFAULTS TO 1. Pass --gap=0 only to reproduce the contaminated column above.
 *
 * Run: node scripts/drift-residual-reversion-test.mjs
 */
import fs from 'fs'; import path from 'path';
import { parquetRead, parquetMetadataAsync } from 'hyparquet';
import { yangZhangVolSeries } from '../js/volForecast.js';
import { decomposeCurrencyDrift } from '../js/driftCrossSection.js';

const DIR = new URL('../VolRangeForecaster/data/m1/', import.meta.url).pathname;
const PAIRS = ['eurusd','gbpusd','audusd','nzdusd','usdjpy','usdcad','usdchf',
  'eurgbp','eurjpy','eurchf','eurcad','euraud','eurnzd','gbpjpy','gbpchf','gbpcad',
  'gbpaud','gbpnzd','audjpy','audchf','audcad','audnzd','cadjpy','chfjpy','nzdjpy'];
const WIN = 14, WARMUP = 50, HORIZONS = [1, 5, 20], SPLIT = 0.60, QUINT = 5;
const argv = process.argv.slice(2);
// DEFAULT 1, not 0. gap=0 is contaminated -- see MEASURED at the top of this file.
const GAP = argv.some(a => a.startsWith('--gap='))
  ? Number(argv.find(a => a.startsWith('--gap=')).split('=')[1])
  : 1;
const SHUFFLE = argv.includes('--shuffle');
const SEED = Number((argv.find(a => a.startsWith('--seed=')) ?? '--seed=1').split('=')[1]) || 1;
let _s = SEED >>> 0;
const rnd = () => ((_s = (_s * 1664525 + 1013904223) >>> 0) / 4294967296);

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
/** Newey-West t with Bartlett weights, lag L. L=0 reduces to the plain t. */
function tstatNW(a, L) {
  const n = a.length; if (n < 3) return NaN;
  const m = mean(a), d = a.map(v => v - m);
  let g0 = 0; for (const v of d) g0 += v * v; g0 /= n;
  let s2 = g0;
  for (let l = 1; l <= Math.min(L, n - 1); l++) {
    let g = 0; for (let i = l; i < n; i++) g += d[i] * d[i - l]; g /= n;
    s2 += 2 * (1 - l / (L + 1)) * g;
  }
  return s2 > 0 ? m / Math.sqrt(s2 / n) : NaN;
}
function spearman(x, y) {
  const rank = v => { const s = v.map((q, i) => [q, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(v.length); s.forEach(([, i], k) => r[i] = k); return r; };
  const rx = rank(x), ry = rank(y), n = x.length;
  const mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return (dx && dy) ? num / Math.sqrt(dx * dy) : 0;
}

console.log('loading M1 caches...');
const D = {}, S = {};
for (const p of PAIRS) {
  const file = path.join(DIR, p + '_m1.parquet');
  if (!fs.existsSync(file)) { console.error('missing', p); continue; }
  const d1 = await daily(file); if (d1.length < 200) continue;
  D[p] = d1; S[p] = yangZhangVolSeries(d1);
}
const live = PAIRS.filter(p => D[p]);
const common = live.map(p => new Set(D[p].map(b => b.date)))
  .reduce((a, b) => new Set([...a].filter(x => b.has(x))));
const DATES = [...common].sort();
const IDX = {}; for (const p of live) IDX[p] = new Map(D[p].map((b, i) => [b.date, i]));
const UP = p => p.toUpperCase();
console.log(`${live.length} pairs, ${DATES.length} common sessions ${DATES[0]} -> ${DATES.at(-1)}\n`);

/** Causal cross-section at common-date index di -> residuals array, or null. */
function residualsAt(di) {
  const obs = [];
  for (const p of live) {
    const i = IDX[p].get(DATES[di]); if (i == null || i < WIN + 35) continue;
    const sigma = S[p][i]; const mu = Math.log(D[p][i].close / D[p][i - WIN].close) / WIN;
    if (!(sigma > 0) || !Number.isFinite(mu)) continue;
    obs.push({ pair: UP(p), base: UP(p.slice(0,3)), quote: UP(p.slice(3,6)), mu: mu * 100, sigma: sigma * 100 });
  }
  if (obs.length < 15) return null;
  const f = decomposeCurrencyDrift(obs, { win: WIN });
  return (f && !f.error) ? f.residuals.filter(r => Number.isFinite(r.residZ)) : null;
}

/** Raw forward log return per pair, di -> di+h, in %. */
function fwdPairs(di, h) {
  const out = {};
  for (const p of live) {
    const a = IDX[p].get(DATES[di]), b = IDX[p].get(DATES[di + h]);
    if (a == null || b == null) continue;
    const r = Math.log(D[p][b].close / D[p][a].close) * 100;
    if (Number.isFinite(r)) out[UP(p)] = r;
  }
  return out;
}

/**
 * Hedged forward return for pair P: its own move minus its two-leg replication,
 * where the replication EXCLUDES P itself from both baskets.
 */
function hedged(P, base, quote, fwd) {
  let accB = 0, nB = 0, accQ = 0, nQ = 0;
  for (const p of live) {
    const K = UP(p); if (K === P) continue;            // exclusion, see header
    const r = fwd[K]; if (r == null) continue;
    const B = UP(p.slice(0,3)), Q = UP(p.slice(3,6));
    if (B === base) { accB += r; nB++; } else if (Q === base) { accB -= r; nB++; }
    if (B === quote) { accQ += r; nQ++; } else if (Q === quote) { accQ -= r; nQ++; }
  }
  if (!nB || !nQ || fwd[P] == null) return null;
  return fwd[P] - (accB / nB - accQ / nQ);
}

const report = [];
for (const h of HORIZONS) {
  const ics = [], spreads = [], dates = [];
  const STEP = h + GAP;                       // return windows stay non-overlapping
  for (let di = WARMUP; di + GAP + h < DATES.length; di += STEP) {
    const res = residualsAt(di); if (!res) continue;
    const fwd = fwdPairs(di + GAP, h);        // gap: return starts AFTER the signal's close
    const rows = [];
    for (const r of res) {
      const hr = hedged(r.pair, r.base, r.quote, fwd);
      if (hr != null && Number.isFinite(hr)) rows.push({ e: r.residZ, r: hr });
    }
    if (rows.length < 15) continue;
    if (SHUFFLE) {                            // placebo: permute signal across pairs
      const es = rows.map(o => o.e);
      for (let i = es.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [es[i], es[j]] = [es[j], es[i]]; }
      rows.forEach((o, i) => o.e = es[i]);
    }
    ics.push(spearman(rows.map(o => o.e), rows.map(o => o.r)));
    const ranked = rows.slice().sort((a, b) => b.e - a.e);
    const top = ranked.slice(0, QUINT), bot = ranked.slice(-QUINT);
    spreads.push(mean(bot.map(o => o.r)) - mean(top.map(o => o.r)));   // reversion => +
    dates.push(DATES[di]);
  }
  const cut = Math.floor(spreads.length * SPLIT);
  // Consecutive samples share a 14-day signal window whenever STEP < WIN.
  const LAG = Math.max(0, Math.ceil(WIN / STEP) - 1);
  report.push({ h, n: spreads.length, split: dates[cut], lag: LAG,
    isIC: mean(ics.slice(0, cut)), osIC: mean(ics.slice(cut)),
    isMean: mean(spreads.slice(0, cut)), osMean: mean(spreads.slice(cut)),
    isT: tstat(spreads.slice(0, cut)), osT: tstat(spreads.slice(cut)),
    isTnw: tstatNW(spreads.slice(0, cut), LAG), osTnw: tstatNW(spreads.slice(cut), LAG),
    osHit: spreads.slice(cut).filter(v => v > 0).length / (spreads.length - cut) });
}

const f = (v, d = 3) => (v >= 0 ? '+' : '') + v.toFixed(d);
console.log('PAIR-SPECIFIC RESIDUAL -> HEDGED REVERSION   (non-overlapping, 60/40 time split)');
console.log(`  gap=${GAP}${SHUFFLE ? '  SHUFFLED PLACEBO (seed ' + SEED + ')' : ''}`);
console.log('  reversion predicts negative IC and a positive bottom-minus-top spread\n');
console.log('  h   n     rank IC (IS/OOS)    spread %/period (IS/OOS)      t (IS/OOS)        t_NW (IS/OOS)   OOS win%');
for (const r of report) {
  console.log(`  ${String(r.h).padStart(2)}  ${String(r.n).padStart(4)}   `
    + `${f(r.isIC)} / ${f(r.osIC)}      `
    + `${f(r.isMean)} / ${f(r.osMean)}        `
    + `${f(r.isT,2).padStart(6)} / ${f(r.osT,2).padStart(6)}   `
    + `${f(r.isTnw,2).padStart(6)} / ${f(r.osTnw,2).padStart(6)}    ${(r.osHit*100).toFixed(1)}%`);
}

console.log('\nPRE-REGISTERED VERDICT (OOS t > +2 AND IS t > 0)  -- judged on t_NW:');
let anyPass = false;
for (const r of report) {
  const pass = r.osTnw > 2 && r.isTnw > 0;
  if (pass) anyPass = true;
  const why = pass ? ''
    : r.osTnw < -2 ? '  <- significant but NEGATIVE: residual momentum, not reversion'
    : r.osTnw <= 2 ? '  (OOS under the bar)' : '  (IS sign disagrees)';
  console.log(`  h=${String(r.h).padStart(2)}  ${pass ? 'PASS' : 'NULL'}   OOS t_NW ${f(r.osTnw,2)} (lag ${r.lag})${why}`);
}
console.log(anyPass
  ? '\n>> At least one horizon cleared the bar. Treat as a LEAD, not a result: the hedge\n'
    + '   is 3+ legs, so this needs a costed replication before anything is built on it.'
  : '\n>> NULL at every horizon. The pair-specific residual does not revert on a tradeable\n'
    + '   horizon. It stays what the page already calls it: a description of which part of\n'
    + '   a move was about the cross rather than about either currency.');
