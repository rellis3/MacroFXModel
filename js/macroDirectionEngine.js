// Macro-Direction predictiveness — I/O engine.
//
// Answers the falsification-first question: does macro DIRECTION predict forward FX
// drift, before any levels/z-exit are built on top? Reuses the z-score engine's data
// layer (FRED fetch + M1 → daily closes; no copies) and the pure scoring core
// (js/macroDirectionCore.js). NOT a trade engine with fills — it scores a daily macro
// direction and measures the forward H-day return in that direction, per pair, honest
// IS/OOS, with per-factor attribution and a buy-&-hold benchmark.
//
// Built + unit-tested (core). The real run needs live FRED + M1 on Railway; the sandbox
// can't reach FRED, so no local run is a result.

import { loadM1ForPair } from './volBacktestM1Engine.js';
import { ZSCORE_PAIRS, fetchFredObservations, _shiftDate, buildDayIndex } from './zscoreSpreadEngine.js';
import {
  MACRO_DIR_DEFAULTS, usdRole, havenTilt,
  carryVote, realVote, riskVote, macroDirScore, forwardReturn,
  summarizeDirection, splitByDate,
} from './macroDirectionCore.js';

export { ZSCORE_PAIRS, MACRO_DIR_DEFAULTS };

const REAL_SERIES = 'DFII10';   // US 10Y TIPS (real) yield
const VIX_SERIES  = 'VIXCLS';

// Forward-fill a FRED observation Map across every calendar day in [from,to] → Map
// date→level (last known value carried forward). Mirrors the z-engine's fill so the
// macro reads align with a trading day's information set.
function buildFfDailyMap(obs, from, to) {
  const out = new Map();
  let last = null;
  for (let d = new Date(from + 'T00:00:00Z'), end = new Date(to + 'T00:00:00Z');
       d <= end; d = new Date(d.getTime() + 86_400_000)) {
    const day = d.toISOString().substring(0, 10);
    if (obs.has(day)) last = obs.get(day);
    if (last != null) out.set(day, last);
  }
  return out;
}

// Daily close series from the M1 packed arrays: the last M1 close of each UTC day.
function dailyClosesFrom(packed) {
  const dayIndex = buildDayIndex(packed.times);
  const out = [];
  for (const [date, { end }] of dayIndex) {
    const c = packed.closes[end - 1];
    if (Number.isFinite(c)) out.push({ date, close: c });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

export async function runMacroDirection(pairKey, opts = {}) {
  const cfg = ZSCORE_PAIRS[pairKey];
  if (!cfg) throw new Error(`Unknown pair: ${pairKey}`);
  const fredKey = opts.fredKey ?? process.env.FRED_KEY;
  if (!fredKey) throw new Error('FRED_KEY not set — cannot fetch macro data');

  const dateFrom = opts.dateFrom || '2015-01-01';
  const dateTo   = opts.dateTo   || new Date().toISOString().substring(0, 10);
  const win      = opts.changeWindow ?? MACRO_DIR_DEFAULTS.changeWindow;
  const horizons = opts.horizons ?? MACRO_DIR_DEFAULTS.horizons;
  const costPct  = opts.costPct  ?? MACRO_DIR_DEFAULTS.costPct;
  const splitFrac = opts.splitFrac ?? MACRO_DIR_DEFAULTS.splitFrac;
  const weights  = opts.weights ?? MACRO_DIR_DEFAULTS.weights;

  const packed = await loadM1ForPair(pairKey);
  if (!packed) throw new Error(`No M1 data available for ${pairKey} — check R2 credentials or local parquet cache`);
  const daily = dailyClosesFrom(packed).filter(d => d.date >= dateFrom && d.date <= dateTo);
  if (daily.length < 60) throw new Error(`Too few daily closes for ${pairKey}`);

  const fredFrom = _shiftDate(daily[0].date, -(win + 21));
  const role = usdRole(pairKey), tilt = havenTilt(pairKey);
  const wantReal = (weights.real ?? 0) > 0 && role !== 0;
  const wantCarry = (weights.carry ?? 0) > 0 && role !== 0;
  const wantRisk = (weights.risk ?? 0) > 0 && tilt !== 0;

  const [usObs, forObs, realObs, vixObs] = await Promise.all([
    wantCarry ? fetchFredObservations(cfg.baseSeries, fredFrom, fredKey) : new Map(),
    wantCarry ? fetchFredObservations(cfg.quoteSeries, fredFrom, fredKey) : new Map(),
    wantReal ? fetchFredObservations(REAL_SERIES, fredFrom, fredKey).catch(() => new Map()) : new Map(),
    wantRisk ? fetchFredObservations(VIX_SERIES, fredFrom, fredKey).catch(() => new Map()) : new Map(),
  ]);
  const usFf   = buildFfDailyMap(usObs,   fredFrom, dateTo);
  const forFf  = buildFfDailyMap(forObs,  fredFrom, dateTo);
  const realFf = buildFfDailyMap(realObs, fredFrom, dateTo);
  const vixFf  = buildFfDailyMap(vixObs,  fredFrom, dateTo);

  const spreadAt = d => {
    const u = usFf.get(d), f = forFf.get(d);
    return (u != null && f != null) ? u - f : null;
  };
  const changeAt = (map, d) => {
    const now = map.get(d), past = map.get(_shiftDate(d, -win));
    return (now != null && past != null) ? now - past : null;
  };
  const spreadChangeAt = d => {
    const now = spreadAt(d), past = spreadAt(_shiftDate(d, -win));
    return (now != null && past != null) ? now - past : null;
  };

  const perHorizon = {};
  for (const H of horizons) {
    const records = [];
    // non-overlapping H-day samples (independent obs — no overlap-inflated stats)
    for (let i = 0; i + H < daily.length; i += H) {
      const { date, close } = daily[i];
      const carry = carryVote(spreadChangeAt(date), role);
      const real  = realVote(changeAt(realFf, date), role);
      const risk  = riskVote(changeAt(vixFf, date), tilt);
      const score = macroDirScore({ carry, real, risk }, weights);
      const fwdRet = forwardReturn(close, daily[i + H].close);
      if (fwdRet == null) continue;
      records.push({ date, score, fwdRet, carry, real, risk });
    }
    const ppy = 252 / H;
    const { splitDate, is, oos } = splitByDate(records, splitFrac);
    const summ = recs => summarizeDirection(recs, { costPct, periodsPerYear: ppy });
    // per-factor attribution: use each factor's own vote as the score
    const factorSumm = (recs, key) => summarizeDirection(recs.map(r => ({ ...r, score: r[key] ?? 0 })), { costPct, periodsPerYear: ppy });
    // buy-&-hold benchmark: always long
    const holdSumm = recs => summarizeDirection(recs.map(r => ({ ...r, score: 1 })), { costPct: 0, periodsPerYear: ppy });

    perHorizon[H] = {
      splitDate,
      all: summ(records), is: summ(is), oos: summ(oos),
      factors: {
        carry: { is: factorSumm(is, 'carry'), oos: factorSumm(oos, 'carry') },
        real:  { is: factorSumm(is, 'real'),  oos: factorSumm(oos, 'real')  },
        risk:  { is: factorSumm(is, 'risk'),  oos: factorSumm(oos, 'risk')  },
      },
      benchmarkHold: { oos: holdSumm(oos) },
      nRecords: records.length,
    };
  }

  return { pair: cfg.label, pairDisplay: cfg.pairDisplay, role, tilt, perHorizon };
}

export async function runFullMacroDirection(opts = {}, pairKeys = Object.keys(ZSCORE_PAIRS)) {
  const perPair = {};
  const log = [];
  // pooled records per horizon across pairs, for a portfolio read
  const pooled = {};
  for (const pairKey of pairKeys) {
    try {
      const r = await runMacroDirection(pairKey, opts);
      perPair[pairKey] = r;
      log.push({ pair: r.pair, ok: true, nRecords: Object.values(r.perHorizon)[0]?.nRecords ?? 0 });
    } catch (e) {
      log.push({ pair: pairKey, error: e?.message || String(e) });
    }
  }
  // Pooled OOS across pairs, per horizon — re-summarised from per-pair OOS stats is not
  // additive, so we report the cross-pair average OOS Sharpe/hit/corr as the portfolio read.
  const horizons = opts.horizons ?? MACRO_DIR_DEFAULTS.horizons;
  for (const H of horizons) {
    const oosStats = Object.values(perPair).map(p => p.perHorizon[H]?.oos).filter(Boolean).filter(s => s.n > 0);
    if (!oosStats.length) { pooled[H] = null; continue; }
    const avg = k => +(oosStats.reduce((a, s) => a + s[k], 0) / oosStats.length).toFixed(3);
    const positive = oosStats.filter(s => s.sharpe > 0).length;
    pooled[H] = {
      pairs: oosStats.length,
      pairsPositiveOosSharpe: positive,
      avgOosSharpe: avg('sharpe'),
      avgOosHitRate: avg('hitRate'),
      avgOosCorr: avg('corr'),
      avgOosMeanRetPct: avg('meanRetPct'),
    };
  }
  return { perPair, pooled, log };
}
