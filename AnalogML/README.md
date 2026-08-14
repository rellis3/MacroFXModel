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


## Flags/pennants on H4 — same null, but a real timeframe-scaling trap caught first

Every check above was H1. The owner's reference images specifically showed
H4/H8, so tested `flag_scan.py --timeframe 4h` the same way — same frozen
params, only the bar timeframe changes (`pattern_scan.load_bars` resamples
the same M1 parquet to whatever timeframe is asked for).

**First read looked like real signal, and would have been reported as one
if not checked further:** full 26-pair sweep, fixed sl=20p tp_r=1.5 cost on:
20/26 pairs (76.9%) signal PF>1.0, pooled IS PF=1.10 → OOS PF=1.07. But the
MECHANICAL BASELINE was elevated too (gbpjpy baseline alone: PF=1.23 with
zero directional signal at all) — only 15/26 pairs (57.7%) actually beat
that baseline, barely above the 50% coin-flip floor. **The cause: a flat
20-pip stop is a much tighter risk unit relative to an H4 bar's typical
range than an H1 bar's** — tight stops get touched fast in both directions,
but confirm-bar momentum carries price past them often enough that BOTH
signal and baseline look artificially good. This is exactly the
timeframe-normalization problem the owner's original ask named directly
("MAE/TP need to be normalized... so this shape on H4 and the same shape on
M15 are comparable, not both expressed in raw pips") — caught here as a live
example of why that requirement exists, not just a design nicety.

Stripped the artifact out with the same measured-move stop/target used for
the H1 checks (0.5x/1.0x the pole's own height — proportional to the
pattern, not a fixed pip count, so it scales correctly across timeframes by
construction):

| | n | PF | WR | avg R |
|---|---:|---:|---:|---:|
| SIGNAL (measured-move) | 4,337 | 1.02 | 34.4% | 0.016 |
| BASELINE (measured-move) | 8,674 | 1.00 | 33.9% | 0.002 |
| SIGNAL, IS (pre-2023) | 2,980 | 1.02 | 34.2% | 0.010 |
| SIGNAL, OOS (2023+) | 1,357 | 1.04 | 34.8% | 0.028 |

Flat on both sides of a real calendar split, both well past the ≥30-OOS-trade
bar. **Flags/pennants on H4: also null, same conclusion as H1**, once tested
with a risk unit that doesn't silently favor one timeframe's bar geometry
over another. H8 and Bitcoin (the other specifics in the owner's reference
images) remain untested — this repo's data is FX+gold only.


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

**Genuine walk-forward split, replacing the single-cutoff read (2026-08-12,
`AnalogML/motif_walkforward.py`):** the earlier "IS PF=1.18 → OOS PF=1.16"
table above was ONE fixed 2023-01-01 boundary — a single train/test split,
not a walk-forward. It can hide a signal that's actually inconsistent
underneath one lucky (or unlucky) cut. This script buckets every eligible
motif into **11 consecutive calendar-YEAR folds (2016–2026)** instead, and
grades each independently. Pooled across all 26 pairs:

| fold | n | signal PF (cost on) | signal PF (no cost) | avg R | baseline PF |
|---|---:|---:|---:|---:|---:|
| 2016 | 2,648 | 1.23 | 1.31 | +0.125 | 1.00 |
| 2017 | 2,771 | 1.25 | 1.34 | +0.138 | 1.00 |
| 2018 | 2,867 | 1.13 | 1.21 | +0.073 | 0.96 |
| 2019 | 2,770 | 1.19 | 1.28 | +0.107 | 0.95 |
| 2020 | 2,740 | 1.26 | 1.35 | +0.143 | 0.98 |
| 2021 | 2,774 | 1.12 | 1.20 | +0.071 | 0.93 |
| 2022 | 2,670 | 1.10 | 1.17 | +0.056 | 0.91 |
| 2023 | 2,641 | 1.23 | 1.32 | +0.129 | 0.97 |
| 2024 | 2,726 | 1.22 | 1.31 | +0.125 | 0.95 |
| 2025 | 2,809 | 1.04 | 1.12 | +0.026 | 0.90 |
| 2026 (partial) | 1,007 | 1.15 | 1.23 | +0.084 | 0.96 |

**11/11 folds PF>1.0 (cost on), 11/11 beat the mechanical baseline** — the
signature of a real, fold-consistent edge rather than a lucky single split.
2025 is the weakest year (PF 1.04) but still positive.

**Explicit cost sensitivity (all 11 folds pooled, per the direct ask —
costs are on by default, but stated side by side here rather than left
implicit):** n=28,423 trades, **PF cost-ON=1.174, PF cost-OFF=1.259** — costs
remove 0.085 PF (avg R +0.140 → +0.098). A real, measurable drag; the edge
clearly survives it.

**Portfolio-level test (2026-08-12, `AnalogML/motif_portfolio_sim.py`,
same method `portfolio_sim.py` used for the retired k-NN signal — reused,
not rewritten):** 26 pairs, 1%/trade risk, 5% max concurrent risk, 17,858 of
28,423 signals taken (10,565 skipped by the risk cap). **Sharpe 1.61, max DD
−55.1%, avg pairwise weekly-return correlation +0.012** (near-independent
bets — the reason a 26-pair book doesn't just re-concentrate into a handful
of effective EUR/GBP/JPY-leg bets). Matched-utilization benchmark (single
pairs scaled to the portfolio's own 2.7% average capital utilization, so the
comparison isn't confounded by the portfolio simply deploying more capital):
**2 of the 3 sampled single pairs (audcad, audjpy) hit −100% max drawdown
(total ruin) at that utilization; the portfolio drew down only −55.1% at the
same utilization.** That gap is the real diversification effect. (Raw
compounded total-return figures from this sim run into the millions of
percent over 17,858 trades at fixed-fractional sizing — a known artifact of
compounding at a % of ever-growing equity with no realism cap on trade size
or market impact, not a claim about achievable real-world returns. Sharpe /
max DD / utilization are the metrics to read here, not total return.)

**The 6 pairs flagged negative in the original single-split 26-pair sweep**
(eurgbp, gbpchf, audcad, usdcad, gbpcad, euraud) — investigated rather than
ignored, per-pair year-by-year via `motif_walkforward.py --pair <pair>`:
- **No detector malfunction.** Played-out rate (52–56%), touch-count mix
  (73–78% double vs triple), top/bottom split (~50/50) are statistically
  indistinguishable from the positive pairs — the touch-motif detector isn't
  behaving differently on these six.
- **Spread-cost burden is unremarkable** (spread/ATR 4–9%, in line with
  several positive pairs) **except eurgbp**, whose spread/ATR (12.6%) is
  meaningfully higher than the rest of the universe — a plausible partial
  explanation for eurgbp specifically, not for the other five.
- **All six track the SAME broad shape as the full 26-pair pool**: strong
  2016–2020, softer 2021–2023, real decay into 2024–2025 (the pooled-26 table
  above shows 2025 as its weakest year too, PF=1.04) — these six just
  happened to land fractionally below 1.0 in that soft stretch on ~100
  trades/pair/year, which is within noise for a PF swing between 0.85 and
  1.15 at that sample size.
- **Most-recent-fold (2026) picture is mixed, not uniformly bad**: euraud
  (0.99), gbpcad (0.98), eurgbp (0.94) are now essentially breakeven;
  **gbpchf has flipped clearly positive (1.40)**; **audcad (0.58) and usdcad
  (0.70) remain the two genuine standouts worth continued monitoring** —
  persistently weak into 2026, not just a historical pooled artifact.
- Read plainly: this looks like normal cross-sectional noise around a shared
  weak 2024–2025 macro backdrop, not six structurally broken pairs — with
  audcad/usdcad as the two to keep an eye on.

**Phase 1: adaptive per-category MAE/MFE-based SL/TP (2026-08-12,
`AnalogML/motif_adaptive.py`)** — the piece of the ORIGINAL brief ("MAE-based
stop loss based on all the historic trades of this shape, TP set based on
historic breakout trades... not on price but on average movement size scaled
to timeframe") that was deliberately deferred until the detector proved it
had something real to size risk around. It just did (11/11-fold walk-forward
+ portfolio test above), so this replaces the frozen sl=20p/tp_r=1.5 grid
with per-category (n_touches × is_top) SL/TP derived from that category's
own historical max-adverse/max-favourable excursion (`pylego.barrier_race`'s
new `excursion`/`VariableEntry`/`race_trades_variable`), scaled to that
trade's own entry-time ATR — dimensionless, cross-pair-comparable, "scaled to
timeframe" not raw price. Sized causally: only from same-category precedent
strictly BEFORE that trade's confirm time, pooled across all 26 pairs
(`motif_walkforward.py`'s per-pair diagnosis found no detector-level
difference across pairs), expanding window, never the future.

**A real bug found on the first attempt, before trusting anything:** sizing
the MAE/MFE window off the full 200-bar race horizon produced absurd ~11x-ATR
(~220-pip) stops that diluted almost every trade into a mark-to-close
timeout — adaptive avgR +0.006 vs the frozen grid's +0.110 on a 2-pair
smoke test, a clean null. Root cause: that horizon mostly measures drift
unrelated to the breakout thesis. Fixed by bounding the excursion window to
`--excursion-bars` (default 40, the breakout confirmation horizon), not the
full race horizon. A small percentile sweep (6 cells, same 2 pairs) then
found SL/TP both at the 50th percentile clearly ahead of the other cells —
chosen post-hoc from that sweep, so it meant nothing until it cleared the
full universe.

**Full 26-pair result, SAME 28,223 motifs raced both ways (adaptive vs the
already-validated frozen grid), calendar-year folds:**

| | n | PF | avg R |
|---|---:|---:|---:|
| Adaptive (SL/TP p50, all folds pooled) | 28,223 | 1.227 | +0.115 |
| Frozen grid (sl=20p, tp_r=1.5, same motifs) | 28,223 | 1.174 | +0.098 |

A real, positive improvement in the pooled numbers (+17% relative avg R) —
but **fold consistency is 6/11, not 11/11** — weaker than the entry
signal's own walk-forward. The improvement is concentrated in a few standout
years (2018 +0.066R, 2020 +0.033R, 2022 +0.049R, 2025 +0.086R) while several
folds are flat-to-slightly-worse (2017 −0.017R, 2019 −0.020R, 2023 −0.039R,
2024 −0.014R, 2026 −0.008R). Read this as **a real but modest win, not a
decisive one** — the honest read, not the sold one.

Per-category sizing (median, all pairs pooled) is now sane, unlike the
buggy first attempt: 2-touch categories get a favourable ~1.3:1 reward:risk
(SL≈36–37p/2.3xATR, TP≈49p/3.1xATR); 3-touch categories come out closer to
1:1 (SL≈41–45p/2.7–2.8xATR, TP≈42–43p/2.7xATR) — a real structural
difference between 2- and 3-touch motifs, not noise, and independent
confirmation that touch-count is a meaningful axis (matching the original
"3rd touch" intuition).

**Portfolio-level test (2026-08-13, `AnalogML/motif_adaptive_portfolio_sim.py`,
reusing `portfolio_sim.py`'s account simulator verbatim, same 28,223 motifs
raced both ways):** a 3-pair smoke test looked like a clean win (adaptive
Sharpe 1.68 vs frozen 1.31, max DD −18.8% vs −26.3%, adaptive using MORE
capital not less) — **the full 26-pair confirmation walked that back.**

| | n taken | Sharpe | max DD | avg utilization |
|---|---:|---:|---:|---:|
| Adaptive sizing | 11,829 | 1.86 | −68.6% | 3.6% |
| Frozen grid (same motifs) | 17,688 | 1.58 | −54.5% | 2.7% |

Sharpe genuinely improves (1.86 vs 1.58) — but **max drawdown is materially
WORSE, not better** (−68.6% vs −54.5%), at higher capital utilization.
Adaptive trades typically run wider SL/TP (36–49p vs the frozen 20p/30p),
hold longer, overlap more, and hit the 5% concurrent-risk cap far more often
(16,394/28,223 signals skipped vs 10,535/28,223) — fewer trades taken, more
risk concentrated in the ones that fit. **This is a real trade-off, not a
decisive win**: higher risk-adjusted return, but a materially deeper real
drawdown — the opposite of the encouraging small-sample read. The
diversification effect itself still holds regardless of sizing method
(matched-utilization single pairs: audcad −99.9% max DD, audchf −88.6%,
audjpy −86.9%, all worse than either portfolio) — the portfolio structure is
doing real work, but adaptive sizing is not an unambiguous upgrade over the
frozen grid at the account level, only at the isolated trade level.

**Percentile ablation, resolving the drawdown cost (2026-08-13) — DEFAULT
CHANGED to (35, 35).** An 8-pair sample swept (sl_pctile, tp_pctile) ∈
{(50,50), (25,25), (35,35), (25,50), (35,50)} at the PORTFOLIO level (the
level that actually showed the problem). (35,35) stood out clearly — higher
Sharpe than every other cell tried, AND at capital utilization matched
almost exactly to the frozen grid (no capital-deployment confound). Full
26-pair confirmation, same 28,223 motifs:

| | Sharpe | max DD | avg utilization |
|---|---:|---:|---:|
| Adaptive (35, 35) | **2.31** | **−41.8%** | 2.7% |
| Frozen grid (same motifs) | 1.58 | −54.5% | 2.7% |

At MATCHED utilization (2.7% both), adaptive (35,35) now beats the frozen
grid on BOTH Sharpe and max DD — no trade-off, unlike (50,50)'s Sharpe-for-
drawdown swap. Trade level barely moves (PF 1.212/avg R +0.110 vs (50,50)'s
1.227/+0.115 — a wash) but fold consistency IMPROVES (8/11 vs 6/11).
**(35, 35) is now the default in both `motif_adaptive.py` and
`motif_adaptive_portfolio_sim.py`** — a materially tighter, more robust
choice than the original (75, 50) or the trade-level-only-chosen (50, 50).

**True multi-timeframe agreement analysis (2026-08-13,
`AnalogML/motif_multi_tf.py`)** — a question open since the original scoping
conversation ("if higher timeframes have a bullish pennant and lower
timeframes have bearish, what happens") and confirmed absent everywhere:
`js/patternEngine.js`'s `annotateHtfAlignment` only checks a single
next-higher timeframe, stores a boolean, never aggregates it into any stat;
nothing in `motif_touch.py`/`motif_scan.py`/`motif_walkforward.py` looks at
any timeframe but its own. Detects the SAME touch-motif on H1 (base) and
independently on 4H and 1D, buckets each H1 entry by whether the most
recently CONFIRMED HTF motif (known by that H1 entry's own confirm time,
within a lookback window) agrees, conflicts, or is absent. **A real
lookahead bug caught before running anything**: a resampled bar is labeled
by its START, so cutting off against that timestamp directly could let a
still-forming HTF bar's high/low/close leak into a decision made mid-bar —
fixed by deriving each HTF bar's actual END time (start + the index's own
regular bar spacing) and cutting off against that instead.

**A real reversal between the small and full sample — a good example of why
the sweep ladder exists.** 2-pair smoke test suggested 4H mattered (AGREE
PF=1.29 vs CONFLICT PF=1.19, 7/11 folds) and 1D didn't (PF=1.20 vs 1.25,
reversed, only 4/11 folds). **The full 26-pair confirmation found the
OPPOSITE:**

| HTF | bucket | n | PF | avg R |
|---|---|---:|---:|---:|
| 4H | AGREE | 3,605 | 1.19 | +0.105 |
| 4H | CONFLICT | 3,172 | 1.18 | +0.100 |
| 1D | AGREE | 4,232 | **1.24** | **+0.133** |
| 1D | CONFLICT | 4,168 | **1.09** | **+0.055** |

**4H shows no meaningful separation** (PF 1.19 vs 1.18, a wash) — the
2-pair read was noise. **1D shows a real, sizeable gap**: when the daily
motif conflicts with the H1 signal, avg R drops to less than half of when
it agrees (+0.055 vs +0.133), fold-consistent in 7/11 years. CONFLICT trades
stay net positive (not reversed to a loser) — this reads as "daily HTF
agreement adds real conviction, daily HTF conflict is a real reason to
size down or skip," not "daily HTF conflict flips the trade." The largest
bucket by far in both splits is NONE (no HTF motif confirmed recently
enough — ~76% of entries at 4H, ~70% at 1D) — most of the time there's
simply no fresh HTF read available, a real constraint on how often this
filter could apply live, not a flaw in the method.

**HTF-conflict-aware position sizing (2026-08-13,
`AnalogML/motif_htf_sized.py`)** — the natural integration of the 1D finding
above: keep every trade (CONFLICT stays net positive, a hard skip would
throw away real expectancy), just risk LESS on the ones an independent read
already flags as lower-conviction. Deliberately isolates ONE new variable
(position sizing) on top of the ALREADY-VALIDATED frozen-grid entry signal —
not stacked on the not-fully-vetted adaptive SL/TP, so the two ideas don't
get confounded. `pylego.barrier_race`'s sibling, `portfolio_sim.py`'s
`simulate_portfolio`, now reads an optional per-trade `size_mult` (default
1.0, every existing caller unaffected) — 0.5× on a 1D conflict, 1.0×
otherwise (deliberately NOT sized UP on agreement — that's a separate,
unvalidated claim `motif_multi_tf.py` didn't test).

A 3-pair smoke test looked like a wash (Sharpe 1.26 vs 1.32 uniform-sized,
roughly flat) — **the full 26-pair confirmation found a real win**, same
28,423 motifs, 4,168 (14.7%) downsized:

| | Sharpe | max DD | avg utilization |
|---|---:|---:|---:|
| HTF-sized (0.5× on 1D conflict) | **1.80** | **−42.9%** | 2.6% |
| Uniform sizing (same motifs) | 1.61 | −55.1% | 2.7% |

At essentially matched utilization, sizing down on a real, already-validated
conflict signal improves BOTH Sharpe and max DD — a clean, if modest,
portfolio-level win from position sizing alone, no change to entry
selection or SL/TP at all. The 3-pair "wash" was another reminder not to
trust a small sample after a null OR a positive read — this is now the 4th
time in this build a small-sample first look was overturned at 26-pair
scale (the excursion-window bug, the 4H/1D reversal, the (50,50)-vs-(35,35)
drawdown finding, and now this).

Not yet done: an in-progress/provisional HTF read (matching
`motif_track.py`'s live "what's forming" diagnostic, rather than only
counting already-CONFIRMED HTF motifs), and testing the adaptive SL/TP
sizing (35,35) COMBINED with HTF-conflict sizing together — deliberately not
done together yet, to keep this build's discipline of one new variable at a
time.

**The combination test (2026-08-14,
`AnalogML/motif_combined_portfolio_sim.py`)** — the deferred item above,
now done: adaptive (35,35) SL/TP and HTF-conflict sizing stacked in one
portfolio. A pure composition layer — imports
`motif_adaptive.collect_pair_motifs`, `motif_multi_tf.htf_lean_at`, and the
shared `simulate_portfolio` verbatim, modifies neither parent — racing the
SAME motif set through the full 2x2 so each delta isolates exactly one
mechanism. **Full 26-pair run (28,223 motifs identical on all four arms,
4,165 / 14.8% downsized on 1D conflict):**

| arm | Sharpe | max DD | avg util |
|---|---:|---:|---:|
| FROZEN + UNIFORM (baseline) | 1.58 | −54.5% | 2.7% |
| FROZEN + HTF-SIZED | 1.79 | −42.9% | 2.6% |
| ADAPTIVE + UNIFORM | 2.31 | −41.8% | 2.7% |
| ADAPTIVE + HTF-SIZED (the combination) | **2.45** | **−38.7%** | 2.6% |

**The gains stack.** The combination beats the best single mechanism on
BOTH Sharpe (2.45 vs 2.31) and max DD (−38.7% vs −41.8%) at matched
utilization — consistent with the two mechanisms being genuinely
orthogonal (one reshapes exit geometry per category, the other scales risk
on an independent 1D read). Three sanity checks came free: each single-
mechanism arm reproduces its parent's separately-computed result almost
exactly (1.58 vs `motif_portfolio_sim.py`'s 1.61 on a slightly different
set; 1.79/−42.9% vs `motif_htf_sized.py`'s 1.80/−42.9%; 2.31/−41.8%
matching `motif_adaptive_portfolio_sim.py`), so the composition is faithful,
not a re-implementation that could drift. And — for the FIFTH time in this
build — the 3-pair smoke test read the opposite ("no stack": adaptive 1.38
vs combined 1.37 on eurusd/gbpjpy/audusd); the full 26-pair scale overturned
it. Total-return figures are ignored on purpose: 1%-of-equity compounding
over ~20k trades produces absurd absolute numbers under mark-to-close;
Sharpe/DD at matched utilization are the comparison that means anything.
Still NOT a validated go-live change: same mark-to-close/no-spread-variation
caveats as every `portfolio_sim.py` caller, and the combination inherits
both parents' own open caveats (one percentile cell tested; conflict-side
only). The tracked live signal (`motif_track.py`) still records the frozen
grid unchanged — this result informs the manual-execution sizing notes the
Telegram alert already shows, it does not alter the tracked record.

**Telegram alerts (2026-08-13, `AnalogML/motif_track.py --telegram`)** — the
"leave it as a signal, alert when a trade is building" decision: not a live
bot, not automated execution, a human-facing alert with SL/TP markings to
manually track against. Extracted `pylego/telegram.py` as a genuine shared
brick first — `send_telegram`/`load_tg_config` had been copy-pasted
near-identically across 7+ bots (`RegimeV2/V4/V7`, `DynAnchorBot`,
`YieldSpreadBot`, `oi_bot`, `bot/main.py`) with no `pylego/` brick behind
them despite CLAUDE.md's own stated threshold ("two copies already exist" —
this would have been an 8th); the existing 7 are NOT migrated as part of
this (separate follow-up). Reads the SHARED dashboard `tg_config` (the same
bot/chat every other bot's alerts already use) via `pylego.kv.KvClient` —
no new credentials needed unless a dedicated channel is wanted later.

One alert per newly-confirmed motif (the existing per-pair watermark already
guarantees "only genuinely new," never a backfill-on-first-run flood — same
mechanism that caught the 28,524-signal bug earlier in this build). The
alert shows the TRACKED frozen-grid entry/SL/TP (unchanged — the record
every number in this file is judged against never silently drifts) *plus*
two separately-validated, FROZEN sizing reads for manual execution: the
adaptive per-category ATR-scaled SL/TP (the validated (35,35) constants,
hardcoded — not recomputed live, matching "stop tuning, let it run") and the
1D HTF agree/conflict state with a size-down note on conflict. Neither
adaptive number is APPLIED to the tracked trade itself, only shown — the
combined-sizing test flagged just above stays undone for the tracked signal,
this is purely an informational overlay on top of it. Opt-in via
`--telegram` (off by default), and automatically disabled under `--as-of`
even if passed, so a replay/testing run can never fire a live alert.

**Dashboard status, checked directly against the merged code (2026-08-12):**
`today.html`/`indexv2.html`/`bot-config.html` on `main` (merged via PR #1216,
commit `181e1b50`) call `/api/analogml/motif-state` and
`/api/analogml/motif-trades` — the NEW motif signal, not the retired
`paper_trades.json`/`shape_state.json` k-NN signal. If the live Railway
dashboard still visibly shows the old signal, that's a deploy-lag or
live-data-population issue on Railway (unverifiable from this sandbox — both
Railway and OANDA are blocked by the outbound proxy here), not a stale-code
issue in this repo. Still open, needs the user to look at the live site and
say what the card actually shows before this can be run down further.

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


**Independent cross-confirmation:** the adaptive per-category sizing work
above (built the same day, separately) found per-category SL/TP splits
cleanly by touch count too — 2-touch categories get a favourable ~1.3:1
reward:risk, 3-touch categories closer to 1:1 — arrived at from MAE/MFE
distributions, not from this profit-factor disaggregation, and landing on
the same conclusion: touch count is a real structural axis for touches, not
noise. Two different methods, same read.

## Doubles-only portfolio + a second bug-hunt pass (independently converging with the work above)

Built on this same branch, in parallel with the walk-forward/adaptive/
multi-timeframe work above (both landed the same day) — `pylego/portfolio_sim.py`
extracts the k-NN method's event-driven single-account simulator as a
shared, signal-agnostic Tier-1 brick (`simulate_portfolio`, `sharpe_and_dd`,
`matched_utilization_benchmark`, `pairwise_correlation_summary`, now also
carrying the `size_mult` support the HTF-sized work above needs — 10
hand-verified tests; this engine had none before, only ever exercised
indirectly through the k-NN script). `AnalogML/portfolio_sim.py` re-exports
from it so every script above keeps working unchanged.

**Full-signal portfolio result converges independently with the number
above (Sharpe 1.61, max DD −55.1%) — same method, same data, built without
looking at each other's numbers first.** `AnalogML/motif_portfolio_sim.py`
additionally supports `--n-touches` to isolate the doubles-only subset
(n_touches=2 — see "Lifecycle disaggregation" below: doubles carry almost
all of the edge, triples read close to a coin flip):

```
python AnalogML/motif_portfolio_sim.py --all-pairs --n-touches 2 --risk-pct 0.01
```

| | Sharpe | max DD | avg utilization |
|---|---:|---:|---:|
| Full touches signal | 1.61 | -55.1% | 2.7% |
| Doubles only (n_touches=2) | **2.27** | **-31.8%** | 2.4% |

The doubles-only portfolio is BOTH higher-Sharpe and shallower-drawdown
than the diluted full signal — the same doubles-vs-triples pattern found at
the per-trade level shows up again at the portfolio level. This is
additive to, not a re-check of, the fuller adaptive/HTF-sized portfolio
work above — worth combining with those in a future pass (adaptive SL/TP
and/or HTF-conflict sizing, restricted to doubles only, is untried).

### A second bug-hunt pass on `motif_touch.py`

CLAUDE.md's rule: assume more bugs exist, don't assume clean because one
was already caught. Before trusting the portfolio numbers above, did a
genuine second pass on the detector itself (distinct from the
`motif_multi_tf.py`/`motif_adaptive.py` bugs already caught above, which
were in the NEW code built on top of the detector, not the detector
itself):

- Re-read the full `motif_touch.py` source with fresh, skeptical eyes — the
  run builder, segment-local retracement validation, confirm-scan condition
  ordering, top/bottom independence. No new logic bug found on inspection.
- **Empirically verified the causal invariant at FULL SCALE, not just the
  synthetic regression test** — the same class of check that caught the
  head & shoulders bug (a synthetic test alone missed that one; only
  measuring on real data at scale did). Every confirmed motif across all 26
  pairs: **28,524 confirmed motifs, 0 causal-invariant violations**
  (`confirm_idx - last_touch_idx >= pivot_n` held on every single one).
- Checked touch-run duration realism (median 0.8 days, p99 2.4 days, max
  3.4 days on GBPJPY — realistic, contained formations, no degenerate
  multi-year "double tops") and confirmed no same-side double-counting or
  entry/exit date-ordering issues (both structural, not just observed).

**No new bug found this pass** — reported plainly as a bounded, real result
(the existing fix is now scale-verified, not just assumed clean), not proof
of permanent cleanliness.


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
