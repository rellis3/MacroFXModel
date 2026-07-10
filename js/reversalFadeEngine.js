/**
 * Reversal-Fade Engine — the falsification test the reversal-point diagnostic earned.
 *
 * The diagnostic (reversalPointResearch.js) showed the median line is mis-placed as a
 * reversal locus: FX crosses turn BEFORE it (dominant k ≈ 0.68–0.91×), indices/gold
 * blow THROUGH it (k ≈ 1.0–2.5×). k is volatility-neutral (a ratio to the pair's own
 * range) — it tracks trendiness, not amplitude — so each pair carries its OWN k,
 * self-calibrated from its own history (never a class constant that would blur AUDNZD
 * into GOLD).
 *
 * This engine asks the ONLY question that matters next: does re-placing the fade line
 * at k×median actually beat fading at the median (k=1), AFTER cost, OUT-OF-SAMPLE?
 *
 * Honest design (the harness discipline in CLAUDE.md):
 *   • k is estimated on the IN-SAMPLE half only (dominant-reversal P50 ÷ median), then
 *     applied UNCHANGED to the OUT-OF-SAMPLE half. No lookahead — the verdict is OOS.
 *   • The line is the DYNAMIC H-L anchor: projected from the running intraday extreme by
 *     a fraction r, and it MOVES intrabar (reuses _dynLevelOutcome — the same primitive
 *     the touch study uses; nothing copied).
 *   • r_base = trailing-median-range fraction (k=1 → the median line). r_test = k×r_base.
 *     Same trailing range, so the A/B isolates the MULTIPLIER — and the line still
 *     breathes with vol (only the shape multiplier k is fixed).
 *   • Two exits, both from the shared primitives: a blind scalp (stop15/tgt30) and the
 *     confirmation-entry fade (enter on the close back through the line, stop beyond the
 *     overshoot, tgt30 — dodges the blow-through tail by taking NO TRADE on trend days).
 *   • Round-trip cost (COST_PIPS by type) subtracted from every trade. Free fills lie.
 *
 * This is a STRATEGY test, not a diagnostic: a "win" is a higher OOS net Sharpe than the
 * k=1 baseline with a non-trivial OOS trade count (≥30). The expected outcome is still
 * null on FX (the overshoot tail + the fills problem) — proving that cheaply is the win.
 */
import { buildLondonDaily } from './volEstimatorAB.js';
import { _zigzag } from './reversalPointResearch.js';
import { _dynLevelOutcome, _confirmFade, SCALP_CONFIGS, CONFIRM_TARGETS } from './intradayForecastResearch.js';
import { summarizeTrades } from './metricsCore.js';
import { pairType, COST_PIPS } from './crossPairResearch.js';
import { pipSize } from './instrumentRegistry.js';

const _sortNum = a => [...a].sort((x, y) => x - y);
const _median = a => { if (!a.length) return 0; const s = _sortNum(a); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const _pctile = (a, p) => { if (!a.length) return 0; const s = _sortNum(a); const i = p / 100 * (s.length - 1); const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };

// The exit slots we report (indices into the shared primitive arrays). stop15/tgt30 is
// SCALP_CONFIGS[1]; tgt30 is CONFIRM_TARGETS[1]. Named so a config change is caught.
const SCALP_I = SCALP_CONFIGS.findIndex(c => c.stop === 15 && c.target === 30);
const CONFIRM_I = CONFIRM_TARGETS.indexOf(30);

// Estimate the per-pair shape multiplier k on a set of London days = P50(dominant
// run-from-extreme, %) ÷ (median day range, %). "Dominant" = the day's single largest
// run-from-extreme high AND largest low (the real, tradeable turn — not noise swings).
// Mirrors reversalStudy's dominant cut exactly, on the IN-SAMPLE slice only. Returns
// null if too few dominant reversals to trust the estimate.
export function estimateK(days, revFrac = 0.25, minBarsPerDay = 6) {
  const ranges = days.map(d => d.high - d.low).filter(x => x > 0);
  const medRange = _median(ranges);
  if (!(medRange > 0)) return null;
  const refPx = days.at(-1).open || days[0].open || 1;
  const medRangePct = medRange / refPx * 100;
  const thr = revFrac * medRange;
  const domRuns = [];
  for (const d of days) {
    if (!d.bars || d.bars.length < minBarsPerDay || !(d.open > 0)) continue;
    const pivots = _zigzag(d.bars, thr).slice(1);   // drop the seed pivot
    let rl = d.bars[0].low, rh = d.bars[0].high, ptr = 0;
    let domHi = 0, domLo = 0;   // largest high-run / low-run this day, %
    for (const p of pivots) {
      while (ptr <= p.idx) { if (d.bars[ptr].low < rl) rl = d.bars[ptr].low; if (d.bars[ptr].high > rh) rh = d.bars[ptr].high; ptr++; }
      const rePct = p.kind === 'high' ? (p.price - rl) / d.open * 100 : (rh - p.price) / d.open * 100;
      if (rePct <= 0) continue;
      if (p.kind === 'high') { if (rePct > domHi) domHi = rePct; } else { if (rePct > domLo) domLo = rePct; }
    }
    if (domHi > 0) domRuns.push(domHi);
    if (domLo > 0) domRuns.push(domLo);
  }
  if (domRuns.length < 30 || !(medRangePct > 0)) return null;
  return { k: _pctile(domRuns, 50) / medRangePct, nDominant: domRuns.length, medRangePct: +medRangePct.toFixed(4) };
}

// Trailing median day-range (price units) over the `win` days ending just before global
// index g — causal (uses only days < g), and it breathes with the vol regime.
function _trailingMedRange(ranges, g, win) {
  const lo = Math.max(0, g - win);
  return _median(ranges.slice(lo, g));
}

/**
 * reversalFade(intraday, opts) — the per-pair A/B.
 *   pair        instrument symbol (for pip size, type, cost). Default 'EURUSD'.
 *   isFrac      in-sample fraction for the k estimate + split. Default 0.5.
 *   revFrac     reversal threshold as a fraction of median range (for the k estimate).
 *   trailWin    trailing window (days) for the median-range projection. Default 252.
 *   minLookback days required before the first trade. Default 60.
 * Returns per-strategy (base=k1 / test=k) × per-exit (scalp / confirm) IS+OOS summaries.
 */
export function reversalFade(intraday, opts = {}) {
  const { pair = 'EURUSD', isFrac = 0.5, revFrac = 0.25, trailWin = 252, minLookback = 60, minBarsPerDay = 6 } = opts;
  const lond = buildLondonDaily(intraday);
  if (lond.length < 120) return { insufficient: true, nDays: lond.length };
  const type = pairType(pair);
  const pip = pipSize(pair);
  const cost = COST_PIPS[type] ?? 2.5;                       // round-trip pips
  const ranges = lond.map(d => d.high - d.low);

  const splitIdx = Math.floor(lond.length * isFrac);
  const kEst = estimateK(lond.slice(0, splitIdx), revFrac, minBarsPerDay);
  if (!kEst) return { insufficient: true, reason: 'k estimate had <30 dominant reversals', nDays: lond.length };
  const kIS = kEst.k;

  // Trade accumulators: [strategy][exit] → { is:{pnls,dates}, oos:{pnls,dates} }.
  const acc = {
    base: { scalp: _slot(), confirm: _slot() },
    test: { scalp: _slot(), confirm: _slot() },
  };
  function _slot() { return { is: { pnls: [], dates: [] }, oos: { pnls: [], dates: [] } }; }
  const push = (strat, exit, seg, pnl, date) => { const s = acc[strat][exit][seg]; s.pnls.push(pnl); s.dates.push(date); };

  for (let g = minLookback; g < lond.length; g++) {
    const d = lond[g];
    if (!d.bars || d.bars.length < minBarsPerDay || !(d.open > 0)) continue;
    const mr = _trailingMedRange(ranges, g, trailWin);
    if (!(mr > 0)) continue;
    const rBase = mr / d.open;            // k = 1 (the median line)
    const rTest = kIS * rBase;            // k = the pair's own dominant multiplier
    const seg = g < splitIdx ? 'is' : 'oos';
    for (const dir of [+1, -1]) {
      for (const [strat, r] of [['base', rBase], ['test', rTest]]) {
        if (!(r > 0)) continue;
        const o = _dynLevelOutcome(d.bars, r, dir, pip);
        if (!o) continue;                                   // line never touched → no trade
        push(strat, 'scalp', seg, o.scalpPnl[SCALP_I] - cost, d.date);     // blind fade
        const cf = _confirmFade(d.bars, o.firstIdx, o.entry, dir, pip);
        if (cf) push(strat, 'confirm', seg, cf.pnl[CONFIRM_I] - cost, d.date);  // confirmed turn only
      }
    }
  }

  const summ = slot => ({ is: summarizeTrades(slot.is.pnls, slot.is.dates), oos: summarizeTrades(slot.oos.pnls, slot.oos.dates) });
  return {
    pair, type, pip, cost, revFrac, trailWin, isFrac,
    kIS: +kIS.toFixed(3), kDominantN: kEst.nDominant,
    nDays: lond.length, dateFrom: lond[0].date, dateTo: lond.at(-1).date, splitDate: lond[splitIdx]?.date,
    // Primary read = the OOS row of each. scalp = blind fade (stop15/tgt30);
    // confirm = confirmation-entry fade (tgt30, dodges the blow-through tail).
    base: { scalp: summ(acc.base.scalp), confirm: summ(acc.base.confirm) },
    test: { scalp: summ(acc.test.scalp), confirm: summ(acc.test.confirm) },
  };
}
