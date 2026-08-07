# QMR walk-forward — the committed run (2026-07-28)

`TRADABILITY_REVIEW.md` §4 closed with *"you can't even see the numbers —
first commit an honest, costed, OOS run; only then is there something to
evaluate."* The endpoint to do it (`/api/nq-qmr/walkforward-retrain`) has
existed since the engine was built and was **never once recorded**. This
file is that run, so it stops being a dashboard impression and becomes a
number with a date on it.

- **Instrument:** NAS100_USD, OANDA H1, 5y (the full available history)
- **Engine:** `server.js _computeNqQmr()` (System 1 only — no fade patches)
- **Costs:** 0.8bp round-trip + 0.5bp extra slippage on stop exits, charged
  **before** leverage (`_qmrNetReturn`)
- **Protocol:** IS = 12 months, OOS = 6 months, step = 3 months. Per window
  a 540-config grid is scored on IS only (`sharpe × √cagr / maxDD`), and the
  winning config is applied untouched to the next 6 months.
- **Run date:** 2026-07-28

## The honest chain

The endpoint emits 15 windows, but with OOS = 6mo and step = 3mo **they
overlap by half** — so the `oosCurve` it stitches double-counts every
calendar day and reaches a meaningless 10.9×. Taking every second window
gives a contiguous, non-overlapping, gap-free chain:

| OOS period | n | Sharpe | Return | Window maxDD | Chained equity |
|---|---|---|---|---|---|
| 2022-07 → 2023-01 | 67 | 1.79 | +21.3% | 8.2% | 1.21 |
| 2023-01 → 2023-07 | 58 | 2.52 | +46.5% | 11.3% | 1.78 |
| 2023-07 → 2024-01 | 48 | **−0.84** | −11.2% | 13.2% | 1.58 |
| 2024-01 → 2024-07 | 48 | 0.83 | +10.3% | 11.3% | 1.74 |
| 2024-07 → 2025-01 | 60 | 2.51 | +53.5% | 8.1% | 2.67 |
| 2025-01 → 2025-07 | 58 | **−0.45** | −4.8% | 12.2% | 2.54 |
| 2025-07 → 2026-01 | 42 | 2.16 | +26.0% | 5.1% | 3.21 |
| 2026-01 → 2026-07 | 52 | 0.91 | +7.6% | 8.0% | 3.45 |

**4.0 contiguous years · 433 OOS trades · mean OOS Sharpe 1.18 (sd 1.30,
t ≈ 2.6) · 6/8 windows positive · 3.45× ≈ 36.3% CAGR, after costs.**

Mean IS Sharpe across the same windows was 1.96 → OOS 1.18: a ~40%
degradation, which is normal-to-good for a re-optimised walk-forward and
far better than the forecaster family's ~56% (`TRADABILITY_REVIEW.md` §2).

**Parameter stability** is itself part of the evidence: `stopMultiplier`
0.35 was chosen in 12 of 15 windows and `tpPct` stayed inside 1.00–1.50 in
every window. The grid keeps landing in the same corner rather than
wandering — the signature of a shallow optimum rather than a fitted spike.
Note the live monitor runs `stopMultiplier` **0.45**, which the data has
never once picked (open item in `FIX_TRACKER.md` Batch 3).

## Full-sample default config, for reference

`NQ_QMR_DEFAULTS`, System 1, 2021-08 → 2026-07: n=609, Sharpe 0.91,
CAGR 21.0%, maxDD 20.3%, win rate 31.5%, PF 1.25, avg win +2.77% vs avg
loss −1.02%, exits 401 STOP / 138 EOD / 70 TP. Positive in **every**
calendar year: 2021 +0.3%, 2022 +18.9%, 2023 +30.9%, 2024 +36.6%,
2025 +9.9%, 2026-YTD +9.7%. No single year carries the result — but the
last 18 months are visibly the weakest stretch.

## What this result is NOT

1. **It is levered ≈3.4×** (`leverage = riskPct / effStopPct`, riskPct 1%,
   stops averaging 0.29%). Unlevered ≈10.6%/yr.
2. **The benchmark:** NQ buy-and-hold over the identical window returned
   **+91% / 13.9% CAGR**. On raw return this does not beat holding NQ. Its
   case is risk-adjusted: 20% maxDD vs NQ's −35% in 2022, no overnight or
   weekend gap exposure (max 7 hours held, ~49% of weekdays). *A properly
   computed buy-and-hold Sharpe for the same window has not been done and
   should be added — the comparison above is CAGR-only.*
3. **It is cost-critical.** Swept live on the default config:

   | round-trip cost | Sharpe | CAGR |
   |---|---|---|
   | 0.8bp (default) | 0.91 | +21.0% |
   | 2.0bp | 0.57 | +11.7% |
   | 4.0bp | 0.04 | **−1.7%** |
   | 6.0bp | −0.54 | −14.8% |

   At 3.4× leverage and ~120 trades/yr, **1bp of extra round-trip cost ≈ 4
   points of CAGR**. The edge dies between 2 and 4bp. The 0.8bp default has
   never been checked against OANDA's actual NAS100 spread at 13:00 UTC
   (pre-cash-open) and 20:00 UTC — that measurement is the highest-value
   outstanding data task, ahead of any signal work.
4. **~5 years is one regime cycle** (2022 bear, 2023–25 bull). No 2018, no
   2020. And the strategy *family* was discovered on this same data — the
   walk-forward protects the parameters, not the idea.
5. **It is not what it says on the tin.** See below — the direction call
   was measured the same day and is null. The money above is real; the
   stated mechanism for it is not.

## The control arm — run 2026-07-28, registered in advance (§5b)

| Full sample, n=609 | mean %/trade | Sharpe | total |
|---|---|---|---|
| Gates' direction (S1) | +0.1770 | 0.91 | +157% |
| **Inverse — same days, same stop/TP/leverage/costs** | **+0.1883** | **0.98** | **+176%** |
| Coin flip = (S1 + inverse)/2 | +0.1826 | — | — |
| **dirAlpha = S1 − coin flip** | **−0.0056 (t = −0.08)** | | |

**Trading the exact opposite of every QMR signal for five years makes
slightly more money than following it.** The direction call contributes
nothing, and the selectivity sweep says the gates aren't selecting days
either — the coin-flip return is flat from gates-off (0.172%, n=856) to
strict (0.186%, n=384), and the gates-off arm has the *higher* Sharpe.

So Gate 1 and Gate 2 are decoration. What is actually earning: **enter NQ at
13:00 UTC, stop ≈0.45%, TP 1.5% (3.3R), EOD exit, 1% risk** — a long
realized-range trade that pays whenever the day clears the 3.3R hurdle in
*some* direction. That also explains why the two negative walk-forward
windows exist and why the fade patches (S2/S4) "worked": on a 3.3R payoff
both directions profit on a trending day, so any subset will look positive.

### The construction this implies

Picking a side added variance without adding mean. So don't pick one — run
**both sides at half size each** (identical 1% total risk, identical total
notional, so identical costs):

| Same days, same risk | Sharpe | CAGR | maxDD | win rate |
|---|---|---|---|---|
| Gates' direction | 0.91 | 21.0% | 20.3% | 31.5% |
| Inverse | 0.98 | 22.7% | 21.9% | 30.2% |
| **Both sides, half size** | **1.63** | 24.0% | **17.9%** | 50.4% |
| Both sides, half size, gates off (n=856) | **1.72** | 32.5% | 22.9% | 47.9% |

Same mean, far less variance — the arms correlate −0.31, and 38% of days
stop both out. This is mechanical, not fitted: it removes a coin flip, it
doesn't predict anything.

**But it is not validated.** The stop/TP geometry it rests on came from a
full-sample grid, so it inherits that selection and needs its own
walk-forward, plus a check on whether it survives a compressed-volatility
regime — 2021–2026 was an elevated-range period, and a long-range trade is
exactly what a quiet regime punishes. Requires a hedging-enabled account
(two simultaneous positions) or an OCO-equivalent.

## Live/backtest divergences still open

- **News filter:** the live monitor suppresses entries on high-impact US
  events 08:00–11:00 ET (Finnhub). The backtest has **no such filter**, so
  every number above includes days the live system refuses to trade. Given
  the payoff is asymmetric and pays on big-range days, the filter may be
  deleting the best days. Untested either way.
- **Live defaults** are the full-sample grid winner, not the walk-forward
  winner (item 5 above).
- **SPX/DOW/DAX** have no committed backtest at all, walk-forward or
  otherwise; their alerts are correctly stamped UNVALIDATED. DAX in
  particular fires ~2× as often as NQ because its session anatomy doesn't
  match the fixed UTC anchors (07:00 "London open" is DAX's cash open; the
  20:00 EOD is hours after Xetra closes).

## Reproduce

```
GET /api/nq-qmr/walkforward-retrain          # 15 overlapping windows + stitched curve
# take windows[0,2,4,...] for the non-overlapping chain above
GET /api/nq-qmr/backtest                     # full-sample default config
GET /api/nq-qmr/backtest?costPct=0.02&stopSlipPct=0.015   # cost sensitivity
```

The `nq_qmr_validation` KV key carries the headline of this run so
`_qmrValidationLine()` can stamp it on live alerts instead of
"⚠ UNVALIDATED". Nothing writes that key automatically — if this run is
superseded, update the key by hand and re-date this file.
