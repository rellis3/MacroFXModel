# Study 1 — exits driven by the range book

Rule: forge/EXITS_PREREG.md. Entries: first OH/OL p50 touch, 16 instruments (42,760 entries). Net R after spread, R = initial stop distance. Train 2016–2022 (selection), test 2023–2026-08 (confirmation).

## Follow

| exit | rule | train net R (t) | test net R (t) | test instruments positive |
|---|---|---|---|---|
| X0 | target next line (baseline) | -0.047 (-9.8) | -0.046 (-7.0) | 1/16 |
| X1 | hold to day end | -0.030 (-4.3) | -0.047 (-4.8) | 3/16 |
| X2 | exit when range reaches p75 | -0.049 (-7.8) | -0.063 (-7.5) | 1/16 |
| X3 | exit when the extreme is probably in (P < 0.35) | -0.033 (-5.0) | -0.045 (-5.0) | 3/16 |
| X5 | breakeven stop after 0.3σ | -0.033 (-5.6) | -0.047 (-5.9) | 1/16 |
| X6 | time exit 16:00 | -0.022 (-3.5) | -0.040 (-4.6) | 2/16 |

## Fade

| exit | rule | train net R (t) | test net R (t) | test instruments positive |
|---|---|---|---|---|
| F0 | stop at p75, target open (baseline) | -0.067 (-11.1) | -0.072 (-8.6) | 1/16 |
| F4 | stop 0.4σ beyond the line | -0.080 (-11.8) | -0.085 (-9.0) | 0/16 |
| F3 | exit if the extreme will probably break (P > 0.65) | -0.058 (-12.4) | -0.067 (-10.5) | 0/16 |
| F5 | breakeven stop after 0.3σ | -0.067 (-12.7) | -0.069 (-9.4) | 0/16 |
| F6 | time exit 16:00 | -0.074 (-13.4) | -0.071 (-9.3) | 0/16 |

## Verdicts (pre-registered)

- Follow: no exit qualified on train (net R > 0 with t ≥ 2.5) → **FAIL**
- Fade: no exit qualified on train (net R > 0 with t ≥ 2.5) → **FAIL**
