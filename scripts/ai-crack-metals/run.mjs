#!/usr/bin/env node
/**
 * ai-crack-metals — after the AI trade cracks (SMH/SPY 20-session change in its rolling
 * trailing-504 bottom decile), do gold and silver outperform their ordinary 20-session drift?
 *
 * Pre-registered in forge/AI_CRACK_METALS_PREREG.md, committed BEFORE this file existed.
 * Register row: plans/RESEARCH_REGISTER.md → ai-crack-metals. Seed 20261019.
 *
 * Design copied from analysis/breadth_tilt_semis_study.mjs (same setup definition, same
 * constants) with the OUTCOME swapped to GLD / SLV total return. Yahoo adjusted closes,
 * shared spine 2006-04-28 → 2026-08-21 (SLV's first print → the lockbox cut).
 *
 *   node scripts/ai-crack-metals/run.mjs            # fetches Yahoo, writes analysis/output/ai-crack-metals/
 *   node scripts/ai-crack-metals/run.mjs <json>     # re-run from a saved {TICKER:{date:close}} file
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32 } from '../../js/statsCore.js';
import { pFromCI, holm } from '../../js/preregStats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'analysis', 'output', 'ai-crack-metals');

// ── pre-registered constants — match the prereg exactly ───────────────────────
const SEED = 20261019;
const LOOKBACK = 20, WINDOW = 504, DECLUSTER = 20, MIN_EVENTS = 20;
const HORIZONS = [20, 60];           // 20 scored, 60 descriptive
const BLOCK = 20, REPS = 2000;
const SPINE_FROM = '2006-04-28', SPINE_TO = '2026-08-21';   // lockbox cut
const SPLIT_AT = '2016-06-24';
const PASS_BAR = { GLD: 2.0, SLV: 3.5 };                      // % excess over 20 sessions (prereg §5)
const METALS = ['GLD', 'SLV'];

// ── data ──────────────────────────────────────────────────────────────────────
async function yahooAdj(ticker) {
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=30y&interval=1d`;
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${ticker} HTTP ${r.status}`);
  const j = await r.json(), res = j?.chart?.result?.[0];
  const ts = res?.timestamp ?? [], cl = res?.indicators?.adjclose?.[0]?.adjclose ?? res?.indicators?.quote?.[0]?.close ?? [];
  const m = {}; for (let i = 0; i < ts.length; i++) if (Number.isFinite(cl[i])) m[new Date(ts[i] * 1000).toISOString().slice(0, 10)] = +cl[i].toFixed(4);
  return m;
}
const src = process.argv[2];
const RAW = src ? JSON.parse(fs.readFileSync(src, 'utf8')) : Object.fromEntries(await Promise.all(['SMH', 'SPY', 'GLD', 'SLV'].map(async t => [t, await yahooAdj(t)])));
const dates = Object.keys(RAW.SMH).filter(d => RAW.SPY[d] && RAW.GLD[d] && RAW.SLV[d] && d >= SPINE_FROM && d <= SPINE_TO).sort();
const S = Object.fromEntries(['SMH', 'SPY', 'GLD', 'SLV'].map(t => [t, dates.map(d => RAW[t][d])]));
console.log(`spine ${dates.length} sessions ${dates[0]} -> ${dates.at(-1)}`);

// ── setup: SMH/SPY 20-session change, rolling decile of the trailing 504 ──────
const ratio = S.SMH.map((v, i) => v / S.SPY[i]);
const chg = ratio.map((v, i) => i < LOOKBACK ? null : (v / ratio[i - LOOKBACK] - 1) * 100);
const quantile = (a, q) => { const s = a.filter(Number.isFinite).slice().sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) * q)] : null; };
function pick(side) {
  const hits = [];
  for (let i = WINDOW; i < dates.length; i++) {
    if (!Number.isFinite(chg[i])) continue;
    const thr = quantile(chg.slice(i - WINDOW, i), side === 'crack' ? 0.10 : 0.90);
    if (thr == null) continue;
    if (side === 'crack' ? chg[i] <= thr : chg[i] >= thr) hits.push(i);
  }
  const out = []; let last = -Infinity;
  for (const i of hits) if (i - last >= DECLUSTER) { out.push(i); last = i; }
  return out;
}
const crack = pick('crack'), rip = pick('rip');
console.log(`setups: crack ${crack.length}  rip (mirror) ${rip.length}  (de-clustered ${DECLUSTER})`);

// ── outcome: metal total return close D -> close D+h, % ──────────────────────
const ret = (t, i, h) => (i + h < dates.length) ? +((S[t][i + h] / S[t][i] - 1) * 100).toFixed(4) : null;

// ── stats: seeded block bootstrap on the difference from control ─────────────
const rng = mulberry32(SEED);
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const draw = (x, b) => { const o = []; while (o.length < x.length) { const i = Math.floor(rng() * x.length); for (let k = 0; k < b && o.length < x.length; k++) o.push(x[(i + k) % x.length]); } return o; };
function bootDiff(ev, ctl) {
  if (ev.length < MIN_EVENTS) return { untestable: true, n: ev.length, nCtl: ctl.length };
  const d = []; for (let r = 0; r < REPS; r++) d.push(mean(draw(ev, BLOCK)) - mean(draw(ctl, BLOCK)));
  d.sort((p, q) => p - q);
  const lo = d[Math.floor(REPS * 0.025)], hi = d[Math.floor(REPS * 0.975)];
  return { n: ev.length, nCtl: ctl.length, ev: +mean(ev).toFixed(3), ctl: +mean(ctl).toFixed(3), diff: +(mean(ev) - mean(ctl)).toFixed(3), lo: +lo.toFixed(3), hi: +hi.toFixed(3), clearsZero: lo > 0 };
}

const result = { id: 'ai-crack-metals', verdict: null, ranAt: new Date().toISOString(), seed: SEED, B: REPS, prereg: 'forge/AI_CRACK_METALS_PREREG.md', preregCommit: process.env.PREREG_COMMIT ?? null, branch: 'main',
  spine: { from: dates[0], to: dates.at(-1), n: dates.length }, setups: { crack: crack.length, rip: rip.length }, cells: [], descriptive: {}, byYear: {} };
for (const i of crack) { const y = dates[i].slice(0, 4); result.byYear[y] = (result.byYear[y] ?? 0) + 1; }

const splitIdx = dates.findIndex(d => d >= SPLIT_AT);
for (const H of HORIZONS) {
  const shadow = new Set(); for (const i of crack) for (let k = i - H; k <= i + H; k++) shadow.add(k);
  const ctlIdx = []; for (let i = 0; i < dates.length - H; i++) if (!shadow.has(i)) ctlIdx.push(i);
  for (const t of METALS) {
    const ctl = ctlIdx.map(i => ret(t, i, H)).filter(v => v != null);
    const ev = crack.map(i => ret(t, i, H)).filter(v => v != null), mv = rip.map(i => ret(t, i, H)).filter(v => v != null);
    const main = bootDiff(ev, ctl), mirror = bootDiff(mv, ctl);
    const h1 = bootDiff(crack.filter(i => i < splitIdx).map(i => ret(t, i, H)).filter(v => v != null), ctlIdx.filter(i => i < splitIdx).map(i => ret(t, i, H)).filter(v => v != null));
    const h2 = bootDiff(crack.filter(i => i >= splitIdx).map(i => ret(t, i, H)).filter(v => v != null), ctlIdx.filter(i => i >= splitIdx).map(i => ret(t, i, H)).filter(v => v != null));
    const line = (tag, b) => b.untestable ? `${tag}: UNTESTABLE (${b.n} < ${MIN_EVENTS})` : `${tag}: ${b.ev >= 0 ? '+' : ''}${b.ev}% vs ${b.ctl}% ctl → excess ${b.diff >= 0 ? '+' : ''}${b.diff} [${b.lo}, ${b.hi}] n=${b.n}`;
    console.log(`\n${t} H=${H}  ${line('CRACK', main)}\n        ${line('RIP  ', mirror)}\n        ${line('half1', h1)}\n        ${line('half2', h2)}`);
    const cell = { name: `${t}-${H}`, metal: t, horizon: H, scored: H === 20, main, mirror, halves: [h1, h2] };
    if (H === 20) {
      // THE GATE (conjunctive): lower bound > 0, both halves positive, mirror not half the size same sign
      const halvesPos = !h1.untestable && !h2.untestable && h1.diff > 0 && h2.diff > 0;
      const mirrorOk = mirror.untestable || !(Math.sign(mirror.diff) === Math.sign(main.diff) && Math.abs(mirror.diff) >= Math.abs(main.diff) * 0.5);
      cell.gate = { clearsZero: !!main.clearsZero, halvesPos, mirrorOk, pass: !!main.clearsZero && halvesPos && mirrorOk };
      cell.passBar = PASS_BAR[t];
      cell.p = main.untestable ? null : pFromCI({ est: main.diff, lo: main.lo, hi: main.hi });
      // UNDERPOWERED vs NULL: the interval must EXCLUDE the pass bar for a null (results-and-banking rule)
      cell.verdict = main.untestable ? 'underpowered' : cell.gate.pass ? 'validated' : (main.hi < PASS_BAR[t] ? 'null' : 'underpowered');
      result.cells.push(cell);
    } else result.descriptive[`${t}-${H}`] = cell;
  }
}
// Holm across the two scored cells (pFromCI normal approximation, stated in the prereg)
const ps = result.cells.map(c => c.p).filter(p => p != null);
if (ps.length) { const hol = holm(ps, 0.05); result.cells.filter(c => c.p != null).forEach((c, k) => { c.holm = hol[k]; }); }
result.verdict = result.cells.some(c => c.verdict === 'validated') ? 'validated' : result.cells.every(c => c.verdict === 'null') ? 'null' : 'underpowered';
console.log(`\nGATE per cell: ${result.cells.map(c => `${c.name} ${JSON.stringify(c.gate)} → ${c.verdict} (p≈${c.p?.toFixed(3)})`).join('\n              ')}`);
console.log(`VERDICT (study): ${result.verdict.toUpperCase()}`);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(result, null, 1));
if (!src) fs.writeFileSync(path.join(OUT_DIR, 'data_yahoo_adj.json'), JSON.stringify(RAW));
console.log('written', path.relative(ROOT, path.join(OUT_DIR, 'results.json')));
