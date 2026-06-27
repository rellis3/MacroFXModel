/**
 * Honest Forecast Harness — pure JavaScript engine.
 *
 * Purpose: re-test the daily vol/range forecast strategy under HONEST
 * assumptions, so we can tell whether it has real, tradable edge rather than an
 * in-sample / optimistic-fill mirage. It deliberately corrects the three things
 * that flatter the original `volBacktestEngine.js`:
 *
 *   1. FILLS    — optional breach-and-reclaim (price must poke the band AND
 *                 close back through it) instead of touch-fill; plus slippage.
 *   2. COSTS    — round-trip spread + commission deducted from every trade,
 *                 with extra slippage on breakout (stop) entries and SL exits.
 *   3. SELECTION— a true in-sample / out-of-sample date split, reported side by
 *                 side, so degradation is visible.
 *
 * And it makes the CENTRAL QUESTION explicit. At the forecast exhaustion band
 * (open ± HL_75) price either mean-reverts or breaks out. The original engine
 * ALWAYS fades. Here `entryMode` chooses:
 *
 *   'fade'    — counter-trend at the band (sell the up-band / buy the down-band)
 *   'follow'  — with-trend at the band  (buy the up-band  / sell the down-band)
 *   'regime'  — classifier: FOLLOW when the EMA-slope regime trends in the
 *               band's direction, FADE when the regime is RANGE. Encodes the
 *               hypothesis "trend days continue through the extreme, range days
 *               revert from it."
 *   'regime_fade' — the inverse of 'regime' (sanity / null check).
 *
 * Vol math (sigma series, regime, band multipliers) is imported from
 * volBacktestEngine.js — single source of truth, no duplication.
 */

import {
  hvVarSeries, yzVolSeries, garchSigmas, classifyRegime,
  ASSET_PARAMS, BM_P75, HN_P50, fetchD1, INSTRUMENTS,
} from './volBacktestEngine.js';
// Metrics live in the metricsCore lego brick (single source of truth).
import { summarizeTrades } from './metricsCore.js';

// Typical round-trip friction (spread + commission) in % of price, per asset
// class. Conservative retail-ish defaults; override via opts.costPct.
const DEFAULT_COST_PCT = { fx: 0.012, index: 0.010, commodity: 0.020 };
// Extra slippage (% of price) added to breakout/stop fills and to SL exits.
const DEFAULT_SLIP_PCT = { fx: 0.006, index: 0.008, commodity: 0.012 };

// ── Single-day simulator under honest assumptions ────────────────────────────
//
// We model a trader who, BEFORE the day, knows the forecast band and the regime
// (computed with no lookahead) and places ONE resting order at the regime-
// relevant exhaustion band. We then resolve it against the day's OHLC.
//
// Returns { filled, side, dir, outcome, pnlPct (net of costs), mfe_r }.
// Resolution is MARK-TO-CLOSE with an optional hard stop. We deliberately do
// NOT assume the intrabar take-profit was scalped — on a daily bar you cannot
// know whether TP or SL printed first, and assuming TP is the biggest source of
// optimistic bias. Holding to the close (with a stop) is symmetric across fade
// and follow, so the two hypotheses are fairly comparable.
function simulateDayHonest(bar, hl75pct, ocMedPct, regime, opts) {
  const { open, high, low, close } = bar;
  const {
    entryMode = 'fade', slMult = 1.5,
    costPct = 0.012, slipPct = 0.006, breachReclaim = false,
  } = opts;

  const hl  = open * hl75pct  / 100;   // exhaustion distance
  const slD = hl * slMult;
  const upBand = open + hl;
  const dnBand = open - hl;

  // Which band do we rest an order at, and do we fade or follow it?
  let band, act;
  const trend = regime === 'BULL' ? 'up' : regime === 'BEAR' ? 'down' : 'range';
  if (entryMode === 'fade') {
    band = trend === 'range' ? 'both' : trend;  act = 'fade';
  } else if (entryMode === 'follow') {
    band = trend === 'range' ? 'both' : trend;  act = 'follow';
  } else if (entryMode === 'regime') {
    if (trend === 'range') { band = 'both'; act = 'fade'; }
    else                   { band = trend;  act = 'follow'; }
  } else { // regime_fade
    if (trend === 'range') { band = 'both'; act = 'follow'; }
    else                   { band = trend;  act = 'fade'; }
  }

  // Resolve one order. isStop = breakout entry (level on the far side of the
  // move → fills as price runs INTO it → slips). Otherwise a resting limit.
  function resolve(level, side, isStop) {
    // Fill test depends on order type, not just side:
    //   limit BUY (below open) fills on low≤level; stop BUY (above) on high≥level
    //   limit SELL (above open) fills on high≥level; stop SELL (below) on low≤level
    const fillUp = side === 'BUY' ? (isStop ? high >= level : low <= level)
                                  : (isStop ? low  <= level : high >= level);
    if (!fillUp) return null;

    if (breachReclaim) {
      // Fades: price must pierce the band and CLOSE back through it (reversal).
      // Follows: price must CLOSE beyond the band (break-and-hold).
      if (act === 'fade') {
        if (side === 'SELL' && !(high > level && close < level)) return null;
        if (side === 'BUY'  && !(low  < level && close > level)) return null;
      } else {
        if (side === 'BUY'  && !(close > level)) return null;
        if (side === 'SELL' && !(close < level)) return null;
      }
    }

    const slip  = isStop ? open * slipPct / 100 : 0;          // breakout entries slip
    const entry = side === 'BUY' ? level + slip : level - slip;
    const sl    = side === 'BUY' ? entry - slD  : entry + slD;
    const slExitSlip = open * slipPct / 100;                  // stop exits slip

    let gross, outcome;
    if (side === 'SELL') {
      if (high >= sl) { gross = -((sl - entry) + slExitSlip) / open * 100; outcome = 'loss'; }
      else            { gross = (entry - close) / open * 100; outcome = gross > 0 ? 'win' : 'open'; }
    } else {
      if (low <= sl)  { gross = -((entry - sl) + slExitSlip) / open * 100; outcome = 'loss'; }
      else            { gross = (close - entry) / open * 100; outcome = gross > 0 ? 'win' : 'open'; }
    }
    const mfeExc = side === 'SELL' ? Math.max(0, entry - low) : Math.max(0, high - entry);
    const mfe_r  = slD > 0 ? +Math.min(mfeExc / slD, 5).toFixed(3) : 0;
    return { side, outcome, pnlPct: +(gross - costPct).toFixed(5), mfe_r };
  }

  const orders = [];
  const wantUp   = band === 'up'   || band === 'both';
  const wantDown = band === 'down' || band === 'both';
  if (act === 'fade') {                       // resting limits at the extreme
    if (wantUp)   orders.push(['up',   upBand, 'SELL', false]);
    if (wantDown) orders.push(['down', dnBand, 'BUY',  false]);
  } else {                                     // breakout stops through the extreme
    if (wantUp)   orders.push(['up',   upBand, 'BUY',  true]);
    if (wantDown) orders.push(['down', dnBand, 'SELL', true]);
  }

  for (const [dir, level, side, isStop] of orders) {
    const r = resolve(level, side, isStop);
    if (r) return { filled: true, dir, act, ...r };
  }
  return { filled: false, dir: '', act, side: '', outcome: 'no_fill', pnlPct: 0, mfe_r: 0 };
}

// ── Walk-forward engine (one entryMode) ──────────────────────────────────────

export function runHonest(bars, assetClass, opts = {}) {
  const {
    dateFrom = '', dateTo = '', minLookback = 60, slopeThresh = 0.002, bearMult = 1.0,
  } = opts;
  const p = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  const costPct = opts.costPct ?? DEFAULT_COST_PCT[assetClass] ?? 0.012;
  const slipPct = opts.slipPct ?? DEFAULT_SLIP_PCT[assetClass] ?? 0.006;
  const closes  = bars.map(b => b.close);

  // Vol sigma series (no lookahead) — mirrors volBacktestEngine.runBacktest.
  let volSigmas;
  if (assetClass === 'commodity') {
    const lr = [];
    for (let j = 1; j < closes.length; j++) lr.push(Math.log(closes[j] / closes[j - 1]));
    const hv = hvVarSeries(lr, 20);
    volSigmas = new Float64Array(bars.length);
    for (let i = 2; i < bars.length; i++) volSigmas[i] = Math.sqrt(Math.max(hv[i - 2], 1e-12));
  } else if (assetClass === 'index') {
    volSigmas = garchSigmas(bars, p.garch_omega ?? 4.76e-6);
  } else {
    const yz = yzVolSeries(bars, 30);
    volSigmas = new Float64Array(bars.length);
    for (let i = 1; i < bars.length; i++) volSigmas[i] = yz[i - 1] || 1e-6;
  }

  const sim = {
    entryMode: opts.entryMode ?? 'fade', slMult: opts.slMult ?? 1.5,
    costPct, slipPct, breachReclaim: !!opts.breachReclaim,
  };

  const records = [];
  for (let i = minLookback; i < bars.length; i++) {
    const b = bars[i];
    if (dateFrom && b.date < dateFrom) continue;
    if (dateTo   && b.date > dateTo)   continue;
    const sigmaD = volSigmas[i];
    if (!sigmaD || sigmaD < 1e-8) continue;

    const hl75pct  = BM_P75 * p.hl_75_corr * sigmaD * 100;
    const ocMedPct = HN_P50 * p.oc_corr    * sigmaD * 100;
    const regime   = classifyRegime(closes, i, 20, 5, slopeThresh, bearMult);
    const r        = simulateDayHonest(b, hl75pct, ocMedPct, regime, sim);

    records.push({
      date: b.date, regime, act: r.act, dir: r.dir, side: r.side,
      filled: r.filled, outcome: r.outcome, pnl_pct: r.pnlPct, mfe_r: r.mfe_r ?? 0,
    });
  }
  return records;
}

// ── Metrics ──────────────────────────────────────────────────────────────────

// Per-trade summary. Delegates to the metricsCore lego brick so the metric
// definitions (per-trade Sharpe annualised by actual trade frequency, additive
// drawdown, PF 99-fallback) live in ONE place. `js/legoBricks.test.mjs` proves
// `summarizeTrades` reproduces this function's original numbers bit-for-bit
// against a frozen baseline, so the delegation changes nothing.
export function summarize(records) {
  const filled = records.filter(r => r.filled);
  return summarizeTrades(filled.map(r => r.pnl_pct), filled.map(r => r.date));
}

// Split records by date fraction into in-sample / out-of-sample and summarize.
export function summarizeSplit(records, oosFrac = 0.4) {
  const filled = records.filter(r => r.filled).sort((a, b) => a.date < b.date ? -1 : 1);
  // Split on the underlying date timeline, not the filled-trade index, so the
  // OOS window is a genuine later time period.
  const all = records.slice().sort((a, b) => a.date < b.date ? -1 : 1);
  if (!all.length) return { is: summarize([]), oos: summarize([]), full: summarize([]), splitDate: null };
  const cut = Math.floor(all.length * (1 - oosFrac));
  const splitDate = all[cut]?.date ?? null;
  const isRec  = records.filter(r => splitDate ? r.date < splitDate : true);
  const oosRec = records.filter(r => splitDate ? r.date >= splitDate : false);
  return { is: summarize(isRec), oos: summarize(oosRec), full: summarize(records), splitDate, filledTrades: filled.length };
}

// ── Public: run the three competing hypotheses for one instrument ────────────

export function compareModes(bars, assetClass, opts = {}) {
  const modes = ['fade', 'follow', 'regime'];
  const out = {};
  for (const m of modes) {
    const recs = runHonest(bars, assetClass, { ...opts, entryMode: m });
    out[m] = { ...summarizeSplit(recs, opts.oosFrac ?? 0.4) };
  }
  return out;
}

// ── Public: fetch + run across instruments ───────────────────────────────────

export async function runHonestSuite(opts = {}, instruments = INSTRUMENTS) {
  if (!process.env.OANDA_KEY) throw new Error('OANDA_KEY not set — cannot fetch D1 data');
  const log = [];
  const results = [];
  for (const cfg of instruments) {
    try {
      log.push(`Fetching ${cfg.name}…`);
      const bars = await fetchD1(cfg.oanda, 5000);
      log.push(`  ${bars.length} bars (${bars[0]?.date} → ${bars.at(-1)?.date})`);
      const cmp = compareModes(bars, cfg.assetClass, opts);
      results.push({ instrument: cfg.name, assetClass: cfg.assetClass, modes: cmp });
    } catch (e) {
      log.push(`  Error ${cfg.name}: ${e.message}`);
    }
  }
  return { results, log, opts };
}

export { INSTRUMENTS as HONEST_INSTRUMENTS };
