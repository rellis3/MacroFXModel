/**
 * Chart-pattern detection & historical outcome engine.
 *
 * Pure functions over OHLC bar arrays — no I/O. Callers resample packed M1
 * data (see js/volBacktestM1Engine.js::loadM1ForPair) into bars for whatever
 * timeframe they want, then run detectors + outcome stats here.
 *
 * Geometry is expressed in bar-index space ({idx, time, price}) so callers
 * can convert to chart coordinates directly — no re-derivation needed.
 *
 * All thresholds are ATR-normalized so the same detector works unmodified
 * across instruments with very different price scales (EURUSD ~1.08 vs
 * gold ~2300) and across timeframes (1m noise vs daily swings).
 */

// ── Bar resampling ───────────────────────────────────────────────────────────

// Folds packed M1 typed arrays {n,times,opens,highs,lows,closes} (as returned
// by loadM1ForPair) into OHLC bars for an arbitrary minute bucket. Single
// forward pass — relies on `times` being chronologically sorted, which the
// M1 parquet source guarantees.
export function resampleBars(packed, minutes) {
  const bucketSec = minutes * 60;
  const { n, times, opens, highs, lows, closes } = packed;
  const bars = [];
  let cur = null;
  for (let i = 0; i < n; i++) {
    const b = Math.floor(times[i] / bucketSec) * bucketSec;
    if (!cur || cur.time !== b) {
      if (cur) bars.push(cur);
      cur = { time: b, open: opens[i], high: highs[i], low: lows[i], close: closes[i] };
    } else {
      if (highs[i] > cur.high) cur.high = highs[i];
      if (lows[i]  < cur.low)  cur.low  = lows[i];
      cur.close = closes[i];
    }
  }
  if (cur) bars.push(cur);
  return bars;
}

// ── Shared primitives ────────────────────────────────────────────────────────

export function computeATR(bars, period = 14) {
  const atr = new Array(bars.length).fill(0);
  let trSum = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const prevClose = i > 0 ? bars[i - 1].close : b.close;
    const tr = Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose));
    if (i < period) { trSum += tr; atr[i] = trSum / (i + 1); }
    else atr[i] = (atr[i - 1] * (period - 1) + tr) / period;
  }
  return atr;
}

export function pivotHighs(bars, n) {
  const out = [];
  for (let i = n; i < bars.length - n; i++) {
    let isMax = true;
    for (let k = i - n; k <= i + n; k++) {
      if (k !== i && bars[k].high > bars[i].high) { isMax = false; break; }
    }
    if (isMax) out.push({ idx: i, price: bars[i].high, time: bars[i].time });
  }
  return out;
}

export function pivotLows(bars, n) {
  const out = [];
  for (let i = n; i < bars.length - n; i++) {
    let isMin = true;
    for (let k = i - n; k <= i + n; k++) {
      if (k !== i && bars[k].low < bars[i].low) { isMin = false; break; }
    }
    if (isMin) out.push({ idx: i, price: bars[i].low, time: bars[i].time });
  }
  return out;
}

// Least-squares style two-point line through pivots; counts how many other
// pivots lie within tolPct of the projected price at their index (ATR-scaled
// tolerance handled by caller passing a price-relative tolPct).
function lineTouches(pivots, i1, p1, i2, p2, tolPct) {
  const slope = (p2 - p1) / (i2 - i1);
  let count = 2;
  for (const pt of pivots) {
    if (pt.idx === i1 || pt.idx === i2) continue;
    const expected = p1 + slope * (pt.idx - i1);
    if (expected > 0 && Math.abs(pt.price - expected) / expected < tolPct) count++;
  }
  return count;
}

function lineAt(p1, p2, idx) {
  const slope = (p2.price - p1.price) / (p2.idx - p1.idx);
  return p1.price + slope * (idx - p1.idx);
}

// ── Outcome computation ──────────────────────────────────────────────────────

// Walks forward from the confirmation bar toward a measured-move target,
// with a stop at stopFrac of the measured move against the breakout, or a
// timeout after horizonBars. This is the shared "what happened after" logic
// every detector plugs its (confirmIdx, direction, measuredMove) into.
function computeOutcome(bars, confirmIdx, direction, measuredMove, opts = {}) {
  const stopFrac   = opts.stopFrac   ?? 0.5;
  const horizonBars = opts.horizonBars ?? 300;
  const entry = bars[confirmIdx].close;
  const target = direction === 'up' ? entry + measuredMove : entry - measuredMove;
  const stop   = direction === 'up' ? entry - measuredMove * stopFrac : entry + measuredMove * stopFrac;

  let outcome = 'timeout', barsToOutcome = null;
  let mfe = 0, mae = 0; // max favorable / adverse excursion, in price units
  const lastIdx = Math.min(bars.length - 1, confirmIdx + horizonBars);
  let endIdx = lastIdx;

  for (let k = confirmIdx + 1; k <= lastIdx; k++) {
    const bar = bars[k];
    const fav = direction === 'up' ? bar.high - entry : entry - bar.low;
    const adv = direction === 'up' ? entry - bar.low  : bar.high - entry;
    if (fav > mfe) mfe = fav;
    if (adv > mae) mae = adv;
    if (direction === 'up') {
      if (bar.high >= target) { outcome = 'target'; barsToOutcome = k - confirmIdx; endIdx = k; break; }
      if (bar.low  <= stop)   { outcome = 'stop';   barsToOutcome = k - confirmIdx; endIdx = k; break; }
    } else {
      if (bar.low  <= target) { outcome = 'target'; barsToOutcome = k - confirmIdx; endIdx = k; break; }
      if (bar.high >= stop)   { outcome = 'stop';   barsToOutcome = k - confirmIdx; endIdx = k; break; }
    }
  }

  const forwardReturnPct = ((bars[endIdx].close - entry) / entry) * 100 * (direction === 'up' ? 1 : -1);
  return {
    direction, entry, target, stop, outcome, barsToOutcome,
    forwardReturnPct: round4(forwardReturnPct),
    mfePct: round4((mfe / entry) * 100),
    maePct: round4((mae / entry) * 100),
    endTime: bars[endIdx].time,
  };
}

function round4(x) { return Math.round(x * 10000) / 10000; }
function clamp01(x) { return Math.max(0, Math.min(1, x)); }

// ── Trend / market-structure classification ──────────────────────────────────
//
// Classifies structure the way price-action traders actually read it: walk
// the confirmed swing highs/lows chronologically and label each new pair as
// Higher-High/Higher-Low (uptrend), Lower-High/Lower-Low (downtrend), or
// mixed (range/CHoCH). Patterns should never be evaluated in a vacuum — this
// is what lets a detector (or a human) ask "does this bull flag actually
// agree with the prevailing trend?" instead of just "does the shape match?"
//
// Returns a sparse list of regime change-points; use regimeAt() to look up
// whichever regime was in force at any bar index in O(log n).
export function classifySwingStructure(bars, pivotN = 5) {
  const highs = pivotHighs(bars, pivotN);
  const lows = pivotLows(bars, pivotN);
  const events = [
    ...highs.map(p => ({ ...p, kind: 'high' })),
    ...lows.map(p => ({ ...p, kind: 'low' })),
  ].sort((a, b) => a.idx - b.idx);

  const series = [{ idx: 0, time: bars[0]?.time ?? 0, regime: 'range', dir: null, label: 'insufficient structure' }];
  let prevHigh = null, lastHigh = null, prevLow = null, lastLow = null;

  for (const ev of events) {
    if (ev.kind === 'high') { prevHigh = lastHigh; lastHigh = ev; }
    else { prevLow = lastLow; lastLow = ev; }
    if (!prevHigh || !prevLow) continue;

    const hh = lastHigh.price > prevHigh.price;
    const hl = lastLow.price  > prevLow.price;
    const lh = lastHigh.price < prevHigh.price;
    const ll = lastLow.price  < prevLow.price;

    let regime = 'range', dir = null, label = 'mixed structure (CHoCH)';
    if (hh && hl) { regime = 'trend_up'; dir = 'up'; label = 'HH + HL'; }
    else if (lh && ll) { regime = 'trend_down'; dir = 'down'; label = 'LH + LL'; }

    const last = series[series.length - 1];
    if (regime !== last.regime || dir !== last.dir) series.push({ idx: ev.idx, time: ev.time, regime, dir, label });
  }
  return series;
}

// Binary search: the regime in force at bar index `idx` (last change-point <= idx).
export function regimeAt(series, idx) {
  if (!series || !series.length) return null;
  let lo = 0, hi = series.length - 1, ans = series[0];
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].idx <= idx) { ans = series[mid]; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

// Nearest bar on `bars` at-or-before `time` (epoch seconds) — used to look up
// a higher timeframe's regime at the moment a lower-timeframe pattern confirmed.
function barIdxAtOrBefore(bars, time) {
  let lo = 0, hi = bars.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= time) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

// After a confirmed breakout, "acceptance" asks whether price actually stays
// beyond the breakout level rather than immediately snapping back in — a
// cheap, high-value filter for false breakouts, especially on noisy
// lower timeframes where a single-bar close-through is easy to fake.
function computeAcceptance(bars, confirmIdx, breakoutLevel, direction, opts = {}) {
  const acceptBars = opts.acceptanceBars ?? 3;
  const minHoldFrac = opts.acceptanceMinHoldFrac ?? 0.66;
  const lastIdx = Math.min(bars.length - 1, confirmIdx + acceptBars);
  let held = 0, checked = 0;
  for (let k = confirmIdx + 1; k <= lastIdx; k++) {
    checked++;
    const holds = direction === 'up' ? bars[k].close >= breakoutLevel : bars[k].close <= breakoutLevel;
    if (holds) held++;
  }
  const holdFrac = checked ? held / checked : 0;
  return { checked, held, holdFrac: round4(holdFrac), accepted: checked > 0 && holdFrac >= minHoldFrac };
}

// Generic 0-100 confidence score, composed from sub-scores every detector
// attaches at creation time (inst.rawScores — each already 0-1: impulseQuality,
// shapeQuality, retracementQuality) plus two shared, type-agnostic checks:
// volatility compression during the pattern's formation, and breakout
// strength. Acceptance (does the breakout hold) is folded in last. Trend
// alignment (own-timeframe and higher-timeframe) is deliberately kept OUT of
// this number and exposed as separate fields — "is this a well-formed shape"
// and "is the context favorable" are different questions a trader asks, and
// collapsing them into one opaque score hides which one is failing.
const CONFIDENCE_WEIGHTS = { impulseQuality: 20, shapeQuality: 20, retracementQuality: 15, volCompression: 15, breakoutStrength: 15, acceptance: 15 };

function computeConfidence(inst, bars, atr, atrSlow) {
  const raw = inst.rawScores || {};
  const slowAtStart = atrSlow[inst.startIdx] || atrSlow[0] || 0;
  const volRatio = slowAtStart > 0 ? (atr[inst.startIdx] || atr[0]) / slowAtStart : 1;
  // Contraction (ratio < 1) is what every reference pattern shows during
  // formation — score peaks at a healthy contraction (~0.6) and falls off
  // for no contraction at all or absurdly dead volatility.
  const volCompression = clamp01(1 - Math.abs(volRatio - 0.6) / 0.6);

  const localAtr = atr[inst.confirmIdx] || atr[atr.length - 1] || 1;
  const breakoutDistance = inst.breakoutLevel != null
    ? Math.abs(bars[inst.confirmIdx].close - inst.breakoutLevel) / localAtr
    : 0;
  const breakoutStrength = clamp01(breakoutDistance / 0.75); // a full ATR through the line = max score

  const acceptanceScore = inst.acceptance ? inst.acceptance.holdFrac : 0;

  const sub = {
    impulseQuality: clamp01(raw.impulseQuality ?? 0.5),
    shapeQuality: clamp01(raw.shapeQuality ?? 0.5),
    retracementQuality: clamp01(raw.retracementQuality ?? 0.5),
    volCompression, breakoutStrength, acceptance: acceptanceScore,
  };
  let score = 0;
  for (const [k, w] of Object.entries(CONFIDENCE_WEIGHTS)) score += sub[k] * w;
  return { total: Math.round(score), sub: Object.fromEntries(Object.entries(sub).map(([k, v]) => [k, round4(v)])) };
}

// ── Detector: flags & pennants ───────────────────────────────────────────────

const FLAG_OPTS = {
  poleMinBars: 4, poleMaxBars: 20, poleMinAtrMult: 3, poleMinEfficiency: 0.55,
  consolMinBars: 5, consolMaxBars: 50, consolPivotN: 2,
  maxRetracePct: 0.65, breakoutMaxBars: 30, parallelTolPct: 0.35,
  flagFlatSlopeAtrFrac: 0.05, touchTolPct: 0.003,
};

function findPole(bars, atr, start, opts) {
  let best = null;
  for (let w = opts.poleMinBars; w <= opts.poleMaxBars; w++) {
    const end = start + w;
    if (end >= bars.length) break;
    const netMove = bars[end].close - bars[start].open;
    let pathLen = 0;
    for (let i = start; i < end; i++) pathLen += Math.abs(bars[i + 1].close - bars[i].close);
    if (pathLen === 0) continue;
    const efficiency = Math.abs(netMove) / pathLen;
    const localAtr = atr[end] || atr[atr.length - 1];
    if (localAtr <= 0) continue;
    if (Math.abs(netMove) >= opts.poleMinAtrMult * localAtr && efficiency >= opts.poleMinEfficiency) {
      const score = Math.abs(netMove) / localAtr;
      if (!best || score > best.score) {
        best = { startIdx: start, endIdx: end, direction: netMove > 0 ? 'up' : 'down', height: Math.abs(netMove), score, efficiency };
      }
    }
  }
  return best;
}

// Fits upper/lower trendlines to a consolidation window and classifies it as
// a flag (roughly parallel channel) or pennant (converging wedge).
function findConsolidation(bars, atr, pole, opts) {
  const winStart = pole.endIdx;
  for (let winEnd = winStart + opts.consolMinBars; winEnd <= Math.min(winStart + opts.consolMaxBars, bars.length - 1); winEnd++) {
    const window = bars.slice(winStart, winEnd + 1);
    const highs = pivotHighs(window, opts.consolPivotN);
    const lows  = pivotLows(window, opts.consolPivotN);
    if (highs.length < 2 || lows.length < 2) continue;

    const h1 = highs[0], h2 = highs[highs.length - 1];
    const l1 = lows[0],  l2 = lows[lows.length - 1];
    if (h2.idx === h1.idx || l2.idx === l1.idx) continue;

    const upperSlope = (h2.price - h1.price) / (h2.idx - h1.idx);
    const lowerSlope = (l2.price - l1.price) / (l2.idx - l1.idx);
    const localAtr = atr[winEnd] || atr[atr.length - 1];
    if (!localAtr) continue;

    // Retracement guard — consolidation shouldn't give back most of the pole.
    const lowestInWin = Math.min(...window.map(b => b.low));
    const highestInWin = Math.max(...window.map(b => b.high));
    const retrace = pole.direction === 'up'
      ? (bars[winStart].close - lowestInWin) / pole.height
      : (highestInWin - bars[winStart].close) / pole.height;
    if (retrace > opts.maxRetracePct) continue;

    // A flag/pennant channel must drift flat-to-against the pole, not with
    // it — a channel still climbing in the pole's direction is just the
    // move continuing, not a distinguishable consolidation (and isn't what
    // any textbook flag/pennant diagram looks like).
    const flatThresh = (opts.flagFlatSlopeAtrFrac ?? 0.05) * localAtr;
    const avgSlope = (upperSlope + lowerSlope) / 2;
    const opposingOrFlat = pole.direction === 'up' ? avgSlope <= flatThresh : avgSlope >= -flatThresh;
    if (!opposingOrFlat) continue;

    const slopeDiff = Math.abs(upperSlope - lowerSlope);
    const converging = Math.sign(upperSlope) !== Math.sign(lowerSlope) && slopeDiff > flatThresh;
    const isParallel = !converging && slopeDiff <= (opts.parallelTolPct ?? 0.35) * localAtr;

    const shapeType = converging ? 'pennant' : (isParallel ? 'flag' : null);
    if (!shapeType) continue;

    const upperTouches = lineTouches(highs, h1.idx, h1.price, h2.idx, h2.price, opts.touchTolPct ?? 0.003);
    const lowerTouches = lineTouches(lows, l1.idx, l1.price, l2.idx, l2.price, opts.touchTolPct ?? 0.003);

    return {
      absEndIdx: winEnd,
      shapeType, upperTouches, lowerTouches, retrace,
      upper: { p1: { idx: winStart + h1.idx, price: h1.price }, p2: { idx: winStart + h2.idx, price: h2.price } },
      lower: { p1: { idx: winStart + l1.idx, price: l1.price }, p2: { idx: winStart + l2.idx, price: l2.price } },
    };
  }
  return null;
}

function findBreakout(bars, consol, direction, opts) {
  const boundary = direction === 'up' ? consol.upper : consol.lower;
  for (let i = consol.absEndIdx + 1; i <= Math.min(consol.absEndIdx + opts.breakoutMaxBars, bars.length - 1); i++) {
    const level = lineAt(
      { idx: boundary.p1.idx, price: boundary.p1.price },
      { idx: boundary.p2.idx, price: boundary.p2.price },
      i,
    );
    if (direction === 'up' && bars[i].close > level) return { idx: i, level };
    if (direction === 'down' && bars[i].close < level) return { idx: i, level };
  }
  return null;
}

export function detectFlagsPennants(bars, atr, opts = {}) {
  const o = { ...FLAG_OPTS, ...opts };
  const instances = [];
  let i = o.poleMinBars;
  const maxI = bars.length - o.poleMaxBars - o.consolMinBars - 1;
  while (i < maxI) {
    const pole = findPole(bars, atr, i, o);
    if (!pole) { i++; continue; }
    const consol = findConsolidation(bars, atr, pole, o);
    if (!consol) { i = pole.endIdx + 1; continue; }
    const breakout = findBreakout(bars, consol, pole.direction, o);
    if (!breakout) { i = consol.absEndIdx + 1; continue; }
    const confirmIdx = breakout.idx;

    const outcome = computeOutcome(bars, confirmIdx, pole.direction, pole.height, opts);
    const label = pole.direction === 'up'
      ? (consol.shapeType === 'pennant' ? 'bull_pennant' : 'bull_flag')
      : (consol.shapeType === 'pennant' ? 'bear_pennant' : 'bear_flag');

    // impulseQuality: how forceful/clean the pole was beyond the minimum bar.
    // shapeQuality: total touches on both trendlines beyond the 4 anchors.
    // retracementQuality: peaks near the middle of the healthy 20-50% band.
    const rawScores = {
      impulseQuality: clamp01(0.5 * (pole.score / (o.poleMinAtrMult * 3)) + 0.5 * pole.efficiency),
      shapeQuality: clamp01((consol.upperTouches + consol.lowerTouches - 4) / 6),
      retracementQuality: 1 - clamp01(Math.abs(consol.retrace - 0.35) / 0.35),
    };

    instances.push({
      type: label,
      startIdx: pole.startIdx, startTime: bars[pole.startIdx].time,
      confirmIdx, confirmTime: bars[confirmIdx].time,
      direction: pole.direction,
      measuredMove: round4(pole.height),
      breakoutLevel: breakout.level,
      rawScores,
      lines: [
        { role: 'pole', p1: { idx: pole.startIdx, time: bars[pole.startIdx].time, price: bars[pole.startIdx].open }, p2: { idx: pole.endIdx, time: bars[pole.endIdx].time, price: bars[pole.endIdx].close } },
        { role: 'upper', p1: { idx: consol.upper.p1.idx, time: bars[consol.upper.p1.idx].time, price: consol.upper.p1.price }, p2: { idx: consol.upper.p2.idx, time: bars[consol.upper.p2.idx].time, price: consol.upper.p2.price } },
        { role: 'lower', p1: { idx: consol.lower.p1.idx, time: bars[consol.lower.p1.idx].time, price: consol.lower.p1.price }, p2: { idx: consol.lower.p2.idx, time: bars[consol.lower.p2.idx].time, price: consol.lower.p2.price } },
      ],
      points: [],
      outcome,
    });
    i = confirmIdx + 1;
  }
  return instances;
}

// ── Detector: head & shoulders (regular + inverse) ───────────────────────────

const HS_OPTS = { pivotN: 5, headMinAtrMult: 1.5, shoulderTolAtrMult: 2.0, breakoutMaxBars: 40 };

function detectHeadShouldersOneSide(bars, atr, opts, inverse) {
  const o = { ...HS_OPTS, ...opts };
  const extremes = inverse ? pivotLows(bars, o.pivotN) : pivotHighs(bars, o.pivotN);
  const instances = [];
  let ci = 0;
  while (ci + 2 < extremes.length) {
    const L = extremes[ci], H = extremes[ci + 1], R = extremes[ci + 2];
    const localAtr = atr[H.idx] || atr[atr.length - 1];
    if (!localAtr) { ci++; continue; }

    const headTaller = inverse ? (H.price < L.price && H.price < R.price) : (H.price > L.price && H.price > R.price);
    const headMargin = inverse
      ? Math.min(L.price - H.price, R.price - H.price)
      : Math.min(H.price - L.price, H.price - R.price);
    const shouldersEven = Math.abs(L.price - R.price) <= o.shoulderTolAtrMult * localAtr;

    if (headTaller && headMargin >= o.headMinAtrMult * localAtr && shouldersEven) {
      // Neckline anchors: trough between L-H and trough between H-R (crest for inverse).
      const troughFinder = inverse ? pivotHighs : pivotLows;
      const seg1 = troughFinder(bars.slice(L.idx, H.idx + 1), Math.max(1, Math.floor(o.pivotN / 2)));
      const seg2 = troughFinder(bars.slice(H.idx, R.idx + 1), Math.max(1, Math.floor(o.pivotN / 2)));
      if (seg1.length && seg2.length) {
        const n1 = seg1.reduce((best, p) => (inverse ? p.price > best.price : p.price < best.price) ? p : best, seg1[0]);
        const n2 = seg2.reduce((best, p) => (inverse ? p.price > best.price : p.price < best.price) ? p : best, seg2[0]);
        const n1abs = { idx: L.idx + n1.idx, price: n1.price };
        const n2abs = { idx: H.idx + n2.idx, price: n2.price };

        let confirmIdx = null;
        for (let i = R.idx + 1; i <= Math.min(R.idx + o.breakoutMaxBars, bars.length - 1); i++) {
          const neckAt = lineAt(n1abs, n2abs, i);
          if (inverse && bars[i].close > neckAt) { confirmIdx = i; break; }
          if (!inverse && bars[i].close < neckAt) { confirmIdx = i; break; }
        }

        if (confirmIdx) {
          const measuredMove = Math.abs(H.price - lineAt(n1abs, n2abs, H.idx));
          const direction = inverse ? 'up' : 'down';
          const outcome = computeOutcome(bars, confirmIdx, direction, measuredMove, opts);
          const leftLen = H.idx - L.idx, rightLen = R.idx - H.idx;
          const rawScores = {
            impulseQuality: clamp01(headMargin / (o.headMinAtrMult * 3 * localAtr)),
            shapeQuality: 1 - clamp01(Math.abs(L.price - R.price) / (o.shoulderTolAtrMult * localAtr)),
            retracementQuality: 1 - clamp01(Math.abs(leftLen - rightLen) / Math.max(leftLen, rightLen)),
          };
          instances.push({
            type: inverse ? 'inverse_head_shoulders' : 'head_shoulders',
            startIdx: L.idx, startTime: bars[L.idx].time,
            confirmIdx, confirmTime: bars[confirmIdx].time,
            direction, measuredMove: round4(measuredMove),
            breakoutLevel: lineAt(n1abs, n2abs, confirmIdx),
            rawScores,
            lines: [
              { role: 'neckline', p1: { idx: n1abs.idx, time: bars[n1abs.idx].time, price: n1abs.price }, p2: { idx: n2abs.idx, time: bars[n2abs.idx].time, price: n2abs.price } },
            ],
            points: [
              { idx: L.idx, time: L.time, price: L.price, role: 'left_shoulder' },
              { idx: H.idx, time: H.time, price: H.price, role: 'head' },
              { idx: R.idx, time: R.time, price: R.price, role: 'right_shoulder' },
            ],
            outcome,
          });
          ci += 3;
          continue;
        }
      }
    }
    ci++;
  }
  return instances;
}

export function detectHeadShoulders(bars, atr, opts = {}) {
  return [
    ...detectHeadShouldersOneSide(bars, atr, opts, false),
    ...detectHeadShouldersOneSide(bars, atr, opts, true),
  ];
}

// ── Detector: double / triple top & bottom ───────────────────────────────────

const DT_OPTS = { pivotN: 5, extremeTolAtrMult: 1.2, minRetraceAtrMult: 2.5, minBarsBetweenTouches: 10, breakoutMaxBars: 40 };

function detectExtremesOneSide(bars, atr, opts, isTop) {
  const o = { ...DT_OPTS, ...opts };
  const extremes = isTop ? pivotHighs(bars, o.pivotN) : pivotLows(bars, o.pivotN);
  const instances = [];
  let i = 0;
  while (i < extremes.length - 1) {
    const localAtr = atr[extremes[i].idx] || atr[atr.length - 1];
    if (!localAtr) { i++; continue; }

    // Try to extend a run of 2 or 3 pivots at roughly the same level, each
    // separated by at least minBarsBetweenTouches so adjacent noise wiggles
    // on the same swing can't count as separate "touches".
    let run = [extremes[i]];
    for (let j = i + 1; j < extremes.length && run.length < 3; j++) {
      const ref = run[0].price;
      const last = run[run.length - 1];
      if (extremes[j].idx - last.idx < o.minBarsBetweenTouches) continue;
      if (Math.abs(extremes[j].price - ref) <= o.extremeTolAtrMult * localAtr) run.push(extremes[j]);
      else break;
    }
    if (run.length < 2) { i++; continue; }

    // Support/resistance = the intervening swing(s) between the touches.
    const oppFinder = isTop ? pivotLows : pivotHighs;
    const between = oppFinder(bars.slice(run[0].idx, run[run.length - 1].idx + 1), Math.max(1, Math.floor(o.pivotN / 2)));
    if (!between.length) { i++; continue; }
    const levelPt = between.reduce((best, p) => (isTop ? p.price < best.price : p.price > best.price) ? p : best, between[0]);
    const levelAbs = { idx: run[0].idx + levelPt.idx, price: levelPt.price };
    const retrace = Math.abs(run[0].price - levelAbs.price);
    if (retrace < o.minRetraceAtrMult * localAtr) { i++; continue; }

    const lastTouch = run[run.length - 1];
    let confirmIdx = null;
    for (let k = lastTouch.idx + 1; k <= Math.min(lastTouch.idx + o.breakoutMaxBars, bars.length - 1); k++) {
      if (isTop && bars[k].close < levelAbs.price) { confirmIdx = k; break; }
      if (!isTop && bars[k].close > levelAbs.price) { confirmIdx = k; break; }
    }
    if (confirmIdx) {
      const direction = isTop ? 'down' : 'up';
      const outcome = computeOutcome(bars, confirmIdx, direction, retrace, opts);
      const maxTouchDiff = Math.max(...run.map(p => Math.abs(p.price - run[0].price)));
      const gaps = run.slice(1).map((p, k) => p.idx - run[k].idx);
      const gapEvenness = gaps.length < 2 ? 1 : 1 - clamp01(Math.abs(gaps[0] - gaps[1]) / Math.max(gaps[0], gaps[1]));
      const rawScores = {
        impulseQuality: clamp01(retrace / (o.minRetraceAtrMult * 3 * localAtr)),
        shapeQuality: 1 - clamp01(maxTouchDiff / (o.extremeTolAtrMult * localAtr)),
        retracementQuality: gapEvenness,
      };
      instances.push({
        type: `${run.length === 2 ? 'double' : 'triple'}_${isTop ? 'top' : 'bottom'}`,
        startIdx: run[0].idx, startTime: run[0].time,
        confirmIdx, confirmTime: bars[confirmIdx].time,
        direction, measuredMove: round4(retrace),
        breakoutLevel: levelAbs.price,
        rawScores,
        lines: [
          { role: 'support', p1: { idx: levelAbs.idx, time: bars[levelAbs.idx].time, price: levelAbs.price }, p2: { idx: confirmIdx, time: bars[confirmIdx].time, price: levelAbs.price } },
        ],
        points: run.map((p, idx2) => ({ idx: p.idx, time: p.time, price: p.price, role: `touch_${idx2 + 1}` })),
        outcome,
      });
      i += run.length;
      continue;
    }
    i++;
  }
  return instances;
}

export function detectDoubleTripleExtremes(bars, atr, opts = {}) {
  return [
    ...detectExtremesOneSide(bars, atr, opts, true),
    ...detectExtremesOneSide(bars, atr, opts, false),
  ];
}

// ── Detector: triangles & multi-touch channels ───────────────────────────────

const TRI_OPTS = { pivotN: 5, windowBars: 120, minTouchesPerSide: 3, touchTolPct: 0.0025, flatSlopeAtrFrac: 0.02, breakoutMaxBars: 40 };

export function detectTrianglesChannels(bars, atr, opts = {}) {
  const o = { ...TRI_OPTS, ...opts };
  const instances = [];
  let winStart = 0;
  while (winStart + o.windowBars < bars.length) {
    const winEnd = winStart + o.windowBars;
    const window = bars.slice(winStart, winEnd + 1);
    const highs = pivotHighs(window, o.pivotN);
    const lows  = pivotLows(window, o.pivotN);
    const localAtr = atr[winEnd] || atr[atr.length - 1];

    if (highs.length >= 2 && lows.length >= 2 && localAtr) {
      const h1 = highs[0], h2 = highs[highs.length - 1];
      const l1 = lows[0],  l2 = lows[lows.length - 1];
      const upperTouches = h2.idx !== h1.idx ? lineTouches(highs, h1.idx, h1.price, h2.idx, h2.price, o.touchTolPct) : 0;
      const lowerTouches = l2.idx !== l1.idx ? lineTouches(lows,  l1.idx, l1.price, l2.idx, l2.price, o.touchTolPct) : 0;

      if (upperTouches >= o.minTouchesPerSide && lowerTouches >= o.minTouchesPerSide) {
        const upperSlope = (h2.price - h1.price) / (h2.idx - h1.idx);
        const lowerSlope = (l2.price - l1.price) / (l2.idx - l1.idx);
        const flatThresh = o.flatSlopeAtrFrac * localAtr;
        const upperFlat = Math.abs(upperSlope) < flatThresh;
        const lowerFlat = Math.abs(lowerSlope) < flatThresh;

        // Ascending/descending triangle = one flat side + one sloped side.
        // Symmetrical triangle = opposite-sign slopes converging to an apex.
        // Rising/falling wedge = SAME-sign slopes that still converge (the
        // steeper line is catching up to the other) — distinct from a
        // channel, where same-sign slopes stay roughly parallel.
        let shapeType = null;
        if (upperFlat && lowerSlope > flatThresh) shapeType = 'ascending_triangle';
        else if (lowerFlat && upperSlope < -flatThresh) shapeType = 'descending_triangle';
        else if (upperSlope < -flatThresh && lowerSlope > flatThresh) shapeType = 'symmetrical_triangle';
        else if (Math.sign(upperSlope) === Math.sign(lowerSlope) && Math.abs(upperSlope) > flatThresh && Math.abs(lowerSlope) > flatThresh) {
          if (upperSlope < lowerSlope - flatThresh) shapeType = upperSlope > 0 ? 'rising_wedge' : 'falling_wedge';
          else if (Math.abs(upperSlope - lowerSlope) < flatThresh) shapeType = upperSlope > 0 ? 'channel_up' : 'channel_down';
        }

        if (shapeType) {
          const upperAbs1 = { idx: winStart + h1.idx, price: h1.price };
          const upperAbs2 = { idx: winStart + h2.idx, price: h2.price };
          const lowerAbs1 = { idx: winStart + l1.idx, price: l1.price };
          const lowerAbs2 = { idx: winStart + l2.idx, price: l2.price };
          const heightAtStart = lineAt(upperAbs1, upperAbs2, upperAbs1.idx) - lineAt(lowerAbs1, lowerAbs2, lowerAbs1.idx);
          // Anchor the reported start to the earliest pivot actually used in
          // the fitted lines, not the arbitrary scan window — otherwise every
          // instance reports the same ~windowBars duration regardless of how
          // large the real shape is.
          const patternStartIdx = winStart + Math.min(h1.idx, l1.idx);

          let confirmIdx = null, direction = null, breakoutLevel = null;
          const scanFrom = winEnd + 1;
          for (let i = scanFrom; i <= Math.min(scanFrom + o.breakoutMaxBars, bars.length - 1); i++) {
            const up = lineAt(upperAbs1, upperAbs2, i);
            const dn = lineAt(lowerAbs1, lowerAbs2, i);
            if (bars[i].close > up) { confirmIdx = i; direction = 'up'; breakoutLevel = up; break; }
            if (bars[i].close < dn) { confirmIdx = i; direction = 'down'; breakoutLevel = dn; break; }
          }

          if (confirmIdx) {
            const outcome = computeOutcome(bars, confirmIdx, direction, Math.abs(heightAtStart), opts);
            // Triangles/wedges are expected to converge — score how much the
            // gap actually narrowed by breakout. Channels are expected to
            // stay parallel — score how close the two slopes are instead.
            const heightAtConfirm = lineAt(upperAbs1, upperAbs2, confirmIdx) - lineAt(lowerAbs1, lowerAbs2, confirmIdx);
            const isConverging = shapeType.includes('triangle') || shapeType.includes('wedge');
            const rawScores = {
              impulseQuality: clamp01((upperTouches + lowerTouches - o.minTouchesPerSide * 2) / (o.minTouchesPerSide * 2)),
              shapeQuality: 1 - clamp01(Math.abs(upperTouches - lowerTouches) / (upperTouches + lowerTouches)),
              retracementQuality: isConverging
                ? clamp01(1 - Math.abs(heightAtConfirm) / Math.max(Math.abs(heightAtStart), 1e-9))
                : 1 - clamp01(Math.abs(upperSlope - lowerSlope) / flatThresh),
            };
            instances.push({
              type: shapeType,
              startIdx: patternStartIdx, startTime: bars[patternStartIdx].time,
              confirmIdx, confirmTime: bars[confirmIdx].time,
              direction, measuredMove: round4(Math.abs(heightAtStart)),
              breakoutLevel, rawScores,
              lines: [
                { role: 'upper', p1: { idx: upperAbs1.idx, time: bars[upperAbs1.idx].time, price: upperAbs1.price }, p2: { idx: upperAbs2.idx, time: bars[upperAbs2.idx].time, price: upperAbs2.price } },
                { role: 'lower', p1: { idx: lowerAbs1.idx, time: bars[lowerAbs1.idx].time, price: lowerAbs1.price }, p2: { idx: lowerAbs2.idx, time: bars[lowerAbs2.idx].time, price: lowerAbs2.price } },
              ],
              points: [],
              outcome,
            });
            winStart = confirmIdx + 1;
            continue;
          }
        }
      }
    }
    winStart += Math.floor(o.windowBars / 2);
  }
  return instances;
}

// ── Orchestration & stats ────────────────────────────────────────────────────

export function runPatternScan(bars, opts = {}) {
  const atr = computeATR(bars, opts.atrPeriod ?? 14);
  const atrSlow = computeATR(bars, opts.atrSlowPeriod ?? 50);
  const structure = classifySwingStructure(bars, opts.structurePivotN ?? 5);

  const instances = [
    ...detectFlagsPennants(bars, atr, opts),
    ...detectHeadShoulders(bars, atr, opts),
    ...detectDoubleTripleExtremes(bars, atr, opts),
    ...detectTrianglesChannels(bars, atr, opts),
  ].sort((a, b) => a.confirmIdx - b.confirmIdx);

  for (const inst of instances) {
    inst.acceptance = computeAcceptance(bars, inst.confirmIdx, inst.breakoutLevel, inst.direction, opts);
    const regime = regimeAt(structure, inst.startIdx);
    inst.trendRegime = regime ? regime.regime : null;
    inst.trendAligned = regime && regime.dir ? regime.dir === inst.direction : null;
    inst.confidence = computeConfidence(inst, bars, atr, atrSlow);
  }

  const stats = aggregateStats(instances);
  return { instances, stats, structure };
}

// Cross-timeframe confluence: for each instance detected on `bars` (its own
// timeframe), look up the regime in force on a HIGHER timeframe at the same
// moment (via its own classifySwingStructure() series) and tag whether the
// two agree. Call once per (own timeframe, higher timeframe) pair — e.g. the
// CLI/server run this for 5m against 15m, 15m against 1h, and so on, so a
// 15m bull-flag candidate can be scored against "is the 1h even trending up".
export function annotateHtfAlignment(instances, htfBars, htfStructure, htfLabel) {
  for (const inst of instances) {
    const htfIdx = barIdxAtOrBefore(htfBars, inst.confirmTime);
    const regime = regimeAt(htfStructure, htfIdx);
    inst.htf = {
      timeframe: htfLabel,
      regime: regime ? regime.regime : null,
      aligned: regime && regime.dir ? regime.dir === inst.direction : null,
    };
  }
  return instances;
}

export function aggregateStats(instances) {
  const byType = {};
  for (const inst of instances) {
    if (!byType[inst.type]) byType[inst.type] = { type: inst.type, count: 0, targets: 0, stops: 0, timeouts: 0, sumReturn: 0, sumDurationBars: 0, sumBarsToOutcome: 0, outcomesWithBars: 0, sumConfidence: 0 };
    const s = byType[inst.type];
    s.count++;
    s.sumReturn += inst.outcome.forwardReturnPct;
    s.sumDurationBars += (inst.confirmIdx - inst.startIdx);
    s.sumConfidence += inst.confidence?.total ?? 0;
    if (inst.outcome.outcome === 'target') s.targets++;
    else if (inst.outcome.outcome === 'stop') s.stops++;
    else s.timeouts++;
    if (inst.outcome.barsToOutcome != null) { s.sumBarsToOutcome += inst.outcome.barsToOutcome; s.outcomesWithBars++; }
  }
  return Object.values(byType).map(s => ({
    type: s.type,
    count: s.count,
    hitRatePct: s.count ? round4((s.targets / s.count) * 100) : 0,
    stopRatePct: s.count ? round4((s.stops / s.count) * 100) : 0,
    timeoutRatePct: s.count ? round4((s.timeouts / s.count) * 100) : 0,
    avgForwardReturnPct: s.count ? round4(s.sumReturn / s.count) : 0,
    avgDurationBars: s.count ? round4(s.sumDurationBars / s.count) : 0,
    avgBarsToOutcome: s.outcomesWithBars ? round4(s.sumBarsToOutcome / s.outcomesWithBars) : null,
    avgConfidence: s.count ? round4(s.sumConfidence / s.count) : 0,
  })).sort((a, b) => b.count - a.count);
}

// Buckets every instance (across all pattern types) by confidence score and
// reports hit rate / avg return per bucket. This is the check that actually
// proves the scoring weights are doing something — if a 80+ bucket doesn't
// outperform a <50 bucket, the weights need rethinking, not the detectors.
const CONFIDENCE_BUCKETS = [[0, 50], [50, 65], [65, 80], [80, 101]];
export function confidenceBucketStats(instances) {
  return CONFIDENCE_BUCKETS.map(([lo, hi]) => {
    const inBucket = instances.filter(i => (i.confidence?.total ?? 0) >= lo && (i.confidence?.total ?? 0) < hi);
    const targets = inBucket.filter(i => i.outcome.outcome === 'target').length;
    const sumReturn = inBucket.reduce((a, i) => a + i.outcome.forwardReturnPct, 0);
    return {
      range: `${lo}-${hi - 1}`,
      count: inBucket.length,
      hitRatePct: inBucket.length ? round4((targets / inBucket.length) * 100) : 0,
      avgForwardReturnPct: inBucket.length ? round4(sumReturn / inBucket.length) : 0,
    };
  });
}
