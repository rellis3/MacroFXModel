# overnight-hold-futures — results (exploratory, not pre-registered)

The banked overnight-hold trades (20:00 → 14:30 UK, 2016-10-24 → 2026-08-21) re-priced on CME futures, same entry and
exit minutes, nothing re-fitted. A re-costing of `overnight-hold-nq` / `overnight-hold-gold` (both UNDERPOWERED), not a
new search. Register row `overnight-hold-futures` (EXPLORATORY). Script `scripts/overnight-hold-futures/build.py`,
output `futures_trades.json` (read by `overnight-hold-real-costs.html`) and `summary.json`. Built 2026-10-29.

## Data

- **NQ, to 2026-04-21:** the owner's 1-minute file (Google Drive `nq-1m_bk.csv`, 5.8m bars from 2008-12). US Central
  time, bars stamped at their open: matches OANDA at +6h winter / +5h summer, 1-minute return correlation 0.99.
  Ratio back-adjusted: a constant multiple of NinjaTrader's real prices inside each contract (sd ~1e-5), so % returns
  are exact. No gaps since 2016. 1,880 of 1,949 trades.
- **NQ after that, and all gold:** NinjaTrader per-contract 1-minute files (Lucid login, pulled 2026-10-08). NT8
  stamps bars at their close (OANDA bar T = NT8 bar T+60, correlation 0.98). Each trade is priced in one contract, so
  none spans a roll.
- **Gold coverage is incomplete:** the NT8 backfill failed every October GC contract and its windows were too short
  around rolls, so **1,474 of 1,962** gold trades have a futures price. The rest are left out, never filled from OANDA
  (mixing CFD prices in would pull the two answers together). Re-pulling the failed GC chunks needs NinjaTrader open.

## Costs

No swap: the financing sits inside the futures price, so it is already in the gross return. Each trade pays 1 tick a
side (NQ 0.25, GC 0.10: half the spread plus some slippage, conservative for these markets) plus an assumed all-in
commission per round trip ($2.50 micro, $5.00 full; editable on the page), both turned into % of that trade's notional
at its own price. MNQ started in May 2019; earlier trades are priced as if it existed.

## Results (mean net per trade on the same trades, %)

| | Gross | CFD, your account | Futures, micro | Futures, full |
|---|---|---|---|---|
| NQ (1,949 trades) | CFD 0.0538 / futures 0.0536 | 0.0315 (account B) | 0.0371 (t 1.86) | **0.0465** (t 2.34) |
| Gold (1,474 trades) | CFD 0.0577 / futures 0.0456 | 0.0304 (account A), 0.0227 (B) | 0.0199 | 0.0313 |

- **NQ:** futures beat the CFD. Compounded: CFD account B **+5.6% a year**, MNQ **+6.8%**, NQ **+8.8%**. Futures and CFD
  gross are the same to 0.0002% a trade (correlation 0.998), so the CFD swap is a pure extra cost. Our reading, not
  checked: OANDA's NAS100 price behaves like the future, carrying the same basis.
- **Gold:** the futures gross is 0.012% a trade lower than the CFD, which is the carry inside the gold futures price,
  about the size of a normal swap. Full-size GC roughly equals your cheap-swap account A; micros are worse (commission
  is a large % of a small contract, especially at 2016 prices).
- Costs shrink over time as prices rise: MNQ costs 0.0165% a trade on average but 0.0063% in 2026.
- Buy & hold (rolled futures, net of ticks and commission at every roll): NQ +17.6% a year vs +14.2% as a CFD.
  Overnight-only still trails buy & hold on return and Sharpe.

Verdicts unchanged (both UNDERPOWERED): this changes the cost of trading the idea, not the evidence for it. Exploratory,
not pre-registered: any use of the futures numbers as a result needs its own prereg.
