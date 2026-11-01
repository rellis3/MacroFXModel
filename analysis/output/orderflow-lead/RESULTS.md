# orderflow-lead — results

Prereg: `forge/ORDERFLOW_LEAD_PREREG.md` (committed in `6950f0ee`, 2026-11-01; amendment A1 PRE-RESULTS). Run 2026-11-01, seed 20261101, B = 2000 (500 per hour slice).
Branch main. Ledger id: `orderflow-lead`.

## Verdict: NULL

NQ 5-minute buy/sell imbalance (tick rule, NT8 ticks, regular hours) does not predict the next 5 or 15 minutes once the bar's own return and the previous bar's return are controlled. Both scored cells were powered (MDE 0.037 and 0.042 against a 0.05 bar) and both intervals sit around zero. 189 sessions, 2025-11-06 to 2026-08-21 (lockbox sealed), 14,302 bars.

## Scored cells

| Cell | n | Slope (SD units) | 95% CI | MDE | Pass bar | Holm p | Halves (1st / 2nd) | Placebo range (20 shifts) | Cell verdict |
|---|---|---|---|---|---|---|---|---|---|
| h = 5 min | 14,302 | -0.0023 | [-0.027, +0.020] | 0.037 | 0.05 | 0.85 | -0.012 / +0.007 | [-0.018, +0.014] | null |
| h = 15 min | 13,924 | +0.0028 | [-0.025, +0.029] | 0.042 | 0.05 | 0.84 | +0.001 / +0.005 | [-0.015, +0.016] | null |

## Controls

- Placebo (imbalance from the session k = 1..20 days later, same bar): means +0.001 and +0.002, near zero, so the design is not biased. The real slopes sit inside both ranges.
- Decay check (A1, descriptive): the previous bar's imbalance gives +0.011 (h = 5) and -0.008 (h = 15).
- Sessions: 189 of about 190 planned; one trading day (2026-08-12) was not served by the bridge. The rest of the empty days are holidays.

## Deviations from the prereg

A1 (PRE-RESULTS): the future-flow time-shift check was withdrawn because for h = 5 the next bar is the outcome window, so it would trip on any data; replaced by the descriptive previous-bar check. The scorer reads second-resolution timestamps (the first download stored seconds under a millisecond name); bar assignment needs only whole seconds.

## Descriptive (not part of the verdict)

- h = 30: -0.009. Raw delta (not ratio) z-scored: +0.026 (h = 5), +0.031 (h = 15). 30-minute running imbalance: -0.004 and -0.013.
- Hour-of-day slices, registered with Benjamini-Hochberg at q = 0.10 over 14 cells (`hours_bh.json`): no cell survives. The first two New York hours show +0.057 to +0.063 in both horizons (smallest p 0.066) against a BH threshold of 0.007; later hours straddle zero. Candidates for nothing; reported as a description.

## What this changes

Card 05f on OI Lab v2 stays a description of flow with no projection line. A tick-rule delta cannot lead price by construction and in 189 sessions it does not. Reopen only with quote-matched or order-book flow (`orderflow-lead-quoted`), which needs the bridge to serve bid/ask history or a recorded live book.
