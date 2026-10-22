# Flow and positioning columns at the vol lines — results

Pre-registration: forge/FLOW_COLUMNS_PREREG.md (24ca164). Within-cell (line family × London hour × range used) continue-rate differences, day-bootstrap 95% CI; REAL = CI excludes 0 and both halves agree (G and E: 2020–22 vs 2023–26). R net of spread.

## T1

| column | comparison | effect [95% CI] | first half | 2023–26 | n (a / b) | REAL? |
|---|---|---|---|---|---|---|
| G | dealer gamma, NQ (long vs short) | -0.9pp [-4.3pp, +2.4pp] | -1.4pp | -1.6pp | 10,204 / 6,567 | no |
| G | dealer gamma, 6 FX (long vs short) | +0.3pp [-1.1pp, +1.8pp] | +0.3pp | +0.5pp | 48,694 / 55,219 | no |
| E | expiring strike at the line, NQ + 6 FX (real − placebo) | -4.2pp [-36.8pp, +28.6pp] | +38.4pp | -22.3pp | 54 / 2,961 | no |
| C | catalyst within 60 min (16 book) | +3.4pp [+2.3pp, +4.5pp] | +2.3pp | +5.7pp | 35,341 / 491,229 | **yes** |
| C | surprise aligned vs against the touch (16 book) | +7.4pp [+3.3pp, +12.0pp] | +2.7pp | +9.7pp | 5,628 / 2,957 | **yes** |
| F | fix window, month-end vs other days (16 book) | +6.6pp [+3.5pp, +9.7pp] | +5.9pp | +8.8pp | 2,958 / 25,500 | **yes** |
| A | absorption, absorbed vs vacuum (16 book) | +0.1pp [-0.4pp, +0.5pp] | +0.3pp | -0.5pp | 172,477 / 174,251 | no |
| H | intraday HMM, quiet vs active (16 book) | -2.6pp [-3.2pp, -2.1pp] | -2.2pp | -3.4pp | 178,832 / 285,452 | **yes** |

## T2

| column | group | passes | continue | follow R | fade R | follow halves | fade halves | PASS |
|---|---|---|---|---|---|---|---|---|
| G: dealer gamma, NQ | long gamma | 10,204 | 37% | +0.003 | -0.039 | -0.039 / +0.022 | +0.008 / -0.061 | – |
| G: dealer gamma, NQ | short gamma | 6,567 | 38% | +0.010 | -0.031 | +0.013 / +0.008 | -0.031 / -0.032 | – |
| G: dealer gamma, 6 FX | long gamma | 48,694 | 37% | -0.035 | -0.053 | -0.034 / -0.036 | -0.053 / -0.053 | – |
| G: dealer gamma, 6 FX | short gamma | 55,219 | 36% | -0.037 | -0.049 | -0.024 / -0.048 | -0.058 / -0.042 | – |
| E: expiring strike at the line, NQ + 6 FX | pinned | 54 | 31% | -0.286 | +0.299 | -0.045 / -0.397 | -0.014 / +0.443 | – |
| E: expiring strike at the line, NQ + 6 FX | not pinned | 2,961 | 47% | -0.026 | -0.056 | +0.025 / -0.061 | -0.110 / -0.020 | – |
| C: catalyst within 60 min | catalyst | 35,341 | 40% | -0.046 | -0.062 | -0.036 / -0.055 | -0.068 / -0.058 | – |
| C: catalyst within 60 min | no catalyst | 491,229 | 37% | -0.056 | -0.067 | -0.055 / -0.060 | -0.067 / -0.065 | – |
| C: surprise aligned vs against the touch | aligned | 5,628 | 43% | -0.009 | -0.073 | +0.006 / -0.018 | -0.078 / -0.070 | – |
| C: surprise aligned vs against the touch | against | 2,957 | 37% | -0.133 | +0.049 | -0.067 / -0.170 | -0.031 / +0.093 | – |
| F: fix window, month-end vs other days | month-end fix | 2,958 | 35% | -0.030 | -0.100 | -0.023 / -0.045 | -0.105 / -0.088 | – |
| F: fix window, month-end vs other days | other fix | 25,500 | 28% | -0.066 | -0.055 | -0.067 / -0.065 | -0.054 / -0.058 | – |
| A: absorption, absorbed vs vacuum | absorbed (top third) | 172,477 | 36% | -0.053 | -0.066 | -0.053 / -0.055 | -0.067 / -0.066 | – |
| A: absorption, absorbed vs vacuum | vacuum (bottom third) | 174,251 | 38% | -0.060 | -0.067 | -0.058 / -0.063 | -0.068 / -0.065 | – |
| H: intraday HMM, quiet vs active | quiet | 178,832 | 31% | -0.057 | -0.065 | -0.056 / -0.059 | -0.066 / -0.063 | – |
| H: intraday HMM, quiet vs active | active | 285,452 | 40% | -0.054 | -0.068 | -0.052 / -0.059 | -0.069 / -0.066 | – |

BH 10% over 32 tests: 0 survive before the both-halves check.

## T3 — stacking them on the all-features model (16 book instruments, walk-forward 2023–2026)

| model | Brier skill vs book cells | selective follows | net R | 2023–24 | 2025–26 |
|---|---|---|---|---|---|
| previous features | +1.87% | 2,340 | -0.034 | +0.065 | -0.175 |
| + flow columns | +1.84% | 2,438 | -0.035 | +0.071 | -0.183 |

## Reading
- **Dealer gamma does nothing at the lines** (NQ −0.9pp, FX +0.3pp, CIs across 0). Positioning that shapes the day's
  RANGE (oi_research_book G2) does not decide which way a line breaks.
- **Expiry pin: inconclusive.** The archive holds monthly FX and quarterly NQ expiries only; 54 touches had an
  expiring strike at the line. Weekly expiries would be needed.
- **A catalyst is the first thing with direction in it.** Touches within an hour of a Major release continue
  +3.4pp more; when the surprise points the way the touch is going, +7.4pp (43% vs 37%), stronger in 2023–26.
  Aligned follows lose only −0.009R; touches AGAINST the surprise fade at +0.049R but split −0.031 / +0.093 across
  the halves, n = 2,957, so not a pass. Small samples, honest near-misses.
- **Month-end fix flow CONTINUES (+6.6pp)**, the opposite of the "one-off rebalancing fades" textbook reading.
- **Quiet intraday regime (HMM) means less continuation (−2.6pp)**, as the textbook says; real, small.
- **Absorption (volume per unit of progress) does nothing** on tick volume.
- **Stacking the new columns into the all-features model adds nothing** (Brier skill +1.87% → +1.84%).
