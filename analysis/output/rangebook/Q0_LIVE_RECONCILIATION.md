# Q0 — Did the old (biased-book) Vote Atlas actually win live? Reconciliation of the live demo record vs the honest backtest

Run 2026-10-02. Live fills: `GET /api/trade-history?from=2026-08-25&to=2026-10-02` (production; MT5 demo, bot keys
`volatility_bot_v2_status` = VA, the bot that ran on the biased book from 31 Aug, and `volatility_bot_v3_status` = VA3 from
18 Sep). Honest backtest: `GET /api/level-atlas/vote-portfolio?pairs=<30 instruments>` (R2, rebuilt nightly, schema 4, runs
to 2026-10-02). Each live trade is matched to the honest trade with the same instrument / side / rung nearest in time
(within 36 h): 511 of 599 matched. Raw files: analysis/output/rangebook/q0/ (gitignored JSON).

## The live record (demo account, P&L in account currency)
| bot | week of | trades | win | P&L | cumulative |
|---|---|---|---|---|---|
| VA (v2) | 31 Aug | 79 | 66% | **+20,560** | +20,560 |
| VA (v2) | 7 Sep | 80 | 51% | −3,029 | +17,531 |
| VA (v2) | 14 Sep | 136 | 37% | −2,727 | +14,804 |
| VA (v2) | 21 Sep | 110 | 45% | −620 | +14,184 |
| VA (v2) | 28 Sep | 27 | 41% | −339 | +13,846 |
| VA3 (v3) | 18 Sep → 29 Sep | 167 | 50% | −5,456 | −5,456 |

- "It won" = **one week**. Every week after the first lost, on both bots.
- Week 1's +20.6k came from 10 trades (69% of it); the whole v2 period without its best 10 trades is **−574**.
- Week 1 by instrument: CADJPY +6.5k, NQ +5.6k, DOW +4.3k, DAX +3.9k; USDJPY −2.8k, UK100 −1.2k.

## Live vs the honest backtest on the SAME trades, and on the trades the bot did not take
| week | bot | n | live R/trade | honest win on those | honest pnl%/trade | not taken (n) | honest win | honest pnl%/trade |
|---|---|---|---|---|---|---|---|---|
| 31 Aug | v2 | 69 | **+0.23** | 59% | +0.015 | 46 | 52% | +0.028 |
| 7 Sep | v2 | 70 | −0.04 | 61% | +0.024 | 43 | 47% | −0.020 |
| 14 Sep | v2 | 117 | −0.07 | 52% | +0.010 | 29 | 66% | +0.086 |
| 21 Sep | v2 | 88 | −0.08 | 61% | +0.035 | 24 | 54% | +0.077 |
| 28 Sep | v2 | 23 | −0.09 | 70% | +0.018 | 75 | 55% | −0.004 |
| 21 Sep | v3 | 98 | +0.04 | 62% | +0.037 | 24 | 54% | +0.077 |
| 28 Sep | v3 | 42 | −0.15 | 52% | −0.072 | 75 | 55% | −0.004 |

- The honest book over the same 5 weeks, all 30 instruments: 861 trades, 54% win, **−0.002% per trade** (week 1 alone −1.46% total).
- The biased bot's direction agreed with the honest decision on only 78% of matched trades.
- **Selection:** the trades the bot took were not better than the ones it skipped (honest win 52–70% taken vs 47–66% not taken, no consistent gap). Nothing in the live record points to a hidden filter.
- **Execution:** in week 1 live made +0.23R/trade on trades the honest book scores at +0.015%/trade; in every later week live did WORSE than the honest book on the same trades (−0.04 to −0.15R vs +0.01 to +0.04%). Week 1 was favourable fills on a good week, not an edge.

## Verdict
The old book did win live — for one week, concentrated in 10 trades, on a demo account — and then lost for four. That is what a
fair-odds system looks like over five weeks. The honest backtest's expectation for the period (≈ 0) is consistent with the
full live record (+13.8k that is −0.6k without the best ten trades). There is no live-vs-backtest discrepancy to mine for a
hidden selection rule.
