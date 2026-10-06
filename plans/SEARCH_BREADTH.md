# Pricing the search (A8) and the fundamental-law view (A2)

`PYTHONPATH=. python analysis/system/search_breadth.py` → analysis/output/search_breadth.json. 2026-10-06.
No model fitted or selected here; it puts uncertainty on choices already made.

## A8 — was the layer-3 choice more than "best of 4 by luck"?

Lesson 2: with N arms and no real difference, the winner still leads by about E[max of N] standard errors (1.03 for
N = 4). Session-block bootstrap (1,000 draws) of the 30-cell regime miss on the 2025-09 → 2026-08 test year:

| HAR-800 vs | margin | SE | z | z after best-of-4 | reading |
|---|---|---|---|---|---|
| live estimator | +1.58pp | 0.45 | +2.8 | **+1.7** | HAR genuinely better than live |
| IV-adjusted | +0.26pp | 0.19 | +1.2 | **+0.1** | **not distinguishable** — "HAR preferred over IV-adjusted" was too strong |
| pure IV | +0.89pp | 0.32 | +2.2 | +1.2 | HAR likely better, not conclusive |

Correction to the record: layer 3's conclusion is "HAR-800 and IV-adjusted both clearly beat the live ladder on
regime calibration; between them the test year cannot choose". HAR stays the frozen candidate for the lockbox because it
is available for all 34 instruments (IV-adjusted needs an IV source), not because it beat IV-adjusted.

Search counts so far (Lesson 2: the record of every attempt): layer 3 σ arms 5 · layer 4 path-map variants 3 ·
layer 5 remaining-travel models 6 · layer 6 confidence models 2 · layer 7 stop-risk variants 1 · sizing arms 5.
Layer 5's R3 was designed after seeing R0–R2 fail on the test year; its test-year result is therefore not evidence,
only the lockbox can be (forge/LOCKBOX_PROTOCOL.md).

## A2 — Lesson 3's IR ≈ TC · IC · √BR, measured

Information coefficient = median within-instrument rank correlation between forecast and outcome.

| layer | IC |
|---|---|
| 3 live estimator: σ vs realised range | +0.29 |
| 3 HAR-800: σ vs realised range | **+0.38** |
| 5 R3: forecast vs realised remaining travel (up / down) | +0.42 / +0.41 |
| 6 M2: reach p50 / p75 (2·AUC − 1) | +0.14 / +0.19 |

**Breadth is far smaller than the instrument count.** Across 28 instruments the daily σ forecast errors correlate 0.47
on average (one USD or risk shock moves them together), so the system makes about **2.1 independent σ forecasts a day,
≈ 520 a year** — not 28 a day. Any later layer that treats instruments as independent bets overstates √BR by about
√(28 / 2.1) ≈ 3.7×. The transfer coefficient (TC) cannot be measured until a construction layer exists.

The volatility ICs are high because volatility is forecastable (Lesson 3 §02); a direction IC — the quantity a trading
edge needs — has not been produced by any layer (layer 4: none at the lines).
