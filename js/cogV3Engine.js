// js/cogV3Engine.js — COG's macro signal on QMR's validated intraday chassis.
//
// WHY THIS EXISTS (2026-07-28). Two systems in this repo were built from the
// SAME source — the owner's direct observations of COG's four-stage message
// flow — and each kept a different half of it:
//
//   QMR (server.js _computeNqQmr)  kept the intraday SHAPE (two gates, then a
//     pre-NY-open entry, same-day exit) but filled both gates with NQ's OWN
//     price momentum. The 2026-07-28 control arm measured that signal at
//     exactly zero: direction alpha -0.006%/trade (t = -0.08), and the
//     coin-flip return flat across gate strictness (0.172% gates-off vs 0.186%
//     strict), so the day-selection is null too. What survived was the
//     execution chassis — now js/qmrCore.js.
//
//   The cog*.js gate family  kept the stated THESIS (Fed/ECB/BOJ balance
//     sheets, RRP, TGA, HY credit; cross-asset direction; never NQ price) but
//     ran it on daily bars through an execution layer whose first real-data run
//     exposed three defects: a 0.25x-daily-ATR stop (0.18% of price, inside the
//     bar's own noise — 37/39 stopped out, 22 within one bar), whole-contract
//     size flooring to zero at higher index levels (no trades after 2021), and
//     realised risk ~20x smaller than the stated riskAmount. It also held
//     trades 3.9 days on average (max 75) — COG exits the same day, so the
//     daily engine was never modelling his system at all.
//
// So: QMR is COG's shape with the wrong inputs; the cog gates are the right
// inputs with the wrong chassis. This file is the two halves put back
// together — the right inputs on the right chassis.
//
// WHAT IS AND ISN'T CLAIMED. The chassis is validated (+0.18%/trade after cost
// over five years, either direction). The SIGNAL is not — that is exactly what
// this engine exists to test, and it ships with its own null baseline rather
// than an equity curve alone. `control` runs the identical day in the INVERSE
// direction, so:
//     coinFlip = (signal + inverse) / 2   ← day selection + payoff geometry
//     dirAlpha = signal - coinFlip        ← what the DIRECTION call adds
// A positive equity curve here means nothing until dirAlpha clears zero. This
// is the same instrument that killed QMR's own direction claim; it is pointed
// at COG's thesis with no thumb on the scale.
//
// NET LIQUIDITY IS COMPUTED, NOT AVERAGED. cogLiquidityGate normalises WALCL,
// TGA and RRP separately and averages the six normalised signals. That is not
// net liquidity. Net liquidity is (WALCL - TGA - RRP) as ONE series whose
// momentum you then measure — normalising the components separately destroys
// the arithmetic between them (Fed +$50bn against a TGA drain of $50bn is flat
// net liquidity, but the component-wise average can read strongly signed
// depending on each series' own recent range). buildNetLiquiditySeries below
// computes the real thing; `liquidityMode` selects which is used.
//
// Pure: no network, no KV, no DOM. Daily macro series + H1 bars in, trades out.

import {
  QMR_TIMING, QMR_COSTS, walkTrade, netReturn, qmrStats,
  groupBarsByDate, overnightRange, entryBarFor,
} from './qmrCore.js';
import { computeLiquidityGate1A } from './cogLiquidityGate.js';
import { computeDirectionGate } from './cogDirectionGate.js';
import { rollingZScore, rollingPercentile, clip } from './nasdaqTransforms.js';

// Net liquidity = Fed balance sheet - Treasury General Account - reverse repo.
// The standard framework, and the one COG described ("money pumped into the
// USA"). Built as a real derived series in raw units, then classified by its
// own rolling percentile so the dead zone is regime-relative (an absolute
// cutoff cannot span QE, QT and COVID — see COG_GATE_CALIBRATION).
//
// `signMode: 'level'` trades the percentile of net liquidity itself;
// 'momentum' trades the percentile of its rate-of-change z-score. Level says
// "is there a lot of money in the system"; momentum says "is money being added
// right now". They are genuinely different claims and the caller picks one —
// this is not a tunable to sweep, it's a hypothesis to state.
export function buildNetLiquiditySeries(seriesById, n, opts = {}) {
  const { rocDays = 21, zWindow = 252, signMode = 'momentum' } = opts;
  const walcl = seriesById.walcl, tga = seriesById.tga, rrp = seriesById.rrp;
  if (!walcl || !tga || !rrp) return { net: null, signal: new Array(n).fill(NaN), coverage: 0 };

  const net = new Array(n).fill(NaN);
  let present = 0;
  for (let i = 0; i < n; i++) {
    const w = walcl[i], t = tga[i], r = rrp[i];
    if (Number.isFinite(w) && Number.isFinite(t) && Number.isFinite(r)) {
      net[i] = w - t - r;   // all three are FRED millions-of-USD, same unit
      present++;
    }
  }
  if (signMode === 'level') {
    return { net, signal: rollingPercentile(net, zWindow), coverage: present / n, kind: 'levelPct' };
  }
  // Momentum: rate of change over rocDays, z-scored on its own history, then
  // percentile-ranked so it shares the classifier the gates use.
  const rocArr = new Array(n).fill(NaN);
  for (let i = rocDays; i < n; i++) {
    const a = net[i - rocDays], b = net[i];
    if (Number.isFinite(a) && Number.isFinite(b) && a !== 0) rocArr[i] = (b - a) / Math.abs(a);
  }
  const z = rollingZScore(rocArr, zWindow);
  return { net, roc: rocArr, signal: rollingPercentile(z.map(v => (Number.isFinite(v) ? clip(v, -3, 3) : NaN)), zWindow),
           coverage: present / n, kind: 'momentumPct' };
}

// dailyDataset: { dates[], liquiditySeries, directionSeries } as produced by
//   cogDataSources.fetchRealCogDataset — daily, publication-lag-shifted.
// h1Bars: OANDA NAS100 H1 bars [{t,o,h,l,c}] ascending (the QMR bar set).
export function runCogV3(dailyDataset, h1Bars, cfg = {}) {
  const {
    stopMultiplier  = 0.45,   // stop % = overnight rangePct x this (QMR's validated vol-scaled stop)
    minStopPct      = 0.10,
    tpPct           = 1.50,   // ~3.3R at a 0.45% stop — the geometry that survived QMR's test
    riskPct         = 1.00,
    minRangePct     = 0.15,
    costPct         = QMR_COSTS.costPct,
    stopSlipPct     = QMR_COSTS.stopSlipPct,
    neutralPct      = 30,     // gate dead zone, in percent of the score's own distribution
    windowDays      = 504,
    liquidityMode   = 'netliq',  // 'netliq' (computed series) | 'gate' (cogLiquidityGate composite) | 'off'
    netLiqSignMode  = 'momentum',
    requireLiquidity = true,  // liquidity acts as a PERMISSION filter on direction
    directionSource = 'crossasset', // 'crossasset' (cogDirectionGate) | 'netliq' | 'random'
    randomSeed      = 12345,
  } = cfg;

  const dates = dailyDataset.dates;
  const nD = dates.length;
  const toSeriesById = s => s || {};

  // ── Daily signals, all causal ──────────────────────────────────────────────
  const calibration = { mode: 'percentile', windowDays, neutralPct };
  const gate1 = liquidityMode === 'gate'
    ? computeLiquidityGate1A(toSeriesById(dailyDataset.liquiditySeries), nD, calibration)
    : null;
  const netLiq = liquidityMode === 'netliq'
    ? buildNetLiquiditySeries(toSeriesById(dailyDataset.liquiditySeries), nD, { zWindow: windowDays, signMode: netLiqSignMode })
    : null;
  const gate3 = computeDirectionGate(toSeriesById(dailyDataset.directionSeries), nD, calibration);

  const loCut = 50 - neutralPct / 2, hiCut = 50 + neutralPct / 2;
  const dailyIdx = new Map(dates.map((d, i) => [d, i]));

  // Deterministic PRNG for the 'random' direction source — the sanity control
  // that proves the harness itself can't manufacture edge.
  let seed = randomSeed;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

  // ── Chassis ────────────────────────────────────────────────────────────────
  const byDate = groupBarsByDate(h1Bars);
  const barDates = Object.keys(byDate).sort();

  const trades = [], tradesCtl = [], curve = [], curveCtl = [];
  let equity = 1.0, equityCtl = 1.0;
  const skips = { noDaily: 0, noOvernight: 0, lowRange: 0, noEntryBar: 0, liquidityBlock: 0, noDirection: 0, noWalk: 0 };

  for (let bi = 1; bi < barDates.length; bi++) {
    const today = barDates[bi], prev = barDates[bi - 1];
    const dow = new Date(today + 'T12:00:00Z').getUTCDay();
    if (dow === 0 || dow === 6) continue;

    // Daily macro row for this date. Strictly the PRIOR trading day's row would
    // be even safer, but fetchRealCogDataset already applies each series'
    // publication lag, so same-date is the intended alignment.
    const di = dailyIdx.get(today);
    if (di == null) { skips.noDaily++; continue; }

    // Liquidity permission
    let liqState = 'OFF';
    if (liquidityMode === 'gate') {
      liqState = gate1[di]?.state ?? 'INVALID';
    } else if (liquidityMode === 'netliq') {
      const p = netLiq.signal[di];
      liqState = !Number.isFinite(p) ? 'INVALID' : p > hiCut ? 'BULLISH' : p < loCut ? 'BEARISH' : 'NEUTRAL';
    }
    if (requireLiquidity && liquidityMode !== 'off'
        && liqState !== 'BULLISH' && liqState !== 'BEARISH') { skips.liquidityBlock++; continue; }

    // Direction
    let dir = null;
    if (directionSource === 'crossasset') {
      const s = gate3[di]?.state;
      dir = s === 'LONG' || s === 'SHORT' ? s : null;
    } else if (directionSource === 'netliq') {
      dir = liqState === 'BULLISH' ? 'LONG' : liqState === 'BEARISH' ? 'SHORT' : null;
    } else if (directionSource === 'random') {
      dir = rnd() > 0.5 ? 'LONG' : 'SHORT';
    }
    if (!dir) { skips.noDirection++; continue; }

    // Chassis: overnight range → stop → entry → walk
    const on = overnightRange(byDate, prev, today);
    if (!on) { skips.noOvernight++; continue; }
    if (on.rangePct < minRangePct) { skips.lowRange++; continue; }

    const dayBars = byDate[today] || [];
    const entryBar = entryBarFor(dayBars);
    if (!entryBar) { skips.noEntryBar++; continue; }

    const entry = entryBar.o;
    const stopPct = Math.max(+(on.rangePct * stopMultiplier).toFixed(4), minStopPct);
    const leverage = riskPct / stopPct;
    const afterEntry = dayBars
      .filter(b => b.t.substring(11, 13) > entryBar.t.substring(11, 13))
      .sort((a, b) => a.t.localeCompare(b.t));

    const walk = walkTrade(afterEntry, dir, entry, stopPct, tpPct);
    if (!walk) { skips.noWalk++; continue; }
    const ret = netReturn(walk.movePct, walk.exitReason, leverage, costPct, stopSlipPct);
    equity *= (1 + ret / 100);
    trades.push({ date: today, direction: dir, liqState, entry, stop: walk.stop, exit: walk.exit,
                  exitReason: walk.exitReason, stopPct: +stopPct.toFixed(3), leverage: +leverage.toFixed(2),
                  movePct: +walk.movePct.toFixed(3), tradeReturn: +ret.toFixed(3),
                  equity: +equity.toFixed(6),
                  dirScore: gate3[di]?.score ?? null,
                  liqSignal: liquidityMode === 'netliq' ? netLiq.signal[di] : (gate1?.[di]?.score ?? null) });
    curve.push({ date: today, equity: +equity.toFixed(6) });

    // Control arm — same day, inverse direction, everything else identical.
    const ctlWalk = walkTrade(afterEntry, dir === 'LONG' ? 'SHORT' : 'LONG', entry, stopPct, tpPct);
    if (ctlWalk) {
      const ctlRet = netReturn(ctlWalk.movePct, ctlWalk.exitReason, leverage, costPct, stopSlipPct);
      equityCtl *= (1 + ctlRet / 100);
      tradesCtl.push({ date: today, direction: dir === 'LONG' ? 'SHORT' : 'LONG',
                       tradeReturn: +ctlRet.toFixed(3), exitReason: ctlWalk.exitReason,
                       equity: +equityCtl.toFixed(6) });
      curveCtl.push({ date: today, equity: +equityCtl.toFixed(6) });
    }
  }

  const stats = qmrStats(trades, curve, equity);
  const statsControl = qmrStats(tradesCtl, curveCtl, equityCtl);

  // Paired decomposition — the verdict line. d = (signal - inverse)/2 is the
  // direction call's own per-trade contribution; the paired t is on the same
  // days, so day-selection and market drift cancel out of it by construction.
  const ctlByDate = new Map(tradesCtl.map(t => [t.date, t]));
  const paired = trades.filter(t => ctlByDate.has(t.date));
  let control = null;
  if (paired.length >= 2) {
    const a = paired.map(t => t.tradeReturn);
    const b = paired.map(t => ctlByDate.get(t.date).tradeReturn);
    const d = a.map((v, i) => (v - b[i]) / 2);
    const mean = xs => xs.reduce((s, v) => s + v, 0) / xs.length;
    const mA = mean(a), mB = mean(b), mD = mean(d);
    const sd = Math.sqrt(d.reduce((s, v) => s + (v - mD) ** 2, 0) / (d.length - 1));
    control = {
      n: paired.length,
      meanSignal:   +mA.toFixed(4),
      meanInverse:  +mB.toFixed(4),
      meanCoinFlip: +((mA + mB) / 2).toFixed(4),
      dirAlpha:     +mD.toFixed(4),
      dirAlphaT:    sd > 0 ? +(mD / (sd / Math.sqrt(d.length))).toFixed(2) : null,
      costFloorPct: +(-(costPct * mean(paired.map(t => t.leverage)))).toFixed(4),
      verdict: null,
    };
    control.verdict = control.dirAlphaT != null && control.dirAlphaT >= 2 && control.dirAlpha > 0
      ? 'DIRECTION ADDS — dirAlpha > 0 at t >= 2'
      : 'DIRECTION NULL — dirAlpha indistinguishable from zero; any equity curve here is day-selection + payoff geometry';
  }

  return {
    config: { stopMultiplier, tpPct, riskPct, minRangePct, neutralPct, windowDays,
              liquidityMode, netLiqSignMode, requireLiquidity, directionSource, costPct, stopSlipPct },
    dateRange: { start: trades[0]?.date ?? null, end: trades[trades.length - 1]?.date ?? null },
    trades, curve, stats,
    tradesControl: tradesCtl, curveControl: curveCtl, statsControl,
    control, skips,
    netLiqCoverage: netLiq ? +netLiq.coverage.toFixed(3) : null,
  };
}
