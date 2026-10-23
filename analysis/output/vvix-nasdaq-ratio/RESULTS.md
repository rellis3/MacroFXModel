# vvix-nasdaq-ratio — results

Prereg: `forge/VVIX_NASDAQ_RATIO_PREREG.md` (committed `7de0673a`, 2026-10-23, before any outcome).

- Run 2026-10-23, seed 20261023, 200 shifted-ratio placebos.
- 4,259 sessions, 2009-09 → 2026-08-21.
- Ledger ids: `vvix-ratio-range` (VALIDATED), `vvix-ratio-direction` (UNDERPOWERED).
- Files: `results.json`, `robustness.json`, `power.json`, `FEATURES.md`, `fig_ratio_timeseries.png`,
  `fig_event_paths.png`, `fig_cells.png`.

## The answer to C.OG's question ("when that ratio is at an extreme, what then happens")

**When VIX or VVIX has been moving unusually much per % of Nasdaq movement (top decile of its own last year), VIX falls
over the next month.** By about **7% more** (−0.29 to −0.30 SD of the 20-session VIX change) than the VIX state alone
predicts.

| Cell (top decile → VIX change over the next 20 sessions, entry next close) | Effect | t | Discover / validate / test | Placebo \|t\| p95 | Gate |
|---|---|---|---|---|---|
| R_a: % VVIX move per % Nasdaq move | −0.295 SD (≈ −7.3%) | −3.07 | −0.20 / −0.45 / −0.39 | 2.24 | **pass** |
| R_b: % VIX move per % Nasdaq move | −0.287 SD (≈ −7.1%) | −3.15 | −0.28 / −0.26 / −0.29 | 2.20 | **pass** |
| R_c: VVIX ÷ VXN (implied) | −0.260 SD | −2.95 | −0.13 / −0.46 / −0.22 | 2.35 | fails Holm |

**What it looks like** (`fig_event_paths.png`, 31–33 entries per construction):

- VIX rises 7–11% over the 20 sessions *into* the extreme, while Nasdaq barely moves.
- VIX then gives it back over the following month, and Nasdaq drifts up 1.7–2.3%.

The fear has run ahead of what Nasdaq is doing, and it unwinds. Both passing cells clear **|t| ≥ 3**, the promotion
bar.

## Robustness (post-hoc, demote-only: Amendment A1, `robustness.json`) — none demoted it

| Check | R_a | R_b |
|---|---|---|
| + VIX's own 20-day change (is it plain mean reversion?) | −0.303, t −2.99 | −0.292, t −3.00 |
| + VIX 5d & 20d change, VVIX percentile, VIX z-score | −0.306, t −2.99 | −0.292, t −2.93 |
| Leave one year out (2010…2026), t range | −2.38 … −3.51 | −2.42 … −3.30 |
| Continuous percentile instead of the top-decile flag | −0.538, t −2.85 | −0.527, t −3.08 |

It isn't VIX's own recent rise, it isn't one crisis year, and it's graded rather than only at the extreme.

## Everything else (all 24 cells in `results.json`, `fig_cells.png`)

**Nasdaq direction (`vvix-ratio-direction`): UNDERPOWERED.**

- The top decile shows Nasdaq up over 20 sessions in all three constructions: +0.23 SD ≈ **+1.2%**. t is 2.2–2.4,
  with the same sign in all three periods for R_a and R_b.
- None clears Holm (it needs |t| 3.25) or the placebo for R_a.
- The design can only find ≈ 0.6 SD at 20 days (`power.json`).
- Two 5-day cells are NULL: their intervals exclude ±0.2 SD.

**Range (realised vs implied Nasdaq vol):** not significant after correction. Two suggestive cells:

- implied-ratio bottom decile → wider than implied (+0.41 SD, t 2.94);
- top decile → calmer.

**The bottom decile** (VIX quiet relative to Nasdaq) shows nothing that passes.

## Deviations

- **A1:** robustness checks added after the run (demote-only).
- Otherwise as registered.

## What this changes

- **A VIX context read:** "fear has run ahead of Nasdaq (ratio in its top decile): VIX has tended to give back ~7% over
  the next month". It can go on the vol/range pages as context, and into the forward record.
- **Not a trade yet.** VIX isn't directly tradable. VIX futures (now a chart leg) carry roll and basis, so a short-VX
  rule needs its own costed prereg on VX futures history.
- **Next registered tests:**
  1. the VX-futures rule;
  2. the Nasdaq +1.2% drift, which needs more data or an intraday version on the new VVIX/VXN legs.
