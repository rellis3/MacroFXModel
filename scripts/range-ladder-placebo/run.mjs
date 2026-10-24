// range-ladder-placebo — forge/RANGE_LADDER_PLACEBO_PREREG.md (with amendment A1).
//
// Do the Asia/Monday range-ladder lines (the range-line book's levels) revert or
// continue differently from the same ladder shifted to the wrong price? Reuses the
// book's own functions unedited (buildRangeLadder, analyseRangeWindow, bodyRange,
// bucketM1IntoSessions); only the session dating follows A1.
//
//   node scripts/range-ladder-placebo/run.mjs [--only eurusd,gold] [--boot 2000]
//
// Reads the local M1 cache only (R2 env vars are ignored by unsetting them below).
// Writes analysis/output/range-ladder-placebo/{results.json,RESULTS_TABLES.md}.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

delete process.env.R2_ACCESS_KEY; delete process.env.R2_SECRET_KEY;   // local cache only

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { loadM1ForPair, BT_M1_DIR } = await import('../../js/volBacktestM1Engine.js');
const { bucketM1IntoSessions } = await import('../../js/forecastAnalyser.js');
const { buildRangeLadder, analyseRangeWindow } = await import('../../js/rangeLineAnalyser.js');
const { bodyRange } = await import('../../js/barUtils.js');
const { mulberry32 } = await import('../../js/rangeLevelCore.js');
const { benjaminiHochberg } = await import('../../js/preregStats.js');

// ── Fixed by the prereg ──────────────────────────────────────────────────────
const SEED = 20261019, K = 4, U_MIN = 0.10, U_MAX = 0.40;
const END = '2026-08-20', HALF = '2021-01-01';
const BLOCK = 21, MIN_CELL = 100, P1_BAR = 2.0, P2_BAR = 3.0;
const MIN_BARS = 30, MIN_LOOKBACK = 20, ASIA_HRS = 6;
const INSTRUMENTS = [
  ['gold', 'gold'],
  ...['audjpy', 'audusd', 'nzdjpy', 'nzdusd', 'usdjpy', 'cadjpy', 'eurjpy', 'gbpjpy', 'euraud', 'eurusd', 'gbpusd', 'usdchf', 'usdcad'].map(k => [k, 'fx']),
  ...['nq', 'spx500', 'de30', 'us30', 'us2000'].map(k => [k, 'index']),
];

const args = process.argv.slice(2);
const argVal = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const ONLY = argVal('--only') ? new Set(argVal('--only').split(',')) : null;
const NBOOT = +(argVal('--boot') ?? 2000);

const dayShift = (date, n) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = date => new Date(date + 'T00:00:00Z').getUTCDay();
// As runRangeLineAnalyser's mondayOf.
const mondayOf = date => { const w = dow(date); return dayShift(date, -(w === 0 ? 6 : w - 1)); };

// ── Aggregation: key `${date}|${cls}|${cell}` → sums ─────────────────────────
// [rN, rY, rC, pN, pY, pC, aN, aY, bN, bY]  r = real, p = placebo (all K),
// a = placebo copies 0-1, b = copies 2-3 (control C1), *C = marked at session close.
const agg = new Map();
const add = (key, i, v) => { let a = agg.get(key); if (!a) agg.set(key, a = new Float64Array(10)); a[i] += v; };
const perInst = {};

const rng = mulberry32(SEED);
const shifted = (lad, s) => ({ low: lad.low + s, high: lad.high + s, validFrom: lad.validFrom,
  levels: lad.levels.map(l => ({ ...l, level: l.level + s })) });

for (const [key, cls] of INSTRUMENTS) {
  if (ONLY && !ONLY.has(key)) continue;
  const t0 = Date.now();
  // Local cache only: without this file the loader falls back to a Google Drive download.
  if (!fs.existsSync(path.join(BT_M1_DIR, `${key}_m1.parquet`))) throw new Error(`${key}: not in the local M1 cache ${BT_M1_DIR}`);
  const packed = await loadM1ForPair(key);
  if (!packed) { console.log(`${key}: NO DATA`); continue; }
  const raw = bucketM1IntoSessions(packed, 0);
  // A1: the label is the NEXT UTC date at boundaryHour 0 → re-label to the true UTC date.
  const sessions = new Map();
  // A1 dating = the true UTC date of the session's first bar (independent of how
  // bucketM1IntoSessions labels boundary 0, which was one day late before 2026-10-24).
  for (const [, bars] of raw) sessions.set(new Date(bars[0].time * 1000).toISOString().slice(0, 10), bars);
  const dates = [...sessions.keys()].sort()
    .filter(d => sessions.get(d).length >= MIN_BARS && dow(d) !== 0 && dow(d) !== 6 && d <= END);
  const monCache = new Map();
  const inst = { sessions: 0, real: [0, 0], plac: [0, 0] };

  for (let i = MIN_LOOKBACK; i < dates.length; i++) {
    const date = dates[i], bars = sessions.get(date), open = bars[0].open;
    const ladders = [];
    { const tA = bars[0].time, asiaClose = tA + ASIA_HRS * 3600;
      const ar = bodyRange(bars.filter(b => b.time < asiaClose), 5);
      if (ar && bars[bars.length - 1].time >= asiaClose)
        ladders.push({ low: ar.low, high: ar.high, validFrom: asiaClose, levels: buildRangeLadder(ar.low, ar.range, 'A') }); }
    { const mon = mondayOf(date);
      if (mon !== date) {
        let mr = monCache.get(mon);
        if (mr === undefined) { const mb = sessions.get(mon); mr = mb && mb.length >= MIN_BARS ? bodyRange(mb, 15) : null; monCache.set(mon, mr); }
        if (mr) ladders.push({ low: mr.low, high: mr.high, validFrom: bars[0].time, levels: buildRangeLadder(mr.low, mr.range, 'M') });
      } }
    if (!ladders.length) continue;
    inst.sessions++;

    for (const lad of ladders) {
      const range = lad.high - lad.low;
      const shifts = Array.from({ length: K }, () => (U_MIN + rng() * (U_MAX - U_MIN)) * range * (rng() < 0.5 ? -1 : 1));
      for (const ln of analyseRangeWindow({ open, bars }, [lad], {})) {
        const k = `${date}|${cls}|${ln.name}`, y = ln.outcome === 'reverted' ? 1 : 0;
        add(k, 0, 1); add(k, 1, y); add(k, 2, ln.decidedBy === 'close' ? 1 : 0);
        inst.real[0]++; inst.real[1] += y;
      }
      shifts.forEach((s, c) => {
        for (const ln of analyseRangeWindow({ open, bars }, [shifted(lad, s)], {})) {
          const k = `${date}|${cls}|${ln.name}`, y = ln.outcome === 'reverted' ? 1 : 0;
          add(k, 3, 1); add(k, 4, y); add(k, 5, ln.decidedBy === 'close' ? 1 : 0);
          if (c < 2) { add(k, 6, 1); add(k, 7, y); } else { add(k, 8, 1); add(k, 9, y); }
          inst.plac[0]++; inst.plac[1] += y;
        }
      });
    }
  }
  perInst[key] = { cls, sessions: inst.sessions, realTouches: inst.real[0], placTouches: inst.plac[0],
    deltaPP: inst.real[0] && inst.plac[0] ? +(100 * (inst.real[1] / inst.real[0] - inst.plac[1] / inst.plac[0])).toFixed(2) : null };
  console.log(`${key.padEnd(7)} ${cls.padEnd(5)} sessions ${inst.sessions}  real ${inst.real[0]}  placebo ${inst.plac[0]}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// ── Dense arrays over dates ──────────────────────────────────────────────────
const dateSet = new Set(), cellSet = new Set();
for (const k of agg.keys()) { const [d, , c] = k.split('|'); dateSet.add(d); cellSet.add(c); }
const DATES = [...dateSet].sort(), CELLS = [...cellSet].sort(), T = DATES.length;
const dIdx = new Map(DATES.map((d, i) => [d, i])), cIdx = new Map(CELLS.map((c, i) => [c, i]));
const CLASSES = ['fx', 'gold', 'index'];
// M[cell][field][t] and pooled per class P[cls][field][t]
const M = CELLS.map(() => Array.from({ length: 10 }, () => new Float64Array(T)));
const P = Object.fromEntries(CLASSES.map(c => [c, Array.from({ length: 10 }, () => new Float64Array(T))]));
for (const [k, a] of agg) {
  const [d, cls, c] = k.split('|'), t = dIdx.get(d), ci = cIdx.get(c);
  for (let f = 0; f < 10; f++) { M[ci][f][t] += a[f]; P[cls][f][t] += a[f]; }
}
const ALL = Array.from({ length: 10 }, (_, f) => { const x = new Float64Array(T); for (const c of CLASSES) for (let t = 0; t < T; t++) x[t] += P[c][f][t]; return x; });

const wsum = (arr, w) => { let s = 0; for (let t = 0; t < T; t++) s += arr[t] * w[t]; return s; };
const delta = (F, w, [nR, yR, nP, yP] = [0, 1, 3, 4]) => {
  const a = wsum(F[nR], w), b = wsum(F[nP], w);
  return a > 0 && b > 0 ? 100 * (wsum(F[yR], w) / a - wsum(F[yP], w) / b) : NaN;
};
const C1F = [6, 7, 8, 9];
const ones = new Float64Array(T).fill(1);
const mask = pred => Float64Array.from(DATES, d => (pred(d) ? 1 : 0));
const H1 = mask(d => d < HALF), H2 = mask(d => d >= HALF);

// ── Moving-block bootstrap over dates (all instruments of a date together) ───
const brng = mulberry32(SEED);
const boot = { P1: [], C1: [], cls: Object.fromEntries(CLASSES.map(c => [c, []])), cell: CELLS.map(() => []) };
for (let b = 0; b < NBOOT; b++) {
  const w = new Float64Array(T); let filled = 0;
  while (filled < T) { const s = Math.floor(brng() * Math.max(1, T - BLOCK + 1)); for (let j = 0; j < BLOCK && filled < T; j++, filled++) w[s + j]++; }
  boot.P1.push(delta(ALL, w)); boot.C1.push(delta(ALL, w, C1F));
  for (const c of CLASSES) boot.cls[c].push(delta(P[c], w));
  CELLS.forEach((_, i) => boot.cell[i].push(delta(M[i], w)));
}
const summ = (point, xs) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b); const n = v.length;
  if (!n || !Number.isFinite(point)) return { delta: point, se: null, ci: null, p: null, mde: null };
  const mean = v.reduce((s, x) => s + x, 0) / n, se = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1));
  const q = f => v[Math.min(n - 1, Math.max(0, Math.floor(f * n)))];
  const p = Math.min(1, 2 * Math.min(v.filter(x => x <= 0).length / n, v.filter(x => x >= 0).length / n));
  return { delta: +point.toFixed(3), se: +se.toFixed(3), ci: [+q(0.025).toFixed(3), +q(0.975).toFixed(3)], p: +p.toFixed(4), mde: +(2.8 * se).toFixed(3) };
};
const sameSign = (a, b) => Number.isFinite(a) && Number.isFinite(b) && a !== 0 && b !== 0 && Math.sign(a) === Math.sign(b);

const P1 = { ...summ(delta(ALL, ones), boot.P1), h1: +delta(ALL, H1).toFixed(3), h2: +delta(ALL, H2).toFixed(3),
  realTouches: wsum(ALL[0], ones), placTouches: wsum(ALL[3], ones),
  realRevertPct: +(100 * wsum(ALL[1], ones) / wsum(ALL[0], ones)).toFixed(2), placRevertPct: +(100 * wsum(ALL[4], ones) / wsum(ALL[3], ones)).toFixed(2),
  realClosePct: +(100 * wsum(ALL[2], ones) / wsum(ALL[0], ones)).toFixed(2), placClosePct: +(100 * wsum(ALL[5], ones) / wsum(ALL[3], ones)).toFixed(2) };
P1.pass = P1.p != null && P1.p < 0.05 && Math.abs(P1.delta) >= P1_BAR && sameSign(P1.h1, P1.h2);
const C1 = summ(delta(ALL, ones, C1F), boot.C1);
C1.clean = C1.ci != null && C1.ci[0] <= 0 && C1.ci[1] >= 0;

const cells = CELLS.map((c, i) => ({ cell: c, realTouches: wsum(M[i][0], ones), placTouches: wsum(M[i][3], ones),
  ...summ(delta(M[i], ones), boot.cell[i]), h1: +delta(M[i], H1).toFixed(3), h2: +delta(M[i], H2).toFixed(3) }));
const elig = cells.filter(c => c.realTouches >= MIN_CELL && c.p != null);
const bh = benjaminiHochberg(elig.map(c => c.p), 0.10);
elig.forEach((c, j) => { c.q = +bh.adjusted[j].toFixed(4); c.pass = bh.rejected[j] && Math.abs(c.delta) >= P2_BAR && sameSign(c.h1, c.h2); });

const byClass = Object.fromEntries(CLASSES.map(c => [c, { touches: wsum(P[c][0], ones), ...summ(delta(P[c], ones), boot.cls[c]) }]));
const years = [...new Set(DATES.map(d => d.slice(0, 4)))];
const byYear = Object.fromEntries(years.map(y => [y, +delta(ALL, mask(d => d.startsWith(y))).toFixed(2)]));

const anyP2 = elig.some(c => c.pass);
let verdict;
if (!C1.clean) verdict = 'NO VERDICT (control C1 failed: design biased)';
else if (P1.pass || anyP2) verdict = 'VALIDATED';
else if (P1.ci && P1.ci[0] >= -P1_BAR && P1.ci[1] <= P1_BAR) verdict = 'NULL';
else verdict = 'UNDERPOWERED';

const out = { id: 'range-ladder-placebo', prereg: 'forge/RANGE_LADDER_PLACEBO_PREREG.md', seed: SEED, nBoot: NBOOT, block: BLOCK,
  window: [DATES[0], DATES[T - 1]], sessions: T, K, shiftU: [U_MIN, U_MAX], verdict,
  P1, C1, P2: { eligible: elig.length, passes: elig.filter(c => c.pass).map(c => c.cell) }, byClass, byYear, perInst,
  cells: cells.sort((a, b) => b.realTouches - a.realTouches) };
const OUT = path.join(ROOT, 'analysis', 'output', 'range-ladder-placebo');
fs.mkdirSync(OUT, { recursive: true });
const tag = ONLY ? `_${[...ONLY].join('-')}` : '';
fs.writeFileSync(path.join(OUT, `results${tag}.json`), JSON.stringify(out, null, 1));

const f = x => (x == null || !Number.isFinite(x) ? '—' : (x > 0 ? '+' : '') + x.toFixed(2));
const md = [
  `# range-ladder-placebo — tables (generated ${new Date().toISOString().slice(0, 10)}${ONLY ? ', subset ' + [...ONLY] : ''})`, '',
  `Window ${DATES[0]} → ${DATES[T - 1]}, ${T} session dates, ${Object.keys(perInst).length} instruments, K=${K} placebo ladders, B=${NBOOT}, ${BLOCK}-session blocks, seed ${SEED}.`, '',
  `**Verdict by the registered rule: ${verdict}**`, '',
  '| | Δ revert, real − placebo (pp) | 95% CI | p | MDE | 2016–20 | 2021–26 | pass |', '|---|---|---|---|---|---|---|---|',
  `| P1 pooled | ${f(P1.delta)} | ${f(P1.ci?.[0])} … ${f(P1.ci?.[1])} | ${P1.p} | ${P1.mde} | ${f(P1.h1)} | ${f(P1.h2)} | ${P1.pass ? 'yes' : 'no'} |`,
  `| C1 placebo vs placebo | ${f(C1.delta)} | ${f(C1.ci?.[0])} … ${f(C1.ci?.[1])} | ${C1.p} | — | — | — | ${C1.clean ? 'clean' : 'BIASED'} |`, '',
  `Touches: real ${P1.realTouches}, placebo ${P1.placTouches}. Revert rate: real ${P1.realRevertPct}%, placebo ${P1.placRevertPct}%. Marked at session close: real ${P1.realClosePct}%, placebo ${P1.placClosePct}%.`, '',
  '| class | touches | Δ (pp) | 95% CI | p |', '|---|---|---|---|---|',
  ...CLASSES.map(c => `| ${c} | ${byClass[c].touches} | ${f(byClass[c].delta)} | ${f(byClass[c].ci?.[0])} … ${f(byClass[c].ci?.[1])} | ${byClass[c].p} |`), '',
  '| year | ' + years.join(' | ') + ' |', '|---|' + years.map(() => '---').join('|') + '|', '| Δ (pp) | ' + years.map(y => f(byYear[y])).join(' | ') + ' |', '',
  `P2: ${elig.length} cells with ≥ ${MIN_CELL} real touches; passes: ${elig.filter(c => c.pass).map(c => c.cell).join(', ') || 'none'}.`, '',
  '| cell | real touches | Δ (pp) | 95% CI | p | BH q | 2016–20 | 2021–26 | pass |', '|---|---|---|---|---|---|---|---|---|',
  ...elig.sort((a, b) => a.p - b.p).map(c => `| ${c.cell} | ${c.realTouches} | ${f(c.delta)} | ${f(c.ci?.[0])} … ${f(c.ci?.[1])} | ${c.p} | ${c.q} | ${f(c.h1)} | ${f(c.h2)} | ${c.pass ? 'yes' : 'no'} |`), '',
  '| instrument | class | sessions | real touches | Δ (pp, point) |', '|---|---|---|---|---|',
  ...Object.entries(perInst).map(([k, v]) => `| ${k} | ${v.cls} | ${v.sessions} | ${v.realTouches} | ${f(v.deltaPP)} |`),
].join('\n');
fs.writeFileSync(path.join(OUT, `RESULTS_TABLES${tag}.md`), md + '\n');
console.log(`\nverdict: ${verdict}\nP1 Δ ${f(P1.delta)}pp CI [${f(P1.ci?.[0])}, ${f(P1.ci?.[1])}] p ${P1.p} MDE ${P1.mde}  halves ${f(P1.h1)} / ${f(P1.h2)}\nC1 ${f(C1.delta)} [${f(C1.ci?.[0])}, ${f(C1.ci?.[1])}] ${C1.clean ? 'clean' : 'BIASED'}`);
