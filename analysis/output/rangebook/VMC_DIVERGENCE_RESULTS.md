# Cipher B WaveTrend divergence at the vol lines — results

Pre-registration: forge/VMC_DIVERGENCE_INDICES_PREREG.md (9b6d7d0). Event: the first qualifying wt2 fractal top (bottom for down lines) at or beyond a vol line, confirmed within 60 min of the touch; race and R from the confirmation bar. Divergence vs a qualifying top at the line without one. Within-cell (line family × London hour × range used); day-bootstrap 95% CI.

| set | OB level | divergence: continue / fade | no divergence: continue / fade | continue effect [95% CI] | 2016–22 | 2023–26 | REAL? | fade R (16–22 / 23–26) | follow R | PASS |
|---|---|---|---|---|---|---|---|---|---|---|
| NQ | OB 45 / OS −65 (Pine default) | 37% / 29% (n=4,335) | 39% / 28% (n=6,363) | -2.5pp [-5.2pp, -0.1pp] | -2.1pp | -3.6pp | **yes** | -0.028 (-0.022 / -0.039) | -0.005 | – |
| NQ | OB 25 / OS −25 | 36% / 31% (n=4,624) | 37% / 30% (n=9,914) | -1.8pp [-4.3pp, +0.6pp] | -1.7pp | -2.2pp | no | -0.032 (-0.022 / -0.050) | -0.015 | – |
| confirmation (SPX, DOW, US2000, DE30, UK100) | OB 45 / OS −65 (Pine default) | 39% / 31% (n=16,829) | 40% / 28% (n=26,105) | -1.6pp [-3.0pp, -0.2pp] | +0.6pp | -4.3pp | no | -0.030 (-0.030 / -0.031) | -0.040 | – |
| confirmation (SPX, DOW, US2000, DE30, UK100) | OB 25 / OS −25 | 37% / 33% (n=18,825) | 38% / 29% (n=41,033) | -1.9pp [-3.1pp, -0.6pp] | -0.1pp | -4.3pp | **yes** | -0.029 (-0.031 / -0.026) | -0.035 | – |
| 16 FX + gold | OB 45 / OS −65 (Pine default) | 39% / 29% (n=74,942) | 40% / 26% (n=118,757) | -3.0pp [-3.7pp, -2.4pp] | -3.3pp | -2.6pp | **yes** | -0.075 (-0.076 / -0.073) | -0.058 | – |
| 16 FX + gold | OB 25 / OS −25 | 37% / 31% (n=84,623) | 37% / 27% (n=186,912) | -2.7pp [-3.3pp, -2.1pp] | -2.8pp | -2.5pp | **yes** | -0.070 (-0.074 / -0.063) | -0.064 | – |

Big divergences only (wt2 gap ≥ 10, like the 2026-10-01 NQ example) — descriptive, added after pre-registration, not a test:

| set | OB level | n | continue | fade | fade R (16–22 / 23–26) |
|---|---|---|---|---|---|
| NQ | OB 45 / OS −65 (Pine default) | 1,813 | 38% | 26% | -0.068 (-0.045 / -0.111) |
| NQ | OB 25 / OS −25 | 2,276 | 35% | 30% | -0.054 (-0.052 / -0.056) |
| confirmation (SPX, DOW, US2000, DE30, UK100) | OB 45 / OS −65 (Pine default) | 7,199 | 39% | 31% | -0.036 (-0.024 / -0.052) |
| confirmation (SPX, DOW, US2000, DE30, UK100) | OB 25 / OS −25 | 9,863 | 37% | 33% | -0.036 (-0.045 / -0.024) |
| 16 FX + gold | OB 45 / OS −65 (Pine default) | 31,422 | 39% | 30% | -0.086 (-0.086 / -0.087) |
| 16 FX + gold | OB 25 / OS −25 | 43,433 | 37% | 31% | -0.073 (-0.070 / -0.079) |

BH 10% over 12 tests: 0 survive before the both-halves (and, for NQ, confirmation) check.

Data: NQ, US2000, DE30, UK100 2016 → 2026-08; SPX and DOW 2021-08 → 2026-06 (M1 history). Every builder's
future-scramble self-check passed (22 instruments).

## Reading
- The Cipher B divergence is real and points the right way on every set: 1.6–3.0 points less continuation and
  1–4 points more fade than a qualifying WaveTrend top at the same line without a divergence. NQ at Pine defaults:
  −2.5pp [−5.2, −0.1], same sign in both halves.
- It is small. After a confirmed NQ divergence at a line: 37% reach the next line out, 29% reach the line behind,
  34% neither by the day end. A fade from the confirmation loses −0.028R net; 0 of 12 trading tests survive.
- Bigger divergences (wt2 gap ≥ 10) are not better: NQ 26% fade.
- The 2026-10-01 NQ case (Close p75 / OH p75 / Proj H median, ~07:15 UK) is one of the 29%. Divergences that
  precede a big fade are memorable; the 37% that kept going and the 34% that drifted are not.
