/**
 * COG-Fade Engine — fade at COG's OWN (reproduced) line, costed, out-of-sample.
 *
 * The reverse-engineer pinned COG's calc: level = C × (σ_daily), with his back-solved
 * constants (BM_P50 ≈ 1.57 = raw Feller, BM_P75 ≈ 1.92 — tighter tail). Now that we can
 * REPRODUCE his line over full history (not just the ~20 pasted days), we run the direct
 * question one more time, cleanly: does fading at COG's median / 75th clear cost, OOS?
 *
 * The line is the dynamic H-L projection COG's own manual describes: once an extreme
 * prints, project the range from it (reuses _dynLevelOutcome — the running-extreme
 * projection; nothing copied). σ is our YZ-30 estimator (COG's published vol sits within
 * ~7% of it), so the LINE PLACEMENT is his: r_med = 1.57×σ, r_75 = 1.92×σ.
 *
 * Honest prior (stated up front, per the working agreement): still likely NULL on FX.
 * COG's median = raw Feller = ~the realized median range, and the reversal-point study
 * showed FX turns BEFORE that (dominant ~0.84×); the dynamic-median distance sweep
 * (1.0–1.4×) was already null, and COG's median (1.0×) + 75th (1.22×) sit inside it. The
 * overshoot tail + the fills problem are placement-independent, so a better-calibrated
 * line does not, by itself, make the fade pay. This is the clean confirmatory check —
 * a win = higher OOS net Sharpe than break-even with ≥30 OOS trades.
 *
 * Costs on (round-trip COST_PIPS by type). Two exits from the shared primitives:
 * confirmation-entry (dodges the blow-through tail) and blind scalp (stop15/tgt30).
 */
import { buildLondonDaily } from './volEstimatorAB.js';
import { yzVolSeries } from './volBacktestEngine.js';
import { _dynLevelOutcome, _confirmFade, SCALP_CONFIGS, CONFIRM_TARGETS } from './intradayForecastResearch.js';
import { summarizeTrades } from './metricsCore.js';
import { pairType, COST_PIPS } from './crossPairResearch.js';
import { pipSize } from './instrumentRegistry.js';
import { COG_CONST } from './cogReverseEngineer.js';

const SCALP_I = SCALP_CONFIGS.findIndex(c => c.stop === 15 && c.target === 30);
const CONFIRM_I = CONFIRM_TARGETS.indexOf(30);

/**
 * cogFade(intraday, opts) — per-pair costed IS/OOS fade at COG's median & 75th lines.
 *   pair      instrument symbol (pip / type / cost). Default 'EURUSD'.
 *   isFrac    in-sample fraction for the IS/OOS split. Default 0.5.
 *   window    YZ σ window (days). Default 30.
 *   medC/p75C the COG constants for the median / 75th H-L line. Default COG_CONST.
 * Returns per-line (median / p75) × per-exit (scalp / confirm) IS+OOS summaries.
 */
export function cogFade(intraday, opts = {}) {
  const { pair = 'EURUSD', isFrac = 0.5, minLookback = 60, minBarsPerDay = 6, window = 30,
    medC = COG_CONST.BM_P50, p75C = COG_CONST.BM_P75 } = opts;
  const lond = buildLondonDaily(intraday);
  if (lond.length < 120) return { insufficient: true, nDays: lond.length };
  const type = pairType(pair), pip = pipSize(pair), cost = COST_PIPS[type] ?? 2.5;
  const yz = yzVolSeries(lond, window);                 // daily σ series (causal)
  const splitIdx = Math.floor(lond.length * isFrac);

  const _slot = () => ({ is: { pnls: [], dates: [] }, oos: { pnls: [], dates: [] } });
  const acc = { med: { scalp: _slot(), confirm: _slot() }, p75: { scalp: _slot(), confirm: _slot() } };
  const push = (line, exit, seg, pnl, date) => { const s = acc[line][exit][seg]; s.pnls.push(pnl); s.dates.push(date); };

  for (let i = minLookback; i < lond.length; i++) {
    const d = lond[i];
    if (!d.bars || d.bars.length < minBarsPerDay || !(d.open > 0)) continue;
    const sig = yz[i - 1];                               // σ forecast for day i uses data < i (no lookahead)
    if (!(sig > 0)) continue;
    const seg = i < splitIdx ? 'is' : 'oos';
    for (const [line, C] of [['med', medC], ['p75', p75C]]) {
      const r = C * sig;                                 // COG's H-L line as a fraction of price
      if (!(r > 0)) continue;
      for (const dir of [+1, -1]) {
        const o = _dynLevelOutcome(d.bars, r, dir, pip);
        if (!o) continue;                                // line never reached → no trade (counts as a miss)
        push(line, 'scalp', seg, o.scalpPnl[SCALP_I] - cost, d.date);
        const cf = _confirmFade(d.bars, o.firstIdx, o.entry, dir, pip);
        if (cf) push(line, 'confirm', seg, cf.pnl[CONFIRM_I] - cost, d.date);
      }
    }
  }
  const summ = slot => ({ is: summarizeTrades(slot.is.pnls, slot.is.dates), oos: summarizeTrades(slot.oos.pnls, slot.oos.dates) });
  return {
    pair, type, pip, cost, window, medC, p75C,
    nDays: lond.length, dateFrom: lond[0].date, dateTo: lond.at(-1).date, splitDate: lond[splitIdx]?.date,
    // Primary read = the OOS row. med = fade COG's median line; p75 = fade his 75th.
    median: { scalp: summ(acc.med.scalp), confirm: summ(acc.med.confirm) },
    p75: { scalp: summ(acc.p75.scalp), confirm: summ(acc.p75.confirm) },
  };
}
