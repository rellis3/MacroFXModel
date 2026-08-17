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
python3 -m SessionResearch.predict_today --pair gold      # optional: see "Applied", below
python3 -m SessionResearch.report_html --pair gold
open SessionResearch/out/gold/gold-session-research.html
```

Rerun on any other pair the same way — nothing here is gold-specific:

```bash
python3 -m SessionResearch.run_study --pair eurusd
python3 -m SessionResearch.report_html --pair eurusd
```

## Applied — an actual prediction, not just a walk-forward statistic (`predict_today.py`)

Everything above validates WHETHER prediction works. This script is the
other half: take the SAME production model, fit it on every day strictly
BEFORE a target day (no leave-one-out shortcuts — genuine "as if predicting
forward," even when the target day isn't the most recent one in the
dataset), and print what it actually says for that one real day — range,
direction, the naive-persistence baseline for comparison, and (when the day
is far enough in the past to know it) the actual outcome.

```
=== 2026-06-05  (post_london) ===
So far: range 0.54×ATR, net move +0.10×ATR

REMAINING RANGE
  model:       0.93×ATR
  persistence: 0.86×ATR  (naive one-variable rule)
  actual:      1.89×ATR
  reliability: walk-forward MAE 0.319 vs. persistence 0.321 (beats the trivial rule,
               p=0.130); 32% of null refits score as well or better

DIRECTION (close above checkpoint price?)
  model:       49% probability up
  persistence: up (today's move so far continues)
  actual:      down
  reliability: walk-forward accuracy 47.3% vs. persistence 51.8% (p=0.003) →
               NO VALIDATED EDGE — read the probability above as noise
```

That's real output from this dataset's most recent day, not a cherry-picked
example — and it's a useful one precisely because the direction call was
wrong at all three checkpoints that day, which is what "no validated edge"
actually looks like in practice, not a hedge-clause nobody expects to matter.
Every prediction is printed with its checkpoint/target's own walk-forward
accuracy from `forecast.py` directly underneath it — the reliability line is
not optional decoration, it is the thing that keeps a live number from being
read with more confidence than the research earned. `report_html.py` renders
this as an "Applied" panel near the top of the dashboard when
`predict_today.json` exists (run `predict_today.py` before `report_html.py`
to populate it; the dashboard degrades gracefully with instructions if you
skip it).

**This is still not a signal.** No entries, exits, sizing, or cost model —
it prints a number and its own accuracy, and leaves the decision to the
reader. It also can't tell you about literally today when run here: this
sandbox can't reach OANDA to refresh the parquet past 2026-06-05
(`AnalogML/refresh_m1.py` documents why — it works from Railway, not here),
so `--date` defaults to the most recent day actually in the dataset. Point
`--date YYYY-MM-DD` at any earlier day to see the model's call for that one
instead.

### `--live`: genuinely real-time, wherever the data actually is fresh

`--date`-mode replays a COMPLETE historical day (it needs all 4 sessions
present to know which checkpoint to build). `--live` is the other thing
entirely: as of right now, whichever of today's sessions have already
closed, build that partial day's feature row directly and predict the rest —
no historical "actual outcome" to show, because the outcome genuinely isn't
known yet.

```bash
python3 -m SessionResearch.predict_today --pair gold --live
```

Before 07:00 UTC this reports `no_checkpoint_yet` (still in the Asia
session) rather than fabricating a number. Every status — including the
non-"ok" ones — is written to `predict_live.json`, not just successes, so a
dashboard reading it can show "last checked HH:MM, still waiting on London"
instead of a silently stale file. `build_live_row` (the feature-construction
function `--live` uses) was cross-checked against `dayflow.build_day_checkpoints`'s
own output for several known historical days — bit-for-bit match after
fixing two bugs the cross-check itself caught (today's checkpoint used the
dataset's LAST atr0 instead of the target day's own, and `prev_day_range_atr`
used today's ATR scale instead of the prior day's own — see the function's
docstring and `git log` for the exact fixes).

## Running on Railway (live, with real prices)

This sandbox is frozen at 2026-06-05 and can't reach OANDA — nothing above
can produce a genuinely live number here, by construction, not by bug.
Wherever OANDA IS reachable (this repo's Railway deployment, per every other
OANDA-dependent script in this repo), two loops run continuously,
supervised by `start.sh` the same way every other bot in this repo is:

| Loop | Cadence (default) | Does |
|---|---|---|
| `SessionResearch/live_loop.sh` | hourly | `predict_today.py --live` for all 26 pairs, then `dashboard_export.py --all` |
| `SessionResearch/full_study_loop.sh` | daily | `run_study.py` + `predict_today.py` (historical replay) + `report_html.py` for all 26 pairs, then `dashboard_export.py --all` |

Neither loop refreshes the M1 parquet itself — `AnalogML/motif_track_loop.sh`
(already running hourly in this repo, unrelated to SessionResearch) already
tops up all 26 pairs' local parquets from OANDA via `refresh_m1.py`, so these
loops just read whatever's already current on disk. The split exists because
the two jobs have very different costs: `--live` only fits the already-proven
model on one new row per pair (seconds, safe hourly); the full study reruns
every circular-shift null across every handoff/spike/dayflow/impulse cell for
all 26 pairs (this build's timing: several minutes total with 4 cores; unverified
on Railway's actual hardware), and the underlying 10-year statistical findings
don't move meaningfully day to day, so daily is already generous.

**What's genuinely verified vs. what isn't:** the `--live` prediction logic
itself is cross-checked line-for-line against the historical code path (see
above) and runs correctly in this sandbox (correctly reporting
`no_checkpoint_yet`/`no_data_yet` against frozen data, rather than crashing
or fabricating a number). What is NOT verified from this sandbox: that
`start.sh`'s two new `restart_bot` entries actually run on the real Railway
deployment, that `refresh_m1.py` keeps pace with `live_loop.sh`'s hourly
cadence there, or that `/api/session-research/summary` serves real pair data
in production — this sandbox has no network path to Railway or credentials
to check. All of it follows the exact pattern every other OANDA-dependent
loop in this repo already uses successfully, but "matches the pattern" and
"confirmed running in production" are different claims, and only the first
one is being made here.

## Output files

`run_study` writes to `SessionResearch/out/<pair>/`: `meta.json`,
`handoff.json`, `intraday.json`, `spike_fade.json`, `dayflow.json`,
`forecast.json` (full walk-forward detail), `forecast_cells.json` (the two
FDR-pooled hypotheses per checkpoint/target), `impulse.json`,
`day_of_week.json`, `all_cells.json` (the pooled table used for the FDR
correction), and three large, regenerated-every-run, gitignored files:
`session_table.json` (per-day-per-session raw table, ~5MB),
`day_checkpoints.json` (per-day-per-checkpoint raw table, ~4MB), and
`impulse_events.json` (per-swing-pivot raw table, ~26MB — M5 over 10 years
produces on the order of 10⁵ pivots per side). `predict_today` writes
`predict_today.json` (historical replay) or `predict_live.json` (`--live`)
separately (see "Applied," above). `dashboard_export.py --all` reads all of
the above across every pair and writes ONE small combined
`SessionResearch/out/dashboard_summary.json` (~140KB for 26 pairs) — this is
the only file `server.js`/`today.html` ever read; nothing in the live
dashboard touches the large per-pair raw files directly.

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
| `predict_today.py` | Applies the production-fitted model to one real day (`--date`, historical replay) or right now (`--live`), annotated with that checkpoint/target's own walk-forward reliability |
| `stats_util.py` | Shared BH-FDR + circular-shift-null machinery |
| `run_study.py` | Orchestrates all of the above, pools p-values, writes JSON |
| `report_html.py` | Renders the static dashboard from a study's JSON output |
| `dashboard_export.py` | Distills every pair's output into one small `dashboard_summary.json` for `today.html`/`server.js` (see "Running on Railway") |
| `live_loop.sh` / `full_study_loop.sh` | Railway-only scheduled loops — `--live` hourly, the full study daily (see "Running on Railway") |
