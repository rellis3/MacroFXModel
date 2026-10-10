# Level engine Phase 2: results (reach, which-first, time-to-reach), 2026-10-11

**Registration:** `forge/LEVEL_P2_PREREG.md`, committed before any outcome was computed.

**Registry:** v1 (`plans/LEVEL_REGISTRY_V1.md`, frozen). 13 level families, 34 instruments, checkpoints 03/07/10/13/16 London.

**Rows:**
- reach: 15.0M (fit < 2022: 8.16M; E-dev 2022–24: 4.43M; E-conf 2025-01 → 2026-08-20: 2.41M; **E-conf is non-independent**);
- races: 448k.

**Not used:** the forward block. No production change. Reaction after a touch was not studied.

## 1. Reach probability: ACCEPTED (M1 calibrated geometry beats both baselines at every horizon)

| Horizon | Realised % (E-conf) | B1 vol-time geometry % | M1 % | M1 Brier skill vs B1 [95%], conf / dev | Calibration gap, B1 → M1 (conf) | B1 vs naive B0 (conf) |
|---|---|---|---|---|---|---|
| 30 min | 1.9 | 2.3 | 1.9 | **+5.4%** [4.3, 6.5] / +4.0% | 5.1 → **0.4pp** | +1.9% |
| 60 min | 3.6 | 4.1 | 3.6 | **+4.3%** [3.4, 5.4] / +2.9% | 7.3 → **0.5pp** | +3.1% |
| 120 min | 6.2 | 6.9 | 6.3 | **+3.4%** [2.6, 4.3] / +2.5% | 7.7 → **0.5pp** | +4.3% |
| 240 min | 10.4 | 11.2 | 10.5 | **+2.5%** [1.8, 3.2] / +1.7% | 6.8 → **0.5pp** | +4.2% |
| 22:00 London | 22.1 | 23.4 | 22.5 | **+1.7%** [1.1, 2.2] / +0.7% [0.4, 1.0] | 5.7 → **0.9pp** | +0.3% [−0.0, 0.5] |

**Holm p = 0.003.** By class, every interval is above 0:
| Class | Skill vs B1 |
|---|---|
| Crosses | +1.4% |
| Majors | +1.6% |
| Indices | +2.0% |
| Gold | +3.3% (but calibration 6.2pp: weakest) |

By year: 2025 +1.4%, 2026 +2.0%. By checkpoint, all positive (16:00 strongest, +5.1%). By distance band, all positive.

**Reading:**
- **Distance ÷ (σ·√vol-time left)** is the right baseline. B1 beats naive calendar-time geometry by 2–4% within the day.
- **The calibrated model's main gain is calibration.** Plain geometry overstates reach by 5–9pp at the decile level (Brownian motion with no mean-reversion of intraday range). M1 brings that to ≤ 1pp, adding range used, the extension side, the hour and class.

## 2. Level identity adds NO reach information (family invariance)
- **Overall:** adding family dummies to M1 gives Brier skill −0.01% [−0.03, +0.02] on E-conf (−0.03% on E-dev).
- **By family:** no family has a positive interval. This covers ladder lines, pivots, prior high/low, round numbers, volume profile, VWAP, both fib families, swing S/R, daily opens, today's open, and the Asia and London high/low.
- **The probability of reaching a level is set by where it is, not by what it is.** This matches the earlier placebo results at the reach stage.

## 3. Time to reach: ACCEPTED
- **Skill:** integrated Brier over the 30/60/120/240-minute and 22:00 horizons, M1 vs B1: **+2.6%** [1.9, 3.3] conf, +1.6% [1.3, 2.0] dev; Holm p = 0.003.
- **Median minutes to reach, among levels reached (E-conf):**

| Distance | Median minutes |
|---|---|
| < 0.25σ | 70 |
| 0.25–0.5σ | 213 |
| 0.5–1σ | 345 |
| 1–2σ | 471 |
| 2–3σ | 520 |

## 4. Which level first (race): NOT ACCEPTED, the random walk already answers it
- **Skill:** M1-race vs b ÷ (a + b): +0.05% [−0.03, +0.12] conf, −0.01% dev; Holm p = 0.14.
- **The baseline is already calibrated** (1.8–2.3pp).
- **Up-first share:** 51.4% (conf) against the baseline's 50.7%, a slight up tilt.
- **Other outcomes:** "neither" 5%; same-minute ambiguous 0.1–0.4%.
- **Reading:** given the distances to the nearest level above and below, which one is touched first is a coin weighted by distance. No other state information improves it. This is the reflection principle at arbitrary levels, the same finding as the ladder path map.

## What this delivers to the engine
- **Reach (Q1) and time (Q4):** a **calibrated, validated reach-and-time model for any level price**, regardless of source.
  - **Inputs:** distance, σ_export, the class vol-time profile, range used, extension side, hour, class.
- **Race (Q2):** **b ÷ (a + b)** is the validated race answer. No model is needed.
- **Level identity / strength:** **no reach-side value**. A "strong" level is not more (or less) likely to be reached. Any level-strength claim must come from reaction (Phase 3, not studied here), and every reaction test so far is null.

## Limitations
- E-conf is non-independent.
- Gold calibration 6.2pp at 22:00: the weakest class.
- Intraday references (open, Asia, London) do not track re-touches since they formed.
- Checkpoints are 5 per day, not continuous.
- The M1 coefficients (fit < 2022) were not exported. Freezing a model for a prospective shadow is the next step.
