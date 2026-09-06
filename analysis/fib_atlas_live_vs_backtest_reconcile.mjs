#!/usr/bin/env node
/**
 * Fib Atlas live/demo vs. offline-backtest reconciliation (2026-09-06).
 *
 * Owner is starting a DEMO account run tomorrow and wants to know, after a
 * week, whether the real trades the bot took match what the backtest says.
 * This script answers that directly rather than by inspection:
 *
 *   1. Pulls the real trade history for a date range from the dashboard's
 *      `/api/fib-atlas-bot/trade-log` route — the durable
 *      `fib_atlas_bot_trade_log` (closed trades, each decoded from its
 *      `FA[<dedupeTag>]` comment into ladder/side/rung) plus the matching
 *      `fib_atlas_bot_decision_log` events (now carrying the plan's own
 *      entry/sl/tp at decision time — see fib_atlas_bot.py's
 *      `_record_decision`).
 *   2. Re-runs the SAME offline backtest pipeline (`runOne` from
 *      asiaFibAtlasRoutes.js / mondayFibAtlasRoutes.js — the exact function
 *      the nightly reference-engine-rebuild job and the manual "Regenerate"
 *      button already call) against FRESH M1 data, so the R2-stored
 *      `{pair}-votetrades.json` now covers the demo week too. This is not a
 *      new side effect — it's the same regen the nightly job runs on every
 *      pair, every night; running it here just does it on demand for the
 *      pairs actually traded.
 *   3. Matches each real trade to its live decision-log entry (by pair +
 *      ladder + side + rung + closest timestamp) AND to the offline
 *      backtest's own touch for the same (pair, ladder, side, rung, date)
 *      window, then reports three things side by side per trade: what the
 *      LIVE PLAN told the bot to do, what the bot ACTUALLY did, and what the
 *      OFFLINE BACKTEST (built after the fact from the same real market
 *      data) says should have happened.
 *
 * This deliberately does NOT re-derive the vote/margin/rung math itself —
 * `runOne` IS that math, imported, not copied (Lego Principle 1). A
 * mismatch here means one of: real slippage/spread (live vs backtest entry
 * price), a timing/data discrepancy between the live 45s-poll plan and the
 * walk-forward engine's M1 bars, or a genuine bug — this script can't tell
 * those apart on its own, but it makes the numbers visible so a human can.
 *
 * Usage (run from repo root, needs network to the dashboard + R2 creds):
 *   node analysis/fib_atlas_live_vs_backtest_reconcile.mjs \
 *     --from=2026-09-07 --to=2026-09-13 \
 *     [--base=https://macrofxmodel-production.up.railway.app] \
 *     [--no-regen]   # skip the runOne regen step, just compare against
 *                    # whatever's already in the stored votetrades.json
 *                    # (faster re-run once you've already regenerated once)
 */
import { runOne as runOneAsia } from '../js/asiaFibAtlasRoutes.js';
import { runOne as runOneMonday } from '../js/mondayFibAtlasRoutes.js';
import { getJSON } from '../js/r2Store.js';

const args = process.argv.slice(2);
const argVal = (name, dflt = null) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : dflt;
};
const FROM = argVal('from');
const TO = argVal('to');
const BASE = argVal('base', 'https://macrofxmodel-production.up.railway.app');
const NO_REGEN = args.includes('--no-regen');

if (!FROM || !TO) {
  console.error('Usage: node analysis/fib_atlas_live_vs_backtest_reconcile.mjs --from=YYYY-MM-DD --to=YYYY-MM-DD [--base=URL] [--no-regen]');
  process.exit(1);
}

const LADDER_PREFIX = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };
const RUN_ONE = { asia: runOneAsia, monday: runOneMonday };

// ── 1. Pull the real trade + decision history ──────────────────────────────
console.log(`Fetching real trade/decision log for ${FROM}..${TO} from ${BASE} ...`);
const logResp = await fetch(`${BASE}/api/fib-atlas-bot/trade-log?from=${FROM}&to=${TO}`);
if (!logResp.ok) {
  console.error(`trade-log fetch failed: HTTP ${logResp.status}`);
  process.exit(1);
}
const { trades: realTrades, decisions } = await logResp.json();
console.log(`Got ${realTrades.length} real closed trades, ${decisions.length} decision-log events in range.`);
if (!realTrades.length) {
  console.log('No real trades in this window yet — nothing to reconcile. Run again once the demo account has closed trades.');
  process.exit(0);
}

// ── 2. Match each real trade to its own live decision-log entry ────────────
// Same (pair, ladder, side, rung) key as the dedupeTag decode; closest
// 'entered' decision event AT OR BEFORE the trade's own open time wins (the
// bot enters immediately after the plan tells it to, so this should always
// be within a few seconds — a big gap here is itself worth a second look).
function matchDecision(trade) {
  const candidates = decisions.filter(d =>
    d.status === 'entered' && d.ladder === trade.ladder && d.side === trade.side &&
    d.rung === trade.rung && d.pair && trade.key && d.pair.toLowerCase() === trade.key.toLowerCase() &&
    d.t <= (trade.time_open ?? Infinity) + 5);
  if (!candidates.length) return null;
  return candidates.reduce((best, d) => (trade.time_open - d.t) < (trade.time_open - best.t) ? d : best);
}

// ── 3. Re-run (or reuse) the offline backtest for every pair actually traded ─
const pairsTraded = [...new Set(realTrades.map(t => t.key).filter(Boolean))];
console.log(`Pairs actually traded: ${pairsTraded.join(', ') || '(none resolved — check trade.key)'}`);

const backtestByPairLadder = {};
for (const pair of pairsTraded) {
  for (const ladder of ['asia', 'monday']) {
    if (!realTrades.some(t => t.key === pair && t.ladder === ladder)) continue;
    const bt = `${pair}|${ladder}`;
    if (!NO_REGEN) {
      console.log(`Regenerating offline backtest for ${bt} (fresh M1, includes the demo week)...`);
      try { await RUN_ONE[ladder](pair); } catch (e) { console.error(`  runOne(${bt}) failed: ${e.message} — falling back to whatever's already stored`); }
    }
    try {
      const stored = await getJSON(`${LADDER_PREFIX[ladder]}/${pair}-votetrades.json`);
      backtestByPairLadder[bt] = stored?.trades ?? [];
    } catch (e) {
      console.error(`  could not load ${bt}'s stored votetrades: ${e.message}`);
      backtestByPairLadder[bt] = [];
    }
  }
}

function matchBacktest(trade) {
  const bt = backtestByPairLadder[`${trade.key}|${trade.ladder}`] || [];
  const candidates = bt.filter(t => t.side === trade.side && t.rung === trade.rung && t.date === trade.date);
  if (!candidates.length) return null;
  // Same-day, same-rung ambiguity (rare — a rung can rearm intraday): pick
  // the closest by touch time if the backtest touch carries one.
  if (candidates.length === 1) return candidates[0];
  return candidates.reduce((best, t) => Math.abs((t.time ?? 0) - trade.time_open) < Math.abs((best.time ?? 0) - trade.time_open) ? t : best);
}

// ── 4. Report, trade by trade ───────────────────────────────────────────────
console.log('\n=== Per-trade reconciliation ===');
console.log(['pair', 'ladder', 'side', 'rung', 'date', 'live_decision', 'bt_decision', 'decision_match',
  'live_entry', 'bt_entry', 'entry_diff_pips', 'live_pnl$', 'bt_pnl%'].join('\t'));

let decisionMatches = 0, decisionMismatches = 0, noBacktestMatch = 0, noDecisionMatch = 0;
const entryDiffs = [];
for (const trade of realTrades) {
  const dec = matchDecision(trade);
  const bt = matchBacktest(trade);
  if (!dec) noDecisionMatch++;
  if (!bt) { noBacktestMatch++; continue; }
  const decisionMatch = dec ? (dec.decision === bt.decision ? 'YES' : 'NO') : '?';
  if (dec) { if (decisionMatch === 'YES') decisionMatches++; else decisionMismatches++; }
  const liveEntry = dec?.entry ?? trade.open_price;
  const entryDiffPips = (liveEntry != null && bt.entry != null) ? Math.abs(liveEntry - bt.entry) / (bt.pip ?? 0.0001) : null;
  if (entryDiffPips != null) entryDiffs.push(entryDiffPips);
  console.log([trade.key, trade.ladder, trade.side, trade.rung, trade.date,
    dec?.decision ?? '(no decision-log match)', bt.decision, decisionMatch,
    liveEntry?.toFixed(5) ?? '—', bt.entry?.toFixed(5) ?? '—',
    entryDiffPips?.toFixed(1) ?? '—', trade.profit?.toFixed(2) ?? '—', bt.pnlPct?.toFixed(3) ?? '—',
  ].join('\t'));
}

console.log('\n=== Summary ===');
console.log(`real trades: ${realTrades.length}`);
console.log(`matched to a backtest touch: ${realTrades.length - noBacktestMatch} (${noBacktestMatch} had no matching offline touch — worth investigating each one individually)`);
console.log(`matched to a live decision-log entry: ${realTrades.length - noDecisionMatch}`);
console.log(`decision (fade/follow) agreement: ${decisionMatches} match / ${decisionMismatches} mismatch`);
if (entryDiffs.length) {
  const mean = entryDiffs.reduce((a, b) => a + b, 0) / entryDiffs.length;
  console.log(`entry price diff (live plan vs offline backtest), pips: mean=${mean.toFixed(2)}, max=${Math.max(...entryDiffs).toFixed(2)}`);
}
console.log('\nA handful of unmatched trades or a few pips of entry drift is expected (real-time poll vs M1-bar-close timing, spread).');
console.log('A cluster of decision MISMATCHES, or unmatched trades that are NOT explained by that, is the signal worth digging into.');
