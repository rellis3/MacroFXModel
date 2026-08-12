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
