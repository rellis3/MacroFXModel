# Macro state and weekday at the vol lines — results

Pre-registration: forge/MACRO_TREND_WEEKDAY_PREREG.md (2479b62). FRED series read with a 2-day lag, DXY/VIX closes with a 1-day lag; a 5-observation change counts only above its trailing-year median size. Within-cell continue differences, day-bootstrap 95% CI. R net of spread.

## A — macro state

| set | series (5-obs change) | with − against [95% CI] | 2016–22 | 2023–26 | n (with / against) | REAL? | follow R when with (halves) | fade R when against (halves) |
|---|---|---|---|---|---|---|---|---|
| gold | DFII10 | +0.5pp [-2.9pp, +4.1pp] | +0.8pp | +0.3pp | 8,846 / 7,579 | no | -0.027 (-0.036 / -0.003) | -0.083 (-0.057 / -0.140) |
| gold | DXY | -1.4pp [-5.3pp, +2.4pp] | -4.2pp | +3.8pp | 8,056 / 8,017 | no | -0.034 (-0.078 / +0.056) | -0.073 (-0.081 / -0.055) |
| 4 US indices | DGS10 | +2.1pp [-0.1pp, +4.2pp] | +3.0pp | +0.9pp | 25,151 / 21,869 | no | +0.005 (+0.003 / +0.008) | -0.005 (+0.015 / -0.032) |
| 4 US indices | BAMLH0A0HYM2 | -0.8pp [-4.5pp, +3.0pp] | +nanpp | -0.8pp | 7,693 / 6,794 | no | +0.007 (– / +0.007) | -0.080 (– / -0.080) |
| 4 US indices | VIX | -1.1pp [-3.3pp, +1.0pp] | -0.0pp | -2.5pp | 22,267 / 21,558 | no | -0.031 (-0.043 / -0.014) | -0.029 (-0.010 / -0.051) |
| 7 USD pairs | DGS2 | +0.3pp [-1.2pp, +1.6pp] | +0.8pp | -0.9pp | 58,710 / 55,281 | no | -0.043 (-0.041 / -0.049) | -0.036 (-0.031 / -0.045) |
| 7 USD pairs | DXY | -1.3pp [-2.8pp, +0.1pp] | -1.9pp | +0.1pp | 57,191 / 52,696 | no | -0.059 (-0.062 / -0.053) | -0.046 (-0.056 / -0.022) |

## C — weekday (16 FX/gold + 6 indices)

| weekday | passes | continue | follow R | fade R |
|---|---|---|---|---|
| Mon | 110,603 | 36% | -0.053 | -0.061 |
| Tue | 122,731 | 36% | -0.052 | -0.059 |
| Wed | 125,976 | 37% | -0.056 | -0.052 |
| Thu | 136,933 | 39% | -0.039 | -0.074 |
| Fri | 118,747 | 37% | -0.051 | -0.056 |

Tue–Wed vs other days: continue +0.8pp [+0.2pp, +1.4pp] (+0.7pp / +1.0pp) — **real**; follow R -0.054 (-0.056 / -0.049), fade R -0.056 (-0.055 / -0.058).

T2 (A + C): BH 10% over 16 rows, 0 survive; also positive in both halves: none.

## Reading
- **No macro series moves fade/continue at the lines** (real yields, DXY for gold; DGS10, HY spread, VIX for indices; DXY,
  DGS2 for USD pairs): every CI spans 0, halves disagree on most. The HY spread file covers 2023-10 → only (FRED default
  window for that series), so its row is one half. These are daily, lagged series tested on intraday line touches; they
  were null as same-bar-only couplings before (yields → indices/FX), and they are null here.
- **Weekday:** Tue–Wed continue +0.8pp — real, trivial, no money in it.
