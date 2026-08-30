// Tests the drawdown throttle (applyDrawdownThrottle, already-existing
// infrastructure, exposed as a toggle on level-atlas-vote-portfolio.html but
// never independently validated with the rigor everything else this session
// got). Built to directly answer "least drawdown" -- unlike the SL-fraction/
// fade-stop-tightening levers, the throttle operates on the DAILY RETURN
// SERIES (scales a bad stretch's realized daily P&L by throttleMult once
// equity drawdown breaches triggerDD, restores at restoreDD), not by
// re-pricing individual trades' declared stop -- so it has NO leverage-
// conflation risk (fixed-fractional sizing per trade is never touched).
//
// Tested on the FULL real portfolio (fade + follow combined, margin>=3),
// not an isolated slice -- the early-exit work found isolated-fade-only
// backtests overstate real portfolio impact.
//
// Same rigor as everything else: real per-pair cost (baked into the stored
// votetrades already), realistic 1% account-wide heat cap, IS-fit/OOS-freeze
// via a PRE-STATED rule, Sharpe CI computed on the SAME daily-return basis
// the headline Sharpe uses (the bug fixed elsewhere this session).
//
// Selection rule DELIBERATELY optimizes for shallowest maxDD (not best
// Sharpe) subject to a Sharpe floor -- matching the user's actual stated
// goal for this lever, not a generic "best risk-adjusted return" pick.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries, applyPortfolioHeatCap, applyDrawdownThrottle } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { sharpeStdError } from '../js/metricsCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, 'output', 'level-atlas-vote-trades');
const MIN_MARGIN = 3, MAX_CONCURRENT = 1, RISK_PCT = 0.5, MAX_HEAT_PCT = 1;
const RESTORE_DD = -2; // fixed at the page's own UI default -- gridding trigger x mult only, keeps this tractable
const TRIGGERS = [-3, -5, -8, -10, -12, -15];
const MULTS = [0.25, 0.5, 0.75];
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

function loadTrades(pair) {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, `${pair}-votetrades.json`), 'utf8'));
  const filtered = raw.trades.filter(t => t.margin >= MIN_MARGIN); // BOTH decisions -- the real, full book
  const capped = applyConcurrencyCap(filtered, { maxConcurrent: MAX_CONCURRENT });
  return capped.kept.map(t => ({ ...t, pair: raw.instrument }));
}

const byPair = {};
for (const p of PAIRS) byPair[p] = loadTrades(p);
const allTrades = Object.values(byPair).flat().sort((a, b) => a.time - b.time);
const uniqueDates = [...new Set(allTrades.map(t => t.date))].sort();
const cutoff = uniqueDates[Math.floor(uniqueDates.length * 0.7)];
console.log(`${allTrades.length} trades (margin>=${MIN_MARGIN}, fade+follow) across ${PAIRS.length} pairs. IS/OOS split: ${cutoff}\n`);

function sliceByPair(pred) {
  const out = {};
  for (const p of PAIRS) out[p] = byPair[p].filter(pred);
  return out;
}
const isByPair = sliceByPair(t => t.date <= cutoff);
const oosByPair = sliceByPair(t => t.date > cutoff);

function statsFor(perPair, { triggerDD = null, restoreDD = RESTORE_DD, throttleMult = 0.5, heatCap = true } = {}) {
  const riskAdj = {};
  for (const p of PAIRS) riskAdj[p] = riskAdjustTrades(perPair[p], RISK_PCT);
  let final = riskAdj;
  if (heatCap) {
    const heatResult = applyPortfolioHeatCap(riskAdj, { maxHeatPct: MAX_HEAT_PCT });
    if (heatResult) {
      final = {};
      for (const t of heatResult.kept) (final[t.pair] ??= []).push(t);
    }
  }
  const weights = Object.fromEntries(Object.keys(final).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(final, { weights });
  let dailyReturns = combined.dailyReturns;
  if (triggerDD != null) {
    const tr = applyDrawdownThrottle(dailyReturns, combined.dates, { triggerDD, restoreDD, throttleMult });
    if (tr) dailyReturns = tr.dailyReturns;
  }
  const ps = portfolioStats(dailyReturns, { mc: false });
  const se = ps.days > 1 ? sharpeStdError(ps.sharpe, ps.days, 252) : Infinity;
  const sharpeCI95 = isFinite(se) ? [+(ps.sharpe - 1.96 * se).toFixed(2), +(ps.sharpe + 1.96 * se).toFixed(2)] : null;
  const all = Object.values(final).flat();
  return {
    trades: all.length, sharpe: ps.sharpe, sharpeCI95, maxDD: ps.maxDD,
    cagr: ps.cagr, annVol: ps.annVol, profitFactor: ps.profitFactor,
  };
}

function ciStr(s) { return s.sharpeCI95 ? `[${s.sharpeCI95[0]}, ${s.sharpeCI95[1]}]` : '—'; }
function printRow(label, s) {
  console.log([label.padEnd(18), String(s.trades).padStart(6), String(s.sharpe).padStart(7),
    ciStr(s).padStart(14), (s.maxDD + '%').padStart(8), (s.cagr + '%').padStart(9), String(s.profitFactor).padStart(6)].join('  '));
}
function header() {
  console.log(['config'.padEnd(18), 'trades'.padStart(6), 'sharpe'.padStart(7), 'sharpeCI95'.padStart(14),
    'maxDD'.padStart(8), 'CAGR'.padStart(9), 'PF'.padStart(6)].join('  '));
}

console.log('──── IN-SAMPLE (fit), realistic 1% heat cap always on ────');
header();
const isBaseline = statsFor(isByPair, { triggerDD: null });
printRow('baseline (no throttle)', isBaseline);
const isRows = [];
for (const trig of TRIGGERS) {
  for (const mult of MULTS) {
    const s = statsFor(isByPair, { triggerDD: trig, throttleMult: mult });
    isRows.push({ trig, mult, ...s });
    printRow(`trig=${trig},mult=${mult}`, s);
  }
}

// Pre-stated rule: SHALLOWEST maxDD (closest to zero -- these are negative %)
// among candidates that keep IS Sharpe >= 90% of baseline. Deliberately
// optimizing for drawdown, not Sharpe, since that's the actual question.
const sharpeFloor = isBaseline.sharpe * 0.9;
const eligible = isRows.filter(r => r.sharpe >= sharpeFloor).sort((a, b) => b.maxDD - a.maxDD);
const chosen = eligible[0] ?? null;
console.log(chosen
  ? `\nChosen (pre-stated rule: shallowest IS maxDD with Sharpe >= 90% of baseline [${sharpeFloor.toFixed(2)}]): trigger=${chosen.trig}, mult=${chosen.mult}, restore=${RESTORE_DD}\n`
  : '\nNo config cleared the pre-stated bar -- none frozen for OOS.\n');

console.log('──── OUT-OF-SAMPLE (config frozen from IS, applied unchanged) ────');
header();
printRow('baseline (no throttle)', statsFor(oosByPair, { triggerDD: null }));
if (chosen) printRow(`trig=${chosen.trig},mult=${chosen.mult}`, statsFor(oosByPair, { triggerDD: chosen.trig, throttleMult: chosen.mult }));
console.log('\n(full OOS grid, for context:)');
for (const trig of TRIGGERS) {
  for (const mult of MULTS) {
    printRow(`trig=${trig},mult=${mult}`, statsFor(oosByPair, { triggerDD: trig, throttleMult: mult }));
  }
}
