# GAMMA REGIME TRADES (results)

Pre-registration: `forge/GAMMA_REGIME_TRADES_PREREG.md`. NQ CFD, 813 sessions with a regime (2020-09 → 2026-08), 68% long gamma; costs 0.01% round trip; R = net ÷ stop distance.

## Test A — fade/follow at p75 by regime: **NULL**

| | long gamma | short gamma | all |
|---|---|---|---|
| FADE mean R | -0.028 | -0.048 | -0.036 |
| FOLLOW mean R | -0.066 | -0.025 | -0.050 |
| trades | 218 | 135 | 353 |

- Regime interaction I = **+0.060** R [-0.301, +0.439] (positive = the regime says which to do)
- Switch strategy (fade long / follow short) = **-0.027** R per trade [-0.114, +0.064]; vs always-fade [-0.095, +0.118], vs always-follow [-0.103, +0.151]
- Halves: I +0.073 (≤2022) / +0.141 (≥2023); placebo regime (shifted 125 sessions) I +0.017

## Test B — follow a break through zero gamma into short gamma: **NULL**

- n 61, mean **-0.014** R [-0.442, +0.467], win rate 0.262
- placebo levels (Z ± 1σ): n 152, mean +0.005 R; real − placebo [-0.5348, 0.5303]
- futures − CFD basis median 34.44 pts; open alignment check max |Δ| 0.0
