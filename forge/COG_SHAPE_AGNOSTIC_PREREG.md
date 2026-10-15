# COG-SHAPE-AGNOSTIC: does ANY repeatable shape in the SOFR-Euribor line (turn, confirmation, second move, divergence) predict Nasdaq with a lag?

*Pre-registered 2026-10-15, before any feature was built. Prompted by the owner's correction: C.OG (video 08:00-09:30) describes a process (a direction change at a point in time, a confirmation, a following confluence / second move, then Nasdaq repeating it with a lag), not one exact shape; "it may take different guises but be repeatable". The earlier event studies fixed one definition at a time (zig-zag turns at five thresholds, divergence flags, EMA slope) and found nothing. This study tests the concept without choosing the shape: a flexible model sees the line's whole recent path at many scales, and its **out-of-sample** predictive gain over Nasdaq's own history is the evidence. If no hidden shape carries information, a model that can combine thresholds, interactions and lags should not find any out of sample.*

## Series and clocks (unchanged)
Research line `x` (bp, 15-minute, close-labelled, raw, no display transform, no plot lead), Nasdaq `y` (log). Every feature at decision bar t uses data to and including t; every target starts at t's close. Window 2024-04-15 to 2026-10-09; the video week excluded from fitting and scoring.

## Features (all causal; scales S = 2, 4, 8, 16, 32, 64, 128 bars = 30 min to 32 h)
**Line, in units of its own theta (the 20-calendar-day RMS of 4 h changes):**
- momentum at every scale: change over s bars; **curvature** at every scale: change over the last s bars minus the change over the s bars before (a bend);
- position inside its own recent range over 16, 64, 256 bars; bars since the window high / low over 32 and 128 bars (as a fraction of the window);
- zig-zag (k 0.75) state, bars since the last confirmed turn, current leg size / theta, **current leg / previous leg size** (the "second move against the first", the confluence), turn flag in the last 8 bars;
- variability change (16-bar std of changes over its previous-20-day mean).
**Nasdaq, in units of its own theta:** momentum and curvature at the same scales, position in 16 / 64 / 256-bar range, zig-zag state, log trailing 8- and 16-bar range, log 20-day theta, hour-of-day dummies.
**Divergence:** line momentum minus Nasdaq momentum at every scale (both in theta units): the "line moves while Nasdaq does not" family, at all scales at once.

## Targets (Nasdaq, from t's close; hour-of-day not removed because the baseline model contains the hour)
Direction: forward log return over H in {8, 16, 32} bars (2 h, 4 h, 8 h) as a regression target and its sign as a classification target. Volatility: log |forward 8-bar return|.

## Models (hyper-parameters fixed now, never tuned on validation or out-of-sample)
Gradient-boosted trees (scikit-learn HistGradientBoosting; depth 3, 100 iterations, learning rate 0.05, minimum 200 rows per leaf, L2 = 1.0, no early stopping). **M0** = Nasdaq-only features + hour dummies. **M1** = M0 + all line and divergence features. The only difference between M0 and M1 is the line information.

## Walk-forward (the only evaluation)
First training set = 2024-04-15 to 2025-03-31. Test blocks = calendar quarters from 2025-04-01 to 2026-10-09 (validation = 2025-04-01 to 2025-12-31, out-of-sample = 2026-01-01 onward); before scoring each block the model is refit on all labelled rows up to 96 bars before the block starts (purge for overlapping targets). No row is scored by a model that saw its period.

## Statistics
Per target, model and half: **day-level information coefficient** (mean over days of the Spearman correlation between prediction and outcome, days with at least 12 scored bars) with day-level t, and AUC for the sign target. **IC gain** = IC(M1) - IC(M0) with a 2 000-draw day-block bootstrap CI (the same days enter both models). **Placebo**: the line is shifted by a random 5-60 whole days (100 draws) with features recomputed and M1 refit; the real IC gain must exceed the placebo 95th percentile; this keeps the line's own shape statistics and destroys only its timing against Nasdaq. Grouped permutation importance (momentum, curvature, position, time-since, zig-zag / confluence, variability, divergence) on the out-of-sample block says WHICH shapes carry information if any do. Economic: trade the sign of the M1 prediction in the top 5% of |prediction| (out-of-sample), 2 h or 4 h, net of 1.0 bp round trip (0.5 and 2.0 reported), day-clustered 95% CI.

## Pass rules
- **A repeatable shape exists** if, for at least one target: IC gain > 0 with the bootstrap CI above zero in **both** validation and out-of-sample, **and** the real combined gain beats the placebo 95th percentile, **and** the economic net return at 1.0 bp has a day-clustered 95% lower bound above zero **or** the finding is labelled volatility context (no trade).
- Otherwise: **no shape-agnostic evidence**. Nothing in the importance table can promote a finding on its own.
- Power statement: out-of-sample bars and days are printed; the smallest detectable IC gain at about 190 days is about 0.02-0.03.

## Not built
No live signal. A pass leads to a forward paper record and a narrowed, separately registered test of the shape the importance table names, never to bot code.
