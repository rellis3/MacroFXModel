/**
 * Stacked Fade Engine (v1) — the ONE entry candidate the fixed-sigma books
 * themselves pointed at, tested with the multiple-selection risk stated up
 * front (GOLD_VWAP_FIXED_SIGMA_FINDINGS.md §9: the gates were chosen by
 * looking at the mined books — a pass here would still need forward
 * validation before belief).
 *
 * Trade = fade a deep (±2σ/±3σ) fixed-sigma band FIRST touch back toward
 * VWAP, gated on the OOS-held, cross-market-replicated context themes:
 *
 *   V0 baseline — no gates (the named benchmark floor)
 *   V1 core     — touch NOT in the NY session AND touch-bar candleReject
 *                 = '3·reject'  (both replicated on all 4 instruments, §7c)
 *   V2 gold+WT  — V1 AND wtState = '2·neutral' (the gold-only WT finding)
 *   requireMomentumAgree (owner's request, 2026-08-27, untested prior to
 *     this) — the OPPOSITE bet from V2: fade only when the raw WT1 oscillator
 *     is STILL on the extension's own side of zero at the touch (sell only
 *     if wt1>0 at an upper-band touch, buy only if wt1<0 at a lower-band
 *     touch) — momentum hasn't rolled over yet, a contrarian entry against
 *     live momentum. Needs `wtStateValue` (raw wt1, not the ob/os bucket)
 *     on the touch row.
 *
 * Mechanics (pinned, mirroring the return book's own measurement):
 *   • touch must have ≥240 min of session remaining (returnEligible)
 *   • entry at the NEXT bar's open (the touch bar must complete before its
 *     reject/WT reading exists — no lookahead), toward VWAP
 *   • TP = VWAP as of the touch (frozen); SL = 1.5×ATR(15m) beyond;
 *     exit capped at 240 min, mark-to-close (walkBars discipline)
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

export const DEFAULT_CFG = {
  bands: [2, 3],
  excludeNY: false,          // V1/V2 gate
  requireReject: false,      // V1/V2 gate
  requireWtNeutral: false,   // V2 gate (gold-only finding)
  requireMomentumAgree: false,  // sell only if wt1>0 at an upper touch, buy only if wt1<0 at a lower touch
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
    .filter(t => !c.requireReject || t.candleReject === '3·reject')
    .filter(t => !c.requireWtNeutral || t.wtState === '2·neutral')
    .filter(t => !c.requireMomentumAgree
      || (t.wtStateValue != null && (t.side === 'up' ? t.wtStateValue > 0 : t.wtStateValue < 0)))
    .sort((a, b) => a.epoch - b.epoch);

  const trades = [], records = [];
  let lastDate = null;
  for (const t of pool) {
    if (t.date === lastDate) continue;              // one trade per day: first qualifying
    // Entry bar = first bar strictly after the touch bar.
    const entryIdx = bisect(packed.times, t.epoch + 1);
    if (entryIdx >= packed.n) continue;
    const entry = packed.opens[entryIdx];
    const isBuy = t.side === 'dn';                  // fade a lower-band touch = long
    const sgn = isBuy ? -1 : 1;                     // + = stretch above VWAP
    const tp = t.vwapAtTouch;
    if ((entry - tp) * sgn <= 0) continue;          // VWAP not on the profitable side
    const dayStart = t.epoch - (t.epoch % DAY);
    const atr = causalAtr(packed, dayStart, packed.times[entryIdx], c);
    if (!atr) continue;
    const sl = entry + sgn * c.slAtrMult * atr;

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
    trades.push({ date: t.date, side: isBuy ? 'BUY' : 'SELL', band: t.band, session: t.session,
      candleReject: t.candleReject, wtState: t.wtState, wtStateValue: t.wtStateValue,
      entry: +entry.toFixed(5), tp: +tp.toFixed(5), sl: +sl.toFixed(5),
      outcome: r.outcome, netPct: net, fillTime: r.fillTime, exitTime: r.exitTime });
  }

  return { trades, records,
           meta: { pool: pool.length, cfg: { bands: c.bands, excludeNY: c.excludeNY,
                   requireReject: c.requireReject, requireWtNeutral: c.requireWtNeutral,
                   requireMomentumAgree: c.requireMomentumAgree } } };
}
