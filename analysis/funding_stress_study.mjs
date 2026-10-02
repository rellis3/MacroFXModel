#!/usr/bin/env node
/**
 * FUNDING-STRESS — does genuine funding stress precede wider ranges or weaker risk assets?
 *
 * Design frozen in MD files/FUNDING_STRESS_PREREG.md BEFORE this was written.
 *
 *   python scratchpad/runstudy.py analysis/funding_stress_study.mjs      (needs OANDA)
 *
 * Deliberately built on analysis/plumbing_study.mjs: same instruments, same ATR-quintile
 * control, same 10-session de-clustering, same +0.10 ATR bar. P1 tested the 99th
 * PERCENTILE of SOFR and found month-end plumbing. This tests the two things that leaves
 * open -- the volume-weighted MEDIAN away from month-end, and the Standing Repo Facility
 * actually being drawn -- so the two sets of numbers can be read side by side.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchD1 } from '../js/volBacktestEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'funding_stress.json');

// ── pre-registered constants ─────────────────────────────────────────────────
const MIN_EVENTS = 20;        // per cell; below this UNTESTABLE, which is not a null
const THRESH_BP = 3;          // S1: headline SOFR over the floor
const GAP = 10;               // de-clustering, matching P1
const H = 5;                  // next-5-session window
const EDGE_BAR = 0.10;        // P1's own bar for a range difference worth calling real
const REPS = 1000, SEED = 20261002;

const mulberry32 = a => () => { let t = (a += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rnd = mulberry32(SEED);
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const fmt = (x, dp = 3) => (x == null ? 'n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(dp)}`);

async function fredCsv(id) {
  const t = await (await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { signal: AbortSignal.timeout(60_000) })).text();
  return t.trim().split('\n').slice(1).map(l => { const [d, v] = l.split(','); return { date: d, value: parseFloat(v) }; })
    .filter(o => /^\d{4}-\d{2}-\d{2}$/.test(o.date) && Number.isFinite(o.value));
}

// ── data ─────────────────────────────────────────────────────────────────────
const sofrRaw = (await (await fetch(`https://markets.newyorkfed.org/api/rates/secured/sofr/search.json?startDate=2018-04-01&endDate=${new Date().toISOString().slice(0, 10)}`)).json())
  .refRates.map(r => ({ date: r.effectiveDate, p99: +r.percentPercentile99, med: +r.percentRate }))
  .filter(r => Number.isFinite(r.med)).sort((a, b) => (a.date < b.date ? -1 : 1));
const ioer = await fredCsv('IOER'), iorb = await fredCsv('IORB'), srf = await fredCsv('RPONTSYD');
const floorMap = new Map([...ioer, ...iorb].map(o => [o.date, o.value]));
const srfMap = new Map(srf.map(o => [o.date, o.value]));

let lastF = null;
const days = sofrRaw.map(s => {
  if (floorMap.has(s.date)) lastF = floorMap.get(s.date);
  return lastF == null ? null : { date: s.date, medBp: Math.round((s.med - lastF) * 100), p99Bp: Math.round((s.p99 - lastF) * 100), srf: srfMap.get(s.date) ?? null };
}).filter(Boolean);

// MONTH-END, the known confound: the last 3 or first 2 business days of a month. Computed
// on the SOFR calendar itself so it follows actual business days, not the Gregorian one.
const monthEnd = new Set();
for (let i = 0; i < days.length; i++) {
  const m = days[i].date.slice(0, 7);
  const sameMonth = j => j >= 0 && j < days.length && days[j].date.slice(0, 7) === m;
  let fromStart = 0; for (let j = i - 1; sameMonth(j); j--) fromStart++;
  let toEnd = 0; for (let j = i + 1; sameMonth(j); j++) toEnd++;
  if (fromStart < 2 || toEnd < 3) monthEnd.add(days[i].date);
}

console.log(`SOFR ${days[0].date} -> ${days.at(-1).date}, ${days.length} sessions`);
console.log(`month-end window: ${monthEnd.size} sessions (${(monthEnd.size / days.length * 100).toFixed(0)}%)`);
console.log(`median >= ${THRESH_BP}bp over floor: ${days.filter(d => d.medBp >= THRESH_BP).length}  (of which off month-end: ${days.filter(d => d.medBp >= THRESH_BP && !monthEnd.has(d.date)).length})`);
console.log(`SRF drawn (> 0): ${days.filter(d => d.srf > 0).length} sessions`);

/** First session of an episode, GAP sessions clear of the last. */
function episodes(pred) {
  const out = []; let last = -Infinity;
  days.forEach((d, i) => { if (!pred(d, i)) return; if (i - last > GAP) out.push(d); last = i; });
  return out;
}
const SETUPS = {
  s1_median_ex_monthEnd: episodes(d => d.medBp >= THRESH_BP && !monthEnd.has(d.date)),
  s2_srf_drawn:          episodes(d => d.srf > 0),
  // the pre-registered MIRROR: the same rule ON month-end. If this is bigger, we are
  // still looking at P1's calendar artefact.
  mirror_monthEnd:       episodes(d => d.medBp >= THRESH_BP && monthEnd.has(d.date)),
};
for (const [k, v] of Object.entries(SETUPS)) console.log(`  ${k.padEnd(24)} ${v.length} episodes`);

// ── instruments ──────────────────────────────────────────────────────────────
const INSTR = [['SPX500', 'SPX500_USD'], ['EURUSD', 'EUR_USD'], ['USDJPY', 'USD_JPY']];
const loaded = {};
for (const [name, sym] of INSTR) {
  const bars = (await fetchD1(sym, 5000)).filter(b => b.close > 0);
  const tr = bars.map((b, i) => (i ? Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)) : b.high - b.low));
  const atr = tr.map((_, i) => (i >= 14 ? mean(tr.slice(i - 13, i + 1)) : null));
  const atrPct = atr.map((a, i) => { if (a == null || i < 250) return null; const w = atr.slice(i - 250, i).filter(x => x != null); return w.filter(x => x <= a).length / w.length; });
  loaded[name] = { bars, atr, atrPct, idx: new Map(bars.map((b, i) => [b.date, i])) };
}

/**
 * The outcome window starts at D+1, never D: the NY Fed publishes SOFR for day D at about
 * 08:00 ET on D+1, so a setup dated D is not knowable until the next session. `fwd` below
 * measures bars i+1..i+H, and `anchorOf` maps a setup date to the LAST bar on or before
 * it, so i+1 is the first session anyone could have acted in.
 */
const anchorOf = (L, date) => { let i = L.idx.get(date); if (i != null) return i; const after = L.bars.findIndex(b => b.date > date); return after > 0 ? after - 1 : -1; };
const fwdRange = (L, i) => { if (i < 0 || i + H >= L.bars.length || L.atr[i] == null) return null; const hi = Math.max(...L.bars.slice(i + 1, i + 1 + H).map(b => b.high)), lo = Math.min(...L.bars.slice(i + 1, i + 1 + H).map(b => b.low)); return (hi - lo) / L.atr[i]; };
const fwdRet = (L, i) => { if (i < 0 || i + H >= L.bars.length) return null; return (L.bars[i + H].close / L.bars[i].close - 1) * 100; };

function cell(L, setups, measure) {
  const rows = [];
  for (const s of setups) { const i = anchorOf(L, s.date); const v = measure(L, i); if (v == null || L.atrPct[i] == null) continue; rows.push({ i, v, q: Math.floor(L.atrPct[i] * 5) }); }
  if (!rows.length) return { n: 0, untestable: true };
  const setupIdx = new Set(rows.map(r => r.i));
  const diffs = rows.map(r => {
    const pool = L.bars.map((_, i) => i).filter(i => L.atrPct[i] != null && Math.floor(L.atrPct[i] * 5) === r.q
      && !setupIdx.has(i) && !rows.some(x => Math.abs(x.i - i) <= GAP) && measure(L, i) != null);
    if (!pool.length) return null;
    const c = pool[Math.floor(rnd() * pool.length)];
    return { d: r.v - measure(L, c), s: r.v, c: measure(L, c) };
  }).filter(Boolean);
  if (diffs.length < 2) return { n: diffs.length, untestable: true };
  const boot = []; for (let k = 0; k < REPS; k++) { const smp = []; for (let i = 0; i < diffs.length; i++) smp.push(diffs[Math.floor(rnd() * diffs.length)].d); boot.push(mean(smp)); }
  boot.sort((a, b) => a - b);
  const half = Math.floor(diffs.length / 2);
  const h1 = mean(diffs.slice(0, half).map(x => x.d)), h2 = mean(diffs.slice(half).map(x => x.d));
  return { n: diffs.length, setupMean: +mean(diffs.map(x => x.s)).toFixed(3), controlMean: +mean(diffs.map(x => x.c)).toFixed(3),
    diff: +mean(diffs.map(x => x.d)).toFixed(3), lo: +boot[Math.floor(REPS * 0.025)].toFixed(3), hi: +boot[Math.floor(REPS * 0.975)].toFixed(3),
    halves: [h1 == null ? null : +h1.toFixed(3), h2 == null ? null : +h2.toFixed(3)],
    untestable: diffs.length < MIN_EVENTS };
}

const result = { id: 'funding-stress', ranAt: new Date().toISOString(), minEvents: MIN_EVENTS,
  span: { from: days[0].date, to: days.at(-1).date, sessions: days.length },
  monthEndShare: +(monthEnd.size / days.length).toFixed(3),
  episodes: Object.fromEntries(Object.entries(SETUPS).map(([k, v]) => [k, v.map(d => d.date)])), cells: {} };

for (const [sk, setups] of Object.entries(SETUPS)) {
  console.log(`\n${sk}  (${setups.length} episodes)`);
  for (const [name] of INSTR) {
    const L = loaded[name];
    const r = cell(L, setups, fwdRange), d = cell(L, setups, fwdRet);
    result.cells[`${sk}|${name}|range`] = r;
    result.cells[`${sk}|${name}|dir`] = d;
    console.log(`  ${name.padEnd(7)} range n=${String(r.n).padStart(3)} ${r.untestable ? `UNTESTABLE (floor ${MIN_EVENTS})`
      : `${r.setupMean} vs ${r.controlMean} ATR  diff ${fmt(r.diff)} [${fmt(r.lo)}, ${fmt(r.hi)}]  halves ${fmt(r.halves[0])}/${fmt(r.halves[1])}`}`);
    console.log(`  ${''.padEnd(7)} dir   n=${String(d.n).padStart(3)} ${d.untestable ? 'UNTESTABLE'
      : `${fmt(d.setupMean, 2)}% vs ${fmt(d.controlMean, 2)}%  diff ${fmt(d.diff, 2)}% [${fmt(d.lo, 2)}, ${fmt(d.hi, 2)}]`}`);
  }
}

// ── THE GATE, encoded from the prereg ────────────────────────────────────────
console.log('\nTHE GATE (all three required, per setup)');
const gate = {};
for (const sk of ['s1_median_ex_monthEnd', 's2_srf_drawn']) {
  const cells = INSTR.map(([n]) => result.cells[`${sk}|${n}|range`]);
  const testable = cells.filter(c => !c.untestable);
  const clears = testable.filter(c => c.diff >= EDGE_BAR && c.lo > 0);
  const halvesAgree = clears.every(c => c.halves[0] != null && c.halves[1] != null && Math.sign(c.halves[0]) === Math.sign(c.halves[1]));
  const mirror = INSTR.map(([n]) => result.cells[`mirror_monthEnd|${n}|range`]).filter(c => !c.untestable);
  const mirrorBigger = mirror.length && clears.length ? mean(mirror.map(c => c.diff)) >= mean(clears.map(c => c.diff)) : null;
  gate[sk] = { testable: testable.length, clears: clears.length, halvesAgree, mirrorBigger,
    pass: testable.length > 0 && clears.length > 0 && halvesAgree && mirrorBigger === false };
  console.log(`  ${sk}: ${testable.length} testable, ${clears.length} clear the +${EDGE_BAR} bar, halves agree: ${halvesAgree}, month-end mirror bigger: ${mirrorBigger ?? 'no read'} -> ${gate[sk].pass ? 'PASS' : 'fail'}`);
}
result.gate = gate;

const anyTestable = Object.values(result.cells).some(c => !c.untestable);
const anyPass = Object.values(gate).some(g => g.pass);
result.verdict = anyPass ? 'REAL' : anyTestable ? 'NULL' : 'UNTESTABLE';
console.log('\nVERDICT: ' + result.verdict + (result.verdict === 'UNTESTABLE' ? ' — not enough independent episodes to answer. This is not a null.' : ''));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log('written ' + path.relative(process.cwd(), OUT));
