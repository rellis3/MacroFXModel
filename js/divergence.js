// ── Oscillator Divergence Detection ──────────────────────────────────────────
// Ported from VuManChu Cipher B (Pine Script v4) fractal divergence logic.
// Detects regular bullish/bearish divergences on:
//   - Daily RSI(14)  — structural bias over last 30 trading days
//   - 5m WaveTrend  — intraday bias over last 50 bars (~4h)
//
// A divergence is flagged when:
//   Bull: price makes a LOWER low at a fractal oscillator bottom, but the
//         oscillator makes a HIGHER low (momentum diverging from price → reversal)
//   Bear: price makes a HIGHER high at a fractal oscillator top, but the
//         oscillator makes a LOWER high

import { S } from './state.js';
import { ema, sma, calcRSI, filterTradingDays } from './utils.js';

// ── Fractal detection ─────────────────────────────────────────────────────────
// Finds strict local minima/maxima in oscillator array (chronological, oldest-first).
// reach=2 matches VuManChu's 5-bar fractal (2 bars each side).

function fractalBots(arr, reach = 2) {
  const bots = [];
  for (let i = reach; i < arr.length - reach; i++) {
    let ok = true;
    for (let j = 1; j <= reach; j++) {
      if (arr[i] >= arr[i - j] || arr[i] >= arr[i + j]) { ok = false; break; }
    }
    if (ok) bots.push(i);
  }
  return bots;
}

function fractalTops(arr, reach = 2) {
  const tops = [];
  for (let i = reach; i < arr.length - reach; i++) {
    let ok = true;
    for (let j = 1; j <= reach; j++) {
      if (arr[i] <= arr[i - j] || arr[i] <= arr[i + j]) { ok = false; break; }
    }
    if (ok) tops.push(i);
  }
  return tops;
}

// ── WaveTrend oscillator ──────────────────────────────────────────────────────
// VuManChu formula: EMA(EMA(price, chLen)) → CI → EMA(CI, avgLen) → SMA signal line
function computeWT(closes, chLen = 9, avgLen = 12, maLen = 3) {
  const esa   = ema(closes, chLen);
  const diffs = closes.map((c, i) => Math.abs(c - esa[i]));
  const de    = ema(diffs, chLen);
  const ci    = closes.map((c, i) => de[i] > 0 ? (c - esa[i]) / (0.015 * de[i]) : 0);
  const wt1   = ema(ci, avgLen);
  const wt2   = sma(wt1, maLen);
  return { wt1, wt2 };
}

// ── Divergence finders ────────────────────────────────────────────────────────
// maxOscAtBot: fractal bot must have osc value ≤ this (oversold zone filter)
function findBullDiv(osc, priceLows, botIndices, maxBarsAgo, maxOscAtBot = Infinity) {
  const n     = osc.length;
  const inWin = botIndices.filter(i => n - 1 - i <= maxBarsAgo && osc[i] <= maxOscAtBot);
  if (inWin.length < 2) return null;
  const r = inWin[inWin.length - 1];  // most recent fractal bot
  const p = inWin[inWin.length - 2];  // previous fractal bot
  if (priceLows[r] < priceLows[p] && osc[r] > osc[p]) {
    const depth = Math.abs(osc[r] - osc[p]);
    return { type: 'bull', barsAgo: n - 1 - r, depth };
  }
  return null;
}

// minOscAtTop: fractal top must have osc value ≥ this (overbought zone filter)
function findBearDiv(osc, priceHighs, topIndices, maxBarsAgo, minOscAtTop = -Infinity) {
  const n     = osc.length;
  const inWin = topIndices.filter(i => n - 1 - i <= maxBarsAgo && osc[i] >= minOscAtTop);
  if (inWin.length < 2) return null;
  const r = inWin[inWin.length - 1];
  const p = inWin[inWin.length - 2];
  if (priceHighs[r] > priceHighs[p] && osc[r] < osc[p]) {
    const depth = Math.abs(osc[r] - osc[p]);
    return { type: 'bear', barsAgo: n - 1 - r, depth };
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────
// Returns { rsi: { bullDiv, bearDiv }, wt5m: { bullDiv, bearDiv } }
// Each div object: { type, barsAgo, depth } or null.
export function computeDivergences(sym) {
  const symbol = sym ?? S.currentPair?.symbol;
  const result = {
    rsi:  { bullDiv: null, bearDiv: null },
    wt5m: { bullDiv: null, bearDiv: null },
  };

  // ── Daily RSI divergence ───────────────────────────────────────────────────
  try {
    const bars = filterTradingDays(S.ohlcData[symbol]?.values);
    if (bars && bars.length >= 25) {
      const chron  = [...bars].reverse();         // oldest-first
      const closes = chron.map(b => parseFloat(b.close));
      const highs  = chron.map(b => parseFloat(b.high));
      const lows   = chron.map(b => parseFloat(b.low));

      const rsiArr = calcRSI(closes, 14);
      const bots   = fractalBots(rsiArr, 2);
      const tops   = fractalTops(rsiArr, 2);

      // Bull: RSI at fractal bottom must be in oversold zone (< 40)
      // Bear: RSI at fractal top must be in overbought zone (> 60)
      result.rsi.bullDiv = findBullDiv(rsiArr, lows,  bots, 30, 40);
      result.rsi.bearDiv = findBearDiv(rsiArr, highs, tops, 30, 60);
    }
  } catch (e) { /* fail silently — data may not yet be loaded */ }

  // ── 5m WaveTrend divergence ────────────────────────────────────────────────
  try {
    const bars5m = S.ohlc5m?.[symbol]?.values;
    if (bars5m && bars5m.length >= 30) {
      const win    = bars5m.slice(1, 150);        // skip forming bar, up to 150 closed bars
      const chron5 = [...win].reverse();           // oldest-first

      const c5 = b => parseFloat(b.close ?? b.mid?.c ?? b.c);
      const h5 = b => parseFloat(b.high  ?? b.mid?.h ?? b.h ?? b.close ?? b.mid?.c ?? b.c);
      const l5 = b => parseFloat(b.low   ?? b.mid?.l ?? b.l ?? b.close ?? b.mid?.c ?? b.c);

      const closes5 = chron5.map(c5);
      const highs5  = chron5.map(h5);
      const lows5   = chron5.map(l5);

      if (closes5.length >= 20 && !closes5.some(isNaN)) {
        const { wt2 } = computeWT(closes5);
        const bots5   = fractalBots(wt2, 2);
        const tops5   = fractalTops(wt2, 2);

        // WT OB/OS zone filters (VuManChu defaults: bull < −25, bear > +25)
        result.wt5m.bullDiv = findBullDiv(wt2, lows5,  bots5, 50, -25);
        result.wt5m.bearDiv = findBearDiv(wt2, highs5, tops5, 50,  25);
      }
    }
  } catch (e) { /* fail silently */ }

  return result;
}
