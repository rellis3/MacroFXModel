# AnalogML — historical-analog matching + walk-forward ML

> **CORRECTED 2026-08-12 — every positive result below this line was a bug,
> not an edge.** `pylego/shape_match.py`'s `find_analogs` let the window
> ending ~1 bar before the query slip into its own k-neighbour pool (near-total
> overlap, not an independent historical repeat — `min_gap_bars` only checked
> new candidates against each other, never against the query itself). That
> inflated EVERY consensus call this file's numbers are built on. Fixed, then
> the full validation suite was re-run against real data. Corrected results,
> replacing the false ones in the sections below:
>
> | Check | Originally reported | Corrected (post-fix) |
> |---|---|---|
> | 4-pair sweep, overlapping | 23/24 cells PF>1.0 (96%) | 11/24 (46%) |
> | 4-pair sweep, independent | 10/12 (83%) | 6/12 (50%) |
> | Full 26-pair sweep, overlapping | 26/26 (100%) | 8/26 (31%) |
> | Full 26-pair sweep, independent | 25/26 (96%) | 10/26 (38%) |
> | Portfolio sim (26 pairs, 3yr, 1%/trade, 5% cap) | final equity 15.5x, Sharpe 1.39, max DD −26.2% | final equity **0.638x (−36.2%)**, Sharpe **−0.14**, max DD **−62.9%** |
> | Full backtest export (19,815 trades) | IS/OOS both consistently >1 | **IS PF=0.94, OOS PF=0.95, cost-off PF=1.01** |
> | `ml_walkforward.py --with-analog` (gbpjpy) | AUC/IC improved in the same direction on every model/scheme | flat-to-mixed, no consistent direction (e.g. expanding stack IC 0.023→0.020, rolling stack IC 0.013→0.017) |
>
> This was not "a smaller edge" — the portfolio sim went from a strong winner
> to a large loser. **This specific method (fixed-window k-NN shape
> matching, these frozen params) shows no real repeatable edge.** The honest
> next move isn't tuning this method further — it's a structurally different
> approach (motif/structural-event matching instead of raw fixed-window
> Euclidean distance), scoped separately. The narrative sections below are
> kept as a record of what was originally read from the buggy numbers, NOT as
> current claims — read the table above as the actual result of each section.

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

**[FALSIFIED 2026-08-12 — see banner at top. Corrected: 11/24 (46%) and
6/12 (50%), i.e. coin-flip.]** Original claim: 23/24 overlapping-window
cells (96%) and 10/12 independent non-overlapping-window cells (83%) had
signal profit factor > 1.0, while
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

**[FALSIFIED 2026-08-12 — see banner at top. Corrected: 8/26 (31%) overlapping,
10/26 (38%) independent — WORSE than a coin flip, not a broad positive.]**
Original claim: 26/26 pairs (100%) positive on the overlapping-window check,
25/26 (96%) positive on the independent non-overlapping check — baseline stayed
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
a closer look," not "the pair to trade." **(All of the above turned out to
be exactly the multiple-comparisons trap this paragraph warned about — see
banner.)**

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

**[FALSIFIED 2026-08-12 — see banner at top. Corrected: final equity 0.638x
(−36.2%), Sharpe −0.14, max DD −62.9% — a losing strategy, not a winner.]**
Original claim: Sharpe 1.39, max drawdown −26.2%, final equity 15.5x
starting capital. Read the
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

**Update, since superseded — see banner.** `portfolio_sim.py` was extended to
track time-weighted average concurrent-risk utilization and add a SECOND,
matched benchmark (scale a single pair's risk-per-trade up until its own
average utilization matches the portfolio's, for a fair apples-to-apples
comparison). That mechanism is still correct and still in the script — it's
the NUMBERS run through it that were wrong. **[FALSIFIED 2026-08-12 —
corrected: portfolio Sharpe −0.14, max DD −62.9%, final equity 0.638x. The
single-pair benchmarks are losers too post-fix.]** Original claim: portfolio
avg utilization 0.5%, Sharpe 1.39, max DD −26.2%; three single pairs matched
to that same 0.5% utilization: audcad Sharpe 0.29/DD −38.6%, audchf Sharpe
1.28/DD −22.7%, audjpy Sharpe 0.74/DD −45.8%, with the portfolio beating
every matched single pair on Sharpe. None of that comparison is meaningful
once the underlying per-trade signal is null — a "wins on Sharpe" result
where every side of the comparison is losing money is not a diversification
finding worth anything.

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
every one of ~64k bars would take ~25min per pair).

**[FALSIFIED 2026-08-12 — see banner at top.]** `analog_margin` is derived
from the exact same buggy `neighbor_consensus` call as every other result in
this file — this ablation was re-run post-fix and the "consistent,
same-direction-everywhere improvement" below did not survive:

| scheme | model | AUC/IC without | AUC/IC with `analog_margin` (corrected) | original (falsified) claim |
|---|---|---:|---:|---:|
| expanding | xgboost | 0.510 | 0.510 | 0.510 → 0.532 |
| expanding | lightgbm | 0.510 | 0.509 | 0.510 → 0.531 |
| expanding | stack (IC) | 0.023 | 0.020 | 0.023 → 0.069 |
| rolling (1yr) | xgboost | 0.512 | 0.509 | 0.512 → 0.521 |
| rolling (1yr) | lightgbm | 0.510 | 0.508 | 0.510 → 0.520 |
| rolling (1yr) | stack (IC) | 0.013 | 0.017 | 0.013 → 0.044 |

Corrected: flat-to-mixed, no consistent direction (three cells move down,
one up, two flat) — this is what a feature with no real information looks
like, not the "every model, every scheme, moved the same way" pattern
originally reported. That original pattern was the self-adjacent neighbour
smuggling a strong short-horizon autocorrelation/momentum signal into what
was supposed to be a broad historical-analog vote — real information, just
not shape-matching, and gone once the leak is closed. The original
paragraph below is kept for the record, not as a current claim:

*(original, falsified) "Every model, every scheme, moved in the same
direction — profit factor also rose in every cell (e.g. expanding xgboost
PF 1.09→1.19, stack PF 1.06→1.14) and the classifiers took MORE trades at
>0.5 confidence (expanding xgboost n=2,520→4,275), not fewer... Read this
as the single most encouraging result in this whole first pass..."*

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

## `motif_scan.py` / `motif_track.py` — structural motifs (the post-null pivot)

The k-NN shape-matching method above banked null once its bug was fixed (see
the banner at the top). Rather than keep tuning a method with no real edge,
this is a structurally DIFFERENT idea: instead of comparing every 64-bar
window to every other window regardless of what either looks like, recognize
a SPECIFIC, NAMED event — 2-3 touches of a level (double/triple top/bottom),
a genuine retracement between each touch, then a confirmed breakout — and
only signal on the entry that event actually implies.

Built fresh in `pylego/swing_structure.py` (pivot detection, ATR,
HH+HL/LH+LL regime classification) and `pylego/motif_touch.py` (the touch-run
/ breakout detector), both **regenerated, not ported**, from the already-
shipped `js/patternEngine.js`'s `pivotHighs`/`pivotLows`/`classifySwingStructure`
/`detectExtremesOneSide` — using that algorithm as the validated spec, a
fresh Python implementation with its own tests. `AnalogML/motif_scan.py` is
the evaluation CLI, same honest-harness pattern as `pattern_scan.py`
(mechanical both-directions baseline at the same opportunity bars, real
barrier walker, real costs). Entries are raced through the SAME frozen
SL-pips/TP-R grid every other AnalogML check uses — deliberately NOT a new
measured-move target/stop (that's the deferred "Phase 1" idea; changing the
entry AND the risk-sizing in the same test would confound which one moved
the result).

```
python AnalogML/motif_scan.py --pair gbpjpy --timeframe 1h --eval-years 3
```

**A real lookahead bug was found and fixed before any number was trusted:**
a touch isn't actually knowable as a genuine pivot until `pivot_n` bars have
passed after it (pivot detection needs a centered window) — the breakout
scan originally started checking for confirmation immediately after the
last touch, crediting signals a live system couldn't have had yet (measured
on real data: 15.3% of "confirmed" motifs). Fixed by delaying the scan start
to `last_touch.idx + pivot_n`; a regression test now guards this invariant.

**Full 26-pair sweep (3yr, frozen params — the JS engine's untouched
defaults, not tuned on this data):** **20/26 pairs (77%) signal PF>1.0,
25/26 (96%) beat the mechanical baseline** — broader and stronger than the
k-NN method ever showed even before its own bug was found. Six pairs
negative (eurgbp, gbpchf, audcad, usdcad, gbpcad, euraud) — named, not
hidden. **Calendar IS/OOS split (cutoff 2023-01-01, all 26 pairs pooled,
sl=20p, tp_r=1.5):**

| | n | PF | WR | avg R |
|---|---:|---:|---:|---:|
| IS (pre-2023, cost on) | 19,240 | 1.18 | 45.8% | 0.102 |
| OOS (2023+, cost on) | 9,183 | 1.16 | 45.3% | 0.091 |
| OOS (2023+, cost OFF) | 9,183 | 1.24 | 45.3% | 0.133 |

Minimal IS→OOS decay (1.18→1.16) is the OPPOSITE signature of an overfit
result, and it survives real costs. Genuinely encouraging — **still not a
validated edge**: no portfolio-level test yet (correlated FX pairs stacking
concurrent risk is exactly what sank nothing here yet but should be checked
before trusting per-pair numbers as tradeable), one sl/tp-r cell, and only
one bug-hunt pass (CLAUDE.md's rule: assume more bugs exist, don't assume
clean because one was caught).

**Live tracking (`motif_track.py`, new):** forward-tracks the frozen signal
the same way `paper_track.py` did for the retired method (same R2+disk
persistence, `--as-of`/`--refresh-data`, resolves via the shared barrier
walker) PLUS a live "what's forming right now" diagnostic per pair —
whichever touch-run is currently in progress, distance to the level, a
`provisional` flag when the last touch is still within `pivot_n` bars of
"now" (not yet actually confirmable), and "confidence" = the REAL historical
played-out-rate/PF/avg-R for that exact category on that pair — never a
fabricated per-instance probability. **A real bug here too, found before
shipping:** the first version logged every motif in a pair's ENTIRE history
as "new" on the first run (28,524 signals, one run) — `detect_touch_motifs`
re-scans full history each call with no cadence bookkeeping. Fixed with a
per-pair watermark (seeded at "now," nothing backfilled on a fresh pair,
same contract as `paper_track.py`); verified with a 3-step `--as-of` replay
(0 / 0 / 83-signals-in-the-gap).

Served at `/api/analogml/motif-state` / `/api/analogml/motif-trades`
(`server.js`), separate from the retired method's `paper_trades.json`/
`shape_state.json` (kept as its historical record, not deleted). `today.html`
/`indexv2.html` pair cards and `bot-config.html`'s AnalogML tab now show
this signal in place of the retired one. `AnalogML/motif_track_loop.sh`
(hourly, wrapped by `restart_bot` in `start.sh`) is the new supervised
process, alongside the still-running (but no longer dashboard-surfaced)
`paper_track_loop.sh`.

## `flag_scan.py` / `flag_scan_sweep.py` — flags & pennants (null, 2026-08-12)

The owner's full ask for AnalogML is broader than touches alone: EVERY
recognizable price shape already geometrically defined in
`js/patternEngine.js` (flags/pennants, head & shoulders, triangles/channels,
on top of the double/triple-top/bottom touches already built) gets the same
lifecycle treatment — before/during/after, historical frequency-based
confidence, adaptive per-cluster SL/TP, multi-timeframe agreement — with
flags/pennants named as the first family to try after touches, per that
ask's own minimal-DOF-first build order. This section is that first attempt,
run on its own branch, same harness/discipline as `motif_scan.py`.

`pylego/flag_pennant.py` regenerates `js/patternEngine.js`'s
`detectFlagsPennants` (+ its `findPole`/`findConsolidation`/`findBreakout`
helpers) fresh in Python — same generate-don't-port discipline as
`swing_structure.py`/`motif_touch.py`, reusing `pivot_highs`/`pivot_lows`
rather than a third copy of pivot detection. `AnalogML/flag_scan.py` is the
single-pair evaluation CLI (identical baseline/signal/race_grid harness to
`motif_scan.py`); `AnalogML/flag_scan_sweep.py` is a new, committed
26-pair-sweep-plus-pooled-calendar-IS/OOS script — motif's own 26-pair sweep
wasn't checked in as a script, this fills that reproducibility gap.

```
python AnalogML/flag_scan.py --pair gbpjpy --timeframe 1h --eval-years 3
python AnalogML/flag_scan_sweep.py --all-pairs --tp-r 1.5 --oos-cutoff 2023-01-01
```

**Bug-hunt before trusting any number (CLAUDE.md's mandatory review):** the
exact lookahead-lag bug class that hit `motif_touch.py` (a pivot isn't
knowable until `pivot_n` bars pass after it) does NOT apply here by
construction, not by luck — every candidate consolidation window re-slices
`bars` and re-runs `pivot_highs`/`pivot_lows` on just that slice, so a
window's last pivot is always at least `consol_pivot_n` bars before the
window's own end. A regression test
(`test_causal_ordering_invariant_on_all_synthetic_scenarios`) and the
real-data smoke test both assert `pole_start_idx < pole_end_idx <
consol_end_idx < confirm_idx` on every instance found, on synthetic AND real
GBPJPY bars. 8/8 offline tests pass (`pylego/flag_pennant_test.py`) —
hand-verified bull-flag, bull-pennant, failed-breakout, mirrored-bear-flag,
no-consolidation, and no-pole cases, each cross-checked against the
already-tested `pivot_highs`/`pivot_lows` bricks (printed intermediate pivot
lists, confirmed by eye) before being baked into an assertion. A real-data
spot-check on GBPJPY (one instance's actual OHLC path, printed and read: a
clean 108-pip pole idx47→60, a 43-bar consolidation retracing 33.5%, a
confirmed continuation breakout) confirmed plausible geometry before any
aggregate number was trusted.

**Result: null, and it stayed null under every variant tried — reporting
that plainly, not softening it.** Full 26-pair sweep (H1, the JS engine's
untouched default params — not tuned on this data, sl=20p, tp_r=1.5, cost
on): **6/26 pairs (23.1%) signal PF>1.0, 9/26 (34.6%) beat the mechanical
baseline.** Named losers (20/26): audcad, audchf, audjpy, audnzd, audusd,
chfjpy, euraud, eurcad, eurchf, eurgbp, eurnzd, eurusd, gbpaud, gbpchf,
gbpjpy, nzdjpy, nzdusd, usdcad, usdchf, usdjpy. Winners: cadjpy (1.01),
eurjpy (1.09), gbpcad (1.02), gbpnzd (1.19), gbpusd (1.02), gold (1.06) — no
consistent direction or currency-block pattern, reading like the scatter a
true-null baseline produces, not a real edge concentrated somewhere.

Pooled calendar IS/OOS split (cutoff 2023-01-01, all 26 pairs, same cell):

| | n | PF | WR | avg R |
|---|---:|---:|---:|---:|
| IS (pre-2023, cost on) | 11,721 | 0.94 | 40.2% | -0.039 |
| OOS (2023+, cost on) | 5,362 | 0.92 | 39.6% | -0.052 |
| OOS (2023+, cost OFF) | 5,362 | 0.98 | 39.6% | -0.010 |

Both sides sit at or below the coin-flip baseline — this isn't decay from a
strong in-sample fit (the signature an overfit result leaves), it's flat
null throughout. Cost-off does NOT rescue it (IS 1.00, OOS 0.98 — dead flat
even with zero spread), ruling out "it's a real edge too small to survive
transaction costs." A second grid cell (tp_r=1.0, cost on) tells the same
story: 8/26 (30.8%) PF>1.0, IS PF=0.93, OOS PF=0.94. And filtering entries
down to ONLY the pole's textbook-expected continuation direction
(`played_out=True`, discarding every "failed flag" entry — a genuinely
different entry rule, not more tuning of the same one) still doesn't rescue
it: pooled, sl=20p tp_r=1.5 cost on, n=9,503, PF=0.95, WR=40.5%.

Four independent checks (raw signal, cost stripped out, a second tp_r cell,
the played-out-only filter) all converging on the same flat-to-negative
number is itself evidence this is a real null, not a fragile artifact of one
setting choice.

**A fifth check, added after the owner asked why widely-used retail patterns
would show no edge here:** every check above used a FIXED 20-pip stop for
every instance, regardless of the pattern's own size — not how flags/
pennants are actually traded. The textbook rule sizes the stop and target
off the pattern's OWN measured move (the pole's height): target = 1.0x the
pole height projected from the breakout, stop = 0.5x the pole height
against it (`js/patternEngine.js`'s own `computeOutcome` defaults,
`stopFrac=0.5`, i.e. tp_r=2.0 but with a stop that scales per instance
instead of a flat 20 pips). Raced every eligible instance through its own
pattern-derived stop (real distribution: median 39.3 pips, p10-p90
19.0-82.3 pips — genuinely proportional to each pattern's size, not a
repeat of the fixed-stop test): pooled across 26 pairs, n=17,083, **PF=0.96,
WR=33.3%, avg_R=-0.026 — still null.** This rules out "the fixed stop killed
a real edge" specifically.

**A sixth and seventh check, testing the EXACT mechanics of a specific
retail reference image the owner supplied** (breakout → retest of the
broken trendline → continuation to a measured-move target, plus a second
image showing the flag as a "corrective wave" pause inside an established
"impulsive wave" trend) — neither mechanic was tested above, and both are
genuinely different entry rules, not more tuning of the same one:

- **Retest entry**: instead of entering on the breakout bar itself, wait up
  to 20 bars for price to pull back and touch the broken trendline (within
  an ATR-scaled tolerance) and close back on the confirmed side — the
  textbook "don't chase the breakout, wait for the retest" rule. 57.1% of
  eligible instances (9,724/17,032) retested within the window; the rest
  ran away without ever pulling back. Same measured-move stop/target as
  above, entries only on the confirmed retest bar: **n=9,724, PF=0.97,
  WR=33.5%, avg_R=-0.021 — still null.**
- **Trend-context filter**: using `classify_swing_structure` (already-built,
  already-tested), only counted a flag as valid if its pole continued an
  ALREADY-established HH+HL or LH+LL trend (the "impulsive wave, flag =
  corrective wave" framing) rather than breaking out of a range. Split the
  retest-entry trades by this filter: trend-aligned n=2,470 PF=0.95 vs.
  not-trend-aligned n=7,254 PF=0.97 — the trend-aligned subset was
  marginally WORSE, not better, so requiring this context doesn't rescue it
  either.

Four honest variants of "trade the flag/pennant breakout direction" now
tested — fixed stop, measured-move stop/target, measured-move + retest
entry, measured-move + retest + trend-context filter — all null, all on
real 26-pair FX+gold data, real costs, real barrier walks. What remains
genuinely untested, not proven null: other timeframes (the reference images
specifically showed H4 and H8 — everything here is H1 only), other asset
classes (one reference image was Bitcoin — outside this repo's FX+gold
universe), and the fully discretionary/fuzzy pattern recognition a human
eye applies that a rigid geometric-threshold detector cannot replicate.

**Per CLAUDE.md's "Pivot or Pivot" rule**, since a bug audit didn't turn up
anything to explain it: flags/pennants, on H1, with the untouched JS-default
geometry thresholds, show no real edge. The brick (`flag_pennant.py`) stays
— pure, tested, and reusable regardless of this result, same as
`shape_match.py`/`analog_signal.py` stayed after the k-NN method's null. The
honest next move for the broader "shape prediction" ask is NOT tuning this
method's thresholds further (the exact lesson the k-NN method's retirement
already taught — see the banner at the top of this file) but one of two
genuinely different angles, neither pre-decided here: a different shape
family (head & shoulders / triangles-channels are next in
`js/patternEngine.js`, both already geometrically defined and completely
untried), or a different timeframe (every AnalogML detector built so far,
touches included, has only ever been tested on H1 — flags/pennants may
behave differently on H4/D1; genuinely untested, not a prediction either
way).

## Lifecycle disaggregation — does touch/bounce count predict the outcome?

The owner's fuller shape-prediction ask wants every shape's DURING-formation
quality analyzed against its own AFTER-outcome, not just a pooled average —
specifically: does the NUMBER of touches/bounces predict breakout direction
or magnitude? `pylego/pattern_lifecycle.py` (new) regenerates
`js/patternEngine.js`'s `compute_acceptance`/`compute_confidence` as a
shared brick any detector can plug into (does a breakout hold, and a 0-100
formation-quality score blending each detector's own geometry sub-scores
with volatility-compression-during-formation and breakout strength) — built
as Tier-1 infrastructure so future detectors (head & shoulders,
triangles/wedges/channels) get this scoring for free instead of each
carrying a copy. Not yet wired into `flag_pennant.py`/`motif_touch.py`'s own
output (both would need `raw_scores` fields added first).

Then the specific cross-tab was run directly, pooled across all 26 pairs,
for both existing detectors (touches, flags/pennants): touch-count,
formation duration, and formation volatility (bar range vs local ATR)
against real R-outcome via `pylego.barrier_race` (sl=20p, tp_r=1.5, cost on
— same frozen grid every AnalogML check uses).

**Touches: a real, IS/OOS-confirmed finding — the edge concentrates in
doubles, not triples.**

| n_touches | n (pooled) | PF | avg R |
|---|---:|---:|---:|
| 2 (double top/bottom) | 21,623 | 1.24 | 0.133 |
| 3 (triple top/bottom) | 6,800 | 0.98 | -0.011 |

Checked against a genuine calendar IS/OOS split (cutoff 2023-01-01, not
just the pooled full-history number — the standout cell, so it earned the
extra check):

| n_touches | split | n | PF | avg R |
|---|---|---:|---:|---:|
| 2 | IS (pre-2023) | 14,646 | 1.25 | 0.135 |
| 2 | OOS (2023+) | 6,977 | 1.23 | 0.130 |
| 3 | IS (pre-2023) | 4,594 | 1.00 | -0.003 |
| 3 | OOS (2023+) | 2,206 | 0.95 | -0.029 |

Minimal IS→OOS decay on doubles, well past the ≥30-OOS-trade bar, and
triples stay flat-to-negative on both sides — this is not a
subset-mining artifact, it survives the exact falsification test CLAUDE.md
asks for ("survivors must beat chance AND be IS-consistent"). This
sharpens, doesn't overturn, the touches motif's existing "promising, not
yet validated" status from the section above — the portfolio-level test and
a second full bug-hunt pass it was already missing are still missing — but
it's a real, useful refinement that `motif_track.py`'s existing
per-(n_touches, is_top)-category confidence design already anticipated,
even though this is the first time the pooled cross-pair number was
actually computed and checked OOS.

**Also checked, exploratory only, NOT yet run against a calendar split —
flagging as leads, not results** (CLAUDE.md's multiple-testing rule: roughly
20 cells were sliced across both families this pass, so a couple of
standouts by chance alone would not be surprising; these two are noted
because they're large-n and monotonic, not because they're proven):
shorter-duration touch formations (15-27 bars, PF=1.30) outperform longer
ones (41-127 bars, PF=1.03); formation volatility (candle range vs local
ATR) showed no meaningful effect on touches (PF 1.15/1.18/1.19 across
terciles — flat).

**Flags/pennants: slicing did not rescue the null.** Touch-count buckets
from 5 (the minimum) through 9 stay in the same 0.91-1.00 PF band the
pooled null already showed (real sample sizes, n=532-11,096); buckets above
9 touches get too sparse to trust (n<40 — one cell is literally n=8 showing
PF=0.20, noise not signal, named here so it isn't mistaken for something
real later). Duration and formation-volatility terciles were flat (PF
0.92-0.94 throughout). Retrace depth showed a mild monotonic lean (shallow
retrace PF=0.89 → deep retrace PF=0.97) but every cell stayed below 1.0 — a
lead worth checking if this family is ever revisited, not a rescue of the
current null.

## `head_shoulders_scan.py` / `triangle_channel_scan.py` — two more families, both null

The second and third additional shape families beyond touches (flags/
pennants was the first). Both regenerated from already-validated
`js/patternEngine.js` specs — `detectHeadShoulders` and
`detectTrianglesChannels` — completing every named pattern in the owner's
retail reference image except cup & handle, which has no existing spec
anywhere in this repo (flagged to the owner rather than invented from
scratch). `pylego/trendline.py` (new) extracted the shared `line_at`/
`line_touches` trendline-fitting math once a second detector needed the
identical formula `flag_pennant.py` already had privately; `AnalogML/
pattern_sweep.py` (new) extracted the shared 26-pair-sweep-plus-IS/OOS
harness for the same reason — every AnalogML detector instance already
shares the same `confirm_idx`/`direction` fields, so the sweep needs no
per-detector adapter.

```
python AnalogML/head_shoulders_scan.py --pair gbpjpy --timeframe 1h --eval-years 3
python AnalogML/triangle_channel_scan.py --pair gbpjpy --timeframe 1h --eval-years 3
```

### Head & shoulders: a real lookahead bug, caught before any number was trusted

Regenerating `detect_head_shoulders`, the left/head/right shoulder triple
(L, H, R) comes from a single global `pivot_highs`/`pivot_lows(bars,
pivot_n)` call over the WHOLE array — unlike `flag_pennant`/
`triangle_channel`, which re-slice-then-detect pivots inside a window and
get the pivot-confirmability lag for free, this is the EXACT construction
that caused `motif_touch.py`'s original lookahead bug. R isn't actually
knowable as a genuine pivot until `pivot_n` bars have passed after it
(pivot detection needs a centered window) — scanning for confirmation
starting at `R.idx+1` credited signals a live system couldn't have had yet.

**Measured directly, not estimated** — diffed the buggy vs fixed confirm
scan on real data: 92/225 GBPJPY instances (40.9%) had a different
`confirm_idx`/direction after the fix; pooled across 5 pairs, 487/1,144
(42.6%) — bigger than `motif_touch`'s 15.3%. Fixed the same way (`R.idx +
pivot_n` instead of `R.idx + 1`), with a regression test that proves the
fix actually SKIPS a premature one-bar-early confirmation and resolves one
bar later, not just that the final invariant holds:

| | pairs PF>1.0 | beat baseline | IS PF | OOS PF |
|---|---:|---:|---:|---:|
| **Before fix** (bug present) | 21/26 (80.8%) | 24/26 (92.3%) | 1.13 | 1.14 |
| **After fix** (correct) | 8/26 (30.8%) | 13/26 (50.0%) | 0.98 | 0.95 |

The unfixed number looked like a strong, clean edge — better than touches'
own first read. It was **entirely the bug**, the same shape of false
positive the k-NN method's self-adjacency bug produced (see the banner at
the top of this file). Cost-off gives the same story (IS PF=1.06, OOS
PF=1.01 — flat, not rescued by removing costs). **Head & shoulders, H1,
these params: null**, stated as plainly as any positive result would be.

### Triangles/wedges/channels: null from the first sweep, no bug found

Checked explicitly for the same lookahead-lag bug class rather than
assuming immunity because `flag_pennant` had none — `triangle_channel`'s
construction (fixed-size sliding window, pivots re-detected fresh inside
each window) gets the confirmability lag for free by the same reasoning as
`flag_pennant`, confirmed, not assumed.

Full 26-pair sweep (sl=20p, tp_r=1.5, cost on): 7/26 pairs (26.9%) PF>1.0,
13/26 (50.0%) beat the mechanical baseline; pooled calendar IS/OOS (cutoff
2023-01-01): IS PF=0.97 → OOS PF=0.90.

Disaggregated by shape type before accepting the pooled null (CLAUDE.md:
"pooled nulls hide subset edges — disaggregate before declaring null"),
pooled across 26 pairs, sl=20p tp_r=1.5 cost on:

| shape_type | n | PF | avg R |
|---|---:|---:|---:|
| symmetrical_triangle | 212 | 1.07 | 0.043 |
| channel_up | 2,681 | 0.98 | -0.015 |
| ascending_triangle | 836 | 0.97 | -0.016 |
| channel_down | 2,467 | 0.96 | -0.027 |
| descending_triangle | 801 | 0.92 | -0.050 |
| falling_wedge | 832 | 0.89 | -0.073 |
| rising_wedge | 936 | 0.87 | -0.086 |

No hidden winner. `symmetrical_triangle`'s mild positive read is the
smallest sample (n=212) and the one type with no directional expectation to
begin with (a symmetrical triangle's "signal" is just whichever way it
broke, not a textbook-direction call the way the other six are) — not a
coherent edge to lead with. **Triangles/wedges/channels, H1, all seven
types: null.**

Real-data spot-checks before trusting either aggregate: `head_shoulders`'s
one inspected GBPJPY instance was internally consistent (the failed
pattern's `breakout_level` exactly matched its own right-shoulder price, as
the formula requires for a failure case); `triangle_channel`'s smoke test
found all 7 shape types represented on real data (none degenerate/zero),
plus a manual OHLC read of one ascending-triangle instance — a genuine
range-bound consolidation with a rising lower support that, in this case,
failed to break up as expected (a legitimate real outcome, not every
instance should succeed).

**Where this leaves the shape-family scoreboard:** touches remains the
only family with a real (not yet portfolio-validated) positive first read.
Flags/pennants, head & shoulders, and triangles/wedges/channels are all
null. That is three real nulls out of four families tried — reported as
plainly as touches' positive read was, per CLAUDE.md's "report the red
honestly" rule. Cup & handle is the one image pattern with no existing
spec; multi-timeframe analysis (does agreement/conflict across M15/H1/H4/D1
change any of these results) remains completely untried — everything above
is H1-only.

## Honesty notes (read before trusting a number here)

- **Neighbour pool contained one trivial near-duplicate until 2026-08-12 —
  every number above this line predates the fix.** `find_analogs`'s
  `min_gap_bars` dedup only checked new candidates against already-chosen
  neighbours, never against the query's own position. Result: the single
  CLOSEST "neighbour" in the k=20 pool was routinely the window ending
  literally one bar before the query (63/64 bars of overlap) — not an
  independent historical repeat, just the query nearly matching itself.
  Confirmed on real EURUSD 1h data (a mid-history query at bar 40000 pulled
  in a neighbour at bar 39999). Found while building the pair-card "closest
  historical analogs" table (exposing per-neighbour dates made it visible;
  the aggregate consensus alone hid it). Fixed in `pylego/shape_match.py`'s
  `find_analogs` by seeding the gap-check with `exclude_after` (the query's
  own end index) — see its docstring. This affects EVERY consensus call
  throughout this file (`pattern_scan.py`, `pattern_scan_sweep.py`,
  `ml_walkforward.py`'s `--with-analog`, `backtest_export.py`'s committed
  19,782-trade log, `portfolio_sim.py`), not just the live diagnostic —
  1-of-20 neighbours contaminated per call, present whenever the query had
  forward runway (i.e. most non-tail calls). **Re-measured 2026-08-12 — the
  effect was NOT negligible.** Full re-validation (4-pair sweep, full 26-pair
  sweep, portfolio sim, full backtest export, `ml_walkforward --with-analog`
  ablation) all completed; see the banner at the top of this file for the
  corrected numbers. Every previously-reported positive result in this file
  was almost entirely this bug, not real shape repeatability — the method
  (fixed-window k-NN shape matching, these frozen params) shows no
  real edge post-fix. Kept building on it further (adaptive per-cluster
  SL/TP) was explicitly NOT started once this became clear — see
  `LEGO_MODULES.md` for the scoped structural-motif alternative being
  considered instead.
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
