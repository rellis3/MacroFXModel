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

// ── Detector: flags & pennants ───────────────────────────────────────────────

const FLAG_OPTS = {
  poleMinBars: 4, poleMaxBars: 20, poleMinAtrMult: 3, poleMinEfficiency: 0.55,
  consolMinBars: 5, consolMaxBars: 50, consolPivotN: 2,
  maxRetracePct: 0.65, breakoutMaxBars: 30, parallelTolPct: 0.35,
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
        best = { startIdx: start, endIdx: end, direction: netMove > 0 ? 'up' : 'down', height: Math.abs(netMove), score };
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
    const localAtr = atr[winStart + winEnd] || atr[atr.length - 1];
    if (!localAtr) continue;

    // Retracement guard — consolidation shouldn't give back most of the pole.
    const lowestInWin = Math.min(...window.map(b => b.low));
    const highestInWin = Math.max(...window.map(b => b.high));
    const retrace = pole.direction === 'up'
      ? (bars[winStart].close - lowestInWin) / pole.height
      : (highestInWin - bars[winStart].close) / pole.height;
    if (retrace > opts.maxRetracePct) continue;

    const slopeDiff = Math.abs(upperSlope - lowerSlope);
    const converging = (upperSlope < -0.05 * localAtr / opts.consolPivotN && lowerSlope > 0.05 * localAtr / opts.consolPivotN)
      || Math.sign(upperSlope) !== Math.sign(lowerSlope);
    const isParallel = slopeDiff < opts.parallelTolPct * localAtr / 10;

    const shapeType = converging ? 'pennant' : (isParallel ? 'flag' : null);
    if (!shapeType) continue;

    return {
      absEndIdx: winStart + winEnd,
      shapeType,
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
    if (direction === 'up' && bars[i].close > level) return i;
    if (direction === 'down' && bars[i].close < level) return i;
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
    const confirmIdx = findBreakout(bars, consol, pole.direction, o);
    if (!confirmIdx) { i = consol.absEndIdx + 1; continue; }

    const outcome = computeOutcome(bars, confirmIdx, pole.direction, pole.height, opts);
    const label = pole.direction === 'up'
      ? (consol.shapeType === 'pennant' ? 'bull_pennant' : 'bull_flag')
      : (consol.shapeType === 'pennant' ? 'bear_pennant' : 'bear_flag');

    instances.push({
      type: label,
      startIdx: pole.startIdx, startTime: bars[pole.startIdx].time,
      confirmIdx, confirmTime: bars[confirmIdx].time,
      direction: pole.direction,
      measuredMove: round4(pole.height),
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

const HS_OPTS = { pivotN: 3, headMinAtrMult: 1.0, shoulderTolAtrMult: 2.5, breakoutMaxBars: 40 };

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
          instances.push({
            type: inverse ? 'inverse_head_shoulders' : 'head_shoulders',
            startIdx: L.idx, startTime: bars[L.idx].time,
            confirmIdx, confirmTime: bars[confirmIdx].time,
            direction, measuredMove: round4(measuredMove),
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

const DT_OPTS = { pivotN: 3, extremeTolAtrMult: 1.5, minRetraceAtrMult: 1.5, breakoutMaxBars: 40, maxSpanExtra: 1 };

function detectExtremesOneSide(bars, atr, opts, isTop) {
  const o = { ...DT_OPTS, ...opts };
  const extremes = isTop ? pivotHighs(bars, o.pivotN) : pivotLows(bars, o.pivotN);
  const instances = [];
  let i = 0;
  while (i < extremes.length - 1) {
    const localAtr = atr[extremes[i].idx] || atr[atr.length - 1];
    if (!localAtr) { i++; continue; }

    // Try to extend a run of 2 or 3 pivots at roughly the same level.
    let run = [extremes[i]];
    for (let j = i + 1; j < extremes.length && run.length < 3; j++) {
      const ref = run[0].price;
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
      instances.push({
        type: `${run.length === 2 ? 'double' : 'triple'}_${isTop ? 'top' : 'bottom'}`,
        startIdx: run[0].idx, startTime: run[0].time,
        confirmIdx, confirmTime: bars[confirmIdx].time,
        direction, measuredMove: round4(retrace),
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

const TRI_OPTS = { pivotN: 3, windowBars: 120, minTouchesPerSide: 3, touchTolPct: 0.0025, flatSlopeAtrFrac: 0.02, breakoutMaxBars: 40 };

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

        let shapeType = null;
        if (upperFlat && lowerSlope > flatThresh) shapeType = 'ascending_triangle';
        else if (lowerFlat && upperSlope < -flatThresh) shapeType = 'descending_triangle';
        else if (upperSlope < -flatThresh && lowerSlope > flatThresh) shapeType = 'symmetrical_triangle';
        else if (Math.sign(upperSlope) === Math.sign(lowerSlope) && Math.abs(upperSlope - lowerSlope) < flatThresh) {
          shapeType = upperSlope > flatThresh ? 'channel_up' : (upperSlope < -flatThresh ? 'channel_down' : null);
        }

        if (shapeType) {
          const upperAbs1 = { idx: winStart + h1.idx, price: h1.price };
          const upperAbs2 = { idx: winStart + h2.idx, price: h2.price };
          const lowerAbs1 = { idx: winStart + l1.idx, price: l1.price };
          const lowerAbs2 = { idx: winStart + l2.idx, price: l2.price };
          const heightAtStart = lineAt(upperAbs1, upperAbs2, upperAbs1.idx) - lineAt(lowerAbs1, lowerAbs2, lowerAbs1.idx);

          let confirmIdx = null, direction = null;
          const scanFrom = winEnd + 1;
          for (let i = scanFrom; i <= Math.min(scanFrom + o.breakoutMaxBars, bars.length - 1); i++) {
            const up = lineAt(upperAbs1, upperAbs2, i);
            const dn = lineAt(lowerAbs1, lowerAbs2, i);
            if (bars[i].close > up) { confirmIdx = i; direction = 'up'; break; }
            if (bars[i].close < dn) { confirmIdx = i; direction = 'down'; break; }
          }

          if (confirmIdx) {
            const outcome = computeOutcome(bars, confirmIdx, direction, Math.abs(heightAtStart), opts);
            instances.push({
              type: shapeType,
              startIdx: winStart, startTime: bars[winStart].time,
              confirmIdx, confirmTime: bars[confirmIdx].time,
              direction, measuredMove: round4(Math.abs(heightAtStart)),
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
  const instances = [
    ...detectFlagsPennants(bars, atr, opts),
    ...detectHeadShoulders(bars, atr, opts),
    ...detectDoubleTripleExtremes(bars, atr, opts),
    ...detectTrianglesChannels(bars, atr, opts),
  ].sort((a, b) => a.confirmIdx - b.confirmIdx);

  const stats = aggregateStats(instances);
  return { instances, stats };
}

export function aggregateStats(instances) {
  const byType = {};
  for (const inst of instances) {
    if (!byType[inst.type]) byType[inst.type] = { type: inst.type, count: 0, targets: 0, stops: 0, timeouts: 0, sumReturn: 0, sumDurationBars: 0, sumBarsToOutcome: 0, outcomesWithBars: 0 };
    const s = byType[inst.type];
    s.count++;
    s.sumReturn += inst.outcome.forwardReturnPct;
    s.sumDurationBars += (inst.confirmIdx - inst.startIdx);
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
  })).sort((a, b) => b.count - a.count);
}
