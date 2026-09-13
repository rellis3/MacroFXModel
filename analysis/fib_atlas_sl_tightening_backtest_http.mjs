// HTTP-only re-run of fib_atlas_sl_tightening_backtest.mjs (2026-09-12) —
// IDENTICAL methodology, only `loadTrades`'s data source changed (vote-trades
// HTTP route instead of getJSON against R2). See
// fib_atlas_oos_validate_pair_selection_http.mjs for the same adaptation
// pattern and why (this PC has network access to the live app, no local
// R2/OANDA credentials).
//
//   LADDER=asia node analysis/fib_atlas_sl_tightening_backtest_http.mjs
import {
  applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries,
  priceAtTighterStop, applyPortfolioHeatCap, applyDrawdownThrottle,
} from '../js/levelAtlasVoteReview.js';
import { portfolioStats, backtestStats } from '../js/backtestStats.js';
import { skewness, histCVaR } from '../js/metricsCore.js';
import { intradayMtmDrawdown, tradeTimingStats } from '../js/intradayDrawdown.js';
import { RANGE_FIB_INSTRUMENTS } from '../js/rangeFibEngine.js';

const BASE = process.env.BASE || 'https://macrofxmodel-production.up.railway.app';
const LADDER = (process.env.LADDER || 'asia').toLowerCase();
const LADDER_ROUTE = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };
const MIN_MARGIN = Number(process.env.MIN_MARGIN || 2), MAX_CONCURRENT = 1, RISK_PCT = 1, COST = 0;
const DECISION = (process.env.DECISION || 'all').toLowerCase();
const SIZE_HELD = process.env.SIZE_HELD === 'true';
const FRACTIONS = [1.0, 0.90, 0.75, 0.60, 0.50, 0.40, 0.25];
const HEAT_CAPS = [1, 2, 3];
const PAIRS = RANGE_FIB_INSTRUMENTS;

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (resp.ok || resp.status === 404) return resp;
      if (i === retries) return resp;
    } catch (e) { if (i === retries) return null; }
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
}

async function loadTrades(pair) {
  const routePrefix = LADDER_ROUTE[LADDER];
  if (!routePrefix) throw new Error(`LADDER must be asia|monday, got "${LADDER}"`);
  const resp = await fetchWithRetry(`${BASE}/api/${routePrefix}/vote-trades/${pair.toUpperCase()}?minMargin=${MIN_MARGIN}`);
  if (!resp || !resp.ok) return [];
  const stored = await resp.json();
  const filtered = (stored.trades ?? []).filter(t => DECISION === 'all' || t.decision === DECISION);
  const capped = applyConcurrencyCap(filtered, { maxConcurrent: MAX_CONCURRENT });
  return (capped?.kept ?? []).map(t => ({ ...t, pair: stored.instrument }));
}

async function main() {
  console.log(`Fib Atlas SL-tightening backtest (HTTP re-run) — ladder=${LADDER}  minMargin=${MIN_MARGIN}  decision=${DECISION}  sizeHeld=${SIZE_HELD}\n`);
  const byPair = {};
  for (const p of PAIRS) byPair[p] = await loadTrades(p);
  const allTrades = Object.values(byPair).flat().sort((a, b) => a.time - b.time);
  if (!allTrades.length) { console.error('No trades loaded — nothing to study.'); process.exit(1); }
  const uniqueDates = [...new Set(allTrades.map(t => t.date))].sort();
  const cutoff = uniqueDates[Math.floor(uniqueDates.length * 0.7)];
  console.log(`${allTrades.length} trades (margin>=${MIN_MARGIN}) across ${PAIRS.length} pairs. Fresh IS/OOS split for THIS study: ${cutoff}\n`);

  function sliceByPair(pred) {
    const out = {};
    for (const p of PAIRS) out[p] = byPair[p].filter(pred);
    return out;
  }
  const isByPair = sliceByPair(t => t.date <= cutoff);
  const oosByPair = sliceByPair(t => t.date > cutoff);

  function applyFraction(perPair, fraction) {
    if (fraction === 1.0) return perPair;
    const out = {};
    for (const p of PAIRS) {
      out[p] = perPair[p].map(t => {
        if (t.maePips == null) return t;
        const priced = priceAtTighterStop(t, t.stopPips * fraction, COST);
        if (!priced) return t;
        const sizingStopPips = SIZE_HELD ? (t.sizingStopPips ?? t.stopPips) : null;
        return { ...t, ...priced, stopPips: Math.min(t.stopPips * fraction, t.stopPips), ...(sizingStopPips != null ? { sizingStopPips } : {}) };
      });
    }
    return out;
  }

  function flatten(perPair) { return Object.values(perPair).flat(); }

  function statsFor(perPair, { heatCapPct = null, throttle = null } = {}) {
    const riskAdj = {};
    for (const p of PAIRS) riskAdj[p] = riskAdjustTrades(perPair[p], RISK_PCT).map(t => ({ ...t, pair: p }));
    let finalByPair = riskAdj, heatSkipped = null;
    if (heatCapPct) {
      const heatResult = applyPortfolioHeatCap(riskAdj, { maxHeatPct: heatCapPct });
      if (heatResult) {
        const byP = {};
        for (const t of heatResult.kept) (byP[t.pair] ??= []).push(t);
        finalByPair = byP;
        heatSkipped = { skipped: heatResult.skippedCount, total: heatResult.totalCount };
      }
    }
    const weights = Object.fromEntries(PAIRS.map(p => [p, 1]));
    const combined = buildPortfolioDailySeries(finalByPair, { weights });
    let dailyFinal = combined.dailyReturns;
    if (throttle) {
      const tr = applyDrawdownThrottle(combined.dailyReturns, combined.dates, throttle);
      if (tr) dailyFinal = tr.dailyReturns;
    }
    const ps = portfolioStats(dailyFinal, { mc: false });

    const allRisk = flatten(finalByPair);
    const losers = allRisk.filter(t => !t.win), winners = allRisk.filter(t => t.win);
    const avgLossRiskAdjPct = losers.length ? losers.reduce((a, t) => a + t.pnlPct, 0) / losers.length : null;
    const avgWinRiskAdjPct = winners.length ? winners.reduce((a, t) => a + t.pnlPct, 0) / winners.length : null;
    const rawLosers = flatten(perPair).filter(t => !t.win);
    const avgLossRawPct = rawLosers.length ? rawLosers.reduce((a, t) => a + Math.abs(t.pnlPct), 0) / rawLosers.length : null;

    const perTradeWinRate = allRisk.length ? +(allRisk.filter(t => t.win).length / allRisk.length * 100).toFixed(1) : null;
    const byDate = {};
    for (const t of allRisk) (byDate[t.date] ??= []).push(t);
    const days = Object.values(byDate);
    const perDayWinRate = days.length ? +(days.filter(ds => ds.reduce((a, t) => a + t.pnlPct, 0) > 0).length / days.length * 100).toFixed(1) : null;

    const skew = combined.dailyReturns.length >= 3 ? +skewness(combined.dailyReturns).toFixed(3) : null;
    const cvar95 = combined.dailyReturns.length ? +histCVaR(combined.dailyReturns, 0.95).toFixed(4) : null;

    const mtm = intradayMtmDrawdown(allRisk.map(t => ({
      entryTime: t.time, exitTime: t.resolveTime, finalPnl: t.pnlPct, maePct: Math.abs(t.maePct ?? 0),
    })));
    const timing = tradeTimingStats(allRisk.map(t => ({ entryTime: t.time, exitTime: t.resolveTime, maePct: Math.abs(t.maePct ?? 0) })));

    return {
      trades: allRisk.length, days: combined.dailyReturns.length,
      perTradeWinRate, perDayWinRate,
      sharpe: ps.sharpe, maxDD: ps.maxDD, cagr: ps.cagr, calmar: ps.calmar,
      profitFactor: (() => {
        const gp = allRisk.filter(t => t.win).reduce((a, t) => a + t.pnlPct, 0);
        const gl = -allRisk.filter(t => !t.win).reduce((a, t) => a + t.pnlPct, 0);
        return gl > 1e-9 ? +(gp / gl).toFixed(2) : null;
      })(),
      avgLossRiskAdjPct: avgLossRiskAdjPct != null ? +avgLossRiskAdjPct.toFixed(3) : null,
      avgWinRiskAdjPct: avgWinRiskAdjPct != null ? +avgWinRiskAdjPct.toFixed(3) : null,
      avgLossRawPct: avgLossRawPct != null ? +avgLossRawPct.toFixed(4) : null,
      skew, cvar95, heatSkipped,
      mtmMaxDD: mtm.maxDD, closedMaxDD: ps.maxDD, mtmCoverage: mtm.coverage,
      medianDurationMin: timing.medianDurationMin, avgDurationMin: timing.avgDurationMin,
      pnls: allRisk.map(t => t.pnlPct), dates: allRisk.map(t => t.date),
    };
  }

  function printRow(label, s) {
    console.log([
      label.padEnd(14), String(s.trades).padStart(6),
      (s.perTradeWinRate + '%').padStart(9), (s.perDayWinRate + '%').padStart(9),
      String(s.sharpe).padStart(7), (s.maxDD + '%').padStart(8), (s.cagr + '%').padStart(9),
      String(s.calmar).padStart(6), String(s.profitFactor).padStart(6),
      (s.avgWinRiskAdjPct + '%').padStart(9), (s.avgLossRiskAdjPct + '%').padStart(9),
      (s.avgLossRawPct + '%').padStart(10), String(s.skew).padStart(7), String(s.cvar95).padStart(8),
    ].join('  '));
  }
  function header() {
    console.log([
      'variant'.padEnd(14), 'trades'.padStart(6), 'tradeWin%'.padStart(9), 'dayWin%'.padStart(9),
      'sharpe'.padStart(7), 'maxDD'.padStart(8), 'CAGR'.padStart(9), 'Calmar'.padStart(6), 'PF'.padStart(6),
      'avgWin(R%)'.padStart(9), 'avgLoss(R%)'.padStart(9),
      'avgLoss(raw%)'.padStart(10), 'skew'.padStart(7), 'CVaR95'.padStart(8),
    ].join('  '));
  }

  console.log('──── IN-SAMPLE (fit + evaluate on the same slice) ────');
  header();
  const isBaseline = statsFor(isByPair);
  printRow('baseline', isBaseline);
  const isRows = [];
  for (const f of FRACTIONS) {
    if (f === 1.0) continue;
    const s = statsFor(applyFraction(isByPair, f));
    isRows.push({ f, ...s });
    printRow(`frac=${f}`, s);
  }

  const sharpes = [isBaseline.sharpe, ...isRows.map(r => r.sharpe)];
  const monotonicUp = sharpes.every((v, i) => i === 0 || v >= sharpes[i - 1]);
  const monotonicDown = sharpes.every((v, i) => i === 0 || v <= sharpes[i - 1]);
  if (monotonicUp || monotonicDown) {
    console.log(`\n⚠ IS Sharpe is MONOTONIC across the whole fraction grid (${monotonicUp ? 'always improves as the stop tightens' : 'always worsens as the stop tightens'}) — no interior peak.`);
  } else {
    console.log('\n✓ IS Sharpe has an interior peak across the fraction grid (not monotonic) — a real trade-off, not an edge-of-grid artifact.');
  }

  const eligible = isRows.filter(r => r.maxDD > isBaseline.maxDD);
  const chosen = eligible.length ? eligible.reduce((best, r) => (r.sharpe > best.sharpe ? r : best)) : null;
  console.log(chosen
    ? `\nChosen (pre-stated rule v2: among fractions with lower maxDD than baseline, the one with the HIGHEST IS Sharpe): fraction=${chosen.f}\n`
    : `\nNo fraction improved maxDD over baseline — none frozen for OOS.\n`);

  console.log('──── OUT-OF-SAMPLE (fraction frozen from IS, applied unchanged) ────');
  header();
  const oosBaseline = statsFor(oosByPair);
  printRow('baseline', oosBaseline);
  let oosChosen = null;
  if (chosen) { oosChosen = statsFor(applyFraction(oosByPair, chosen.f)); printRow(`frac=${chosen.f}`, oosChosen); }
  console.log('\n(full OOS grid, for context beyond just the chosen fraction:)');
  for (const f of FRACTIONS) {
    if (f === 1.0) continue;
    printRow(`frac=${f}`, statsFor(applyFraction(oosByPair, f)));
  }

  console.log('\n──── Heat-cap sweep on OOS (baseline vs chosen fraction, if any) ────');
  console.log('cap%    variant       trades   sharpe   maxDD      skipped/total');
  for (const cap of HEAT_CAPS) {
    const s = statsFor(oosByPair, { heatCapPct: cap });
    console.log(`${String(cap).padStart(3)}%    baseline      ${String(s.trades).padStart(6)}   ${String(s.sharpe).padStart(6)}   ${(s.maxDD + '%').padStart(7)}   ${s.heatSkipped ? `${s.heatSkipped.skipped}/${s.heatSkipped.total}` : '—'}`);
    if (chosen) {
      const sc = statsFor(applyFraction(oosByPair, chosen.f), { heatCapPct: cap });
      console.log(`${String(cap).padStart(3)}%    frac=${chosen.f}     ${String(sc.trades).padStart(6)}   ${String(sc.sharpe).padStart(6)}   ${(sc.maxDD + '%').padStart(7)}   ${sc.heatSkipped ? `${sc.heatSkipped.skipped}/${sc.heatSkipped.total}` : '—'}`);
    }
  }

  console.log('\n──── Combined lever stack on OOS (chosen fraction + heat cap + drawdown throttle) ────');
  header();
  const THROTTLE_OPTS = { triggerDD: -5, restoreDD: 0, throttleMult: 0.5 };
  if (chosen) {
    printRow('baseline', oosBaseline);
    printRow(`frac=${chosen.f}`, oosChosen);
    printRow(`+heatCap2%`, statsFor(applyFraction(oosByPair, chosen.f), { heatCapPct: 2 }));
    printRow(`+throttle`, statsFor(applyFraction(oosByPair, chosen.f), { throttle: THROTTLE_OPTS }));
    printRow(`+both`, statsFor(applyFraction(oosByPair, chosen.f), { heatCapPct: 2, throttle: THROTTLE_OPTS }));
  } else {
    console.log('(no fraction was chosen — skipping the combined stack)');
  }

  console.log('\n──── Sharpe confidence interval (bootstrap 5th/50th/95th pctile, OOS, PER-TRADE basis — NOT the daily Sharpe in the tables above) ────');
  for (const [label, s] of [['baseline', oosBaseline], ...(oosChosen ? [[`frac=${chosen.f}`, oosChosen]] : [])]) {
    const bs = backtestStats(s.pnls, s.dates);
    console.log(`  ${label.padEnd(12)} per-trade point=${bs.sharpe}   90% CI=[${bs.bootstrap?.sharpe?.p5 ?? '—'}, ${bs.bootstrap?.sharpe?.p95 ?? '—'}]   P(profitable)=${bs.bootstrap?.pPositive ?? '—'}   (daily-basis Sharpe from table above: ${s.sharpe})`);
  }

  console.log('\n──── Intraday mark-to-market drawdown vs closed-trade-only maxDD (OOS) ────');
  for (const [label, s] of [['baseline', oosBaseline], ...(oosChosen ? [[`frac=${chosen.f}`, oosChosen]] : [])]) {
    console.log(`  ${label.padEnd(12)} closed maxDD=${s.closedMaxDD}%   intraday MTM maxDD=${s.mtmMaxDD}%   coverage=${s.mtmCoverage}   medianDur=${s.medianDurationMin}min`);
  }

  console.log('\n──── Tail-contribution check: how concentrated is baseline\'s OOS loss? ────');
  {
    const allBaseRisk = [];
    for (const p of PAIRS) allBaseRisk.push(...riskAdjustTrades(oosByPair[p], RISK_PCT));
    const losers = allBaseRisk.filter(t => !t.win).map(t => t.pnlPct).sort((a, b) => a - b);
    const totalLoss = -losers.reduce((s, x) => s + x, 0);
    if (losers.length && totalLoss > 0) {
      for (const pct of [1, 5, 10, 25]) {
        const n = Math.max(1, Math.round(losers.length * pct / 100));
        const worstSum = -losers.slice(0, n).reduce((s, x) => s + x, 0);
        console.log(`  worst ${String(pct).padStart(2)}% of losers (n=${n}/${losers.length}) account for ${(worstSum / totalLoss * 100).toFixed(1)}% of total realized loss`);
      }
      const worstSingle = -losers[0];
      console.log(`  single worst loser: ${worstSingle.toFixed(4)}% (${(worstSingle / totalLoss * 100).toFixed(2)}% of total loss on its own)`);
    } else {
      console.log('  no losing trades found in this slice — nothing to rank.');
    }
  }

  if (chosen) {
    console.log('\n──── Finer heat-cap x throttle sweep on chosen fraction (OOS) — looking for the actual floor ────');
    console.log('cap%   triggerDD   sharpe   maxDD      trades');
    const CAPS2 = [1, 2, 3, 5];
    const TRIGGERS = [-2, -5, -8];
    let best = null;
    for (const cap of CAPS2) {
      for (const trig of TRIGGERS) {
        const s = statsFor(applyFraction(oosByPair, chosen.f), { heatCapPct: cap, throttle: { triggerDD: trig, restoreDD: 0, throttleMult: 0.5 } });
        console.log(`${String(cap).padStart(3)}%   ${String(trig).padStart(9)}%   ${String(s.sharpe).padStart(6)}   ${(s.maxDD + '%').padStart(7)}   ${String(s.trades).padStart(6)}`);
        if (!best || s.maxDD > best.s.maxDD) best = { cap, trig, s };
      }
    }
    if (best) console.log(`\nShallowest maxDD found: ${best.s.maxDD}% at heatCap=${best.cap}% / triggerDD=${best.trig}% (Sharpe ${best.s.sharpe})`);
  }
}

main();
