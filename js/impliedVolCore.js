/**
 * Implied-Vol Core — CME CVOL EOD lego brick.
 *
 * Loads the static historical CME CVOL series (options-implied vol per
 * instrument: overall index, ATM, skew, up/down variance, convexity) and
 * derives the variance risk premium (VRP = implied − realized) against the
 * SAME realized-vol math the rest of the platform uses (yzVolSeries /
 * hvVarSeries from volBacktestEngine.js — imported, never re-implemented,
 * per the Lego Principle in MD files/CLAUDE.md).
 *
 * STATIC DATA, NOT A LIVE FEED. js/data/cmeCvolEod.json is a fixed snapshot
 * (converted 2026-08-21 from an uploaded CME CVOL EOD parquet export,
 * scripts/convertCmeCvol.py) covering EURUSD/GBPUSD/USDJPY/AUDUSD/USDCAD/
 * USDCHF/XAUUSD from 2016 or 2018 through 2026-08-20. Refreshing it means
 * obtaining a new CME CVOL export and re-running that script — there is no
 * scheduled job wired up. cvolMeta() carries the coverage so callers/pages
 * can show the true last-updated date instead of implying "live".
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { yzVolSeries, hvVarSeries, garchSigmas } from './volBacktestEngine.js';
import { rollingZScore, spearman } from './statsCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, 'data', 'cmeCvolEod.json');
const CBOE_DATA_PATH = path.join(__dirname, 'data', 'cboeVolIndices.json');

let _cache = null;
function loadRaw() {
  if (_cache) return _cache;
  _cache = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  return _cache;
}

let _cboeCache = null;
function loadCboeRaw() {
  if (_cboeCache) return _cboeCache;
  _cboeCache = JSON.parse(fs.readFileSync(CBOE_DATA_PATH, 'utf8'));
  return _cboeCache;
}

export function cvolProducts() {
  return loadRaw().meta.products;
}

export function cvolMeta() {
  return loadRaw().meta;
}

// product: 'EURUSD' | 'GBPUSD' | 'USDJPY' | 'AUDUSD' | 'USDCAD' | 'USDCHF' | 'XAUUSD'
// Returns ascending-by-date rows: { date, cvol, atm, dnvar, upvar, skew, skewRatio, convexity, underlying, limited }.
export function loadCvolSeries(product) {
  const raw = loadRaw();
  return raw.series[product] ?? [];
}

// Align CVOL rows onto D1 bars by EXACT date match — no forward-fill. A day
// with no CVOL row (weekend/holiday mismatch between OANDA's broker-day dates
// and CME's settlement dates, or genuine gaps) stays null rather than
// fabricating a stale carry-forward value (CLAUDE.md's "do the boring parsing
// correctly and visibly" data-modeling rule).
export function alignCvolToBars(bars, cvolRows) {
  const byDate = new Map(cvolRows.map(r => [r.date, r]));
  return bars.map(b => byDate.get(b.date) ?? null);
}

// ── CBOE volatility indices (GVZ / VXN) — a SECOND, independent implied-vol
// source (js/data/cboeVolIndices.json, from scripts/convertCboeVolContext.py).
// Different provider and methodology than CME CVOL above: GVZ prices GLD
// options (30-day, close-only — CBOE doesn't publish OHLC for it), VXN prices
// NDX options (30-day, full OHLC). Products: 'NAS100' (VXN) — the only
// implied-vol source for the index asset class, CME CVOL has none — and
// 'XAUUSD' (GVZ) — an independent cross-check against CVOL's own XAUUSD read.
// Normalized into the SAME row shape as loadCvolSeries so computeVRPSeries
// and every other CME-CVOL consumer work on either source unchanged; CBOE
// doesn't publish atm/skew/upvar/dnvar/convexity, so those stay null rather
// than being fabricated from the single close-level number.
export function cboeMeta() {
  return loadCboeRaw().meta;
}

export function loadCboeVolSeries(product) {
  const raw = loadCboeRaw();
  const rows = raw.series[product] ?? [];
  return rows.map(r => ({
    date: r.date,
    cvol: r.close,
    atm: null, dnvar: null, upvar: null, skew: null, skewRatio: null, convexity: null, underlying: null,
    limited: false,
    source: r.source,   // 'GVZ' | 'VXN'
  }));
}

// Cross-checks two independent implied-vol reads of the SAME underlying
// (e.g. CME CVOL vs CBOE GVZ on gold) by aligning both onto the same bars and
// computing their Spearman correlation (statsCore.js — never a fresh
// correlation implementation). Returns the aligned point series too, for a
// two-line diagnostic chart. n<3 or no overlap → correlation is null, not a
// fabricated 0 (0 would misleadingly read as "confirmed no relationship").
export function crossCheckSeries(bars, primaryRows, secondaryRows) {
  const primary = alignCvolToBars(bars, primaryRows);
  const secondary = alignCvolToBars(bars, secondaryRows);
  const points = [];
  const xs = [], ys = [];
  for (let i = 0; i < bars.length; i++) {
    const p = primary[i]?.cvol ?? null;
    const s = secondary[i]?.cvol ?? null;
    points.push({ date: bars[i].date, primary: p, secondary: s });
    if (p != null && s != null) { xs.push(p); ys.push(s); }
  }
  const correlation = xs.length >= 3 ? +spearman(xs, ys).toFixed(4) : null;
  return { n: xs.length, correlation, points };
}

// Realized vol, ANNUALIZED PERCENT (×√252×100) so it is directly comparable to
// CVOL's index units. Window = 30 trading days to match CVOL's constant-
// maturity ~30-day tenor. fx → Yang-Zhang(30) (matches volSigmaSeries' fx
// path); commodity (gold) → close-to-close HV(30) (volSigmaSeries uses HV20
// there for the live forecaster's band width — this uses 30 specifically to
// tenor-match CVOL, a deliberate, documented divergence from the live
// forecaster's own window, not an accidental one). No lookahead: out[i] only
// uses bars strictly before i (yzVolSeries/hvVarSeries's own [i-1] lag).
export function realizedVolPct(bars, assetClass, garchOmega) {
  const n = bars.length;
  const out = new Array(n).fill(null);
  if (assetClass === 'commodity') {
    const closes = bars.map(b => b.close);
    const lr = [];
    for (let j = 1; j < closes.length; j++) lr.push(Math.log(closes[j] / closes[j - 1]));
    const hv = hvVarSeries(lr, 30);
    for (let i = 2; i < n; i++) out[i] = Math.sqrt(Math.max(hv[i - 2], 1e-12)) * Math.sqrt(252) * 100;
  } else if (assetClass === 'index') {
    // GARCH(1,1), same as volSigmaSeries' index path — garchSigmas is itself
    // one-step-ahead (predicts bar i from returns through i-1), so no extra lag here.
    const g = garchSigmas(bars, garchOmega ?? 4.76e-6);
    for (let i = 0; i < n; i++) out[i] = g[i] > 0 ? g[i] * Math.sqrt(252) * 100 : null;
  } else {
    const yz = yzVolSeries(bars, 30);
    for (let i = 1; i < n; i++) out[i] = (yz[i - 1] || 0) > 0 ? yz[i - 1] * Math.sqrt(252) * 100 : null;
  }
  return out;
}

// Per-bar VRP = implied(cvol) − realized(RV30, annualized %), plus a rolling
// z-score of VRP so richness/cheapness is judged against the SAME
// instrument's own history, not a raw point value (a 3-vol-point VRP means
// something very different for USDJPY than for AUDUSD). zPeriod default
// (252 ≈ 1 trading year) trades off responsiveness vs having enough history
// to be a real distribution; sample stdev (ddof=1), clipped to ±4 to blunt a
// single-day data glitch from swamping the whole z-series.
export function computeVRPSeries(bars, cvolRows, assetClass, { zPeriod = 252, garchOmega } = {}) {
  const aligned = alignCvolToBars(bars, cvolRows);
  const rv = realizedVolPct(bars, assetClass, garchOmega);
  const vrp = bars.map((b, i) => {
    const c = aligned[i];
    if (!c || c.cvol == null || rv[i] == null) return null;
    return +(c.cvol - rv[i]).toFixed(4);
  });
  const vrpForZ = vrp.map(v => (v == null ? NaN : v));
  const z = rollingZScore(vrpForZ, zPeriod, 4, 1);
  return bars.map((b, i) => ({
    date: b.date,
    cvol: aligned[i]?.cvol ?? null,
    atm: aligned[i]?.atm ?? null,
    skew: aligned[i]?.skew ?? null,
    skewRatio: aligned[i]?.skewRatio ?? null,
    rv: rv[i],
    vrp: vrp[i],
    vrpZ: Number.isFinite(z[i]) ? +z[i].toFixed(3) : null,
    limited: aligned[i]?.limited ?? null,
  }));
}
