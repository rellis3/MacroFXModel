/*
 * backtestCore.mjs — the shared, environment-agnostic backtest computation.
 *
 * Given the engine, a FRED payload, and per-pair weekly returns, it runs the
 * exact causal pipeline (engine.runHistory), applies week t's book to week t+1's
 * returns (no lookahead), vol-targets the portfolio, scales by conviction, cuts
 * gross on the risk gate, charges turnover costs, and returns a stats object +
 * walk-forward.
 *
 * Used by both GlobalLiquidity/backtest_real.mjs (CLI, parquet FX) and the
 * Railway server endpoint (R2 FX) so the two can never disagree.
 */

const WEEK_MS = 7 * 864e5;
const COST_PER_UNIT_TURNOVER = 0.0002;   // ~2bp per unit gross traded

// FRED series ids the engine expects, keyed by engine short-key. One source of
// truth for both the CLI fetch and the server fetch.
export const FRED_IDS = {
  walcl: 'WALCL', tga: 'WTREGEN', rrp: 'RRPONTSYD', ecb_assets: 'ECBASSETSW',
  boj_assets: 'JPNASSETS', cny_res: 'TRESEGCNM052N', dexuseu: 'DEXUSEU',
  dexjpus: 'DEXJPUS', dexusuk: 'DEXUSUK', dexchus: 'DEXCHUS', sofr: 'SOFR',
  iorb: 'IORB', hy: 'BAMLH0A0HYM2', dxy: 'DTWEXBGS', bei: 'T10YIE',
  tips: 'DFII10', vix: 'VIXCLS', indpro: 'INDPRO',
};

// Filename stem aliases for FX caches (gold cache is gold_m1.parquet).
export const FX_FILE_ALIAS = { XAUUSD: 'gold' };

const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
function std(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2)) * a.length / (a.length - 1));
}
export function sharpe(r) {
  const x = r.filter((v) => isFinite(v));
  if (x.length < 4) return 0;
  const sd = std(x);
  return sd > 1e-12 ? (mean(x) / sd) * Math.sqrt(52) : 0;
}
function maxDD(eq) { let pk = -Infinity, dd = 0; for (const e of eq) { pk = Math.max(pk, e); dd = Math.min(dd, e / pk - 1); } return dd; }

// Accumulate price points into a Map<weekFridayISO, {t, close}> keeping the last
// close per week. Designed to be called repeatedly over CHUNKS of a large file
// so the full row set never has to live in memory at once (Railway OOM guard).
export function accumulateWeekly(byWeek, points) {
  for (const p of points) {
    if (!(p.close > 0)) continue;
    const dow = new Date(p.t).getUTCDay();
    const fri = new Date(p.t + ((5 - dow + 7) % 7) * 864e5);
    const key = fri.toISOString().slice(0, 10);
    const cur = byWeek.get(key);
    if (!cur || p.t >= cur.t) byWeek.set(key, { t: p.t, close: p.close });
  }
  return byWeek;
}

// Map<weekISO,{t,close}> → Map<weekISO, weekly log return>.
export function weeklyReturnsFromByWeek(byWeek) {
  const keys = [...byWeek.keys()].sort();
  const rets = new Map();
  for (let i = 1; i < keys.length; i++) {
    const a = byWeek.get(keys[i - 1]).close, b = byWeek.get(keys[i]).close;
    if (a > 0 && b > 0) rets.set(keys[i], Math.log(b / a));
  }
  return rets;
}

// One-shot: raw price points → weekly (Friday) log returns.
// points: array of { t: epochMillis, close: number }. Returns Map<'YYYY-MM-DD', logRet>.
export function weeklyReturns(points) {
  return weeklyReturnsFromByWeek(accumulateWeekly(new Map(), points));
}

/*
 * computeBacktest({ engine, payload, fxByPair, fredSource })
 *   engine     : loaded GLIEngine
 *   payload    : { engineKey: [{date, value}] }  (FRED, /api/fredhistory shape)
 *   fxByPair   : { PAIR: Map<'YYYY-MM-DD', weeklyLogRet> }
 *   fredSource : label string for the report
 * Returns a plain stats object (JSON-friendly).
 */
export function computeBacktest({ engine, payload, fxByPair, fredSource = 'unknown' }) {
  const hist = engine.runHistory(payload);
  if (hist.error) throw new Error('engine: ' + hist.error);
  const { dates, pairs, weights, regime, gate, grossMult, conviction } = hist;
  const m = pairs.length, n = dates.length;

  // Align each pair's weekly returns onto the engine's weekly grid (±4 days).
  const R = dates.map(() => new Array(m).fill(0));
  const fxCover = new Array(m).fill(0);
  for (let j = 0; j < m; j++) {
    const rets = fxByPair[pairs[j]]; if (!rets) continue;
    const keys = [...rets.keys()].sort(); let ptr = 0;
    for (let i = 0; i < n; i++) {
      const t = +new Date(dates[i]);
      while (ptr < keys.length && +new Date(keys[ptr]) < t - 4 * 864e5) ptr++;
      if (ptr < keys.length && Math.abs(+new Date(keys[ptr]) - t) <= 4 * 864e5) { R[i][j] = rets.get(keys[ptr]); fxCover[j]++; }
    }
  }
  const coveredPairs = fxCover.filter((c) => c > 20).length;

  // Gross-1 book return: apply week i-1 weights to week i returns.
  const bookRet = new Array(n).fill(0);
  for (let i = 1; i < n; i++) { let s = 0; for (let j = 0; j < m; j++) s += weights[i - 1][j] * R[i][j]; bookRet[i] = s; }

  // Vol-target + conviction + risk-gate sizing → net returns + turnover.
  const TARGET = 0.10, LOOK = 52, MAXG = 3.0, FLOOR = 0.30;
  const net = new Array(n).fill(0), gross = new Array(n).fill(0);
  let trades = 0, prevState = new Array(m).fill(0);
  for (let i = 0; i < n; i++) {
    const seg = bookRet.slice(Math.max(0, i - LOOK), i).filter((v) => v !== 0);
    let volScale = 1;
    if (seg.length >= 8) { const sd = std(seg) * Math.sqrt(52); volScale = sd > 1e-6 ? TARGET / sd : 0; }
    const g = Math.min(MAXG, Math.max(0, volScale * Math.max(FLOOR, conviction[i]) * grossMult[i]));
    gross[i] = g;
    const state = weights[i].map((w) => Math.sign(Math.abs(w) > 1e-6 ? w : 0));
    let dw = 0; for (let j = 0; j < m; j++) { if (state[j] !== prevState[j]) trades++; dw += Math.abs(weights[i][j] - (i ? weights[i - 1][j] : 0)); }
    prevState = state;
    net[i] = (i ? bookRet[i] * gross[i - 1] : 0) - dw * g * COST_PER_UNIT_TURNOVER;
  }

  const warm = 52;
  const valid = net.slice(warm);
  const eq = []; let c = 1; for (const r of net) { c *= 1 + r; eq.push(c); }

  // Walk-forward: 156 train / 52 test / 26 step.
  const wins = []; let s = warm;
  while (s + 156 + 52 <= n) { wins.push({ is: sharpe(net.slice(s, s + 156)), oos: sharpe(net.slice(s + 156, s + 156 + 52)) }); s += 26; }
  const isM = mean(wins.map((w) => w.is)), oosM = mean(wins.map((w) => w.oos));

  const regCount = {}; regime.forEach((r) => (regCount[r] = (regCount[r] || 0) + 1));
  const round = (x, d = 3) => (isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

  return {
    fredSource,
    real: !/synthetic/i.test(fredSource),
    asOf: dates[n - 1],
    start: dates[0],
    weeks: n,
    coveredPairs, totalPairs: m,
    sharpe: round(sharpe(valid)),
    annReturn: round(mean(valid) * 52, 4),
    annVol: round(std(valid) * Math.sqrt(52), 4),
    maxDrawdown: round(maxDD(eq), 4),
    hitRate: round(valid.filter((v) => v > 0).length / (valid.length || 1), 3),
    avgGross: round(mean(gross.slice(warm)), 2),
    tradesPerWeek: round(trades / n, 2),
    gateWeeks: gate.filter(Boolean).length,
    regimes: regCount,
    walkForward: {
      windows: wins.length,
      isSharpe: round(isM),
      oosSharpe: round(oosM),
      wfe: Math.abs(isM) > 1e-6 ? round(oosM / isM) : null,
      oosPositiveShare: round(wins.filter((w) => w.oos > 0).length / (wins.length || 1), 2),
    },
    equity: eq.map((v) => round(v, 4)),
  };
}
