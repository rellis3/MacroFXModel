# Pre-registration — IV position sizing, and a term-structure "stand aside" filter

Written 2026-09-23 before `forge/run_iv_sizing_filter.py` exists. Frozen. Trade-level
tests (Part C) are frozen in an addendum BEFORE any trade outcome is joined to IV.

Data: `oi_research_book/data/iv_daily_*.parquet` (iv30, iv90; CME settlement inversion,
validated vs VXN and vs the live QuikStrike capture). Sessions: forge `london22`. IV for
session t = the last settlement strictly before t (as forge/run_vol_iv.py). Instruments:
eurusd, gbpusd, audusd, usdcad, usdchf, usdjpy, nq.

## Definitions (fixed now)

- `ts_ratio = iv30 / iv90 − 1`. Plain inversion (`ts_ratio > 0`) was checked for base rate
  BEFORE this file was written: 40–58% of days on FX, 25% on NQ — too common to be a stress
  flag, so it is SECONDARY only.
- **Stress flag (PRIMARY):** `ts_ratio` above its own trailing-252-session 90th percentile
  (computed on sessions strictly before t; first 252 sessions excluded). ≈10% of days.
- Realized comparator σ: `sigma_har_rv_log` — what the realized ladder selected in 41/42
  folds of forge/IV_LADDER_PREREG.md.

## Part A — Sizing (market level)

A position sized to 1/σ̂ held for one session. Normalized outcome `z = (close − open)/open /
σ̂_daily`. Ideal sizing makes z's risk constant through time.

- **A1 (PRIMARY):** risk stability = standard deviation, across calendar months, of the
  monthly std of z. Lower is steadier. IV vs HAR.
- **A2:** tail share = fraction of sessions with |z| > 3.
- **PASS:** IV lower on A1 on ≥ 5 of 7 AND lower on A2 on ≥ 4 of 7.

## Part B — Stress filter (market level)

- **B1 (PRIMARY):** does the stress flag carry information BEYOND the IV level? Add the flag
  to the HAR + log iv30 + log iv_front next-session log-range model (the H2 model from
  oi_research_book/IV_FORECAST_PREREG.md), same expanding-window OOS protocol.
  PASS = lower OOS error on ≥ 5/7 and one-sided DM p < 0.05 on ≥ 4/7.
- **B2 (descriptive):** mean |z| (IV-sized) on stress vs non-stress sessions. If IV sizing
  already absorbs the stress, this ratio should be ≈ 1.

Prior stated up front: B1 is expected to be weak — the IV level already rises when the
front end steepens, so the flag may carry little that iv30 does not. A null means "size by
IV, don't also filter", which is still a usable answer.

## Part C — Trade level (frozen in an addendum before outcomes are joined)

Which trade datasets, the P&L unit, and the pass rule are written below once the available
data is known, and before any trade is matched to an IV value.

---

## Part C addendum — frozen 2026-09-23, after Parts A/B ran (A PASS, B1 FAIL) and BEFORE any trade was joined to IV

Datasets located by inventory (no outcomes looked at):
- **VOTE** = `analysis/output/level-atlas-vote-trades/<pair>-votetrades.json` — the Level Atlas
  Vote backtest, the strategy `volatility_bot_v3` trades live. 7 instruments incl. NQ,
  2022-02 → 2026-08, ~22.7k trades. R per trade = pnlPct / (stopPips·pip/entry·100).
  Its stops already scale with the REALIZED ladder.
- **MOTIF** = `AnalogML/data/motif_combined_backtest_export.json` — fixed 20-pip stop,
  1.5R target, field `r`. 6 FX pairs (no NQ). Window 2020-09 → 2026-05.

Join rule: a trade takes the IV panel row (`forge/out_vol_iv/iv_session_panel.parquet`) of the
london22 session its ENTRY falls in; the panel's IV is already the prior settlement. The
share of trades that fail to match is reported per dataset (population audit).

**C1 — stress filter on trades (PRIMARY for the filter).** VOTE. Mean R on stress sessions vs
non-stress, 95% CI by cluster bootstrap over session DATES (trades on one day are not
independent), 2,000 reps. **Filter is worth building only if** stress-day mean R < 0 with
CI upper bound < 0, AND the stress − calm difference CI excludes 0. MOTIF must show the same
sign (secondary). Plain inversion reported as secondary.

**C2 — sizing on trades (PRIMARY for sizing).** MOTIF (vol-independent stop). Per-trade weight
w = trailing median σ / σ_t for σ ∈ {IV (sigma_iv30), HAR (sigma_har)}, trailing median over
that instrument's sessions strictly before t (causal); flat = 1. Weights rescaled so each
scheme's mean weight is 1 over the whole sample (same total risk budget). Portfolio = daily
sum of w·R. **PASS** if the IV scheme's Sharpe (daily, pooled) beats BOTH flat and HAR, AND IV
beats HAR on ≥ 4 of 6 pairs individually. Max drawdown reported.
Secondary: VOTE with w = σ_har / σ_iv (moving its realized-vol-scaled risk onto IV).

Power stated up front: MOTIF has ~300 trades/pair in the window; a Sharpe difference below
~0.2 will not be distinguishable from noise. A C2 fail would mean "IV sizing is not shown to
help this bot", not "IV sizing hurts".

**Amendment (before any outcome computed):** `motif_combined_backtest_export.json` does NOT have
a fixed stop — in-window sl_pips runs 8–124 (percentile of each analog's own excursions, which
scales with vol), so it is not a vol-independent test. C2's PRIMARY dataset becomes
`AnalogML/data/motif_backtest_export.json` (params: sl_pips 20.0, tp_r 1.5 — fixed), and
`AnalogML/data/backtest_export.json` (analog, also sl_pips 20.0) is added as a SECOND fixed-stop
replication. Pass rule unchanged, applied to the primary; the replication must not reverse it.

---

## RESULTS (run 2026-09-23)

Raw: `forge/out_vol_iv/sizing_filter.json` (A/B), `forge/out_vol_iv/trades_c.json` (C).

**Join bug caught by the population audit, fixed before reading results:** the first C run
matched only ~43% of trades — `forge.load_daily` stamps a BST london22 session at 23:00 UTC
the previous day, and C's exact-date join used the London calendar date. Re-keyed the panel
to London date (the pre-registered rule). Match share after: VOTE 98.6%, MOTIF 97.7%,
ANALOG 93.7% (all misses = entries 22:00–24:00 London, outside any session). A/B were not
affected (they align IV by time-ordered merge_asof). The pre-fix run is discarded; it was a
winter-only subsample and happened to flatter IV.

**A — sizing, market level: PASS.** IV steadier month-to-month on 5/7; fewer |z|>3 days on
6/7 (USDJPY 0.77% vs 1.66%, NQ 0.45% vs 0.78%, EURUSD 0.83% vs 1.15%).

**B1 — stress flag adds to range forecast beyond IV: FAIL** (better 5/7, DM-sig 1/7).

**C1 — stress filter on the live Vote strategy: FAIL, and the sign is the wrong way for a
filter.** Stress-session mean R +0.088 [0.042, 0.134] vs calm +0.066 [0.047, 0.084];
difference +0.022 [−0.026, +0.072]. Stress days are, if anything, the BETTER days (NQ 0.27 vs
0.14, USDJPY 0.14 vs 0.05). Standing aside would cut profitable trades. Plain inversion: +0.004
[−0.028, +0.038]. MOTIF: stress 0.095 vs calm 0.112 (n=310) — also positive. **Do not build.**

**C2 — sizing on fixed-stop trades: PASS on the letter, within noise in substance.**
MOTIF pooled Sharpe flat 1.62 / HAR 1.65 / IV 1.67; IV beats HAR on 4 of 6 pairs (the bare
minimum); IV max DD −31R vs HAR −28R. ANALOG replication does not reverse (−0.38 / −0.34 /
−0.27; the strategy itself loses). Every gap is ≤ 0.1 Sharpe — below the ~0.2 stated as
distinguishable at this sample size. VOTE secondary: moving its realized-scaled risk onto IV
slightly HURT (Sharpe 3.53 → 3.45, DD −61R → −67R).

**Verdict.** IV is a better VOL FORECAST (fewer surprise days), but as a sizing input for these
bots its benefit is too small to measure, and for the live Vote strategy it is slightly
negative. The term-structure stress filter would remove good trades. Neither is wired into a
live bot on this evidence.

**CORRECTION TO THE CORRECTION (same day, verified in code):** the claim that the VOTE files are
leaky was WRONG for the FX files — it came from a stale memory note. The holdsOOS book leak was
fixed in commit 2702d7e (2026-09-11, schema 3; schema 4 same day), and the route that writes
votetrades.json (`js/levelAtlasRoutes.js:208-211`) builds an IS-only book and scores the real OOS
window. The 6 FX files are schema 4, regenerated 2026-09-15 → HONEST. Only `nq-votetrades.json`
(generated 2026-08-27, no schema = pre-5d5966f) is leaky. C1 is re-run on FX only below.

**C1 re-run on the honest FX-only VOTE files (nq excluded):** matched 98.4% of 20,459 trades.
Stress mean R +0.072 [0.027, 0.119] (n=2,721) vs calm +0.058 [0.038, 0.077] (n=17,417);
difference +0.014 [−0.037, +0.066]. Same verdict: stress days are not worse — **no filter.**
VOTE sizing secondary: flat Sharpe 2.94 / DD −52R vs IV-shift 2.88 / −58R — **IV sizing slightly
worse for this strategy.** Conclusions unchanged by removing the one leaky file.
