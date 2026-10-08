# LIVE-RANGE-SHADOW: "this extreme is in" probability, line state on the rich-IV break, and a σ-matched refit of the grids

*Pre-registered 2026-10-08, before any result of these three parts. Follows `LIVE_RANGE_FEATURES_PREREG.md` (Amendment 1: whether a running
high / low is already in is explained by price's pullback from it plus the clock) and `LIVE_RANGE_HISTORY_PREREG.md` (shipped grids fitted on all dates
and on a σ ~10% below the page's). Owner approved all three. **Shadow only:** new files; `live-range.html`, `js/intradayRange*.js`, shared engines are
not edited. No Vote Atlas input.*

## Part 1 — a calibrated "probability this high / low is in" (exhaustion as a take-profit / stand-aside read)
- **Definition.** At checkpoint h (02:00..21:00 London), the running high is *in* if the day's final high exceeds it by ≤ 0.05σ; likewise the low.
  Inputs, all causal: h, range used (σ), pace (σ), **pullback** d = distance of the last close from that extreme (σ), side.
- **Model (exportable table, no black box).** P(in | h, d-bin, used tercile) from training frequencies on a fixed 12-bin d grid, shrunk toward
  (h, d-bin) and then d-bin alone with m = 30 pseudo-counts. Fitted to the page's σ units (`pit_sig_daily`).
- **Validation (walk-forward):** refit every quarter on prior data only, scored 2018-04 → 2026-08 on 34 instruments. Benchmarks: the hour × used × pace
  base rate the page implies (Brier), and the gradient-boosted geometry model G0 (the ceiling found in LIVE_RANGE_FEATURES variant 2).
- **Pass ("CALIBRATED SHADOW"):** table Brier skill ≥ 0.8 × G0's skill, and in both classes every probability decile's realised-minus-predicted gap
  ≤ 3pp (≥ 300 per decile), date-block bootstrap on the skill difference. Otherwise reported as failed and nothing is shown.
- **Export:** `js/extremeInParams.js` (fitted on all dates, labelled as such), `js/extremeIn.js` (pure), parity-checked against the Python table.

## Part 2 — line state on the rich-IV break (meta-label / exits)
- **Primary.** The existing rich-IV break trades (`MacroFXModel-rangebook/analysis/output/rangebook/<inst>_asym.json`, type BREAK, 0.1 / 0.2σ stops ×
  5R / 10R, mean net R of the four cells), on CVOL instruments, rich days = top third of CVOL ÷ RV20 using the original 2016-22 edges. Trades from 2018-04.
  Baseline = their mean net R (the published +0.118R for 2016-26; reported for 2018+ here).
- **Line state at the signal bar** (moving lines drawn at the previous full hour, grids refit walk-forward): **room** = distance from entry to the nearest
  moving line on the break side beyond it (p75, p90), pullback, range used, pace, hour, the line's rung, IV÷RV, direction.
- **P2a (one pre-specified filter):** trades whose room to the moving p75 is in the top third vs the bottom third → mean net R each, with date-block 95%
  intervals and both halves. **P2b (meta-label):** HistGradientBoosting regression of net R on the state, refit every year on prior trades, trading from
  2020; take if predicted > 0; compare taken vs all vs skipped. **P2c (exits):** re-simulate the same entries on M1 with the target at the moving p75 / p90 line of
  the entry hour (stop unchanged, day-end fallback), cost as stored; vs the stored 5R / 10R.
- **Pass:** a filter or meta-label *improves* the primary if the taken trades' mean net R exceeds all-trades' by a date-block interval wholly > 0, in both
  halves, and keeps ≥ 40% of trades; an exit improves it if its mean net R beats both 5R and 10R cells by an interval wholly > 0. Otherwise "no improvement".
  The primary's own n is small (thousands of trades, few hundred independent days): the power limit is stated, not hidden.

## Part 3 — grids refit on the page's own σ (shadow params)
- Refit `INTRADAY_PARAMS` (same file shape) on the first 100% of dates in the page's σ basis (`pit_sig_daily`) as `js/intradayRangeParamsPit.js`
  (exports `INTRADAY_PARAMS_PIT`), usable with the unchanged engine through its `params` argument. In-sample like the shipped file by construction;
  the honest evidence is the walk-forward (quarterly refit) exceedance already measured in LIVE_RANGE_HISTORY (24.0% p75 vs 21.5% shipped).
- **Check:** on the final 40% of dates the refit-on-first-60% lines hit p75 / p90 at 25% / 10% (±1.5pp) and the shipped lines do not (previously 21.5 / 8.0%).

## Shadow page
`live-range-shadow.html` (read-only): per instrument, the shipped vs refit p75 lines, the room to the next line, P(high in) / P(low in), and a plain-English
read. Reached by direct URL only (no nav change in this pass).

## Variant log
| # | Variant | Added | Status |
|---|---|---|---|
| 1 | as above | 2026-10-08 | pending |

Output `analysis/output/live_range_shadow/RESULTS.md`; banked in `js/deskEvidence.js`.
