/**
 * Vol & Range Walk-Forward Backtester — pure JavaScript engine.
 *
 * Strategy:
 *   Each day T (walk-forward, no lookahead):
 *     1. EWMA(λ=0.94) vol on closes[0..T-1] → σ_d
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

const ASSET_PARAMS = {
  commodity: { hl_75_corr: 0.989, oc_corr: 1.163, hl_50_corr: 0.985, oc_75_corr: 1.084 },
  index:     { hl_75_corr: 0.950, oc_corr: 1.111, hl_50_corr: 1.000, oc_75_corr: 1.099 },
  fx:        { hl_75_corr: 0.894, oc_corr: 0.948, hl_50_corr: 0.921, oc_75_corr: 0.932 },
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
  const p       = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  const closes  = bars.map(b => b.close);
  const records = [];

  for (let i = minLookback; i < bars.length; i++) {
    const { date, open, high, low, close } = bars[i];
    if (dateFrom && date < dateFrom) continue;
    if (dateTo   && date > dateTo)   continue;

    const logRet = [];
    for (let j = 1; j < i; j++) logRet.push(Math.log(closes[j] / closes[j - 1]));
    if (logRet.length < 20) continue;

    const varSeries = ewmaVarSeries(logRet);
    const sigmaD    = Math.sqrt(varSeries[varSeries.length - 1]);
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

export { ewmaVarSeries, classifyRegime, runBacktest, ASSET_PARAMS, LAMBDA, BM_P50, BM_P75, HN_P50, HN_P75 };
export { fetchD1 };

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
