// motifLiveVsBacktest — reconciles motif_bot's REAL fills against the
// touch-motif signal's own forward-tracked backtest record, so "does live
// trade the same as the backtest" has an actual, automatically-computed
// answer instead of an assumption someone has to go check by hand.
//
// Pure logic only (no KV/HTTP/fs) -- server.js's /api/motif-bot/live-vs-
// backtest route owns fetching the three inputs and calling
// buildLiveVsBacktestReport with them. A JS port of scripts/verify_motif_
// live_vs_backtest.py's match/compare functions, built so the SAME question
// can be answered automatically from the dashboard (using data that is
// already accumulating with zero extra wiring -- trade_hist_motif_bot_
// status_<date>, motif_bot_decision_log, motif_trades.json) as well as from
// a deeper MT5-deal-history audit run locally. Keep the verdict rules in
// step across both if they ever change.
//
// Verdicts:
//   MATCH        — backtest confirms the same motif, same direction, same
//                  tp/sl outcome (or both still open).
//   DIVERGENCE   — direction or outcome disagree, or the motif isn't in the
//                  backtest's log at all. The failure mode this exists to
//                  catch.
//   UNRESOLVED   — matched to a motif_key the backtest hasn't finished
//                  racing yet (still `open` there). Not a disagreement.
//   UNMATCHED    — a real fill with no decision-log "entered" event close
//                  enough in pair/time to identify which motif it was.

import { resolveKey } from './instrumentRegistry.js';

export const ENTRY_TOLERANCE_SEC = 600; // how close a decision-log "entered"
// event must sit to a fill's open time to call it a match -- generous
// enough for execution latency, tight enough that two entries on the same
// pair minutes apart on different motifs don't get confused.

export function normPair(symbol) {
  return resolveKey(symbol) || String(symbol || '').toLowerCase();
}

// `liveTrade` needs {symbol, time_open}. Returns a motif_key or null.
export function matchTradeToMotifKey(liveTrade, enteredEvents, toleranceSec = ENTRY_TOLERANCE_SEC) {
  const pair = normPair(liveTrade.symbol);
  let best = null, bestDt = toleranceSec + 1;
  for (const e of enteredEvents || []) {
    if (normPair(e.pair || '') !== pair) continue;
    const dt = Math.abs((e.t || 0) - liveTrade.time_open);
    if (dt <= toleranceSec && dt < bestDt) { best = e.motif_key; bestDt = dt; }
  }
  return best;
}

// `liveTrade` needs {direction, reason, r?}. `backtestByKey` is
// {motif_key: {direction, status, r}}. Returns {motif_key, verdict, detail}.
export function compareToBacktest(liveTrade, motifKey, backtestByKey) {
  if (!motifKey) {
    return { motif_key: null, verdict: 'UNMATCHED', detail: 'no decision-log "entered" event found near this fill' };
  }
  const bt = (backtestByKey || {})[motifKey];
  if (!bt) {
    return { motif_key: motifKey, verdict: 'DIVERGENCE', detail: 'motif_key not found in motif_trades.json at all' };
  }
  if (bt.direction !== liveTrade.direction) {
    return { motif_key: motifKey, verdict: 'DIVERGENCE', detail: `direction mismatch: live=${liveTrade.direction} backtest=${bt.direction}` };
  }
  if (bt.status === 'open') {
    if (!liveTrade.reason) return { motif_key: motifKey, verdict: 'MATCH', detail: 'both still open' };
    return { motif_key: motifKey, verdict: 'UNRESOLVED', detail: `live already closed (${liveTrade.reason}), backtest hasn't raced this far yet` };
  }
  const liveOutcome = (liveTrade.reason === 'tp' || liveTrade.reason === 'sl') ? liveTrade.reason : null;
  if (!liveOutcome) {
    return { motif_key: motifKey, verdict: 'DIVERGENCE', detail: `live closed manually (reason=${liveTrade.reason || 'unknown'}) — backtest has no 'manual' outcome to compare against` };
  }
  if (liveOutcome !== bt.status) {
    return { motif_key: motifKey, verdict: 'DIVERGENCE', detail: `outcome mismatch: live=${liveOutcome} backtest=${bt.status} (backtest r=${bt.r})` };
  }
  return { motif_key: motifKey, verdict: 'MATCH', detail: `both ${liveOutcome} (backtest r=${bt.r}, live r=${liveTrade.r ?? 'n/a'})` };
}

// Corrects a raw trade_hist_motif_bot_status_<date> row's broker-clock
// timestamps to real UTC using its own shipped tz_offset_sec (pylego.broker.
// mt5.serialize_closed_trades ships this alongside every row specifically
// so a reader can do this without a live MT5 connection to measure an
// offset from).
export function normalizeLiveTrade(raw) {
  const off = Number(raw.tz_offset_sec) || 0;
  return {
    ...raw,
    time_open: (raw.time_open || 0) - off,
    time_close: raw.time_close != null ? raw.time_close - off : null,
  };
}

// Full pipeline: raw trade_hist rows + decision-log "entered" events +
// motif_trades.json's trades[] -> {trades: [...with verdict], summary}.
export function buildLiveVsBacktestReport(rawLiveTrades, enteredEvents, backtestTrades) {
  const backtestByKey = {};
  for (const t of backtestTrades || []) backtestByKey[t.motif_key] = t;

  const trades = (rawLiveTrades || [])
    .map(normalizeLiveTrade)
    .sort((a, b) => (a.time_open || 0) - (b.time_open || 0))
    .map(lt => {
      const motifKey = matchTradeToMotifKey(lt, enteredEvents);
      const verdict = compareToBacktest(lt, motifKey, backtestByKey);
      return { ...lt, ...verdict };
    });

  const summary = { MATCH: 0, DIVERGENCE: 0, UNRESOLVED: 0, UNMATCHED: 0 };
  for (const t of trades) summary[t.verdict] = (summary[t.verdict] || 0) + 1;

  return { trades, summary, backtest_motifs: Object.keys(backtestByKey).length };
}
