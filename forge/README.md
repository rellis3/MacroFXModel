# forge — candles in, analysis + a testable strategy out

> **Read this first.** The headline result on gold is a **null**: across two
> timeframes, two trade models, ~150,000 hypotheses and a composite confluence
> gate, nothing clears the bar a random-level control also has to clear.
> A stack of confirmations ("only trade when N things line up") was tested
> honestly and made results *worse*, not better. One unplanned lead did
> survive every check thrown at it — a prior-week-high breakout continuation —
> but it was found by the same search it needs to be judged against, so it is
> reported as a lead requiring fresh data to confirm, not a result.
>
> That is not a failed build. It is the build working — the engine's job is to
> tell you which of your beliefs about POCs, VALs, FVGs, order blocks and
> confluence stacking survive contact with cost, multiple testing, and a
> proper walk-forward, and so far the answer is "almost none of them, and the
> one candidate needs more data before it counts". The bugs found along the
> way are documented below because each produced a *beautiful* fake result,
> and each is a bug that a backtest cannot reveal by failing.

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

### Second run: fix the trade model, same verdict

The first run's biggest design flaw wasn't statistical, it was that it never
really tested levels. A market order on the bar after the touch fills a median
**0.36 ATR from the level** — about half of a 0.75-ATR stop — so every trade
started a third to a half of the way to its own stop, with the stop measured
from an arbitrary market price. That tests momentum *near* a level, not the
level.

`--entry-mode limit` rests the order **at** the level's proximal edge with the
stop placed beyond the zone. Entry distance 0.362 → **0.000 ATR**, 100% fill
rate, cost-in-R and stop distance held constant so only the one variable moved.

It worked, and it changed nothing:

```
                        raw            excess         null excess
market entry     -0.0830R (t -5.50)   +0.051R (t 3.40)   +0.110R (best t 7.50)
limit  entry     -0.0401R (t -4.43)   +0.138R (t 15.23)  +0.142R (best t 19.94)
```

Every fold improved. Excess roughly **tripled**, raw losses halved. And the
random-level null improved by *exactly the same amount* and still ties/beats it
(`p_vs_null = 1.00` again, all three null runs).

That symmetry is the finding. Entering at a line rather than 0.36 ATR past it is
worth ~+0.09R — **and it is worth the same to a randomly-placed line.** What
improved is the mechanics of trading *a* line. Nothing improved about *which*
line. Two structurally different trade models, same verdict, and the second one
states it far more cleanly than the first.

Limit-mode selections concentrate on `m15_fvg_bull`/`m15_fvg_bear` (48 of 60
cells) with `atr_pct_t=hi`, `touch_n=1`, `wick_t=lo` — i.e. *fresh, untouched,
high-volatility zones approached quietly*. A sensible-sounding setup that a
random line satisfies just as profitably.

### Third run: H4, where cost is no longer the dominant term — and the cleanest answer

The obvious objection to both runs above is that they were strangled by cost. So
the third run moves everything up a timeframe: H4 events, levels built from
H1/H4 structure, a 5-day horizon, limit entries. Cost falls **4×** — from 0.353R
to 0.086R at the worst point of the sample (2017).

It worked. The unconditional numbers improved dramatically — mean R at a `pdh`
touch went from −0.25 to **−0.018**, i.e. a level touch at H4 is nearly a fair
coin after cost, exactly as it should be.

And then the search found **nothing at all**:

```
fold 0:  17,220 hypotheses tested, best train t_lift = 3.80, 0 survived FDR
fold 1:  20,076 hypotheses tested, best train t_lift = 3.88, 0 survived FDR
fold 2:  22,716 hypotheses tested, best train t_lift = 3.99, 0 survived FDR
fold 3:  25,224 hypotheses tested, best train t_lift = 3.81, 0 survived FDR
fold 4:  26,880 hypotheses tested, best train t_lift = 4.27, 0 survived FDR
fold 5:  27,984 hypotheses tested, best train t_lift = 4.40, 0 survived FDR
```

Zero cells cleared Benjamini–Hochberg in any fold. Two of the three null runs
produced zero as well. And the reason is worth writing out, because it is the
whole thesis of this engine in three numbers:

| | t |
|---|---|
| Best cell actually found (m ≈ 28,000) | **4.40** |
| Expected max of 28,000 pure coin flips | **3.99** |
| BH bar for the best of 28,000 hypotheses at q=0.10 | **4.49** |

**The best repeating pattern in ten years of gold H4 data is the same strength
as the best of 28,000 coin flips.** Not "weak but real" — indistinguishable
from the strongest thing noise hands you for free when you look 28,000 times.
That is why an engine with no cost-regime crutch left to lean on returns
nothing, and it is why "but it repeats" and "but it's tradable" are different
claims.

### Fourth run: does CONFLUENCE — multiple confirmations at once — help?

The natural next question after "no single level touch has an edge" is
whether *stacking* confirmations does: only take the trade when several things
agree. `confidence.py` builds exactly that, deliberately guarding against the
trap in the idea — "N confluences lined up" is not N hypotheses, it's up to
2^N combinations, and searching all of them reproduces the illusion the null
control exists to catch. The discipline used: four factors, **fixed a priori,
not tuned against results**, summed into one integer score, tested as a single
`confidence >= 3` vs `< 3` split — one new hypothesis per level kind, not a
search over which factors to require.

The four factors, chosen for being at least partially independent of each
other: **stack** (other levels piled at the same price), **reject** (a
thrust-and-rejection shape vs a clean break), **htf_with** (higher-timeframe
trend agrees with the trade direction), and **dxy_confirm** — a synthetic
dollar-strength basket (EURUSD+GBPUSD+USDJPY+USDCHF+USDCAD, the classic DXY
components available in this dataset) moving the way the gold thesis needs.
That last one is the only factor that is a genuinely *different series* from
gold's own price, immune to the "it's just gold correlating with itself"
critique the other three don't fully escape.

**Result: it didn't work, and not narrowly.** Scored across all 1,848 cells
this pool generates, `confidence=hi` cells averaged **t_lift = −0.41**;
`confidence=lo` cells averaged **t_lift = +0.01**. High confidence did not
merely fail to help — it was *systematically worse* than low confidence. Not
a power problem either: the hi bucket had 588 scoreable cells (101–634 events
each), plenty to see a pattern, and the pattern is unambiguous. If this result
holds up under further scrutiny, the most likely explanation is `reject`:
under a limit entry, "price pierced deep past the level and then reversed"
describes an order that already had a bad fill relative to a level that was
simply respected cleanly — the factor may be measuring stress, not quality.

### The unplanned lead: `pwh` breakout continuation

Something else fell out of the confidence run, and it did not come from
confidence — it appeared in the `lo` bucket regardless. Prior-week-high
touches **approached from below** — i.e. price has broken up through last
week's high and is being bought for continuation — showed up as the walk-
forward's selection in **every one of six folds**, which nothing else in four
runs had managed. Tested properly afterward (own dedicated scan, correct
full-market baseline, not the confluence-restricted one):

```
pwh, approached from below, LONG   OOS: 506 trades / 299 days
   raw    +0.185R  t = 2.05
   excess +0.174R  t = 1.94
5 of 6 folds positive (one clearly negative: fold 2, −0.19R)
```

Randomizing the level (same births/lifetimes, arbitrary price) and re-running
the identical restricted scan found **zero surviving cells across all 18
fold-attempts** (3 randomizations × 6 folds) — the sharpest real-vs-null
contrast of any result in this document.

**This is a lead, not a finding, and the reason matters.** `pwh` was not
pre-registered — it was noticed *because* the confidence run scanned 60 level
kinds and this one kept appearing. The follow-up test above only pays the FDR
bill for its own ~84–400 hypotheses per fold; it does not pay for the search
that noticed `pwh` in the first place. That is a real, quantifiable double-
dipping risk, not a technicality — reporting the t=1.94 without this caveat
would be the same mistake this whole engine exists to catch in others. The
honest path forward is the "held-back vault" idea already in the next-steps
list below: this dataset has now been searched, so validating `pwh`
specifically needs either new data as it accrues, or accepting the FDR
correction across the full exploratory search that surfaced it (which would
very likely not survive — the base H4 search that ran with all 8 standard
splits already pays roughly this cost and pwh did not clear it there).

### The three core runs together

| Run | Cost (2017) | Real excess | Null excess | Verdict |
|---|---|---|---|---|
| M15, market entry | 0.353R | +0.051R | +0.110R | null beats real |
| M15, limit entry | 0.353R | +0.138R | +0.142R | null ties real |
| H4, limit entry | 0.086R | — | — | **nothing survives FDR at all** |

Read as a sequence this is more informative than any single row. The M15
"edge" grew when the trade model improved and grew *identically* for random
lines; then it vanished entirely once cost stopped being the dominant term.
That is the signature of an artefact of the cost gradient, not a weak real
effect — a weak real effect gets *easier* to see when you remove the noise
source, not impossible.

**The honest conclusion:** on gold, across two timeframes, two trade models and
~150,000 hypotheses, there is no level-conditional directional edge. The next
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

~~Raise the horizon until cost is not the dominant term.~~ **Done — that was
the H4 run.** ~~Test whether confluence/confidence stacking helps.~~ **Also
done — it made results worse, a real and useful negative result.**

What is left, ranked by expected information per unit of work:

0. **Get a genuine holdout for `pwh` before doing anything else with it.**
   This dataset has now been searched enough times that any further test run
   on the same 2016–2026 window is contaminated by having informed earlier
   choices, `pwh` included. The correct move is to wait for new bars to
   accrue past 2026-06-05 and score the frozen `pwh`-from-below-long spec
   (fold 5's exact cells, in `forge/out_h4/pwh_report.json`) against THAT,
   untouched by any run in this document. Anything scored on 2016–2026 again,
   however cleverly split, is not a fresh test.
1. **Change the target, not the search.** Every run so far asks the hardest
   possible question: *single-instrument directional prediction*. Two easier
   questions have far better base rates and the same machinery answers them:
   * **Volatility.** Vol clusters strongly and persistently; it is the one
     thing about price that genuinely is predictable. `VolRangeForecaster/`
     already aims here. Ask "does a level touch predict the *range* of the
     next session", not its sign.
   * **Cross-sectional ranking** across the 26 pairs — "which of these is most
     extended relative to its own structure" is a much easier question than
     "will gold go up", and it diversifies where a single instrument cannot.
2. **Widen the vocabulary, don't deepen the splits.** More context splits on
   the same 60 kinds mostly buys multiple-testing burden — and the H4 run shows
   exactly what that burden costs: at 28,000 hypotheses the bar for the best
   cell is t=4.49. Genuinely new *objects* buy information instead: profile
   shape (P/b/D day types), composite multi-day profiles, real CME volume
   rather than broker ticks, cross-asset conditioning (DXY, real yields — the
   repo already has these).
3. **Prune the hypothesis space on purpose.** Every cell you decline to test
   lowers the bar for the ones you keep. Choosing 500 pre-registered
   hypotheses instead of enumerating 28,000 moves the significance bar from
   t≈4.5 to t≈3.5 — a large real gain, available for free, and the opposite of
   what the instinct to "test everything" suggests.
4. **Split the sample by cost regime, don't pool it.** Pre-2020 and post-2024
   gold are different games at any fixed stop size.
5. **Test the day boundary.** `--day-start-hour` 0 vs 22 changes every daily
   open, pivot and profile. Still an untested assumption.
6. **A held-back vault.** Reserve the final 2 years, never run anything on
   them, and spend that budget exactly once when something finally clears its
   null.
7. **A portfolio layer**, before any spec is taken seriously.
8. **Do not** tune the existing search harder. When the best cell in the search
   is the same strength as the best of 28,000 coin flips, the move is a
   different question, not a finer sweep of the same one.

---

## Fifth run: cross-sectional ranking (`xsect.py`) — a different question, same null

Every run above asks a directional question about ONE instrument. That is the
hardest version of the question: gold's own price is dominated by market-wide
shocks (the dollar, macro risk-on/off) no level touch can predict, and a
directional bet is fully exposed to them — a large part of why `atr_pct=hi`
and `dxy_confirm` kept getting selected in the runs above, which is the search
rediscovering "when is the market moving for reasons unrelated to this level."

`xsect.py` asks a relative question instead: not "will gold go up", but "of
all 26 instruments this repo has local M1 data for, which is most extended
from its own weekly structure right now, compared to the others, at the same
moment." Long the compelling end of that ranking, short the other end. Two
things follow from asking it this way that don't follow from a single-name
bet: a common shock cancels between the long and short legs (both are exposed
to it equally), and it only needs the *ordering* to carry weak information,
not an outright directional call on any one name — a much lower bar.

The score: signed distance of each instrument's own daily open from **this
week's own open** (known from the moment the week starts), in ATR units — the
direct cross-sectional generalization of the daily/weekly anchors `levels.py`
already builds. A small, pre-registered grid (K∈{3,5} legs per side, holding
H∈{1,3,5} days, fade-the-extremes vs follow-them) is walk-forward selected —
12 combinations, not a search, so the multiple-testing bill this pays is
tiny compared to the single-instrument runs above.

**A real bug was caught building this, worth naming because of what kind of
bug it was.** `audchf`'s local parquet stops in 2020, six years before every
other pair's. The first version of the years cutoff was applied per pair from
each pair's OWN last bar — so a "last 2 years" request gave `audchf` a
2018–2020 window while every other pair got 2024–2026, and concatenating them
produced a panel that silently spanned eight years instead of two, with most
dates covered by only one or two names. Not a crash — a cross-section that
quietly stopped being one. Fixed by anchoring the cutoff to ONE shared
reference (the latest last-bar across the whole universe); a regression test
(`xsect_test.py::test_years_cutoff_is_anchored_to_one_shared_reference`)
guards it directly, in the same spirit as `levels_test.py`'s prefix-invariance
check — a different bug, but the same lesson that this class of error makes a
backtest look FINE while corrupting what it's actually measuring.

**Result, 10 years, full 26-instrument universe, all 6 folds:**

```
fold 0: k=5 h=1 momentum   train t=+0.54 → OOS t=-1.52
fold 1: k=5 h=5 reversion  train t=+0.77 → OOS t=-0.72
fold 2: k=3 h=3 reversion  train t=+0.75 → OOS t=+1.86
fold 3: k=3 h=3 reversion  train t=+1.30 → OOS t=-0.87
fold 4: k=5 h=3 reversion  train t=+0.91 → OOS t=+0.48
fold 5: k=3 h=1 reversion  train t=+1.05 → OOS t=+1.74

REAL   OOS: 987 obs, mean +0.0081, t=0.44, hit rate 51.0%
NULL   (scores shuffled within each date, 3 runs): t ranged -2.05 to +1.68
   → real t=0.44 doesn't even clear the null's OWN noise floor
```

Another clean null, and a particularly legible one: the in-sample training
t-stats the walk-forward had to choose from never exceeded 1.3 in any fold —
weak to begin with, before even reaching the OOS test — and the fold signs
flip freely (2 of 6 positive, 3 negative, 1 flat). The shuffled-score null's
own range (−2.05 to +1.68) is WIDER than the real result, which is exactly
what "this score carries no information" looks like: with only 26 legs and a
handful of non-overlapping observations per fold, the noise floor itself is
not small, and the honest reading is that weekly-open distance doesn't clear
it — not that cross-sectional ranking as an idea failed.

**What this does and doesn't rule out.** This tests ONE score (distance from
weekly open) on ONE horizon family (1–5 day holds) with a small K grid. It
says nothing about carry, real momentum (trailing return rather than
distance-from-an-anchor), or a level-touch-density score built from the full
`levels.py` zoo instead of one anchor — all cheap follow-ups on the same
`xsect.py` machinery, since the panel/walk-forward/null plumbing doesn't
change, only what feeds `ext_score`. Given how weak even the in-sample
numbers were here, the more informative next step is probably a different
score entirely rather than a finer grid on this one — same lesson as every
prior run in this document.
