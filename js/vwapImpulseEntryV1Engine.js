/**
 * VWAP Impulse-Entry Engine (v1) — the TRADE-LEVEL test layered on top of the
 * descriptive VWAP Fixed-Sigma Band Atlas (`GOLD_VWAP_FIXED_SIGMA_FINDINGS.md`).
 *
 * The owner's question, verbatim shape: "when should a trade open from the
 * VWAP high/low or back to VWAP? an impulse move happens (30m/1h/4h) — some
 * trigger which unlocks an entry zone and kicks in a trade."
 *
 * That is a two-stage mechanic — TRIGGER unlocks ZONE, zone entry fires the
 * trade — tested here as two OPPOSITE hypotheses through one flow (the same
 * A/B discipline as `vwapReversionEngine.js`, whose naked ±2σ trade test was
 * null 0/26; this adds exactly one new ingredient, the HTF impulse trigger):
 *
 *   A) `pullback_continuation` — a closed impulse bar on the trigger TF
 *      (30m/1h/4h) unlocks a WITH-impulse limit entry at the session VWAP for
 *      the next `armMins`: the impulse pushed price away from VWAP, the entry
 *      zone is the pullback to fair value, target = the impulse extreme,
 *      stop = 1.5×ATR(15m). "Back to VWAP" as a continuation entry.
 *   B) `band_reentry_fade` — an impulse that CLOSES beyond the fixed ±kσ band
 *      (k=2 default; the atlas's frozen σ, never today's own) arms a fade;
 *      the trigger that fires it is the first M1 close back inside the band
 *      (the reference Pine study's own "re-entry" event), entry at the next
 *      bar's open, target = VWAP, stop = 1.5×ATR(15m) beyond. "From the band
 *      back to VWAP" as an exhaustion entry.
 *
 * Priors, stated before running (see the findings doc's pre-registration):
 * the atlas is DESCRIPTIVE evidence only — fade MFE<MAE at every band argues
 * against B; spike-continues/grind-dies and the NY-overlap theme argue mildly
 * for A — and every entry-trigger family tested in this repo so far
 * (vwapReversion, vwapSessionReversion, impulseEmaRange) has been null after
 * costs. Default expectation: null for both.
 *
 * ── COMPOSES, COPIES NOTHING ────────────────────────────────────────────────
 *   `detectH4Impulses` (impulseRangeEngine) — the causal impulse qualifier
 *       (timeframe-agnostic despite the name: it reads whatever bars it's
 *       given; only the impulse bar + strictly prior bars, never future)
 *   `computeSessionVwap` (vwapReversionEngine) — THE session VWAP
 *   `groupUtcDays` + `computeFixedSigmaByDate` (vwapFixedSigmaEngine) — the
 *       identical day boundaries and frozen band unit the atlas recorded
 *       (equivalence-tested there)
 *   `extractBars`/`resampleTo` (barUtils), `atrWilder` (indicatorCore),
 *   `walkBars` (forecastCore), `summarizeSplit` (honestForecastEngine)
 *
 * ── NO-LOOKAHEAD CONTRACT ───────────────────────────────────────────────────
 *   • A trigger-TF impulse becomes active only at its bar's CLOSE time
 *     (bar.time + tfMin·60) — nothing before that instant may react to it.
 *   • Every VWAP/band level an M1 bar is tested against is lag-one (the level
 *     as of the prior bar's close), same convention as the atlas.
 *   • The fixed σ is strictly-prior-sessions (computeFixedSigmaByDate).
 *   • ATR(15m) is built from bars strictly before the entry bar.
 *   • The fill/exit walk never sees bars beyond the session end.
 *   Causality-tested in vwapImpulseEntryV1Engine.test.mjs.
 *
 * ── PINNED CALLS (minimal-DOF; each is a stated choice, not a hidden one) ───
 *   • Impulse preset = `classic` (bodyToAvg ≥1.5, body ≥65% of range, close
 *     within 20% of the extreme) — the existing brick's default, untouched.
 *   • armMins = 240 for ALL trigger TFs (one fixed number, not per-TF tuning).
 *   • One trade per day per mode: the first impulse whose zone actually fills.
 *   • Room checks: A requires price still beyond VWAP in the impulse
 *     direction at arm time (a pullback must exist to be bought); B requires
 *     TP (VWAP) on the profitable side of entry.
 *   • Costs ON: commodity 0.020% round trip (same figure as the sibling
 *     Jordan-derived engines). B's entry is a next-bar-open fill (stop-type,
 *     guaranteed) — cost-only, no extra slippage modelled, stated here.
 *
 * Contract (pure, no network):
 *   runVwapImpulseEntry(packed, cfg) -> { trades[], records[], meta }
 *     records = [{ date, filled, pnl_pct }] — the summarizeSplit shape.
 */

import { detectH4Impulses } from './impulseRangeEngine.js';
import { computeSessionVwap } from './vwapReversionEngine.js';
import { groupUtcDays, computeFixedSigmaByDate } from './vwapFixedSigmaEngine.js';
import { extractBars, resampleTo } from './barUtils.js';
import { atrWilder } from './indicatorCore.js';
import { walkBars } from './forecastCore.js';
import { summarizeSplit } from './honestForecastEngine.js';

const DAY = 86400;
const isoDay = e => new Date(e * 1000).toISOString().slice(0, 10);

export const DEFAULT_CFG = {
  mode: 'pullback_continuation',   // | 'band_reentry_fade'
  triggerTfMin: 60,                // 30 | 60 | 240
  impulsePreset: 'classic',
  armMins: 240,                    // zone stays unlocked this long after the trigger closes
  bandK: 2,                        // band_reentry_fade: the fixed-σ band that defines "stretched"
  atrTfMin: 15, atrPeriod: 14, slAtrMult: 1.5,   // the sibling engines' stop convention
  exitMode: 'target',              // 'target' (TP at the level) | 'time' (mark-to-close
                                   // after timeExitBars M1 bars, SL still active) — the
                                   // payoff-geometry pivot: same entries, different exit
  timeExitBars: 60,
  ctxLookbackDays: 2,              // prior days feeding the causal ATR
  costPct: 0.020,                  // commodity round-trip, % of price
  oosFrac: 0.4,
  minBarsPerDay: 200,
  sessionFilter: null,             // optional [fromUtcHour, toUtcHour) gate on the ENTRY time
};

// Causal ATR(15m) as of `beforeEpoch`: prior ctxLookbackDays days + today up
// to (not including) the entry bar. Exported — rangeFibVwapEntryV1Engine uses
// the same stop unit, never a second copy.
export function causalAtr(packed, dayStart, beforeEpoch, cfg) {
  const bars = resampleTo(extractBars(packed, dayStart - cfg.ctxLookbackDays * DAY, beforeEpoch), cfg.atrTfMin);
  if (bars.length < cfg.atrPeriod + 2) return null;
  const s = atrWilder(bars, cfg.atrPeriod);
  const atr = s[s.length - 1];
  return atr > 0 ? atr : null;
}

/**
 * Run one mode over one instrument's packed M1.
 */
export function runVwapImpulseEntry(packed, cfg = {}) {
  const c = { ...DEFAULT_CFG, ...cfg };
  if (!packed?.n) return { trades: [], records: [], meta: { note: 'no data' } };

  // Trigger-TF series over the FULL history, impulses detected once. A
  // trigger's ACTIVE time is its bar's close: bar.time + tfMin*60.
  const tfBars = resampleTo(extractBars(packed, packed.times[0], packed.times[packed.n - 1] + 1), c.triggerTfMin);
  const impulses = detectH4Impulses(tfBars, { preset: c.impulsePreset })
    .map(im => ({ ...im, activeAt: im.time + c.triggerTfMin * 60 }));

  const fsByDate = computeFixedSigmaByDate(packed, { minBarsPerDay: c.minBarsPerDay });
  const days = groupUtcDays(packed, c.minBarsPerDay);

  const inSession = (t) => {
    if (!c.sessionFilter) return true;
    const h = new Date(t * 1000).getUTCHours();
    const [a, b] = c.sessionFilter;
    return a <= b ? (h >= a && h < b) : (h >= a || h < b);
  };

  const trades = [], records = [];
  let impIdx = 0;

  for (const { dayStart, bars } of days) {
    const date = isoDay(bars[0].time);
    const dayEnd = dayStart + DAY;
    const open = bars[0].open;
    const { vwap } = computeSessionVwap(bars);
    const fs = fsByDate.get(date);   // may be undefined during warm-up (fade mode needs it)

    // Impulses whose ACTIVE time falls inside this day (chronological).
    while (impIdx < impulses.length && impulses[impIdx].activeAt < dayStart) impIdx++;
    let k = impIdx;
    let tookTrade = false;

    for (; k < impulses.length && impulses[k].activeAt < dayEnd && !tookTrade; k++) {
      const im = impulses[k];
      const armEnd = Math.min(im.activeAt + c.armMins * 60, dayEnd);
      // First M1 bar at/after the trigger's close.
      let j0 = bars.findIndex(b => b.time >= im.activeAt);
      if (j0 < 1) continue;   // need j-1 for lag-one levels
      const isUp = im.direction === 'up';
      const sgn = isUp ? 1 : -1;

      if (c.mode === 'pullback_continuation') {
        // Room check: price must still be beyond VWAP in the impulse direction
        // at arm time — otherwise there is no pullback to buy.
        if ((bars[j0].close - vwap[j0 - 1]) * sgn <= 0) continue;
        // Wait for the pullback to tag VWAP (lag-one level), inside the arm window.
        for (let j = j0; j < bars.length && bars[j].time < armEnd; j++) {
          const level = vwap[j - 1];
          const tagged = isUp ? bars[j].low <= level : bars[j].high >= level;
          if (!tagged) continue;
          if (!inSession(bars[j].time)) break;   // zone reached outside the allowed window → skip this impulse
          const entry = level;
          const tpLevel = isUp ? im.high : im.low;   // the impulse extreme
          if ((tpLevel - entry) * sgn <= 0) break;   // no room toward the impulse
          const atr = causalAtr(packed, dayStart, bars[j].time, c);
          if (!atr) break;
          const sl = entry - sgn * c.slAtrMult * atr;
          // exitMode 'time': no target — an unreachable TP makes walkBars run
          // to the (time-capped) window's last close, SL still live. Same
          // mark-to-window-close discipline as the whole forecast family.
          const timed = c.exitMode === 'time';
          const tp = timed ? (isUp ? Infinity : -Infinity) : tpLevel;
          const win = timed ? bars.slice(j, j + c.timeExitBars + 1) : bars.slice(j);
          const r = walkBars(win, entry, tp, sl, isUp, 'limit', open);
          if (r?.filled) {
            const net = +(r.pnlPct - c.costPct).toFixed(5);
            records.push({ date, filled: true, pnl_pct: net });
            trades.push({ date, mode: c.mode, tf: c.triggerTfMin, side: isUp ? 'BUY' : 'SELL',
              entry: +entry.toFixed(5), tp: +tpLevel.toFixed(5), sl: +sl.toFixed(5),
              impulseTime: im.time, outcome: r.outcome, grossPct: +r.pnlPct.toFixed(5), netPct: net,
              fillTime: r.fillTime, exitTime: r.exitTime });
            tookTrade = true;
          }
          break;   // one attempt per impulse: the first zone tag decides
        }
      } else if (c.mode === 'band_reentry_fade') {
        if (!(fs > 0)) continue;   // no frozen σ yet (warm-up)
        // Arm only if the impulse CLOSED beyond the ±kσ fixed band (lag-one VWAP).
        const bandAtArm = vwap[j0 - 1] + sgn * c.bandK * fs;
        if ((bars[j0 - 1].close - bandAtArm) * sgn <= 0) continue;
        // Trigger: first M1 CLOSE back inside the band, inside the arm window.
        for (let j = j0; j < bars.length - 1 && bars[j].time < armEnd; j++) {
          const band = vwap[j - 1] + sgn * c.bandK * fs;
          const backInside = isUp ? bars[j].close < band : bars[j].close > band;
          if (!backInside) continue;
          if (!inSession(bars[j].time)) break;
          // Enter TOWARD VWAP at the next bar's open (guaranteed stop-type fill).
          const entryBar = bars[j + 1];
          const entry = entryBar.open;
          const isBuy = !isUp;                   // fade the up-impulse = short, etc.
          const tp = vwap[j];                    // VWAP as of the trigger close
          if ((entry - tp) * sgn <= 0) break;    // VWAP not on the profitable side
          const atr = causalAtr(packed, dayStart, entryBar.time, c);
          if (!atr) break;
          const sl = entry + sgn * c.slAtrMult * atr;
          const r = walkBars(bars.slice(j + 1), entry, tp, sl, isBuy, 'stop', open);
          if (r?.filled) {
            const net = +(r.pnlPct - c.costPct).toFixed(5);
            records.push({ date, filled: true, pnl_pct: net });
            trades.push({ date, mode: c.mode, tf: c.triggerTfMin, side: isBuy ? 'BUY' : 'SELL',
              entry: +entry.toFixed(5), tp: +tp.toFixed(5), sl: +sl.toFixed(5),
              impulseTime: im.time, outcome: r.outcome, grossPct: +r.pnlPct.toFixed(5), netPct: net,
              fillTime: r.fillTime, exitTime: r.exitTime });
            tookTrade = true;
          }
          break;
        }
      }
    }
  }

  return {
    trades, records,
    meta: { mode: c.mode, triggerTfMin: c.triggerTfMin, impulses: impulses.length,
            days: days.length, from: days.length ? isoDay(days[0].bars[0].time) : null,
            to: days.length ? isoDay(days[days.length - 1].bars[0].time) : null, cfg: c },
  };
}

/** A/B across both modes × trigger TFs, each summarized IS/OOS. */
export function compareVwapImpulseModes(packed, opts = {}) {
  const { tfs = [30, 60, 240], oosFrac = 0.4, ...base } = opts;
  const out = {};
  for (const mode of ['pullback_continuation', 'band_reentry_fade']) {
    for (const tf of tfs) {
      const { records, trades, meta } = runVwapImpulseEntry(packed, { ...base, mode, triggerTfMin: tf });
      out[`${mode}|${tf}m`] = { summary: summarizeSplit(records, oosFrac), n: trades.length, meta };
    }
  }
  return out;
}
