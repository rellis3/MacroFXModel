/**
 * VWAP Reversion Engine — is VWAP a tradeable intraday fair-value level, or folklore?
 * ===================================================================================
 *
 * WHAT THIS TESTS (two opposite hypotheses about the SAME event — a price touch
 * relative to session VWAP):
 *
 *   A) band_fade   — "stretch → revert TO VWAP". Price reaches the ±k·σ VWAP band,
 *                    fade it back toward fair value (VWAP). Mean-reversion.
 *   B) vwap_bounce — "bounce OFF VWAP". Price stretches to a band, pulls back to
 *                    VWAP, then you enter in the prior-stretch direction betting
 *                    VWAP holds as fair-value support/resistance. This is the
 *                    "reclaim/bounce is the trigger" idea — and it is squarely the
 *                    support/resistance folklore family (CLAUDE.md), so its prior
 *                    is low. We test it anyway, honestly, next to its opposite.
 *   control) band_follow — break THROUGH the band, target the next band out. The
 *                    "trend day" continuation control. If fade wins, this should
 *                    lose; running it keeps us honest about which side pays.
 *   D) vwap_trend_cross (2026-08-30, owner's request) — "only go long while
 *                    price is above VWAP": trade WITH VWAP's own directional
 *                    read, not against it — the standalone-system counterpart
 *                    to band_fade's reversion bet, and the one VWAP idea in
 *                    this whole study that ISN'T anchored to a σ-band at all.
 *                    First fresh CLOSE-based cross of VWAP each session ->
 *                    enter in that direction; exit on the first opposite
 *                    cross, or session end if none comes. No σ/band, no
 *                    TP/SL — the trend read alone decides the exit, the
 *                    minimal-DOF version per CLAUDE.md's own staging rule
 *                    (a bare cross rule has nothing to overfit). Its exit is
 *                    a moving level (VWAP itself), not a static price, so it
 *                    computes its own fill directly rather than handing a
 *                    static order to `walkBars` — a different fill CONTRACT,
 *                    not a re-implementation of the shared one.
 *
 *                    vwap_trend_cross's own §20 result was null because a
 *                    bare 1-bar cross fires on ~97% of ALL sessions and
 *                    whipsaws immediately most of the time (win rate 9-12%,
 *                    gross P&L ≈ 0) — not because the direction call was
 *                    wrong. Four confirmation filters (2026-08-30, owner's
 *                    follow-up "how would we filter out [the noise]") test
 *                    that diagnosis directly, each opt-in via `spec`,
 *                    composable, default off (byte-identical when omitted):
 *                      • `confirmTfMinutes` — wait for an N-minute bucket's
 *                        own CLOSE to still be beyond VWAP (the same
 *                        "closes not wicks" convention as `band_follow`'s
 *                        confirmation, now shared via `barUtils.isBucketCloseAt`
 *                        after this became its third caller).
 *                      • `minCrossSigma` — the close must clear VWAP by at
 *                        least this many σ (reusing `computeSessionVwap`'s
 *                        own `sd[]`, no new vol math) — a thin band, honestly
 *                        named as one.
 *                      • `requireTrendRegime` (+ `adxThreshold`, default 25)
 *                        — causal ADX(14) on this session's own bars must
 *                        already read trending at the moment of the cross
 *                        (`indicatorCore.adxWilder`, reused not re-derived).
 *                      • `excludeSession` — skip crosses during a given UTC
 *                        session bucket (the local `sessionOf` duplicate is
 *                        the established, documented pattern — 6 other files
 *                        already carry their own private copy).
 *                    All four apply at the CONFIRMED trigger bar, and the
 *                    exit scan (opposite cross) applies the same
 *                    `confirmTfMinutes` confirmation so entry and exit read
 *                    noise the same way.
 *
 * All three are ONE entry primitive parameterised by {location, action} — not three
 * bespoke legs (Lego Principle 2). The fill walker (`walkBars`) and the IS/OOS
 * reporter (`summarizeSplit`) are IMPORTED from the baseplate, never re-implemented.
 *
 * HONESTY NOTES baked in:
 *   • FX "volume" is OANDA *tick count*, not real traded volume. This VWAP is a
 *     tick-weighted average — the standard FX proxy, and the reason FX VWAP is
 *     weaker than an equity VWAP. Stated, not hidden.
 *   • Costs ON by default (round-trip spread/commission; slippage added on the
 *     stop-entry `band_follow` control). A no-cost number is not a result.
 *   • No lookahead: the level a bar is tested against is the band as it stood at
 *     the PRIOR bar's close (lag-one), mirroring `walkDynamicHL` in forecastCore.
 *   • Horizon-agnostic: a "session" is a bucket of bars — day / week / month via
 *     `sessionAnchor`. Daily VWAP, weekly VWAP, monthly VWAP through one code path.
 *
 * Pure over packed M1 (`{n,times,opens,highs,lows,closes,volumes}`) — no network.
 */

import { walkBars } from './forecastCore.js';
import { summarizeSplit } from './honestForecastEngine.js';
import { isBucketCloseAt } from './barUtils.js';
import { adxWilder } from './indicatorCore.js';

// ── Default frictions (% of price), matching forecastCore's fx defaults ──────
const DEFAULT_COST_PCT = 0.012;   // round-trip spread+commission
const DEFAULT_SLIP_PCT = 0.006;   // per-side slippage on stop/breakout entries

const DAY = 86400;

// Same 3-way session labels the rest of the repo uses (levelAtlasEngine) — a
// local copy is the established, documented pattern here (levelAtlasEngine.js,
// sessionPathEngine.js, vwapExtensionAtlasEngine.js, vwapFixedSigmaEngine.js,
// vwapFixedSigmaAtlasEngine.js each already carry their own).
function sessionOf(hourUtc) {
  if (hourUtc >= 22 || hourUtc < 7) return 'Asia';
  if (hourUtc < 13) return 'London';
  return 'NY';
}

// ── Session bucketing (horizon anchor) ───────────────────────────────────────
// Returns an integer bucket id from an epoch-seconds timestamp.
function sessionBucket(epochSec, anchor) {
  if (anchor === 'week') {
    // ISO-ish week: epoch day 0 (1970-01-01) was a Thursday; shift so weeks start
    // Monday. (day+3)%7 == 0 on Mondays. Bucket by Monday index.
    const day = Math.floor(epochSec / DAY);
    return Math.floor((day + 3) / 7);        // Monday-anchored week index
  }
  if (anchor === 'month') {
    const d = new Date(epochSec * 1000);
    return d.getUTCFullYear() * 12 + d.getUTCMonth();
  }
  return Math.floor(epochSec / DAY);          // default: UTC calendar day
}

// Date string for a session (its first bar's UTC date) — summarizeSplit sorts on
// this, and 'YYYY-MM-DD' string order == chronological order.
function isoDate(epochSec) {
  return new Date(epochSec * 1000).toISOString().slice(0, 10);
}

// ── VWAP + volume-weighted σ bands (session-anchored, cumulative) ─────────────
// tp = hlc3, weighted by tick volume (proxy). σ is the running volume-weighted
// standard deviation of tp around VWAP: Var = E[tp²·w]/Σw − VWAP². This is the
// classic "VWAP band" construct — self-contained intraday, no external vol model.
// Pure + unit-testable. Exported so tests and other callers can reuse it.
export function computeSessionVwap(bars) {
  const n = bars.length;
  const vwap = new Float64Array(n);
  const sd = new Float64Array(n);
  let cumV = 0, cumTPV = 0, cumTP2V = 0;
  for (let k = 0; k < n; k++) {
    const b = bars[k];
    const tp = (b.high + b.low + b.close) / 3;
    const w = (b.volume ?? b.tick_volume ?? 1) || 1;   // guard 0/NaN → 1
    cumV += w; cumTPV += tp * w; cumTP2V += tp * tp * w;
    const mean = cumTPV / cumV;
    vwap[k] = mean;
    const varr = cumTP2V / cumV - mean * mean;
    sd[k] = varr > 0 ? Math.sqrt(varr) : 0;
  }
  return { vwap, sd };
}

// ── The ONE VWAP entry primitive ─────────────────────────────────────────────
// Detects the trigger bar for a mode using LAGGED levels (band as of bar k−1),
// freezes entry/tp/sl at that level, then hands a static order to the shared
// `walkBars`. One trade per session (first valid setup). Returns a trade record
// or a no-fill record.
//
// spec = {
//   mode: 'band_fade' | 'vwap_bounce' | 'band_follow',
//   entryK: k for the entry band (σ multiples, default 2.0),
//   slK:    stop distance in σ multiples (default 1.5),
//   followStep: extra σ for the band_follow target (default 1.0),
//   dir: 'both' | 'long' | 'short',
//   warmupBars: min bars before a trigger is allowed (default 30),
//   costPct, slipPct,
// }
export function simulateVwapSession(bars, spec) {
  const n = bars.length;
  const noFill = { filled: false, side: '', outcome: 'no_fill', pnl_pct: 0, mode: spec.mode };
  if (n < (spec.warmupBars ?? 30) + 2) return noFill;

  const { mode = 'band_fade', entryK = 2.0, slK = 1.5, followStep = 1.0,
          dir = 'both', warmupBars = 30,
          costPct = DEFAULT_COST_PCT, slipPct = DEFAULT_SLIP_PCT } = spec;

  const { vwap, sd } = computeSessionVwap(bars);
  const open = bars[0].open || bars[0].close;
  const wantLong = dir === 'both' || dir === 'long';
  const wantShort = dir === 'both' || dir === 'short';

  // Lagged level accessors: the level bar k is TESTED against is as of k−1.
  const upB = (k) => vwap[k - 1] + entryK * sd[k - 1];
  const dnB = (k) => vwap[k - 1] - entryK * sd[k - 1];

  let order = null;   // { fromIdx, entry, tp, sl, isBuy, type, side }

  if (mode === 'band_fade') {
    // First touch of a σ-band → fade back to VWAP.
    for (let k = warmupBars; k < n; k++) {
      if (sd[k - 1] <= 0) continue;
      const up = upB(k), dn = dnB(k);
      if (wantShort && bars[k].high >= up) {
        order = { fromIdx: k, entry: up, tp: vwap[k - 1], sl: up + slK * sd[k - 1], isBuy: false, type: 'limit', side: 'SELL' };
        break;
      }
      if (wantLong && bars[k].low <= dn) {
        order = { fromIdx: k, entry: dn, tp: vwap[k - 1], sl: dn - slK * sd[k - 1], isBuy: true, type: 'limit', side: 'BUY' };
        break;
      }
    }
  } else if (mode === 'band_follow') {
    // First break THROUGH a σ-band → continuation to the next band out (stop entry, slipped).
    const slip = open * slipPct / 100;
    for (let k = warmupBars; k < n; k++) {
      if (sd[k - 1] <= 0) continue;
      const up = upB(k), dn = dnB(k), s = sd[k - 1], v = vwap[k - 1];
      if (wantLong && bars[k].high >= up) {
        order = { fromIdx: k, entry: up + slip, tp: v + (entryK + followStep) * s, sl: up - slK * s, isBuy: true, type: 'stop', side: 'BUY' };
        break;
      }
      if (wantShort && bars[k].low <= dn) {
        order = { fromIdx: k, entry: dn - slip, tp: v - (entryK + followStep) * s, sl: dn + slK * s, isBuy: false, type: 'stop', side: 'SELL' };
        break;
      }
    }
  } else if (mode === 'vwap_bounce') {
    // Two-phase: (1) wait for a stretch to ±entryK·σ → record side; (2) wait for
    // price to return to VWAP → enter in the stretch direction (bet VWAP holds),
    // target the band it came from, stop through fair value.
    let stretch = null;   // 'up' | 'down'
    for (let k = warmupBars; k < n; k++) {
      if (sd[k - 1] <= 0) continue;
      const up = upB(k), dn = dnB(k), v = vwap[k - 1], s = sd[k - 1];
      if (!stretch) {
        if (bars[k].high >= up) stretch = 'up';
        else if (bars[k].low <= dn) stretch = 'down';
        continue;
      }
      if (stretch === 'up' && wantLong && bars[k].low <= v) {
        // pulled back to VWAP from above → buy the bounce, target the upper band
        order = { fromIdx: k, entry: v, tp: v + entryK * s, sl: v - slK * s, isBuy: true, type: 'limit', side: 'BUY' };
        break;
      }
      if (stretch === 'down' && wantShort && bars[k].high >= v) {
        order = { fromIdx: k, entry: v, tp: v - entryK * s, sl: v + slK * s, isBuy: false, type: 'limit', side: 'SELL' };
        break;
      }
    }
  }

  if (mode === 'vwap_trend_cross') {
    // Trade WITH VWAP's own read: first fresh close-based cross each session
    // enters; exit on the first opposite cross or session end. `ref(k)` is
    // the SAME lagged-level convention as upB/dnB above (bar k tested
    // against vwap[k-1], no same-bar lookahead).
    const ref = (k) => vwap[k - 1];
    const { confirmTfMinutes = 1, minCrossSigma = 0, requireTrendRegime = false,
            adxThreshold = 25, excludeSession = null } = spec;
    const dayStart0 = bars[0].time - (bars[0].time % DAY);
    const adx = requireTrendRegime ? adxWilder(bars, 14) : null;

    // Confirmed cross at-or-after bar k0: the raw 1-bar sign flip, then (if
    // confirmTfMinutes>1) the enclosing bucket's own CLOSE must still be on
    // that side ("closes not wicks" — a wick-only flip is not a real cross).
    // Returns the confirmed bar index, or -1 if none was found from k0 on.
    function confirmedCrossFrom(k0, wantUp) {
      for (let k = k0; k < n; k++) {
        const now = bars[k].close - ref(k), prev = bars[k - 1].close - ref(k - 1);
        const rawCross = wantUp ? (now > 0 && prev <= 0) : (now < 0 && prev >= 0);
        if (!rawCross) continue;
        if (confirmTfMinutes <= 1) return k;
        let confirmIdx = -1;
        for (let m = k; m < n && m < k + confirmTfMinutes + 2; m++) {
          if (isBucketCloseAt(bars[m].time, dayStart0, confirmTfMinutes)) { confirmIdx = m; break; }
        }
        if (confirmIdx < 0) return -1;                                    // ran off the session
        const stillOnSide = wantUp ? (bars[confirmIdx].close - ref(confirmIdx) > 0)
                                     : (bars[confirmIdx].close - ref(confirmIdx) < 0);
        if (stillOnSide) return confirmIdx;
        k = confirmIdx;                                                   // wick-only -- resume scanning after the bucket
      }
      return -1;
    }

    let entryIdx = null, isBuyCross = null, k = warmupBars;
    while (k < n) {
      const upIdx = wantLong ? confirmedCrossFrom(k, true) : -1;
      const dnIdx = wantShort ? confirmedCrossFrom(k, false) : -1;
      const idx = upIdx < 0 ? dnIdx : dnIdx < 0 ? upIdx : Math.min(upIdx, dnIdx);
      if (idx < 0) break;
      const isUp = idx === upIdx;

      if (minCrossSigma > 0) {
        const s = sd[idx - 1];
        if (!(s > 0) || Math.abs(bars[idx].close - ref(idx)) < minCrossSigma * s) { k = idx + 1; continue; }
      }
      if (requireTrendRegime && !(adx[idx - 1] >= adxThreshold)) { k = idx + 1; continue; }
      if (excludeSession && sessionOf(new Date(bars[idx].time * 1000).getUTCHours()) === excludeSession) { k = idx + 1; continue; }

      entryIdx = idx; isBuyCross = isUp; break;
    }
    if (entryIdx == null || entryIdx + 1 >= n) return noFill;

    const entryPx = bars[entryIdx + 1].open;
    let exitIdx = n - 1, exitPx = bars[n - 1].close, outcome = 'session_close';
    const revIdx = confirmedCrossFrom(entryIdx + 1, !isBuyCross);
    if (revIdx >= 0) { exitIdx = revIdx; exitPx = bars[revIdx].close; outcome = 'reverse_cross'; }

    const sgn = isBuyCross ? 1 : -1;
    const net = ((exitPx - entryPx) / entryPx) * 100 * sgn - costPct;
    return { filled: true, side: isBuyCross ? 'BUY' : 'SELL', outcome, mode,
      pnl_pct: +net.toFixed(5), entry: +entryPx.toFixed(6), exit: +exitPx.toFixed(6),
      fill_time: bars[entryIdx + 1].time, exit_time: bars[exitIdx].time };
  }

  if (!order) return noFill;

  // Hand the frozen order to the shared fill walker over the remaining bars.
  const r = walkBars(bars.slice(order.fromIdx), order.entry, order.tp, order.sl,
                     order.isBuy, order.type, open);
  if (!r || !r.filled) return noFill;
  const net = r.pnlPct - costPct;   // round-trip friction (slippage already in entry for follow)
  return {
    filled: true, side: order.side, outcome: r.outcome, mode,
    pnl_pct: +net.toFixed(5),
    entry: +order.entry.toFixed(6), tp: +order.tp.toFixed(6), sl: +order.sl.toFixed(6),
    fill_time: r.fillTime ?? null, exit_time: r.exitTime ?? null,
  };
}

// ── Iterate sessions over packed M1 → trade records ──────────────────────────
// Returns records[] shaped for summarizeSplit: { date, filled, pnl_pct, ... }.
export function runVwapReversion(packed, opts = {}) {
  const { sessionAnchor = 'day', dateFrom = null, dateTo = null, ...spec } = opts;
  const records = [];
  if (!packed || !packed.n) return records;

  let curBucket = null, sess = [];
  const flush = () => {
    if (sess.length) {
      const d = isoDate(sess[0].time);
      const passFrom = !dateFrom || d >= dateFrom;
      const passTo = !dateTo || d <= dateTo;
      if (passFrom && passTo) {
        const t = simulateVwapSession(sess, spec);
        records.push({ date: d, filled: t.filled, pnl_pct: t.pnl_pct,
                       side: t.side, outcome: t.outcome, mode: t.mode });
      }
    }
    sess = [];
  };

  for (let i = 0; i < packed.n; i++) {
    const time = packed.times[i];
    const b = { time, open: packed.opens[i], high: packed.highs[i],
                low: packed.lows[i], close: packed.closes[i], volume: packed.volumes[i] };
    const bucket = sessionBucket(time, sessionAnchor);
    if (curBucket === null) curBucket = bucket;
    if (bucket !== curBucket) { flush(); curBucket = bucket; }
    sess.push(b);
  }
  flush();
  return records;
}

// ── A/B/control comparison on ONE pair's packed M1, with IS/OOS split ─────────
// Runs the three modes (+ a no-cost band_fade for cost-sensitivity) and returns
// { [mode]: summarizeSplit } so the OOS card can be built directly.
export function compareVwapModes(packed, opts = {}) {
  const { oosFrac = 0.4, ...base } = opts;
  const modes = {
    band_fade:   { mode: 'band_fade' },
    vwap_bounce: { mode: 'vwap_bounce' },
    band_follow: { mode: 'band_follow' },
    band_fade_nocost: { mode: 'band_fade', costPct: 0, slipPct: 0 },  // cost floor
    vwap_trend_cross: { mode: 'vwap_trend_cross' },
  };
  const out = {};
  for (const [name, m] of Object.entries(modes)) {
    const recs = runVwapReversion(packed, { ...base, ...m });
    out[name] = summarizeSplit(recs, oosFrac);
  }
  return out;
}

export const VWAP_MODES = ['band_fade', 'vwap_bounce', 'band_follow', 'vwap_trend_cross'];
