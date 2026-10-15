# COG-PINNED-HISTORY-CONFIRM: do the two weak patterns survive on data nobody has looked at (everything before 2026-04-13)?

*Pre-registered 2026-10-15, before the pre-April series was built or compared with Nasdaq. Every earlier test of the identified line (SOFR Sep26 − Euribor Mar27) used
2026-04-13 → 10-09 only. IBKR serves 1-minute history for these still-live contracts back to listing (`scratchpad/ibkr_deep_pull.py`, `analysis/output/stir_1m_deep/`),
so history before 2026-04-13 is a clean holdout. The two patterns carried forward from the earlier results are tested there once, signs fixed from what was already seen.*

## Data
- Line: `SR3U6` and `IH7`, 1-minute MIDPOINT from the deep pull, 15-minute closes, close-labelled, raw (no smoothing), bp = SOFR rate − Euribor rate. A bar needs ≥ 5 minutes in both legs.
  Both contracts are live throughout, so there are no rolls; the pair's time to expiry shrinks over the window (stated, not corrected).
- Nasdaq: OANDA NAS100 CFD, 1-minute research cache (`VolRangeForecaster/data/m1/nq_m1.parquet`, ends 2026-08-20, so it never touches the lockbox), 15-minute closes. A CFD has no
  contract rolls. (The April–October tests used CME NQ futures; the two agree at 0.965 within a bar.)
- Holdout window: from the first bar where both legs have data up to **2026-04-12**. Quality screen, applied before looking at any outcome: drop days where either leg has fewer than
  40 distinct 15-minute prices (stale far-dated quotes); report how many days that removes.

## Hypotheses (one primary per family, direction fixed in advance)
- **P1, divergence catch-up.** D = z(line change over 4 h) − z(Nasdaq change over 4 h), each z by prior-day-only RMS. Correlation of D with Nasdaq's return over the next **8 h** is **> 0**.
  Day-clustered t, one-sided 5 %. Secondary (same direction): L = 8 h with H = 8 h, and L = 4 h with H = 4 h.
- **P2, line turns while Nasdaq has not yet.** Adaptive zig-zag states for both series exactly as in `COG_TREND_STATE_PREREG.md` at the fine scale **k = 0.75** (θ = k × prior-20-day RMS of 4 h changes).
  Event: the line's state flips to d while Nasdaq's state is −d. Outcome: Nasdaq's state becomes d within H. The pooled difference (events minus all bars with Nasdaq in state −d), over both
  directions and H ∈ {1, 2, 4, 8 h}, is **> 0**. Day-block bootstrap (1,000), one-sided 5 %.
- **P3, sanity (must hold or the data is suspect).** The line's change over 1 h and Nasdaq's return over the same hour correlate **> 0** (expected about +0.2).
- **Reported, no pass weight:** the full lead grid of the F1 family (line change 15 min / 1 h / 4 h vs Nasdaq return 15 min – 48 h) with explore / holdout / pooled correlations.

## Reading rule
- P1 and P2 each PASS only if the one-sided 5 % condition holds on the holdout. If both pass, the pooled estimate over all data (holdout + April–October) is reported and the finding is
  carried as a candidate for a forward paper record, not a signal. If either fails, that pattern is closed on this evidence.
- Power first: the minimum correlation detectable at 80 % (2.8 × SE from the day-clustered estimate) is reported for P1 and the minimum proportion difference for P2. A null whose minimum
  detectable effect is above the earlier point estimate (P1 0.12; P2 +4 to +10 percentage points) is called "insufficient data", otherwise "does not replicate".
- If P3 fails, nothing else is interpreted until the data are re-examined.

Script `scripts/rate_diff_nq/cog_pinned_history.py`; output `analysis/output/cog_video_0918/PINNED_HISTORY.md`; ledger `cog-pinned-history`.

## Amendment 1 (2026-10-15, made before any holdout outcome was computed)
The registered screen ("fewer than 40 distinct 15-minute prices per leg per day") removed all 728 days: these contracts tick in quarter-basis-point steps and a normal day shows 7-12 distinct
15-minute prices even in the April-October data that the earlier tests used. No outcome had been computed. The threshold is recalibrated on the already-seen April-October weekdays alone:
**a day is dropped if either leg has fewer than 3 distinct 15-minute prices** (the 5th percentile of SOFR SR3U6 in April-October; Euribor IH7's is 7, so this is looser for it). Before April 2026
the median is 8-14 distinct prices per weekday for SOFR and 5-13 for Euribor, so liquidity there is comparable to the earlier sample. The number of days the screen removes is still reported.
