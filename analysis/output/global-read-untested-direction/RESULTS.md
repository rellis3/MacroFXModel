# global-read-untested-direction — results

Prereg: `forge/GLOBAL_READ_UNTESTED_DIRECTION_PREREG.md` (committed in `4b11a61e`, 2026-11-05; amendment A1 in `106512d7`, pre-results). Run 2026-11-05, seed 20261105, B = 2000. Branch `ccr-4824155b-3im5ze`. Ledger ids: `gr-hmm-trend-direction`, `gr-us-yields-direction`, `gr-dollar-tape-direction`, `gr-risk-tone-direction`, `gr-today-tape-direction`.

## Verdict: NULL (all five cells)

The registered gate, per cell, was: Holm p < 0.05 across the five cells, mean per-pair IC ≥ +0.05, and both halves positive. None held. Every cell was powered (MDE 0.027–0.041 below the 0.05 bar), and every 95% interval excludes the bar. So these are real nulls, not empty answers. The Global Read's five never-tested direction reads do not call the next move on the seven dollar pairs.

## Scored cells

Seven pairs; 2016-01-04 → 2026-08-21; 2,772 London-day sessions (19,404 pair-days; today-tape 2,758 / 19,303).

| Cell | Estimate (mean IC) | 95% CI | t | MDE | Pass bar | Holm p | Halves | Cell verdict |
|---|---|---|---|---|---|---|---|---|
| HMM trend → next day | −0.011 | [−0.030, +0.008] | −1.09 | 0.027 | 0.05 | 1.00 | −0.011 / −0.013 | NULL |
| US 10Y 20d → next day | +0.017 | [−0.012, +0.045] | 1.14 | 0.041 | 0.05 | 1.00 | +0.011 / +0.020 | NULL |
| Dollar 20d → next day | +0.006 | [−0.019, +0.032] | 0.49 | 0.037 | 0.05 | 1.00 | +0.011 / −0.000 | NULL |
| Credit tone (BAA10Y) → next day | −0.013 | [−0.032, +0.010] | −1.21 | 0.029 | 0.05 | 1.00 | +0.007 / −0.037 | NULL |
| Today so far (13:00) → 21:00 | +0.002 | [−0.022, +0.026] | 0.17 | 0.034 | 0.05 | 1.00 | +0.013 / −0.008 | NULL |

The HMM read is non-zero on 2,022 of 19,404 pair-days (it only speaks in a confident TREND regime).

## Controls

The time-shift control is the same read against the return two days later. It is near zero throughout, the same order as the scored ICs: HMM −0.017, US 10Y +0.011, dollar +0.011, credit −0.014.

## Deviations from the prereg

A1 (pre-results): the credit cell is scored on `BAA10Y`, because FRED serves HY OAS for only three years. No other deviations.

## Descriptive (not part of the verdict)

- **Live HY OAS credit input, 2023-11 → 2026-08** (4,956 pair-days): IC −0.031 [−0.070, +0.004], the opposite sign to the claim.
- **Today-so-far, other checkpoints:** 10:00 → 21:00 IC +0.010 [−0.013, +0.033]; 16:00 → 21:00 IC −0.021 [−0.045, +0.005]. There is a faint late-day fade, but it is not significant.
- **Per pair:** 49 disaggregation cells (35 scored-cell pairs and 14 checkpoint pairs). None survives BH at q = 0.10. The largest |IC| is 0.033 (EURUSD, HMM, negative).

## What this changes

- **`js/globalReadCore.js` REGISTRY:** `hmm-trend`, `us-yields`, `dollar-tape`, `risk-tone` and `today-tape` go from `untested` to `null`, citing these ledger ids. The panel now reads "tested null (weight 0)" instead of "never tested". The weight was already 0, so the forecast does not change.
- **What would reopen it:** a different horizon (a week rather than a day), or a pre-registered combination of the reads. Re-cutting the same reads at one day is not allowed.
