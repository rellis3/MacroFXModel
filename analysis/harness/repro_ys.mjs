/**
 * Reproduction 2 of 2 for the harness "done when" (forge/HARNESS_REGISTRY_PREREG.md Part A):
 * `yield-spread-sleeve` (MD files/YIELD_SPREAD_STRATEGY.md, banked 2026-07-17).
 *
 * Expected, written before running: still PASS — OOS net mean per day > 0 with p < 0.05,
 * PF > 1, Sharpe in the neighbourhood of the banked ~1.1, the 12-cell grid a plateau.
 *
 * The sleeve's own inputs, now in the store (registered 2026-10-17 for this run):
 *   US leg       y2m_usd = FRED GS2 (monthly average, what js/zscoreSpreadEngine.js uses),
 *                vintage asof — the original modelled this as a +2-day lag
 *   foreign leg  the engine's ZSCORE_PAIRS quoteSeries: rate_on_de / rate_on_jp / rate_on_ca
 *                (OECD call-money, vintage asof), rate3m_aud, rate3m_chf (3m interbank,
 *                vintage asof), rate3m_gbp (Bank Rate, fixed_lag:1 month) — the original
 *                modelled all of these as a +45-day lag; the store uses when FRED/BoE
 *                actually published, which is the honest version of the same idea
 *   z            calendar-day grid with forward fill, population sd, window in CALENDAR
 *                days, warm-up min(window, 30) — buildRollingZSeries exactly
 *   trade        enter |z| ≥ entry in the z-direction oriented by USD role (yieldSpreadCore
 *                directionFromZ/resolveInverted), exit |z| ≤ 1.5 or 20 trading days, flat size
 *   universe     the six original pairs; sample 2015-01-01 → 2026-10-16; the original split
 *                60/40 by trade dates — here isEnd = 2021-07-01 (≈ the 60% point in time)
 *   cells        the validated cell (2.0 / 126) plus the registered 12-cell grid
 *                (entry 2.0–2.75 × window 90/126/252) and a DGS2-leg variant of the
 *                validated cell; tuned: true so PBO runs across the grid
 *
 * What differs from the original and is NOT hidden: vol-targeted sizing (the original was
 * flat 1× notional — Sharpe is scale-free, PF and win rate are not exactly), measured
 * 22:00 UTC spreads instead of a flat 0.02%, carry accrued from the 3m legs (the original
 * had none), close-to-close daily marks (same as the original).
 */
import { runStudy } from '../../js/harness/runStudy.mjs';
import { directionFromZ, resolveInverted } from '../../js/yieldSpreadCore.js';
import { usdRole } from '../../js/macroDirectionCore.js';

// TENOR=10 re-runs the 10Y sleeve (MD files/MULTI_SPREAD_SLEEVE.md): US leg DGS10 daily (y10_usd, close+1h — the
// original's own daily series, so its +2d was merely conservative), foreign legs the OECD IRLTLT01 monthly series
// in multiSpreadCore.js, which are the store's y10_* exactly.
const TENOR = process.env.TENOR === '10' ? 10 : 2;
const FOREIGN = TENOR === 10
  ? { eurusd: 'y10_eur', usdjpy: 'y10_jpy', usdcad: 'y10_cad', audusd: 'y10_aud', usdchf: 'y10_chf', gbpusd: 'y10_gbp' }
  : { eurusd: 'rate_on_de', usdjpy: 'rate_on_jp', usdcad: 'rate_on_ca', audusd: 'rate3m_aud', usdchf: 'rate3m_chf', gbpusd: 'rate3m_gbp' };
const US_LEG = TENOR === 10 ? 'y10_usd' : 'y2m_usd';
const PAIRS = Object.keys(FOREIGN);
const Z_EXIT = 1.5, MAX_HOLD = 20;

const addDay = d => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };

// Per (cell, pair) state: the calendar-day spread grid and the open position.
const state = new Map();
function st(cell, inst) {
  const k = `${cell.key}|${inst}`;
  if (!state.has(k)) state.set(k, { lastDay: null, spreads: [], pos: 0, holdDays: 0, inverted: resolveInverted(usdRole(inst)) });
  return state.get(k);
}

import { openStore } from '../../js/harness/features.mjs';
const _store = await openStore();
const LATEST = {};   // id -> [{date, value}] latest vintage per date, read ONCE outside the point-in-time cut (control only)
async function latest(id) { return (LATEST[id] ??= (await _store.series(id)).map(r => ({ date: String(r.date), value: Number(r.value) }))); }
function valueKnownUnderFixedLag(rows, day, lagDays) {
  // the original: value dated D (1st of month) treated as known from D + lag, forward-filled
  let v = null;
  for (const r of rows) { const t = new Date(r.date + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + lagDays); if (t.toISOString().slice(0, 10) <= day) v = r.value; else break; }
  return v;
}
async function spreadOn(f, day, usId, forId, cell) {
  const t = `${day}T22:00:00Z`;
  const us = cell.usLag != null ? valueKnownUnderFixedLag(await latest(usId), day, cell.usLag) : (await f.at(usId, t))?.value;
  const fo = cell.forLag != null ? valueKnownUnderFixedLag(await latest(forId), day, cell.forLag) : (await f.at(forId, t))?.value;
  return (us != null && fo != null) ? Number(us) - Number(fo) : null;
}

const grid = [];
for (const entry of [2.0, 2.25, 2.5, 2.75]) for (const window of [90, 126, 252]) grid.push({ key: `gs2-${entry}-${window}`, entry, window, usLeg: US_LEG });
if (TENOR === 2) grid.push({ key: 'dgs2-2-126', entry: 2.0, window: 126, usLeg: 'y2_usd' });
// CONTROLS — the original engine's lag assumptions (US +2d, foreign +45d from the 1st of the month, latest
// vintages). These bypass the point-in-time cut on purpose: if the harness reproduces the banked result
// under the ORIGINAL assumptions, the harness is right and whatever the honest cells lose is the assumption.
const controls = [
  { key: 'ctl-origlags-2-126', entry: 2.0, window: 126, usLeg: 'y2m_usd', usLag: 2, forLag: 45 },
  { key: 'ctl-uslag-only-2-126', entry: 2.0, window: 126, usLeg: 'y2m_usd', usLag: 2 },
  { key: 'ctl-forlag-only-2-126', entry: 2.0, window: 126, usLeg: 'y2m_usd', forLag: 45 },
];
// SAMPLE=long: the ys-long-confirm era (2004-2014) with the US leg on HONEST GS2 vintages (ALFRED has them from 2000)
// and the foreign legs on the registered fixed_lag:45 backcast (forge/FX_FACTOR_STACK_ADDENDUM_A.md — the vintage floor
// is 2013-06-03). Two cells: honest-US, and the original's +2d US assumption, to see which one ys-long's PF 1.28 was.
const longCells = [
  { key: 'long-honestUS-forlag45-2-126', entry: 2.0, window: 126, usLeg: 'y2m_usd', forLag: 45 },
  { key: 'long-origlags-2-126', entry: 2.0, window: 126, usLeg: 'y2m_usd', usLag: 2, forLag: 45 },
];
const LONG = process.env.SAMPLE === 'long';
const CELLS = LONG ? longCells : process.env.CELLS === 'ctl' ? controls : process.env.CELLS === 'all' ? [...grid, ...controls] : grid;
const ID = LONG ? 'ys-long-honest-harness' : TENOR === 10 ? 'multi-spread-sleeve-harness' : process.env.CELLS === 'ctl' ? 'yield-spread-sleeve-harness-controls' : 'yield-spread-sleeve-harness';

const res = await runStudy({
  id: ID,
  doc: LONG ? 'forge/YS_LONG_CONFIRM_PREREG.md' : TENOR === 10 ? 'MD files/MULTI_SPREAD_SLEEVE.md' : 'MD files/YIELD_SPREAD_STRATEGY.md',
  domain: 'macro',
  claim: 'The US-vs-foreign 2-year yield spread, z-scored, mean-reverts, and FX follows it',
  universe: PAIRS,
  horizonDays: 20,
  rebalanceDays: 1,
  sample: LONG ? { from: '2003-01-01', to: '2014-12-31', isEnd: '2004-01-01' } : { from: '2015-01-01', to: '2026-10-16', isEnd: '2021-07-01' },
  primary: 'pnl',
  tuned: true,
  cells: CELLS,
  signal: async (f, t, inst, cell) => {
    const s = st(cell, inst);
    const day = t.slice(0, 10);
    // extend the calendar-day grid up to today (weekends and holidays included, forward-filled by at())
    let d = s.lastDay ? addDay(s.lastDay) : (() => { const x = new Date(day + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - cell.window - 14); return x.toISOString().slice(0, 10); })();
    for (; d <= day; d = addDay(d)) { const v = await spreadOn(f, d, cell.usLeg, FOREIGN[inst], cell); if (v != null) s.spreads.push(v); }
    s.lastDay = day;
    const win = s.spreads.slice(-cell.window);
    if (win.length < Math.min(cell.window, 30)) return { pos: 0, score: null };
    const v = win[win.length - 1];
    const m = win.reduce((a, b) => a + b, 0) / win.length;
    const sd = Math.sqrt(Math.max(0, win.reduce((a, b) => a + b * b, 0) / win.length - m * m));
    if (!(sd > 1e-9)) return { pos: 0, score: null };
    const z = (v - m) / sd, absZ = Math.abs(z);
    if (s.pos !== 0) {
      s.holdDays++;
      if (absZ <= Z_EXIT || s.holdDays >= MAX_HOLD) { s.pos = 0; s.holdDays = 0; }
    }
    if (s.pos === 0 && absZ >= cell.entry) { s.pos = directionFromZ(z, s.inverted) === 'LONG' ? 1 : -1; s.holdDays = 0; }
    return { pos: s.pos, score: s.inverted ? -z : z };
  },
}, { log: m => process.stderr.write(m + '\n') });

const v = res.cells.find(c => c.key === 'gs2-2-126') ?? res.cells[0];
const banked = { trades: 109, win: 0.63, pf: 2.19, sharpe: 1.14, note: '2.0/126, OOS 60/40 by trade dates, 0.02% flat cost, flat size' };
console.log(JSON.stringify({
  id: res.id,
  validatedCell: { key: v.key, oos: v.pnl, dsr: v.dsr, primary: v.primary, legs: Object.fromEntries(Object.entries(v.legs).map(([k, l]) => [k, { trades: l.tradesOos, win: l.winOos, pf: l.pfOos, sharpe: l.sharpeOos }])) },
  dgs2Variant: (() => { const c = res.cells.find(c => c.key === 'dgs2-2-126'); return c ? { sharpe: c.pnl.sharpeOos, pf: c.pnl.pfOos, p: c.pnl.pValueOos, trades: c.pnl.tradesOos } : null; })(),
  controls: res.cells.filter(c => c.key.startsWith('ctl-') || c.key.startsWith('long-')).map(c => ({ key: c.key, sharpe: c.pnl.sharpeOos, pf: c.pnl.pfOos, win: c.pnl.winOos, trades: c.pnl.tradesOos, p: c.pnl.pValueOos, years: c.pnl.perYearOosPct, legs: Object.fromEntries(Object.entries(c.legs).map(([k, l]) => [k, l.pfOos])) })),
  grid: res.cells.filter(c => c.key.startsWith('gs2-')).map(c => ({ key: c.key, sharpe: c.pnl.sharpeOos, pf: c.pnl.pfOos, trades: c.pnl.tradesOos, p: c.pnl.pValueOos, fdr: c.primary.passesFdr, dsr: c.dsr.dsr })),
  fdr: res.fdr, pbo: res.pbo, costs: res.costs, dependence: res.dependence, notes: res.notes, banked,
  verdict: {
    stillPass: v.pnl.pValueOos < 0.05 && v.pnl.meanDailyOos > 0 && v.pnl.pfOos > 1,
    gridAllProfitable: res.cells.filter(c => c.key.startsWith('gs2-')).every(c => c.pnl.pfOos > 1),
  },
}, null, 1));
