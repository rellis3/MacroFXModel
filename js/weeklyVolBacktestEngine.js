/**
 * Weekly Vol & Range Backtester — walk-forward, Monday-anchored.
 *
 * Strategy:
 *   Every Monday: HV20/EWMA(λ=0.90)/HV30 vol per asset class from all prior daily closes → σ_d,
 *   scaled to weekly: σ_w = σ_d × √5.
 *   Mark 4 levels from Monday open:
 *     HL50_up/dn = open ± BM_P50 × hl_50_corr × σ_w  (median weekly range)
 *     HL75_up/dn = open ± BM_P75 × hl_75_corr × σ_w  (75th pct weekly range)
 *     OCMed_up/dn = open ± HN_P50 × oc_corr   × σ_w  (median OC body)
 *     OC75_up/dn  = open ± HN_P75 × oc_75_corr × σ_w (75th pct OC body)
 *   Fade: limit orders placed at those levels, TP = Monday open (mean reversion).
 *
 * Modes:
 *   revHL50   — entry HL50, TP = Mon open, SL = HL75            (~3.8:1 R:R)
 *   revHL75   — entry HL75, TP = Mon open, SL = HL75 × slMult
 *   both      — both simultaneously (up to 4 fills per week per instrument)
 *   ocLevels  — entry OCMed or OC75 (body fades)
 *   allLevels — all four levels simultaneously
 *
 * SL/TP modes (slMode / tpMode):
 *   'level'    — use HL-geometry based levels (default)
 *   'atr'      — ATR30 × multiplier
 *   'pips'     — fixed pip distance
 *   'maeCalib' — (SL only) percentile of trailing historical *uncapped* MAE
 *                (in ATR30 units), walk-forward week-by-week with no
 *                lookahead. Falls back to ATR30 × atrSlMult until
 *                maeCalibMinSamples fills have accumulated.
 *
 * Supports all 26 Asia-Range pairs.
 * Requires process.env.OANDA_KEY.
 */

import { readFileSync, existsSync }             from 'fs';
import path                                       from 'path';
import { fileURLToPath }                          from 'url';
import {
  fetchD1, ewmaVarSeries, hvVarSeries, yzVolSeries, garchSigmas,
  ASSET_PARAMS, BM_P50, BM_P75, HN_P50, HN_P75,
} from './volBacktestEngine.js';
import {
  readM1Parquet, groupByDate, fetchFromR2, fetchFromDrive, M1_DRIVE_IDS,
} from './volBacktestM1Engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Local M1 parquet cache — portfolioBacktest/cache/ is populated by the portfolio
// backtester and contains the same files used by the daily backtester.
const BT_WEEKLY_M1_DIR = path.join(__dirname, '..', 'portfolioBacktest', 'cache');

const SQRT5 = Math.sqrt(5);

// ── Pip sizes for all 26 instruments ─────────────────────────────────────────

export const PIP_SIZE = {
  EURUSD: 0.0001, GBPUSD: 0.0001, USDJPY: 0.01,  AUDUSD: 0.0001,
  NZDUSD: 0.0001, USDCAD: 0.0001, USDCHF: 0.0001, GBPJPY: 0.01,
  EURJPY: 0.01,   EURGBP: 0.0001, EURAUD: 0.0001, EURCAD: 0.0001,
  EURCHF: 0.0001, EURNZD: 0.0001, AUDJPY: 0.01,   AUDNZD: 0.0001,
  AUDCAD: 0.0001, AUDCHF: 0.0001, GBPAUD: 0.0001, GBPCAD: 0.0001,
  GBPCHF: 0.0001, GBPNZD: 0.0001, CADJPY: 0.01,   CHFJPY: 0.01,
  NZDJPY: 0.01,   GOLD:   0.1,
};

// ── All 26 instruments (Asia Range pair set) ──────────────────────────────────

export const WEEKLY_INSTRUMENTS = [
  // Majors
  { name: 'EURUSD', oanda: 'EUR_USD',  assetClass: 'fx'        },
  { name: 'GBPUSD', oanda: 'GBP_USD',  assetClass: 'fx'        },
  { name: 'USDJPY', oanda: 'USD_JPY',  assetClass: 'fx'        },
  { name: 'AUDUSD', oanda: 'AUD_USD',  assetClass: 'fx'        },
  { name: 'NZDUSD', oanda: 'NZD_USD',  assetClass: 'fx'        },
  { name: 'USDCAD', oanda: 'USD_CAD',  assetClass: 'fx'        },
  { name: 'USDCHF', oanda: 'USD_CHF',  assetClass: 'fx'        },
  { name: 'GBPJPY', oanda: 'GBP_JPY',  assetClass: 'fx'        },
  // EUR crosses
  { name: 'EURJPY', oanda: 'EUR_JPY',  assetClass: 'fx'        },
  { name: 'EURGBP', oanda: 'EUR_GBP',  assetClass: 'fx'        },
  { name: 'EURAUD', oanda: 'EUR_AUD',  assetClass: 'fx'        },
  { name: 'EURCAD', oanda: 'EUR_CAD',  assetClass: 'fx'        },
  { name: 'EURCHF', oanda: 'EUR_CHF',  assetClass: 'fx'        },
  { name: 'EURNZD', oanda: 'EUR_NZD',  assetClass: 'fx'        },
  // AUD crosses
  { name: 'AUDJPY', oanda: 'AUD_JPY',  assetClass: 'fx'        },
  { name: 'AUDNZD', oanda: 'AUD_NZD',  assetClass: 'fx'        },
  { name: 'AUDCAD', oanda: 'AUD_CAD',  assetClass: 'fx'        },
  { name: 'AUDCHF', oanda: 'AUD_CHF',  assetClass: 'fx'        },
  // GBP crosses
  { name: 'GBPAUD', oanda: 'GBP_AUD',  assetClass: 'fx'        },
  { name: 'GBPCAD', oanda: 'GBP_CAD',  assetClass: 'fx'        },
  { name: 'GBPCHF', oanda: 'GBP_CHF',  assetClass: 'fx'        },
  { name: 'GBPNZD', oanda: 'GBP_NZD',  assetClass: 'fx'        },
  // Other crosses
  { name: 'CADJPY', oanda: 'CAD_JPY',  assetClass: 'fx'        },
  { name: 'CHFJPY', oanda: 'CHF_JPY',  assetClass: 'fx'        },
  { name: 'NZDJPY', oanda: 'NZD_JPY',  assetClass: 'fx'        },
  // Commodity
  { name: 'GOLD',   oanda: 'XAU_USD',  assetClass: 'commodity' },
];

// ── Date helpers ──────────────────────────────────────────────────────────────

function getUTCDay(dateStr) {
  return new Date(dateStr + 'T12:00:00Z').getUTCDay(); // 0=Sun 1=Mon … 6=Sat
}

// Returns "YYYY-MM-DD" of the Monday of the week that contains dateStr.
function getWeekKey(dateStr) {
  const d   = new Date(dateStr + 'T12:00:00Z');
  const dow = d.getUTCDay();
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return mon.toISOString().substring(0, 10);
}

// ── ATR ───────────────────────────────────────────────────────────────────────
// Average True Range over the last `period` D1 bars (requires ≥2 bars).
function computeATR(bars, period = 30) {
  const n = bars.length;
  if (n < 2) return 0;
  const start = Math.max(1, n - period);
  let sum = 0, count = 0;
  for (let i = start; i < n; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low  - bars[i - 1].close)
    );
    sum += tr; count++;
  }
  return count > 0 ? sum / count : 0;
}

// ── Indicator helpers (Z-Score + SMI — computed on M1 bars at simulation time) ─
function _ema(arr, len) {
  const k = 2 / (len + 1), out = new Array(arr.length).fill(NaN);
  let p = NaN, init = false;
  for (let i = 0; i < arr.length; i++) {
    if (!isFinite(arr[i])) continue;
    if (!init) { p = arr[i]; out[i] = p; init = true; continue; }
    p = arr[i] * k + p * (1 - k); out[i] = p;
  }
  return out;
}
function _emaEma(arr, len) { return _ema(_ema(arr, len), len); }

function _zScoreSeries(closes, len = 20) {
  const out = new Array(closes.length).fill(NaN);
  let sumX = 0, sumX2 = 0;
  for (let i = 0; i < closes.length; i++) {
    sumX  += closes[i];
    sumX2 += closes[i] * closes[i];
    if (i >= len) {
      sumX  -= closes[i - len];
      sumX2 -= closes[i - len] * closes[i - len];
    }
    if (i >= len - 1) {
      const mu  = sumX / len;
      const sd  = Math.sqrt(Math.max(0, sumX2 / len - mu * mu));
      out[i] = sd === 0 ? 0 : (closes[i] - mu) / sd;
    }
  }
  return out;
}

function _smiSeries(bars, kLen = 10, dLen = 3, eLen = 3) {
  const n = bars.length;
  const rr = new Array(n).fill(NaN), hl = new Array(n).fill(NaN);
  for (let i = kLen - 1; i < n; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kLen + 1; j <= i; j++) {
      if (bars[j].high > hh) hh = bars[j].high;
      if (bars[j].low  < ll) ll = bars[j].low;
    }
    rr[i] = bars[i].close - (hh + ll) / 2;
    hl[i] = hh - ll;
  }
  const rrEE = _emaEma(rr, dLen), hlEE = _emaEma(hl, dLen);
  // Return raw SMI (not the signal-line EMA), matching Asia backtest smiConf behaviour
  return rrEE.map((v, i) =>
    (!isFinite(v) || !isFinite(hlEE[i]) || hlEE[i] === 0) ? NaN : 200 * (v / hlEE[i])
  );
}

// Attaches .zScore and .smi to each bar in-place before simulation.
function _attachIndicators(bars, opts) {
  const { zScoreFilter = false, zScoreLen = 20,
          smiFilter    = false, smiKLen   = 10 } = opts;
  if (zScoreFilter) {
    const zs = _zScoreSeries(bars.map(b => b.close), zScoreLen);
    for (let i = 0; i < bars.length; i++) bars[i].zScore = isFinite(zs[i]) ? zs[i] : null;
  }
  if (smiFilter) {
    const sv = _smiSeries(bars, smiKLen, 3, 3);
    for (let i = 0; i < bars.length; i++) bars[i].smi = isFinite(sv[i]) ? sv[i] : null;
  }
}


// Loads M1 parquet for a pair and groups bars by ISO week (Monday date).
// Priority: local portfolioBacktest/cache/ → R2 → Google Drive.
// Returns Map<weekKey, m1bar[]> or null if no data available.
export async function loadWeeklyM1(pairKey, m1Dir = BT_WEEKLY_M1_DIR) {
  let rows = null;
  const localFile = path.join(m1Dir, `${pairKey}_m1.parquet`);
  if (existsSync(localFile)) {
    console.log(`[WBT-M1] Loading ${pairKey} from disk…`);
    rows = await readM1Parquet(localFile);
  } else {
    try {
      const r2ab = await fetchFromR2(pairKey);
      if (r2ab) {
        console.log(`[WBT-M1] Loading ${pairKey} from R2…`);
        rows = await readM1Parquet(r2ab);
      }
    } catch (e) {
      console.warn(`[WBT-M1] R2 failed for ${pairKey}: ${e?.message}`);
    }
    if (!rows) {
      const driveAb = await fetchFromDrive(pairKey, m1Dir);
      if (driveAb) {
        console.log(`[WBT-M1] Loaded ${pairKey} from Drive`);
        rows = await readM1Parquet(driveAb);
      }
    }
  }
  if (!rows) return null;

  // Group M1 bars by the ISO week key (Monday's date) for the weekly engine
  const byWeek = new Map();
  for (const row of rows) {
    const dt = row[5] instanceof Date
      ? row[5].toISOString().substring(0, 19)
      : String(row[5]).substring(0, 19).replace(' ', 'T');
    const date = dt.substring(0, 10);
    const wk   = getWeekKey(date);
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk).push({ time: dt, date, open: row[0], high: row[1], low: row[2], close: row[3] });
  }
  console.log(`[WBT-M1] ${pairKey}: ${rows.length.toLocaleString()} M1 bars across ${byWeek.size} weeks`);
  return byWeek; // Map<'YYYY-MM-DD' (Mon), m1bar[]>
}

// ── Per-bar trade resolution ───────────────────────────────────────────────────
// Returns { outcome, pnlPct } if the trade closes on this bar, else null.
// P&L is expressed as % of mondayOpen (anchor price, not entry).
function resolveOnBar(side, entry, tp, sl, bar, mondayOpen) {
  const { high, low } = bar;
  if (side === 'SELL') {
    // SL is above entry — check first (extension means loss)
    if (high >= sl) return { outcome: 'loss', pnlPct: +((entry - sl) / mondayOpen * 100).toFixed(5) };
    // TP is below entry (mean reversion back to Monday open)
    if (low  <= tp) return { outcome: 'win',  pnlPct: +((entry - tp) / mondayOpen * 100).toFixed(5) };
  } else {
    if (low  <= sl) return { outcome: 'loss', pnlPct: +((sl - entry) / mondayOpen * 100).toFixed(5) };
    if (high >= tp) return { outcome: 'win',  pnlPct: +((tp - entry) / mondayOpen * 100).toFixed(5) };
  }
  return null; // still open
}

// MAE-calibrated SL distance: a percentile of trailing historical *uncapped*
// MAE (in ATR units) accumulated walk-forward across prior weeks. Using a
// trade's own censored MAE (capped at whatever stop was already set) would
// just chase that same stop — calibCtx.series instead comes from a separate
// uncapped tracker (see the per-bar loop below) that ignores SL/TP/EOW exit.
// Falls back to ATR30 × atrSlMult until calibCtx.minSamples fills exist.
function _maeCalibSlDist(atr, calibCtx, fallbackMult) {
  if (!atr || !calibCtx) return null;
  const { series, pct = 85, lookback = 100, minSamples = 20 } = calibCtx;
  if (series.length < minSamples) return atr * fallbackMult;
  const win = series.slice(Math.max(0, series.length - lookback))
    .map(s => s.maeAtr).sort((a, b) => a - b);
  const idx = Math.min(win.length - 1, Math.max(0, Math.floor((pct / 100) * win.length)));
  return Math.max(win[idx], 0.05) * atr;
}

// ── Weekly trade simulator ─────────────────────────────────────────────────────
// Walks each D1 bar in the week, placing limit orders at levels and resolving
// outcomes bar-by-bar.  Returns an array of trade objects (1–8 per week max).
//
// levelPcts: { hl50pct, hl75pct, ocMedpct, oc75pct, atr30 }
function simulateWeek(mondayOpen, weekBars, levelPcts, opts) {
  const { hl50pct, hl75pct, ocMedpct, oc75pct, atr30 = 0 } = levelPcts;
  const {
    strategy  = 'revHL50',
    slMode    = 'level',
    tpMode    = 'open',
    slMult    = 1.5,
    atrSlMult = 1.5,
    atrTpMult = 2.0,
    slPips    = 30,
    tpPips    = 50,
    spreadPct = 0,
    pair      = '',
    calibCtx  = null,
    zScoreFilter    = false,
    zScoreBuyThresh = -1.5,
    zScoreSellThresh = 1.5,
    smiFilter       = false,
    smiBuyThresh    = -40,
    smiSellThresh   =  40,
  } = opts;

  const pip     = PIP_SIZE[pair] ?? 0.0001;
  const safeAtr = atr30 > 0 ? atr30 : null; // null → ATR mode falls back to level-based

  // ── Entry price levels ────────────────────────────────────────────────────────
  const hl50Up  = mondayOpen * (1 + hl50pct  / 100);
  const hl75Up  = mondayOpen * (1 + hl75pct  / 100);
  const hl50Dn  = mondayOpen * (1 - hl50pct  / 100);
  const hl75Dn  = mondayOpen * (1 - hl75pct  / 100);
  const ocMedUp = mondayOpen * (1 + ocMedpct / 100);
  const ocMedDn = mondayOpen * (1 - ocMedpct / 100);
  const oc75Up  = mondayOpen * (1 + oc75pct  / 100);
  const oc75Dn  = mondayOpen * (1 - oc75pct  / 100);

  // ── SL / TP resolvers ────────────────────────────────────────────────────────
  const getSl = (side, entry, fallback) => {
    if (slMode === 'maeCalib') {
      const dist = _maeCalibSlDist(safeAtr, calibCtx, atrSlMult);
      if (dist != null) return side === 'SELL' ? entry + dist : entry - dist;
    }
    if (slMode === 'atr'  && safeAtr) return side === 'SELL' ? entry + safeAtr * atrSlMult : entry - safeAtr * atrSlMult;
    if (slMode === 'pips')             return side === 'SELL' ? entry + slPips  * pip       : entry - slPips  * pip;
    return fallback;
  };
  const getTp = (side, entry, fallback) => {
    if (tpMode === 'atr'  && safeAtr) return side === 'SELL' ? entry - safeAtr * atrTpMult : entry + safeAtr * atrTpMult;
    if (tpMode === 'pips')             return side === 'SELL' ? entry - tpPips  * pip       : entry + tpPips  * pip;
    return fallback; // default: mondayOpen
  };

  // ── Strategy flags — explicit opts.doXX override strategy string ─────────────
  const doHL50  = opts.doHL50  !== undefined ? opts.doHL50  : (strategy === 'revHL50'  || strategy === 'both'     || strategy === 'allLevels');
  const doHL75  = opts.doHL75  !== undefined ? opts.doHL75  : (strategy === 'revHL75'  || strategy === 'both'     || strategy === 'allLevels');
  const doOCMed = opts.doOCMed !== undefined ? opts.doOCMed : (strategy === 'ocLevels' || strategy === 'allLevels');
  const doOC75  = opts.doOC75  !== undefined ? opts.doOC75  : (strategy === 'ocLevels' || strategy === 'allLevels');

  // ── Pre-compute SL / TP prices per slot ──────────────────────────────────────
  // Level-based SL defaults:
  //   HL50  → SL at HL75 (same geometry as daily Rev-HL50)
  //   HL75  → SL at HL75 × slMult beyond Monday open
  //   OCMed → SL at OC75 (next level out)
  //   OC75  → SL at HL50 (next level out)
  const slMap = {
    SELL_HL50:  getSl('SELL', hl50Up,  hl75Up),
    BUY_HL50:   getSl('BUY',  hl50Dn,  hl75Dn),
    SELL_HL75:  getSl('SELL', hl75Up,  mondayOpen * (1 + hl75pct * slMult / 100)),
    BUY_HL75:   getSl('BUY',  hl75Dn,  mondayOpen * (1 - hl75pct * slMult / 100)),
    SELL_OCMed: getSl('SELL', ocMedUp, oc75Up),
    BUY_OCMed:  getSl('BUY',  ocMedDn, oc75Dn),
    SELL_OC75:  getSl('SELL', oc75Up,  hl50Up),
    BUY_OC75:   getSl('BUY',  oc75Dn,  hl50Dn),
  };
  const tpMap = {
    SELL_HL50:  getTp('SELL', hl50Up,  mondayOpen),
    BUY_HL50:   getTp('BUY',  hl50Dn,  mondayOpen),
    SELL_HL75:  getTp('SELL', hl75Up,  mondayOpen),
    BUY_HL75:   getTp('BUY',  hl75Dn,  mondayOpen),
    SELL_OCMed: getTp('SELL', ocMedUp, mondayOpen),
    BUY_OCMed:  getTp('BUY',  ocMedDn, mondayOpen),
    SELL_OC75:  getTp('SELL', oc75Up,  mondayOpen),
    BUY_OC75:   getTp('BUY',  oc75Dn,  mondayOpen),
  };

  const slots = {
    SELL_HL50:  null,
    BUY_HL50:   null,
    SELL_HL75:  null,
    BUY_HL75:   null,
    SELL_OCMed: null,
    BUY_OCMed:  null,
    SELL_OC75:  null,
    BUY_OC75:   null,
  };

  for (const bar of weekBars) {
    const { date, high, low } = bar;

    // ── Check new fills (only first hit per slot) ────────────────────────────
    const tryFill = (key, side, level, entry) => {
      if (!slots[key]) {
        // Z-Score filter: skip fill if price isn't sufficiently extended
        if (zScoreFilter && bar.zScore != null) {
          if (side === 'BUY'  && bar.zScore > zScoreBuyThresh)  return;
          if (side === 'SELL' && bar.zScore < zScoreSellThresh) return;
        }
        // SMI filter: skip fill if momentum isn't overbought/oversold
        if (smiFilter && bar.smi != null) {
          if (side === 'BUY'  && bar.smi > smiBuyThresh)  return;
          if (side === 'SELL' && bar.smi < smiSellThresh) return;
        }
        const sl = slMap[key], tp = tpMap[key];
        const res = resolveOnBar(side, entry, tp, sl, bar, mondayOpen);
        const mfe0 = side === 'SELL'
          ? Math.max(0, entry - bar.low)  / mondayOpen * 100
          : Math.max(0, bar.high - entry) / mondayOpen * 100;
        const mae0 = side === 'SELL'
          ? Math.max(0, bar.high - entry) / mondayOpen * 100
          : Math.max(0, entry - bar.low)  / mondayOpen * 100;
        slots[key] = { side, level, entry, tp, sl, fillDate: date, mfe: mfe0, mae: mae0,
                       ...(res ?? { outcome: 'open', pnlPct: 0 }) };
      }
    };

    if (doHL50  && high >= hl50Up)  tryFill('SELL_HL50',  'SELL', 'HL50',  hl50Up);
    if (doHL50  && low  <= hl50Dn)  tryFill('BUY_HL50',   'BUY',  'HL50',  hl50Dn);
    if (doHL75  && high >= hl75Up)  tryFill('SELL_HL75',  'SELL', 'HL75',  hl75Up);
    if (doHL75  && low  <= hl75Dn)  tryFill('BUY_HL75',   'BUY',  'HL75',  hl75Dn);
    if (doOCMed && high >= ocMedUp) tryFill('SELL_OCMed', 'SELL', 'OCMed', ocMedUp);
    if (doOCMed && low  <= ocMedDn) tryFill('BUY_OCMed',  'BUY',  'OCMed', ocMedDn);
    if (doOC75  && high >= oc75Up)  tryFill('SELL_OC75',  'SELL', 'OC75',  oc75Up);
    if (doOC75  && low  <= oc75Dn)  tryFill('BUY_OC75',   'BUY',  'OC75',  oc75Dn);

    // ── Carry open trades into this bar ─────────────────────────────────────
    for (const t of Object.values(slots)) {
      if (!t) continue;
      // Uncapped MAE (raw price units, regardless of outcome) — feeds the
      // maeCalib SL's walk-forward percentile via calibCtx; tracks the true
      // adverse excursion through EOW even past whatever stop this trade
      // actually closed against.
      const adverseRaw = t.side === 'SELL'
        ? Math.max(0, bar.high - t.entry)
        : Math.max(0, t.entry - bar.low);
      if (adverseRaw > (t._uncappedMae ?? 0)) t._uncappedMae = adverseRaw;

      if (t.outcome === 'open') {
        const mfeInc = t.side === 'SELL'
          ? Math.max(0, t.entry - bar.low)  / mondayOpen * 100
          : Math.max(0, bar.high - t.entry) / mondayOpen * 100;
        const maeInc = t.side === 'SELL'
          ? Math.max(0, bar.high - t.entry) / mondayOpen * 100
          : Math.max(0, t.entry - bar.low)  / mondayOpen * 100;
        if (mfeInc > (t.mfe ?? 0)) t.mfe = mfeInc;
        if (maeInc > (t.mae ?? 0)) t.mae = maeInc;
        const res = resolveOnBar(t.side, t.entry, t.tp, t.sl, bar, mondayOpen);
        if (res) Object.assign(t, res);
      }
    }
  }

  // ── Force-close anything still open at EOW ────────────────────────────────
  const eowClose = weekBars.at(-1)?.close ?? mondayOpen;
  const eowDate  = weekBars.at(-1)?.date;
  if (!opts.noEowClose) {
    for (const t of Object.values(slots)) {
      if (t?.outcome === 'open') {
        t.pnlPct = t.side === 'SELL'
          ? +((t.entry - eowClose) / mondayOpen * 100).toFixed(5)
          : +((eowClose - t.entry) / mondayOpen * 100).toFixed(5);
        t.closeDate = eowDate;
        // outcome stays 'open' — distinguishes EOW force-close from TP/SL
      }
    }
  }

  // ── Collect filled trades, apply spread (skip spread for open carries) ───
  const result = Object.values(slots)
    .filter(Boolean)
    .map(({ _uncappedMae, ...t }) => ({
      ...t, filled: true,
      uncappedMaeAtr: safeAtr ? _uncappedMae / safeAtr : null,
      pnlPct: (opts.noEowClose && t.outcome === 'open')
        ? t.pnlPct  // spread applied at carry resolution to avoid double-count
        : +(t.pnlPct - spreadPct).toFixed(5),
    }));

  return result.length
    ? result
    : [{ filled: false, side: '', level: '', outcome: 'no_fill', pnlPct: 0, fillDate: null }];
}

// ── Walk-forward weekly backtester ────────────────────────────────────────────

export function runWeeklyBacktest(bars, assetClass, opts = {}) {
  const { dateFrom = '', dateTo = '', minLookback = 60, atrPeriod = 30,
          carryMode = false, maxOnePerPair = false,
          m1ByWeek = null,   // Map<weekKey, m1bar[]> — M1 simulation when provided
          maeCalibPct = 85, maeCalibLookback = 100, maeCalibMinSamples = 20,
        } = opts;
  const p = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;

  // maeCalib SL mode: walk-forward series of prior weeks' uncapped MAE (ATR
  // units), one pair's own — never shared across instruments/weeks ahead.
  const maeCalibSeries = [];
  const calibCtx = { series: maeCalibSeries, pct: maeCalibPct, lookback: maeCalibLookback, minSamples: maeCalibMinSamples };

  // Pre-compute vol sigma series O(n) — out[i] = sigma for predicting bar i's range.
  // commodity→HV20, index→GARCH(1,1), fx→YZ(30) — mirrors computeForecast() in volForecast.js.
  const closes  = bars.map(b => b.close);
  let volSigmas;
  if (assetClass === 'commodity') {
    const logRets = [];
    for (let i = 1; i < closes.length; i++) logRets.push(Math.log(closes[i] / closes[i - 1]));
    const hvVars = hvVarSeries(logRets, 20);
    volSigmas = new Float64Array(bars.length);
    for (let i = 2; i < bars.length; i++) volSigmas[i] = Math.sqrt(Math.max(hvVars[i - 2], 1e-12));
  } else if (assetClass === 'index') {
    volSigmas = garchSigmas(bars, (ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx).garch_omega ?? 4.76e-6);
  } else {
    const yzFull = yzVolSeries(bars, 30);
    volSigmas = new Float64Array(bars.length);
    for (let i = 1; i < bars.length; i++) volSigmas[i] = yzFull[i - 1] || 1e-6;
  }

  const dateToIdx = new Map();
  for (let i = 0; i < bars.length; i++) dateToIdx.set(bars[i].date, i);

  // Group D1 bars by ISO week
  const weekMap = new Map();
  for (const bar of bars) {
    const wk = getWeekKey(bar.date);
    if (!weekMap.has(wk)) weekMap.set(wk, []);
    weekMap.get(wk).push(bar);
  }
  const sortedWeeks = [...weekMap.entries()].sort(([a], [b]) => a < b ? -1 : 1);

  const records     = [];
  const carryTrades = []; // Positions held open beyond EOW in carry mode

  for (const [weekKey, weekBars] of sortedWeeks) {
    if (!weekBars.length) continue;

    // Monday bar is the anchor; fall back to first bar if Monday is a holiday
    const mondayBar  = weekBars.find(b => getUTCDay(b.date) === 1) ?? weekBars[0];
    const mondayDate = mondayBar.date;
    const mondayIdx  = dateToIdx.get(mondayDate) ?? 0;

    if (mondayIdx < minLookback) continue;
    if (dateFrom && weekKey < dateFrom.substring(0, 10)) continue;
    if (dateTo   && weekKey > dateTo.substring(0, 10))   continue;

    // M1 bars for this week (preferred) — D1 weekBars used as fallback and
    // always for vol/ATR/Monday-open anchor computation.
    const m1WeekBars = m1ByWeek?.get(weekKey) ?? null;
    const simBars    = (m1WeekBars && m1WeekBars.length >= 10) ? m1WeekBars : weekBars;

    // When M1 data is present, attach indicators to the M1 bars for this week.
    // A week's ~7,200 M1 bars give plenty of warmup (20-bar Z-Score warms in 20 min).
    // When M1 data is absent the filters are not applied — bar.zScore/smi stay
    // undefined, the != null guard in tryFill skips the check, and trades fill
    // as normal. This prevents wrong-timeframe D1 values polluting results.
    if (m1WeekBars && m1WeekBars.length >= 10 && (opts.zScoreFilter || opts.smiFilter)) {
      _attachIndicators(m1WeekBars, opts);
    }

    // ── Resolve carried-over trades bar-by-bar against this week ─────────────
    if (carryMode && carryTrades.length > 0) {
      const resolved = [], stillOpen = [];
      for (const carry of carryTrades) {
        let closed = false;
        for (const bar of simBars) {
          const mfeInc = carry.side === 'SELL'
            ? Math.max(0, carry.entry - bar.low)  / carry.mondayOpen * 100
            : Math.max(0, bar.high - carry.entry) / carry.mondayOpen * 100;
          const maeInc = carry.side === 'SELL'
            ? Math.max(0, bar.high - carry.entry) / carry.mondayOpen * 100
            : Math.max(0, carry.entry - bar.low)  / carry.mondayOpen * 100;
          if (mfeInc > (carry.mfe ?? 0)) carry.mfe = mfeInc;
          if (maeInc > (carry.mae ?? 0)) carry.mae = maeInc;
          const res = resolveOnBar(carry.side, carry.entry, carry.tp, carry.sl, bar, carry.mondayOpen);
          if (res) { Object.assign(carry, res, { closeDate: bar.date }); closed = true; break; }
        }
        (closed ? resolved : stillOpen).push(carry);
      }
      const cpip = PIP_SIZE[opts.pair ?? ''] ?? 0.0001;
      for (const c of resolved) {
        const cPips = pct => c.mondayOpen > 0 ? +(pct / 100 * c.mondayOpen / cpip).toFixed(1) : null;
        const pnl   = +((c.pnlPct ?? 0) - (opts.spreadPct ?? 0)).toFixed(5);
        records.push({
          week: c.week, date: c.date, filled: true,
          hl50_pct: c.hl50_pct, hl75_pct: c.hl75_pct,
          oc_med_pct: c.oc_med_pct, oc75_pct: c.oc75_pct,
          atr30: c.atr30, monday_open: +c.mondayOpen.toFixed(6),
          side: c.side, level: c.level, outcome: c.outcome,
          pnl_pct: pnl,
          entry: c.entry != null ? +c.entry.toFixed(6) : null,
          tp:    c.tp    != null ? +c.tp.toFixed(6)    : null,
          sl:    c.sl    != null ? +c.sl.toFixed(6)    : null,
          fill_date: c.fillDate ?? null, close_date: c.closeDate ?? null,
          mfe_pct: c.mfe != null ? +c.mfe.toFixed(5) : null,
          mae_pct: c.mae != null ? +c.mae.toFixed(5) : null,
          pnl_pips: cPips(pnl), mfe_pips: c.mfe != null ? cPips(c.mfe) : null,
          mae_pips: c.mae != null ? cPips(c.mae) : null,
          carried: true, m1_sim: c.m1_sim ?? false,
        });
      }
      carryTrades.length = 0;
      carryTrades.push(...stillOpen);
    }

    // Vol sigma for Monday = pre-computed through Friday's close (no lookahead)
    const sigmaD = Math.max(volSigmas[mondayIdx] ?? 1e-6, 1e-6);
    const sigmaW = sigmaD * SQRT5;

    const hl50pct  = BM_P50 * p.hl_50_corr  * sigmaW * 100;
    const hl75pct  = BM_P75 * p.hl_75_corr  * sigmaW * 100;
    const ocMedpct = HN_P50 * p.oc_corr     * sigmaW * 100;
    const oc75pct  = HN_P75 * p.oc_75_corr  * sigmaW * 100;

    // ATR from bars before this Monday (for ATR-mode SL/TP)
    const barsBeforeMonday = bars.slice(Math.max(0, mondayIdx - atrPeriod - 5), mondayIdx);
    const atr30 = computeATR(barsBeforeMonday, atrPeriod);

    const mondayOpen    = mondayBar.open;
    const levelPcts     = { hl50pct, hl75pct, ocMedpct, oc75pct, atr30 };
    const pip           = PIP_SIZE[opts.pair ?? ''] ?? 0.0001;
    const toPips        = pct => mondayOpen > 0 ? +(pct / 100 * mondayOpen / pip).toFixed(1) : null;
    // maxOnePerPair: skip new orders while any carry is still open
    const skipNewOrders = maxOnePerPair && carryTrades.length > 0;
    const trades        = skipNewOrders
      ? [] : simulateWeek(mondayOpen, simBars, levelPcts, { ...opts, noEowClose: carryMode, calibCtx });

    // Calibration update happens after this week's fills are known, so next
    // week's getSl() sees this week's data but this week's own getSl() calls
    // (above) never could — no lookahead.
    for (const t of trades) {
      if (t.filled && Number.isFinite(t.uncappedMaeAtr) && t.uncappedMaeAtr >= 0) {
        maeCalibSeries.push({ week: weekKey, maeAtr: t.uncappedMaeAtr });
      }
    }

    for (const t of trades) {
      if (carryMode && t.filled && t.outcome === 'open') {
        // Queue carry for next week(s) — store original week context
        carryTrades.push({
          ...t,
          week: weekKey, date: mondayDate, mondayOpen,
          hl50_pct:   +hl50pct.toFixed(4),  hl75_pct:   +hl75pct.toFixed(4),
          oc_med_pct: +ocMedpct.toFixed(4), oc75_pct:   +oc75pct.toFixed(4),
          atr30:       +atr30.toFixed(6),
        });
      } else {
        records.push({
          week:        weekKey,
          date:        mondayDate,
          hl50_pct:    +hl50pct.toFixed(4),
          hl75_pct:    +hl75pct.toFixed(4),
          oc_med_pct:  +ocMedpct.toFixed(4),
          oc75_pct:    +oc75pct.toFixed(4),
          atr30:       +atr30.toFixed(6),
          monday_open: +mondayOpen.toFixed(6),
          filled:      t.filled,
          side:        t.side,
          level:       t.level,
          outcome:     t.outcome,
          pnl_pct:     t.pnlPct,
          entry:       t.entry   != null ? +t.entry.toFixed(6)   : null,
          tp:          t.tp      != null ? +t.tp.toFixed(6)      : null,
          sl:          t.sl      != null ? +t.sl.toFixed(6)      : null,
          fill_date:   t.fillDate ?? null,
          close_date:  t.closeDate ?? null,
          mfe_pct:     t.mfe != null ? +t.mfe.toFixed(5) : null,
          mae_pct:     t.mae != null ? +t.mae.toFixed(5) : null,
          pnl_pips:    t.filled ? toPips(t.pnlPct) : null,
          mfe_pips:    t.mfe   != null ? toPips(t.mfe) : null,
          mae_pips:    t.mae   != null ? toPips(t.mae) : null,
          carried:     false,
          m1_sim:      !!(m1WeekBars && m1WeekBars.length >= 10),
        });
      }
    }
  }

  // ── Force-close remaining carries at end of dataset ───────────────────────
  if (carryMode && carryTrades.length > 0) {
    const lastBars = sortedWeeks.at(-1)?.[1] ?? [];
    const eowClose = lastBars.at(-1)?.close ?? 0;
    const eowDate  = lastBars.at(-1)?.date;
    const fpip     = PIP_SIZE[opts.pair ?? ''] ?? 0.0001;
    for (const c of carryTrades) {
      const fPips = pct => c.mondayOpen > 0 ? +(pct / 100 * c.mondayOpen / fpip).toFixed(1) : null;
      const rawPnl = c.side === 'SELL'
        ? (c.entry - eowClose) / c.mondayOpen * 100
        : (eowClose - c.entry) / c.mondayOpen * 100;
      const pnl = +(rawPnl - (opts.spreadPct ?? 0)).toFixed(5);
      records.push({
        week: c.week, date: c.date, filled: true,
        hl50_pct: c.hl50_pct, hl75_pct: c.hl75_pct,
        oc_med_pct: c.oc_med_pct, oc75_pct: c.oc75_pct,
        atr30: c.atr30, monday_open: +c.mondayOpen.toFixed(6),
        side: c.side, level: c.level, outcome: 'open',
        pnl_pct: pnl,
        entry: c.entry != null ? +c.entry.toFixed(6) : null,
        tp:    c.tp    != null ? +c.tp.toFixed(6)    : null,
        sl:    c.sl    != null ? +c.sl.toFixed(6)    : null,
        fill_date: c.fillDate ?? null, close_date: eowDate,
        mfe_pct: c.mfe != null ? +c.mfe.toFixed(5) : null,
        mae_pct: c.mae != null ? +c.mae.toFixed(5) : null,
        pnl_pips: fPips(pnl), mfe_pips: c.mfe != null ? fPips(c.mfe) : null,
        mae_pips: c.mae != null ? fPips(c.mae) : null,
        carried: true,
      });
    }
  }

  return records;
}

// ── Public: run all instruments ────────────────────────────────────────────────

export async function runFullWeeklyBacktest(opts = {}, instruments = WEEKLY_INSTRUMENTS) {
  if (!process.env.OANDA_KEY) throw new Error('OANDA_KEY not set — cannot fetch D1 data');

  const allTrades = [];
  const log       = [];

  for (const cfg of instruments) {
    try {
      log.push(`Fetching D1 ${cfg.name}…`);
      const bars    = await fetchD1(cfg.oanda, 5000);
      log.push(`  ${bars.length} D1 bars (${bars[0]?.date} → ${bars.at(-1)?.date})`);

      // Load M1 parquet — local cache first, then R2, then Drive
      const pairKey  = cfg.name.toLowerCase();
      let   m1ByWeek = null;
      try {
        m1ByWeek = await loadWeeklyM1(pairKey);
        if (m1ByWeek) log.push(`  M1 loaded: ${m1ByWeek.size} weeks`);
        else          log.push(`  No M1 data — using D1 simulation`);
      } catch (e) {
        log.push(`  M1 load error: ${e?.message} — using D1 simulation`);
      }

      const trades = runWeeklyBacktest(bars, cfg.assetClass, { ...opts, pair: cfg.name, m1ByWeek })
        .map(r => ({ instrument: cfg.name, ...r }));
      allTrades.push(...trades);
      const nM1   = trades.filter(t => t.filled && t.m1_sim).length;
      const nFill = trades.filter(t => t.filled).length;
      log.push(`  ${nFill} filled (${nM1} M1, ${nFill - nM1} D1 fallback)`);
    } catch (e) {
      log.push(`  ${cfg.name}: ${e.message}`);
    }
  }

  return { trades: allTrades, log };
}

export { WEEKLY_INSTRUMENTS as INSTRUMENTS };
