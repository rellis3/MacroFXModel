#!/usr/bin/env node
/**
 * SPREAD-DIVERGENCE-RANGE — When the DE-US 10-year spread moves and EUR/USD does not, does the next few hours run WIDER, even though spot does not catch up directionally?
 *
 * Design frozen in MD files/SPREAD_DIVERGENCE_RANGE_PREREG.md BEFORE this was written.
 *
 * Fill in the three marked sections. Everything else — control, bootstrap, halves,
 * the event floor and the verdict — is already wired, so the parts that are easy to
 * forget cannot be forgotten.
 *
 *   node analysis/spread_divergence_range_study.mjs
 *   python scratchpad/runstudy.py analysis/spread_divergence_range_study.mjs   (if it needs OANDA)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'spread_divergence_range.json');

// ── pre-registered constants — these must match the prereg exactly ───────────
const MIN_EVENTS = 30;
const HORIZONS = [5, 20];
const REPS = 1000, BLOCK = 5;

// ── stats: block bootstrap on the DIFFERENCE from control ────────────────────
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const draw = (x, b) => { const o = []; while (o.length < x.length) { const i = Math.floor(Math.random() * x.length); for (let k = 0; k < b && o.length < x.length; k++) o.push(x[(i + k) % x.length]); } return o; };
function bootDiff(a, b) {
  if (a.length < MIN_EVENTS || b.length < MIN_EVENTS) return { untestable: true, nA: a.length, nB: b.length };
  const d = []; for (let r = 0; r < REPS; r++) d.push(mean(draw(a, BLOCK)) - mean(draw(b, BLOCK)));
  d.sort((p, q) => p - q);
  const lo = d[Math.floor(REPS * 0.025)], hi = d[Math.floor(REPS * 0.975)];
  return { nA: a.length, nB: b.length, diff: +(mean(a) - mean(b)).toFixed(4),
           lo: +lo.toFixed(4), hi: +hi.toFixed(4), real: (lo > 0 && hi > 0) || (lo < 0 && hi < 0) };
}

// ═══ 1. DATA ═════════════════════════════════════════════════════════════════
// TODO: load what the prereg says. Keep the loader boring and separate from the test.
const rows = [];

// ═══ 2. SETUP AND CONTROL ════════════════════════════════════════════════════
// TODO: fill setups. The control is every period NOT near a setup, on the same
// instrument over the same span — it is already excluded for you below, so do not
// hand-roll it.
const setups = [];                         // indices into rows
const near = new Set();
for (const i of setups) for (let k = i - Math.max(...HORIZONS); k <= i + Math.max(...HORIZONS); k++) near.add(k);

// ═══ 3. THE OUTCOME ══════════════════════════════════════════════════════════
// TODO: return the measured outcome at row i over n periods, or null.
const outcome = (i, n) => null;

// ── the run ──────────────────────────────────────────────────────────────────
const result = { id: 'spread-divergence-range', ranAt: new Date().toISOString(), minEvents: MIN_EVENTS, cells: {} };
for (const H of HORIZONS) {
  const ev = [], ctl = [];
  for (const i of setups) { const v = outcome(i, H); if (v != null) ev.push(v); }
  for (let i = 0; i < rows.length - H; i++) { if (near.has(i)) continue; const v = outcome(i, H); if (v != null) ctl.push(v); }
  const cell = bootDiff(ev, ctl);
  result.cells['h' + H] = cell;
  console.log(`H=${H}: ` + (cell.untestable
    ? `UNTESTABLE — ${cell.nA} events against a floor of ${MIN_EVENTS}. Not a null.`
    : `${cell.diff >= 0 ? '+' : ''}${cell.diff} [${cell.lo}, ${cell.hi}] on n=${cell.nA} vs ${cell.nB} controls — ${cell.real ? 'REAL' : 'null'}`));
}

// ── the verdict, computed from the pre-registered gate ───────────────────────
// TODO: if the prereg's gate is stricter than "any cell real" — both directions, both
// halves, a mirror — encode it HERE. The verdict must come from the gate, never from
// reading the numbers afterwards.
const testable = Object.values(result.cells).filter(c => !c.untestable);
result.verdict = !testable.length ? 'UNTESTABLE' : testable.some(c => c.real) ? 'REAL' : 'NULL';
console.log('VERDICT: ' + result.verdict + (result.verdict === 'UNTESTABLE' ? ' — the question was not answered. This is not a null.' : ''));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log('written ' + path.relative(process.cwd(), OUT));
