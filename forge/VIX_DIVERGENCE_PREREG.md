# VIX vs Nasdaq divergence at the vol lines (hourly) — pre-registration

Committed 2026-10-02 before any VIX history was pulled for this test. COG: "the important factor would be comparing the relative
move of VIX against the relative move of the Nasdaq." VIX normally moves against the index by a stable amount; the idea is that
when VIX does NOT move as the index's move implies, the move is not trusted (fade) or is confirmed (continue).

## Data
- VIX: Yahoo Finance ^VIX 1-hour bars (free, unofficial), pulled 2026-10-02 into analysis/output/rangebook/vix/, available
  2023-12 → now, 03:15–16:15 New York only.
- NQ and SPX: the local M1 history (NQ to 2026-08-21, SPX to 2026-06-05); hourly closes = the last M1 close before each hour.
- Book passes: NQ and SPX Fade/Continue Book passes inside the VIX coverage (2023-12-18 onward, touch hour with a completed
  VIX hour before it).

## Divergence (all from completed hours before the touch)
For the last completed clock hour H before the touch: dV = Δln VIX over H, dX = Δln index over H. β = OLS slope of dV on dX over
the previous 20 trading days of hours (≥ 60 pairs), residual e = dV − β·dX, z = e ÷ SD of the residuals in that window.
s = z × touch direction (+1 up line, −1 down line).
- **Against** (VIX not confirming the move): s ≥ +1 — e.g. index rising into an up line while VIX is higher than the rise implies.
  Prediction: FADE more.
- **With** (VIX over-confirming): s ≤ −1. Prediction: CONTINUE more.

## Tests (fixed)
- T1: within-cell (line family × London hour × range used) continue difference, against vs with, NQ and SPX pooled;
  day-bootstrap 95% CI; halves = 2023-12–2024 vs 2025–2026. REAL = CI excludes 0, same sign both halves, and NQ and SPX alone
  point the same way.
- T2: fade R for "against", follow R for "with"; > 0 in both halves = PASS.
- Descriptive: the same split on the rich-IV BREAK trades for NQ/SPX (does divergence add to the paper-record rule?).
Resolution caveat recorded in advance: hourly is far coarser than COG's minute-level reading; a null here does not rule out the
intraday version, which the live 1-minute capture (started 2026-10-02) exists to test later.
