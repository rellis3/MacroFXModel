// range-edge-limit-fade — forge/RANGE_EDGE_LIMIT_FADE_PREREG.md
//
// Resting limit orders at the Asia range edges (sell A_1, buy A_0), filled only when
// the far side of the quote trades THROUGH the level, exited on real bid/ask M1:
// stop at the next line out (A_1.5 / A_-0.5), target T1 = range mid, T2 = opposite
// edge, flat at 21:55 UTC. Same rules on K = 4 shifted placebo ladders (control C1).
// Ladder from mid OHLC with bodyRange + buildRangeLadder, unedited.
//
//   python scripts/range-edge-limit-fade/extract.py      (once: data/m1_bidask_bin)
//   node scripts/range-edge-limit-fade/run.mjs [--only eurusd,gold] [--boot 2000]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { buildRangeLadder } = await import('../../js/rangeLineAnalyser.js');
const { bodyRange } = await import('../../js/barUtils.js');
const { mulberry32 } = await import('../../js/rangeLevelCore.js');
const { holm, benjaminiHochberg } = await import('../../js/preregStats.js');

// ── Fixed by the prereg ──────────────────────────────────────────────────────
const SEED = 20261020, K = 4, U_MIN = 0.10, U_MAX = 0.40;
const END = '2026-08-20', HALF = '2021-01-01';
const BLOCK = 21, NULL_BAR = 0.05, SPREAD_MAX = 0.10;
const MIN_BARS = 30, MIN_LOOKBACK = 20, ASIA_HRS = 6;
const ORDER_END_H = 20, FLAT_SEC = 21 * 3600 + 55 * 60;
const S_SET = ['gold', 'audjpy', 'audusd', 'nzdjpy', 'nzdusd', 'usdjpy', 'cadjpy', 'eurjpy', 'gbpjpy', 'euraud',
  'eurusd', 'gbpusd', 'usdchf', 'usdcad', 'nq', 'spx', 'dax', 'dow', 'us2000'];
const U_SET = ['audcad', 'audchf', 'audnzd', 'cadchf', 'chfjpy', 'eurcad', 'eurchf', 'eurgbp', 'eurnzd', 'gbpaud',
  'gbpcad', 'gbpchf', 'gbpnzd', 'nzdcad', 'uk100'];
const CLS = k => (k === 'gold' ? 'gold' : ['nq', 'spx', 'dax', 'dow', 'us2000', 'uk100'].includes(k) ? 'index' : 'fx');
const COLS = ['open', 'high', 'low', 'close', 'bid_o', 'bid_h', 'bid_l', 'bid_c', 'ask_o', 'ask_h', 'ask_l', 'ask_c'];

const args = process.argv.slice(2);
const argVal = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const ONLY = argVal('--only') ? new Set(argVal('--only').split(',')) : null;
const NBOOT = +(argVal('--boot') ?? 2000);

function load(key) {
  const buf = fs.readFileSync(path.join(ROOT, 'data', 'm1_bidask_bin', `${key}.bin`));
  const n = buf.readInt32LE(0);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const time = new Int32Array(ab, 4, n);
  const base = 4 + 4 * n;              // float64 columns: base is a multiple of 4; copy to align to 8
  const c = {};
  COLS.forEach((name, j) => { c[name] = new Float64Array(ab.slice(base + 8 * n * j, base + 8 * n * (j + 1))); });
  return { n, time, ...c };
}

const ymd = sec => new Date(sec * 1000).toISOString().slice(0, 10);
const dowOf = date => new Date(date + 'T00:00:00Z').getUTCDay();

// One side of one ladder in one session. Returns null (no fill) or the trade.
// side 'S' = sell limit at A_1, 'B' = buy limit at A_0. `stress` = fill needs a
// trade-through of one spread. Indices are bar positions in the instrument arrays.
function simSide(d, i0, i1, validFrom, dayStart, lad, side, stress) {
  const R = 0.5 * lad.range;
  const L = side === 'S' ? lad.high : lad.low;
  const stop = side === 'S' ? lad.high + R : lad.low - R;
  const tgt1 = lad.low + R;                                   // range mid
  const tgt2 = side === 'S' ? lad.low : lad.high;             // opposite edge
  const orderEnd = dayStart + ORDER_END_H * 3600, flat = dayStart + FLAT_SEC;
  let fill = -1, touched = -1;
  for (let k = i0; k < i1; k++) {
    const t = d.time[k];
    if (t < validFrom) continue;
    if (t >= orderEnd) break;
    if (touched < 0 && (side === 'S' ? d.high[k] >= L : d.low[k] <= L)) touched = k;
    const spr = stress ? d.ask_c[k] - d.bid_c[k] : 0;
    if (side === 'S' ? d.bid_h[k] > L + spr : d.ask_l[k] < L - spr) { fill = k; break; }
  }
  if (fill < 0) return { filled: false, touched: touched >= 0, touchIdx: touched };
  const res = [null, null];                                   // [T1, T2] exit price
  const why = [null, null];
  let lastK = fill;
  for (let k = fill; k < i1 && d.time[k] <= flat; k++) {
    lastK = k;
    const stopHit = side === 'S' ? d.ask_h[k] >= stop : d.bid_l[k] <= stop;
    const stopPx = side === 'S' ? Math.max(stop, d.ask_o[k]) : Math.min(stop, d.bid_o[k]);
    for (let j = 0; j < 2; j++) {
      if (res[j] != null) continue;
      if (stopHit) { res[j] = stopPx; why[j] = 'stop'; continue; }
      if (k === fill) continue;                               // fill bar: stop only
      const tg = j === 0 ? tgt1 : tgt2;
      if (side === 'S' ? d.ask_l[k] < tg : d.bid_h[k] > tg) { res[j] = tg; why[j] = 'target'; }
    }
    if (res[0] != null && res[1] != null) break;
  }
  const flatPx = side === 'S' ? d.ask_c[lastK] : d.bid_c[lastK];
  const r = [0, 1].map(j => { const x = res[j] ?? flatPx; return (side === 'S' ? L - x : x - L) / R; });
  return { filled: true, touched: true, r, why: why.map(w => w ?? 'time'), spreadR: (d.ask_c[fill] - d.bid_c[fill]) / R, fillIdx: fill };
}

// Mid-price race from a touch that never filled: did price reach the mid before the
// stop line (on mid), by the flat time? (adverse-selection diagnostic only)
function midRace(d, k0, i1, dayStart, lad, side) {
  const R = 0.5 * lad.range, stop = side === 'S' ? lad.high + R : lad.low - R, mid = lad.low + R;
  for (let k = k0 + 1; k < i1 && d.time[k] <= dayStart + FLAT_SEC; k++) {
    if (side === 'S' ? d.high[k] >= stop : d.low[k] <= stop) return 0;
    if (side === 'S' ? d.low[k] <= mid : d.high[k] >= mid) return 1;
  }
  return null;
}

// ── Walk ─────────────────────────────────────────────────────────────────────
// per (date) accumulators: real by set, placebo, stress; T1/T2 sums and counts
const acc = new Map();     // date → Float64Array
// layout: [S n, S sum1, S sum2, U n, U sum1, U sum2, P n, P sum1, P sum2, Sst n, Sst sum1, Sst sum2, Ust n, Ust sum1, Ust sum2]
const A = date => { let a = acc.get(date); if (!a) acc.set(date, a = new Float64Array(15)); return a; };
const perInst = {}, excl = { noAsia: 0, noAfter: 0, outside: 0, spread: 0, placed: 0 };
const diag = { touches: 0, fills: 0, touchNoFill: 0, tnfWin: 0, tnfN: 0, fillMidWin: 0, fillMidN: 0, why: { T1: {}, T2: {} } };
const trades = [];
const rng = mulberry32(SEED);

const keys = [...S_SET, ...U_SET].filter(k => !ONLY || ONLY.has(k));
for (const key of keys) {
  const t0 = Date.now();
  const d = load(key), set = S_SET.includes(key) ? 'S' : 'U';
  // UTC-day sessions
  const sess = [];
  for (let k = 0; k < d.n;) {
    const day = Math.floor(d.time[k] / 86400); let j = k;
    while (j < d.n && Math.floor(d.time[j] / 86400) === day) j++;
    const date = ymd(day * 86400);
    if (j - k >= MIN_BARS && dowOf(date) !== 0 && dowOf(date) !== 6 && date <= END) sess.push({ date, i0: k, i1: j, dayStart: day * 86400 });
    k = j;
  }
  const inst = { set, cls: CLS(key), sessions: 0, n: 0, sum1: 0, sum2: 0, nst: 0, sum1st: 0, spreadR: 0 };
  for (let s = MIN_LOOKBACK; s < sess.length; s++) {
    const { date, i0, i1, dayStart } = sess[s];
    const tA = d.time[i0], validFrom = tA + ASIA_HRS * 3600;
    const asiaBars = [];
    let kv = i0;
    for (; kv < i1 && d.time[kv] < validFrom; kv++) asiaBars.push({ time: d.time[kv], open: d.open[kv], high: d.high[kv], low: d.low[kv], close: d.close[kv] });
    // placebo shifts drawn for every session that reaches here, so the stream is fixed
    const ar = bodyRange(asiaBars, 5);
    const shiftsU = Array.from({ length: K }, () => [U_MIN + rng() * (U_MAX - U_MIN), rng() < 0.5 ? -1 : 1]);
    if (!ar) { excl.noAsia++; continue; }
    if (kv >= i1 || kv === i0) { excl.noAfter++; continue; }
    inst.sessions++;
    const lastPre = kv - 1;
    const lads = [{ copy: -1, low: ar.low, high: ar.high, range: ar.range },
      ...shiftsU.map(([u, sg], c) => ({ copy: c, low: ar.low + sg * u * ar.range, high: ar.high + sg * u * ar.range, range: ar.range }))];
    buildRangeLadder(ar.low, ar.range, 'A');                  // ladder definition (A_0 = low, A_1 = high, A_0.5 = mid, ±0.5 rungs)
    for (const lad of lads) {
      const real = lad.copy < 0;
      const px = d.close[lastPre];
      if (!(px > lad.low && px < lad.high)) { if (real) excl.outside++; continue; }
      if (d.ask_c[lastPre] - d.bid_c[lastPre] > SPREAD_MAX * 0.5 * lad.range) { if (real) excl.spread++; continue; }
      if (real) excl.placed++;
      for (const side of ['S', 'B']) {
        const tr = simSide(d, i0, i1, validFrom, dayStart, lad, side, false);
        const a = A(date);
        if (real) {
          if (tr.touched) diag.touches++;
          if (tr.filled) {
            diag.fills++;
            a[set === 'S' ? 0 : 3]++; a[set === 'S' ? 1 : 4] += tr.r[0]; a[set === 'S' ? 2 : 5] += tr.r[1];
            inst.n++; inst.sum1 += tr.r[0]; inst.sum2 += tr.r[1]; inst.spreadR += tr.spreadR;
            diag.why.T1[tr.why[0]] = (diag.why.T1[tr.why[0]] ?? 0) + 1; diag.why.T2[tr.why[1]] = (diag.why.T2[tr.why[1]] ?? 0) + 1;
            const mr = midRace(d, tr.fillIdx, i1, dayStart, lad, side); if (mr != null) { diag.fillMidN++; diag.fillMidWin += mr; }
            trades.push([key, date, side, +tr.r[0].toFixed(4), +tr.r[1].toFixed(4), +tr.spreadR.toFixed(4)]);
          } else if (tr.touched) {
            diag.touchNoFill++;
            const mr = midRace(d, tr.touchIdx, i1, dayStart, lad, side); if (mr != null) { diag.tnfN++; diag.tnfWin += mr; }
          }
          const st = simSide(d, i0, i1, validFrom, dayStart, lad, side, true);
          if (st.filled) { a[set === 'S' ? 9 : 12]++; a[set === 'S' ? 10 : 13] += st.r[0]; a[set === 'S' ? 11 : 14] += st.r[1]; inst.nst++; inst.sum1st += st.r[0]; }
        } else if (tr.filled) { a[6]++; a[7] += tr.r[0]; a[8] += tr.r[1]; }
      }
    }
  }
  perInst[key] = { ...inst, meanT1: inst.n ? +(inst.sum1 / inst.n).toFixed(4) : null, meanT2: inst.n ? +(inst.sum2 / inst.n).toFixed(4) : null,
    meanT1stress: inst.nst ? +(inst.sum1st / inst.nst).toFixed(4) : null, spreadR: inst.n ? +(inst.spreadR / inst.n).toFixed(4) : null };
  console.log(`${key.padEnd(7)} ${set} sessions ${inst.sessions} trades ${inst.n}  T1 ${perInst[key].meanT1}  T2 ${perInst[key].meanT2}  spreadR ${perInst[key].spreadR}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// ── Aggregate + bootstrap over dates ─────────────────────────────────────────
const DATES = [...acc.keys()].sort(), T = DATES.length;
const F = Array.from({ length: 15 }, (_, f) => Float64Array.from(DATES, dt => acc.get(dt)[f]));
const ones = new Float64Array(T).fill(1);
const mask = p => Float64Array.from(DATES, dt => (p(dt) ? 1 : 0));
const H1M = mask(dt => dt < HALF), H2M = mask(dt => dt >= HALF);
const ws = (x, w) => { let s = 0; for (let t = 0; t < T; t++) s += x[t] * w[t]; return s; };
// mean R for a combination of (count, sum) field pairs
const mean = (pairs, w) => { let n = 0, s = 0; for (const [fn, fs] of pairs) { n += ws(F[fn], w); s += ws(F[fs], w); } return n > 0 ? s / n : NaN; };
const PAIRS = {
  T1: [[0, 1], [3, 4]], T2: [[0, 2], [3, 5]],
  T1_S: [[0, 1]], T1_U: [[3, 4]], T2_S: [[0, 2]], T2_U: [[3, 5]],
  T1_stress: [[9, 10], [12, 13]], T2_stress: [[9, 11], [12, 14]],
  T1_plac: [[6, 7]], T2_plac: [[6, 8]],
};
const brng = mulberry32(SEED + 1);
const boot = Object.fromEntries(Object.keys(PAIRS).map(k => [k, []])); boot.T1_diff = []; boot.T2_diff = [];
for (let b = 0; b < NBOOT; b++) {
  const w = new Float64Array(T); let filled = 0;
  while (filled < T) { const s = Math.floor(brng() * Math.max(1, T - BLOCK + 1)); for (let j = 0; j < BLOCK && filled < T; j++, filled++) w[s + j]++; }
  for (const [k, p] of Object.entries(PAIRS)) boot[k].push(mean(p, w));
  boot.T1_diff.push(mean(PAIRS.T1, w) - mean(PAIRS.T1_plac, w)); boot.T2_diff.push(mean(PAIRS.T2, w) - mean(PAIRS.T2_plac, w));
}
const summ = (point, xs) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b), n = v.length;
  if (n < 2 || !Number.isFinite(point)) return { mean: point, se: NaN, ci: [NaN, NaN], p: NaN, mde: NaN, t: NaN };
  const m =v.reduce((s, x) => s + x, 0) / n, se = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1));
  const q = f => v[Math.min(n - 1, Math.max(0, Math.floor(f * n)))];
  const p = Math.min(1, 2 * Math.min(v.filter(x => x <= 0).length / n, v.filter(x => x >= 0).length / n));
  return { mean: +point.toFixed(4), se: +se.toFixed(4), ci: [+q(0.025).toFixed(4), +q(0.975).toFixed(4)], p: +p.toFixed(4), mde: +(2.8 * se).toFixed(4), t: +(point / se).toFixed(2) };
};
const R = {};
for (const k of Object.keys(PAIRS)) R[k] = { n: PAIRS[k].reduce((s, [fn]) => s + ws(F[fn], ones), 0), ...summ(mean(PAIRS[k], ones), boot[k]) };
R.T1_diff = summ(mean(PAIRS.T1, ones) - mean(PAIRS.T1_plac, ones), boot.T1_diff);
R.T2_diff = summ(mean(PAIRS.T2, ones) - mean(PAIRS.T2_plac, ones), boot.T2_diff);
for (const c of ['T1', 'T2']) { R[c].h1 = +mean(PAIRS[c], H1M).toFixed(4); R[c].h2 = +mean(PAIRS[c], H2M).toFixed(4); }

// Holm across T1/T2 on one-sided-positive evidence: adjust the two-sided p, require mean > 0.
const hm = holm([R.T1.p, R.T2.p], 0.05);
const gate = (c, j) => ({
  holmP: +hm.adjusted[j].toFixed(4), holmReject: hm.rejected[j],
  ciLowerPos: R[c].ci[0] > 0, halves: R[c].h1 > 0 && R[c].h2 > 0,
  sets: R[`${c}_S`].mean > 0 && R[`${c}_U`].mean > 0, stress: R[`${c}_stress`].mean > 0,
});
const G = { T1: gate('T1', 0), T2: gate('T2', 1) };
for (const c of ['T1', 'T2']) G[c].pass = R[c].mean > 0 && G[c].holmReject && G[c].ciLowerPos && G[c].halves && G[c].sets && G[c].stress;
let verdict;
if (G.T1.pass || G.T2.pass) verdict = 'VALIDATED';
else if (R.T1.ci[1] < NULL_BAR && R.T2.ci[1] < NULL_BAR) verdict = 'NULL';
else verdict = 'UNDERPOWERED';

const years = [...new Set(DATES.map(dt => dt.slice(0, 4)))];
const byYear = Object.fromEntries(years.map(y => { const w = mask(dt => dt.startsWith(y)); return [y, { n: ws(F[0], w) + ws(F[3], w), T1: +mean(PAIRS.T1, w).toFixed(4), T2: +mean(PAIRS.T2, w).toFixed(4) }]; }));
const instPos1 = Object.values(perInst).filter(v => v.meanT1 > 0).length, instPos2 = Object.values(perInst).filter(v => v.meanT2 > 0).length;
// without the top 1% of days (by real T1 day sum)
const daySum = DATES.map((dt, t) => [t, F[1][t] + F[4][t]]).sort((a, b) => b[1] - a[1]);
const top = new Set(daySum.slice(0, Math.ceil(T * 0.01)).map(([t]) => t));
const noTop = Float64Array.from(DATES, (_, t) => (top.has(t) ? 0 : 1));
const diagOut = {
  excluded: excl, touches: diag.touches, fills: diag.fills, fillPerTouch: +(diag.fills / diag.touches).toFixed(4),
  touchedNotFilled: diag.touchNoFill, tnfMidWinRate: diag.tnfN ? +(diag.tnfWin / diag.tnfN).toFixed(4) : null,
  filledMidWinRate: diag.fillMidN ? +(diag.fillMidWin / diag.fillMidN).toFixed(4) : null, exitMix: diag.why,
  T1_noTop1pct: +mean(PAIRS.T1, noTop).toFixed(4), T2_noTop1pct: +mean(PAIRS.T2, noTop).toFixed(4),
};
const out = { id: 'range-edge-limit-fade', prereg: 'forge/RANGE_EDGE_LIMIT_FADE_PREREG.md', seed: SEED, nBoot: NBOOT, block: BLOCK,
  window: [DATES[0], DATES[T - 1]], sessions: T, verdict, gates: G, cells: R, byYear, perInst,
  instrumentsPositive: { T1: `${instPos1}/${Object.keys(perInst).length}`, T2: `${instPos2}/${Object.keys(perInst).length}` },
  diagnostics: diagOut, ranAt: new Date().toISOString() };
const OUT = path.join(ROOT, 'analysis', 'output', 'range-edge-limit-fade');
fs.mkdirSync(OUT, { recursive: true });
const tag = ONLY ? `_${[...ONLY].join('-')}` : '';
fs.writeFileSync(path.join(OUT, `results${tag}.json`), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(OUT, `trades${tag}.csv`), 'inst,date,side,rT1,rT2,spreadR\n' + trades.map(r => r.join(',')).join('\n') + '\n');

const f = x => (x == null || !Number.isFinite(x) ? '—' : (x > 0 ? '+' : '') + x.toFixed(3));
const line = (name, c) => `| ${name} | ${c.n ?? '—'} | ${f(c.mean)} | ${f(c.ci[0])} … ${f(c.ci[1])} | ${c.p} | ${c.t} | ${c.mde} |`;
const md = [
  `# range-edge-limit-fade — tables (generated ${new Date().toISOString().slice(0, 10)}${ONLY ? ', subset ' + [...ONLY] : ''})`, '',
  `Window ${DATES[0]} → ${DATES[T - 1]}, ${T} session dates, ${Object.keys(perInst).length} instruments, B=${NBOOT}, ${BLOCK}-session blocks, seed ${SEED}. Net R per trade, all fills on bid/ask.`, '',
  `**Verdict by the registered rule: ${verdict}**`, '',
  '| cell | trades | mean net R | 95% CI | p | t | MDE |', '|---|---|---|---|---|---|---|',
  ...Object.keys(PAIRS).map(k => line(k, R[k])), line('T1 real − placebo', R.T1_diff), line('T2 real − placebo', R.T2_diff), '',
  '| gate | T1 | T2 |', '|---|---|---|',
  ...['holmP', 'holmReject', 'ciLowerPos', 'halves', 'sets', 'stress', 'pass'].map(g => `| ${g} | ${G.T1[g]} | ${G.T2[g]} |`), '',
  `Halves T1 ${f(R.T1.h1)} / ${f(R.T1.h2)}; T2 ${f(R.T2.h1)} / ${f(R.T2.h2)}. Without the top 1% of days: T1 ${f(diagOut.T1_noTop1pct)}, T2 ${f(diagOut.T2_noTop1pct)}.`, '',
  `Fills ${diag.fills} of ${diag.touches} mid touches (${(100 * diagOut.fillPerTouch).toFixed(1)}%). Mid race to the range mid: filled ${diagOut.filledMidWinRate}, touched-not-filled ${diagOut.tnfMidWinRate}.`,
  `Excluded sessions (real ladder): ${JSON.stringify(excl)}. Exit mix T1 ${JSON.stringify(diag.why.T1)}, T2 ${JSON.stringify(diag.why.T2)}.`, '',
  '| year | trades | T1 | T2 |', '|---|---|---|---|', ...years.map(y => `| ${y} | ${byYear[y].n} | ${f(byYear[y].T1)} | ${f(byYear[y].T2)} |`), '',
  `Instruments positive: T1 ${out.instrumentsPositive.T1}, T2 ${out.instrumentsPositive.T2}.`, '',
  '| instrument | set | class | trades | T1 | T2 | T1 stress | spread (R) |', '|---|---|---|---|---|---|---|---|',
  ...Object.entries(perInst).map(([k, v]) => `| ${k} | ${v.set} | ${v.cls} | ${v.n} | ${f(v.meanT1)} | ${f(v.meanT2)} | ${f(v.meanT1stress)} | ${v.spreadR} |`),
].join('\n');
fs.writeFileSync(path.join(OUT, `RESULTS_TABLES${tag}.md`), md + '\n');
console.log(`\nverdict: ${verdict}\nT1 ${f(R.T1.mean)} [${f(R.T1.ci[0])}, ${f(R.T1.ci[1])}]  T2 ${f(R.T2.mean)} [${f(R.T2.ci[0])}, ${f(R.T2.ci[1])}]\nplacebo T1 ${f(R.T1_plac.mean)} T2 ${f(R.T2_plac.mean)}  stress T1 ${f(R.T1_stress.mean)}`);
