# line-touch-limit-unseen — Does the wide-scan fade selector pay on 17 pairs it never saw, priced on real bid/ask with market, resting-limit and MAE-rule stops?

**Pre-registered 2026-10-28, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `line-touch-limit-unseen` (cells M, L, J under one id) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `line-touch-limit-unseen` |
| Data | Training: `analysis/output/line_touch_wide_scan/features.parquet` (the 17 instruments of `line-touch-wide-scan`, unchanged). Test: the **17 FX pairs in the bid/ask set the wide scan never loaded**: audcad, audchf, audnzd, cadchf, eurcad, eurgbp, eurjpy, eurnzd, gbpaud, gbpcad, gbpchf, gbpjpy, gbpnzd, nzdcad, nzdjpy, nzdusd, usdcad. Touches and features from the OANDA mid M1 research cache (`VolRangeForecaster/data/m1`, R2 not used); fills and exits from OANDA bid/ask M1 (`data/m1_bidask_bin`, built by `scripts/range-edge-limit-fade/extract.py`). Window: 2017-01-01 → **2026-08-20** (inside the lockbox cut) |
| Seed | `20261028` (bootstrap, control draws) |
| Uncertainty | session-date moving-block bootstrap, every instrument of a date resampled together, block = 21 sessions, B = 2000 |
| Scripts / outputs | `scripts/line-touch-limit-unseen/` → `analysis/output/line-touch-limit-unseen/` |
| Harness | own script. Reuses `analysis/line_touch_response_study.mjs` `processPair` and `scripts/line_touch_wide/build_features.py` `one()` unedited (only the output folder differs), and the wide scan's model recipe. `js/harness/runStudy.mjs` scores daily signals, not intraday fills |

## 1. The claim

The owner asked (2026-10-28) whether the Vote Atlas analysis can be brought back to life, after Discord posts from
Jordan (an MAE-in-ticks stop table) and Garin ("who is paying?"). The rule from 2026-09 stands: **no Vote Atlas trades,
results or configs are used as data or prior.** What is reused is the method behind it (record every line touch with
its context, then ask which touches are worth trading) and the shared line maths.

That method was rebuilt cleanly in `line-touch-wide-scan` (396,538 touches, 7 line families, ~41 pre-touch features,
walk-forward gradient boosting). It found one effect that beat a rate-matched placebo in 30 of 30 runs on its
holdout: **fade a fresh running extreme after a fast run-in** (+0.192R gross, 584 trades). Every version of it then
failed on cost. All of them entered with a **market order at the touch-bar close**, and all used a cost table
guessed at 2x ("spread data not in M1").

Claim: **the frozen selector, applied to instruments it never saw, has positive net expectancy per trade on real
bid/ask, in at least one of three execution forms:** market entry (M), a resting limit at the touch-bar mid (L), or
a resting limit with a stop sized by C.OG's MAE rule (J).

Garin's question, answered in advance: a market fade pays the spread to whoever provides liquidity. A resting limit
*is* the liquidity provider, paid by the late momentum trader buying the extreme, unless the fills come mostly from
the touches that keep going (adverse selection). That is what L measures, against M on the same signals.

## 2. Why it is not already settled

- `line-touch-wide-scan` and its cost and adaptive-stop phases (`forge/LINE_TOUCH_COST_PREREG.md`,
  `forge/LINE_TOUCH_ADAPTIVE_STOP_PREREG.md`): market entries only, costs from a hand table at 2x, the same 17
  instruments. Their holdout (2022-06-24 → 2026-08-20) has been read for four designs and is **not** scored here.
- `futures-cost-rescore`: re-costed for futures, market entries, same instruments.
- `range-edge-limit-fade` (2026-10-20, null): a resting limit on real bid/ask, but at the Asia range edges with no
  selector. It showed a 98.5% fill rate and that the trade-through fill picks touches that went further. It is the
  adverse-selection warning for this test, not an answer to it.
- No study has priced the wide-scan selector on real bid/ask, with a resting order, or on instruments it was not fitted
  on. The bid/ask history did not exist before 2026-10-20.
- Jordan's MAE table (`education/cog-snippets.md` §1, 2026-09-26) sets a stop at a percentile of MAE. C.OG answered
  "none of the above": set it where MAE starts to carry predictive power. That rule has never been built here.

## 3. Definitions, fixed in advance

**Training (seen set).** `features.parquet`, the wide scan's filters unchanged: `rng1 ≤ 0.5`, `hour < 20`, rows with
`R_cont`, `R_fade`, `ret60` present. Features: the scan's 41 (`FEAT` in `scripts/line_touch_wide/scan.py`). Model:
`HistGradientBoostingRegressor(max_iter=80, learning_rate=0.08, max_depth=4, min_samples_leaf=500,
l2_regularization=1.0, random_state=1)`, one per target (`R_cont`, `R_fade`). Family codes are fixed alphabetically
(dopen, hl50, hl75, hl90, oh50, oh75, oh90), as the scan's category codes were.

**Walk-forward.** For calendar year Y (2017 … 2026), the models are fitted on seen rows with year < Y (needs ≥ 5,000
rows) and predict that year's seen rows (out-of-fold) and unseen rows. Nothing is fitted on unseen data, and no model
sees the year it predicts.

**Selection.** Score = max(predicted R_cont, predicted R_fade); side = continue if R_cont ≥ R_fade, else fade.
Per instrument-day, the first eligible touch with score ≥ c. **c is frozen on the seen set**: the value at which seen
out-of-fold selections run at 2.0 a week (the scan's rate), by bisection. The same c is applied to the unseen pairs.

**Unseen touches.** `processPair` per pair (Europe/London sessions, forecast σ, all 7 families), sessions dated
≤ 2026-08-20, written to `analysis/output/line-touch-limit-unseen/response/`. Features by `one()` unchanged.

**Execution (all cells).** R_price = 0.10 × dayScale (the scan's stop unit). Direction = the touch side for continue,
the opposite for fade. Bid/ask bars are matched to the mid bars by timestamp; a signal whose touch bar is missing in
the bid/ask file is excluded and counted. Exits, long shown (short mirrored on the ask):

- **stop**: triggered when `bid_l ≤ stop`, filled at `min(stop, bid_o)` (a gap fills at the open);
- **trail** (the scan's structure): once the best bid reaches entry + 1R, the stop moves to max(best − 1R,
  entry + 0.5R) and only ratchets;
- **target**: 3R, filled at the target when `bid_h > target` (traded through);
- **time**: closed at `bid_c` of the 21:55 UTC bar (last bar before 22:00 if missing) or of the session's last bar,
  whichever is first, so nothing crosses the rollover and no financing is charged;
- **adverse first**: on each bar the stop (as it stood at the bar's open) is checked before the trail, target and
  best price are updated. On a fill bar only the stop is checked.

Net R = signed P&L ÷ R_price, every price from the bid/ask columns. No commission (OANDA spread-only).

**Cells.**

- **M, market**: buy at `ask_c` (sell at `bid_c`) of the touch bar. This is the wide scan's trade at real prices.
- **L, resting limit**: a limit at the touch bar's mid close, `P = (bid_c + ask_c) / 2`, live for the next 15 bars
  (and not past the time exit). A sell fills at P on the first bar with `bid_h > P`; a buy on the first bar with
  `ask_l < P`. Unfilled signals are no trade (counted).
- **J, resting limit + MAE-rule stop**: L's entry and fill, with R_price = d* × dayScale, the trail and target in units
  of that R. **d\*** is set on the seen set before any unseen outcome is computed: take the seen out-of-fold
  selections, enter at the touch-bar mid close (mid M1 cache), and for each d in {0.05, 0.075, 0.10, 0.125, 0.15, 0.20,
  0.25, 0.30, 0.40} (× dayScale) compute X̄(d) = the mean time-exit return (in dayScale units) of the trades whose
  adverse excursion reached d. **d\* = the smallest d with X̄(d) < −d**: past that point, holding loses more on average
  than the stop costs, so MAE has started to predict the outcome (C.OG's "noise threshold", one horizon: the session).
  If no d qualifies, d* = 0.40. d* is written to `results.json` and the log before the unseen pass runs.

**Stress fill (L, J).** The limit fills only when the quote trades through by one spread at that minute
(`bid_h > P + (ask_c − bid_c)` for a sell). It bounds queue position.

**Halves.** 2017-01-01 → 2021-12-31 and 2022-01-01 → 2026-08-20.

## 4. Hypotheses, expectation first

| # | Cell | Expectation | Pass bar |
|---|---|---|---|
| M | market entry, real bid/ask | **Null**, about −0.1 to −0.2R. On crosses R_price is a few pips and the spread is ~0.2–0.4R, against +0.19R gross | **THE GATE** (each cell): mean net R > 0 with bootstrap 95% CI lower bound > 0 after Holm across M, L, J; > 0 in both halves; > 0 on more than half of the unseen pairs that traded; ≥ 200 trades; for L and J also > 0 on the point estimate under the stress fill |
| L | resting limit at mid | **Null**, less negative than M: saves about half a spread at entry, loses the best signals that never come back to fill | same gate |
| J | limit + MAE-rule stop | **Underpowered or null**: a wider stop shrinks the spread in R, but the scan's adaptive-stop phase found wider stops turn the selector towards continuation trades that did not hold | same gate |
| — | **THE MIRROR** | a significantly negative cell means the fade loses net; it does not make the continuation a trade (it pays the same spread). Reported, not scored | |

Verdict: **VALIDATED** if any of M, L, J passes its gate. **NULL** if none passes and all three 95% CI upper bounds
are below +0.05R. **UNDERPOWERED** otherwise.

## 5. Power

The scan's holdout gave an SD of ≈ 1.4R per trade (CI ±0.115 at 584 trades). At 2 trades a week the seen
out-of-fold set has ≈ 1,000 trades over 2017–2026; the unseen rate depends on how c transfers and is expected at
500–1,500. At n = 1,000 the SE is ≈ 0.045R and the **MDE ≈ 0.12R** (2.8 × SE); at n = 500, ≈ 0.18R. The gross effect
is +0.19R, so a net effect of half of it would be at the edge of detection. The realised MDE (2.8 × bootstrap SE) is
reported per cell; a cell whose MDE exceeds 0.15R cannot support NULL on its own.

## 6. Multiplicity

Three scored cells (M, L, J), Holm at α 0.05 on the two-sided bootstrap p. The gate is otherwise conjunctive. One
model recipe, one c, one d*, one limit price, one fill window: **one prereg + the two execution variants named
here**, nothing else run. Per-pair, per-year, per-spread slices are descriptive (BH q 0.10 with `chanceBaseline`).
Anything live needs |t| ≥ 3 and a forward shadow record.

## 7. Controls and descriptives (not scored)

- **C1, selector vs no selector**: for each unseen selected trade, K = 5 random eligible touches from the same pair,
  year and UTC hour, traded in the same direction relative to their touch (fade or continue), under L's rules.
  Real − control net R says whether the selector adds anything over a random touch with the same exits.
- **D1, adverse selection (L)**: the mid-price outcome (entry at P, no spread) for signals that filled vs those that
  did not.
- **D2, seen-set holdout re-priced**: M, L and J on the seen pairs over 2022-06-24 → 2026-08-20 at real bid/ask
  (dax for de30). This is the **fifth read** of that holdout and is description only.
- **D3**: by year, pair, side (fade/continue), trades a week, spread ÷ R terciles, fill rate, excluded counts by reason.
- **D4, reproduction check**: the seen out-of-fold predictions for discovery rows (before 2022-06-24) must equal
  `preds_discovery.npz` (same data, folds, recipe and seed). A mismatch is reported before anything is scored.

## 8. What this does NOT test

- Anything Vote Atlas traded, scored or configured. Its lines (`oh50/75/90`) enter only through the shared ladder maths.
- The MT5 broker's spreads (OANDA practice pricing), queue position beyond the stress fill, latency, swaps, slippage
  past a bar's open.
- Equity indices, gold or futures out of sample (the unseen set is FX crosses and two USD pairs, which share
  currencies with the seen set and the same years: unseen instruments, not independent ones).
- Sizing, the one-account constraints, or a portfolio.

## 9. What each verdict changes

- **VALIDATED**: the first net-positive form of the touch-selector idea. Next: a shadow logger on the passing cell
  (no live change, `feedback_side_by_side_no_live_impact`), one look at 60 sessions, then a one-account sim.
- **NULL**: the one replicated touch effect does not survive real spreads in any execution form, on pairs it never
  saw. The line-touch book is closed for intraday trading on these line families; what remains is the forward record
  the cost phase called for, and the touch data as context.
- **UNDERPOWERED**: the forward shadow decides; no more backtest variants on this selector.

## Amendments

(none)

## RESULTS

Run 2026-10-28 → `analysis/output/line-touch-limit-unseen/RESULTS.md`. **NULL**: M −0.377R [−0.456, −0.296], L −0.461R [−0.531, −0.392], J −0.066R [−0.152, +0.025] on 1,045 signals (886 limit fills), 17 unseen pairs, 0/17 pairs positive under M and L. The selector's gross edge transfers (+0.241R on mid; +0.10R over random touches) but the median spread is 0.47R at the scan's stop; the limit's unfilled 15% hold all the edge (+1.63R vs −0.04R filled); the MAE rule found no noise threshold inside 0.40 of range (d* = cap).
