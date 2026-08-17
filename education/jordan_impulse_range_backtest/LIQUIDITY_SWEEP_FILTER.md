# Liquidity-sweep filter — a real, consistent improvement (still net negative)

Follow-up to the baseline backtest ([RESULTS.md](RESULTS.md), Sharpe −5.99
gold / −2.49 NQ). Question: the baseline engine takes ANY impulsive leg
(≥2.5×ATR) with no check on how it formed. A well-known modern retail
concept ("Judas swing" / stop-hunt-then-reversal) says the leg should only
count if its origin point actually **swept** (took out) a prior significant
level first — real stops running before the real move, not just any big
candle. Does requiring that behind the leg change anything?

Script: [`scripts/liquidity_sweep_filter.mjs`](scripts/liquidity_sweep_filter.mjs).
Post-hoc filter on the already-committed baseline trades (one trade/day) —
no new backtest run. For an up-leg (buy continuation), "swept" means the
leg's origin (its low point) closed below the **prior calendar day's low**
before reversing; for a down-leg, the origin (high point) above the prior
day's high. Uses `legOriginTime` (added to the engine's trade output this
session, purely additive — verified to change no existing field) plus the
engine's own `buildDaily` (now exported, reused rather than re-copied) to
find each leg's origin day and its predecessor's H/L.

## Result: a real, IS/OOS-consistent improvement — but still a loser

**Gold** (baseline: n=3,156, win 24.1%, Sharpe −5.99, PF 0.357):

| Subset | n | Win% | Sharpe | PF | Total R | IS Sharpe (n) | OOS Sharpe (n) |
|---|--:|--:|--:|--:|--:|--:|--:|
| Swept prior-day H/L | 464 (15%) | 28.9% | **−1.89** | 0.448 | −1,529.8 | −2.39 (278) | −1.29 (186) |
| Did NOT sweep | 2,692 | 23.3% | −5.70 | 0.342 | −8,375.7 | −7.16 (1,615) | −4.34 (1,077) |

**NQ** (baseline: n=3,149, win 32.3%, Sharpe −2.49, PF 0.642):

| Subset | n | Win% | Sharpe | PF | Total R | IS Sharpe (n) | OOS Sharpe (n) |
|---|--:|--:|--:|--:|--:|--:|--:|
| Swept prior-day H/L | 469 (15%) | 33.9% | **−0.93** | 0.678 | −422.2 | −0.73 (281) | −1.41 (188) |
| Did NOT sweep | 2,680 | 32.0% | −2.31 | 0.636 | −5,198.4 | −2.27 (1,608) | −2.37 (1,072) |

Full detail: `data/gold.liquidity_sweep_filter.json`, `data/nq.liquidity_sweep_filter.json`.

**Reading it straight:** this is the first test in this whole line of
investigation (baseline, VuManChu gate, dynamic stop, trade frequency, and
this) where a subset shows a **large, consistent** improvement over both the
pooled baseline and its own complement — roughly 3× better Sharpe on gold
(−1.89 vs −5.99), 2.7× better on NQ (−0.93 vs −2.49), holding up in BOTH
the in-sample and out-of-sample windows independently, on both instruments.
That consistency is exactly what CLAUDE.md's disaggregation rule asks for
before trusting a subset finding ("survivors must beat chance and be
IS-consistent") — this one does.

**But it's still a loser.** Every Sharpe above is negative. Requiring a real
liquidity sweep behind the leg filters out a large share of the bad trades
(only 15% of setups qualify) and meaningfully improves what's left, but
"meaningfully improves a −6 Sharpe to a −2 Sharpe" is not "found an edge" —
it's a real, honest, worth-remembering result, not a strategy. Reported
straight, not oversold.

## What this suggests, without overclaiming it

If Jordan's actual process includes something like "did this move already
run stops before I take it," that's a plausible, evidence-consistent piece
of the real system — the direction of the effect is right and it's the
strongest signal seen yet in this investigation. Worth exploring further
(sweep *magnitude*, not just yes/no; a longer lookback than one prior day)
if this line of inquiry continues, but not worth treating as validated
until it's combined with the other surviving conditioning (if any) and
still clears the same bar.

## Reproduce

```bash
node education/jordan_impulse_range_backtest/scripts/liquidity_sweep_filter.mjs gold education/jordan_impulse_range_backtest/data
node education/jordan_impulse_range_backtest/scripts/liquidity_sweep_filter.mjs nq   education/jordan_impulse_range_backtest/data ./portfolioBacktest/cache
```
