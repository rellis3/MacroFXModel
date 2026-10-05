#!/usr/bin/env node
/**
 * BREADTH-TILT-SEMIS — does RSP/SPY narrowing predict semis (SMH) beating SPY?
 *
 * Design frozen in MD files/BREADTH_TILT_SEMIS_PREREG.md and committed (f7929fd)
 * BEFORE this file was written. `study.mjs bank` checks that against git.
 *
 * Crown Macro: "diversification is dead… the real leadership is compressed into the
 * physical bottlenecks of the AI buildout… a tilt towards the AI bottlenecks
 * generated 3.6% in expected alpha over SPY".
 *
 * THE GATE IS NOT SIGNIFICANCE, IT IS THE UNCONDITIONAL CONTROL. Semis led this
 * entire sample. Any in-sample tilt backtest over 2020-2026 shows large alpha
 * whether or not breadth contributed anything, so "SMH beat SPY after narrowing" is
 * not the question. The question is whether it beat SPY by MORE than it does
 * ordinarily — and whether BROADENING predicts the same thing, which is the mirror
 * that killed breadth-narrowing and curve-inversion.
 *
 *   node analysis/breadth_tilt_semis_study.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'breadth_tilt_semis.json');
const BASE = process.env.MFX_BASE || 'https://macrofxmodel-production.up.railway.app';

// ── pre-registered constants — these match the prereg exactly ────────────────
const MIN_EVENTS = 20;        // below this a cell is UNTESTABLE, which is NOT a null
const HORIZONS = [20, 60];    // sessions, measured from D+1
const LOOKBACK = 20;          // sessions in the RSP/SPY change that defines a setup
const WINDOW = 504;           // rolling window the decile threshold is taken over (~2y)
const DECLUSTER = 20;         // a narrowing regime persists for months
const REPS = 2000, BLOCK = 10;

// ── stats: block bootstrap on the DIFFERENCE from control ────────────────────
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const draw = (x, b) => { const o = []; while (o.length < x.length) { const i = Math.floor(Math.random() * x.length); for (let k = 0; k < b && o.length < x.length; k++) o.push(x[(i + k) % x.length]); } return o; };
function bootDiff(a, b) {
  if (a.length < MIN_EVENTS) return { untestable: true, nA: a.length, nB: b.length };
  const d = []; for (let r = 0; r < REPS; r++) d.push(mean(draw(a, BLOCK)) - mean(draw(b, BLOCK)));
  d.sort((p, q) => p - q);
  const lo = d[Math.floor(REPS * 0.025)], hi = d[Math.floor(REPS * 0.975)];
  return { nA: a.length, nB: b.length,
           evMean: +mean(a).toFixed(3), ctlMean: +mean(b).toFixed(3),
           diff: +(mean(a) - mean(b)).toFixed(3), lo: +lo.toFixed(3), hi: +hi.toFixed(3),
           real: (lo > 0 && hi > 0) || (lo < 0 && hi < 0) };
}

// ═══ 1. DATA ═════════════════════════════════════════════════════════════════
// SMH is the closest listed proxy to "memory, lithography and foundry" — it holds
// TSMC, ASML, Micron, Applied Materials and Lam. It is a PROXY for the sleeve, not a
// replication of Crown's weights, which are behind a paid letter.
const j = await (await fetch(`${BASE}/api/drill-series`)).json();
if (!j?.ok) throw new Error('drill-series unavailable');
const dates = j.dates, S = j.series;
for (const k of ['smh', 'rsp', 'spy']) if (!Array.isArray(S?.[k])) throw new Error(`missing series ${k}`);
const rows = dates.map((d, i) => ({ d, smh: S.smh[i], rsp: S.rsp[i], spy: S.spy[i] }))
  .filter(r => [r.smh, r.rsp, r.spy].every(v => Number.isFinite(v) && v > 0));
console.log(`rows ${rows.length}  ${rows[0].d} -> ${rows.at(-1).d}`);

// ═══ 2. SETUP AND CONTROL ════════════════════════════════════════════════════
// "Broke its multi-year trend line" is not reproducible as stated. The nearest honest
// formalisation is a rolling percentile of the same ratio's own change, fixed in the
// prereg before anything was run.
//
// KNOWABLE WHEN: the 20-session change completes at the close of D, so every outcome
// starts at D+1. The threshold uses only the trailing WINDOW, never future data.
const ratio = rows.map(r => r.rsp / r.spy);
const chg = ratio.map((v, i) => i < LOOKBACK ? null : (v / ratio[i - LOOKBACK] - 1) * 100);

function pct(arr, p) { const a = arr.filter(Number.isFinite).slice().sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) * p)] : null; }
function pick(side) {
  const hits = [];
  for (let i = WINDOW; i < rows.length; i++) {
    if (!Number.isFinite(chg[i])) continue;
    const hist = chg.slice(i - WINDOW, i);
    const thr = pct(hist, side === 'narrow' ? 0.10 : 0.90);
    if (thr == null) continue;
    if (side === 'narrow' ? chg[i] <= thr : chg[i] >= thr) hits.push(i);
  }
  // de-cluster: one regime must not contribute dozens of overlapping observations
  const out = []; let last = -Infinity;
  for (const i of hits) if (i - last >= DECLUSTER) { out.push(i); last = i; }
  return out;
}
const narrow = pick('narrow'), broad = pick('broad');
console.log(`setups: narrow ${narrow.length}  broad ${broad.length} (de-clustered ${DECLUSTER}d)`);

// ═══ 3. THE OUTCOME ══════════════════════════════════════════════════════════
// RELATIVE return, not direction and not range: SMH total return minus SPY total
// return over the next n sessions, entered at D+1.
const outcome = (i, n) => {
  const a = rows[i + 1], b = rows[i + 1 + n];
  if (!a || !b) return null;
  return +(((b.smh / a.smh - 1) - (b.spy / a.spy - 1)) * 100).toFixed(4);
};

// ── the run ──────────────────────────────────────────────────────────────────
const result = { id: 'breadth-tilt-semis', ranAt: new Date().toISOString(),
                 minEvents: MIN_EVENTS, span: [rows[0].d, rows.at(-1).d], n: rows.length,
                 setups: { narrow: narrow.length, broad: broad.length }, cells: {} };

for (const H of HORIZONS) {
  // the control is every session NOT inside a setup's shadow — the UNCONDITIONAL
  // SMH-SPY spread, which is the whole gate
  const near = new Set();
  for (const i of narrow) for (let k = i - H; k <= i + H; k++) near.add(k);
  const ctl = [];
  for (let i = 0; i < rows.length - H - 1; i++) { if (near.has(i)) continue; const v = outcome(i, H); if (v != null) ctl.push(v); }

  for (const [tag, setList] of [['narrow', narrow], ['broad', broad]]) {
    const ev = []; for (const i of setList) { const v = outcome(i, H); if (v != null) ev.push(v); }
    const cell = bootDiff(ev, ctl);
    result.cells[`${tag}_h${H}`] = cell;
    console.log(`${tag.padEnd(6)} H=${String(H).padStart(2)}: ` + (cell.untestable
      ? `UNTESTABLE — ${cell.nA} events against a floor of ${MIN_EVENTS}. Not a null.`
      : `SMH-SPY ${cell.evMean >= 0 ? '+' : ''}${cell.evMean}% vs ${cell.ctlMean}% unconditional`
        + ` → excess ${cell.diff >= 0 ? '+' : ''}${cell.diff} [${cell.lo}, ${cell.hi}]`
        + ` on n=${cell.nA} vs ${cell.nB} — ${cell.real ? 'CLEARS ZERO' : 'null'}`));
  }
}

// ── the verdict, computed from the pre-registered gate ───────────────────────
// The gate, verbatim from the prereg: (b) the NARROW excess over the unconditional
// spread must clear zero, AND the MIRROR must not produce a similar-sized excess on
// BROAD. A result that fails either way is not a finding.
const narrowReal = HORIZONS.some(H => result.cells[`narrow_h${H}`]?.real);
const mirrorFails = HORIZONS.some(H => {
  const n = result.cells[`narrow_h${H}`], b = result.cells[`broad_h${H}`];
  if (!n?.real || b?.untestable) return false;
  // "similar-sized" = the broadening excess reaches half the narrowing one, same sign
  return Math.sign(b.diff) === Math.sign(n.diff) && Math.abs(b.diff) >= Math.abs(n.diff) * 0.5;
});
const anyTestable = Object.values(result.cells).some(c => !c.untestable);
result.gate = { narrowClearsZero: narrowReal, mirrorContaminated: mirrorFails };
result.verdict = !anyTestable ? 'UNTESTABLE'
  : narrowReal && !mirrorFails ? 'REAL'
  : 'NULL';
console.log('\nGATE  narrow clears zero: ' + narrowReal + '   mirror contaminated: ' + mirrorFails);
console.log('VERDICT: ' + result.verdict
  + (result.verdict === 'UNTESTABLE' ? ' — the question was not answered. This is not a null.' : '')
  + (mirrorFails ? ' — broadening predicts it too, so the effect belongs to the period, not to breadth.' : ''));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log('written ' + path.relative(process.cwd(), OUT));
