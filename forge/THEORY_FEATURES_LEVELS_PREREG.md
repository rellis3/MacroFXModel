# Theory-lab features at the levels — pre-registration (EURUSD)

Committed 2026-09-30 before any number was computed.

## Why
By the optional stopping theorem, no target/stop geometry can make a driftless price profitable —
every bracket variant tested so far was ≈ 0 gross, consistent with that. The only lever at a level is
information that predicts DRIFT from the touch. The approach book (forge/APPROACH_BOOK_EURUSD_PREREG.md)
found price-only approach features predict continuation (Brier skill +0.046) but only as much as the
line spacing already pays. This adds four theory-lab features that carry different information.

## New features (bars BEFORE the pass bar only; "+" = in the line's direction)
1. **Dollar vs euro split** (PCA / factor / Hasbrouck lessons). USD basket = GBPUSD, USDJPY, USDCAD,
   USDCHF (ICE weights renormalised, EUR excluded). β = OLS slope of EURUSD 5-min returns on the basket's
   over the previous 20 London days (as forge/RESIDUAL_INTRADAY_PREREG.md). Over the last 60 minutes:
   **factorMove** = β × basket move, **ownMove** = EURUSD move − factorMove, both in σ, oriented;
   **ownShare** = |ownMove| ÷ (|ownMove| + |factorMove|).
2. **Variance ratio** (Hurst / VR lesson): VR(5) of 1-minute log returns over the last 120 minutes
   = Var(5-min returns) ÷ (5 × Var(1-min returns)). >1 trending, <1 mean-reverting.
3. **Jump ratio** (bipower / Lee–Mykland lessons): largest |1-min return| in the last 15 minutes ÷ the
   bipower-variation 1-minute σ over the 120 minutes before that.
4. **Options skew** (vol-surface lesson): CVOL skew of the latest settle dated before the London day,
   oriented to the line's side (+ = options price more movement toward the line).

## Rows, outcomes, split
The approach book's 31,024 non-same-bar EURUSD passes, same race and follow/fade net R.
Train 2016-03 → 2022-12, test 2023-01 → 2026-08.

## Tests
- **T1 (each new feature alone):** terciles fixed on train; cells = line family × feature × tercile;
  selected on train with n ≥ 100, net R > 0, t ≥ 2.5; shuffled-outcome chance benchmark (20 runs);
  confirmed on test with net R > 0, t ≥ 2.0. Pass: confirmed > chance 95th percentile.
- **T2a (do they add information?):** walk-forward GBM (fixed settings, yearly 2023–2026, 5-day embargo)
  for "continued", approach features + context vs approach + context + the 4 new features. Brier skill
  of new vs old with a day bootstrap. Informative if the 95% interval is above 0.
- **T2b (does it pay?):** walk-forward regressors for follow / fade net R with all features; take the
  side predicted > 0. Pass: net R > 0 with t ≥ 2.0.

## Multiple-testing ledger
This is the 12th pre-registered level-trading test on these lines (v4 Stage 0, VA geometry, Stage 1,
direction tag, touch book, entry timing, model step, sequence book, approach book, combo, confirmed break).
Any T2b pass will be reported with that count and a deflated-Sharpe adjustment before being believed.

## Causality
The builder aborts unless sampled passes' new features are identical when EURUSD AND the basket pairs are
replaced with a different random walk from the pass bar onward.
