/**
 * MacroFX Decision-Zone Backtester — the honest, testable core of the
 * 20-document "MacroFXModel" spec (Chatgpt/*.md).
 *
 * WHAT THE 20 DOCS ACTUALLY CLAIM (and what this tests)
 *   The spec is a conceptual multi-engine architecture (volatility, Asia range,
 *   options/gamma, macro, liquidity, regression, market-state, probability
 *   ensemble). Its ONE central, falsifiable, price-only claim — the thing the
 *   whole design rests on — is stated plainly in Chapter 5 (Dynamic Decision
 *   Zone Builder) and Chapter 1:
 *
 *     "Markets rarely reverse because of a single level. Turning points often
 *      occur where multiple INDEPENDENT models identify approximately the same
 *      price."  → cluster independent evidence into Decision Zones; the zone is
 *      more important than any individual line.  Backtest requirement (Ch 5):
 *      "Forecast improvement over isolated levels."
 *
 *   And Chapter 6/7: a Market-State selector decides, per session, whether a
 *   zone is more likely to REVERSE (fade) or BREAK (follow) — not a fixed rule.
 *
 *   Everything else in the spec (options/gamma Ch 9, macro Ch 11, order-book
 *   liquidity Ch 8) needs data we cannot source honestly in this sandbox
 *   (OANDA mids only). Faking it would be a lookalike, not the thing
 *   (CLAUDE.md "Data limits beat fake productivity"). So this engine tests the
 *   price-only core and reports the rest as deferred.
 *
 * THE TEST (pre-registered, both outcomes named)
 *   On ONE in-sample/out-of-sample split, with costs on, ≥30 OOS trades:
 *     • zone      — MacroFXModel: trade only high-confluence zones (≥ minSources
 *                   DISTINCT evidence families agree), direction by the state
 *                   selector.  ← the hypothesis
 *     • isolated  — NULL: same selector, but drop the confluence gate (any single
 *                   level qualifies).  Tests Claim A: does confluence add edge?
 *     • zone_fade — always fade at confluence zones (fixed rule). }  Tests Claim B:
 *     • zone_follow — always follow at confluence zones (fixed).    }  does the
 *                   state selector beat a coin-fixed direction?
 *   "It worked" = zone beats isolated AND beats the better of fade/follow on OOS
 *   Sharpe at ≥30 OOS trades. "It didn't" = it doesn't. A single Sharpe number
 *   with <30 OOS trades or only-in-sample is NOT a result.
 *
 * LEGO DISCIPLINE (CLAUDE.md) — this file writes only the NEW idea (confluence
 * gate + zone-anchored state selector). Everything load-bearing is IMPORTED:
 *   • computeBands / volSigmaSeries  ← forecastCore  (Volatility & Forecast eng.)
 *   • collectLevels / clusterLevels  ← levelSources  (Decision Zone Builder)
 *   • dayTypeScore / classifyRegime  ← dayTypeCore   (Market State engine)
 *   • walkBars                       ← forecastCore  (the ONE fill primitive)
 *   • summarizeSplit / summarizeTrades ← honest harness / metricsCore (validation)
 * No vol math, no fill walker, no metric is re-implemented here.
 */

import {
  computeBands, volSigmaSeries, walkBars, dayTypeScore, classifyRegime,
  summarizeSplit, DEFAULT_COST_PCT, DEFAULT_SLIP_PCT,
} from './forecastCore.js';
import { collectLevels, clusterLevels } from './levelSources.js';
// Asia-session range + fib projection come from the SHARED bricks — never
// re-derived. bodyRange builds the 5m-body high/low of the session window;
// calcFibs projects the extension ladder off that range (identical math to the
// Asia-range backtester and the live bot). CLAUDE.md Lego Principle #1.
import { bodyRange } from './barUtils.js';
import { calcFibs } from './fibProjection.js';
// Regression fair-value (Ch 10) uses the shared OLS-slope + std bricks — the
// same z-score/regression primitives every other engine uses, never re-rolled.
import { linregSlope, mean as _mean, stdev as _stdev } from './statsCore.js';
// backtestStats = the repo's canonical bootstrap-CI + Monte-Carlo-drawdown
// battery (Ch 16). Reused for the diagnostics block, not re-implemented.
import { backtestStats } from './backtestStats.js';
import { summarizeTrades } from './metricsCore.js';
import { pipSize as pipSizeOf } from './instrumentRegistry.js';
import { fetchD1, INSTRUMENTS } from './volBacktestEngine.js';
// NOTE: loadM1ForPair (volBacktestM1Engine.js) pulls in the parquet reader, a
// data-layer dependency only needed when the SUITE fetches real M1. It is
// imported lazily inside runZoneSuite so the pure walk-forward (buildZones /
// runZoneMode / compareZones) stays importable and unit-testable offline
// (CLAUDE.md: "unit-test the core on synthetic data (no network needed)").

export { INSTRUMENTS as ZONE_INSTRUMENTS };

// D1-sourced level families (no intraday needed → honest from OANDA D1 alone).
// volume_profile / vwap are deliberately excluded from v1: they need intraday
// bars and would silently return [] on D1, adding a phantom "source" that never
// fires. They are the clean next extension (see LEGO_MODULES.md).
const STRUCTURAL_SOURCES = ['daily_open', 'prior_hilo', 'pivots', 'swing_sr', 'swing_fib', 'round_number'];

const pipFor = (name, assetClass) => {
  try { return pipSizeOf(name); }
  catch { return assetClass === 'fx' ? 0.0001 : assetClass === 'commodity' ? 1.0 : 1.0; }
};

// ── Asia Range Extensions (Chapter 4 — "the spatial framework") ──────────────
// INTRADAY-ONLY, by construction: an Asian-session high/low/range is M1
// structure a D1 bar simply does not contain, so this family is built from the
// session's own M1 bars via the shared bricks (bodyRange + calcFibs), never
// from D1. Ratios mirror the doc's ladder (Ch 4: 1.0/1.272/1.618/2.0/2.618/
// 3.618) projected BOTH directions off the range, plus the range boundaries and
// mid. calcFibs' `low + range·lv` gives: lv≥1 → above the Asia high, lv≤0 →
// below the Asia low.
export const ASIA_EXT_RATIOS = [
  -2.618, -1.618, -1.0, -0.618, -0.272, 0, 0.5, 1, 1.272, 1.618, 2.0, 2.618, 3.618,
];

// Emit the Asia extension levels for ONE session from its M1 bars. `asiaBars`
// must be exactly the session-window (00:00–06:00 UTC) M1 bars; resampled to
// `resampleMin` (5m) bodies inside bodyRange, same as asiaRangeEngine. Weight
// keys the extension family by prominence (range edges > golden ext > far ext).
export function asiaExtensionLevels(asiaBars, resampleMin, ratios = ASIA_EXT_RATIOS) {
  const r = bodyRange(asiaBars, resampleMin);
  if (!r) return null;                                   // no Asia session (weekend/holiday/no M1)
  const fibs = calcFibs(r.low, r.range, ratios);
  const out = fibs.map(f => {
    const w = f.level === 0 || f.level === 1 ? 1.6           // the range itself (PDH/PDL-grade)
            : Math.abs(f.level) <= 1.618 ? 1.3               // near extensions / golden pocket
            : 1.0;                                           // far extensions
    return { price: f.price, kind: 'asia_ext', label: `Asia ${f.level}`, weight: w, source: 'asia_ext', meta: { ratio: f.level } };
  });
  return { levels: out, range: r };
}

// ── Real-path MAE (Chapter 15 / CLAUDE.md: read MAE off the ACTUAL bars, never
// approximated from close-to-close). Scans the window bars over the realised
// hold [fillTime..exitTime]; adverse = low-vs-entry (long) / high-vs-entry
// (short). Returns % of `open`.
function maeFromPath(bars, entry, isBuy, open, fillTime, exitTime) {
  if (!bars.length) return 0;
  let worst = 0;
  for (const b of bars) {
    if (fillTime != null && b.time != null && b.time < fillTime) continue;
    if (exitTime != null && b.time != null && b.time > exitTime) break;
    const adverse = isBuy ? (entry - b.low) : (b.high - entry);
    if (adverse > worst) worst = adverse;
  }
  return open > 0 ? +(worst / open * 100).toFixed(5) : 0;
}

// ── Regression fair value & bands (Chapter 10) ───────────────────────────────
// Fits OLS of close on time over the last `lookback` COMPLETED days, projects the
// fitted line one step forward to the session (the fair-value estimate), and
// emits the fair value ± k·residual-σ as levels. No lookahead — priorBars are
// strictly before the session. Uses the shared `linregSlope` (never a private
// OLS). The regression band is the Ch 10 "how far is price from fair value" —
// an independent evidence family (`regr_band`) for the confluence.
export function regressionLevels(priorBars, cfg) {
  const { regrLookback = 80, regrSds = [1, 2] } = cfg;
  if (!priorBars || priorBars.length < Math.max(20, regrLookback / 2)) return [];
  const y = priorBars.slice(-regrLookback).map(b => b.close);
  const n = y.length;
  const slope = linregSlope(y);                 // per-index slope, x = 0..n-1
  const xm = (n - 1) / 2, ym = _mean(y);
  const fittedAt = t => ym + slope * (t - xm);
  const resid = y.map((v, i) => v - fittedAt(i));
  const sd = _stdev(resid, 0);
  const fair = fittedAt(n);                      // one step past the last completed day
  if (!Number.isFinite(fair) || sd <= 0) return [];
  const out = [{ price: fair, kind: 'regr_fv', label: 'Fair value', weight: 1.2, source: 'regr_band', meta: { slope } }];
  for (const k of regrSds) {
    out.push({ price: fair + k * sd, kind: 'regr_band', label: `FV +${k}σ`, weight: k >= 2 ? 1.3 : 1.0, source: 'regr_band', meta: { sd: k } });
    out.push({ price: fair - k * sd, kind: 'regr_band', label: `FV -${k}σ`, weight: k >= 2 ? 1.3 : 1.0, source: 'regr_band', meta: { sd: -k } });
  }
  return out;
}

// ── Build the candidate Decision Zones for one session (no lookahead) ─────────
// priorBars = completed D1 bars STRICTLY before the session (each carries a
// numeric `.time` epoch-sec). `open`/`sigma` are the session's known-at-open
// forecast inputs. Emits clustered zones with a distinct-source count = the
// "independent evidence" the spec rewards (Ch 5: diversity, not quantity).
export function buildZones(priorBars, open, sigma, assetClass, name, cfg, extraLevels = []) {
  const { clusterPips = 10 } = cfg;
  const pip = pipFor(name, assetClass);
  const bands = computeBands(open, sigma, assetClass);

  // Volatility & Forecast engine (Ch 3) as independent evidence families:
  // median close displacement + 75th/50th high-low exhaustion.
  const volLevels = [
    { price: bands.up75, kind: 'vol_exhaustion', label: 'σ+75 exh', weight: 1.5, source: 'vol_exhaustion' },
    { price: bands.dn75, kind: 'vol_exhaustion', label: 'σ-75 exh', weight: 1.5, source: 'vol_exhaustion' },
    { price: bands.up50, kind: 'vol_median',     label: 'σ+50 med', weight: 1.0, source: 'vol_median' },
    { price: bands.dn50, kind: 'vol_median',     label: 'σ-50 med', weight: 1.0, source: 'vol_median' },
  ];

  // Structural / navigation evidence (Ch 4/5) via the Level-Source bricks.
  const ctx = { dailyBars: priorBars, instrument: name, price: open, pipSize: pip };
  const structural = collectLevels(ctx, STRUCTURAL_SOURCES);

  // Regression fair-value family (Ch 10), D1-sourced, opt-in via cfg.regrBands.
  const regr = cfg.regrBands ? regressionLevels(priorBars, cfg) : [];

  // extraLevels = the intraday-only families (Asia extensions) the caller built
  // from M1 for THIS session — kept out of the D1 structural set on purpose.
  const zones = clusterLevels([...volLevels, ...structural, ...regr, ...extraLevels], clusterPips, pip);
  // distinctSources = number of independent evidence families in the zone.
  for (const z of zones) z.distinctSources = z.sources.length;
  return { bands, zones, pip };
}

// ── Per-session plan: pick the zone(s) to trade and the fade/follow direction ─
// Returns { action, orders[] }. orders = { entry, tp, sl, isBuy, entryType,
// zone } consumed by walkBars. Only NEW logic lives here; the resolution is the
// shared primitive.
function planSession(open, bands, zones, T, regime, mode, cfg) {
  const { minSources = 2, fadeMax = 0.45, reachMult = 1.5, slMult = 1.5,
          rr = 1.5, slipPct = 0.006 } = cfg;
  const gate = mode === 'isolated' ? 1 : minSources;
  const reach = open * bands.hl75 * reachMult;   // zones must be reachable intraday

  // Nearest qualifying zone on each side of the open.
  let above = null, below = null;
  for (const z of zones) {
    if (z.distinctSources < gate) continue;
    const d = Math.abs(z.price - open);
    if (d > reach || d < 1e-9) continue;
    if (z.price > open) { if (!above || z.price < above.price) above = z; }
    else                { if (!below || z.price > below.price) below = z; }
  }

  // Direction rule. adaptive (zone / isolated): low trend-day-ness → fade
  // (revert to fair value); trending + directional regime → follow. Fixed modes
  // pin the action for the Claim-B null.
  let action;
  if (mode === 'zone_fade') action = 'fade';
  else if (mode === 'zone_follow') action = 'follow';
  else action = (T < fadeMax || regime === 'RANGE') ? 'fade' : 'follow';

  const slD  = open * bands.hl50 * slMult;        // vol-scaled risk unit (varies per day)
  const slip = open * slipPct / 100;
  const orders = [];

  if (action === 'fade') {
    // Sell a zone above / buy a zone below → target FAIR VALUE (the open). This
    // is the Regression/fair-value reversion thesis (Ch 10) expressed as a target.
    if (above) orders.push({ entry: above.price, tp: open, sl: above.price + slD, isBuy: false, entryType: 'limit', zone: above });
    if (below) orders.push({ entry: below.price, tp: open, sl: below.price - slD, isBuy: true,  entryType: 'limit', zone: below });
  } else {
    // Follow: break THROUGH the zone, RR-based continuation target. Regime gates
    // direction for the adaptive modes (a BULL regime only takes upside breaks).
    const wantUp = regime !== 'BEAR', wantDn = regime !== 'BULL';
    if (above && wantUp) orders.push({ entry: above.price + slip, tp: above.price + slD * rr, sl: above.price - slD, isBuy: true,  entryType: 'stop', zone: above });
    if (below && wantDn) orders.push({ entry: below.price - slip, tp: below.price - slD * rr, sl: below.price + slD, isBuy: false, entryType: 'stop', zone: below });
  }
  return { action, orders };
}

// ── Walk-forward over one instrument, one mode ───────────────────────────────
// d1Bars   : [{date,open,high,low,close}]  (drives σ, regime, day-type, levels)
// m1ByDate : Map(date → m1Bars[{time,open,high,low,close}])  (fills; optional →
//            falls back to the single D1 bar = mark-to-close, no intrabar TP
//            assumption, exactly as the honest harness does).
export function runZoneMode(d1Bars, m1ByDate, assetClass, name, mode, opts = {}) {
  const {
    minLookback = 80, dateFrom = '', dateTo = '',
    costPct = DEFAULT_COST_PCT[assetClass] ?? 0.012,
    slipPct = DEFAULT_SLIP_PCT[assetClass] ?? 0.006,
    erWindow = 14, slopeThresh = 0.002,
    accountSize = 10000, riskPct = 1.0,
    // Asia-anchored mode (Chapter 4): when true, each session is anchored at
    // ASIA CLOSE (06:00 UTC) — reference price + fill window both start there —
    // and the M1 Asia range extensions join the confluence as the `asia_ext`
    // evidence family. Requires M1 (skips any day without it). Off = the
    // original D1-open-anchored behaviour.
    asiaAnchor = false, asiaWindowH = 6, asiaResampleMin = 5,
    // Regression fair-value bands (Ch 10) as an evidence family — on by default.
    regrBands = true, regrLookback = 80,
  } = opts;
  const cfg = {
    minSources: opts.minSources ?? 2, clusterPips: opts.clusterPips ?? (assetClass === 'fx' ? 10 : 8),
    fadeMax: opts.fadeMax ?? 0.45, reachMult: opts.reachMult ?? 1.5,
    slMult: opts.slMult ?? 1.5, rr: opts.rr ?? 1.5, slipPct,
    asiaRatios: opts.asiaRatios ?? ASIA_EXT_RATIOS,
    regrBands, regrLookback,
  };
  const riskDollar = accountSize * riskPct / 100;
  const closes = d1Bars.map(b => b.close);
  const sigD = volSigmaSeries(d1Bars, assetClass);
  // Attach epoch-sec time to each D1 bar for the level-source ctx (fetchD1 gives
  // only `.date`); level sources self-limit by lookback so passing full history
  // is fine.
  const timed = d1Bars.map(b => ({ ...b, time: Math.floor(Date.parse(b.date) / 1000) }));

  const records = [];
  for (let i = minLookback; i < d1Bars.length; i++) {
    const bar = d1Bars[i];
    if (dateFrom && bar.date < dateFrom) continue;
    if (dateTo   && bar.date > dateTo)   continue;
    const sigma = sigD[i];
    if (!sigma || sigma < 1e-8) continue;

    const dayEpoch = Math.floor(Date.parse(bar.date) / 1000);   // UTC midnight of the session date
    const dayM1 = m1ByDate?.get(bar.date) ?? null;

    // Anchor + fill window depend on the mode. Asia-anchored trades only the
    // post-06:00 path off Asia-close price (no lookahead onto the Asia window).
    let open, win, extraLevels = [];
    if (asiaAnchor) {
      if (!dayM1?.length) continue;                   // Asia mode REQUIRES M1
      const asiaEnd  = dayEpoch + asiaWindowH * 3600;
      const asiaBars = dayM1.filter(b => b.time >= dayEpoch && b.time < asiaEnd);
      const post     = dayM1.filter(b => b.time >= asiaEnd);
      if (!post.length) continue;                     // nothing to trade after Asia close
      const asia = asiaExtensionLevels(asiaBars, asiaResampleMin, cfg.asiaRatios);
      if (!asia) continue;                            // no valid Asia session that day
      open = post[0].open;                            // reference = price at Asia close (06:00 UTC)
      win  = post;                                    // fills ONLY on the post-Asia path
      extraLevels = asia.levels;
    } else {
      open = bar.open;                                // D1-open anchor (original behaviour)
      win  = dayM1 ?? [{ time: dayEpoch, open: bar.open, high: bar.high, low: bar.low, close: bar.close }];
    }

    const priorBars = timed.slice(0, i);              // STRICTLY before session i (no lookahead)
    const { bands, zones } = buildZones(priorBars, open, sigma, assetClass, name, cfg, extraLevels);
    const T = dayTypeScore(closes, i, erWindow);
    const regime = classifyRegime(closes, i, 20, 5, slopeThresh, 1.0);
    const { action, orders } = planSession(open, bands, zones, T, regime, mode, cfg);
    if (!orders.length) continue;                     // No-Trade is a valid outcome (Ch 7)

    // Take the first order that fills (chronologically). walkBars owns the causal
    // fill/SL/TP resolution; we add real-path MAE around it.
    let done = null;
    for (const o of orders) {
      const r = walkBars(win, o.entry, o.tp, o.sl, o.isBuy, o.entryType, open);
      if (!r) continue;
      const mae = maeFromPath(win, o.entry, o.isBuy, open, r.fillTime, r.exitTime);
      done = { o, r, mae };
      break;
    }
    if (!done) continue;

    const { o, r, mae } = done;
    const stopPct = Math.abs(o.entry - o.sl) / open * 100;   // per-trade risk (%) — vol-scaled, varies
    const pnlNet = +(r.pnlPct - costPct).toFixed(5);
    const R = stopPct > 1e-9 ? +(pnlNet / stopPct).toFixed(4) : 0;
    records.push({
      date: bar.date, mode, action, regime, T: +T.toFixed(3),
      side: o.isBuy ? 'BUY' : 'SELL',
      zoneScore: o.zone.score, distinctSources: o.zone.distinctSources,
      sources: o.zone.sources.join('+'),
      filled: true, outcome: r.outcome,
      pnl_pct: pnlNet, mae_pct: mae,
      stop_pct: +stopPct.toFixed(5), R, risk_dollar: +riskDollar.toFixed(2),
      pnl_dollar: +(R * riskDollar).toFixed(2),
    });
  }
  return records;
}

// ── Diagnostics (Ch 16): per-year stability + Monte-Carlo ────────────────────
// perYear = calendar-year breakdown of the zone book (the concentration check
// CLAUDE.md mandates — read the recent years in isolation before trusting a
// headline). This is a TIME-STABILITY check, NOT parameter walk-forward: the
// selector has no fitted parameters to train/test-split, so there is nothing to
// walk. mc = the repo's canonical bootstrap-CI + shuffle-drawdown battery on the
// OOS pnl series. NOTE (CLAUDE.md): Monte Carlo is expectation-setting — the
// spread of outcomes consistent with this book's own mean/vol — NOT evidence the
// signal generalises. Only the OOS split is that.
export function zoneDiagnostics(records, splitDate, opts = {}) {
  const filled = records.filter(r => r.filled);
  // Per-calendar-year.
  const byYear = new Map();
  for (const r of filled) { const y = r.date.substring(0, 4); (byYear.get(y) ?? byYear.set(y, []).get(y)).push(r); }
  const perYear = [...byYear.entries()].sort().map(([year, rs]) => {
    const s = summarizeTrades(rs.map(r => r.pnl_pct), rs.map(r => r.date));
    return { year, trades: s.trades, sharpe: s.sharpe, expectancy: s.expectancy, totalPnl: s.totalPnl, winRate: s.winRate };
  });
  // Monte Carlo on the OOS pnl series.
  const oos = filled.filter(r => (splitDate ? r.date >= splitDate : false));
  const mc = oos.length >= 10
    ? backtestStats(oos.map(r => r.pnl_pct), oos.map(r => r.date), { mcRuns: 1000, bootRuns: 1000 })
    : null;
  return { perYear, mc, mcNote: 'Monte Carlo = outcome spread consistent with this book’s own mean/vol; expectation-setting, NOT out-of-sample evidence.' };
}

// ── Compare the four modes on the SAME IS/OOS split ──────────────────────────
export function compareZones(d1Bars, m1ByDate, assetClass, name, opts = {}) {
  const modes = ['zone', 'isolated', 'zone_fade', 'zone_follow'];
  const out = {};
  const trades = {};
  for (const m of modes) {
    const recs = runZoneMode(d1Bars, m1ByDate, assetClass, name, m, opts);
    out[m] = summarizeSplit(recs, opts.oosFrac ?? 0.4);
    trades[m] = recs;
  }
  // Diagnostics computed for the zone mode (the strategy under test).
  const diagnostics = zoneDiagnostics(trades.zone, out.zone.splitDate, opts);
  return { modes: out, trades, diagnostics };
}

// Group packed M1 columns ({n,times,opens,...}) → Map(date → bars[]). Mirrors
// volBacktestV2Engine.groupM1ByDate (kept local; that one isn't exported).
function groupM1ByDate(packed) {
  const map = new Map();
  if (!packed || !packed.n) return map;
  const { n, times, opens, highs, lows, closes } = packed;
  for (let i = 0; i < n; i++) {
    const t = times[i];
    const date = (typeof t === 'string' ? t : new Date(t).toISOString()).substring(0, 10);
    const tsec = typeof t === 'string' ? Math.floor(Date.parse(t) / 1000) : Math.floor(t / 1000);
    if (!map.has(date)) map.set(date, []);
    map.get(date).push({ time: tsec, open: opens[i], high: highs[i], low: lows[i], close: closes[i] });
  }
  return map;
}

// ── Fetch (D1 always; M1 for fills where available) + run the suite ──────────
export async function runZoneSuite(opts = {}, instruments = INSTRUMENTS) {
  if (!process.env.OANDA_KEY) throw new Error('OANDA_KEY not set — cannot fetch D1 data');
  const log = [], results = [];
  // Lazy M1 loader (parquet dep) — resolved once, only when the suite runs.
  let loadM1ForPair = null;
  try { ({ loadM1ForPair } = await import('./volBacktestM1Engine.js')); } catch { /* M1 optional */ }
  for (const cfg of instruments) {
    try {
      log.push(`Fetching ${cfg.name}…`);
      const d1 = await fetchD1(cfg.oanda, 5000);
      log.push(`  ${d1.length} D1 bars (${d1[0]?.date} → ${d1.at(-1)?.date})`);
      let m1ByDate = null;
      try {
        const packed = loadM1ForPair ? await loadM1ForPair(cfg.name.toLowerCase()) : null;
        if (packed?.n) { m1ByDate = groupM1ByDate(packed); log.push(`  ${packed.n} M1 bars → ${m1ByDate.size} days (intraday fills)`); }
        else log.push('  no M1 — fills fall back to D1 mark-to-close');
      } catch { log.push('  M1 load failed — fills fall back to D1 mark-to-close'); }

      const { modes, trades, diagnostics } = compareZones(d1, m1ByDate, cfg.assetClass, cfg.name, opts);
      results.push({ instrument: cfg.name, assetClass: cfg.assetClass, modes, trades, diagnostics });
    } catch (e) {
      log.push(`  Error ${cfg.name}: ${e.message}`);
    }
  }
  return { results, log, opts };
}
