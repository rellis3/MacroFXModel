# event-vol-ramp — results

Prereg: `forge/EVENT_VOL_RAMP_PREREG.md` (committed in `d7acf234`, 2026-11-14; A1 PRE-RESULTS in `9b5874ea`). Run 2026-11-14, seed 20261114, B = 2000.
Branch `main`. Ledger id: `event-vol-ramp`. Scripts `scripts/event-vol-ramp/` (`run.py`, `finish.py`).

## Verdict: UNDERPOWERED (both cells)

With the level of the front ratio (the `vol-curve-front` variable), the implied-to-realised ratio, event-family and weekday controls in the model, the extra event-day range per one SD of pre-event front-ratio ramp is **SPX500 +0.033 [-0.047, +0.112]** and **NQ +0.044 [-0.030, +0.117]** (DR units per SD, 322 event days; t 0.81 and 1.17; Holm p 0.48 and 0.48). The registered gate (b ≥ +0.05, lower end > 0, Holm p < 0.05, above 95% of shift placebos) fails in both, and the intervals reach past the +0.10 operational bar, so neither can be called null: the design MDE was 0.114 / 0.105, just above that bar. The points are small and positive, in the direction the idea predicts, and the front level (b_L 1.93 / 1.37) carries far more than the ramp.

## Scored cells

| Cell | n (events) | b_ramp×event | 95% CI | SE | t | Holm p | MDE | Placebo below real | Cell verdict |
|---|---|---|---|---|---|---|---|---|---|
| SPX500 | 2726 (322) | +0.033 | [-0.047, +0.112] | 0.040 | 0.81 | 0.48 | 0.114 | 0.81 | UNDERPOWERED |
| NQ | 2726 (322) | +0.044 | [-0.030, +0.117] | 0.037 | 1.17 | 0.48 | 0.105 | 0.92 | UNDERPOWERED |

## Controls (THE MIRROR) and descriptive

- **Positive control (A1, before scoring):** event days are wider than ordinary days (mean DR 1.16 vs 1.00 SPX500; 1.11 vs 0.97 NQ) and the B0 family dummies are positive (SPX500 FOMC +0.081, CPI +0.051, NFP +0.119); the day after an FOMC is also wide.
- **The ramp on ordinary days is not zero:** SPX500 -0.043 [-0.071, -0.018], NQ -0.016 [-0.041, +0.008]: with the level in the model, a rising front ratio goes with a slightly narrower ordinary day (the ratio mean-reverts). The event interaction is the ramp's effect on event days over and above that.
- **By family (point estimates, not tested; BH not computed):** ramp × NFP +0.131 (SPX500) / +0.155 (NQ), CPI +0.013 / +0.027, FOMC -0.072 / -0.085. The pooled number is carried by payrolls; FOMC is negative.
- **Alternative ramps:** VIX9D alone over two sessions +0.033 / +0.035; one-session ratio ramp +0.092 / +0.105.
- **Halves (SPX500):** +0.026 then +0.030; (NQ): +0.034 then +0.042. Stable sign and size across halves.
- Both instruments share the same VIX inputs and event dates: one source of evidence counted twice.

## Deviations from the prereg

A1 (PRE-RESULTS): sample, design SE/MDE and the alignment check. No other changes. The prereg's "BH q = 0.10 for the family split" was not computed: the family estimates are reported as points only because the pooled cell did not pass.

## What this changes

Nothing live. The terminal may show the front ratio's level as a range read (`vol-curve-front`, validated) and may mention that "the front ratio rose into the event" as a description; it may not use the ramp as an input or multiplier. A larger sample (more event days, other events such as ECB/BoE, or the intraday VIX1D/VIX9D path) is the way to settle a ramp effect of about +0.05 per SD; this one cannot see anything under about +0.11.
