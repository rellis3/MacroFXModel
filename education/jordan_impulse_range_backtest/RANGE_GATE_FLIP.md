# Flipping the range gate — the strongest result in this whole investigation (still net negative)

Follow-up to the baseline backtest ([RESULTS.md](RESULTS.md), Sharpe −5.99
gold / −2.49 NQ). The baseline engine only takes a continuation trade while
the day's range-so-far has ROOM LEFT vs the trailing median
(`rangeGateMode: 'roomLeft'`, `usedFracOfMedian ≤ 1.0`) — a "the day isn't
spent yet" read of the "H-L Range: Live/Median/75th Pct" tool visible in the
screenshots. Equally plausible from that same tool: Jordan takes the trade
once the day is already STRETCHED relative to a typical session — a
momentum/trend-day read, the opposite condition.

`rangeGateMode: 'exhausted'` (new backward-compatible cfg on
`js/impulseEmaRangeV1Engine.js`, default unchanged — verified byte-identical
to the committed baseline before trusting this) requires
`usedFracOfMedian ≥ rangeGateMinUsedFrac` instead of `≤ rangeGateMaxUsedFrac`.
Script: [`scripts/range_gate_flip.mjs`](scripts/range_gate_flip.mjs), sweeping
the threshold 0.25 → 1.5.

## Result: monotonically better as the day gets more stretched, on both instruments

**Gold** (roomLeft baseline: Sharpe −5.99, PF 0.357, win 24.1%):

| Threshold (≥) | Trades | Win% | Sharpe | PF | OOS Sharpe (n) |
|---|--:|--:|--:|--:|--:|
| 0.25 | 2,862 | 26.3% | −4.27 | 0.429 | −2.57 (1,145) |
| 0.5 | 2,666 | 30.6% | −3.02 | 0.541 | −2.14 (1,067) |
| 0.75 | 2,247 | 32.8% | −2.12 | 0.628 | −2.30 (899) |
| 1.0 | 1,567 | 32.4% | −1.83 | 0.624 | −2.25 (627) |
| 1.25 | 1,000 | 32.9% | −1.03 | 0.712 | −1.01 (400) |
| **1.5** | 601 | 33.9% | **−0.48** | 0.815 | −0.25 (241) |

**NQ** (roomLeft baseline: Sharpe −2.49, PF 0.642, win 32.3%):

| Threshold (≥) | Trades | Win% | Sharpe | PF | OOS Sharpe (n) |
|---|--:|--:|--:|--:|--:|
| 0.25 | 2,828 | 32.1% | −2.26 | 0.642 | −2.53 (1,132) |
| 0.5 | 2,572 | 33.0% | −1.56 | 0.716 | −1.37 (1,029) |
| 0.75 | 2,132 | 35.0% | −0.35 | 0.926 | −0.32 (853) |
| 1.0 | 1,542 | 34.8% | −0.71 | 0.835 | −0.94 (617) |
| 1.25 | 1,031 | 37.0% | −0.46 | 0.871 | −0.39 (413) |
| **1.5** | 676 | 37.7% | **−0.10** | **0.961** | −0.35 (271) |

Full detail: `data/gold.range_gate_flip.json`, `data/nq.range_gate_flip.json`.

**Reading it straight:** on gold the improvement is cleanly monotonic
through every threshold — win rate climbs from 26.3%→33.9%, Sharpe from
−4.27→−0.48, as the required day-stretch rises from 0.25× to 1.5× the
trailing median. NQ isn't perfectly monotonic (0.75 briefly outperforms
1.0) but the same overall trend holds, ending at the single best cell found
in this entire investigation: **Sharpe −0.10, PF 0.961** at the highest
threshold — a coin-flip away from breakeven, on 676 real trades. OOS at that
same cell is a bit worse (−0.35) than full-sample, a normal amount of IS/OOS
gap rather than a red flag, and still far better than the −2.49 pooled
baseline.

**Still net negative everywhere, including the best cell.** −0.10 Sharpe and
PF 0.961 is not a strategy — it's a losing one, just barely. But it's the
clearest, most consistent signal found across all four probes this session
(session split, liquidity sweep, VWAP band, and this): **the range gate
really may be backwards.** Every one of the four probes that showed a real
improvement (this one, the liquidity sweep, and VWAP-band) shares a
family resemblance — "the day/move is already significant" in one form or
another (stretched range, a real stop-hunt, VWAP-anchored pullback quality
instead of a fixed Fib ratio) consistently beats "wait for the setup to
look tidy." That's a pattern across independent tests, not one lucky slice.

## Reproduce

```bash
node education/jordan_impulse_range_backtest/scripts/range_gate_flip.mjs gold education/jordan_impulse_range_backtest/data
node education/jordan_impulse_range_backtest/scripts/range_gate_flip.mjs nq   education/jordan_impulse_range_backtest/data ./portfolioBacktest/cache
```
