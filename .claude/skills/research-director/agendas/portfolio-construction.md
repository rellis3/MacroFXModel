# Agenda: portfolio construction (do our books diversify when it matters, and does combining add growth?)

Set 2026-11-12 by learn-intake from Quant Guild ("How Hedge Funds Trade" shorts; Black-Litterman, volatility drag,
engineer portfolios, diversification vs hedging, tail risk, quant vs discretionary). Not C.OG. Theme keywords for
`evidence_map.mjs`: `portfolio book blend correlation stress rebalance diversification hedge convexity`. Builds on the
Portfolio Book (headline 1.1, quote 0.74 after haircuts; CFD-only 0.21; core beta and short-vol proxy correlate 0.45 in a
crash) and the factor blend (trend+yield corr 0.06 halves drawdown). Method lessons #7, #8, #22–24 in
`education/RESEARCH_METHOD_LESSONS.md`. **Caution:** QG's own portfolio and hedge results are in-sample or planted
simulations; the questions are his, the evidence must be ours.

## Cards, in rank order

### Q1. Do our books stay uncorrelated in a crisis? — score 11/15

> Label each book long-crash / short-crash / independent **by mechanism, before the data**. Then measure pairwise
> correlation in named stress windows (vol-adjusted) against calm days, and count joint worst-5% days against the
> hypergeometric expectation.

| | |
|---|---|
| Construct | daily P&L of each book (trend, yield, rule A, residual-fx8, rich-vol paper, overnight books; backtest where no forward record) |
| Structural prior | each sleeve labelled long-crash / short-crash / independent by mechanism before reading data |
| Knowable when | stress flag from data to t-1 |
| Condition | VIX top decile (prior day); named windows 2008-09/10, 2011-08, 2015-01 (CHF), 2018-02, 2020-03, 2022, 2025-04; vs the rest |
| Horizons | daily, weekly |
| Noise threshold | block-bootstrap CI on stress-minus-calm correlation **after the Forbes-Rigobon volatility adjustment** (`plans/vol-layer/L3_LITERATURE_SPEC.md`: much of the measured "crisis rise" is conditioning on high vol); joint worst-5% count vs hypergeometric |
| Outcome distribution | correlation matrix per state; blend drawdown in stress; leg behaviour vs its mechanism label |
| Benchmark / control / mirror | full-sample correlation (what the Portfolio Book uses) |
| Mechanism | in stress, liquidity and de-risking flows make unrelated bets correlate |
| Builds on | Portfolio Book; factor blend; `rule-a-portfolio-second-book` (joint worst-5% days 6 vs 3.9, p 0.19) as the template; `stress-filter-hold` |
| Data & power | book histories on hand; few stress windows, so wide intervals; CONTEXT |
| If yes → | the Portfolio Book's diversification line stands |
| If no → | haircut the blend's drawdown benefit; size for stress correlation |
| Falsifier | stress correlation (vol-adjusted) inside the calm CI |

### Q2. How big is the rebalancing (diversification) return in the book? — score 8/15

> The book already rebalances daily to equal risk (`forge/PORTFOLIO_BOOK_PREREG.md`), so the premium is already inside
> the 0.74. Measure its size and how it depends on frequency: daily vs monthly vs drift, after costs.

Known-answer step first (#1): diversification return ≈ ½(Σwᵢσᵢ² − σ_p²) from sleeve vols and correlations, so the
measured number must match it. Noise: block bootstrap · benchmark: no-rebalance blend · mechanism: volatility pumping
needs low or negative correlation plus rebalancing (QG's 0% + −2.5% legs → positive growth) · if small → stop expecting
near-zero legs to add anything by being combined. Also report each sleeve's marginal effect on book CAGR at fixed book vol (#22).

### Q3. A priced convexity sleeve — score 8/15

> Blend a real, priced hedge leg (Cboe PPUT or CLL minus SPX TR; VXTH as an alternative) into the book at 0/5/10/20%,
> re-levered to the same book vol; read geometric growth and max DD monthly and across the full cycle.

Noise: block-bootstrap CI on the CAGR difference, plus a stress-window breakdown · benchmark: book without hedge at matched
vol, and `vol-managed-mm` (halves DD at no Sharpe cost) · changes: convexity leg vs VIX stand-aside; matches
`portfolio-book-validate`'s open "Next" · data: Cboe PUT on hand; PPUT/CLL/BXM/VXTH a free Cboe download · power: few
crises, likely CONTEXT/UNDERPOWERED. Related: insurance **seller** vs buyer judged geometrically and in stress (PUT, BXM
vs PPUT, VXTH against SPX TR) can share the same download and run as one study.

### Q4. Owner ON/OFF gate over a systematic book (forward only) — score 7/15

> Keep an ex-ante daily ON/OFF log with a reason tag over a book with a forward record (`residual-fx8-forward`). Score
> ON vs OFF over the book's own holding period against always-on and a random switch with the same ON share.

Noise: bootstrap MDE on ON-minus-OFF mean net · why: the concrete way to test whether discretion (C.OG-style judgement)
earns its place as a gate rather than as a direction call (lesson #24; QG: discretion as "low touch" switching of a
systematic engine) · screening: 0 Evidence Book entries; the ledger and lean record score direction calls, not gating ·
needs the owner to keep the log; months before any power. Source: QG quant vs discretionary.

## Not carded

- Black-Litterman: no validated mean view to feed it; `L6_LITERATURE_SPEC.md` already covers it.
- Conditional tail calibration: on file (`forecast-miss-*`).
- Survival stress beyond the sample (lesson #23): a descriptive line per book, not a study.
