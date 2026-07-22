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
import { computeWaveTrend } from './vumanchuCore.js';
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
  divergenceSource: 'wavetrend', // 'wavetrend' (VuManChu WT1) | 'rsi' — oscillator for hidden divergence
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

// Bullish hidden divergence: price higher-low + oscillator lower-low (uptrend
// continues). Bearish: price lower-high + oscillator higher-high. `osc` is any
// per-bar oscillator (VuManChu WT1 or RSI). Returns { passed, pts } where pts is
// the two swing-point indices used (for chart marks); empty unless passed.
export function hiddenDivergence(dir, m15, osc, loIdx, hiIdx, d = 2) {
  if (dir === 'long') {
    const sw = swingLows(m15.lows, loIdx, hiIdx, d);
    if (sw.length < 2) return { passed: false, pts: [] };
    const p1 = sw[sw.length - 2], p2 = sw[sw.length - 1];
    const passed = m15.lows[p2] > m15.lows[p1] && osc[p2] < osc[p1] &&
                   Number.isFinite(osc[p1]) && Number.isFinite(osc[p2]);
    return { passed, pts: passed ? [p1, p2] : [] };
  } else {
    const sw = swingHighs(m15.highs, loIdx, hiIdx, d);
    if (sw.length < 2) return { passed: false, pts: [] };
    const p1 = sw[sw.length - 2], p2 = sw[sw.length - 1];
    const passed = m15.highs[p2] < m15.highs[p1] && osc[p2] > osc[p1] &&
                   Number.isFinite(osc[p1]) && Number.isFinite(osc[p2]);
    return { passed, pts: passed ? [p1, p2] : [] };
  }
}
// Boolean wrapper (kept for the unit test's truth-table).
export function hasHiddenDivergence(dir, m15, osc, loIdx, hiIdx, d = 2) {
  return hiddenDivergence(dir, m15, osc, loIdx, hiIdx, d).passed;
}

// ── 1) Detect setups on the SAME data for every exit mode ────────────────────
// Returns { candidates, impulses }:
//   • impulses  — EVERY impulse event (whether or not it forms a tradable setup),
//     each carrying forward returns in ATR units. This is the raw material for the
//     "does an impulse actually predict continuation?" PREMISE test.
//   • candidates — every value-area entry that materialised, tagged `divPassed`
//     (whether the hidden divergence confirmed). The tradable set is the subset
//     with divPassed when requireDivergence is on; the autopsy uses BOTH subsets
//     to test whether the divergence filter adds anything.
// No lookahead: the Donchian level uses only prior 1H bars, the impulse is
// confirmed at the 1H bar close, and the consolidation / entry / divergence all
// use M15 bars up to the entry bar. (Forward returns on `impulses` are diagnostic
// only — never fed back into an entry decision.)
const FWD_HORIZONS = [16, 32, 96]; // M15 bars ≈ 4h / 8h / 24h
function detectSignals(h1, m15, m15arr, osc, atr1h, opts) {
  const L = opts.donchianLookback;
  const candidates = [], impulses = [];
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

    const impEnd = h1[i].time + 3600;
    const cStart = bisect(m15times, impEnd);

    // PREMISE data: forward return after the impulse, in ATR units, in the
    // impulse direction (does momentum continue from here, unconditionally?).
    const fwd = {};
    for (const H of FWD_HORIZONS) {
      const kk = cStart + H;
      fwd[H] = kk < m15.length ? ((m15[kk].close - c) / atr) * (dir === 'long' ? 1 : -1) : null;
    }
    impulses.push({ dir, time: impEnd, level, impulseExtreme, atr, fwd, date: isoDate(impEnd) });

    // Consolidation window: the next `consolBars` M15 bars after the impulse bar.
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
    const div = hiddenDivergence(dir, m15arr, osc, cStart, fillIdx, 2);
    const divPts = div.pts.map((k) => ({
      time: m15[k].time, price: dir === 'long' ? m15[k].low : m15[k].high, osc: osc[k],
    }));

    const stop = dir === 'long' ? cLow - opts.stopAtrBuffer * atr
                                : cHigh + opts.stopAtrBuffer * atr;
    const slDist = Math.abs(entryPx - stop);
    if (!(slDist > 0)) continue;

    // Enter at the value-area touch; simulate exits from the END of the fill bar
    // (conservative — no intrabar credit on the fill bar itself).
    const entryTime = m15[fillIdx].time + 15 * 60;
    candidates.push({
      dir, entry: entryPx, stop, slDist, level, impulseExtreme, atr,
      entryTime, date: isoDate(m15[fillIdx].time),
      divPassed: div.passed,
      // chart/debug structure (times in epoch seconds):
      impulseTime: impEnd, impulseClose: c,
      consolFrom: m15[cStart].time, consolTo: m15[cEnd - 1].time, cHigh, cLow,
      entryBarTime: m15[fillIdx].time, divPts,
    });
  }
  return { candidates, impulses };
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
  const mfeAtExit = new Array(N).fill(0);
  let extreme = long ? entry : entry;  // best-favourable extreme for the trail
  let mae = 0;                          // running max adverse excursion (price pts, ≥0)
  let mfe = 0;                          // running max favourable excursion (price pts, ≥0)
  let trailStop = stop;

  const settle = (p, px, reason, time) => {
    if (!open[p]) return;
    open[p] = false; exit[p] = { px, reason, time }; maeAtExit[p] = mae; mfeAtExit[p] = mfe;
  };

  for (let bi = 0; bi < bars.length && open.some(Boolean); bi++) {
    const b = bars[bi];
    // Update excursions off the real path.
    const adv = long ? b.high - entry : entry - b.low;   // favourable
    const adverse = long ? entry - b.low : b.high - entry; // adverse
    if (adverse > mae) mae = adverse;
    if (adv > mfe) mfe = adv;
    if (adv > (long ? extreme - entry : entry - extreme)) extreme = long ? b.high : b.low;

    // Hard stop first (conservative — assume the low/high tags the stop before any TP).
    const hitStop = long ? b.low <= stop : b.high >= stop;
    if (hitStop) { for (let p = 0; p < N; p++) settle(p, stop, 'stop', b.time); break; }

    // Fixed TP rungs.
    for (let p = 0; p < N; p++) {
      if (!open[p] || tps[p] == null) continue;
      const hitTp = long ? b.high >= tps[p] : b.low <= tps[p];
      if (hitTp) settle(p, tps[p], 'tp', b.time);
    }

    // Trailing runner (ladder_trail only).
    if (mode === 'ladder_trail' && open[N - 1]) {
      const runnerMfe = long ? extreme - entry : entry - extreme;
      if (runnerMfe >= opts.trailStartR * slDist) {
        const cand = long ? extreme - opts.trailAtrMult * atr : extreme + opts.trailAtrMult * atr;
        trailStop = long ? Math.max(trailStop, cand) : Math.min(trailStop, cand);
        const hitTrail = long ? b.low <= trailStop : b.high >= trailStop;
        if (hitTrail) settle(N - 1, trailStop, 'trail', b.time);
      }
    }
  }

  // Time stop: close anything still open at the last available close.
  const lastClose = bars[bars.length - 1].close;
  const lastTime = bars[bars.length - 1].time;
  for (let p = 0; p < N; p++) if (open[p]) settle(p, lastClose, 'time', lastTime);

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
    const mfeR = slDist > 0 ? mfeAtExit[p] / slDist : 0; // positive
    basketPnlPct += pnlPct;
    positions.push({
      date, dir, pos: p + 1, entry: round(entry), exit: round(ex.px), reason: ex.reason,
      entryTime, exitTime: ex.time,
      pnlPct: round(pnlPct, 4), pnlR: round(pnlR, 4),
      maePct: round(maePct, 4), maeR: round(maeR, 4), mfeR: round(mfeR, 4), slDist: round(slDist),
    });
  }
  basketPnlPct /= N; // equal-weight basket = the honest per-signal return unit
  const peakMfeR = slDist > 0 ? mfe / slDist : 0;
  return { basketPnlPct: round(basketPnlPct, 5), positions, peakMfeR: round(peakMfeR, 4), exitReasons: exit.map((e) => e.reason) };
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
  const osc = opts.divergenceSource === 'rsi'
    ? rsiWilder(m15.map((b) => b.close), opts.rsiPeriod)
    : computeWaveTrend(m15, {}).wt1;   // VuManChu WT1 (default) — what the trade uses
  const m15arr = { highs: m15.map((b) => b.high), lows: m15.map((b) => b.low) };

  const { candidates, impulses } = detectSignals(h1, m15, m15arr, osc, atr1h, opts);
  // Tradable set: honour requireDivergence. (Autopsy separately looks at both.)
  const tradable = candidates.filter((c) => !opts.requireDivergence || c.divPassed);
  out.signalCount = tradable.length;
  out.candidateCount = candidates.length;
  out.impulseCount = impulses.length;

  for (const mode of EXIT_MODES) {
    const records = [], positions = [];
    for (const sig of tradable) {
      const r = simulateBasket(sig, packed, opts, mode, frictions);
      if (!r) continue;
      records.push({ date: sig.date, filled: true, pnl_pct: r.basketPnlPct, dir: sig.dir });
      for (const pos of r.positions) positions.push(pos);
    }
    out.modes[mode] = { records, positions };
  }

  const au = computeAutopsy(candidates, impulses, packed, opts, frictions);
  out.autopsy = au.display; out.autopsyRaw = au.raw;
  return out;
}

// ── The autopsy: WHY it (doesn't) work, with numbers ─────────────────────────
// Emits POOLABLE raw counters (so the suite can aggregate exactly across all 26
// instruments) plus a `display` derived from them. Trade-level numbers use the
// `fixed_r` baseline (minimal-DOF exit, so the diagnosis isn't a fitted-exit
// artefact). One extra detection pass, no per-trade rows shipped.
const _mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
function computeAutopsy(candidates, impulses, packed, opts, frictions) {
  const raw = {
    premise: {}, divergence: { passed: emptyGrp(), failed: emptyGrp() },
    expectancy: { n: 0, winN: 0, sumR: 0, nWin: 0, sumWinR: 0, nLoss: 0, sumLossR: 0 },
    exitMix: {}, mfe: { nStopped: 0, halfN: 0, oneN: 0 },
  };
  // (A) PREMISE — forward return (ATR units) after every impulse, per horizon.
  for (const H of FWD_HORIZONS) {
    const v = impulses.map((im) => im.fwd[H]).filter((x) => x != null && Number.isFinite(x));
    raw.premise[H] = { n: v.length, sum: v.reduce((a, b) => a + b, 0), sumSq: v.reduce((a, b) => a + b * b, 0), pos: v.filter((x) => x > 0).length };
  }
  // (B) DIVERGENCE VALUE-ADD — simulate ALL candidates (fixed_r), split by divPassed.
  const simBasket = (c) => { const r = simulateBasket(c, packed, opts, 'fixed_r', frictions); return r ? { pnlR: _mean(r.positions.map((p) => p.pnlR)), peakMfeR: r.peakMfeR, reason: r.exitReasons[0], win: r.basketPnlPct > 0 } : null; };
  for (const c of candidates) {
    const r = simBasket(c); if (!r) continue;
    const g = c.divPassed ? raw.divergence.passed : raw.divergence.failed;
    g.n++; if (r.win) g.winN++; g.sumR += r.pnlR;
    if (!opts.requireDivergence || c.divPassed) {
      // (C) EXPECTANCY / EXIT MIX / MFE on the tradable set.
      const e = raw.expectancy; e.n++; e.sumR += r.pnlR;
      if (r.win) { e.winN++; e.nWin++; e.sumWinR += r.pnlR; } else { e.nLoss++; e.sumLossR += r.pnlR; }
      raw.exitMix[r.reason] = (raw.exitMix[r.reason] || 0) + 1;
      if (r.reason === 'stop') { raw.mfe.nStopped++; if (r.peakMfeR >= 0.5) raw.mfe.halfN++; if (r.peakMfeR >= 1.0) raw.mfe.oneN++; }
    }
  }
  return { display: deriveAutopsy(raw), raw };
}
function emptyGrp() { return { n: 0, winN: 0, sumR: 0 }; }
// Derive the human-readable autopsy from raw counters (works for one instrument
// or a pooled sum — same code, so per-instrument and pooled stay consistent).
function deriveAutopsy(raw) {
  const premise = {};
  for (const H of FWD_HORIZONS) {
    const p = raw.premise[H] || { n: 0, sum: 0, sumSq: 0, pos: 0 };
    const mean = p.n ? p.sum / p.n : 0;
    const varr = p.n > 1 ? (p.sumSq - p.sum * p.sum / p.n) / (p.n - 1) : 0;
    const se = p.n > 0 && varr > 0 ? Math.sqrt(varr / p.n) : 0;
    premise[H] = { n: p.n, mean: round(mean, 4), hitRate: p.n ? round(100 * p.pos / p.n, 1) : 0, tStat: se > 0 ? round(mean / se, 2) : 0 };
  }
  const grp = (g) => ({ n: g.n, winRate: g.n ? round(100 * g.winN / g.n, 1) : 0, meanR: g.n ? round(g.sumR / g.n, 4) : 0 });
  const e = raw.expectancy;
  const avgWinR = e.nWin ? e.sumWinR / e.nWin : 0, avgLossR = e.nLoss ? e.sumLossR / e.nLoss : 0;
  const winRate = e.n ? e.winN / e.n : 0;
  const breakeven = (avgWinR + Math.abs(avgLossR)) > 0 ? Math.abs(avgLossR) / (avgWinR + Math.abs(avgLossR)) : 0;
  const expectancy = {
    n: e.n, winRate: round(100 * winRate, 1), avgWinR: round(avgWinR, 3), avgLossR: round(avgLossR, 3),
    breakevenWinRate: round(100 * breakeven, 1), expectancyR: e.n ? round(e.sumR / e.n, 4) : 0,
    edgeGap: round(100 * (winRate - breakeven), 1),
  };
  const m = raw.mfe;
  const mfeBeforeStop = { nStopped: m.nStopped, reachedHalfR: m.nStopped ? round(100 * m.halfN / m.nStopped, 1) : 0, reached1R: m.nStopped ? round(100 * m.oneN / m.nStopped, 1) : 0 };
  return { premise, divergence: { passed: grp(raw.divergence.passed), failed: grp(raw.divergence.failed) }, expectancy, exitMix: { ...raw.exitMix }, mfeBeforeStop };
}
// Sum raw counters across instruments, then derive the pooled display.
function poolAutopsyRaw(rawList) {
  const acc = { premise: {}, divergence: { passed: emptyGrp(), failed: emptyGrp() }, expectancy: { n: 0, winN: 0, sumR: 0, nWin: 0, sumWinR: 0, nLoss: 0, sumLossR: 0 }, exitMix: {}, mfe: { nStopped: 0, halfN: 0, oneN: 0 } };
  for (const H of FWD_HORIZONS) acc.premise[H] = { n: 0, sum: 0, sumSq: 0, pos: 0 };
  for (const raw of rawList) {
    if (!raw) continue;
    for (const H of FWD_HORIZONS) { const s = acc.premise[H], p = raw.premise[H] || {}; s.n += p.n || 0; s.sum += p.sum || 0; s.sumSq += p.sumSq || 0; s.pos += p.pos || 0; }
    for (const k of ['passed', 'failed']) { acc.divergence[k].n += raw.divergence[k].n; acc.divergence[k].winN += raw.divergence[k].winN; acc.divergence[k].sumR += raw.divergence[k].sumR; }
    for (const k of ['n', 'winN', 'sumR', 'nWin', 'sumWinR', 'nLoss', 'sumLossR']) acc.expectancy[k] += raw.expectancy[k];
    for (const [k, v] of Object.entries(raw.exitMix)) acc.exitMix[k] = (acc.exitMix[k] || 0) + v;
    acc.mfe.nStopped += raw.mfe.nStopped; acc.mfe.halfN += raw.mfe.halfN; acc.mfe.oneN += raw.mfe.oneN;
  }
  return deriveAutopsy(acc);
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
  const autopsyRawList = [];

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
      autopsyRawList.push(run.autopsyRaw);
      results.push({
        pair: pairKey, assetClass: run.assetClass, costPct: run.costPct, slipPct: run.slipPct,
        signalCount: run.signalCount, candidateCount: run.candidateCount, impulseCount: run.impulseCount,
        dateRange: run.dateRange, best, modes, autopsy: run.autopsy,
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
  const autopsy = poolAutopsyRaw(autopsyRawList);

  return { results, pooled, autopsy, log, opts };
}

// ── 6) Trace one instrument over a window → chart-ready data ──────────────────
// Everything the replay chart draws: M15 candles, the VuManChu WaveTrend pane,
// impulse marks, consolidation boxes, value-area line, divergence marks, and each
// basket's entry/stop/exits (for the chosen exit mode). Windowed + padded for
// indicator warmup; span-capped so the payload stays sane.
const TRACE_MAX_SPAN = 120 * 86400;  // 120 days
export function traceMaxCopier(packed, pairKey, userOpts = {}, { fromDate, toDate, mode = 'fixed_r' } = {}) {
  const opts = { ...MAXCOPIER_DEFAULTS, ...userOpts };
  const frictions = costsFor(pairKey);
  if (!packed || !packed.n) return { error: 'no M1 data' };
  const dataFrom = packed.times[0], dataTo = packed.times[packed.n - 1];
  const parse = (s, endOfDay) => Math.floor(new Date(`${s}T${endOfDay ? '23:59:59' : '00:00:00'}Z`).getTime() / 1000);
  let toEpoch = toDate ? parse(toDate, true) : dataTo;
  let fromEpoch = fromDate ? parse(fromDate, false) : toEpoch - 45 * 86400;
  toEpoch = Math.min(toEpoch, dataTo + 60);
  fromEpoch = Math.max(fromEpoch, dataFrom);
  if (toEpoch - fromEpoch > TRACE_MAX_SPAN) fromEpoch = toEpoch - TRACE_MAX_SPAN;

  const pad = 45 * 86400; // warmup for Donchian / ATR / WaveTrend
  const allBars = extractBars(packed, fromEpoch - pad, toEpoch);
  const h1 = resampleTo(allBars, 60);
  const m15 = resampleTo(allBars, 15);
  if (m15.length < 50 || h1.length < opts.donchianLookback + 5) return { error: 'window too small' };
  const atr1h = atrWilder(h1, opts.atrPeriod);
  const { wt1, wt2 } = computeWaveTrend(m15, {});
  const osc = opts.divergenceSource === 'rsi' ? rsiWilder(m15.map((b) => b.close), opts.rsiPeriod) : wt1;
  const m15arr = { highs: m15.map((b) => b.high), lows: m15.map((b) => b.low) };
  const { candidates, impulses } = detectSignals(h1, m15, m15arr, osc, atr1h, opts);

  const inWin = (t) => t >= fromEpoch && t <= toEpoch;
  const candles = [], wt = [];
  for (let i = 0; i < m15.length; i++) {
    const b = m15[i]; if (!inWin(b.time)) continue;
    candles.push({ time: b.time, open: round(b.open), high: round(b.high), low: round(b.low), close: round(b.close) });
    wt.push({ time: b.time, wt1: round(wt1[i], 3), wt2: round(wt2[i], 3) });
  }
  const impulseMarks = impulses.filter((im) => inWin(im.time)).map((im) => ({
    time: im.time, dir: im.dir, level: round(im.level), fwd96: im.fwd[96] == null ? null : round(im.fwd[96], 2),
  }));
  const trades = [];
  for (const c of candidates) {
    if (!inWin(c.entryTime)) continue;
    const sim = simulateBasket(c, packed, opts, mode, frictions);
    // Unique exit points (fixed_r/shared_htf collapse to one; ladder spreads them).
    const exitMap = new Map();
    if (sim) for (const p of sim.positions) { const key = `${p.exitTime}_${p.exit}_${p.reason}`; if (!exitMap.has(key)) exitMap.set(key, { time: p.exitTime, price: p.exit, reason: p.reason, count: 0 }); exitMap.get(key).count++; }
    trades.push({
      dir: c.dir, divPassed: c.divPassed, tradable: !opts.requireDivergence || c.divPassed,
      impulseTime: c.impulseTime, level: round(c.level),
      consolFrom: c.consolFrom, consolTo: c.consolTo, cHigh: round(c.cHigh), cLow: round(c.cLow),
      entryTime: c.entryTime, entry: round(c.entry), stop: round(c.stop),
      divPts: c.divPts.map((p) => ({ time: p.time, price: round(p.price) })),
      basketPnlR: sim ? round(_mean(sim.positions.map((p) => p.pnlR)), 3) : null,
      exits: [...exitMap.values()],
    });
  }
  return {
    pair: pairKey, from: isoDate(fromEpoch), to: isoDate(toEpoch), mode,
    divergenceSource: opts.divergenceSource, requireDivergence: opts.requireDivergence,
    nCandles: candles.length, candles, wt, impulses: impulseMarks, trades,
  };
}

// Async single-instrument trace (loads M1, then traces the window).
export async function traceMaxCopierPair(pairKey, userOpts = {}, window = {}, m1Dir = null) {
  const { loadM1ForPair, BT_M1_DIR } = await import('./volBacktestM1Engine.js');
  const packed = await loadM1ForPair(pairKey, m1Dir || BT_M1_DIR);
  if (!packed) return { error: `no M1 data for ${pairKey}` };
  return traceMaxCopier(packed, pairKey, userOpts, window);
}
