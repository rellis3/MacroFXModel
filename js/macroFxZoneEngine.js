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

// ── Build the candidate Decision Zones for one session (no lookahead) ─────────
// priorBars = completed D1 bars STRICTLY before the session (each carries a
// numeric `.time` epoch-sec). `open`/`sigma` are the session's known-at-open
// forecast inputs. Emits clustered zones with a distinct-source count = the
// "independent evidence" the spec rewards (Ch 5: diversity, not quantity).
export function buildZones(priorBars, open, sigma, assetClass, name, cfg) {
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

  const zones = clusterLevels([...volLevels, ...structural], clusterPips, pip);
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
  } = opts;
  const cfg = {
    minSources: opts.minSources ?? 2, clusterPips: opts.clusterPips ?? (assetClass === 'fx' ? 10 : 8),
    fadeMax: opts.fadeMax ?? 0.45, reachMult: opts.reachMult ?? 1.5,
    slMult: opts.slMult ?? 1.5, rr: opts.rr ?? 1.5, slipPct,
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

    const open = bar.open;
    const priorBars = timed.slice(0, i);              // STRICTLY before session i (no lookahead)
    const { bands, zones } = buildZones(priorBars, open, sigma, assetClass, name, cfg);
    const T = dayTypeScore(closes, i, erWindow);
    const regime = classifyRegime(closes, i, 20, 5, slopeThresh, 1.0);
    const { action, orders } = planSession(open, bands, zones, T, regime, mode, cfg);
    if (!orders.length) continue;                     // No-Trade is a valid outcome (Ch 7)

    // Fill window: intraday if we have it, else the single D1 bar.
    const win = m1ByDate?.get(bar.date)
      ?? [{ time: Math.floor(Date.parse(bar.date) / 1000), open: bar.open, high: bar.high, low: bar.low, close: bar.close }];

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
  return { modes: out, trades };
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

      const { modes, trades } = compareZones(d1, m1ByDate, cfg.assetClass, cfg.name, opts);
      results.push({ instrument: cfg.name, assetClass: cfg.assetClass, modes, trades });
    } catch (e) {
      log.push(`  Error ${cfg.name}: ${e.message}`);
    }
  }
  return { results, log, opts };
}
