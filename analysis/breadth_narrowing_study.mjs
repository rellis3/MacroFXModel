#!/usr/bin/env node
/**
 * B1 — does market narrowing predict anything?
 *
 * Pre-registered in `MD files/BREADTH_NARROWING_PREREG.md` BEFORE this was written.
 * Four hypotheses, each with its expectation stated in advance:
 *
 *   H1  narrowing -> the S&P falls            (expected null)
 *   H2  narrowing -> the S&P runs wider       (possible; Dispersion found this at 20d)
 *   H3  narrowing -> the spread reverts       (genuinely unknown)
 *   H4  narrowing -> the rotation continues   (genuinely unknown)
 *
 * The guards that matter, all fixed in advance:
 *   - the signal is scored on data up to i only, and the forward window starts at i+1
 *   - events de-clustered 20 sessions apart, because overlapping 20-session windows are
 *     not independent and counting them inflates every n
 *   - the control is every OTHER de-clustered session, so "stocks usually go up" cannot
 *     be read as an edge
 *   - MIN_EVENTS = 15, below which the answer is UNTESTABLE and no verdict is issued.
 *     A near-empty control set produced a false "null" on this desk before.
 *
 * Usage:  node analysis/breadth_narrowing_study.mjs [path-to-drill-series.json]
 */
import fs from 'node:fs';
import { BOARD, scoreSeries } from '../js/marketScan.js';

const API = 'https://macrofxmodel-production.up.railway.app/api/drill-series';

/**
 * The bundle only carries six years, which gives SEVEN de-clustered events at the
 * pre-registered gate — below the floor, so the question is unanswerable from it. RSP
 * has traded since 2003 and Yahoo's chart endpoint is keyless, so the long history is
 * free. The five series this study needs are pulled directly and put on a shared date
 * spine; everything downstream is unchanged.
 */
const YF = { rsp: 'RSP', spy: 'SPY', spx: '^GSPC', r2k: '^RUT', nq: '^IXIC' };
async function longBundle() {
  const got = {};
  for (const [key, sym] of Object.entries(YF)) {
    const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=25y&interval=1d`;
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error(`${sym} HTTP ${r.status}`);
    const j = await r.json(), res = j?.chart?.result?.[0];
    const ts = res?.timestamp ?? [], cl = res?.indicators?.adjclose?.[0]?.adjclose ?? res?.indicators?.quote?.[0]?.close ?? [];
    const m = new Map();
    for (let i = 0; i < ts.length; i++) if (Number.isFinite(cl[i])) m.set(new Date(ts[i] * 1000).toISOString().slice(0, 10), cl[i]);
    got[key] = m;
    process.stderr.write(`  ${sym}: ${m.size} sessions ${[...m.keys()][0]} → ${[...m.keys()].at(-1)}
`);
  }
  // INTERSECTION, not union. A union spine leaves the newest date null for whichever
  // series settled last, and reading the final index then empties the study silently —
  // the trap this repo has already been bitten by on the drill-series bundle.
  const dates = [...got.rsp.keys()].filter(d => Object.values(got).every(m => m.has(d))).sort();
  const series = Object.fromEntries(Object.keys(YF).map(k => [k, dates.map(d => got[k].get(d))]));
  return { dates, series, from: dates[0], to: dates.at(-1), long: true };
}

const SRC = process.argv[2];
const B = SRC === '--long' ? await longBundle()
  : SRC ? JSON.parse(fs.readFileSync(SRC, 'utf8'))
  : await (await fetch(API)).json();
if (!B?.dates?.length) { console.error('no bundle'); process.exit(1); }

const SPEC = BOARD.find(s => s.key === 'eqwt');
const Z_GATE = 1.8, GAP = 20, MIN_EVENTS = 15, HORIZONS = [5, 20];
const S = B.series, N = B.dates.length;
const at = (k, i) => (i >= 0 && i < N) ? S[k]?.[i] ?? null : null;

// ── forward outcomes, all starting at i+1 ───────────────────────────────────
const fwdRet = (k, i, h) => { const a = at(k, i), b = at(k, i + h); return (a && b) ? (b / a - 1) * 100 : null; };
/** Realised range: the standard deviation of daily returns over the window, annual-free. */
function fwdVol(k, i, h) {
  const r = [];
  for (let j = i + 1; j <= i + h; j++) { const a = at(k, j - 1), b = at(k, j); if (a && b) r.push(Math.log(b / a)); }
  if (r.length < Math.floor(h * 0.6)) return null;
  const m = r.reduce((s, v) => s + v, 0) / r.length;
  return Math.sqrt(r.reduce((s, v) => s + (v - m) ** 2, 0) / r.length) * 100;
}
/** The spread's own forward change, in points — H3's reversion test. */
const fwdSpread = (i, h) => {
  const a = fwdRet('rsp', i, h), b = fwdRet('spy', i, h);
  return (a == null || b == null) ? null : a - b;
};
const fwdRota = (i, h) => {
  const a = fwdRet('r2k', i, h), b = fwdRet('nq', i, h);
  return (a == null || b == null) ? null : a - b;
};

// ── score every session, then split into signal and control ─────────────────
const rows = [];
for (let i = 400; i < N - Math.max(...HORIZONS) - 1; i++) {
  const sc = scoreSeries(B, SPEC, i);
  if (!sc || !Number.isFinite(sc.z)) continue;
  const o = { i, date: B.dates[i], z: sc.z, change: sc.change };
  for (const h of HORIZONS) {
    o[`spx${h}`] = fwdRet('spx', i, h);
    o[`vol${h}`] = fwdVol('spx', i, h);
    o[`spread${h}`] = fwdSpread(i, h);
    o[`rota${h}`] = fwdRota(i, h);
  }
  rows.push(o);
}

/** Keep only events at least GAP sessions apart — the first of each cluster. */
function decluster(list) {
  const out = []; let last = -Infinity;
  for (const r of list) if (r.i - last >= GAP) { out.push(r); last = r.i; }
  return out;
}

const narrow  = decluster(rows.filter(r => r.z <= -Z_GATE));
const broad   = decluster(rows.filter(r => r.z >= Z_GATE));
const control = decluster(rows.filter(r => Math.abs(r.z) < Z_GATE));

// ── block bootstrap on the DIFFERENCE from control ──────────────────────────
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
function boot(sig, ctl, reps = 1000, block = 10) {
  if (sig.length < 2 || ctl.length < 2) return null;
  const d = [];
  for (let r = 0; r < reps; r++) {
    const pick = src => { const o = []; while (o.length < src.length) { const s = Math.floor(Math.random() * src.length); for (let k = 0; k < block && o.length < src.length; k++) o.push(src[(s + k) % src.length]); } return o; };
    d.push(mean(pick(sig)) - mean(pick(ctl)));
  }
  d.sort((a, b) => a - b);
  return { lo: d[Math.floor(reps * 0.025)], hi: d[Math.floor(reps * 0.975)] };
}

function test(label, sig, ctl, field) {
  const s = sig.map(r => r[field]).filter(Number.isFinite);
  const c = ctl.map(r => r[field]).filter(Number.isFinite);
  if (s.length < MIN_EVENTS || c.length < MIN_EVENTS)
    return { label, verdict: 'UNTESTABLE', detail: `${s.length} events vs ${c.length} controls — below the pre-registered floor of ${MIN_EVENTS}` };
  const ms = mean(s), mc = mean(c), ci = boot(s, c);
  const real = ci && ((ci.lo > 0 && ci.hi > 0) || (ci.lo < 0 && ci.hi < 0));
  return { label, n: s.length, nCtl: c.length, signal: +ms.toFixed(3), control: +mc.toFixed(3),
           diff: +(ms - mc).toFixed(3), ci: ci ? [+ci.lo.toFixed(3), +ci.hi.toFixed(3)] : null,
           verdict: real ? 'REAL' : 'NULL' };
}

/** First half vs second half. A result in one half only is not a result. */
function halves(sig, ctl, field) {
  const mid = Math.floor(N / 2);
  const part = (list, lo, hi) => list.filter(r => r.i >= lo && r.i < hi);
  return [[0, mid], [mid, N]].map(([lo, hi], k) => {
    const t = test(`half ${k + 1}`, part(sig, lo, hi), part(ctl, lo, hi), field);
    return t.verdict === 'UNTESTABLE' ? `h${k + 1} ${t.detail.split('—')[0].trim()}` : `h${k + 1} ${t.diff > 0 ? '+' : ''}${t.diff} (n=${t.n})`;
  }).join(' · ');
}

// ── report ──────────────────────────────────────────────────────────────────
console.log(`B1 — does market narrowing predict anything?`);
console.log(`bundle ${B.from} → ${B.to}, ${N} sessions · scored ${rows.length}`);
console.log(`de-clustered ${GAP} apart: NARROW ${narrow.length}, BROAD ${broad.length}, control ${control.length}\n`);

const HS = [
  ['H1  narrowing -> S&P direction', 'spx', 'expected NULL'],
  ['H2  narrowing -> S&P range',     'vol', 'possible — Dispersion found this at 20d'],
  ['H3  narrowing -> spread reverts', 'spread', 'genuinely unknown'],
  ['H4  narrowing -> rotation runs on', 'rota', 'genuinely unknown'],
];
const out = { at: new Date().toISOString(), gate: Z_GATE, gap: GAP, minEvents: MIN_EVENTS, narrow: narrow.length, broad: broad.length, control: control.length, results: [] };

for (const [label, field, prior] of HS) {
  console.log(`${label}   [pre-registered: ${prior}]`);
  for (const h of HORIZONS) {
    const t = test(label, narrow, control, `${field}${h}`);
    if (t.verdict === 'UNTESTABLE') { console.log(`   ${h}d  UNTESTABLE — ${t.detail}`); out.results.push({ h, field, ...t }); continue; }
    console.log(`   ${h}d  signal ${t.signal} vs control ${t.control} → ${t.diff > 0 ? '+' : ''}${t.diff} [${t.ci[0]}, ${t.ci[1]}]  ${t.verdict}   ${halves(narrow, control, `${field}${h}`)}`);
    out.results.push({ h, field, ...t });
  }
  // the mirror, so a result cannot be a one-sided artefact
  for (const h of HORIZONS) {
    const t = test(label, broad, control, `${field}${h}`);
    if (t.verdict !== 'UNTESTABLE') console.log(`   ${h}d  MIRROR (broadening): ${t.diff > 0 ? '+' : ''}${t.diff} [${t.ci[0]}, ${t.ci[1]}]  ${t.verdict}`);
    out.results.push({ h, field, mirror: true, ...t });
  }
  console.log('');
}

// UNTESTABLE IS NOT NULL. An earlier version of this line printed "NULL on every
// hypothesis" off a run where every single test had been skipped for want of events —
// which is how a study with no data ends up in a ledger as a finding. The three
// outcomes are kept apart, and a run that could not be done says so.
const own = out.results.filter(r => !r.mirror);
const real = own.filter(r => r.verdict === 'REAL');
const untestable = own.filter(r => r.verdict === 'UNTESTABLE');
out.verdict = untestable.length === own.length ? 'UNTESTABLE' : real.length ? 'REAL' : 'NULL';
console.log(
  untestable.length === own.length
    ? `VERDICT: UNTESTABLE — ${narrow.length} de-clustered events against a floor of ${MIN_EVENTS}. This is NOT a null: the question was not answered. Re-run with --long for the full RSP history.`
  : real.length
    ? `VERDICT: ${real.length} of ${own.length} tests came back REAL — ${real.map(r => `${r.field}${r.h}d`).join(', ')}${untestable.length ? ` (${untestable.length} untestable)` : ''}`
    : `VERDICT: NULL on every testable hypothesis${untestable.length ? `, with ${untestable.length} of ${own.length} untestable for want of events` : ''}. The narrowing is real and describable; it does not predict.`);

fs.mkdirSync('analysis/output', { recursive: true });
fs.writeFileSync('analysis/output/breadth_narrowing.json', JSON.stringify(out, null, 2));
console.log('\nwritten to analysis/output/breadth_narrowing.json');
