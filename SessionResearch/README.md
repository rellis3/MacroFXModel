# SessionResearch

Does the Asia / London / London-NY overlap / NY session cycle predict itself?
A stats-first research engine over 10 years of M1 gold data, built to run
unchanged over any of the other 25 pairs in `VolRangeForecaster/data/m1/`.

This answers six related questions, at the level of full trading sessions,
individual hours, the day as it unfolds, and — for `impulse.py` — individual
swing points at a scalping timeframe:

1. **Range handoff.** Does a wide (or quiet) session predict the next
   session's range?
2. **Direction handoff.** Does a session's up/down close predict the next
   session's direction — does trend actually carry over, or does a strong
   move tend to fade?
3. **The pre-open spike.** Is there really "a big candle before the open,
   and the gap comes back" — and if so, at which session opens, and how much
   of the move actually retraces? Checked for robustness across both high-
   and low-volatility regimes, not just pooled.
4. **Trending the day as it happens.** Given what's already printed today —
   after Asia, after London, after the overlap — how much of the day's
   eventual range is already "spent," and does the day's move-so-far predict
   its close?
5. **Can any of this actually predict the rest of the day?** A real
   walk-forward model (not a backtest with the answer key visible), trained
   only on the past, tested year by year going forward — see "Can this
   predict the rest of the day?" below. Short version: mostly no, and that's
   reported as plainly as a "yes" would have been.
6. **Impulse reversal, for scalping.** Does an impulsive (fast, sharp) push
   into a swing low force a bounce, does an impulsive push into a swing high
   force a fade — generalizing the pre-open-spike finding to any confirmed
   swing pivot, not just session opens — and is it symmetric, or does one
   direction work better than the other?

Plus an hour-of-day breakdown (which UTC hours produce outsized moves) as a
sanity check that the pipeline recovers known market structure before
trusting it on the less obvious questions above.

**Phase 1 (questions 1–4, 6) is descriptive/inferential research; question 5
is a genuine walk-forward model, but neither phase is a signal generator.**
No entries, exits, position sizing, or cost model — see "What this is not"
below.

## Run it

```bash
pip install pandas numpy scipy pyarrow statsmodels scikit-learn    # if not already installed
python3 -m SessionResearch.run_study --pair gold
python3 -m SessionResearch.report_html --pair gold
open SessionResearch/out/gold/gold-session-research.html
```

Rerun on any other pair the same way — nothing here is gold-specific:

```bash
python3 -m SessionResearch.run_study --pair eurusd
python3 -m SessionResearch.report_html --pair eurusd
```

`run_study` writes to `SessionResearch/out/<pair>/`: `meta.json`,
`handoff.json`, `intraday.json`, `spike_fade.json`, `dayflow.json`,
`forecast.json` (full walk-forward detail), `forecast_cells.json` (the two
FDR-pooled hypotheses per checkpoint/target), `impulse.json`,
`day_of_week.json`, `all_cells.json` (the pooled table used for the FDR
correction), and three large, regenerated-every-run, gitignored files:
`session_table.json` (per-day-per-session raw table, ~5MB),
`day_checkpoints.json` (per-day-per-checkpoint raw table, ~4MB), and
`impulse_events.json` (per-swing-pivot raw table, ~26MB — M5 over 10 years
produces on the order of 10⁵ pivots per side).

Takes a few minutes end to end on gold (`impulse.py`'s circular-shift nulls
run over ~120k pivots, not ~2.6k session-days, so they dominate the runtime —
capped at `min(n_perm, 500)` inside `run_study.py` for that reason).

## Session definitions

UTC hours, `[start, end)`. Asia/London match `forge/bars.py`'s `SESSIONS`
exactly (the shared substrate everything else in this repo should agree
with); `ny` is split into the **overlap** and the **NY-only afternoon**
because that's the 4-way split this research asks about — the overlap is
where liquidity is highest and behaves least like either session alone.

| Session | UTC window |
|---|---|
| asia | 00:00–07:00 |
| london | 07:00–12:00 |
| overlap | 12:00–16:00 |
| ny | 16:00–21:00 |
| *(late)* | 21:00–24:00 — thin Pacific liquidity, excluded from the 4-session cycle, still measured for the pre-Asia-open spike check |

**Three inconsistent session-boundary conventions already exist in this
repo** (`Gold/modules/session_engine.py`'s live-bot definition,
`asia-range-*.html`'s dashboard buckets, and `forge/bars.py`'s own `SESSIONS`
constant). This module resolves that by matching `forge` exactly on
asia/london and adding the overlap/ny split on top — it does not change any
of the other three, which are used for other purposes (live decisioning,
a specific fib-extension strategy) that this research doesn't touch.

## Day checkpoints (for questions 4 and 5)

Three points where a trader watching the day unfold would naturally ask
"given what's happened so far, what does the rest of the day look like?" —
the instant each session ends and the next begins:

| Checkpoint | UTC | Sessions seen | Sessions remaining |
|---|---|---|---|
| `post_asia` | 07:00 | asia | london, overlap, ny |
| `post_london` | 12:00 | asia, london | overlap, ny |
| `post_overlap` | 16:00 | asia, london, overlap | ny |

No `post_ny` checkpoint — after 21:00 UTC only the thin late tail is left,
not enough real trading time to make "the rest of the day" mean anything.
Every feature at a checkpoint (`dayflow.build_day_checkpoints`) is built ONLY
from sessions that have actually closed by that checkpoint — this is what
the walk-forward model trains on, so it's a hard rule, not a convention.

## Methodology — why this isn't just eyeballed correlations

`forge/discover.py` already states the risk plainly: with enough hypotheses,
testing at p<0.05 hands you a pile of fake "edges" for free. This package
applies the same two defences, adapted to session-level (not per-trade)
observations:

1. **Benjamini-Hochberg FDR across the WHOLE study.** Every p-value from
   every metric from every module (handoff, hour-of-day, spike/fade) is
   pooled into one correction in `run_study.py` — not corrected per-module,
   which would understate how much was actually searched.

2. **Circular-shift null, not a plain shuffle.** Gold's volatility is
   regime-clustered — quiet in 2017, wild in 2020 and again in 2025-26 — so a
   predecessor session's range and a successor session's range can look
   correlated purely because they landed in the same volatility regime, with
   no session-to-session mechanism at all. A fully-shuffled null destroys
   that regime clustering too, which makes it trivially easy to beat and
   would let a spurious "handoff" look real. Shifting one series by a random
   offset (with wraparound) instead preserves each series' own
   autocorrelation/regime structure while breaking the *specific* alignment
   under test — see `stats_util.circular_shift_pvalue`. The spike-reversal
   finding below was checked against exactly this concern (a secular
   uptrend can otherwise masquerade as short-horizon mean reversion) and
   held up.

Full-sample quantile thresholds (range terciles, the spike quartile cut) are
fit on the whole 10-year window. That's standard for a descriptive pass like
this one, but it is **not** walk-forward-safe — a live rule built on these
thresholds would need them refit on training data only, the way
`forge/discover.py` already does for its level backtests.

## Headline results (gold, 2016-01 → 2026-06)

Read the generated dashboard for the full, current numbers — this is the
shape of what came out of the first run:

- **Range persists across every handoff tested** (7/7 positive Spearman ρ,
  0.06–0.21, all surviving the circular-shift null), decaying with distance
  — Asia→London beats Asia→NY — which is what a real local effect looks
  like rather than noise.
- **Direction does not carry over.** Continuation rates sit within a couple
  points of 50/50 at every handoff. Momentum across sessions is not
  supported by this data.
- **The pre-open spike finding is the strongest result.** A large move in
  the 15 minutes before a session opens is followed by measurably *reduced*
  continuation over the next 15–60 minutes, at all four session opens,
  surviving the circular-shift null everywhere. London's open shows the
  clearest continuous relationship (pre-move vs. post-move Spearman ρ ≈
  −0.05 to −0.09, p_perm < 0.02); NY's open shows the weakest.
- **Hour-of-day range is dominated by 12:00–15:00 UTC** (US data releases
  into the London/NY overlap, ~1.7–1.9× an average hour) and troughs at
  21:00–04:00 UTC (~0.6×). Expected, and included as a pipeline sanity check.
- **By the time Asia ends, nearly half the day is already "spent."** Median
  44.5% of the day's eventual range has printed by 07:00 UTC, 65% by 12:00 —
  and a wide morning predicts a wide afternoon (range *compounds* through the
  day rather than reverting to a fixed daily budget), more strongly the later
  the checkpoint (post-overlap ρ ≈ 0.20 vs. post-asia ρ ≈ 0.10). The day's
  move-so-far, by contrast, barely predicts its close — the direction-does-
  not-carry-over finding above holds at the whole-day level too.
- **The spike-reversal finding holds in both volatility regimes** at the
  Asia, London, and NY opens (p_perm ≤ 0.02 in both halves of the sample,
  split on each boundary's own trailing daily-ATR median); at the overlap
  open it's concentrated in the high-vol half only (p_perm = 0.61 in the
  low-vol half) — a real, specific nuance, not a blanket claim.
- **Impulsive swings reverse more than grind swings, by a real but small
  margin, and the two directions aren't quite symmetric.** At M5, an
  impulsive (top-quartile displacement) push into a swing low or high wins
  ~1–2 points of win-rate more often than a grind pivot at the same price
  (survives BH-FDR at 5/15/30 min for lows, at 5 min for highs). At the
  5-minute horizon impulse-low and impulse-high win-rates are statistically
  indistinguishable (46.96% vs. 46.93%, p = 0.96) — genuinely symmetric,
  short-term. By 30 minutes a real asymmetry opens up (50.1% vs. 48.3%,
  p = 0.0017): impulsive lows bounce more reliably than impulsive highs
  fade, plausibly gold's decade-long uptrend, not a universal law. See
  "Impulse reversal for scalping" below.

## Can this predict the rest of the day? (`forecast.py`)

The question the earlier sections all point at: given today's info so far,
build an actual model and see if it works. One Ridge (regression: remaining
range) and one Logistic (classification: does the day close above or below
the checkpoint price) model per checkpoint, **walk-forward validated by
calendar year** — train on every year strictly before Y, test on year Y,
expanding window, never the reverse. This is the one part of the study that
IS walk-forward-safe end to end, not just descriptive.

Every model has to clear three bars, not one:

- **Beat climatology** — the train-set unconditional average. A model that
  doesn't even look at today's features.
- **Beat persistence** — the naive one-variable version of the same idea
  (a straight-line fit of remaining range on range-so-far; "today's move so
  far continues," for direction). Beating a coin flip is cheap; beating the
  obvious idea is the actual bar.
- **Beat a null.** The identical model architecture, refit on the SAME
  training features but with the training target circularly shifted, then
  scored against the real, unshifted test target. If a model trained on
  scrambled outcomes scores comparably, the real model's "skill" isn't
  trustworthy — this is the number to read first, not a footnote.

**Result: mostly, no — and that's the useful finding, not a disappointing
one.** Range prediction beats climatology at 2 of 3 checkpoints (weakly,
`post_overlap` p = 0.0001, `post_london` p = 0.024) but does **not** clearly
beat the persistence baseline anywhere (best p = 0.13), and 32–51% of
null (scrambled-target) refits score as well or better than the real model —
the small edge that exists is mostly the already-known range-persistence
effect, already captured by the trivial one-variable rule; the fancier model
adds nothing on top of it. Direction prediction has **no walk-forward skill
anywhere**, and at `post_london` and `post_overlap` the trained model is
*significantly worse* than the naive persistence baseline (p = 0.0034 and
p = 0.044) — a real, if unflattering, result. A HistGradientBoosting variant
was fit alongside as a "does nonlinearity help" check; it doesn't, scoring
within noise of the linear model everywhere.

This independently reproduces the handoff-level finding above ("direction
does not carry over") through a completely different method — a genuine
walk-forward model with a real out-of-sample test, not just a same-sample
correlation — which is exactly the kind of convergence that makes a null
result trustworthy rather than just an artifact of one particular test.

## Impulse reversal for scalping (`impulse.py`)

Generalizes `spike_fade.py`'s finding beyond session opens: does ANY fast,
sharp push into a swing low force a bounce; does a fast push into a swing
high force a fade — at a timeframe a scalper would actually trade (M5, not
whole sessions)?

**Definitions**, kept close to machinery already validated elsewhere in this
repo rather than invented fresh:

- **Swing pivot** — `pylego.swing_structure.pivot_highs`/`pivot_lows` (the
  same pivot detector `forge/levels.py`'s swing levels use), confirmed
  `pivot_n=3` bars later (15 min either side on M5) — same causality rule as
  `forge/levels.py`: "a pivot needs n bars on each side to be confirmed...
  reading it at bar i is lookahead dressed up as market structure."
- **Impulsive** — the 3 bars immediately into the pivot moved by the TOP
  QUARTILE displacement (in prior-bar-ATR units) among all pivots of that
  kind — a fast leg, not a slow grind to the same price. The BOTTOM quartile
  ("grind" pivots) is the control group: same pivot definition, no fast leg.
- **Reaction** — price change from the CONFIRMATION timestamp (not the pivot
  bar itself) at 5/15/30-minute horizons, oriented so positive always means
  "the expected reversal happened" (up after a low, down after a high) —
  which is what makes a low-pivot row and a high-pivot row directly
  comparable on the same win-rate scale.
- **"Forces a buy/sell"** is a win-rate (reaction ≥ 0.10×ATR within the
  horizon), not just a mean — a few large outliers can fake a positive mean
  on a pattern that mostly does nothing.

**Result**: real, but modest, and not quite symmetric. Impulsive pivots beat
grind pivots on win-rate at every horizon for lows (survives BH-FDR at all
three) and at 5 minutes for highs (does not clearly survive at 15/30 min) —
the edge is on the order of 1–2 win-rate points, not a strong standalone
signal. The displacement-size-vs-reaction-size relationship is real and
continuous for lows (Spearman ρ ≈ 0.01, tiny but p_perm < 0.03 at every
horizon) and absent for highs (p_perm 0.42–0.86) — another piece of the same
asymmetry. Win-rate by session (`impulse.json`'s `win_rate_by_session` rows)
is descriptive only — no session cell reaches the FDR bar on its own, sample
sizes per session are 1,000–5,000.

## What this is not

- Not a trading strategy. No entries, exits, stops, targets, position sizing,
  or cost/spread model.
- Not fully walk-forward validated. `forecast.py`'s model IS walk-forward
  (train-on-past, test-on-future, by calendar year) — but the descriptive
  thresholds used elsewhere (range terciles, the spike quartile cut) are
  still fit on the full sample, which is standard for a descriptive pass but
  would need refitting on training folds only before any live use.
- Not causal. This is observational — it says what happened, not why.

## Files

| File | What it does |
|---|---|
| `sessions.py` | Raw M1 → one row per (trading day, session): OHLC, range, direction, ATR-normalized, gap vs. prior session, prior-session-break flags |
| `handoff.py` | Cross-session range & direction predictive tests (7 pairs × 6 metrics) |
| `intraday.py` | Hour-of-day / day-of-week move sizing |
| `spike_fade.py` | Pre-open spike detection + post-open reversal/retracement study, with a high-vs-low-vol-regime robustness check |
| `dayflow.py` | Per-day checkpoints (`post_asia`/`post_london`/`post_overlap`): range-so-far vs. remaining range, fraction of the day's range already in |
| `forecast.py` | The walk-forward prediction model (Ridge/Logistic + HistGBM check) vs. climatology/persistence baselines vs. a circular-shift null |
| `impulse.py` | Impulsive-vs-grind swing pivot reversal study at M5 (scalping), with a low-vs-high symmetry test and a session breakdown |
| `stats_util.py` | Shared BH-FDR + circular-shift-null machinery |
| `run_study.py` | Orchestrates all of the above, pools p-values, writes JSON |
| `report_html.py` | Renders the static dashboard from a study's JSON output |
