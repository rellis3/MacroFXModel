// SL-tightening backtest -- follow-up to mae_timing_study.mjs's finding
// (a fade trade that reaches ~75% of its stop distance goes on to lose
// 2x more often than one that hasn't, at every time horizon tested).
// That's a loss-RATE lift, not proof a tighter stop actually helps the
// portfolio -- some of the trades cut early would have recovered into full
// winners. This script turns the finding into the actual question asked:
// does a uniform fraction-of-current-stop tightening produce a REAL lower
// portfolio maxDD and smaller average SL-loss size, without giving up more
// edge than it's worth? Compared against both doing nothing (baseline) and
// what's ALREADY live (applyFadeStopTightening, the per-pair winners'-MAE-
// percentile stop, on by default in volatility_bot_v2's config).
//
// Same rigor discipline as scripts/oos_validate_currency_loss_gate.mjs:
// pick the candidate on an IS slice by a PRE-STATED rule, freeze it, then
// report what that SAME frozen choice does on held-out OOS -- not just the
// single best-looking number from one pass. Pure analysis; does not touch
// volatility_bot_v2 or any live config.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries,
  priceAtTighterStop, applyFadeStopTightening,
} from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, 'output', 'level-atlas-vote-trades');
const MIN_MARGIN = 3, MAX_CONCURRENT = 1, RISK_PCT = 0.5, COST = 0; // matches volatility_bot_v2 DEFAULT_CFG risk_pct
const FRACTIONS = [1.0, 0.90, 0.75, 0.60, 0.50, 0.40, 0.25]; // 1.0 = baseline, unchanged

// The "Select recommended" 17-pair live set.
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

function loadFadeTrades(pair) {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, `${pair}-votetrades.json`), 'utf8'));
  const filtered = raw.trades.filter(t => t.margin >= MIN_MARGIN && t.decision === 'fade');
  const capped = applyConcurrencyCap(filtered, { maxConcurrent: MAX_CONCURRENT });
  return capped.kept.map(t => ({ ...t, pair: raw.instrument }));
}

const byPair = {};
for (const p of PAIRS) byPair[p] = loadFadeTrades(p);
const allTrades = Object.values(byPair).flat().sort((a, b) => a.time - b.time);
const uniqueDates = [...new Set(allTrades.map(t => t.date))].sort();
const cutoff = uniqueDates[Math.floor(uniqueDates.length * 0.7)];
console.log(`${allTrades.length} fade trades (margin>=${MIN_MARGIN}) across ${PAIRS.length} pairs. IS/OOS split: ${cutoff}\n`);

function sliceByPair(pred) {
  const out = {};
  for (const p of PAIRS) out[p] = byPair[p].filter(pred);
  return out;
}
const isByPair = sliceByPair(t => t.date <= cutoff);
const oosByPair = sliceByPair(t => t.date > cutoff);

// Reprice every trade in a per-pair dict under a candidate, return a same-shaped dict.
function applyFraction(perPair, fraction) {
  if (fraction === 1.0) return perPair;
  const out = {};
  for (const p of PAIRS) {
    out[p] = perPair[p].map(t => {
      const priced = priceAtTighterStop(t, t.stopPips * fraction, COST);
      return priced ? { ...t, ...priced, stopPips: Math.min(t.stopPips * fraction, t.stopPips) } : t;
    });
  }
  return out;
}

// Mirrors applyFadeStopTightening exactly, applied PER PAIR (respects its own
// pip-scale discipline) on whatever slice is passed in.
function applyLiveTightening(perPair) {
  const out = {};
  for (const p of PAIRS) {
    const { trades } = applyFadeStopTightening(perPair[p], { cost: COST, minN: 30 });
    out[p] = trades;
  }
  return out;
}

function statsFor(perPair) {
  const riskAdj = {};
  let allRisk = [];
  for (const p of PAIRS) {
    const r = riskAdjustTrades(perPair[p], RISK_PCT);
    riskAdj[p] = r;
    allRisk.push(...r);
  }
  const weights = Object.fromEntries(PAIRS.map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(riskAdj, { weights });
  const ps = portfolioStats(combined.dailyReturns, { mc: false });

  const losers = allRisk.filter(t => !t.win);
  const winners = allRisk.filter(t => t.win);
  const avgLossRiskAdjPct = losers.length ? losers.reduce((a, t) => a + t.pnlPct, 0) / losers.length : null;
  const avgWinRiskAdjPct = winners.length ? winners.reduce((a, t) => a + t.pnlPct, 0) / winners.length : null;
  // Raw (pre-risk-adjustment) loss size in %-of-price -- shows the effect of
  // the tighter stop itself, independent of the sizing model's rescaling.
  const rawLosers = Object.values(perPair).flat().filter(t => !t.win);
  const avgLossRawPct = rawLosers.length ? rawLosers.reduce((a, t) => a + Math.abs(t.pnlPct), 0) / rawLosers.length : null;

  return {
    trades: allRisk.length,
    winRate: +(allRisk.filter(t => t.win).length / allRisk.length * 100).toFixed(1),
    sharpe: ps.sharpe, maxDD: ps.maxDD, cagr: ps.cagr, annVol: ps.annVol, cvar95: ps.cvar95,
    avgLossRiskAdjPct: avgLossRiskAdjPct != null ? +avgLossRiskAdjPct.toFixed(3) : null,
    avgWinRiskAdjPct: avgWinRiskAdjPct != null ? +avgWinRiskAdjPct.toFixed(3) : null,
    avgLossRawPct: avgLossRawPct != null ? +avgLossRawPct.toFixed(4) : null,
    profitFactor: (() => {
      const gp = allRisk.filter(t => t.win).reduce((a, t) => a + t.pnlPct, 0);
      const gl = -allRisk.filter(t => !t.win).reduce((a, t) => a + t.pnlPct, 0);
      return gl > 1e-9 ? +(gp / gl).toFixed(2) : null;
    })(),
  };
}

function printRow(label, s) {
  console.log([
    label.padEnd(16),
    String(s.trades).padStart(6),
    (s.winRate + '%').padStart(7),
    String(s.sharpe).padStart(7),
    (s.maxDD + '%').padStart(8),
    (s.cagr + '%').padStart(8),
    String(s.profitFactor).padStart(6),
    (s.avgLossRiskAdjPct + '%').padStart(10),
    (s.avgLossRawPct + '%').padStart(10),
  ].join('  '));
}
function header() {
  console.log([
    'variant'.padEnd(16), 'trades'.padStart(6), 'winRate'.padStart(7), 'sharpe'.padStart(7),
    'maxDD'.padStart(8), 'CAGR'.padStart(8), 'PF'.padStart(6), 'avgLoss(riskAdj)'.padStart(10), 'avgLoss(raw%)'.padStart(10),
  ].join('  '));
}

console.log('──── IN-SAMPLE (fit + evaluate on the same slice) ────');
header();
const isBaseline = statsFor(isByPair);
printRow('baseline', isBaseline);
printRow('live-tighten', statsFor(applyLiveTightening(isByPair)));
const isRows = [];
for (const f of FRACTIONS) {
  if (f === 1.0) continue;
  const s = statsFor(applyFraction(isByPair, f));
  isRows.push({ f, ...s });
  printRow(`frac=${f}`, s);
}

// Pre-stated selection rule (same shape as the currency-gate script):
// tightest fraction that keeps IS Sharpe >= 90% of baseline IS Sharpe AND
// actually SHALLOWS maxDD vs baseline. maxDD values are negative %, so
// "shallower" means closer to zero, i.e. r.maxDD > isBaseline.maxDD --
// tightening that doesn't even help DD isn't a candidate worth freezing.
const sharpeFloor = isBaseline.sharpe * 0.9;
const eligible = isRows.filter(r => r.sharpe >= sharpeFloor && r.maxDD > isBaseline.maxDD).sort((a, b) => a.f - b.f);
const chosen = eligible[0] ?? null;
console.log(chosen
  ? `\nChosen (pre-stated rule: tightest fraction with IS Sharpe >= 90% of baseline [${sharpeFloor.toFixed(2)}] AND lower maxDD): fraction=${chosen.f}\n`
  : `\nNo fraction cleared the pre-stated bar (IS Sharpe >= 90% of baseline AND lower maxDD) -- none frozen for OOS.\n`);

console.log('──── OUT-OF-SAMPLE (threshold frozen from IS, applied unchanged) ────');
header();
printRow('baseline', statsFor(oosByPair));
printRow('live-tighten', statsFor(applyLiveTightening(oosByPair)));
if (chosen) printRow(`frac=${chosen.f}`, statsFor(applyFraction(oosByPair, chosen.f)));
// Also show the full OOS grid for context, not just the chosen one.
console.log('\n(full OOS grid, for context beyond just the chosen fraction:)');
for (const f of FRACTIONS) {
  if (f === 1.0) continue;
  printRow(`frac=${f}`, statsFor(applyFraction(oosByPair, f)));
}
