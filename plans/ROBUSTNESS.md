# Robustness — parameter stability (A9), one-day delay (A6), stress windows

`PYTHONPATH=. python analysis/system/robustness.py` → analysis/output/robustness.{log,json}. 2026-10-06.
Uses only the training years: FIT < 2022-09-05, CHECK 2022-09-05 → 2025-09-04 (793 sessions). The old test year and
the lockbox holdout are untouched.

## Layer 3 — volatility ladder

| arm (widths refit on FIT) | 12-rung miss | regime miss, own-σ buckets | regime miss, **neutral** buckets | HL > p75 by neutral quintile (quiet → busy) |
|---|---|---|---|---|
| HAR 400 bars | 0.44pp | 0.97pp | **0.77pp** | 27.6 / 24.8 / 24.6 / 26.0 / 25.6 |
| HAR 600 | 1.02 | 1.29 | 1.25 | 27.5 / 25.5 / 26.5 / 27.8 / 27.9 |
| HAR 800 (frozen) | 1.07 | 1.29 | 1.29 | 28.6 / 26.4 / 26.9 / 27.0 / 26.1 |
| HAR 1000 | 0.82 | 1.24 | 1.10 | 28.9 / 26.0 / 26.5 / 26.2 / 25.9 |
| HAR 1200 | 0.88 | 1.26 | 1.12 | 28.6 / 26.2 / 26.4 / 26.5 / 26.7 |
| HAR 800, every input one day later | 1.04 | 1.29 | 1.26 | 29.2 / 26.5 / 26.8 / 27.2 / 26.3 |
| live estimator | 0.55 | 0.93 | 1.48 | **30.2 / 25.2 / 24.0 / 23.6 / 19.9** |
| live, one day later | 0.60 | 0.92 | 1.40 | 29.3 / 25.1 / 23.4 / 23.8 / 20.0 |

- **Parameter stability: a plateau.** HAR windows 400–1200 all land within 0.8–1.3pp; no sharp peak at 800 (400 is
  slightly better). Pass.
- **One-day delay: no dependence on exact alignment** (HAR 1.07 → 1.04, live 0.55 → 0.60). Pass.
- **Measurement flaw found in our own regime metric.** Bucketing days by one arm's σ ÷ its median penalises that arm
  (the bucketing variable shares its forecast error — regression to the mean). With own-σ buckets the live estimator
  looks *best* here (0.93) and in the test year it looked *worst* (2.86, bucketed by live σ). With **neutral** buckets
  (trailing realised range) the picture is consistent: the live ladder tilts with the regime (quiet 30%, busy 20%), HAR
  is flatter (29% → 26%), but the gap is **0.2–0.7pp, not the 1.4pp claimed** from the test year. Layer 3's finding
  stands in direction, smaller in size. Regime metrics from now on use neutral buckets.
- **Stress windows** (HL > p75, target 25%): every arm runs well over in the yen unwind (44–51%) and tariff shock
  (31–43%); the live ladder is less over than HAR in both (wider after the first shock day). A volatility forecast lags a
  sudden regime break by construction.

## Layer 5 — remaining travel (R3)

| check | 90-cell miss | worst p75/p90 cell |
|---|---|---|
| R3 fit on FIT, scored on CHECK | **1.46pp** | **4.8pp** (passes the frozen rule on this window) |
| fit on 2016-05 → 2018-12 only | 1.76 | 4.6 |
| fit on 2019 → 2020 only | 1.64 | 5.7 |
| fit on 2021 → 2022-09 only | 1.37 | 5.2 |
| multipliers × 0.95 / × 1.05 | 2.02 / 2.14 | 5.5 / 6.6 |
| σ delayed one session | 1.53 | 6.0 |

- **Stable shape:** multipliers fitted on three disjoint blocks differ by a median 2.8% (coefficient of variation) and
  each scores 1.4–1.8pp. Pass.
- The ±5% rows are not a stability failure: the multipliers are quantiles, so scaling them must miscalibrate; the
  miss rises smoothly (no cliff).
- One-day delay costs a little (worst cell 4.8 → 6.0pp): the session's own σ matters for the late cells.
- Stress windows: p75 exceeded 27% (SVB), 32% (yen unwind), 36% (tariffs) vs 25% — remaining travel is understated
  in shocks, as layer 3's σ is.

## Consequences

1. Lockbox (forge/LOCKBOX_PROTOCOL.md) is unchanged; addendum forge/LOCKBOX_ADDENDUM_1.md (written before any holdout
   data exists) adds the neutral-bucket regime miss as a **reported** metric beside the frozen rule, because the frozen
   rule's buckets are known to favour HAR.
2. The record now says: HAR and IV-adjusted both beat the live ladder on regime calibration, by less than first
   reported; between HAR and IV-adjusted the data cannot choose (plans/SEARCH_BREADTH.md).
3. Forecasts lag regime breaks; sizing (plans/SIZING_RULE.md) should not rely on σ alone on the first days of a shock.
