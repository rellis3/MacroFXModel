# VF3 Stage C: results for review (2026-10-10)

**Registration:** `forge/VF3_STAGE_C_PREREG.md` (commit `7659e983`), written before any Stage C outcome was computed.

**Scripts:** `scripts/forecast_history/vf3_stage_c_p1.py`, `vf3_stage_c_p2.py`, `vf3_stage_c_p3.py`. Detail is in `p1.json`, `P2.json`, `P3.json`.

**Nature of the evidence:** everything is **retrospective on previously explored data**. E-conf (2025-01 → 2026-08-20) had never been used for these tables, but the period was explored before, so it is **non-independent**. The untouched forward block was **not used**. No production parameter, page, bot or trade selection was changed.

## Lockbox and the as-shipped production ladder
The fitted ladder's code and parameters were first committed on 2026-08-20, so the ladder first shipped for the 2026-08-21 session. **There is no as-shipped production ladder history inside the examined data.** It cannot be scored as shipped without the forward block, so it was not scored (limitation reported). The registration proposes one final confirmation plan for that block.

## P1: intraday probability correction: large, stable improvement; NOT accepted under the registered calibration rule

**Baselines (exact):**
- **Display:** the page's formulas.
  - T1, path stats: `oos_exceed(next) ÷ oos_exceed(this)`.
  - T2, card: 2(1 − Φ((1 − consumed) ÷ √(1 − UTC clock fraction))).
- **Clim:** the training rate.
- **Challenger:** frozen tables fitted before 2022.
  - T1: hour of touch × step.
  - T2: hour × consumed decile.
  - Shrinkage m = 30.
- **T7:** the existing band read, as a comparator.

| Endpoint (E-conf) | n (dates) | Realised / display / challenger % | Brier skill vs display [95%] | vs Clim | Calibration gap display → challenger | By year (dev / conf) | Verdict |
|---|---|---|---|---|---|---|---|
| T1 next line (export O-H/O-L rungs) | 20,802 (424) | 45.5 / 46.2 / 47.3 | **+7.1%** [6.0, 8.3] | +7.2% [6.0, 8.4] | 3.5 → **4.1pp** | +8.6, +7.9, +8.3 / +6.9, +7.5 | Fails calibration ≤ 3pp only |
| T2-L_B range to export HL p50 | 223,477 (424) | 34.8 / 55.5 / 38.9 | **+27.8%** [25.9, 29.6] | +15.8% [14.4, 17.2] | 35.3 → **6.6pp** | +23.5, +25.8, +26.4 / +28.2, +27.1 | Fails calibration only |
| T2-L_A range to COG median (as on the card) | 241,451 (424) | 22.2 / 51.0 / 26.1 | **+40.5%** [36.9, 43.8] | +15.2% [13.4, 17.2] | 42.1 → **6.7pp** | +29.2, +35.2, +38.3 / +41.1, +39.3 | Fails calibration only |

- Holm-adjusted p = 0.003 for all three.
- All 34 instruments are positive on every endpoint, with no class failing.
- **T1 vs T7:** the challenger beats T7 (+1.2% [0.2, 2.2]); the current display is worse than T7 (−6.4%).
- **Weak cells:**
  - T1 London session +1.5% [−0.4, 3.1];
  - T2-L_B Asia −0.6% [−1.1, −0.1];
  - T2-L_B lowest consumed tercile +0.4% [−0.1, 0.9].
- **Gains** are concentrated in the NY and late sessions and at high range consumed, where the display is worst.

**Reading:** the current displays are badly miscalibrated (T2 shows 51–56% for events that happen 22–35% of the time). The challengers rank and level far better. **Their remaining failure is level drift:** tables frozen on pre-2022 data run about 2–4pp high in 2025–26. This is a calibration-maintenance problem, not an information problem.

## P2: release-day width correction: NULL (not accepted)

| | Pinball ratio, corrected ÷ existing [95%] | NFP HL p75 exceedance (existing → corrected) | Folds better on NFP + CPI |
|---|---|---|---|
| S + E vs S (all 34; 71 NFP / 68 CPI dates) | overall 1.000 [0.999, 1.001]; NFP + CPI 1.001 [0.996, 1.006] | 31.4 → 31.6% | 2 of 6 |
| SI + E vs SI (IV-13) | overall 1.000 [0.998, 1.002]; NFP + CPI 0.997 [0.983, 1.014] | 39.2 → 34.2% | 3 of 6 |

**Reading:**
- A σ-level event term does not fix release days. The chosen ladder's under-coverage on NFP (31–39% at the p75 line) looks like a **shape (tail) effect**: release days have fatter upper tails, not just a larger σ.
- Only about 70 dates per event type, so the test is power-limited.
- **The current ladder stays unchanged.**
- The chosen ladder (SI) covers NFP worse than S on the IV instruments (39% vs 31%). This is a known weakness to monitor, not to fix with this term.

## P3: consolidation shadow: freeze check done
- **The reduced model (no implied vol, plus London hour)** is within **0.07%** Brier of the registered model (0.23269 vs 0.23252, n = 500,679, 2022–24) → **freeze E2-hour** (the rule was within 0.2%).
- **Caveat:** both models' worst calibration decile is **5.3–5.5pp** off on 2022–24, so the shadow's ≤ 3pp rule would likely fail. The same level-drift problem as P1.

## What the three results say together
- **The existing information already ranks intraday outcomes well:** clock, distance and range consumed.
- **What breaks is calibration maintenance:** probability tables and models drift by 2–7pp when frozen for years.
- **The release-day problem is distributional and needs a different, registered approach** (event-specific widths). There are only about 70 dates per type.

## Ranked next steps (practical value × implementation risk); each needs registration before any outcome

| Rank | Step | Value | Risk | Baseline / data / scope | Rejection |
|---|---|---|---|---|---|
| 1 | **P1 challengers with rolling recalibration**: tables refit each year on all prior data (walk-forward), plus a recent-window isotonic or level adjustment, **tested prospectively** in the read-only shadow (E-conf is now spent for this question) | High: replaces the page's worst numbers (calibration gaps of 35–42pp) | Low: tables only, no band or bot change | Baselines: current display and T7. Data: the server's H1/M1 bars, export lines. Scope: shadow params plus a pure module plus a shadow panel; nothing live | Prospective: skill vs display lower bound ≤ 0, or calibration > 3pp after 60 valid sessions |
| 2 | **Consolidation shadow (E2-hour) with the same recalibration step** | Medium | Low | As shadow spec v2 E2 | Shadow spec §5 |
| 3 | **Release-day shape (event-specific widths, not σ)** on the chosen ladder | Medium: NFP/CPI misses of 6–14pp | Medium (power-limited: about 70 dates) | Baseline S/SI; walk-forward; register first | As P2 |
| — | Final confirmation plan: forward block plus the first 60 prospective sessions, scored once (chosen ladder and the P1 correction vs the production export and the current displays) | Decisive | — | Register when the shadow goes live | — |

**Nothing is to be implemented live.** The P1 tables and the module would be built only as a read-only shadow, after you approve rank 1.
