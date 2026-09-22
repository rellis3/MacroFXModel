/**
 * VWAP Stretch Watch — Tier-2 glue, pure. Turns "how far is price from the
 * session VWAP, in the frozen-σ unit" into one live reading per instrument,
 * for desk watch to speak about as CONTEXT, never a signal.
 *
 * Answers exactly the question `MD files/GOLD_VWAP_FIXED_SIGMA_FINDINGS.md`
 * §7 already validated (gold + EURUSD/GBPUSD/USDJPY, vs a random-walk
 * control, cross-instrument replicated in §7c): a 2σ+ stretch from session
 * VWAP, where σ is FROZEN at session open from the trailing 20 sessions'
 * own RMS deviation from their own running VWAP, returns to VWAP within
 * ~4 hours meaningfully more often than chance — more so outside NY, less
 * so during it. No entry, exit, TP or SL here — every trade-level test of
 * that finding (§6, §8b, §9, §9a, §14) came back null; this module only
 * ever reports the descriptive stretch itself.
 *
 * ── COMPOSES, COPIES NOTHING ─────────────────────────────────────────────
 *   `computeSessionVwap` (vwapReversionEngine) — the running tick-VWAP
 *   `groupUtcDays`, `sessionRmsFromVwap`, `DEFAULT_CFG` (vwapFixedSigmaEngine)
 *       — the exact frozen-σ construction the §7 finding was measured on
 *   `bisect` (barUtils) — O(log n) tail-window slicing of a packed M1 array
 *
 * ── NO-LOOKAHEAD CONTRACT ─────────────────────────────────────────────────
 *   `computeFrozenSigma` only ever reads sessions strictly BEFORE the one
 *   `computeStretchSnapshot` reports on — the two are passed as separate
 *   arguments (history vs. today) so there is no path for today's own bars
 *   to leak into its own σ, unlike the offline engines which have to slice
 *   one continuous archive.
 *
 * Pure: no network, no clock read (a `now` epoch is passed in), no random.
 * Unit-tested on synthetic data in vwapStretchCore.test.mjs.
 */

import { computeSessionVwap } from './vwapReversionEngine.js';
import { groupUtcDays, sessionRmsFromVwap, DEFAULT_CFG } from './vwapFixedSigmaEngine.js';
import { bisect } from './barUtils.js';

const DAY = 86400;

// Same 3-way session labels the rest of the repo uses (levelAtlasEngine,
// vwapFixedSigmaEngine, etc.) — a local copy is the established, documented
// pattern here (those files each carry their own private copy too).
export function sessionOf(hourUtc) {
  if (hourUtc >= 22 || hourUtc < 7) return 'Asia';
  if (hourUtc < 13) return 'London';
  return 'NY';
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Tail-slice a packed M1 array to the last `days` calendar days before
// `beforeEpoch` — keeps a live per-tick recompute cheap on a multi-year
// archive. Returns a new packed object (same shape), never mutates input.
function _tailSlice(packed, beforeEpoch, days) {
  const from = beforeEpoch - days * DAY;
  const i0 = bisect(packed.times, from);
  const i1 = bisect(packed.times, beforeEpoch);
  const slice = k => packed[k]?.slice(i0, i1);
  return { n: i1 - i0, times: slice('times'), opens: slice('opens'), highs: slice('highs'), lows: slice('lows'), closes: slice('closes'), volumes: slice('volumes') };
}

/**
 * The σ today's session would freeze at open, from a packed M1 archive of
 * PRIOR sessions only (the caller must not include today's own bars here).
 *
 *   computeFrozenSigma(historyPacked, { now, ...cfg }) ->
 *     { sigma, sessionsUsed, lastSessionDate } | null (insufficient history)
 */
export function computeFrozenSigma(historyPacked, opts = {}) {
  const cfg = { ...DEFAULT_CFG, ...opts };
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const lookbackDays = opts.lookbackDays ?? (cfg.historySessions * 2 + 15);   // buffer for weekends/holidays
  const sliced = _tailSlice(historyPacked, now, lookbackDays);
  if (!sliced.n) return null;
  const days = groupUtcDays(sliced, cfg.minBarsPerDay);
  if (!days.length) return null;
  const rms = [];
  for (const { bars } of days) {
    const { vwap } = computeSessionVwap(bars);
    const r = sessionRmsFromVwap(bars, vwap);
    if (r != null && r > 0) rms.push(r);
  }
  if (rms.length < cfg.minHistory) return null;
  const win = rms.slice(-cfg.historySessions);
  const sigma = cfg.useMedian ? median(win) : win.reduce((s, v) => s + v, 0) / win.length;
  if (!(sigma > 0)) return null;
  return { sigma, sessionsUsed: win.length, lastSessionDate: new Date(days.at(-1).bars.at(-1).time * 1000).toISOString().slice(0, 10) };
}

/**
 * Today's live stretch from session VWAP, in units of a pre-computed frozen
 * σ. `todayBars` = today's UTC-session bars so far, ascending, each with a
 * `volume` field (tick count is fine — the same FX proxy the whole VWAP
 * family here already uses, stated not hidden).
 *
 *   computeStretchSnapshot({ todayBars, sigma, now, minBars }) ->
 *     { z, side, band, session, price, vwap, sigma, asOfEpoch } | null
 */
export function computeStretchSnapshot({ todayBars, sigma, now, minBars = 8 } = {}) {
  if (!Array.isArray(todayBars) || todayBars.length < minBars) return null;
  if (!(sigma > 0)) return null;
  const { vwap } = computeSessionVwap(todayBars);
  const last = todayBars.at(-1);
  const currentVwap = vwap.at(-1);
  const price = last.close;
  const z = (price - currentVwap) / sigma;
  const nowEpoch = now ?? last.time;
  const hourUtc = new Date(nowEpoch * 1000).getUTCHours();
  return {
    z, side: z >= 0 ? 'up' : 'dn', band: Math.floor(Math.abs(z)),
    session: sessionOf(hourUtc), price, vwap: currentVwap, sigma, asOfEpoch: last.time,
  };
}

/**
 * Convenience wrapper composing both halves — history (prior sessions only,
 * for σ) and today (session-so-far, for the live reading). Either half
 * missing/insufficient -> null (the caller silently disables the trigger,
 * per js/deskWatch.js's own "missing input disables the trigger" contract).
 */
export function computeVwapStretch({ historyPacked, todayBars, now, cfg = {}, minBars = 8 } = {}) {
  const nowEpoch = now ?? Math.floor(Date.now() / 1000);
  const frozen = historyPacked ? computeFrozenSigma(historyPacked, { ...cfg, now: nowEpoch }) : null;
  if (!frozen) return null;
  return computeStretchSnapshot({ todayBars, sigma: frozen.sigma, now: nowEpoch, minBars });
}
