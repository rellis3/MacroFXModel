# LINE-REACTION: how price approaches the chosen forecast's lines, and what it does next

*Pre-registered 2026-10-07, before any number in this file was computed. The owner asked whether the chosen
forecast's lines (Vol Forecast v3 → Export → "Forecast · chosen ★", persistence + IV) can be studied for how price
behaves leading up to a line and how it reacts from it, including candle shape and volume. Research only. No live
change follows from this file whatever it finds.*

Script: `scripts/forecast_history/line_reaction.py` (stages `lines` → `events` → `analyse`). Output:
`analysis/output/line_reaction/RESULTS_chosen.md` and `results_chosen.json`.

## The question, split in two

- **Q1 (is the line special?).** Price reacts at the line differently from how it reacts at a price a little nearer
  to or further from the open, on the same days. If not, a "reaction at the line" is just price having travelled a
  given distance from the open.
- **Q2 (does the approach predict the reaction?).** At the moment price first touches a line, what is known about
  the lead-up (speed, straightness, pull-backs, earlier probes, candle shape, tick volume, time of day, range already
  used, the day's regime) predicts reject vs break **better than the line's rung and side alone**, out of sample, and
  enough to matter for a fade at the line.

Q2 can pass while Q1 fails. That would mean the approach predicts the reaction at any comparable distance, and the
line is a convenient place to look rather than a cause. Both are reported.

## The lines (point-in-time)

- **Rows:** the Step 0 table (`forge/FORECAST_HISTORY_SPEC.md`), out-of-sample sessions (`oos = 1`, 2020-08 → 2026-08),
  complete sessions (last bar ≥ 20:00 London), 34 instruments.
- **σ and widths:** the chosen forecast as picked in `forge/FORECAST_PICK_PREREG.md` variant 1: persistence + IV (SI)
  on the 13 instruments with implied vol from the live-type sources (CME settlement-inverted 30-day ATM for the six
  USD majors, GVZ gold, VXN NQ, VIX the other indices), persistence (S) elsewhere and wherever SI has no fit yet.
  β and widths are refit per walk-forward fold exactly as `forecast_pick.py` does (5-session embargo), so every line
  was drawn with parameters fitted only on earlier sessions. σ base is `pit_sig_used`. SI needs ≥ 500 training rows
  with IV, so the IV instruments use S until it has them (the live fallback).
- **Levels studied:** O-H p50 / p75 / p90 above the open, O-L p50 / p75 / p90 below. (O-C lines are the same
  prices measured to the close; HL is a width, not a price. Neither is studied here.)
- `--lines plain` runs the same study on the plain export's `pit_*` lines, as a comparison only.

## Encounters

- **Session:** London 00:00–22:00, M1 bars, open = the table's `open`. σ_p = open × σ_chosen % / 100 (price units).
- **Encounter:** the **first** bar of the session whose high (above) / low (below) reaches the level. One per level
  per session; retests are not studied.
- **Window:** the touch must be between 01:00 and 20:00 London (60 minutes of lead-up, 120 minutes to resolve).
  Touches outside are counted, not studied.
- **Placebo levels (Q1):** the same rule at the line ± {0.1, 0.2, 0.3} σ_p on the same day and side (a placebo must
  still lie beyond the open). Neighbours = |offset| ≥ 0.2.

## Outcome (fixed now)

K = 0.25 σ_p, horizon 120 minutes after the touch minute.

- **Break:** price goes K beyond the level before it comes K back. If the touch bar itself already reaches K beyond,
  it is a break (flagged `instant`).
- **Reject:** price comes K back toward the open (from the level) before going K beyond. Scanned from the bar after
  the touch bar, because the order of high and low inside the touch bar is unknown.
- **Ambiguous:** both inside the same later bar. Counted; dropped from rates; scored as a loss in the fade test.
- **Timeout:** neither within 120 minutes.
- Also recorded: furthest move back and furthest move beyond in the 60 minutes after the touch, position at +60
  minutes and at the session end (σ units), and whether the next rung is reached later in the session (p90's next
  rung = p90 + (p90 − p75)).

The headline rate is **P(reject | resolved)** = reject ÷ (reject + break).

## Lead-up features (only bars strictly before the touch bar)

| group | features |
|---|---|
| budget | distance of the level from the open (σ); excursion to the other side of the open before the touch (σ); range used = the two together; whether the opposite p50 line was hit first |
| approach | travel toward the level in the last 15 and 60 minutes (σ); efficiency of the last 60 minutes (net ÷ path length of closes); deepest pull-back in the last 60 minutes (σ); earlier probes = distinct 15-minute buckets, ending more than 15 minutes before the touch, that came within 0.1 σ of the level without touching it |
| candle | on the last two complete 5-minute candles and the last complete 15-minute candle: body ÷ range signed toward the level, close location signed toward the level, wick on the level's side ÷ range, candle range (σ); consecutive complete 5-minute candles closing toward the level (max 12) |
| volume | tick volume over the last 15 minutes ÷ the median of the same clock window over the previous 20 sessions; same for the last complete 5-minute candle; last 15 minutes ÷ the average 15 minutes of the 45 before it. (OANDA tick counts: an activity proxy, not exchange volume) |
| time | minute of the session; session bucket (Asia < 07:00, London < 12:00, New York after) |
| day | regime, res1 (the forecast's own inputs), log(IV ÷ σ) where it exists, event tag, gap from the previous close, weekday |

## Stage A — descriptive, and Q1

Per rung (p50 / p75 / p90) × offset, pooled over sides and instruments, and by class: counts, P(reject | resolved),
P(break | resolved), timeout share, P(next rung). 95% intervals: stationary date-block bootstrap (block 20, 2,000
reps, `forecast_record.boot_weights`).

**Q1 passes for a rung** if P(reject | resolved) at offset 0 minus the pooled neighbours (|offset| ≥ 0.2) has a 95%
interval that excludes 0. Reported for all three rungs; no correction (three numbers, all shown).

## Stage B — one feature at a time (descriptive)

Per rung, each numeric feature cut into terciles (cut points from the offset-0 encounters of that rung).
P(reject | resolved), top tercile minus bottom, at the line and at the neighbours, and the difference between them
(is the split specific to the line?). Bootstrap intervals; Holm correction across every rung × feature cell at the
line. Descriptive: Stage B passes nothing by itself.

## Stage C — Q2, the walk-forward test (the pass rule)

- **Data:** offset-0 encounters with a resolved outcome. y = reject.
- **Folds:** test folds 1–5 (fold 0 has no earlier encounters to train on). Training = encounters on sessions before
  the test fold's first date minus a 5-session embargo.
- **Models:** *base* = logistic regression on rung × side × class only (what the ladder already knows);
  *logit* = base + every feature (median-imputed, standardised, L2, C = 1); *GBM* (primary) =
  `HistGradientBoostingClassifier`, max depth 3, learning rate 0.05, 300 iterations, min 200 rows per leaf,
  on base + every feature.
- **Score:** log-loss of the model ÷ log-loss of base, pooled over test folds, date-block 95% interval.
- **Fade test:** fade every touch at the level (entry at the level; target K back; stop K beyond). Result in units of
  K: reject +1, break −1, ambiguous −1, timeout = the mark-to-market at +120 minutes, clipped to ±1. Selected trades =
  GBM probability at or above the 80th percentile of its training-set predictions. Reported gross, with the
  break-even cost in σ. All trades and the follow side (bottom quintile, trade the break) are reported alongside.

**Q2 passes** only if all hold:
1. GBM log-loss ÷ base has its whole 95% interval below 0.99;
2. the selected fades' mean result is above 0 with its 95% interval above 0;
3. it is positive in at least 4 of the 5 test folds.

**Level-specific?** The same Stage C pipeline is run on the neighbour placebos (|offset| ≥ 0.2). Reported next to
the line's numbers, with no pass rule: if the placebo does as well, the edge (if any) is distance-from-open, not the
line.

**Candle shape and volume, specifically:** two extra GBM fits per fold, without the candle group and without the
volume group. The log-loss of the full GBM ÷ the GBM without that group, date-block interval. A group **adds
information** if that whole interval is below 1. Grouped permutation importance on the test folds is reported for
every group (descriptive).

## Stage D — approach shapes (exploratory, no pass rule)

The 60-minute lead-up as 12 five-minute closes, measured as distance to the level in σ. k-means, k = 6, fitted on
the encounters in folds 0–2; P(reject | resolved) per cluster on folds 3–5 with intervals. A cluster that stands out
is a lead for a new pre-registration, not a result.

## What this cannot show

- Fills at the exact level, spread and slippage: the fade test is gross; the break-even cost is reported so it can
  be compared with each instrument's spread in σ.
- Order inside a single M1 bar: handled by the touch-bar and ambiguous rules above, not resolved.
- Tick volume is not exchange volume; for indices and gold it is a CFD's quote activity.
- Encounters on the same day across 34 instruments (and the six levels of one instrument) are not independent:
  every interval is a date-block bootstrap.

## Variant log

| # | Variant | Why | Run? |
|---|---|---|---|
| 0 | as above | registered | **run 2026-10-08: Q1 no on all three rungs; Q2 FAIL** (`analysis/output/line_reaction/RESULTS_chosen.md`) |

Implementation note (2026-10-08, before the analysis stage was run): a touch on a session's very first bar (sessions
whose first M1 bar is after 01:00, data gaps) has no lead-up and crashed the replay. Those touches are skipped and
counted as `no_leadup`: 40 in total (DE30 12, UK100 28), out of 608,411 encounters.

### Result, variant 0 (2026-10-08)

608,411 encounters, 84,715 at the line, 34 instruments, 1,557 dates.

- **Q1 (is the line special?): no.** P(reject | resolved) at the line minus its ±0.2/0.3σ neighbours: p50 −0.001
  [−0.008, 0.004], p75 +0.004 [−0.004, 0.011], p90 −0.002 [−0.014, 0.009]. The rate is flat at ≈ 0.48 across
  every offset.
- **Q2 (does the lead-up predict the reaction?): FAIL.** GBM log-loss ÷ base 1.000 [0.999, 1.001]; logit the same.
  Fading the top quintile −0.011 K [−0.028, 0.005], positive in 1 of 5 folds.
- **Candle shape and volume add no information** (GBM full ÷ without: 1.000 for both, intervals touching 1).
  The close-location features show a small descriptive tercile spread at p50 (+0.029 / +0.022, Holm p < 0.01), about
  the same size at the neighbours (line − neighbours +0.015 [−0.000, 0.028]): not specific to the line, and too small
  for the walk-forward model to use.
- **Descriptive, not a registered test:** at the line, breaks (42.0%) slightly outnumber rejects (39.6%), and the
  follow side is positive (follow all +0.021 K; GBM bottom quintile +0.060 K [0.038, 0.081], 5/5 folds). The same
  holds at the placebo levels (+0.021 K; bottom quintile +0.080 K), so it is short-horizon continuation at any
  distance from the open, not a property of the line. +0.06 K = 0.015 σ, around one spread on the majors.
  Ambiguous bars are 0.1%, so the scoring of ambiguous outcomes does not drive it.

Harness check before any real run (2026-10-07): the full pipeline on two synthetic random-walk instruments (no level
memory by construction) gave P(reject | resolved) ≈ 0.50 at every offset, Q1 no on every rung, every Holm p = 1,
GBM log-loss ÷ base > 1 and Q2 FAIL, i.e. the harness does not manufacture an edge from noise.
