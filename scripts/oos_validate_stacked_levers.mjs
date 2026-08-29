// Fade-stop tightening (oos_validate_fade_stop.mjs) and the currency loss
// gate (oos_validate_currency_loss_gate.mjs) were each OOS-validated
// INDIVIDUALLY against the plain baseline. Never checked together. They
// could interact: fade-stop tightening re-prices some fade trades to a
// SMALLER loss, which changes each day's realized per-currency loss total —
// exactly what the currency gate's tally reacts to. Applying both changes
// which trades the gate blocks, not just adding two independent effects.
//
// Reproduces the LIVE route's exact composition order (js/levelAtlasRoutes.js):
// margin filter -> [fade-stop tighten] -> per-pair concurrency cap ->
// riskAdjustTrades -> [currency loss gate, cross-pair]. Both levers keep
// their ALREADY-validated parameters (fade-stop: per-pair stop chosen fresh
// from IS-only data, same as its own OOS script; currency gate: frozen at
// the already-chosen 1%) -- this test is NOT re-deriving new parameters,
// it's checking the ALREADY-VALIDATED combination doesn't cancel itself out.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  applyConcurrencyCap, buildPortfolioDailySeries, riskAdjustTrades,
  applyFadeStopTightening, priceAtTighterStop, applyCurrencyLossGate,
} from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'analysis', 'output', 'level-atlas-vote-trades');
const MIN_MARGIN = 3, MAX_CONCURRENT = 1, RISK_PCT = 1, MAX_DAILY_LOSS_PCT = 1;
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

const storedByPair = {};
for (const p of PAIRS) {
  storedByPair[p] = JSON.parse(fs.readFileSync(path.join(DIR, `${p}-votetrades.json`), 'utf8'));
}

// Split date from the plain (no levers) combined portfolio, same convention
// as every other OOS script this session.
function buildPlain(tradesBySym) {
  const weights = Object.fromEntries(Object.keys(tradesBySym).map(s => [s, 1]));
  return buildPortfolioDailySeries(tradesBySym, { weights });
}
const plainPerPair = {};
for (const p of PAIRS) {
  const stored = storedByPair[p];
  const filtered = stored.trades.filter(t => t.margin >= MIN_MARGIN);
  const capped = applyConcurrencyCap(filtered, { maxConcurrent: MAX_CONCURRENT });
  plainPerPair[stored.instrument] = riskAdjustTrades(capped.kept, RISK_PCT).map(t => ({ ...t, pair: stored.instrument }));
}
const combinedDates = buildPlain(plainPerPair).dates;
const cutoff = combinedDates[Math.floor(combinedDates.length * 0.7)];
console.log(`Split date: ${cutoff}\n`);

// Build ONE pipeline per config: fadeStop on/off, ccyGate on/off. Returns
// {isTrades, oosTrades} as pair->trades maps, matching the route's own order.
function buildPipeline({ fadeStop, ccyGate }) {
  const isPerPair = {}, oosPerPair = {};
  for (const p of PAIRS) {
    const stored = storedByPair[p];
    let filtered = stored.trades.filter(t => t.margin >= MIN_MARGIN);
    const isFiltered = filtered.filter(t => t.date <= cutoff);
    const oosFiltered = filtered.filter(t => t.date > cutoff);

    let isFinal = isFiltered, oosFinal = oosFiltered;
    if (fadeStop) {
      // Choose the tighter stop from IS-only fade trades (same discipline as
      // oos_validate_fade_stop.mjs), freeze it, apply unchanged to OOS.
      const tightened = applyFadeStopTightening(isFiltered, { cost: stored.cost });
      isFinal = tightened.trades;
      if (tightened.stopPips != null) {
        oosFinal = oosFiltered.map(t => {
          if (t.decision !== 'fade') return t;
          const priced = priceAtTighterStop(t, tightened.stopPips, stored.cost);
          return priced ? { ...t, ...priced, stopPips: Math.min(tightened.stopPips, t.stopPips) } : t;
        });
      }
    }

    const isCapped = applyConcurrencyCap(isFinal, { maxConcurrent: MAX_CONCURRENT });
    const oosCapped = applyConcurrencyCap(oosFinal, { maxConcurrent: MAX_CONCURRENT });
    isPerPair[stored.instrument] = riskAdjustTrades(isCapped.kept, RISK_PCT).map(t => ({ ...t, pair: stored.instrument }));
    oosPerPair[stored.instrument] = riskAdjustTrades(oosCapped.kept, RISK_PCT).map(t => ({ ...t, pair: stored.instrument }));
  }

  if (ccyGate) {
    const isMerged = Object.values(isPerPair).flat();
    const oosMerged = Object.values(oosPerPair).flat();
    const isGated = applyCurrencyLossGate(isMerged, { maxDailyLossPct: MAX_DAILY_LOSS_PCT });
    const oosGated = applyCurrencyLossGate(oosMerged, { maxDailyLossPct: MAX_DAILY_LOSS_PCT });
    const isByPair = {}, oosByPair = {};
    for (const t of isGated.kept) (isByPair[t.pair] ??= []).push(t);
    for (const t of oosGated.kept) (oosByPair[t.pair] ??= []).push(t);
    return { isPerPair: isByPair, oosPerPair: oosByPair };
  }
  return { isPerPair, oosPerPair };
}

function statsFor(tradesBySym) {
  const weights = Object.fromEntries(Object.keys(tradesBySym).map(s => [s, 1]));
  const combined = buildPortfolioDailySeries(tradesBySym, { weights });
  return portfolioStats(combined.dailyReturns, { mc: false });
}

const configs = [
  { name: 'baseline (neither)', fadeStop: false, ccyGate: false },
  { name: 'fade-stop only', fadeStop: true, ccyGate: false },
  { name: 'currency gate only', fadeStop: false, ccyGate: true },
  { name: 'BOTH (stacked)', fadeStop: true, ccyGate: true },
];

const results = [];
for (const cfg of configs) {
  const { isPerPair, oosPerPair } = buildPipeline(cfg);
  const isStats = statsFor(isPerPair);
  const oosStats = statsFor(oosPerPair);
  results.push({ ...cfg, isStats, oosStats });
}

console.log('IS (each config\'s own IS pipeline):');
for (const r of results) {
  console.log(`  ${r.name.padEnd(20)} Sharpe ${String(r.isStats.sharpe).padEnd(5)} annVol ${String(r.isStats.annVol).padEnd(6)} maxDD ${String(r.isStats.maxDD).padEnd(7)} CVaR95 ${r.isStats.cvar95}`);
}
console.log('\nOOS (frozen from IS, applied unchanged):');
for (const r of results) {
  console.log(`  ${r.name.padEnd(20)} Sharpe ${String(r.oosStats.sharpe).padEnd(5)} annVol ${String(r.oosStats.annVol).padEnd(6)} maxDD ${String(r.oosStats.maxDD).padEnd(7)} CVaR95 ${r.oosStats.cvar95}`);
}

const base = results[0].oosStats, fade = results[1].oosStats, gate = results[2].oosStats, both = results[3].oosStats;
console.log('\nOOS deltas vs baseline:');
console.log(`  fade-stop only:      Sharpe ${(fade.sharpe - base.sharpe).toFixed(2)}  annVol ${(fade.annVol - base.annVol).toFixed(1)}pp  maxDD ${(fade.maxDD - base.maxDD).toFixed(2)}pp  CVaR95 ${(fade.cvar95 - base.cvar95).toFixed(2)}pp`);
console.log(`  currency gate only:  Sharpe ${(gate.sharpe - base.sharpe).toFixed(2)}  annVol ${(gate.annVol - base.annVol).toFixed(1)}pp  maxDD ${(gate.maxDD - base.maxDD).toFixed(2)}pp  CVaR95 ${(gate.cvar95 - base.cvar95).toFixed(2)}pp`);
console.log(`  BOTH stacked:        Sharpe ${(both.sharpe - base.sharpe).toFixed(2)}  annVol ${(both.annVol - base.annVol).toFixed(1)}pp  maxDD ${(both.maxDD - base.maxDD).toFixed(2)}pp  CVaR95 ${(both.cvar95 - base.cvar95).toFixed(2)}pp`);

const sumSharpe = (fade.sharpe - base.sharpe) + (gate.sharpe - base.sharpe);
const sumCvar = (fade.cvar95 - base.cvar95) + (gate.cvar95 - base.cvar95);
console.log(`\nSum of INDIVIDUAL deltas (naive additivity check): Sharpe ${sumSharpe.toFixed(2)}  CVaR95 ${sumCvar.toFixed(2)}pp`);
console.log(`Actual STACKED delta:                              Sharpe ${(both.sharpe - base.sharpe).toFixed(2)}  CVaR95 ${(both.cvar95 - base.cvar95).toFixed(2)}pp`);
