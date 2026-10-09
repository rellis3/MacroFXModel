# Could a genuine relationship be hidden? Diagnostic review (2026-10-09)

Plan and rules: `plans/RATE_DIFF_NQ_LEADLAG_PLAN.md` ("Diagnostic review", T1–T6, fixed before running; two additions
recorded after T1/T2 with reasons, before T3–T6). Scripts: `scripts/rate_diff_nq/diag_alignment.py`, `daily_long.py`,
`intraday_targets_power.py`. Numbers: `alignment.json`, `daily_long.json`, `daily_models.csv`, `daily_regimes.csv`,
`intraday_targets_power.json`.

## T1 — Timestamps, time zones, DST, candle boundaries: correct

- OANDA NAS100 vs IBKR NQ, 15-min returns: correlation 0.965 at lag 0, and between −0.008 and +0.009 at ±1 and ±2 bars.
  The two Nasdaq sources share the same candle boundaries.
- US CPI and NFP releases (17, Oct 2025 – Jul 2026): Nasdaq and SOFR both spike in the bar containing the release, in
  UTC, in both summer and winter time. Release bar vs the bar before: Nasdaq 0.20% vs 0.08% (summer) and 0.26% vs 0.10%
  (winter); SOFR 4.1 bp vs 0.4 bp. DST is handled correctly.
- Around the 50 largest 1-min Nasdaq moves, the US 2y's largest move falls in the same minute in 22 cases (the modal
  offset).
- **Finding:** the same-bar sign changes by regime. Monthly SOFR vs Nasdaq was +0.08..+0.35 (Oct 2025–Feb 2026) and
  −0.15..−0.53 (Mar–Oct 2026). Daily US 2y vs Nasdaq was +0.31 (1997–2011) and +0.09 (2012–2026).

## T2 — Rate measures: no hidden difference

- TRADES vs MIDPOINT bars give the same results.
- 15-min change correlations: SOFR Dec'26 vs fed funds futures 0.70; SOFR Dec'26 vs SOFR Mar'27 0.72; the 2y
  bond-futures yield vs either 0.45–0.51. The futures-implied measures carry essentially the same information. The 2y
  yields are partly different and were tested separately.
- Daily SOFR / €STR fixings move only at policy decisions and cannot lead intraday.

## T3 — Transform and horizon: daily 1997–2026 (7,158 days; explore 1997–2011, confirm 2012–2026)

- **Design:** US 2y − German 2y spread and each leg, as 1-day change, 5- and 20-day momentum and 60-day z-score. Targets:
  next 1, 5 and 20-day Nasdaq return. Controls: own returns and volatility (HAR).
- **Results:**
  - 2 of 72 models pass FDR in explore, and neither replicates.
  - Out of sample the rate variable improves forecasts in 42% of models (chance-like).
  - No cointegration between log Nasdaq and the spread or the US 2y level (Engle–Granger p 0.22–0.99).

## T4 — Other targets

- **Daily:** next-day absolute return and 5-day volatility: 0 replicate. Next-day direction: out-of-sample AUC 0.49–0.51
  with or without the rate variable. Next-day range (2018–2026): signs disagree between halves.
- **Intraday (15-min bars, Apr–Oct 2026; controls for Nasdaq's own volatility and the hour of day):** the rate move's
  size → next-hour realised volatility: |t| ≤ 1.4 in both halves, out-of-sample R² change +0.01%..+0.07%. → next-hour
  range: the same picture. Direction: AUC 0.489–0.492 with or without.

## T5 — Regimes (66 regime × predictor cells → next-5-day return)

- **Regimes tested:** Nasdaq volatility terciles; 50-day trend; 6-month rate cycle; the stock-rates sign regime;
  announcement days 2014+.
- 4 cells pass FDR in explore, all "non-announcement days 2014–2019, spread or US 2y momentum/z-score → negative". None
  replicates in 2020–2026 (t −0.9 to +0.9).

## T6 — Power: how big a lead could the grid have missed?

The grid rule is FDR over the 600-cell family, then same sign and |t| > 1.96 in confirm. A known one-bar lead was
planted into the real data, with 30 day-block resamples each:

| planted correlation | 1-min | 15-min |
|---|---|---|
| 0.01 | 0% | 0% |
| 0.02 | 13% | 0% |
| 0.03 | 33% | 3% |
| 0.05 | 47% | 0% |

The 600-cell grid was too strict to find a small lead, especially at 15 min. So "no cell survives" is weak evidence on
its own. The confidence intervals are the informative part. They pool both halves (inverse variance) for a one-bar lead,
and they hold within this 2026 regime:

| series | 1m rate first / Nasdaq first | 5m | 15m | 60m |
|---|---|---|---|---|
| 2y spread | +0.001 [−0.007, +0.009] / +0.006 [+0.001, +0.011] | +0.007 [−0.005, +0.019] / −0.001 [−0.013, +0.010] | +0.022 [−0.005, +0.049] / −0.014 [−0.033, +0.006] | +0.010 [−0.040, +0.061] / −0.006 [−0.044, +0.031] |
| US 2y | +0.006 [−0.003, +0.015] / +0.004 [−0.003, +0.011] | +0.009 [−0.003, +0.020] / +0.012 [−0.005, +0.029] | −0.010 [−0.036, +0.016] / −0.004 [−0.028, +0.020] | +0.026 [−0.028, +0.080] / +0.030 [−0.028, +0.088] |
| DE 2y | +0.003 [−0.004, +0.009] / −0.004 [−0.011, +0.003] | +0.008 [−0.005, +0.022] / +0.013 [−0.003, +0.028] | **−0.038 [−0.062, −0.014]** / +0.025 [+0.003, +0.048] | +0.003 [−0.037, +0.043] / +0.051 [+0.012, +0.089] |

One pooled cell excludes zero on the rate-first side: DE 2y at 15 min. A German 2y yield rise is followed by Nasdaq
lower over the next 15 minutes, −0.038. With about 600 cells, roughly 30 exclude zero by chance, and this one did not
pass FDR in either half alone. It is a candidate for a single pre-registered test on new data, not a finding.

## Post-hoc pattern (seen on all data; labelled, not a finding)

The US 2y's largest move sits 1–3 min before Nasdaq's largest moves more often than after: Apr–Jun 6 vs 2, Jul–Oct 5 vs
2, so the timing pattern recurs in both halves. But in those rate-first cases the rate's direction matched Nasdaq's
usual opposite move only 3 of 6 and 3 of 5 times: it says when a big move is coming, not which way. That fits rates
reacting first to the same release, with Nasdaq's largest minute often the one after the release minute.

## Classification

| horizon | verdict | why |
|---|---|---|
| 1–5 min | **genuinely little predictive information** | Alignment correct, measures checked, tight intervals: any one-bar lead is below about ±0.01 (1m) and ±0.02 (5m) in correlation, a fraction of a tick. The one stable asymmetry is Nasdaq leading the rate quotes by a minute. |
| 15–60 min | **insufficient data to rule out a small effect** | Six months of 1-min data gives intervals of ±0.03–0.05 (15m) and ±0.05–0.08 (60m). The grid had near-zero power at these sizes. One candidate cell (DE 2y, 15m). A correlation of 0.05 would still explain only 0.25% of Nasdaq's 15-min variance. |
| daily to monthly | **genuinely little predictive information** | 29 years, many transforms and targets: nothing replicates, direction AUC ≈ 0.50, no cointegration. |
| same bar | **real but conditional** | The rate legs move with Nasdaq in the same bar, and the sign of that link changes by regime (Mar 2026; 1997–2011 vs 2012–2026). The US–EU differential cancels it whenever both legs move together. |

**What would settle 15–60 min:** more intraday history (expired 2y bond futures 1-min from IBKR for 2024–2025), then ONE
pre-registered test: DE 2y (and the spread) one bar ahead at 15 min, with its sign fixed (negative), judged on data not
used here, within the current stock-rates sign regime.
