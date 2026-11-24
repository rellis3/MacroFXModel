# ladder-jordan-recipe: results

Prereg: `forge/LADDER_JORDAN_RECIPE_PREREG.md` (pushed c2039271 before scoring). Seed 20261123, B = 2000, 63-session
blocks. Script `scripts/ladder-jordan-recipe/score.py`; numbers `results.json`; log `report.txt`; per-arm table
`board.csv`. Futures NQ, GC, 6E, 6J; test 2020 → 2026-08-21 (~1,650 sessions each).

Controls: bar alignment 100% on all four; the old pick reproduces `ladder-qlike-per-line` exactly (+0.000%).

## Verdicts

| Part | Question | Δ QLIKE vs our pick (+ = Jordan-style worse) | Verdict |
|---|---|---|---|
| A (`ladder-jordan-recipe`) | Best fast-TR σ (walk-forward among ATR 2/3/10, EMA α 0.15–0.60), scale fitted | **+1.85% [+0.66, +2.31]** (2020–22 +0.59%, 2023–26 +2.89%) | **NULL** |
| B (`ladder-jordan-recipe-published`) | 3-day ATR × textbook constants, as published, no refit | **+9.05% [+6.87, +9.85]** (both halves +7.6% / +10.3%) | **NULL** |

Part A by instrument: NQ +2.3%, GOLD +3.0%, EURUSD +1.2%, USDJPY +0.9% (n.s.). By line: HL +3.5%, OH +1.2%, OL +2.0%.
Part B by line: HL +23.6%, OH +5.7%, OL +8.3%.

## Where the Jordan-style arms rank in the 51–55-model field

- **EMA of True Range α 0.15** (the C.OG Bank's recommended setting, ~12-day memory) is the best of the family and
  ranks about 13th–32nd. The walk-forward picker chose it on gold, EURUSD and USDJPY; NQ picked α 0.30–0.40.
- **The fast versions that match Jordan's 23 Nov numbers** (3-day ATR, 2-day ATR, EMA α 0.5–0.6) rank 35th–51st.
- 3-day ATR × textbook constants, exactly as published, ranks 24th–50th (mostly 46th–50th).

## Hit rates (% of sessions beyond the line; targets 50 / 25 / 10)

| | Jordan-style (3-day ATR × textbook) HL / OH / OL | Ours (QLIKE ladder) HL / OH / OL |
|---|---|---|
| NQ | 46/24/12 · 49/23/10 · 47/26/14 | 58/28/11 · 51/28/12 · 52/27/10 |
| GOLD | 46/24/12 · 49/25/13 · 45/24/13 | 52/26/10 · 56/27/10 · 48/24/11 |
| EURUSD | 44/23/12 · 47/25/12 · 49/26/11 | 50/24/10 · 48/25/9 · 51/26/10 |
| USDJPY | 42/23/13 · 46/23/11 · 45/25/12 | 50/27/12 · 50/24/10 · 50/25/10 |

## Reading

- On average the Jordan-style lines hit at roughly the right rates. The textbook constants are about right overall;
  the p50 lines are a little wide (42–49% beyond) and the p90 lines a little tight (10–14%).
- They score worse because the σ is noisy. A 2–3 day window swings with every big day, so the lines are too wide
  after a spike and too tight before one. QLIKE penalises that day by day even when the averages come out right.
- Graded weight: against. Keep our picks; if a TR-based σ is wanted, the Bank's α 0.15 EMA is the one to use.
