# WaveTrend divergence, the reaction after the touch, and the all-features ceiling — results

Pre-registration: forge/DIVERGENCE_REACTION_PREREG.md (9c00342). 526,570 passes, 16 instruments. Effects are within-cell (line family × London hour × range used) continue-rate differences with a day-bootstrap 95% CI; REAL = CI excludes 0 and both halves agree. R is net of spread; for D2 and R1 the race and R start at the decision bar.

## T1 — does it change continue vs fade?

| column | comparison | effect [95% CI] | 2016–22 | 2023–26 | n (a / b) | REAL? |
|---|---|---|---|---|---|---|
| d1m5 | divergence vs new extreme without it | -0.2pp [-0.7pp, +0.3pp] | -0.5pp | +0.6pp | 109,486 / 210,761 | no |
| d1m15 | divergence vs new extreme without it | +0.1pp [-0.5pp, +0.7pp] | +0.3pp | -0.4pp | 111,232 / 220,355 | no |
| d2 | confirmed divergence vs confirmed turn without it | -2.2pp [-2.6pp, -1.6pp] | -2.2pp | -2.1pp | 77,537 / 263,699 | **yes** |
| r5 | back inside vs still beyond (5 min after) | -30.7pp [-31.3pp, -30.1pp] | -29.9pp | -32.4pp | 62,599 / 60,547 | **yes** |
| r15 | back inside vs still beyond (15 min after) | -34.6pp [-35.1pp, -34.1pp] | -34.4pp | -34.9pp | 114,108 / 97,892 | **yes** |
| r30 | back inside vs still beyond (30 min after) | -37.3pp [-37.7pp, -36.8pp] | -36.9pp | -38.1pp | 136,703 / 112,446 | **yes** |
| roc240 | top vs bottom third | +2.1pp [+1.3pp, +2.8pp] | +1.7pp | +2.8pp | 176,049 / 175,193 | **yes** |
| atrRatio | top vs bottom third | +6.0pp [+5.2pp, +6.7pp] | +5.3pp | +7.4pp | 178,746 / 175,039 | **yes** |
| explosion | top vs bottom third | +2.6pp [+2.1pp, +3.1pp] | +1.7pp | +4.0pp | 161,240 / 189,206 | **yes** |
| vwapBand | beyond 2σ vs inside 1σ | +1.1pp [+0.3pp, +2.0pp] | +0.9pp | +1.8pp | 202,700 / 111,834 | **yes** |

## T2 — can you trade it?

| column | group | passes | continue | follow R | fade R | follow halves | fade halves | PASS |
|---|---|---|---|---|---|---|---|---|
| d1m5 | divergence | 109,486 | 38% | -0.054 | -0.067 | -0.056 / -0.051 | -0.064 / -0.072 | – |
| d1m5 | new extreme, no divergence | 210,761 | 38% | -0.054 | -0.067 | -0.050 / -0.062 | -0.070 / -0.060 | – |
| d1m5 | no new extreme | 205,675 | 35% | -0.058 | -0.066 | -0.057 / -0.060 | -0.066 / -0.065 | – |
| d1m15 | divergence | 111,232 | 39% | -0.054 | -0.067 | -0.049 / -0.065 | -0.072 / -0.058 | – |
| d1m15 | new extreme, no divergence | 220,355 | 39% | -0.055 | -0.066 | -0.053 / -0.059 | -0.067 / -0.063 | – |
| d1m15 | no new extreme | 194,563 | 33% | -0.057 | -0.066 | -0.058 / -0.057 | -0.065 / -0.068 | – |
| d2 | confirmed divergence | 77,537 | 35% | -0.057 | -0.073 | -0.057 / -0.057 | -0.076 / -0.068 | – |
| d2 | confirmed turn, no divergence | 263,699 | 35% | -0.053 | -0.075 | -0.052 / -0.057 | -0.076 / -0.074 | – |
| d2 | turn at a lower extreme | 98,968 | 29% | -0.060 | -0.071 | -0.055 / -0.071 | -0.071 / -0.069 | – |
| r5 | back inside (>0.1σ) | 62,599 | 26% | -0.074 | -0.061 | -0.063 / -0.098 | -0.065 / -0.053 | – |
| r5 | at the line | 395,610 | 35% | -0.056 | -0.066 | -0.054 / -0.059 | -0.067 / -0.063 | – |
| r5 | still beyond (>0.1σ) | 60,547 | 58% | -0.056 | -0.088 | -0.060 / -0.046 | -0.076 / -0.113 | – |
| r15 | back inside (>0.1σ) | 114,108 | 23% | -0.084 | -0.056 | -0.081 / -0.090 | -0.057 / -0.056 | – |
| r15 | at the line | 289,169 | 33% | -0.052 | -0.069 | -0.049 / -0.059 | -0.071 / -0.065 | – |
| r15 | still beyond (>0.1σ) | 97,892 | 58% | -0.048 | -0.111 | -0.049 / -0.044 | -0.104 / -0.125 | – |
| r30 | back inside (>0.1σ) | 136,703 | 20% | -0.104 | -0.050 | -0.093 / -0.128 | -0.053 / -0.045 | – |
| r30 | at the line | 225,275 | 32% | -0.050 | -0.071 | -0.048 / -0.055 | -0.073 / -0.066 | – |
| r30 | still beyond (>0.1σ) | 112,446 | 58% | -0.045 | -0.125 | -0.047 / -0.041 | -0.121 / -0.134 | – |
| roc240 | low (<0.25) | 175,193 | 32% | -0.058 | -0.064 | -0.057 / -0.062 | -0.065 / -0.060 | – |
| roc240 | mid | 175,328 | 38% | -0.054 | -0.067 | -0.056 / -0.049 | -0.064 / -0.074 | – |
| roc240 | high (≥0.61) | 176,049 | 40% | -0.055 | -0.068 | -0.049 / -0.066 | -0.073 / -0.058 | – |
| atrRatio | low (<0.96) | 175,039 | 33% | -0.056 | -0.068 | -0.055 / -0.059 | -0.069 / -0.067 | – |
| atrRatio | mid | 172,740 | 36% | -0.060 | -0.064 | -0.056 / -0.069 | -0.067 / -0.056 | – |
| atrRatio | high (≥1.18) | 178,746 | 41% | -0.051 | -0.067 | -0.051 / -0.051 | -0.067 / -0.069 | – |
| explosion | low (<2.00) | 189,206 | 36% | -0.050 | -0.071 | -0.047 / -0.055 | -0.073 / -0.067 | – |
| explosion | mid | 176,052 | 37% | -0.059 | -0.064 | -0.054 / -0.069 | -0.068 / -0.056 | – |
| explosion | high (≥2.83) | 161,240 | 38% | -0.059 | -0.063 | -0.061 / -0.053 | -0.061 / -0.069 | – |
| vwapBand | inside 1σ | 111,834 | 34% | -0.056 | -0.068 | -0.053 / -0.064 | -0.073 / -0.059 | – |
| vwapBand | 1–2σ | 211,148 | 36% | -0.055 | -0.068 | -0.055 / -0.054 | -0.066 / -0.071 | – |
| vwapBand | 2–3σ | 152,860 | 39% | -0.056 | -0.064 | -0.054 / -0.061 | -0.065 / -0.061 | – |
| vwapBand | beyond 3σ | 50,067 | 43% | -0.054 | -0.066 | -0.047 / -0.066 | -0.071 / -0.058 | – |

BH 10% over 62 tests: 0 survive before the both-halves check.

## T3 — everything combined (walk-forward 2023–2026)

- Brier skill predicting **continue** vs the book's cell rates: +1.9% [+1.6, +2.1]
- Brier skill predicting **fade** vs the book's cell rates: +1.3% [+1.0, +1.5]
- follow when predicted continue beats break-even by 5+: 2,324 passes, net -0.025R (2023–24 +0.078, 2025–26 -0.168) — fail
- fade when predicted fade beats break-even by 5+: 1,917 passes, net +0.045R (2023–24 +0.089, 2025–26 -0.023) — fail

How far the combined model moves the odds (deciles of predicted shift):

| decile | predicted shift | actual shift vs book | continue − break-even | passes |
|---|---|---|---|---|
| 1 | -8.6pp | -10.7pp | -30.1pp | 17,220 |
| 2 | -5.0pp | -6.9pp | -21.7pp | 17,219 |
| 3 | -3.4pp | -4.4pp | -18.7pp | 17,219 |
| 4 | -2.2pp | -3.7pp | -19.1pp | 17,220 |
| 5 | -1.1pp | -1.8pp | -18.2pp | 17,219 |
| 6 | +0.0pp | -1.7pp | -17.0pp | 17,219 |
| 7 | +1.2pp | -0.2pp | -14.4pp | 17,220 |
| 8 | +2.7pp | +1.4pp | -12.7pp | 17,219 |
| 9 | +4.9pp | +3.6pp | -12.1pp | 17,219 |
| 10 | +11.2pp | +11.4pp | -11.0pp | 17,220 |

## Reading
- **Divergence at the touch (D1) does nothing** on M5 or M15 (−0.2 / +0.1pp, 320k+ touches each).
- **A confirmed divergence (D2) adds 2.2 points of fade** over a confirmed turn without one (real, both halves).
  The turn itself does most of the work, and turns with or without divergence still lose as fades
  (−0.073 vs −0.075R). Divergences that look decisive on the chart are mostly the turn, seen after it happened.
- **The reaction after the touch is the biggest effect in the whole research line.** 15 minutes after the touch,
  price back inside by >0.1σ continues 23% of the time; still beyond by >0.1σ, 58% (−35pp, CI ±0.5). But the race
  restarts from where price now is, so the distances to the two lines move with it: back inside, the fade
  target is closer; still beyond, the continue target is. Both trades stay negative net (fade −0.056R, follow
  −0.048R). The odds are knowable, and the price already reflects them.
- **Retail VWAP rule reversed:** touches beyond 3σ from the day's VWAP continue MORE (43%) than inside 1σ (34%).
  Same for a hot tape: M15 ATR above its usual level (+6pp), a recent explosive bar (+2.6pp), 4-hour momentum (+2.1pp).
  Stretched and fast means continuation, not exhaustion, at these lines.
- **Everything combined (T3):** the model moves continue odds by up to ±11pp and is right about it out of sample
  (top decile +11.4pp actual), but even that decile sits 11 points under break-even. The selective trades were
  positive in 2023–24 and negative in 2025–26: no pass.
- **One use that follows directly (not tested as a rule):** a follow position whose line is back inside after
  15 minutes has 23% continue odds from there; holding it is worth about what a fresh follow trade is worth, before
  spread (≈ −0.05R), so cutting it is the better decision. That is a management idea for a separate pre-registered test.
