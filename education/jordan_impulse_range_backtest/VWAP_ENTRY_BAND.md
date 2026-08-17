# VWAP-anchored entry band — a real, threshold-robust improvement (still net negative)

Follow-up to the baseline backtest ([RESULTS.md](RESULTS.md), Sharpe −5.99
gold / −2.49 NQ). Question: is a fixed 38.2–61.8% Fib retracement really the
pullback-quality trigger, or would distance from the session's own VWAP
explain the entries just as well (or better)? Same impulse leg, same EMA
agreement, same range gate — only the "is this pullback good enough" check
changes: `entryBandMode: 'vwap'` (v1 stays pinned and untouched; this cfg
lives on **`js/impulseEmaRangeV2Engine.js`**, a versioned fork, default
unchanged — verified byte-identical to v1's committed baseline before
trusting this) requires `|close − sessionVWAP| ≤ vwapBandAtrMult × ATR`
instead of the Fib fraction.
VWAP is session-anchored (resets at the day boundary, reusing
`js/vumanchuCore.js`'s `computeVWAP`, not re-derived).

Script: [`scripts/vwap_entry_band.mjs`](scripts/vwap_entry_band.mjs), sweeping
`vwapBandAtrMult` = 0.25 / 0.5 / 0.75 / 1.0 / 1.5.

## Result: consistently better than the Fib band, at every threshold tried

**Gold** (Fib baseline: Sharpe −5.99, PF 0.357, win 24.1%):

| vwapBandAtrMult | Trades | Win% | Sharpe | PF | OOS Sharpe (n) |
|---|--:|--:|--:|--:|--:|
| 0.25 | 3,098 | 29.3% | −3.79 | 0.503 | −2.98 (1,240) |
| **0.5** | 3,161 | 29.0% | **−3.66** | 0.521 | −2.39 (1,265) |
| 0.75 | 3,182 | 28.5% | −3.71 | 0.512 | −2.52 (1,273) |
| 1.0 | 3,190 | 28.7% | −3.74 | 0.514 | −2.62 (1,276) |
| 1.5 | 3,195 | 27.4% | −4.01 | 0.491 | −2.95 (1,278) |

**NQ** (Fib baseline: Sharpe −2.49, PF 0.642, win 32.3%):

| vwapBandAtrMult | Trades | Win% | Sharpe | PF | OOS Sharpe (n) |
|---|--:|--:|--:|--:|--:|
| 0.25 | 3,101 | 33.5% | −1.16 | 0.810 | −2.10 (1,241) |
| 0.5 | 3,161 | 34.8% | −0.92 | 0.847 | −1.59 (1,265) |
| 0.75 | 3,179 | 34.8% | −0.92 | 0.848 | −1.91 (1,272) |
| 1.0 | 3,190 | 34.6% | −0.84 | 0.864 | −1.61 (1,276) |
| **1.5** | 3,199 | 34.9% | **−0.76** | 0.876 | −1.39 (1,280) |

Full detail: `data/gold.vwap_entry_band.json`, `data/nq.vwap_entry_band.json`.

**Reading it straight:** every single threshold on both instruments beats
the Fib-band baseline, by a wide margin on NQ (−0.76 to −1.16 vs −2.49 —
roughly a 2-3× improvement) and a real one on gold (−3.66 to −4.01 vs
−5.99). Two things make this more credible than a lucky slice: it holds at
**every** threshold tried (not one cherry-picked value), and it barely moves
across a 6× range of thresholds (0.25×ATR to 1.5×ATR) — a real effect tends
to be stable to nearby parameter choices; an overfit one is usually sharply
threshold-dependent. Trade count is also nearly unchanged from baseline
(~3,100-3,200 vs 3,156/3,149) — this isn't a case of quietly cutting the
sample down to something small and lucky, it's close to the same population
of trades with a different entry-timing filter applied to almost all of them.

**But it's still a loser.** Every cell above is negative Sharpe. Distance
from session VWAP is a better pullback-quality read than the fixed Fib band
for THIS entry idea, on this data — a real, worth-remembering, negative
result, not evidence the underlying continuation idea has edge.

## Reproduce

```bash
node education/jordan_impulse_range_backtest/scripts/vwap_entry_band.mjs gold education/jordan_impulse_range_backtest/data
node education/jordan_impulse_range_backtest/scripts/vwap_entry_band.mjs nq   education/jordan_impulse_range_backtest/data ./portfolioBacktest/cache
```
