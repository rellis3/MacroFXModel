/**
 * Confluence Features — the at-a-touch CONTEXT stack for a forecast-line touch:
 * multi-timeframe VuManChu, higher-timeframe trend/momentum, session-VWAP
 * extension, and the structural-confluence count. It answers one question, in
 * the vocabulary the existing analyser already speaks:
 *
 *   when price tags a forecast line, does the surrounding multi-timeframe
 *   picture say REVERT or CONTINUE?
 *
 * It is a `tf` FEATURE PACK, not an engine. `forecastAnalyser.runAnalyser`
 * takes one via `opts.tf`, calls `pack.compute(...)` at each touch, and reads
 * `pack.KEYS` to know which bucket columns to store — so every new feature here
 * flows automatically into the Drivers tab (chi-square + IS/OOS), the
 * Conditioning tab and `perLineStrategy`'s cell policy WITHOUT touching them.
 *
 * ── COMPOSES, COPIES NOTHING ─────────────────────────────────────────────────
 *   • `touchFeatures`          — the existing 6 at-the-moment features, wrapped
 *   • `vumanchuCore`           — the ONE WaveTrend compute, per timeframe
 *   • `indicatorCore`          — ADX / EMA (never re-inlined)
 *   • `barUtils.resamplePacked`— packed M1 → 15m/1h/4h in one pass
 *   • `rangeLineAnalyser`      — `confluenceBucketAt` + `intradayConfluenceAt`,
 *     the SAME structural-confluence read the range-line book was validated on
 *     (pointed at forecast lines instead of fib lines — no second copy)
 *
 * This module is INJECTED by the caller (the analyser store), never imported by
 * `forecastAnalyser` itself: `confluenceFeatures → rangeLineAnalyser →
 * forecastAnalyser` is a clean DAG, and importing it the other way would close
 * that into an import cycle.
 *
 * ── THE LOOKAHEAD RULE (the reason the HTF read is a brick, not three lines) ──
 * The naive higher-timeframe read is "which 4h bar contains this touch? use its
 * value" — which shows a COMPLETED 4h bar up to four hours before it closed.
 * That is the Pine `request.security` repainting bug, and it manufactures edge.
 * Here every HTF series is indexed by `htfIdxAt`, which takes the last bar whose
 * CLOSE is at or before the touch bar's own START. Strictly knowable, and
 * deliberately one notch more conservative than `vumanchuMtf.alignHtfCausal`
 * (which allows the bar closing exactly at the fast bar's close): a touch can
 * happen anywhere inside its M1 bar, so only bars closed BEFORE that minute
 * began are safe.
 *
 * ── ORIENTATION: every bucket means the same thing on both sides ─────────────
 * An "up" touch tagged an upper line; a "dn" touch a lower one. Raw readings are
 * therefore mirror images. Every directional feature here is folded by side into
 * `with` / `against` (of the touch direction), so pooling up and dn lines in one
 * aggregate is legitimate. `3·…` always names the continuation-leaning end and
 * `1·…` the reversion-leaning end — a monotone bucket order the Drivers tab's
 * chi-square and the cell policy can both read.
 *
 * Pure (no network, no DOM). Unit-tested on synthetic bars in
 * `js/confluenceFeatures.test.mjs`.
 */

import { computeWaveTrend } from './vumanchuCore.js';
import { adxWilder, ema } from './indicatorCore.js';
import { bisect, resamplePacked } from './barUtils.js';
import { createTouchFeatures, TOUCH_DEFAULTS } from './touchFeatures.js';
import { confluenceBucketAt, intradayConfluenceAt } from './rangeLineAnalyser.js';

// The 6 base features, in the order `forecastAnalyser` has always stored them.
export const BASE_KEYS = ['approachER', 'approachVel', 'wtState', 'volClimax', 'candleReject', 'roundNum'];
// The 6 this brick adds.
export const CONFLUENCE_KEYS = ['confluence', 'vwapSide', 'wtMtf', 'wtSlow', 'momAdx', 'htfTrend'];

// Timeframe minutes. 5m is deliberately NOT here: it is close to collinear with
// the window's own M1 WaveTrend (`wtState`), so it buys a cell dimension without
// buying information. Add it only after the 15m/1h/4h stack shows the MTF read
// carries anything at all.
export const HTF_MINUTES = { '15m': 15, '1h': 60, '4h': 240 };

export const CONF_DEFAULTS = {
  tfs:       ['15m', '1h', '4h'],   // the MTF WaveTrend stack
  slowTf:    '1h',                  // timeframe for wtSlow + momAdx
  trendTf:   '4h',                  // timeframe for htfTrend
  wt:        { ...TOUCH_DEFAULTS.wt },   // same WaveTrend params as the M1 read
  obLevel:   53, osLevel: -53,      // VuManChu Cipher-B bands (wtSlow)
  adxN:      14, adxTrend: 30, adxRange: 20,
  emaSpan:   50, trendLookback: 10, trendFlat: 0.0015,  // htfTrend: EMA slope over
                                    // `trendLookback` bars as a fraction of price
  vwapNear:  0.25, vwapFar: 0.60,   // |line − VWAP| in daily-σ units
  confTolFrac: 0.10,                // structural tolerance = 0.10 × (σ × open)
  minHtfBars: 60,                   // WaveTrend/ADX warm-up before a read is trusted
};

// ── 1) Per-pair higher-timeframe context ─────────────────────────────────────
// Built ONCE per pair from the whole packed M1 history — NOT per session. A 4h
// WaveTrend needs weeks of prior bars to be warm, so a per-session resample
// would both be wrong (cold indicator every morning) and quadratically slower.
//
// `closeTimes[i] = bar start + timeframe`, which is what `htfIdxAt` searches.
export function createHtfContext(packed, userCfg = {}) {
  const cfg = { ...CONF_DEFAULTS, ...userCfg, wt: { ...CONF_DEFAULTS.wt, ...(userCfg.wt || {}) } };
  const tfs = [...new Set([...cfg.tfs, cfg.slowTf, cfg.trendTf])].filter(t => HTF_MINUTES[t]);
  const byTf = {};
  for (const tf of tfs) {
    const mins  = HTF_MINUTES[tf];
    const bars  = resamplePacked(packed, mins);
    const { wt1, wt2 } = computeWaveTrend(bars, cfg.wt);
    const adx   = adxWilder(bars, cfg.adxN);
    const emaC  = ema(bars.map(b => b.close), cfg.emaSpan);
    const closeTimes = new Float64Array(bars.length);
    for (let i = 0; i < bars.length; i++) closeTimes[i] = bars[i].time + mins * 60;
    byTf[tf] = { mins, bars, wt1, wt2, adx, ema: emaC, closeTimes };
  }
  return { cfg, byTf };
}

// Index of the last `tf` bar that had CLOSED before epoch-second `t`. −1 if none
// (or before the warm-up). See the lookahead note in the header.
export function htfIdxAt(ctx, tf, t) {
  const s = ctx?.byTf?.[tf];
  if (!s || !Number.isFinite(t)) return -1;
  const i = bisect(s.closeTimes, t + 1) - 1;   // last close ≤ t
  return i >= (ctx.cfg.minHtfBars - 1) ? i : -1;
}

// ── 2) Feature computers ─────────────────────────────────────────────────────
// Each returns { value, bucket }; a null bucket is dropped by the analyser, so
// an unavailable reading never pollutes an aggregate (and `extractTouches` drops
// the touch from any cell that gates on it).
const NA = { value: null, bucket: null };

// wtMtf — how many of the MTF WaveTrends are rolling WITH the touch direction.
// `wt1 > wt2` is the wave's own bull/bear read (the Cipher-B cross), taken on
// each timeframe's last CLOSED bar. Folded by side, so 3·with = the whole stack
// backs a continuation and 1·against = the whole stack fights it.
export function featWtMtf(ctx, t, isUp, cfg) {
  let agree = 0, seen = 0;
  for (const tf of cfg.tfs) {
    const i = htfIdxAt(ctx, tf, t);
    if (i < 0) continue;
    const s = ctx.byTf[tf];
    const a = s.wt1[i], b = s.wt2[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    seen++;
    const bull = a > b;
    if (bull === isUp) agree++;
  }
  if (seen < cfg.tfs.length) return NA;          // partial stack → no read at all
  return { value: agree, bucket: agree === seen ? '3·with' : agree === 0 ? '1·against' : '2·mixed' };
}

// wtSlow — the slow wave's STRETCH in the touch direction: is the higher
// timeframe already overbought into an upper-line tag (Cipher-B exhaustion, the
// fade case), or oversold against it (the counter case)?
export function featWtSlow(ctx, t, isUp, cfg) {
  const i = htfIdxAt(ctx, cfg.slowTf, t);
  if (i < 0) return NA;
  const v = ctx.byTf[cfg.slowTf].wt1[i];
  if (!Number.isFinite(v)) return NA;
  const sw = isUp ? v : -v;                      // oriented: + = stretched with the touch
  return { value: +sw.toFixed(2),
           bucket: sw >= cfg.obLevel ? '3·stretched' : sw <= cfg.osLevel ? '1·counter' : '2·mid' };
}

// momAdx — is the slow timeframe trending or ranging at the touch? Undirected
// (ADX has no sign); a trend regime is the continuation-leaning end.
export function featMomAdx(ctx, t, cfg) {
  const i = htfIdxAt(ctx, cfg.slowTf, t);
  if (i < 0) return NA;
  const v = ctx.byTf[cfg.slowTf].adx[i];
  if (!Number.isFinite(v)) return NA;
  return { value: +v.toFixed(1),
           bucket: v >= cfg.adxTrend ? '3·trend' : v <= cfg.adxRange ? '1·range' : '2·mixed' };
}

// htfTrend — the slow-trend backdrop: EMA slope over `trendLookback` closed bars
// as a fraction of price, folded by side.
export function featHtfTrend(ctx, t, isUp, cfg) {
  const i = htfIdxAt(ctx, cfg.trendTf, t);
  const k = cfg.trendLookback;
  if (i < k) return NA;
  const e = ctx.byTf[cfg.trendTf].ema;
  const now = e[i], then = e[i - k];
  if (!Number.isFinite(now) || !Number.isFinite(then) || !(now > 0)) return NA;
  const slope = (now - then) / now;
  const sl = isUp ? slope : -slope;              // oriented: + = trending with the touch
  return { value: +(sl * 100).toFixed(3),
           bucket: Math.abs(sl) < cfg.trendFlat ? '2·flat' : sl > 0 ? '3·with' : '1·against' };
}

// vwapSide — how far the line sits BEYOND the session VWAP at the touch, in
// daily-σ units. Cumulative VWAP to `touchIdx` only (causal by construction).
// Far-beyond-VWAP = a stretched intraday tag (reversion-leaning), so the bucket
// order is inverted vs the others: 3·near is the continuation-leaning end.
//
// NOTE the built-in collinearity: the line itself is a σ-multiple off the OPEN,
// so this feature only carries information to the extent VWAP has drifted away
// from the open. Read its Drivers row against `distPct`, not in isolation.
export function featVwapSide(bars, touchIdx, level, open, sigma, isUp, cfg) {
  if (!(sigma > 0) || !(open > 0) || !(touchIdx >= 0)) return NA;
  let tpv = 0, vol = 0;
  for (let k = 0; k <= touchIdx && k < bars.length; k++) {
    const b = bars[k];
    const v = b.volume ?? 1;
    tpv += ((b.high + b.low + b.close) / 3) * v; vol += v;
  }
  if (!(vol > 0)) return NA;
  const vwap = tpv / vol;
  const d = (isUp ? (level - vwap) : (vwap - level)) / open / sigma;
  return { value: +d.toFixed(3),
           bucket: d <= cfg.vwapNear ? '3·near' : d >= cfg.vwapFar ? '1·far' : '2·mid' };
}

// confluence — how many DISTINCT structural sources sit within tolerance of the
// touched line. Delegates to the range-line book's own bucketer so the two
// pipelines can never disagree about what "confluent" means.
//
// Tolerance is σ-RELATIVE (`confTolFrac × σ × open`), not a fixed pip count:
// the same pip window that is generous on EURUSD is invisible on Nasdaq. The
// range-line engine uses a fraction of the range for exactly this reason; a
// forecast line has no range, so the day's σ is its natural scale.
export function featConfluence(bars, touchIdx, level, open, sigma, confLevels, cfg) {
  if (!confLevels?.length || !(sigma > 0) || !(open > 0)) return NA;
  const tol = cfg.confTolFrac * sigma * open;
  const all = touchIdx >= 1 ? confLevels.concat(intradayConfluenceAt(bars, touchIdx)) : confLevels;
  const bucket = confluenceBucketAt(level, all, tol);
  return bucket ? { value: bucket, bucket } : NA;
}

// ── 3) The pack ──────────────────────────────────────────────────────────────
// Drop-in replacement for `createTouchFeatures`: same `wtSeries`/`compute`
// contract, plus `KEYS` so the analyser stores the wider column set.
//
// `htf` may be null — the pack then degrades to the base 6 features plus the
// two window-local ones (vwapSide, confluence), which is what you want on a
// pair whose M1 history is too short to warm a 4h WaveTrend.
export function createConfluenceFeatures({ htf = null, touchCfg = {}, ...userCfg } = {}) {
  const cfg  = { ...CONF_DEFAULTS, ...(htf?.cfg ?? {}), ...userCfg };
  const base = createTouchFeatures(touchCfg);
  const KEYS = [...BASE_KEYS, ...CONFLUENCE_KEYS];
  return {
    cfg, KEYS, base,
    wtSeries: bars => base.wtSeries(bars),
    compute(c) {
      const out = base.compute(c);
      const { bars = [], touchIdx = -1, open = 0, sigma = 0, side = 'up', level = null,
              confLevels = null } = c;
      const isUp = side === 'up';
      const t = bars[touchIdx]?.time ?? null;
      out.wtMtf     = htf ? featWtMtf(htf, t, isUp, cfg)     : NA;
      out.wtSlow    = htf ? featWtSlow(htf, t, isUp, cfg)    : NA;
      out.momAdx    = htf ? featMomAdx(htf, t, cfg)          : NA;
      out.htfTrend  = htf ? featHtfTrend(htf, t, isUp, cfg)  : NA;
      out.vwapSide  = featVwapSide(bars, touchIdx, level, open, sigma, isUp, cfg);
      out.confluence = featConfluence(bars, touchIdx, level, open, sigma, confLevels, cfg);
      return out;
    },
  };
}
