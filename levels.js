// levels.js — server-side Fibonacci confluence level computation (v2)
//
// Every REFRESH_LEVELS_MS (30 min), refreshAllPairs():
//   1. Fetches OANDA M5 + M30 + D bars per pair
//   2. Extracts Asia and Monday sessions, detects Fib confluences via confluence-core.js
//      (respects confluencePriceMode + clusterMerge from KV caps config)
//   3. For each entry computes:
//        – HMM regime from last 60 daily log-returns
//        – ADX from 30m bars
//        – Swing regime (CHoCH/BOS) from 30m bars
//        – TWAP slope from recent 5m bars
//        – EMA20/50 + RSI14 from daily bars
//        – Hurst exponent from daily closes
//        – Weekly pivot levels (PP/R1/R2/S1/S2)
//        – Optional FRED macro data (VIX, HY, NFCI, yields) if FRED_KEY is set
//   4. Computes a signal score (0–100) and trade grade (A+/A/B/C/SKIP)
//   5. Writes rich ai_entries_{PAIR} to KV — same shape as browser entries
//
// Env vars required: OANDA_KEY  (+ OANDA_ENV, OANDA_ACCOUNT_ID)
// Env vars optional: FRED_KEY   (enables macro tier enrichment)

import * as kv from './kv.js';
import { fitHMM, hmmSignalScore, compute30mSwingRegime } from './hmm.js';
import { gradeEntry } from './js/trade-grade.js';
import { detectConfluencesCore } from './js/confluence-core.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const FIB_LEVELS = [
  -9.5,-9,-8.5,-8,-7.5,-7,-6.5,-6,-5.5,-5,-4.5,-4,-3.5,-3,-2.5,-2,-1.5,-1,
  -0.5,-0.25, 0, 0.25,0.5,0.75,
  1,1.25,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10,10.5
];

const CAP_DEFAULTS_SERVER = {
  confluencePriceMode: 'midpoint',
  clusterMerge: true,
  fx:     { confluencePips: 2,   mergeFactor: 0.30 },
  gold:   { confluencePips: 200, mergeFactor: 0.30 },
  nas100: { confluencePips: 100, mergeFactor: 0.30 },
};

function getPipSize(sym) {
  if (sym.includes('JPY'))                          return 0.01;
  if (sym.includes('XAU') || sym.includes('GOLD')) return 0.1;
  if (sym === 'NAS100_USD')                         return 1.0;
  return 0.0001;
}

function getDigits(sym) {
  if (sym.includes('JPY'))                          return 3;
  if (sym.includes('XAU') || sym.includes('GOLD')) return 2;
  if (sym === 'NAS100_USD')                         return 1;
  return 5;
}

function getCapBucket(sym, caps) {
  const c = caps ?? CAP_DEFAULTS_SERVER;
  if (sym.includes('XAU') || sym.includes('GOLD')) return c.gold ?? CAP_DEFAULTS_SERVER.gold;
  if (sym === 'NAS100_USD')                         return c.nas100 ?? CAP_DEFAULTS_SERVER.nas100;
  return c.fx ?? CAP_DEFAULTS_SERVER.fx;
}

// ── Caps loader ───────────────────────────────────────────────────────────────

async function loadCaps() {
  try {
    const raw = await kv.get('caps');
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

// ── Bar helpers ───────────────────────────────────────────────────────────────

function barLondonHour(bar) {
  const dt = bar.datetime;
  return dt.length >= 13 ? parseInt(dt.substring(11, 13), 10) : 0;
}

function barLondonDay(bar) {
  const datePart = bar.datetime.length >= 10 ? bar.datetime.substring(0, 10) : bar.datetime;
  return new Date(datePart + 'T12:00:00Z').getUTCDay();
}

const bH = b => parseFloat(b.high);
const bL = b => parseFloat(b.low);
const bC = b => parseFloat(b.close);
const bO = b => parseFloat(b.open);

// ── OANDA fetch + bar conversion ──────────────────────────────────────────────

function convertBars(candles) {
  return candles
    .filter(c => c.complete !== false)
    .map(c => ({
      datetime: new Date(c.time)
        .toLocaleString('sv-SE', { timeZone: 'Europe/London' })
        .substring(0, 19),
      open:  c.mid.o,
      high:  c.mid.h,
      low:   c.mid.l,
      close: c.mid.c,
    }));
}

function oandaBase() {
  return (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com';
}

async function fetchOandaBars(sym, granularity, count) {
  const instrument = sym.replace('/', '_');
  const url = `${oandaBase()}/v3/instruments/${encodeURIComponent(instrument)}/candles?count=${count}&granularity=${granularity}&price=M`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`OANDA ${sym} ${granularity}: ${r.status}`);
  const d = await r.json();
  return convertBars(d.candles || []);
  // Bars are returned OLDEST-FIRST (ascending time) from OANDA REST API
}

// ── FRED fetch (optional, requires FRED_KEY env var) ─────────────────────────

async function fetchFredLatest(seriesId) {
  if (!process.env.FRED_KEY) return null;
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${process.env.FRED_KEY}&file_type=json&sort_order=desc&limit=2`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    const obs = (d.observations ?? []).filter(o => o.value !== '.' && o.value !== 'NA');
    if (!obs.length) return null;
    return { current: parseFloat(obs[0].value), prev: parseFloat(obs[1]?.value ?? obs[0].value) };
  } catch {
    return null;
  }
}

export async function fetchGlobalMacro() {
  if (!process.env.FRED_KEY) return null;
  // Read from the pre-populated fred_data_v3 KV cache written by refreshFredDashboard().
  // This avoids 5 concurrent FRED API requests on every 30-min levels refresh, which
  // competed with the sequential startup refresh and caused rate-limit failures.
  try {
    const raw = await kv.get('fred_data_v3');
    if (raw) {
      const { d } = JSON.parse(raw);
      if (d) {
        const toVal = k => d[k]?.value != null ? { current: d[k].value, prev: d[k].prev ?? d[k].value } : null;
        return { vix: toVal('vix'), hy: toVal('hy'), nfci: toVal('nfci'), gs10: toVal('us10y'), gs2: toVal('us2y') };
      }
    }
  } catch {}
  // KV empty (server refresh still in progress) — skip macro enrichment this cycle.
  return null;
}

// ── Fibonacci computation ─────────────────────────────────────────────────────

function computeBodyRange(bars) {
  if (!bars?.length) return null;
  let bodyHigh = -Infinity, bodyLow = Infinity;
  for (const bar of bars) {
    const o = parseFloat(bar.open), c = parseFloat(bar.close);
    bodyHigh = Math.max(bodyHigh, Math.max(o, c));
    bodyLow  = Math.min(bodyLow,  Math.min(o, c));
  }
  return { high: bodyHigh, low: bodyLow, range: bodyHigh - bodyLow, barCount: bars.length };
}

function projectFibLevels(range) {
  if (!range) return [];
  return FIB_LEVELS.map(fib => ({ fib, price: range.low + range.range * fib }));
}

// ── Session extraction ────────────────────────────────────────────────────────

function extractAsiaSessions(bars5m) {
  const sessionsByDate = {};
  for (const bar of bars5m) {
    const hour = barLondonHour(bar);
    if (hour < 0 || hour >= 6) continue;
    const dateKey = bar.datetime.substring(0, 10);
    const dow     = new Date(dateKey + 'T12:00:00Z').getUTCDay();
    if (dow === 0 || dow === 6) continue;
    (sessionsByDate[dateKey] ??= []).push(bar);
  }
  return Object.entries(sessionsByDate)
    .filter(([, bars]) => bars.length >= 36)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, bars]) => ({ date, bars }));
}

function extractMondaySessions(bars30m) {
  const weekData = {};
  for (const bar of bars30m) {
    if (barLondonDay(bar) !== 1) continue;
    const dateKey = bar.datetime.substring(0, 10);
    (weekData[dateKey] ??= []).push(bar);
  }
  const sorted = Object.entries(weekData)
    .filter(([, bars]) => bars.length >= 20)
    .sort(([a], [b]) => b.localeCompare(a));
  const londonWeekday = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', weekday: 'short',
  }).formatToParts(new Date()).find(p => p.type === 'weekday')?.value;
  const startIdx = (londonWeekday === 'Mon' && sorted.length >= 2) ? 1 : 0;
  return sorted.slice(startIdx).map(([date, bars]) => ({ date, bars }));
}

// ── EMA-ATR ───────────────────────────────────────────────────────────────────

function computeEmaAtr(bars30m) {
  if (!bars30m || bars30m.length < 2) return null;
  const alpha = 0.15;
  const chron = [...bars30m].reverse();
  let ema = Math.abs(parseFloat(chron[1].high) - parseFloat(chron[1].low));
  for (let i = 2; i < Math.min(chron.length, 120); i++) {
    const h  = parseFloat(chron[i].high);
    const l  = parseFloat(chron[i].low);
    const pc = parseFloat(chron[i - 1].close);
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    if (isFinite(tr) && tr > 0) ema = alpha * tr + (1 - alpha) * ema;
  }
  return isFinite(ema) && ema > 0 ? ema : null;
}

// ── Pure math helpers (ported from range-bias.js / macro.js, no browser deps) ─

// ADX — expects bars in OLDEST-FIRST order (as returned by OANDA REST API)
function computeADX(bars, period = 14) {
  if (bars.length < period + 2) return null;
  const plusDM = [], minusDM = [], tr = [];
  for (let i = 1; i < bars.length; i++) {
    const h  = bH(bars[i]), l = bL(bars[i]), pc = bC(bars[i - 1]);
    const ph = bH(bars[i - 1]), pl = bL(bars[i - 1]);
    const up = h - ph, dn = pl - l;
    plusDM.push(up > dn && up > 0 ? up : 0);
    minusDM.push(dn > up && dn > 0 ? dn : 0);
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const smooth = (arr) => {
    let val = arr.slice(0, period).reduce((s, x) => s + x, 0);
    const out = [val];
    for (let i = period; i < arr.length; i++) { val = val - val / period + arr[i]; out.push(val); }
    return out;
  };
  const sTR = smooth(tr), sPDM = smooth(plusDM), sMDM = smooth(minusDM);
  const pDI = sPDM.map((v, i) => sTR[i] > 0 ? (v / sTR[i]) * 100 : 0);
  const mDI = sMDM.map((v, i) => sTR[i] > 0 ? (v / sTR[i]) * 100 : 0);
  const dx  = pDI.map((v, i) => { const s = v + mDI[i]; return s > 0 ? Math.abs(v - mDI[i]) / s * 100 : 0; });
  let adx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dx.length; i++) adx = (adx * (period - 1) + dx[i]) / period;
  return { adx, plusDI: pDI[pDI.length - 1], minusDI: mDI[mDI.length - 1] };
}

// Hurst exponent via R/S analysis — expects array of close prices (any order)
function computeHurst(closes) {
  const n = closes.length;
  if (n < 8) return 0.5;
  const lags = [2, 4, 8, 16].filter(l => l < n / 2);
  if (!lags.length) return 0.5;
  const logLags = [], logRS = [];
  for (const lag of lags) {
    const chunks = [];
    for (let start = 0; start + lag <= n; start += lag) {
      const sub  = closes.slice(start, start + lag);
      const mean = sub.reduce((a, b) => a + b, 0) / lag;
      let cum = 0;
      const cumDev = sub.map(v => { cum += v - mean; return cum; });
      const range = Math.max(...cumDev) - Math.min(...cumDev);
      const std   = Math.sqrt(sub.reduce((s, v) => s + (v - mean) ** 2, 0) / lag);
      if (std > 0) chunks.push(range / std);
    }
    if (chunks.length) {
      logLags.push(Math.log(lag));
      logRS.push(Math.log(chunks.reduce((a, b) => a + b, 0) / chunks.length));
    }
  }
  if (logLags.length < 2) return 0.5;
  const n2    = logLags.length;
  const meanX = logLags.reduce((a, b) => a + b, 0) / n2;
  const meanY = logRS.reduce((a, b) => a + b, 0) / n2;
  const num   = logLags.reduce((s, x, i) => s + (x - meanX) * (logRS[i] - meanY), 0);
  const den   = logLags.reduce((s, x) => s + (x - meanX) ** 2, 0);
  return den > 0 ? Math.max(0, Math.min(1, num / den)) : 0.5;
}

// EMA helper (oldest-first prices)
function ema(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let e = prices.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < prices.length; i++) e = prices[i] * k + e * (1 - k);
  return e;
}

// ── Range bias features (server-side subset, OLDEST-FIRST bars) ───────────────

// Feature 1: ADX regime (from 30m bars, oldest-first)
function featureADX(bars30m, entryDir) {
  if (!bars30m || bars30m.length < 40) return { signal: null, key: 'adx', val: 'ADX: need 40+ bars' };
  const res = computeADX(bars30m.slice(-200), 14);
  if (!res) return { signal: null, key: 'adx', val: 'ADX: insufficient' };
  const { adx, plusDI, minusDI } = res;
  const opposite = entryDir === 'long' ? 'short' : 'long';
  if (adx < 20) return { signal: entryDir,  key: 'adx', val: `ADX ${adx.toFixed(1)} range-bound` };
  if (adx > 28) return { signal: opposite,  key: 'adx', val: `ADX ${adx.toFixed(1)} trending` };
  const trendUp  = plusDI > minusDI;
  const aligned  = (entryDir === 'long' && trendUp) || (entryDir === 'short' && !trendUp);
  return { signal: aligned ? entryDir : null, key: 'adx', val: `ADX ${adx.toFixed(1)} neutral` };
}

// Feature 2: Swing regime CHoCH/BOS (from 30m bars, oldest-first)
function featureSwingRegime(bars30m, entryDir) {
  if (!bars30m || bars30m.length < 20) return { signal: null, key: 'swing', val: 'Swing: need 20+ bars' };
  const recent = bars30m.slice(-60); // last 60 bars (~30h)
  const N = 3;
  const highs = [], lows = [];
  for (let i = N; i < recent.length - N; i++) {
    const h = bH(recent[i]), l = bL(recent[i]);
    let isH = true, isL = true;
    for (let j = i - N; j <= i + N; j++) {
      if (j !== i && bH(recent[j]) >= h) isH = false;
      if (j !== i && bL(recent[j]) <= l) isL = false;
    }
    if (isH) highs.push(h);
    if (isL)  lows.push(l);
  }
  if (highs.length < 2 || lows.length < 2) return { signal: null, key: 'swing', val: 'Swing: not enough swings' };
  const hh = highs[highs.length - 1] > highs[highs.length - 2];
  const hl = lows[lows.length - 1]   > lows[lows.length - 2];
  const lh = highs[highs.length - 1] < highs[highs.length - 2];
  const ll = lows[lows.length - 1]   < lows[lows.length - 2];
  if (hh && hl) return { signal: 'long',  key: 'swing', val: 'BOS Bullish HH+HL' };
  if (lh && ll) return { signal: 'short', key: 'swing', val: 'BOS Bearish LH+LL' };
  return { signal: null, key: 'swing', val: 'CHoCH / mixed structure' };
}

// Feature 3: TWAP slope — last 12 5m bars (~1h), oldest-first
function featureTwap(bars5m, entryDir) {
  if (!bars5m || bars5m.length < 12) return { signal: null, key: 'twap', val: 'TWAP: need 12+ bars' };
  const recent = bars5m.slice(-12);
  const hlc3 = recent.map(b => (bH(b) + bL(b) + bC(b)) / 3);
  const n = hlc3.length;
  const sx = (n * (n - 1)) / 2, sx2 = (n * (n - 1) * (2 * n - 1)) / 6;
  const sy = hlc3.reduce((s, v) => s + v, 0);
  const sxy = hlc3.reduce((s, v, i) => s + i * v, 0);
  const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
  if (slope > 0) return { signal: 'long',  key: 'twap', val: `TWAP slope +${slope.toFixed(6)}` };
  if (slope < 0) return { signal: 'short', key: 'twap', val: `TWAP slope ${slope.toFixed(6)}` };
  return { signal: null, key: 'twap', val: 'TWAP flat' };
}

// Feature 4: EMA20/50 + RSI14 from daily bars (oldest-first)
function featureEmaRsi(dailyBars, entryDir) {
  if (!dailyBars || dailyBars.length < 20) return { signal: null, key: 'ema', val: 'EMA: need 20+ daily bars' };
  const closes = dailyBars.map(bC);
  const e20 = ema(closes, 20);
  const e50 = closes.length >= 50 ? ema(closes, 50) : null;
  const emaSignal = e50 ? (e20 > e50 ? 'long' : 'short') : null;
  // RSI-14
  const period = 14;
  if (closes.length < period + 2) return { signal: emaSignal, key: 'ema', val: emaSignal ? `EMA ${emaSignal}` : 'EMA neutral' };
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
  }
  const rsi = avgLoss > 0 ? 100 - 100 / (1 + avgGain / avgLoss) : 100;
  const rsiSignal = rsi > 60 ? 'long' : rsi < 40 ? 'short' : null;
  const combined  = (emaSignal && rsiSignal && emaSignal === rsiSignal) ? emaSignal
                  : emaSignal ?? rsiSignal ?? null;
  return { signal: combined, key: 'ema', val: `EMA ${emaSignal ?? 'neutral'} RSI ${rsi.toFixed(0)}` };
}

// Feature 5: Hurst exponent from daily closes
function featureHurst(dailyBars, entryDir) {
  if (!dailyBars || dailyBars.length < 20) return { signal: null, key: 'hurst', val: 'Hurst: need 20+ daily bars' };
  const closes  = dailyBars.slice(-80).map(bC).filter(v => !isNaN(v));
  const H       = computeHurst(closes);
  const hStr    = H.toFixed(2);
  const opposite = entryDir === 'long' ? 'short' : 'long';
  if (H < 0.45) return { signal: entryDir, key: 'hurst', val: `Hurst ${hStr} mean-reverting` };
  if (H > 0.55) return { signal: opposite, key: 'hurst', val: `Hurst ${hStr} trending` };
  return { signal: null, key: 'hurst', val: `Hurst ${hStr} neutral` };
}

// Aggregate range bias from all 5 server features
function computeRangeBiasServer(sym, entryDir, bars5m, bars30m, dailyBars) {
  const features = [
    featureADX(bars30m, entryDir),
    featureSwingRegime(bars30m, entryDir),
    featureTwap(bars5m, entryDir),
    featureEmaRsi(dailyBars, entryDir),
    featureHurst(dailyBars, entryDir),
  ];
  const active      = features.filter(f => f.signal !== null);
  const confirmCount = active.filter(f => f.signal === entryDir).length;
  const conflictCount = active.filter(f => f.signal !== entryDir).length;
  const total       = confirmCount + conflictCount;
  const conviction  = total > 0 ? (confirmCount - conflictCount) / total : 0;
  return { confirmCount, conflictCount, conviction, features };
}

// ── Weekly pivots from daily bars ─────────────────────────────────────────────

function computeWeeklyPivots(dailyBars) {
  if (!dailyBars || dailyBars.length < 5) return null;
  const prev = dailyBars.slice(-7, -2); // ~5 bars, not including last 2 (may be partial)
  if (!prev.length) return null;
  const H  = Math.max(...prev.map(bH));
  const L  = Math.min(...prev.map(bL));
  const C  = bC(prev[prev.length - 1]);
  const PP = (H + L + C) / 3;
  return { PP, R1: 2*PP - L, R2: PP + (H-L), S1: 2*PP - H, S2: PP - (H-L) };
}

// ── FRED macro scoring (optional) ─────────────────────────────────────────────
// Returns 0–1 where 1 = fully aligned with entry direction

function computeMacroScore(direction, sym, fredData) {
  if (!fredData) return null;
  const isLong  = direction === 'long';
  const isGold  = sym.includes('XAU');
  const isNas   = sym === 'NAS100_USD';
  const isJpy   = sym.includes('JPY');
  const isChf   = sym.includes('CHF');
  const safeHaven = isJpy || isChf;
  const scores  = [];

  if (fredData.vix?.current != null) {
    const v = fredData.vix.current, rising = v > fredData.vix.prev;
    let s = 0;
    if      (isGold || safeHaven) s = (v > 25 ? 2 : v > 18 ? 1 : -1) + (rising ? 1 : 0);
    else if (isNas)               s = (v < 15 ? 2 : v > 25 ? -2 : 0) + (rising ? -1 : 0);
    scores.push({ s, max: 3 });
  }

  if (fredData.hy?.current != null) {
    const widening = fredData.hy.current > fredData.hy.prev;
    let s = 0;
    if      (isGold || safeHaven) s = widening ?  2 : -1;
    else if (isNas)               s = widening ? -2 :  1;
    scores.push({ s, max: 2 });
  }

  if (fredData.nfci?.current != null) {
    const n = fredData.nfci.current;
    let s = 0;
    if      (isNas)  s = n < -0.3 ? 2 : n > 0.3 ? -2 : 0;
    else if (isGold) s = n > 0.3 ? 1 : 0;
    scores.push({ s, max: 2 });
  }

  if (fredData.gs10?.current != null && fredData.gs2?.current != null) {
    const spread     = fredData.gs10.current - fredData.gs2.current;
    const prevSpread = fredData.gs10.prev    - fredData.gs2.prev;
    const steepening = spread > prevSpread;
    const isUsdBase  = sym.startsWith('USD/');
    const isUsdQuote = sym.endsWith('/USD');
    let s = 0;
    if      (isUsdBase)  s = steepening ?  1 : -1;
    else if (isUsdQuote) s = steepening ? -1 :  1;
    scores.push({ s, max: 2 });
  }

  if (!scores.length) return null;
  const total  = scores.reduce((s, t) => s + t.s, 0);
  const maxAbs = scores.reduce((s, t) => s + t.max, 0);
  const norm   = maxAbs > 0 ? (total / maxAbs + 1) / 2 : 0.5;
  return isLong ? norm : 1 - norm;
}

// ── Signal score computation ──────────────────────────────────────────────────

function computeServerSignalScore(direction, sym, hmmData, rbias, emaRsiResult, structScore, fredData) {
  const hmmScore  = hmmSignalScore(direction, hmmData) ?? 0.5;
  const rbScore   = (rbias.conviction + 1) / 2; // → [0,1]
  const momScore  = emaRsiResult.signal === direction           ? 0.78
                  : emaRsiResult.signal && emaRsiResult.signal !== direction ? 0.22
                  : 0.50;

  if (fredData) {
    const macroScore = computeMacroScore(direction, sym, fredData) ?? 0.5;
    return Math.round((
      hmmScore   * 0.25 +
      macroScore * 0.25 +
      rbScore    * 0.20 +
      momScore   * 0.20 +
      structScore * 0.10
    ) * 100);
  }

  return Math.round((
    hmmScore   * 0.38 +
    momScore   * 0.25 +
    rbScore    * 0.25 +
    structScore * 0.12
  ) * 100);
}

// ── Current price ─────────────────────────────────────────────────────────────

async function fetchCurrentPrice(sym) {
  const instrument = sym.replace('/', '_');
  const auth = { Authorization: `Bearer ${process.env.OANDA_KEY}` };
  if (process.env.OANDA_ACCOUNT_ID) {
    try {
      const r = await fetch(
        `${oandaBase()}/v3/accounts/${process.env.OANDA_ACCOUNT_ID}/pricing?instruments=${encodeURIComponent(instrument)}`,
        { headers: auth }
      );
      if (r.ok) {
        const d = await r.json();
        const p = d.prices?.[0];
        if (p?.bids?.[0] && p?.asks?.[0]) return (parseFloat(p.bids[0].price) + parseFloat(p.asks[0].price)) / 2;
      }
    } catch {}
  }
  try {
    const r = await fetch(
      `${oandaBase()}/v3/instruments/${encodeURIComponent(instrument)}/candles?count=2&granularity=M1&price=M`,
      { headers: auth }
    );
    if (!r.ok) return null;
    const d   = await r.json();
    const last = d.candles?.slice(-1)[0];
    return last?.mid?.c ? parseFloat(last.mid.c) : null;
  } catch { return null; }
}

// ── Entry builder (rich data) ─────────────────────────────────────────────────

function buildEntries(allConfs, currentPrice, atr, sym, hmmData, bars5m, bars30m, dailyBars, fredData) {
  const pipSize = getPipSize(sym);
  const digits  = getDigits(sym);
  const tick    = pipSize * 0.5;
  const slMult  = 1.25;
  const tpMult  = 2.2;

  // Weekly pivots for proximity matching
  const pivots = dailyBars?.length ? computeWeeklyPivots(dailyBars) : null;
  const pivotKeys = pivots ? ['PP','R1','R2','S1','S2'] : [];

  return allConfs.map(c => {
    let direction = null;
    if (currentPrice != null) {
      if      (c.price > currentPrice + tick) direction = 'short';
      else if (c.price < currentPrice - tick) direction = 'long';
    }
    if (!direction) return null;

    // Structural star rating (same as before)
    let stars = 1;
    if (c.isTight)             stars++;
    if ((c.density || 1) >= 2) stars++;
    if ((c.density || 1) >= 3) stars++;
    if (c.crossSessionMatch)   stars++;

    // Pivot proximity (+1 star)
    let pivotMatch = null;
    if (pivots && atr) {
      const proxPip = atr * 0.10;
      for (const key of pivotKeys) {
        if (Math.abs(c.price - pivots[key]) <= proxPip) { pivotMatch = key; stars++; break; }
      }
    }

    const tags = [];
    if (c.isTight)             tags.push('Tight Fib');
    if (c.source === 'asia')   tags.push('Asia Fib');
    if (c.source === 'monday') tags.push('Monday Fib');
    if (c.crossSessionMatch)   tags.push('Cross-Session');
    if ((c.density || 1) >= 3) tags.push('Dense Zone');
    if (pivotMatch)            tags.push(`Pivot ${pivotMatch}`);

    // SL/TP
    let sl = null, tp = null, tpNote = null, rrRatio = null;
    if (atr && direction) {
      const slDist = atr * slMult;
      const tpDist = slDist * tpMult;
      sl      = direction === 'long' ? c.price - slDist : c.price + slDist;
      tp      = direction === 'long' ? c.price + tpDist : c.price - tpDist;
      tpNote  = '2.2R';
      rrRatio = tpMult.toFixed(1);
    }

    // Range bias (5 server-side features)
    const rbias = computeRangeBiasServer(sym, direction, bars5m, bars30m, dailyBars);

    // EMA/RSI feature (already computed inside rbias.features)
    const emaRsiResult = rbias.features.find(f => f.key === 'ema') ?? { signal: null };

    // Structural score for signal weighting (0–1)
    const structScore = Math.min(1,
      Math.min(stars, 5) / 5 * 0.5 +
      (c.isTight ? 0.2 : 0) +
      (c.crossSessionMatch ? 0.2 : 0) +
      (pivotMatch ? 0.1 : 0)
    );

    // Signal score
    const signalScore = computeServerSignalScore(direction, sym, hmmData, rbias, emaRsiResult, structScore, fredData);

    // Trade grade
    const entryForGrade = {
      direction,
      signalScore,
      rangeBias: { confirmCount: rbias.confirmCount, conflictCount: rbias.conflictCount },
      tags,
      totalStars: Math.min(5, stars),
    };
    const g = gradeEntry(entryForGrade, hmmData);

    return {
      price:         parseFloat(c.price.toFixed(digits)),
      direction,
      totalStars:    Math.min(5, stars),
      signalScore,
      grade:         g.grade,
      verdict:       g.verdict,
      reasons:       g.reasons,
      warnings:      g.warnings,
      sl:            sl   != null ? parseFloat(sl.toFixed(digits))   : null,
      tp:            tp   != null ? parseFloat(tp.toFixed(digits))   : null,
      tpNote,
      rrRatio,
      tags,
      rangeBias:     { confirmCount: rbias.confirmCount, conflictCount: rbias.conflictCount },
      signalAligned: signalScore >= 50,
    };
  }).filter(Boolean);
}

// ── Cross-session cluster marking ─────────────────────────────────────────────

function detectCrossSessionClusters(asiaConfs, mondayConfs, sym, caps) {
  const bucket  = getCapBucket(sym, caps);
  const pipSize = getPipSize(sym);
  const threshold = (bucket.confluencePips ?? 2) * pipSize;
  for (const ac of asiaConfs) {
    for (const mc of mondayConfs) {
      if (Math.abs(ac.price - mc.price) <= threshold) {
        ac.crossSessionMatch = true;
        mc.crossSessionMatch = true;
      }
    }
  }
}

// ── Per-pair refresh ──────────────────────────────────────────────────────────

export async function refreshPair(sym, globalData = {}) {
  const t0 = Date.now();
  try {
    const caps = globalData.caps ?? null;
    const bucket = getCapBucket(sym, caps);
    const priceMode    = (caps ?? CAP_DEFAULTS_SERVER).confluencePriceMode ?? 'midpoint';
    const clusterMerge = (caps ?? CAP_DEFAULTS_SERVER).clusterMerge        ?? true;
    const pipSize      = getPipSize(sym);
    const confPips     = bucket.confluencePips ?? (sym.includes('XAU') ? 200 : sym === 'NAS100_USD' ? 100 : 2);
    const normalDist   = confPips * pipSize;
    const tightDist    = normalDist * 0.10;
    const mergeDist    = normalDist * (bucket.mergeFactor ?? 0.30);

    // 1. Fetch bars (M5 for Asia sessions, M30 for Monday + ATR + swing, D for HMM/EMA/Hurst)
    const [bars5m, bars30m, barsDaily] = await Promise.all([
      fetchOandaBars(sym, 'M5',  1500),
      fetchOandaBars(sym, 'M30', 500),
      fetchOandaBars(sym, 'D',   100).catch(() => []),
    ]);

    // 2. Compute HMM from daily log-returns + 30m swing regime
    let hmmData = null;
    if (barsDaily.length >= 21) {
      const closes  = barsDaily.map(bC).filter(v => v > 0);
      const returns = [];
      for (let i = 1; i < closes.length; i++) {
        const r = Math.log(closes[i] / closes[i - 1]);
        if (isFinite(r)) returns.push(r);
      }
      if (returns.length >= 20) hmmData = fitHMM(returns);
    }
    const intraday30m = compute30mSwingRegime(bars30m);

    // 3. Extract sessions
    const asiaSessions   = extractAsiaSessions(bars5m);
    const mondaySessions = extractMondaySessions(bars30m);

    let asiaConfs = [], mondayConfs = [];

    if (asiaSessions.length >= 2) {
      const todayRange     = computeBodyRange(asiaSessions[0].bars);
      const yesterdayRange = computeBodyRange(asiaSessions[1].bars);
      asiaConfs = detectConfluencesCore(
        projectFibLevels(todayRange),
        projectFibLevels(yesterdayRange),
        { pipSize, normalDistance: normalDist, tightDistance: tightDist, mergeDistance: mergeDist, priceMode, clusterMerge, source: 'asia' }
      );
    }

    if (mondaySessions.length >= 2) {
      const curRange  = computeBodyRange(mondaySessions[0].bars);
      const prevRange = computeBodyRange(mondaySessions[1].bars);
      mondayConfs = detectConfluencesCore(
        projectFibLevels(curRange),
        projectFibLevels(prevRange),
        { pipSize, normalDistance: normalDist, tightDistance: tightDist, mergeDistance: mergeDist, priceMode, clusterMerge, source: 'monday' }
      );
    }

    if (!asiaConfs.length && !mondayConfs.length) {
      console.log(`[LEVELS] ${sym}: no confluences (asia=${asiaSessions.length} sessions, monday=${mondaySessions.length} sessions)`);
      return null;
    }

    detectCrossSessionClusters(asiaConfs, mondayConfs, sym, caps);

    const atr          = computeEmaAtr(bars30m);
    const currentPrice = await fetchCurrentPrice(sym);
    const fredData     = globalData.fredData ?? null;

    const entries = buildEntries(
      [...asiaConfs, ...mondayConfs],
      currentPrice, atr, sym,
      hmmData, bars5m, bars30m, barsDaily, fredData
    );

    if (!entries.length) {
      console.log(`[LEVELS] ${sym}: confluences found but no directional entries (price=${currentPrice})`);
      return null;
    }

    await kv.put(`ai_entries_${sym.replace('/', '')}`, JSON.stringify({ data: entries, timestamp: Date.now(), source: 'server', intraday30m }));

    const ms       = Date.now() - t0;
    const avgScore = entries.length ? Math.round(entries.reduce((s, e) => s + (e.signalScore ?? 0), 0) / entries.length) : 0;
    const hmmStr   = hmmData ? `${hmmData.regime}${hmmData.trendDir ? `(${hmmData.trendDir})` : ''}` : 'no-HMM';
    const swingStr = intraday30m ? `${intraday30m.regime}${intraday30m.dir ? `(${intraday30m.dir})` : ''}` : 'no-swing';
    console.log(`[LEVELS] ${sym}: ${entries.length} entries, avgScore=${avgScore}%, hmm=${hmmStr}, swing=${swingStr}, ${ms}ms`);
    return entries.length;

  } catch (e) {
    console.error(`[LEVELS] ${sym} error:`, e.message);
    return null;
  }
}

// ── Refresh all pairs (called every 30 min from server.js) ───────────────────

export async function refreshAllPairs(pairs) {
  console.log(`[LEVELS] Starting refresh — ${pairs.length} pairs`);

  // Load shared data once per cycle
  const [caps, fredData] = await Promise.all([
    loadCaps(),
    fetchGlobalMacro(),
  ]);

  if (fredData) {
    const keys = Object.entries(fredData).filter(([, v]) => v != null).map(([k]) => k).join(', ');
    console.log(`[LEVELS] FRED data loaded: ${keys}`);
  } else {
    console.log('[LEVELS] FRED_KEY not set — running without macro enrichment');
  }

  const globalData = { caps, fredData };
  const results    = {};
  for (const sym of pairs) {
    results[sym] = await refreshPair(sym, globalData);
    await new Promise(r => setTimeout(r, 500)); // avoid OANDA rate-limit
  }

  const ok = Object.values(results).filter(v => v != null).length;
  console.log(`[LEVELS] Done — ${ok}/${pairs.length} pairs refreshed`);
  return results;
}
