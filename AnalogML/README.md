# AnalogML — historical-analog matching + walk-forward ML

Two honest first reads of two ideas raised in conversation: "shape matching"
(find historically similar price windows, see what happened next) and
gradient-boosted-tree / regression-stack macro ML. Both are built on the
existing shared bricks in `pylego/` — the fixed-SL/TP barrier walker
(`barrier_race.py`) and the cost model (`costs.py`) are the SAME ones every
other SL/TP study in this repo uses, never a second copy — plus two new
bricks built for this work: `pylego/shape_match.py` (the analog search) and
`pylego/walkforward.py` (calendar-aligned expanding/rolling OOS folds).

Neither script is a live signal. Both are evaluation harnesses that walk a
sample of historical bars and, at each one, only use information visible
strictly BEFORE that bar — a genuine walk-forward test, not a demo of
"here's what the model says right now."

## Setup

```
pip install -r AnalogML/requirements.txt
```

Needs local M1 parquet data at `VolRangeForecaster/data/m1/<pair>_m1.parquet`
(already present in this repo for 29 pairs).

## `pattern_scan.py` — shape matching

For each sampled bar: normalize the trailing window into a price-level-free,
unit-vol shape, find its k nearest historical analogs (excluding anything at
or after that bar), take the direction the analogs did better on (a
consensus vote via `race_trades`), and score that ONE directional call with
`race_grid`. Compared against a mechanical, no-signal, both-directions
baseline over the same bars — the benchmark this only means something
against.

```
python AnalogML/pattern_scan.py --pair gbpjpy --timeframe 1h --window 64 \
    --k 20 --stride 12 --eval-years 3
```

Key flags: `--window` (bars per shape), `--k` (neighbours), `--stride`
(bars between query points — smaller = more samples, slower), `--eval-years`
(how far back the evaluation region starts), `--sl-pips` / `--tp-r-grid`
(the barrier grid), `--min-gap-bars` (defaults to `--window`, so neighbours
can't just be the same window shifted by a few bars).

**First read (gbpjpy, eurusd, audjpy — H1, 2023-05→2026-05, sl=20p, cost
on):** the mechanical baseline is flat-to-slightly-negative on all three
pairs (expected — no edge from random both-direction entries under real
cost). The analog-consensus direction shows a small, consistent positive
profit factor (≈1.06–1.24) across all three pairs and every `tp_r` cell
tested, ~1,200–1,300 trades per pair. The diagnostic AUC of
`|neighbour long/short R margin|` vs win/loss sits ≈0.50–0.57 — weak to no
discrimination. Read that combination plainly: the win looks like it's in
**which direction gets picked**, not in **how confident the model should be**
— a real distinction, and one more reason this is a first read, not a
result. One window length, one k, one sl/tp cell, unoptimised, no
robustness/overlap-autocorrelation check yet.

## `ml_walkforward.py` — XGBoost / LightGBM / regression stack

Builds price/vol-derived features (returns, realized vol, RSI, ATR%,
distance from SMA50, session hour/day-of-week — see `FEATURE_COLS`), labels
every bar with the triple-barrier LONG outcome (same `tp_hit` framing as
`bot/scripts/train_gold_model.py`), and walks it forward with
`pylego.walkforward` under BOTH an expanding scheme (train on everything
before the test quarter) and a rolling scheme (train on only the preceding N
quarters — the "did the edge decay" check the expanding scheme alone can't
answer). Trains an `XGBClassifier`, an `LGBMClassifier`, and an sklearn
`StackingRegressor` (Ridge + XGBRegressor + LGBMRegressor → Ridge
meta-learner) per fold, pools every fold's OOS predictions, and reports one
n / total-R / win-rate / profit-factor / AUC (classifiers) or IC + directional
accuracy (regressor) line per scheme.

```
python AnalogML/ml_walkforward.py --pair gbpjpy --timeframe 1h \
    --sl-pips 20 --tp-r 1.5 --fold-freq Q --min-train-periods 4 --train-periods 4
```

**First read (gbpjpy, H1, 2016→2026, sl=20p, tp_r=1.5, cost on, 38 OOS
quarters each scheme):**

| scheme | model | n | total R | WR | PF | AUC / IC |
|---|---|---:|---:|---:|---:|---:|
| expanding | xgboost | 2,520 | +131.5R | 44.1% | 1.09 | AUC 0.510 |
| expanding | lightgbm | 2,604 | +63.3R | 43.0% | 1.04 | AUC 0.510 |
| expanding | stack (regressor) | 15,326 | +562.1R | 43.5% | 1.06 | IC 0.023 |
| rolling (1yr) | xgboost | 11,199 | +176.1R | 42.6% | 1.03 | AUC 0.512 |
| rolling (1yr) | lightgbm | 10,740 | +29.9R | 42.1% | 1.00 | AUC 0.510 |
| rolling (1yr) | stack (regressor) | 26,524 | +257.3R | 42.4% | 1.02 | IC 0.013 |

Read this plainly, not hopefully: **AUC ≈0.51 is essentially no
discrimination** (0.50 = coin flip) — the classifiers are barely separating
winners from losers on price/vol features alone, and the rolling scheme
(forced to keep relearning on only the last year) is flatter than the
expanding one. Profit factor is above 1.0 everywhere but only barely in most
cells; win rate sits in the low-to-mid 40s throughout, which the trade count
being in the thousands makes hard to wave away as noise but also nowhere
near a result worth trading. This reads as "the price-derived feature set on
its own carries very little signal for this label" — a real finding, stated
as a finding, not a failure of the harness (CLAUDE.md's bug-hunting rule
applies: the harness was checked — real OOS folds, cost on, shared barrier
walker — before concluding the *idea* under these features is weak). The
open question this leaves is whether MACRO features (below) move the AUC, not
whether more price-derived features or hyperparameter tuning would — squeezing
more out of the same feature family that already tested weak is lower
priority than testing a genuinely different one.

**Not included yet: real macro features.** `RegimeV2/regime_score.py`
(HMM/BOCPD/session/DXY/vol/credit), `MacroEquityBot/fred_signal.py`
(net liquidity, yield curve, credit spread, real yield, ISM), and
`bot/modules/cot_filter.py` (COT positioning) all compute exactly the kind
of macro features this model should eventually train on — they're not wired
in here because they need live `FRED_KEY`/broker API access this sandbox
doesn't have, and faking that data would violate the "don't run a lookalike
and call it the thing" rule in `CLAUDE.md`. Merging their historical output
into `build_features()` is the real next step for the "regression side of
macro data" idea, not a synthesized stand-in.

## Honesty notes (read before trusting a number here)

- Every result above is ONE parameter setting on a SMALL number of pairs —
  exactly the kind of single-slice result `CLAUDE.md`'s "how we talk about
  results" section warns against over-reading. Treat it as a first pass,
  not a verdict.
- Costs are on by default (`pylego.costs.default_spread`) in both scripts —
  pass `--no-cost` only to see the pre-cost number, never report that as a
  result.
- `pattern_scan.py`'s neighbour search is brute-force vectorized Euclidean
  distance, not matrix profile or DTW — a reasonable next upgrade once this
  baseline's numbers are trusted enough to be worth improving, not before
  (CLAUDE.md: "start with the minimal-DOF version").
- Trades sampled by `--stride` overlap in time (a 64-bar window every 12
  bars shares ~80% of its bars with its neighbour) — the reported n is NOT
  n independent trials; no autocorrelation-adjusted significance test has
  been run yet.
