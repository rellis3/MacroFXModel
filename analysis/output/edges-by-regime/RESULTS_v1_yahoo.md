# Edges by regime: results (EXPLORATORY, verdict CONTEXT)

*Generated 2026-11-01 by `analysis/edges_by_regime.py` from `PREREG.md`, with no changes after the prereg. Data runs to the lockbox (2026-08-21). Moving-block bootstrap: 20-session blocks, 2000 reps, seed 20261101. Outcome: HL / ATR14 (ATR known at the signal close). Effect = mean on event days − mean on all other days in the same regime.*

## nq-down-week: Nasdaq down ≥1% over 5 sessions → next session wider (NDX, HL/ATR14)

Span 1985-10-01 → 2026-08-21. Unconditional: effect 0.141 [0.114, 0.17] (n event 3025, control 7262).

| Split | Regime | n event | effect | 95% CI | read |
|---|---|---|---|---|---|
| vol | high vol | 1705 | 0.199 | [0.161, 0.24] | seen in both |
| vol | low vol | 978 | 0.069 | [0.036, 0.106] | seen in both |
| credit | credit not widening | 79 | 0.194 | [0.1, 0.317] | seen in both |
| credit | credit widening | 103 | 0.328 | [0.165, 0.545] | seen in both |
| curve | curve inverted | 363 | 0.068 | [0.009, 0.127] | seen in both |
| curve | curve not inverted | 2662 | 0.151 | [0.122, 0.181] | seen in both |

## vix-inversion: First day VIX > VIX3M → wider next 5 sessions (SPX, mean HL/ATR14)

Span 2009-09-18 → 2026-08-21. Unconditional: effect 0.271 [0.157, 0.411] (n event 105, control 4147).

| Split | Regime | n event | effect | 95% CI | read |
|---|---|---|---|---|---|
| vol | high vol | 102 | 0.253 | [0.152, 0.394] | measured in high vol only |
| vol | low vol | 3 | — | — | measured in high vol only |
| credit | credit not widening | 4 | — | — | measured in credit widening only |
| credit | credit widening | 13 | 0.536 | [0.161, 1.181] | measured in credit widening only |
| curve | curve inverted | 4 | — | — | measured in curve not inverted only |
| curve | curve not inverted | 101 | 0.268 | [0.147, 0.411] | measured in curve not inverted only |

## Data limits

- FRED's public CSV serves the ICE BofA HY spread (BAMLH0A0HYM2) from 2023-10-31 only, because of ICE
  licensing. The credit split therefore covers about 3 years, not the full span. Its cells are thin and are
  shown, not read. A longer credit series (e.g. Moody's BAA − 10Y, from 1986) would be a new prereg, not a
  change to this one.
- Yahoo `^NDX` OHLC starts 1985-10-01. `^GSPC` has real high/low from about 1962. Sessions with HL = 0 are
  dropped.
- The VIX3M seed starts 2009-09-18, so vix-inversion runs from there.

## How to read this

- These are twelve cells read as a pattern. None of them validates or kills an edge. The audit grades in
  `js/evidenceAudit.js` still govern.
- "Seen in both" means the edge did not depend on that regime, over this sample.
- "Measured in X only" means the evidence for today is thin when today is not X.
- `state.html` shows the read for today's regime next to each edge.
