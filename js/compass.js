import { S } from './state.js';
import { COMPASS_CONFIG, COMPASS_TTL, COMPASS_CACHE_VERSION } from './config.js';
import { kvGet, kvSet, getDigits, getPipSize, filterTradingDays } from './utils.js';
import { calculateVolRegime, calculatePivots } from './vol.js';
import { calculateTierScores } from './macro.js';
import { filterConfluences, enhanceConfluences } from './confluences.js';

// ── Cache ────────────────────────────────────────────────────────────────────

function compassCacheKey(sym) { return 'compass_' + sym.replace('/',''); }

async function compassLoadCache(sym) {
  const key = compassCacheKey(sym);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && Date.now() - obj.ts <= COMPASS_TTL) {
        if (sym === 'XAU/USD' && (
          !obj.spreadDxy  || obj.spreadDxy.length  === 0 ||
          !obj.spread10y  || obj.spread10y.length  === 0
        )) { /* fall through */ }
        else if ((obj._v || 1) >= COMPASS_CACHE_VERSION) {
          if (!obj.spread10y || obj.spread10y.length < 5) { /* fall through — cached with empty spread */ }
          else return obj;
        }
      }
    }
  } catch(e) {}
  const kvObj = await kvGet(key);
  if (kvObj && kvObj.data && kvObj.timestamp) {
    if (Date.now() - kvObj.timestamp <= COMPASS_TTL) {
      const obj = { ts: kvObj.timestamp, ...kvObj.data };
      if (sym === 'XAU/USD' && (
        !obj.spreadDxy || obj.spreadDxy.length === 0 ||
        !obj.spread10y || obj.spread10y.length === 0
      )) return null;
      if ((obj._v || 1) < COMPASS_CACHE_VERSION) return null;
      if (!obj.spread10y || obj.spread10y.length < 5) return null;
      try { localStorage.setItem(key, JSON.stringify(obj)); } catch(e) {}
      return obj;
    }
  }
  return null;
}

function compassSaveCache(sym, payload) {
  const key = compassCacheKey(sym);
  const full = { ts: Date.now(), _v: COMPASS_CACHE_VERSION, ...payload };
  try { localStorage.setItem(key, JSON.stringify(full)); } catch(e) {}
  kvSet(key, full);
}

// ── Data loading ─────────────────────────────────────────────────────────────

export async function loadCompassData(sym) {
  if (S.compassData[sym] && (Date.now() - S.compassData[sym].ts) < COMPASS_TTL) {
    if (sym === 'XAU/USD' && (
      !S.compassData[sym].spreadDxy || S.compassData[sym].spreadDxy.length === 0 ||
      !S.compassData[sym].spread10y || S.compassData[sym].spread10y.length === 0
    )) {
      delete S.compassData[sym];
    } else {
      return S.compassData[sym];
    }
  }

  const cached = await compassLoadCache(sym);
  if (cached) { S.compassData[sym] = cached; return cached; }

  const cfg = COMPASS_CONFIG[sym];
  if (!cfg) return null;

  const keys = ['us2y', 'us10y'];
  if (cfg.short) keys.push(cfg.short);
  if (cfg.long && cfg.long !== 'us10y') keys.push(cfg.long);
  if (cfg.crossBase) keys.push(cfg.crossBase);
  if (cfg.crossBaseShort) keys.push(cfg.crossBaseShort);
  if (cfg.dxy) keys.push('dxy');

  try {
    const res = await fetch('/api/fredhistory?keys=' + keys.join(','));
    if (!res.ok) throw new Error('fredhistory ' + res.status);
    const hist = await res.json();

    const result = compassCompute(sym, hist, cfg);
    S.compassData[sym] = result;
    compassSaveCache(sym, result);
    return result;
  } catch(e) {
    console.warn('Compass load failed:', e.message);
    return null;
  }
}

export function compassCompute(sym, hist, cfg) {
  const us2y  = hist.us2y  || [];
  const us10y = hist.us10y || [];
  const fgnS  = cfg.short ? (hist[cfg.short] || []) : [];
  const fgnL  = hist[cfg.long] || [];
  // Cross pairs iterate over their crossBase series instead of us10y
  const baseL = cfg.crossBase ? (hist[cfg.crossBase] || []) : us10y;
  const baseS = cfg.crossBaseShort ? (hist[cfg.crossBaseShort] || []) : us2y;

  function toMap(arr) {
    const m = {};
    arr.forEach(p => { m[p.date] = p.value; });
    return m;
  }

  const us2Map  = toMap(us2y);
  const baseLMap = toMap(baseL);
  const baseSMap = toMap(baseS);
  const fgnSMap = toMap(fgnS);
  const fgnLMap = toMap(fgnL);

  const spread2y  = [];
  const spread10y = [];

  baseL.forEach(p => {
    const d = p.date;
    const fL = fgnLMap[d];
    if (fL != null) {
      let sp10;
      if (sym === 'XAU/USD') {
        sp10 = p.value;
      } else if (cfg.crossBase) {
        sp10 = fL - p.value; // fgnL - crossBase (e.g. gb10y - de10y for EUR/GBP)
      } else if (sym === 'EUR/USD') {
        sp10 = p.value - fL; // us10y - de10y
      } else {
        sp10 = fL - p.value; // fgnL - us10y
      }
      spread10y.push({ date: d, value: sp10 });
    }

    if (cfg.short) {
      const fS = fgnSMap[d];
      if (fS != null) {
        let sp2;
        if (sym === 'XAU/USD') {
          sp2 = us2Map[d] || 0;
        } else if (cfg.crossBase) {
          sp2 = fS - (baseSMap[d] || 0); // fgnS - crossBaseShort
        } else if (sym === 'EUR/USD') {
          sp2 = (baseSMap[d] || 0) - fS;
        } else {
          sp2 = fS - (baseSMap[d] || 0);
        }
        if (!isNaN(sp2)) spread2y.push({ date: d, value: sp2 });
      }
    }
  });

  const spread2yFilled = forwardFill(spread2y, baseL.map(p => p.date));

  // DXY is a weekly series (DTWEXBGS); us10y is monthly — dates never coincide
  // so aligning to us10y via forwardFill always produces empty results.
  // Use the DXY weekly series directly instead.
  const dxyHist = hist.dxy || [];
  const spreadDxyFilled = dxyHist.slice(-90);

  const latest2y  = spread2yFilled.length ? spread2yFilled[spread2yFilled.length-1].value : null;
  const latest10y = spread10y.length ? spread10y[spread10y.length-1].value : null;
  const prev10y   = spread10y.length > 1 ? spread10y[spread10y.length-2].value : null;
  const latestDxy = spreadDxyFilled.length ? spreadDxyFilled[spreadDxyFilled.length-1].value : null;

  const momentum10y = computeMomentum(spread10y, 5);
  const momentum2y  = computeMomentum(spread2yFilled, 5);
  const momentumDxy = computeMomentum(spreadDxyFilled, 5);

  // Snapshot each raw yield series (last 2 values) for the Yield Pulse card.
  const rawYields = {};
  const snapYield = (key, arr) => {
    if (!arr?.length) return;
    rawYields[key] = {
      latest: arr[arr.length - 1].value,
      prev:   arr.length > 1 ? arr[arr.length - 2].value : null,
      date:   arr[arr.length - 1].date,
    };
  };
  snapYield('us10y', us10y);
  snapYield('us2y',  us2y);
  if (cfg.long  && cfg.long  !== 'us10y') snapYield(cfg.long,  fgnL);
  if (cfg.short)                           snapYield(cfg.short, fgnS);
  if (cfg.crossBase)                       snapYield(cfg.crossBase,      baseL);
  if (cfg.crossBaseShort)                  snapYield(cfg.crossBaseShort, baseS);

  return {
    ts: Date.now(),
    sym,
    spread2y:     spread2yFilled,
    spread10y,
    spreadDxy:    spreadDxyFilled,
    latest2y,
    latest10y,
    prev10y,
    latestDxy,
    momentum10y,
    momentum2y,
    momentumDxy,
    rawYields,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function forwardFill(sparseArr, allDates) {
  if (!sparseArr.length) return [];
  const map = {};
  sparseArr.forEach(p => { map[p.date] = p.value; });
  const result = [];
  let lastVal = null;
  allDates.forEach(d => {
    if (map[d] != null) lastVal = map[d];
    if (lastVal != null) result.push({ date: d, value: lastVal });
  });
  return result;
}

function computeMomentum(arr, n) {
  if (arr.length < n + 1) return null;
  return arr[arr.length-1].value - arr[arr.length-1-n].value;
}

export function zScore(arr) {
  if (!arr.length) return [];
  const vals = arr.map(p => p.value);
  const mean = vals.reduce((a,b)=>a+b,0) / vals.length;
  const std  = Math.sqrt(vals.map(v=>(v-mean)**2).reduce((a,b)=>a+b,0) / vals.length) || 1;
  return arr.map(p => ({ date: p.date, value: (p.value - mean) / std }));
}

export function buildSVGPath(points, xScale, yScale, h, yRange) {
  if (!points.length) return '';
  const [yMin, yMax] = yRange;
  const ySpan = yMax - yMin || 1;
  const coords = points.map((p, i) => {
    const x = i * xScale;
    const y = h - ((p.value - yMin) / ySpan) * h;
    return `${x.toFixed(1)},${Math.max(0, Math.min(h, y)).toFixed(1)}`;
  });
  return 'M' + coords.join('L');
}

// ── Regime + fair value ──────────────────────────────────────────────────────

export function compassRegime(data, quote) {
  if (!data || !quote) return { label: 'NO DATA', cls: 'flat', icon: 'sq', text: 'Load data to see regime' };

  const sp10 = data.latest10y;
  const mom  = data.momentum10y;
  const cfg  = COMPASS_CONFIG[data.sym];
  if (sp10 == null) return { label: 'NO DATA', cls: 'flat', icon: 'sq', text: 'Insufficient history' };

  if (data.sym === 'XAU/USD') {
    const align = goldDriverAlignment(data);
    if (!align) return { label: 'NO DATA', cls: 'flat', icon: 'sq', text: 'Insufficient data' };
    const lblMap = {
      'ALIGNED_BULL':        'DUAL BULLISH',
      'ALIGNED_BEAR':        'DUAL BEARISH',
      'DIVERGING_YIELD_BULL':'YIELD BULL / DXY BEAR',
      'DIVERGING_DXY_BULL':  'DXY BULL / YIELD BEAR',
      'NEUTRAL':             'MIXED SIGNALS',
    };
    return { label: lblMap[align.status] || align.status, cls: align.cls || 'flat', icon: 'sq', text: align.label };
  }

  const spreadBullish = cfg.fxSign > 0 ? sp10 > 0 : sp10 < 0;
  const momBullish    = mom != null ? (cfg.fxSign > 0 ? mom > 0 : mom < 0) : null;

  if (momBullish === null) {
    return spreadBullish
      ? { label: 'SPREAD BULLISH', cls: 'aligned',   icon: 'green', text: `Rate differential favours ${data.sym.split('/')[0]}` }
      : { label: 'SPREAD BEARISH', cls: 'opposed',   icon: 'red',   text: `Rate differential weighs on ${data.sym.split('/')[0]}` };
  }

  if (spreadBullish  && momBullish)  return { label: 'TREND ALIGNED',   cls: 'aligned',   icon: 'green',  text: 'Spread level and momentum both bullish -- trend day bias, follow momentum' };
  if (!spreadBullish && !momBullish) return { label: 'TREND OPPOSED',   cls: 'opposed',   icon: 'red',    text: 'Spread level and momentum both bearish -- trend day bias, fade rallies' };
  if (spreadBullish  && !momBullish) return { label: 'SPREAD FADING',   cls: 'diverging', icon: 'yellow', text: 'Spread level bullish but losing momentum -- possible reversal or chop' };
  return                                    { label: 'SPREAD BUILDING', cls: 'diverging', icon: 'yellow', text: 'Spread bearish but momentum shifting -- watch for mean-reversion setup' };
}

export function compassFairValue(data) {
  if (!data || data.latest10y == null) return null;

  const cfg  = COMPASS_CONFIG[data.sym];
  const isGoldFV = data.sym === 'XAU/USD';

  const z10  = data.spread10y.length > 20 ? zScore(data.spread10y) : null;
  const z2   = data.spread2y.length  > 20 ? zScore(data.spread2y)  : null;
  const zDxy = (isGoldFV && data.spreadDxy && data.spreadDxy.length > 20)
    ? zScore(data.spreadDxy) : null;

  const z10last  = z10  ? z10[z10.length-1]?.value   : null;
  const z2last   = z2   ? z2[z2.length-1]?.value     : null;
  const zDxylast = zDxy ? zDxy[zDxy.length-1]?.value : null;

  let signal = null;

  if (isGoldFV) {
    if (z10last != null && zDxylast != null) {
      signal = (z10last * 0.55 + zDxylast * 0.45) * cfg.fxSign;
    } else if (z10last != null) {
      signal = z10last * cfg.fxSign;
    } else if (zDxylast != null) {
      signal = zDxylast * cfg.fxSign;
    }
  } else {
    if (z10last != null && z2last != null) signal = (z2last * 0.6 + z10last * 0.4) * cfg.fxSign;
    else if (z10last != null) signal = z10last * cfg.fxSign;
    else if (z2last  != null) signal = z2last  * cfg.fxSign;
  }

  return signal;
}

// ── Price-vs-spread divergence (rolling regression residual, z-scored) ──────
// compassFairValue() above is a pure spread-direction lean — it never looks at
// price, despite the "Fair Value" UI copy implying a price comparison. This is
// the real lead-lag metric: regress price on the same composite spread z-score
// over a rolling window, then z-score the residual. |z| above ~1.5 means price
// has drifted away from where the yield differential implies it should sit —
// the cointegration-style cousin of a naive zScore(price) - zScore(spread).
const DIVERGENCE_WINDOW = 120; // trading days in the rolling regression window

export function compositeSpreadZSeries(data, cfg) {
  const isGoldFV = data.sym === 'XAU/USD';
  const z10 = data.spread10y?.length > 20 ? zScore(data.spread10y) : null;

  if (isGoldFV) {
    const zDxy = data.spreadDxy?.length > 20 ? zScore(data.spreadDxy) : null;
    if (!z10 && !zDxy) return null;
    if (z10 && zDxy) {
      const dxyMap = {};
      zDxy.forEach(p => { dxyMap[p.date] = p.value; });
      return z10.filter(p => dxyMap[p.date] != null)
        .map(p => ({ date: p.date, value: (p.value * 0.55 + dxyMap[p.date] * 0.45) * cfg.fxSign }));
    }
    const single = z10 || zDxy;
    return single.map(p => ({ date: p.date, value: p.value * cfg.fxSign }));
  }

  const z2 = data.spread2y?.length > 20 ? zScore(data.spread2y) : null;
  if (!z10 && !z2) return null;
  if (z10 && z2) {
    const z2Map = {};
    z2.forEach(p => { z2Map[p.date] = p.value; });
    return z10.filter(p => z2Map[p.date] != null)
      .map(p => ({ date: p.date, value: (z2Map[p.date] * 0.6 + p.value * 0.4) * cfg.fxSign }));
  }
  const single = z10 || z2;
  return single.map(p => ({ date: p.date, value: p.value * cfg.fxSign }));
}

// Simple OLS: y = alpha + beta*x. r2 included so callers can sanity-check fit quality.
function olsRegress(xs, ys) {
  const n = xs.length;
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean, dy = ys[i] - yMean;
    num += dx * dy; denX += dx * dx; denY += dy * dy;
  }
  if (denX === 0) return null;
  const beta  = num / denX;
  const alpha = yMean - beta * xMean;
  const r2    = denY === 0 ? 0 : (num * num) / (denX * denY);
  return { alpha, beta, r2 };
}

export function compassDivergence(data, sym) {
  const cfg = COMPASS_CONFIG[sym];
  if (!cfg || !data) return null;

  const spreadZ = compositeSpreadZSeries(data, cfg);
  if (!spreadZ || spreadZ.length < 30) return null;

  const fxBars = filterTradingDays(S.ohlcData[sym]?.values);
  if (!fxBars || fxBars.length < 30) return null;
  const priceMap = {};
  fxBars.forEach(b => { priceMap[b.datetime.split(' ')[0]] = parseFloat(b.close); });

  const aligned = spreadZ
    .map(p => ({ date: p.date, x: p.value, y: priceMap[p.date] }))
    .filter(p => p.y != null && Number.isFinite(p.y));
  if (aligned.length < 30) return null;

  const win = aligned.slice(-DIVERGENCE_WINDOW);
  const reg = olsRegress(win.map(p => p.x), win.map(p => p.y));
  if (!reg) return null;

  const residuals = win.map(p => ({ date: p.date, value: p.y - (reg.alpha + reg.beta * p.x) }));
  const zSeries = zScore(residuals);
  const zLast = zSeries.length ? zSeries[zSeries.length - 1].value : null;
  const lastResidual = residuals.length ? residuals[residuals.length - 1].value : null;

  return {
    z: zLast,
    residualSeries: zSeries,
    fairPrice: reg.alpha + reg.beta * win[win.length - 1].x,
    gap: lastResidual != null ? -lastResidual : null, // price units price must move to reach regression fair value
    beta: reg.beta,
    r2: reg.r2,
    n: win.length,
  };
}

// ── Rate-of-change forecast (movement lag) ───────────────────────────────────
// Web port of pine/yield-lag-forecast.pine's RoC/forecast block. Computes the
// rolling rate-of-change of the composite spread z-score (lagDays trading day
// ≈ next 24h), smooths it, z-scores it to flag abnormal readings, then beta-
// fits the smoothed RoC against the subsequent lagDays-day price move so a
// live reading can be projected into a forecast price delta. followStatus is
// a retrospective check (today's beta applied to the lag-days-ago reading)
// of whether price actually moved the way the last forecast implied.
const ROC_LAG_DAYS    = 1;   // trading days; 1 ≈ next 24h
const ROC_SMOOTH_DAYS = 3;   // trailing smoothing window on the RoC itself
const ROC_Z_WINDOW    = 90;  // trading days used to z-score the smoothed RoC
const ROC_ABNORMAL_Z  = 1.5; // |z| above this is flagged abnormal
const ROC_BETA_WINDOW = 60;  // trading days in the beta/correlation fit
const ROC_MIN_SAMPLES = 15;  // min valid beta-fit samples before trusting it

function tailMean(vals) {
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function compassRocForecast(data, sym) {
  const cfg = COMPASS_CONFIG[sym];
  if (!cfg || !data) return null;

  const spreadZ = compositeSpreadZSeries(data, cfg);
  if (!spreadZ || spreadZ.length < ROC_SMOOTH_DAYS + ROC_LAG_DAYS + 20) return null;

  const rocSeries = [];
  for (let i = ROC_LAG_DAYS; i < spreadZ.length; i++) {
    rocSeries.push({ date: spreadZ[i].date, value: spreadZ[i].value - spreadZ[i - ROC_LAG_DAYS].value });
  }

  const smoothSeries = rocSeries.map((p, i) => {
    const win = rocSeries.slice(Math.max(0, i - ROC_SMOOTH_DAYS + 1), i + 1).map(q => q.value);
    return { date: p.date, value: tailMean(win) };
  });

  const zSeries = zScore(smoothSeries.slice(-ROC_Z_WINDOW));
  const zRoc = zSeries.length ? zSeries[zSeries.length - 1].value : null;
  const smoothedRoc = smoothSeries.length ? smoothSeries[smoothSeries.length - 1].value : null;
  const abnormal = zRoc != null && Math.abs(zRoc) > ROC_ABNORMAL_Z;

  const fxBars = filterTradingDays(S.ohlcData[sym]?.values);
  if (!fxBars || fxBars.length < 30) {
    return { zRoc, abnormal, beta: null, corr: null, n: 0, smoothedRoc, forecastDelta: null, followStatus: 'WARMING UP', lagDays: ROC_LAG_DAYS };
  }
  const priceMap = {};
  fxBars.forEach(b => { priceMap[b.datetime.split(' ')[0]] = parseFloat(b.close); });

  const combined = smoothSeries
    .map(p => ({ date: p.date, x: p.value, y: priceMap[p.date] }))
    .filter(p => p.x != null && p.y != null && Number.isFinite(p.y));

  let beta = null, corr = null, validCnt = 0, followStatus = 'WARMING UP';
  if (combined.length > ROC_LAG_DAYS + 5) {
    const win = combined.slice(-(ROC_BETA_WINDOW + ROC_LAG_DAYS));
    const pairs = [];
    for (let i = ROC_LAG_DAYS; i < win.length; i++) {
      pairs.push({ x: win[i - ROC_LAG_DAYS].x, y: win[i].y - win[i - ROC_LAG_DAYS].y });
    }
    validCnt = pairs.length;
    if (validCnt > 5) {
      const mx = tailMean(pairs.map(p => p.x));
      const my = tailMean(pairs.map(p => p.y));
      let sxx = 0, syy = 0, sxy = 0;
      pairs.forEach(p => {
        const dx = p.x - mx, dy = p.y - my;
        sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
      });
      if (sxx > 0) beta = sxy / sxx;
      if (sxx > 0 && syy > 0) corr = sxy / Math.sqrt(sxx * syy);
    }

    const lastIdx = combined.length - 1;
    if (beta != null && validCnt >= ROC_MIN_SAMPLES && lastIdx - ROC_LAG_DAYS >= 0) {
      const lastPredictor    = combined[lastIdx - ROC_LAG_DAYS].x;
      const lastActualMove   = combined[lastIdx].y - combined[lastIdx - ROC_LAG_DAYS].y;
      const lastForecastMove = beta * lastPredictor;
      followStatus = (lastActualMove * lastForecastMove > 0) ? 'FOLLOWING' : 'DIVERGING';
    }
  }

  const forecastDelta = (beta != null && smoothedRoc != null) ? beta * smoothedRoc : null;

  return { zRoc, abnormal, beta, corr, n: validCnt, smoothedRoc, forecastDelta, followStatus, lagDays: ROC_LAG_DAYS };
}

export function goldDriverAlignment(data) {
  if (!data || data.sym !== 'XAU/USD') return null;
  const momYield = data.momentum10y != null ? data.momentum10y < 0 : null;
  const momDxy   = data.momentumDxy != null ? data.momentumDxy < 0 : null;

  if (momYield === null && momDxy === null) return { status: 'NEUTRAL', label: 'No momentum data' };

  if (momYield === true  && momDxy === true)  return { status: 'ALIGNED_BULL',        label: 'Yields falling + DXY weakening — both channels bullish for Gold', cls: 'aligned' };
  if (momYield === false && momDxy === false) return { status: 'ALIGNED_BEAR',        label: 'Yields rising + DXY strengthening — both channels bearish for Gold', cls: 'opposed' };
  if (momYield === true  && momDxy === false) return { status: 'DIVERGING_YIELD_BULL',label: 'Yields falling (bullish) but DXY strengthening (bearish) — yield signal dominates in most regimes', cls: 'diverging' };
  if (momYield === false && momDxy === true)  return { status: 'DIVERGING_DXY_BULL',  label: 'DXY weakening (bullish) but yields rising (bearish) — watch for dollar-driven Gold move vs yield suppression', cls: 'diverging' };
  return { status: 'NEUTRAL', label: 'Mixed signals', cls: 'flat' };
}

// ── Render ───────────────────────────────────────────────────────────────────

export function renderCompassCard(data, quote) {
  const el = document.getElementById('compassCard');
  if (!el) return;

  if (!data) {
    el.innerHTML = `<div class="compass-loading">⏳ Loading yield spread data…</div>`;
    return;
  }

  const cfg    = COMPASS_CONFIG[S.currentPair.symbol];
  const regime = compassRegime(data, quote);
  const fvGap  = compassFairValue(data);
  const divergence = compassDivergence(data, S.currentPair.symbol);
  const digits = getDigits(S.currentPair.symbol);

  const z10  = zScore(data.spread10y.slice(-90));
  const z2   = zScore(data.spread2y.slice(-90));
  const isGoldChart = data.sym === 'XAU/USD';
  const zDxy = (isGoldChart && data.spreadDxy && data.spreadDxy.length > 10)
    ? zScore(data.spreadDxy.slice(-90)).map(p => ({ date: p.date, value: -p.value }))
    : [];

  const showS2  = S.compassMode === '2y'   || S.compassMode === 'both';
  const showS10 = S.compassMode === '10y'  || S.compassMode === 'both';
  const showDxy = isGoldChart && (S.compassMode === '2y' || S.compassMode === 'both');
  const showFX  = S.compassShowFX;
  const showDiv = S.compassShowDiv;

  // Build FX normalized line from daily OHLC (last 90 bars)
  let zFX = [];
  if (showFX) {
    const fxBars = filterTradingDays(S.ohlcData[data.sym]?.values);
    if (fxBars && fxBars.length >= 10) {
      const chron = [...fxBars].reverse().slice(-90);
      const fxPts = chron.map(b => ({ date: b.datetime.split(' ')[0], value: parseFloat(b.close) }));
      zFX = zScore(fxPts);
    }
  }

  // Regression-residual divergence z-series (price vs spread-implied fair value)
  const zDiv = showDiv && divergence?.residualSeries?.length ? divergence.residualSeries.slice(-90) : [];

  const allPoints = [
    ...(showS10 ? z10  : []),
    ...(showS2  ? (isGoldChart ? zDxy : z2) : []),
    ...(showFX  ? zFX : []),
    ...(showDiv ? zDiv : []),
  ];
  const yVals = allPoints.map(p => p.value);
  const yMin  = yVals.length ? Math.min(...yVals) - 0.3 : -2;
  const yMax  = yVals.length ? Math.max(...yVals) + 0.3 :  2;
  const yRange = [yMin, yMax];

  const nPts   = Math.max(z10.length, z2.length, zFX.length, 1);
  const W      = 600;
  const H      = 90;
  const xScale = W / Math.max(nPts - 1, 1);

  const fxScale  = zFX.length  > 1 ? W / Math.max(zFX.length  - 1, 1) : xScale;
  const divScale = zDiv.length > 1 ? W / Math.max(zDiv.length - 1, 1) : xScale;

  const path10y = showS10 ? buildSVGPath(z10,  xScale, null, H, yRange) : '';
  const path2y  = showS2  ? buildSVGPath(isGoldChart ? zDxy : z2, xScale, null, H, yRange) : '';
  const pathFX  = showFX  && zFX.length  > 1 ? buildSVGPath(zFX,  fxScale,  null, H, yRange) : '';
  const pathDiv = showDiv && zDiv.length  > 1 ? buildSVGPath(zDiv, divScale, null, H, yRange) : '';

  const ySpan    = yMax - yMin;
  const zeroY    = H - ((0 - yMin) / ySpan) * H;
  const zeroYClp = Math.max(0, Math.min(H, zeroY));

  const l10 = data.latest10y != null ? data.latest10y.toFixed(2) + '%' : '—';
  const l2  = data.latest2y  != null ? data.latest2y.toFixed(2)  + '%' : '—';
  const m10 = data.momentum10y != null ? (data.momentum10y > 0 ? '▲ +' : '▼ ') + data.momentum10y.toFixed(2) + '%' : '—';
  const m2  = data.momentum2y  != null ? (data.momentum2y  > 0 ? '▲ +' : '▼ ') + data.momentum2y.toFixed(2)  + '%' : '—';

  const fvPct  = fvGap != null ? Math.min(100, Math.abs(fvGap) * 25) : 0;
  const fvSign = fvGap != null && fvGap > 0 ? 'UNDERVALUED' : 'OVERVALUED';
  const fvCol  = fvGap != null && fvGap > 0 ? 'var(--green)' : 'var(--red)';

  el.innerHTML = `
    <div class="compass-hd">
      <div class="compass-title">📡 ${cfg.label} Yield Spread <span style="font-size:10px;color:var(--text3);font-weight:400">(normalized, 90d)</span></div>
      <div class="compass-toggles">
        <button class="ctog s2y ${S.compassMode==='2y'||S.compassMode==='both'?'active':''}" onclick="setCompassMode('2y')">${isGoldChart ? 'DXY' : '2Y'}</button>
        <button class="ctog s10y ${S.compassMode==='10y'||S.compassMode==='both'?'active':''}" onclick="setCompassMode('10y')">${isGoldChart ? '10Y Yield' : '10Y'}</button>
        <button class="ctog ${S.compassMode==='both'?'active':''}" onclick="setCompassMode('both')">Both</button>
        <button class="ctog ${S.compassShowFX?'active':''}" onclick="toggleCompassFX()" style="border-color:var(--blue-bd);${S.compassShowFX?'background:var(--blue-bg);color:var(--blue)':''}">FX Rate</button>
        <button class="ctog ${S.compassShowDiv?'active':''}" onclick="toggleCompassDiv()" style="border-color:var(--red-bd);${S.compassShowDiv?'background:var(--red-bg);color:var(--red)':''}" title="Regression residual: price - spread-implied fair value, z-scored">Divergence</button>
      </div>
    </div>

    <div class="compass-legend">
      ${showS10 ? '<div class="cl-item"><div class="cl-line" style="background:var(--purple)"></div><span>US 10Y yield (z, inverted)</span></div>' : ''}
      ${showS2  ? (isGoldChart
        ? '<div class="cl-item"><div class="cl-line" style="background:var(--amber)"></div><span>DXY (z, inverted — up = weak dollar)</span></div>'
        : '<div class="cl-item"><div class="cl-line" style="background:var(--green)"></div><span>2Y spread (z-score)</span></div>') : ''}
      ${showFX  ? '<div class="cl-item"><div class="cl-line" style="background:transparent;border-top:2px dashed var(--blue);height:0;margin-top:5px"></div><span>FX rate (z-score, 90d daily)</span></div>' : ''}
      ${showDiv ? '<div class="cl-item"><div class="cl-line" style="background:var(--red)"></div><span>Divergence (regression residual, z-score)</span></div>' : ''}
      <div class="cl-item"><div class="cl-line" style="background:var(--border2);height:1px"></div><span>Neutral</span></div>
    </div>

    <div class="compass-chart-wrap">
      <svg class="compass-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:90px">
        <line x1="0" y1="${zeroYClp.toFixed(1)}" x2="${W}" y2="${zeroYClp.toFixed(1)}"
              stroke="var(--border2)" stroke-width="1" stroke-dasharray="4,3"/>
        ${showS10 && path10y ? `
          <path d="${path10y}L${((nPts-1)*xScale).toFixed(1)},${zeroYClp.toFixed(1)}L0,${zeroYClp.toFixed(1)}Z"
                fill="var(--purple)" fill-opacity="0.07"/>
          <path d="${path10y}" stroke="var(--purple)" stroke-width="1.8" fill="none" stroke-linejoin="round"/>
        ` : ''}
        ${showS2 && path2y ? `
          <path d="${path2y}" stroke="${isGoldChart ? 'var(--amber)' : 'var(--green)'}" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-dasharray="5,3"/>
        ` : ''}
        ${showFX && pathFX ? `
          <path d="${pathFX}" stroke="var(--blue)" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-dasharray="3,2"/>
        ` : ''}
        ${showFX && zFX.length ? (() => {
          const lx = ((zFX.length-1)*fxScale).toFixed(1);
          const ly = Math.max(0,Math.min(H, H - ((zFX[zFX.length-1].value - yMin)/ySpan)*H)).toFixed(1);
          return `<circle cx="${lx}" cy="${ly}" r="3" fill="var(--blue)"/>`;
        })() : ''}
        ${showDiv && pathDiv ? `
          <path d="${pathDiv}" stroke="var(--red)" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
        ` : ''}
        ${showDiv && zDiv.length ? (() => {
          const lx = ((zDiv.length-1)*divScale).toFixed(1);
          const ly = Math.max(0,Math.min(H, H - ((zDiv[zDiv.length-1].value - yMin)/ySpan)*H)).toFixed(1);
          return `<circle cx="${lx}" cy="${ly}" r="3" fill="var(--red)"/>`;
        })() : ''}
        ${showS10 && z10.length ? (() => {
          const lx = ((z10.length-1)*xScale).toFixed(1);
          const ly = Math.max(0,Math.min(H, H - ((z10[z10.length-1].value - yMin)/ySpan)*H)).toFixed(1);
          return `<circle cx="${lx}" cy="${ly}" r="3" fill="var(--purple)"/>`;
        })() : ''}
        ${showS2 && (isGoldChart ? zDxy : z2).length ? (() => {
          const _arr = isGoldChart ? zDxy : z2;
          const lx = ((_arr.length-1)*xScale).toFixed(1);
          const ly = Math.max(0,Math.min(H, H - ((_arr[_arr.length-1].value - yMin)/ySpan)*H)).toFixed(1);
          return `<circle cx="${lx}" cy="${ly}" r="3" fill="${isGoldChart ? 'var(--amber)' : 'var(--green)'}"/>`;
        })() : ''}
      </svg>
    </div>

    <div class="compass-stats">
      <div class="cs-stat">
        <div class="cs-lbl">${isGoldChart ? 'US 10Y Yield' : '10Y Spread'}</div>
        <div class="cs-val" style="color:${isGoldChart ? (data.latest10y < 2 ? 'var(--green)' : 'var(--red)') : data.latest10y > 0 ? 'var(--green)' : 'var(--red)'}">${l10}</div>
        <div class="cs-sub">${isGoldChart ? 'lower = bullish gold' : cfg.label}</div>
      </div>
      <div class="cs-stat">
        <div class="cs-lbl">${isGoldChart ? 'DXY Level' : '2Y Spread'}</div>
        <div class="cs-val" style="color:${isGoldChart ? 'var(--amber)' : (data.latest2y != null && data.latest2y > 0 ? 'var(--green)' : 'var(--red)')}">${isGoldChart ? (data.latestDxy != null ? data.latestDxy.toFixed(2) : '—') : l2}</div>
        <div class="cs-sub">${isGoldChart ? 'lower = bullish gold' : cfg.label + ' (policy)'}</div>
      </div>
      <div class="cs-stat">
        <div class="cs-lbl">${isGoldChart ? 'Yield Mom' : '10Y Momentum'}</div>
        <div class="cs-val" style="font-size:11px;color:${data.momentum10y < 0 ? 'var(--green)' : data.momentum10y > 0 ? 'var(--red)' : 'var(--text3)'}">${m10}</div>
        <div class="cs-sub">${isGoldChart ? '5d (fall = bull)' : '5-day change'}</div>
      </div>
      <div class="cs-stat">
        <div class="cs-lbl">${isGoldChart ? 'DXY Mom' : '2Y Momentum'}</div>
        <div class="cs-val" style="font-size:11px;color:${isGoldChart ? (data.momentumDxy < 0 ? 'var(--green)' : data.momentumDxy > 0 ? 'var(--red)' : 'var(--text3)') : (data.momentum2y > 0 ? 'var(--green)' : data.momentum2y < 0 ? 'var(--red)' : 'var(--text3)')}">${isGoldChart ? (data.momentumDxy != null ? (data.momentumDxy > 0 ? 'rise +' : 'fall ') + Math.abs(data.momentumDxy).toFixed(2) : '—') : m2}</div>
        <div class="cs-sub">${isGoldChart ? '5d (fall = bull)' : '5-day change'}</div>
      </div>
    </div>

    ${isGoldChart ? (() => {
      const align = goldDriverAlignment(data);
      if (!align) return '';
      const alignCol = align.cls === 'aligned' ? (align.status === 'ALIGNED_BULL' ? 'var(--green-bd)' : 'var(--red-bd)') : 'var(--amber-bd)';
      const alignBg  = align.cls === 'aligned' ? (align.status === 'ALIGNED_BULL' ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--amber-bg)';
      return `<div style="padding:9px 11px;border-radius:7px;border:1.5px solid ${alignCol};background:${alignBg};margin-bottom:8px">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:3px">
          Gold Dual-Driver Alignment
        </div>
        <div style="font-size:11px;font-weight:600;color:var(--text);margin-bottom:2px">${align.status.replace(/_/g,' ')}</div>
        <div style="font-size:10.5px;color:var(--text2);line-height:1.45">${align.label}</div>
      </div>`;
    })() : ''}

    <div class="compass-regime ${regime.cls}">
      <div class="cr-icon">${regime.icon}</div>
      <div class="cr-body">
        <div class="cr-label">${regime.label}</div>
        <div class="cr-text">${regime.text}</div>
      </div>
    </div>

    ${fvGap != null ? `
    <div class="compass-fv">
      <span class="fv-label">Spread Lean</span>
      <div class="fv-bar-wrap">
        <div class="fv-bar" style="width:${fvPct}%;background:${fvCol}"></div>
      </div>
      <span class="fv-val" style="color:${fvCol}">${fvSign}</span>
    </div>
    <div style="font-size:9.5px;color:var(--text3);margin-top:4px;line-height:1.5">
      Weighted z-score of 2Y+10Y spreads only — the rate differential's own directional lean, before comparing to price. ${fvGap > 0.5 ? `⬆ Spread favours ${data.sym.split('/')[0]} strength` : fvGap < -0.5 ? `⬇ Spread favours ${data.sym.split('/')[0]} weakness` : 'Spread roughly neutral'}.
    </div>
    ` : ''}

    ${divergence != null ? (() => {
      const dz = divergence.z;
      const dzAbs = dz != null ? Math.abs(dz) : 0;
      const dPct = Math.min(100, dzAbs * 33);
      const rich = dz != null && dz > 0;
      const dCol = dzAbs >= 1.5 ? (rich ? 'var(--red)' : 'var(--green)') : 'var(--text3)';
      const pipSz = getPipSize(S.currentPair.symbol);
      const gapPips = divergence.gap != null && pipSz ? Math.abs(divergence.gap / pipSz).toFixed(0) : null;
      const verdict = dzAbs < 1 ? 'Price is tracking the spread closely — no meaningful divergence.'
        : rich ? `Price is running ${gapPips ? `~${gapPips}p ` : ''}rich vs what the spread implies — reversion risk skews lower.`
               : `Price is lagging ${gapPips ? `~${gapPips}p ` : ''}below what the spread implies — catch-up move skews higher.`;
      return `
    <div class="compass-fv" style="margin-top:6px">
      <span class="fv-label">Divergence</span>
      <div class="fv-bar-wrap">
        <div class="fv-bar" style="width:${dPct}%;background:${dCol}"></div>
      </div>
      <span class="fv-val" style="color:${dCol}">z ${dz != null ? (dz>0?'+':'') + dz.toFixed(2) : '—'}</span>
    </div>
    <div style="font-size:9.5px;color:var(--text3);margin-top:4px;line-height:1.5">
      Rolling regression of price on the spread lean (${divergence.n}d window, r²=${divergence.r2.toFixed(2)}), residual z-scored. ${verdict}
    </div>`;
    })() : ''}

    <div id="compassARMA"></div>
    <div id="compassTransition"></div>

    ${(() => {
      const vol = calculateVolRegime();
      if (!vol || !vol.dailyCapPips) return '';
      const fvPipAbs = (fvGap != null && window.fvGapToPips) ? Math.abs(window.fvGapToPips(fvGap, vol.atr, getPipSize(S.currentPair.symbol)) || 0).toFixed(0) : null;
      const fvDir    = fvGap != null ? (fvGap > 0 ? 'upside' : 'downside') : null;
      return `
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
          <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text3)">Vol Forecast</span>
          ${vol.garch ? `<span style="font-size:9px;font-weight:700;padding:1px 7px;border-radius:8px;background:var(--purple-bg);color:var(--purple);border:1px solid var(--purple-bd)">GARCH(1,1)</span>` : ''}
          ${vol.garch ? `<span style="font-size:9px;padding:1px 6px;border-radius:8px;background:var(--s2);color:var(--text3);border:1px solid var(--border)">${vol.garch.cluster}</span>` : ''}
        </div>

        ${vol.garch ? `
        <div style="position:relative;margin-bottom:10px">
          <div style="font-size:9px;color:var(--text3);margin-bottom:4px;display:flex;justify-content:space-between">
            <span>Daily range confidence bands</span>
            <span style="font-family:'DM Mono',monospace">σ = ${(vol.garch.sigmaAnnual || 0).toFixed(1)}% ann.</span>
          </div>
          <div style="background:rgba(139,92,246,0.12);border-radius:4px;height:28px;position:relative;overflow:hidden;border:1px solid var(--purple-bd)">
            <div style="position:absolute;top:0;bottom:0;left:${Math.max(0,50 - (vol.ci68Pips/vol.ci95Pips)*50).toFixed(1)}%;right:${Math.max(0,50 - (vol.ci68Pips/vol.ci95Pips)*50).toFixed(1)}%;background:rgba(139,92,246,0.25);border-radius:2px"></div>
            <div style="position:absolute;top:4px;bottom:4px;left:calc(50% - 1px);width:2px;background:var(--purple);border-radius:1px"></div>
            <div style="position:absolute;left:4px;top:50%;transform:translateY(-50%);font-size:9px;color:var(--purple);font-family:'DM Mono',monospace;font-weight:600">${vol.ci95Pips.toFixed(0)}p</div>
            <div style="position:absolute;left:50%;transform:translateX(-50%);top:50%;transform:translate(-50%,-50%);font-size:9px;color:var(--purple);font-weight:700;font-family:'DM Mono',monospace">${vol.garch.pips.toFixed(0)}p</div>
            <div style="position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:9px;color:var(--purple);font-family:'DM Mono',monospace;font-weight:600">${vol.ci95Pips.toFixed(0)}p</div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);margin-top:3px">
            <span>← 95% CI outer</span>
            <span style="color:var(--purple);font-weight:600">68% CI: ±${vol.ci68Pips.toFixed(0)}p</span>
            <span>95% CI outer →</span>
          </div>
        </div>
        <div style="font-size:10px;color:var(--text3);margin-bottom:8px;line-height:1.4">${vol.garch.clusterMsg}</div>
        ` : ''}

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:5px">
          <div style="background:var(--s2);border-radius:5px;padding:7px 8px;border:1px solid var(--border)">
            <div style="font-size:8.5px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.05em">EMA-ATR</div>
            <div style="font-size:13px;font-weight:700;font-family:'DM Mono',monospace;color:var(--text)">${vol.atrPips.toFixed(0)}p</div>
            <div style="font-size:8.5px;color:var(--text3)">12-day avg</div>
          </div>
          ${vol.garch ? `<div style="background:var(--purple-bg);border-radius:5px;padding:7px 8px;border:1px solid var(--purple-bd)">
            <div style="font-size:8.5px;color:var(--purple);font-weight:600;text-transform:uppercase;letter-spacing:.05em">GARCH</div>
            <div style="font-size:13px;font-weight:700;font-family:'DM Mono',monospace;color:var(--purple)">${vol.garch.pips.toFixed(0)}p</div>
            <div style="font-size:8.5px;color:var(--purple);opacity:.7">68%: ${vol.ci68Pips.toFixed(0)}p</div>
          </div>` : '<div></div>'}
          <div style="background:var(--s2);border-radius:5px;padding:7px 8px;border:1px solid var(--border)">
            <div style="font-size:8.5px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.05em">Used</div>
            <div style="font-size:13px;font-weight:700;font-family:'DM Mono',monospace;color:${vol.usedPct > 75 ? 'var(--red)' : 'var(--amber)'}">${vol.usedRangePips.toFixed(0)}p</div>
            <div style="font-size:8.5px;color:var(--text3)">${vol.usedPct}% of cap</div>
          </div>
          <div style="background:var(--s2);border-radius:5px;padding:7px 8px;border:1px solid var(--border)">
            <div style="font-size:8.5px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.05em">Left</div>
            <div style="font-size:13px;font-weight:700;font-family:'DM Mono',monospace;color:${vol.usedPct > 75 ? 'var(--red)' : 'var(--green)'}">${vol.remainingPips.toFixed(0)}p</div>
            <div style="font-size:8.5px;color:var(--text3)">68% CI cap</div>
          </div>
        </div>
        ${fvPipAbs ? `<div style="font-size:10px;color:var(--text3);margin-top:6px;padding:6px 8px;background:var(--s2);border-radius:5px;border:1px solid var(--border)">
          FV gap ≈ <strong style="color:${fvGap > 0 ? 'var(--green)' : 'var(--red)'}">${fvPipAbs}p ${fvDir}</strong> vs
          68% CI cap <strong>${vol.ci68Pips ? vol.ci68Pips.toFixed(0) : vol.atrPips.toFixed(0)}p</strong> —
          ${parseFloat(fvPipAbs) > (vol.ci68Pips || vol.atrPips)
            ? '<span style="color:var(--amber)">⚠ gap exceeds 68% daily range — likely multi-day catch-up</span>'
            : parseFloat(fvPipAbs) > (vol.ci68Pips || vol.atrPips) * 0.5
            ? '<span style="color:var(--text2)">gap is achievable today in good conditions</span>'
            : '<span style="color:var(--green)">gap is comfortably within today\'s range</span>'}
        </div>` : ''}
      </div>`;
    })()}
  `;
}

// ── Yield Pulse ──────────────────────────────────────────────────────────────

// Which two yield legs to display per pair, and which direction spread widening favours.
// fxSign: +1 = legA-legB spread widening is bullish for pair, -1 = bearish.
const YIELD_DISPLAY = {
  'EUR/USD':    { legA: 'us10y', legB: 'de10y', aLbl: 'US 10Y', bLbl: 'DE 10Y', fxSign: -1 },
  'GBP/USD':    { legA: 'gb10y', legB: 'us10y', aLbl: 'GB 10Y', bLbl: 'US 10Y', fxSign: +1 },
  'USD/JPY':    { legA: 'us10y', legB: 'jp10y', aLbl: 'US 10Y', bLbl: 'JP 10Y', fxSign: +1 },
  'AUD/USD':    { legA: 'au10y', legB: 'us10y', aLbl: 'AU 10Y', bLbl: 'US 10Y', fxSign: +1 },
  'USD/CAD':    { legA: 'us10y', legB: 'ca10y', aLbl: 'US 10Y', bLbl: 'CA 10Y', fxSign: +1 },
  'USD/CHF':    { legA: 'us10y', legB: 'ch10y', aLbl: 'US 10Y', bLbl: 'CH 10Y', fxSign: +1 },
  'EUR/GBP':    { legA: 'gb10y', legB: 'de10y', aLbl: 'GB 10Y', bLbl: 'DE 10Y', fxSign: -1 },
  'GBP/JPY':    { legA: 'gb10y', legB: 'jp10y', aLbl: 'GB 10Y', bLbl: 'JP 10Y', fxSign: +1 },
  'XAU/USD':    { legA: 'us10y', legB: 'us2y',  aLbl: 'US 10Y', bLbl: 'US 2Y',  fxSign: -1 },
  'NAS100_USD': { legA: 'us10y', legB: 'us2y',  aLbl: 'US 10Y', bLbl: 'US 2Y',  fxSign: -1 },
};

export function renderYieldPulse(sym) {
  const el = document.getElementById('yieldPulseCard');
  if (!el) return;

  const cfg = YIELD_DISPLAY[sym];
  if (!cfg) { el.innerHTML = ''; return; }

  const raw = S.compassData[sym]?.rawYields;

  // For the equity branch rawYields is absent — fall back to S.fredData scalars
  const getYield = (key) => {
    if (raw?.[key]) return raw[key];
    const fd = S.fredData?.[key];
    if (fd?.value != null) return { latest: fd.value, prev: fd.prev ?? null, date: null };
    return null;
  };

  const legA = getYield(cfg.legA);
  const legB = getYield(cfg.legB);
  if (!legA || !legB) { el.innerHTML = ''; return; }

  const aVal = legA.latest;
  const bVal = legB.latest;
  const spread    = aVal - bVal;
  const aChg      = legA.prev != null ? (aVal - legA.prev) * 100 : null;
  const bChg      = legB.prev != null ? (bVal - legB.prev) * 100 : null;
  const spreadChg = (aChg != null && bChg != null) ? aChg - bChg : null;

  // Positive spreadChg bullish when fxSign > 0, bearish when fxSign < 0
  const spreadBull = spreadChg != null ? (cfg.fxSign > 0 ? spreadChg > 0 : spreadChg < 0) : null;

  const fmtBps = v => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + ' bps';
  const fmtPct = v => v == null ? '—' : v.toFixed(2) + '%';
  const bpsColor = (v, positiveIsGood) => {
    if (v == null) return 'var(--text3)';
    return (v > 0) === positiveIsGood ? 'var(--green)' : 'var(--red)';
  };

  const spreadColor = spreadBull == null ? 'var(--text3)' : spreadBull ? 'var(--green)' : 'var(--red)';
  const spreadIcon  = spreadBull == null ? '▸' : spreadBull ? '▲' : '▼';
  const baseCcy     = sym.split('/')[0];
  const interpText  = spreadBull == null
    ? 'Spread direction unclear — insufficient history'
    : spreadBull
    ? `Spread shifting in favour of ${baseCcy} — yield tailwind`
    : `Spread shifting against ${baseCcy} — yield headwind`;

  const dateNote = legA.date ? `FRED · last obs ${legA.date}` : 'FRED data';

  el.innerHTML = `
    <div style="padding:12px 14px 10px;background:var(--card);border:1px solid var(--border);border-radius:10px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3)">📈 Yield Pulse</span>
        <span style="font-size:9px;padding:1px 7px;border-radius:8px;background:var(--s2);color:var(--text3);border:1px solid var(--border)">${sym}</span>
        <span style="font-size:9px;color:var(--text3);margin-left:auto">Daily obs · not real-time</span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px">
        <div style="background:var(--s2);border-radius:7px;padding:8px 10px;border:1px solid var(--border)">
          <div style="font-size:8.5px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">${cfg.aLbl}</div>
          <div style="font-size:14px;font-weight:700;font-family:'DM Mono',monospace;color:var(--text)">${fmtPct(aVal)}</div>
          <div style="font-size:10px;font-weight:600;color:${bpsColor(aChg, cfg.fxSign > 0)}">${fmtBps(aChg)}</div>
        </div>
        <div style="background:var(--s2);border-radius:7px;padding:8px 10px;border:1px solid var(--border)">
          <div style="font-size:8.5px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">${cfg.bLbl}</div>
          <div style="font-size:14px;font-weight:700;font-family:'DM Mono',monospace;color:var(--text)">${fmtPct(bVal)}</div>
          <div style="font-size:10px;font-weight:600;color:${bpsColor(bChg, cfg.fxSign < 0)}">${fmtBps(bChg)}</div>
        </div>
        <div style="background:var(--s2);border-radius:7px;padding:8px 10px;border:1px solid var(--border);${spreadBull != null ? 'border-color:' + spreadColor : ''}">
          <div style="font-size:8.5px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Spread</div>
          <div style="font-size:14px;font-weight:700;font-family:'DM Mono',monospace;color:${spreadColor}">${spreadIcon} ${Math.abs(spread).toFixed(2)}%</div>
          <div style="font-size:10px;font-weight:600;color:${spreadColor}">${fmtBps(spreadChg)}</div>
        </div>
      </div>

      <div style="font-size:10.5px;color:${spreadColor};line-height:1.4;padding:6px 8px;background:var(--s2);border-radius:6px;border-left:3px solid ${spreadColor}">
        ${interpText}
      </div>
      <div style="font-size:8.5px;color:var(--text3);margin-top:5px;text-align:right">${dateNote}</div>
    </div>`;
}

// ── Mode toggle ──────────────────────────────────────────────────────────────
// Breaks circular dep: calls window.renderSignalAndEntries / window.renderARMAAndTransition
// which are assigned in main.js after all modules load.

export function toggleCompassFX() {
  S.compassShowFX = !S.compassShowFX;
  const data = S.compassData[S.currentPair.symbol];
  renderCompassCard(data, window._latestQuote);
  if (window.renderARMAAndTransition) window.renderARMAAndTransition(data);
}

export function toggleCompassDiv() {
  S.compassShowDiv = !S.compassShowDiv;
  const data = S.compassData[S.currentPair.symbol];
  renderCompassCard(data, window._latestQuote);
  if (window.renderARMAAndTransition) window.renderARMAAndTransition(data);
}

export function setCompassMode(mode) {
  if (mode === 'both') {
    S.compassMode = 'both';
  } else if (S.compassMode === mode) {
    S.compassMode = 'both';
  } else if (S.compassMode === 'both') {
    S.compassMode = mode;
  } else {
    S.compassMode = 'both';
  }
  const data = S.compassData[S.currentPair.symbol];
  renderCompassCard(data, window._latestQuote);
  if (window.renderARMAAndTransition) window.renderARMAAndTransition(data);
}

// ── Equity Risk Appetite Gauge ───────────────────────────────────────────────

function renderEquityRiskGauge() {
  const f     = S.fredData || {};
  const vix   = f.vix?.value   ?? null;
  const hy    = f.hy?.value    ?? null;
  const tips  = f.tips?.value  ?? null;
  const nfci  = f.nfci?.value  ?? null;
  const us10y = f.us10y?.value ?? null;
  const us2y  = f.us2y?.value  ?? null;

  const factors = [];

  // VIX
  if (vix != null) {
    let pct, col;
    if      (vix < 15) { pct = 95; col = 'var(--green)'; }
    else if (vix < 20) { pct = 75; col = 'var(--green)'; }
    else if (vix < 25) { pct = 50; col = 'var(--amber)'; }
    else if (vix < 35) { pct = 25; col = 'var(--red)'; }
    else               { pct = 5;  col = 'var(--red)'; }
    factors.push({ label: 'VIX', val: vix.toFixed(1), pct, col, src: 'VIXCLS' });
  } else {
    factors.push({ label: 'VIX', val: 'No data', pct: null, col: 'var(--text3)', src: 'VIXCLS' });
  }

  // HY credit spread
  if (hy != null) {
    let pct, col;
    if      (hy < 300) { pct = 90; col = 'var(--green)'; }
    else if (hy < 400) { pct = 65; col = 'var(--amber)'; }
    else if (hy < 500) { pct = 35; col = 'var(--amber)'; }
    else               { pct = 10; col = 'var(--red)'; }
    factors.push({ label: 'HY Spread', val: `${hy.toFixed(0)}bps`, pct, col, src: 'OAS' });
  } else {
    factors.push({ label: 'HY Spread', val: 'No data', pct: null, col: 'var(--text3)', src: 'OAS' });
  }

  // Real yield (TIPS)
  if (tips != null) {
    let pct, col;
    if      (tips < 0)   { pct = 90; col = 'var(--green)'; }
    else if (tips < 1.5) { pct = 60; col = 'var(--amber)'; }
    else if (tips < 2.5) { pct = 30; col = 'var(--amber)'; }
    else                 { pct = 5;  col = 'var(--red)'; }
    factors.push({ label: 'Real Yield', val: `${tips.toFixed(2)}%`, pct, col, src: 'DFII10' });
  } else {
    factors.push({ label: 'Real Yield', val: 'No data', pct: null, col: 'var(--text3)', src: 'DFII10' });
  }

  // NFCI
  if (nfci != null) {
    let pct, col;
    if      (nfci < -0.5) { pct = 90; col = 'var(--green)'; }
    else if (nfci < 0)    { pct = 65; col = 'var(--amber)'; }
    else if (nfci < 0.5)  { pct = 35; col = 'var(--amber)'; }
    else                  { pct = 10; col = 'var(--red)'; }
    factors.push({ label: 'NFCI', val: nfci.toFixed(2), pct, col, src: 'NFCI' });
  } else {
    factors.push({ label: 'NFCI', val: 'No data', pct: null, col: 'var(--text3)', src: 'NFCI' });
  }

  // Yield curve (10Y − 2Y)
  if (us10y != null && us2y != null) {
    const curve = us10y - us2y;
    let pct, col;
    if      (curve >  1.0) { pct = 95; col = 'var(--green)'; }
    else if (curve >  0.5) { pct = 75; col = 'var(--green)'; }
    else if (curve >  0.0) { pct = 55; col = 'var(--amber)'; }
    else if (curve > -0.5) { pct = 30; col = 'var(--amber)'; }
    else                   { pct = 10; col = 'var(--red)'; }
    const sign = curve >= 0 ? '+' : '';
    factors.push({ label: 'Yield Curve', val: `${sign}${curve.toFixed(2)}%`, pct, col, src: 'GS10−GS2' });
  } else {
    factors.push({ label: 'Yield Curve', val: 'No data', pct: null, col: 'var(--text3)', src: 'GS10−GS2' });
  }

  const live = factors.filter(x => x.pct != null);
  const composite = live.length ? Math.round(live.reduce((s, x) => s + x.pct, 0) / live.length) : null;

  const gaugeLabel = composite == null ? 'NO DATA' :
    composite >= 80 ? 'GREED' :
    composite >= 60 ? 'RISK-ON' :
    composite >= 40 ? 'NEUTRAL' :
    composite >= 20 ? 'CAUTION' : 'FEAR';

  const gaugeCol = composite == null ? 'var(--text3)' :
    composite >= 60 ? 'var(--green)' :
    composite >= 40 ? 'var(--amber)' : 'var(--red)';

  const factorRows = factors.map(x => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <div style="width:76px;font-size:10px;font-weight:600;color:var(--text2);flex-shrink:0">${x.label}</div>
      <div style="flex:1;background:var(--border);border-radius:3px;height:5px;overflow:hidden">
        ${x.pct != null
          ? `<div style="width:${x.pct}%;height:100%;background:${x.col};border-radius:3px;transition:width .5s"></div>`
          : `<div style="width:100%;height:100%;background:repeating-linear-gradient(90deg,var(--border2) 0,var(--border2) 4px,transparent 4px,transparent 8px)"></div>`}
      </div>
      <div style="width:68px;text-align:right;font-size:10px;color:${x.pct != null ? 'var(--text)' : 'var(--text3)'}">${x.val}</div>
      <div style="width:48px;text-align:right;font-size:9px;color:var(--text3);font-family:'DM Mono',monospace">${x.src}</div>
    </div>`).join('');

  return `
    <div class="compass-hd">
      <div class="compass-title">📡 Risk Appetite Gauge
        <span style="font-size:10px;color:var(--text3);font-weight:400;margin-left:4px">NAS100</span>
      </div>
    </div>

    <div style="margin-bottom:14px">
      <div style="position:relative;height:20px;border-radius:10px;overflow:hidden;
                  background:linear-gradient(90deg,#c0392b 0%,#e67e22 25%,#f39c12 45%,#27ae60 75%,#1a6b3a 100%)">
        ${composite != null ? `<div style="position:absolute;top:0;left:${composite}%;transform:translateX(-50%);
            width:3px;height:100%;background:#fff;box-shadow:0 0 5px rgba(0,0,0,.6)"></div>` : ''}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);margin-top:3px;padding:0 2px">
        <span>FEAR</span><span>CAUTION</span><span>NEUTRAL</span><span>RISK-ON</span><span>GREED</span>
      </div>
      <div style="text-align:center;margin-top:8px">
        <span style="font-size:22px;font-weight:700;color:${gaugeCol};line-height:1">${composite != null ? composite : '—'}</span>
        <span style="font-size:11px;color:var(--text3)"> / 100</span>
        <span style="margin-left:10px;font-size:13px;font-weight:700;color:${gaugeCol}">${gaugeLabel}</span>
      </div>
    </div>

    <div style="border-top:1px solid var(--border);padding-top:10px">
      ${factorRows}
    </div>

    <div style="font-size:9px;color:var(--text3);text-align:right;margin-top:4px">
      ${live.length}/${factors.length} factors live · FRED data
    </div>

    <div id="compassARMA"></div>
    <div id="compassTransition"></div>`;
}

// ── Load + render orchestration ──────────────────────────────────────────────

export async function loadAndRenderCompass() {
  const el = document.getElementById('compassCard');
  if (!el) return;

  if (S.currentPair.isEquity) {
    // Load yield curve history for gauge scalars + ARMA model.
    // GS10/GS2 are monthly series so 90 obs ≈ 7 years — enough for ARMA.
    const eqCached = S.compassData['NAS100_USD'];
    const needsFetch = !eqCached || (Date.now() - eqCached.ts) > COMPASS_TTL;
    const needsScalars = S.fredData && (S.fredData.us10y?.value == null || S.fredData.us2y?.value == null);

    if (needsFetch || needsScalars) {
      try {
        const r = await fetch('/api/fredhistory?keys=us2y,us10y');
        if (r.ok) {
          const h = await r.json();
          if (S.fredData) {
            if (h.us10y?.length) { const pts = h.us10y; S.fredData.us10y = { value: pts[pts.length-1].value, prev: pts[pts.length-2]?.value ?? null }; }
            if (h.us2y?.length)  { const pts = h.us2y;  S.fredData.us2y  = { value: pts[pts.length-1].value, prev: pts[pts.length-2]?.value ?? null }; }
          }
          if (needsFetch && h.us10y?.length && h.us2y?.length) {
            const us2Map = {};
            h.us2y.forEach(p => { us2Map[p.date] = p.value; });
            const curve = h.us10y.filter(p => us2Map[p.date] != null).map(p => ({ date: p.date, value: p.value - us2Map[p.date] }));
            const n = curve.length;
            S.compassData['NAS100_USD'] = {
              ts: Date.now(), sym: 'NAS100_USD',
              spread10y: curve, spread2y: [], spreadDxy: [],
              latest10y: n ? curve[n-1].value : null, latest2y: null, latestDxy: null,
              momentum10y: n >= 6 ? curve[n-1].value - curve[n-6].value : null, momentum2y: null, momentumDxy: null,
            };
          }
        }
      } catch(e) {}
    }

    el.innerHTML = renderEquityRiskGauge();
    renderYieldPulse('NAS100_USD');
    if (window.renderARMAAndTransition) window.renderARMAAndTransition(S.compassData['NAS100_USD'] || null);

    const q   = window._latestQuote;
    const vol = calculateVolRegime();
    const piv = calculatePivots();
    const as  = S.asiaRangeData[S.currentPair.symbol] || { today:null, yesterday:null, confluences:[] };
    const mo  = S.mondayRangeData[S.currentPair.symbol] || { current:null, previous:null, confluences:[] };
    if (q && S.fredData) {
      const td   = calculateTierScores();
      const bias = td.totalScore > 4 ? 'LONG' : td.totalScore < -4 ? 'SHORT' : 'NEUTRAL';
      const all  = [...(as.confluences||[]).map(c=>({...c,source:'asia'})), ...(mo.confluences||[]).map(c=>({...c,source:'monday'}))];
      const filt = filterConfluences(all);
      const enh  = enhanceConfluences(filt, q.price, bias, piv, vol, td.totalScore);
      if (window.renderSignalAndEntries) window.renderSignalAndEntries(enh, piv, as, mo, q, vol);
    }
    return;
  }

  if (!S.compassData[S.currentPair.symbol]) {
    el.innerHTML = '<div class="compass-loading">⏳ Loading yield spread history…</div>';
  } else {
    renderCompassCard(S.compassData[S.currentPair.symbol], window._latestQuote);
  }

  const data = await loadCompassData(S.currentPair.symbol);
  renderCompassCard(data, window._latestQuote);
  renderYieldPulse(S.currentPair.symbol);
  if (window.renderARMAAndTransition) window.renderARMAAndTransition(data);

  const q   = window._latestQuote;
  const vol = calculateVolRegime();
  const piv = calculatePivots();
  const as  = S.asiaRangeData[S.currentPair.symbol] || { today:null, yesterday:null, confluences:[] };
  const mo  = S.mondayRangeData[S.currentPair.symbol] || { current:null, previous:null, confluences:[] };

  if (q && S.fredData) {
    const td   = calculateTierScores();
    const bias = td.totalScore > 4 ? 'LONG' : td.totalScore < -4 ? 'SHORT' : 'NEUTRAL';
    const all  = [...(as.confluences||[]).map(c=>({...c,source:'asia'})), ...(mo.confluences||[]).map(c=>({...c,source:'monday'}))];
    const filt = filterConfluences(all);
    const enh  = enhanceConfluences(filt, q.price, bias, piv, vol, td.totalScore);
    if (window.renderSignalAndEntries) window.renderSignalAndEntries(enh, piv, as, mo, q, vol);
  }
}
