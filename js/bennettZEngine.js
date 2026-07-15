// Bennett z-mean-reversion — I/O engine.
//
// The clean replication of Bennett's ACTUAL bot: enter on |spread-z| ≥ threshold in the
// z-direction, exit on z-reversion to ±zExit (or a max-hold), NO price levels. Reuses the
// z-engine's FRED fetch + rolling-z + M1→daily-close (no copies) and the pure core. Built
// + unit-tested (core); the real run needs FRED + M1 on Railway.

import { loadM1ForPair } from './volBacktestM1Engine.js';
import { ZSCORE_PAIRS, fetchFredObservations, _shiftDate, buildRollingZSeries, buildDayIndex } from './zscoreSpreadEngine.js';
import {
  BENNETT_DEFAULTS, directionFromZ, resolveInverted, zTierSize, zTierLabel, shouldExit, summarizeBennett, splitByDate, perYearBreakdown,
} from './bennettZCore.js';
import { usdRole } from './macroDirectionCore.js';

export { ZSCORE_PAIRS, BENNETT_DEFAULTS };

// Shift a FRED observation Map's dates FORWARD by `days` to model publication lag —
// a value nominally dated D is not KNOWN until D+lag. Monthly foreign rates are
// released ~a month after their reference month; using them earlier is lookahead.
function shiftObsForward(obs, days) {
  if (!days) return obs;
  const out = new Map();
  for (const [d, v] of obs) out.set(_shiftDate(d, days), v);
  return out;
}

function dailyClosesFrom(packed) {
  const out = [];
  for (const [date, { end }] of buildDayIndex(packed.times)) {
    const c = packed.closes[end - 1];
    if (Number.isFinite(c)) out.push({ date, close: c });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function runBennettZ(pairKey, opts = {}) {
  const cfg = ZSCORE_PAIRS[pairKey];
  if (!cfg) throw new Error(`Unknown pair: ${pairKey}`);
  const fredKey = opts.fredKey ?? process.env.FRED_KEY;
  if (!fredKey) throw new Error('FRED_KEY not set — cannot fetch yield-spread data');

  const dateFrom = opts.dateFrom || '2015-01-01';
  const dateTo   = opts.dateTo   || new Date().toISOString().substring(0, 10);
  const zWindow  = opts.zWindow ?? 252;
  const entryThreshold = opts.entryThreshold ?? BENNETT_DEFAULTS.entryThreshold;
  const zExit    = opts.zExit ?? BENNETT_DEFAULTS.zExit;
  const maxHoldDays = opts.maxHoldDays ?? BENNETT_DEFAULTS.maxHoldDays;
  const costPct  = opts.costPct ?? BENNETT_DEFAULTS.costPct;
  const splitFrac = opts.splitFrac ?? BENNETT_DEFAULTS.splitFrac;
  // Direction sign: orient by USD role by default (USD-quote pairs move opposite to USD,
  // so the raw z>0→LONG rule must flip). Anchored on the validated USDJPY sign.
  const autoOrient = opts.autoOrient !== false;
  const manualInvert = !!(opts.invert && opts.invert[pairKey]);
  const inverted = resolveInverted(usdRole(pairKey), { autoOrient, manualInvert });
  const tiers = opts.tiers ?? BENNETT_DEFAULTS.tiers;

  const packed = await loadM1ForPair(pairKey);
  if (!packed) throw new Error(`No M1 data available for ${pairKey} — check R2 credentials or local parquet cache`);
  const daily = dailyClosesFrom(packed).filter(d => d.date >= dateFrom && d.date <= dateTo);
  if (daily.length < 60) throw new Error(`Too few daily closes for ${pairKey}`);

  const fredFrom = _shiftDate(dateFrom, -(zWindow + 21));
  // Publication lags (default ON — the honest setting). Set to 0 to reproduce the
  // no-lag (lookahead) run for an A/B. US 2Y is daily (~next-day release); the foreign
  // short rates are MONTHLY (released ~a month after their reference month).
  const pubLagUsDays = opts.pubLagUsDays ?? 2;
  const pubLagForeignDays = opts.pubLagForeignDays ?? 45;
  const [usObsRaw, forObsRaw] = await Promise.all([
    fetchFredObservations(cfg.baseSeries, fredFrom, fredKey),
    fetchFredObservations(cfg.quoteSeries, fredFrom, fredKey),
  ]);
  const usObs = shiftObsForward(usObsRaw, pubLagUsDays);
  const forObs = shiftObsForward(forObsRaw, pubLagForeignDays);
  const zByDate = buildRollingZSeries(usObs, forObs, zWindow, dateFrom, dateTo);

  // State machine over daily closes.
  const trades = [];
  let pos = null;   // { dir, size, tierLabel, entryClose, entryDate, entryIdx, entryZ }
  for (let i = 0; i < daily.length; i++) {
    const { date, close } = daily[i];
    const zInfo = zByDate.get(date);
    if (zInfo == null) continue;
    const z = zInfo.z, absZ = Math.abs(z);

    if (pos) {
      const holdDays = i - pos.entryIdx;
      const ex = shouldExit(absZ, holdDays, { zExit, maxHoldDays });
      if (ex.exit) {
        trades.push({
          pair: cfg.label, date: pos.entryDate, exitDate: date, dir: pos.dir,
          size: pos.size, tierLabel: pos.tierLabel,
          entryClose: pos.entryClose, exitClose: close,
          entryZ: +pos.entryZ.toFixed(2), exitZ: +z.toFixed(2),
          holdDays, exitReason: ex.reason,
        });
        pos = null;
        continue;   // no same-day re-entry
      }
    }
    if (!pos && absZ >= entryThreshold) {
      pos = {
        dir: directionFromZ(z, inverted), size: zTierSize(absZ, tiers), tierLabel: zTierLabel(absZ, tiers),
        entryClose: close, entryDate: date, entryIdx: i, entryZ: z,
      };
    }
  }
  // close any open position at the last close (mark-out)
  if (pos) {
    const last = daily[daily.length - 1];
    trades.push({
      pair: cfg.label, date: pos.entryDate, exitDate: last.date, dir: pos.dir,
      size: pos.size, tierLabel: pos.tierLabel, entryClose: pos.entryClose, exitClose: last.close,
      entryZ: +pos.entryZ.toFixed(2), exitZ: null, holdDays: daily.length - 1 - pos.entryIdx, exitReason: 'mark-out',
    });
  }

  const yrs = Math.max(0.25, (new Date(dateTo) - new Date(dateFrom)) / (365.25 * 86_400_000));
  const ppy = Math.max(1, trades.length / yrs);
  const { splitDate, is, oos } = splitByDate(trades, splitFrac);
  const summ = recs => summarizeBennett(recs, { costPct, periodsPerYear: ppy });
  return {
    pair: cfg.label, pairDisplay: cfg.pairDisplay,
    all: summ(trades), is: summ(is), oos: summ(oos),
    splitDate, trades,
  };
}

export async function runFullBennettZ(opts = {}, pairKeys = Object.keys(ZSCORE_PAIRS)) {
  const perPair = {};
  const allTrades = [];
  const log = [];
  for (const pairKey of pairKeys) {
    try {
      const r = await runBennettZ(pairKey, opts);
      perPair[pairKey] = { pair: r.pair, pairDisplay: r.pairDisplay, all: r.all, is: r.is, oos: r.oos, splitDate: r.splitDate };
      allTrades.push(...r.trades);
      log.push({ pair: r.pair, ok: true, trades: r.trades.length });
    } catch (e) {
      log.push({ pair: pairKey, error: e?.message || String(e) });
    }
  }
  const costPct = opts.costPct ?? BENNETT_DEFAULTS.costPct;
  const splitFrac = opts.splitFrac ?? BENNETT_DEFAULTS.splitFrac;
  const dateFrom = opts.dateFrom || '2015-01-01';
  const dateTo = opts.dateTo || new Date().toISOString().substring(0, 10);
  const yrs = Math.max(0.25, (new Date(dateTo) - new Date(dateFrom)) / (365.25 * 86_400_000));
  const ppy = Math.max(1, allTrades.length / yrs);
  const { splitDate, is, oos } = splitByDate(allTrades, splitFrac);
  const summ = recs => summarizeBennett(recs, { costPct, periodsPerYear: ppy });
  return {
    perPair,
    combined: {
      all: summ(allTrades), is: summ(is), oos: summ(oos), splitDate, nTrades: allTrades.length,
      perYear: perYearBreakdown(allTrades, { costPct }),
      perYearOos: perYearBreakdown(oos, { costPct }),
    },
    log,
  };
}
