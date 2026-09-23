# Pre-registration — Is the wall-touch rejection about the WALL, or about touching anything?

Written 2026-09-23, after the 7-pair pooled run (13_pool_multi_pair.py) and before
`17_wall_placebo.py` exists. Frozen.

## Why

The book's one surviving finding (Parts 9b/15, now pooled across 7 instruments:
15-min break rate 38% calls / 40% puts, ~180 episodes, p < 0.001) is tested against a
flat 50%. That yardstick is biased toward "reject" by construction in
`05_intraday_validation.py`: a touch fires when price comes within TOUCH_BUFFER (2 pips)
SHORT of the level, but a break requires the close h minutes later to be BEYOND it.
Short-horizon mean reversion pushes the same way. This repo already closed a level-touch
book on exactly this (paired control, 2026-09-10). The OI book never ran a control.

## Control

Identical code path (05's `detect_touch_events` / `_classify_event`, same buffers,
same T-1 lag, same approach side) applied to placebo levels on the same days:

- **Grid placebo (PRIMARY):** the listed strikes ±1 and ±2 strike increments from the
  wall — same round-number status, same days, less OI. Increment = the instrument's
  modal native strike step; inverted pairs are shifted in native terms then inverted.
- **Off-grid placebo (secondary):** wall ± 0.5 increments — not a listed strike,
  not a round number.
- A placebo is dropped on a day where it lands within half an increment of the
  opposite wall.

## Test

Pooled across 7 instruments, per side (call, put), horizons 15 / 60 / 240 min:
difference = wall break rate − grid-placebo break rate. 95% CI by cluster bootstrap,
resampling (instrument, ISO week) clusters, 2,000 reps.

- **PASS (wall-specific effect is real):** at 15 min, difference < 0 with the CI
  excluding 0 on BOTH sides, and magnitude ≥ 3 pp.
- **FAIL:** the grid placebo's break rate sits inside the wall's range → the "wall
  effect" is touch mechanics + round numbers, and the live "wall-touch read" on
  oi-dashboard.html is describing something that happens at any listed strike.

Also reported: off-grid placebo rate (does round-number status matter on its own?)
and per-instrument differences.

**Amendment before any placebo result was computed:** modal native strike steps measured
from the raw chains are 0.005 for all FX (5e-5 for JPY native) and 10 points for NAS100.
NAS100 uses 100 points instead: 10-point neighbours sit ~0.05% from the wall and get touched
in the same minute, so they are not an independent control. 100 is NQ's second-most-common
listed step and the grid its walls sit on.

---

## RESULTS (run 2026-09-23) — FAIL. The wall-touch effect is touch mechanics.

Raw: `data/results/wall_placebo_results.json`, events `data/results/wall_placebo_events*.csv`.
Wall event counts reproduce 13_pool_multi_pair.py's exactly (e.g. USD_CHF 276/270), so the
placebo runs through the identical detector on identical data.

| Side | Horizon | Wall break % | Grid placebo % | Off-grid % | Wall − grid (pp) | 95% CI |
|---|---|---|---|---|---|---|
| call | 15 | 38.0 | 38.7 | 36.5 | −0.6 | −3.2 … +1.9 |
| call | 60 | 45.4 | 44.9 | 42.1 | +0.4 | −2.7 … +3.6 |
| call | 240 | 47.7 | 48.1 | 45.8 | −0.4 | −4.6 … +3.8 |
| put | 15 | 40.1 | 38.1 | 38.3 | +2.1 | −0.3 … +4.6 |
| put | 60 | 42.7 | 43.3 | 44.3 | −0.6 | −4.1 … +2.8 |
| put | 240 | 47.4 | 45.3 | 44.8 | +2.1 | −2.1 … +6.1 |

(~2,300–2,900 wall touches vs ~9,400–11,300 grid-placebo touches per row, ~740–800
instrument-week clusters.)

- Neighbouring listed strikes "reject" exactly as often as the max-OI wall. Arbitrary
  off-grid prices do too — so it is not even a round-number effect.
- Put walls break slightly MORE than their neighbours at 15 min (CI just touches 0).
- Per instrument at 15 min, the wall beats the grid placebo in 6 of 14 side-cells —
  a coin flip.

**Verdict.** The book's one surviving finding — ~60% rejection at walls over 15–60 min,
clustering-corrected, now "replicated" on 7 instruments — is produced by the detector
(touch counted 2 pips SHORT of the level, break needs a close BEYOND it) plus short-horizon
mean reversion. It happens at any price. The 7-pair replication replicated the artefact.
The live "Live wall-touch read" on oi-dashboard.html is describing this artefact, and the
break/reject classifier (Part 15) was classifying it.
