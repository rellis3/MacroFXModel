#!/usr/bin/env node
/**
 * §7 of `MD files/EVENT_RESPONSE_BOOK.md` — the composite-state analogue test.
 * Design frozen in that document BEFORE this ran; this implements it verbatim.
 *
 * The question, in the owner's words: "with yields increasing/decreasing in the
 * lead up, TIPS change, central bank changes, market moving into the lead-up vs
 * the output from a meeting — what happened previously with a similar setup?"
 *
 * §6 asked a cruder version: ONE variable (the 5-session change in the nominal
 * 2y), cut into three buckets. That came back at chance. This asks the question
 * the way a desk actually asks it:
 *
 *   • the state is a VECTOR — nominal 2y/10y/30y, the 10y TIPS real yield, the
 *     10y breakeven, the curve slope, and what the instrument itself did into
 *     the event — not a single bucketed axis;
 *   • the method is NEAREST-NEIGHBOUR, not a grid. A 3x3 grid on ~150 events
 *     leaves ~17 per cell and every added dimension halves that again; k-NN
 *     weights instead of partitioning, so the same sample supports a richer
 *     state.
 *
 * WALK-FORWARD BY CONSTRUCTION. For each event, the standardisation, the
 * neighbour pool and the prediction all use PRIOR events only. Nothing here
 * could have been computed after the fact, so this is a rule that could have
 * been run live — not an in-sample fit with a split bolted on.
 *
 * THE PLACEBO ARM IS THE POINT. The identical machinery runs with the state
 * vector shuffled across events. If the placebo scores like the real arm, the
 * method manufactures hit rates and the real arm means nothing. A test without
 * this control cannot tell an edge from its own machinery.
 *
 *   node analysis/event_response/analogue_test.mjs [--k 8] [--seed 42]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };

// Frozen in EVENT_RESPONSE_BOOK.md §7 before the run.
const K = Number(arg('--k', 8));
const MIN_PRIOR = 20;            // events needed behind one before it can be scored
const PASS_N = 500;              // minimum scored predictions
const PASS_P = 0.01;             // binomial p, stricter than 0.05 — this is a second look

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'backfill', 'event_response_events.json'), 'utf8'));
const KEYS = data.stateKeys;

// ── stats ─────────────────────────────────────────────────────────────────────
const median = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
/** Normal approximation to a one-sided binomial test of p > 0.5 — n is in the hundreds. */
function binomP(hits, n) {
  if (!n) return 1;
  const z = (hits - n / 2) / Math.sqrt(n / 4);
  return 0.5 * erfc(z / Math.SQRT2);
}
function erfc(x) {                                   // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? 1 - y : 1 + y;
}
// Deterministic PRNG so the placebo arm is reproducible.
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * One instrument's events, in time order → predictions.
 * For event i: standardise the state on events [0..i-1], find the K nearest of
 * those, predict the sign of their median R1. Everything is prior-only.
 */
function walkForward(rows, { shuffleState = null } = {}) {
  const ev = rows
    .filter(r => r && r.state && Number.isFinite(r.r1) && KEYS.every(k => Number.isFinite(r.state[k])))
    .sort((a, b) => a.ms - b.ms);
  if (shuffleState) {                        // placebo: same states, wrong events
    const states = ev.map(e => e.state);
    for (let i = states.length - 1; i > 0; i--) { const j = Math.floor(shuffleState() * (i + 1)); [states[i], states[j]] = [states[j], states[i]]; }
    ev.forEach((e, i) => (e = Object.assign(e, { state: states[i] })));
  }
  const out = [];
  for (let i = MIN_PRIOR; i < ev.length; i++) {
    const prior = ev.slice(0, i);
    const mu = {}, sd = {};
    for (const k of KEYS) {
      const vals = prior.map(p => p.state[k]);
      mu[k] = vals.reduce((a, b) => a + b, 0) / vals.length;
      sd[k] = Math.sqrt(vals.reduce((a, b) => a + (b - mu[k]) ** 2, 0) / Math.max(1, vals.length - 1)) || 1;
    }
    const z = s => KEYS.map(k => (s[k] - mu[k]) / sd[k]);
    const qz = z(ev[i].state);
    const near = prior
      .map(p => ({ p, d: Math.hypot(...z(p.state).map((v, n) => v - qz[n])) }))
      .sort((a, b) => a.d - b.d).slice(0, K);
    const pred = median(near.map(x => x.p.r1));
    if (pred == null || pred === 0) continue;
    out.push({ ms: ev[i].ms, pred, actual: ev[i].r1, hit: Math.sign(pred) === Math.sign(ev[i].r1) ? 1 : 0, dist: median(near.map(x => x.d)) });
  }
  return out;
}

// ── run both arms ─────────────────────────────────────────────────────────────
const rng = mulberry32(Number(arg('--seed', 42)));
const arms = { real: [], placebo: [] };
const perFamily = {};
for (const [fk, fam] of Object.entries(data.families)) {
  for (const [inst, rows] of Object.entries(fam.instruments)) {
    if (!Array.isArray(rows)) continue;
    const real = walkForward(rows.map(r => ({ ...r, state: { ...r.state } })));
    const plac = walkForward(rows.map(r => ({ ...r, state: { ...r.state } })), { shuffleState: rng });
    arms.real.push(...real); arms.placebo.push(...plac);
    (perFamily[fk] ??= { label: fam.label, hits: 0, n: 0 });
    perFamily[fk].hits += real.reduce((a, b) => a + b.hit, 0);
    perFamily[fk].n += real.length;
  }
}

const score = preds => {
  const n = preds.length, hits = preds.reduce((a, b) => a + b.hit, 0);
  const half = Math.floor(n / 2);
  const byTime = [...preds].sort((a, b) => a.ms - b.ms);
  const h1 = byTime.slice(0, half), h2 = byTime.slice(half);
  const rate = p => (p.length ? (p.reduce((a, b) => a + b.hit, 0) / p.length) * 100 : null);
  return { n, hits, pct: (hits / n) * 100, p: binomP(hits, n), early: rate(h1), late: rate(h2) };
};

const R = score(arms.real), P = score(arms.placebo);
const pf = n => (n == null ? '—' : n.toFixed(1) + '%');

console.log(`\n═══ §7 COMPOSITE-STATE ANALOGUE TEST — k=${K}, state = ${KEYS.join(', ')}`);
console.log(`Walk-forward by construction: every prediction uses prior events only.\n`);
console.log(`  REAL     n=${R.n}  hit ${pf(R.pct)}  p=${R.p.toExponential(2)}  halves ${pf(R.early)} / ${pf(R.late)}`);
console.log(`  PLACEBO  n=${P.n}  hit ${pf(P.pct)}  p=${P.p.toExponential(2)}  halves ${pf(P.early)} / ${pf(P.late)}   (state vector shuffled)`);

const cells = {
  'hit rate > 50% with p < 0.01': R.pct > 50 && R.p < PASS_P,
  [`N >= ${PASS_N}`]: R.n >= PASS_N,
  'both halves > 50%': R.early > 50 && R.late > 50,
  'placebo does NOT clear cell 1': !(P.pct > 50 && P.p < PASS_P),
};
console.log('\n  Frozen pass conditions:');
for (const [k, v] of Object.entries(cells)) console.log(`   ${v ? 'PASS' : 'FAIL'}  ${k}`);
const passed = Object.values(cells).every(Boolean);
console.log(`\n  VERDICT: ${passed ? 'PASS' : 'FAIL'} — ${passed ? 'the composite pre-event state carries information the bucket form missed' : 'the composite state does not predict the next-day direction either'}\n`);

console.log('  Per family (descriptive, no pass/fail — 13 families is 13 chances at 5%):');
for (const f of Object.values(perFamily).filter(f => f.n >= 50).sort((a, b) => (b.hits / b.n) - (a.hits / a.n))) {
  console.log(`   ${pf((f.hits / f.n) * 100).padStart(6)}  n=${String(f.n).padStart(4)}  ${f.label}`);
}
console.log();
