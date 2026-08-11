# ContinuationBot — buy the pullback, hold the trend

Every other engine in this repo is built to catch a turn: `levelEngine`
trades reactions at exhaustion levels, `DecisionEngine`'s `MEAN_REVERSION`
mode fades range extremes, `Gold/fib_engine`'s golden pocket (.618-.65) is
explicitly documented as a reversal setup. Nothing here was built to answer
the opposite question: **buy a dip that's about to resume the higher-timeframe
trend, and hold it for a big continuation move instead of scalping it.**

This is that system. It's new code, but it deliberately reuses three pieces
that already existed in this repo rather than inventing from scratch — see
"What's reused vs. new" below.

## How it decides to enter

Three gates, in order, all causal (no lookahead at any stage):

1. **HTF bias gate** — `modules/pullback_engine.htf_bias_series()`. Only
   look for LONGs when the higher-timeframe bias is BULL, SHORTs when BEAR.
   Same rule as `ConfluenceBot/modules/htf_bias.py` (Daily price+EMA21/50
   trend combined with H4 market structure HH/HL vs LH/LL, BOS override,
   same agreement/confidence table) — that file is duplicated verbatim
   alongside this one for reference. The backtest uses a vectorised port of
   the same rules instead of calling it bar-by-bar, because the dict-per-bar
   version would take hours across 26 pairs × 8 years; the vectorised
   version runs the same universe in well under a minute.

2. **Shallow pullback zone** — `modules/pullback_engine.generate_signals()`.
   Find the current impulse leg (last confirmed swing low → swing high for
   an uptrend, mirrored for downtrends) and require the retracement to stay
   in the 23.6%-50% band. `Gold/modules/fib_engine.py` already tags its
   `.382` zone "shallow trend continuation" as opposed to the `.618-.65`
   golden pocket ("primary reversal") — this promotes that idea from a minor
   confluence-scoring weight into the actual entry gate, and explicitly
   excludes anything deeper than 50% (that's a reversal candidate, a
   different trade, not this one).

3. **Re-acceleration confirmation** — the system does not buy the dip on
   the hope it holds. Once price is in the shallow zone, it arms, and only
   fires when price closes back above the pullback's own local high (mirror
   for shorts) — proof the pullback is over, not a guess that it will be.
   The stop goes below (long) / above (short) the pullback's actual low/high,
   not an arbitrary distance.

## How it holds

Deliberately **not** part of this module. Exit is
`pylego.barrier_race.race_trailing` — the repo's shared chandelier-trail
walker (hard stop until `activate_r` in favour, then a stop that ratchets
`trail_r`×SL behind the best price, no fixed take-profit). This is the same
brick `Gold/mfe_mae_analysis.py` used to show that a fixed TP1/TP2 gives back
real R on trend days — reused here instead of re-derived, and it's why this
system can genuinely let a winner run instead of capping it at a
volatility-forecast exhaustion line the way `ConfluenceBot/modules/exits.py`
does for its (different-purpose) reversal trades.

## What's reused vs. new

| Piece | Status |
|---|---|
| HTF bias rules | Reused — `ConfluenceBot/modules/htf_bias.py`, duplicated verbatim + ported to a vectorised form for backtesting |
| Shallow-retracement idea | Reused — promoted from `Gold/modules/fib_engine.py`'s `.382` scoring weight into a standalone trigger |
| Pivot/swing detection | New implementation (`pullback_engine.find_pivots` / `build_zigzag_events`), same causal-confirmation contract as `fib_engine.py`'s pivot logic |
| Re-acceleration entry trigger | New — no existing module had a with-trend pullback trigger |
| Trailing hold/exit | Reused — `pylego.barrier_race.race_trailing`, unchanged |
| Transaction costs | Reused — `pylego.costs.default_spread`, the same per-asset-class spread table the paper bots use |
| Multi-pair backtest runner | New (`backtest.py`), following `portfolioBacktest/portfolio_backtest.py`'s reporting conventions |

## Running it

```bash
pip install -r ContinuationBot/requirements.txt

# all 26 instruments, full available history
python ContinuationBot/backtest.py

# a subset, a specific window
python ContinuationBot/backtest.py --pairs eurusd gbpusd gold --from 2022-01-01 --to 2026-01-01

# per-pair trail-parameter diagnostic (NOT used for the headline numbers —
# picking each pair's best combo after the fact would be overfitting)
python ContinuationBot/backtest.py --sweep
```

Data source: cached M1 parquet at `VolRangeForecaster/data/m1/{pair}_m1.parquet`
— the same R2 cache the JS backtests and `Gold/mfe_mae_analysis.py` use.
No download step needed; it's already on disk for all 26 instruments.

## Results — 2018-01-01 to 2026-05-01, all 26 instruments, net of costs

Default config: `pivot_n=4 min_atr_mult=1.0 shallow=[0.236,0.5] min_conf=0.5
activate_r=0.5 trail_r=1.0`, one fixed global config (not per-pair fitted),
costs applied via `pylego.costs.default_spread`.

```
Pair        Signals  Trades    WR%    PF    AvgR    MedR   TotalR
gbpjpy           85      85   54.1  2.31   +0.42   +0.09   +35.77
gold            110     110   50.0  1.74   +0.29   -0.02   +31.51
audusd           65      65   46.2  1.86   +0.35   -0.16   +22.80
usdjpy           79      79   53.2  1.74   +0.28   +0.14   +22.04
audjpy           80      80   40.0  1.37   +0.17   -0.30   +13.40
  ... (12/26 pairs net-profitable — see results.json for the full table)
eurjpy           98      98   34.7  0.72   -0.13   -0.30   -13.03
nzdjpy           72      72   36.1  0.61   -0.19   -0.40   -13.82
eurchf           85      85   22.4  0.28   -0.39   -0.47   -33.04

Portfolio (equal-weight, sum of per-trade R): 1494 trades, +38.79R total, +0.026R/trade avg
```

## Read this honestly, not optimistically

- **This is a first screen, not a validated edge.** 1494 trades in aggregate
  clears this repo's informal ~30-trade floor (see `Gold/mfe_mae_analysis.py`),
  but per-pair counts (24-114) are each individually thin, and the config was
  never fit or walk-forward validated — it's one reasonable-looking set of
  parameters run once. Compare to `portfolioBacktest/portfolio_backtest.py`'s
  in-sample/out-of-sample cointegration split or `levelEngine`'s
  Bonferroni-corrected OOS-agreement requirement before trusting a number
  from this system the way those are trusted.
- **Costs roughly halved the gross edge** (+96.8R gross → +38.8R net) —
  reported net because gross numbers from any repo tool are not the honest
  number to act on.
- **EUR crosses are the consistent losers** (eurchf -33R, gbpaud -11R,
  nzdjpy -14R, eurjpy -13R, eurnzd -10R) even before this run's per-pair
  breakdown is treated as reliable — worth understanding why (EUR-driven
  pullbacks may be structurally different, or the pivot/ATR parameters may
  not suit these pairs) before including them in anything real.
- **No portfolio-level risk limits, no position sizing, no live wiring.**
  This is a signal-generation + backtest layer only — same-instrument /
  cross-instrument concurrency caps (like `ConfluenceBot`'s
  `max_total_open_risk_pct` / `max_currency_risk_pct`) would need to be added
  before this could run as a real multi-pair book.
- **`--sweep` numbers are diagnostic only** — never report a per-pair-optimised
  parameter set as the headline result; that's the same overfitting trap this
  repo's other backtests are built to avoid.
