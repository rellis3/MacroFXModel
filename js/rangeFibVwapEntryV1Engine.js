/**
 * Range-Fib × VWAP Entry Engine (v1) — the owner's stated two rules, tested
 * as-worded, costed, pre-registered (GOLD_VWAP_FIXED_SIGMA_FINDINGS.md §8):
 *
 *   A) `line_on_vwap_extension` — "if price and range line are on VWAP, trade
 *      for an extension": when an Asia/Monday range-fib level currently lies
 *      within 0.5×fixed-σ of the session VWAP and price touches it, enter in
 *      the ladder direction (level above range-mid → BUY toward the next
 *      level up; below → SELL toward the next level down), stop 1.5×ATR(15m).
 *   B) `line_fade_stretched` — "on an extension of VWAP, back to VWAP": when
 *      price touches a range-fib level that lies ≥ 2×fixed-σ from the session
 *      VWAP, fade toward VWAP (target = VWAP as of the prior bar, frozen),
 *      stop 1.5×ATR(15m) beyond the level.
 *
 * ── COMPOSES, COPIES NOTHING ────────────────────────────────────────────────
 *   `_buildAsiaSessions`/`_buildMondayRanges` (rangeFibEngine) — THE Asia
 *       (5m-body, 00:00-06:00 London) and Monday (15m-body, full London
 *       Monday) range definitions, exported from the incumbent engine
 *   `calcFibs` (fibProjection) — the range-extension grid (pruned |lv| ≤ 4,
 *       same set as vwapFixedSigmaEngine's rangeConf dimension)
 *   `computeSessionVwap` (vwapReversionEngine), `groupUtcDays`/
 *       `computeFixedSigmaByDate` (vwapFixedSigmaEngine — the identical σ the
 *       atlas records), `causalAtr` (vwapImpulseEntryV1Engine), `walkBars`
 *       (forecastCore), `summarizeSplit` (honestForecastEngine)
 *
 * ── NO-LOOKAHEAD CONTRACT ───────────────────────────────────────────────────
 *   • A day's Asia levels are tradeable only AFTER that Asia session closes
 *     (epoch + 6h London); Monday levels only on LATER days of the same week
 *     (epoch + 24h .. +7d) — never while the range is still forming.
 *   • VWAP reads are lag-one; fixed-σ is strictly-prior-sessions; ATR is
 *     built from bars strictly before the entry bar; exits never see bars
 *     beyond the session end (mark-to-window-close discipline).
 *
 * ── PINNED CALLS (minimal-DOF) ──────────────────────────────────────────────
 *   • onVwapTolSigma 0.5 / stretchedMinSigma 2.0 — the owner's "on VWAP" and
 *     "extension" read in the atlas's own σ unit, one number each.
 *   • One trade per day per rule: the FIRST qualifying level touch decides
 *     (taken or structurally skipped), no re-arming.
 *   • Rule A skips the 0.5 (range-mid) level — it has no ladder direction.
 *   • Costs ON: 0.020% commodity / 0.012% FX round trip, limit fills.
 *
 * Contract (pure): runRangeFibVwap(packed, cfg) -> { trades[], records[], meta }
 */

import { _buildAsiaSessions, _buildMondayRanges } from './rangeFibEngine.js';
import { calcFibs } from './fibProjection.js';
import { computeSessionVwap } from './vwapReversionEngine.js';
import { groupUtcDays, computeFixedSigmaByDate } from './vwapFixedSigmaEngine.js';
import { causalAtr } from './vwapImpulseEntryV1Engine.js';
import { walkBars } from './forecastCore.js';

const DAY = 86400;
const isoDay = e => new Date(e * 1000).toISOString().slice(0, 10);

export const RANGE_FIB_LEVELS = [-4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4];

export const DEFAULT_CFG = {
  mode: 'line_on_vwap_extension',   // | 'line_fade_stretched'
  onVwapTolSigma: 0.5,
  stretchedMinSigma: 2.0,
  atrTfMin: 15, atrPeriod: 14, slAtrMult: 1.5, ctxLookbackDays: 2,
  costPct: 0.020,                   // commodity default; pass 0.012 for FX
  minBarsPerDay: 200,
  fibLevels: RANGE_FIB_LEVELS,
  warmupBars: 30,                   // no entries against a minutes-old session
                                    // VWAP — same convention as vwapReversionEngine
};

export function runRangeFibVwap(packed, cfg = {}) {
  const c = { ...DEFAULT_CFG, ...cfg };
  if (!packed?.n) return { trades: [], records: [], meta: { note: 'no data' } };

  // Level sources with validity windows + full sorted price ladders (the
  // ladder is needed for rule A's "next level out" target).
  const mkSource = (low, range, validFrom, until) => {
    const entries = calcFibs(low, range, c.fibLevels).map(l => ({ lv: l.level, price: l.price }));
    return { validFrom, until, entries, prices: entries.map(e => e.price).sort((a, b) => a - b) };
  };
  const sources = [
    ..._buildAsiaSessions(packed, 'Europe/London')
      .map(s => mkSource(s.low, s.range, s.epoch + 6 * 3600, s.epoch + 24 * 3600)),
    ..._buildMondayRanges(packed, 'Europe/London', 15)
      .map(m => mkSource(m.low, m.range, m.epoch + 24 * 3600, m.epoch + 7 * DAY)),
  ].sort((a, b) => a.validFrom - b.validFrom);

  const fsByDate = computeFixedSigmaByDate(packed, { minBarsPerDay: c.minBarsPerDay });
  const days = groupUtcDays(packed, c.minBarsPerDay);

  const trades = [], records = [];
  let srcIdx = 0;

  for (const { dayStart, bars } of days) {
    const date = isoDay(bars[0].time);
    // `_fsOverride` is a TEST hook only — pins σ to a known value so crafted
    // scenarios are deterministic. Real runs always use the atlas's series.
    const fs = c._fsOverride ?? fsByDate.get(date);
    if (!(fs > 0)) continue;
    const open = bars[0].open;
    const { vwap } = computeSessionVwap(bars);
    while (srcIdx < sources.length && sources[srcIdx].until <= dayStart) srcIdx++;

    let done = false;
    for (let j = Math.max(1, c.warmupBars); j < bars.length && !done; j++) {
      const t = bars[j].time, vRef = vwap[j - 1];
      for (let si = srcIdx; si < sources.length && !done; si++) {
        const src = sources[si];
        if (src.validFrom > t) break;
        if (src.until <= t) continue;
        for (const { lv, price: L } of src.entries) {
          if (!(bars[j].low <= L && L <= bars[j].high)) continue;   // no touch

          if (c.mode === 'line_on_vwap_extension') {
            if (Math.abs(L - vRef) > c.onVwapTolSigma * fs) continue;
            if (lv === 0.5) continue;                     // range mid: no ladder direction
            const isBuy = lv > 0.5;
            const next = isBuy ? src.prices.find(p => p > L + 1e-9)
                               : [...src.prices].reverse().find(p => p < L - 1e-9);
            if (next == null) continue;
            const atr = causalAtr(packed, dayStart, t, c);
            if (!atr) { done = true; break; }
            const sl = isBuy ? L - c.slAtrMult * atr : L + c.slAtrMult * atr;
            const r = walkBars(bars.slice(j), L, next, sl, isBuy, 'limit', open);
            if (r?.filled) {
              const net = +(r.pnlPct - c.costPct).toFixed(5);
              records.push({ date, filled: true, pnl_pct: net });
              trades.push({ date, mode: c.mode, side: isBuy ? 'BUY' : 'SELL', lv,
                entry: +L.toFixed(5), tp: +next.toFixed(5), sl: +sl.toFixed(5),
                outcome: r.outcome, netPct: net, fillTime: r.fillTime, exitTime: r.exitTime });
            }
            done = true; break;                            // first qualifying touch decides

          } else if (c.mode === 'line_fade_stretched') {
            const dist = (L - vRef) / fs;
            if (Math.abs(dist) < c.stretchedMinSigma) continue;
            const isBuy = dist < 0;                        // level below VWAP → long back up
            const tp = vRef;
            const atr = causalAtr(packed, dayStart, t, c);
            if (!atr) { done = true; break; }
            const sl = isBuy ? L - c.slAtrMult * atr : L + c.slAtrMult * atr;
            const r = walkBars(bars.slice(j), L, tp, sl, isBuy, 'limit', open);
            if (r?.filled) {
              const net = +(r.pnlPct - c.costPct).toFixed(5);
              records.push({ date, filled: true, pnl_pct: net });
              trades.push({ date, mode: c.mode, side: isBuy ? 'BUY' : 'SELL', lv,
                entry: +L.toFixed(5), tp: +tp.toFixed(5), sl: +sl.toFixed(5),
                distSigma: +dist.toFixed(2),
                outcome: r.outcome, netPct: net, fillTime: r.fillTime, exitTime: r.exitTime });
            }
            done = true; break;
          }
        }
      }
    }
  }

  return { trades, records,
           meta: { mode: c.mode, days: days.length, sources: sources.length, cfg: c } };
}
