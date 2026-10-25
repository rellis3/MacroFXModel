/**
 * portfolio-book — the sleeve pipeline as a function, so the scored run (run.mjs) and the
 * validation suite (scripts/portfolio-book-validate/) build the book the same way.
 * forge/PORTFOLIO_BOOK_PREREG.md; variants in forge/PORTFOLIO_BOOK_VALIDATE_PREREG.md.
 *
 *   buildPortfolio({ sample, fold, sleeveIds, exclude, legTransform, s5Delay, store, log })
 *     sample        { from, to, isEnd } scored window (default 2008-01-02 → 2026-08-21)
 *     fold          fold the store's weekend rows into the next weekday (parent A4; default true)
 *     sleeveIds     which sleeves to build (default all: S1 S1g S2 S3 S3g S4 S5 S5g)
 *     exclude       { sleeveId: [inst, …] } legs dropped from a sleeve (they leave the denominator too)
 *     legTransform  async (sleeveId, inst, path, ctx) → replacement net[] for that leg, or null
 *     s5Delay       extra days between the vol-proxy decision and the P&L it earns (0 = parent)
 *     runs          harness runs from an earlier build on the SAME sample, reused instead of re-running
 *     indexCostFrac fixed round-trip cost for NAS100/SPX500 (default 3.0 bp; null = the harness's old window-dependent rule)
 *   → { dates, sleeves: {id: {id, name, startIdx, legs:[{inst,label,c}], trades}}, runs, sample }
 */
import { openStore } from '../../js/harness/features.mjs';
import { runStudy } from '../../js/harness/runStudy.mjs';
import { ewmaVolSeries } from '../../js/fxFactorSignals.js';
import { BOOK, UNIT } from '../../js/portfolioBook.js';

export const SAMPLE = Object.freeze({ from: '2008-01-02', to: '2026-08-21', isEnd: BOOK.isEnd });
export const FX = ['eurusd', 'gbpusd', 'audusd', 'nzdusd', 'usdcad', 'usdchf', 'usdjpy'];
export const ALL = [...FX, 'xauusd', 'nas100', 'spx500'];
export const CORE = ['nas100', 'spx500', 'xauusd'];
export const LABEL = { eurusd: 'EURUSD', gbpusd: 'GBPUSD', audusd: 'AUDUSD', nzdusd: 'NZDUSD', usdcad: 'USDCAD', usdchf: 'USDCHF', usdjpy: 'USDJPY', xauusd: 'XAUUSD', nas100: 'NAS100', spx500: 'SPX500' };
const USD_BASE = new Set(['usdcad', 'usdchf', 'usdjpy']);
// analysis/fomc_event_study/stage1_event_study.py FOMC_DATES + the two 2026 decisions inside the window (prereg §3)
export const FOMC = ['2016-01-27', '2016-03-16', '2016-04-27', '2016-06-15', '2016-07-27', '2016-09-21', '2016-11-02', '2016-12-14', '2017-02-01', '2017-03-15', '2017-05-03', '2017-06-14', '2017-07-26', '2017-09-20', '2017-11-01', '2017-12-13', '2018-01-31', '2018-03-21', '2018-05-02', '2018-06-13', '2018-08-01', '2018-09-26', '2018-11-08', '2018-12-19', '2019-01-30', '2019-03-20', '2019-05-01', '2019-06-19', '2019-07-31', '2019-09-18', '2019-10-30', '2019-12-11', '2020-01-29', '2020-04-29', '2020-06-10', '2020-07-29', '2020-09-16', '2020-11-05', '2020-12-16', '2021-01-27', '2021-03-17', '2021-04-28', '2021-06-16', '2021-07-28', '2021-09-22', '2021-11-03', '2021-12-15', '2022-01-26', '2022-03-16', '2022-05-04', '2022-06-15', '2022-07-27', '2022-09-21', '2022-11-02', '2022-12-14', '2023-02-01', '2023-03-22', '2023-05-03', '2023-06-14', '2023-07-26', '2023-09-20', '2023-11-01', '2023-12-13', '2024-01-31', '2024-03-20', '2024-05-01', '2024-06-12', '2024-07-31', '2024-09-18', '2024-11-07', '2024-12-18', '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18', '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10', '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29'];
const FOMC_START = '2016-01-27';
// NAS100/SPX500 round-trip cost, fixed (validate A2): the harness default priced it off the window's last 250 closes,
// so it moved with the window end (T1). null = the old rule, to reproduce runs made before 2026-10-25.
export const INDEX_COST_FRAC = 3.0e-4;
const LOOKBACKS = [21, 63, 126, 252];
const day = t => t.slice(0, 10);
const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const isWeekday = d => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w !== 0 && w !== 6; };

// gate G: VIX > VIX3M at the decision close
async function inverted(f) {
  const [v, v3] = await Promise.all([f.at('vix'), f.at('vix3m')]);
  if (!v || !v3) return false;   // VIX3M starts 2007-12-04
  return Number(v.value) > Number(v3.value);
}

function sleeveSpecs(fomcHold) {
  return [
    { id: 'S1', name: 'Core beta', universe: CORE, rebalance: 'weekly', signal: async () => 1 },
    { id: 'S1g', name: 'Core beta (VIX-gated)', universe: CORE, rebalanceDays: 1, signal: async f => (await inverted(f) ? 0 : 1) },
    {
      id: 'S2', name: 'Trend (21/63/126/252)', universe: ALL, rebalance: 'weekly',
      signal: async (f, t, inst) => {
        const rows = await f.series(`px_d1_${inst}`, { from: `${Number(t.slice(0, 4)) - 2}-01-01` });
        const c = rows.map(r => Number(r.value)), n = c.length;
        if (n < 253 || String(rows[n - 1].date) !== day(t)) return null;
        return LOOKBACKS.reduce((s, L) => s + Math.sign(c[n - 1] / c[n - 1 - L] - 1), 0) / LOOKBACKS.length;
      },
    },
    ...['S3', 'S3g'].map(id => ({
      id, name: id === 'S3' ? 'Carry' : 'Carry (VIX-gated)', universe: FX, ...(id === 'S3' ? { rebalance: 'weekly' } : { rebalanceDays: 1 }),
      signal: async (f, t, inst) => {
        if (id === 'S3g' && await inverted(f)) return 0;
        const [b, q] = await Promise.all([f.at(`rate3m_${inst.slice(0, 3)}`), f.at(`rate3m_${inst.slice(3)}`)]);
        if (!b || !q) return null;
        return Math.sign(Number(b.value) - Number(q.value));
      },
    })),
    {
      id: 'S4', name: 'FOMC USD drift (5 sessions)', universe: FX, rebalanceDays: 1, start: FOMC_START,
      signal: async (f, t, inst) => (fomcHold[inst].has(day(t)) ? (USD_BASE.has(inst) ? 1 : -1) : 0),
    },
  ];
}

export async function buildPortfolio({ sample = SAMPLE, fold = true, sleeveIds = ['S1', 'S1g', 'S2', 'S3', 'S3g', 'S4', 'S5', 'S5g'], exclude = {}, legTransform = null, s5Delay = 0, store = null, runs: runsIn = null, indexCostFrac = INDEX_COST_FRAC, log = () => {} } = {}) {
  store = store ?? await openStore();
  const want = new Set(sleeveIds);

  // FOMC hold days per instrument: the decision day's close + the next 4 closes (5 sessions held)
  const fomcHold = {};
  if (want.has('S4')) for (const inst of FX) {
    const ds = (await store.series(`px_d1_${inst}`, { from: '2015-06-01', to: sample.to })).map(r => String(r.date));
    const hold = new Set();
    for (const fd of FOMC) { const i = ds.indexOf(fd); if (i < 0) { if (fd <= sample.to) log(`FOMC ${fd} not a ${inst} date`); continue; } for (let k = 0; k < 5 && i + k < ds.length; k++) hold.add(ds[i + k]); }
    fomcHold[inst] = hold;
  }
  const SLEEVES = sleeveSpecs(fomcHold).filter(s => want.has(s.id));

  // run the price sleeves through the harness
  const runs = {};
  for (const s of SLEEVES) {
    if (runsIn?.[s.id]) { runs[s.id] = runsIn[s.id]; continue; }   // reuse a base build's harness paths (same sample only)
    log(`harness ${s.id}`);
    runs[s.id] = await runStudy({
      id: `portfolio-book-${s.id}`, doc: 'forge/PORTFOLIO_BOOK_PREREG.md', domain: 'portfolio', claim: s.name,
      universe: s.universe, horizonDays: s.rebalance === 'weekly' ? 5 : 1, ...(s.rebalance ? { rebalance: s.rebalance } : { rebalanceDays: s.rebalanceDays }),
      sample, primary: 'pnl', cells: [{ key: s.id }], signal: s.signal,
      ...(indexCostFrac != null ? { unmeasuredCostFrac: indexCostFrac } : {}),
    }, { store, keepPaths: true, log, write: false });
  }

  // one date grid: every trading date any leg has inside the window
  const dateSet = new Set();
  for (const s of SLEEVES) for (const p of Object.values(runs[s.id].paths[s.id])) for (const d of p.dates) if (d >= sample.from && d <= sample.to) dateSet.add(d);
  const spxRows = await store.series('px_d1_spx500', { from: addDays(sample.from, -730), to: sample.to });
  for (const r of spxRows) if (r.date >= sample.from) dateSet.add(String(r.date));
  const dates = [...dateSet].sort();
  const di = new Map(dates.map((d, i) => [d, i]));
  const N = dates.length;

  // harness paths → sleeve legs (contribution = leg net / legs with a row that day, as runStudy's portfolio) + trades
  async function sleeveFromPaths(s) {
    const P = runs[s.id].paths[s.id];
    const insts = Object.keys(P).filter(inst => !(exclude[s.id] ?? []).includes(inst));
    const nLegs = new Array(N).fill(0);
    for (const inst of insts) for (const d of P[inst].dates) { const k = di.get(d); if (k != null) nLegs[k]++; }
    const legs = [], trades = [];
    for (const [li, inst] of insts.entries()) {
      const p = P[inst];
      const net = (legTransform && await legTransform(s.id, inst, p, { store, sample })) ?? p.net;
      const c = new Array(N).fill(0);
      const posAt = new Array(N).fill(null), volAt = new Array(N).fill(NaN);
      p.dates.forEach((d, i) => { const k = di.get(d); if (k == null) return; c[k] = Math.round((net[i] / nLegs[k]) * UNIT); posAt[k] = p.pos[i]; volAt[k] = p.vol[i]; });
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
    }
    const startIdx = s.start ? Math.max(0, dates.findIndex(d => d >= s.start)) : 0;
    return { id: s.id, name: s.name, startIdx, legs, trades };
  }

  // S5 vol-premium proxy (parent prereg §3 + A2); s5Delay > 0 makes day-t P&L use the state decided s5Delay+1 closes earlier
  async function volPremium(gated) {
    const spx = spxRows.map(r => ({ d: String(r.date), c: Number(r.value) }));
    const c = new Array(N).fill(0);
    const trades = [];
    let on = false, cooldown = 0, cur = null, prevVix = null, prevV = null;
    const onQueue = [];   // states decided at earlier closes, newest last
    for (let i = 1; i < spx.length; i++) {
      const d = spx[i].d, t = `${d}T22:00:00Z`;
      const vix = Number((await store.at('vix', t))?.value), vix3 = Number((await store.at('vix3m', t))?.value);
      if (!Number.isFinite(vix)) continue;
      const v = (vix / 100) ** 2 / 252;
      const k = di.get(d);
      const earning = s5Delay > 0 ? (onQueue.length > s5Delay ? onQueue[onQueue.length - 1 - s5Delay] : false) : on;
      if (prevV != null && k != null && d >= sample.from && earning) {
        const r = Math.log(spx[i].c / spx[i - 1].c);
        const pnlV = prevV - r * r + 10 * (prevV - v);
        const nVar = 0.01 / (2 * prevVix);
        const haircut = ((prevVix ** 2) - ((prevVix - 0.5) ** 2)) / 1e4 / 252;
        c[k] = nVar * (pnlV - haircut) * (252 / 21) * 1e4;
      }
      const chg = prevVix ? vix / prevVix - 1 : 0;
      let wantOn = true;
      if (gated) {
        if (chg > 0.20) cooldown = 5;
        else if (cooldown > 0) cooldown = Math.abs(chg) < 0.05 ? cooldown - 1 : 5;
        wantOn = cooldown === 0 && !(Number.isFinite(vix3) && vix > vix3);
      }
      if (k != null && d >= sample.from) {
        if (wantOn !== on) {
          const nVar = 0.01 / (2 * vix);
          const switchCost = 10 * nVar * (((vix ** 2) - ((vix - 0.5) ** 2)) / 1e4 / 252) * (252 / 21) * 1e4;
          const kc = s5Delay > 0 ? Math.min(N - 1, k + s5Delay) : k;   // the cost lands when the switch is filled
          c[kc] -= switchCost;
          if (wantOn) cur = { leg: 0, e: k, s: k, dir: -1 };
          else if (cur) { cur.x = k; trades.push(cur); cur = null; }
        }
      }
      on = wantOn;
      onQueue.push(on);
      prevV = v; prevVix = vix;
    }
    if (cur) { cur.x = N - 1; cur.open = true; trades.push(cur); }
    const rawVol = ewmaVolSeries(c, 60);
    for (const tr of trades) { const vv = rawVol[tr.e]; tr.r = Number.isFinite(vv) ? +(vv / Math.sqrt(252)).toPrecision(4) : 0; }
    return { id: gated ? 'S5g' : 'S5', name: gated ? 'Vol premium proxy (gated)' : 'Vol premium proxy', startIdx: 0, legs: [{ inst: 'spx_var', label: 'SPX500 1M variance (proxy)', c: c.map(x => Math.round(x * UNIT)) }], trades };
  }

  const raw = {};
  for (const s of SLEEVES) raw[s.id] = await sleeveFromPaths(s);
  if (want.has('S5')) raw.S5 = await volPremium(false);
  if (want.has('S5g')) raw.S5g = await volPremium(true);

  // parent A4: fold each weekend row into the next weekday (P&L kept, annualisation right)
  const gridDates = fold ? dates.filter(isWeekday) : dates;
  const gi = new Map(gridDates.map((d, i) => [d, i]));
  const remap = new Array(N);
  { let j = gridDates.length - 1; for (let k = N - 1; k >= 0; k--) { if (gi.has(dates[k])) j = gi.get(dates[k]); remap[k] = j; } }
  const doFold = s => {
    if (!fold) return s;
    const M = gridDates.length;
    const legs = s.legs.map(l => { const c = new Array(M).fill(0); l.c.forEach((v, k) => { c[remap[k]] += v; }); return { ...l, c }; });
    const trades = s.trades.map(t => ({ ...t, e: remap[t.e], s: remap[t.s ?? t.e + 1], x: remap[t.x] })).filter(t => t.x >= t.e);
    return { ...s, startIdx: remap[s.startIdx] ?? 0, legs, trades };
  };
  const sleeves = Object.fromEntries(Object.entries(raw).map(([k, s]) => [k, doFold(s)]));
  return { dates: [...gridDates], sleeves, runs, sample, store };
}
