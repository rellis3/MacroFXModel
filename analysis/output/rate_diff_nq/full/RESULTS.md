# Lead–lag structure: US–EU rate differential vs Nasdaq (full investigation, 2026-10-09)

Script `scripts/rate_diff_nq/leadlag_full.py`; data `crosscorr_grid.csv`, `distributed_lag.csv`, `conditional.csv`,
`results.json`; heatmaps `heatmap_*.png`, rolling `rolling_15m.png`.

**Data.** IBKR 1-min mid prices 2026-04-10 → 10-09. Rate series in rate terms (bp, + = higher rates priced):
- US 2y (CBOT ZT futures → yield) and DE 2y (Eurex Schatz → yield);
- the 2y spread US − DE (the smooth series);
- the STIR spread SOFR Dec'26 − Euribor Dec'26;
- C.OG's pair SOFR Sep'26 − €STR Sep'26 (1-min data from 2026-09-01 only, so it has no explore half).

Nasdaq: NQ futures front month (M6 → U6 → Z6).

**Sample.** About 150,000 joint minutes per spread. The rate series changed on 8–42% of minutes, the 2y spread on 42%.
Explore = Apr–Jun, confirm = Jul–Oct.

**Discipline.**
- t-statistics are day-clustered and regressions use Newey-West errors.
- Levels were tested for unit roots, and only stationary transforms were regressed.
- Benjamini–Hochberg FDR applies within each family, plus a family-wise scrambled-day null for the cross-correlation grid
  (95% max |t| = 3.85).
- Nothing was selected for being strongest in-sample.

## 1. Cross-correlation grid (5 series × 5 timeframes × lags −12…+12, changes)

- **Non-zero lags: 0 of 600 cells significant after FDR in the explore half; 0 beyond the family-wise bar; 0 replicated.**
- Share of non-zero cells with |t| > 1.96: 2.8% explore, 5.8% confirm. Chance alone gives about 5%.
- The explore and confirm signs agree in 41% of cells, which is chance-like (50% expected).
- Average lead correlations are ±0.006 or smaller, for rate-first and Nasdaq-first alike.
- The largest single cell is STIR Dec26 at 15m, lag −4 (Nasdaq first): explore −0.036 (t −2.9, q 0.14), confirm −0.001.

**Same bar (lag 0) is where the relationship is:**

| series | 1m | 5m | 15m | 60m | (explore / confirm) |
|---|---|---|---|---|---|
| US 2y | −0.13 / −0.22 | −0.15 / −0.24 | −0.15 / −0.23 | −0.17 / −0.29 | higher US yields ↔ Nasdaq down |
| DE 2y | −0.27 / −0.19 | −0.32 / −0.23 | −0.36 / −0.22 | −0.36 / −0.27 | higher German yields ↔ Nasdaq down |
| 2y spread US − DE | +0.02 / −0.02 | +0.02 / −0.01 | +0.02 / −0.02 | +0.04 / −0.05 | **≈ 0: the legs cancel** |
| STIR Dec26 US − EU | +0.05 / −0.01 | +0.07 / −0.01 | +0.09 / +0.00 | +0.14 / −0.02 | weak, gone in Jul–Oct |
| C.OG pair (Sep–Oct only) | — / −0.07 | — / −0.10 | — / −0.12 | — / −0.17 | modest, one regime |

## 2. Distributed-lag predictive models (6 lags of each side, horizons 1/3/6/12 bars, 1m/5m/15m/60m, both directions)

- 122 models; 20 have FDR q < 0.05 in-sample. Most are **Nasdaq → rate at 1 min** (e.g. Nasdaq → DE 2y, F 69).
- **Out-of-sample** (fit Apr–Jun, scored Jul–Oct against own-lags only): adding the other series improves the forecast in
  only 28–30% of models; the median change in R² is −0.02% (rate → Nasdaq) and −0.09% (Nasdaq → rate).
- The strongest in-sample rate → Nasdaq model (2y spread, 15m, 3 bars ahead: F 38, q < 0.0001) makes forecasts **worse**
  out of sample (R² −0.80%): an in-sample artefact.
- The only consistent out-of-sample gain is Nasdaq → DE 2y over the next 1–3 minutes, +0.17% / +0.08% of R². That is
  Nasdaq leading the Schatz quote by a minute, at a size no trade can use.

## 3. Levels and non-stationarity

- The rate levels are non-stationary (ADF p 0.34–0.94), and so is the Nasdaq level (p 0.13–0.16). Levels are therefore
  never regressed on each other.
- The rolling-β gap (Nasdaq minus its rate-implied level, 5-day window) is stationary (p ≈ 0). It is the error-correction
  test.
- **Neither side closes the gap.** Gap → next 1h / 4h Nasdaq: |t| ≤ 1.5 in both halves. Gap → next rate move: |t| ≤ 1.96
  (the largest is STIR gap → rate 1h confirm, t 1.96, explore −0.45).

## 4. Nonlinear, asymmetric, conditional (2y spread; rate move in one bar → Nasdaq over the next three; 5m and 15m)

- **Up vs down moves:** +0.02 / +0.02 explore, ±0.01 confirm. No asymmetry.
- **Large vs small:** too few |z| > 2 bars to estimate. Small moves +0.01 / 0.00.
- **Nasdaq volatility terciles:** the high-vol tercile was +0.03 (t 2.5) explore and +0.01 confirm. The signs of the
  other terciles flip between periods.
- **Session:** Asia, London, US data + open and US afternoon all have |t| < 2.6, with signs flipping between halves.
- **0 of 24 conditional tests survive FDR.**
- **Decile shape (5m):** the mean next-15-min Nasdaq return across the deciles of the rate move is flat (−0.003% to
  +0.006%) and not monotone.

## 5. Stability (rolling 20-day, 2y spread, 15m)

- Same-bar correlation: between −0.06 and +0.07, drifting from slightly positive (May–Aug) to slightly negative (Sep–Oct).
- Rate-first correlation: between −0.03 and +0.06.
- Nasdaq-first correlation: between −0.06 and +0.04.
- None stays on one side of zero for long.

## What the data supports

1. **Rates and Nasdaq move in the same minute, through the rate LEVEL legs** (either 2y yield, −0.13 to −0.36). That
   link is strong and stable in sign.
2. **The US–EU DIFFERENTIAL carries almost none of it.** Both legs move with Nasdaq in the same direction, so their
   difference cancels. A smooth spread (2y yields) shows this more clearly than the STIR spread did.
3. **No lead or lag in either direction survives multiple testing or replicates out of sample**, at 1m–60m, in changes or
   in levels (gap), linear or conditional. The one persistent asymmetry is Nasdaq leading the rate quotes by about a
   minute, at sub-tick size.
4. What cannot be ruled out: sub-minute effects, effects confined to rare large surprises (too few events here), and
   other regimes outside Apr–Oct 2026.
