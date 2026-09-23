#!/usr/bin/env node
/**
 * O1 -- does the Market View's own output precede anything?
 * Design frozen in MD files/OUTCOME_LOOP.md BEFORE this ran.
 *
 *   node analysis/outcome_loop.mjs
 *
 * Replays `findings()` at every past index using the SAME modules the live page
 * calls -- not a re-implementation, because a harness that rebuilds the thing it
 * is testing tests the rebuild.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scanBoard, scanLinks, findings } from '../js/marketScan.js';
import { marketState } from '../js/marketState.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'outcome_loop.json');
const API = process.env.MV_API ?? 'https://macrofxmodel-production.up.railway.app/api/drill-series';

// ── frozen in the pre-registration ──────────────────────────────────────────
const HORIZON = 20, APART = 20, WARMUP = 800, MIN_FIRINGS = 8, REPS = 1000, BLOCK = 10;
// Added after the first run, and the reason is worth recording. Three kinds came
// back "null -- the hedge is correct" while having NO CONTROL AT ALL: they fire on
// essentially every session, so +/-20 around their firings swallowed the whole
// window and the control set was empty. An empty control does not produce a null,
// it produces nothing, and reporting it as a null was the harness lying. A kind is
// now only scored when a real control survives.
const MIN_CONTROL = 100;

let seed = 20260923;
const rnd = () => { seed += 0x6D2B79F5; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mean = x => x.length ? x.reduce((s, v) => s + v, 0) / x.length : null;
const median = x => { if (!x.length) return null; const s = [...x].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r3 = v => (v == null || !Number.isFinite(v)) ? null : +v.toFixed(3);

const drawBlock = (x, block) => { const n = x.length, nb = Math.ceil(n / block), s = []; for (let q = 0; q < nb; q++) { const st = Math.floor(rnd() * (n - block + 1)); for (let i = 0; i < block && s.length < n; i++) s.push(x[st + i]); } return s; };
const bootDiff = (a, b, block = BLOCK) => {
  if (a.length < 4 || b.length < block) return null;
  const out = [];
  for (let k = 0; k < REPS; k++) out.push(mean(drawBlock(a, Math.min(block, a.length))) - mean(drawBlock(b, block)));
  out.sort((p, q) => p - q);
  return { nA: a.length, nB: b.length, diff: r3(mean(a) - mean(b)), lo: r3(out[Math.floor(REPS * 0.025)]), hi: r3(out[Math.floor(REPS * 0.975)]) };
};
const wilson = (k, n) => { if (!n) return null; const p = k / n, z = 1.96, d = 1 + z * z / n; const c = (p + z * z / (2 * n)) / d; const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return { n, k, share: r3(p), lo: r3(c - h), hi: r3(c + h) }; };

// ── the bundle ──────────────────────────────────────────────────────────────
console.log('fetching the bundle...');
const res = await fetch(API);
const B = await res.json();
if (!B?.ok) throw new Error(B?.error ?? 'no bundle');
const N = B.dates.length;
console.log(`${N} sessions, ${B.dates[0]} -> ${B.dates.at(-1)}, ${Object.keys(B.series).length} series`);

// Daily range is not in the bundle (closes only), so "wider" is measured as the
// mean ABSOLUTE DAILY RETURN over the window against its trailing median -- the
// same quantity a range ratio captures, from the data actually available. Stated
// here rather than quietly substituted.
function fwdRangeRatio(key, i, n = HORIZON) {
  const s = B.series[key]; if (!s) return null;
  const absRet = j => { const a = s[j - 1], b = s[j]; return (a == null || b == null || a === 0) ? null : Math.abs(b / a - 1); };
  const trail = []; for (let j = Math.max(1, i - 20); j <= i; j++) { const v = absRet(j); if (v != null) trail.push(v); }
  const base = median(trail);
  if (!base || base <= 0 || i + n >= s.length) return null;
  const fwd = []; for (let j = i + 1; j <= i + n; j++) { const v = absRet(j); if (v != null) fwd.push(v); }
  return fwd.length >= n * 0.6 ? mean(fwd) / base : null;
}
function fwdReturn(key, i, n = HORIZON) {
  const s = B.series[key]; if (!s) return null;
  const a = s[i], b = s[i + n];
  return (a == null || b == null || a === 0) ? null : (b / a - 1) * 100;
}

// ── replay the page, one session at a time ──────────────────────────────────
console.log('replaying the scan at every index (this is the slow part)...');
const fired = new Map();          // kind -> [indices]
let done = 0;
for (let i = WARMUP; i < N - HORIZON; i++) {
  let F = [];
  try {
    const board = scanBoard(B, i);
    const links = scanLinks(B, i);
    F = findings(board, { links: [], scored: links, limit: 6 });
  } catch (e) { continue; }
  for (const f of F) {
    if (!fired.has(f.kind)) fired.set(f.kind, []);
    fired.get(f.kind).push(i);
  }
  if (++done % 100 === 0) process.stdout.write(`\r  ${done}/${N - HORIZON - WARMUP}`);
}
console.log('\nreplay done.');

const result = { ranAt: new Date().toISOString(), bundle: { from: B.dates[0], to: B.dates.at(-1), n: N },
  horizon: HORIZON, warmup: WARMUP, minFirings: MIN_FIRINGS, kinds: {} };

for (const [kind, all] of [...fired.entries()].sort((a, b) => b[1].length - a[1].length)) {
  // de-cluster: the first firing, no re-fire inside APART
  const ev = []; let last = -999;
  for (const i of all) { if (i - last > APART) { ev.push(i); last = i; } }
  const near = new Set();
  for (const i of all) for (let k = i - APART; k <= i + APART; k++) near.add(k);

  const sessions = N - HORIZON - WARMUP;
  const daysFired = new Set(all).size;
  const controlIdx = [];
  for (let i = WARMUP; i < N - HORIZON; i++) if (!near.has(i)) controlIdx.push(i);
  const row = { rawFirings: all.length, daysFired, baseRate: r3(daysFired / sessions),
    firings: ev.length, control: controlIdx.length, first: B.dates[ev[0]], last: B.dates[ev.at(-1)] };

  if (ev.length < MIN_FIRINGS) {
    row.verdict = 'too few to judge';
    result.kinds[kind] = row;
    console.log(`${kind.padEnd(14)} ${String(ev.length).padStart(3)} firings — too few to judge (pre-registered floor ${MIN_FIRINGS})`);
    continue;
  }
  if (controlIdx.length < MIN_CONTROL) {
    // This is a finding about the PAGE, not about the market: a "finding" that
    // appears on nearly every session is the default state wearing an alarm.
    row.verdict = `UNTESTABLE — fires on ${Math.round(row.baseRate * 100)}% of sessions, leaving ${controlIdx.length} control days`;
    result.kinds[kind] = row;
    console.log(`${kind.padEnd(14)} ${String(ev.length).padStart(3)} firings | ${String(Math.round(row.baseRate * 100)).padStart(3)}% of days | ctrl ${String(controlIdx.length).padStart(3)} | fires on ${String(Math.round(row.baseRate * 100)).padStart(3)}% of sessions | control ${controlIdx.length} — UNTESTABLE, and that is the finding`);
    continue;
  }

  for (const [name, key] of [['spx', 'spx'], ['nq', 'nq']]) {
    const a = [], c = [];
    for (const i of ev) { const v = fwdRangeRatio(key, i); if (v != null) a.push(v); }
    for (const i of controlIdx) { const v = fwdRangeRatio(key, i); if (v != null) c.push(v); }
    row[`o1a_${name}`] = bootDiff(a, c);
  }
  // direction, pre-registered as expected null
  const up = [], cup = [];
  for (const i of ev) { const v = fwdReturn('spx', i); if (v != null) up.push(v > 0 ? 1 : 0); }
  for (const i of controlIdx) { const v = fwdReturn('spx', i); if (v != null) cup.push(v > 0 ? 1 : 0); }
  row.o1b_dir = { setup: wilson(up.filter(Boolean).length, up.length), control: wilson(cup.filter(Boolean).length, cup.length) };

  // O1d -- one regime or many?
  const mid = ev[Math.floor(ev.length / 2)];
  const half = set => { const a = []; for (const i of set) { const v = fwdRangeRatio('spx', i); if (v != null) a.push(v); } return a; };
  const cAll = []; for (const i of controlIdx) { const v = fwdRangeRatio('spx', i); if (v != null) cAll.push(v); }
  row.o1d_halves = { splitAt: B.dates[mid],
    early: bootDiff(half(ev.filter(i => i < mid)), cAll), late: bootDiff(half(ev.filter(i => i >= mid)), cAll) };

  // O1c -- did anything survive?
  const rangeReal = ['o1a_spx', 'o1a_nq'].some(k => row[k] && (row[k].lo > 0 || row[k].hi < 0));
  const d = row.o1b_dir;
  const dirReal = d?.setup && d?.control && (d.setup.lo > d.control.hi || d.setup.hi < d.control.lo);
  row.verdict = rangeReal || dirReal ? 'something survives' : 'null — the hedge is correct';
  row.o1c = { rangeReal, dirReal };

  const f = x => x ? `${x.diff >= 0 ? '+' : ''}${x.diff} [${x.lo}, ${x.hi}]` : 'n/a';
  console.log(`${kind.padEnd(14)} ${String(ev.length).padStart(3)} firings | range SPX ${f(row.o1a_spx)} NQ ${f(row.o1a_nq)} | up ${Math.round((d.setup?.share ?? 0) * 100)}% [${Math.round((d.setup?.lo ?? 0) * 100)}-${Math.round((d.setup?.hi ?? 0) * 100)}] vs ctrl ${Math.round((d.control?.share ?? 0) * 100)}% | ${row.verdict}`);
  result.kinds[kind] = row;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log('\nwritten', OUT);
