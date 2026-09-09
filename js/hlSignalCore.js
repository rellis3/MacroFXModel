/**
 * HL Signal Core — the reusable pieces of the dynamic-HL early-reaction study
 * (analysis/causal_early_reaction_study.mjs / analysis/hl_early_reaction_tradeable_study.mjs,
 * 2026-09-08), extracted so both the one-off analysis scripts AND the live
 * backtest route (js/levelAtlasRoutes.js's /api/level-atlas/hl-vote-portfolio)
 * import the SAME band definitions and pricing formula — one definition,
 * not a route-side reimplementation that could drift from what was actually
 * validated.
 *
 * ── 2026-09-09 CORRECTION — READ THIS BEFORE TRUSTING ANY OLD NUMBER ─────────
 * The original build had a look-ahead SELECTION filter, not a look-ahead price:
 * a touch whose two-barrier race never resolved before the session closed was
 * dropped from the sample entirely (walkSideTradeable returned no checkpoints
 * for `outcome === 'neither'`, so the record was never emitted at all). You
 * cannot know at the checkpoint whether the race will resolve, so those touches
 * are trades the rule really takes. They were 30-43% of every pair's touches,
 * and 55% of the specific '<15% @ 60min' slice the page defaulted to — and they
 * are the losing half. Measured over 8 pairs OOS, restoring them turned
 * +0.104R/trade (PF 2.05, per-trade Sharpe 0.259) into −0.019R/trade (PF 0.86,
 * per-trade Sharpe −0.055).
 *
 * That also explains the headline claim the whole study rested on — "a shallow
 * pullback continues MORE than fair two-barrier-race odds predict". The null it
 * was measured against, p = distToStop / (distToStop + distToTarget), is the
 * INFINITE-horizon gambler's-ruin probability. The sample was truncated at the
 * session close. Conditional on resolving before a deadline the NEAR barrier
 * wins more often than the infinite-horizon split says, so the "excess" tracked
 * nothing but how close the entry sat to the near barrier: '<15%' +9.55pp,
 * '15-35%' +6.21pp, '35-60%' −1.48pp, '>60%' −4.36pp — monotone in geometry,
 * identical IS vs OOS (10.64 vs 9.55pp), and +7.5 to +19.3pp on all 17
 * instruments alike. That is a construction artifact, not a signal.
 *
 * Consequences for this module:
 *   - priceTradeFromTouch now prices THREE exits, not two (target / stop /
 *     session-close timeout), and refuses to score an ambiguous bar favourably.
 *   - BANDS no longer carry a `bet`. The old per-band bets ('<15%' and '15-35%'
 *     continuation, '>60%' reversal, '35-60%' skip) were derived entirely from
 *     the biased sample, so they are not defaults any more — the caller states
 *     the bet explicitly and the re-test decides which, if any, survive.
 */

// Pure geometry: which slice of the reversal span the pullback's EXTREME reached
// by the checkpoint. No bet attached — see the header for why the old ones went.
export const BANDS = [
  { key: '<15%', test: f => f < 0.15 },
  { key: '15-35%', test: f => f >= 0.15 && f < 0.35 },
  { key: '35-60%', test: f => f >= 0.35 && f < 0.6 },
  { key: '>60%', test: f => f >= 0.6 },
];
export function bandOf(frac) { for (const b of BANDS) if (b.test(frac)) return b; return null; }

export const CHECKPOINTS_MIN = [5, 15, 30, 60];

// Schema stamped into every {pair}-hltouches.json by scripts/build_hl_touches.mjs.
// Bumped to 2 by the 2026-09-09 correction because a v1 file is not merely stale,
// it is SILENTLY BIASED — it has no `outcome:'neither'` rows at all, and no
// sessionClose/straddle fields to price them with, so a reader that just shrugged
// at the missing fields would go on reporting the old inflated numbers with no
// error anywhere. Readers must check this and refuse v1 rather than degrade.
export const HL_TOUCH_SCHEMA = 2;

/**
 * Price ONE candidate trade: enter at checkpoint `cp` after the touch, bet `bet`
 * ('continuation' → target = the outer neighbour, stop = the inner one;
 * 'reversal' → the reverse), flat by the session close either way.
 *
 * costForPair is injected (not imported here) so this module has zero
 * dependency on js/perLineStrategy.js's own import chain — callers already
 * import costForPair for their own use, this just takes the number.
 */
export function priceTradeFromTouch(touch, cp, bet, cost) {
  const snap = touch.checks?.[cp];
  if (!snap) return null;
  const entryPrice = snap.ckPrice;
  const targetPrice = bet === 'continuation' ? touch.contTarget : touch.revTarget;
  const stopPrice = bet === 'continuation' ? touch.revTarget : touch.contTarget;
  const distToTarget = Math.abs(targetPrice - entryPrice);
  const distToStop = Math.abs(stopPrice - entryPrice);
  if (!(entryPrice > 0) || !(distToTarget > 0) || !(distToStop > 0)) return null;

  // Three exits, not two (2026-09-09 — see the header):
  //  target    — the race resolved the way we bet
  //  stop      — it resolved against us
  //  timeout   — it never resolved inside the session, so we mark out at the
  //              session close, the only thing a real trader can do. These were
  //              DROPPED before this fix, which is what broke the study.
  //  ambiguous — one M1 bar's range covered BOTH barriers. M1 OHLC cannot say
  //              which was touched first, and the old walk always awarded it to
  //              the outer (continuation) side. Scored as a loss whichever way
  //              we bet: conservative, and symmetric between the two bets.
  let exitKind, gross;
  if (touch.outcome === 'neither') {
    if (!(touch.sessionClose > 0)) return null;   // v1 record — caller should have refused the file
    exitKind = 'timeout';
    const dir = targetPrice > entryPrice ? 1 : -1;
    gross = dir * (touch.sessionClose - entryPrice);
  } else if (touch.straddle) {
    exitKind = 'ambiguous';
    gross = -distToStop;
  } else {
    const hit = (bet === 'continuation') === (touch.outcome === 'continuation');
    exitKind = hit ? 'target' : 'stop';
    gross = hit ? distToTarget : -distToStop;
  }

  const pnlPct = +(((gross / entryPrice) * 100) - cost).toFixed(4);
  return {
    instrument: touch.instrument, pair: touch.pair, assetClass: touch.assetClass, date: touch.date,
    side: touch.side, rung: touch.rung, decision: bet, margin: null,
    // resolveTime is the session end for a timeout (set by the walk), so the
    // concurrency cap holds the slot for as long as the position is really open
    // instead of freeing it the moment a resolved sibling would have closed.
    time: snap.ckTime, resolveTime: touch.resolveTime, frac: snap.frac,
    exitKind, win: pnlPct > 0, pnlPct,
    entry: +entryPrice.toFixed(6), pip: touch.pip,
    targetPips: +(distToTarget / touch.pip).toFixed(1), stopPips: +(distToStop / touch.pip).toFixed(1),
  };
}
