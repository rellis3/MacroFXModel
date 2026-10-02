// Swing-based fib retracement levels at each book pass (forge/SWING_FIB_PREREG.md).
//   node scripts/rangebook/swing_fib_build.mjs [pair]  -> analysis/output/rangebook/<pair>_swingfib.json
// H1 fractal swings (3 each side, confirmed when the 3rd right bar has closed before the pass bar); the last impulse = the most
// recent confirmed swing pair ending within 72 H1 bars; retracements 0.618-0.65 (zone), 0.786, 0.886 measured from the impulse end.
// Distance (σ) from the touched vol line to each level, real and placebo-shifted (0.15-0.5σ, seeded per date).
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { buildContext, scrambleFrom, passesOf } from './common.mjs';

const PAIR = (process.argv[2] ?? 'eurusd').toLowerCase(), SYM = PAIR.toUpperCase();
const OPTS = { sym: SYM, assetClass: assetClassFor(PAIR), tagFor: loadCalendarProxy()(SYM) };
const TYPES = ['gp', 'f786', 'f886'], FAR = 5;
const r3 = x => (x == null || !Number.isFinite(x)) ? null : Math.round(x * 1000) / 1000;
function hashU(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 1e6) / 1e6; }
function lowerBound(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; }

function hourly(S) {
  const B = [];
  for (let i = 0; i < S.n; i++) {
    const s = Math.floor(S.times[i] / 3600) * 3600, h = B.at(-1);
    if (!h || h.s !== s) B.push({ s, high: S.highs[i], low: S.lows[i] });
    else { if (S.highs[i] > h.high) h.high = S.highs[i]; if (S.lows[i] < h.low) h.low = S.lows[i]; }
  }
  const sw = [];                                                  // confirmed swings in time order: {i, kind, px, confirmedAt}
  for (let i = 3; i + 3 < B.length; i++) {
    let hi = true, lo = true;
    for (let j = 1; j <= 3; j++) { if (B[i - j].high >= B[i].high || B[i + j].high >= B[i].high) hi = false; if (B[i - j].low <= B[i].low || B[i + j].low <= B[i].low) lo = false; }
    if (hi) sw.push({ i, kind: 'H', px: B[i].high, at: B[i + 3].s + 3600 });
    if (lo) sw.push({ i, kind: 'L', px: B[i].low, at: B[i + 3].s + 3600 });
  }
  return { B, sw, swAt: sw.map(x => x.at) };
}

// Levels knowable at time t: the last two confirmed swings of opposite kind form the impulse.
function levelsAt(H, t) {
  const n = lowerBound(H.swAt, t);                                 // swings confirmed before t
  if (n < 2) return null;
  let a = null, b = null;
  for (let k = n - 1; k >= 0 && !b; k--) { const s = H.sw[k]; if (!a) a = s; else if (s.kind !== a.kind) b = s; }
  if (!b || a.i - b.i > 72 || a.i - b.i < 1) return null;
  const start = b.px, end = a.px, R = end - start;               // impulse from b to a; retracements pull back from `end`
  const lv = f => end - f * R;
  return { gp: [[lv(0.65), lv(0.618)].sort((x, y) => x - y)], f786: [lv(0.786)], f886: [lv(0.886)] };
}
function dist(lv, line, unit, shift) {
  const out = {};
  for (const ty of TYPES) {
    let near = Infinity;
    for (const x of lv[ty]) {
      if (Array.isArray(x)) { const lo = x[0] + shift, hi = x[1] + shift; near = Math.min(near, line >= lo && line <= hi ? 0 : Math.min(Math.abs(lo - line), Math.abs(hi - line)) / unit); }
      else near = Math.min(near, Math.abs(x + shift - line) / unit);
    }
    out[ty] = near > FAR ? null : r3(near);
  }
  return out;
}
function dayRows(H, ctx, di, want) {
  const d = ctx.days[di], unit = d.sigmaFrac * d.open, out = [];
  if (!(unit > 0)) return out;
  for (const p of passesOf(d)) {
    const key = `${d.date}|${p.line}|${p.pass}`; if (!want.has(key)) continue;
    const t = d.bars[p.k].time, lv = levelsAt(H, t);
    if (!lv) { out.push({ key, none: 1 }); continue; }
    const shift = (hashU(d.date + '|fib') < 0.5 ? -1 : 1) * (0.15 + 0.35 * hashU('fib|' + d.date)) * unit;
    out.push({ key, real: dist(lv, p.level, unit, 0), placebo: dist(lv, p.level, unit, shift) });
  }
  return out;
}
const S = await loadM1ForPair(PAIR);
const ctx = buildContext(S, OPTS), H = hourly(S);
const seq = JSON.parse(fs.readFileSync(`analysis/output/rangebook/${PAIR}_sequence.json`, 'utf8')).passes.filter(p => !p.sameBar);
const want = new Set(seq.map(p => `${p.date}|${p.line}|${p.pass}`)), dates = new Set(seq.map(p => p.date));
const rows = []; ctx.days.forEach((d, di) => { if (dates.has(d.date)) rows.push(...dayRows(H, ctx, di, want)); });
{ // self-check: scramble from the bar after the pass; levels (from confirmed swings before the pass) must not move
  const idx = new Map(Array.from(S.times, (x, i) => [x, i])), byKey = new Map(rows.map(r => [r.key, r]));
  const picks = seq.filter((_, i) => i % Math.floor(seq.length / 5) === 3).slice(0, 5);
  for (const p of picks) {
    const q = scrambleFrom(S, idx.get(p.time) + 1, 127), c2 = buildContext(q, OPTS), H2 = hourly(q), key = `${p.date}|${p.line}|${p.pass}`;
    const g = dayRows(H2, c2, c2.dayIdx.get(p.date), new Set([key]))[0];
    if (JSON.stringify(g) !== JSON.stringify(byKey.get(key))) { console.error(`LOOK-AHEAD ${key}\n ${JSON.stringify(byKey.get(key))}\n ${JSON.stringify(g)}`); process.exit(2); }
  }
  console.log(`self-check: ${picks.length} passes' fib distances identical under future-scramble`);
}
fs.writeFileSync(`analysis/output/rangebook/${PAIR}_swingfib.json`, JSON.stringify({ pair: SYM, rows }));
const at = ty => rows.filter(r => r.real && r.real[ty] != null && r.real[ty] <= 0.05).length;
console.log(`${SYM}: ${rows.length} passes (${rows.filter(r => r.none).length} with no impulse); at the line gp ${at('gp')}, 0.786 ${at('f786')}, 0.886 ${at('f886')}`);
