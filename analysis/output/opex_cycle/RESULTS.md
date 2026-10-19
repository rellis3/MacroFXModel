# OPEX CYCLE (results)

Pre-registration: `forge/OPEX_CYCLE_RANGE_PREREG.md`. Window 2016-03-29 → 2026-08-20; y = log(realised HL ÷ live p50), instrument × weekday and × year effects removed; 95% cluster bootstrap over 124 expiry cycles.

**Verdict: INCONCLUSIVE.**

| sample | rows | PRE | OPEX | POST | Δ = POST − PRE [95%] |
|---|---|---|---|---|---|
| **primary: US4, non-event sessions** | 6,241 | -0.082 | -0.078 | -0.027 | **+0.055** [-0.014, +0.124] |
| NQ | 1,560 | -0.055 | -0.083 | +0.008 | **+0.062**  |
| SPX500 | 1,562 | -0.077 | -0.062 | -0.021 | **+0.056**  |
| DOW | 1,564 | -0.088 | -0.042 | -0.058 | **+0.029**  |
| US2000 | 1,555 | -0.110 | -0.127 | -0.037 | **+0.073**  |
| US4 <=2020 | 3,553 | -0.111 | -0.197 | -0.055 | **+0.056** [-0.040, +0.157] |
| US4 >=2021 | 2,688 | -0.043 | +0.069 | +0.011 | **+0.055** [-0.037, +0.139] |
| placebo A: FX majors, same calendar | 9,031 | -0.024 | +0.007 | -0.005 | **+0.019** [-0.018, +0.056] |
| placebo B: US4, calendar +14 days | 6,241 | +0.040 | +0.029 | +0.069 | **+0.029** [-0.042, +0.103] |
| US4, all sessions (events kept) | 10,397 | -0.063 | -0.090 | -0.032 | **+0.031** [-0.033, +0.091] |
| US4, quarterly cycles only | 4,037 | -0.081 | -0.039 | -0.041 | **+0.040** [-0.095, +0.171] |

Coefficients are log points relative to OTHER sessions (0.05 ≈ 5% more range than the forecast).
