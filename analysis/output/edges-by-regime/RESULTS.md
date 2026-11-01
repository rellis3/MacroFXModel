# Edges by regime: results (EXPLORATORY, verdict CONTEXT)

*Generated 2026-11-01 by `analysis/edges_by_regime.py` from `PREREG.md`, with no changes after the prereg. Data runs to the lockbox (2026-08-21). Moving-block bootstrap: 20-session blocks, 2000 reps, seed 20261101. Outcome: HL / ATR14 (ATR known at the signal close). Effect = mean on event days − mean on all other days in the same regime.*

## nq-down-week: Nasdaq down ≥1% over 5 sessions → next session wider (NDX, HL/ATR14)

Span 2016-01-04 → 2026-08-20. Unconditional: effect 0.251 [0.19, 0.315] (n event 694, control 2039).

| Split | Regime | n event | effect | 95% CI | read |
|---|---|---|---|---|---|
| vol | high vol | 490 | 0.259 | [0.182, 0.348] | seen in both |
| vol | low vol | 171 | 0.181 | [0.095, 0.29] | seen in both |
| credit | credit not widening | 359 | 0.242 | [0.163, 0.329] | seen in both |
| credit | credit widening | 334 | 0.274 | [0.179, 0.376] | seen in both |
| curve | curve inverted | 157 | 0.086 | [0.01, 0.169] | seen in both |
| curve | curve not inverted | 537 | 0.298 | [0.23, 0.373] | seen in both |

## vix-inversion: First day VIX > VIX3M → wider next 5 sessions (SPX, mean HL/ATR14)

Span 2016-01-04 → 2026-08-20. Unconditional: effect 0.366 [0.2, 0.607] (n event 62, control 2667).

| Split | Regime | n event | effect | 95% CI | read |
|---|---|---|---|---|---|
| vol | high vol | 58 | 0.318 | [0.158, 0.517] | measured in high vol only |
| vol | low vol | 0 | — | — | measured in high vol only |
| credit | credit not widening | 23 | 0.397 | [0.205, 0.657] | seen in both |
| credit | credit widening | 39 | 0.365 | [0.159, 0.709] | seen in both |
| curve | curve inverted | 4 | — | — | measured in curve not inverted only |
| curve | curve not inverted | 58 | 0.369 | [0.196, 0.61] | measured in curve not inverted only |

## Data (Amendment 1: the repo's own data)

- Index bars: committed NY-close daily bars built from M1 (`oi_research_book/data/gex_range_es/`),
  2016-01-04 to 2026-08-20; days with fewer than 60 M1 bars dropped. These are the bars the live σ uses.
- Credit regime: Moody's BAA − 10Y (`analysis/output/cog_yield_dir/fred/BAA10Y.csv`, 1986 →), the long credit
  series the feature store carries. FRED serves the ICE HY spread for 3 years only.
- Curve: `T10Y2Y.csv` from the same folder. VIX and VIX3M: committed Cboe seeds.
- v1 (Yahoo cash index + 3-year HY OAS) broke the data rules and is kept as `RESULTS_v1_yahoo.md`, superseded.

## How to read this

- These are twelve cells read as a pattern. None of them validates or kills an edge. The audit grades in
  `js/evidenceAudit.js` still govern.
- "Seen in both" means the edge did not depend on that regime, over this sample.
- "Measured in X only" means the evidence for today is thin when today is not X.
- `state.html` shows the read for today's regime next to each edge.
