// range-ladder-placebo-confirm — forge/RANGE_LADDER_PLACEBO_CONFIRM_PREREG.md
//
// Copy of scripts/range-ladder-placebo/run.mjs (with its A1 session dating) changed
// only as the prereg's §3 lists: the 15 instruments the first test never loaded,
// K = 8 placebo copies, scored cells = the four range-edge lines (pooled E + each,
// Holm), C1 = copies 1-4 vs 5-8 with a fixed 0.30 pp tolerance, C2 = extension lines.
//
//   node scripts/range-ladder-placebo-confirm/run.mjs [--only eurgbp] [--boot 2000]
//
// Reads the local M1 cache only. Writes analysis/output/range-ladder-placebo-confirm/.

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
const { holm, benjaminiHochberg } = await import('../../js/preregStats.js');

// ── Fixed by the prereg ──────────────────────────────────────────────────────
const SEED = 20261020, K = 8, U_MIN = 0.10, U_MAX = 0.40;
const END = '2026-08-20', HALF = '2021-01-01';
const BLOCK = 21, BAR = 1.0, C1_TOL = 0.30;
const MIN_BARS = 30, MIN_LOOKBACK = 20, ASIA_HRS = 6;
const EDGE = ['A_0', 'A_1', 'M_0', 'M_1'];
const INSTRUMENTS = [
  ...['audcad', 'audchf', 'audnzd', 'cadchf', 'chfjpy', 'eurcad', 'eurchf', 'eurgbp', 'eurnzd',
      'gbpaud', 'gbpcad', 'gbpchf', 'gbpnzd', 'nzdcad'].map(k => [k, 'fx']),
  ['uk100', 'index'],
];

const args = process.argv.slice(2);
const argVal = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const ONLY = argVal('--only') ? new Set(argVal('--only').split(',')) : null;
const NBOOT = +(argVal('--boot') ?? 2000);

const dayShift = (date, n) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = date => new Date(date + 'T00:00:00Z').getUTCDay();
const mondayOf = date => { const w = dow(date); return dayShift(date, -(w === 0 ? 6 : w - 1)); };
const fibOf = cell => +cell.split('_')[1];

// key `${date}|${cell}` → [rN, rY, rC, pN, pY, pC, aN, aY, bN, bY]
// r = real, p = placebo (all K), a = copies 1-4, b = copies 5-8 (C1), *C = marked at close.
const agg = new Map();
const add = (key, i, v) => { let a = agg.get(key); if (!a) agg.set(key, a = new Float64Array(10)); a[i] += v; };
const perInst = {};

const rng = mulberry32(SEED);
const shifted = (lad, s) => ({ low: lad.low + s, high: lad.high + s, validFrom: lad.validFrom,
  levels: lad.levels.map(l => ({ ...l, level: l.level + s })) });

for (const [key, cls] of INSTRUMENTS) {
  if (ONLY && !ONLY.has(key)) continue;
  const t0 = Date.now();
  if (!fs.existsSync(path.join(BT_M1_DIR, `${key}_m1.parquet`))) throw new Error(`${key}: not in the local M1 cache ${BT_M1_DIR}`);
  const packed = await loadM1ForPair(key);
  if (!packed) { console.log(`${key}: NO DATA`); continue; }
  const raw = bucketM1IntoSessions(packed, 0);
  const sessions = new Map();
  for (const [lab, bars] of raw) sessions.set(dayShift(lab, -1), bars);           // A1 dating
  const dates = [...sessions.keys()].sort()
    .filter(d => sessions.get(d).length >= MIN_BARS && dow(d) !== 0 && dow(d) !== 6 && d <= END);
  const monCache = new Map();
  const inst = { cls, sessions: 0, edge: [0, 0, 0, 0] };   // real n, y, placebo n, y

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
        const k = `${date}|${ln.name}`, y = ln.outcome === 'reverted' ? 1 : 0;
        add(k, 0, 1); add(k, 1, y); add(k, 2, ln.decidedBy === 'close' ? 1 : 0);
        if (EDGE.includes(ln.name)) { inst.edge[0]++; inst.edge[1] += y; }
      }
      shifts.forEach((s, c) => {
        for (const ln of analyseRangeWindow({ open, bars }, [shifted(lad, s)], {})) {
          const k = `${date}|${ln.name}`, y = ln.outcome === 'reverted' ? 1 : 0;
          add(k, 3, 1); add(k, 4, y); add(k, 5, ln.decidedBy === 'close' ? 1 : 0);
          if (c < K / 2) { add(k, 6, 1); add(k, 7, y); } else { add(k, 8, 1); add(k, 9, y); }
          if (EDGE.includes(ln.name)) { inst.edge[2]++; inst.edge[3] += y; }
        }
      });
    }
  }
  perInst[key] = { cls, sessions: inst.sessions, edgeReal: inst.edge[0], edgePlac: inst.edge[2],
    edgeRealRevertPct: inst.edge[0] ? +(100 * inst.edge[1] / inst.edge[0]).toFixed(2) : null,
    edgeDeltaPP: inst.edge[0] && inst.edge[2] ? +(100 * (inst.edge[1] / inst.edge[0] - inst.edge[3] / inst.edge[2])).toFixed(2) : null };
  console.log(`${key.padEnd(7)} ${cls.padEnd(5)} sessions ${inst.sessions}  edge real ${inst.edge[0]}  placebo ${inst.edge[2]}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// ── Dense arrays over dates, per group (cell or pooled set of cells) ─────────
const dateSet = new Set(), cellSet = new Set();
for (const k of agg.keys()) { const [d, c] = k.split('|'); dateSet.add(d); cellSet.add(c); }
const DATES = [...dateSet].sort(), T = DATES.length, dIdx = new Map(DATES.map((d, i) => [d, i]));
const GROUPS = { E: c => EDGE.includes(c), EXT: c => Math.abs(fibOf(c)) >= 1.5, ALL: () => true,
  ...Object.fromEntries(EDGE.map(e => [e, c => c === e])) };
const G = Object.fromEntries(Object.keys(GROUPS).map(g => [g, Array.from({ length: 10 }, () => new Float64Array(T))]));
for (const [k, a] of agg) {
  const [d, c] = k.split('|'), t = dIdx.get(d);
  for (const [g, pred] of Object.entries(GROUPS)) if (pred(c)) for (let f = 0; f < 10; f++) G[g][f][t] += a[f];
}
const wsum = (arr, w) => { let s = 0; for (let t = 0; t < T; t++) s += arr[t] * w[t]; return s; };
const delta = (F, w, [nR, yR, nP, yP] = [0, 1, 3, 4]) => {
  const a = wsum(F[nR], w), b = wsum(F[nP], w);
  return a > 0 && b > 0 ? 100 * (wsum(F[yR], w) / a - wsum(F[yP], w) / b) : NaN;
};
const C1F = [6, 7, 8, 9];
const ones = new Float64Array(T).fill(1);
const mask = pred => Float64Array.from(DATES, d => (pred(d) ? 1 : 0));
const H1M = mask(d => d < HALF), H2M = mask(d => d >= HALF);

// ── Moving-block bootstrap over dates ────────────────────────────────────────
const brng = mulberry32(SEED + 1);
const boot = Object.fromEntries(Object.keys(GROUPS).map(g => [g, []])); boot.C1 = [];
for (let b = 0; b < NBOOT; b++) {
  const w = new Float64Array(T); let filled = 0;
  while (filled < T) { const s = Math.floor(brng() * Math.max(1, T - BLOCK + 1)); for (let j = 0; j < BLOCK && filled < T; j++, filled++) w[s + j]++; }
  for (const g of Object.keys(GROUPS)) boot[g].push(delta(G[g], w));
  boot.C1.push(delta(G.ALL, w, C1F));
}
const summ = (point, xs) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b); const n = v.length;
  if (!n || !Number.isFinite(point)) return { delta: point, se: null, ci: null, p: null, mde: null };
  const mean = v.reduce((s, x) => s + x, 0) / n, se = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1));
  const q = f => v[Math.min(n - 1, Math.max(0, Math.floor(f * n)))];
  const p = Math.min(1, 2 * Math.min(v.filter(x => x <= 0).length / n, v.filter(x => x >= 0).length / n));
  return { delta: +point.toFixed(3), se: +se.toFixed(3), ci: [+q(0.025).toFixed(3), +q(0.975).toFixed(3)], p: +p.toFixed(4), mde: +(2.8 * se).toFixed(3) };
};
const rev = (F, w = ones) => ({ real: +(100 * wsum(F[1], w) / wsum(F[0], w)).toFixed(2), plac: +(100 * wsum(F[4], w) / wsum(F[3], w)).toFixed(2),
  realClose: +(100 * wsum(F[2], w) / wsum(F[0], w)).toFixed(2), placClose: +(100 * wsum(F[5], w) / wsum(F[3], w)).toFixed(2) });
const cell = g => ({ realTouches: wsum(G[g][0], ones), placTouches: wsum(G[g][3], ones), revertPct: rev(G[g]),
  ...summ(delta(G[g], ones), boot[g]), h1: +delta(G[g], H1M).toFixed(3), h2: +delta(G[g], H2M).toFixed(3) });

const E = cell('E');
E.pass = E.p != null && E.p < 0.05 && E.delta >= BAR && E.h1 > 0 && E.h2 > 0;
const lines = EDGE.map(e => ({ cell: e, ...cell(e) }));
const hm = holm(lines.map(c => c.p ?? 1), 0.05);
lines.forEach((c, j) => { c.holmP = +hm.adjusted[j].toFixed(4); c.pass = hm.rejected[j] && c.delta >= BAR && c.h1 > 0 && c.h2 > 0; });
const C1 = summ(delta(G.ALL, ones, C1F), boot.C1); C1.clean = Number.isFinite(C1.delta) && Math.abs(C1.delta) <= C1_TOL;
const C2 = cell('EXT');
const ALLc = cell('ALL');
const years = [...new Set(DATES.map(d => d.slice(0, 4)))];
const byYear = Object.fromEntries(years.map(y => [y, +delta(G.E, mask(d => d.startsWith(y))).toFixed(2)]));
const instP = Object.entries(perInst).filter(([, v]) => v.edgeDeltaPP != null);
const instPos = instP.filter(([, v]) => v.edgeDeltaPP > 0).length;

let verdict;
if (!C1.clean) verdict = 'UNDERPOWERED';                       // no verdict by the rule → underpowered
else if (E.mde > BAR) verdict = 'UNDERPOWERED';
else if (E.pass) verdict = 'VALIDATED';
else if (E.ci && E.ci[1] < BAR) verdict = 'NULL';
else verdict = 'UNDERPOWERED';

const out = { id: 'range-ladder-placebo-confirm', prereg: 'forge/RANGE_LADDER_PLACEBO_CONFIRM_PREREG.md', seed: SEED, nBoot: NBOOT, block: BLOCK,
  window: [DATES[0], DATES[T - 1]], sessions: T, K, shiftU: [U_MIN, U_MAX], verdict,
  H1_E: E, H2_lines: lines, C1, C2_extension: C2, allLines: ALLc, byYear, perInst,
  instrumentsPositive: `${instPos}/${instP.length}`, ranAt: new Date().toISOString() };
const OUT = path.join(ROOT, 'analysis', 'output', 'range-ladder-placebo-confirm');
fs.mkdirSync(OUT, { recursive: true });
const tag = ONLY ? `_${[...ONLY].join('-')}` : '';
fs.writeFileSync(path.join(OUT, `results${tag}.json`), JSON.stringify(out, null, 1));

const f = x => (x == null || !Number.isFinite(x) ? '—' : (x > 0 ? '+' : '') + x.toFixed(2));
const row = (name, c, extra = '') => `| ${name} | ${c.realTouches} | ${c.revertPct.real}% / ${c.revertPct.plac}% | ${f(c.delta)} | ${f(c.ci?.[0])} … ${f(c.ci?.[1])} | ${c.p} | ${c.mde} | ${f(c.h1)} | ${f(c.h2)} | ${extra} |`;
const md = [
  `# range-ladder-placebo-confirm — tables (generated ${new Date().toISOString().slice(0, 10)}${ONLY ? ', subset ' + [...ONLY] : ''})`, '',
  `Window ${DATES[0]} → ${DATES[T - 1]}, ${T} session dates, ${Object.keys(perInst).length} instruments, K=${K}, B=${NBOOT}, ${BLOCK}-session blocks, seed ${SEED}.`, '',
  `**Verdict by the registered rule: ${verdict}**`, '',
  '| cell | real touches | revert real / placebo | Δ (pp) | 95% CI | p | MDE | 2016–20 | 2021–26 | pass |', '|---|---|---|---|---|---|---|---|---|---|',
  row('H1 E pooled edges', E, E.pass ? 'yes' : 'no'),
  ...lines.map(c => row(`H2 ${c.cell}`, c, `${c.pass ? 'yes' : 'no'} (Holm p ${c.holmP})`)),
  row('C2 extension lines (descr.)', C2, '—'),
  row('all lines (descr.)', ALLc, '—'), '',
  `C1 placebo copies 1–4 vs 5–8: ${f(C1.delta)} pp [${f(C1.ci?.[0])}, ${f(C1.ci?.[1])}] → ${C1.clean ? 'clean' : 'FAILS'} (tolerance ±${C1_TOL}).`, '',
  '| year | ' + years.join(' | ') + ' |', '|---|' + years.map(() => '---').join('|') + '|', '| E Δ (pp) | ' + years.map(y => f(byYear[y])).join(' | ') + ' |', '',
  `Instruments with a positive edge Δ: ${instPos}/${instP.length}.`, '',
  '| instrument | class | sessions | edge touches | edge revert % | edge Δ (pp) |', '|---|---|---|---|---|---|',
  ...Object.entries(perInst).map(([k, v]) => `| ${k} | ${v.cls} | ${v.sessions} | ${v.edgeReal} | ${v.edgeRealRevertPct} | ${f(v.edgeDeltaPP)} |`),
].join('\n');
fs.writeFileSync(path.join(OUT, `RESULTS_TABLES${tag}.md`), md + '\n');
console.log(`\nverdict: ${verdict}\nE Δ ${f(E.delta)}pp CI [${f(E.ci?.[0])}, ${f(E.ci?.[1])}] p ${E.p} MDE ${E.mde} halves ${f(E.h1)} / ${f(E.h2)}  revert ${E.revertPct.real}% vs ${E.revertPct.plac}%\nC1 ${f(C1.delta)} ${C1.clean ? 'clean' : 'FAILS'}`);
