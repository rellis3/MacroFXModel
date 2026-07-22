// js/maxCopierEngine.js
// ─────────────────────────────────────────────────────────────────────────────
// Max Copier strategy backtester (v1) — an M1-driven, event-based engine.
//
// WHAT THIS TESTS (honest framing — read `max copier strategy.md`):
// A MECHANICAL PROXY of a discretionary momentum-continuation strategy:
//
//   HTF level  →  impulse move past it  →  LTF consolidation  →  price rotates
//   back into the value-area  →  hidden-divergence confirms  →  enter a basket
//   of N positions  →  manage the basket to an exit.
//
// Every phrase in the doc ("significant" level, "decisive" impulse, "value area
// low", "hidden divergence", "keep more on if strong") is folklore, not a
// number. Each threshold below is a degree of freedom = overfit surface. So the
// result is a proxy of the *rules*, not the trader's discretion — read it OOS.
//
// LEGO DISCIPLINE: this file imports every primitive and writes ONLY the new
// event logic. It reuses `loadM1ForPair` (M1 loader), `extractBars`/`resampleTo`
// (barUtils), `atrWilder`/`rsiWilder` (indicatorCore), `summarizeSplit`
// (metrics/OOS split via forecastCore), the `instrumentRegistry` (pip/asset
// class) and the shared default frictions. It does NOT copy vol math or the
// vol-band `simulateEntry` primitive — that primitive is a daily vol-band entry
// and does not fit a level→pullback intraday event; forcing it would be the
// "bespoke leg in disguise" anti-pattern in reverse. The NEW idea here is the
// setup detector + the basket exit SELECTOR (three exit modes), proven OOS.
//
// EXIT MODE is a SELECTOR, not a pile of knobs. Three modes are simulated on the
// SAME detected signals so the winner is chosen on OOS Sharpe, not fitted:
//   • 'fixed_r'      — minimal-DOF baseline: whole basket exits at tpR·R or stop
//   • 'shared_htf'   — whole basket exits at a measured-move target or stop
//   • 'ladder_trail' — scale 1/N off at 1R/2R/3R…; trail the final runner
//                      (maps to the doc's three scenarios: fail / manage / run)
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: `loadM1ForPair` (and its parquet decoder) is imported LAZILY inside the
// async suite only, so the pure engine + its unit test stay dependency-free and
// network-free (Lego: cores are testable on synthetic data without the network).
import { extractBars, resampleTo, bisect } from './barUtils.js';
import { atrWilder, rsiWilder } from './indicatorCore.js';
import { summarizeSplit, DEFAULT_COST_PCT, DEFAULT_SLIP_PCT } from './forecastCore.js';
import { instrument } from './instrumentRegistry.js';

// The 26 M1 parquets that live on disk / R2: 24 FX pairs + gold. (Index CFDs in
// the registry have no M1 parquet, so they are intentionally excluded here.)
const FX_PAIRS = [
  'eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'gbpjpy', 'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'eurnzd',
  'audjpy', 'audnzd', 'audcad', 'audchf', 'gbpaud', 'gbpcad', 'gbpchf',
  'cadjpy', 'chfjpy', 'nzdjpy',
];
export const MAXCOPIER_INSTRUMENTS = [...FX_PAIRS, 'gold'];
export const EXIT_MODES = ['fixed_r', 'shared_htf', 'ladder_trail'];

export const MAXCOPIER_DEFAULTS = {
  // — setup detection —
  donchianLookback: 20,   // HTF (1H) bars used to define the "significant" high/low
  impulseAtrMult:   0.5,  // 1H close must clear the level by ≥ this × ATR(1H)
  consolBars:       16,   // M15 bars taken as the consolidation window (≈ 4h)
  consolMaxAtr:     2.5,  // reject if consolidation range > this × ATR(1H)
  vaDepth:          0.30, // value-area-low = range low + vaDepth × range (long)
  entryTimeout:     32,   // M15 bars to wait for price to rotate into the value area
  stopAtrBuffer:    0.5,  // stop = consolidation extreme ± this × ATR(1H)
  requireDivergence: true,// require a hidden divergence to confirm (the fragile module)
  minGapBars:       20,   // min 1H bars between successive impulses (same direction)
  // — basket —
  nPositions:       4,    // 3–5 per the doc
  maxHoldBarsM15:   96,   // hard time stop (≈ 24h) if neither TP nor SL is hit
  // — exit-mode params —
  tpR:              2.0,  // fixed_r: basket TP in R multiples
  mmMult:           1.0,  // shared_htf: measured-move multiple of the impulse leg
  ladderR:          1.0,  // ladder_trail: R spacing of the scale-out rungs
  trailAtrMult:     3.0,  // ladder_trail: chandelier trail distance (× ATR(1H))
  trailStartR:      1.0,  // ladder_trail: arm the trail once MFE ≥ this × R
  // — reporting —
  oosFrac:          0.4,  // out-of-sample tail fraction for summarizeSplit
  atrPeriod:        20,   // ATR(1H) Wilder period
  rsiPeriod:        14,   // RSI(M15) period for divergence
};

const round = (x, d = 5) => {
  if (!Number.isFinite(x)) return 0;
  const f = 10 ** d;
  return Math.round(x * f) / f;
};
const isoDate = (epochSec) => new Date(epochSec * 1000).toISOString().slice(0, 10);

function costsFor(pairKey) {
  let ac = 'fx';
  try { ac = instrument(pairKey).assetClass || 'fx'; } catch { /* unknown → fx */ }
  const cost = DEFAULT_COST_PCT[ac] ?? DEFAULT_COST_PCT.fx;
  const slip = DEFAULT_SLIP_PCT[ac] ?? DEFAULT_SLIP_PCT.fx;
  return { assetClass: ac, costPct: cost, slipPct: slip };
}

// ── Swing-point (fractal) detection, causal ──────────────────────────────────
// A bar k is a swing low if its low is ≤ both neighbours d bars either side.
// Only bars with k+d ≤ hiIdx are confirmable (no lookahead past the entry bar).
export function swingLows(lows, loIdx, hiIdx, d = 2) {
  const out = [];
  for (let k = loIdx + d; k + d <= hiIdx; k++) {
    let ok = true;
    for (let s = 1; s <= d; s++) {
      if (lows[k] > lows[k - s] || lows[k] > lows[k + s]) { ok = false; break; }
    }
    if (ok) out.push(k);
  }
  return out;
}
export function swingHighs(highs, loIdx, hiIdx, d = 2) {
  const out = [];
  for (let k = loIdx + d; k + d <= hiIdx; k++) {
    let ok = true;
    for (let s = 1; s <= d; s++) {
      if (highs[k] < highs[k - s] || highs[k] < highs[k + s]) { ok = false; break; }
    }
    if (ok) out.push(k);
  }
  return out;
}

// Bullish hidden divergence: price higher-low + RSI lower-low (uptrend continues).
// Bearish hidden divergence: price lower-high + RSI higher-high (downtrend continues).
export function hasHiddenDivergence(dir, m15, rsi15, loIdx, hiIdx, d = 2) {
  if (dir === 'long') {
    const sw = swingLows(m15.lows, loIdx, hiIdx, d);
    if (sw.length < 2) return false;
    const p1 = sw[sw.length - 2], p2 = sw[sw.length - 1];
    return m15.lows[p2] > m15.lows[p1] && rsi15[p2] < rsi15[p1] &&
           Number.isFinite(rsi15[p1]) && Number.isFinite(rsi15[p2]);
  } else {
    const sw = swingHighs(m15.highs, loIdx, hiIdx, d);
    if (sw.length < 2) return false;
    const p1 = sw[sw.length - 2], p2 = sw[sw.length - 1];
    return m15.highs[p2] < m15.highs[p1] && rsi15[p2] > rsi15[p1] &&
           Number.isFinite(rsi15[p1]) && Number.isFinite(rsi15[p2]);
  }
}

// ── 1) Detect setups on the SAME data for every exit mode ────────────────────
// Returns an array of confirmed signals (dir, entry, stop, slDist, level,
// impulseExtreme, atr, entryTime, date). No lookahead: the Donchian level uses
// only prior 1H bars, the impulse is confirmed at the 1H bar close, and the
// consolidation / entry / divergence all use M15 bars up to the entry bar.
function detectSignals(h1, m15, m15arr, rsi15, atr1h, opts) {
  const L = opts.donchianLookback;
  const sigs = [];
  const m15times = m15.map((b) => b.time);
  const lastImpulse = { long: -1e9, short: -1e9 };

  for (let i = L; i < h1.length; i++) {
    const atr = atr1h[i];
    if (!(atr > 0)) continue;
    // Donchian level from the prior L bars only.
    let hi = -Infinity, lo = Infinity;
    for (let j = i - L; j < i; j++) { if (h1[j].high > hi) hi = h1[j].high; if (h1[j].low < lo) lo = h1[j].low; }
    const c = h1[i].close;

    let dir = null, level = null, impulseExtreme = null;
    if (c - hi >= opts.impulseAtrMult * atr) { dir = 'long';  level = hi; impulseExtreme = h1[i].high; }
    else if (lo - c >= opts.impulseAtrMult * atr) { dir = 'short'; level = lo; impulseExtreme = h1[i].low; }
    if (!dir) continue;
    if (i - lastImpulse[dir] < opts.minGapBars) continue;

    // Consolidation window: the next `consolBars` M15 bars after the impulse bar.
    const impEnd = h1[i].time + 3600;
    const cStart = bisect(m15times, impEnd);
    const cEnd = cStart + opts.consolBars;
    if (cEnd + 1 >= m15.length) continue;
    let cHigh = -Infinity, cLow = Infinity;
    for (let k = cStart; k < cEnd; k++) { if (m15[k].high > cHigh) cHigh = m15[k].high; if (m15[k].low < cLow) cLow = m15[k].low; }
    const range = cHigh - cLow;
    if (!(range > 0) || range > opts.consolMaxAtr * atr) continue; // no clean consolidation

    lastImpulse[dir] = i; // count the impulse as consumed even if no entry follows

    // Value area boundary + resting entry.
    const entryPx = dir === 'long' ? cLow + opts.vaDepth * range
                                   : cHigh - opts.vaDepth * range;
    // Wait for price to rotate into the value area within the timeout.
    let fillIdx = -1;
    for (let k = cEnd; k < Math.min(cEnd + opts.entryTimeout, m15.length); k++) {
      if (dir === 'long' ? m15[k].low <= entryPx : m15[k].high >= entryPx) { fillIdx = k; break; }
    }
    if (fillIdx < 0) continue;

    // Hidden-divergence confirmation over the pullback (causal: bars ≤ fillIdx).
    if (opts.requireDivergence &&
        !hasHiddenDivergence(dir, m15arr, rsi15, cStart, fillIdx, 2)) continue;

    const stop = dir === 'long' ? cLow - opts.stopAtrBuffer * atr
                                : cHigh + opts.stopAtrBuffer * atr;
    const slDist = Math.abs(entryPx - stop);
    if (!(slDist > 0)) continue;

    // Enter at the value-area touch; simulate exits from the END of the fill bar
    // (conservative — no intrabar credit on the fill bar itself).
    const entryTime = m15[fillIdx].time + 15 * 60;
    sigs.push({
      dir, entry: entryPx, stop, slDist, level, impulseExtreme, atr,
      entryTime, date: isoDate(m15[fillIdx].time),
    });
  }
  return sigs;
}

// ── 2) Simulate a basket to exit for one exit mode ───────────────────────────
// Walks the real M1 path from entry. Returns { basketPnlPct, positions[] } where
// positions are the individual fills (what actually hits a prop account). MAE is
// read off the true path (low-vs-entry long / high-vs-entry short), never from
// the close-to-close return.
function simulateBasket(sig, packed, opts, mode, frictions) {
  const { dir, entry, stop, slDist, level, impulseExtreme, atr, entryTime, date } = sig;
  const long = dir === 'long';
  const bars = extractBars(packed, entryTime, entryTime + opts.maxHoldBarsM15 * 15 * 60);
  if (bars.length < 2) return null;
  const N = Math.max(1, Math.round(opts.nPositions));
  const costPts = (frictions.costPct / 100) * entry;
  const slipPts = (frictions.slipPct / 100) * entry;

  // Per-mode take-profit ladder (price levels). null ⇒ position is the trailing runner.
  const tps = new Array(N).fill(null);
  if (mode === 'fixed_r') {
    const tp = long ? entry + opts.tpR * slDist : entry - opts.tpR * slDist;
    tps.fill(tp);
  } else if (mode === 'shared_htf') {
    const mm = Math.abs(impulseExtreme - level);
    const tp = long ? entry + opts.mmMult * mm : entry - opts.mmMult * mm;
    // Never target through/behind entry; fall back to 2R if the leg is degenerate.
    const tpSafe = long ? Math.max(tp, entry + 2 * slDist) : Math.min(tp, entry - 2 * slDist);
    tps.fill(tpSafe);
  } else { // ladder_trail: rungs 1R..(N-1)R, last position trails
    for (let p = 0; p < N - 1; p++) {
      const r = (p + 1) * opts.ladderR;
      tps[p] = long ? entry + r * slDist : entry - r * slDist;
    }
    tps[N - 1] = null; // runner
  }

  const open = tps.map(() => true);
  const exit = new Array(N).fill(null); // { px, reason }
  const maeAtExit = new Array(N).fill(0);
  let extreme = long ? entry : entry;  // best-favourable extreme for the trail
  let mae = 0;                          // running max adverse excursion (price pts, ≥0)
  let trailStop = stop;

  const settle = (p, px, reason) => {
    if (!open[p]) return;
    open[p] = false; exit[p] = { px, reason }; maeAtExit[p] = mae;
  };

  for (let bi = 0; bi < bars.length && open.some(Boolean); bi++) {
    const b = bars[bi];
    // Update excursions off the real path.
    const adv = long ? b.high - entry : entry - b.low;   // favourable
    const adverse = long ? entry - b.low : b.high - entry; // adverse
    if (adverse > mae) mae = adverse;
    if (adv > (long ? extreme - entry : entry - extreme)) extreme = long ? b.high : b.low;

    // Hard stop first (conservative — assume the low/high tags the stop before any TP).
    const hitStop = long ? b.low <= stop : b.high >= stop;
    if (hitStop) { for (let p = 0; p < N; p++) settle(p, stop, 'stop'); break; }

    // Fixed TP rungs.
    for (let p = 0; p < N; p++) {
      if (!open[p] || tps[p] == null) continue;
      const hitTp = long ? b.high >= tps[p] : b.low <= tps[p];
      if (hitTp) settle(p, tps[p], 'tp');
    }

    // Trailing runner (ladder_trail only).
    if (mode === 'ladder_trail' && open[N - 1]) {
      const mfe = long ? extreme - entry : entry - extreme;
      if (mfe >= opts.trailStartR * slDist) {
        const cand = long ? extreme - opts.trailAtrMult * atr : extreme + opts.trailAtrMult * atr;
        trailStop = long ? Math.max(trailStop, cand) : Math.min(trailStop, cand);
        const hitTrail = long ? b.low <= trailStop : b.high >= trailStop;
        if (hitTrail) settle(N - 1, trailStop, 'trail');
      }
    }
  }

  // Time stop: close anything still open at the last available close.
  const lastClose = bars[bars.length - 1].close;
  for (let p = 0; p < N; p++) if (open[p]) settle(p, lastClose, 'time');

  // Score each position (net of round-trip cost; slippage added on stop/trail exits).
  const positions = [];
  let basketPnlPct = 0;
  for (let p = 0; p < N; p++) {
    const ex = exit[p];
    const grossPts = long ? ex.px - entry : entry - ex.px;
    const slip = (ex.reason === 'stop' || ex.reason === 'trail') ? slipPts : 0;
    const netPts = grossPts - costPts - slip;
    const pnlPct = (netPts / entry) * 100;
    const pnlR = slDist > 0 ? netPts / slDist : 0;
    const maePts = Math.max(0, maeAtExit[p]);
    const maePct = -(maePts / entry) * 100;              // reported negative
    const maeR = slDist > 0 ? -Math.max(maePts / slDist, -Math.min(pnlR, 0)) : 0;
    basketPnlPct += pnlPct;
    positions.push({
      date, dir, pos: p + 1, entry: round(entry), exit: round(ex.px), reason: ex.reason,
      pnlPct: round(pnlPct, 4), pnlR: round(pnlR, 4),
      maePct: round(maePct, 4), maeR: round(maeR, 4), slDist: round(slDist),
    });
  }
  basketPnlPct /= N; // equal-weight basket = the honest per-signal return unit
  return { basketPnlPct: round(basketPnlPct, 5), positions };
}

// ── 3) Pure per-instrument run (network-free; feed it a packed M1 series) ─────
export function runMaxCopier(packed, pairKey, userOpts = {}) {
  const opts = { ...MAXCOPIER_DEFAULTS, ...userOpts };
  const frictions = costsFor(pairKey);
  const out = { pair: pairKey, ...frictions, signalCount: 0, modes: {}, dateRange: null };
  if (!packed || !packed.n || packed.n < 500) { for (const m of EXIT_MODES) out.modes[m] = { records: [], positions: [] }; return out; }

  const from = packed.times[0], to = packed.times[packed.n - 1] + 60;
  out.dateRange = [isoDate(from), isoDate(to)];
  const allBars = extractBars(packed, from, to);
  const h1 = resampleTo(allBars, 60);
  const m15 = resampleTo(allBars, 15);
  if (h1.length < opts.donchianLookback + 5 || m15.length < 50) { for (const m of EXIT_MODES) out.modes[m] = { records: [], positions: [] }; return out; }

  const atr1h = atrWilder(h1, opts.atrPeriod);
  const rsi15 = rsiWilder(m15.map((b) => b.close), opts.rsiPeriod);
  const m15arr = { highs: m15.map((b) => b.high), lows: m15.map((b) => b.low) };

  const signals = detectSignals(h1, m15, m15arr, rsi15, atr1h, opts);
  out.signalCount = signals.length;

  for (const mode of EXIT_MODES) {
    const records = [], positions = [];
    for (const sig of signals) {
      const r = simulateBasket(sig, packed, opts, mode, frictions);
      if (!r) continue;
      records.push({ date: sig.date, filled: true, pnl_pct: r.basketPnlPct, dir: sig.dir });
      for (const pos of r.positions) positions.push(pos);
    }
    out.modes[mode] = { records, positions };
  }
  return out;
}

// ── 4) Compare exit modes for one instrument via the honest IS/OOS split ──────
export function compareMaxCopier(packed, pairKey, userOpts = {}) {
  const opts = { ...MAXCOPIER_DEFAULTS, ...userOpts };
  const run = runMaxCopier(packed, pairKey, opts);
  const modes = {};
  for (const mode of EXIT_MODES) {
    const { records, positions } = run.modes[mode];
    modes[mode] = { split: summarizeSplit(records, opts.oosFrac), nRecords: records.length, positions };
  }
  return {
    pair: pairKey, assetClass: run.assetClass, costPct: run.costPct, slipPct: run.slipPct,
    signalCount: run.signalCount, dateRange: run.dateRange, modes,
  };
}

// Pick the exit mode with the best OOS Sharpe among those clearing the ≥30-OOS-
// trade gate (Lego Principle 5). Returns null if none qualifies.
export function bestMode(perModeSplits) {
  let best = null;
  for (const mode of EXIT_MODES) {
    const oos = perModeSplits[mode]?.split?.oos;
    if (!oos || oos.trades < 30) continue;
    if (!best || oos.sharpe > best.sharpe) best = { mode, sharpe: oos.sharpe, trades: oos.trades };
  }
  return best;
}

// ── 5) Async suite: load M1 per instrument, run, pool ────────────────────────
// The network layer the route calls. Returns { results, pooled, log, opts }.
export async function runMaxCopierSuite(userOpts = {}, instruments = MAXCOPIER_INSTRUMENTS, m1Dir = null) {
  const opts = { ...MAXCOPIER_DEFAULTS, ...userOpts };
  const { loadM1ForPair, BT_M1_DIR } = await import('./volBacktestM1Engine.js');
  const dir = m1Dir || BT_M1_DIR;
  const results = [];
  const log = [];
  // Pooled (portfolio) basket records per mode, concatenated across instruments.
  const pooledRecords = Object.fromEntries(EXIT_MODES.map((m) => [m, []]));

  for (const pairKey of instruments) {
    try {
      const packed = await loadM1ForPair(pairKey, dir);
      if (!packed) { log.push(`${pairKey}: no M1 data — skipped`); continue; }
      const run = runMaxCopier(packed, pairKey, opts);
      const modes = {};
      for (const mode of EXIT_MODES) {
        const { records, positions } = run.modes[mode];
        modes[mode] = { split: summarizeSplit(records, opts.oosFrac), nRecords: records.length, records, positions };
        for (const rec of records) pooledRecords[mode].push(rec);
      }
      const best = bestMode(modes);
      results.push({
        pair: pairKey, assetClass: run.assetClass, costPct: run.costPct, slipPct: run.slipPct,
        signalCount: run.signalCount, dateRange: run.dateRange, best, modes,
      });
      log.push(`${pairKey}: ${run.signalCount} signals; best OOS = ${best ? `${best.mode} (Sharpe ${best.sharpe})` : 'none ≥30'}`);
    } catch (e) {
      log.push(`${pairKey}: ERROR ${e?.message || e}`);
    }
  }

  const pooled = {};
  for (const mode of EXIT_MODES) {
    pooledRecords[mode].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    pooled[mode] = { split: summarizeSplit(pooledRecords[mode], opts.oosFrac), nRecords: pooledRecords[mode].length };
  }
  pooled.best = bestMode(pooled);

  return { results, pooled, log, opts };
}
