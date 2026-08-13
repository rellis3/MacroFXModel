# forge — candles in, analysis + a testable strategy out

> **Read this first.** The headline result of the first gold run is a **null**:
> after three lookahead bugs were found and fixed, the level-conditional edge
> the engine discovers is *worse* than what the same search finds on
> **randomly-placed lines**, and the strategies it designs lose money
> out-of-sample at −0.083R per trade over 10,112 trades. That is not a failed
> build. It is the build working — the engine's job is to tell you which of your beliefs
> about POCs, VALs, FVGs and order blocks survive contact with cost,
> multiple testing, and a proper walk-forward, and on this first pass the
> answer is "none of them, yet". The three bugs are documented below because
> each one produced a *beautiful* fake result, and each is a bug that a
> backtest cannot reveal by failing.

---

## First run: gold, 2016-06 → 2026-06

3,501,046 M1 bars · 202,397 levels across 60 kinds · 306,401 level interactions ·
~32,000 hypotheses per fold · 6 expanding walk-forward folds · 3 null repetitions.

```
REAL levels  OOS: 10,112 trades over 1,432 days
   raw    mean -0.0830R   t = -5.50     ← what you would actually have earned
   excess mean +0.0507R   t =  3.40     ← over the same trade at any level
NULL levels  (randomized prices, 3 runs)
   raw    mean -0.0283R
   excess mean +0.1104R   best t = 7.50
p_vs_null = 1.00   (all 3 null runs beat the real search)
```

Two independent readings, both negative:

1. **The levels do nothing.** Real levels' excess (t=3.40) is comprehensively
   beaten by randomly-placed lines (t=7.50, +0.110R vs +0.051R). Every one of
   the three null runs beat the real one. Whatever the search is picking up,
   it is not a property of POCs, VALs, pivots, FVGs or order blocks — an
   arbitrary line drawn at a plausible distance does it better.
2. **Nothing is tradeable anyway.** The raw number is what a trader receives,
   and it is **−0.083R per trade with t = −5.50 across 10,112 trades**. Not
   "no edge" — a statistically significant *loss*.

Fold by fold (raw R per trade): −0.089, −0.115, −0.217, −0.155, −0.073, +0.003.
Five of six negative, improving monotonically toward the present — which is a
cost story, not a skill story, and it is the most useful thing this run found:

| Year | Gold | M15 ATR | $0.30 spread, as R at a 0.75×ATR stop |
|---|---|---|---|
| 2017 | $1,258 | $1.21 | **0.353 R** |
| 2019 | $1,393 | $1.32 | 0.353 R |
| 2021 | $1,799 | $2.15 | 0.209 R |
| 2024 | $2,389 | $2.95 | 0.147 R |
| 2026 | $4,774 | $13.38 | **0.037 R** |

A round-trip spread that never changed costs **ten times more in risk terms**
in 2017 than in 2026, because the stop is volatility-scaled and the spread is
not. Intraday level-trading gold at a sub-ATR stop was structurally unviable at
2016–2019 volatility regardless of signal quality: you started every trade a
third of the way to your stop. Any study pooling that era with this one is
averaging two different games.

**The honest conclusion:** on gold M15, with this vocabulary, this event
definition and this barrier grid, there is no level-conditional edge. The next
move is a different question, not a finer sweep of this one — see
[Honest next steps](#honest-next-steps).

---

## The question this answers

> "Can I build an ML model that takes 10 years of M1 candles, reviews and
> understands them, and self-designs a trading system from patterns, nPOC,
> VAH/VAL, daily opens, pivots, FVGs, order blocks…?"

Split into two halves, because they have opposite answers.

**"Can a model *understand* the market and *invent* a system?"** — No, and no
amount of compute changes it. There is no training signal for "understanding".
The forward return of a liquid instrument is ~99% noise at the horizons in
question; a model given raw candles and told to maximise profit will fit the
noise, and the more capacity it has the better it will fit it. The reason this
fails is not that the model is too small. It is that the sample contains far
less information than the hypothesis space needs.

**"Can a machine enumerate every one of those structures, test every
conditional hypothesis about them against real forward prices with real costs,
and hand back what survives?"** — **Yes, and that is worth building.** It is
the half that a human researcher does badly: you cannot hold 40,000 hypotheses
in your head, you will not remember to charge yourself for the 39,990 you
discarded, and you will unconsciously stop testing when you find something you
like. A machine will.

So `forge` is not a model that designs strategies. It is a **hypothesis
generator plus a very aggressive falsifier**. The vocabulary of what it can
find is written by a human in `levels.py` and `events.py` — that is the honest
ceiling on "self-designing". Everything after that is search and statistics.

---

## Architecture

Each module is one layer and is importable on its own.

| Layer | Module | Job |
|---|---|---|
| 0 | `bars.py` | Causal substrate: HTF resample, session/day keys, ATR, vol percentile |
| 1 | `levels.py` | **The level zoo** — every named structural price, stamped with when it became *knowable* |
| 2 | `events.py` | Level interactions → discrete decision points + a causal context vector |
| 3 | `label.py` | What happened next, on the real M1 path, ATR-scaled barriers, net of cost |
| 4 | `discover.py` | Score ~40,000 conditional cells; FDR; the random-level null |
| 5 | `validate.py` | Walk-forward **the designer**; freeze a human-readable `StrategySpec` |
| — | `run.py` | CLI orchestration + report |

Shared math is imported from `pylego/`, never copied (`CLAUDE.md`, the Lego
Principle). `pylego.barrier_race` resolves every forward path,
`pylego.costs` owns spread, `pylego.swing_structure` owns pivots and ATR.

### Layer 1 — the level zoo (60 kinds, 9 families)

`day_anchor` PDH/PDL/PDC/prior-day-mid/daily open · `week_anchor` PWH/PWL/PWC/
weekly open · `pivot` classic PP/R1–R3/S1–S3 + Camarilla R1–R4/S1–S4, daily and
weekly · `profile` POC/VAH/VAL daily and weekly **+ naked POCs** (carried
forward until price finally trades through them) · `session_range` Asia and
London high/low/mid · `imbalance` FVGs on M15 and H1, alive until filled ·
`order_block` last opposing candle before a ≥1×ATR displacement that leaves a
gap, alive until closed through · `swing` confirmed pivot highs/lows (resting
liquidity) · `round` gold's $10 and $50 levels.

Both pivot formulas are emitted rather than the engine picking one; which one
gold respects, if any, is a question for the data.

### Layer 2 — why *events*, not bars

Asking "what happens next?" at all 3.6M M1 bars is the wrong question. Almost
every bar is a non-event, so the signal drowns in millions of null samples —
and it isn't how any of these concepts are used. Nobody trades "the 10:37
bar"; they trade *price arriving at a level*. So the engine only asks where a
discretionary trader would: at a level interaction. ~330k of them over 10
years of gold, each with a context vector (approach side, touch number, wick
depth, bar shape, approach momentum, position in the day's range, distance
from the daily open, vol regime, session, day of week, HTF swing structure,
confluence with other live levels).

### Layers 4–5 — the part that does the actual work

The search space is roughly **40,000 hypotheses** (60 level kinds × 2 approach
sides × 2 directions × ~29 context splits × 6 barrier cells). Testing 40,000
coin flips at p<0.05 hands you 2,000 "edges" made entirely of noise. Three
defences, in increasing order of how much they hurt:

1. **Cluster-robust standard errors.** Twenty levels get tagged in the same
   trend hour and all win together. They are not twenty independent samples.
   Errors cluster by trading day.
2. **Benjamini–Hochberg FDR** across *every* cell examined — not just the ones
   that looked interesting.
3. **The random-level null.** Rebuild the pipeline with level **prices
   randomized** — same births, lifetimes, kinds, zone widths, and the same
   distribution of distance-from-price, so the fake levels get touched just as
   often. Re-run the identical search. *If "price reacts at the VAL" is real,
   real levels must beat random lines.* When they don't, no amount of FDR
   correction saves the result, because the null being violated is not "no
   effect" — it is "any line would have done".

And the walk-forward tests the **procedure**, not a strategy. In each fold the
engine refits tercile cuts, rescans all 40,000 cells, applies FDR, and freezes
a spec using only data available at that point — then is scored on the next
unseen block. The question it answers is "if I had run this engine at the end
of every year and traded what it designed, what would have happened?"

---

## The three lookahead bugs (read this part)

The first run reported **+0.37R per trade out-of-sample, t=11.3, over 1,497
trades**. It was entirely artificial. Each bug below is the same species: not
a crash, not a NaN, but a small time-alignment error that makes results
*better*. A backtest cannot reveal these by failing.

What exposed them, in order, was: the null control (random levels scored
+0.29R too — impossible), then a label-permutation test (which *passed*,
proving the search machinery was sound and the leak was upstream in the
features), then hand-replaying six trades against raw M1.

**1. Left-labelled resample → levels born a whole bar early.**
`resample` stamps the H1 bar covering 03:00–04:00 as `03:00`. An FVG confirmed
by that bar was stamped `born = 03:00` — but the gap's own upper edge *is that
bar's low*, unknown until 04:00. An M15 event fired at 03:15 holding a
boundary derived from the next 45 minutes of price. Same bug in order blocks
(the displacement bar's body) and swing levels (the confirming bar).
*Fix:* every bar-derived level is born at `next_open(tf, i)`.

**2. Swing-structure trend read one bar early.** A pivot at bar `i` needs bars
`i−n … i+n`, so it is confirmed when bar `i+n` **closes** — `times[i+n+1]`, not
`times[i+n]`. Shifting by only `n` hands you the open of the confirming bar
while that bar's own high and low are part of what confirmed it. This one
mattered disproportionately: `trend` was the most-selected split in the entire
search, so nearly every surviving strategy cell was contaminated.

**3. `merge_asof` result assigned into an unsorted frame.** Events are
generated level-by-level, so the frame is not time-sorted. `pd.merge_asof`
returns its result in *sorted* order; assigning that back positionally paired
every event with some other event's trend label. Silent, and it changes with
any change to level ordering.

After all three fixes, on the same 2-year window: real OOS excess **+0.010R
(t=0.12)**, random-level null **−0.007R (best t=0.43)**. The real search does
not clear its own null. The +0.37R was the bugs, all of it.

Two regression tests now guard this class of error generically:

* `levels_test.py::test_prefix_invariance` — build levels from the full
  history and from a truncated prefix; any level born inside the prefix must
  be **identical** in both. If its definition touches even one bar at or after
  its own birth, truncation changes it and the assertion fires. This catches
  lookahead in every family at once, including families added later that
  nobody wrote a test for.
* `events_test.py::test_context_features_use_no_future_bars` — the same idea
  applied to the whole context vector.

A third bug was caught by a plain correctness test: naked POCs were expiring
at the *end of the period* they were tagged in rather than at the tagging
minute, so events fired on "naked" POCs that had already been traded through
hours earlier. Not lookahead — worse, a silent redefinition of the concept
being measured.

### One fix shipped into the shared brick

`pylego/barrier_race.py` resolved same-bar barrier ties in favour of the
**target**. When both barriers fall inside one minute, the bar cannot say
which came first, and awarding all of those to the target is a one-directional
optimism — worst exactly at the tight 1:1 cells this search likes. Added
`pessimistic_ties` (default `False`, so every existing study is unchanged;
`forge` passes `True`). All 31 existing `pylego` tests still pass.

---

## Running it

```bash
python -m forge.run --pair gold --years 10 --folds 6 --null-runs 3
```

Useful flags:

| Flag | Meaning |
|---|---|
| `--select-stat` | `t_lift` (default) = "beat the same trade at any level" — about levels. `t` = "made money" — picks up instrument drift |
| `--cost-mult` | Cost stress. **Always read a run at `2` as well as `1`** |
| `--day-start-hour` | `0` = UTC midnight, `22` = NY close. Changes every daily open / pivot / profile downstream |
| `--sl-atr`, `--tp-r` | The barrier grid — part of the hypothesis space, not a tuning step |
| `--null-runs` | Random-level null repetitions. More = a real null distribution |

### How to read the output

Read it in this order, and stop at the first line that fails:

1. **`excess` vs the null's best.** If the real search's `t_excess` does not
   clear the best `t_excess` from the randomized-level runs, **stop**. Nothing
   below this line means anything.
2. **`excess`, not `raw`.** `raw` includes whatever the instrument did. Gold
   ran $1,243 → $4,328 across this dataset; `raw` flatters every long spec
   ever written.
3. **Trade count and fold consistency.** Four folds at +0.4R and two at −0.3R
   is not an edge with a good average, it is two regimes.
4. **Cost sensitivity.** At a 0.75×M15-ATR stop (~$1.50 on gold), one extra
   $0.30 of spread is another 0.2R off *every* trade.

---

## What this cannot do, stated plainly

* **It cannot find a concept that isn't in `levels.py`.** The engine searches a
  space; that module *is* the space. This is the real ceiling on
  "self-designing", and it is why the vocabulary matters more than the model.
* **The effective sample is much smaller than it looks.** 3.6M M1 bars is
  ~2,600 trading days. Events cluster heavily within days. The cluster-robust
  SEs account for this and the resulting `n` is sobering.
* **Tick volume is not traded volume.** Every POC/VAH/VAL here is built from
  broker tick counts — a proxy. A POC from CME gold futures volume is a
  different object.
* **Costs are modelled as a flat spread drag.** No variable slippage, no news
  widening, no partial fills, no borrow. `--cost-mult 2` is the crude stress
  test, not a fill simulator.
* **No portfolio layer yet.** Trades are scored independently; overlapping
  positions, correlation and sizing are not simulated.
* **Regime.** Gold 2016–2026 spans a range-bound stretch, a pandemic spike and
  a historic bull run. A rule that works "over 10 years" may be a rule that
  worked in one of them.

## Honest next steps

Ranked by expected information per unit of work, not by appeal:

1. **Raise the horizon and the stop until cost is not the dominant term.** The
   cost table above is the single most actionable thing this run produced. At a
   0.75×M15-ATR stop the spread was 15–35% of risk for most of the sample —
   you cannot detect a 2% edge through a 30% toll. Re-run on H1/H4 events with
   stops of 2–4×ATR and a multi-day horizon, where the same $0.30 is ~0.02R.
   This is the one change most likely to move the result, and it costs nothing
   but compute.
2. **Widen the vocabulary before deepening the search.** More context splits on
   the same 60 kinds mostly buys multiple-testing burden. Genuinely new
   *objects* — volume-profile shape (P/b/D day types), composite multi-day
   profiles, real CME volume, cross-asset conditioning (DXY, real yields — the
   repo already has these) — buy new information.
3. **Split the sample by cost regime, don't pool it.** Pre-2020 and post-2024
   gold are different games at this stop size. Pooling them averages a game you
   could not win with a game you might.
4. **Test the day boundary.** `--day-start-hour` 0 vs 22 changes every daily
   open, pivot and profile. It is currently an untested assumption.
5. **A held-back vault.** Reserve the final 2 years, never run anything on
   them, and spend that budget exactly once when something finally clears
   its null.
6. **A portfolio layer**, before any spec is taken seriously.
7. **Do not** tune the existing search harder. When the honest answer is
   "worse than random lines", the move is a different question, not a finer
   sweep of the same one.
