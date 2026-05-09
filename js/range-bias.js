import { S } from './state.js';
import { getPipSize, getDigits, calcRSI, ema, sma, barLondonHour } from './utils.js';
import { getCOTForPair } from './cot.js';

// ── Config ────────────────────────────────────────────────────────────────────

const FEATURE_DEFS = {
  rangePosition: {
    label: 'Range Position',
    desc:  'Long at bottom 20%, short at top 20% of the Asia/Monday range',
    weight: 1,
  },
  chochBos: {
    label: 'CHoCH / BOS',
    desc:  'Change of character or break of structure detected on 30m swing pivots',
    weight: 2,
  },
  cotBias: {
    label: 'COT Positioning',
    desc:  'Fade overcrowded speculative positioning or align with smart money at range boundary',
    weight: 1,
  },
  wickRejection: {
    label: 'Wick Rejection',
    desc:  'Three or more wick rejections at the range edge on recent 5m bars',
    weight: 1,
  },
  rsiDivergence: {
    label: 'Wave Trend + MF Divergence',
    desc:  'VuManChu Cipher B: WTO + Money Flow + RSI-14 at range extreme — signal when 2/3 agree',
    weight: 1,
  },
  orderBlock: {
    label: 'Order Block',
    desc:  'Last opposing candle before an impulse move, coinciding with the range boundary',
    weight: 1,
  },
  htfEma: {
    label: 'H1 EMA Alignment',
    desc:  'Price above/below H1 EMA21 & EMA50 confirms or conflicts with entry direction',
    weight: 1,
  },
  vwapSlope: {
    label: 'Session TWAP Slope',
    desc:  'Price vs session TWAP (anchored London 08:00) — declining TWAP at resistance or rising at support confirms the fade',
    weight: 1,
  },
};

export function loadRangeBiasCfg() {
  const defaults = Object.fromEntries(
    Object.entries(FEATURE_DEFS).map(([k, v]) => [k, { enabled: true, weight: v.weight, label: v.label, desc: v.desc }])
  );
  try {
    const raw = localStorage.getItem('range_bias_cfg');
    if (raw) {
      const saved = JSON.parse(raw);
      return Object.fromEntries(
        Object.entries(defaults).map(([k, def]) => [k, { ...def, ...(saved[k] ?? {}) }])
      );
    }
  } catch(e) {}
  return defaults;
}

export function saveRangeBiasCfg(cfg) {
  const slim = Object.fromEntries(
    Object.entries(cfg).map(([k, v]) => [k, { enabled: v.enabled, weight: v.weight }])
  );
  try { localStorage.setItem('range_bias_cfg', JSON.stringify(slim)); } catch(e) {}
}

export function getFeatureDefs() { return FEATURE_DEFS; }

// ── Bar field accessors (Oanda mid or OHLC) ───────────────────────────────────

function bO(b) { return parseFloat(b.open  ?? b.mid?.o ?? b.o); }
function bC(b) { return parseFloat(b.close ?? b.mid?.c ?? b.c); }
function bH(b) { return parseFloat(b.high  ?? b.mid?.h ?? b.h); }
function bL(b) { return parseFloat(b.low   ?? b.mid?.l ?? b.l); }

// Oanda bars arrive newest-first; reverse for indicator math
function toOldestFirst(bars) { return [...bars].reverse(); }

// ── Feature 1: Range Position ─────────────────────────────────────────────────
// Signals long when price is in the bottom 20% of the range, short at top 20%.

function featureRangePosition(price, asia, monday, atr) {
  const sources = [];
  if (asia?.today?.range   > 0) sources.push({ src: 'Asia',   ...asia.today });
  if (monday?.current?.range > 0) sources.push({ src: 'Monday', ...monday.current });
  if (!sources.length) return { signal: null, val: 'No range data' };

  let best = null, bestDist = Infinity;
  for (const r of sources) {
    const dist = Math.min(Math.abs(price - r.low), Math.abs(price - r.high));
    if (dist < bestDist) { bestDist = dist; best = r; }
  }

  if (bestDist > atr * 0.22) return { signal: null, val: 'Not at range boundary' };

  const pos = (price - best.low) / best.range;
  const pct = (pos * 100).toFixed(0);
  if (pos <= 0.20) return { signal: 'long',  val: `${best.src} bottom ${pct}% — long zone` };
  if (pos >= 0.80) return { signal: 'short', val: `${best.src} top ${pct}% — short zone` };
  return { signal: null, val: `${best.src} mid ${pct}% — no edge` };
}

// ── Feature 2: CHoCH / BOS ────────────────────────────────────────────────────
// Detects 30m swing structure: HH+HL=bullish BOS, LH+LL=bearish BOS,
// LH+HL=bullish CHoCH reversal, HH+LL=bearish CHoCH.

function featureChochBos(symbol) {
  const bars = S.ohlc30m?.[symbol]?.values;
  if (!bars || bars.length < 25) return { signal: null, val: 'Need 25+ 30m bars' };

  const sorted = toOldestFirst(bars).slice(-80);
  const N = 4;
  const SH = [], SL = [];

  for (let i = N; i < sorted.length - N; i++) {
    const h = bH(sorted[i]), l = bL(sorted[i]);
    let isH = true, isL = true;
    for (let j = i - N; j <= i + N; j++) {
      if (j === i) continue;
      if (bH(sorted[j]) >= h) isH = false;
      if (bL(sorted[j]) <= l) isL = false;
    }
    if (isH) SH.push({ price: h, i });
    if (isL) SL.push({ price: l, i });
  }

  if (SH.length < 2 || SL.length < 2) return { signal: null, val: 'Not enough pivots' };

  const [sh0, sh1] = SH.slice(-2);
  const [sl0, sl1] = SL.slice(-2);
  const hiUp = sh1.price > sh0.price, hiDn = sh1.price < sh0.price;
  const loUp = sl1.price > sl0.price, loDn = sl1.price < sl0.price;

  if (hiUp && loUp) return { signal: 'long',  type: 'BOS',   val: `Bullish BOS — HH + HL` };
  if (hiDn && loDn) return { signal: 'short', type: 'BOS',   val: `Bearish BOS — LH + LL` };
  if (hiDn && loUp) return { signal: 'long',  type: 'CHoCH', val: `Bullish CHoCH — LH + HL` };
  if (hiUp && loDn) return { signal: 'short', type: 'CHoCH', val: `Bearish CHoCH — HH + LL` };

  return { signal: null, val: 'Mixed structure' };
}

// ── Feature 3: COT Positioning at Range ───────────────────────────────────────
// Crowded short specs at support → contrarian squeeze → long.
// Crowded long specs at resistance → unwind risk → short.

function featureCotBias(symbol, entryDir) {
  const d = getCOTForPair(symbol);
  if (!d) return { signal: null, val: 'COT not loaded' };

  const levPct = d.levPct ?? 0;
  const amNet  = d.amNet  ?? 0;
  const sign   = levPct >= 0 ? '+' : '';

  if (entryDir === 'long') {
    if (levPct < -15) return { signal: 'long',  val: `Specs ${sign}${levPct.toFixed(0)}% net short — crowded, squeeze risk` };
    if (levPct >  15) return { signal: 'long',  val: `Specs ${sign}${levPct.toFixed(0)}% net long — confirms long` };
    if (amNet > 0 && levPct < 0) return { signal: 'long', val: `Smart money long vs specs short — divergence` };
    return { signal: null, val: `Specs ${sign}${levPct.toFixed(0)}% — neutral` };
  } else {
    if (levPct >  15) return { signal: 'short', val: `Specs ${sign}${levPct.toFixed(0)}% net long — crowded, unwind risk` };
    if (levPct < -15) return { signal: 'short', val: `Specs ${sign}${levPct.toFixed(0)}% net short — confirms short` };
    if (amNet < 0 && levPct > 0) return { signal: 'short', val: `Smart money short vs specs long — divergence` };
    return { signal: null, val: `Specs ${sign}${levPct.toFixed(0)}% — neutral` };
  }
}

// ── Feature 4: Wick Rejection ─────────────────────────────────────────────────
// Count 5m bars with significant wicks (≥40% of range) that probed the boundary
// and closed away from it. 2+ = signal, 3+ = strong.

function featureWickRejection(symbol, price, asia, monday, atr) {
  const bars = S.ohlc5m?.[symbol]?.values;
  if (!bars || bars.length < 10) return { signal: null, val: 'Need 10+ 5m bars' };

  const pip = getPipSize(symbol);
  const zone = Math.max(atr * 0.12, pip * 3);

  // Find nearest range boundary
  const boundaries = [
    { lvl: asia?.today?.high,     side: 'resistance', src: 'Asia H' },
    { lvl: asia?.today?.low,      side: 'support',    src: 'Asia L' },
    { lvl: monday?.current?.high, side: 'resistance', src: 'Mon H' },
    { lvl: monday?.current?.low,  side: 'support',    src: 'Mon L' },
  ].filter(s => s.lvl != null && Math.abs(price - s.lvl) <= atr * 0.22);

  if (!boundaries.length) return { signal: null, val: 'Not near range boundary' };
  const { lvl, side, src } = boundaries[0];

  // Check last 20 closed 5m bars (skip bars[0] = forming)
  const recent = bars.slice(1, 21);
  let wickCount = 0;
  for (const b of recent) {
    const h = bH(b), l = bL(b), o = bO(b), c = bC(b);
    if (isNaN(h) || isNaN(l) || h - l < pip) continue;
    const range = h - l;
    const nearBoundary = Math.abs(h - lvl) <= zone || Math.abs(l - lvl) <= zone;
    if (!nearBoundary) continue;
    if (side === 'resistance' && (h - Math.max(o, c)) / range >= 0.40) wickCount++;
    if (side === 'support'    && (Math.min(o, c) - l) / range >= 0.40) wickCount++;
  }

  const signal = wickCount >= 2 ? (side === 'support' ? 'long' : 'short') : null;
  const strength = wickCount >= 3 ? 'strong' : wickCount >= 2 ? 'moderate' : 'weak';
  return { signal, wickCount, val: `${wickCount} wick${wickCount !== 1 ? 's' : ''} at ${src} — ${strength}` };
}

// ── VuManChu helpers ──────────────────────────────────────────────────────────

// Wave Trend Oscillator — standard Cipher B params (n1=10, n2=21).
// Returns { wt1, wt2 } as oldest-first arrays aligned to input bars.
function computeWaveTrend(bars, n1 = 10, n2 = 21) {
  const hlc3 = bars.map(b => (bH(b) + bL(b) + bC(b)) / 3);
  const esa   = ema(hlc3, n1);
  const d     = ema(hlc3.map((v, i) => Math.abs(v - esa[i])), n1);
  const ci    = hlc3.map((v, i) => d[i] > 0 ? (v - esa[i]) / (0.015 * d[i]) : 0);
  const wt1   = ema(ci, n2);
  const wt2   = sma(wt1, 4);
  return { wt1, wt2 };
}

// Money Flow — volume-approximated using direction × (high−low) as tick-volume proxy.
// Returns values centred at 0 (range ≈ −1 to +1).
function computeMoneyFlow(bars, period = 14) {
  const mfRaw = bars.map(b => {
    const dir   = bC(b) >= bO(b) ? 1 : -1;
    const range = Math.max(0, bH(b) - bL(b));
    return dir * range;
  });
  const mfRsi = calcRSI(mfRaw, period);
  return mfRsi.map(v => (v - 50) / 50);
}

// N-bar swing pivot detection on an arbitrary values array (oldest-first).
// Returns { highs, lows } each as [{ val, i }, ...] sorted by index.
function findSwingPivots(values, N = 5) {
  const highs = [], lows = [];
  for (let i = N; i < values.length - N; i++) {
    let isH = true, isL = true;
    for (let j = i - N; j <= i + N; j++) {
      if (j === i) continue;
      if (values[j] >= values[i]) isH = false;
      if (values[j] <= values[i]) isL = false;
    }
    if (isH) highs.push({ val: values[i], i });
    if (isL) lows.push({ val: values[i], i });
  }
  return { highs, lows };
}

// Find the pivot in `pivots` whose index is nearest to `targetIdx`, within `maxDist`.
function nearestPivot(pivots, targetIdx, maxDist) {
  let best = null, bestDist = Infinity;
  for (const p of pivots) {
    const dist = Math.abs(p.i - targetIdx);
    if (dist <= maxDist && dist < bestDist) { bestDist = dist; best = p; }
  }
  return best;
}

// Divergence check for one oscillator against price.
// side: 'high' → look for bearish div (price HH, osc LH) → 'short'
//       'low'  → look for bullish div (price LL, osc HL) → 'long'
function oscDivergence(closes, oscValues, side, N = 5) {
  const pricePivots = findSwingPivots(closes, N);
  const oscPivots   = findSwingPivots(oscValues, N);
  const maxDist     = N * 3;

  if (side === 'high') {
    const pH = pricePivots.highs.slice(-2);
    if (pH.length < 2 || pH[1].val <= pH[0].val) return null; // no price HH
    const oh1 = nearestPivot(oscPivots.highs, pH[0].i, maxDist);
    const oh2 = nearestPivot(oscPivots.highs, pH[1].i, maxDist);
    if (oh1 && oh2 && oh2.val < oh1.val) return 'short'; // osc LH = bearish div
  } else {
    const pL = pricePivots.lows.slice(-2);
    if (pL.length < 2 || pL[1].val >= pL[0].val) return null; // no price LL
    const ol1 = nearestPivot(oscPivots.lows, pL[0].i, maxDist);
    const ol2 = nearestPivot(oscPivots.lows, pL[1].i, maxDist);
    if (ol1 && ol2 && ol2.val > ol1.val) return 'long'; // osc HL = bullish div
  }
  return null;
}

// ── Feature 5: VuManChu Cipher B Divergence ───────────────────────────────────
// Runs Wave Trend (WTO), Money Flow (MF), and RSI-14 divergence checks.
// Signals when 2 of 3 oscillators agree on the same divergence direction.

function featureRsiDivergence(symbol, price, asia, monday, atr) {
  const bars = S.ohlc5m?.[symbol]?.values;
  if (!bars || bars.length < 60) return { signal: null, val: 'Need 60+ 5m bars' };

  // Determine which range boundary price is near
  let side = null;
  for (const s of [
    { lvl: asia?.today?.high,     side: 'high' },
    { lvl: asia?.today?.low,      side: 'low'  },
    { lvl: monday?.current?.high, side: 'high' },
    { lvl: monday?.current?.low,  side: 'low'  },
  ]) {
    if (s.lvl != null && Math.abs(price - s.lvl) <= atr * 0.22) { side = s.side; break; }
  }
  if (!side) return { signal: null, val: 'Not near range extreme' };

  // Use last 100 closed bars oldest-first for warm-up stability
  const closed = toOldestFirst(bars.slice(1, 101));
  if (closed.length < 50) return { signal: null, val: 'Insufficient bars' };

  const closes = closed.map(b => bC(b));

  // Compute all three oscillators
  const { wt1 }  = computeWaveTrend(closed);
  const mf       = computeMoneyFlow(closed);
  const rsi      = calcRSI(closes, 14).map(v => (v - 50) / 50); // centre at 0

  // Check divergence on each oscillator independently
  const wt1Sig = oscDivergence(closes, wt1, side);
  const mfSig  = oscDivergence(closes, mf,  side);
  const rsiSig = oscDivergence(closes, rsi, side);

  const components = [
    wt1Sig && { name: 'WTO', sig: wt1Sig },
    mfSig  && { name: 'MF',  sig: mfSig  },
    rsiSig && { name: 'RSI', sig: rsiSig },
  ].filter(Boolean);

  const longVotes  = components.filter(c => c.sig === 'long').length;
  const shortVotes = components.filter(c => c.sig === 'short').length;

  if (longVotes >= 2) {
    const names = components.filter(c => c.sig === 'long').map(c => c.name).join(' + ');
    return { signal: 'long',  val: `Bullish div 2/3: ${names} at support` };
  }
  if (shortVotes >= 2) {
    const names = components.filter(c => c.sig === 'short').map(c => c.name).join(' + ');
    return { signal: 'short', val: `Bearish div 2/3: ${names} at resistance` };
  }

  const fired = components.map(c => `${c.name}(${c.sig ?? '—'})`).join(' ');
  return { signal: null, val: fired ? `1/3 only — ${fired}` : 'No divergence' };
}

// ── Feature 6: Order Block ────────────────────────────────────────────────────
// Bullish OB: last bearish candle before 2+ bullish candles, near range boundary.
// Bearish OB: last bullish candle before 2+ bearish candles, near range boundary.

function featureOrderBlock(symbol, price, asia, monday, atr) {
  const bars = S.ohlc5m?.[symbol]?.values;
  if (!bars || bars.length < 15) return { signal: null, val: 'Need 15+ 5m bars' };

  const boundaries = [
    { lvl: asia?.today?.high,     obSig: 'short', src: 'Asia H' },
    { lvl: asia?.today?.low,      obSig: 'long',  src: 'Asia L' },
    { lvl: monday?.current?.high, obSig: 'short', src: 'Mon H' },
    { lvl: monday?.current?.low,  obSig: 'long',  src: 'Mon L' },
  ].filter(s => s.lvl != null && Math.abs(price - s.lvl) <= atr * 0.22);

  if (!boundaries.length) return { signal: null, val: 'Not near range boundary' };
  const { lvl, obSig } = boundaries[0];

  const ordered = toOldestFirst(bars.slice(1, 32));
  const zoneRadius = atr * 0.25;
  const pip = getPipSize(symbol);

  for (let i = 0; i < ordered.length - 2; i++) {
    const b = ordered[i];
    const o = bO(b), c = bC(b), h = bH(b), l = bL(b);
    if (isNaN(o) || isNaN(c) || h - l < pip) continue;
    const nearBoundary = Math.abs(h - lvl) <= zoneRadius || Math.abs(l - lvl) <= zoneRadius;
    if (!nearBoundary) continue;

    const next2 = ordered.slice(i + 1, i + 3);
    if (next2.length < 2) continue;

    if (obSig === 'long' && c < o) {
      // Bearish candle (OB) before bullish impulse
      if (next2.every(nb => bC(nb) > bO(nb))) {
        return { signal: 'long', val: `Bullish OB at ${lvl.toFixed(5)} — bearish candle before up-impulse` };
      }
    }
    if (obSig === 'short' && c > o) {
      // Bullish candle (OB) before bearish impulse
      if (next2.every(nb => bC(nb) < bO(nb))) {
        return { signal: 'short', val: `Bearish OB at ${lvl.toFixed(5)} — bullish candle before down-impulse` };
      }
    }
  }

  return { signal: null, val: 'No order block near boundary' };
}

// ── Feature 7: H1 EMA Alignment ──────────────────────────────────────────────
// Aggregates 5m bars into H1 candles (12 bars each) then computes EMA21 & EMA50.
// Price above both EMAs = bullish HTF, below both = bearish HTF.

function featureHtfEma(symbol) {
  const bars = S.ohlc5m?.[symbol]?.values;
  if (!bars || bars.length < 60) return { signal: null, val: 'Need 60+ 5m bars' };

  const sorted = toOldestFirst(bars.slice(1)); // skip forming bar, oldest-first
  const h1Closes = [];
  for (let i = 0; i + 11 < sorted.length; i += 12) {
    const c = bC(sorted[i + 11]);
    if (!isNaN(c)) h1Closes.push(c);
  }

  if (h1Closes.length < 22) return { signal: null, val: 'Not enough H1 bars' };

  const ema21arr = ema(h1Closes, 21);
  const ema50arr = h1Closes.length >= 51 ? ema(h1Closes, 50) : null;
  const lastPx   = h1Closes[h1Closes.length - 1];
  const e21      = ema21arr[ema21arr.length - 1];
  const e50      = ema50arr ? ema50arr[ema50arr.length - 1] : null;

  const abv21 = lastPx > e21;
  const abv50 = e50 != null ? lastPx > e50 : null;

  let signal = null;
  if (abv21 && (abv50 === null || abv50))  signal = 'long';
  if (!abv21 && (abv50 === null || !abv50)) signal = 'short';

  const e50str = e50 != null ? ` · EMA50 ${abv50 ? 'above' : 'below'}` : '';
  return { signal, val: `H1 EMA21 ${abv21 ? 'above' : 'below'}${e50str}`, ema21: e21, ema50: e50 };
}

// ── Feature 8: Session TWAP Slope ─────────────────────────────────────────────
// Anchored TWAP: cumulative average of HLC3 from London 08:00 each session.
// Uses all available 5m bars as a rolling 50-bar fallback before 08:00.
// Signal: price above TWAP + slope declining → short; price below + slope rising → long.

function featureVwapSlope(symbol, entryDir, price) {
  const bars = S.ohlc5m?.[symbol]?.values;
  if (!bars || bars.length < 12) return { signal: null, val: 'Need 12+ 5m bars' };

  const sorted = toOldestFirst(bars.slice(1)); // skip forming bar, oldest-first

  // Find today's date from the newest closed bar
  const newestDt = bars[1]?.datetime ?? '';
  const todayDate = newestDt.slice(0, 10); // "YYYY-MM-DD"

  // Session bars: London 08:00 onward, today only
  const sessionBars = sorted.filter(b => {
    const dt = b.datetime ?? '';
    return dt.slice(0, 10) === todayDate && barLondonHour(b) >= 8;
  });

  // Fallback: if fewer than 12 session bars (pre-London or early session), use
  // the most recent 50 bars as a rolling TWAP
  const barsForTwap = sessionBars.length >= 12 ? sessionBars : sorted.slice(-50);
  if (barsForTwap.length < 6) return { signal: null, val: 'Insufficient session data' };

  const warmingUp = sessionBars.length < 12;

  // Compute cumulative TWAP (running average of HLC3)
  const twap = [];
  let cumSum = 0;
  for (let i = 0; i < barsForTwap.length; i++) {
    const b = barsForTwap[i];
    const hlc3 = (bH(b) + bL(b) + bC(b)) / 3;
    cumSum += hlc3;
    twap.push(cumSum / (i + 1));
  }

  const currentTwap = twap[twap.length - 1];

  // Slope: change in TWAP over last 8 bars (40 minutes), scaled to pips
  const slopeWindow = Math.min(8, twap.length - 1);
  const slope = slopeWindow > 0
    ? (twap[twap.length - 1] - twap[twap.length - 1 - slopeWindow])
    : 0;

  const pip     = getPipSize(symbol);
  const digits  = getDigits(symbol);
  const above   = price > currentTwap;
  const slopePips = (slope / pip).toFixed(1);
  const slopeDir  = slope > 0 ? `rising ${slopePips > 0 ? '+' : ''}${slopePips}p` : `declining ${slopePips}p`;
  const twapStr   = currentTwap.toFixed(digits);
  const posStr    = above ? 'above' : 'below';

  let signal = null, strength = null;

  if (entryDir === 'short') {
    if (above && slope < 0) { signal = 'short'; strength = 'strong'; }
    else if (above)          { signal = 'short'; strength = 'mild'; }
    else                     { signal = 'long'; } // price below TWAP conflicts with short
  } else {
    if (!above && slope > 0) { signal = 'long'; strength = 'strong'; }
    else if (!above)          { signal = 'long'; strength = 'mild'; }
    else                      { signal = 'short'; } // price above TWAP conflicts with long
  }

  const strengthStr = strength === 'strong' ? ' ✓ strong' : strength === 'mild' ? ' · mild' : ' · conflicts';
  const warmStr     = warmingUp ? ' (rolling)' : '';
  const val = `TWAP ${twapStr}${warmStr} ${slopeDir} · price ${posStr}${strengthStr}`;

  return { signal, strength, slope, twap: currentTwap, val };
}

// ── Main computation ──────────────────────────────────────────────────────────

export function computeRangeBias(symbol, entryDir, price, asia, monday, volRegime) {
  const atr = volRegime?.atr || 0;
  const cfg = loadRangeBiasCfg();

  const FEATURES = [
    { key: 'rangePosition', fn: () => featureRangePosition(price, asia, monday, atr) },
    { key: 'chochBos',      fn: () => featureChochBos(symbol) },
    { key: 'cotBias',       fn: () => featureCotBias(symbol, entryDir) },
    { key: 'wickRejection', fn: () => featureWickRejection(symbol, price, asia, monday, atr) },
    { key: 'rsiDivergence', fn: () => featureRsiDivergence(symbol, price, asia, monday, atr) },
    { key: 'orderBlock',    fn: () => featureOrderBlock(symbol, price, asia, monday, atr) },
    { key: 'htfEma',        fn: () => featureHtfEma(symbol) },
    { key: 'vwapSlope',    fn: () => featureVwapSlope(symbol, entryDir, price) },
  ];

  let confirmCount = 0, conflictCount = 0, neutralCount = 0;
  const results = [];

  for (const { key, fn } of FEATURES) {
    const feat = cfg[key];
    if (!feat.enabled) {
      results.push({ key, label: feat.label, enabled: false, signal: null, pts: 0, val: 'Disabled', icon: '⚫' });
      continue;
    }

    let out;
    try { out = fn(); } catch(e) { out = { signal: null, val: 'Error' }; }

    const confirms = out.signal === entryDir;
    const conflicts = out.signal != null && out.signal !== entryDir;
    const pts = confirms ? feat.weight : conflicts ? -feat.weight : 0;

    if (confirms) confirmCount++;
    else if (conflicts) conflictCount++;
    else neutralCount++;

    results.push({
      key,
      label:   feat.label,
      enabled: true,
      signal:  out.signal,
      type:    out.type ?? null,
      pts,
      val:     out.val,
      icon:    confirms ? '🟢' : conflicts ? '🔴' : '⚪',
    });
  }

  const enabledResults = results.filter(r => r.enabled);
  const totalPts = enabledResults.reduce((s, r) => s + r.pts, 0);
  const maxPts   = enabledResults.reduce((s, r) => s + (cfg[r.key]?.weight ?? 1), 0);
  const conviction = maxPts > 0 ? totalPts / maxPts : 0;

  return { results, confirmCount, conflictCount, neutralCount, totalPts, maxPts, conviction, entryDir };
}

// ── Settings modal ────────────────────────────────────────────────────────────

export function openRangeBiasModal() {
  const overlay = document.getElementById('rangeBiasModalOverlay');
  if (!overlay) return;
  renderRangeBiasModal();
  overlay.classList.add('open');
}

export function closeRangeBiasModal() {
  document.getElementById('rangeBiasModalOverlay')?.classList.remove('open');
}

export function saveRangeBiasModal() {
  const cfg = loadRangeBiasCfg();
  for (const key of Object.keys(FEATURE_DEFS)) {
    const enEl = document.getElementById(`rb_en_${key}`);
    const wtEl = document.getElementById(`rb_wt_${key}`);
    if (enEl) cfg[key].enabled = enEl.checked;
    if (wtEl) cfg[key].weight  = Math.max(1, Math.min(3, parseInt(wtEl.value, 10) || 1));
  }
  saveRangeBiasCfg(cfg);
  closeRangeBiasModal();
  window.renderAll?.();
}

function renderRangeBiasModal() {
  const body = document.getElementById('rangeBiasModalBody');
  if (!body) return;
  const cfg = loadRangeBiasCfg();

  const dataLabels = {
    rangePosition: '5m bars + range data',
    chochBos:      '30m OHLC bars',
    cotBias:       'CFTC COT report',
    wickRejection: '5m OHLC bars',
    rsiDivergence: '5m closes → RSI-14',
    orderBlock:    '5m OHLC bars',
    htfEma:        '5m bars → H1 EMA21/50',
  };

  body.innerHTML = Object.entries(FEATURE_DEFS).map(([key, def]) => {
    const c = cfg[key];
    return `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
      <label class="rb-toggle">
        <input type="checkbox" id="rb_en_${key}" ${c.enabled ? 'checked' : ''} onchange="window._rbToggle('${key}')">
        <span class="rb-slider"></span>
      </label>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:12px;font-weight:600;color:var(--text1)">${def.label}</span>
          <span style="font-size:9px;padding:1px 6px;border-radius:8px;background:var(--s2);color:var(--text3);border:1px solid var(--border)">${dataLabels[key]}</span>
        </div>
        <div style="font-size:10.5px;color:var(--text3);margin-top:2px;line-height:1.4">${def.desc}</div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
        <span style="font-size:10px;color:var(--text3)">Weight</span>
        <select id="rb_wt_${key}" class="rb-wt-sel" ${!c.enabled ? 'disabled' : ''}>
          <option value="1" ${c.weight===1?'selected':''}>×1</option>
          <option value="2" ${c.weight===2?'selected':''}>×2</option>
          <option value="3" ${c.weight===3?'selected':''}>×3</option>
        </select>
      </div>
    </div>`;
  }).join('');
}

// Toggle helper called from modal checkboxes
window._rbToggle = function(key) {
  const enEl = document.getElementById(`rb_en_${key}`);
  const wtEl = document.getElementById(`rb_wt_${key}`);
  if (wtEl) wtEl.disabled = !enEl?.checked;
};
