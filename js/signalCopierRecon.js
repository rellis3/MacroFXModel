// js/signalCopierRecon.js — Signal Copier live trades vs his signals. Pure, no KV/DOM.
//
// The other bots reconcile live fills against a backtest by pair + time window.
// Signal Copier doesn't need the heuristic: every MT5 order carries "SC[<msg>-<n>]",
// the signal id, and every decision event carries the same id. So a real trade
// maps to exactly one signal, and a missed signal to exactly the decision that
// explains it. The reference is the bot's own outcome record (signal_copier_signals:
// his signal scored on M1 bars as a follower gets it), not a backtest.

/** "SC[101-7]" → "101:7" (null when the comment carries no tag). */
export function signalIdFromComment(comment) {
  const m = /SC\[(\d+)-(\d+)\]/.exec(String(comment || ''));
  return m ? `${m[1]}:${m[2]}` : null;
}

/** Each closed trade joined to its signal: his entry vs our fill (slippage in R),
 *  our R vs the signal record's R. */
export function joinTradesToSignals(trades, signals) {
  const byId = new Map((signals || []).map(s => [s.id, s]));
  return (trades || []).map(t => {
    const id = signalIdFromComment(t.comment);
    const s = id ? byId.get(id) : null;
    if (!s) return { ...t, signal_id: id, signal: null };
    const d = s.side === 'BUY' ? 1 : -1;
    const risk = s.sl != null ? Math.abs(s.entry - s.sl) : null;
    const slipR = risk ? +(d * (t.open_price - s.entry) / risk).toFixed(3) : null;      // + = worse than his entry
    const ourRisk = s.sl != null ? Math.abs(t.open_price - s.sl) : null;
    const realR = t.r != null ? t.r
      : (ourRisk && t.close_price != null ? +(d * (t.close_price - t.open_price) / ourRisk).toFixed(3) : null);
    return {
      ...t, signal_id: id,
      signal: { symbol: s.symbol, side: s.side, order: s.order, entry: s.entry, sl: s.sl, tp: s.tp, style: s.style,
        posted_ts: s.posted_ts, record_r: s.out?.r ?? null, record_exit: s.out?.exit_reason ?? null },
      slip_r: slipR, real_r: realR,
    };
  });
}

/** One day's reconciliation row, in the shape bot-audit's REC table reads. */
export function reconcileSignalCopierDay({ date, trades = [], signals = [], events = [] }) {
  const start = Date.parse(`${date}T00:00:00Z`) / 1000;
  const inDay = ts => ts >= start && ts < start + 86400;
  const daySignals = signals.filter(s => inDay(s.posted_ts) && !s.ignored);   // ignored = e.g. crypto with Ignore crypto on
  const tradable = daySignals.filter(s => s.out && s.out.fill_ts != null);       // the record says a follower got filled
  const joined = joinTradesToSignals(trades, signals);
  const matched = joined.filter(t => t.signal);
  const taken = new Set(matched.map(t => t.signal_id));
  const lastDecision = new Map();
  for (const e of events) if (e.id) lastDecision.set(e.id, e);

  const missedCandidates = tradable.filter(s => !taken.has(s.id)).slice(0, 30).map(s => {
    const e = lastDecision.get(s.id);
    const open = e && (e.status === 'entered' || e.status === 'pending' || e.status === 'filled');
    return {
      pair: s.symbol.toLowerCase(), time: s.posted_ts, id: s.id, side: s.side, order: s.order, entry: s.entry,
      record_r: s.out?.r ?? null,
      explainedBy: e && !open ? e.status : null,
      explainReason: !e ? 'no decision logged for this signal (bot not running?)'
        : open ? `bot ${e.status} it — still open, or closes on a later day` : (e.reason || e.status),
    };
  });
  const unmatchedRealTrades = joined.filter(t => !t.signal).slice(0, 30)
    .map(t => ({ ...t, pair: String(t.symbol || '').toLowerCase(), explainReason: 'no SC[...] tag that maps to a recorded signal' }));

  const withBoth = matched.filter(t => t.real_r != null && t.signal.record_r != null);
  const agree = withBoth.filter(t => Math.sign(t.real_r) === Math.sign(t.signal.record_r) || (t.real_r === 0 && t.signal.record_r === 0));
  const slips = matched.map(t => t.slip_r).filter(v => v != null);
  const realPnl = trades.reduce((s, t) => s + (t.profit || 0) + (t.swap || 0) + (t.commission || 0), 0);

  return {
    bot: 'signal_copier', date, tradeCount: trades.length, realPnl: +realPnl.toFixed(2),
    backtestCandidateCount: tradable.length,
    candidatesByPair: tradable.reduce((m, s) => (m[s.symbol.toLowerCase()] = (m[s.symbol.toLowerCase()] || 0) + 1, m), {}),
    missedCandidates, unmatchedRealTrades,
    // every tagged trade maps to its signal by id, so "decision match" = share of trades that are his signals
    decisionMatchRate: trades.length ? +(matched.length / trades.length * 100).toFixed(1) : null,
    decisionMatches: matched.length, decisionChecked: trades.length,
    winLossMatchRate: withBoth.length ? +(agree.length / withBoth.length * 100).toFixed(1) : null,
    winLossMatches: agree.length, winLossChecked: withBoth.length,
    avgSlipR: slips.length ? +(slips.reduce((a, b) => a + b, 0) / slips.length).toFixed(3) : null,
    expectedPnlPctTotal: null,
    mismatchDetail: withBoth.filter(t => !agree.includes(t)).slice(0, 10),
    note: !trades.length ? (tradable.length ? `no closed trades this date, but ${tradable.length} of his signal(s) filled on the record — see missed` : 'no closed trades this date') : undefined,
  };
}
