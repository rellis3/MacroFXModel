// ── Phase 3a: indicator equivalence harness (JS side) ────────────────────────
//
// DIAGNOSTIC ONLY — this file changes no production code. It answers one
// question before any consolidation is attempted:
//
//   Are the duplicated `ema`/`sma` implementations bit-identical to the
//   canonical one in js/indicatorCore.js, or have they drifted?
//
// This matters because the duplication is precisely what ALLOWS silent drift
// (CLAUDE.md, Lego Principle 1). If a copy has drifted, then "just import the
// canonical brick" is not a refactor — it CHANGES the output of whatever uses
// that copy. Only bit-identical copies are safe to merge; anything else is a
// decision to escalate, not a cleanup to finish.
//
// Run: node js/indicatorEquivalence.test.mjs

import { ema as canonicalEma } from './indicatorCore.js';

// Deterministic LCG so the JS and Python harnesses test the IDENTICAL input.
// (Math.random would make the two languages incomparable.)
function lcg(seed, n) {
  const out = [];
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out.push(s / 4294967296);
  }
  return out;
}

function randomWalk(n, seed) {
  const r = lcg(seed, n);
  const out = [];
  let p = 100;
  for (let i = 0; i < n; i++) { p += (r[i] - 0.5) * 2; out.push(+p.toFixed(10)); }
  return out;
}

const CASES = [
  { name: 'ascending',     values: Array.from({ length: 200 }, (_, i) => 100 + i * 0.37) },
  { name: 'random-walk',   values: randomWalk(500, 12345) },
  { name: 'constant',      values: Array(120).fill(42) },
  { name: 'short(len<per)', values: [10, 11, 12] },
  { name: 'single',        values: [7] },
  { name: 'descending',    values: Array.from({ length: 150 }, (_, i) => 500 - i * 1.13) },
];
const PERIODS = [3, 9, 12, 21, 50];

const IMPLS = [
  { mod: './utils.js',            label: 'js/utils.js' },
  { mod: './backtest-engine.js',  label: 'js/backtest-engine.js' },
  { mod: './nasdaqTransforms.js', label: 'js/nasdaqTransforms.js' },
  { mod: './vumanchuCore.js',     label: 'js/vumanchuCore.js' },
  { mod: './rangeBiasCore.js',    label: 'js/rangeBiasCore.js' },
];

const maxAbsDiff = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b)) return Infinity;
  if (a.length !== b.length) return Infinity;
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (!Number.isFinite(x) && !Number.isFinite(y)) continue;   // NaN==NaN treated as equal
    if (!Number.isFinite(x) || !Number.isFinite(y)) return Infinity;
    m = Math.max(m, Math.abs(x - y));
  }
  return m;
};

console.log('\n=== EMA equivalence vs js/indicatorCore.js (canonical) ===\n');
const results = [];

for (const { mod, label } of IMPLS) {
  let fn;
  try {
    const m = await import(mod);
    fn = m.ema;
    if (typeof fn !== 'function') { results.push({ label, verdict: 'NO ema EXPORT' }); continue; }
  } catch (e) {
    results.push({ label, verdict: `IMPORT FAILED: ${e.message}` });
    continue;
  }

  let worst = 0, shapeMismatch = false, threw = null;
  const notes = new Set();

  for (const c of CASES) {
    for (const p of PERIODS) {
      let got, want;
      try { want = canonicalEma(c.values, p); } catch { continue; }
      try { got = fn(c.values, p); }
      catch (e) { threw = `${c.name}/p${p}: ${e.message}`; continue; }

      if (!Array.isArray(got)) {
        shapeMismatch = true;
        notes.add(got === null ? 'returns null when len<period' : `returns ${typeof got}, not an array`);
        // Quantify anyway: compare the scalar against the canonical FINAL value.
        if (typeof got === 'number' && Number.isFinite(got)) {
          const d = Math.abs(got - want[want.length - 1]);
          if (d > 1e-9) notes.add(`scalar differs from canonical last value by up to ${d.toExponential(2)}`);
        }
        continue;
      }
      const d = maxAbsDiff(got, want);
      if (d === Infinity) { shapeMismatch = true; notes.add(`length ${got.length} vs ${want.length}`); }
      else worst = Math.max(worst, d);
    }
  }

  const verdict = shapeMismatch ? 'DIFFERENT CONTRACT'
    : worst === 0 ? 'IDENTICAL'
    : worst < 1e-12 ? `float-noise (${worst.toExponential(2)})`
    : `DRIFTED (${worst.toExponential(2)})`;
  results.push({ label, verdict, notes: [...notes], threw });
}

for (const r of results) {
  console.log(`  ${r.label.padEnd(26)} ${r.verdict}`);
  (r.notes ?? []).forEach(n => console.log(`  ${''.padEnd(26)}   └─ ${n}`));
  if (r.threw) console.log(`  ${''.padEnd(26)}   └─ threw: ${r.threw}`);
}

// ── NaN handling, called out separately ──────────────────────────────────────
// Clean-input equivalence is not the whole story: these copies disagree about
// what a non-finite input does, and real bar data does contain gaps.
console.log('\n=== NaN handling (clean-input equivalence does NOT cover this) ===\n');
const nanCase = [10, 11, NaN, 13, 14, NaN, 16];
for (const { mod, label } of [{ mod: './indicatorCore.js', label: 'js/indicatorCore.js (canon)' }, ...IMPLS]) {
  try {
    const m = await import(mod);
    if (typeof m.ema !== 'function') continue;
    const out = m.ema(nanCase, 3);
    const shown = Array.isArray(out)
      ? '[' + out.map(v => (Number.isFinite(v) ? +v.toFixed(4) : String(v))).join(', ') + ']'
      : String(out);
    console.log(`  ${label.padEnd(26)} ${shown}`);
  } catch (e) { console.log(`  ${label.padEnd(26)} threw: ${e.message}`); }
}

const drifted = results.filter(r => /DRIFTED|DIFFERENT CONTRACT|FAILED|NO ema/.test(r.verdict));
console.log(`\n${results.length - drifted.length}/${results.length} copies safe to consolidate; `
  + `${drifted.length} need a decision.\n`);
