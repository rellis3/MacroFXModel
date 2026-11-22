# ladder-qlike-per-line — results

Prereg: `forge/LADDER_QLIKE_PER_LINE_PREREG.md` (2026-11-22, A1 pre-results). Seed 20261122, B = 2000, 63-session
blocks. Script `scripts/ladder-qlike-per-line/score.py`; numbers `results.json`; log `report.txt`; full leaderboard
`leaderboard.csv`. Futures (NT8): NQ, GC, 6E, 6J. Test 2020 → 2026-08-21 (about 1,650 sessions each), every pick made on
earlier years only.

## Verdicts

| Part | Question | Verdict | Weight |
|---|---|---|---|
| A (`ladder-qlike-per-line`) | Per-line model chosen on its own QLIKE vs one model chosen on summed QLIKE | **UNDERPOWERED** | Faint |
| B (`ladder-qlike-vs-pinball`) | QLIKE-chosen per-line ladder vs the current pinball-chosen ladder | **UNDERPOWERED** | Faint |

Control passed: a planted informed-OH model was picked for OH 7/7 years on all four, −3.6% [−4.5, −2.0].

## QLIKE leaderboard (lower = better; out of sample 2020–2026.08)

| Futures | HL best | OH best | OL best | Live A0 rank (HL / OH / OL) |
|---|---|---|---|---|
| NQ | IV blend 0.351, SHAR 0.351 | **SHAR 1.218** | IV blend 1.571 | 15 / 14 / 15 of 20 |
| GC | IV-adjusted V3 0.335 | **HAR-CJ 1.290** (SHAR 1.290) | V4 1.558 | 11 / 11 / 9 of 20 |
| 6E | HAR-CJ 0.299 | HAR-CJ 1.370 (SHAR 1.370) | HAR-CJ 1.289 | 8 / 8 / 8 of 17 |
| 6J | SHAR 0.505 | SHAR 1.423 | R5 1.719 | 12 / 15 / 9 of 17 |

Picks once settled (2023–26): NQ HL/OL IV blend, OH SHAR; GC HL V3, OH SHAR, OL V4; 6E HL/OL HAR-CJ, OH SHAR; 6J
SHAR (OL R5).

## Part A: per line vs one QLIKE model (summed QLIKE, % change, negative = better)

| | Δ |
|---|---|
| All | −0.45% [−1.09, +0.03] |
| 2020–22 | −0.80% [−2.17, −0.02] |
| 2023–26 | −0.14% [−0.67, +0.19] |
| HL / OH / OL | +0.15% / **−0.60% [−1.26, −0.12]** / −0.44% |
| Regime miss | 2.33 → 2.35pp |

## Part B: QLIKE per-line ladder vs the current pinball-chosen ladder

| | Δ |
|---|---|
| All | −0.86% [−1.70, +0.16] |
| 2020–22 / 2023–26 | −1.30% / −0.49% |
| HL / OH / OL | −0.76% / −0.38% / **−1.20% [−1.86, −0.28]** |
| Regime miss | 1.89 (pinball) → 2.35pp (QLIKE) |
| vs live A0 | QLIKE ladder −4.0% [−4.8, −2.5]; pinball ladder −3.2% [−4.2, −1.7]; live regime miss 2.71pp |

## Reading

- QLIKE and pinball agree on the family: the intraday-RV HAR models (SHAR, HAR-CJ, R5) and, where IV exists, the
  IV-adjusted models. Live A0 ranks mid-to-low on every line.
- OH is the line where a separate pick shows up most (SHAR on OH for NQ, GC, 6E): small but its CI excludes zero.
- The QLIKE ladder scores slightly better on QLIKE than the pinball ladder but its lines hit a little less honestly
  across vol regimes (2.35 vs 1.89pp). For levels that must hit at their stated rates, the pinball ladder stays.
