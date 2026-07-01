/**
 * Vol & Range Walk-Forward Backtester — pure JavaScript engine.
 *
 * Strategy:
 *   Each day T (walk-forward, no lookahead):
 *     1. HV20 (commodity) / EWMA(λ=0.90) (index) / HV30 (fx) vol on closes[0..T-1] → σ_d
 *     2. HL_75  = 2.049 × hl_75_corr × σ_d  (% of price)
 *        OC_med = 0.6745 × oc_corr    × σ_d  (% of price)
 *     3. EMA-20 slope on closes[0..T-1] → regime BULL / BEAR / RANGE
 *     4. Simulate limit order:
 *          BULL  → SELL at open+HL_75,  TP = open+OC_med, SL = open+HL_75×slMult
 *          BEAR  → BUY  at open-HL_75,  TP = open-OC_med, SL = open-HL_75×slMult
 *          RANGE → fade both sides,     TP = open
 *
 * Data source: Oanda v20 D granularity (up to 5 000 bars ≈ 20 years).
 * Requires process.env.OANDA_KEY.
 */

// ── Constants (mirrors vol_range_forecast.py) ─────────────────────────────────

const LAMBDA       = 0.94;
const BM_P50       = 1.572;
const BM_P75       = 2.049;
const HN_P50       = 0.6745;
const HN_P75       = 1.1503;

const G_ALPHA = 0.06;
const G_BETA  = 0.91;

const ASSET_PARAMS = {
  commodity: { hl_75_corr: 0.940, oc_corr: 1.144, hl_50_corr: 1.023, oc_75_corr: 1.092 },
  index:     { hl_75_corr: 0.967, oc_corr: 1.092, hl_50_corr: 1.010, oc_75_corr: 1.115, garch_omega: 4.76e-6 },
  fx:        { hl_75_corr: 0.912, oc_corr: 1.038, hl_50_corr: 0.965, oc_75_corr: 1.015 },
};

const INSTRUMENTS = [
  { name: 'EURUSD', oanda: 'EUR_USD',    assetClass: 'fx'        },
  { name: 'GBPUSD', oanda: 'GBP_USD',    assetClass: 'fx'        },
  { name: 'USDJPY', oanda: 'USD_JPY',    assetClass: 'fx'        },
  { name: 'AUDUSD', oanda: 'AUD_USD',    assetClass: 'fx'        },
  { name: 'NZDUSD', oanda: 'NZD_USD',    assetClass: 'fx'        },
  { name: 'USDCAD', oanda: 'USD_CAD',    assetClass: 'fx'        },
  { name: 'USDCHF', oanda: 'USD_CHF',    assetClass: 'fx'        },
  { name: 'GBPJPY', oanda: 'GBP_JPY',    assetClass: 'fx'        },
  { name: 'GOLD',   oanda: 'XAU_USD',    assetClass: 'commodity' },
  { name: 'NQ',     oanda: 'NAS100_USD', assetClass: 'index'     },
];

// ── Oanda D1 fetch ────────────────────────────────────────────────────────────

function _oandaBase() {
  return (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com';
}

async function fetchD1(instrument, count = 5000) {
  const url = `${_oandaBase()}/v3/instruments/${encodeURIComponent(instrument)}/candles`
            + `?granularity=D&count=${count}&price=M`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` },
    signal:  AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`Oanda ${instrument}: HTTP ${r.status}`);
  const data = await r.json();
  return (data.candles ?? [])
    .filter(c => c.complete !== false && c.mid)
    .map(c => {
      // Oanda D1 bars open at 22:00 UTC (broker day starts Sunday evening).
      // substring(0,10) would label Monday's session as Sunday, Friday as Thursday.
      // Advance by 1 day when the open is in the evening (≥ 20:00 UTC) so the
      // date reflects the actual trading session traders would call that day.
      const t = new Date(c.time);
      if (t.getUTCHours() >= 20) t.setUTCDate(t.getUTCDate() + 1);
      return {
        date:  t.toISOString().substring(0, 10),
        open:  parseFloat(c.mid.o),
        high:  parseFloat(c.mid.h),
        low:   parseFloat(c.mid.l),
        close: parseFloat(c.mid.c),
      };
    })
    .filter(c => c.close > 0);
}

// UTC epoch (seconds) of the most recent 00:00 Europe/London — DST-safe via Intl,
// no hard-coded offset. Reads `now`'s London wall-clock parts AS IF UTC to recover
// London's current offset, then shifts that day's local-midnight back to a UTC epoch.
// 23:00 UTC in BST, 00:00 UTC in GMT. Exported so the anchor is defined ONCE.
function londonMidnightSec(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now).reduce((o, x) => (o[x.type] = x.value, o), {});
  const hh = p.hour === '24' ? 0 : +p.hour;                       // en-GB midnight → '24'
  const wallAsUTC = Date.UTC(+p.year, +p.month - 1, +p.day, hh, +p.minute, +p.second);
  const offsetMs  = wallAsUTC - now.getTime();                    // London offset from UTC
  const midnight  = Date.UTC(+p.year, +p.month - 1, +p.day, 0, 0, 0) - offsetMs;
  return Math.floor(midnight / 1000);
}

// Today's session OPEN anchored at MIDNIGHT EUROPE/LONDON — read from the FIRST M1
// bar at/after London midnight. This is the anchor the forecast/book session uses.
// The earlier daily-aligned-candle approach silently fell back to OANDA's 22:00-UTC
// D1 open (gold showed 3997.53 vs the real London-midnight ~4013.x), so we read the
// M1 open directly instead — deterministic and matches the forecaster's open.
// Returns the open (number) or null if unavailable (e.g. market closed → producer
// falls back to the D1 open and logs it).
async function fetchSessionOpenLondon(instrument) {
  const from = londonMidnightSec();
  // Window from London midnight to NOW: bars[0] is the FIRST bar of the London day.
  // For 24h instruments (FX/gold/US indices) that's the midnight bar. For markets
  // that are CLOSED at midnight (European cash indices DE30/UK100 — a +1h window
  // found nothing → stale D1 fallback), it's the market-OPEN bar, which is the
  // correct session anchor and matches the book's London-session bucketing.
  const to = Math.floor(Date.now() / 1000);
  const bars = from < to ? await fetchM1Range(instrument, from, to) : [];
  const open = bars && bars.length ? bars[0].open : NaN;          // first bar of the session
  return open > 0 ? open : null;
}

// Oanda M1 fetch for one [from,to] window (epoch SECONDS). Returns ascending bars
// [{ time(sec), open, high, low, close, volume }]. The window must be ≤5000 bars
// (Oanda's cap) — the m1GapFill brick chunks larger ranges and calls this per
// chunk. Used to top up the frozen R2 M1 series to "now" at book-rebuild time.
async function fetchM1Range(instrument, fromSec, toSec) {
  const fromIso = new Date(fromSec * 1000).toISOString();
  const toIso   = new Date(toSec   * 1000).toISOString();
  const url = `${_oandaBase()}/v3/instruments/${encodeURIComponent(instrument)}/candles`
            + `?granularity=M1&price=M&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` },
    signal:  AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`Oanda M1 ${instrument}: HTTP ${r.status}`);
  const data = await r.json();
  return (data.candles ?? [])
    .filter(c => c.complete !== false && c.mid)
    .map(c => ({
      time:   Math.floor(new Date(c.time).getTime() / 1000),
      open:   parseFloat(c.mid.o),
      high:   parseFloat(c.mid.h),
      low:    parseFloat(c.mid.l),
      close:  parseFloat(c.mid.c),
      volume: Number(c.volume ?? 0),
    }))
    .filter(c => c.close > 0);
}

// ── EWMA variance series ──────────────────────────────────────────────────────

function ewmaVarSeries(logReturns, lam = LAMBDA) {
  const n   = logReturns.length;
  const out = new Float64Array(n);
  const seed = logReturns.slice(0, Math.min(20, n));
  let v = seed.reduce((s, r) => s + r * r, 0) / (seed.length || 1) || 1e-10;
  for (let i = 0; i < n; i++) {
    v = lam * v + (1 - lam) * logReturns[i] ** 2;
    out[i] = v;
  }
  return out;
}

// ── Rolling HV variance series ────────────────────────────────────────────────
// Used for HV20 (commodity) and HV30 (fx) — matches hv20Series() in volForecast.js.
// out[i] = sample variance of logReturns[max(0, i-window+1)..i].

function hvVarSeries(logReturns, window = 20) {
  const n = logReturns.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - window + 1);
    const m = i - start + 1;
    let sum = 0, sum2 = 0;
    for (let j = start; j <= i; j++) { sum += logReturns[j]; sum2 += logReturns[j] ** 2; }
    const mean = sum / m;
    out[i] = Math.max((sum2 - m * mean * mean) / Math.max(m - 1, 1), 1e-12);
  }
  return out;
}

// ── Yang-Zhang vol series (for fx primary) ───────────────────────────────────
// out[i] = YZ daily sigma using bars[i-window..i] (inclusive).
// For no-lookahead prediction of bar i: use out[i-1].
// Mirrors yangZhangVolSeries() in volForecast.js.

function yzVolSeries(bars, window = 30) {
  const n = bars.length;
  const out = new Float64Array(n);
  const k = 0.34 / (1.34 + (window + 1) / (window - 1));
  for (let i = window; i < n; i++) {
    const s = bars.slice(i - window, i + 1);
    let muOn = 0, muOc = 0, varOn = 0, varOc = 0, rs = 0;
    for (let j = 1; j <= window; j++) {
      muOn += Math.log(s[j].open / s[j - 1].close);
      muOc += Math.log(s[j].close / s[j].open);
    }
    muOn /= window; muOc /= window;
    for (let j = 1; j <= window; j++) {
      const dOn = Math.log(s[j].open / s[j - 1].close) - muOn;
      const dOc = Math.log(s[j].close / s[j].open) - muOc;
      varOn += dOn * dOn; varOc += dOc * dOc;
      rs += Math.log(s[j].high / s[j].close) * Math.log(s[j].high / s[j].open)
          + Math.log(s[j].low  / s[j].close) * Math.log(s[j].low  / s[j].open);
    }
    varOn /= (window - 1); varOc /= (window - 1); rs /= window;
    out[i] = Math.sqrt(Math.max(varOn + k * varOc + (1 - k) * rs, 0));
  }
  return out;
}

// ── GARCH(1,1) sigma series (for index primary) ───────────────────────────────
// out[i] = sigma for PREDICTING bar i's range, using returns through bar i-1.
// α=0.06 β=0.91 — initialized at unconditional variance ω/(1−α−β).

function garchSigmas(bars, omega) {
  const n = bars.length;
  const out = new Float64Array(n);
  let v = omega / (1 - G_ALPHA - G_BETA);
  out[0] = Math.sqrt(v);
  out[1] = Math.sqrt(v);
  for (let i = 2; i < n; i++) {
    const r = Math.log(bars[i - 1].close / bars[i - 2].close);
    v = omega + G_ALPHA * r * r + G_BETA * v;
    out[i] = Math.sqrt(v);
  }
  return out;
}

// ── Regime classifier (EMA-20 slope, walk-forward) ────────────────────────────

function classifyRegime(closes, idx, span = 20, slopeWindow = 5, thresh = 0.002, bearMult = 1.0) {
  if (idx < span + slopeWindow) return 'RANGE';
  const k = 2 / (span + 1);
  let ema = closes[0];
  for (let i = 1; i < idx; i++) ema = closes[i] * k + ema * (1 - k);
  let emaPrev = closes[0];
  for (let i = 1; i < idx - slopeWindow; i++) emaPrev = closes[i] * k + emaPrev * (1 - k);
  const slope = (ema - emaPrev) / ema;
  if (slope >  thresh)              return 'BULL';
  if (slope < -(thresh * bearMult)) return 'BEAR';
  return 'RANGE';
}

// ── Single-day trade simulator ─────────────────────────────────────────────────

function simulateDay(open, high, low, close, hl75pct, ocMedPct, regime, slMult = 1.5, rangeMode = 'fade_both') {
  const hl  = open * hl75pct  / 100;
  const oc  = open * ocMedPct / 100;
  const slD = hl * slMult;

  function mfeR(side, entry, tpDist) {
    if (tpDist <= 0) return 0;
    const exc = side === 'SELL' ? Math.max(0, entry - low) : Math.max(0, high - entry);
    return +Math.min(exc / tpDist, 3).toFixed(3);
  }

  function sell(entry, tp, sl) {
    if (high < entry) return null;
    const mfe = mfeR('SELL', entry, entry - tp);
    if (high >= sl) return { outcome: 'loss', pnlPct: -((sl - entry) / open * 100), mfe_r: mfe };
    const markPnl = (entry - close) / open * 100;
    const tpPnl   = (entry - tp)   / open * 100;
    if (markPnl >= tpPnl) return { outcome: 'win',  pnlPct: tpPnl,   mfe_r: mfe };
    if (markPnl  > 0)     return { outcome: 'win',  pnlPct: markPnl, mfe_r: mfe };
    return                       { outcome: 'open', pnlPct: markPnl, mfe_r: mfe };
  }
  function buy(entry, tp, sl) {
    if (low > entry) return null;
    const mfe = mfeR('BUY', entry, tp - entry);
    if (low <= sl) return { outcome: 'loss', pnlPct: -((entry - sl) / open * 100), mfe_r: mfe };
    const markPnl = (close - entry) / open * 100;
    const tpPnl   = (tp - entry)   / open * 100;
    if (markPnl >= tpPnl) return { outcome: 'win',  pnlPct: tpPnl,   mfe_r: mfe };
    if (markPnl  > 0)     return { outcome: 'win',  pnlPct: markPnl, mfe_r: mfe };
    return                       { outcome: 'open', pnlPct: markPnl, mfe_r: mfe };
  }

  let r = null, side = '';
  if (regime === 'BULL') {
    side = 'SELL'; r = sell(open + hl, open + oc, open + slD);
  } else if (regime === 'BEAR') {
    side = 'BUY';  r = buy(open - hl, open - oc, open - slD);
  } else {
    if (rangeMode === 'skip') return { filled: false, side: '', outcome: 'no_fill', pnlPct: 0, mfe_r: 0 };
    r = sell(open + hl, open, open + slD);
    if (r) { side = 'SELL'; }
    else   { r = buy(open - hl, open, open - slD); if (r) side = 'BUY'; }
  }

  return r
    ? { filled: true,  side, ...r, pnlPct: +r.pnlPct.toFixed(5) }
    : { filled: false, side: '',   outcome: 'no_fill', pnlPct: 0, mfe_r: 0 };
}

// ── Walk-forward engine ────────────────────────────────────────────────────────

function runBacktest(bars, assetClass, opts = {}) {
  const {
    dateFrom = '', dateTo = '', minLookback = 50,
    slMult = 1.5, slopeThresh = 0.002,
    bearMult = 1.0, rangeMode = 'fade_both',
  } = opts;
  const p      = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  const closes = bars.map(b => b.close);

  // Pre-compute vol sigma series O(n) — out[i] = sigma for predicting bar i.
  // commodity→HV20, index→GARCH(1,1), fx→YZ(30) — mirrors computeForecast().
  let volSigmas;
  if (assetClass === 'commodity') {
    const logRets = [];
    for (let j = 1; j < closes.length; j++) logRets.push(Math.log(closes[j] / closes[j - 1]));
    const hvVars = hvVarSeries(logRets, 20);
    volSigmas = new Float64Array(bars.length);
    for (let i = 2; i < bars.length; i++) volSigmas[i] = Math.sqrt(Math.max(hvVars[i - 2], 1e-12));
  } else if (assetClass === 'index') {
    volSigmas = garchSigmas(bars, p.garch_omega ?? 4.76e-6);
  } else {
    const yzFull = yzVolSeries(bars, 30);
    volSigmas = new Float64Array(bars.length);
    for (let i = 1; i < bars.length; i++) volSigmas[i] = yzFull[i - 1] || 1e-6;
  }

  const records = [];

  for (let i = minLookback; i < bars.length; i++) {
    const { date, open, high, low, close } = bars[i];
    if (dateFrom && date < dateFrom) continue;
    if (dateTo   && date > dateTo)   continue;

    const sigmaD = volSigmas[i];
    if (!sigmaD || sigmaD < 1e-8) continue;

    const hl75pct   = BM_P75 * p.hl_75_corr * sigmaD * 100;
    const ocMedPct  = HN_P50 * p.oc_corr    * sigmaD * 100;
    const regime    = classifyRegime(closes, i, 20, 5, slopeThresh, bearMult);
    const result    = simulateDay(open, high, low, close, hl75pct, ocMedPct, regime, slMult, rangeMode);

    records.push({
      date, regime,
      hl_75_pct:  +hl75pct.toFixed(4),
      oc_med_pct: +ocMedPct.toFixed(4),
      side:       result.side,
      filled:     result.filled,
      outcome:    result.outcome,
      pnl_pct:    result.pnlPct,
      mfe_r:      result.mfe_r ?? 0,
      open: +open.toFixed(6), high: +high.toFixed(6),
      low:  +low.toFixed(6),  close: +close.toFixed(6),
    });
  }
  return records;
}

// ── Public: run all instruments and return structured result ──────────────────

export { ewmaVarSeries, hvVarSeries, yzVolSeries, garchSigmas, classifyRegime, runBacktest, ASSET_PARAMS, LAMBDA, BM_P50, BM_P75, HN_P50, HN_P75, G_ALPHA, G_BETA };
export { fetchD1, fetchM1Range, fetchSessionOpenLondon, londonMidnightSec };

export async function runFullBacktest(opts = {}, instruments = INSTRUMENTS) {
  if (!process.env.OANDA_KEY) throw new Error('OANDA_KEY not set — cannot fetch D1 data');

  const allTrades = [];
  const log       = [];

  for (const cfg of instruments) {
    try {
      log.push(`Fetching ${cfg.name}…`);
      const bars   = await fetchD1(cfg.oanda, 5000);
      log.push(`  ${bars.length} bars (${bars[0]?.date} → ${bars.at(-1)?.date})`);
      const trades = runBacktest(bars, cfg.assetClass, opts).map(r => ({ instrument: cfg.name, ...r }));
      allTrades.push(...trades);
      log.push(`  ${trades.filter(t => t.filled).length} filled trades`);
    } catch (e) {
      log.push(`  Error: ${e.message}`);
    }
  }

  return { trades: allTrades, log };
}

export { INSTRUMENTS };
