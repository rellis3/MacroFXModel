# Fib Atlas — backtest vs live, 2026-09-11

> Step 3 of `LIVE_BACKTEST_ALIGNMENT.md`: can the Fib Atlas vote portfolio be
> frozen as the expectation a live book is ranked against? **No — not for
> anything denominated in money.** This records why, with the numbers, and what
> would change the verdict. Read alongside `CONFLUENCE_LIVE_VS_BACKTEST.md`
> (drift #8), which is the same kind of document for a different engine.

## 0. Verdict

The backtest reports **Sharpe 18.4, CAGR 233,082%, 85.7% win rate at a 1:1
payoff.** No FX strategy sustains 85% wins at 1R:1R; that single figure is the
inflation. The live bot over the same 8-pip-barrier game wins **39.6%** — a
46-point gap that no cost model closes on its own.

- **Usable for:** trade counts per day (already the basis of the Fib Atlas
  frequency card), instrument mix, session mix, MFE/MAE *shape*. Counts don't
  inflate.
- **Not usable for:** return, Sharpe, drawdown, win rate, expectancy, or any
  `P## exp` badge. `bot-audit`'s plausibility guard rejects it, correctly.
- **The live paper bot is losing at a rate the backtest says is impossible.**
  That is the audit terminal doing its job, and it is the more urgent finding.

## 1. The numbers

Backtest: `/api/asia-fib-atlas/vote-portfolio-combined`, production config
(16 pairs, both ladders, margin≥2, gap≤30m, cost≥3×, stop-tighten 0.9,
chandelier, maxConcurrent=1 + perDirection=true, 0.5% risk). 10,190 trades,
2021-07 → 2026-09.

Live: `/api/trade-history`, `fib_atlas_bot_status`, 2026-06-14 → 2026-09-11,
101 closed trades after dedupe (paper — `botRegistry.js` marks it so).

| | Backtest | Live |
|---|---|---|
| Win rate | 85.7% (`rMultiple > 0`) | 39.6% (net) / 39.6% (gross) |
| Avg win / avg loss (R) | +1.07 / −1.05 | — (no `sl_at_entry` on rows before 2026-09-11) |
| Payoff | 1.02 | 0.77 ($357 / $466) |
| Median stop / target | 8.2 / 8.2 pips (p10 4.0, p90 18.3) | — |
| Median realised win / loss | ~8.2 / ~8.2 pips | **3.5 / 4.8 pips** |
| Median hold | ~40 min | **9 min** |
| Exit mix | — | 66 sl · 32 tp · 3 manual |
| Trades per active day | median 6, mean 7.3 | median 8, mean 11.2 |
| Top instrument | (16-pair universe) | EURGBP — 26 of 101 |
| Result | +3,824% non-compounded over 5y | **−$13,696** in 90 days |

Two things the backtest does *not* do wrong, checked and cleared:

- Winners' MAE breaching the stop (a target counted before a stop that was
  actually hit first): **0.7%** of winners. Not the mechanism.
- Duplicate counting from same-direction stacking (`perDirection`): fixing it
  changed trade count by 17 of ~10k. Not the mechanism either — the 27% figure
  in the 2026-08-31 correction was PnL share, and it is already applied.

## 2. Where the gap most likely lives — ranked

**1. Fill and spread on an 8-pip game.** The backtest fills at the rung and
races 8 pips each way. Live pays spread on entry and on exit. On EURGBP or
AUDCAD that is 1–2 pips a side against an 8-pip target: the realised win is
target − 2·spread ≈ 4–6 pips (live median win **3.5**), and the effective stop
is reached ~2 pips sooner than modelled. `minCostRatio=3` was meant to exclude
exactly this, but the live instrument mix (EURGBP first) says the filter's cost
inputs and the broker's real spreads disagree. A 9-minute median hold against
40 modelled is what "spread walks you into the stop" looks like.

**2. Touch ≠ fill.** A limit at the rung is modelled as filled on any M1 bar
whose range reaches it. In reality a touch that reverses without trading
through does not fill, and the touches that *do* fill are disproportionately
the ones that continue through — i.e. the losers. This is a selection effect
on entries and it is invisible in a bar-level backtest.

**3. Same-bar barrier resolution on M1.** With 8-pip barriers, an M1 bar
spanning 16 pips hits both. `backtestExitStudy` resolves that conservatively
(stop first). Whether `asiaFibAtlasEngine` / `asiaFibAtlasVoteReview` does is
**not confirmed** — it is the next thing to read.

**4. Live barriers are not the backtest's barriers.** Live median win 3.5 /
loss 4.8 pips vs 8.2 / 8.2 modelled. Either the live bot sizes stops tighter
than the vote review assumed, or spread compresses both, or the live universe
skews to low-range crosses. Whichever it is, the live bot is not playing the
game the backtest scored.

None of these is a unit bug. The arithmetic is internally consistent — 7 trades
a day at 0.5% risk and 85% wins *is* +2.5%/day. The inflation is upstream of
the arithmetic, in what counts as a fill and what a fill costs.

## 3. What would change the verdict

One re-run, three changes, compare win rate:

1. Charge the broker's **real** spread on both legs (not the registry default),
   per instrument, from the live status keys' own spread reports.
2. Fill at rung ± spread, not at the rung.
3. Confirm same-bar hits resolve stop-first; if not, make them.

If that run's win rate lands near **40–50%**, the backtest was measuring
execution optimism and the corrected series is a candidate reference. If it
stays above ~70%, hypothesis 2 (touch ≠ fill) is the driver and the engine
needs tick-level or next-bar fill logic before it can be trusted for money.

Until then: **freeze nothing from it.** A `P## exp` badge against Sharpe 18
would read as "your bot is broken" every day, forever, and the bot is not the
thing that is broken.

## 4. The live finding, stated plainly

The paper Fib Atlas bot lost **$13,696 in 90 days** at a 39.6% win rate and a
0.77 payoff, with two-thirds of exits on the stop. The backtest it was
deployed on says 85.7% wins. The audit terminal was built to surface exactly
this gap, and it did on its first real pull. Whatever is decided about the
backtest, the bot should not go live on it.

From 2026-09-11 every closed row carries `sl_at_entry` and `r`
(`pylego/broker/stops.py`), so the next 90 days of this comparison will be in
R on both sides rather than pips on one and R on the other.
