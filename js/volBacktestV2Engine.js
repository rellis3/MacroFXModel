/**
 * Vol/Range Forecast Backtester — v2 (adaptive).
 *
 * Thin orchestration on top of forecastCore.js. The core owns the band math,
 * the fill walker, the one entry primitive, the day-type score and the
 * selector; this file just loads data, builds windows per horizon, and runs the
 * walk-forward. Horizons (daily / weekly / 20-day) share one code path — only
 * the σ scale and the window grouping differ.
 *
 * A/B framing: `mode` is either the adaptive selector ('adaptive') or a fixed
 * leg ('fade75' | 'fadeMed' | 'follow') so v2-adaptive can be compared head to
 * head against the best single behaviour on the same IS/OOS split.
 */

import { fetchD1, INSTRUMENTS } from './volBacktestEngine.js';
import { loadM1ForPair } from './volBacktestM1Engine.js';
import {
  HORIZONS, computeBands, simulateEntry, dayTypeScore, selectStrategy,
  volSigmaSeries, classifyRegime, summarizeSplit, DEFAULT_COST_PCT, DEFAULT_SLIP_PCT,
} from './forecastCore.js';

export { HORIZONS };

// Group packed M1 columns ({n,times,opens,highs,lows,closes}) into Map(date→bars[]).
function groupM1ByDate(packed) {
  const map = new Map();
  if (!packed || !packed.n) return map;
  const { n, times, opens, highs, lows, closes } = packed;
  for (let i = 0; i < n; i++) {
    const t = times[i];
    const date = (typeof t === 'string' ? t : new Date(t).toISOString()).substring(0, 10);
    if (!map.has(date)) map.set(date, []);
    map.get(date).push({ time: t, open: opens[i], high: highs[i], low: lows[i], close: closes[i] });
  }
  return map;
}

// Resolve the trade spec for a window: adaptive selector or a fixed leg.
function specForMode(mode, T, regime, baseSpec) {
  if (mode === 'adaptive') return { ...selectStrategy(T, regime), ...baseSpec };
  const dir = regime === 'BULL' ? 'up' : regime === 'BEAR' ? 'down' : 'both';
  if (mode === 'fade75')  return { band: 'hl75', action: 'fade',   dir: 'both', T, ...baseSpec };
  if (mode === 'fadeMed') return { band: 'hl50', action: 'fade',   dir: 'both', T, ...baseSpec };
  if (mode === 'follow')  return { band: 'hl50', action: 'follow', dir,         T, ...baseSpec };
  return { band: 'hl75', action: 'fade', dir: 'both', T, ...baseSpec };
}

/**
 * Pure walk-forward run. Testable without network — pass bars directly.
 *   d1Bars   : [{date,open,high,low,close}]  (drives σ, regime, day-type)
 *   m1ByDate : Map(date → m1Bars[])  (daily intraday fills; optional)
 */
export function runForecastV2(d1Bars, m1ByDate, assetClass, opts = {}) {
  const {
    horizon = 'daily', mode = 'adaptive', minLookback = 50,
    dateFrom = '', dateTo = '', slMult = 1.5,
    costPct = DEFAULT_COST_PCT[assetClass] ?? 0.012,
    slipPct = DEFAULT_SLIP_PCT[assetClass] ?? 0.006,
    fadeMedMax = 0.30, fade75Max = 0.55, erWindow = 14,
  } = opts;

  const H = HORIZONS[horizon] ?? HORIZONS.daily;
  const closes = d1Bars.map(b => b.close);
  const sigD   = volSigmaSeries(d1Bars, assetClass);
  const baseSpec = { slMult, costPct, slipPct };
  const records = [];

  // Window iterator: daily = every bar; weekly/monthly = non-overlapping blocks.
  const step = horizon === 'daily' ? 1 : H.windowDays;
  for (let i = minLookback; i < d1Bars.length; i += step) {
    const startBar = d1Bars[i];
    if (dateFrom && startBar.date < dateFrom) continue;
    if (dateTo   && startBar.date > dateTo)   continue;

    const sigma = sigD[i] * H.sigmaScale;
    if (!sigma || sigma < 1e-8) continue;

    const open   = startBar.open;
    const bands  = computeBands(open, sigma, assetClass);
    const T      = dayTypeScore(closes, i, erWindow);
    const regime = classifyRegime(closes, i, 20, 5, opts.slopeThresh ?? 0.002, 1.0);
    const spec   = specForMode(mode, T, regime, baseSpec);
    spec.fadeMedMax = fadeMedMax; spec.fade75Max = fade75Max;

    // Window bars to walk for fills.
    let bars;
    if (horizon === 'daily') {
      bars = m1ByDate?.get(startBar.date)
          ?? [{ time: startBar.date, open: startBar.open, high: startBar.high, low: startBar.low, close: startBar.close }];
    } else {
      bars = d1Bars.slice(i, Math.min(i + H.windowDays, d1Bars.length))
        .map(b => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close }));
    }

    const r = simulateEntry({ open, bars }, bands, spec);
    records.push({
      date: startBar.date, horizon, regime, T,
      band: r.band, act: r.action, side: r.side,
      filled: r.filled, outcome: r.outcome, pnl_pct: r.pnlPct,
      hl75_pct: +(bands.hl75 * 100).toFixed(4),
    });
  }
  return records;
}

// Compare adaptive vs the three fixed legs for one instrument, with IS/OOS split.
export function compareV2(d1Bars, m1ByDate, assetClass, opts = {}) {
  const modes = ['adaptive', 'fade75', 'fadeMed', 'follow'];
  const out = {};
  for (const m of modes) {
    const recs = runForecastV2(d1Bars, m1ByDate, assetClass, { ...opts, mode: m });
    out[m] = summarizeSplit(recs, opts.oosFrac ?? 0.4);
  }
  return out;
}

// Load (D1 always; M1 only for daily horizon) and run the suite.
export async function runForecastV2Suite(opts = {}, instruments = INSTRUMENTS) {
  if (!process.env.OANDA_KEY) throw new Error('OANDA_KEY not set — cannot fetch D1 data');
  const horizon = opts.horizon ?? 'daily';
  const log = [], results = [];
  for (const cfg of instruments) {
    try {
      log.push(`Fetching ${cfg.name}…`);
      const d1 = await fetchD1(cfg.oanda, 5000);
      log.push(`  ${d1.length} D1 bars (${d1[0]?.date} → ${d1.at(-1)?.date})`);
      let m1ByDate = null;
      if (horizon === 'daily') {
        try {
          const packed = await loadM1ForPair(cfg.name.toLowerCase());
          if (packed?.n) { m1ByDate = groupM1ByDate(packed); log.push(`  ${packed.n} M1 bars → ${m1ByDate.size} days`); }
          else log.push('  no M1 — daily fills fall back to D1 bars');
        } catch { log.push('  M1 load failed — daily fills fall back to D1 bars'); }
      }
      results.push({ instrument: cfg.name, assetClass: cfg.assetClass, modes: compareV2(d1, m1ByDate, cfg.assetClass, opts) });
    } catch (e) {
      log.push(`  Error ${cfg.name}: ${e.message}`);
    }
  }
  return { results, log, opts };
}

export { INSTRUMENTS as V2_INSTRUMENTS };
