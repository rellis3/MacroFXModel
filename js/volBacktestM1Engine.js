/**
 * Vol & Range Walk-Forward Backtester — M1 intraday simulation engine.
 *
 * Eliminates the D1 H/L ordering ambiguity by walking 1-minute bars
 * chronologically to resolve entry/TP/SL sequencing exactly.
 *
 * Vol (EWMA λ=0.94) and regime (EMA-20 slope) are still computed from
 * D1 close-to-close returns — no lookahead bias.
 *
 * M1 parquet files must be present in BT_M1_DIR before use.
 * Naming: {pair_lowercase}_m1.parquet  e.g. eurusd_m1.parquet
 * Parquet schema: [open, high, low, close, volume, datetime] (UTC ISO timestamps)
 */

import { readFileSync, existsSync } from 'fs';
import path                         from 'path';
import { fileURLToPath }            from 'url';
import { parquetRead, parquetMetadataAsync } from 'hyparquet';
import {
  ewmaVarSeries, classifyRegime, ASSET_PARAMS,
  BM_P75, HN_P50, fetchD1, INSTRUMENTS,
} from './volBacktestEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BT_M1_DIR = path.join(__dirname, '..', 'VolRangeForecaster', 'data', 'm1');

// ── Drive file IDs for all 25 M1 parquets ────────────────────────────────────

export const M1_DRIVE_IDS = {
  eurusd: '1ifk4hr5qOtDoREn8GqwmoO-L1r_cTYug',
  gbpusd: '1JbfcM6rM8gAOHYA1AAmucA4qyEcSpQO7',
  usdjpy: '1WYPHM9jOFOFIBd_688LQPB_I6L1cmB_4',
  audusd: '1dfemdaD1yfaTQUemzJWWt1kpzLyumebw',
  nzdusd: '1XDqS3sJN-89k-C63UQe4MAsWfAu3yZLb',
  usdcad: '1OzxAFB-H0ftdpZnGii_iGQsewqxTUHgh',
  usdchf: '1R8-llmn8gFdYnNEeDlLkOWu9q-TRD6dr',
  gbpjpy: '1lyb0suhTDc8-_KYEOUz0Nxyxz2fE-o-3',
  eurjpy: '1W1VbRu4SNM8rheMWODC0lpngOv34FFCt',
  eurgbp: '1JjIUUgL9_9v_fX7fKGi7Es4Ze8Ap1aol',
  euraud: '1NvQvPWMCX3iTgsGvjFJUwYdHbQa29zKy',
  eurcad: '1O4gfO-hoVlHk7ykFlrOizsz5-KVSkTUW',
  eurchf: '1os4a5a_zjYRlNbkysuMpKar-uu_6ZyXZ',
  eurnzd: '1DuNP1RxaMfO_3wZt1j75qaTnMpgg4Tiv',
  audjpy: '13f6Eq9WFTJ_p3ByY74He8ATOzj5Ikrgx',
  audnzd: '1UFoJPw1NsiTKQJFFTzkD18HqNjKLjNq7',
  audcad: '1OvE2p1tTGci4bEDqtjwJDz3NXG4XtXe1',
  audchf: '1uvO4eMVMhKV0KfeFHX_TC0FDyFql_hx8',
  gbpaud: '13DFKMNuUEHRJTiB9mzr_MyhgZbBrt2ZY',
  gbpcad: '1-_u_Gj5HVadZy69pdt5Sx6xTBiY0Cd2S',
  gbpchf: '1iqcUOaEGQauM3QYpFPYVASpbe_pCtvH6',
  gbpnzd: '17oqQKqwj2Kg7ShGXkQWDkvsu295UN5s2',
  cadjpy: '1P76U9kNYP51vmcIpq7aL-IEyjRdtc0OT',
  chfjpy: '10PBymXfhO4PdaxxZahreX5gdqOYQISCG',
  nzdjpy: '13DjEKFjT9vOwg7eBf6JTNz5G_CTM8zUG',
};

// ── Parquet loader ────────────────────────────────────────────────────────────

async function readM1Parquet(filePath) {
  const nodeBuf = readFileSync(filePath);
  const ab      = nodeBuf.buffer; // the Node Buffer's underlying ArrayBuffer
  const file    = {
    byteLength: ab.byteLength,
    slice: (start, end) => Promise.resolve(ab.slice(start, end)),
  };
  const meta = await parquetMetadataAsync(file);
  let rows;
  await parquetRead({ file, metadata: meta, onComplete: d => (rows = d) });
  // Each row: [open, high, low, close, volume, datetime_iso_string]
  return rows;
}

// Groups raw parquet rows into Map<'YYYY-MM-DD', [{open,high,low,close}]>
function groupByDate(rows) {
  const byDate = new Map();
  for (const row of rows) {
    const date = String(row[5]).substring(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({ time: String(row[5]), open: row[0], high: row[1], low: row[2], close: row[3] });
  }
  return byDate;
}

// ── M1 intraday simulation ────────────────────────────────────────────────────

/**
 * Walk M1 bars to simulate a single-sided limit order.
 * Returns { outcome, pnlPct } or null (limit never hit).
 * P&L expressed as % of the day's open price.
 */
function walkM1(bars, entryLevel, tpLevel, slLevel, isBuy, open) {
  let filled = false, fillTime = null;
  for (const bar of bars) {
    if (!filled) {
      if (isBuy ? bar.low <= entryLevel : bar.high >= entryLevel) {
        filled = true;
        fillTime = bar.time ?? null;
        if (isBuy) {
          if (bar.low  <= slLevel)  return { outcome: 'loss', pnlPct: -((entryLevel - slLevel) / open * 100), fillTime };
          if (bar.high >= tpLevel)  return { outcome: 'win',  pnlPct:   (tpLevel - entryLevel) / open * 100,  fillTime };
        } else {
          if (bar.high >= slLevel)  return { outcome: 'loss', pnlPct: -((slLevel - entryLevel) / open * 100), fillTime };
          if (bar.low  <= tpLevel)  return { outcome: 'win',  pnlPct:   (entryLevel - tpLevel) / open * 100,  fillTime };
        }
      }
    } else {
      if (isBuy) {
        if (bar.low  <= slLevel)  return { outcome: 'loss', pnlPct: -((entryLevel - slLevel) / open * 100), fillTime };
        if (bar.high >= tpLevel)  return { outcome: 'win',  pnlPct:   (tpLevel - entryLevel) / open * 100,  fillTime };
      } else {
        if (bar.high >= slLevel)  return { outcome: 'loss', pnlPct: -((slLevel - entryLevel) / open * 100), fillTime };
        if (bar.low  <= tpLevel)  return { outcome: 'win',  pnlPct:   (entryLevel - tpLevel) / open * 100,  fillTime };
      }
    }
  }
  if (!filled) return null;
  const eodClose = bars[bars.length - 1]?.close ?? entryLevel;
  const eodPnl   = isBuy
    ? (eodClose - entryLevel) / open * 100
    : (entryLevel - eodClose) / open * 100;
  return { outcome: 'open', pnlPct: eodPnl, fillTime };
}

function classifySession(isoTime) {
  if (!isoTime) return 'N/A';
  const h = parseInt(String(isoTime).substring(11, 13));
  if (h >= 22 || h < 7)  return 'Asia';
  if (h >= 7  && h < 13) return 'London';
  if (h >= 13 && h < 16) return 'Overlap';
  return 'NY';
}

// ── Reversal leg (current strategy: fade from HL75 back toward OC_med) ────────

function simulateDayM1(m1Bars, open, hl75pct, ocMedPct, regime, slMult = 1.5) {
  const hl  = open * hl75pct  / 100;
  const oc  = open * ocMedPct / 100;
  const slD = hl * slMult;

  let side = '', result = null;

  if (regime === 'BULL') {
    side   = 'SELL';
    result = walkM1(m1Bars, open + hl, open + oc, open + slD, false, open);
  } else if (regime === 'BEAR') {
    side   = 'BUY';
    result = walkM1(m1Bars, open - hl, open - oc, open - slD, true,  open);
  } else {
    // RANGE: walk bars to find which limit fills first (no H/L ordering assumption)
    const sellEntry = open + hl, buyEntry = open - hl;
    for (let i = 0; i < m1Bars.length; i++) {
      const bar = m1Bars[i];
      if (bar.high >= sellEntry) {
        side   = 'SELL';
        result = walkM1(m1Bars.slice(i), sellEntry, open, open + slD, false, open);
        if (!result) {
          const eod = m1Bars[m1Bars.length - 1]?.close ?? open;
          result = { outcome: 'open', pnlPct: (sellEntry - eod) / open * 100, fillTime: null };
        }
        break;
      } else if (bar.low <= buyEntry) {
        side   = 'BUY';
        result = walkM1(m1Bars.slice(i), buyEntry, open, open - slD, true, open);
        if (!result) {
          const eod = m1Bars[m1Bars.length - 1]?.close ?? open;
          result = { outcome: 'open', pnlPct: (eod - buyEntry) / open * 100, fillTime: null };
        }
        break;
      }
    }
  }

  if (!result) return { filled: false, side: '', outcome: 'no_fill', pnlPct: 0, leg: 'reversal', fillTime: null };
  return { filled: true, side, ...result, pnlPct: +result.pnlPct.toFixed(5), leg: 'reversal', fillTime: result.fillTime ?? null };
}

// ── Momentum leg (optional): trade WITH regime toward HL75 ────────────────────
//
// BULL: BUY on pullback to open − pullback×OC, TP = open + HL75, SL = open − slMult×OC
// BEAR: SELL on bounce to open + pullback×OC, TP = open − HL75, SL = open + slMult×OC
// RANGE: no trade (regime direction is unclear)
//
// With pullback=0 the entry equals open — fills immediately on the first bar.
// Risk:reward ≈ HL75 / OC_med ≈ 2.5–3:1, so break-even win rate is ~25–30%.

function simulateMomentumM1(m1Bars, open, hl75pct, ocMedPct, regime, opts = {}) {
  const { momentumPullback = 0, momentumSlMult = 1.0 } = opts;
  const hl = open * hl75pct  / 100;
  const oc = open * ocMedPct / 100;

  if (regime === 'RANGE') return { filled: false, side: '', outcome: 'no_fill', pnlPct: 0, leg: 'momentum' };

  const isBull     = regime === 'BULL';
  const side       = isBull ? 'BUY' : 'SELL';
  const entryLevel = isBull ? open - momentumPullback * oc : open + momentumPullback * oc;
  const tpLevel    = isBull ? open + hl                    : open - hl;
  const slLevel    = isBull ? open - momentumSlMult * oc   : open + momentumSlMult * oc;

  const result = walkM1(m1Bars, entryLevel, tpLevel, slLevel, isBull, open);
  if (!result) return { filled: false, side: '', outcome: 'no_fill', pnlPct: 0, leg: 'momentum', fillTime: null };
  return { filled: true, side, ...result, pnlPct: +result.pnlPct.toFixed(5), leg: 'momentum', fillTime: result.fillTime ?? null };
}

// ── Walk-forward engine (M1 sim + D1 vol/regime) ──────────────────────────────

function runM1Backtest(d1Bars, m1ByDate, assetClass, opts = {}) {
  const {
    dateFrom = '', dateTo = '', minLookback = 50,
    slMult = 1.5, slopeThresh = 0.002,
    strategy = 'reversal',                  // 'reversal' | 'momentum' | 'both'
    momentumPullback = 0, momentumSlMult = 1.0,
    spreadPct = 0,
  } = opts;
  const p      = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  const closes = d1Bars.map(b => b.close);
  const records = [];

  for (let i = minLookback; i < d1Bars.length; i++) {
    const { date, open, high, low, close } = d1Bars[i];
    if (dateFrom && date < dateFrom) continue;
    if (dateTo   && date > dateTo)   continue;

    const logRet = [];
    for (let j = 1; j < i; j++) logRet.push(Math.log(closes[j] / closes[j - 1]));
    if (logRet.length < 20) continue;

    const varSeries = ewmaVarSeries(logRet);
    const sigmaD    = Math.sqrt(varSeries[varSeries.length - 1]);
    const hl75pct   = BM_P75 * p.hl_75_corr * sigmaD * 100;
    const ocMedPct  = HN_P50 * p.oc_corr    * sigmaD * 100;
    const regime    = classifyRegime(closes, i, 20, 5, slopeThresh);

    const m1Bars   = m1ByDate?.get(date) ?? null;
    const useM1    = !!(m1Bars && m1Bars.length >= 10);
    const moOpts   = { momentumPullback, momentumSlMult };

    const base = {
      date, regime,
      hl_75_pct:  +hl75pct.toFixed(4),
      oc_med_pct: +ocMedPct.toFixed(4),
      m1_sim:     useM1,
      open: +open.toFixed(6), high: +high.toFixed(6),
      low:  +low.toFixed(6),  close: +close.toFixed(6),
    };

    const legResults = [];
    if (strategy !== 'momentum') {
      const r = useM1
        ? simulateDayM1(m1Bars, open, hl75pct, ocMedPct, regime, slMult)
        : _simulateDayD1(open, high, low, close, hl75pct, ocMedPct, regime, slMult);
      legResults.push(r);
    }
    if (strategy !== 'reversal') {
      const r = useM1
        ? simulateMomentumM1(m1Bars, open, hl75pct, ocMedPct, regime, moOpts)
        : _simulateMomentumD1(open, high, low, close, hl75pct, ocMedPct, regime, moOpts);
      legResults.push(r);
    }

    for (const r of legResults) {
      const costAdj = r.filled ? r.pnlPct - spreadPct : 0;
      const dow = new Date(date + 'T00:00:00Z').getUTCDay(); // 0=Sun…6=Sat
      records.push({
        ...base,
        side: r.side, filled: r.filled, outcome: r.outcome,
        pnl_pct: r.filled ? +costAdj.toFixed(5) : 0,
        leg: r.leg,
        fill_time: r.fillTime ?? null,
        session: classifySession(r.fillTime),
        dow,
      });
    }
  }
  return records;
}

// ── D1 fallback: reversal ─────────────────────────────────────────────────────

function _simulateDayD1(open, high, low, close, hl75pct, ocMedPct, regime, slMult) {
  const hl  = open * hl75pct  / 100;
  const oc  = open * ocMedPct / 100;
  const slD = hl * slMult;

  function sell(entry, tp, sl) {
    if (high < entry) return null;
    if (high >= sl)   return { outcome: 'loss', pnlPct: -((sl - entry) / open * 100) };
    // Use EOD close for TP: tp > open >= low, so low<=tp is always true (trivial false win).
    if (close <= tp)  return { outcome: 'win',  pnlPct:  (entry - tp)  / open * 100 };
    return              { outcome: 'open', pnlPct:  (entry - close) / open * 100 };
  }
  function buy(entry, tp, sl) {
    if (low > entry)  return null;
    if (low  <= sl)   return { outcome: 'loss', pnlPct: -((entry - sl) / open * 100) };
    // tp < open <= high, so high>=tp is always true (trivial false win).
    if (close >= tp)  return { outcome: 'win',  pnlPct:  (tp - entry)  / open * 100 };
    return              { outcome: 'open', pnlPct:  (close - entry) / open * 100 };
  }

  let r = null, side = '';
  if (regime === 'BULL') {
    side = 'SELL'; r = sell(open + hl, open + oc, open + slD);
  } else if (regime === 'BEAR') {
    side = 'BUY';  r = buy(open - hl,  open - oc,  open - slD);
  } else {
    r = sell(open + hl, open, open + slD);
    if (r) { side = 'SELL'; }
    else   { r = buy(open - hl, open, open - slD); if (r) side = 'BUY'; }
  }

  return r
    ? { filled: true,  side, ...r, pnlPct: +r.pnlPct.toFixed(5), leg: 'reversal' }
    : { filled: false, side: '',   outcome: 'no_fill', pnlPct: 0,  leg: 'reversal' };
}

// ── D1 fallback: momentum ─────────────────────────────────────────────────────

function _simulateMomentumD1(open, high, low, close, hl75pct, ocMedPct, regime, opts = {}) {
  const { momentumPullback = 0, momentumSlMult = 1.0 } = opts;
  const hl = open * hl75pct  / 100;
  const oc = open * ocMedPct / 100;

  if (regime === 'RANGE') return { filled: false, side: '', outcome: 'no_fill', pnlPct: 0, leg: 'momentum' };

  const isBull     = regime === 'BULL';
  const side       = isBull ? 'BUY' : 'SELL';
  const entryLevel = isBull ? open - momentumPullback * oc : open + momentumPullback * oc;
  const tpLevel    = isBull ? open + hl                    : open - hl;
  const slLevel    = isBull ? open - momentumSlMult * oc   : open + momentumSlMult * oc;

  let r;
  if (isBull) {
    if (low > entryLevel) return { filled: false, side: '', outcome: 'no_fill', pnlPct: 0, leg: 'momentum' };
    if (low  <= slLevel)  r = { outcome: 'loss', pnlPct: -((entryLevel - slLevel) / open * 100) };
    else if (high >= tpLevel) r = { outcome: 'win',  pnlPct:  (tpLevel - entryLevel) / open * 100 };
    else                  r = { outcome: 'open', pnlPct:  (close - entryLevel) / open * 100 };
  } else {
    if (high < entryLevel) return { filled: false, side: '', outcome: 'no_fill', pnlPct: 0, leg: 'momentum' };
    if (high >= slLevel)  r = { outcome: 'loss', pnlPct: -((slLevel - entryLevel) / open * 100) };
    else if (low <= tpLevel)  r = { outcome: 'win',  pnlPct:  (entryLevel - tpLevel) / open * 100 };
    else                  r = { outcome: 'open', pnlPct:  (entryLevel - close) / open * 100 };
  }

  return { filled: true, side, ...r, pnlPct: +r.pnlPct.toFixed(5), leg: 'momentum' };
}

// ── Public: run all instruments with M1 data where available ─────────────────

export async function runFullM1Backtest(opts = {}, instruments = INSTRUMENTS, m1Dir = BT_M1_DIR) {
  if (!process.env.OANDA_KEY) throw new Error('OANDA_KEY not set — cannot fetch D1 data');

  const allTrades = [];
  const log       = [];

  for (const cfg of instruments) {
    try {
      log.push(`Fetching D1 ${cfg.name}…`);
      const d1Bars = await fetchD1(cfg.oanda, 5000);
      log.push(`  ${d1Bars.length} D1 bars (${d1Bars[0]?.date} → ${d1Bars.at(-1)?.date})`);

      // Load M1 parquet if present
      const pairKey  = cfg.name.toLowerCase().replace('/', '');
      const m1File   = path.join(m1Dir, `${pairKey}_m1.parquet`);
      let   m1ByDate = null;

      if (existsSync(m1File)) {
        log.push(`  Loading M1 parquet (${(readFileSync(m1File).length / 1e6).toFixed(1)} MB)…`);
        const rows = await readM1Parquet(m1File);
        m1ByDate   = groupByDate(rows);
        log.push(`  ${rows.length.toLocaleString()} M1 bars across ${m1ByDate.size} dates`);
      } else {
        log.push(`  No M1 parquet — falling back to D1 simulation`);
      }

      const trades = runM1Backtest(d1Bars, m1ByDate, cfg.assetClass, opts)
        .map(r => ({ instrument: cfg.name, ...r }));
      allTrades.push(...trades);

      const nM1    = trades.filter(t => t.filled && t.m1_sim).length;
      const nFill  = trades.filter(t => t.filled).length;
      log.push(`  ${nFill} filled trades (${nM1} via M1, ${nFill - nM1} via D1 fallback)`);
    } catch (e) {
      log.push(`  Error: ${e.message}`);
    }
  }

  return { trades: allTrades, log };
}

export { INSTRUMENTS };
