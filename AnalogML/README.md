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
— a real distinction.

### Robustness sweep (`pattern_scan_sweep.py`) — does it hold up?

A single parameter setting on 3 pairs is a first read, not a result — this
sweeps `--window` (32/64/96) x `--k` (10/20) across 4 pairs (gbpjpy, eurusd,
audjpy, usdjpy), and separately checks stride == window (fully
non-overlapping query windows, i.e. independent trials, not the ~80%-overlap
default) so the trade count isn't inflated by autocorrelated near-duplicates:

```
python AnalogML/pattern_scan_sweep.py
```

**Result: 23/24 overlapping-window cells (96%) and 10/12 independent
non-overlapping-window cells (83%) had signal profit factor > 1.0**, while
the mechanical baseline hovered at ≈0.83–1.07 throughout (flat, as expected)
— across every pair and every window/k combination tried, not just the
original setting. This meaningfully strengthens the original read: it isn't
one lucky (pair, window, k) triple. It's still: unoptimised parameters, one
sl/tp cell, one timeframe, no realistic portfolio/sizing simulation, and a
small-ish per-cell trade count on the independent check (n≈100–330) — a
robust FIRST read, still not a validated edge.

### Full 26-pair universe check — was it cherry-picked?

The sweep above tested 4 pairs. The natural next question is whether those 4
were lucky, so this reruns the single window=64/k=20 setting (the one that
held up best) across **all 26 pairs** this repo has local M1 data for:

```
python AnalogML/pattern_scan_sweep.py --pairs <all 26, comma-separated> --windows 64 --ks 20
```

**Result: 26/26 pairs (100%) positive on the overlapping-window check, 25/26
(96%) positive on the independent non-overlapping check** — baseline stayed
flat (≈0.83–1.04) throughout. Only **eurnzd** came in negative on the
independent check (PF 0.84, WR 37%) — named plainly, not buried. If this
were pure noise around a flat baseline, roughly half the pairs would land
above 1.0 and half below by chance; 25–26 out of 26 landing on the same side
is not a chance outcome. This is real evidence the direction-picking edge
isn't an artifact of which 4 pairs got tested first. Gold stood out on the
independent check (PF 2.37, WR 62%, n=165) — flagged, not led with: it's
also the smallest sample of the 26, and the best-looking pair out of 26
tested will always look better than the population average even under a
real, uniform effect (the multiple-comparisons trap) — treat it as "worth
a closer look," not "the pair to trade."

Still outstanding before this is tradeable: unoptimised parameters, one
sl/tp cell, one timeframe, and — the big one — **no portfolio-level
simulation**. Per-pair profit factor says the signal is real; it says
nothing about what happens when 26 correlated FX pairs' trades stack up in
one account (concurrent risk, drawdown, correlation). That's the next gate,
not this one.

### `portfolio_sim.py` — does the per-trade edge survive being a portfolio?

Combines every pair's dated trades (same causal analog-consensus signal,
non-overlapping/independent trades) into ONE event-driven account: risk
`--risk-pct` of equity per trade (sized at entry, crystallized at exit), a
hard cap `--max-concurrent-risk-pct` on total simultaneously-open risk
(new entries are REFUSED, not partially sized, once the cap is hit — and
refusals are counted, never silently dropped).

```
python AnalogML/portfolio_sim.py --all-pairs --risk-pct 0.01 --max-concurrent-risk-pct 0.05
```

**Result (26 pairs, 3yr, risk=1%/trade, 5% max concurrent risk): Sharpe
1.39, max drawdown −26.2%, final equity 15.5x starting capital.** Read the
15.5x number with real suspicion, not excitement — it is what happens when
~1,953 taken trades compound at a small per-trade edge, and it is a
mechanical artifact of the sizing assumption (fixed 1% of CURRENT equity,
every trade, for 3 years straight, no re-basing, no risk-of-ruin
consideration, no execution slippage beyond the spread already in each
trade's R), not a return forecast. **Two things worth taking seriously
instead of the equity multiple:**

1. **The concurrency cap bound hard: 3,975 of 5,928 raw signals (67%) were
   skipped**, only 1,953 taken. That means the reported numbers are for
   whichever ~1/3 of signals happened to fit under the cap — a real
   methodological wrinkle, not a clean test of "all 26 pairs' full signal."
2. **The portfolio's −26.2% drawdown is DEEPER than any individual pair's
   benchmark drawdown** (single pairs shown: −7% to −12%), even though the
   average pairwise weekly-return correlation is ≈0 (+0.006, genuinely
   independent-looking bets). That is NOT diversification failing — it's
   that the portfolio routinely uses most of its 5% concurrent-risk budget
   (many pairs signal at once), while a single pair on its own almost never
   gets close to that same budget, so the portfolio is running at far
   higher average capital utilization than the single-pair benchmark it's
   being compared to. Higher return AND higher drawdown together is the
   expected result of "more capital deployed," not evidence the 26 pairs
   behave like fewer effective bets — the near-zero correlation number says
   the opposite. A fair apples-to-apples comparison (same average
   utilization on both sides) hasn't been run yet.

Bottom line: the signal didn't fall apart when combined into a portfolio —
Sharpe stayed comparable to or better than the best single pair — but this
simulation's headline return number is not a claim about what real trading
would produce, and the cap/utilization confound above needs resolving
before the risk-adjusted numbers are trusted either.

**Update — the confound above is now resolved.** `portfolio_sim.py` tracks
time-weighted average concurrent-risk utilization and adds a SECOND, matched
benchmark: instead of comparing the portfolio to a single pair at the same
`--risk-pct` (which was the confound — a single pair almost never gets near
the concurrency cap, so it was running at far lower capital utilization than
the portfolio), it scales the single pair's risk-per-trade up until its own
average utilization matches the portfolio's, then compares Sharpe/drawdown
at that matched point. **Result (26 pairs, 3yr, 1% risk/trade, 5% cap):**
portfolio avg utilization 0.5%, Sharpe 1.39, max DD −26.2%. Three single
pairs matched to that SAME 0.5% utilization: audcad Sharpe 0.29 / DD −38.6%,
audchf Sharpe 1.28 / DD −22.7%, audjpy Sharpe 0.74 / DD −45.8%. **The
portfolio beats every matched single pair on Sharpe, and has a shallower
drawdown than two of the three** — this is now a real, controlled
diversification read, not the capital-deployed illusion the original
benchmark A produced (kept in the output for comparison, but benchmark B is
the one to trust). Same unoptimised-parameters/no-slippage caveats as
before still apply — this resolves ONE confound, not all of them.

## `paper_track.py` — the one thing every result above is still missing

Every number in this README, however sweep-tested or portfolio-simulated,
shares the same gap: window=64/k=20 were chosen by looking at aggregate
performance over roughly the same period being reported. None of it is a
genuinely blind forward test. `paper_track.py` is the mechanism to get one:
it logs what the FROZEN signal calls on each new bar as it arrives (`AnalogML/data/paper_trades.json`,
append-only), and on a later run re-races any still-`open` trade against
newly-arrived bars (`pylego.barrier_race.race_trades`, same walker as
everywhere else) to mark it `tp`/`sl`/genuine-`timeout` — never touching the
frozen parameters based on what comes back.

```
python AnalogML/paper_track.py          # real forward use, once wired to live data (see below)
```

**This sandbox cannot reach live data — confirmed, not assumed.** A direct
`curl` to OANDA from here gets a 403 policy denial from the outbound proxy
(logged: `"gateway answered 403 to CONNECT (policy denial or upstream
failure)", host: "api-fxpractice.oanda.com:443"`), matching `CLAUDE.md`'s
documented "OANDA is reachable in Railway, not in the sandbox." So
`paper_track.py` reads the same static local M1 parquet snapshot (through
2026-05-21) as every other script here — there is no live feed wired in yet.

**The mechanism itself is verified, not just written.** `--as-of YYYY-MM-DD`
truncates the loaded bars as if that date were "now," so the scan → resolve
→ scan cycle can be exercised honestly against real historical data without
pretending it's live: step 1 (`--as-of 2026-04-01`) logged an open GBPJPY
SELL, unable to know its outcome from data available at that point; step 2
(full snapshot, no cutoff) correctly resolved that SAME trade as an SL hit
(−1.05R) using bars that were genuinely in the future at step 1, then found
fresh open signals at the snapshot's true boundary. That's a real proof the
scan/resolve logic doesn't leak future information and doesn't falsely
close a trade before its outcome is actually knowable.

`AnalogML/data/paper_trades.json` is seeded with 25/26 pairs' genuinely-open
signals as of the snapshot's end (2026-05-21) — the starting point for
whoever picks this up with live data.

### Wired for Railway — `--refresh-data`, `refresh_m1.py`, R2 persistence

```
python AnalogML/paper_track.py --refresh-data   # real forward use, wherever OANDA is reachable
```

`--refresh-data` calls `refresh_m1.py` first: for each pair, fetches only
the bars newer than the local parquet's current last timestamp from OANDA
and appends them, reusing `scripts/fetch_m1_oanda.py`'s `fetch_chunk()` for
the actual API call (one fetcher, not a second copy) and
`pylego.instruments.oanda_symbol` for the pair → OANDA-instrument mapping
(the canonical registry — `fetch_m1_oanda.py`'s own `INSTRUMENTS` dict only
covers gold/indices/commodities, not the 25 FX crosses AnalogML trades).
Writes back in the exact schema every other AnalogML script already reads
(`DatetimeIndex` named `datetime`, tz-aware UTC, `open/high/low/close/volume`
columns) — deliberately not `fetch_m1_oanda.py`'s own parquet schema (a
`time` *column*, built for a different JS-side consumer).

The trade log also stops living only on local disk: `load_log()`/`save_log()`
read/write Cloudflare R2 (`R2_ACCESS_KEY`/`R2_SECRET_KEY` env vars, same
bucket the M1 data lives in) whenever those credentials are present, falling
back to local disk otherwise (this sandbox, local dev, `--as-of` testing).
This matters because Railway's local filesystem is wiped on every redeploy —
the exact trap `CLAUDE.md` documents for KV bot configs — so a log that only
lived on local disk would lose its whole track record on the next deploy.

`start.sh` now runs this on a loop (`AnalogML/paper_track_loop.sh`, default
hourly via `PAPER_TRACK_INTERVAL_SECONDS`) as one more supervised process
alongside the existing bots — restart_bot wraps the LOOP script, not
`paper_track.py` directly, so a normal one-shot exit doesn't trigger an
immediate 30s restart-and-hammer-OANDA cycle.

**Still needed before this produces a real track record:** the R2 and OANDA
credentials that were found hardcoded in this repo (`scripts/fetch_m1_oanda.py`,
`scripts/r2_download.py`, `portfolioBacktest/portfolio_backtest.py`,
`VolRangeForecaster/session_stats.py` — since removed, see the security fix
commit) need to be rotated, and Railway's `OANDA_KEY`/`R2_ACCESS_KEY`/
`R2_SECRET_KEY` env vars need to reflect the rotated values, before this
loop is trusted with real credentials in production.

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

### `--with-analog` — does the shape-matching signal help the classifier?

Adds ONE more feature, `analog_margin` (the shape-matching neighbour-consensus
margin from `pylego.analog_signal` — the same brick `pattern_scan.py` uses),
and runs the SAME walk-forward twice — with and without it — so the AUC
delta is a real ablation, not two runs a reader has to diff by hand:

```
python AnalogML/ml_walkforward.py --pair gbpjpy --with-analog --analog-sample-every 4
```

The feature is computed causally but only every `--analog-sample-every` bars
and forward-filled between (a real cost/accuracy tradeoff — computing it for
every one of ~64k bars would take ~25min per pair). **Cadence matters a lot:**
a coarse smoke test at `--analog-sample-every 24` (yearly folds, a full day
of staleness between samples) moved AUC by ~0.001–0.002 — noise. The real
run at the default `--analog-sample-every 4` (4-hour staleness) moved it
for real:

| scheme | model | AUC/IC without | AUC/IC with `analog_margin` | delta |
|---|---|---:|---:|---:|
| expanding | xgboost | 0.510 | 0.532 | +0.022 |
| expanding | lightgbm | 0.510 | 0.531 | +0.021 |
| expanding | stack (IC) | 0.023 | 0.069 | +0.046 |
| rolling (1yr) | xgboost | 0.512 | 0.521 | +0.009 |
| rolling (1yr) | lightgbm | 0.510 | 0.520 | +0.010 |
| rolling (1yr) | stack (IC) | 0.013 | 0.044 | +0.031 |

Every model, every scheme, moved in the same direction — profit factor also
rose in every cell (e.g. expanding xgboost PF 1.09→1.19, stack PF 1.06→1.14)
and the classifiers took MORE trades at >0.5 confidence (expanding xgboost
n=2,520→4,275), not fewer, so this isn't just "the model got pickier." Read
this as the single most encouraging result in this whole first pass — AUC
0.51→0.53 is still a modest number, nowhere near a validated edge, but a
*consistent, cadence-sensitive, same-direction-everywhere* move is a real
signal that the shape-matching idea is contributing information the
price/vol-only features didn't already have — worth a proper follow-up
(finer sample-every, more pairs, hyperparameter tuning now that there's a
feature worth tuning around) rather than the price-only feature family,
which tested flat on its own.

**Not included yet: real macro features.** `RegimeV2/regime_score.py`
(HMM/BOCPD/session/DXY/vol/credit), `MacroEquityBot/fred_signal.py`
(net liquidity, yield curve, credit spread, real yield, ISM), and
`bot/modules/cot_filter.py` (COT positioning) all compute exactly the kind
of macro features this model should eventually train on — they're not wired
in here because they need live `FRED_KEY`/broker API access this sandbox
doesn't have, and faking that data would violate the "don't run a lookalike
and call it the thing" rule in `CLAUDE.md`. `--macro-csv <path>` is the
plumbing for it: pass a CSV with a `date` column plus any numeric feature
columns (exported from the modules above), and it's merged in by date,
forward-filled to bar cadence, and run through the same ablation machinery.
Not a synthesized stand-in — real next step, waiting on real data.

## Honesty notes (read before trusting a number here)

- Costs are on by default (`pylego.costs.default_spread`) in both scripts —
  pass `--no-cost` only to see the pre-cost number, never report that as a
  result.
- `pattern_scan.py`'s neighbour search is brute-force vectorized Euclidean
  distance, not matrix profile or DTW — a reasonable next upgrade once this
  baseline's numbers are trusted enough to be worth improving, not before
  (CLAUDE.md: "start with the minimal-DOF version").
- The main sweep's trades (default `--stride`) overlap in time (a 64-bar
  window every 12 bars shares ~80% of its bars with its neighbour) — that
  n is NOT n independent trials. The non-overlapping (`stride == window`)
  check exists specifically to address this — read the overlapping numbers
  as "more samples, more autocorrelated" and the non-overlapping numbers as
  "fewer samples, closer to independent," and note that BOTH show PF > 1 in
  most cells rather than picking whichever one looks better.
- ONE instrument (`ml_walkforward.py`'s ablation) / four instruments
  (`pattern_scan_sweep.py`) is still a small slice of the 29 pairs this repo
  has data for — real next step is widening both before trusting the size
  of any number here, not just its sign.
- Hyperparameters (XGBoost/LightGBM depth, learning rate, n_estimators; the
  shape-matching window/k/stride grid) are unoptimised defaults throughout —
  tuning them is reasonable ONLY after a feature/idea has shown it's worth
  tuning around (`analog_margin` now qualifies; the price-only feature set
  on its own did not).
