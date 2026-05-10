// backtest-engine.js — Pure signal computation, no imports, no DOM

export const FIB_LEVELS = [
  -10.5,-10,-9.5,-9,-8.5,-8,-7.5,-7,-6.5,-6,-5.5,-5,-4.5,-4,-3.5,-3,-2.5,-2,-1.5,-1,
  -0.75,-0.5,-0.25, 0, 0.25,0.5,0.75,
  1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10,10.5,
];

// ── London DST ────────────────────────────────────────────────────────────────

const _dst = {};
function _dstBounds(yr) {
  if (!_dst[yr]) {
    const ms = new Date(Date.UTC(yr, 2, 31, 1));
    ms.setUTCDate(31 - ms.getUTCDay());
    const mo = new Date(Date.UTC(yr, 9, 31, 1));
    mo.setUTCDate(31 - mo.getUTCDay());
    _dst[yr] = { s: ms.getTime(), e: mo.getTime() };
  }
  return _dst[yr];
}

export function tsToLondon(tsMs) {
  const yr = new Date(tsMs).getUTCFullYear();
  const bd = _dstBounds(yr);
  const off = (tsMs >= bd.s && tsMs < bd.e) ? 3600000 : 0;
  const l = new Date(tsMs + off);
  return {
    lDate: l.toISOString().slice(0, 10),
    lHour: l.getUTCHours(),
    lMin:  l.getUTCMinutes(),
    lDay:  l.getUTCDay(),
  };
}

// ── Bar accessors ─────────────────────────────────────────────────────────────

const bO = b => b.o;
const bH = b => b.h;
const bL = b => b.l;
const bC = b => b.c;

// ── Math helpers ──────────────────────────────────────────────────────────────

export function ema(values, period) {
  const k = 2 / (period + 1);
  const r = [values[0]];
  for (let i = 1; i < values.length; i++) r.push(values[i] * k + r[i - 1] * (1 - k));
  return r;
}

export function sma(values, period) {
  return values.map((_, i) => {
    const s = values.slice(Math.max(0, i - period + 1), i + 1);
    return s.reduce((a, b) => a + b, 0) / s.length;
  });
}

export function calcRSI(values, period) {
  const result = [];
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const ch = values[i] - values[i - 1];
    if (ch > 0) gains += ch; else losses -= ch;
  }
  let ag = gains / period, al = losses / period;
  result.push(100 - 100 / (1 + ag / (al || 0.0001)));
  for (let i = period + 1; i < values.length; i++) {
    const ch = values[i] - values[i - 1];
    const g = ch > 0 ? ch : 0, loss = ch < 0 ? -ch : 0;
    ag = (ag * (period - 1) + g) / period;
    al = (al * (period - 1) + loss) / period;
    result.push(100 - 100 / (1 + ag / (al || 0.0001)));
  }
  while (result.length < values.length) result.unshift(50);
  return result;
}

// ── Symbol helpers ────────────────────────────────────────────────────────────

export function getPipSize(symbol) {
  if (symbol.includes('JPY')) return 0.01;
  if (symbol.includes('XAU') || symbol.includes('GOLD')) return 0.1;
  return 0.0001;
}

export function getDigits(symbol) {
  if (symbol.includes('JPY')) return 3;
  if (symbol.includes('XAU') || symbol.includes('GOLD')) return 2;
  return 5;
}

function getPipTol(symbol) {
  if (symbol.includes('XAU') || symbol.includes('GOLD')) return 200;
  return 2;
}

// Round number grid: the pip-interval between major psychological levels
function getRoundNumStep(symbol) {
  if (symbol.includes('JPY')) return 1.0;
  if (symbol.includes('XAU') || symbol.includes('GOLD')) return 10.0;
  return 0.01; // 100-pip grid for major FX (1.1000, 1.1100…)
}

function isNearRoundNumber(price, symbol) {
  const step    = getRoundNumStep(symbol);
  const pipSize = getPipSize(symbol);
  const mod     = ((price % step) + step) % step;
  const dist    = Math.min(mod, step - mod);
  return dist <= 3 * pipSize; // within 3 pips
}

// ── Range computation ─────────────────────────────────────────────────────────

export function computeBodyRange(bars) {
  if (!bars || !bars.length) return null;
  let high = -Infinity, low = Infinity;
  for (const b of bars) {
    high = Math.max(high, bO(b), bC(b));
    low  = Math.min(low,  bO(b), bC(b));
  }
  if (!isFinite(high) || !isFinite(low)) return null;
  return { high, low, range: high - low };
}

export function projectFibLevels(range) {
  if (!range || range.range <= 0) return [];
  return FIB_LEVELS.map(fib => ({ fib, price: range.low + range.range * fib }));
}

export function detectConfluences(todayLvls, yestLvls, symbol, tolPips) {
  const pipSize = getPipSize(symbol);
  const dist    = (tolPips != null ? tolPips : getPipTol(symbol)) * pipSize;
  const merge   = dist * 0.30;
  const pairs   = [];

  for (const t of todayLvls) {
    for (const y of yestLvls) {
      const diff = Math.abs(t.price - y.price);
      if (diff <= dist) {
        pairs.push({
          price:    (t.price + y.price) / 2,
          todayFib: t.fib,
          yestFib:  y.fib,
          isTight:  diff <= dist * 0.10 || t.fib === y.fib,
          pipDiff:  diff / pipSize,
        });
      }
    }
  }
  if (!pairs.length) return [];

  pairs.sort((a, b) => a.price - b.price);
  const clusters = [];
  let bucket = [pairs[0]];
  for (let i = 1; i < pairs.length; i++) {
    const centre = bucket.reduce((s, p) => s + p.price, 0) / bucket.length;
    if (pairs[i].price - centre <= merge) {
      bucket.push(pairs[i]);
    } else {
      clusters.push(bucket);
      bucket = [pairs[i]];
    }
  }
  clusters.push(bucket);

  return clusters.map(cl => {
    const price       = cl.reduce((s, p) => s + p.price, 0) / cl.length;
    const roundNum    = isNearRoundNumber(price, symbol);
    return {
      price,
      todayFib:      cl[0].todayFib,
      isTight:       cl.some(p => p.isTight) || roundNum,
      isRoundNumber: roundNum,
      density:       cl.length,
    };
  });
}

// ── ATR ───────────────────────────────────────────────────────────────────────

export function computeATR(bars, period = 14) {
  if (bars.length < period + 1) return bars.length > 1 ? bH(bars[bars.length-1]) - bL(bars[bars.length-1]) : 0;
  const trs = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bH(bars[i]), l = bL(bars[i]), pc = bC(bars[i - 1]);
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) atr = (atr * (period - 1) + trs[i]) / period;
  return atr;
}

// ── VuManChu helpers ──────────────────────────────────────────────────────────

function computeWaveTrend(bars) {
  const hlc3 = bars.map(b => (bH(b) + bL(b) + bC(b)) / 3);
  const esa  = ema(hlc3, 10);
  const d    = ema(hlc3.map((v, i) => Math.abs(v - esa[i])), 10);
  const ci   = hlc3.map((v, i) => d[i] > 0 ? (v - esa[i]) / (0.015 * d[i]) : 0);
  return { wt1: ema(ci, 21) };
}

function computeMoneyFlow(bars) {
  const raw = bars.map(b => (bC(b) >= bO(b) ? 1 : -1) * Math.max(0, bH(b) - bL(b)));
  return calcRSI(raw, 14).map(v => (v - 50) / 50);
}

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

function nearestPivot(pivots, targetIdx, maxDist) {
  let best = null, bestD = Infinity;
  for (const p of pivots) {
    const d = Math.abs(p.i - targetIdx);
    if (d <= maxDist && d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function oscDivergence(closes, oscValues, side, N = 5) {
  const pP = findSwingPivots(closes, N);
  const oP = findSwingPivots(oscValues, N);
  const md = N * 3;
  if (side === 'high') {
    const pH = pP.highs.slice(-2);
    if (pH.length < 2 || pH[1].val <= pH[0].val) return null;
    const oh1 = nearestPivot(oP.highs, pH[0].i, md);
    const oh2 = nearestPivot(oP.highs, pH[1].i, md);
    if (oh1 && oh2 && oh2.val < oh1.val) return 'short';
  } else {
    const pL = pP.lows.slice(-2);
    if (pL.length < 2 || pL[1].val >= pL[0].val) return null;
    const ol1 = nearestPivot(oP.lows, pL[0].i, md);
    const ol2 = nearestPivot(oP.lows, pL[1].i, md);
    if (ol1 && ol2 && ol2.val > ol1.val) return 'long';
  }
  return null;
}

// ── ADX helper ────────────────────────────────────────────────────────────────

function computeADX(bars, period = 14) {
  if (bars.length < period + 2) return null;
  const tr = [], pDM = [], mDM = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bH(bars[i]), l = bL(bars[i]), pc = bC(bars[i - 1]);
    const ph = bH(bars[i - 1]), pl = bL(bars[i - 1]);
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    const up = h - ph, dn = pl - l;
    pDM.push(up > dn && up > 0 ? up : 0);
    mDM.push(dn > up && dn > 0 ? dn : 0);
  }
  const wilder = (arr, p) => {
    let s = arr.slice(0, p).reduce((a, b) => a + b, 0);
    const r = [s];
    for (let i = p; i < arr.length; i++) { s = s - s / p + arr[i]; r.push(s); }
    return r;
  };
  const aTR = wilder(tr, period), sPDM = wilder(pDM, period), sMDM = wilder(mDM, period);
  const plusDI  = sPDM.map((v, i) => aTR[i] > 0 ? 100 * v / aTR[i] : 0);
  const minusDI = sMDM.map((v, i) => aTR[i] > 0 ? 100 * v / aTR[i] : 0);
  const dx = plusDI.map((p, i) => {
    const s = p + minusDI[i];
    return s > 0 ? 100 * Math.abs(p - minusDI[i]) / s : 0;
  });
  let adx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dx.length; i++) adx = (adx * (period - 1) + dx[i]) / period;
  return { adx, plusDI: plusDI[plusDI.length - 1], minusDI: minusDI[minusDI.length - 1] };
}

// ── Hurst helper ──────────────────────────────────────────────────────────────

function computeHurst(closes) {
  const n = closes.length;
  if (n < 16) return 0.5;
  const logP = closes.map(c => Math.log(Math.max(c, 1e-10)));
  const scales = [4, 8, 16, 32].filter(s => s * 3 <= n);
  const logN = [], logRS = [];
  for (const scale of scales) {
    const rsList = [];
    for (let start = 0; start + scale <= n; start += scale) {
      const seg  = logP.slice(start, start + scale);
      const rets = seg.slice(1).map((v, i) => v - seg[i]);
      if (!rets.length) continue;
      const mean    = rets.reduce((a, b) => a + b, 0) / rets.length;
      let cum = 0;
      const cumDev  = rets.map(x => { cum += x - mean; return cum; });
      const R = Math.max(...cumDev) - Math.min(...cumDev);
      const S = Math.sqrt(rets.reduce((a, x) => a + (x - mean) ** 2, 0) / rets.length);
      if (S > 0 && R > 0) rsList.push(R / S);
    }
    if (rsList.length > 0) {
      logN.push(Math.log(scale));
      logRS.push(Math.log(rsList.reduce((a, b) => a + b, 0) / rsList.length));
    }
  }
  if (logN.length < 2) return 0.5;
  const n2 = logN.length;
  const mX = logN.reduce((a, b) => a + b, 0) / n2;
  const mY = logRS.reduce((a, b) => a + b, 0) / n2;
  const num = logN.reduce((s, x, i) => s + (x - mX) * (logRS[i] - mY), 0);
  const den = logN.reduce((s, x) => s + (x - mX) ** 2, 0);
  return den > 0 ? Math.min(1, Math.max(0, num / den)) : 0.5;
}

// ── Ichimoku helper ───────────────────────────────────────────────────────────

function ichimokuMid(bars, period, endIdx) {
  const slice = bars.slice(Math.max(0, endIdx - period + 1), endIdx + 1);
  if (!slice.length) return null;
  return (Math.max(...slice.map(bH)) + Math.min(...slice.map(bL))) / 2;
}

// ── Feature functions ─────────────────────────────────────────────────────────
// bars5mRev = newest-first M5 array (with lDate, lHour on each bar)
// bars30m   = oldest-first M30 array
// dailyBars = oldest-first derived daily bars

function featureRangePosition(price, asiaRange, mondayRange, atr) {
  const sources = [];
  if (asiaRange?.range   > 0) sources.push({ src: 'Asia',   ...asiaRange });
  if (mondayRange?.range > 0) sources.push({ src: 'Monday', ...mondayRange });
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

function featureChochBos(bars30m) {
  if (!bars30m || bars30m.length < 25) return { signal: null, val: 'Need 25+ 30m bars' };
  const sorted = bars30m.slice(-80);
  const N = 4, SH = [], SL = [];
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
  if (hiUp && loUp) return { signal: 'long',  val: 'Bullish BOS — HH+HL' };
  if (hiDn && loDn) return { signal: 'short', val: 'Bearish BOS — LH+LL' };
  if (hiDn && loUp) return { signal: 'long',  val: 'Bullish CHoCH — LH+HL' };
  if (hiUp && loDn) return { signal: 'short', val: 'Bearish CHoCH — HH+LL' };
  return { signal: null, val: 'Mixed structure' };
}

function featureWickRejection(bars5mRev, price, asiaRange, mondayRange, atr, symbol) {
  if (!bars5mRev || bars5mRev.length < 10) return { signal: null, val: 'Need 10+ 5m bars' };
  const pip  = getPipSize(symbol);
  const zone = Math.max(atr * 0.12, pip * 3);
  const boundaries = [
    { lvl: asiaRange?.high,   side: 'resistance', src: 'Asia H' },
    { lvl: asiaRange?.low,    side: 'support',    src: 'Asia L' },
    { lvl: mondayRange?.high, side: 'resistance', src: 'Mon H' },
    { lvl: mondayRange?.low,  side: 'support',    src: 'Mon L' },
  ].filter(s => s.lvl != null && Math.abs(price - s.lvl) <= atr * 0.22);
  if (!boundaries.length) return { signal: null, val: 'Not near boundary' };
  const { lvl, side, src } = boundaries[0];
  let wickCount = 0;
  for (const b of bars5mRev.slice(0, 20)) {
    const h = bH(b), l = bL(b), o = bO(b), c = bC(b);
    if (isNaN(h) || h - l < pip) continue;
    const range = h - l;
    const near  = Math.abs(h - lvl) <= zone || Math.abs(l - lvl) <= zone;
    if (!near) continue;
    if (side === 'resistance' && (h - Math.max(o, c)) / range >= 0.40) wickCount++;
    if (side === 'support'    && (Math.min(o, c) - l)  / range >= 0.40) wickCount++;
  }
  const signal = wickCount >= 2 ? (side === 'support' ? 'long' : 'short') : null;
  const str    = wickCount >= 3 ? 'strong' : wickCount >= 2 ? 'moderate' : 'weak';
  return { signal, val: `${wickCount} wicks at ${src} — ${str}` };
}

function featureRsiDivergence(bars5mRev, price, asiaRange, mondayRange, atr, symbol) {
  if (!bars5mRev || bars5mRev.length < 60) return { signal: null, val: 'Need 60+ 5m bars' };
  let side = null;
  for (const s of [
    { lvl: asiaRange?.high,   side: 'high' },
    { lvl: asiaRange?.low,    side: 'low'  },
    { lvl: mondayRange?.high, side: 'high' },
    { lvl: mondayRange?.low,  side: 'low'  },
  ]) {
    if (s.lvl != null && Math.abs(price - s.lvl) <= atr * 0.22) { side = s.side; break; }
  }
  if (!side) return { signal: null, val: 'Not near range extreme' };
  const closed = bars5mRev.slice(1, 101).reverse(); // oldest-first
  if (closed.length < 50) return { signal: null, val: 'Insufficient bars' };
  const closes  = closed.map(bC);
  const { wt1 } = computeWaveTrend(closed);
  const mf      = computeMoneyFlow(closed);
  const rsi     = calcRSI(closes, 14).map(v => (v - 50) / 50);
  const wt1Sig  = oscDivergence(closes, wt1, side);
  const mfSig   = oscDivergence(closes, mf,  side);
  const rsiSig  = oscDivergence(closes, rsi, side);
  const comps   = [wt1Sig && { name: 'WTO', sig: wt1Sig }, mfSig && { name: 'MF', sig: mfSig }, rsiSig && { name: 'RSI', sig: rsiSig }].filter(Boolean);
  const lv = comps.filter(c => c.sig === 'long').length;
  const sv = comps.filter(c => c.sig === 'short').length;
  if (lv >= 2) return { signal: 'long',  val: `Bullish div 2/3: ${comps.filter(c => c.sig==='long').map(c=>c.name).join('+')}` };
  if (sv >= 2) return { signal: 'short', val: `Bearish div 2/3: ${comps.filter(c => c.sig==='short').map(c=>c.name).join('+')}` };
  return { signal: null, val: comps.length ? `1/3 — ${comps.map(c=>`${c.name}(${c.sig})`).join(' ')}` : 'No divergence' };
}

function featureOrderBlock(bars5mRev, price, asiaRange, mondayRange, atr, symbol) {
  if (!bars5mRev || bars5mRev.length < 15) return { signal: null, val: 'Need 15+ 5m bars' };
  const boundaries = [
    { lvl: asiaRange?.high,   obSig: 'short' },
    { lvl: asiaRange?.low,    obSig: 'long'  },
    { lvl: mondayRange?.high, obSig: 'short' },
    { lvl: mondayRange?.low,  obSig: 'long'  },
  ].filter(s => s.lvl != null && Math.abs(price - s.lvl) <= atr * 0.22);
  if (!boundaries.length) return { signal: null, val: 'Not near boundary' };
  const { lvl, obSig } = boundaries[0];
  const ordered = bars5mRev.slice(1, 32).reverse(); // oldest-first
  const zr = atr * 0.25, pip = getPipSize(symbol);
  for (let i = 0; i < ordered.length - 2; i++) {
    const b = ordered[i], o = bO(b), c = bC(b), h = bH(b), l = bL(b);
    if (isNaN(o) || h - l < pip) continue;
    if (!(Math.abs(h - lvl) <= zr || Math.abs(l - lvl) <= zr)) continue;
    const next2 = ordered.slice(i + 1, i + 3);
    if (next2.length < 2) continue;
    if (obSig === 'long'  && c < o && next2.every(n => bC(n) > bO(n))) return { signal: 'long',  val: `Bullish OB at ${lvl.toFixed(getDigits(symbol))}` };
    if (obSig === 'short' && c > o && next2.every(n => bC(n) < bO(n))) return { signal: 'short', val: `Bearish OB at ${lvl.toFixed(getDigits(symbol))}` };
  }
  return { signal: null, val: 'No OB near boundary' };
}

function featureHtfEma(bars5mRev) {
  if (!bars5mRev || bars5mRev.length < 60) return { signal: null, val: 'Need 60+ 5m bars' };
  const sorted = bars5mRev.slice(1).reverse(); // oldest-first
  const h1Closes = [];
  for (let i = 0; i + 11 < sorted.length; i += 12) {
    const c = bC(sorted[i + 11]);
    if (!isNaN(c)) h1Closes.push(c);
  }
  if (h1Closes.length < 22) return { signal: null, val: 'Not enough H1 bars' };
  const ema21 = ema(h1Closes, 21);
  const ema50 = h1Closes.length >= 51 ? ema(h1Closes, 50) : null;
  const last  = h1Closes[h1Closes.length - 1];
  const e21   = ema21[ema21.length - 1];
  const e50   = ema50 ? ema50[ema50.length - 1] : null;
  const abv21 = last > e21;
  const abv50 = e50 != null ? last > e50 : null;
  let signal  = null;
  if (abv21 && (abv50 === null || abv50))  signal = 'long';
  if (!abv21 && (abv50 === null || !abv50)) signal = 'short';
  return { signal, val: `H1 EMA21 ${abv21 ? 'above' : 'below'}${e50 != null ? ` · EMA50 ${abv50 ? 'above' : 'below'}` : ''}` };
}

function featureVwapSlope(bars5mRev, entryDir, price, symbol, todayDate) {
  if (!bars5mRev || bars5mRev.length < 12) return { signal: null, val: 'Need 12+ 5m bars' };
  const sessionBars = bars5mRev.filter(b => b.lDate === todayDate && b.lHour >= 8).reverse();
  const barsForTwap = sessionBars.length >= 12 ? sessionBars : bars5mRev.slice(-50).reverse();
  if (barsForTwap.length < 6) return { signal: null, val: 'Insufficient session data' };
  const twap = [];
  let cumSum = 0;
  for (let i = 0; i < barsForTwap.length; i++) {
    cumSum += (bH(barsForTwap[i]) + bL(barsForTwap[i]) + bC(barsForTwap[i])) / 3;
    twap.push(cumSum / (i + 1));
  }
  const currentTwap = twap[twap.length - 1];
  const sw    = Math.min(8, twap.length - 1);
  const slope = sw > 0 ? twap[twap.length - 1] - twap[twap.length - 1 - sw] : 0;
  const pip   = getPipSize(symbol);
  const above = price > currentTwap;
  let signal = null, strength = null;
  if (entryDir === 'short') {
    if (above && slope < 0) { signal = 'short'; strength = 'strong'; }
    else if (above)          { signal = 'short'; strength = 'mild'; }
    else                     { signal = 'long'; }
  } else {
    if (!above && slope > 0) { signal = 'long'; strength = 'strong'; }
    else if (!above)          { signal = 'long'; strength = 'mild'; }
    else                      { signal = 'short'; }
  }
  const sDir = slope > 0 ? `rising +${(slope/pip).toFixed(1)}p` : `declining ${(slope/pip).toFixed(1)}p`;
  return { signal, val: `TWAP ${currentTwap.toFixed(getDigits(symbol))} ${sDir} · price ${above ? 'above' : 'below'}${strength ? ' ' + strength : ''}` };
}

function featureAdxFilter(bars30m, entryDir) {
  if (!bars30m || bars30m.length < 40) return { signal: null, val: 'Need 40+ 30m bars' };
  const result = computeADX(bars30m.slice(-200), 14);
  if (!result) return { signal: null, val: 'ADX: insufficient data' };
  const { adx, plusDI, minusDI } = result;
  const trendUp = plusDI > minusDI;
  const opp     = entryDir === 'long' ? 'short' : 'long';
  if (adx < 20) return { signal: entryDir, val: `ADX ${adx.toFixed(1)} — range-bound` };
  if (adx > 28) return { signal: opp,      val: `ADX ${adx.toFixed(1)} — trending ${trendUp ? '↑' : '↓'}` };
  const aligned = (entryDir === 'long' && trendUp) || (entryDir === 'short' && !trendUp);
  return { signal: aligned ? entryDir : null, val: `ADX ${adx.toFixed(1)} · ${trendUp ? '+DI' : '-DI'} dominant` };
}

function featureHurstRegime(dailyBars, entryDir) {
  if (!dailyBars || dailyBars.length < 30) return { signal: null, val: 'Need 30+ daily bars' };
  const closes = dailyBars.slice(-80).map(bC).filter(v => !isNaN(v));
  if (closes.length < 16) return { signal: null, val: 'Insufficient close data' };
  const H   = computeHurst(closes);
  const opp = entryDir === 'long' ? 'short' : 'long';
  if (H < 0.45) return { signal: entryDir, val: `Hurst ${H.toFixed(2)} — mean-reverting` };
  if (H > 0.55) return { signal: opp,      val: `Hurst ${H.toFixed(2)} — trending` };
  return { signal: null, val: `Hurst ${H.toFixed(2)} — random walk` };
}

function featureFvgBias(bars5mRev, entryDir, price, atr, symbol) {
  if (!bars5mRev || bars5mRev.length < 20) return { signal: null, val: 'Need 20+ 5m bars' };
  const sorted = bars5mRev.slice(1, 101).reverse();
  const fvgs   = [];
  for (let i = 1; i < sorted.length - 1; i++) {
    const pH = bH(sorted[i - 1]), pL = bL(sorted[i - 1]);
    const nH = bH(sorted[i + 1]), nL = bL(sorted[i + 1]);
    if (pH < nL) fvgs.push({ type: 'bullish', top: nL, bottom: pH, barIdx: i });
    if (nH < pL) fvgs.push({ type: 'bearish', top: pL, bottom: nH, barIdx: i });
  }
  const unfilled = fvgs.filter(fvg => {
    for (let i = fvg.barIdx + 2; i < sorted.length; i++) {
      if (fvg.type === 'bullish' && bL(sorted[i]) <= fvg.bottom) return false;
      if (fvg.type === 'bearish' && bH(sorted[i]) >= fvg.top)    return false;
    }
    return true;
  });
  if (!unfilled.length) return { signal: null, val: 'No unfilled FVGs' };
  const pip = getPipSize(symbol);
  for (const fvg of unfilled) {
    if (price >= fvg.bottom && price <= fvg.top) {
      return { signal: fvg.type === 'bullish' ? 'long' : 'short', val: `Inside ${fvg.type} FVG (${((fvg.top-fvg.bottom)/pip).toFixed(0)}p)` };
    }
  }
  const nearby = unfilled
    .map(fvg => ({ ...fvg, mid: (fvg.top + fvg.bottom) / 2 }))
    .filter(fvg => Math.abs(fvg.mid - price) <= atr * 0.5)
    .sort((a, b) => Math.abs(a.mid - price) - Math.abs(b.mid - price));
  if (nearby.length) {
    const fvg = nearby[0];
    return { signal: fvg.type === 'bullish' ? 'long' : 'short', val: `${fvg.type} FVG ${Math.round(Math.abs(fvg.mid-price)/pip)}p away` };
  }
  return { signal: null, val: `${unfilled.length} unfilled FVGs — none within range` };
}

function featureWeeklyPivot(dailyBars, price, atr, symbol) {
  if (!dailyBars || dailyBars.length < 8) return { signal: null, val: 'Need 8+ daily bars' };
  const weekOf = dateStr => {
    const d = new Date(dateStr + 'T12:00:00Z');
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
    return d.toISOString().slice(0, 10);
  };
  const weekMap = new Map();
  for (const b of dailyBars) {
    const wk = weekOf(b.lDate || b.date || '');
    if (!weekMap.has(wk)) weekMap.set(wk, []);
    weekMap.get(wk).push(b);
  }
  const weeks = [...weekMap.keys()].sort();
  if (weeks.length < 2) return { signal: null, val: 'Not enough weekly bars' };
  const wb  = weekMap.get(weeks[weeks.length - 2]);
  const H   = Math.max(...wb.map(bH)), L = Math.min(...wb.map(bL)), C = bC(wb[wb.length - 1]);
  const PP  = (H + L + C) / 3;
  const R1  = 2 * PP - L, R2 = PP + (H - L), S1 = 2 * PP - H, S2 = PP - (H - L);
  const pip = getPipSize(symbol), prox = atr * 0.22;
  const lvls = [{ name: 'WR2', lvl: R2, sig: 'short' }, { name: 'WR1', lvl: R1, sig: 'short' }, { name: 'WPP', lvl: PP, sig: null }, { name: 'WS1', lvl: S1, sig: 'long' }, { name: 'WS2', lvl: S2, sig: 'long' }];
  let best = null, bestDist = Infinity;
  for (const l of lvls) { const d = Math.abs(price - l.lvl); if (d < bestDist) { bestDist = d; best = l; } }
  if (bestDist > prox) return { signal: null, val: `Nearest ${best?.name} ${(bestDist/pip).toFixed(0)}p away` };
  return { signal: best.sig, val: `Near ${best.name} ${best.lvl.toFixed(getDigits(symbol))} (${Math.round(bestDist/pip)}p)` };
}

function featureIchimokuCloud(dailyBars, entryDir, price, symbol) {
  if (!dailyBars || dailyBars.length < 78) return { signal: null, val: 'Need 78+ daily bars' };
  const last     = dailyBars.length - 1;
  const cloudIdx = last - 26;
  if (cloudIdx < 51) return { signal: null, val: 'Need 78+ bars for cloud' };
  const tenkan = ichimokuMid(dailyBars, 9,  last);
  const kijun  = ichimokuMid(dailyBars, 26, last);
  const t26    = ichimokuMid(dailyBars, 9,  cloudIdx);
  const k26    = ichimokuMid(dailyBars, 26, cloudIdx);
  const spanA  = t26 != null && k26 != null ? (t26 + k26) / 2 : null;
  const spanB  = ichimokuMid(dailyBars, 52, cloudIdx);
  if (spanA == null || spanB == null || tenkan == null || kijun == null) return { signal: null, val: 'Ichimoku: insufficient data' };
  const cloudTop = Math.max(spanA, spanB), cloudBot = Math.min(spanA, spanB);
  let cloudSig = null, cloudPos = 'inside cloud';
  if (price > cloudTop)      { cloudSig = 'long';  cloudPos = 'above cloud'; }
  else if (price < cloudBot) { cloudSig = 'short'; cloudPos = 'below cloud'; }
  const pip      = getPipSize(symbol);
  const tkLabel  = tenkan > kijun ? 'TK bull ↑' : tenkan < kijun ? 'TK bear ↓' : 'TK flat';
  const chikou   = bC(dailyBars[last]);
  const prior    = bC(dailyBars[last - 26]);
  const chLabel  = prior > 0 && chikou > prior ? 'Chikou ↑' : 'Chikou ↓';
  const thick    = Math.round(Math.abs(spanA - spanB) / pip);
  return { signal: cloudSig, val: `${cloudPos} (${thick}p ${spanA >= spanB ? 'green' : 'red'}) · ${tkLabel} · ${chLabel}` };
}

// ── MACD ──────────────────────────────────────────────────────────────────────

function featureMacdSignal(bars5mRev, entryDir) {
  // Need enough bars for EMA(26) + EMA(9) signal = 35 minimum
  if (!bars5mRev || bars5mRev.length < 35) return { signal: null, val: 'n/a' };
  const closes = bars5mRev.map(b => bC(b)).reverse(); // oldest first
  const e12    = ema(closes, 12);
  const e26    = ema(closes, 26);
  const macdLine = e12.map((v, i) => v - e26[i]);
  // EMA(9) of macdLine from bar 26 onward
  const sigLine = ema(macdLine.slice(26), 9);
  const last  = macdLine[macdLine.length - 1];
  const lSig  = sigLine[sigLine.length - 1];
  const above = last > lSig;   // MACD above signal → bullish momentum
  const bias  = above ? 'long' : 'short';
  return { signal: bias === entryDir ? entryDir : (entryDir === 'long' ? 'short' : 'long'), val: `MACD ${last > 0 ? '+' : ''}${(last / 0.0001).toFixed(1)}p` };
}

// ── Main signal dispatch ──────────────────────────────────────────────────────

export function computeSignal({ bars5mRev, bars30m, dailyBars, asiaRange, mondayRange, atr, symbol, entryDir, price, todayDate, featureCfg }) {
  const FEATURE_FNS = {
    rangePosition: () => featureRangePosition(price, asiaRange, mondayRange, atr),
    chochBos:      () => featureChochBos(bars30m),
    wickRejection: () => featureWickRejection(bars5mRev, price, asiaRange, mondayRange, atr, symbol),
    rsiDivergence: () => featureRsiDivergence(bars5mRev, price, asiaRange, mondayRange, atr, symbol),
    orderBlock:    () => featureOrderBlock(bars5mRev, price, asiaRange, mondayRange, atr, symbol),
    htfEma:        () => featureHtfEma(bars5mRev),
    vwapSlope:     () => featureVwapSlope(bars5mRev, entryDir, price, symbol, todayDate),
    adxFilter:     () => featureAdxFilter(bars30m, entryDir),
    hurstRegime:   () => featureHurstRegime(dailyBars, entryDir),
    fvgBias:       () => featureFvgBias(bars5mRev, entryDir, price, atr, symbol),
    weeklyPivot:   () => featureWeeklyPivot(dailyBars, price, atr, symbol),
    ichimokuCloud: () => featureIchimokuCloud(dailyBars, entryDir, price, symbol),
    macdSignal:    () => featureMacdSignal(bars5mRev, entryDir),
  };
  let confirmCount = 0, conflictCount = 0, totalPts = 0, maxPts = 0;
  const results = [];
  for (const [key, fn] of Object.entries(FEATURE_FNS)) {
    const cfg = featureCfg[key];
    if (!cfg?.enabled) continue;
    let out;
    try { out = fn(); } catch { out = { signal: null, val: 'Error' }; }
    const weight   = cfg.weight || 1;
    const confirms = out.signal === entryDir;
    const conflicts = out.signal != null && out.signal !== entryDir;
    const pts = confirms ? weight : conflicts ? -weight : 0;
    if (confirms) confirmCount++;
    else if (conflicts) conflictCount++;
    maxPts   += weight;
    totalPts += pts;
    results.push({ key, label: cfg.label || key, signal: out.signal, val: out.val, pts, icon: confirms ? '🟢' : conflicts ? '🔴' : '⚪' });
  }
  const conviction = maxPts > 0 ? totalPts / maxPts : 0;
  return { results, conviction, confirmCount, conflictCount, totalPts, maxPts };
}
