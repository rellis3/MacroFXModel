/**
 * VuManChu Core — ONE WaveTrend / Money-Flow / VWAP compute, consumed two ways.
 *
 * The same oscillator math was maintained in two hand-written copies that had
 * silently drifted: `js/vumanchu.js` (`computeWT`, used by signal.js + the gold
 * backtest) and `asiaRangeEngine._computeWT1Series` (the Asia-range backtest).
 * They differed ONLY in the divide-by-zero guard on the channel index —
 * `d > 0` vs `d > 1e-10` — which changes nothing except in the impossible case
 * where the typical price equals its own smoothing to ~10 decimals. This brick
 * makes the compute a single source of truth with ONE guard (`WT_EPS = 1e-10`,
 * the safer of the two, and the one the Asia-range backtest already used — so
 * that backtest's numbers do not move).
 *
 * One compute, two use cases (the difference is a parameter / which accessor you
 * call, NOT a second implementation):
 *   • Backtest / gating  → `waveTrendSeries(bars, opts)` returns the raw WT1[]
 *     (one value per bar) to confirm an entry at a level.
 *   • Signal / confirmation → `waveTrendReading(bars, {direction, …})` returns
 *     WT1+WT2 + an overbought/oversold/cross signal for the latest bar.
 * Both run `computeWaveTrend` underneath, so they can never disagree.
 *
 * Pure functions only — no DOM, no imports, no side effects. `bars` = array of
 * { open, high, low, close, volume? } (any timeframe; caller resamples).
 */

// Divide-by-zero guard for the WaveTrend channel index. Standardized here so the
// two former copies stop drifting. 1e-10 ignores float-noise-sized deviations.
export const WT_EPS = 1e-10;

// ── EMA / SMA (seeded at the first value; faithful to js/vumanchu.js) ─────────
export function ema(values, period) {
  if (!values?.length || period <= 0) return [];
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

export function sma(values, period) {
  return values.map((_, i) =>
    i < period - 1 ? NaN
      : values.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period);
}

// ── WaveTrend (VuManChu Cipher B core) ───────────────────────────────────────
// hlc3 → EMA(n1)=esa → EMA(|hlc3-esa|,n1)=d → ci=(hlc3-esa)/(0.015·d) →
// EMA(ci,n2)=WT1 ; WT2 = SMA(WT1, sp). Returns { wt1, wt2 } aligned to bars.
export function computeWaveTrend(bars, { n1 = 10, n2 = 21, sp = 4 } = {}) {
  const hlc3 = bars.map(b => (b.high + b.low + b.close) / 3);
  const esa  = ema(hlc3, n1);
  const d    = ema(hlc3.map((h, i) => Math.abs(h - esa[i])), n1);
  const ci   = hlc3.map((h, i) => d[i] > WT_EPS ? (h - esa[i]) / (0.015 * d[i]) : 0);
  const wt1  = ema(ci, n2);
  const wt2  = sma(wt1, sp);
  return { wt1, wt2 };
}

// ── Money Flow (directional volume pressure, ±100) ───────────────────────────
// ⚠ NOT the VuManChu formula — see `computeMoneyFlowVMC` below, which is faithful
// to the Pine `f_rsimfi`. This variant is volume-weighted, EMA-smoothed and
// peak-normalised, and is kept unchanged because live consumers depend on it
// (`js/vumanchu.js` → assessEntry → level-bot alerts; `poiReactionV1Engine`).
// New work should use `computeMoneyFlowVMC`.
export function computeMoneyFlow(bars, { period = 14 } = {}) {
  const raw = bars.map(b => {
    const range = (b.high - b.low) || 1e-10;
    const vol   = b.volume ?? b.tick_volume ?? 1;
    return (b.close - b.open) / range * vol;
  });
  const peak = Math.max(...raw.map(Math.abs)) || 1;
  return ema(raw.map(v => v / peak * 100), period);
}

// ── Money Flow, FAITHFUL to the VuManChu Pine (`f_rsimfi`) ───────────────────
// Reviewed against the operator's actual Pine source (2026-07-30):
//
//   f_rsimfi(_period, _multiplier, _tf) =>
//       sma(((close - open) / (high - low)) * _multiplier, _period) - rsiMFIPosY
//   defaults: rsiMFIperiod = 60, rsiMFIMultiplier = 150, rsiMFIPosY = 2.5
//
// Three material differences from `computeMoneyFlow` above, which is why this is a
// SEPARATE function rather than a change to that one (it has live consumers —
// `js/vumanchu.js` → `assessEntry` → the level-bot's Telegram alerts, and
// `poiReactionV1Engine`; silently changing it would move live bot output):
//   1. NO VOLUME. Despite the name, VuManChu's "MFI" is a pure candle-body ratio.
//      The usual objection that money flow is meaningless on FX because there is
//      no real volume therefore does NOT apply to the indicator as written.
//   2. SMA over 60 bars, not EMA over 14.
//   3. Scaled by a fixed multiplier (150) and shifted by a fixed offset (2.5) —
//      no peak normalisation, so it is neither window-dependent nor
//      outlier-dominated, and it lands naturally in a ±25-ish band that hugs zero
//      on the ±100 WaveTrend scale. That is why a stock Cipher B pane shows it as
//      a compact band rather than something the size of the wave.
// The offset means the neutral line is at 0 AFTER subtraction, i.e. raw
// sma(...) = 2.5 is "flat" — a deliberate slight bearish bias in the original.
export function computeMoneyFlowVMC(bars, { period = 60, multiplier = 150, offset = 2.5 } = {}) {
  const raw = bars.map(b => {
    const range = (b.high - b.low);
    return range > 0 ? ((b.close - b.open) / range) * multiplier : 0;
  });
  return sma(raw, period).map(v => Number.isFinite(v) ? v - offset : NaN);
}

// ── VWAP (cumulative from bar 0) + ±100 oscillator ───────────────────────────
export function computeVWAP(bars) {
  let cumTpv = 0, cumVol = 0;
  const vwap = bars.map(b => {
    const tp  = (b.high + b.low + b.close) / 3;
    const vol = b.volume ?? b.tick_volume ?? 1;
    cumTpv += tp * vol; cumVol += vol;
    return cumVol > 0 ? cumTpv / cumVol : tp;
  });
  const raw  = bars.map((b, i) => b.close - vwap[i]);
  const peak = Math.max(...raw.map(Math.abs)) || 1;
  return { vwap, osc: raw.map(v => v / peak * 100) };
}

// ── Use case 1: raw WT1 series (backtest / level gating) ──────────────────────
// Returns one WT1 value per bar. (asiaRangeEngine consumes this.)
export function waveTrendSeries(bars, opts = {}) {
  return computeWaveTrend(bars, opts).wt1;
}

// ── Use case 2: latest-bar signal (confirmation) ─────────────────────────────
// Reads WT1/WT2 at the last bar and returns an overbought/oversold/cross signal,
// optionally relative to a trade `direction`. obLevel/osLevel are the classic
// VuManChu Cipher B bands. Same compute as use case 1 — only the consumption
// differs, selected by which function (or `mode`) you call.
export function waveTrendReading(bars, { direction = null, obLevel = 53, osLevel = -53, ...wtOpts } = {}) {
  const { wt1, wt2 } = computeWaveTrend(bars, wtOpts);
  const v1 = wt1[wt1.length - 1] ?? 0;
  const v2 = wt2[wt2.length - 1] ?? 0;
  let signal;
  if (v1 <= osLevel)      signal = 'OVERSOLD';
  else if (v1 >= obLevel) signal = 'OVERBOUGHT';
  else if (v1 > v2)       signal = 'BULLISH';
  else if (v1 < v2)       signal = 'BEARISH';
  else                    signal = 'NEUTRAL';
  // Optional agreement read against a trade direction.
  let agree = null;
  if (direction) {
    const isLong = direction === 'LONG' || direction === 'BUY';
    agree = (isLong && (signal === 'OVERSOLD' || signal === 'BULLISH')) ||
            (!isLong && (signal === 'OVERBOUGHT' || signal === 'BEARISH'));
  }
  return { wt1, wt2, value: v1, signalValue: v2, signal, agree };
}

// Convenience dispatcher — same compute, mode selects the consumption shape.
//   mode 'series' → WT1[] ; mode 'signal' → { value, signal, … }
export function vumanchuWaveTrend(bars, { mode = 'series', ...opts } = {}) {
  return mode === 'signal' ? waveTrendReading(bars, opts) : waveTrendSeries(bars, opts);
}
