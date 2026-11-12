# Agenda: portfolio construction (do our books diversify when it matters?)

Set 2026-11-12 by learn-intake from Quant Guild's "How Hedge Funds Trade" shorts
(`education/intake/technical/quant-guild/2026-11-12-shorts-how-hedge-funds-trade.md`). Not C.OG. Theme keywords for
`evidence_map.mjs`: `portfolio book blend correlation stress rebalance diversification`. Builds on the Portfolio
Book (quote 0.74 after haircuts) and the factor blend (trend+yield corr 0.06 halves drawdown).

## Cards, in rank order

### Q1. Do our books stay uncorrelated in a crisis? — score 10/15

> Take the books' daily P&L and measure their pairwise correlation in stress windows against calm days. Read whether
> the diversification the Portfolio Book claims survives the days it is needed.

| | |
|---|---|
| Construct | daily P&L of each book (trend, yield, rule A, residual-fx8, rich-vol paper, overnight books; backtest where no forward record) |
| Knowable when | stress flag from data to t-1 |
| Condition | VIX top decile (prior day), and named windows: 2020-03, 2022, 2025-04 tariff shock; vs the rest |
| Horizons | daily, weekly |
| Noise threshold | block-bootstrap CI on the stress-minus-calm correlation difference |
| Outcome distribution | correlation matrix in each state; blend drawdown in stress |
| Benchmark / control / mirror | full-sample correlation (what the Portfolio Book uses) |
| Mechanism | in stress, liquidity and de-risking flows make unrelated bets correlate |
| Builds on | Portfolio Book; factor blend; `stress-filter-hold` (stressed days no worse for holds) |
| Data & power | book histories on hand; few stress windows, so wide intervals; testable now as CONTEXT |
| If yes (stays uncorrelated) → | the Portfolio Book's diversification line stands |
| If no → | haircut the blend's drawdown benefit; size for stress correlation |
| Falsifier | stress correlation inside the calm CI |

### Q2. Is there a rebalancing premium in the blend? — score 8/15

> Compare the geometric return of an equal-weight, periodically rebalanced blend of the books against the same books
> left to drift, monthly and quarterly, after costs.

| | |
|---|---|
| Construct | rebalanced minus buy-and-hold blend, geometric return |
| Horizons | monthly, quarterly rebalance |
| Noise threshold | block bootstrap |
| Benchmark | no-rebalance blend |
| Mechanism | volatility pumping (Shannon's demon): rebalancing uncorrelated volatile legs lifts the geometric mean |
| Builds on | nothing on file (evidence map 0) |
| If yes → | the Portfolio Book adds a rebalance rule |
| If no → | stop expecting near-zero legs to add anything by being combined |
| Falsifier | gain inside the bootstrap band, or gone after costs |
