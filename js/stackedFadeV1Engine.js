/**
 * Stacked Fade Engine (v1) — the ONE entry candidate the fixed-sigma books
 * themselves pointed at, tested with the multiple-selection risk stated up
 * front (GOLD_VWAP_FIXED_SIGMA_FINDINGS.md §9: the gates were chosen by
 * looking at the mined books — a pass here would still need forward
 * validation before belief).
 *
 * Trade = a deep (±2σ/±3σ) fixed-sigma band FIRST touch, in ONE of two
 * directions (CLAUDE.md's Lego Principle #2 — `action` is a parameter of the
 * one entry primitive, not a second bespoke engine):
 *
 *   action:'fade'   (default, original) — toward VWAP. TP = VWAP as of the
 *     touch (frozen); SL = 1.5×ATR(15m) beyond entry.
 *   action:'follow' (2026-08-30, owner's request — "test a with-trend entry
 *     not fade") — WITH the touch direction (continuation), targeting the
 *     NEXT band out. Entry = the touch's own direction (side='up' → BUY,
 *     'dn' → SELL — the opposite of fade's mapping); TP = the (band+1)σ
 *     level AS OF THE TOUCH (frozen, same freezing discipline as fade's
 *     VWAP target); SL = the (band−1)σ level as of the touch (frozen) — i.e.
 *     literally the same symmetric "next band out vs one band back" race
 *     `fixedSigmaWalk` already measures descriptively (its own out/back
 *     outcome), now realised as a costed trade instead of a rate. Both use
 *     the SAME frozen band levels (`vwapAtTouch` + `fixedSigma` already on
 *     the touch row) — no new price math, only new direction/target wiring.
 *     Motivated by §12/§13: `bandSlope='3·expanding'` is the one dimension
 *     that showed real, non-mechanical, CROSS-MARKET-replicated continuation
 *     (not reversion) at deep bands — gate with `requireBandSlopeExpanding`.
 *     `followSlSigma` (2026-08-30, owner's follow-up: "if this works it
 *     reacts to the band very quick, so the SL should be small") — the
 *     original 1.0 made TP/SL a ~1:1 R:R by construction (both exactly 1σ
 *     from entry); a smaller value tightens the stop only (TP stays fixed at
 *     the next band out), widening R:R (e.g. 0.5 → ~2:1). Swept null (§14a):
 *     win rate collapses faster than R:R improves at every step — a stop
 *     doesn't know "this reverses" from "this continues after one more wick
 *     through my level."
 *     `confirmTfMinutes` (2026-08-30, owner's next follow-up — "let's look
 *     at the 1m closed candle... this was meant to be on an ultra-low
 *     timeframe like 1m/3m") — the structural mutation §14a's own result
 *     pointed at: require a CLOSE beyond the touched band, not just the wick
 *     that defines the touch, before entering — the exact "closes not
 *     wicks" convention `vwapExtensionAtlasEngine.js`'s own `confirmTfMinutes`
 *     already established for this repo, reused here (same day-aligned
 *     bucket-close definition), not reinvented. Default 1 = the touch bar's
 *     OWN close must already be beyond the level (a real, if small, change
 *     from the unconfirmed original — a wick-only touch whose bar closes
 *     back inside no longer qualifies); 3 = wait for the enclosing 3-minute
 *     bucket's close instead. Unconfirmed touches are skipped, not traded —
 *     entry shifts to the bar right after the CONFIRMING close, not the
 *     original touch.
 *
 * Gates (fade-side, from earlier passes):
 *   V0 baseline — no gates (the named benchmark floor)
 *   V1 core     — touch NOT in the NY session AND touch-bar candleReject
 *                 = '3·reject'  (both replicated on all 4 instruments, §7c)
 *   V2 gold+WT  — V1 AND wtState = '2·neutral' (the gold-only WT finding)
 *   excludeOverlap (2026-08-30, §15's own held finding) — drop touches during
 *     the London/NY overlap window (`overlapWindow===true` on the touch row),
 *     separate from `excludeNY` (session-bucketed, not the same window) —
 *     §15's return/band-walk books found this window suppresses reversion
 *     specifically for the developing (self-widening) band unit.
 *   requireMomentumAgree (2026-08-27) — the OPPOSITE bet from V2: fade only
 *     when the raw WT1 oscillator is STILL on the extension's own side of
 *     zero at the touch (sell only if wt1>0 at an upper-band touch, buy only
 *     if wt1<0 at a lower-band touch) — momentum hasn't rolled over yet, a
 *     contrarian entry against live momentum. Needs `wtStateValue` (raw wt1,
 *     not the ob/os bucket) on the touch row.
 *   requireBandSlopeExpanding (2026-08-30) — `bandSlope==='3·expanding'` at
 *     the touch (§12's engine field) — the follow side's own evidence-led
 *     gate, but usable on the fade side too (as the null-hypothesis check:
 *     does fading INTO an expanding band lose worse, as §12/§13 imply it
 *     should?).
 *   requirePmoAgree (2026-08-30, owner's request — "only enter if momentum is
 *     high or low to correspond to the +3/-3 touch") — same sign-vs-zero
 *     shape as requireMomentumAgree, reading PMO instead of raw WaveTrend:
 *     sell only if `pmoValue>0` at an upper-band touch, buy only if
 *     `pmoValue<0` at a lower-band touch (momentum still extended the same
 *     direction as the band at the moment of touch).
 *
 * Mechanics (pinned, mirroring the return book's own measurement):
 *   • touch must have ≥240 min of session remaining (returnEligible)
 *   • entry at the NEXT bar's open (the touch bar must complete before its
 *     reject/WT/bandSlope reading exists — no lookahead)
 *   • exit capped at 240 min, mark-to-close (walkBars discipline)
 *   • one trade per day: the first qualifying touch
 *   • costs ON (0.020% commodity / 0.012% FX)
 *
 * ── COMPOSES ────────────────────────────────────────────────────────────────
 * `fixedSigmaWalk` finds the touches WITH their causally-tested context —
 * this engine never re-detects touches or re-reads context; it only turns
 * qualifying rows into simulated trades over the same packed M1.
 * `causalAtr` (vwapImpulseEntryV1Engine), `walkBars` (forecastCore),
 * `returnEligible` (vwapFixedSigmaReport).
 *
 * Contract (pure): runStackedFade(packed, touches, cfg) -> { trades[], records[], meta }
 */

import { causalAtr } from './vwapImpulseEntryV1Engine.js';
import { returnEligible } from './vwapFixedSigmaReport.js';
import { walkBars } from './forecastCore.js';
import { bisect } from './barUtils.js';

const DAY = 86400;

// Same day-aligned "is this bar the close of an N-minute bucket" convention
// as vwapExtensionAtlasEngine.js's confirmTfMinutes — reused, not reinvented.
function isBucketCloseAt(barTime, dayStart, confirmTfMinutes) {
  if (confirmTfMinutes <= 1) return true;
  const minuteOfDay = Math.round((barTime - dayStart) / 60);
  return ((minuteOfDay + 1) % confirmTfMinutes) === 0;
}

export const DEFAULT_CFG = {
  action: 'fade',            // 'fade' (toward VWAP) | 'follow' (with-trend, next band out)
  bands: [2, 3],
  excludeNY: false,          // V1/V2 gate
  excludeOverlap: false,     // §15's own held finding: drop London/NY overlap touches
  requireReject: false,      // V1/V2 gate
  requireWtNeutral: false,   // V2 gate (gold-only finding)
  requireMomentumAgree: false,  // sell only if wt1>0 at an upper touch, buy only if wt1<0 at a lower touch
  requirePmoAgree: false,       // same shape, reading pmoValue instead of raw wt1
  requireBandSlopeExpanding: false,   // bandSlope='3·expanding' at touch (§12/§13's cross-market-real dim)
  followSlSigma: 1.0,        // 'follow' only: SL sits this many σ back from the touched band toward VWAP
                              // (TP stays fixed at +1σ out — smaller values widen R:R, e.g. 0.5 -> 2:1)
  confirmTfMinutes: 1,       // 'follow' only: require a CLOSE beyond the touched band before entering —
                              // 1 = the touch bar's own close; >1 = wait for that day-aligned N-minute
                              // bucket's own close (same convention as vwapExtensionAtlasEngine.js).
                              // An unconfirmed touch is skipped, not traded.
  horizonMins: 240,
  atrTfMin: 15, atrPeriod: 14, slAtrMult: 1.5, ctxLookbackDays: 2,
  costPct: 0.020,
};

export function runStackedFade(packed, touches, cfg = {}) {
  const c = { ...DEFAULT_CFG, ...cfg };
  if (!packed?.n || !touches?.length) return { trades: [], records: [], meta: { note: 'no data' } };

  const pool = touches
    .filter(t => t.ordinal === 1 && c.bands.includes(t.band) && returnEligible(t, c.horizonMins))
    .filter(t => !c.excludeNY || t.session !== 'NY')
    .filter(t => !c.excludeOverlap || t.overlapWindow !== true)
    .filter(t => !c.requireReject || t.candleReject === '3·reject')
    .filter(t => !c.requireWtNeutral || t.wtState === '2·neutral')
    .filter(t => !c.requireMomentumAgree
      || (t.wtStateValue != null && (t.side === 'up' ? t.wtStateValue > 0 : t.wtStateValue < 0)))
    .filter(t => !c.requirePmoAgree
      || (t.pmoValue != null && (t.side === 'up' ? t.pmoValue > 0 : t.pmoValue < 0)))
    .filter(t => !c.requireBandSlopeExpanding || t.bandSlope === '3·expanding')
    .sort((a, b) => a.epoch - b.epoch);

  const trades = [], records = [];
  let lastDate = null;
  for (const t of pool) {
    if (t.date === lastDate) continue;              // one trade per day: first qualifying
    const isFollow = c.action === 'follow';
    // fade: 'dn' touch (below VWAP) = long back up. follow: 'up' touch = long
    // (continuation with the extension) — the opposite mapping.
    const isBuy = isFollow ? t.side === 'up' : t.side === 'dn';
    const sgn = isBuy ? -1 : 1;                     // + = stretch above VWAP (fade's own orientation)
    const dayStart = t.epoch - (t.epoch % DAY);

    let entryIdx;
    if (isFollow && c.confirmTfMinutes > 1) {
      // Wait for the enclosing N-minute bucket's own CLOSE beyond the
      // touched band — a wick-only touch whose bucket closes back inside is
      // NOT traded. Scan forward from the touch bar to that bucket's close.
      const followSgn = t.side === 'up' ? 1 : -1;
      const level = t.vwapAtTouch + followSgn * t.band * t.fixedSigma;
      const touchBarIdx = bisect(packed.times, t.epoch);
      let confirmBarIdx = -1;
      for (let m = touchBarIdx; m < packed.n && m < touchBarIdx + c.confirmTfMinutes + 2; m++) {
        if (isBucketCloseAt(packed.times[m], dayStart, c.confirmTfMinutes)) { confirmBarIdx = m; break; }
      }
      if (confirmBarIdx < 0) continue;                                        // ran off the day, no bucket close found
      if ((packed.closes[confirmBarIdx] - level) * followSgn < 0) continue;   // bucket closed back inside — not confirmed
      entryIdx = bisect(packed.times, packed.times[confirmBarIdx] + 1);
    } else if (isFollow) {
      // confirmTfMinutes<=1: the touch bar's OWN close must already be
      // beyond the band (not just its wick) — "closes not wicks" at the
      // native 1m resolution.
      const followSgn = t.side === 'up' ? 1 : -1;
      const level = t.vwapAtTouch + followSgn * t.band * t.fixedSigma;
      const touchBarIdx = bisect(packed.times, t.epoch);
      if (touchBarIdx >= packed.n || (packed.closes[touchBarIdx] - level) * followSgn < 0) continue;
      entryIdx = bisect(packed.times, t.epoch + 1);
    } else {
      entryIdx = bisect(packed.times, t.epoch + 1);   // fade: unchanged, entry at the bar right after the touch
    }
    if (entryIdx >= packed.n) continue;
    const entry = packed.opens[entryIdx];

    let tp, sl;
    if (isFollow) {
      // Same frozen-band construction fixedSigmaWalk's own out/back race
      // measures descriptively — the (band+1)σ level as of the touch is the
      // target, (band-1)σ (one band back toward VWAP) is the stop. sgn here
      // is w.r.t. the FOLLOW direction: +1 for an up-touch continuing up.
      const followSgn = t.side === 'up' ? 1 : -1;
      tp = t.vwapAtTouch + followSgn * (t.band + 1) * t.fixedSigma;
      sl = t.vwapAtTouch + followSgn * (t.band - c.followSlSigma) * t.fixedSigma;
      if ((tp - entry) * followSgn <= 0 || (entry - sl) * followSgn <= 0) continue;   // entry not between SL and TP
    } else {
      tp = t.vwapAtTouch;
      if ((entry - tp) * sgn <= 0) continue;          // VWAP not on the profitable side
      const atr = causalAtr(packed, dayStart, packed.times[entryIdx], c);
      if (!atr) continue;
      sl = entry + sgn * c.slAtrMult * atr;
    }

    // Window: next `horizonMins` M1 bars, capped at the UTC day end.
    const window = [];
    const cutoff = Math.min(packed.times[entryIdx] + c.horizonMins * 60, dayStart + DAY);
    for (let i = entryIdx; i < packed.n && packed.times[i] < cutoff; i++) {
      window.push({ time: packed.times[i], open: packed.opens[i], high: packed.highs[i],
                    low: packed.lows[i], close: packed.closes[i] });
    }
    if (!window.length) continue;
    const r = walkBars(window, entry, tp, sl, isBuy, 'stop', entry);
    if (!r?.filled) continue;

    lastDate = t.date;
    const net = +(r.pnlPct - c.costPct).toFixed(5);
    records.push({ date: t.date, filled: true, pnl_pct: net });
    trades.push({ date: t.date, action: c.action, side: isBuy ? 'BUY' : 'SELL', band: t.band, session: t.session,
      candleReject: t.candleReject, wtState: t.wtState, wtStateValue: t.wtStateValue, bandSlope: t.bandSlope,
      entry: +entry.toFixed(5), tp: +tp.toFixed(5), sl: +sl.toFixed(5),
      outcome: r.outcome, netPct: net, fillTime: r.fillTime, exitTime: r.exitTime });
  }

  return { trades, records,
           meta: { pool: pool.length, cfg: { action: c.action, bands: c.bands, excludeNY: c.excludeNY,
                   excludeOverlap: c.excludeOverlap,
                   requireReject: c.requireReject, requireWtNeutral: c.requireWtNeutral,
                   requireMomentumAgree: c.requireMomentumAgree,
                   requirePmoAgree: c.requirePmoAgree,
                   requireBandSlopeExpanding: c.requireBandSlopeExpanding,
                   followSlSigma: c.followSlSigma, confirmTfMinutes: c.confirmTfMinutes } } };
}
