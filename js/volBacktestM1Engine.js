/**
 * Vol & Range Walk-Forward Backtester — M1 intraday simulation engine.
 *
 * Eliminates the D1 H/L ordering ambiguity by walking 1-minute bars
 * chronologically to resolve entry/TP/SL sequencing exactly.
 *
 * Vol (EWMA λ=0.94) and regime (EMA-20 slope) are still computed from
 * D1 close-to-close returns — no lookahead bias.
 *
 * M1 data source priority: R2 (set R2_ACCESS_KEY + R2_SECRET_KEY env vars) → local BT_M1_DIR → Google Drive.
 * Naming: {pair_lowercase}_m1.parquet  e.g. eurusd_m1.parquet
 * Parquet schema: [open, high, low, close, volume, datetime] (UTC ISO timestamps)
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import path                         from 'path';
import { fileURLToPath }            from 'url';
import { parquetRead, parquetMetadataAsync } from 'hyparquet';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  ewmaVarSeries, classifyRegime, ASSET_PARAMS,
  BM_P50, BM_P75, HN_P50, HN_P75, fetchD1, INSTRUMENTS,
} from './volBacktestEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BT_M1_DIR = path.join(__dirname, '..', 'VolRangeForecaster', 'data', 'm1');

const R2_ENDPOINT   = process.env.R2_ENDPOINT || 'https://3e867110ae519cd24afc877c72e5026e.r2.cloudflarestorage.com';
const R2_BUCKET     = process.env.R2_BUCKET   || 'r2-storage';
const R2_KEY_PREFIX = process.env.R2_KEY_PREFIX || 'm1';

function makeR2Client() {
  const accessKeyId     = process.env.R2_ACCESS_KEY;
  const secretAccessKey = process.env.R2_SECRET_KEY;
  if (!accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    endpoint: R2_ENDPOINT,
    region: 'auto',
    credentials: { accessKeyId, secretAccessKey },
    requestHandler: { connectionTimeout: 10_000 },
  });
}

// Returns ArrayBuffer on success, throws on R2 error (caller decides whether to fall through).
// Uses transformToByteArray() (SDK built-in) rather than manual chunk iteration — more reliable
// for large files. Retries once on transient failures.
async function fetchFromR2(pairKey) {
  const client = makeR2Client();
  if (!client) return null; // credentials not set — skip silently
  const key = `${R2_KEY_PREFIX}/${pairKey}_m1.parquet`;
  const cmd  = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`[M1] R2 fetch ${pairKey} (attempt ${attempt}) bucket=${R2_BUCKET} key=${key}`);
      const resp  = await client.send(cmd);
      const bytes = await resp.Body.transformToByteArray();
      const buf   = Buffer.from(bytes);
      console.log(`[M1] R2 OK: ${pairKey} (${(buf.length / 1e6).toFixed(1)} MB)`);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    } catch (err) {
      if (attempt === 2) throw err; // re-throw after second failure
      console.warn(`[M1] R2 attempt ${attempt} failed for ${pairKey}: ${err?.message} — retrying`);
    }
  }
}

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

// Google Drive fallback — for Railway environments without R2 credentials.
// Downloads the public parquet file, saves it to m1Dir so re-fetches within
// the same session hit disk instead of Drive again.
async function fetchFromDrive(pairKey, saveDir = BT_M1_DIR) {
  const id = M1_DRIVE_IDS[pairKey];
  if (!id) return null;
  try {
    const url = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
    console.log(`[M1] Downloading ${pairKey} from Google Drive (${id})…`);
    const resp = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('text/html')) throw new Error('Got HTML — file may not be publicly shared');
    const buf = Buffer.from(await resp.arrayBuffer());
    console.log(`[M1] Drive download OK: ${pairKey} (${(buf.length / 1e6).toFixed(1)} MB)`);
    try {
      mkdirSync(saveDir, { recursive: true });
      writeFileSync(path.join(saveDir, `${pairKey}_m1.parquet`), buf);
    } catch {}
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } catch (err) {
    console.warn(`[M1] Drive download failed for ${pairKey}: ${err?.message ?? err}`);
    return null;
  }
}

// ── Parquet loader ────────────────────────────────────────────────────────────

async function readM1Parquet(source) {
  let ab;
  if (source instanceof ArrayBuffer) {
    ab = source;
  } else {
    const nodeBuf = readFileSync(source);
    ab = nodeBuf.buffer.slice(nodeBuf.byteOffset, nodeBuf.byteOffset + nodeBuf.byteLength);
  }
  const file = {
    byteLength: ab.byteLength,
    slice: (start, end) => Promise.resolve(ab.slice(start, end)),
  };
  const meta = await parquetMetadataAsync(file);
  let rows;
  await parquetRead({ file, metadata: meta, onComplete: d => (rows = d) });
  return rows;
}

// Groups raw parquet rows into Map<'YYYY-MM-DD', [{open,high,low,close}]>
// row[5] is a Date object from hyparquet; use .toISOString() to get a stable
// ISO string instead of the locale-dependent Date.toString() output.
function groupByDate(rows) {
  const byDate = new Map();
  for (const row of rows) {
    const dt   = row[5] instanceof Date
      ? row[5].toISOString().substring(0, 19)
      : String(row[5]).substring(0, 19).replace(' ', 'T');
    const date = dt.substring(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({ time: dt, open: row[0], high: row[1], low: row[2], close: row[3] });
  }
  return byDate;
}

// ── M1 intraday simulation ────────────────────────────────────────────────────

/**
 * Walk M1 bars to simulate a single-sided limit order.
 * Returns { outcome, pnlPct } or null (limit never hit).
 * P&L expressed as % of the day's open price.
 *
 * dynHlCorr (0–1): when set, TP is scaled to the fill-bar's actual extreme
 * rather than the pre-computed OC_med level.  Empirically ~0.65 for FX.
 * Formula: tp = open ± |actualExtreme − open| × (1 − dynHlCorr)
 * At forecast extreme this ≈ OC_med; overshoots push TP proportionally further.
 */
function walkM1(bars, entryLevel, tpLevel, slLevel, isBuy, open, dynHlCorr = 0) {
  let filled = false, fillTime = null;
  let effectiveTp = tpLevel;
  for (const bar of bars) {
    if (!filled) {
      if (isBuy ? bar.low <= entryLevel : bar.high >= entryLevel) {
        filled = true;
        fillTime = bar.time ?? null;
        // Dynamic TP: scale based on actual fill-bar extreme vs open
        if (dynHlCorr > 0) {
          const actualFromOpen = isBuy
            ? Math.abs(bar.low  - open)
            : Math.abs(bar.high - open);
          effectiveTp = isBuy
            ? open + actualFromOpen * (1 - dynHlCorr)
            : open - actualFromOpen * (1 - dynHlCorr);
        }
        if (isBuy) {
          if (bar.low  <= slLevel)      return { outcome: 'loss', pnlPct: -((entryLevel - slLevel) / open * 100), fillTime, exitTime: bar.time };
          if (bar.high >= effectiveTp)  return { outcome: 'win',  pnlPct:   (effectiveTp - entryLevel) / open * 100,  fillTime, exitTime: bar.time };
        } else {
          if (bar.high >= slLevel)      return { outcome: 'loss', pnlPct: -((slLevel - entryLevel) / open * 100), fillTime, exitTime: bar.time };
          if (bar.low  <= effectiveTp)  return { outcome: 'win',  pnlPct:   (entryLevel - effectiveTp) / open * 100,  fillTime, exitTime: bar.time };
        }
      }
    } else {
      if (isBuy) {
        if (bar.low  <= slLevel)      return { outcome: 'loss', pnlPct: -((entryLevel - slLevel) / open * 100), fillTime, exitTime: bar.time };
        if (bar.high >= effectiveTp)  return { outcome: 'win',  pnlPct:   (effectiveTp - entryLevel) / open * 100,  fillTime, exitTime: bar.time };
      } else {
        if (bar.high >= slLevel)      return { outcome: 'loss', pnlPct: -((slLevel - entryLevel) / open * 100), fillTime, exitTime: bar.time };
        if (bar.low  <= effectiveTp)  return { outcome: 'win',  pnlPct:   (entryLevel - effectiveTp) / open * 100,  fillTime, exitTime: bar.time };
      }
    }
  }
  if (!filled) return null;
  const eodClose  = bars[bars.length - 1]?.close ?? entryLevel;
  const eodPnl    = isBuy
    ? (eodClose - entryLevel) / open * 100
    : (entryLevel - eodClose) / open * 100;
  const eodTime   = bars[bars.length - 1]?.time ?? null;
  return { outcome: 'open', pnlPct: eodPnl, fillTime, exitTime: eodTime };
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

function simulateDayM1(m1Bars, open, hl75pct, ocMedPct, regime, slMult = 1.5, dynHlCorr = 0, rangeMode = 'fade_both') {
  const hl  = open * hl75pct  / 100;
  const oc  = open * ocMedPct / 100;
  const slD = hl * slMult;

  let side = '', result = null;

  if (regime === 'BULL') {
    side   = 'SELL';
    result = walkM1(m1Bars, open + hl, open + oc, open + slD, false, open, dynHlCorr);
  } else if (regime === 'BEAR') {
    side   = 'BUY';
    result = walkM1(m1Bars, open - hl, open - oc, open - slD, true, open, dynHlCorr);
  } else {
    // RANGE
    if (rangeMode === 'skip') return { filled: false, side: '', outcome: 'no_fill', pnlPct: 0, leg: 'reversal', fillTime: null };
    // fade_both: walk bars to find which limit fills first
    const sellEntry = open + hl, buyEntry = open - hl;
    for (let i = 0; i < m1Bars.length; i++) {
      const bar = m1Bars[i];
      if (bar.high >= sellEntry) {
        side   = 'SELL';
        result = walkM1(m1Bars.slice(i), sellEntry, open, open + slD, false, open, dynHlCorr);
        if (!result) {
          const eod = m1Bars[m1Bars.length - 1]?.close ?? open;
          result = { outcome: 'open', pnlPct: (sellEntry - eod) / open * 100, fillTime: null, exitTime: m1Bars[m1Bars.length - 1]?.time ?? null };
        }
        break;
      } else if (bar.low <= buyEntry) {
        side   = 'BUY';
        result = walkM1(m1Bars.slice(i), buyEntry, open, open - slD, true, open, dynHlCorr);
        if (!result) {
          const eod = m1Bars[m1Bars.length - 1]?.close ?? open;
          result = { outcome: 'open', pnlPct: (eod - buyEntry) / open * 100, fillTime: null, exitTime: m1Bars[m1Bars.length - 1]?.time ?? null };
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

// ── Momentum50 leg: enter at HL50 in regime direction, TP = HL75, SL = 1:1 ────
//
// BULL: stop-BUY when price rises to open+HL50, TP = open+HL75, SL = open+HL50−gap
// BEAR: stop-SELL when price drops to open−HL50, TP = open−HL75, SL = open−HL50+gap
// RANGE: skipped — no directional conviction, would be a coin flip at 1:1
//
// Gap = HL75 − HL50 ≈ 0.3σ. Risk:reward = 1:1, so needs >50% win rate.

function simulateMomentum50M1(m1Bars, open, hl50pct, hl75pct, regime) {
  if (regime === 'RANGE') return { filled: false, side: '', outcome: 'no_fill', pnlPct: 0, leg: 'momentum50', fillTime: null, exitTime: null };
  const hl50 = open * hl50pct / 100;
  const hl75 = open * hl75pct / 100;
  const gap  = hl75 - hl50;                    // profit distance = SL distance

  let side = '', entryL, tpL, slL, isBull = null;

  if (regime === 'BULL') {
    isBull = true;  side = 'BUY';
    entryL = open + hl50;
    tpL    = open + hl75;
    slL    = open + hl50 - gap;                 // = open + 2×hl50 − hl75
  } else if (regime === 'BEAR') {
    isBull = false; side = 'SELL';
    entryL = open - hl50;
    tpL    = open - hl75;
    slL    = open - hl50 + gap;                 // = open − 2×hl50 + hl75
  }

  let filled = false, fillTime = null;
  for (const bar of m1Bars) {
    if (!filled) {
      if (isBull ? bar.high < entryL : bar.low > entryL) continue;
      filled = true; fillTime = bar.time;
    }
    if (isBull) {
      if (bar.low  <= slL) return { filled: true, side, outcome: 'loss', pnlPct: +(-(entryL - slL) / open * 100).toFixed(5), leg: 'momentum50', fillTime, exitTime: bar.time };
      if (bar.high >= tpL) return { filled: true, side, outcome: 'win',  pnlPct: +( (tpL - entryL) / open * 100).toFixed(5),  leg: 'momentum50', fillTime, exitTime: bar.time };
    } else {
      if (bar.high >= slL) return { filled: true, side, outcome: 'loss', pnlPct: +(-(slL - entryL) / open * 100).toFixed(5), leg: 'momentum50', fillTime, exitTime: bar.time };
      if (bar.low  <= tpL) return { filled: true, side, outcome: 'win',  pnlPct: +( (entryL - tpL) / open * 100).toFixed(5),  leg: 'momentum50', fillTime, exitTime: bar.time };
    }
  }
  if (!filled) return { filled: false, side: '', outcome: 'no_fill', pnlPct: 0, leg: 'momentum50', fillTime: null, exitTime: null };
  const eod     = m1Bars[m1Bars.length - 1]?.close ?? entryL;
  const eodPnl  = isBull ? (eod - entryL) / open * 100 : (entryL - eod) / open * 100;
  const eodTime = m1Bars[m1Bars.length - 1]?.time ?? null;
  return { filled: true, side, outcome: 'open', pnlPct: +eodPnl.toFixed(5), leg: 'momentum50', fillTime, exitTime: eodTime };
}

// ── Reversal50 leg: dynamic anchor from developing intraday extreme ────────────
//
// Teacher's methodology: track running_high and running_low bar-by-bar.
// Once an extreme is established (≥30% of HL50 from open), fade a HL50
// retracement from it — expecting mean reversion back to that extreme.
//
// BUY: runHigh established → price drops HL50 from it → entry at runHigh−HL50
//      TP = runHigh (full HL50 recovery), SL = runHigh−HL75 (range extension)
// SELL: runLow established → price rallies HL50 from it → entry at runLow+HL50
//      TP = runLow, SL = runLow+HL75
//
// No regime filter. One fill per day (first signal wins).
// R:R ≈ 3.8:1 (TP = HL50, SL = HL75−HL50). Dynamic anchor should give better
// win rate than open-anchored version because entry is at a real intraday pivot.

function simulateReversal50M1(m1Bars, open, hl50pct, hl75pct) {
  const hl50    = open * hl50pct / 100;
  const hl75    = open * hl75pct / 100;
  const minMove = hl50 * 0.3;  // extreme must be ≥30% of HL50 from open before triggering

  let runHigh = open, runLow = open;
  let filled = false, side = '', entryL = 0, tpL = 0, slL = 0, isBull = null;
  let fillTime = null;

  for (const bar of m1Bars) {
    if (!filled) {
      // Check signals using extremes from PREVIOUS bars (update after check)
      if (runHigh >= open + minMove && bar.low <= runHigh - hl50) {
        filled = true; side = 'BUY'; isBull = true;
        entryL = runHigh - hl50; tpL = runHigh; slL = runHigh - hl75;
        fillTime = bar.time;
        // Check TP/SL on the fill bar itself
        if (bar.low  <= slL) return { filled: true, side, outcome: 'loss', pnlPct: +(-((entryL - slL) / open * 100)).toFixed(5), leg: 'reversal50', fillTime, exitTime: bar.time };
        if (bar.high >= tpL) return { filled: true, side, outcome: 'win',  pnlPct: +((tpL - entryL)   / open * 100).toFixed(5),  leg: 'reversal50', fillTime, exitTime: bar.time };
      } else if (runLow <= open - minMove && bar.high >= runLow + hl50) {
        filled = true; side = 'SELL'; isBull = false;
        entryL = runLow + hl50; tpL = runLow; slL = runLow + hl75;
        fillTime = bar.time;
        if (bar.high >= slL) return { filled: true, side, outcome: 'loss', pnlPct: +(-((slL - entryL) / open * 100)).toFixed(5),  leg: 'reversal50', fillTime, exitTime: bar.time };
        if (bar.low  <= tpL) return { filled: true, side, outcome: 'win',  pnlPct: +((entryL - tpL)   / open * 100).toFixed(5),   leg: 'reversal50', fillTime, exitTime: bar.time };
      }
      if (bar.high > runHigh) runHigh = bar.high;
      if (bar.low  < runLow)  runLow  = bar.low;
    } else {
      if (isBull) {
        if (bar.low  <= slL) return { filled: true, side, outcome: 'loss', pnlPct: +(-((entryL - slL) / open * 100)).toFixed(5), leg: 'reversal50', fillTime, exitTime: bar.time };
        if (bar.high >= tpL) return { filled: true, side, outcome: 'win',  pnlPct: +((tpL - entryL)   / open * 100).toFixed(5),  leg: 'reversal50', fillTime, exitTime: bar.time };
      } else {
        if (bar.high >= slL) return { filled: true, side, outcome: 'loss', pnlPct: +(-((slL - entryL) / open * 100)).toFixed(5),  leg: 'reversal50', fillTime, exitTime: bar.time };
        if (bar.low  <= tpL) return { filled: true, side, outcome: 'win',  pnlPct: +((entryL - tpL)   / open * 100).toFixed(5),   leg: 'reversal50', fillTime, exitTime: bar.time };
      }
    }
  }

  if (!filled) return { filled: false, side: '', outcome: 'no_fill', pnlPct: 0, leg: 'reversal50', fillTime: null, exitTime: null };
  const eod     = m1Bars[m1Bars.length - 1]?.close ?? entryL;
  const eodPnl  = isBull ? (eod - entryL) / open * 100 : (entryL - eod) / open * 100;
  const eodTime = m1Bars[m1Bars.length - 1]?.time ?? null;
  return { filled: true, side, outcome: 'open', pnlPct: +eodPnl.toFixed(5), leg: 'reversal50', fillTime, exitTime: eodTime };
}

// ── RevHL50 leg: open-anchored fade at HL50 back to open ─────────────────────
//
// When price reaches open±HL50, fade it back to open.
// Entry: first HL50 hit from open (either direction).
// TP:    open (full mean reversion — HL50 profit distance).
// SL:    open±HL75 (HL75−HL50 ≈ 0.38σ risk distance).
//
// revMode='all':     take the first HL50 hit in either direction.
// revMode='counter': skip with-trend hits — on BULL only take BUY from low;
//                    on BEAR only take SELL from high; RANGE takes either.
//                    Filters out days where momentum is most likely to push
//                    HL50 through to HL75, reducing SL hits.
//
// No regime filter in 'all' mode. R:R ≈ 3.8:1. Break-even ≈ 21%.

function simulateRevHL50M1(m1Bars, open, hl50pct, hl75pct, regime = 'RANGE', revMode = 'all') {
  const hl50 = open * hl50pct / 100;
  const hl75 = open * hl75pct / 100;

  // Determine which sides are allowed based on revMode
  const allowHigh = revMode === 'all' || regime !== 'BULL';   // skip SELL on BULL days in counter mode
  const allowLow  = revMode === 'all' || regime !== 'BEAR';   // skip BUY  on BEAR days in counter mode

  if (!allowHigh && !allowLow) return { filled: false, side: '', outcome: 'no_fill', pnlPct: 0, leg: 'revHL50', fillTime: null, exitTime: null };

  let filled = false, side = '', isBull = null;
  let entryL, tpL, slL, fillTime;

  for (const bar of m1Bars) {
    if (!filled) {
      if (allowHigh && bar.high >= open + hl50) {
        filled = true; side = 'SELL'; isBull = false;
        entryL = open + hl50; tpL = open; slL = open + hl75;
        fillTime = bar.time;
        if (bar.high >= slL) return { filled: true, side, outcome: 'loss', pnlPct: +(-((slL - entryL) / open * 100)).toFixed(5), leg: 'revHL50', fillTime, exitTime: bar.time };
        if (bar.low  <= tpL) return { filled: true, side, outcome: 'win',  pnlPct: +((entryL - tpL)   / open * 100).toFixed(5),  leg: 'revHL50', fillTime, exitTime: bar.time };
      } else if (allowLow && bar.low <= open - hl50) {
        filled = true; side = 'BUY'; isBull = true;
        entryL = open - hl50; tpL = open; slL = open - hl75;
        fillTime = bar.time;
        if (bar.low  <= slL) return { filled: true, side, outcome: 'loss', pnlPct: +(-((entryL - slL) / open * 100)).toFixed(5), leg: 'revHL50', fillTime, exitTime: bar.time };
        if (bar.high >= tpL) return { filled: true, side, outcome: 'win',  pnlPct: +((tpL - entryL)   / open * 100).toFixed(5),  leg: 'revHL50', fillTime, exitTime: bar.time };
      }
    } else {
      if (isBull) {
        if (bar.low  <= slL) return { filled: true, side, outcome: 'loss', pnlPct: +(-((entryL - slL) / open * 100)).toFixed(5), leg: 'revHL50', fillTime, exitTime: bar.time };
        if (bar.high >= tpL) return { filled: true, side, outcome: 'win',  pnlPct: +((tpL - entryL)   / open * 100).toFixed(5),  leg: 'revHL50', fillTime, exitTime: bar.time };
      } else {
        if (bar.high >= slL) return { filled: true, side, outcome: 'loss', pnlPct: +(-((slL - entryL) / open * 100)).toFixed(5), leg: 'revHL50', fillTime, exitTime: bar.time };
        if (bar.low  <= tpL) return { filled: true, side, outcome: 'win',  pnlPct: +((entryL - tpL)   / open * 100).toFixed(5),  leg: 'revHL50', fillTime, exitTime: bar.time };
      }
    }
  }

  if (!filled) return { filled: false, side: '', outcome: 'no_fill', pnlPct: 0, leg: 'revHL50', fillTime: null, exitTime: null };
  const eod     = m1Bars[m1Bars.length - 1]?.close ?? entryL;
  const eodPnl  = isBull ? (eod - entryL) / open * 100 : (entryL - eod) / open * 100;
  const eodTime = m1Bars[m1Bars.length - 1]?.time ?? null;
  return { filled: true, side, outcome: 'open', pnlPct: +eodPnl.toFixed(5), leg: 'revHL50', fillTime, exitTime: eodTime };
}

// ── Dynamic-anchor strategy ───────────────────────────────────────────────────
//
// Lesson methodology: track running_high and running_low bar-by-bar.
// SELL: from running LOW, project UP by hl50 → forecasted HIGH.
//       Entry when price hits it (guard: must be above open). TP=open. SL=LL×(1+hl75).
// BUY:  from running HIGH, project DOWN by hl50 → forecasted LOW.
//       Entry when price hits it (guard: must be below open). TP=open. SL=HH×(1-hl75).
// Re-anchors automatically: each new HH slides the BUY level down;
// each new LL slides the SELL level up.
// One fill per day, SELL checked before BUY.

// ── ATR from D1 bars (Wilder) ─────────────────────────────────────────────────

function _d1Atr(d1Bars, idx, period = 14) {
  if (idx < 2 || period < 1) return 0;
  const end   = Math.min(idx, d1Bars.length);
  const start = Math.max(1, end - period * 3);
  const bars  = d1Bars.slice(start, end);
  if (bars.length < 2) return bars[0] ? bars[0].high - bars[0].low : 0;
  const trs = [];
  for (let i = 1; i < bars.length; i++) {
    trs.push(Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low  - bars[i - 1].close),
    ));
  }
  if (trs.length < period) return trs.reduce((s, v) => s + v, 0) / trs.length;
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trs.length; i++) atr = (atr * (period - 1) + trs[i]) / period;
  return atr;
}


// ── Exhaustion Fade — entries at vol-forecast levels, ATR stop, flexible TP ───
//
// Fades extensions from the day open at any combination of:
//   HL50  (BM 50th pct range)  · HL75  (BM 75th pct range)
//   OC_med (HN 50th pct O-C)   · OC_75 (HN 75th pct O-C)
//
// Stop-loss:  D1 ATR(N) × atrMult  (volatility-calibrated, not a vol level)
// Take-profit modes:
//   fixedRR    — TP = SL_dist × rrRatio in trade direction
//   chandelier — exit when price retraces mfeRetracePct of max-favourable move
//                (needs MFE > 0.5 × SL before activating, avoids premature exit)
//   hybrid     — take the earlier of: maxRR hard cap OR chandelier activation
//
// blowThrough — when SL is hit, advance to the next extension level in the same
//               direction and watch for entry there (models "trade the next level")
//
// Returns an array of trade records (can be >1 per day when blowThrough fires).

// Simulate a single exhaustion entry level for one side independently.
// Each (level × side) is run separately so every level can trade once per day
// without blocking other levels.  Returns one record (filled or no_fill).
function _simExhaustionLevel(m1Bars, side, entry, sl, sessionOpen, open, tpOpts) {
  const { tpMode, rrRatio, mfeRetracePct, maxRR } = tpOpts;
  const slDist = Math.abs(entry - sl);

  function calcPnl(exitPrice) {
    return side === 'SELL'
      ? (entry - exitPrice) / open * 100
      : (exitPrice - entry) / open * 100;
  }

  function tpHit(barHigh, barLow, mfePts) {
    if (tpMode === 'tpOpen') {
      return side === 'SELL'
        ? (barLow  <= sessionOpen ? sessionOpen : null)
        : (barHigh >= sessionOpen ? sessionOpen : null);
    }
    if (side === 'SELL') {
      const tpFixed = entry - slDist * rrRatio;
      const tpMax   = entry - slDist * maxRR;
      const chan     = mfePts > slDist * 0.5 ? (entry - mfePts) + mfePts * mfeRetracePct : null;
      if (tpMode === 'fixedRR')    return barLow <= tpFixed ? tpFixed : null;
      if (tpMode === 'chandelier') return chan !== null && barHigh >= chan ? chan : null;
      if (barLow <= tpMax) return tpMax;
      if (chan !== null && barHigh >= chan) return chan;
    } else {
      const tpFixed = entry + slDist * rrRatio;
      const tpMax   = entry + slDist * maxRR;
      const chan     = mfePts > slDist * 0.5 ? (entry + mfePts) - mfePts * mfeRetracePct : null;
      if (tpMode === 'fixedRR')    return barHigh >= tpFixed ? tpFixed : null;
      if (tpMode === 'chandelier') return chan !== null && barLow <= chan ? chan : null;
      if (barHigh >= tpMax) return tpMax;
      if (chan !== null && barLow <= chan) return chan;
    }
    return null;
  }

  const mk = (outcome, exitPrice, fillTime, exitTime) => ({
    side, filled: true, outcome,
    pnlPct: +calcPnl(exitPrice).toFixed(5),
    leg: 'exhaustion', fillTime, exitTime,
  });

  let fillTime = null;
  let mfePts   = 0;

  for (const bar of m1Bars) {
    if (fillTime === null) {
      // Waiting for entry level to be touched
      const hit = side === 'SELL' ? bar.high >= entry : bar.low <= entry;
      if (!hit) continue;
      fillTime = bar.time;
      // Immediate SL on the same bar as entry (price blew straight through)
      const immSl = side === 'SELL' ? bar.high >= sl : bar.low <= sl;
      if (immSl) return mk('loss', sl, bar.time, bar.time);
      continue;
    }

    // In trade — update MFE, then check SL, then check TP
    if (side === 'SELL') mfePts = Math.max(mfePts, entry - bar.low);
    else                 mfePts = Math.max(mfePts, bar.high - entry);

    const slHit = side === 'SELL' ? bar.high >= sl : bar.low <= sl;
    if (slHit) return mk('loss', sl, fillTime, bar.time);

    const tp = tpHit(bar.high, bar.low, mfePts);
    if (tp !== null) return mk('win', tp, fillTime, bar.time);
  }

  // EOD — close at last bar's price
  if (fillTime !== null) {
    const eodClose = m1Bars.at(-1)?.close ?? entry;
    return mk('open', eodClose, fillTime, m1Bars.at(-1)?.time ?? null);
  }

  return { side, filled: false, outcome: 'no_fill', pnlPct: 0, leg: 'exhaustion', fillTime: null, exitTime: null };
}

// Each (level × side) fires independently — one trade per level per direction per day.
// blowThrough is no longer needed: each level is already independent.
function simulateExhaustionM1(m1Bars, open, atr, hl50pct, hl75pct, ocMedPct, oc75pct, opts = {}) {
  const {
    atrMult       = 1.5,
    tpMode        = 'hybrid',
    rrRatio       = 3.0,
    mfeRetracePct = 0.40,
    maxRR         = 4.0,
    useHL50       = true,
    useHL75       = true,
    useOCmed      = false,
    useOC75       = false,
  } = opts;

  const slDist = atr * atrMult;
  if (slDist <= 0) return [{ side: '', filled: false, outcome: 'no_fill', pnlPct: 0, leg: 'exhaustion', fillTime: null, exitTime: null }];

  // D1 open is at 22:00 UTC; M1 bars start at 00:00 UTC (2 h later). Anchor
  // entry levels and tpOpen target to the first M1 bar's open so the backtest
  // references the same price the trader sees as "open" on their chart.
  const sessionOpen = m1Bars.length > 0 ? m1Bars[0].open : open;

  // Build levels (ascending % from session open); dedup by rounding to 4dp
  const raw = [];
  if (useOCmed && ocMedPct > 0) raw.push(ocMedPct);
  if (useHL50  && hl50pct  > 0) raw.push(hl50pct);
  if (useOC75  && oc75pct  > 0) raw.push(oc75pct);
  if (useHL75  && hl75pct  > 0) raw.push(hl75pct);
  const sortedPcts = [...new Set(raw.map(v => +v.toFixed(4)))].sort((a, b) => a - b);

  if (sortedPcts.length === 0) return [{ side: '', filled: false, outcome: 'no_fill', pnlPct: 0, leg: 'exhaustion', fillTime: null, exitTime: null }];

  const tpOpts = { tpMode, rrRatio, mfeRetracePct, maxRR };
  const records = [];

  for (const pct of sortedPcts) {
    const sellEntry = sessionOpen * (1 + pct / 100);
    const buyEntry  = sessionOpen * (1 - pct / 100);

    const sellR = _simExhaustionLevel(m1Bars, 'SELL', sellEntry, sellEntry + slDist, sessionOpen, open, tpOpts);
    if (sellR.filled) records.push(sellR);

    const buyR  = _simExhaustionLevel(m1Bars, 'BUY',  buyEntry,  buyEntry  - slDist, sessionOpen, open, tpOpts);
    if (buyR.filled)  records.push(buyR);
  }

  if (records.length === 0) return [{ side: '', filled: false, outcome: 'no_fill', pnlPct: 0, leg: 'exhaustion', fillTime: null, exitTime: null }];
  return records;
}


function simulateDynamicAnchorM1(m1Bars, open, hl50pct, hl75pct, regime = 'RANGE', daDir = 'both') {
  // counter-regime: SELL only on BULL days, BUY only on BEAR days
  const allowSell = daDir === 'both' || regime !== 'BEAR';
  const allowBuy  = daDir === 'both' || regime !== 'BULL';

  let runHigh = open, runLow = open;
  let filled = false, side = '', isBuy = null;
  let entryL, tpL = open, slL, fillTime = null, exitTime = null;

  for (const bar of m1Bars) {
    if (!filled) {
      const sellEntry = runLow  * (1 + hl50pct / 100);
      const sellSl    = runLow  * (1 + hl75pct / 100);
      const buyEntry  = runHigh * (1 - hl50pct / 100);
      const buySl     = runHigh * (1 - hl75pct / 100);

      // SELL: forecasted HIGH from LL, must be above open
      if (allowSell && sellEntry > open && bar.high >= sellEntry) {
        filled = true; side = 'SELL'; isBuy = false;
        entryL = sellEntry; slL = sellSl; fillTime = bar.time;
        if (bar.high >= slL)  return { filled: true, side, outcome: 'loss', pnlPct: +(-((slL - entryL) / open * 100)).toFixed(5), leg: 'dynamicAnchor', fillTime, exitTime: bar.time };
        if (bar.low  <= tpL) return { filled: true, side, outcome: 'win',  pnlPct: +((entryL - tpL)   / open * 100).toFixed(5),  leg: 'dynamicAnchor', fillTime, exitTime: bar.time };
        // Update extremes before moving on (needed if bar also extends HH/LL)
        if (bar.high > runHigh) runHigh = bar.high;
        if (bar.low  < runLow)  runLow  = bar.low;
        continue;
      }
      // BUY: forecasted LOW from HH, must be below open
      if (allowBuy && buyEntry < open && bar.low <= buyEntry) {
        filled = true; side = 'BUY'; isBuy = true;
        entryL = buyEntry; slL = buySl; fillTime = bar.time;
        if (bar.low  <= slL)  return { filled: true, side, outcome: 'loss', pnlPct: +(-((entryL - slL) / open * 100)).toFixed(5), leg: 'dynamicAnchor', fillTime, exitTime: bar.time };
        if (bar.high >= tpL) return { filled: true, side, outcome: 'win',  pnlPct: +((tpL - entryL)   / open * 100).toFixed(5),  leg: 'dynamicAnchor', fillTime, exitTime: bar.time };
        if (bar.high > runHigh) runHigh = bar.high;
        if (bar.low  < runLow)  runLow  = bar.low;
        continue;
      }
      // No fill yet — update running extremes
      if (bar.high > runHigh) runHigh = bar.high;
      if (bar.low  < runLow)  runLow  = bar.low;
    } else {
      // Position open — walk TP/SL
      if (isBuy) {
        if (bar.low  <= slL)  return { filled: true, side, outcome: 'loss', pnlPct: +(-((entryL - slL) / open * 100)).toFixed(5), leg: 'dynamicAnchor', fillTime, exitTime: bar.time };
        if (bar.high >= tpL) return { filled: true, side, outcome: 'win',  pnlPct: +((tpL - entryL)   / open * 100).toFixed(5),  leg: 'dynamicAnchor', fillTime, exitTime: bar.time };
      } else {
        if (bar.high >= slL)  return { filled: true, side, outcome: 'loss', pnlPct: +(-((slL - entryL) / open * 100)).toFixed(5), leg: 'dynamicAnchor', fillTime, exitTime: bar.time };
        if (bar.low  <= tpL) return { filled: true, side, outcome: 'win',  pnlPct: +((entryL - tpL)   / open * 100).toFixed(5),  leg: 'dynamicAnchor', fillTime, exitTime: bar.time };
      }
    }
  }

  if (!filled) return { filled: false, side: '', outcome: 'no_fill', pnlPct: 0, leg: 'dynamicAnchor', fillTime: null, exitTime: null };
  const eod    = m1Bars[m1Bars.length - 1]?.close ?? entryL;
  const eodPnl = isBuy ? (eod - entryL) / open * 100 : (entryL - eod) / open * 100;
  return { filled: true, side, outcome: 'open', pnlPct: +eodPnl.toFixed(5), leg: 'dynamicAnchor', fillTime, exitTime: m1Bars[m1Bars.length - 1]?.time ?? null, _entry: entryL, _sl: slL, _tp: tpL };
}

function _simulateRevHL50D1(open, high, low, close, hl50pct, hl75pct, regime = 'RANGE', revMode = 'all') {
  const hl50 = open * hl50pct / 100;
  const hl75 = open * hl75pct / 100;
  const allowHigh = revMode === 'all' || regime !== 'BULL';
  const allowLow  = revMode === 'all' || regime !== 'BEAR';

  if (allowHigh && high >= open + hl50) {
    const entry = open + hl50, tp = open, sl = open + hl75;
    if (high >= sl) return { filled: true, side: 'SELL', outcome: 'loss', pnlPct: +(-(sl - entry) / open * 100).toFixed(5), leg: 'revHL50', fillTime: null, exitTime: null };
    if (low  <= tp) return { filled: true, side: 'SELL', outcome: 'win',  pnlPct: +((entry - tp) / open * 100).toFixed(5),  leg: 'revHL50', fillTime: null, exitTime: null };
    return { filled: true, side: 'SELL', outcome: 'open', pnlPct: +((entry - close) / open * 100).toFixed(5), leg: 'revHL50', fillTime: null, exitTime: null };
  }
  if (allowLow && low <= open - hl50) {
    const entry = open - hl50, tp = open, sl = open - hl75;
    if (low  <= sl) return { filled: true, side: 'BUY', outcome: 'loss', pnlPct: +(-(entry - sl) / open * 100).toFixed(5), leg: 'revHL50', fillTime: null, exitTime: null };
    if (high >= tp) return { filled: true, side: 'BUY', outcome: 'win',  pnlPct: +((tp - entry) / open * 100).toFixed(5),  leg: 'revHL50', fillTime: null, exitTime: null };
    return { filled: true, side: 'BUY', outcome: 'open', pnlPct: +((close - entry) / open * 100).toFixed(5), leg: 'revHL50', fillTime: null, exitTime: null };
  }
  return { filled: false, side: '', outcome: 'no_fill', pnlPct: 0, leg: 'revHL50', fillTime: null, exitTime: null };
}

function _simulateDynamicAnchorD1(open, high, low, close, hl50pct, hl75pct, regime = 'RANGE', daDir = 'both') {
  // D1 approximation: use actual day extremes as final anchors.
  // SELL: anchor from actual low. BUY: anchor from actual high.
  const allowSell = daDir === 'both' || regime !== 'BEAR';
  const allowBuy  = daDir === 'both' || regime !== 'BULL';

  const sellEntry = low  * (1 + hl50pct / 100);
  const sellSl    = low  * (1 + hl75pct / 100);
  const buyEntry  = high * (1 - hl50pct / 100);
  const buySl     = high * (1 - hl75pct / 100);

  if (allowSell && sellEntry > open && high >= sellEntry) {
    if (high >= sellSl) return { filled: true, side: 'SELL', outcome: 'loss', pnlPct: +(-((sellSl - sellEntry) / open * 100)).toFixed(5), leg: 'dynamicAnchor', fillTime: null, exitTime: null };
    if (low <= open)    return { filled: true, side: 'SELL', outcome: 'win',  pnlPct: +((sellEntry - open)     / open * 100).toFixed(5),  leg: 'dynamicAnchor', fillTime: null, exitTime: null };
    return { filled: true, side: 'SELL', outcome: 'open', pnlPct: +((sellEntry - close) / open * 100).toFixed(5), leg: 'dynamicAnchor', fillTime: null, exitTime: null, _entry: sellEntry, _sl: sellSl, _tp: open };
  }
  if (allowBuy && buyEntry < open && low <= buyEntry) {
    if (low <= buySl)   return { filled: true, side: 'BUY', outcome: 'loss', pnlPct: +(-((buyEntry - buySl) / open * 100)).toFixed(5), leg: 'dynamicAnchor', fillTime: null, exitTime: null };
    if (high >= open)   return { filled: true, side: 'BUY', outcome: 'win',  pnlPct: +((open - buyEntry)    / open * 100).toFixed(5),  leg: 'dynamicAnchor', fillTime: null, exitTime: null };
    return { filled: true, side: 'BUY', outcome: 'open', pnlPct: +((close - buyEntry) / open * 100).toFixed(5), leg: 'dynamicAnchor', fillTime: null, exitTime: null, _entry: buyEntry, _sl: buySl, _tp: open };
  }
  return { filled: false, side: '', outcome: 'no_fill', pnlPct: 0, leg: 'dynamicAnchor', fillTime: null, exitTime: null };
}

// ── Carry-forward helpers (for EOD-run mode) ─────────────────────────────────

function _checkCarryM1(m1Bars, carry) {
  for (const bar of m1Bars) {
    if (carry.side === 'SELL') {
      if (bar.high >= carry.sl) return { resolved: true, outcome: 'loss', pnlPct: +(-((carry.sl - carry.entry) / carry.origOpen * 100)).toFixed(5), exitTime: bar.time };
      if (bar.low  <= carry.tp) return { resolved: true, outcome: 'win',  pnlPct: +((carry.entry - carry.tp)   / carry.origOpen * 100).toFixed(5),  exitTime: bar.time };
    } else {
      if (bar.low  <= carry.sl) return { resolved: true, outcome: 'loss', pnlPct: +(-((carry.entry - carry.sl) / carry.origOpen * 100)).toFixed(5), exitTime: bar.time };
      if (bar.high >= carry.tp) return { resolved: true, outcome: 'win',  pnlPct: +((carry.tp - carry.entry)   / carry.origOpen * 100).toFixed(5),  exitTime: bar.time };
    }
  }
  return { resolved: false };
}

function _checkCarryD1(high, low, carry) {
  if (carry.side === 'SELL') {
    if (high >= carry.sl) return { resolved: true, outcome: 'loss', pnlPct: +(-((carry.sl - carry.entry) / carry.origOpen * 100)).toFixed(5) };
    if (low  <= carry.tp) return { resolved: true, outcome: 'win',  pnlPct: +((carry.entry - carry.tp)   / carry.origOpen * 100).toFixed(5) };
  } else {
    if (low  <= carry.sl) return { resolved: true, outcome: 'loss', pnlPct: +(-((carry.entry - carry.sl) / carry.origOpen * 100)).toFixed(5) };
    if (high >= carry.tp) return { resolved: true, outcome: 'win',  pnlPct: +((carry.tp - carry.entry)   / carry.origOpen * 100).toFixed(5) };
  }
  return { resolved: false };
}

// ── Walk-forward engine (M1 sim + D1 vol/regime) ──────────────────────────────

function runM1Backtest(d1Bars, m1ByDate, assetClass, opts = {}) {
  const {
    dateFrom = '', dateTo = '', minLookback = 50,
    slMult = 1.5, slopeThresh = 0.002,
    bearMult = 1.0, rangeMode = 'fade_both',
    strategy = 'reversal',
    momentumPullback = 0, momentumSlMult = 1.0,
    spreadPct = 0,
    dynHlCorr = 0,
    // exhaustion fade opts
    exAtrPeriod   = 14,
    exAtrMult     = 1.5,
    exTpMode      = 'hybrid',
    exRrRatio     = 3.0,
    exMfeRetrace  = 0.40,
    exMaxRr       = 4.0,
    exBlowThrough = true,
    exUseHL50     = true,
    exUseHL75     = true,
    exUseOCmed    = false,
    exUseOC75     = false,
  } = opts;
  const p      = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  const closes = d1Bars.map(b => b.close);
  const records = [];
  const daCarried = [];  // carry-forward state for dynamicAnchor EOD-run mode

  // Pre-compute EWMA variance series once — O(n) vs O(n²) per-bar rebuild
  const allLogRet = [];
  for (let j = 1; j < closes.length; j++) allLogRet.push(Math.log(closes[j] / closes[j - 1]));
  const allEwmaVar = ewmaVarSeries(allLogRet);

  for (let i = minLookback; i < d1Bars.length; i++) {
    const { date, open, high, low, close } = d1Bars[i];
    if (dateFrom && date < dateFrom) continue;
    if (dateTo   && date > dateTo)   continue;

    const ewmaIdx = i - 2; // allEwmaVar[i-2] = EWMA variance after returns 0..i-2
    if (ewmaIdx < 19) continue;

    const sigmaD   = Math.sqrt(allEwmaVar[ewmaIdx]);
    const hl50pct  = BM_P50 * p.hl_50_corr  * sigmaD * 100;
    const hl75pct  = BM_P75 * p.hl_75_corr  * sigmaD * 100;
    const ocMedPct = HN_P50 * p.oc_corr     * sigmaD * 100;
    const oc75pct  = HN_P75 * p.oc_75_corr  * sigmaD * 100;
    const regime   = classifyRegime(closes, i, 20, 5, slopeThresh, bearMult);

    const m1Bars = m1ByDate?.get(date) ?? null;
    const useM1  = !!(m1Bars && m1Bars.length >= 10);
    const moOpts = { momentumPullback, momentumSlMult };

    const base = {
      date, regime,
      hl_50_pct:  +hl50pct.toFixed(4),
      hl_75_pct:  +hl75pct.toFixed(4),
      oc_med_pct: +ocMedPct.toFixed(4),
      oc_75_pct:  +oc75pct.toFixed(4),
      m1_sim:     useM1,
      open: +open.toFixed(6), high: +high.toFixed(6),
      low:  +low.toFixed(6),  close: +close.toFixed(6),
    };

    const legResults = [];
    if (strategy !== 'momentum' && strategy !== 'momentum50' && strategy !== 'reversal50' && strategy !== 'revHL50' && strategy !== 'dynamicAnchor' && strategy !== 'exhaustion') {
      const r = useM1
        ? simulateDayM1(m1Bars, open, hl75pct, ocMedPct, regime, slMult, dynHlCorr, rangeMode)
        : _simulateDayD1(open, high, low, close, hl75pct, ocMedPct, regime, slMult, rangeMode);
      legResults.push(r);
    }
    if (strategy !== 'reversal' && strategy !== 'momentum50' && strategy !== 'reversal50' && strategy !== 'revHL50' && strategy !== 'dynamicAnchor' && strategy !== 'exhaustion') {
      const r = useM1
        ? simulateMomentumM1(m1Bars, open, hl75pct, ocMedPct, regime, moOpts)
        : _simulateMomentumD1(open, high, low, close, hl75pct, ocMedPct, regime, moOpts);
      legResults.push(r);
    }
    if (strategy === 'momentum50' && useM1) {
      legResults.push(simulateMomentum50M1(m1Bars, open, hl50pct, hl75pct, regime));
    }
    if (strategy === 'reversal50') {
      const r = useM1
        ? simulateReversal50M1(m1Bars, open, hl50pct, hl75pct)
        : _simulateReversal50D1(open, high, low, close, hl50pct, hl75pct);
      legResults.push(r);
    }
    if (strategy === 'revHL50') {
      const revMode = opts.revHL50Mode ?? 'all';
      const r = useM1
        ? simulateRevHL50M1(m1Bars, open, hl50pct, hl75pct, regime, revMode)
        : _simulateRevHL50D1(open, high, low, close, hl50pct, hl75pct, regime, revMode);
      legResults.push(r);
    }
    if (strategy === 'exhaustion' && useM1) {
      const atr    = _d1Atr(d1Bars, i, exAtrPeriod);
      const exOpts = {
        atrMult: exAtrMult, tpMode: exTpMode, rrRatio: exRrRatio,
        mfeRetracePct: exMfeRetrace, maxRR: exMaxRr, blowThrough: exBlowThrough,
        useHL50: exUseHL50, useHL75: exUseHL75, useOCmed: exUseOCmed, useOC75: exUseOC75,
      };
      const exResults = simulateExhaustionM1(m1Bars, open, atr, hl50pct, hl75pct, ocMedPct, oc75pct, exOpts);
      legResults.push(...exResults);
    }

    if (strategy === 'dynamicAnchor') {
      const daRegime  = opts.daRegime  ?? 'all';
      const daDir     = opts.daDir     ?? 'both';
      const daEodMode = opts.daEodMode ?? 'close';
      const dow = new Date(date + 'T00:00:00Z').getUTCDay();

      // Resolve any carry positions against today's bars first
      if (daEodMode === 'run' && daCarried.length > 0) {
        const stillCarried = [];
        for (const carry of daCarried) {
          const cr = useM1 ? _checkCarryM1(m1Bars, carry) : _checkCarryD1(high, low, carry);
          if (cr.resolved) {
            records.push({
              ...base,
              side: carry.side, filled: true, outcome: cr.outcome,
              pnl_pct: +(cr.pnlPct - spreadPct).toFixed(5),
              leg: 'dynamicAnchor',
              fill_time: carry.openFillTime ?? null,
              exit_time: cr.exitTime ?? null,
              session: classifySession(carry.openFillTime),
              dow,
              carry_days: carry.carryDays,
              open_date:  carry.openDate,
            });
          } else {
            stillCarried.push({ ...carry, carryDays: carry.carryDays + 1 });
          }
        }
        daCarried.length = 0;
        daCarried.push(...stillCarried);
      }

      // New trade attempt for today
      const regimeOk = daRegime === 'all' ||
        (daRegime === 'bullbear' && (regime === 'BULL' || regime === 'BEAR')) ||
        (daRegime === 'bull'     && regime === 'BULL') ||
        (daRegime === 'bear'     && regime === 'BEAR');
      if (regimeOk) {
        const r = useM1
          ? simulateDynamicAnchorM1(m1Bars, open, hl50pct, hl75pct, regime, daDir)
          : _simulateDynamicAnchorD1(open, high, low, close, hl50pct, hl75pct, regime, daDir);
        if (daEodMode === 'run' && r.outcome === 'open' && r._entry != null) {
          daCarried.push({
            side: r.side, entry: r._entry, sl: r._sl, tp: r._tp,
            origOpen: open, openDate: date,
            openFillTime: r.fillTime, carryDays: 0,
          });
        } else {
          legResults.push(r);
        }
      }
    }

    for (const r of legResults) {
      const costAdj = r.filled ? r.pnlPct - spreadPct : 0;
      const dow = new Date(date + 'T00:00:00Z').getUTCDay(); // 0=Sun…6=Sat
      records.push({
        ...base,
        side: r.side, filled: r.filled, outcome: r.outcome,
        pnl_pct: r.filled ? +costAdj.toFixed(5) : 0,
        leg: r.leg,
        fill_time:  r.fillTime  ?? null,
        exit_time:  r.exitTime  ?? null,
        session: classifySession(r.fillTime),
        dow,
      });
    }
  }

  // Flush any remaining carry positions at end of available data
  if (strategy === 'dynamicAnchor' && daCarried.length > 0) {
    const lastBar   = d1Bars[d1Bars.length - 1];
    const lastClose = lastBar?.close ?? 0;
    for (const carry of daCarried) {
      const pnl = carry.side === 'SELL'
        ? (carry.entry - lastClose) / carry.origOpen * 100
        : (lastClose - carry.entry) / carry.origOpen * 100;
      records.push({
        date: lastBar?.date ?? '', regime: 'RANGE',
        hl_50_pct: 0, hl_75_pct: 0, oc_med_pct: 0, m1_sim: false,
        open: 0, high: 0, low: 0, close: +lastClose.toFixed(6),
        side: carry.side, filled: true, outcome: 'open',
        pnl_pct: +(pnl - spreadPct).toFixed(5),
        leg: 'dynamicAnchor',
        fill_time: carry.openFillTime ?? null,
        exit_time: null,
        session: classifySession(carry.openFillTime),
        dow: 0,
        carry_days: carry.carryDays,
        open_date:  carry.openDate,
      });
    }
  }

  return records;
}

// ── D1 fallback: reversal ─────────────────────────────────────────────────────

function _simulateDayD1(open, high, low, close, hl75pct, ocMedPct, regime, slMult, rangeMode = 'fade_both') {
  const hl  = open * hl75pct  / 100;
  const oc  = open * ocMedPct / 100;
  const slD = hl * slMult;

  function sell(entry, tp, sl) {
    if (high < entry) return null;
    if (high >= sl)   return { outcome: 'loss', pnlPct: -((sl - entry) / open * 100) };
    const markPnl = (entry - close) / open * 100;
    const tpPnl   = (entry - tp)   / open * 100;
    if (markPnl >= tpPnl) return { outcome: 'win',  pnlPct: tpPnl   };
    if (markPnl  > 0)     return { outcome: 'win',  pnlPct: markPnl };
    return                       { outcome: 'open', pnlPct: markPnl };
  }
  function buy(entry, tp, sl) {
    if (low > entry)  return null;
    if (low  <= sl)   return { outcome: 'loss', pnlPct: -((entry - sl) / open * 100) };
    const markPnl = (close - entry) / open * 100;
    const tpPnl   = (tp - entry)   / open * 100;
    if (markPnl >= tpPnl) return { outcome: 'win',  pnlPct: tpPnl   };
    if (markPnl  > 0)     return { outcome: 'win',  pnlPct: markPnl };
    return                       { outcome: 'open', pnlPct: markPnl };
  }

  let r = null, side = '';
  if (regime === 'BULL') {
    side = 'SELL'; r = sell(open + hl, open + oc, open + slD);
  } else if (regime === 'BEAR') {
    side = 'BUY';  r = buy(open - hl, open - oc, open - slD);
  } else {
    if (rangeMode === 'skip') return { filled: false, side: '', outcome: 'no_fill', pnlPct: 0, leg: 'reversal' };
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

// ── D1 fallback: reversal50 ───────────────────────────────────────────────────

function _simulateReversal50D1(open, high, low, close, hl50pct, hl75pct) {
  const hl50 = open * hl50pct / 100;
  const hl75 = open * hl75pct / 100;

  function sell(entry, tp, sl) {
    if (high < entry) return null;
    if (high >= sl)   return { outcome: 'loss', pnlPct: -((sl - entry) / open * 100) };
    const markPnl = (entry - close) / open * 100;
    const tpPnl   = (entry - tp)   / open * 100;
    if (markPnl >= tpPnl) return { outcome: 'win',  pnlPct: tpPnl   };
    if (markPnl  > 0)     return { outcome: 'win',  pnlPct: markPnl };
    return                       { outcome: 'open', pnlPct: markPnl };
  }
  function buy(entry, tp, sl) {
    if (low > entry)  return null;
    if (low  <= sl)   return { outcome: 'loss', pnlPct: -((entry - sl) / open * 100) };
    const markPnl = (close - entry) / open * 100;
    const tpPnl   = (tp - entry)   / open * 100;
    if (markPnl >= tpPnl) return { outcome: 'win',  pnlPct: tpPnl   };
    if (markPnl  > 0)     return { outcome: 'win',  pnlPct: markPnl };
    return                       { outcome: 'open', pnlPct: markPnl };
  }

  // No regime filter: fade whichever extreme hits first (D1 can't distinguish order,
  // so check high side first — consistent with the chronological M1 simulation)
  let r = null, side = '';
  r = sell(open + hl50, open, open + hl75);
  if (r) { side = 'SELL'; }
  else   { r = buy(open - hl50, open, open - hl75); if (r) side = 'BUY'; }

  return r
    ? { filled: true,  side, ...r, pnlPct: +r.pnlPct.toFixed(5), leg: 'reversal50' }
    : { filled: false, side: '',   outcome: 'no_fill', pnlPct: 0,  leg: 'reversal50' };
}

// ── Level Hit Analysis ────────────────────────────────────────────────────────
//
// Walk M1 bars per day and record which of the 4 forecast levels are touched,
// then — after the first HL75 extreme is hit — how far price retraces.
//
// Levels (relative to day open):
//   HL50_H/L  = open ± hl50  (median range boundary)
//   HL75_H/L  = open ± hl75  (75th-pct range boundary — entry trigger)
//   OC50_H/L  = open ± oc50  (median OC — current reversal TP)
//   OC75_H/L  = open ± oc75  (75th-pct OC — larger TP target)
//
// After the first HL75 extreme is hit, the retracement waterfall records
// whether price subsequently touched each level back towards (and through) open.
// For HL75_H first: hret_oc75H → hret_oc50H → hret_open → hret_oc50L → hret_oc75L → hret_hl50L → hret_hl75L
// For HL75_L first: lret_oc75L → lret_oc50L → lret_open → lret_oc50H → lret_oc75H → lret_hl50H → lret_hl75H

function _analyzeDayLevels(m1Bars, open, hl50pct, hl75pct, oc50pct, oc75pct) {
  const hl50 = open * hl50pct / 100;
  const hl75 = open * hl75pct / 100;
  const oc50 = open * oc50pct / 100;
  const oc75 = open * oc75pct / 100;

  let hl50H_t=null, hl75H_t=null, oc50H_t=null, oc75H_t=null;
  let hl50L_t=null, hl75L_t=null, oc50L_t=null, oc75L_t=null;
  let hl75H_idx=-1, hl75L_idx=-1;

  for (let i = 0; i < m1Bars.length; i++) {
    const bar = m1Bars[i];
    if (!hl50H_t && bar.high >= open + hl50) hl50H_t = bar.time;
    if (!hl75H_t && bar.high >= open + hl75) { hl75H_t = bar.time; hl75H_idx = i; }
    if (!oc50H_t && bar.high >= open + oc50) oc50H_t = bar.time;
    if (!oc75H_t && bar.high >= open + oc75) oc75H_t = bar.time;
    if (!hl50L_t && bar.low  <= open - hl50) hl50L_t = bar.time;
    if (!hl75L_t && bar.low  <= open - hl75) { hl75L_t = bar.time; hl75L_idx = i; }
    if (!oc50L_t && bar.low  <= open - oc50) oc50L_t = bar.time;
    if (!oc75L_t && bar.low  <= open - oc75) oc75L_t = bar.time;
  }

  let firstHit = null;
  if      (hl75H_t && (!hl75L_t || hl75H_t <= hl75L_t)) firstHit = 'HL75_H';
  else if (hl75L_t)                                       firstHit = 'HL75_L';
  const firstHitTime = firstHit === 'HL75_H' ? hl75H_t : hl75L_t;

  // Retracement from first HL75 extreme — bars after the hit index
  const ret = {};
  if (firstHit === 'HL75_H' && hl75H_idx >= 0) {
    const after = m1Bars.slice(hl75H_idx + 1);
    ret.hret_oc75H = after.some(b => b.low <= open + oc75);
    ret.hret_oc50H = after.some(b => b.low <= open + oc50);
    ret.hret_open  = after.some(b => b.low <= open);
    ret.hret_oc50L = after.some(b => b.low <= open - oc50);
    ret.hret_oc75L = after.some(b => b.low <= open - oc75);
    ret.hret_hl50L = after.some(b => b.low <= open - hl50);
    ret.hret_hl75L = after.some(b => b.low <= open - hl75);
  } else if (firstHit === 'HL75_L' && hl75L_idx >= 0) {
    const after = m1Bars.slice(hl75L_idx + 1);
    ret.lret_oc75L = after.some(b => b.high >= open - oc75);
    ret.lret_oc50L = after.some(b => b.high >= open - oc50);
    ret.lret_open  = after.some(b => b.high >= open);
    ret.lret_oc50H = after.some(b => b.high >= open + oc50);
    ret.lret_oc75H = after.some(b => b.high >= open + oc75);
    ret.lret_hl50H = after.some(b => b.high >= open + hl50);
    ret.lret_hl75H = after.some(b => b.high >= open + hl75);
  }

  return {
    hl50H_hit: !!hl50H_t, hl75H_hit: !!hl75H_t, oc50H_hit: !!oc50H_t, oc75H_hit: !!oc75H_t,
    hl50L_hit: !!hl50L_t, hl75L_hit: !!hl75L_t, oc50L_hit: !!oc50L_t, oc75L_hit: !!oc75L_t,
    firstHit,
    firstHitTime,
    firstHitSession: classifySession(firstHitTime),
    ...ret,
  };
}

function runLevelHitAnalysis(d1Bars, m1ByDate, assetClass, opts = {}) {
  const { dateFrom = '', dateTo = '', minLookback = 50, slopeThresh = 0.002 } = opts;
  const p      = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  const closes = d1Bars.map(b => b.close);
  const records = [];

  // Pre-compute EWMA variance series once — O(n) vs O(n²) per-bar rebuild
  const allLogRet = [];
  for (let j = 1; j < closes.length; j++) allLogRet.push(Math.log(closes[j] / closes[j - 1]));
  const allEwmaVar = ewmaVarSeries(allLogRet);

  for (let i = minLookback; i < d1Bars.length; i++) {
    const { date, open } = d1Bars[i];
    if (dateFrom && date < dateFrom) continue;
    if (dateTo   && date > dateTo)   continue;

    const m1Bars = m1ByDate?.get(date) ?? null;
    if (!m1Bars || m1Bars.length < 10) continue;

    const ewmaIdx = i - 2;
    if (ewmaIdx < 19) continue;

    const sigmaD  = Math.sqrt(allEwmaVar[ewmaIdx]);
    const hl50pct = BM_P50 * p.hl_50_corr * sigmaD * 100;
    const hl75pct = BM_P75 * p.hl_75_corr * sigmaD * 100;
    const oc50pct = HN_P50 * p.oc_corr    * sigmaD * 100;
    const oc75pct = HN_P75 * p.oc_75_corr * sigmaD * 100;
    const regime  = classifyRegime(closes, i, 20, 5, slopeThresh);

    records.push({
      date, regime,
      hl_50_pct:  +hl50pct.toFixed(4),
      hl_75_pct:  +hl75pct.toFixed(4),
      oc_50_pct:  +oc50pct.toFixed(4),
      oc_75_pct:  +oc75pct.toFixed(4),
      ..._analyzeDayLevels(m1Bars, open, hl50pct, hl75pct, oc50pct, oc75pct),
    });
  }
  return records;
}

function _pct(num, den) {
  return den > 0 ? +(num / den * 100).toFixed(1) : null;
}

function _sliceStats(rs) {
  const hFirst = rs.filter(r => r.firstHit === 'HL75_H');
  const lFirst = rs.filter(r => r.firstHit === 'HL75_L');
  const rH = key => _pct(hFirst.filter(r => r[key]).length, hFirst.length);
  const rL = key => _pct(lFirst.filter(r => r[key]).length, lFirst.length);
  return {
    n:             rs.length,
    hl75H_pct:     _pct(rs.filter(r => r.hl75H_hit).length, rs.length),
    hl75L_pct:     _pct(rs.filter(r => r.hl75L_hit).length, rs.length),
    hl50H_pct:     _pct(rs.filter(r => r.hl50H_hit).length, rs.length),
    hl50L_pct:     _pct(rs.filter(r => r.hl50L_hit).length, rs.length),
    both_hl75_pct: _pct(rs.filter(r => r.hl75H_hit && r.hl75L_hit).length, rs.length),
    hFirst_n:  hFirst.length,
    lFirst_n:  lFirst.length,
    // After HL75↑ hit first: retracement waterfall (bars AFTER the extreme)
    hFirst_oc75H: rH('hret_oc75H'),  // came back below OC75↑ (large-TP same side)
    hFirst_oc50H: rH('hret_oc50H'),  // came back below OC50↑ ← BULL strategy TP
    hFirst_open:  rH('hret_open'),   // came back to open
    hFirst_oc50L: rH('hret_oc50L'),  // went through open to OC50↓ ← RANGE/BEAR TP
    hFirst_oc75L: rH('hret_oc75L'),  // OC75↓
    hFirst_hl50L: rH('hret_hl50L'),  // HL50↓
    hFirst_sweep: rH('hret_hl75L'),  // full sweep to HL75↓
    // After HL75↓ hit first: symmetric waterfall
    lFirst_oc75L: rL('lret_oc75L'),  // came back above OC75↓ (large-TP same side)
    lFirst_oc50L: rL('lret_oc50L'),  // came back above OC50↓ ← BEAR strategy TP
    lFirst_open:  rL('lret_open'),   // came back to open
    lFirst_oc50H: rL('lret_oc50H'),  // went through open to OC50↑ ← BULL/RANGE TP
    lFirst_oc75H: rL('lret_oc75H'),  // OC75↑
    lFirst_hl50H: rL('lret_hl50H'),  // HL50↑
    lFirst_sweep: rL('lret_hl75H'),  // full sweep to HL75↑
    // HL50 → HL75 continuation: P(HL75 hit | HL50 already hit) — momentum50 edge
    hl50H_n:           rs.filter(r => r.hl50H_hit).length,
    hl50L_n:           rs.filter(r => r.hl50L_hit).length,
    hl75H_given_hl50H: _pct(rs.filter(r => r.hl50H_hit && r.hl75H_hit).length, rs.filter(r => r.hl50H_hit).length),
    hl75L_given_hl50L: _pct(rs.filter(r => r.hl50L_hit && r.hl75L_hit).length, rs.filter(r => r.hl50L_hit).length),
  };
}

export function aggregateLevelHits(records) {
  if (!records.length) return null;

  const byRegime = {};
  for (const rg of ['BULL', 'BEAR', 'RANGE']) {
    const rs = records.filter(r => r.regime === rg);
    if (rs.length) byRegime[rg] = _sliceStats(rs);
  }

  const bySession = {};
  for (const sess of ['Asia', 'London', 'Overlap', 'NY']) {
    const rs = records.filter(r => r.firstHitSession === sess);
    if (rs.length) bySession[sess] = _sliceStats(rs);
  }

  return {
    n: records.length,
    overall:   _sliceStats(records),
    byRegime,
    bySession,
  };
}

// ── Public: run all instruments with M1 data where available ─────────────────

export async function runFullM1Backtest(opts = {}, instruments = INSTRUMENTS, m1Dir = BT_M1_DIR) {
  if (!process.env.OANDA_KEY) throw new Error('OANDA_KEY not set — cannot fetch D1 data');

  // Process instruments in parallel batches of 5 to stay within Railway's request timeout
  const CONCURRENCY = 5;
  const allResults  = [];
  for (let i = 0; i < instruments.length; i += CONCURRENCY) {
    const batch = instruments.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(async cfg => {
      const pairLog = [];
      try {
        pairLog.push(`Fetching D1 ${cfg.name}…`);
        const d1Bars = await fetchD1(cfg.oanda, 5000);
        pairLog.push(`  ${d1Bars.length} D1 bars (${d1Bars[0]?.date} → ${d1Bars.at(-1)?.date})`);

        const pairKey  = cfg.name.toLowerCase().replace('/', '');
        const m1File   = path.join(m1Dir, `${pairKey}_m1.parquet`);
        let   m1ByDate = null;

        let r2ab = null;
        try { r2ab = await fetchFromR2(pairKey); }
        catch (e) { pairLog.push(`  R2 error: ${e?.message} — trying local/Drive`); }

        if (r2ab) {
          pairLog.push(`  Loading M1 parquet from R2 (${(r2ab.byteLength / 1e6).toFixed(1)} MB)…`);
          const rows = await readM1Parquet(r2ab);
          m1ByDate   = groupByDate(rows);
          pairLog.push(`  ${rows.length.toLocaleString()} M1 bars across ${m1ByDate.size} dates`);
        } else if (existsSync(m1File)) {
          pairLog.push(`  Loading M1 parquet from disk (${(readFileSync(m1File).length / 1e6).toFixed(1)} MB)…`);
          const rows = await readM1Parquet(m1File);
          m1ByDate   = groupByDate(rows);
          pairLog.push(`  ${rows.length.toLocaleString()} M1 bars across ${m1ByDate.size} dates`);
        } else {
          pairLog.push(`  No M1 parquet — falling back to D1 simulation`);
        }

        const trades = runM1Backtest(d1Bars, m1ByDate, cfg.assetClass, opts)
          .map(r => ({ instrument: cfg.name, ...r }));

        const nM1   = trades.filter(t => t.filled && t.m1_sim).length;
        const nFill = trades.filter(t => t.filled).length;
        pairLog.push(`  ${nFill} filled trades (${nM1} via M1, ${nFill - nM1} via D1 fallback)`);
        return { trades, log: pairLog };
      } catch (e) {
        pairLog.push(`  Error: ${e.message}`);
        return { trades: [], log: pairLog };
      }
    }));
    allResults.push(...batchResults);
  }

  return {
    trades: allResults.flatMap(r => r.trades),
    log:    allResults.flatMap(r => r.log),
  };
}

/**
 * Load M1 bars for a pair and return a memory-efficient packed structure.
 * Storing 1.4M rows as TypedArrays uses ~28 MB vs ~350 MB for plain objects.
 *
 * Returns: { n, times: Int32Array (epoch seconds), opens/highs/lows/closes: Float32Array }
 * or null if no data source available.
 */
export async function loadM1ForPair(pairKey, m1Dir = BT_M1_DIR) {
  const toEpoch = v => {
    const s = v instanceof Date ? v.toISOString().substring(0, 19) : String(v).substring(0, 19).replace(' ', 'T');
    return Math.floor(new Date(s + 'Z').getTime() / 1000);
  };

  const pack = rows => {
    const n      = rows.length;
    const times  = new Int32Array(n);
    const opens  = new Float32Array(n);
    const highs  = new Float32Array(n);
    const lows   = new Float32Array(n);
    const closes = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = rows[i];
      times[i] = toEpoch(r[5]); opens[i] = r[0]; highs[i] = r[1]; lows[i] = r[2]; closes[i] = r[3];
    }
    return { n, times, opens, highs, lows, closes };
  };

  // 1. R2
  let r2Error = null;
  try {
    const r2ab = await fetchFromR2(pairKey);
    if (r2ab) return pack(await readM1Parquet(r2ab));
  } catch (err) {
    r2Error = err?.message ?? String(err);
    console.warn(`[M1] R2 failed for ${pairKey}: ${r2Error}`);
  }

  // 2. Local disk
  const m1File = path.join(m1Dir, `${pairKey}_m1.parquet`);
  if (existsSync(m1File)) return pack(await readM1Parquet(m1File));

  // 3. Google Drive (slow on first load, then saved to disk)
  const driveAb = await fetchFromDrive(pairKey, m1Dir);
  if (driveAb) return pack(await readM1Parquet(driveAb));

  if (r2Error) throw new Error(`R2 error: ${r2Error}`);
  return null;
}

export async function runFullLevelAnalysis(opts = {}, instruments = INSTRUMENTS, m1Dir = BT_M1_DIR, onProgress = null) {
  if (!process.env.OANDA_KEY) throw new Error('OANDA_KEY not set — cannot fetch D1 data');

  const allRecords = [];
  const log        = [];
  const total      = instruments.length;

  for (let pi = 0; pi < instruments.length; pi++) {
    const cfg = instruments[pi];
    onProgress?.(`${cfg.name} (${pi + 1}/${total})`);
    try {
      log.push(`Fetching D1 ${cfg.name}…`);
      const d1Bars  = await fetchD1(cfg.oanda, 5000);
      log.push(`  ${d1Bars.length} D1 bars`);

      const pairKey = cfg.name.toLowerCase().replace('/', '');
      const m1File  = path.join(m1Dir, `${pairKey}_m1.parquet`);
      let   m1ByDate = null;

      const r2ab = await fetchFromR2(pairKey);
      if (r2ab) {
        log.push(`  M1 from R2 (${(r2ab.byteLength / 1e6).toFixed(1)} MB)…`);
        m1ByDate = groupByDate(await readM1Parquet(r2ab));
      } else if (existsSync(m1File)) {
        log.push(`  M1 from disk…`);
        m1ByDate = groupByDate(await readM1Parquet(m1File));
      } else {
        log.push(`  No M1 data — skipping ${cfg.name}`);
        continue;
      }

      log.push(`  ${m1ByDate.size} dates with M1 data`);
      const records = runLevelHitAnalysis(d1Bars, m1ByDate, cfg.assetClass, opts)
        .map(r => ({ instrument: cfg.name, ...r }));
      allRecords.push(...records);
      log.push(`  ${records.length} days analysed`);
    } catch (e) {
      log.push(`  Error: ${e.message}`);
    }
  }

  return { records: allRecords, agg: aggregateLevelHits(allRecords), log };
}

export { INSTRUMENTS };

// ── R2 regime-history helpers (used by server.js) ────────────────────────────

export { makeR2Client };
export { R2_BUCKET, R2_KEY_PREFIX };

export async function loadRegimeHistoryFromR2(bot, pair) {
  const client = makeR2Client();
  if (!client) return null;
  const key = `regime_history/${bot}/${pair}.json`;
  try {
    const resp  = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    const bytes = await resp.Body.transformToByteArray();
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    return null;
  }
}

export async function saveRegimeHistoryToR2(bot, pair, data) {
  const client = makeR2Client();
  if (!client) return false;
  const key  = `regime_history/${bot}/${pair}.json`;
  const body = Buffer.from(JSON.stringify(data));
  await client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: 'application/json' }));
  return true;
}
