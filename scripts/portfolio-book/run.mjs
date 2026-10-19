/**
 * portfolio-book — the scored run for forge/PORTFOLIO_BOOK_PREREG.md.
 *
 *   node scripts/portfolio-book/run.mjs
 *
 * Runs every price sleeve through js/harness/runStudy.mjs (vol target, measured costs,
 * carry, date-block bootstrap, DSR — fixed there), builds the vol-premium proxy from the
 * store's VIX and SPX500 closes, then scores the book with js/portfolioBook.js — the same
 * module the page uses. Writes analysis/output/portfolio-book/:
 *   book.json        sleeve legs + trades for the page (contributions as ints, 1e-8 units)
 *   results.json     every cell's standard score, the gate, correlations
 *   trades_P1.csv    P1 trades in the owner's import template
 *   trades_P2.csv    P2 trades in the same template
 * Window ends 2026-08-21 (lockbox); nothing after it is scored or written.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../../js/harness/features.mjs';
import { runStudy } from '../../js/harness/runStudy.mjs';
import { ewmaVolSeries } from '../../js/fxFactorSignals.js';
import { BOOK, UNIT, laggedScale, buildBook, scoreStream, gate, sleeveCorrelation, bookTrades, toCsv, P1_WEIGHTS, P2_WEIGHTS, stdev } from '../../js/portfolioBook.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'analysis', 'output', 'portfolio-book', ...(process.env.FOLD === '0' ? ['registered'] : []));   // FOLD=0: the registered run, kept beside the corrected one
const SAMPLE = { from: '2008-01-02', to: '2026-08-21', isEnd: BOOK.isEnd };
const log = m => process.stderr.write(m + '\n');

const FX = ['eurusd', 'gbpusd', 'audusd', 'nzdusd', 'usdcad', 'usdchf', 'usdjpy'];
const ALL = [...FX, 'xauusd', 'nas100', 'spx500'];
const CORE = ['nas100', 'spx500', 'xauusd'];
const LABEL = { eurusd: 'EURUSD', gbpusd: 'GBPUSD', audusd: 'AUDUSD', nzdusd: 'NZDUSD', usdcad: 'USDCAD', usdchf: 'USDCHF', usdjpy: 'USDJPY', xauusd: 'XAUUSD', nas100: 'NAS100', spx500: 'SPX500' };
const USD_BASE = new Set(['usdcad', 'usdchf', 'usdjpy']);
// analysis/fomc_event_study/stage1_event_study.py FOMC_DATES + the two 2026 decisions inside the window (prereg §3)
const FOMC = ['2016-01-27', '2016-03-16', '2016-04-27', '2016-06-15', '2016-07-27', '2016-09-21', '2016-11-02', '2016-12-14', '2017-02-01', '2017-03-15', '2017-05-03', '2017-06-14', '2017-07-26', '2017-09-20', '2017-11-01', '2017-12-13', '2018-01-31', '2018-03-21', '2018-05-02', '2018-06-13', '2018-08-01', '2018-09-26', '2018-11-08', '2018-12-19', '2019-01-30', '2019-03-20', '2019-05-01', '2019-06-19', '2019-07-31', '2019-09-18', '2019-10-30', '2019-12-11', '2020-01-29', '2020-04-29', '2020-06-10', '2020-07-29', '2020-09-16', '2020-11-05', '2020-12-16', '2021-01-27', '2021-03-17', '2021-04-28', '2021-06-16', '2021-07-28', '2021-09-22', '2021-11-03', '2021-12-15', '2022-01-26', '2022-03-16', '2022-05-04', '2022-06-15', '2022-07-27', '2022-09-21', '2022-11-02', '2022-12-14', '2023-02-01', '2023-03-22', '2023-05-03', '2023-06-14', '2023-07-26', '2023-09-20', '2023-11-01', '2023-12-13', '2024-01-31', '2024-03-20', '2024-05-01', '2024-06-12', '2024-07-31', '2024-09-18', '2024-11-07', '2024-12-18', '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18', '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10', '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29'];
const FOMC_START = '2016-01-27';

const store = await openStore();
const day = t => t.slice(0, 10);

// ── gate G: VIX > VIX3M at the decision close ──
async function inverted(f) {
  const [v, v3] = await Promise.all([f.at('vix'), f.at('vix3m')]);
  if (!v || !v3) return false;   // VIX3M starts 2007-12-04, before the window
  return Number(v.value) > Number(v3.value);
}

// ── FOMC hold days per instrument: the decision day's close + the next 4 closes (5 sessions held) ──
const fomcHold = {};
for (const inst of FX) {
  const dates = (await store.series(`px_d1_${inst}`, { from: '2015-06-01', to: SAMPLE.to })).map(r => String(r.date));
  const hold = new Set();
  for (const fd of FOMC) { const i = dates.indexOf(fd); if (i < 0) { log(`FOMC ${fd} not a ${inst} date`); continue; } for (let k = 0; k < 5 && i + k < dates.length; k++) hold.add(dates[i + k]); }
  fomcHold[inst] = hold;
}

const LOOKBACKS = [21, 63, 126, 252];
const SLEEVES = [
  { id: 'S1', name: 'Core beta', universe: CORE, rebalance: 'weekly', signal: async () => 1 },
  { id: 'S1g', name: 'Core beta (VIX-gated)', universe: CORE, rebalanceDays: 1, signal: async f => (await inverted(f) ? 0 : 1), book: true },
  {
    id: 'S2', name: 'Trend (21/63/126/252)', universe: ALL, rebalance: 'weekly', book: true,
    signal: async (f, t, inst) => {
      const rows = await f.series(`px_d1_${inst}`, { from: `${Number(t.slice(0, 4)) - 2}-01-01` });
      const c = rows.map(r => Number(r.value)), n = c.length;
      if (n < 253 || String(rows[n - 1].date) !== day(t)) return null;
      return LOOKBACKS.reduce((s, L) => s + Math.sign(c[n - 1] / c[n - 1 - L] - 1), 0) / LOOKBACKS.length;
    },
  },
  ...['S3', 'S3g'].map(id => ({
    id, name: id === 'S3' ? 'Carry' : 'Carry (VIX-gated)', universe: FX, ...(id === 'S3' ? { rebalance: 'weekly' } : { rebalanceDays: 1 }), book: id === 'S3g',
    signal: async (f, t, inst) => {
      if (id === 'S3g' && await inverted(f)) return 0;
      const [b, q] = await Promise.all([f.at(`rate3m_${inst.slice(0, 3)}`), f.at(`rate3m_${inst.slice(3)}`)]);
      if (!b || !q) return null;
      return Math.sign(Number(b.value) - Number(q.value));
    },
  })),
  {
    id: 'S4', name: 'FOMC USD drift (5 sessions)', universe: FX, rebalanceDays: 1, book: true, start: FOMC_START,
    signal: async (f, t, inst) => (fomcHold[inst].has(day(t)) ? (USD_BASE.has(inst) ? 1 : -1) : 0),
  },
];

// ── run the price sleeves through the harness ──
const runs = {};
for (const s of SLEEVES) {
  log(`harness ${s.id}`);
  runs[s.id] = await runStudy({
    id: `portfolio-book-${s.id}`, doc: 'forge/PORTFOLIO_BOOK_PREREG.md', domain: 'portfolio', claim: s.name,
    universe: s.universe, horizonDays: s.rebalance === 'weekly' ? 5 : 1, ...(s.rebalance ? { rebalance: s.rebalance } : { rebalanceDays: s.rebalanceDays }),
    sample: SAMPLE, primary: 'pnl', cells: [{ key: s.id }], signal: s.signal,
  }, { store, keepPaths: true, log });
}

// ── one date grid: every trading date any leg has inside the window ──
const dateSet = new Set();
for (const s of SLEEVES) for (const p of Object.values(runs[s.id].paths[s.id])) for (const d of p.dates) if (d >= SAMPLE.from && d <= SAMPLE.to) dateSet.add(d);
const spxRows = await store.series('px_d1_spx500', { from: '2006-01-01', to: SAMPLE.to });
for (const r of spxRows) if (r.date >= SAMPLE.from) dateSet.add(String(r.date));
const dates = [...dateSet].sort();
const di = new Map(dates.map((d, i) => [d, i]));
const N = dates.length;

/** Harness paths → sleeve legs (contribution = leg net / legs with a row that day, as runStudy's portfolio) + trades. */
function sleeveFromPaths(s) {
  const P = runs[s.id].paths[s.id];
  const insts = Object.keys(P);
  const nLegs = new Array(N).fill(0);
  for (const inst of insts) for (const d of P[inst].dates) { const k = di.get(d); if (k != null) nLegs[k]++; }
  const legs = [], trades = [];
  insts.forEach((inst, li) => {
    const p = P[inst];
    const c = new Array(N).fill(0);
    const posAt = new Array(N).fill(null), volAt = new Array(N).fill(NaN);
    p.dates.forEach((d, i) => { const k = di.get(d); if (k == null) return; c[k] = Math.round((p.net[i] / nLegs[k]) * UNIT); posAt[k] = p.pos[i]; volAt[k] = p.vol[i]; });
    // episodes on the grid: on a date this leg has no row (another leg's holiday), it holds its position
    const legPos = new Array(N).fill(0);
    for (let k = 0; k < N; k++) legPos[k] = posAt[k] ?? (k ? legPos[k - 1] : 0);
    let prev = 0, cur = null;
    for (let k = 0; k < N; k++) {
      const now = legPos[k];
      const opened = prev === 0 && now !== 0, closed = prev !== 0 && now === 0, flipped = prev !== 0 && now !== 0 && Math.sign(prev) !== Math.sign(now);
      if (cur && (closed || flipped)) { cur.x = k; trades.push(cur); cur = null; }
      if (opened || flipped) {
        const v = volAt[k];
        cur = { leg: li, e: k, s: opened ? k : k + 1, dir: Math.sign(now), r: Number.isFinite(v) ? +((Math.abs(now) * v / Math.sqrt(252)) / Math.max(1, nLegs[k])).toPrecision(4) : 0 };
      }
      prev = now;
    }
    if (cur) { cur.x = N - 1; cur.open = true; trades.push(cur); }
    legs.push({ inst, label: LABEL[inst], c });
  });
  const startIdx = s.start ? dates.findIndex(d => d >= s.start) : 0;
  return { id: s.id, name: s.name, startIdx, legs, trades };
}

// ── S5 vol-premium proxy (prereg §3 + A2) ──
async function volPremium(gated) {
  const spx = spxRows.map(r => ({ d: String(r.date), c: Number(r.value) }));
  const c = new Array(N).fill(0);
  const trades = [];
  let on = false, cooldown = 0, cur = null, prevVix = null, prevVix3 = null, prevChg = 0;
  let prevV = null;
  for (let i = 1; i < spx.length; i++) {
    const d = spx[i].d, t = `${d}T22:00:00Z`;
    const vix = Number((await store.at('vix', t))?.value), vix3 = Number((await store.at('vix3m', t))?.value);
    if (!Number.isFinite(vix)) continue;
    const v = (vix / 100) ** 2 / 252;
    const k = di.get(d);
    if (prevV != null && k != null && d >= SAMPLE.from) {
      // P&L for today from the state decided at yesterday's close
      if (on) {
        const r = Math.log(spx[i].c / spx[i - 1].c);
        const pnlV = prevV - r * r + 10 * (prevV - v);
        const nVar = 0.01 / (2 * prevVix);
        const haircut = ((prevVix ** 2) - ((prevVix - 0.5) ** 2)) / 1e4 / 252;
        c[k] = nVar * (pnlV - haircut) * (252 / 21) * 1e4;
      }
    }
    // decision at today's close
    const chg = prevVix ? vix / prevVix - 1 : 0;
    let want = true;
    if (gated) {
      if (chg > 0.20) cooldown = 5;
      else if (cooldown > 0) cooldown = Math.abs(chg) < 0.05 ? cooldown - 1 : 5;
      want = cooldown === 0 && !(Number.isFinite(vix3) && vix > vix3);
    }
    if (k != null && d >= SAMPLE.from) {
      if (want !== on) {
        const nVar = 0.01 / (2 * vix);
        const switchCost = 10 * nVar * (((vix ** 2) - ((vix - 0.5) ** 2)) / 1e4 / 252) * (252 / 21) * 1e4;
        c[k] -= switchCost;
        if (want) cur = { leg: 0, e: k, s: k, dir: -1 };
        else if (cur) { cur.x = k; trades.push(cur); cur = null; }
      }
      on = want;
    } else on = want;
    prevV = v; prevVix = vix; prevVix3 = vix3; prevChg = chg;
  }
  if (cur) { cur.x = N - 1; cur.open = true; trades.push(cur); }
  const rawVol = ewmaVolSeries(c, 60);
  for (const tr of trades) { const v = rawVol[tr.e]; tr.r = Number.isFinite(v) ? +(v / Math.sqrt(252)).toPrecision(4) : 0; }
  return { id: gated ? 'S5g' : 'S5', name: gated ? 'Vol premium proxy (gated)' : 'Vol premium proxy', startIdx: 0, legs: [{ inst: 'spx_var', label: 'SPX500 1M variance (proxy)', c: c.map(x => Math.round(x * UNIT)) }], trades };
}

const sleevesRaw = {};
for (const s of SLEEVES) sleevesRaw[s.id] = sleeveFromPaths(s);
sleevesRaw.S5 = await volPremium(false);
sleevesRaw.S5g = await volPremium(true);

// ── A4 (POST-HOC, data fault): px_d1 FX/gold carry Saturday/Sunday rows 2002-2013. Fold each
//    weekend row into the next weekday so the book has one row per trading day (P&L is kept,
//    annualisation is right). FOLD=0 reproduces the registered run.
const FOLD = process.env.FOLD !== '0';
const isWeekday = d => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w !== 0 && w !== 6; };
const gridDates = FOLD ? dates.filter(isWeekday) : dates;
const gi = new Map(gridDates.map((d, i) => [d, i]));
const remap = new Array(N);
{ let j = gridDates.length - 1; for (let k = N - 1; k >= 0; k--) { if (gi.has(dates[k])) j = gi.get(dates[k]); remap[k] = j; } }   // a weekend row joins the next weekday
function fold(s) {
  if (!FOLD) return s;
  const M = gridDates.length;
  const legs = s.legs.map(l => { const c = new Array(M).fill(0); l.c.forEach((v, k) => { c[remap[k]] += v; }); return { ...l, c }; });
  const trades = s.trades.map(t => ({ ...t, e: remap[t.e], s: remap[t.s ?? t.e + 1], x: remap[t.x] })).filter(t => t.x >= t.e);
  return { ...s, startIdx: remap[s.startIdx] ?? 0, legs, trades };
}
const sleeves = Object.fromEntries(Object.entries(sleevesRaw).map(([k, s]) => [k, fold(s)]));
if (FOLD) { dates.length = 0; dates.push(...gridDates); }   // gridDates IS dates when FOLD=0

// ── score: 8 sleeve cells, P1, P2, mirror (N = 11) ──
const solo = id => buildBook({ dates, sleeves: [sleeves[id]] }, { [id]: 1 });
const bookIds = ['S1g', 'S2', 'S3g', 'S4', 'S5g'];
const data = { dates, sleeves: bookIds.map(id => sleeves[id]) };
const P1 = buildBook(data, P1_WEIGHTS), P2 = buildBook(data, P2_WEIGHTS);
const mirrorData = { dates, sleeves: data.sleeves.map(s => ({ ...s, legs: s.legs.map(l => ({ ...l, c: l.c.map(x => -x) })) })) };
const MIRROR = buildBook(mirrorData, P1_WEIGHTS);

// sleeve-level stream for scoring = the sleeve scaled to 10% on its own (sleeve normalisation)
const streams = {};
for (const id of ['S1', 'S1g', 'S2', 'S3', 'S3g', 'S4', 'S5', 'S5g']) streams[id] = solo(id).sleeves[0].scaled;
streams.P1 = P1.rets; streams.P2 = P2.rets; streams.mirror = MIRROR.rets;
const firstLive = r => r.findIndex(x => x !== 0);
const srP = Object.values(streams).map(r => scoreStream(dates, r, { startIdx: firstLive(r) }).srPeriod).filter(Number.isFinite);
const varTrialSr = stdev(srP, 1) ** 2;
const cells = {};
for (const [id, r] of Object.entries(streams)) { const sc = scoreStream(dates, r, { varTrialSr, startIdx: firstLive(r) }); delete sc.equity; delete sc.eqDates; cells[id] = sc; }
const g = gate(cells.P1);
const corr = sleeveCorrelation(P1);
const harness = Object.fromEntries(SLEEVES.map(s => { const c = runs[s.id].cells[0]; return [s.id, { sharpeOosHarness: c.pnl.sharpeOos, sharpeAllHarness: c.pnl.sharpeAll, grossOos: c.pnl.sharpeGrossOos, costDragAnnBp: c.pnl.costDragAnnBp, carryAnnBp: c.pnl.carryAnnBp, turnoverPerYear: c.pnl.turnoverPerYear, tradesOos: c.pnl.tradesOos, pfOos: c.pnl.pfOos, winOos: c.pnl.winOos, notes: runs[s.id].notes }]; }));

// ── write ──
await mkdir(OUT, { recursive: true });
const names = Object.fromEntries(Object.values(sleeves).map(s => [s.id, s.name]));
await writeFile(path.join(OUT, 'book.json'), JSON.stringify({
  id: 'portfolio-book', builtAt: new Date().toISOString(), weekendFold: FOLD, prereg: 'forge/PORTFOLIO_BOOK_PREREG.md', window: SAMPLE, book: BOOK,
  weights: { P1: P1_WEIGHTS, P2: P2_WEIGHTS }, dates, sleeves: data.sleeves,
  cellScores: cells, names, varTrialSr,
}));
await writeFile(path.join(OUT, 'results.json'), JSON.stringify({
  id: 'portfolio-book', ranAt: new Date().toISOString(), weekendFold: FOLD, prereg: 'forge/PORTFOLIO_BOOK_PREREG.md', seed: BOOK.seed, window: SAMPLE,
  trials: Object.keys(streams).length, varTrialSr, gate: g, cells, correlation: corr, harness, names,
  costs: runs.S2.costs,
}, null, 1));
const tP1 = bookTrades(data, P1), tP2 = bookTrades(data, P2);
await writeFile(path.join(OUT, 'trades_P1.csv'), toCsv(tP1));
await writeFile(path.join(OUT, 'trades_P2.csv'), toCsv(tP2));

const pick = c => ({ sharpe: c.sharpe, cagr: c.cagrPct, vol: c.volPct, mdd: c.maxDdPct, is: c.sharpeIs, oos: c.sharpeOos, halves: c.sharpeHalves, p: c.pValue, dsr: c.dsr, t: c.tStat, skew: c.skew, from: c.from });
console.log(JSON.stringify({ gate: g, cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, pick(v)])), corr: corr.matrix, trades: { P1: tP1.length, P2: tP2.length }, harness: Object.fromEntries(Object.entries(harness).map(([k, v]) => [k, { oos: v.sharpeOosHarness, all: v.sharpeAllHarness, gross: v.grossOos, costBp: v.costDragAnnBp, carryBp: v.carryAnnBp }])) }, null, 1));
