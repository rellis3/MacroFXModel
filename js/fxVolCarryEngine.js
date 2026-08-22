/**
 * FX/Gold Vol-Carry (VRP) Backtester — pure JavaScript engine.
 *
 * Tests whether CME CVOL's variance risk premium (VRP = implied − realized,
 * js/impliedVolCore.js) is useful as a GATE on the existing D1 exhaustion-band
 * primitive (resolveHonestDay, honestForecastEngine.js) — not a new leg, not a
 * synthetic options/variance-swap payoff. Spot-only, same fill/cost mechanics
 * every other honest backtest here uses:
 *
 *   • band selection (which side(s) get an order) comes from the SAME EMA
 *     regime classifier the fade/follow baselines already use — so all three
 *     arms below trade the same band, on the same days, differing ONLY in
 *     whether/how they act. That isolates what VRP actually adds.
 *   • VRP-gated arm: vrpZ ≥ richZ → FADE (implied priced richer than what has
 *     realized — bet the extreme holds); vrpZ ≤ cheapZ → FOLLOW (implied
 *     priced cheap vs realized — bet it extends); otherwise FLAT (no edge
 *     asserted, no trade — this is the hypothesis under test, not a fallback).
 *   • Baselines: always-fade and always-follow at the same band, every day —
 *     the named benchmarks a VRP gate has to beat OOS (CLAUDE.md: "name the
 *     benchmark before claiming improvement").
 *
 * IMPORTANT — this is NOT a variance-swap / short-vega backtest. No FX options
 * or variance swaps are tradable through this platform (spot only), so VRP is
 * used purely as a REGIME SIGNAL gating an already-tradable spot strategy, not
 * as a literal "sell implied variance" payoff. Say so plainly: a synthetic
 * variance-swap P&L would be a different (and more optimistic-looking) test
 * that this file deliberately does not run — see MD files/CLAUDE.md's
 * "don't run a lookalike and call it the thing."
 */
import {
  classifyRegime, ASSET_PARAMS, BM_P75, HN_P50, hvVarSeries, yzVolSeries, garchSigmas,
  fetchD1,
} from './volBacktestEngine.js';
import { resolveHonestDay, summarizeSplit } from './honestForecastEngine.js';
import { loadCvolSeries, loadCboeVolSeries, computeVRPSeries, crossCheckSeries, cvolMeta, cboeMeta } from './impliedVolCore.js';

const DEFAULT_COST_PCT = { fx: 0.012, index: 0.010, commodity: 0.020 };
const DEFAULT_SLIP_PCT = { fx: 0.006, index: 0.008, commodity: 0.012 };

// Each instrument names its PRIMARY implied-vol source (volSource: 'CME' —
// CME CVOL, cvolProduct — or 'CBOE' — GVZ/VXN, cboeProduct). CME CVOL only
// covers 6 USD-major FX pairs + gold, so NQ has no CME source and uses CBOE's
// VXN as primary instead — the only implied-vol data this platform has for
// the index asset class. GOLD additionally carries `crossCheck`: a SECOND,
// independent implied-vol read (CBOE's GVZ) of the same underlying CVOL
// already covers, used only to sanity-check the primary read (correlation +
// an overlay chart), never as a second trading arm — see runVRPSuite.
export const VRP_INSTRUMENTS = [
  { name: 'EURUSD', oanda: 'EUR_USD', assetClass: 'fx',        volSource: 'CME',  cvolProduct: 'EURUSD' },
  { name: 'GBPUSD', oanda: 'GBP_USD', assetClass: 'fx',        volSource: 'CME',  cvolProduct: 'GBPUSD' },
  { name: 'USDJPY', oanda: 'USD_JPY', assetClass: 'fx',        volSource: 'CME',  cvolProduct: 'USDJPY' },
  { name: 'AUDUSD', oanda: 'AUD_USD', assetClass: 'fx',        volSource: 'CME',  cvolProduct: 'AUDUSD' },
  { name: 'USDCAD', oanda: 'USD_CAD', assetClass: 'fx',        volSource: 'CME',  cvolProduct: 'USDCAD' },
  { name: 'USDCHF', oanda: 'USD_CHF', assetClass: 'fx',        volSource: 'CME',  cvolProduct: 'USDCHF' },
  { name: 'GOLD',   oanda: 'XAU_USD', assetClass: 'commodity', volSource: 'CME',  cvolProduct: 'XAUUSD',
    crossCheck: { volSource: 'CBOE', cboeProduct: 'XAUUSD' } },
  { name: 'NQ',     oanda: 'NAS100_USD', assetClass: 'index',  volSource: 'CBOE', cboeProduct: 'NAS100' },
];

function loadPrimaryVolRows(cfg) {
  return cfg.volSource === 'CBOE' ? loadCboeVolSeries(cfg.cboeProduct) : loadCvolSeries(cfg.cvolProduct);
}

// ── The selector: VRP z-score → action ────────────────────────────────────
// Mirrors selectStrategy(T, regime, cfg) in forecastCore.js in SHAPE (a small
// principled selector on top of the shared primitive — Lego Principle 4), but
// this one is driven by the options market's own richness/cheapness signal
// instead of the price-only day-type score T.
export function selectStrategyVRP(vrpZ, cfg = {}) {
  const { richZ = 0.5, cheapZ = -0.5 } = cfg;
  if (vrpZ == null || !Number.isFinite(vrpZ)) return 'flat';
  if (vrpZ >= richZ) return 'fade';
  if (vrpZ <= cheapZ) return 'follow';
  return 'flat';
}

function volSigmaSeriesFor(bars, assetClass, p) {
  const closes = bars.map(b => b.close);
  const out = new Float64Array(bars.length);
  if (assetClass === 'commodity') {
    const lr = [];
    for (let j = 1; j < closes.length; j++) lr.push(Math.log(closes[j] / closes[j - 1]));
    const hv = hvVarSeries(lr, 20);
    for (let i = 2; i < bars.length; i++) out[i] = Math.sqrt(Math.max(hv[i - 2], 1e-12));
  } else if (assetClass === 'index') {
    const g = garchSigmas(bars, p.garch_omega ?? 4.76e-6);
    for (let i = 0; i < bars.length; i++) out[i] = g[i];
  } else {
    const yz = yzVolSeries(bars, 30);
    for (let i = 1; i < bars.length; i++) out[i] = yz[i - 1] || 1e-6;
  }
  return out;
}

// ── One instrument, three arms, one shared band/day loop ─────────────────
export function runVRPBacktest(bars, assetClass, cvolRows, opts = {}) {
  const {
    dateFrom = '', dateTo = '', minLookback = 60, slopeThresh = 0.002, bearMult = 1.0,
    richZ = 0.5, cheapZ = -0.5, zPeriod = 252, oosFrac = 0.4,
  } = opts;
  const p = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  const costPct = opts.costPct ?? DEFAULT_COST_PCT[assetClass] ?? 0.012;
  const slipPct = opts.slipPct ?? DEFAULT_SLIP_PCT[assetClass] ?? 0.006;
  const closes = bars.map(b => b.close);
  const volSigmas = volSigmaSeriesFor(bars, assetClass, p);
  const vrpRows = computeVRPSeries(bars, cvolRows, assetClass, { zPeriod, garchOmega: p.garch_omega });
  const simOpts = { slMult: opts.slMult ?? 1.5, costPct, slipPct, breachReclaim: !!opts.breachReclaim };

  const rec = (b, regime, r, extra = {}) => ({
    date: b.date, regime, act: r.act, dir: r.dir, side: r.side,
    filled: r.filled, outcome: r.outcome, pnl_pct: r.pnlPct ?? r.pnl_pct ?? 0,
    mae_pct: r.maePct ?? 0, mfe_r: r.mfe_r ?? 0, sl_d_pct: r.slDPct ?? 0, ...extra,
  });

  const armRecords = { vrp: [], alwaysFade: [], alwaysFollow: [] };

  for (let i = minLookback; i < bars.length; i++) {
    const b = bars[i];
    if (dateFrom && b.date < dateFrom) continue;
    if (dateTo && b.date > dateTo) continue;
    const sigmaD = volSigmas[i];
    if (!sigmaD || sigmaD < 1e-8) continue;

    const hl75pct = BM_P75 * p.hl_75_corr * sigmaD * 100;
    const ocMedPct = HN_P50 * p.oc_corr * sigmaD * 100;
    const regime = classifyRegime(closes, i, 20, 5, slopeThresh, bearMult);
    const trend = regime === 'BULL' ? 'up' : regime === 'BEAR' ? 'down' : 'range';
    const band = trend === 'range' ? 'both' : trend;   // SAME band for all 3 arms

    const rFade = resolveHonestDay(b, hl75pct, ocMedPct, band, 'fade', simOpts);
    armRecords.alwaysFade.push(rec(b, regime, rFade));

    const rFollow = resolveHonestDay(b, hl75pct, ocMedPct, band, 'follow', simOpts);
    armRecords.alwaysFollow.push(rec(b, regime, rFollow));

    const vrpZ = vrpRows[i]?.vrpZ ?? null;
    const vrpAct = selectStrategyVRP(vrpZ, { richZ, cheapZ });
    if (vrpAct === 'flat') {
      armRecords.vrp.push(rec(b, regime, { act: '', dir: '', side: '', filled: false, outcome: 'no_fill', pnlPct: 0 }, { vrp_z: vrpZ }));
    } else {
      const rVrp = resolveHonestDay(b, hl75pct, ocMedPct, band, vrpAct, simOpts);
      armRecords.vrp.push(rec(b, regime, rVrp, { vrp_z: vrpZ }));
    }
  }

  return {
    diagnostics: vrpRows,
    arms: {
      vrp: summarizeSplit(armRecords.vrp, oosFrac),
      alwaysFade: summarizeSplit(armRecords.alwaysFade, oosFrac),
      alwaysFollow: summarizeSplit(armRecords.alwaysFollow, oosFrac),
    },
    equityCurves: {
      vrp: buildEquityCurve(armRecords.vrp),
      alwaysFade: buildEquityCurve(armRecords.alwaysFade),
      alwaysFollow: buildEquityCurve(armRecords.alwaysFollow),
    },
    monthlyHeatmap: monthlyHeatmap(armRecords.vrp),
    records: armRecords,
  };
}

function buildEquityCurve(records) {
  const filled = records.filter(r => r.filled).sort((a, b) => (a.date < b.date ? -1 : 1));
  let cum = 0;
  return filled.map(r => { cum += r.pnl_pct; return { date: r.date, cumPct: +cum.toFixed(3) }; });
}

function monthlyHeatmap(records) {
  const byMonth = new Map();
  for (const r of records.filter(r => r.filled)) {
    const m = r.date.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) || 0) + r.pnl_pct);
  }
  return [...byMonth.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, pnlPct]) => ({ month, pnlPct: +pnlPct.toFixed(3) }));
}

// ── House 3-CSV-export convention (MD files/CLAUDE.md) ────────────────────
// Every standard backtest results card ships these exact three schemas. R-unit
// here is the trade's OWN stop distance in % of price (sl_d_pct, vol-scaled,
// varies trade to trade) — NOT a fixed % of notional, so this R-multiple
// column is NOT numerically redundant with the % Return column (the
// degenerate case CLAUDE.md flags when both use the same fixed %).
const csvNum = x => (Number.isFinite(x) ? x.toFixed(2) : '0.00');

export function toCsvReturns(records) {
  const lines = ['Date,Return %,MAE %'];
  for (const r of records.filter(r => r.filled)) lines.push(`${r.date},${csvNum(r.pnl_pct)},${csvNum(r.mae_pct)}`);
  return lines.join('\n');
}

export function toCsvRMultiples(records) {
  const lines = ['date,R,MAE (R)'];
  for (const r of records.filter(r => r.filled)) {
    const risk = r.sl_d_pct > 1e-9 ? r.sl_d_pct : null;
    const R = risk ? r.pnl_pct / risk : 0;
    const maeR = risk ? r.mae_pct / risk : 0;
    lines.push(`${r.date},${R.toFixed(2)},${maeR.toFixed(2)}`);
  }
  return lines.join('\n');
}

// Fixed notional account convention, stated explicitly next to the export
// buttons on the page (CLAUDE.md: "state the account size... don't let them
// float as hidden constants"). Risk $ uses the trade's own vol-scaled sl_d_pct,
// not a fixed %.
export const DEFAULT_ACCOUNT_SIZE = 100_000;

export function toCsvCurrency(records, accountSize = DEFAULT_ACCOUNT_SIZE) {
  const lines = ['Trade Date,PnL ($),Risk ($)'];
  for (const r of records.filter(r => r.filled)) {
    const pnl = (r.pnl_pct / 100) * accountSize;
    const risk = (r.sl_d_pct / 100) * accountSize;
    lines.push(`${r.date},${pnl.toFixed(2)},${risk.toFixed(2)}`);
  }
  return lines.join('\n');
}

// ── Public: fetch + run across instruments ────────────────────────────────
export async function runVRPSuite(opts = {}, instruments = VRP_INSTRUMENTS) {
  if (!process.env.OANDA_KEY) throw new Error('OANDA_KEY not set — cannot fetch D1 data');
  const log = [];
  const results = [];
  for (const cfg of instruments) {
    try {
      log.push(`Fetching ${cfg.name}…`);
      const bars = await fetchD1(cfg.oanda, 3000);
      const volRows = loadPrimaryVolRows(cfg);
      if (!volRows.length) { log.push(`  No ${cfg.volSource} data for ${cfg.name}`); continue; }
      log.push(`  ${bars.length} D1 bars, ${volRows.length} ${cfg.volSource} rows (${volRows[0]?.date} → ${volRows.at(-1)?.date})`);
      const out = runVRPBacktest(bars, cfg.assetClass, volRows, opts);
      const vrpTrades = out.records.vrp.filter(r => r.filled).length;
      log.push(`  ${vrpTrades} VRP-gated fills`);

      let crossCheck = null;
      if (cfg.crossCheck) {
        const xcRows = loadPrimaryVolRows(cfg.crossCheck);
        if (xcRows.length) {
          crossCheck = { source: cfg.crossCheck.volSource, product: cfg.crossCheck.cboeProduct ?? cfg.crossCheck.cvolProduct, ...crossCheckSeries(bars, volRows, xcRows) };
          log.push(`  Cross-check vs ${crossCheck.source} (${crossCheck.product}): n=${crossCheck.n}, corr=${crossCheck.correlation}`);
        } else {
          log.push(`  Cross-check requested but no ${cfg.crossCheck.volSource} data found`);
        }
      }

      results.push({ instrument: cfg.name, assetClass: cfg.assetClass, volSource: cfg.volSource, volProduct: cfg.cboeProduct ?? cfg.cvolProduct, crossCheck, ...out });
    } catch (e) {
      log.push(`  Error ${cfg.name}: ${e.message}`);
    }
  }
  return { results, log, opts, cvolMeta: cvolMeta(), cboeMeta: cboeMeta() };
}
