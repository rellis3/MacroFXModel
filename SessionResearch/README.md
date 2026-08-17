# SessionResearch

Does the Asia / London / London-NY overlap / NY session cycle predict itself?
A stats-first research engine over 10 years of M1 gold data, built to run
unchanged over any of the other 25 pairs in `VolRangeForecaster/data/m1/`.

This answers three related questions, at the level of full trading sessions
and at the level of individual hours:

1. **Range handoff.** Does a wide (or quiet) session predict the next
   session's range?
2. **Direction handoff.** Does a session's up/down close predict the next
   session's direction — does trend actually carry over, or does a strong
   move tend to fade?
3. **The pre-open spike.** Is there really "a big candle before the open,
   and the gap comes back" — and if so, at which session opens, and how much
   of the move actually retraces?

Plus an hour-of-day breakdown (which UTC hours produce outsized moves) as a
sanity check that the pipeline recovers known market structure before
trusting it on the less obvious questions above.

**This is Phase 1: descriptive/inferential research, not a signal generator.**
No entries, exits, position sizing, or cost model — see "What this is not"
below.

## Run it

```bash
pip install pandas numpy scipy pyarrow statsmodels    # if not already installed
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
`handoff.json`, `intraday.json`, `spike_fade.json`, `day_of_week.json`,
`all_cells.json` (the pooled table used for the FDR correction), and
`session_table.json` (the raw per-day-per-session table — regenerated on
every run, gitignored, ~5MB for gold's full 10-year history).

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

## What this is not

- Not a trading strategy. No entries, exits, stops, targets, position sizing,
  or cost/spread model.
- Not walk-forward validated. Thresholds are fit on the full sample; a live
  rule needs them refit on training folds only.
- Not causal. This is observational — it says what happened, not why.

## Files

| File | What it does |
|---|---|
| `sessions.py` | Raw M1 → one row per (trading day, session): OHLC, range, direction, ATR-normalized, gap vs. prior session, prior-session-break flags |
| `handoff.py` | Cross-session range & direction predictive tests (7 pairs × 6 metrics) |
| `intraday.py` | Hour-of-day / day-of-week move sizing |
| `spike_fade.py` | Pre-open spike detection + post-open reversal/retracement study |
| `stats_util.py` | Shared BH-FDR + circular-shift-null machinery |
| `run_study.py` | Orchestrates all of the above, pools p-values, writes JSON |
| `report_html.py` | Renders the static dashboard from a study's JSON output |
