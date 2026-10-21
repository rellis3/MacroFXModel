# yield-predictive-ladder — results

Prereg: `forge/YIELD_PREDICTIVE_LADDER_PREREG.md` (committed `dd23d436`, 2026-10-21; Amendment A1 PRE-RESULTS in
`7ed7a80b`; hypothesis matrix committed before results in `849b8aa5`).

- Run 2026-10-21, seed 20261021, 200 shifted-rates placebos, B = 2000 block bootstrap.
- Ledger ids: `yield-ladder-eurusd`, `yield-ladder-nq`.
- Machine-readable: `results_eurusd.json`, `results_nq.json`, `planted.json`. Data: `DATA_AUDIT.md`. Pre-results
  hypotheses: `HYPOTHESIS_MATRIX.md`. The whole rates book: `SYNTHESIS.md`.

Evidence labels used throughout: **D** descriptive, **P** predictive (out of sample), **C** causal, **T** tradable
after costs.

## Verdicts

| | EURUSD (`yield-ladder-eurusd`) | Nasdaq-100 (`yield-ladder-nq`) |
|---|---|---|
| **Ledger verdict** | **NULL** at 5 and 20 days (rate forecasts were *anti*-predictive out of sample); 1 day underpowered | **UNDERPOWERED** (the ladder collapsed to "always long"; the positive control finds only large edges) |
| Scored cells passing (of 12 each) | 0 | 0 |
| Same-day link (D) | Real and component-specific. US−DE 2y −0.13 / −0.18 / −0.21; real 10y −0.10 / −0.08 / −0.22; US 2y strengthening to −0.25 in 2020–26 | Real until 2019, then gone or flipped. US 2y +0.35 / +0.31 / +0.02; breakeven +0.27 / +0.32 / +0.19; real 10y +0.22 / +0.16 / −0.11 |
| Rates lead the asset (P, direct lag profile) | No. Lag +1 looks consistent, but that window overlaps the noon FX print with the 15:30 yields, so it is not a lead. Lags ≥ 2: nothing holds across periods | Weak. US 2y at lag 1: −0.045 / −0.061 / −0.048; after controlling for Nasdaq's own lag-1 reversal it is t −0.6 / −1.8 / −1.7. Not significant |
| Asset leads rates | Weak | **Yes.** 28 reverse-direction cells pass BH vs 4 forward. Granger asset→rates p ≤ 0.025 for real yields and breakevens in all three periods. Equities move first, rates follow |
| Incremental OOS value (P), M2–M5 vs M1 | None. Test Clark–West t ≤ 1.15; OOS IC at 5d −0.10..−0.11, at 20d −0.18..−0.21 (intervals below 0) | None. Test CW t ≤ 1.0; ICs −0.04..−0.24 with wide intervals; models effectively constant-long |
| Regimes (R1 real-yield trend, R2 hawkish, R3 risk-off, R4 high vol, R5 releases) | No regime makes the forward IC positive; most are negative | No regime makes the forward IC positive |
| Tradable after costs (T) | No rate model beats M1's rule (every 95% interval of the Sharpe difference includes or sits below 0). Test net Sharpe −0.61..+0.08 vs buy and hold +0.09 | Rules equal buy and hold (Sharpe 0.71) because the forecasts never turn negative; M5 at 5/20 d is worse |

## The registered gate, and why the Nasdaq word is UNDERPOWERED

No cell passed the conjunctive Validation and Test gate. Holm across the 24 found nothing.

The **positive control** (`planted.json`, `fig_planted.png`) was added after the scored run. It's a mechanics check,
not a scored test. It plants a synthetic rate feature with a known correlation to the future return, then re-runs the
exact ladder:

| planted ρ | EURUSD 1d | Nasdaq 1d | EURUSD 5d | Nasdaq 5d |
|---|---|---|---|---|
| 0.03 | 0/3 detected | 0/3 | 0/3 | 0/3 |
| 0.05 | 0/3 | 0/3 | 0/3 | 0/3 |
| 0.10 | 3/3 (recovered IC only ≈ 0.05) | 3/3 (≈ 0.04) | 0/3 | 0/3 |

Cross-validated ridge on daily returns picks heavy shrinkage (λ = 1000 in 9 of 12 Nasdaq years). The ladder therefore
cannot see an incremental edge below ≈ 0.10 at 1 day, nor even 0.10 at 5 days. My prereg power table assumed an ideal
IC test, so it **overstated the design's power**. That is my error, and it is corrected here by demoting, not by
re-running a stronger model after seeing the outcome. So:

- **Nasdaq is UNDERPOWERED.** Its forecasts never expressed a view (always long). The direct lag profile, which is
  unshrunk, shows only the weak US 2y lag-1 pattern above.
- **EURUSD is NULL at 5 and 20 days.** There the models *did* express a rate view: forecast dispersion was large
  enough to produce an IC of −0.10 to −0.21. It was wrong in Validation and Test, in every regime, without the term
  premium, with inputs a day staler, and without the biggest days. The 95% interval of the OOS IC excludes the
  +0.10 bar. Relationships fitted on 2005–14 reversed afterwards.
- **EURUSD 1 day** is UNDERPOWERED by the positive control: test IC −0.019 [−0.067, +0.029].

## Robustness (Phase F, M3 OOS IC, 1d / 5d / 20d)

| variant | EURUSD | Nasdaq |
|---|---|---|
| as registered | −0.024 / −0.104 / −0.182 | −0.011 / −0.043 / −0.030 |
| without the term premium | −0.031 / −0.106 / −0.187 | −0.010 / −0.042 / −0.051 |
| inputs one day staler (d−2) | −0.043 / −0.121 / −0.160 | −0.012 / −0.046 / −0.032 |
| release days excluded | −0.015 / −0.100 / −0.188 | +0.001 / −0.043 / −0.031 |
| release days only | −0.081 / −0.132 / −0.143 | −0.095 / −0.048 / −0.017 |
| top 1% moves dropped | −0.024 / −0.104 / −0.182 | −0.009 / −0.038 / −0.030 |

By year (M3, 1 day), the IC moves between −0.12 and +0.10 with no persistence; see `results_*.json`. The EURUSD 20d
cumulative-error chart turns positive only in a few weeks of 2026 (`fig_oos_eurusd.png`). That's concentration, not
a signal.

## Deviations from the prereg

- **A1 (PRE-RESULTS):** publication lags for the broad dollar and the term premium; oil floor; in-window winsorising.
- **Post-hoc, demote-only:**
  - The positive control was added after the scored run. It demoted Nasdaq to UNDERPOWERED and EURUSD 1d to
    UNDERPOWERED.
  - The EURUSD lag +1 reading was disqualified as timing overlap, which demotes it.
  - The Nasdaq US 2y partial regression is descriptive only.
- **Not done:** the brief's SOFR/€STR implied paths (no daily history before 2024); GBPUSD, USDJPY, S&P, gold, crude
  (the brief says expand only after the method validates, and it did not validate as a detector).

## Charts

- `fig_rolling_*.png`: rolling same-day correlation and beta with 95% bands (deliverable 3).
- `fig_lagprofile_*.png`: lag profiles with uncertainty (deliverable 4).
- `fig_oos_*.png`: out-of-sample error comparison (deliverable 6).
- `fig_planted.png`: positive control.

## What this changes

- **Nothing goes live.** Do not describe any decomposed rate variable as leading EURUSD or Nasdaq at 1–20 days.
- Same-day attribution stays valid (D), with the period-dependence above. For Nasdaq the same-day sign changed after
  2019.
- The shortlist of what is still worth testing, and the data each needs, is in `SYNTHESIS.md`.
