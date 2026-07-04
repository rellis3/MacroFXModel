/**
 * profileShapeCore.js — Market-Profile day-SHAPE classifier (the b / p / D / B
 * selector) built ON the existing volume-profile output.
 *
 * The `volume_profile` level source (js/levelSources.js) and the Gold bot's
 * volume_profile.py already emit POC / VAH / VAL / HVN / LVN from a
 * volume-at-price histogram. What they do NOT do is name the SHAPE of that
 * histogram, and the shape is what tells you whether to fade or follow:
 *
 *   P  — fat base at the LOW, thin tail up   → short-covering / bullish
 *        → follow long; the low value node is support.
 *   b  — fat top at the HIGH, thin tail down → long-liquidation / bearish
 *        → follow short; the high value node is resistance.
 *   D  — fat MIDDLE, thin both ends          → balance / equilibrium
 *        → fade both edges toward the POC (mean-revert).
 *   B  — two fat humps, thin waist (an LVN)  → double distribution
 *        → the LVN is the decision line; price rejects it or rips through it.
 *
 * This is a `histogram → {shape, bias}` SELECTOR (Lego Principle 4), not a new
 * tunable leg. It is pure and unit-testable on synthetic histograms (no
 * network, no DOM). It intentionally owns its own value-area walk so it can be
 * imported standalone; the near-identical inline walk in
 * `levelSources.volumeProfileLevels` is tracked as a unification candidate in
 * LEGO_MODULES.md (§2) rather than refactored here.
 *
 * Contract:
 *   buildHistogram(bars, opts) -> Bin[]                (sorted, zero-filled)
 *   valueArea(bins, valueAreaPct) -> { poc, vah, val, ... }
 *   classifyProfileShape(bins, opts) -> Classification
 *   profileShapeBias(shape, va, price) -> Bias         (fade/follow selector)
 *
 * Bin = { price:number, volume:number }
 */

/**
 * Build a zero-filled volume-at-price histogram from OHLC(V) bars.
 * Zero-filled bins matter: valley (LVN) detection needs the empty gaps present.
 *
 * @param {Array<{open:number,high:number,low:number,close:number,volume?:number}>} bars
 * @param {{ binSize?:number, pricePick?:(b:any)=>number }} [opts]
 *   binSize  — price width of a bin; defaults to range/50.
 *   pricePick — bar → representative price; defaults to body midpoint
 *               (open+close)/2, faithful to volumeProfileLevels' proxy.
 * @returns {Array<{price:number,volume:number}>} ascending by price
 */
export function buildHistogram(bars, opts = {}) {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const pricePick = opts.pricePick ?? ((b) => (b.open + b.close) / 2);
  const picks = bars.map((b) => ({ p: pricePick(b), v: b.volume ?? 1 }));
  let lo = Infinity, hi = -Infinity;
  for (const { p } of picks) { if (p < lo) lo = p; if (p > hi) hi = p; }
  const span = hi - lo;
  const binSize = opts.binSize && opts.binSize > 0
    ? opts.binSize
    : (span > 0 ? span / 50 : 1);
  const idxOf = (p) => Math.round((p - lo) / binSize);
  const maxIdx = idxOf(hi);
  const vol = new Array(maxIdx + 1).fill(0);
  for (const { p, v } of picks) vol[idxOf(p)] += v;
  return vol.map((v, i) => ({ price: lo + i * binSize, volume: v }));
}

/**
 * Value area from a histogram: POC (max-volume bin), then expand outward the
 * heavier neighbour until `valueAreaPct` of total volume is captured (VAH/VAL).
 * Same greedy walk the existing volume-profile code uses.
 *
 * @param {Array<{price:number,volume:number}>} bins   ascending by price
 * @param {number} [valueAreaPct=0.70]
 * @returns {{ poc:number, vah:number, val:number, pocIndex:number,
 *             total:number, pocVolume:number }|null}
 */
export function valueArea(bins, valueAreaPct = 0.70) {
  if (!Array.isArray(bins) || bins.length === 0) return null;
  let total = 0, pocIndex = 0, pocVolume = -Infinity;
  for (let i = 0; i < bins.length; i++) {
    total += bins[i].volume;
    if (bins[i].volume > pocVolume) { pocVolume = bins[i].volume; pocIndex = i; }
  }
  if (total <= 0) return null;
  const target = total * valueAreaPct;
  let lo = pocIndex, hi = pocIndex, captured = pocVolume;
  while (captured < target && (lo > 0 || hi < bins.length - 1)) {
    const addLo = lo > 0 ? bins[lo - 1].volume : -1;
    const addHi = hi < bins.length - 1 ? bins[hi + 1].volume : -1;
    if (addLo >= addHi && addLo >= 0) { lo--; captured += addLo; }
    else if (addHi >= 0) { hi++; captured += addHi; }
    else break;
  }
  return {
    poc: bins[pocIndex].price,
    vah: bins[hi].price,
    val: bins[lo].price,
    pocIndex, total, pocVolume,
  };
}

/**
 * Classify a volume-at-price histogram into a Market-Profile shape.
 *
 * @param {Array<{price:number,volume:number}>} bins ascending by price
 * @param {object} [opts]
 * @param {number} [opts.valueAreaPct=0.70]
 * @param {number} [opts.balanceBand=0.15]   POC within centre ±band ⇒ balance (D)
 * @param {number} [opts.peakRatio=0.45]      2nd peak must be ≥ this × POC volume
 * @param {number} [opts.minPeakGapFrac=0.20] two peaks ≥ this fraction of range apart
 * @param {number} [opts.valleyRatio=0.70]    waist must dip below this × weaker peak ⇒ B
 * @returns {{
 *   shape:'P'|'b'|'D'|'B', poc:number, vah:number, val:number,
 *   pocPos:number, skew:number, confidence:number,
 *   lvn:number|null, peaks:Array<{price:number,volume:number}>,
 *   bias:object
 * } | null}
 */
export function classifyProfileShape(bins, opts = {}) {
  const {
    valueAreaPct = 0.70,
    balanceBand = 0.15,
    peakRatio = 0.45,
    minPeakGapFrac = 0.20,
    valleyRatio = 0.70,
  } = opts;

  const va = valueArea(bins, valueAreaPct);
  if (!va) return null;

  const loPrice = bins[0].price;
  const hiPrice = bins[bins.length - 1].price;
  const range = hiPrice - loPrice;
  const pocPos = range > 0 ? (va.poc - loPrice) / range : 0.5;

  // Volume skew: >0 means more volume sits above the POC, <0 below.
  let volAbove = 0, volBelow = 0;
  for (let i = 0; i < bins.length; i++) {
    if (i < va.pocIndex) volBelow += bins[i].volume;
    else if (i > va.pocIndex) volAbove += bins[i].volume;
  }
  const skew = va.total > 0 ? (volAbove - volBelow) / va.total : 0;

  // ── Bimodality (B-shape) — find a well-separated secondary peak. ────────────
  const peaks = [];
  for (let i = 1; i < bins.length - 1; i++) {
    const v = bins[i].volume;
    if (v >= bins[i - 1].volume && v >= bins[i + 1].volume && v >= peakRatio * va.pocVolume) {
      peaks.push({ index: i, price: bins[i].price, volume: v });
    }
  }
  // Ensure the POC itself is represented as a peak (flat plateaus can hide it).
  if (!peaks.some((p) => p.index === va.pocIndex)) {
    peaks.push({ index: va.pocIndex, price: va.poc, volume: va.pocVolume });
  }
  peaks.sort((a, b) => b.volume - a.volume);

  let lvn = null;
  let twoPeaks = null;
  const primary = peaks[0];
  const gapBins = Math.max(1, Math.round((minPeakGapFrac * range) / (range / (bins.length - 1 || 1))));
  for (let k = 1; k < peaks.length; k++) {
    if (Math.abs(peaks[k].index - primary.index) >= gapBins) {
      const a = Math.min(primary.index, peaks[k].index);
      const b = Math.max(primary.index, peaks[k].index);
      let valleyVol = Infinity, valleyIdx = a;
      for (let j = a + 1; j < b; j++) {
        if (bins[j].volume < valleyVol) { valleyVol = bins[j].volume; valleyIdx = j; }
      }
      const weaker = Math.min(primary.volume, peaks[k].volume);
      if (valleyVol <= valleyRatio * weaker) {
        lvn = bins[valleyIdx].price;
        twoPeaks = [primary, peaks[k]].sort((x, y) => x.price - y.price);
      }
      break;
    }
  }

  let shape, confidence;
  if (lvn != null && twoPeaks) {
    shape = 'B';
    // Confidence grows with peak separation and valley depth.
    const sep = Math.abs(twoPeaks[1].index - twoPeaks[0].index) / (bins.length - 1 || 1);
    const weaker = Math.min(twoPeaks[0].volume, twoPeaks[1].volume);
    const valley = weaker > 0 ? 1 - (bins.reduce((m, x, j) =>
      (j > Math.min(twoPeaks[0].index, twoPeaks[1].index) &&
       j < Math.max(twoPeaks[0].index, twoPeaks[1].index) &&
       x.volume < m ? x.volume : m), Infinity) / weaker) : 0;
    confidence = clamp01((sep + Math.max(0, valley)) / 2);
  } else if (pocPos <= 0.5 - balanceBand) {
    shape = 'P';                                   // POC low → bullish base
    confidence = clamp01((0.5 - pocPos) / 0.5);
  } else if (pocPos >= 0.5 + balanceBand) {
    shape = 'b';                                   // POC high → bearish cap
    confidence = clamp01((pocPos - 0.5) / 0.5);
  } else {
    shape = 'D';                                   // POC middle → balance
    confidence = clamp01(1 - Math.abs(pocPos - 0.5) / balanceBand);
  }

  return {
    shape,
    poc: va.poc, vah: va.vah, val: va.val,
    pocPos, skew, confidence, lvn,
    peaks: peaks.slice(0, 3).map((p) => ({ price: p.price, volume: p.volume })),
    bias: profileShapeBias(shape, { ...va, lvn }),
  };
}

/**
 * Map a classified shape to a fade/follow entry bias — the actual selector
 * output a strategy composes (parallels dayTypeScore → selectStrategy).
 *
 * @param {'P'|'b'|'D'|'B'} shape
 * @param {{ poc:number, vah:number, val:number, lvn?:number|null }} va
 * @param {number} [price]  live price; for B, resolves direction by LVN side.
 * @returns {{ action:'fade'|'follow', direction:'long'|'short'|'both'|null,
 *             magnet:number, note:string, [k:string]:any }}
 */
export function profileShapeBias(shape, va, price) {
  switch (shape) {
    case 'P':
      return {
        action: 'follow', direction: 'long', magnet: va.poc,
        entryZone: [va.val, va.poc], invalidation: va.val,
        note: 'P: buy pullbacks into the low value node; continuation up.',
      };
    case 'b':
      return {
        action: 'follow', direction: 'short', magnet: va.poc,
        entryZone: [va.poc, va.vah], invalidation: va.vah,
        note: 'b: sell rallies into the high value node; continuation down.',
      };
    case 'D':
      return {
        action: 'fade', direction: 'both', magnet: va.poc,
        upperFade: va.vah, lowerFade: va.val,
        note: 'D: fade VAH (short) / VAL (long) toward the POC; balance.',
      };
    case 'B': {
      const lvn = va.lvn ?? va.poc;
      const direction = price == null ? null : (price >= lvn ? 'long' : 'short');
      return {
        action: 'follow', direction, magnet: lvn, decisionLevel: lvn,
        upperTarget: va.vah, lowerTarget: va.val,
        note: 'B: LVN is the decision line — reject it or rip through; follow the break.',
      };
    }
    default:
      return { action: 'fade', direction: 'both', magnet: va.poc, note: 'unknown shape' };
  }
}

/**
 * Convenience: OHLC(V) bars → shape classification in one call.
 * @param {Array} bars
 * @param {object} [opts] passed to buildHistogram and classifyProfileShape.
 */
export function classifyBars(bars, opts = {}) {
  const bins = buildHistogram(bars, opts);
  if (!bins.length) return null;
  return classifyProfileShape(bins, opts);
}

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

export const PROFILE_SHAPES = ['P', 'b', 'D', 'B'];
