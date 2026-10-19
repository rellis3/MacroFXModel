# GAMMA REGIME TRADES (results)

Pre-registration: `forge/GAMMA_REGIME_TRADES_PREREG.md`. NQ CFD, 1483 sessions with a regime (2020-09 → 2026-08), 63% long gamma; costs 0.01% round trip; R = net ÷ stop distance.

## Test A — fade/follow at p75 by regime: **NULL**

| | long gamma | short gamma | all |
|---|---|---|---|
| FADE mean R | -0.041 | -0.082 | -0.057 |
| FOLLOW mean R | -0.021 | +0.030 | -0.002 |
| trades | 394 | 253 | 647 |

- Regime interaction I = **+0.092** R [-0.184, +0.373] (positive = the regime says which to do)
- Switch strategy (fade long / follow short) = **-0.013** R per trade [-0.079, +0.055]; vs always-fade [-0.037, +0.125], vs always-follow [-0.120, +0.095]
- Halves: I +0.004 (≤2022) / +0.109 (≥2023); placebo regime (shifted 125 sessions) I +0.208

## Test B — follow a break through zero gamma into short gamma: **NULL**

- n 109, mean **+0.031** R [-0.304, +0.372], win rate 0.275
- placebo levels (Z ± 1σ): n 262, mean -0.028 R; real − placebo [-0.3291, 0.4593]
- futures − CFD basis median 34.44 pts; open alignment check max |Δ| 0.0
