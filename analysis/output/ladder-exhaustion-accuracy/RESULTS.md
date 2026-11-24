# ladder-exhaustion-accuracy: results

Prereg: `forge/LADDER_EXHAUSTION_ACCURACY_PREREG.md` (pushed d89c8a27 before scoring). Seed 20261123, B = 2000,
63-session blocks. Script `scripts/ladder-exhaustion-accuracy/score.py`; `results.json`, `report.txt`,
`accuracy.csv`. Futures NQ, GC, 6E, 6J, test 2020 → 2026-08-21 (~1,650 sessions each).

The question: whose median line lands nearer the day's actual high-low range (where the projected extreme
exhausts) and the actual close?

## Verdict (HL, Jordan's recipe as published vs ours): **NULL**, meaning ours is nearer

| Line | Jordan as published (3-day ATR × textbook) vs ours | Bank EMA α 0.15 × textbook vs ours |
|---|---|---|
| **High-low** | **+13.0% more error [+11.6, +14.8]** (2020–22 +12.7%, 2023–26 +13.7%) | +6.0% [+4.8, +7.3] |
| by instrument | NQ +6.6%, GOLD +16.5%, EURUSD +14.3%, USDJPY +14.5% | NQ +3.8%, GOLD +6.5%, EURUSD +5.2%, USDJPY +8.4% |
| **Close** | **+2.8% more error [+2.1, +3.7]**, both halves | +1.0% [+0.3, +1.7] |

## Descriptive

| | Mean miss, HL (% of open) ours / Jordan | HL within 20% of actual, ours / Jordan | Close within 20%, ours / Jordan |
|---|---|---|---|
| NQ | 0.66 / 0.70 | 40% / 36% | 16% / 15% |
| GOLD | 0.51 / 0.60 | 40% / 33% | 15% / 16% |
| EURUSD | 0.20 / 0.23 | 42% / 35% | 16% / 16% |
| USDJPY | 0.27 / 0.31 | 38% / 34% | 16% / 17% |

**After a big day** (prior day's HL above its 80th percentile): Jordan's line overshoots (NQ 3.26 vs actual 3.02,
gold 2.41 vs 2.16, USDJPY 1.21 vs 1.06); ours undershoots (NQ 2.28 vs 3.02). On NQ after big days the two miss
by the same amount (0.98 vs 0.99); everywhere else ours is nearer.

## Reading

- For the purpose that matters, landing the day's high and low, our HL line is nearer the actual range on all four
  instruments and in both halves. That's 13% less miss than Jordan's recipe and 6% less than the Bank's EMA.
- The close is far harder for everyone: the line lands within 20% of the actual close on only ~16% of days. Ours
  is slightly nearer.
- The one place Jordan's recipe draws level is NQ the day after a big day, where ours sits too low.
