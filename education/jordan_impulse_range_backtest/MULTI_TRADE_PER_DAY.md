# Does relaxing "one trade per day" find edge the engine was leaving on the table?

Follow-up to the baseline backtest ([RESULTS.md](RESULTS.md), Sharpe −5.99
gold / −2.49 NQ). The baseline engine only ever takes the **first**
qualifying setup each day, one trade/day — flagged in RESULTS.md's caveats
as untested: "a genuinely better setup later the same day is never taken."
Owner's observation, from a real intraday chart: it's common to see a
**second** impulse the same day, after the first one has already resolved
— so is the engine silently discarding real opportunities?

`js/impulseEmaRangeV1Engine.js` stays pinned and untouched. This test's
`maxTradesPerDay` cfg lives on **`js/impulseEmaRangeV2Engine.js`**, a
versioned fork (default `1`, fully backward-compatible — **verified
byte-identical to v1's existing committed baseline `trades.json` for both
instruments** before trusting anything below). When `>1`, the scanner
resumes right after each trade's own exit and looks for the next
qualifying setup the same day, same rules,
same gates — exactly the pattern in the screenshots (first impulse already
resolved, second impulse just forming its own zone).

## The premise is confirmed — this is NOT a rare edge case

| | Gold | NQ |
|---|---|---|
| Total trading days in the backtest | 3,156 | 3,149 |
| Days with a 2nd+ qualifying setup | **3,027 (96%)** | **3,056 (97%)** |

Almost every trading day has at least one more qualifying setup after the
first trade resolves. This isn't a rare "sometimes you get lucky" case —
the one-trade/day cap is discarding a same-size second opportunity on
**nearly every single day**. Whatever the engine finds, it's finding it
twice a day, most days.

## But taking them doesn't help — it makes the annualized result worse

Script: [`scripts/multi_trade_per_day.mjs`](scripts/multi_trade_per_day.mjs).
Sweeps `maxTradesPerDay` = 1 (control) / 2 / 3 / 5, both instruments:

**Gold:**

| maxTradesPerDay | Trades | Win% | Sharpe | PF | OOS Sharpe | 2nd+-only Win% | 2nd+-only Sharpe |
|---|--:|--:|--:|--:|--:|--:|--:|
| 1 (control) | 3,156 | 24.1% | −5.99 | 0.357 | −4.44 | — | — |
| 2 | 6,183 | 25.3% | −8.03 | 0.380 | −6.14 | 26.5% | −5.36 |
| 3 | 9,088 | 25.3% | −10.36 | 0.368 | −8.38 | 25.9% | −8.48 |
| 5 | 14,600 | 25.6% | −13.66 | 0.366 | −11.23 | 26.1% | −12.35 |

**NQ:**

| maxTradesPerDay | Trades | Win% | Sharpe | PF | OOS Sharpe | 2nd+-only Win% | 2nd+-only Sharpe |
|---|--:|--:|--:|--:|--:|--:|--:|
| 1 (control) | 3,149 | 32.3% | −2.49 | 0.642 | −2.63 | — | — |
| 2 | 6,205 | 31.5% | −4.03 | 0.608 | −3.84 | 30.6% | −3.32 |
| 3 | 9,150 | 30.9% | −5.31 | 0.586 | −4.99 | 30.2% | −4.88 |
| 5 | 14,750 | 30.2% | −7.03 | 0.574 | −6.98 | 29.6% | −6.75 |

Full detail per instrument: `data/gold.multi_trade_per_day.json`,
`data/nq.multi_trade_per_day.json`.

**Reading it straight:** win rate barely moves (24.1%→25.6% gold,
32.3%→30.2% NQ — noise either direction) as more trades/day are allowed,
which means each extra trade carries essentially the **same negative
per-trade edge** as the first trade of the day, not a worse or better one.
The "2nd+-only" column confirms this directly: those trades alone perform
about the same as the full population, not distinctly better or worse.
Since Sharpe scales with `sqrt(trades/year)` at a fixed per-trade edge, and
that edge stays negative, simply taking more of the same trades makes the
annualized number worse — 4-5× more trades roughly doubles-to-triples how
negative the Sharpe reads, with no offsetting improvement in win rate or
profit factor.

**Conclusion: the one-trade/day cap was never hiding real edge.** The
engine finds a same-shape setup on ~97% of days regardless of the cap —
the screenshots' "two impulses today" is the normal case, not a lucky
day — but every one of those setups shares the same negative expectancy as
the first, so taking more of them just realizes more of the same losing
edge, faster. This is consistent with the other two independent nulls on
this engine family (baseline backtest, VuManChu confirmation gate,
[MAE_DYNAMIC_STOP.md](MAE_DYNAMIC_STOP.md)) — the problem isn't *how many*
trades or *how* the stop is managed, it's the entry signal itself.

## Reproduce

```bash
node education/jordan_impulse_range_backtest/scripts/multi_trade_per_day.mjs gold education/jordan_impulse_range_backtest/data
node education/jordan_impulse_range_backtest/scripts/multi_trade_per_day.mjs nq   education/jordan_impulse_range_backtest/data ./portfolioBacktest/cache
```
