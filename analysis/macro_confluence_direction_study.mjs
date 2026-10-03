#!/usr/bin/env node
/**
 * MACRO-CONFLUENCE-DIRECTION — does agreement across liquidity momentum, yield-curve
 * regime and credit stress predict forward FX/index direction beyond what any one of
 * them shows alone?
 *
 * Design frozen in MD files/MACRO_CONFLUENCE_DIRECTION_PREREG.md BEFORE this was written.
 *
 *   python scratchpad/runstudy.py analysis/macro_confluence_direction_study.mjs   (needs OANDA)
 *
 * Domains reuse existing scoring conventions, not new logic:
 *   liquidity -- js/liquidityGateEngine.js's own change-z-score idea (fedNetLiquidityLeg),
 *     reimplemented here as a ROLLING, causal version (that file only computes the LATEST
 *     z; a backtest needs every day's own z against only its own past).
 *   curve     -- T10Y2Y, 20-trading-day change.
 *   credit    -- BAMLH0A0HYM2 (HY OAS), 20-trading-day change, sign-inverted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchD1 } from '../js/volBacktestEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'macro_confluence_direction.json');

// ── pre-registered constants ──────────────────────────────────────────────────
const MIN_EVENTS = 30;
const HORIZONS = [5, 20];
const GAP = 10;                // de-clustering: first day of an episode, 10-day clear gap
const LIQ_Z_LOOKBACK = 24;     // weekly periods (WALCL cadence), matches liquidityGateEngine's own default
const LIQ_Z_MIN = 0.3;         // |z| below this = flat, no direction
const CURVE_MIN_PP = 0.02;     // 20d T10Y2Y change below 2bp = flat
const CREDIT_MIN_PP = 0.05;    // 20d HY OAS change below 5bp = flat
const REPS = 1000, BLOCK = 5, SEED = 20261003;

const mulberry32 = a => () => { let t = (a += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rnd = mulberry32(SEED);
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const fmt = (x, dp = 3) => (x == null ? 'n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(dp)}`);

async function fredCsv(id) {
  const t = await (await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { signal: AbortSignal.timeout(60_000) })).text();
  return t.trim().split('\n').slice(1).map(l => { const [d, v] = l.split(','); return { date: d, value: parseFloat(v) }; })
    .filter(o => /^\d{4}-\d{2}-\d{2}$/.test(o.date) && Number.isFinite(o.value));
}
// as-of join: for each `dates` entry, the latest value KNOWN as of that date (1-day publication lag applied
// by the caller shifting the source series forward first -- same discipline as funding-stress's D+1 rule).
function asOf(series, dates) {
  const sorted = [...series].sort((a, b) => (a.date < b.date ? -1 : 1));
  let j = 0, val = null;
  return dates.map(d => { while (j < sorted.length && sorted[j].date <= d) { val = sorted[j].value; j++; } return val; });
}
const shift1 = series => series.map(o => ({ date: new Date(new Date(o.date + 'T12:00:00Z').getTime() + 86_400_000).toISOString().slice(0, 10), value: o.value }));
const sgn = (v, flat) => (v == null ? null : Math.abs(v) < flat ? 0 : v > 0 ? 1 : -1);

// ═══ 1. DATA ═════════════════════════════════════════════════════════════════
console.log('pulling FRED series (WALCL, WTREGEN, RRPONTSYD, T10Y2Y, BAMLH0A0HYM2)...');
const [walcl, tga, rrp, t10y2y, hyOas] = await Promise.all(
  ['WALCL', 'WTREGEN', 'RRPONTSYD', 'T10Y2Y', 'BAMLH0A0HYM2'].map(fredCsv));
console.log(`  WALCL ${walcl.length}  TGA ${tga.length}  RRP ${rrp.length}  T10Y2Y ${t10y2y.length}  HY OAS ${hyOas.length}`);

const INSTR = [['EURUSD', 'EUR_USD'], ['SPX500', 'SPX500_USD'], ['GOLD', 'XAU_USD']];
const loaded = {};
for (const [name, sym] of INSTR) {
  console.log(`pulling ${name}...`);
  const bars = (await fetchD1(sym, 5000)).filter(b => b.close > 0);
  loaded[name] = { bars, idx: new Map(bars.map((b, i) => [b.date, i])) };
  console.log(`  ${name}: ${bars.length} bars, ${bars[0].date} -> ${bars.at(-1).date}`);
}
const dates = loaded.EURUSD.bars.map(b => b.date);   // master trading-day spine (all three OANDA D1s share it)

const walclAsOf = asOf(shift1(walcl), dates), tgaAsOf = asOf(shift1(tga), dates), rrpAsOf = asOf(shift1(rrp), dates);
const t10y2yAsOf = asOf(shift1(t10y2y), dates), hyOasAsOf = asOf(shift1(hyOas), dates);

const netLiq = dates.map((_, i) => (walclAsOf[i] == null || tgaAsOf[i] == null || rrpAsOf[i] == null) ? null : walclAsOf[i] - tgaAsOf[i] - rrpAsOf[i]);

// causal rolling z of the latest week-over-week CHANGE vs its own trailing baseline (no look-ahead: at index i,
// the baseline only uses changes strictly before i).
function rollingChangeZ(values, lookback) {
  const chgs = values.map((v, i) => (i === 0 || v == null || values[i - 1] == null) ? null : v - values[i - 1]);
  return values.map((_, i) => {
    if (i < lookback + 1) return null;
    const latest = chgs[i]; if (latest == null) return null;
    const base = chgs.slice(Math.max(0, i - lookback), i).filter(x => x != null);
    if (base.length < 6) return null;
    const m = mean(base), sd = Math.sqrt(mean(base.map(x => (x - m) ** 2)));
    if (sd < 1e-9) return null;
    return (latest - m) / sd;
  });
}
const liqZ = rollingChangeZ(netLiq, LIQ_Z_LOOKBACK);

// ═══ 2. SETUP AND CONTROL ════════════════════════════════════════════════════
const liqDir = dates.map((_, i) => sgn(liqZ[i], LIQ_Z_MIN));
const curveDir = dates.map((_, i) => (i < 20 || t10y2yAsOf[i] == null || t10y2yAsOf[i - 20] == null) ? null : sgn(t10y2yAsOf[i] - t10y2yAsOf[i - 20], CURVE_MIN_PP));
const creditDir = dates.map((_, i) => (i < 20 || hyOasAsOf[i] == null || hyOasAsOf[i - 20] == null) ? null : sgn(-(hyOasAsOf[i] - hyOasAsOf[i - 20]), CREDIT_MIN_PP));

const confluence = dates.map((_, i) => {
  const l = liqDir[i], c = curveDir[i], cr = creditDir[i];
  if (l == null || c == null || cr == null) return null;
  if (l === 1 && c === 1 && cr === 1) return 1;
  if (l === -1 && c === -1 && cr === -1) return -1;
  return 0;
});
const validIdx = confluence.map((v, i) => (v != null ? i : null)).filter(i => i != null);
const firstValid = validIdx[0], lastValid = validIdx.at(-1);
console.log(`domains computable ${dates[firstValid]} -> ${dates[lastValid]} (${validIdx.length} days)`);

function episodes(sign) {
  const out = []; let last = -Infinity;
  dates.forEach((d, i) => { if (confluence[i] !== sign) return; if (i - last > GAP) out.push(i); last = i; });
  return out;
}
const posSetups = episodes(1), negSetups = episodes(-1);
console.log(`confluence +1,+1,+1 episodes: ${posSetups.length}  (${posSetups.map(i => dates[i]).join(', ')})`);
console.log(`confluence -1,-1,-1 episodes: ${negSetups.length}  (${negSetups.map(i => dates[i]).join(', ')})`);

const maxH = Math.max(...HORIZONS);
const near = new Set();
for (const i of [...posSetups, ...negSetups]) for (let k = i - maxH; k <= i + maxH; k++) near.add(k);

// ═══ 3. THE OUTCOME ══════════════════════════════════════════════════════════
const outcome = (L, i, n) => (i < 0 || i + n >= L.bars.length) ? null : (L.bars[i + n].close / L.bars[i].close - 1) * 100;

function bootDiff(a, b) {
  if (a.length < MIN_EVENTS || b.length < MIN_EVENTS) return { untestable: true, nA: a.length, nB: b.length };
  const draw = x => { const o = []; while (o.length < x.length) { const i = Math.floor(rnd() * x.length); for (let k = 0; k < BLOCK && o.length < x.length; k++) o.push(x[(i + k) % x.length]); } return o; };
  const d = []; for (let r = 0; r < REPS; r++) d.push(mean(draw(a)) - mean(draw(b)));
  d.sort((p, q) => p - q);
  const lo = d[Math.floor(REPS * 0.025)], hi = d[Math.floor(REPS * 0.975)];
  return { nA: a.length, nB: b.length, diff: +(mean(a) - mean(b)).toFixed(4), lo: +lo.toFixed(4), hi: +hi.toFixed(4), real: (lo > 0 && hi > 0) || (lo < 0 && hi < 0) };
}

const result = { id: 'macro-confluence-direction', ranAt: new Date().toISOString(), minEvents: MIN_EVENTS,
  domainSpan: { from: dates[firstValid], to: dates[lastValid] }, episodeCounts: { pos: posSetups.length, neg: negSetups.length }, cells: {} };

for (const [name] of INSTR) {
  const L = loaded[name];
  for (const sign of [1, -1]) {
    const setups = sign === 1 ? posSetups : negSetups;
    for (const H of HORIZONS) {
      const ev = [], ctl = [];
      for (const i of setups) { const v = outcome(L, i, H); if (v != null) ev.push(v); }
      for (let i = firstValid; i <= lastValid - H; i++) { if (near.has(i)) continue; const v = outcome(L, i, H); if (v != null) ctl.push(v); }
      const cell = bootDiff(ev, ctl);
      const half = Math.floor(ev.length / 2);
      const h1 = mean(ev.slice(0, half)), h2 = mean(ev.slice(half));
      cell.halves = [h1, h2].map(x => (x == null ? null : +x.toFixed(4)));
      result.cells[`${name}|sign${sign}|H${H}`] = cell;
      console.log(`${name} sign${sign > 0 ? '+' : ''}${sign} H=${H}: ` + (cell.untestable ? `UNTESTABLE (n=${cell.nA})`
        : `${fmt(cell.diff, 3)}% [${fmt(cell.lo, 3)}, ${fmt(cell.hi, 3)}]  n=${cell.nA} vs ${cell.nB} ctl  halves ${fmt(cell.halves[0], 2)}/${fmt(cell.halves[1], 2)} -> ${cell.real ? 'REAL' : 'null'}`));
    }
  }
}

// ── THE GATE, encoded from the prereg ────────────────────────────────────────
console.log('\nTHE GATE (per instrument/horizon): pos REAL, both halves agree (pos AND neg), mirror opposite-signed');
const gate = {};
for (const [name] of INSTR) {
  for (const H of HORIZONS) {
    const pos = result.cells[`${name}|sign1|H${H}`], neg = result.cells[`${name}|sign-1|H${H}`];
    if (pos.untestable || neg.untestable) { gate[`${name}|H${H}`] = { pass: false, reason: 'untestable' }; console.log(`  ${name} H${H}: UNTESTABLE`); continue; }
    const halvesAgreePos = pos.halves[0] != null && pos.halves[1] != null && Math.sign(pos.halves[0]) === Math.sign(pos.halves[1]);
    const halvesAgreeNeg = neg.halves[0] != null && neg.halves[1] != null && Math.sign(neg.halves[0]) === Math.sign(neg.halves[1]);
    const mirrorOpposite = Math.sign(pos.diff) !== Math.sign(neg.diff) && Math.sign(pos.diff) !== 0;
    const pass = pos.real && halvesAgreePos && halvesAgreeNeg && mirrorOpposite;
    gate[`${name}|H${H}`] = { posReal: pos.real, halvesAgreePos, halvesAgreeNeg, mirrorOpposite, pass };
    console.log(`  ${name} H${H}: pos REAL=${pos.real}  halves agree pos/neg=${halvesAgreePos}/${halvesAgreeNeg}  mirror opposite=${mirrorOpposite} -> ${pass ? 'PASS' : 'fail'}`);
  }
}
result.gate = gate;

const anyTestable = Object.values(result.cells).some(c => !c.untestable);
const anyPass = Object.values(gate).some(g => g.pass);
result.verdict = anyPass ? 'REAL' : anyTestable ? 'NULL' : 'UNTESTABLE';
console.log('\nVERDICT: ' + result.verdict + (result.verdict === 'UNTESTABLE' ? ' — not enough independent episodes. This is not a null.' : ''));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log('written ' + path.relative(process.cwd(), OUT));
